(() => {
  "use strict";

  const CONFIG = {
    start: "2026-09-24",
    ielts: "2026-10-27",
    cet6: "2026-12-12",
    storageKey: "dual-exam-flight-v2",
  };

  const DAY_MS = 24 * 60 * 60 * 1000;
  const VOCAB_PER_DAY = 15;
  const SCENE_PHASE_END = "2026-10-10";
  const JIJING_PHASE_START = "2026-10-11";
  const REVIEW_PHASE_START = "2026-10-23";
  const TODAY = clampDateKey(toDateKey(new Date()), CONFIG.start, CONFIG.cet6);
  const weekNames = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  const weekShort = ["日", "一", "二", "三", "四", "五", "六"];
  const englishWeek = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const englishMonths = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

  const readingQuestionTypes = [
    "判断题 True / False / Not Given",
    "段落标题 Matching Headings",
    "信息匹配 Matching Information",
    "单选与多选 Multiple Choice",
    "句子填空 Sentence Completion",
    "摘要填空 Summary Completion",
    "人名观点匹配 Matching Features",
    "流程图与图表填空 Diagram / Flow-chart",
  ];

  const listeningSections = [
    "Section 1 租房 / 咨询场景",
    "Section 2 地图 / 场馆介绍",
    "Section 3 学术讨论 / 小组作业",
    "Section 4 学术讲座 / 笔记填空",
  ];

  const speakingTopics = [
    "家乡与居住地",
    "学习、专业与未来计划",
    "朋友与一次愉快交谈",
    "一次难忘的旅行",
    "喜欢的书、电影或节目",
    "科技产品与社交媒体",
    "运动、健康与作息",
    "环境保护与城市变化",
    "一位有影响力的人",
    "传统节日与文化习惯",
    "一次解决问题的经历",
    "教育、工作与成功标准",
  ];

  const writingTopics = [
    "教育资源是否应更多投入科技",
    "城市交通拥堵的原因与解决办法",
    "远程办公对个人与社会的影响",
    "环境责任应由个人还是政府承担",
    "大学教育应偏重理论还是实践",
    "广告对消费者选择的影响",
    "老龄化社会的机遇与挑战",
    "国际旅游对当地文化的影响",
    "青少年使用手机的利与弊",
    "公共空间与城市幸福感",
  ];

  const cetTopics = [
    "数字素养与终身学习",
    "人工智能与大学生活",
    "志愿服务与社会责任",
    "传统文化的现代传播",
    "绿色生活与低碳校园",
    "时间管理与自我成长",
    "就业选择与个人价值",
    "网络信息辨别能力",
  ];

  const tactics = [
    "听力错题不要只看答案：把没听出的声音重新听出来。",
    "阅读先定位题干关键词，再处理同义替换，不要从头精读到尾。",
    "口语不卡顿比堆难词更重要：先把观点说完整，再补细节。",
    "写作每段只完成一个任务：观点、解释、例子、回扣。",
    "复盘时只记“下次怎么改”，不要把错题本写成答案抄写本。",
    "词汇要在句子里认得出来；看一遍不算会，能回忆才算。",
    "模考的价值不是分数，而是暴露你在时间压力下的坏习惯。",
  ];

  const stageDefinitions = [
    {
      start: "2026-09-24",
      end: "2026-09-29",
      label: "基础校准期",
      summary: "拆题型、补词汇、建立错题记录，先把方法做对。",
      phase: "雅思基础",
    },
    {
      start: "2026-09-30",
      end: "2026-10-12",
      label: "专项提速期",
      summary: "按考试时间做专项训练，把正确率和速度一起推上去。",
      phase: "雅思提速",
    },
    {
      start: "2026-10-13",
      end: "2026-10-22",
      label: "全真模考期",
      summary: "进入整套训练，固定考试节奏，集中消灭高频失误。",
      phase: "雅思模考",
    },
    {
      start: "2026-10-23",
      end: "2026-10-26",
      label: "考前收束期",
      summary: "减少新题，回看错题与模板，让状态稳定而清醒。",
      phase: "雅思收束",
    },
    {
      start: "2026-10-27",
      end: "2026-10-27",
      label: "雅思考试日",
      summary: "轻装上阵。今天不再证明自己，只把训练过的发挥出来。",
      phase: "IELTS DAY",
    },
    {
      start: "2026-10-28",
      end: "2026-11-15",
      label: "六级能力重建",
      summary: "恢复六级词汇、听力与长篇阅读手感，重建稳定节奏。",
      phase: "六级基础",
    },
    {
      start: "2026-11-16",
      end: "2026-12-05",
      label: "六级真题强化",
      summary: "围绕真题套卷训练，强化听力预判、阅读定位与写译输出。",
      phase: "六级强化",
    },
    {
      start: "2026-12-06",
      end: "2026-12-11",
      label: "六级冲刺收口",
      summary: "模考、复盘、背诵和睡眠同步收口，把波动压到最低。",
      phase: "六级冲刺",
    },
    {
      start: "2026-12-12",
      end: "2026-12-12",
      label: "六级考试日",
      summary: "按自己的节奏完成最后一程，稳住就是胜利。",
      phase: "CET-6 DAY",
    },
  ];

  const dom = {};
  const pronunciationCache = new Map();
  const runtime = {
    selectedDate: TODAY,
    filter: "all",
    vocabMode: TODAY >= JIJING_PHASE_START ? "jijing" : "scene",
    vocabIndex: 0,
    speechRate: 0.9,
    speakingSequence: false,
    speechToken: 0,
    activeAudio: null,
    deferredInstallPrompt: null,
    mobileNavTarget: "homeSection",
    mobileNavLockUntil: 0,
    timerSeconds: 25 * 60,
    timerPreset: 25,
    timerRunning: false,
    timerId: null,
    toastId: null,
  };

  let state = loadState();
  let allTasks = [];

  function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function fromDateKey(key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  function addDays(key, amount) {
    const date = fromDateKey(key);
    date.setDate(date.getDate() + amount);
    return toDateKey(date);
  }

  function daysBetween(start, end) {
    return Math.round((fromDateKey(end) - fromDateKey(start)) / DAY_MS);
  }

  function clampDateKey(key, min, max) {
    if (key < min) return min;
    if (key > max) return max;
    return key;
  }

  function enumerateDates(start, end) {
    const keys = [];
    let cursor = start;
    while (cursor <= end) {
      keys.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return keys;
  }

  function loadState() {
    const fallback = {
      version: 2,
      completions: {},
      moves: {},
      customTasks: [],
      notes: {},
      vocabMastery: {},
      reviewPlans: {},
    };
    try {
      const current = localStorage.getItem(CONFIG.storageKey);
      const legacy = current === null ? localStorage.getItem("dual-exam-flight-v1") : null;
      const stored = JSON.parse(current ?? legacy);
      if (legacy && stored && typeof stored === "object") {
        // 旧任务和笔记继续有效；旧版预设词的掌握记录不混入真实听力词库。
        stored.vocabMastery = {};
        localStorage.setItem(CONFIG.storageKey, JSON.stringify(stored));
      }
      return stored && typeof stored === "object"
        ? {
            ...fallback,
            ...stored,
            version: 2,
            completions: stored.completions || {},
            moves: stored.moves || {},
            customTasks: stored.customTasks || [],
            notes: stored.notes || {},
            vocabMastery: stored.vocabMastery || {},
            reviewPlans: stored.reviewPlans || {},
          }
        : fallback;
    } catch {
      return fallback;
    }
  }

  function saveState() {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(state));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function sliceWords(bank, offset, count) {
    if (!Array.isArray(bank) || bank.length === 0) return [];
    const words = [];
    for (let index = 0; index < count; index += 1) {
      words.push(bank[(offset + index) % bank.length]);
    }
    return words;
  }

  function task(date, key, category, title, detail, minutes, words = [], resource = null) {
    return {
      id: `${date}-${key}`,
      originalDate: date,
      category,
      title,
      detail,
      minutes,
      words,
      resource,
      custom: false,
    };
  }

  function getListeningLibrary() {
    return window.LISTENING_LIBRARY || {
      sceneCategories: [],
      jijingCategories: [],
      dictationTracks: [],
    };
  }

  function getRecommendedVocabMode(date) {
    if (date >= REVIEW_PHASE_START) return "review";
    if (date >= JIJING_PHASE_START) return "jijing";
    return "scene";
  }

  function roundRobinEntries(categories, count, seed = 0) {
    if (!categories.length) return [];
    const buckets = categories.map((category, categoryIndex) => {
      const entries = category.entries || [];
      if (!entries.length) return [];
      const offset = (seed * count + categoryIndex * 5) % entries.length;
      return sliceWords(entries, offset, Math.min(count, entries.length));
    });
    const result = [];
    const seen = new Set();
    let row = 0;
    while (result.length < count && row < count * 2) {
      buckets.forEach((bucket) => {
        const entry = bucket[row];
        if (entry && !seen.has(entry.id) && result.length < count) {
          seen.add(entry.id);
          result.push(entry);
        }
      });
      row += 1;
    }
    return result;
  }

  function categoriesForPhase(date, mode) {
    const library = getListeningLibrary();
    const isScene = mode === "scene";
    const categories = isScene ? library.sceneCategories : library.jijingCategories;
    if (!categories.length) return [];
    const phaseStart = isScene ? CONFIG.start : JIJING_PHASE_START;
    const phaseEnd = isScene ? SCENE_PHASE_END : addDays(REVIEW_PHASE_START, -1);
    const phaseLength = Math.max(1, daysBetween(phaseStart, phaseEnd) + 1);
    const localDay = Math.max(0, Math.min(phaseLength - 1, daysBetween(phaseStart, date)));
    const from = Math.floor((localDay * categories.length) / phaseLength);
    const to = Math.max(from + 1, Math.floor(((localDay + 1) * categories.length) / phaseLength));
    return categories.slice(from, Math.min(categories.length, to));
  }

  function getCoreVocabPlan(date, mode) {
    const categories = categoriesForPhase(date, mode);
    const seed = Math.max(0, daysBetween(CONFIG.start, date));
    const entries = roundRobinEntries(categories, VOCAB_PER_DAY, seed);
    const label = categories.map((item) => item.title).join(" + ") || "听力词汇";
    return { entries, label };
  }

  function getReviewVocabPlan(date) {
    const recent = [];
    for (let offset = 1; offset <= 8; offset += 1) {
      const sourceDate = addDays(date, -offset);
      if (sourceDate < CONFIG.start) break;
      const mode = sourceDate >= JIJING_PHASE_START ? "jijing" : "scene";
      recent.push(...getCoreVocabPlan(sourceDate, mode).entries);
    }
    const unique = [];
    const seen = new Set();
    recent.forEach((entry) => {
      if (!entry || seen.has(entry.id)) return;
      seen.add(entry.id);
      unique.push(entry);
    });
    const wrongFirst = unique.filter((entry) => !isVocabMastered(entry));
    const fallback = unique.filter((entry) => isVocabMastered(entry));
    // 当天的错词队列首次打开时固定，避免每标记一个词就替换出一个新词。
    const savedIds = state.reviewPlans[date];
    const ids = Array.isArray(savedIds)
      ? savedIds
      : [...wrongFirst, ...fallback].slice(0, VOCAB_PER_DAY).map((entry) => entry.id);
    if (!Array.isArray(savedIds)) {
      state.reviewPlans[date] = ids;
      saveState();
    }
    const byId = new Map(unique.map((entry) => [entry.id, entry]));
    return {
      entries: ids.map((id) => byId.get(id)).filter(Boolean),
      label: wrongFirst.length ? `近 8 天错词优先 · 待巩固 ${wrongFirst.length} 词` : "近 8 天已掌握词抽检",
    };
  }

  function getVocabPlan(date = runtime.selectedDate, mode = runtime.vocabMode) {
    if (mode === "review") return getReviewVocabPlan(date);
    return getCoreVocabPlan(date, mode);
  }

  function getDictationPlan(date, index) {
    const tracks = getListeningLibrary().dictationTracks || [];
    let level = "5.5";
    let type = "basic";
    let phase = "5.5 基本功";
    let detail =
      "第一遍完整听，不暂停；第二遍按 3—5 个答案为一组听写；核对后把错误分成数字反应、字母辨音或拼写问题。错项最多重听 3 次，正确率达到 80% 再升级。";
    let minutes = 25;

    if (date >= "2026-10-07" && date <= SCENE_PHASE_END) {
      type = "vocabulary";
      phase = "5.5 词汇听写";
      detail =
        "先盲听并写下答案，再核对单复数、连写和易错拼写；每个错词听—写—跟读 3 轮。今天只追求听清和写对，不追求速度。";
    } else if (date >= JIJING_PHASE_START && date <= "2026-10-17") {
      level = "6.0";
      phase = "6.0 基本功";
      detail =
        "保持正常语速，先完整听一遍，再分组听写；重点训练信用卡号、钱数、字母数字组合、地名和年代。记录漏听位置，目标正确率 75% 以上。";
      minutes = 30;
    } else if (date >= "2026-10-18" && date <= "2026-10-22") {
      level = "6.0";
      type = "vocabulary";
      phase = "6.0 词汇听写";
      detail =
        "盲听后一次写出词形，重点检查复数、动词、副词、连字符与考点词组；错词只做声音纠正，不抄整页答案。";
      minutes = 30;
    } else if (date >= REVIEW_PHASE_START) {
      const mixed = tracks.filter((item) => item.level === (index % 2 === 0 ? "5.5" : "6.0"));
      const track = mixed[index % Math.max(1, mixed.length)] || null;
      return {
        phase: "考前点听复盘",
        tracks: track ? [track] : [],
        detail:
          "不再增加新材料。使用本组已练过的音频跳选 8—12 个片段，每段只听一次并写答案；只复盘仍然听不清的数字、地名、复数和易错拼写，20 分钟到点停止。",
        minutes: 20,
      };
    }

    const pool = tracks.filter((item) => item.level === level && item.type === type);
    const phaseStart =
      level === "5.5" && type === "basic"
        ? CONFIG.start
        : level === "5.5"
          ? "2026-10-07"
          : type === "basic"
            ? JIJING_PHASE_START
            : "2026-10-18";
    const localIndex = Math.max(0, daysBetween(phaseStart, date));
    // 6.0 基本功 7 天涵盖 10 个短音频，前三天各搭配一组后段材料。
    const selected = pool[localIndex] ? [pool[localIndex]] : [];
    if (level === "6.0" && type === "basic" && localIndex < 3 && pool[localIndex + 7]) {
      selected.push(pool[localIndex + 7]);
    }
    return {
      phase,
      tracks: selected,
      detail: selected.length > 1
        ? `${detail} 今天有两组较短音频，先做第一组，短休息后再做第二组；总时长控制在 35 分钟内。`
        : detail,
      minutes: selected.length > 1 ? 35 : minutes,
    };
  }

  function buildIeltsTasks(date, index, stage) {
    const dateObject = fromDateKey(date);
    const weekend = dateObject.getDay() === 0 || dateObject.getDay() === 6;
    const readingType = readingQuestionTypes[index % readingQuestionTypes.length];
    const readingPace = [
      { passage: "Passage 1", target: "15—18 分钟", question: "约 1.5 分钟" },
      { passage: "Passage 2", target: "20 分钟", question: "约 1.5—2 分钟" },
      { passage: "Passage 3", target: "22—25 分钟", question: "最多 2 分钟" },
    ][index % 3];
    const listeningType = listeningSections[index % listeningSections.length];
    const speakingTopic = speakingTopics[index % speakingTopics.length];
    const writingTopic = writingTopics[index % writingTopics.length];
    const vocabMode = getRecommendedVocabMode(date);
    const vocabPlan = getVocabPlan(date, vocabMode);
    const listeningWords = vocabPlan.entries.map((entry) => entry.term);
    const readingWords = [];
    const dictationPlan = getDictationPlan(date, index);
    const tasks = [
      task(
        date,
        "ielts-foundation-dictation",
        "ielts",
        `听力基本功｜${dictationPlan.phase}${dictationPlan.tracks.length ? ` · ${dictationPlan.tracks.map((track) => track.title).join(" + ")}` : ""}`,
        dictationPlan.detail,
        dictationPlan.minutes,
        [],
        dictationPlan.tracks,
      ),
    ];

    if (stage.label === "基础校准期") {
      tasks.push(
        task(
          date,
          "ielts-listening",
          "ielts",
          `听力｜${listeningType} 精听一组`,
          "先限时做题；第二遍逐句听写。遇到句子填空时，先根据上下文预测答案位置、词性和可能含义，再抓目标声音。第三遍对照原文标出连读、弱读和同义替换。",
          45,
        ),
        task(
          date,
          "ielts-listening-words",
          "ielts",
          `听力词汇｜${vocabPlan.label} · ${listeningWords.length} 词`,
          date >= REVIEW_PHASE_START
            ? "打开上方“错词点听”，隐藏单词后盲听、拼写，再只纠正仍然不稳的词。今天不增加新词。"
            : `${vocabMode === "scene" ? "先背场景高频词" : "进入听力机经词汇"}：先看词义建立场景，再听音、拼写、跟读；错词循环 3 次。`,
          25,
          listeningWords,
        ),
        task(
          date,
          "ielts-reading",
          "ielts",
          `阅读｜${readingPace.passage} · ${readingType}`,
          `目标用时 ${readingPace.target}，单题控制在${readingPace.question}；卡住先标记并继续，保持整篇节奏。做完先看解析，再合上答案独立重做错题并写出定位依据。`,
          40,
        ),
        task(
          date,
          "ielts-reading-words",
          "ielts",
          "阅读错词｜只整理当天文章里的 8 个障碍词",
          "不再使用原来的预设单词。只记录今天文章中真正影响定位或理解的词，并保留原句与同义替换。",
          15,
        ),
        task(
          date,
          "ielts-output",
          "ielts",
          index % 2 === 0 ? "写作｜Task 2 审题 + 提纲 + 主体段" : "口语｜Part 2 两分钟完整录音",
          index % 2 === 0
            ? `题目：${writingTopic}。用 5 分钟审题，8 分钟列双边观点，完成一个 PEEL 主体段并自查主谓一致。`
            : `主题：${speakingTopic}。准备 1 分钟，连续说 2 分钟；回听后只修正 3 个最影响表达的问题，再录第二遍。`,
          40,
        ),
      );
      if (index % 2 === 1) {
        tasks.splice(
          2,
          0,
          task(
            date,
            "ielts-sentence-location",
            "ielts",
            "听力句子定位｜5 句预测 + 微精听",
            "每句播放前先判断答案大概出现在哪个位置、需要什么词性；播放后立即写下听到的词，再对照原文确认是定位问题还是辨音问题。",
            20,
          ),
        );
      }
    } else if (stage.label === "专项提速期") {
      tasks.push(
        task(
          date,
          "ielts-listening",
          "ielts",
          `听力｜${listeningType} + 相邻 Section`,
          "连续完成两个 Section，严格计时；填空题先预测词性与答案位置，复盘时把答案前后的信号词、转折词和干扰项各记一处。",
          55,
        ),
        task(
          date,
          "ielts-reading",
          "ielts",
          `阅读｜${readingType} 提速训练`,
          "完成 2 篇文章，参考 Passage 1 用 15—18 分钟、Passage 2 用约 20 分钟；单题控制在 1.5—2 分钟，超时立即标记转场，做完后独立重做错题。",
          55,
        ),
        task(
          date,
          "ielts-vocab",
          "ielts",
          `听力词汇｜${vocabPlan.label} · ${listeningWords.length} 词`,
          "上方词汇声场先听音和拼写；阅读词不再使用预设列表，只从当天真题中整理影响理解的词。",
          25,
          listeningWords,
        ),
        task(
          date,
          "ielts-writing",
          "ielts",
          index % 3 === 0 ? "写作｜Task 1 20 分钟完整作文" : "写作｜Task 2 40 分钟完整作文",
          index % 3 === 0
            ? "完成一篇图表作文：概述只写最显著的 2—3 个特征，正文按趋势或类别分组，最后检查数据与比较级。"
            : `题目：${writingTopic}。5 分钟提纲、32 分钟写作、3 分钟检查；重点检查段落中心句与例子是否真正支持观点。`,
          index % 3 === 0 ? 35 : 50,
        ),
        task(
          date,
          "ielts-speaking",
          "ielts",
          `口语｜${speakingTopic} 串题`,
          "Part 1 快答 6 题，Part 2 录音 2 次，Part 3 用“观点—原因—例子—让步”回答 3 题。",
          35,
        ),
      );
    } else if (stage.label === "全真模考期") {
      if (weekend || index % 3 === 0) {
        tasks.push(
          task(
            date,
            "ielts-full-mock",
            "ielts",
            "雅思全真模考｜听力 + 阅读连续完成",
            "按正式考试顺序完成，中途不暂停、不查词；阅读参考 15—18 / 20 / 22—25 分钟分配，单题拖到 2 分钟仍无思路就先转场。",
            130,
          ),
          task(
            date,
            "ielts-mock-review",
            "review",
            "模考复盘｜建立本套失分画像",
            "分别统计：听力辨音 / 拼写 / 句子定位 / 干扰，阅读定位 / 同义替换 / 时间。看完解析后独立重做错题，再选出最主要的 2 个失分原因。",
            55,
          ),
          task(
            date,
            "ielts-writing",
            "ielts",
            "写作套题｜Task 1 + Task 2 共 60 分钟",
            `Task 2 主题：${writingTopic}。全程计时，完成后用 10 分钟只查任务回应、段落逻辑、语法重复三项。`,
            70,
          ),
          task(
            date,
            "ielts-speaking",
            "ielts",
            `口语全套模拟｜${speakingTopic}`,
            "开启录音，按 Part 1—2—3 连续完成 12—14 分钟；不重录，结束后记录卡顿位置和重复词。",
            30,
          ),
        );
      } else {
        tasks.push(
          task(
            date,
            "ielts-listening",
            "ielts",
            "听力整套｜40 题限时完成",
            "完整做一套并誊写答案；复盘所有不确定题，把 3 句最难语音逐句听写到能跟读。",
            65,
          ),
          task(
            date,
            "ielts-reading",
            "ielts",
            "阅读整套｜60 分钟时间分配训练",
            "参考 15—18 / 20 / 22—25 分钟；单题约 1.5—2 分钟，每篇结束立即转场。做后看解析，再遮住答案独立复盘错题。",
            75,
          ),
          task(
            date,
            "ielts-writing",
            "ielts",
            index % 2 === 0 ? "写作精修｜重写一篇旧作文" : "写作限时｜Task 2 完整作文",
            index % 2 === 0
              ? "从旧作文中选失分最高的一篇，只重写开头、两个主题句和一个主体段；比较新旧版本差异。"
              : `题目：${writingTopic}。严格 40 分钟，写完后圈出 5 处可替换的重复表达。`,
            50,
          ),
          task(
            date,
            "ielts-speaking",
            "ielts",
            `口语压力训练｜${speakingTopic}`,
            "随机抽题后 10 秒内开口；训练被打断后继续表达，避免背稿腔，优先保证答案直接、自然、完整。",
            30,
          ),
          task(
            date,
            "ielts-vocab",
            "review",
            "错词回炉｜只复习最近三天的错词",
            "不增加新词；先闭卷写，再看错词。把仍然错的词各写一个短语搭配。",
            20,
            listeningWords,
          ),
        );
      }
    } else {
      tasks.push(
        task(
          date,
          "ielts-warm-listening",
          "ielts",
          "听力保温｜做最熟悉的 1 个 Section",
          "只做一组保持耳感，不追求难题；复听过去高频错的地图、数字、拼写或多人讨论片段。",
          30,
        ),
        task(
          date,
          "ielts-warm-reading",
          "ielts",
          "阅读保温｜1 篇 + 10 题",
          "选择熟悉题型，20 分钟收笔；只回顾定位与同义替换，不再大规模开新题。",
          30,
        ),
        task(
          date,
          "ielts-writing-review",
          "review",
          "写作收口｜模板骨架与个人错误清单",
          "默写 Task 1 概述句结构与 Task 2 四段结构；复查冠词、单复数、时态、主谓一致四类个人错误。",
          30,
        ),
        task(
          date,
          "ielts-speaking-review",
          "ielts",
          `口语保温｜${speakingTopic}`,
          "轻松聊 15—20 分钟，复习常用故事素材；不再死背新答案，保证语速、停顿与发音自然。",
          25,
        ),
        task(
          date,
          "ielts-logistics",
          "review",
          "考试准备｜证件、路线、作息与物品",
          "确认准考信息、出发时间与路线；准备证件和饮水，今晚提前停止刷题并按考试时间睡觉。",
          15,
        ),
      );
    }

    tasks.push(
      task(
        date,
        "cet6-maintenance",
        "cet6",
        "六级保温｜真题错词复测 + 1 段翻译",
        "原预设单词已取消。只复测你在六级真题中遇到的错词，再翻译 2—3 句中国文化或校园生活主题句。",
        20,
      ),
      task(
        date,
        "daily-review",
        "review",
        "收尾复盘｜记录三行即可",
        "写下：①今天最值钱的一个错误；②对应改法；③明天第一项从哪里开始。整理桌面后结束学习。",
        10,
      ),
    );

    if (weekend && stage.label !== "考前收束期" && stage.label !== "全真模考期") {
      tasks.push(
        task(
          date,
          "weekly-audit",
          "review",
          "周复盘｜统计正确率与完成率",
          "对照本周记录，统计听力、阅读正确率和写作/口语完成次数；下周只调整一个最关键短板。",
          25,
        ),
      );
    }

    return tasks;
  }

  function buildIeltsExamTasks(date) {
    return [
      task(
        date,
        "exam-check",
        "review",
        "出发前检查｜证件、时间、路线",
        "吃熟悉的早餐，检查证件与考试信息，预留充足交通时间；手机保持可联系但按要求存放。",
        10,
      ),
      task(
        date,
        "exam-warmup",
        "ielts",
        "轻量热身｜5 分钟英文输入 + 5 分钟开口",
        "听熟悉材料，不做新题；口头讲一个熟悉话题，只唤醒英语状态，不评判表现。",
        10,
      ),
      task(
        date,
        "exam-mindset",
        "review",
        "状态确认｜按训练节奏完成考试",
        "听力漏一题立刻放下；阅读按既定时间转场；写作先审题；口语直接回答、给原因和例子。",
        5,
      ),
      task(
        date,
        "exam-finish",
        "review",
        "考试结束｜不立即对答案",
        "记录考试体验和需要保留的英语习惯，然后休息。今天的任务是完成，不是反复回想。",
        10,
      ),
    ];
  }

  function buildCetTasks(date, index, stage) {
    const dateObject = fromDateKey(date);
    const weekend = dateObject.getDay() === 0 || dateObject.getDay() === 6;
    const localIndex = daysBetween("2026-10-28", date);
    const topic = cetTopics[localIndex % cetTopics.length];
    const tasks = [];

    if (stage.label === "六级能力重建") {
      tasks.push(
        task(
          date,
          "cet6-vocab",
          "cet6",
          "六级词汇｜真题错词主动回忆",
          "不再使用网页原来的预设词。第一轮复测最近真题错词，第二轮只看中文回忆英文，第三轮挑 6 词写搭配。",
          30,
        ),
        task(
          date,
          "cet6-listening",
          "cet6",
          `六级听力｜${localIndex % 2 === 0 ? "长对话 + 听力篇章" : "讲座 / 讲话"} 一组`,
          "读选项预测主题与词性，听时抓转折、因果和结论；复盘错误选项为什么具有迷惑性。",
          40,
        ),
        task(
          date,
          "cet6-reading",
          "cet6",
          `六级阅读｜${localIndex % 3 === 0 ? "选词填空" : localIndex % 3 === 1 ? "长篇匹配" : "仔细阅读"} 专项`,
          "严格按目标时间完成：选词 8 分钟、匹配 12 分钟、仔细阅读每篇 10 分钟；标出定位依据。",
          35,
        ),
        task(
          date,
          "cet6-output",
          "cet6",
          localIndex % 2 === 0 ? `写作｜${topic} 提纲 + 完整首段` : `翻译｜${topic} 主题段落`,
          localIndex % 2 === 0
            ? "5 分钟列出立场、两个理由和例子；写一个明确、有主题句的开头与主体段，避免空泛套话。"
            : "先切分意群、确定主干，再处理中国特色表达；完成后检查时态、冠词与单复数。",
          35,
        ),
        task(
          date,
          "shared-skill",
          "review",
          "雅思迁移｜整理 5 组同义替换",
          "从今天的听力或阅读中找 5 组“题干—原文”替换，保留雅思训练建立的定位能力。",
          15,
        ),
      );
    } else if (stage.label === "六级真题强化") {
      if (weekend || localIndex % 4 === 0) {
        tasks.push(
          task(
            date,
            "cet6-mock",
            "cet6",
            "六级真题模考｜完整一套",
            "按正式顺序和时间完成写作、听力、阅读、翻译；中途不查词、不暂停，答题卡留出誊写时间。",
            150,
          ),
          task(
            date,
            "cet6-mock-review",
            "review",
            "套题复盘｜计算各板块得分率",
            "听力按信号词复听，阅读标定位句，写译各找 3 处可改表达；最后确定下一次模考前的补练重点。",
            60,
          ),
          task(
            date,
            "cet6-words",
            "cet6",
            "真题词汇｜只背本套遇到的词",
            "从真题中筛选真正影响理解的 15—20 词，不抄生僻词；每词保留原句或搭配。",
            20,
          ),
        );
      } else {
        tasks.push(
          task(
            date,
            "cet6-vocab",
            "cet6",
            "六级词汇｜昨日错词复测 + 当天真题词",
            "只从六级真题中积累。先复测再学新词；把“认识但想不起来”的词也算错，晚间做一次 3 分钟快速回忆。",
            30,
          ),
          task(
            date,
            "cet6-listening",
            "cet6",
            "六级听力｜半套限时 + 逐题复盘",
            "听前 20 秒扫选项并划差异；听后不只核答案，要为每题写出一个决定答案的声音证据。",
            45,
          ),
          task(
            date,
            "cet6-reading",
            "cet6",
            "六级阅读｜长篇匹配 + 仔细阅读",
            "先做仔细阅读再做匹配，训练定位与时间分配；完成后整理题干与原文同义替换。",
            50,
          ),
          task(
            date,
            "cet6-writing",
            "cet6",
            localIndex % 2 === 0 ? `六级写作｜${topic}` : `六级翻译｜${topic}`,
            localIndex % 2 === 0
              ? "30 分钟完整成文；开头直接回应题目，每段只讲一个理由，结尾给具体行动或总结。"
              : "30 分钟完成并精修；先保证句子正确和信息完整，再替换重复词与简单句。",
            40,
          ),
          task(
            date,
            "cet6-review",
            "review",
            "错题闭环｜重做今天最难的 5 题",
            "合上答案重新完成；如果仍错，写出判断步骤，而不是只记录正确选项。",
            20,
          ),
        );
      }
    } else {
      tasks.push(
        task(
          date,
          "cet6-sprint-listening",
          "cet6",
          "听力冲刺｜高频错题 20 题",
          "混合长对话、篇章和讲座；重点复听转折后、问答后、例子后的答案位置。",
          35,
        ),
        task(
          date,
          "cet6-sprint-reading",
          "cet6",
          "阅读冲刺｜按固定顺序完成半套",
          "使用考试顺序：仔细阅读 → 长篇匹配 → 选词填空；到点立即停笔，稳定取舍策略。",
          40,
        ),
        task(
          date,
          "cet6-sprint-output",
          "cet6",
          `写译收口｜${topic}`,
          "默写个人写作骨架与翻译连接表达，再完成一个主体段和 5 句翻译；不再背全新模板。",
          35,
        ),
        task(
          date,
          "cet6-sprint-words",
          "review",
          "词汇收口｜高频错词 20 个",
          "只复习错词表，按“能否在 3 秒内反应”判断掌握；仍不熟的词放入考前最后清单。",
          20,
        ),
        task(
          date,
          "cet6-sprint-routine",
          "review",
          "考试流程｜答题顺序与时间口令",
          "口头复述每部分结束时间、涂卡节点与放弃规则；确认耳机、电池、证件和路线。",
          15,
        ),
      );
    }

    tasks.push(
      task(
        date,
        "daily-review",
        "review",
        "每日收尾｜错题归因 + 明日启动点",
        "错题按词汇、定位、语音、逻辑、时间五类归因；给明天写下一个可以直接开始的动作。",
        10,
      ),
    );

    return tasks;
  }

  function buildCetExamTasks(date) {
    return [
      task(
        date,
        "cet-exam-check",
        "review",
        "出发检查｜证件、耳机、电池、文具",
        "提前测试听力设备，吃熟悉的食物并预留交通时间；确认考场与入场时间。",
        10,
      ),
      task(
        date,
        "cet-exam-warmup",
        "cet6",
        "轻量热身｜看写作骨架与翻译连接词",
        "只看一页个人清单，不做整套题；听 5 分钟熟悉材料，让注意力进入英语频道。",
        10,
      ),
      task(
        date,
        "cet-exam-rules",
        "review",
        "考场口令｜按计划分配时间",
        "写作先提纲；听力边听边选并及时涂卡；阅读优先高分题；翻译先保主干正确。",
        5,
      ),
      task(
        date,
        "cet-exam-finish",
        "review",
        "完成六级考试｜给备考季画句号",
        "考试结束后不反复对答案。吃顿喜欢的饭，记录这段时间真正养成的能力。",
        10,
      ),
    ];
  }

  function getStage(date) {
    return (
      stageDefinitions.find((item) => date >= item.start && date <= item.end) ||
      stageDefinitions[0]
    );
  }

  function buildAllTasks() {
    const dates = enumerateDates(CONFIG.start, CONFIG.cet6);
    const base = dates.flatMap((date, index) => {
      const stage = getStage(date);
      if (date === CONFIG.ielts) return buildIeltsExamTasks(date);
      if (date === CONFIG.cet6) return buildCetExamTasks(date);
      if (date < CONFIG.ielts) return buildIeltsTasks(date, index, stage);
      return buildCetTasks(date, index, stage);
    });

    const custom = state.customTasks.map((item) => ({
      ...item,
      custom: true,
      detail: item.detail || "你添加的自定义任务。",
      words: [],
    }));

    allTasks = [...base, ...custom];
    applyRollover();
  }

  function applyRollover() {
    let moved = 0;
    allTasks.forEach((item) => {
      const done = Boolean(state.completions[item.id]);
      const effectiveDate = state.moves[item.id] || item.originalDate;
      if (!done && effectiveDate < TODAY) {
        state.moves[item.id] = TODAY;
        moved += 1;
      }
    });
    if (moved > 0) {
      saveState();
      window.setTimeout(() => {
        showToast(`已把 ${moved} 项未完成任务顺延到今天`);
      }, 500);
    }
  }

  function effectiveDate(taskItem) {
    return state.moves[taskItem.id] || taskItem.originalDate;
  }

  function tasksForDate(date) {
    return allTasks.filter((item) => effectiveDate(item) === date);
  }

  function isDone(taskItem) {
    return Boolean(state.completions[taskItem.id]);
  }

  function progressForDate(date) {
    const tasks = tasksForDate(date);
    const completed = tasks.filter(isDone).length;
    return {
      total: tasks.length,
      completed,
      percent: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
      minutes: tasks.reduce((sum, item) => sum + (item.minutes || 0), 0),
      completedMinutes: tasks
        .filter(isDone)
        .reduce((sum, item) => sum + (item.minutes || 0), 0),
    };
  }

  function cacheDom() {
    [
      "todayEyebrow",
      "heroIntro",
      "todayProgressRing",
      "todayProgressValue",
      "todayDoneCount",
      "todayTaskCount",
      "todayMinutes",
      "overallFlightFill",
      "flightPlane",
      "ieltsCountdown",
      "cetCountdown",
      "streakValue",
      "vocabDateLabel",
      "wordPlayer",
      "dictationMode",
      "vocabSourceLabel",
      "wordPosition",
      "heroWord",
      "wordMeaning",
      "wordHint",
      "vocabMasteredCount",
      "vocabTotalCount",
      "vocabProgressBar",
      "previousWord",
      "playCurrentWord",
      "spellCurrentWord",
      "nextWord",
      "playWordSequence",
      "vocabModeTitle",
      "resetVocabMastery",
      "wordQueue",
      "dateRail",
      "previousDay",
      "nextDay",
      "todayButton",
      "selectedWeekday",
      "stagePill",
      "selectedDateTitle",
      "selectedDateSummary",
      "completeAllButton",
      "selectedProgressLabel",
      "selectedProgressBar",
      "selectedProgressHint",
      "filterRow",
      "carryCount",
      "taskList",
      "addTaskForm",
      "newTaskInput",
      "newTaskCategory",
      "dailyNotes",
      "notesSavedState",
      "timerDisplay",
      "timerCaption",
      "timerToggle",
      "timerReset",
      "weekBars",
      "weekProgress",
      "weekMessage",
      "dailyTactic",
      "taskEstimate",
      "phaseLabel",
      "installButton",
      "importButton",
      "importFileInput",
      "exportButton",
      "resetButton",
      "toast",
      "networkStatus",
      "celebration",
    ].forEach((id) => {
      dom[id] = document.getElementById(id);
    });
  }

  function renderAll() {
    renderHero();
    renderFlight();
    renderVocabLab();
    renderDateRail();
    renderSelectedDay();
    renderWeek();
  }

  function renderHero() {
    const now = fromDateKey(TODAY);
    const todayProgress = progressForDate(TODAY);
    const angle = todayProgress.percent * 3.6;
    dom.todayEyebrow.textContent = `${englishWeek[now.getDay()]} · ${String(now.getDate()).padStart(2, "0")} ${englishMonths[now.getMonth()]}`;
    dom.todayProgressValue.textContent = `${todayProgress.percent}%`;
    dom.todayDoneCount.textContent = todayProgress.completed;
    dom.todayTaskCount.textContent = todayProgress.total;
    dom.todayMinutes.textContent = todayProgress.minutes;
    dom.todayProgressRing.style.setProperty("--progress", `${angle}deg`);
    dom.todayProgressRing.querySelector(".orbit-dot").style.setProperty("--angle", `${angle}deg`);

    const carried = tasksForDate(TODAY).filter((item) => item.originalDate < TODAY && !isDone(item)).length;
    if (TODAY === CONFIG.ielts) {
      dom.heroIntro.textContent = "今天是雅思考试日。相信已经练过的节奏，稳稳完成每一个部分。";
    } else if (TODAY === CONFIG.cet6) {
      dom.heroIntro.textContent = "今天是六级考试日。带着这 83 天积累的节奏，完成最后一程。";
    } else if (carried > 0) {
      dom.heroIntro.textContent = `今天有 ${carried} 项顺延任务。先清最短的一项，再进入原计划。`;
    } else {
      dom.heroIntro.textContent = "你的任务已经按冲刺阶段拆好。先完成今天，不和整座山较劲。";
    }
  }

  function renderFlight() {
    const totalDays = daysBetween(CONFIG.start, CONFIG.cet6);
    const elapsedDays = Math.max(0, Math.min(totalDays, daysBetween(CONFIG.start, TODAY)));
    const timeProgress = (elapsedDays / totalDays) * 100;
    const allAssigned = allTasks.filter((item) => item.originalDate <= TODAY);
    const completed = allAssigned.filter(isDone).length;
    const completionProgress = allAssigned.length ? (completed / allAssigned.length) * 100 : 0;
    const visualProgress = Math.max(1, Math.min(100, timeProgress * 0.35 + completionProgress * 0.65));

    dom.overallFlightFill.style.width = `${visualProgress}%`;
    dom.flightPlane.style.left = `${visualProgress}%`;
    dom.ieltsCountdown.textContent = Math.max(0, daysBetween(TODAY, CONFIG.ielts));
    dom.cetCountdown.textContent = Math.max(0, daysBetween(TODAY, CONFIG.cet6));
    dom.streakValue.textContent = calculateStreak();
  }

  function getVocabSet(date = runtime.selectedDate, mode = runtime.vocabMode) {
    return getVocabPlan(date, mode).entries;
  }

  function vocabMasteryKey(entry) {
    return entry?.id || `term:${entry?.term || "unknown"}`;
  }

  function isVocabMastered(entry) {
    return Boolean(state.vocabMastery[vocabMasteryKey(entry)]);
  }

  function renderVocabLab() {
    const plan = getVocabPlan();
    const words = plan.entries;
    runtime.vocabIndex = Math.max(0, Math.min(Math.max(0, words.length - 1), runtime.vocabIndex));
    const currentEntry = words[runtime.vocabIndex] || {
      term: "暂无词汇",
      meaning: "",
      source: plan.label,
    };
    const currentWord = currentEntry.term;
    const dictation = dom.dictationMode.checked;
    const selectedDate = fromDateKey(runtime.selectedDate);
    const masteredCount = words.filter(isVocabMastered).length;
    const modeLabels = {
      scene: "场景高频",
      jijing: "机经词汇",
      review: "错词点听",
    };

    dom.vocabDateLabel.textContent = `${String(selectedDate.getMonth() + 1).padStart(2, "0")}.${String(selectedDate.getDate()).padStart(2, "0")}`;
    dom.vocabSourceLabel.textContent = plan.label;
    dom.wordPosition.textContent = `WORD ${String(runtime.vocabIndex + 1).padStart(2, "0")} / ${String(words.length).padStart(2, "0")}`;
    dom.heroWord.textContent = dictation ? "••••••" : currentWord;
    dom.wordMeaning.textContent = dictation ? "词义已隐藏，听写后关闭开关核对" : currentEntry.meaning || "来自你的听力材料";
    dom.heroWord.setAttribute(
      "aria-label",
      dictation ? "播放当前隐藏单词" : `播放单词 ${currentWord}`,
    );
    dom.wordHint.textContent = dictation
      ? "单词已隐藏：先听写，完成后关闭听写模式核对"
      : runtime.vocabMode === "scene"
        ? "场景高频：先把声音和具体场景绑定，再拼写"
        : runtime.vocabMode === "jijing"
          ? "机经词汇：按真题回忆词训练快速声音反应"
          : "错词点听：隐藏单词，只凭声音写出答案";
    dom.wordPlayer.classList.toggle("is-dictation", dictation);
    dom.vocabMasteredCount.textContent = masteredCount;
    dom.vocabTotalCount.textContent = words.length;
    dom.vocabProgressBar.style.width = `${words.length ? (masteredCount / words.length) * 100 : 0}%`;
    dom.vocabModeTitle.textContent = `${modeLabels[runtime.vocabMode] || "听力词汇"} · ${words.length} 词`;
    dom.playWordSequence.innerHTML = runtime.speakingSequence
      ? '<span aria-hidden="true">■</span> 停止连播'
      : `<span aria-hidden="true">▶</span> 连播今日 ${words.length} 词`;

    document.querySelectorAll("[data-vocab-mode]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.vocabMode === runtime.vocabMode);
    });

    dom.wordQueue.innerHTML = words
      .map((entry, index) => {
        const mastered = isVocabMastered(entry);
        const displayedWord = dictation ? `单词 ${String(index + 1).padStart(2, "0")}` : entry.term;
        return `
          <div class="queue-word ${index === runtime.vocabIndex ? "is-current" : ""} ${mastered ? "is-mastered" : ""}" data-word-index="${index}">
            <button class="queue-word__select" type="button" data-word-play="${index}" aria-label="播放${dictation ? `第 ${index + 1} 个单词` : `单词 ${escapeHtml(entry.term)}`}">
              <span class="queue-word__number">${String(index + 1).padStart(2, "0")}</span>
              <span class="queue-word__text">${escapeHtml(displayedWord)}</span>
            </button>
            <button class="queue-word__master" type="button" data-word-master="${index}" aria-label="${mastered ? "取消掌握" : "标记已掌握"}：${escapeHtml(entry.term)}">✓</button>
          </div>
        `;
      })
      .join("");

    // 不在打开页面时批量请求在线词典音频：这样手机离线打开不会产生 15 个失败请求，
    // 也避免首次进入词汇模块就消耗流量。点击单词时再按需获取发音，失败后使用浏览器英式 TTS。
  }

  function stopVocabSpeech({ rerender = true } = {}) {
    runtime.speechToken += 1;
    runtime.speakingSequence = false;
    if (runtime.activeAudio) {
      runtime.activeAudio.pause();
      runtime.activeAudio.currentTime = 0;
      runtime.activeAudio = null;
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    dom.wordPlayer.classList.remove("is-speaking");
    if (rerender) renderVocabLab();
  }

  async function getRecordedPronunciation(word) {
    const normalized = word.toLowerCase().trim();
    if (pronunciationCache.has(normalized)) {
      return pronunciationCache.get(normalized);
    }

    const request = fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(normalized)}`,
    )
      .then((response) => {
        if (!response.ok) throw new Error("dictionary audio unavailable");
        return response.json();
      })
      .then((entries) => {
        const phonetics = entries.flatMap((entry) => entry.phonetics || []);
        const preferred =
          phonetics.find((item) => item.audio && /-uk\.mp3|_gb_|uk_/i.test(item.audio)) ||
          phonetics.find((item) => item.audio);
        if (!preferred?.audio) return "";
        return preferred.audio.startsWith("//") ? `https:${preferred.audio}` : preferred.audio;
      })
      .catch(() => "");

    pronunciationCache.set(normalized, request);
    return request;
  }

  function createUtterance(text, { spelling = false } = {}) {
    const spokenText = spelling ? text.split("").join(" ") : text;
    const utterance = new SpeechSynthesisUtterance(spokenText);
    const voices = window.speechSynthesis.getVoices();
    utterance.voice =
      voices.find((voice) => /^en-GB/i.test(voice.lang)) ||
      voices.find((voice) => /^en/i.test(voice.lang)) ||
      null;
    utterance.lang = utterance.voice?.lang || "en-GB";
    utterance.rate = spelling ? 0.56 : runtime.speechRate;
    utterance.pitch = 1;
    return utterance;
  }

  function playWithBrowserVoice(word, token, { spelling = false } = {}) {
    return new Promise((resolve, reject) => {
      if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
        reject(new Error("speech synthesis unavailable"));
        return;
      }
      const utterance = createUtterance(word, { spelling });
      utterance.onstart = () => {
        if (token === runtime.speechToken) dom.wordPlayer.classList.add("is-speaking");
      };
      utterance.onend = () => {
        if (token === runtime.speechToken) dom.wordPlayer.classList.remove("is-speaking");
        resolve();
      };
      utterance.onerror = (event) => {
        dom.wordPlayer.classList.remove("is-speaking");
        reject(event);
      };
      window.speechSynthesis.speak(utterance);
    });
  }

  async function playWithRecordedAudio(word, token, { spelling = false } = {}) {
    const url = await getRecordedPronunciation(word);
    if (!url || token !== runtime.speechToken) throw new Error("recorded audio unavailable");

    await new Promise((resolve, reject) => {
      const audio = new Audio(url);
      runtime.activeAudio = audio;
      audio.preload = "auto";
      audio.playbackRate = spelling ? 0.76 : Math.max(0.75, Math.min(1.15, runtime.speechRate));
      audio.onplay = () => {
        if (token === runtime.speechToken) dom.wordPlayer.classList.add("is-speaking");
      };
      audio.onended = () => {
        if (runtime.activeAudio === audio) runtime.activeAudio = null;
        if (token === runtime.speechToken) dom.wordPlayer.classList.remove("is-speaking");
        resolve();
      };
      audio.onerror = (event) => {
        if (runtime.activeAudio === audio) runtime.activeAudio = null;
        dom.wordPlayer.classList.remove("is-speaking");
        reject(event);
      };
      audio.play().catch(reject);
    });
  }

  async function playPronunciation(word, token, { spelling = false } = {}) {
    if (spelling) {
      try {
        await playWithBrowserVoice(word, token, { spelling: true });
        return;
      } catch {
        if (token !== runtime.speechToken) return;
        dom.wordHint.textContent = word.toUpperCase().split("").join(" · ");
      }
    }

    try {
      await playWithRecordedAudio(word, token, { spelling });
      return;
    } catch {
      if (token !== runtime.speechToken) return;
    }

    await playWithBrowserVoice(word, token, { spelling });
  }

  async function speakVocabWord(index = runtime.vocabIndex, { spelling = false } = {}) {
    stopVocabSpeech({ rerender: false });
    const words = getVocabSet();
    if (!words.length) return;
    runtime.vocabIndex = Math.max(0, Math.min(words.length - 1, index));
    const token = runtime.speechToken;
    renderVocabLab();
    try {
      await playPronunciation(words[runtime.vocabIndex].term, token, { spelling });
    } catch {
      if (token === runtime.speechToken) {
        dom.wordPlayer.classList.remove("is-speaking");
        showToast("暂时无法取得发音，请检查网络后重试");
      }
    }
  }

  function playVocabSequence() {
    if (runtime.speakingSequence) {
      stopVocabSpeech();
      return;
    }
    stopVocabSpeech({ rerender: false });
    runtime.speakingSequence = true;
    const words = getVocabSet();
    const token = runtime.speechToken;

    const playAt = async (index) => {
      if (!runtime.speakingSequence || token !== runtime.speechToken) return;
      if (index >= words.length) {
        runtime.speakingSequence = false;
        dom.wordPlayer.classList.remove("is-speaking");
        renderVocabLab();
        showToast(`今日 ${words.length} 词连播完成`);
        return;
      }

      runtime.vocabIndex = index;
      renderVocabLab();
      try {
        await playPronunciation(words[index].term, token);
        if (token === runtime.speechToken) playAt(index + 1);
      } catch {
        if (token === runtime.speechToken) {
          runtime.speakingSequence = false;
          dom.wordPlayer.classList.remove("is-speaking");
          renderVocabLab();
          showToast("连播中断，请检查网络后重新开始");
        }
      }
    };

    renderVocabLab();
    playAt(0);
  }

  function calculateStreak() {
    let streak = 0;
    let cursor = TODAY;
    const todayProgress = progressForDate(cursor);
    if (todayProgress.percent < 100) cursor = addDays(cursor, -1);
    while (cursor >= CONFIG.start) {
      const progress = progressForDate(cursor);
      if (!progress.total || progress.percent < 100) break;
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    return streak;
  }

  function renderDateRail() {
    const dates = enumerateDates(CONFIG.start, CONFIG.cet6);
    dom.dateRail.innerHTML = dates
      .map((key) => {
        const date = fromDateKey(key);
        const progress = progressForDate(key);
        const classes = [
          "date-pill",
          key === runtime.selectedDate ? "is-selected" : "",
          key === TODAY ? "is-today" : "",
          progress.total > 0 && progress.percent === 100 ? "is-complete" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const marker =
          key === CONFIG.ielts ? "雅思" : key === CONFIG.cet6 ? "六级" : `${date.getMonth() + 1}月`;
        return `
          <button class="${classes}" type="button" data-date="${key}" aria-label="${date.getMonth() + 1}月${date.getDate()}日，完成 ${progress.percent}%">
            <small>${weekShort[date.getDay()]}</small>
            <strong>${date.getDate()}</strong>
            <span>${marker}</span>
          </button>
        `;
      })
      .join("");

    const selected = dom.dateRail.querySelector(`[data-date="${runtime.selectedDate}"]`);
    if (selected) {
      window.requestAnimationFrame(() => {
        const targetLeft =
          selected.offsetLeft - dom.dateRail.clientWidth / 2 + selected.clientWidth / 2;
        dom.dateRail.scrollTo({
          left: Math.max(0, targetLeft),
          behavior: "smooth",
        });
      });
    }
  }

  function renderSelectedDay() {
    const date = fromDateKey(runtime.selectedDate);
    const stage = getStage(runtime.selectedDate);
    const tasks = tasksForDate(runtime.selectedDate);
    const progress = progressForDate(runtime.selectedDate);
    const carried = tasks.filter((item) => item.originalDate < runtime.selectedDate);

    dom.selectedWeekday.textContent = weekNames[date.getDay()];
    dom.stagePill.textContent = stage.label;
    dom.selectedDateTitle.textContent = `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
    dom.selectedDateSummary.textContent = stage.summary;
    dom.selectedProgressLabel.textContent = `${progress.percent}%`;
    dom.selectedProgressBar.style.width = `${progress.percent}%`;
    dom.selectedProgressHint.textContent = getProgressHint(progress.percent, carried.length);
    dom.carryCount.textContent = carried.length;
    dom.completeAllButton.textContent = progress.total > 0 && progress.percent === 100 ? "取消全选" : "全部打勾";
    dom.dailyNotes.value = state.notes[runtime.selectedDate] || "";
    dom.dailyTactic.textContent = tactics[daysBetween(CONFIG.start, runtime.selectedDate) % tactics.length];
    dom.taskEstimate.textContent = `预计 ${formatDuration(progress.minutes)}`;
    dom.phaseLabel.textContent = stage.phase;
    renderTasks(tasks);
  }

  function renderTasks(tasks) {
    const filtered = tasks.filter((item) => {
      if (runtime.filter === "all") return true;
      if (runtime.filter === "carry") return item.originalDate < runtime.selectedDate;
      return item.category === runtime.filter;
    });

    if (filtered.length === 0) {
      dom.taskList.innerHTML = `
        <div class="empty-state">
          <strong>这个筛选下暂时没有任务</strong>
          <p>切回“全部”，或者给自己添加一项小任务。</p>
        </div>
      `;
      return;
    }

    dom.taskList.innerHTML = filtered
      .map((item) => {
        const done = isDone(item);
        const carriedDays = Math.max(0, daysBetween(item.originalDate, runtime.selectedDate));
        const classNames = [
          "task-item",
          done ? "is-complete" : "",
          carriedDays > 0 ? "is-carried" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const categoryLabel =
          item.category === "ielts" ? "IELTS" : item.category === "cet6" ? "CET-6" : "REVIEW";
        const wordList =
          item.words && item.words.length
            ? `<div class="word-list">${item.words
                .map((word) => `<span>${escapeHtml(word)}</span>`)
                .join("")}</div>`
            : "";
        const resourceBlock = (Array.isArray(item.resource) ? item.resource : item.resource ? [item.resource] : [])
          .filter((resource) => resource?.url)
          .map((resource) => `
              <div class="task-audio">
                <div>
                  <span>${escapeHtml(resource.level || "听力")} 训练音频</span>
                  <strong>${escapeHtml(resource.title || "播放听写材料")}</strong>
                </div>
                <audio controls preload="none" src="${escapeHtml(resource.url)}">
                  当前浏览器不支持音频播放。
                </audio>
              </div>
            `).join("");
        return `
          <article class="${classNames}" data-category="${item.category}" data-task-id="${item.id}">
            <label class="task-check">
              <input type="checkbox" ${done ? "checked" : ""} aria-label="完成：${escapeHtml(item.title)}" />
              <span aria-hidden="true"></span>
            </label>
            <div class="task-main">
              <div class="task-tags">
                <span class="task-tag">${categoryLabel}</span>
                ${carriedDays > 0 ? `<span class="carry-badge">从 ${formatShortDate(item.originalDate)} 顺延 ${carriedDays} 天</span>` : ""}
              </div>
              <p class="task-title">${escapeHtml(item.title)}</p>
              <p class="task-detail">${escapeHtml(item.detail)}</p>
              ${wordList}
              ${resourceBlock}
            </div>
            ${
              item.custom
                ? `<button class="task-delete" type="button" data-delete-task="${item.id}" aria-label="删除自定义任务">×</button>`
                : `<span class="task-time">${item.minutes} min</span>`
            }
          </article>
        `;
      })
      .join("");
  }

  function getProgressHint(percent, carriedCount) {
    if (percent === 100) return "今日清单已全部完成。收好成果，安心休息。";
    if (carriedCount > 0 && percent < 25) return `先处理 ${carriedCount} 项顺延任务里最短的一项，减轻心理负担。`;
    if (percent === 0) return "完成第一项，给今天一个漂亮的开头。";
    if (percent < 50) return "节奏已经启动。下一项只管开始五分钟。";
    if (percent < 80) return "已经过半，休息一下，再完成一个关键模块。";
    return "只差最后一点，把今天完整地收好。";
  }

  function formatShortDate(key) {
    const date = fromDateKey(key);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  function formatDuration(minutes) {
    if (minutes < 60) return `${minutes} 分钟`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours} 小时 ${remainder} 分` : `${hours} 小时`;
  }

  function renderWeek() {
    const selected = fromDateKey(runtime.selectedDate);
    const mondayOffset = selected.getDay() === 0 ? -6 : 1 - selected.getDay();
    const monday = addDays(runtime.selectedDate, mondayOffset);
    const weekDates = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
    let total = 0;
    let completed = 0;

    dom.weekBars.innerHTML = weekDates
      .map((key, index) => {
        const progress =
          key >= CONFIG.start && key <= CONFIG.cet6
            ? progressForDate(key)
            : { total: 0, completed: 0, percent: 0 };
        total += progress.total;
        completed += progress.completed;
        return `
          <div class="week-day ${key === TODAY ? "is-today" : ""}" title="${formatShortDate(key)}：${progress.percent}%">
            <div class="week-day__track">
              <span class="week-day__fill" style="height: ${Math.max(4, progress.percent)}%"></span>
            </div>
            <span>${["一", "二", "三", "四", "五", "六", "日"][index]}</span>
          </div>
        `;
      })
      .join("");

    const percent = total ? Math.round((completed / total) * 100) : 0;
    dom.weekProgress.textContent = `${percent}%`;
    dom.weekMessage.textContent =
      percent >= 90
        ? "本周节奏非常稳定，注意留出恢复时间。"
        : percent >= 60
          ? "本周正在成形，把未完成任务逐个收口。"
          : "不用追求完美，先让节奏连续起来。";
  }

  function bindEvents() {
    document.querySelector(".brand").addEventListener("click", (event) => {
      event.preventDefault();
      selectDate(TODAY);
    });

    document.querySelector(".vocab-mode-switch").addEventListener("click", (event) => {
      const button = event.target.closest("[data-vocab-mode]");
      if (!button) return;
      stopVocabSpeech({ rerender: false });
      runtime.vocabMode = button.dataset.vocabMode;
      runtime.vocabIndex = 0;
      renderVocabLab();
    });

    dom.dictationMode.addEventListener("change", () => {
      renderVocabLab();
      if (dom.dictationMode.checked) {
        showToast("听写模式已开启：先听，再写，最后关闭开关核对");
      }
    });

    dom.heroWord.addEventListener("click", () => speakVocabWord());
    dom.playCurrentWord.addEventListener("click", () => speakVocabWord());
    dom.spellCurrentWord.addEventListener("click", () =>
      speakVocabWord(runtime.vocabIndex, { spelling: true }),
    );
    dom.previousWord.addEventListener("click", () => {
      stopVocabSpeech({ rerender: false });
      const words = getVocabSet();
      runtime.vocabIndex = (runtime.vocabIndex - 1 + words.length) % words.length;
      renderVocabLab();
    });
    dom.nextWord.addEventListener("click", () => {
      stopVocabSpeech({ rerender: false });
      const words = getVocabSet();
      runtime.vocabIndex = (runtime.vocabIndex + 1) % words.length;
      renderVocabLab();
    });
    dom.playWordSequence.addEventListener("click", playVocabSequence);

    document.querySelector(".speech-rate").addEventListener("click", (event) => {
      const button = event.target.closest("[data-speech-rate]");
      if (!button) return;
      runtime.speechRate = Number(button.dataset.speechRate);
      document.querySelectorAll("[data-speech-rate]").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
      showToast(`发音语速已调整为 ${runtime.speechRate}×`);
    });

    dom.wordQueue.addEventListener("click", (event) => {
      const masteryButton = event.target.closest("[data-word-master]");
      if (masteryButton) {
        const index = Number(masteryButton.dataset.wordMaster);
        const word = getVocabSet()[index];
        if (!word) return;
        const key = vocabMasteryKey(word);
        if (state.vocabMastery[key]) {
          delete state.vocabMastery[key];
        } else {
          state.vocabMastery[key] = {
            masteredAt: new Date().toISOString(),
          };
        }
        saveState();
        renderVocabLab();
        return;
      }

      const playButton = event.target.closest("[data-word-play]");
      if (playButton) {
        runtime.vocabIndex = Number(playButton.dataset.wordPlay);
        speakVocabWord(runtime.vocabIndex);
      }
    });

    dom.resetVocabMastery.addEventListener("click", () => {
      const words = getVocabSet();
      words.forEach((word) => {
        delete state.vocabMastery[vocabMasteryKey(word)];
      });
      saveState();
      renderVocabLab();
      showToast("本组掌握状态已清空，可以重新听写");
    });

    dom.dateRail.addEventListener("click", (event) => {
      const button = event.target.closest("[data-date]");
      if (button) selectDate(button.dataset.date);
    });

    dom.previousDay.addEventListener("click", () => {
      selectDate(clampDateKey(addDays(runtime.selectedDate, -1), CONFIG.start, CONFIG.cet6));
    });

    dom.nextDay.addEventListener("click", () => {
      selectDate(clampDateKey(addDays(runtime.selectedDate, 1), CONFIG.start, CONFIG.cet6));
    });

    dom.todayButton.addEventListener("click", () => selectDate(TODAY));

    dom.filterRow.addEventListener("click", (event) => {
      const button = event.target.closest("[data-filter]");
      if (!button) return;
      runtime.filter = button.dataset.filter;
      dom.filterRow.querySelectorAll("[data-filter]").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
      renderSelectedDay();
    });

    dom.taskList.addEventListener("change", (event) => {
      const checkbox = event.target.closest('input[type="checkbox"]');
      if (!checkbox) return;
      const itemElement = checkbox.closest("[data-task-id]");
      const taskId = itemElement.dataset.taskId;
      const before = progressForDate(runtime.selectedDate).percent;
      if (checkbox.checked) {
        state.completions[taskId] = {
          done: true,
          completedAt: new Date().toISOString(),
        };
      } else {
        delete state.completions[taskId];
        const taskItem = allTasks.find((item) => item.id === taskId);
        if (taskItem && effectiveDate(taskItem) < TODAY) {
          state.moves[taskId] = TODAY;
        }
      }
      saveState();
      const after = progressForDate(runtime.selectedDate).percent;
      if (after === 100 && before !== 100) {
        celebrate();
        showToast("今日清单全清！这一天被你稳稳拿下了。");
      }
      renderAll();
    });

    dom.taskList.addEventListener("click", (event) => {
      const deleteButton = event.target.closest("[data-delete-task]");
      if (!deleteButton) return;
      const taskId = deleteButton.dataset.deleteTask;
      state.customTasks = state.customTasks.filter((item) => item.id !== taskId);
      delete state.completions[taskId];
      delete state.moves[taskId];
      saveState();
      buildAllTasks();
      renderAll();
      showToast("已删除自定义任务");
    });

    dom.completeAllButton.addEventListener("click", () => {
      const tasks = tasksForDate(runtime.selectedDate);
      const allDone = tasks.length > 0 && tasks.every(isDone);
      tasks.forEach((item) => {
        if (allDone) {
          delete state.completions[item.id];
        } else {
          state.completions[item.id] = {
            done: true,
            completedAt: new Date().toISOString(),
          };
        }
      });
      saveState();
      if (!allDone && tasks.length) {
        celebrate();
        showToast("这一日全部完成，漂亮！");
      }
      renderAll();
    });

    dom.addTaskForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const title = dom.newTaskInput.value.trim();
      if (!title) {
        dom.newTaskInput.focus();
        return;
      }
      const id = `${runtime.selectedDate}-custom-${Date.now()}`;
      state.customTasks.push({
        id,
        originalDate: runtime.selectedDate,
        category: dom.newTaskCategory.value,
        title,
        detail: "你添加的自定义任务。",
        minutes: 20,
        custom: true,
      });
      saveState();
      dom.newTaskInput.value = "";
      buildAllTasks();
      renderAll();
      showToast("已添加到当天清单");
    });

    let notesTimer;
    dom.dailyNotes.addEventListener("input", () => {
      dom.notesSavedState.textContent = "保存中…";
      window.clearTimeout(notesTimer);
      notesTimer = window.setTimeout(() => {
        state.notes[runtime.selectedDate] = dom.dailyNotes.value;
        saveState();
        dom.notesSavedState.textContent = "已保存";
      }, 350);
    });

    document.querySelector(".timer-presets").addEventListener("click", (event) => {
      const button = event.target.closest("[data-minutes]");
      if (!button) return;
      stopTimer();
      runtime.timerPreset = Number(button.dataset.minutes);
      runtime.timerSeconds = runtime.timerPreset * 60;
      document.querySelectorAll(".timer-presets [data-minutes]").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
      updateTimerDisplay();
    });

    dom.timerToggle.addEventListener("click", () => {
      if (runtime.timerRunning) {
        stopTimer();
      } else {
        startTimer();
      }
    });

    dom.timerReset.addEventListener("click", () => {
      stopTimer();
      runtime.timerSeconds = runtime.timerPreset * 60;
      updateTimerDisplay();
    });

    dom.exportButton.addEventListener("click", exportProgress);
    dom.resetButton.addEventListener("click", resetProgress);
    dom.installButton.addEventListener("click", installOnPhone);
    dom.importButton.addEventListener("click", () => dom.importFileInput.click());
    dom.importFileInput.addEventListener("change", importProgress);

    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        dom.newTaskInput.focus();
      }
    });

    document.querySelectorAll("[data-mobile-nav]").forEach((link) => {
      link.addEventListener("click", () => {
        runtime.mobileNavTarget = link.dataset.mobileNav;
        runtime.mobileNavLockUntil = Date.now() + 800;
        document.querySelectorAll("[data-mobile-nav]").forEach((item) => {
          item.classList.toggle("is-active", item === link);
        });
        window.setTimeout(() => {
          window.dispatchEvent(new Event("scroll"));
        }, 850);
      });
    });
  }

  function setupMobileExperience() {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    const mobileDevice = window.matchMedia("(max-width: 720px)").matches;

    if (mobileDevice && !standalone) {
      dom.installButton.classList.add("is-available");
    }

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      runtime.deferredInstallPrompt = event;
      dom.installButton.classList.add("is-available");
    });

    window.addEventListener("appinstalled", () => {
      runtime.deferredInstallPrompt = null;
      dom.installButton.classList.remove("is-available");
      showToast("双考航线已安装到手机");
    });

    if ("serviceWorker" in navigator && /^https?:$/.test(window.location.protocol)) {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {
        // 静默回退：网页功能不依赖 Service Worker。
      });
    }

    window.addEventListener("online", () => {
      updateNetworkStatus();
      showToast("网络已恢复");
    });
    window.addEventListener("offline", () => {
      updateNetworkStatus();
      showToast("已进入离线模式，清单与已缓存内容仍可使用");
    });
    updateNetworkStatus();

    const navLinks = Array.from(document.querySelectorAll("[data-mobile-nav]"));
    const sections = navLinks
      .map((link) => document.getElementById(link.dataset.mobileNav))
      .filter(Boolean);
    let navFrame = null;
    const updateActiveMobileNav = () => {
      navFrame = null;
      if (Date.now() < runtime.mobileNavLockUntil) {
        navLinks.forEach((link) => {
          link.classList.toggle("is-active", link.dataset.mobileNav === runtime.mobileNavTarget);
        });
        return;
      }
      const marker = window.scrollY + window.innerHeight * 0.38;
      let activeSection = sections[0];
      const focusSection = sections[sections.length - 1];
      const focusRect = focusSection.getBoundingClientRect();
      const focusIsProminent =
        focusRect.top < window.innerHeight * 0.72 && focusRect.bottom > 68;
      const nearPageBottom =
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 80;
      if (nearPageBottom || focusIsProminent) {
        activeSection = focusSection;
      } else {
        sections.forEach((section) => {
          if (section.offsetTop <= marker) activeSection = section;
        });
      }
      navLinks.forEach((link) => {
        link.classList.toggle("is-active", link.dataset.mobileNav === activeSection.id);
      });
    };
    window.addEventListener(
      "scroll",
      () => {
        if (navFrame === null) navFrame = window.requestAnimationFrame(updateActiveMobileNav);
      },
      { passive: true },
    );
    updateActiveMobileNav();
  }

  async function installOnPhone() {
    if (runtime.deferredInstallPrompt) {
      runtime.deferredInstallPrompt.prompt();
      await runtime.deferredInstallPrompt.userChoice;
      runtime.deferredInstallPrompt = null;
      dom.installButton.classList.remove("is-available");
      return;
    }

    const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    showToast(
      isiOS
        ? "iPhone：点 Safari 的分享按钮，再选“添加到主屏幕”"
        : "打开浏览器菜单，选择“添加到主屏幕”或“安装应用”",
    );
  }

  async function importProgress(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const content = await file.text();
      const payload = JSON.parse(content);
      const importedState = payload?.state || payload;
      if (
        !importedState ||
        typeof importedState !== "object" ||
        !importedState.completions ||
        !importedState.moves
      ) {
        throw new Error("invalid backup");
      }

      const confirmed = window.confirm(
        "导入会用备份内容替换当前设备上的勾选、笔记和自定义任务。确定继续吗？",
      );
      if (!confirmed) return;

      state = {
        version: 2,
        completions: importedState.completions || {},
        moves: importedState.moves || {},
        customTasks: importedState.customTasks || [],
        notes: importedState.notes || {},
        vocabMastery: importedState.vocabMastery || {},
        reviewPlans: importedState.reviewPlans || {},
      };
      saveState();
      buildAllTasks();
      renderAll();
      showToast("进度已导入到当前设备");
    } catch {
      showToast("无法读取该备份，请选择由本网页导出的 JSON 文件");
    }
  }

  function updateNetworkStatus() {
    const online = navigator.onLine;
    dom.networkStatus.classList.toggle("is-offline", !online);
    dom.networkStatus.classList.toggle("is-online", online);
    dom.networkStatus.querySelector("strong").textContent = online ? "已联网" : "离线模式";
    if (!online) {
      dom.networkStatus.classList.add("is-visible");
    } else {
      window.setTimeout(() => dom.networkStatus.classList.remove("is-visible"), 1500);
    }
  }

  function selectDate(key) {
    stopVocabSpeech({ rerender: false });
    runtime.selectedDate = clampDateKey(key, CONFIG.start, CONFIG.cet6);
    runtime.filter = "all";
    runtime.vocabMode = getRecommendedVocabMode(runtime.selectedDate);
    runtime.vocabIndex = 0;
    dom.filterRow.querySelectorAll("[data-filter]").forEach((item) => {
      item.classList.toggle("is-active", item.dataset.filter === "all");
    });
    renderAll();
  }

  function startTimer() {
    if (runtime.timerSeconds <= 0) runtime.timerSeconds = runtime.timerPreset * 60;
    runtime.timerRunning = true;
    dom.timerToggle.textContent = "暂停";
    dom.timerCaption.textContent = "保持在当前任务里。";
    runtime.timerId = window.setInterval(() => {
      runtime.timerSeconds -= 1;
      updateTimerDisplay();
      if (runtime.timerSeconds <= 0) {
        stopTimer();
        dom.timerCaption.textContent = "这一轮完成，起来活动两分钟。";
        showToast("专注计时完成，休息一下吧");
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("双考航线", { body: "专注计时完成，起来活动两分钟。" });
        }
      }
    }, 1000);
  }

  function stopTimer() {
    runtime.timerRunning = false;
    if (runtime.timerId) window.clearInterval(runtime.timerId);
    runtime.timerId = null;
    dom.timerToggle.textContent = "开始专注";
    dom.timerCaption.textContent = "一次只做一件事。";
  }

  function updateTimerDisplay() {
    const minutes = Math.floor(runtime.timerSeconds / 60);
    const seconds = runtime.timerSeconds % 60;
    dom.timerDisplay.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    document.title = runtime.timerRunning
      ? `${dom.timerDisplay.textContent} · 双考航线`
      : "双考航线 · 雅思 × 六级每日清单";
  }

  function exportProgress() {
    const payload = {
      exportedAt: new Date().toISOString(),
      examDates: {
        ielts: CONFIG.ielts,
        cet6: CONFIG.cet6,
      },
      state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `双考航线进度-${toDateKey(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("进度备份已下载");
  }

  function resetProgress() {
    const confirmed = window.confirm("确定清空全部勾选、顺延记录、自定义任务和笔记吗？此操作无法撤销。");
    if (!confirmed) return;
    localStorage.removeItem(CONFIG.storageKey);
    localStorage.removeItem("dual-exam-flight-v1");
    state = loadState();
    runtime.selectedDate = TODAY;
    buildAllTasks();
    renderAll();
    showToast("全部进度已重置");
  }

  function showToast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add("is-visible");
    window.clearTimeout(runtime.toastId);
    runtime.toastId = window.setTimeout(() => {
      dom.toast.classList.remove("is-visible");
    }, 2600);
  }

  function celebrate() {
    const colors = ["#79b7f2", "#eda5c3", "#b9adeb", "#94d9ca", "#ffd795"];
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 26; index += 1) {
      const piece = document.createElement("i");
      piece.className = "confetti";
      piece.style.setProperty("--confetti-color", colors[index % colors.length]);
      piece.style.setProperty("--rotation", `${Math.random() * 180}deg`);
      piece.style.setProperty("--x", `${(Math.random() - 0.5) * 500}px`);
      piece.style.setProperty("--y", `${-80 - Math.random() * 280}px`);
      piece.style.animationDelay = `${Math.random() * 120}ms`;
      fragment.appendChild(piece);
    }
    dom.celebration.appendChild(fragment);
    window.setTimeout(() => {
      dom.celebration.innerHTML = "";
    }, 1300);
  }

  function init() {
    cacheDom();
    buildAllTasks();
    bindEvents();
    setupMobileExperience();
    updateTimerDisplay();
    renderAll();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
