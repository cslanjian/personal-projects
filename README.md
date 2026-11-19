# ⭐ 个人项目集

记录个人「方向性大事件」（以下简称**项目**）的本地应用：总体目标 → 里程碑 → 子任务 → 时间计划 → 进度，
自用仪表盘 + 时间线（甘特）视图，并支持习惯型项目的**每日打卡**（日历记录、连续天数统计）。
**零 npm 依赖**，只要机器上有 Node.js 即可运行。数据保存在 `data/data.json`，随时可以备份。

## 在 Mac 上运行

```bash
cd 个人项目集
node server.js
```

然后浏览器打开 http://localhost:4173

换端口：`PORT=5000 node server.js`
后台常驻（Mac 推荐方式，写一个 plist 或交给 launchd 管理，如需我可以帮你生成）。

## 部署到 NAS（群晖 / 威联通等，支持 Docker）

```bash
cd 个人项目集
docker build -t personal-projects .
docker run -d --name personal-projects -p 4173:4173 \
  -v /volume1/docker/personal-projects/data:/app/data \
  personal-projects
```

数据卷挂载到 NAS 本地目录，重建容器也不会丢数据。
之后在局域网内任何设备访问 `http://NAS的IP:4173` 即可。

也可以配合 Tailscale / frp 等方案从外网访问；注意应用本身没有鉴权，**不要直接暴露公网**（如需可自己加反向代理 Basic Auth）。

## 数据结构

`data/data.json` 里每个大事件包含：

| 字段 | 说明 |
|---|---|
| name / domain / status | 名称、领域（用于分组和颜色）、状态（构想/进行中/搁置/已完成） |
| startDate / targetDate | 计划区间（时间线视图使用） |
| definition / notes | 一句话定义、备忘 |
| progressMode | `auto`：按里程碑+子任务勾选占比自动计算；`manual`：手动设置 |
| milestones / tasks | 里程碑和子任务列表，每项含 title / due / done |
| checkin / checkins | 是否启用打卡；已打卡日期数组（如 `["2026-11-08", ...]`），在详情抽屉的日历上点击记录 |

定期备份整个 `data/` 文件夹即可。
