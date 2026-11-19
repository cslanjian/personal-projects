#!/usr/bin/env node
/**
 * 个人项目集 —— 零依赖本地服务
 * 运行: node server.js   (默认 http://localhost:4173)
 * 数据: data/data.json
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 4173;
/**
 * 访问限制开关：
 * - 未设置 HOST（或设为 0.0.0.0 / :: / 空）：监听所有网卡，局域网/外部均可访问
 * - 设置了 HOST（如 HOST=127.0.0.1）：网络层只绑定该地址，且应用层拒绝一切非回环来源
 * 应用层拒绝基于 socket 真实来源地址，不信任 X-Forwarded-For 等可伪造头。
 */
const HOST = (process.env.HOST || "").trim();
const RESTRICT_LOOPBACK = HOST !== "" && HOST !== "0.0.0.0" && HOST !== "::";
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "data.json");
const AUTH_FILE = path.join(DATA_DIR, "auth.json");

/* ===== 登录模块 =====
 * REQUIRE_LOGIN=1 首次启动时生效并写入 data/auth.json；
 * 配置文件一旦存在，loginRequired 即被锁定，后续启动环境变量不再生效（不允许修改）。
 */
const sessions = new Map(); // token -> username（内存态，重启需重新登录）
let AUTH = null;

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

