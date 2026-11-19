/* 个人项目集 · 前端逻辑 */

const DOMAIN_COLORS = {
  "事业": "#4f6ef7",
  "成长": "#7a52c7",
  "学习": "#0e8da5",
  "生活": "#2f9e63",
  "健康": "#d97a08",
  "财富": "#0e9f6e",
  "关系": "#d55c8a",
  "兴趣": "#e5484d",
  "旅行": "#7c9a1e",
  "其他": "#8b93a1",
};
const DEFAULT_DOMAIN_COLOR = "#8b93a1";
const STATUSES = ["构想", "进行中", "搁置", "已完成"];

const WEEK = 24 * 3600 * 1000;

let data = { projects: [] };
let currentView = "dashboard";
let openId = null;
let saveTimer = null;
const $main = document.getElementById("main");
const $drawer = document.getElementById("drawer");
const $overlay = document.getElementById("overlay");
const $saveState = document.getElementById("save-state");

/* ---------- 工具函数 ---------- */
function uid() {
  return "id-" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function fmtDate(d) {
  if (!d) return "未定";
  return d.slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((toTs(b) - toTs(a)) / WEEK);
}
function toTs(d) {
  return new Date(d + "T00:00:00").getTime();
}
function today() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}
function domainColor(domain) {
  return DOMAIN_COLORS[domain] || DEFAULT_DOMAIN_COLOR;
}
function domainOptions(p) {
  const keys = Object.keys(DOMAIN_COLORS);
  const list = p.domain && !keys.includes(p.domain) ? [...keys, p.domain] : keys;
  return list
    .map((d) => `<option value="${esc(d)}" ${d === p.domain ? "selected" : ""}>${esc(d)}</option>`)
    .join("");
}
/* ---- 日期位移 ---- */
function fmtY(t) {
  return [t.getFullYear(), String(t.getMonth() + 1).padStart(2, "0"), String(t.getDate()).padStart(2, "0")].join("-");
}
function shiftDay(isoDate, n) {
  const t = new Date(isoDate + "T00:00:00");
  t.setDate(t.getDate() + n);
  return fmtY(t);
}
/* ---- 打卡统计 ---- */
function streakInfo(p) {
  const set = new Set(p.checkins || []);
  // 当前连续：从今天（或昨天）往前数
  let cur = 0;
  let d = today();
  if (!set.has(d)) {
    d = shiftDay(d, -1);
    if (!set.has(d)) return { cur: 0, max: maxRun(set) };
  }
  while (set.has(d)) { cur++; d = shiftDay(d, -1); }
  return { cur, max: maxRun(set) };
}
function maxRun(set) {
  if (!set.size) return 0;
  let max = 0, run = 0, prev = null;
  for (const d of [...set].sort()) {
    if (prev && daysBetween(prev, d) === 1) run++;
    else run = 1;
    max = Math.max(max, run);
    prev = d;
  }
  return max;
}
function progressOf(p) {
  if (p.progressMode === "auto") {
    const all = (p.milestones || []).concat(p.tasks || []);
    const shown = (p.milestones || []).some(m => m.title) || (p.tasks || []).some(t => t.title);
    if (!shown) return p.progressValue || 0;
    const done = all.filter((x) => x.done && x.title).length;
    const total = all.filter((x) => x.title).length;
    return total ? Math.round((done / total) * 100) : 0;
  }
  return p.progressValue || 0;
}
function dueInfo(p) {
  if (!p.targetDate) return { text: "完成时间未定", cls: "" };
  const left = daysBetween(today(), p.targetDate);
  if (p.status === "已完成") return { text: fmtDate(p.targetDate), cls: "" };
  if (left < 0) return { text: `${fmtDate(p.targetDate)} · 已超 ${-left} 天`, cls: "due-over" };
  if (left <= 30) return { text: `${fmtDate(p.targetDate)} · 剩 ${left} 天`, cls: "due-soon" };
  return { text: `${fmtDate(p.targetDate)} · 剩 ${Math.round(left / 30)} 个月`, cls: "" };
}

