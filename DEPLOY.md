# 将“听力练习书”发布为无需电脑后台运行的网站

网页是纯静态 PWA。只要一次性发布到支持 HTTPS 的静态托管平台，之后电脑关机也不会影响手机访问。

## 发布包

运行：

```powershell
python build_deploy.py
```

会生成：

- `dist/`：可直接部署的网站目录
- `双考航线-静态部署包.zip`：可上传到静态托管平台的压缩包

## 方案一：Cloudflare Pages

1. 登录 Cloudflare。
2. 进入 Workers & Pages。
3. 新建 Pages 项目，选择 Direct Upload。
4. 上传 `双考航线-静态部署包.zip` 或 `dist/`。
5. 发布后会获得 HTTPS 的 `pages.dev` 地址。
6. 在手机浏览器打开该地址，再添加到主屏幕。

## 方案二：GitHub Pages

项目已经包含 `.github/workflows/pages.yml`。

1. 新建 GitHub 仓库，并把本目录推送到仓库。
2. 在仓库 Settings → Pages 中，将 Source 设为 GitHub Actions。
3. 工作流会自动运行 `build_deploy.py` 并发布 `dist/`。
4. 发布完成后，在手机打开 GitHub Pages 地址。

## 手机端安装

- 安卓 Chrome：菜单 → 安装应用 / 添加到主屏幕。
- iPhone Safari：分享 → 添加到主屏幕。

首次联网打开后，页面框架会缓存到设备中。训练音频采用联网流式播放。

## 开启账号登录与跨浏览器同步

GitHub Pages 只能托管静态网页，本身不能保存账号与密码。项目已经接入 Supabase Auth 和数据库，只需做一次配置：

1. 在 Supabase 创建免费项目。
2. 打开 SQL Editor，复制并运行项目中的 `supabase-setup.sql`。
3. 打开 Authentication → Providers → Email：
   - 开启 Email provider。
   - 关闭 Confirm email（网站使用内部账号标识，不要求真实邮箱）。
4. 打开 GitHub 仓库 Settings → Secrets and variables → Actions → Variables，新建：
   - `SUPABASE_URL`：Project Settings → API 中的 Project URL。
   - `SUPABASE_ANON_KEY`：Project Settings → API 中的 anon public key。
5. 在 Actions 页面重新运行 `Deploy static PWA to GitHub Pages`。

部署脚本会在构建时自动把这两个公开配置写进 `dist/cloud-config.js`。不要使用或泄露 Supabase 的 `service_role` key。

配置后：

- “登录已有账号”和“注册并进入”会同时显示。
- 同一账号可以在手机、电脑和不同浏览器登录。
- 任务、词汇、错词、听写和测试进度按账号隔离并自动同步。
- 本机会保留离线缓存；恢复联网后会继续同步。
- 仍可使用“备份进度”下载 JSON 作为额外保险。

## 手机单词发音

单词按钮现在会直接播放在线词典 MP3，不依赖手机是否安装系统英文语音包。发音固定为正常 1×。如果浏览器阻止测试题自动播放，手动点击一次“再听一次”即可解除限制。