/* ---- 密码工具 ---- */
function pwStrength(pw) {
  const reasons = [];
  if (typeof pw !== "string" || pw.length < 12) reasons.push("长度至少 12 位");
  if (!/[a-z]/.test(pw || "")) reasons.push("需含小写字母");
  if (!/[A-Z]/.test(pw || "")) reasons.push("需含大写字母");
  if (!/[0-9]/.test(pw || "")) reasons.push("需含数字");
  if (!/[^A-Za-z0-9]/.test(pw || "")) reasons.push("需含特殊字符");
  return reasons;
}
function makeSalt() {
  return crypto.randomBytes(16).toString("hex");
}
function hashPassword(pw, salt) {
  return crypto.scryptSync(String(pw), salt, 64).toString("hex");
}
function verifyPassword(pw, stored) {
  const i = String(stored).indexOf(":");
  if (i < 0) return false;
  const salt = stored.slice(0, i);
  const hash = stored.slice(i + 1);
  const h = Buffer.from(hashPassword(pw, salt), "hex");
  const e = Buffer.from(hash, "hex");
  return h.length === e.length && crypto.timingSafeEqual(h, e);
}
function genStrongPassword() {
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digit = "23456789";
  const special = "!@#$%^&*+-_=?";
  const all = lower + upper + digit + special;
  const pick = (s) => s[crypto.randomInt(s.length)];
  const chars = [pick(lower), pick(upper), pick(digit), pick(special)];
  while (chars.length < 16) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
function truthyEnv(v) {
  return ["1", "true", "yes", "on"].includes(String(v || "").toLowerCase());
}

function ensureAuth() {
  if (fs.existsSync(AUTH_FILE)) {
    try {
      AUTH = JSON.parse(fs.readFileSync(AUTH_FILE, "utf-8"));
      if (typeof AUTH.loginRequired !== "boolean") AUTH.loginRequired = false;
      if (process.env.REQUIRE_LOGIN !== undefined &&
          truthyEnv(process.env.REQUIRE_LOGIN) !== AUTH.loginRequired) {
        console.log(`[auth] 配置文件已锁定 是否登录=${AUTH.loginRequired}，忽略环境变量 REQUIRE_LOGIN=${process.env.REQUIRE_LOGIN}（不允许修改）`);
      }
      return;
    } catch (err) {
      console.error("[error] auth.json 解析失败:", err);
      process.exit(1);
    }
  }
  // 首次启动：以环境变量决定是否强制登录，并记录进配置文件
  const loginRequired = truthyEnv(process.env.REQUIRE_LOGIN);
  const initialPassword = genStrongPassword();
  const salt = makeSalt();
  AUTH = {
    loginRequired,
    username: "lanjian",
    passwordHash: salt + ":" + hashPassword(initialPassword, salt),
    initialPassword, // 修改密码后自动清除
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(AUTH_FILE, JSON.stringify(AUTH, null, 2), "utf-8");
  if (loginRequired) {
    console.log("[auth] 首次启动：已创建登录配置 data/auth.json（是否登录=true，已锁定）");
    console.log(`[auth] 初始账号: lanjian   初始密码: ${initialPassword}`);
    console.log("[auth] ↑ 密码同样记录在 auth.json 中，登录后请立即修改");
  } else {
    console.log("[auth] 首次启动：未设置 REQUIRE_LOGIN，已记录 是否登录=false（已锁定；如需开启登录请删除 auth.json 后以 REQUIRE_LOGIN=1 重启）");
  }
}

function getToken(req) {
  const m = /(?:^|;\s*)pps_token=([A-Za-z0-9]+)/.exec(req.headers.cookie || "");
  return m ? m[1] : null;
}
function isAuthed(req) {
  const t = getToken(req);
  return !!(t && sessions.get(t) === AUTH.username);
}
function saveAuth() {
  fs.writeFileSync(AUTH_FILE, JSON.stringify(AUTH, null, 2), "utf-8");
}
async function readJSONBody(req) {
  try {
    return JSON.parse((await readBody(req)) || "{}");
  } catch {
    return {};
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

function isLoopback(addr) {
  if (!addr) return false;
  let a = String(addr).toLowerCase();
  if (a.startsWith("::ffff:")) a = a.slice(7); // IPv6 映射的 IPv4 地址
  return a === "127.0.0.1" || a === "::1" || a.startsWith("::ffff:127.");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);

  // 应用层访问控制：限本机模式时，非回环来源一律拒绝（先于任何静态/接口处理）
  if (RESTRICT_LOOPBACK && !isLoopback(req.socket.remoteAddress)) {
    console.warn(`[blocked] 非本机来源被拒绝: ${req.socket.remoteAddress} -> ${pathname}`);
    return sendJSON(res, 403, { error: "本服务已配置为仅限本机访问" });
  }

  /* ---- 登录相关接口（无需登录态） ---- */
  if (pathname === "/api/auth/status") {
    const logged = isAuthed(req);
    return sendJSON(res, 200, {
      loginRequired: AUTH.loginRequired,
      loggedIn: logged,
      username: logged ? AUTH.username : null,
      usingInitialPassword: !!AUTH.initialPassword,
    });
  }
  if (pathname === "/api/auth/login" && req.method === "POST") {
    const b = await readJSONBody(req);
    const ok = b.username === AUTH.username && verifyPassword(b.password || "", AUTH.passwordHash);
    if (!ok) {
      console.warn(`[auth] 登录失败: ${req.socket.remoteAddress} 用户名=${String(b.username || "").slice(0, 40)}`);
      return sendJSON(res, 401, { error: "用户名或密码错误" });
    }
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, AUTH.username);
    res.setHeader("Set-Cookie", `pps_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
    return sendJSON(res, 200, { ok: true, usingInitialPassword: !!AUTH.initialPassword });
  }
  if (pathname === "/api/auth/logout" && req.method === "POST") {
    sessions.delete(getToken(req));
    res.setHeader("Set-Cookie", "pps_token=; Path=/; Max-Age=0");
    return sendJSON(res, 200, { ok: true });
  }
  if (pathname === "/api/auth/change-password" && req.method === "POST") {
    if (AUTH.loginRequired && !isAuthed(req)) {
      return sendJSON(res, 401, { error: "需要登录" });
    }
    const b = await readJSONBody(req);
    if (!verifyPassword(b.currentPassword || "", AUTH.passwordHash)) {
      return sendJSON(res, 401, { error: "当前密码不正确" });
    }
    const reasons = pwStrength(b.newPassword || "");
    if (reasons.length) {
      return sendJSON(res, 400, { error: "新密码强度不足：" + reasons.join("、") });
    }
    const salt = makeSalt();
    AUTH.passwordHash = salt + ":" + hashPassword(b.newPassword, salt);
    delete AUTH.initialPassword;
    AUTH.passwordUpdatedAt = new Date().toISOString();
    saveAuth();
    console.log("[auth] 密码已修改（初始密码记录已清除）");
    return sendJSON(res, 200, { ok: true });
  }

  /* ---- 应用层访问控制 ---- */
  if (pathname.startsWith("/api/") && AUTH.loginRequired && !isAuthed(req)) {
    return sendJSON(res, 401, { error: "需要登录" });
  }

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
ensureAuth();
// 未显式指定 HOST 时绑定 0.0.0.0（IPv4 全网卡）：
// Node 默认会绑定 IPv6 通配符 ::，部分网络环境（含本机自连局域网 IP）会出现请求无响应
server.listen(PORT, HOST || "0.0.0.0", () => {
  console.log("");
  console.log("  ⭐ 个人项目集已启动");
  console.log(`  ➜  在浏览器打开: http://localhost:${PORT}`);
  if (RESTRICT_LOOPBACK) {
    console.log(`  🔒 已启用仅本机访问模式（HOST=${HOST}），非回环来源将被应用层拒绝`);
  } else {
    console.log("  🌐 未设置 HOST，监听所有网卡，局域网/外部可访问");
  }
  console.log("");
});