/* ---------- 数据读写 ---------- */
async function load() {
  const res = await fetch("/api/data");
  data = await res.json();
  if (!data.projects) data.projects = [];
}
function markSaving() {
  $saveState.textContent = "保存中…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 600);
}
async function save() {
  try {
    await fetch("/api/data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    $saveState.textContent = "已保存 ✓";
    setTimeout(() => ($saveState.textContent = ""), 1500);
  } catch (e) {
    $saveState.textContent = "保存失败 ✗";
  }
}

/* ---------- 总览视图 ---------- */
function renderDashboard() {
  const ps = data.projects;
  const doing = ps.filter((p) => p.status === "进行中");
  const avg = doing.length ? Math.round(doing.reduce((s, p) => s + progressOf(p), 0) / doing.length) : 0;
  const over = doing.filter((p) => p.targetDate && daysBetween(today(), p.targetDate) < 0).length;
  const soon = doing.filter((p) => p.targetDate && daysBetween(today(), p.targetDate) >= 0 && daysBetween(today(), p.targetDate) <= 30).length;

  const stats = `
    <div class="stats">
      <div class="stat accent"><div class="num">${doing.length}</div><div class="label">进行中的项目</div></div>
      <div class="stat"><div class="num">${ps.length}</div><div class="label">全部项目</div></div>
      <div class="stat"><div class="num">${avg}%</div><div class="label">平均进度（进行中）</div></div>
      <div class="stat warn"><div class="num">${soon}</div><div class="label">30 天内到期</div></div>
      <div class="stat danger"><div class="num">${over}</div><div class="label">已逾期</div></div>
    </div>`;

  // 按领域分组
  const domains = [...new Set(ps.map((p) => p.domain || "其他"))];
  let groups = "";
  for (const dm of domains) {
    const list = ps.filter((p) => (p.domain || "其他") === dm);
    if (!list.length) continue;
    groups += `
      <div class="domain-title"><span class="domain-dot" style="background:${domainColor(dm)}"></span>${esc(dm)} · ${list.length}</div>
      <div class="cards">` +
      list.map((p) => {
        const prog = progressOf(p);
        const due = dueInfo(p);
        const ms = (p.milestones || []).filter((m) => m.title);
        const tk = (p.tasks || []).filter((t) => t.title);
        const si = p.checkin ? streakInfo(p) : null;
        return `
        <div class="card" data-id="${p.id}">
          <div class="card-top">
            <span class="card-name">${esc(p.name) || "未命名"}</span>
            <span class="chip s-${esc(p.status || "构想")}">${esc(p.status || "构想")}</span>
          </div>
          <div class="card-def">${esc(p.definition) || "<span style='opacity:.4'>（暂无一句话定义）</span>"}</div>
          <div class="progress-row">
            <div class="progress-track"><div class="progress-fill" style="width:${prog}%"></div></div>
            <span class="progress-num">${prog}%</span>
          </div>
          <div class="card-foot">
            <span class="due ${due.cls}">${esc(due.text)}</span>
            <span class="count">${si != null ? `<span>🔥 连续 ${si.cur} 天</span>` : ""}<span>◆ ${ms.filter(m=>m.done).length}/${ms.length}</span><span>▸ ${tk.filter(t=>t.done).length}/${tk.length}</span></span>
          </div>
        </div>`;
      }).join("") +
      `</div>`;
  }

  $main.innerHTML = stats + (groups || `<div class="empty-hint">还没有项目，点右上角「＋ 新建项目」开始记录 👐</div>`);

  $main.querySelectorAll(".card").forEach((el) =>
    el.addEventListener("click", () => openDetail(el.dataset.id))
  );
}

/* ---------- 时间线视图 ---------- */
function renderTimeline() {
  const ps = data.projects.filter((p) => p.status !== "已完成" || Math.abs(daysBetween(today(), p.targetDate || today())) < 90);
  const t = today();
  const active = ps.filter((p) => p.status !== "构想");
  const items = active.length ? active : ps;

  let min = toTs(t), max = toTs(t);
  for (const p of ps) {
    min = Math.min(min, toTs(p.startDate || p.targetDate || t));
    max = Math.max(max, toTs(p.targetDate || p.startDate || t));
  }
  min -= 15 * WEEK; max += 15 * WEEK;
  const span = Math.max(max - min, WEEK);
  const pct = (d) => ((toTs(d) - min) / span) * 100;

  // 月份刻度
  const ticks = [];
  const cur = new Date(min);
  cur.setDate(1);
  while (cur.getTime() <= max) {
    const left = ((cur.getTime() - min) / span) * 100;
    ticks.push(`<div class="gantt-tick" style="position:absolute;left:${left}%">${cur.getFullYear()}/${cur.getMonth() + 1}</div>`);
    cur.setMonth(cur.getMonth() + 3);
  }

  const rows = items
    .map((p) => {
      const s = p.startDate || p.targetDate || t;
      const e = p.targetDate || p.startDate || t;
      const c = domainColor(p.domain);
      const left = pct(s), width = Math.max(pct(e) - left, 0.8);
      const progW = Math.max((width * progressOf(p)) / 100, 0.8);
      return `
      <div class="gantt-row">
        <div class="gantt-label" data-id="${p.id}">${esc(p.name) || "未命名"}</div>
        <div class="gantt-lane">
          <div class="gantt-track"></div>
          ${p.targetDate ? "" : '<div class="gantt-empty">（未定完成时间）</div>'}
          <div class="gantt-bar" style="left:${left}%;width:${width}%;background:${c}"></div>
          <div class="gantt-prog" style="left:${left}%;width:${progW}%;background:${c}" title="${progressOf(p)}%"></div>
        </div>
      </div>`;
    })
    .join("");

  $main.innerHTML = `
    <div class="gantt">
      <div class="gantt-head" style="grid-template-columns:200px 1fr;height:16px;position:relative">
        <div></div><div style="position:relative">${ticks.join("")}</div>
      </div>
      ${rows || '<div class="empty-hint">暂无条目</div>'}
      <div class="gantt-legend">
        <span class="legend-item"><span class="legend-dot" style="background:#8b93a1;opacity:.28"></span>计划区间</span>
        <span class="legend-item"><span class="legend-dot" style="background:#8b93a1"></span>已完成进度</span>
        <span class="legend-item"><span class="legend-dot" style="background:var(--danger);opacity:.55;width:3px"></span>今天</span>
      </div>
    </div>
    <p class="muted" style="margin-top:14px">※ 「构想」状态的条目不会出现在时间线上；点击左侧名称可打开详情。</p>`;
  document.querySelectorAll("#main .gantt-lane").forEach((lane) => {
    const bar = document.createElement("div");
    bar.className = "gantt-today";
    bar.style.left = `calc(${((toTs(t) - min) / span) * 100}% - 1px)`;
    lane.appendChild(bar);
  });
  $main.querySelectorAll(".gantt-label").forEach((el) =>
    el.addEventListener("click", () => openDetail(el.dataset.id))
  );
}

/* ---------- 详情抽屉 ---------- */
function openDetail(id) {
  const p = data.projects.find((x) => x.id === id);
  if (!p) return;
  openId = id;
  const now = new Date();
  calY = now.getFullYear();
  calM = now.getMonth();
  $overlay.classList.remove("hidden");
  $drawer.classList.remove("hidden");
  renderDrawer();
}
function closeDetail() {
  openId = null;
  $overlay.classList.add("hidden");
  $drawer.classList.add("hidden");
}
document.getElementById("overlay").addEventListener("click", closeDetail);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDetail();
});

