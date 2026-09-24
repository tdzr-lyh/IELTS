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

首次联网打开后，页面框架会缓存到设备中。学习进度保存在浏览器中；训练音频采用联网流式播放。

## 进度说明

学习进度默认保存在当前手机浏览器中：

- 不需要电脑作为服务器。
- 清理浏览器网站数据会清除本机进度。
- 使用“备份进度”下载 JSON。
- 在另一台设备点击“导入”，可迁移任务断点、词汇掌握、错词和测试统计。
