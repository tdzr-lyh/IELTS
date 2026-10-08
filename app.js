(() => {
  "use strict";

  const LEGACY_PROGRESS_KEY = "listening-practice-book-v1";
  const LEGACY_KEY = "dual-exam-flight-v2";
  const ACCOUNT_STORE_KEY = "listening-practice-book-accounts-v1";
  const ACCOUNT_SESSION_KEY = "listening-practice-book-session-v1";
  const ACCOUNT_PROGRESS_PREFIX = "listening-practice-book-progress-v1:";
  const cloudConfig = window.LISTENING_CLOUD || {};
  const library = window.LISTENING_LIBRARY || {
    sceneCategories: [],
    jijingCategories: [],
    dictationTracks: [],
  };

  const dom = {};
  const runtime = {
    bookTab: "scene",
    dialogEntries: [],
    dialogIndex: 0,
    answerTrackId: "",
    quiz: null,
    toastTimer: null,
    deferredInstallPrompt: null,
    audioTrackId: "",
    selectedAccountId: "",
    accountDialogRequired: false,
    cloudUser: null,
    cloudSyncTimer: null,
    cloudSyncRevision: 0,
    cloudDirty: false,
    cloudRefreshInFlight: false,
    pronunciationToken: 0,
  };

  let audio;
  let wordAudio;
  let cloudClient = null;

  const sceneWords = flattenCategories(library.sceneCategories || [], "scene");
  const jijingWords = flattenCategories(library.jijingCategories || [], "jijing");
  const allWords = [...sceneWords, ...jijingWords];
  const wordMap = new Map(allWords.map((entry) => [entry.id, entry]));
  const trackMap = new Map((library.dictationTracks || []).map((track) => [track.id, track]));
  const orderedTracks = orderTracks(library.dictationTracks || []);
  const totalWords = allWords.length;

  let state = defaultState();
  let accountStore = loadAccountStore();
  let activeAccount = null;

  function cloudIsConfigured() {
    return Boolean(
      cloudConfig.provider === "supabase" &&
        cloudConfig.url &&
        cloudConfig.anonKey &&
        window.supabase?.createClient,
    );
  }

  function initCloudClient() {
    if (!cloudIsConfigured()) return null;
    if (!cloudClient) cloudClient = window.supabase.createClient(cloudConfig.url, cloudConfig.anonKey);
    return cloudClient;
  }

  function flattenCategories(categories, group) {
    return categories.flatMap((category, categoryIndex) =>
      (category.entries || []).map((entry, entryIndex) => ({
        ...entry,
        group,
        categoryId: category.id,
        categoryTitle: category.title,
        categoryIndex,
        entryIndex,
      })),
    );
  }

  function orderTracks(tracks) {
    const order = {
      "5.5-basic": 0,
      "5.5-vocabulary": 1,
      "6.0-basic": 2,
      "6.0-vocabulary": 3,
    };
    return [...tracks].sort((a, b) => {
      const aOrder = order[`${a.level}-${a.type}`] ?? 99;
      const bOrder = order[`${b.level}-${b.type}`] ?? 99;
      return aOrder - bOrder || a.id.localeCompare(b.id);
    });
  }

  function defaultState() {
    return {
      version: 1,
      settings: {
        packSize: 15,
        route: "auto",
      },
      learned: {},
      wrongCounts: {},
      recoveryWords: [],
      recoveryTracks: [],
      cursors: {
        scene: 0,
        jijing: 0,
        track: 0,
      },
      activePack: null,
      missionCounter: 0,
      completedTracks: {},
      stats: {
        questions: 0,
        correct: 0,
        missionsCompleted: 0,
      },
    };
  }

  function normalizeState(candidate) {
    const fallback = defaultState();
    if (!candidate || typeof candidate !== "object") return fallback;
    return {
      ...fallback,
      ...candidate,
      settings: { ...fallback.settings, ...(candidate.settings || {}) },
      learned: candidate.learned || {},
      wrongCounts: candidate.wrongCounts || {},
      recoveryWords: Array.isArray(candidate.recoveryWords) ? candidate.recoveryWords : [],
      recoveryTracks: Array.isArray(candidate.recoveryTracks) ? candidate.recoveryTracks : [],
      cursors: { ...fallback.cursors, ...(candidate.cursors || {}) },
      completedTracks: candidate.completedTracks || {},
      stats: { ...fallback.stats, ...(candidate.stats || {}) },
      activePack: candidate.activePack || null,
    };
  }

  function defaultAccountStore() {
    return {
      version: 1,
      activeAccountId: "",
      legacyMigrated: false,
      accounts: {},
    };
  }

  function loadAccountStore() {
    try {
      const raw = localStorage.getItem(ACCOUNT_STORE_KEY);
      if (!raw) return defaultAccountStore();
      const parsed = JSON.parse(raw);
      return {
        ...defaultAccountStore(),
        ...parsed,
        accounts: parsed.accounts || {},
      };
    } catch {
      return defaultAccountStore();
    }
  }

  function saveAccountStore() {
    localStorage.setItem(ACCOUNT_STORE_KEY, JSON.stringify(accountStore));
  }

  function progressKey(accountId) {
    return `${ACCOUNT_PROGRESS_PREFIX}${accountId}`;
  }

  function loadLegacyState() {
    try {
      const current = localStorage.getItem(LEGACY_PROGRESS_KEY);
      if (current) return normalizeState(JSON.parse(current));

      const legacyRaw = localStorage.getItem(LEGACY_KEY);
      if (!legacyRaw) return defaultState();
      const legacy = JSON.parse(legacyRaw);
      const migrated = defaultState();
      Object.entries(legacy.vocabMastery || {}).forEach(([id, value]) => {
        if (value && wordMap.has(id)) migrated.learned[id] = true;
      });
      return migrated;
    } catch {
      return defaultState();
    }
  }

  function loadStateForAccount(accountId) {
    try {
      const raw = localStorage.getItem(progressKey(accountId));
      return raw ? normalizeState(JSON.parse(raw)) : defaultState();
    } catch {
      return defaultState();
    }
  }

  function saveState() {
    if (!activeAccount) return;
    localStorage.setItem(progressKey(activeAccount.id), JSON.stringify(state));
    scheduleCloudSync();
  }

  function scheduleCloudSync() {
    if (!activeAccount?.cloud || !runtime.cloudUser || !cloudClient) return;
    runtime.cloudDirty = true;
    runtime.cloudSyncRevision += 1;
    clearTimeout(runtime.cloudSyncTimer);
    runtime.cloudSyncTimer = setTimeout(() => syncStateToCloud(), 650);
  }

  async function syncStateToCloud() {
    if (!activeAccount?.cloud || !runtime.cloudUser || !cloudClient) return;
    runtime.cloudDirty = true;
    const revision = runtime.cloudSyncRevision;
    updateCloudStatus("syncing", "正在同步最新学习进度…");
    const { error } = await cloudClient.from("learning_states").upsert(
      {
        user_id: runtime.cloudUser.id,
        account_name: activeAccount.name,
        state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) {
      console.warn("Cloud sync failed:", error.message);
      updateCloudStatus("sync-error", "云端同步失败，当前进度仍保存在本机");
    } else {
      if (revision === runtime.cloudSyncRevision) runtime.cloudDirty = false;
      updateCloudStatus("ready", "已同步到云端");
    }
  }

  async function loadStateFromCloud(user, fallback = null) {
    if (!cloudClient) return fallback || defaultState();
    const { data, error } = await cloudClient
      .from("learning_states")
      .select("account_name,state,updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      console.warn("Cloud load failed:", error.message);
      updateCloudStatus("sync-error", "暂时无法读取云端，已使用本机缓存");
      return fallback || defaultState();
    }
    return data?.state ? normalizeState(data.state) : fallback || defaultState();
  }

  async function refreshStateFromCloud({ notify = false } = {}) {
    if (
      !activeAccount?.cloud ||
      !runtime.cloudUser ||
      !cloudClient ||
      runtime.cloudDirty ||
      runtime.cloudRefreshInFlight
    )
      return;
    runtime.cloudRefreshInFlight = true;
    try {
      const { data, error } = await cloudClient
        .from("learning_states")
        .select("state,updated_at")
        .eq("user_id", runtime.cloudUser.id)
        .maybeSingle();
      if (error) {
        updateCloudStatus("sync-error", "云端刷新失败，当前仍可继续学习");
        return;
      }
      if (data?.state) {
        const remoteState = normalizeState(data.state);
        if (JSON.stringify(remoteState) !== JSON.stringify(state)) {
          state = remoteState;
          localStorage.setItem(progressKey(activeAccount.id), JSON.stringify(state));
          renderAll();
          if (notify) showToast("已读取其他设备上的最新进度");
        }
      }
      updateCloudStatus("ready", "已连接云端，进度会自动同步");
    } finally {
      runtime.cloudRefreshInFlight = false;
    }
  }

  function cloudHashName(name) {
    let hash = 2166136261;
    for (const char of String(name).trim().toLowerCase()) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function cloudEmailForName(name) {
    return `account-${cloudHashName(name)}@ielts-practice.local`;
  }

  function updateCloudStatus(kind, text) {
    if (!dom.cloudStatus || !dom.cloudStatusText) return;
    dom.cloudStatus.className = `cloud-status is-${kind}`;
    dom.cloudStatusText.textContent = text;
  }

  async function activateCloudAccount(user, name, { stateOverride = null } = {}) {
    activeAccount = {
      id: `cloud-${user.id}`,
      cloud: true,
      userId: user.id,
      name: name || user.user_metadata?.display_name || "云端账号",
      createdAt: user.created_at || new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
    runtime.cloudUser = user;
    accountStore.activeAccountId = activeAccount.id;
    saveAccountStore();
    sessionStorage.setItem(ACCOUNT_SESSION_KEY, activeAccount.id);
    const cachedState = loadStateForAccount(activeAccount.id);
    state = stateOverride || (await loadStateFromCloud(user, cachedState));
    localStorage.setItem(progressKey(activeAccount.id), JSON.stringify(state));
    runtime.cloudDirty = false;
    runtime.accountDialogRequired = false;
    runtime.selectedAccountId = activeAccount.id;
    closeAudio();
    renderAccountHeader();
    renderAccountDialog();
    renderAll();
    if (dom.accountDialog.open) dom.accountDialog.close();
    updateCloudStatus("ready", "已连接云端，进度会自动同步");
  }

  async function restoreCloudSession() {
    const client = initCloudClient();
    if (!client) return false;
    const { data, error } = await client.auth.getSession();
    if (error || !data.session?.user) return false;
    const user = data.session.user;
    const name = user.user_metadata?.display_name || "云端账号";
    await activateCloudAccount(user, name);
    return true;
  }

  async function cloudLogin(event) {
    event.preventDefault();
    const name = dom.cloudLoginName.value.trim();
    const password = dom.cloudLoginPassword.value;
    dom.cloudLoginMessage.textContent = "";
    if (!cloudIsConfigured()) {
      dom.cloudLoginMessage.textContent = "云端同步尚未配置，请先完成一次 Supabase 配置。";
      updateCloudStatus("offline", "尚未配置云端同步");
      return;
    }
    if (!name || password.length < 4) {
      dom.cloudLoginMessage.textContent = "请输入账号名称和至少 4 位密码。";
      return;
    }
    const client = initCloudClient();
    dom.cloudLoginSubmit.disabled = true;
    dom.cloudLoginSubmit.textContent = "正在登录…";
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: cloudEmailForName(name),
        password,
      });
      if (error || !data.user) {
        const message = String(error?.message || "").toLowerCase();
        if (message.includes("email not confirmed")) {
          dom.cloudLoginMessage.textContent =
            "这个账号是在邮箱确认关闭前注册的，尚未激活。请在原设备重新注册云端账号。";
        } else {
          dom.cloudLoginMessage.textContent =
            "账号名或密码不正确。如果这是旧版创建的本机账号，请在原手机打开账号窗口，使用“升级为云端账号”。";
        }
        return;
      }
      await activateCloudAccount(data.user, name);
      dom.cloudLoginForm.reset();
      showToast(`已登录“${name}”，进度已同步`);
    } catch (error) {
      console.error("Cloud login failed:", error);
      dom.cloudLoginMessage.textContent = "登录失败，请检查网络后重试。";
    } finally {
      dom.cloudLoginSubmit.disabled = false;
      dom.cloudLoginSubmit.textContent = "登录账号";
    }
  }

  async function signUpCloudAccount(name, password) {
    const client = initCloudClient();
    const { data, error } = await client.auth.signUp({
      email: cloudEmailForName(name),
      password,
      options: { data: { display_name: name } },
    });
    if (error) throw error;
    if (!data.user) throw new Error("注册没有返回用户");
    if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error("这个账号名称已注册，请使用上方的“登录已有账号”。");
    }
    if (!data.session) {
      throw new Error("注册成功，但项目开启了邮箱确认。请在 Supabase 中关闭邮箱确认后再试。");
    }
    return data;
  }

  function bytesToBase64(bytes) {
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  function base64ToBytes(value) {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  }

  function createSalt() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return bytesToBase64(bytes);
  }

  async function hashPassword(password, salt) {
    const material = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: base64ToBytes(salt),
        iterations: 120000,
        hash: "SHA-256",
      },
      material,
      256,
    );
    return bytesToBase64(new Uint8Array(bits));
  }

  function accountInitial(name) {
    return String(name || "我").trim().slice(0, 1).toUpperCase() || "我";
  }

  function accountId() {
    return crypto.randomUUID
      ? `account-${crypto.randomUUID()}`
      : `account-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function accountList() {
    return Object.values(accountStore.accounts).sort((a, b) =>
      String(b.lastLoginAt || b.createdAt).localeCompare(String(a.lastLoginAt || a.createdAt)),
    );
  }

  function formatAccountTime(value) {
    if (!value) return "尚未登录";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "本机账号";
    return `${date.getMonth() + 1}月${date.getDate()}日登录`;
  }

  async function verifyAccountPassword(account, password) {
    if (!account || !password) return false;
    const hash = await hashPassword(password, account.salt);
    return hash === account.passwordHash;
  }

  function activateAccount(account, { rememberSession = true } = {}) {
    if (!account) return;
    activeAccount = account;
    account.lastLoginAt = new Date().toISOString();
    accountStore.accounts[account.id] = account;
    accountStore.activeAccountId = account.id;
    saveAccountStore();
    if (rememberSession) sessionStorage.setItem(ACCOUNT_SESSION_KEY, account.id);
    state = loadStateForAccount(account.id);
    runtime.selectedAccountId = account.id;
    runtime.accountDialogRequired = false;
    closeAudio();
    renderAccountHeader();
    renderAccountDialog();
    renderAll();
    if (dom.accountDialog.open) dom.accountDialog.close();
  }

  async function lockCurrentAccount() {
    if (activeAccount?.cloud && cloudClient) {
      clearTimeout(runtime.cloudSyncTimer);
      await syncStateToCloud();
      await cloudClient.auth.signOut();
      runtime.cloudUser = null;
      runtime.cloudDirty = false;
    }
    sessionStorage.removeItem(ACCOUNT_SESSION_KEY);
    activeAccount = null;
    state = defaultState();
    runtime.accountDialogRequired = true;
    runtime.selectedAccountId = accountStore.activeAccountId || accountList()[0]?.id || "";
    closeAudio();
    renderAccountHeader();
    renderAll();
    openAccountDialog({ required: true });
  }

  function cacheDom() {
    [
      "accountButton",
      "accountAvatar",
      "currentAccountName",
      "accountDialog",
      "accountDialogClose",
      "accountList",
      "cloudStatus",
      "cloudStatusText",
      "cloudLoginForm",
      "cloudLoginName",
      "cloudLoginPassword",
      "cloudLoginMessage",
      "cloudLoginSubmit",
      "accountLoginForm",
      "loginAccountAvatar",
      "loginAccountName",
      "accountLoginPassword",
      "accountLoginMessage",
      "accountLoginSubmit",
      "accountCreateDetails",
      "accountCreateForm",
      "newAccountName",
      "newAccountPassword",
      "newAccountPasswordConfirm",
      "accountCreateMessage",
      "accountCreateSubmit",
      "accountUpgradeDetails",
      "accountUpgradeCopy",
      "accountUpgradeForm",
      "upgradeCloudPassword",
      "upgradeCloudPasswordConfirm",
      "accountUpgradeMessage",
      "accountUpgradeSubmit",
      "accountPasswordDetails",
      "accountPasswordSummary",
      "accountPasswordForm",
      "oldAccountPassword",
      "changedAccountPassword",
      "changedAccountPasswordConfirm",
      "accountPasswordMessage",
      "accountPasswordSubmit",
      "accountLockButton",
      "installButton",
      "exportButton",
      "importButton",
      "resetButton",
      "importFileInput",
      "todayLabel",
      "overallRing",
      "overallPercent",
      "learnedWords",
      "testedWords",
      "accuracyValue",
      "heroClaimButton",
      "packSize",
      "claimRoute",
      "missionStatusLight",
      "missionStatusTitle",
      "missionStatusText",
      "claimButton",
      "recycleButton",
      "emptyMission",
      "activeMission",
      "missionNumber",
      "activeMissionTitle",
      "activeMissionMeta",
      "missionPercent",
      "missionProgressBar",
      "missionSteps",
      "sceneCount",
      "jijingCount",
      "track55Count",
      "track60Count",
      "reviewCount",
      "bookChapterEyebrow",
      "bookChapterTitle",
      "bookChapterIntro",
      "bookSearch",
      "chapterGrid",
      "chapterDialog",
      "dialogEyebrow",
      "dialogTitle",
      "dialogSubtitle",
      "playDialogWord",
      "markDialogWord",
      "dialogWordPosition",
      "dialogWord",
      "dialogMeaning",
      "dialogWordSource",
      "dialogPrevWord",
      "dialogNextWord",
      "dialogWordList",
      "answerDialog",
      "answerDialogTitle",
      "answerDialogMeta",
      "answerDialogText",
      "answerDialogPlay",
      "quizDialog",
      "quizPosition",
      "quizProgressBar",
      "quizSoundPulse",
      "quizPlayButton",
      "quizOptions",
      "quizFeedback",
      "quizNextButton",
      "audioDock",
      "trainingAudio",
      "wordPronunciationAudio",
      "audioPlayButton",
      "audioTitle",
      "audioSeek",
      "audioCurrentTime",
      "audioDuration",
      "audioCloseButton",
      "toast",
    ].forEach((id) => {
      dom[id] = document.getElementById(id);
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function shuffle(values) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const next = Math.floor(Math.random() * (index + 1));
      [result[index], result[next]] = [result[next], result[index]];
    }
    return result;
  }

  function unique(values) {
    return [...new Set(values)];
  }

  function showToast(message) {
    clearTimeout(runtime.toastTimer);
    dom.toast.textContent = message;
    dom.toast.classList.add("is-visible");
    runtime.toastTimer = setTimeout(() => dom.toast.classList.remove("is-visible"), 2500);
  }

  function renderAccountHeader() {
    const name = activeAccount?.name || "未登录";
    dom.currentAccountName.textContent = name;
    dom.accountAvatar.textContent = accountInitial(name);
    dom.accountButton.setAttribute(
      "aria-label",
      activeAccount ? `当前账号 ${name}，点击切换账号` : "点击选择学习账号",
    );
  }

  function renderAccountDialog() {
    const accounts = accountList();
    const selected = accountStore.accounts[runtime.selectedAccountId];
    dom.accountDialogClose.hidden = !activeAccount || runtime.accountDialogRequired;
    dom.accountLockButton.hidden = !activeAccount;
    dom.accountPasswordDetails.hidden = !activeAccount;
    dom.accountPasswordSummary.textContent = activeAccount?.cloud
      ? "修改云端账号密码"
      : "修改当前账号密码";
    const passwordMinimum = activeAccount?.cloud ? 6 : 4;
    dom.changedAccountPassword.minLength = passwordMinimum;
    dom.changedAccountPasswordConfirm.minLength = passwordMinimum;
    const canUpgradeLocal = Boolean(activeAccount && !activeAccount.cloud && cloudIsConfigured());
    dom.accountUpgradeDetails.hidden = !canUpgradeLocal;
    dom.accountUpgradeDetails.open = canUpgradeLocal;
    if (canUpgradeLocal) {
      dom.accountUpgradeCopy.textContent = `当前“${activeAccount.name}”只保存在这台设备。升级后会保留任务与进度，并可在其他浏览器登录。`;
    }
    dom.cloudLoginForm.hidden = false;
    dom.cloudLoginSubmit.disabled = !cloudIsConfigured();
    dom.accountCreateSubmit.textContent = cloudIsConfigured() ? "注册并进入" : "创建并进入";
    if (cloudIsConfigured()) {
      updateCloudStatus(
        activeAccount?.cloud ? "ready" : "available",
        activeAccount?.cloud
          ? "已连接云端，进度会自动同步"
          : activeAccount
            ? "当前是本机账号，尚未同步；请在下方升级为云端账号"
            : "云端已就绪，可登录或注册同步账号",
      );
    } else {
      updateCloudStatus("offline", "当前为本机账号模式；配置云端后即可跨浏览器同步");
      dom.cloudLoginMessage.textContent = "云端同步尚未启用；登录入口会保留，配置完成后即可使用。";
    }
    dom.accountCreateDetails.open = accounts.length === 0;

    const cloudCard = activeAccount?.cloud
      ? `
          <div class="account-card is-current is-selected">
            <span class="account-card__avatar">${escapeHtml(accountInitial(activeAccount.name))}</span>
            <span class="account-card__copy">
              <strong>${escapeHtml(activeAccount.name)}</strong>
              <small>云端同步账号</small>
            </span>
            <span class="account-card__badge">云端</span>
          </div>
        `
      : "";
    dom.accountList.innerHTML = accounts.length || cloudCard
      ? cloudCard +
        accounts
          .map(
            (account) => `
              <button
                class="account-card ${
                  account.id === runtime.selectedAccountId ? "is-selected" : ""
                } ${account.id === activeAccount?.id ? "is-current" : ""}"
                type="button"
                data-account-id="${escapeHtml(account.id)}"
              >
                <span class="account-card__avatar">${escapeHtml(accountInitial(account.name))}</span>
                <span class="account-card__copy">
                  <strong>${escapeHtml(account.name)}</strong>
                  <small>${escapeHtml(formatAccountTime(account.lastLoginAt))}</small>
                </span>
                ${
                  account.id === activeAccount?.id
                    ? '<span class="account-card__badge">本机 · 当前</span>'
                    : ""
                }
              </button>
            `,
          )
          .join("")
      : '<p class="account-list__empty">还没有账号。请在下方创建第一个学习账号，现有进度会自动迁移进去。</p>';

    dom.accountLoginForm.hidden = !selected || selected.id === activeAccount?.id;
    if (selected && selected.id !== activeAccount?.id) {
      dom.loginAccountAvatar.textContent = accountInitial(selected.name);
      dom.loginAccountName.textContent = selected.name;
    }
  }

  function openAccountDialog({ required = false } = {}) {
    runtime.accountDialogRequired = required || !activeAccount;
    if (!runtime.selectedAccountId) {
      runtime.selectedAccountId =
        accountStore.activeAccountId || activeAccount?.id || accountList()[0]?.id || "";
    }
    dom.accountLoginPassword.value = "";
    dom.accountLoginMessage.textContent = "";
    dom.accountCreateMessage.textContent = "";
    dom.accountUpgradeMessage.textContent = "";
    dom.accountPasswordMessage.textContent = "";
    renderAccountDialog();
    if (!dom.accountDialog.open) dom.accountDialog.showModal();
  }

  async function createAccount(event) {
    event.preventDefault();
    const name = dom.newAccountName.value.trim();
    const password = dom.newAccountPassword.value;
    const confirmation = dom.newAccountPasswordConfirm.value;
    dom.accountCreateMessage.textContent = "";

    if (name.length < 1) {
      dom.accountCreateMessage.textContent = "请输入账号名称。";
      return;
    }
    if (
      !cloudIsConfigured() &&
      accountList().some((account) => account.name.toLowerCase() === name.toLowerCase())
    ) {
      dom.accountCreateMessage.textContent = "这个账号名称已经存在。";
      return;
    }
    const minimumPasswordLength = cloudIsConfigured() ? 6 : 4;
    if (password.length < minimumPasswordLength) {
      dom.accountCreateMessage.textContent = `密码至少需要 ${minimumPasswordLength} 位。`;
      return;
    }
    if (password !== confirmation) {
      dom.accountCreateMessage.textContent = "两次输入的密码不一致。";
      return;
    }

    dom.accountCreateSubmit.disabled = true;
    dom.accountCreateSubmit.textContent = cloudIsConfigured() ? "正在注册…" : "正在创建…";
    try {
      if (cloudIsConfigured()) {
        const data = await signUpCloudAccount(name, password);
        const migratedState =
          activeAccount && !activeAccount.cloud
            ? normalizeState(JSON.parse(JSON.stringify(state)))
            : loadLegacyState();
        dom.accountCreateForm.reset();
        await activateCloudAccount(data.user, name, { stateOverride: migratedState });
        await syncStateToCloud();
        showToast("云端账号已注册，之后可在其他浏览器登录");
        return;
      }
      const salt = createSalt();
      const account = {
        id: accountId(),
        name,
        nameKey: name.toLowerCase(),
        salt,
        passwordHash: await hashPassword(password, salt),
        createdAt: new Date().toISOString(),
        lastLoginAt: "",
      };
      const isFirstAccount = accountList().length === 0;
      accountStore.accounts[account.id] = account;

      if (isFirstAccount && !accountStore.legacyMigrated) {
        localStorage.setItem(progressKey(account.id), JSON.stringify(loadLegacyState()));
        accountStore.legacyMigrated = true;
      } else {
        localStorage.setItem(progressKey(account.id), JSON.stringify(defaultState()));
      }
      saveAccountStore();
      dom.accountCreateForm.reset();
      activateAccount(account);
      showToast(isFirstAccount ? "账号已创建，原有进度已迁移" : "新账号已创建");
    } catch (error) {
      console.error("Account creation failed:", error);
      dom.accountCreateMessage.textContent = error.message || "账号创建失败，请重试。";
    } finally {
      dom.accountCreateSubmit.disabled = false;
      dom.accountCreateSubmit.textContent = cloudIsConfigured() ? "注册并进入" : "创建并进入";
    }
  }

  async function loginAccount(event) {
    event.preventDefault();
    const account = accountStore.accounts[runtime.selectedAccountId];
    if (!account) return;
    dom.accountLoginMessage.textContent = "";
    dom.accountLoginSubmit.disabled = true;
    dom.accountLoginSubmit.textContent = "正在验证…";
    try {
      const valid = await verifyAccountPassword(account, dom.accountLoginPassword.value);
      if (!valid) {
        dom.accountLoginMessage.textContent = "密码不正确，请重新输入。";
        dom.accountLoginPassword.select();
        return;
      }
      activateAccount(account);
      showToast(`已切换到“${account.name}”`);
    } catch (error) {
      console.error("Account login failed:", error);
      dom.accountLoginMessage.textContent = "密码验证失败，请刷新后重试。";
    } finally {
      dom.accountLoginSubmit.disabled = false;
      dom.accountLoginSubmit.textContent = "进入账号";
    }
  }

  async function upgradeLocalAccount(event) {
    event.preventDefault();
    if (!activeAccount || activeAccount.cloud || !cloudIsConfigured()) return;
    const localAccount = activeAccount;
    const password = dom.upgradeCloudPassword.value;
    const confirmation = dom.upgradeCloudPasswordConfirm.value;
    dom.accountUpgradeMessage.textContent = "";
    if (password.length < 6) {
      dom.accountUpgradeMessage.textContent = "云端密码至少需要 6 位。";
      return;
    }
    if (password !== confirmation) {
      dom.accountUpgradeMessage.textContent = "两次输入的云端密码不一致。";
      return;
    }
    dom.accountUpgradeSubmit.disabled = true;
    dom.accountUpgradeSubmit.textContent = "正在升级并同步…";
    try {
      const migratedState = normalizeState(JSON.parse(JSON.stringify(state)));
      const data = await signUpCloudAccount(localAccount.name, password);
      dom.accountUpgradeForm.reset();
      await activateCloudAccount(data.user, localAccount.name, { stateOverride: migratedState });
      await syncStateToCloud();
      showToast("本机账号已升级为云端账号，可在其他设备登录");
    } catch (error) {
      console.error("Account upgrade failed:", error);
      dom.accountUpgradeMessage.textContent =
        error.message || "升级失败，请检查网络后重试。";
    } finally {
      dom.accountUpgradeSubmit.disabled = false;
      dom.accountUpgradeSubmit.textContent = "升级并同步当前进度";
    }
  }

  async function changeAccountPassword(event) {
    event.preventDefault();
    if (!activeAccount) return;
    const oldPassword = dom.oldAccountPassword.value;
    const nextPassword = dom.changedAccountPassword.value;
    const confirmation = dom.changedAccountPasswordConfirm.value;
    dom.accountPasswordMessage.textContent = "";
    const minimumLength = activeAccount.cloud ? 6 : 4;
    if (nextPassword.length < minimumLength) {
      dom.accountPasswordMessage.textContent = `新密码至少需要 ${minimumLength} 位。`;
      return;
    }
    if (nextPassword !== confirmation) {
      dom.accountPasswordMessage.textContent = "两次输入的新密码不一致。";
      return;
    }
    dom.accountPasswordSubmit.disabled = true;
    try {
      if (activeAccount.cloud) {
        const client = initCloudClient();
        const { error: loginError } = await client.auth.signInWithPassword({
          email: cloudEmailForName(activeAccount.name),
          password: oldPassword,
        });
        if (loginError) {
          dom.accountPasswordMessage.textContent = "原云端密码不正确。";
          return;
        }
        const { error: updateError } = await client.auth.updateUser({ password: nextPassword });
        if (updateError) throw updateError;
      } else {
        if (!(await verifyAccountPassword(activeAccount, oldPassword))) {
          dom.accountPasswordMessage.textContent = "原密码不正确。";
          return;
        }
        const salt = createSalt();
        activeAccount.salt = salt;
        activeAccount.passwordHash = await hashPassword(nextPassword, salt);
        accountStore.accounts[activeAccount.id] = activeAccount;
        saveAccountStore();
      }
      dom.accountPasswordForm.reset();
      dom.accountPasswordDetails.open = false;
      showToast(activeAccount.cloud ? "云端账号密码已更新" : "当前账号密码已更新");
    } catch (error) {
      console.error("Password update failed:", error);
      dom.accountPasswordMessage.textContent =
        error.message || "密码修改失败，请检查网络后重试。";
    } finally {
      dom.accountPasswordSubmit.disabled = false;
    }
  }

  function wordLabel(entry) {
    return entry?.meaning || entry?.source || entry?.categoryTitle || "来自听力资料";
  }

  function getLearnedCount() {
    return Object.keys(state.learned).filter((id) => state.learned[id] && wordMap.has(id)).length;
  }

  function getReviewIds() {
    return Object.entries(state.wrongCounts)
      .filter(([id, count]) => wordMap.has(id) && Number(count) > 0)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .map(([id]) => id);
  }

  function isPackComplete(pack = state.activePack) {
    if (!pack) return false;
    const wordsDone = pack.wordIds.every((id) => pack.completedWordIds.includes(id));
    const quizDone = Boolean(pack.quizDone);
    const trackDone = !pack.trackId || Boolean(pack.trackDone);
    return wordsDone && quizDone && trackDone;
  }

  function packProgress(pack = state.activePack) {
    if (!pack) return { percent: 0, parts: [] };
    const wordRatio = pack.wordIds.length
      ? pack.wordIds.filter((id) => pack.completedWordIds.includes(id)).length / pack.wordIds.length
      : 1;
    const parts = [wordRatio, pack.quizDone ? 1 : 0];
    if (pack.trackId) parts.push(pack.trackDone ? 1 : 0);
    const percent = Math.round((parts.reduce((sum, value) => sum + value, 0) / parts.length) * 100);
    return { percent, parts };
  }

  function recordPackCompletionIfNeeded() {
    const pack = state.activePack;
    if (!pack || pack.completionRecorded || !isPackComplete(pack)) return;
    pack.completionRecorded = true;
    state.stats.missionsCompleted += 1;
    saveState();
    showToast("本组全部完成，可以领取下一组了");
  }

  function renderAll() {
    renderOverview();
    renderMission();
    renderBookCounts();
    renderBook();
  }

  function renderOverview() {
    const now = new Date();
    dom.todayLabel.textContent = `${String(now.getMonth() + 1).padStart(2, "0")}.${String(
      now.getDate(),
    ).padStart(2, "0")}`;

    const learned = getLearnedCount();
    const percent = totalWords ? Math.round((learned / totalWords) * 100) : 0;
    dom.overallPercent.textContent = `${percent}%`;
    dom.overallRing.style.setProperty("--progress", `${percent * 3.6}deg`);
    dom.learnedWords.textContent = learned.toLocaleString("zh-CN");
    dom.testedWords.textContent = Number(state.stats.questions || 0).toLocaleString("zh-CN");
    dom.accuracyValue.textContent = state.stats.questions
      ? `${Math.round((state.stats.correct / state.stats.questions) * 100)}%`
      : "—";
  }

  function renderMission() {
    const pack = state.activePack;
    const complete = isPackComplete(pack);
    const progress = packProgress(pack);

    dom.packSize.value = String(state.settings.packSize);
    dom.claimRoute.value = state.settings.route;
    dom.emptyMission.hidden = Boolean(pack);
    dom.activeMission.hidden = !pack;
    dom.recycleButton.disabled = !pack || complete;
    dom.claimButton.disabled = Boolean(pack && !complete);

    if (!pack) {
      dom.missionStatusLight.className = "status-light";
      dom.missionStatusTitle.textContent = state.recoveryWords.length
        ? `有 ${state.recoveryWords.length} 个词等待续领`
        : "当前没有任务";
      dom.missionStatusText.textContent = state.recoveryWords.length
        ? "下一次领取会先接上回收的未完成内容。"
        : "选择学习量后领取，系统会自动保存断点。";
      dom.claimButton.textContent = state.recoveryWords.length ? "继续领取任务" : "领取任务";
      dom.heroClaimButton.textContent = dom.claimButton.textContent;
      return;
    }

    const routeLabel = pack.routeLabel || routeName(pack.route);
    dom.missionStatusLight.className = `status-light ${complete ? "is-complete" : "is-active"}`;
    dom.missionStatusTitle.textContent = complete ? "本组已全部完成" : "本组正在学习";
    dom.missionStatusText.textContent = complete
      ? "现在可以领取下一组任务。"
      : `${pack.completedWordIds.length}/${pack.wordIds.length} 词已学，进度会自动保存。`;
    dom.claimButton.textContent = complete ? "领取下一组" : "请先完成本组";
    dom.heroClaimButton.textContent = complete ? "领取下一组任务" : "查看当前任务";

    dom.missionNumber.textContent = `MISSION ${String(pack.number).padStart(3, "0")}`;
    dom.activeMissionTitle.textContent = pack.wasRecovered ? "续接上次未完成任务" : "本次听力任务";
    dom.activeMissionMeta.textContent = `${routeLabel} · ${pack.wordIds.length} 词${
      pack.trackId ? " · 1 组听写" : ""
    }`;
    dom.missionPercent.textContent = `${progress.percent}%`;
    dom.missionProgressBar.style.width = `${progress.percent}%`;
    dom.missionSteps.innerHTML = missionStepsHtml(pack);

    recordPackCompletionIfNeeded();
  }

  function missionStepsHtml(pack) {
    const completedWords = pack.wordIds.filter((id) => pack.completedWordIds.includes(id)).length;
    const wordsDone = completedWords === pack.wordIds.length;
    const track = pack.trackId ? trackMap.get(pack.trackId) : null;
    const quizCount = Math.min(10, pack.wordIds.filter((id) => wordMap.get(id)?.meaning).length);
    const cards = [];

    cards.push(`
      <section class="mission-step ${wordsDone ? "is-complete" : ""}">
        <span class="mission-step__number">${wordsDone ? "✓" : "01"}</span>
        <div>
          <h4>学习本组词汇</h4>
          <p>逐个听正常 1× 英式发音，确认含义后打勾。已完成 ${completedWords}/${pack.wordIds.length}。</p>
        </div>
        <button class="secondary-button step-action" type="button" data-mark-all-words>
          ${wordsDone ? "取消全选" : "全部标记"}
        </button>
        <div class="word-checklist">
          ${pack.wordIds
            .map((id) => {
              const entry = wordMap.get(id);
              if (!entry) return "";
              const learned = pack.completedWordIds.includes(id);
              return `
                <article class="word-check ${learned ? "is-learned" : ""}">
                  <div class="word-check__text">
                    <strong>${escapeHtml(entry.term)}</strong>
                    <small>${escapeHtml(wordLabel(entry))}</small>
                  </div>
                  <button class="word-check__play" type="button" data-speak-word="${escapeHtml(
                    id,
                  )}" aria-label="播放 ${escapeHtml(entry.term)}">▶</button>
                  <button class="word-check__done" type="button" data-toggle-word="${escapeHtml(
                    id,
                  )}" aria-label="${learned ? "取消完成" : "标记完成"}">✓</button>
                </article>
              `;
            })
            .join("")}
        </div>
      </section>
    `);

    cards.push(`
      <section class="mission-step ${pack.quizDone ? "is-complete" : ""}">
        <span class="mission-step__number">${pack.quizDone ? "✓" : "02"}</span>
        <div>
          <h4>完成听音辨义测试</h4>
          <p>${
            pack.quizDone
              ? `最近得分 ${pack.quizScore}/${pack.quizTotal}，错词已自动收入错词本。`
              : `从本组抽取 ${quizCount} 题：播放英式发音，从四个随机选项中选择正确含义。`
          }</p>
        </div>
        <button class="primary-button step-action" type="button" data-start-quiz>
          ${pack.quizDone ? "再测一次" : "开始测试"}
        </button>
      </section>
    `);

    if (track) {
      cards.push(`
        <section class="mission-step ${pack.trackDone ? "is-complete" : ""}">
          <span class="mission-step__number">${pack.trackDone ? "✓" : "03"}</span>
          <div>
            <h4>${escapeHtml(track.level)} 分听写 · ${escapeHtml(track.title)}</h4>
            <p>先完整听一遍，再分段听写和核对。音频固定正常 1×，点击后才加载。</p>
          </div>
          <div class="step-action track-step-actions">
            <button class="secondary-button" type="button" data-play-track="${escapeHtml(
              track.id,
            )}">播放音频</button>
            <button class="secondary-button answer-button" type="button" data-show-track-answer="${escapeHtml(
              track.id,
            )}">显示答案</button>
            <button class="secondary-button" type="button" data-complete-track="${escapeHtml(
              track.id,
            )}">${pack.trackDone ? "取消完成" : "完成听写"}</button>
          </div>
        </section>
      `);
    }
    return cards.join("");
  }

  function routeName(route) {
    return (
      {
        auto: "自动路线",
        scene: "场景高频",
        jijing: "机经词汇",
        review: "错词复习",
      }[route] || "听力词汇"
    );
  }

  function takeRecoveryWords(route, limit) {
    const accepted = [];
    const kept = [];
    state.recoveryWords.forEach((id) => {
      const entry = wordMap.get(id);
      const matches =
        route === "auto" ||
        route === "review" ||
        (route === "scene" && entry?.group === "scene") ||
        (route === "jijing" && entry?.group === "jijing");
      if (accepted.length < limit && entry && matches && !state.learned[id]) accepted.push(id);
      else if (entry && !state.learned[id]) kept.push(id);
    });
    state.recoveryWords = kept;
    return accepted;
  }

  function takeNewWords(group, count) {
    const source = group === "scene" ? sceneWords : jijingWords;
    const selected = [];
    let cursor = Math.max(0, Number(state.cursors[group]) || 0);
    while (cursor < source.length && selected.length < count) {
      const entry = source[cursor];
      cursor += 1;
      if (!state.learned[entry.id]) selected.push(entry.id);
    }
    state.cursors[group] = cursor;
    return selected;
  }

  function takeReviewWords(count, excluded = []) {
    const excludedSet = new Set(excluded);
    return getReviewIds()
      .filter((id) => !excludedSet.has(id))
      .slice(0, count);
  }

  function selectWordsForClaim(route, size) {
    const selected = takeRecoveryWords(route, size);
    const wasRecovered = selected.length > 0;
    let remaining = size - selected.length;

    if (route === "review") {
      selected.push(...takeReviewWords(remaining, selected));
      return { ids: unique(selected), wasRecovered };
    }

    if (route === "scene") {
      selected.push(...takeNewWords("scene", remaining));
      return { ids: unique(selected), wasRecovered };
    }

    if (route === "jijing") {
      selected.push(...takeNewWords("jijing", remaining));
      return { ids: unique(selected), wasRecovered };
    }

    if (remaining > 0) {
      const sceneSelection = takeNewWords("scene", remaining);
      selected.push(...sceneSelection);
      remaining = size - selected.length;
    }
    if (remaining > 0) selected.push(...takeNewWords("jijing", remaining));
    return { ids: unique(selected), wasRecovered };
  }

  function selectTrackForClaim(route) {
    if (route === "review" && !state.recoveryTracks.length) return "";

    while (state.recoveryTracks.length) {
      const id = state.recoveryTracks.shift();
      if (trackMap.has(id) && !state.completedTracks[id]) return id;
    }

    let cursor = Math.max(0, Number(state.cursors.track) || 0);
    while (cursor < orderedTracks.length) {
      const track = orderedTracks[cursor];
      cursor += 1;
      if (!state.completedTracks[track.id]) {
        state.cursors.track = cursor;
        return track.id;
      }
    }
    state.cursors.track = cursor;
    return "";
  }

  function claimMission() {
    if (state.activePack && !isPackComplete()) {
      document.getElementById("activeMission").scrollIntoView({ behavior: "smooth", block: "start" });
      showToast("请先完成或回收当前任务");
      return;
    }

    const size = Number(dom.packSize.value) || 15;
    const route = dom.claimRoute.value || "auto";
    state.settings.packSize = size;
    state.settings.route = route;
    const selection = selectWordsForClaim(route, size);

    if (!selection.ids.length) {
      if (route === "review") showToast("错词本目前是空的，可以先完成一组测试");
      else showToast("这条路线已经没有未学词汇了");
      saveState();
      renderAll();
      return;
    }

    state.missionCounter += 1;
    state.activePack = {
      id: `mission-${Date.now()}`,
      number: state.missionCounter,
      route,
      routeLabel: routeName(route),
      wordIds: selection.ids,
      completedWordIds: [],
      quizDone: false,
      quizScore: 0,
      quizTotal: 0,
      trackId: selectTrackForClaim(route),
      trackDone: false,
      wasRecovered: selection.wasRecovered,
      createdAt: new Date().toISOString(),
      completionRecorded: false,
    };
    saveState();
    renderAll();
    dom.activeMission.scrollIntoView({ behavior: "smooth", block: "start" });
    showToast(selection.wasRecovered ? "已接上回收的未完成进度" : "新任务已放入任务夹");
  }

  function recycleMission() {
    const pack = state.activePack;
    if (!pack || isPackComplete(pack)) return;
    const unfinishedWords = pack.wordIds.filter((id) => !pack.completedWordIds.includes(id));
    state.recoveryWords = unique([...unfinishedWords, ...state.recoveryWords]);
    if (pack.trackId && !pack.trackDone) {
      state.recoveryTracks = unique([pack.trackId, ...state.recoveryTracks]);
    }
    state.activePack = null;
    saveState();
    renderAll();
    showToast(`已回收 ${unfinishedWords.length} 个未完成词，下次优先续领`);
  }

  function toggleMissionWord(id) {
    const pack = state.activePack;
    if (!pack || !pack.wordIds.includes(id)) return;
    const completed = new Set(pack.completedWordIds);
    if (completed.has(id)) {
      completed.delete(id);
      delete state.learned[id];
    } else {
      completed.add(id);
      state.learned[id] = true;
    }
    pack.completedWordIds = [...completed];
    saveState();
    renderAll();
  }

  function toggleAllMissionWords() {
    const pack = state.activePack;
    if (!pack) return;
    const allDone = pack.wordIds.every((id) => pack.completedWordIds.includes(id));
    if (allDone) {
      pack.wordIds.forEach((id) => delete state.learned[id]);
      pack.completedWordIds = [];
    } else {
      pack.wordIds.forEach((id) => {
        state.learned[id] = true;
      });
      pack.completedWordIds = [...pack.wordIds];
    }
    saveState();
    renderAll();
  }

  function toggleTrackDone(id) {
    const pack = state.activePack;
    if (!pack || pack.trackId !== id) return;
    pack.trackDone = !pack.trackDone;
    if (pack.trackDone) state.completedTracks[id] = true;
    else delete state.completedTracks[id];
    saveState();
    renderAll();
  }

  function speakWithSystemVoice(word, token) {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      showToast("发音服务暂时不可用，请检查网络后重试");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    const voices = window.speechSynthesis.getVoices();
    const britishVoice = voices.find((voice) => /^en-GB/i.test(voice.lang));
    if (!britishVoice) {
      showToast("英式发音音源暂时不可用，请联网后重试");
      return;
    }
    utterance.voice = britishVoice;
    utterance.lang = "en-GB";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onstart = () => {
      if (token === runtime.pronunciationToken) dom.quizSoundPulse?.classList.add("is-speaking");
    };
    utterance.onend = () => {
      if (token === runtime.pronunciationToken) dom.quizSoundPulse?.classList.remove("is-speaking");
    };
    utterance.onerror = () => {
      if (token === runtime.pronunciationToken) {
        dom.quizSoundPulse?.classList.remove("is-speaking");
        showToast("发音加载失败，请检查网络后重试");
      }
    };
    window.speechSynthesis.speak(utterance);
  }

  function pronunciationSources(word) {
    const encoded = encodeURIComponent(word.trim());
    return [
      // 有道 type=1 为英式发音。严格模式下不加入 type=2（美式）或未指定地区的音源。
      `https://dict.youdao.com/dictvoice?audio=${encoded}&type=1`,
    ];
  }

  function playPronunciationSource(word, sources, index, token) {
    if (token !== runtime.pronunciationToken) return;
    if (index >= sources.length) {
      speakWithSystemVoice(word, token);
      return;
    }
    if (!wordAudio) {
      speakWithSystemVoice(word, token);
      return;
    }
    wordAudio.pause();
    wordAudio.src = sources[index];
    wordAudio.currentTime = 0;
    wordAudio.playbackRate = 1;
    wordAudio.onplay = () => {
      if (token === runtime.pronunciationToken) dom.quizSoundPulse?.classList.add("is-speaking");
    };
    wordAudio.onended = () => {
      if (token === runtime.pronunciationToken) dom.quizSoundPulse?.classList.remove("is-speaking");
    };
    wordAudio.onerror = () => {
      if (token !== runtime.pronunciationToken) return;
      playPronunciationSource(word, sources, index + 1, token);
    };
    const result = wordAudio.play();
    if (result) {
      result.catch((error) => {
        if (token !== runtime.pronunciationToken) return;
        if (error?.name === "NotAllowedError") {
          dom.quizSoundPulse?.classList.remove("is-speaking");
          showToast("浏览器阻止了自动播放，请再点一次发音按钮");
          return;
        }
        playPronunciationSource(word, sources, index + 1, token);
      });
    }
  }

  function speakWord(word) {
    const cleanWord = String(word || "").trim();
    if (!cleanWord) return;
    runtime.pronunciationToken += 1;
    const token = runtime.pronunciationToken;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (wordAudio) {
      wordAudio.pause();
      wordAudio.removeAttribute("src");
      wordAudio.load();
    }
    playPronunciationSource(cleanWord, pronunciationSources(cleanWord), 0, token);
  }

  function quizEntriesForPack() {
    const pack = state.activePack;
    if (!pack) return [];
    const valid = pack.wordIds.map((id) => wordMap.get(id)).filter((entry) => entry?.meaning);
    return shuffle(valid).slice(0, Math.min(10, valid.length));
  }

  function buildOptions(entry) {
    const sameGroup = entry.group === "scene" ? sceneWords : jijingWords;
    const candidates = shuffle(
      sameGroup.filter(
        (item) =>
          item.id !== entry.id &&
          item.meaning &&
          item.meaning !== entry.meaning &&
          item.meaning.length <= 38,
      ),
    );
    const meanings = [entry.meaning];
    for (const candidate of candidates) {
      if (!meanings.includes(candidate.meaning)) meanings.push(candidate.meaning);
      if (meanings.length === 4) break;
    }
    if (meanings.length < 4) {
      for (const candidate of shuffle(allWords)) {
        if (candidate.meaning && !meanings.includes(candidate.meaning)) meanings.push(candidate.meaning);
        if (meanings.length === 4) break;
      }
    }
    return shuffle(meanings);
  }

  function openQuiz() {
    const entries = quizEntriesForPack();
    if (!entries.length) {
      showToast("本组没有足够的释义内容可供测试");
      return;
    }
    runtime.quiz = {
      entries,
      index: 0,
      correct: 0,
      answered: false,
      selected: "",
      results: [],
    };
    if (typeof dom.quizDialog.showModal === "function") dom.quizDialog.showModal();
    else dom.quizDialog.setAttribute("open", "");
    renderQuizQuestion();
    setTimeout(() => speakWord(entries[0].term), 180);
  }

  function renderQuizQuestion() {
    const quiz = runtime.quiz;
    if (!quiz) return;
    const entry = quiz.entries[quiz.index];
    const options = buildOptions(entry);
    quiz.options = options;
    quiz.answered = false;
    quiz.selected = "";
    dom.quizPosition.textContent = `${quiz.index + 1} / ${quiz.entries.length}`;
    dom.quizProgressBar.style.width = `${(quiz.index / quiz.entries.length) * 100}%`;
    dom.quizFeedback.textContent = "";
    dom.quizNextButton.hidden = true;
    dom.quizNextButton.textContent =
      quiz.index === quiz.entries.length - 1 ? "查看结果" : "下一题";
    dom.quizOptions.innerHTML = options
      .map(
        (meaning, index) => `
          <button class="quiz-option" type="button" data-quiz-option="${index}">
            <strong>${String.fromCharCode(65 + index)}.</strong> ${escapeHtml(meaning)}
          </button>
        `,
      )
      .join("");
  }

  function answerQuiz(optionIndex) {
    const quiz = runtime.quiz;
    if (!quiz || quiz.answered) return;
    const entry = quiz.entries[quiz.index];
    const selected = quiz.options[optionIndex];
    const correct = selected === entry.meaning;
    quiz.answered = true;
    quiz.selected = selected;
    if (correct) quiz.correct += 1;
    quiz.results.push({ id: entry.id, correct });
    state.stats.questions += 1;
    if (correct) {
      state.stats.correct += 1;
      const oldCount = Number(state.wrongCounts[entry.id] || 0);
      if (oldCount > 1) state.wrongCounts[entry.id] = oldCount - 1;
      else delete state.wrongCounts[entry.id];
    } else {
      state.wrongCounts[entry.id] = Number(state.wrongCounts[entry.id] || 0) + 1;
    }

    dom.quizOptions.querySelectorAll(".quiz-option").forEach((button, index) => {
      button.disabled = true;
      const meaning = quiz.options[index];
      if (meaning === entry.meaning) button.classList.add("is-correct");
      else if (meaning === selected) button.classList.add("is-wrong");
    });
    dom.quizFeedback.textContent = correct
      ? `正确：${entry.term} · ${entry.meaning}`
      : `正确答案：${entry.term} · ${entry.meaning}`;
    dom.quizNextButton.hidden = false;
    saveState();
    renderOverview();
    renderBookCounts();
  }

  function nextQuizQuestion() {
    const quiz = runtime.quiz;
    if (!quiz || !quiz.answered) return;
    if (quiz.index < quiz.entries.length - 1) {
      quiz.index += 1;
      renderQuizQuestion();
      speakWord(quiz.entries[quiz.index].term);
      return;
    }
    finishQuiz();
  }

  function finishQuiz() {
    const quiz = runtime.quiz;
    const pack = state.activePack;
    if (!quiz || !pack) return;
    pack.quizDone = true;
    pack.quizScore = quiz.correct;
    pack.quizTotal = quiz.entries.length;
    saveState();
    dom.quizProgressBar.style.width = "100%";
    dom.quizDialog.close();
    runtime.quiz = null;
    renderAll();
    showToast(`测试完成：${quiz.correct}/${quiz.entries.length}`);
  }

  function renderBookCounts() {
    dom.sceneCount.textContent = `${sceneWords.length.toLocaleString("zh-CN")} 词`;
    dom.jijingCount.textContent = `${jijingWords.length.toLocaleString("zh-CN")} 词`;
    dom.track55Count.textContent = `${
      (library.dictationTracks || []).filter((track) => track.level === "5.5").length
    } 组`;
    dom.track60Count.textContent = `${
      (library.dictationTracks || []).filter((track) => track.level === "6.0").length
    } 组`;
    dom.reviewCount.textContent = `${getReviewIds().length} 词`;
  }

  function bookMeta(tab) {
    return (
      {
        scene: {
          eyebrow: "CHAPTER 01 · SCENE VOCABULARY",
          title: "场景高频单词",
          intro: "按租房、旅游、工作、地图、医疗等真实场景建立声音反应。",
        },
        jijing: {
          eyebrow: "CHAPTER 02 · QUESTION RECALL",
          title: "听力机经词汇",
          intro: "来自真题回忆资料，训练对高频答案词的快速识别。",
        },
        dictation55: {
          eyebrow: "CHAPTER 03 · FOUNDATION DICTATION",
          title: "5.5 分听写训练",
          intro: "从数字、钱数、邮编、地名、人名、日期和基础词汇开始。",
        },
        dictation60: {
          eyebrow: "CHAPTER 04 · ADVANCED DICTATION",
          title: "6.0 分听写训练",
          intro: "强化组合信息、复数、连字符、词组与更复杂的听写反应。",
        },
        review: {
          eyebrow: "CHAPTER 05 · MISTAKE NOTEBOOK",
          title: "听音错词本",
          intro: "测试中答错的词会自动来到这里；答对后，错词权重会逐步下降。",
        },
      }[tab] || {}
    );
  }

  function renderBook() {
    const meta = bookMeta(runtime.bookTab);
    dom.bookChapterEyebrow.textContent = meta.eyebrow;
    dom.bookChapterTitle.textContent = meta.title;
    dom.bookChapterIntro.textContent = meta.intro;
    document.querySelectorAll("[data-book-tab]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.bookTab === runtime.bookTab);
    });

    const query = dom.bookSearch.value.trim().toLowerCase();
    if (runtime.bookTab === "scene" || runtime.bookTab === "jijing") {
      const categories =
        runtime.bookTab === "scene"
          ? library.sceneCategories || []
          : library.jijingCategories || [];
      const group = runtime.bookTab;
      const matches = categories.filter((category) => {
        if (!query) return true;
        return (
          category.title.toLowerCase().includes(query) ||
          (category.entries || []).some(
            (entry) =>
              entry.term.toLowerCase().includes(query) ||
              String(entry.meaning || "").toLowerCase().includes(query),
          )
        );
      });
      dom.chapterGrid.innerHTML = matches.length
        ? matches
            .map((category, index) => categoryCardHtml(category, index, group, query))
            .join("")
        : '<p class="empty-chapters">没有找到匹配章节或单词。</p>';
      return;
    }

    if (runtime.bookTab === "review") {
      const entries = getReviewIds()
        .map((id) => wordMap.get(id))
        .filter(Boolean)
        .filter(
          (entry) =>
            !query ||
            entry.term.toLowerCase().includes(query) ||
            String(entry.meaning || "").toLowerCase().includes(query),
        );
      if (!entries.length) {
        dom.chapterGrid.innerHTML =
          '<p class="empty-chapters">错词本还是空的。完成听音测试后，答错的词会自动收进这里。</p>';
        return;
      }
      const chunks = [];
      for (let index = 0; index < entries.length; index += 40) chunks.push(entries.slice(index, index + 40));
      dom.chapterGrid.innerHTML = chunks
        .map(
          (chunk, index) => `
            <button class="chapter-card" type="button" data-review-chunk="${index}">
              <span class="chapter-card__index">REVIEW ${String(index + 1).padStart(2, "0")}
                <span class="chapter-card__type">错词优先</span>
              </span>
              <h4>错词复习第 ${index + 1} 组</h4>
              <p>${chunk.length} 词 · 按错误次数排序</p>
              <span class="chapter-card__progress"><span style="width:0%"></span></span>
            </button>
          `,
        )
        .join("");
      runtime.reviewChunks = chunks;
      return;
    }

    const level = runtime.bookTab === "dictation55" ? "5.5" : "6.0";
    const tracks = (library.dictationTracks || []).filter(
      (track) =>
        track.level === level &&
        (!query ||
          track.title.toLowerCase().includes(query) ||
          track.type.toLowerCase().includes(query)),
    );
    dom.chapterGrid.innerHTML = tracks.length
      ? tracks.map((track, index) => trackCardHtml(track, index)).join("")
      : '<p class="empty-chapters">没有找到匹配的听写训练。</p>';
  }

  function categoryCardHtml(category, index, group, query) {
    const allEntries = category.entries || [];
    const entries = query
      ? allEntries.filter(
          (entry) =>
            entry.term.toLowerCase().includes(query) ||
            String(entry.meaning || "").toLowerCase().includes(query),
        )
      : allEntries;
    const learned = allEntries.filter((entry) => state.learned[entry.id]).length;
    const percent = allEntries.length ? Math.round((learned / allEntries.length) * 100) : 0;
    return `
      <button class="chapter-card" type="button" data-open-category="${escapeHtml(
        category.id,
      )}" data-category-group="${group}">
        <span class="chapter-card__index">${String(index + 1).padStart(2, "0")}
          <span class="chapter-card__type">${group === "scene" ? "场景" : "机经"}</span>
        </span>
        <h4>${escapeHtml(category.title)}</h4>
        <p>${entries.length} 词${query ? "匹配" : ""} · 已学 ${learned}/${allEntries.length}</p>
        <span class="chapter-card__progress"><span style="width:${percent}%"></span></span>
      </button>
    `;
  }

  function trackCardHtml(track, index) {
    const done = Boolean(state.completedTracks[track.id]);
    return `
      <article class="chapter-card track-card">
        <button class="track-card__play" type="button" data-play-track="${escapeHtml(
          track.id,
        )}" aria-label="播放 ${escapeHtml(track.title)}">▶</button>
        <span class="chapter-card__index">${String(index + 1).padStart(2, "0")}
          <span class="chapter-card__type">${track.type === "basic" ? "基本功" : "词汇听写"}</span>
        </span>
        <h4>${escapeHtml(track.title)}</h4>
        <p>${done ? "已完成" : "点击即播 · 正常 1×"}</p>
        <button class="track-card__answer" type="button" data-show-track-answer="${escapeHtml(
          track.id,
        )}">显示答案</button>
        <span class="chapter-card__progress"><span style="width:${done ? 100 : 0}%"></span></span>
      </article>
    `;
  }

  function openTrackAnswer(trackId) {
    const track = trackMap.get(trackId);
    if (!track) return;
    runtime.answerTrackId = trackId;
    dom.answerDialogTitle.textContent = track.title;
    dom.answerDialogMeta.textContent = `${track.level} 分 · ${
      track.type === "basic" ? "基本功听写" : "词汇听写"
    }`;
    dom.answerDialogText.textContent =
      String(track.answerText || "").trim() || "这组资料暂时没有可显示的文字答案。";
    if (!dom.answerDialog.open) dom.answerDialog.showModal();
  }

  function openCategory(group, categoryId) {
    const categories = group === "scene" ? library.sceneCategories : library.jijingCategories;
    const category = (categories || []).find((item) => item.id === categoryId);
    if (!category) return;
    const query = dom.bookSearch.value.trim().toLowerCase();
    const entries = (category.entries || [])
      .map((entry) => wordMap.get(entry.id) || entry)
      .filter(
        (entry) =>
          !query ||
          entry.term.toLowerCase().includes(query) ||
          String(entry.meaning || "").toLowerCase().includes(query),
      );
    openWordDialog(category.title, entries, group === "scene" ? "SCENE BOOK" : "JIJING BOOK");
  }

  function openWordDialog(title, entries, eyebrow = "VOCABULARY BOOK") {
    if (!entries.length) {
      showToast("这个章节没有可显示的词");
      return;
    }
    runtime.dialogEntries = entries;
    runtime.dialogIndex = 0;
    dom.dialogEyebrow.textContent = eyebrow;
    dom.dialogTitle.textContent = title;
    dom.dialogSubtitle.textContent = `${entries.length} 词 · 点击单词可播放正常 1× 英式发音`;
    renderDialogWord();
    if (typeof dom.chapterDialog.showModal === "function") dom.chapterDialog.showModal();
    else dom.chapterDialog.setAttribute("open", "");
  }

  function renderDialogWord() {
    const entries = runtime.dialogEntries;
    if (!entries.length) return;
    runtime.dialogIndex = Math.max(0, Math.min(entries.length - 1, runtime.dialogIndex));
    const entry = entries[runtime.dialogIndex];
    const learned = Boolean(state.learned[entry.id]);
    dom.dialogWord.textContent = entry.term;
    dom.dialogMeaning.textContent = entry.meaning || "该词条未附中文释义";
    dom.dialogWordSource.textContent = entry.source || entry.categoryTitle || "听力资料";
    dom.dialogWordPosition.textContent = `${runtime.dialogIndex + 1} / ${entries.length}`;
    dom.markDialogWord.textContent = learned ? "取消已学" : "标记已学";
    dom.dialogPrevWord.disabled = runtime.dialogIndex === 0;
    dom.dialogNextWord.disabled = runtime.dialogIndex === entries.length - 1;
    dom.dialogWordList.innerHTML = entries
      .map(
        (item, index) => `
          <button class="${index === runtime.dialogIndex ? "is-current" : ""} ${
            state.learned[item.id] ? "is-learned" : ""
          }" type="button" data-dialog-index="${index}" title="${escapeHtml(item.term)}">
            ${escapeHtml(item.term)}
          </button>
        `,
      )
      .join("");
  }

  function toggleDialogWord() {
    const entry = runtime.dialogEntries[runtime.dialogIndex];
    if (!entry) return;
    if (state.learned[entry.id]) delete state.learned[entry.id];
    else state.learned[entry.id] = true;
    saveState();
    renderDialogWord();
    renderOverview();
    renderBook();
  }

  function playTrack(trackId) {
    const track = trackMap.get(trackId);
    if (!track) return;

    if (runtime.audioTrackId === trackId && !audio.paused) {
      audio.pause();
      return;
    }

    if (runtime.audioTrackId !== trackId) {
      audio.pause();
      audio.src = new URL(track.url, window.location.href).href;
      audio.preload = "metadata";
      audio.playbackRate = 1;
      audio.defaultPlaybackRate = 1;
      audio.load();
      runtime.audioTrackId = trackId;
      dom.audioTitle.textContent = `${track.level} 分 · ${track.title}`;
      dom.audioSeek.value = "0";
      dom.audioCurrentTime.textContent = "00:00";
      dom.audioDuration.textContent = "--:--";
    }

    dom.audioDock.hidden = false;
    dom.audioPlayButton.textContent = "…";
    const playPromise = audio.play();
    if (playPromise) {
      playPromise.catch((error) => {
        dom.audioPlayButton.textContent = "▶";
        console.warn("Audio playback failed:", error);
        showToast("浏览器拦截了播放，请再点一次下方播放键");
      });
    }
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "--:--";
    const minutes = Math.floor(seconds / 60);
    const rest = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }

  function closeAudio() {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    runtime.audioTrackId = "";
    dom.audioDock.hidden = true;
  }

  function exportProgress() {
    if (!activeAccount) {
      openAccountDialog({ required: true });
      return;
    }
    const payload = {
      app: "听力练习书",
      accountName: activeAccount.name,
      exportedAt: new Date().toISOString(),
      state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const safeName = activeAccount.name.replace(/[\\/:*?"<>|]/g, "-");
    link.download = `听力练习书-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("进度备份已下载");
  }

  function importProgress(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result);
        state = normalizeState(payload.state || payload);
        saveState();
        renderAll();
        showToast("进度已恢复");
      } catch {
        showToast("无法读取这个备份文件");
      }
    };
    reader.readAsText(file);
  }

  function bindEvents() {
    dom.accountButton.addEventListener("click", () => openAccountDialog());
    dom.accountDialogClose.addEventListener("click", () => {
      if (activeAccount && !runtime.accountDialogRequired) dom.accountDialog.close();
    });
    dom.accountDialog.addEventListener("cancel", (event) => {
      if (!activeAccount || runtime.accountDialogRequired) event.preventDefault();
    });
    dom.accountList.addEventListener("click", (event) => {
      const card = event.target.closest("[data-account-id]");
      if (!card) return;
      runtime.selectedAccountId = card.dataset.accountId;
      dom.accountLoginPassword.value = "";
      dom.accountLoginMessage.textContent = "";
      renderAccountDialog();
      if (!dom.accountLoginForm.hidden) {
        window.setTimeout(() => dom.accountLoginPassword.focus(), 50);
      }
    });
    dom.accountLoginForm.addEventListener("submit", loginAccount);
    dom.cloudLoginForm.addEventListener("submit", cloudLogin);
    dom.accountCreateForm.addEventListener("submit", createAccount);
    dom.accountUpgradeForm.addEventListener("submit", upgradeLocalAccount);
    dom.accountPasswordForm.addEventListener("submit", changeAccountPassword);
    dom.accountLockButton.addEventListener("click", lockCurrentAccount);

    dom.packSize.addEventListener("change", () => {
      state.settings.packSize = Number(dom.packSize.value) || 15;
      saveState();
    });
    dom.claimRoute.addEventListener("change", () => {
      state.settings.route = dom.claimRoute.value;
      saveState();
    });
    dom.claimButton.addEventListener("click", claimMission);
    dom.heroClaimButton.addEventListener("click", () => {
      if (state.activePack && !isPackComplete()) {
        dom.activeMission.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        claimMission();
      }
    });
    dom.recycleButton.addEventListener("click", recycleMission);

    dom.missionSteps.addEventListener("click", (event) => {
      const speakButton = event.target.closest("[data-speak-word]");
      if (speakButton) {
        const entry = wordMap.get(speakButton.dataset.speakWord);
        if (entry) speakWord(entry.term);
        return;
      }
      const toggleButton = event.target.closest("[data-toggle-word]");
      if (toggleButton) {
        toggleMissionWord(toggleButton.dataset.toggleWord);
        return;
      }
      if (event.target.closest("[data-mark-all-words]")) {
        toggleAllMissionWords();
        return;
      }
      if (event.target.closest("[data-start-quiz]")) {
        openQuiz();
        return;
      }
      const trackButton = event.target.closest("[data-play-track]");
      if (trackButton) {
        playTrack(trackButton.dataset.playTrack);
        return;
      }
      const answerButton = event.target.closest("[data-show-track-answer]");
      if (answerButton) {
        openTrackAnswer(answerButton.dataset.showTrackAnswer);
        return;
      }
      const completeTrack = event.target.closest("[data-complete-track]");
      if (completeTrack) toggleTrackDone(completeTrack.dataset.completeTrack);
    });

    document.querySelectorAll("[data-book-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        runtime.bookTab = button.dataset.bookTab;
        dom.bookSearch.value = "";
        renderBook();
      });
    });
    dom.bookSearch.addEventListener("input", renderBook);
    dom.chapterGrid.addEventListener("click", (event) => {
      const categoryButton = event.target.closest("[data-open-category]");
      if (categoryButton) {
        openCategory(categoryButton.dataset.categoryGroup, categoryButton.dataset.openCategory);
        return;
      }
      const trackButton = event.target.closest("[data-play-track]");
      if (trackButton) {
        playTrack(trackButton.dataset.playTrack);
        return;
      }
      const answerButton = event.target.closest("[data-show-track-answer]");
      if (answerButton) {
        openTrackAnswer(answerButton.dataset.showTrackAnswer);
        return;
      }
      const reviewButton = event.target.closest("[data-review-chunk]");
      if (reviewButton) {
        const entries = runtime.reviewChunks?.[Number(reviewButton.dataset.reviewChunk)] || [];
        openWordDialog("错词复习", entries, "MISTAKE NOTEBOOK");
      }
    });

    dom.dialogWord.addEventListener("click", () => {
      const entry = runtime.dialogEntries[runtime.dialogIndex];
      if (entry) speakWord(entry.term);
    });
    dom.playDialogWord.addEventListener("click", () => {
      const entry = runtime.dialogEntries[runtime.dialogIndex];
      if (entry) speakWord(entry.term);
    });
    dom.markDialogWord.addEventListener("click", toggleDialogWord);
    dom.dialogPrevWord.addEventListener("click", () => {
      runtime.dialogIndex -= 1;
      renderDialogWord();
    });
    dom.dialogNextWord.addEventListener("click", () => {
      runtime.dialogIndex += 1;
      renderDialogWord();
    });
    dom.dialogWordList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-dialog-index]");
      if (!button) return;
      runtime.dialogIndex = Number(button.dataset.dialogIndex);
      renderDialogWord();
      const entry = runtime.dialogEntries[runtime.dialogIndex];
      if (entry) speakWord(entry.term);
    });
    dom.answerDialogPlay.addEventListener("click", () => {
      if (!runtime.answerTrackId) return;
      playTrack(runtime.answerTrackId);
    });
    dom.answerDialog.addEventListener("close", () => {
      runtime.answerTrackId = "";
    });

    dom.quizPlayButton.addEventListener("click", () => {
      const entry = runtime.quiz?.entries[runtime.quiz.index];
      if (entry) speakWord(entry.term);
    });
    dom.quizOptions.addEventListener("click", (event) => {
      const option = event.target.closest("[data-quiz-option]");
      if (option) answerQuiz(Number(option.dataset.quizOption));
    });
    dom.quizNextButton.addEventListener("click", nextQuizQuestion);
    dom.quizDialog.addEventListener("close", () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      dom.quizSoundPulse.classList.remove("is-speaking");
    });

    dom.audioPlayButton.addEventListener("click", () => {
      if (!runtime.audioTrackId) return;
      if (audio.paused) {
        audio.playbackRate = 1;
        audio.play().catch(() => showToast("音频暂时无法播放"));
      } else audio.pause();
    });
    dom.audioCloseButton.addEventListener("click", closeAudio);
    dom.audioSeek.addEventListener("input", () => {
      if (Number.isFinite(audio.duration)) {
        audio.currentTime = (Number(dom.audioSeek.value) / 1000) * audio.duration;
      }
    });
    audio.addEventListener("play", () => {
      audio.playbackRate = 1;
      dom.audioPlayButton.textContent = "Ⅱ";
    });
    audio.addEventListener("pause", () => {
      dom.audioPlayButton.textContent = "▶";
    });
    audio.addEventListener("loadedmetadata", () => {
      dom.audioDuration.textContent = formatTime(audio.duration);
    });
    audio.addEventListener("timeupdate", () => {
      dom.audioCurrentTime.textContent = formatTime(audio.currentTime);
      dom.audioSeek.value = Number.isFinite(audio.duration)
        ? String(Math.round((audio.currentTime / audio.duration) * 1000))
        : "0";
    });
    audio.addEventListener("ended", () => {
      dom.audioPlayButton.textContent = "▶";
      dom.audioSeek.value = "1000";
    });
    audio.addEventListener("waiting", () => {
      dom.audioPlayButton.textContent = "…";
    });
    audio.addEventListener("canplay", () => {
      dom.audioPlayButton.textContent = audio.paused ? "▶" : "Ⅱ";
    });
    audio.addEventListener("error", () => {
      dom.audioPlayButton.textContent = "▶";
      showToast("音频加载失败，请确认网络后重新点击");
    });

    dom.exportButton.addEventListener("click", exportProgress);
    dom.importButton.addEventListener("click", () => dom.importFileInput.click());
    dom.importFileInput.addEventListener("change", () => {
      const [file] = dom.importFileInput.files;
      if (file) importProgress(file);
      dom.importFileInput.value = "";
    });
    dom.resetButton.addEventListener("click", () => {
      if (!activeAccount) return;
      if (
        !window.confirm(
          `确定清空账号“${activeAccount.name}”的全部学习进度吗？其他账号不会受影响。`,
        )
      )
        return;
      state = defaultState();
      saveState();
      renderAll();
      showToast("学习进度已重置");
    });

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      runtime.deferredInstallPrompt = event;
      dom.installButton.hidden = false;
    });
    dom.installButton.addEventListener("click", async () => {
      if (!runtime.deferredInstallPrompt) {
        showToast("手机浏览器菜单中选择“添加到主屏幕”即可安装");
        return;
      }
      runtime.deferredInstallPrompt.prompt();
      await runtime.deferredInstallPrompt.userChoice;
      runtime.deferredInstallPrompt = null;
    });
    window.addEventListener("online", () => {
      if (!activeAccount?.cloud) return;
      if (runtime.cloudDirty) syncStateToCloud();
      else refreshStateFromCloud({ notify: true });
    });
    window.addEventListener("focus", () => refreshStateFromCloud({ notify: true }));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshStateFromCloud({ notify: true });
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || window.location.protocol === "file:") return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js?v=26").catch(() => {
        showToast("离线组件暂未启用，不影响在线使用");
      });
    });
  }

  async function init() {
    cacheDom();
    audio = dom.trainingAudio;
    wordAudio = dom.wordPronunciationAudio;
    audio.preload = "metadata";
    audio.playbackRate = 1;
    audio.defaultPlaybackRate = 1;
    wordAudio.preload = "none";
    wordAudio.playbackRate = 1;
    wordAudio.defaultPlaybackRate = 1;
    bindEvents();
    const cloudRestored = await restoreCloudSession();
    if (!cloudRestored) {
      const sessionAccountId = sessionStorage.getItem(ACCOUNT_SESSION_KEY);
      const sessionAccount = accountStore.accounts[sessionAccountId];
      if (sessionAccount) {
        activeAccount = sessionAccount;
        state = loadStateForAccount(sessionAccount.id);
        runtime.selectedAccountId = sessionAccount.id;
      } else {
        runtime.selectedAccountId =
          accountStore.activeAccountId || accountList()[0]?.id || "";
        runtime.accountDialogRequired = true;
      }
    }
    renderAccountHeader();
    renderAccountDialog();
    renderAll();
    registerServiceWorker();
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
    if (!activeAccount) {
      window.requestAnimationFrame(() => openAccountDialog({ required: true }));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