function findProject() {
  return data.projects.find((x) => x.id === openId);
}

/* ---- 打卡日历（周一为一周起点，仅可记录今天及之前） ---- */
let calY, calM; // 当前展示的年、月（0 基）

function checkinCalendarHTML(p) {
  const y = calY, m = calM;
  const set = new Set(p.checkins || []);
  const td = today();
  const si = streakInfo(p);

  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7; // 周一为 0
  const start = new Date(y, m, 1 - lead);
  let cells = "";
  for (let i = 0; i < 42; i++) {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);
    const iso = fmtY(dt);
    const inMonth = dt.getMonth() === m;
    const isFuture = daysBetween(td, iso) > 0;
    const done = set.has(iso);
    const cls = [
      "cal-day",
      !inMonth || isFuture ? "off" : "",
      done ? "done" : "",
      iso === td ? "today" : "",
    ].filter(Boolean).join(" ");
    cells += `<div class="${cls}" data-date="${iso}">${dt.getDate()}</div>`;
  }

  const label = `${y} 年 ${m + 1} 月`;
  return `
    <div class="section-title">✓ 打卡日历</div>
    <div class="checkin-cal">
      <div class="cal-head">
        <button class="btn small icon" id="cal-prev">‹</button>
        <span class="cal-label">${label}</span>
        <button class="btn small icon" id="cal-next">›</button>
        <span class="muted" style="margin-left:auto">共 ${set.size} 次 · 连续 ${si.cur} 天 · 最长 ${si.max} 天</span>
      </div>
      <div class="cal-grid">
        ${["一","二","三","四","五","六","日"].map((w) => `<div class="cal-wd">${w}</div>`).join("")}
        ${cells}
      </div>
      <div class="muted" style="margin-top:8px">点击日期切换打卡状态；灰色为不可记录的日子。</div>
    </div>`;
}

