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
仅本机访问（内测期推荐）：`HOST=127.0.0.1 node server.js`
设置后服务只绑定回环地址，且应用层会拒绝一切非本机来源（基于 socket 真实来源，不信任可伪造的转发头）；不设置则监听所有网卡，局域网可访问。
后台常驻（Mac 推荐方式，写一个 plist 或交给 launchd 管理，如需我可以帮你生成）。

## 部署到 NAS（支持麒麟 / UOS 的 amd64 + arm64）

镜像已由 GitHub Actions 自动构建并发布（多架构，`docker pull` 自动匹配 CPU）：

```bash
docker pull ghcr.io/cslanjian/personal-projects:latest

mkdir -p /share/Container/personal-projects/data
docker run -d \
  --name personal-projects \
  --restart unless-stopped \
  -p 4173:4173 \
  -v /share/Container/personal-projects/data:/app/data \
  ghcr.io/cslanjian/personal-projects:latest
```

> 内测期限本机访问：容器内不要用 `-e HOST=127.0.0.1`（会绑在容器自身的回环上，导致端口映射失效），
> 正确做法是在 **NAS 侧**限制发布地址：`-p 127.0.0.1:4173:4173`（容器开放模式 + 只映射到宿主机回环）。

局域网内访问 `http://NAS的IP:4173`。数据卷挂载到 NAS 本地目录，重建容器也不会丢数据。
以后更新：本地改代码 → push 到 GitHub 自动构建 → NAS 上 `docker pull` 后重启容器。

也可以配合 Tailscale / frp 等方案从外网访问；注意应用本身没有鉴权，**不要直接暴露公网**（如需可自己加反向代理 Basic Auth）。

## 在 NAS 上本地构建（备选方案）

不依赖 GitHub 时，把整个文件夹拷到 NAS，SSH 进入后：

```bash
docker build -t personal-projects:latest .
mkdir -p /share/Container/personal-projects/data
docker run -d --name personal-projects --restart unless-stopped -p 4173:4173 \
  -v /share/Container/personal-projects/data:/app/data \
  personal-projects:latest
```

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
