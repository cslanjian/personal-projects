#!/usr/bin/env node
/**
 * 个人项目集 —— 零依赖本地服务
 * 运行: node server.js   (默认 http://localhost:4173)
 * 数据: data/data.json
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 4173;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "data.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function seedData() {
  return {
    projects: [
      {
        id: "demo-1",
        name: "学好英语",
        domain: "成长",
        status: "进行中",
        startDate: "2026-01-01",
        targetDate: "2026-12-31",
        progressMode: "auto",
        progressValue: 35,
        definition: "达到 C1 水平，能流利进行工作沟通",
        notes: "每周复盘一次学习时长。",
        milestones: [
          { id: "m1", title: "词汇量 8000", due: "2026-03-15", done: true },
          { id: "m2", title: "口语练习体系成型", due: "2026-06-30", done: false },
          { id: "m3", title: "完成一次线下对话测试", due: "2026-10-31", done: false },
        ],
        tasks: [
          { id: "t1", title: "2月：完成语法体系课程", due: "2026-02-28", done: true },
          { id: "t2", title: "3月起：Anki 每日 30 词", due: "2026-03-15", done: true },
          { id: "t3", title: "报名口语社群", due: "2026-04-10", done: false },
        ],
      },
      {
        id: "demo-2",
        name: "装修房子",
        domain: "生活",
        status: "进行中",
        startDate: "2026-02-01",
        targetDate: "2026-09-30",
        progressMode: "manual",
        progressValue: 20,
        definition: "完成全屋硬装 + 主要软装",
        notes: "",
        milestones: [
          { id: "m1", title: "设计方案敲定", due: "2026-03-31", done: true },
          { id: "m2", title: "硬装完工", due: "2026-07-15", done: false },
          { id: "m3", title: "软装入场", due: "2026-09-15", done: false },
        ],
        tasks: [
          { id: "t1", title: "对比三家装修公司报价", due: "2026-03-01", done: true },
          { id: "t2", title: "确认主材清单", due: "2026-04-20", done: false },
        ],
      },
      {
        id: "demo-3",
        name: "考取 PMP 认证",
        domain: "事业",
        status: "构想",
        startDate: "",
        targetDate: "2027-03-31",
        progressMode: "manual",
        progressValue: 0,
        definition: "系统化补足项目管理方法论，为带更大团队做准备",
        notes: "",
        milestones: [],
        tasks: [],
      },
      {
        id: "demo-4",
        name: "减肥 & 健身",
        domain: "健康",
        status: "进行中",
        startDate: (() => { const t = new Date(Date.now() - 30 * 864e5); return t.toISOString().slice(0, 10); })(),
        targetDate: (() => { const t = new Date(Date.now() + 150 * 864e5); return t.toISOString().slice(0, 10); })(),
        progressMode: "manual",
        progressValue: 40,
        definition: "约 5 个月从 78kg 降到 70kg，每周运动 ≥ 4 次",
        notes: "跑步或力量训练都算，当天动过就算打卡成功。",
        checkin: true,
        checkins: [0, -1, -2, -3, -6, -9, -10, -11].map((o) =>
          new Date(Date.now() + o * 864e5).toISOString().slice(0, 10)
        ),
        milestones: [
          { id: "m1", title: "体重降到 74kg", due: "", done: false },
          { id: "m2", title: "周运动 4 次成为稳定习惯", due: "", done: false },
        ],
        tasks: [
          { id: "t1", title: "制定每周训练菜单", due: "", done: true },
          { id: "t2", title: "清理家中高热量零食", due: "", done: true },
        ],
      },
    ],
  };
}

function ensureData() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(seedData(), null, 2), "utf-8");
      console.log("[init] 已创建初始数据文件 data/data.json");
    }
  } catch (err) {
    console.error("[error] 初始化数据失败:", err);
    process.exit(1);
  }
}

function readData() {
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data.projects)) data.projects = [];
  return data;
}

function saveData(body) {
  const data = { projects: Array.isArray(body?.projects) ? body.projects : [] };
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
  return data;
}

function sendJSON(res, code, obj, extraHeaders) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > 10 * 1024 * 1024) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function serveStatic(req, res, urlPath) {
  if (urlPath === "/") urlPath = "/index.html";
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not Found");
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/api/data") {
    if (req.method === "GET") {
      return sendJSON(res, 200, readData());
    }
    if (req.method === "PUT") {
      try {
        const body = JSON.parse(await readBody(req));
        return sendJSON(res, 200, saveData(body));
      } catch (err) {
        return sendJSON(res, 400, { error: String(err.message || err) });
      }
    }
    return sendJSON(res, 405, { error: "Method Not Allowed" });
  }

  if (pathname === "/api/health") {
    return sendJSON(res, 200, { ok: true, time: new Date().toISOString() });
  }

  if (req.method === "GET") {
    return serveStatic(req, res, pathname);
  }

  res.writeHead(404);
  res.end("Not Found");
});

ensureData();
server.listen(PORT, () => {
  console.log("");
  console.log("  ⭐ 个人项目集已启动");
  console.log(`  ➜  在浏览器打开: http://localhost:${PORT}`);
  console.log("");
});