function bindCheckinCalendar(p) {
  const prev = document.getElementById("cal-prev");
  const next = document.getElementById("cal-next");
  if (!prev) return;
  prev.addEventListener("click", () => { calM--; if (calM < 0) { calM = 11; calY--; } renderDrawer(); });
  next.addEventListener("click", () => { calM++; if (calM > 11) { calM = 0; calY++; } renderDrawer(); });

  $drawer.querySelectorAll(".cal-day").forEach((cell) => {
    const iso = cell.dataset.date;
    if (cell.classList.contains("off")) return;
    cell.addEventListener("click", () => {
      if (!Array.isArray(p.checkins)) p.checkins = [];
      const i = p.checkins.indexOf(iso);
      if (i >= 0) p.checkins.splice(i, 1);
      else p.checkins.push(iso);
      touch();          // 更新仪表盘并保存
      renderDrawer();   // 重绘日历与统计
    });
  });
}

function renderDrawer() {
  const p = findProject();
  if (!p) return;
  const itemRow = (arrName, item, isMs) => `
    <div class="item-row" data-arr="${arrName}" data-iid="${item.id}">
      <input type="checkbox" ${item.done ? "checked" : ""} data-k="done" />
      <input type="text" value="${esc(item.title)}" placeholder="${isMs ? "里程碑描述" : "子任务描述"}" data-k="title" />
      <input type="date" value="${item.due || ""}" data-k="due" title="计划日期" />
      <button class="del" title="删除">✕</button>
    </div>`;

  $drawer.innerHTML = `
    <div class="drawer-head">
      <h2>项目详情</h2>
      <button class="btn danger small" id="d-del">删除</button>
      <button class="btn small" id="d-close">关闭</button>
    </div>

    <div class="field"><label>名称</label>
      <input type="text" id="f-name" value="${esc(p.name)}" placeholder="项目叫什么" /></div>
    <div class="row2 field"><div><label>领域</label>
      <select id="f-domain">${domainOptions(p)}</select>
    </div><div><label>状态</label>
      <select id="f-status">${STATUSES.map((s) => `<option ${s === p.status ? "selected" : ""}>${s}</option>`).join("")}</select>
    </div></div>
    <div class="row2 field"><div><label>开始时间</label>
      <input type="date" id="f-start" value="${fmtDate(p.startDate) === "未定" ? "" : p.startDate}" /></div>
    <div><label>目标完成时间</label>
      <input type="date" id="f-target" value="${p.targetDate || ""}" /></div></div>
    <div class="field"><label>一句话定义</label>
      <input type="text" id="f-def" value="${esc(p.definition)}" placeholder="怎样算完成？达成什么可见的标志？" /></div>
    <div class="field"><label>备忘</label>
      <textarea id="f-notes" placeholder="原则、资源、相关链接…">${esc(p.notes)}</textarea></div>

    <div class="field"><label>进度方式</label>
      <select id="f-pmode">
        <option value="auto" ${p.progressMode !== "manual" ? "selected" : ""}>自动（按已勾选里程碑/任务占比）</option>
        <option value="manual" ${p.progressMode === "manual" ? "selected" : ""}>手动设置</option>
      </select></div>
    <div class="field"><label>进度（手动时生效）</label>
      <input type="number" id="f-prog" min="0" max="100" value="${p.progressValue || 0}" /></div>

    <div class="field"><label>打卡（健身、减肥这类习惯型项目可开启）</label>
      <select id="f-checkin">
        <option value="on" ${p.checkin ? "selected" : ""}>启用每日打卡</option>
        <option value="off" ${!p.checkin ? "selected" : ""}>不启用</option>
      </select></div>
    ${p.checkin ? checkinCalendarHTML(p) : ""}

    <div class="section-title">◆ 里程碑 <button class="btn small" data-add="milestones">＋ 添加里程碑</button></div>
    <div id="ms-list">${(p.milestones || []).map((m) => itemRow("milestones", m, true)).join("") || '<div class="muted" style="padding:4px 0 8px">暂无里程碑</div>'}</div>

    <div class="section-title">▸ 子任务 <button class="btn small" data-add="tasks">＋ 添加子任务</button></div>
    <div id="tk-list">${(p.tasks || []).map((t) => itemRow("tasks", t, false)).join("") || '<div class="muted" style="padding:4px 0 8px">暂无子任务</div>'}</div>
  `;

  /* 字段绑定 */
  const bindField = (id, key, transform) =>
    document.getElementById(id)?.addEventListener("input", (e) => {
      p[key] = transform ? transform(e.target.value) : e.target.value;
      touch();
    });
  bindField("f-name", "name");
  bindField("f-domain", "domain");
  bindField("f-status", "status");
  bindField("f-start", "startDate");
  bindField("f-target", "targetDate");
  bindField("f-def", "definition");
  bindField("f-notes", "notes");
  document.getElementById("f-pmode")?.addEventListener("change", (e) => {
    p.progressMode = e.target.value;
    touch();
  });
  document.getElementById("f-checkin")?.addEventListener("change", (e) => {
    p.checkin = e.target.value === "on";
    if (p.checkin && !Array.isArray(p.checkins)) p.checkins = [];
    touch();
    renderDrawer();
  });
  document.getElementById("f-prog")?.addEventListener("input", (e) => {
    p.progressValue = Math.max(0, Math.min(100, +e.target.value || 0));
    touch();
  });

  document.getElementById("d-close").addEventListener("click", closeDetail);
  document.getElementById("d-del").addEventListener("click", () => {
    if (!confirm(`确定删除「${p.name}」？此操作会写入数据文件，不可撤销（建议先备份 data.json）。`)) return;
    data.projects = data.projects.filter((x) => x.id !== p.id);
    closeDetail();
    touch(true);
  });

  $drawer.querySelectorAll("[data-add]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const arrName = btn.dataset.add;
      if (!Array.isArray(p[arrName])) p[arrName] = [];
      p[arrName].push({ id: uid(), title: "", due: "", done: false });
      renderDrawer();
      touch();
    })
  );

  /* 里程碑/任务行的编辑 */
  ["ms-list", "tk-list"].forEach((listId) => {
    const listEl = document.getElementById(listId);
    if (!listEl) return;
    listEl.querySelectorAll(".item-row").forEach((rowEl) => {
      const arrName = rowEl.dataset.arr;
      const arr = p[arrName] || (p[arrName] = []);
      const item = arr.find((x) => x.id === rowEl.dataset.iid);
      if (!item) return;
      rowEl.querySelectorAll("[data-k]").forEach((inp) =>
        inp.addEventListener("input", () => {
          item[inp.dataset.k] = inp.type === "checkbox" ? inp.checked : inp.value;
          if (inp.type === "checkbox" && inp.checked && !item.title) item.title = inp.dataset.k ? "" : "";
          touch();
          if (inp.type === "checkbox") {
            inp.closest(".item-row").querySelector('[data-k="title"]').classList.toggle("title-done", item.done);
          }
        })
      );
      rowEl.querySelector(".del")?.addEventListener("click", () => {
        p[arrName] = arr.filter((x) => x.id !== item.id);
        touch();
        renderDrawer();
      });
    });
  });

  bindCheckinCalendar(p);
}

/* 有改动时：先渲染主视图（抽屉独立，不影响正在输入的表单），再防抖保存 */
function touch() {
  render();
  markSaving();
}

/* ---------- 新建 ---------- */
document.getElementById("btn-add").addEventListener("click", () => {
  const p = {
    id: uid(),
    name: "",
    domain: "事业",
    status: "构想",
    startDate: today(),
    targetDate: "",
    progressMode: "manual",
    progressValue: 0,
    definition: "",
    notes: "",
    milestones: [],
    tasks: [],
  };
  data.projects.push(p);
  touch(true);
  openDetail(p.id);
});

/* ---------- 视图切换 ---------- */
document.querySelectorAll(".view-btn").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".view-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentView = btn.dataset.view;
    render();
  })
);

function render() {
  if (currentView === "timeline") renderTimeline();
  else renderDashboard();
}

/* ---------- 登录模块 ---------- */
let authState = { loginRequired: false, loggedIn: false };

function openModal(id) { document.getElementById(id).classList.remove("hidden"); }
function closeModal(id) { document.getElementById(id).classList.add("hidden"); }

function showLogin(err) {
  document.getElementById("login-msg").textContent = err || "";
  openModal("login-overlay");
}
async function doLogin() {
  const u = document.getElementById("login-user").value.trim();
  const p = document.getElementById("login-pass").value;
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: u, password: p }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    showLogin(e.error || "登录失败");
    return;
  }
  const data = await res.json();
  authState = { loginRequired: true, loggedIn: true, username: u, usingInitialPassword: !!data.usingInitialPassword };
  closeModal("login-overlay");
  document.getElementById("login-pass").value = "";
  await initApp();
  if (data.usingInitialPassword) {
    openModal("pw-overlay");
    document.getElementById("pw-msg").textContent = "你仍在使用初始密码（可查看 data/auth.json），请立即修改";
  }
}
function pwStrengthLocal(pw) {
  const reasons = [];
  if (typeof pw !== "string" || pw.length < 12) reasons.push("长度至少 12 位");
  if (!/[a-z]/.test(pw || "")) reasons.push("需含小写字母");
  if (!/[A-Z]/.test(pw || "")) reasons.push("需含大写字母");
  if (!/[0-9]/.test(pw || "")) reasons.push("需含数字");
  if (!/[^A-Za-z0-9]/.test(pw || "")) reasons.push("需含特殊字符");
  return reasons;
}
async function doChangePassword() {
  const $msg = document.getElementById("pw-msg");
  const cur = document.getElementById("pw-current").value;
  const n1 = document.getElementById("pw-new").value;
  const n2 = document.getElementById("pw-confirm").value;
  if (n1 !== n2) { $msg.textContent = "两次输入的新密码不一致"; return; }
  const bad = pwStrengthLocal(n1);
  if (bad.length) { $msg.textContent = "新密码强度不足：" + bad.join("、"); return; }
  const res = await fetch("/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword: cur, newPassword: n1 }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    $msg.textContent = e.error || "修改失败";
    return;
  }
  ["pw-current", "pw-new", "pw-confirm"].forEach((id) => (document.getElementById(id).value = ""));
  $msg.textContent = "";
  authState.usingInitialPassword = false;
  closeModal("pw-overlay");
  $saveState.textContent = "密码已修改 ✓";
  setTimeout(() => ($saveState.textContent = ""), 2500);
}
async function doLogout() {
  await fetch("/api/auth/logout", { method: "POST" });
  location.reload();
}
function renderUserArea() {
  const el = document.getElementById("user-area");
  if (authState.loginRequired && authState.loggedIn) {
    el.innerHTML =
      `<span class="user-name">👤 ${esc(authState.username || "")}</span>` +
      `<button class="btn small" id="btn-chpw">改密</button>` +
      `<button class="btn small" id="btn-logout">退出</button>`;
    document.getElementById("btn-chpw").addEventListener("click", () => {
      openModal("pw-overlay");
      document.getElementById("pw-msg").textContent = "";
    });
    document.getElementById("btn-logout").addEventListener("click", doLogout);
  } else {
    el.innerHTML = "";
  }
}
async function initApp() {
  renderUserArea();
  await load();
  render();
}

/* ---------- 启动 ---------- */
(async () => {
  try {
    authState = await fetch("/api/auth/status").then((r) => r.json());
  } catch { /* 服务异常时仍尝试直接加载 */ }
  document.getElementById("login-submit").addEventListener("click", doLogin);
  ["login-user", "login-pass"].forEach((id) =>
    document.getElementById(id).addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); })
  );
  document.getElementById("pw-submit").addEventListener("click", doChangePassword);
  if (authState.loginRequired && !authState.loggedIn) {
    showLogin();
    document.getElementById("login-user").value = "lanjian";
    document.getElementById("login-user").focus();
    return;
  }
  await initApp();
})();
