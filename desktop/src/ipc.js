const { ipcMain, dialog, app } = require("electron");
const fs = require("fs");
const path = require("path");
const logger = require("./core/logger");
const store = require("./core/store");
const llm = require("./core/llm");
const Models = require("./core/model-config");
const orchestrator = require("./orchestrator");
const { list: listAgents } = require("./registry");
const imageBank = require("./core/image-bank");
const { PAGE_KEYS, isPanel, isBoss, pageSettings, jobUrl } = require("./core/access");

/**
 * IPC 路由器：所有主进程能力对渲染层的唯一通道。
 * 依赖注入 win/bossView/panelView（由 main 装配，避免循环依赖）。
 */
function registerIpc({ win, bossView, panelView, matchView, layoutViews, setCollapsed, getNetworkStatus }) {
  const pageChannels = new Set(["store:get", "store:set", "store:remove", "boss:page-msg"]);
  function handle(channel, fn) {
    ipcMain.handle(channel, async (event, ...args) => {
      const panel = isPanel(event, panelView);
      if (!panel && !(pageChannels.has(channel) && isBoss(event, bossView))) throw new Error("无权调用此功能");
      if (JSON.stringify(args).length > (panel && channel === "store:set" ? 32 : 2) * 1024 * 1024) throw new Error("请求内容过大");
      return fn(event, ...args);
    });
  }
  function broadcast(key) {
    if (!panelView.webContents.isDestroyed()) panelView.webContents.send("store:changed", key, store.get(key));
    if ((PAGE_KEYS.has(key) || key === "bossAiSettings") && !bossView.webContents.isDestroyed()) {
      const value = key === "bossAiSettings" ? pageSettings(store.getSettings(), store.resolveResume) : store.get(key);
      bossView.webContents.send("store:changed", key, value);
    }
  }
  handle("boss:status", () => getNetworkStatus ? getNetworkStatus() : { loading: false, error: "" });
  const bossActions = new Map();
  let actionSeq = 0;

  function dispatchToBoss(payload, timeoutMs = 10000) {
    if (bossView.webContents.isDestroyed() || !require("./core/access").isSite(bossView.webContents.getURL(), "zhipin.com")) return Promise.resolve({ ok: false, error: "请先加载 BOSS 页面" });
    return new Promise((resolve) => {
      const id = ++actionSeq;
      const timer = setTimeout(() => { bossActions.delete(id); resolve({ ok: false, error: "操作超时" }); }, timeoutMs);
      bossActions.set(id, (res) => { clearTimeout(timer); bossActions.delete(id); resolve(res); });
      bossView.webContents.send("boss:msg", id, payload);
    });
  }

  // ---------- 存储 ----------
  handle("settings:patch", (_e, patch) => {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("设置格式无效");
    const previous = store.getSettings();
    const next = { ...previous, ...patch };
    if (patch.modelProfiles) next.modelProfiles = { ...(previous.modelProfiles || {}), ...patch.modelProfiles };
    store.set({ bossAiSettings: next }); store.flush(); broadcast("bossAiSettings");
    return { ok: true };
  });
  handle("store:get", (e, key) => {
    if (!isPanel(e, panelView)) {
      if (key === "bossAiSettings") return { [key]: pageSettings(store.getSettings(), store.resolveResume) };
      if (!PAGE_KEYS.has(key)) throw new Error("无权读取此数据");
    }
    return { [key]: store.get(key) };
  });
  handle("store:set", (e, obj) => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("设置格式无效");
    if (!isPanel(e, panelView) && Object.keys(obj).some(k => !PAGE_KEYS.has(k))) throw new Error("无权修改此数据");
    const changed = store.set(obj);
    store.flush();
    changed.forEach(broadcast);
    return { ok: true };
  });
  handle("store:remove", (e, key) => {
    if (!isPanel(e, panelView) && !PAGE_KEYS.has(key)) throw new Error("无权删除此数据");
    const existed = store.remove(key);
    store.flush(); broadcast(key);
    return { ok: existed };
  });

  handle("resume:import", async () => {
    try {
      const selected = await dialog.showOpenDialog(win, { properties: ["openFile"], filters: [{ name: "简历", extensions: ["pdf", "docx", "txt", "md"] }] });
      if (selected.canceled) return { ok: true, cancelled: true };
      return { ok: true, ...await require("./core/resume-import").readResume(selected.filePaths[0]) };
    } catch (err) { return { ok: false, error: err.message }; }
  });

  // ---------- 简历图片库 ----------
  handle("img:list", () => ({ ok: true, images: imageBank.list() }));
  handle("img:pick", () => imageBank.pick(win));
  handle("img:del", (_e, id) => ({ ok: imageBank.remove(String(id || "")) }));
  handle("img:read", (_e, id) => {
    const d = imageBank.readDataUrl(String(id || ""));
    return d ? { ok: true, ...d } : { ok: false, error: "图片不存在" };
  });

  // ---------- BOSS 页消息桥 ----------
  handle("boss:page-msg", async (_e, msg) => {
    try {
      if (msg?.type === "page-context-changed") { panelView.webContents.send("boss:context"); return { ok: true }; }
      if (msg && msg.type === "generate-agent") {
        // 招呼语/回复：统一走多智能体编排（GreetingAgent v4 / ReplyAgent v2）
        const settings = store.getSettings();
        if (msg.kind === "greeting") {
          const res = await orchestrator.invoke("greeting", { jd: msg.jd || {}, settings }, { onProgress: () => {} });
          return { ok: true, text: res.text, jd: msg.jd || {} };
        }
        if (msg.kind === "reply") {
          const res = await orchestrator.invoke("reply", { jd: msg.jd || {}, history: msg.history || [], settings }, { onProgress: () => {} });
          return { ok: true, text: res.text, jd: msg.jd || {} };
        }
        return { ok: false, error: "未知生成类型" };
      }
      if (msg && msg.type === "openOptions") {
        panelView.webContents.send("panel:nav", "settings");
        return { ok: true };
      }
      if (msg && msg.type === "openPanel") {
        setCollapsed(false);
        layoutViews();
        panelView.webContents.send("panel:nav", "assist");
        if (win) { win.show(); win.focus(); }
        return { ok: true };
      }
      if (msg && msg.type === "cancel") {
        let cancelled = false;
        try { cancelled = orchestrator.cancel(); } catch (e) {}
        if (matchAbort) { try { matchAbort.abort(); } catch (e) {} cancelled = true; }
        return { ok: true, cancelled };
      }
      // 聊天列表页自动打开第一条会话：合成 click 会被 BOSS 新版页面忽略，须用 sendInputEvent 发真实输入事件
      if (msg && msg.type === "desktop-open-first-chat" && typeof msg.x === "number" && typeof msg.y === "number") {
        if (!bossView || bossView.webContents.isDestroyed()) return { ok: false, error: "页面未就绪" };
        const wc = bossView.webContents;
        const zoom = wc.getZoomFactor() || 1;
        wc.sendInputEvent({ type: "mouseDown", x: Math.round(msg.x * zoom), y: Math.round(msg.y * zoom), button: "left", clickCount: 1 });
        wc.sendInputEvent({ type: "mouseUp", x: Math.round(msg.x * zoom), y: Math.round(msg.y * zoom), button: "left", clickCount: 1 });
        return { ok: true };
      }
      if (msg && msg.type === "list-images") return { ok: true, images: [] };
      if (msg && ["read-image", "pick-image", "delete-image"].includes(msg.type)) {
        panelView.webContents.send("panel:nav", "assist");
        return { ok: false, error: "请在右侧简历图片库操作" };
      }
      return { ok: false, error: "未知消息类型" };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  handle("boss:action", (_e, payload) => {
    if (!bossView || bossView.webContents.isDestroyed()) return { ok: false, error: "BOSS 页面未就绪" };
    const timeout = (payload && payload._timeout) || 10000;
    const { _timeout, ...rest } = payload || {};
    if (rest.type === "send-resume-image") {
      const image = imageBank.readDataUrl(rest.id);
      if (!image) return { ok: false, error: "图片不存在" };
      rest.image = image;
    }
    return dispatchToBoss(rest, Math.max(1000, Math.min(90000, Number(timeout) || 90000)));
  });

  // ---------- 智能体编排 ----------
  handle("agent:list", () => ({ ok: true, agents: listAgents() }));
  handle("agent:invoke", async (_e, req) => {
    const intent = req && req.intent;
    if (!intent) return { ok: false, error: "缺少智能体意图" };
    try {
      const input = { ...((req && req.input) ?? (req && req.task) ?? {}), settings: store.getSettings() };
      const res = await orchestrator.invoke(intent, input, {
        background: intent === "career" && input.task === "auto",
        onProgress: (label, total) => {
          try { panelView.webContents.send("agent:event", { type: "progress", intent, label, total }); } catch (e) {}
        }
      });
      return { ok: true, ...res };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err), code: err.code, status: err.status, retryAfterMs: err.retryAfterMs };
    }
  });
  handle("agent:log", () => ({ ok: true, log: orchestrator.getLog() }));
  handle("auto:record", (_e, input) => {
    const result = require("./core/automation").parse(JSON.stringify(input.result), input.history);
    const recorded = require("./core/auto-record").recordConversation(store, { ...input, result });
    if (recorded.recorded) { store.flush(); broadcast("bossAiCareerJobs"); }
    if (recorded.interviewAdded) broadcast("bossAiInterviews");
    return recorded;
  });
  handle("agent:log-clear", () => ({ ok: true, cleared: orchestrator.clearLog() }));
  handle("agent:stats", () => ({ ok: true, stats: llm.getStats() }));

  // ---------- 停止当前任务（智能体 / 岗位匹配后台检索） ----------
  handle("agent:cancel", () => {
    let cancelled = false;
    try { cancelled = orchestrator.cancel(); } catch (e) {}
    if (matchAbort) {
      try { matchAbort.abort(); } catch (e) {}
      cancelled = true;
    }
    return { ok: true, cancelled };
  });
  handle("agent:current", () => ({
    ok: true,
    current: orchestrator.getCurrent(),
    busy: orchestrator.isBusy()
  }));

  // ---------- API 测试连接 ----------
  handle("model:list", async (_e, draft) => {
    try { return { ok: true, models: await llm.listModels(draft || store.getSettings()) }; }
    catch (err) { return { ok: false, error: err.message }; }
  });
  handle("model:help", (_e, provider) => {
    const url = Models.providers[provider]?.help;
    if (url) require("electron").shell.openExternal(url);
    return { ok: !!url };
  });
  handle("api:test", async (_e, draft) => {
    const s = draft || store.getSettings();
    try {
      const r = await llm.call({
        ...Models.connection(s),
        messages: [{ role: "user", content: "请只回复四个字：连接正常" }],
        temperature: 0,
        maxRetries: 0
      });
      return { ok: true, provider: Models.resolve(s).provider, model: Models.resolve(s).model, text: String(r.text || "").slice(0, 60) };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  // ---------- 尽调报告导出 Markdown ----------
  handle("file:save-report", async (_e, name, content) => {
    try {
      const def = String(name || "尽调报告").replace(/[\\/:*?"<>|]/g, "-").slice(0, 60) + ".md";
      const r = await dialog.showSaveDialog(win, {
        title: "导出报告",
        defaultPath: def,
        filters: [{ name: "Markdown", extensions: ["md"] }, { name: "文本文件", extensions: ["txt"] }]
      });
      if (r.canceled || !r.filePath) return { ok: false, cancelled: true };
      fs.writeFileSync(r.filePath, String(content || ""), "utf8");
      return { ok: true, path: r.filePath };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  // ---------- 日志读取（诊断用） ----------
  handle("log:read", (_e, lines) => {
    try {
      const f = path.join(app.getPath("userData"), "logs", "app.log");
      if (!fs.existsSync(f)) return { ok: true, lines: [], file: f };
      const text = fs.readFileSync(f, "utf8");
      const arr = text.split(/\r?\n/).filter(Boolean);
      return { ok: true, lines: arr.slice(-(Math.max(20, Number(lines) || 100))), file: f };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  // ---------- 岗位匹配（手动 + 定时 + 新匹配提醒） ----------
  const MATCH_SETTINGS_KEY = "bossAiMatchSettings";
  let matchTimer = null;
  let matchLastIds = store.get("bossAiMatchSeenIds") ? new Set(store.get("bossAiMatchSeenIds")) : null;
  let matchRunning = false;
  let matchAbort = null;

  function getMatchSettings() {
    return { enabled: false, intervalMin: 30, threshold: 70, ...(store.get(MATCH_SETTINGS_KEY) || {}) };
  }

  function notifyMatchNew(newOnes, threshold) {
    if (!newOnes || !newOnes.length) return;
    try {
      panelView.webContents.send("match:new", {
        count: newOnes.length,
        threshold,
        items: newOnes
      });
    } catch (e) {}
    logger.info("ipc", "match new found:", newOnes.length);
  }

  /** 在隐藏窗口中搜索职位库：逐关键词 × 翻页抓取 */
  const MATCH_COLLECT_JS = `
  (function () {
    const isVis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const pick = (root, sels) => { for (const s of sels) { const n = root.querySelector(s); if (n) return n; } return null; };
    const txt = (el) => (el ? (el.textContent || "").trim() : "");
    const rows = [];
    for (const li of document.querySelectorAll("li.job-card-box")) {
      if (!isVis(li)) continue;
      const a = li.querySelector("a.job-name");
      const href = a ? (a.getAttribute("href") || "") : "";
      const id = (/\\/job_detail\\/([^.]+)\\.html/.exec(href) || [])[1] || href;
      const title = txt(pick(li, [".job-name", "a.job-name"]));
      if (!title) continue;
      const salaryTxt = txt(li.querySelector(".job-salary")).replace(/[\\uE000-\\uF8FF]/g, (c) => {
        const cp = c.codePointAt(0);
        return cp >= 0xE031 && cp <= 0xE03A ? String(cp - 0xE031) : c;
      });
      const mR = String(salaryTxt).match(/(\\d+)\\s*[-~—至]\\s*(\\d+)\\s*[Kk]/);
      rows.push({
        id: id,
        title: title,
        salary: salaryTxt,
        salaryMin: mR ? Number(mR[1]) : 0,
        salaryMax: mR ? Number(mR[2]) : 0,
        company: txt(pick(li, [".company-name", ".company-info a", ".company-name a"])),
        location: txt(li.querySelector(".company-location")),
        tags: Array.from(li.querySelectorAll(".tag-list li")).map((x) => txt(x)).join("、"),
        href: href
      });
    }
    return rows;
  })()`;

  function sleep(ms) {
    return require("timers/promises").setTimeout(ms);
  }

  /** BOSS 城市代码表（常用城市） */
  const CITY_CODES = {
    "北京": "101010100", "上海": "101020100", "天津": "101030100", "重庆": "101040100",
    "苏州": "101190400", "南京": "101190100", "无锡": "101190200", "常州": "101191100", "南通": "101190500", "徐州": "101190800", "扬州": "101190600", "镇江": "101190300", "盐城": "101190700", "泰州": "101191200", "淮安": "101190900", "连云港": "101191000", "宿迁": "101191300",
    "杭州": "101210100", "宁波": "101210400", "温州": "101210700", "嘉兴": "101210300", "绍兴": "101210500", "金华": "101210900", "台州": "101210600", "湖州": "101210200", "衢州": "101211000", "丽水": "101210800",
    "广州": "101280100", "深圳": "101280600", "珠海": "101280700", "佛山": "101280800", "东莞": "101281600", "中山": "101281700", "惠州": "101280300", "江门": "101281100", "汕头": "101280500", "湛江": "101281000", "肇庆": "101280900",
    "成都": "101270100", "绵阳": "101270400", "德阳": "101272000", "乐山": "101271400",
    "武汉": "101200100", "宜昌": "101200900", "襄阳": "101201100", "荆州": "101200800",
    "西安": "101110100", "咸阳": "101110200", "宝鸡": "101110900",
    "郑州": "101180100", "洛阳": "101180900", "开封": "101180800", "新乡": "101180300",
    "长沙": "101250100", "株洲": "101250300", "湘潭": "101250200",
    "青岛": "101120200", "济南": "101120100", "烟台": "101120500", "潍坊": "101120600", "威海": "101121300",
    "厦门": "101230200", "福州": "101230100", "泉州": "101230500", "漳州": "101230600",
    "合肥": "101220100", "芜湖": "101220300",
    "沈阳": "101070100", "大连": "101070200",
    "昆明": "101290100", "贵阳": "101260100", "南昌": "101240100", "南宁": "101300100", "石家庄": "101090100", "太原": "101100100", "哈尔滨": "101050100", "长春": "101060100", "兰州": "101160100", "海口": "101310100", "乌鲁木齐": "101130100", "呼和浩特": "101080100", "银川": "101170100", "西宁": "101150100", "拉萨": "101140100"
  };

  /** 从补充要求中解析意向城市（如"意向城市：苏州"），返回 BOSS 城市代码或空 */
  function extractCityCodeFromExtra(extra) {
    const t = String(extra || "");
    const m = t.match(/(?:意向|期望|想去|考虑)?\s*(?:城市|地点|工作地|base|所在地|位置)\s*[:：为是]\s*([\u4e00-\u9fa5]{2,4})/) ||
      t.match(/(?:只|就|想)去\s*([\u4e00-\u9fa5]{2,4})(?:工作|发展|那边)?/);
    if (!m) return "";
    const name = m[1].replace(/市$/, "");
    for (const [k, v] of Object.entries(CITY_CODES)) {
      if (name === k || name.includes(k) || k.includes(name)) return v;
    }
    return "";
  }

  async function loadMatchPage(wc, url, signal) {
    const timeout = AbortSignal.timeout(20000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    combined.throwIfAborted();
    let stop;
    const aborted = new Promise((_, reject) => {
      stop = () => { wc.stop(); reject(new Error(signal?.aborted ? "任务已取消" : "岗位页面加载超时")); };
      combined.addEventListener("abort", stop, { once: true });
    });
    try { await Promise.race([wc.loadURL(url), aborted]); }
    finally { combined.removeEventListener("abort", stop); }
  }

  async function enrichJobs(jobs, cfg, signal, onStage) {
    const { jobUrl } = require("./core/access");
    const wc = matchView.webContents;
    const count = Math.min(jobs.length, Math.max(0, Math.min(20, cfg.detailLimit ?? 10)));
    for (let i = 0; i < count; i++) {
      signal.throwIfAborted();
      onStage("补充完整 JD：" + (i + 1) + "/" + count);
      try {
        await loadMatchPage(wc, jobUrl(jobs[i].href), signal);
        await require("timers/promises").setTimeout(900, null, { signal });
        const desc = await wc.executeJavaScript(`(() => { const el = document.querySelector('.job-sec-text, .job-detail-description, .job-detail .text'); return el ? el.innerText.trim() : ''; })()`);
        if (desc) jobs[i].desc = String(desc).slice(0, 6000);
      } catch (err) {
        if (signal.aborted) throw err;
        logger.warn("ipc.match", "详情未获取", err.message);
      }
    }
    return jobs;
  }

  async function searchJobLibrary(matchViewRef, keywords, city, pagesPerWord, onStage, signal) {
    const all = [];
    const seen = new Set();
    const wc = matchViewRef && matchViewRef.webContents;
    if (!wc || wc.isDestroyed()) throw new Error("后台检索窗口未就绪");
    const pages = Math.max(1, Math.min(3, Number(pagesPerWord) || 1));
    for (let i = 0; i < keywords.length; i++) {
      if (signal && signal.aborted) throw new Error("任务已取消");
      const kw = keywords[i];
      for (let pg = 1; pg <= pages; pg++) {
        if (signal && signal.aborted) throw new Error("任务已取消");
        if (onStage) onStage("检索中：" + kw + (pages > 1 ? " · 第" + pg + "页" : "") + "（" + (i + 1) + "/" + keywords.length + " 个关键词）");
        const url = "https://www.zhipin.com/web/geek/jobs?query=" + encodeURIComponent(kw) + "&city=" + encodeURIComponent(city || "101010100") + (pg > 1 ? "&page=" + pg : "");
        await loadMatchPage(wc, url, signal);
        await require("timers/promises").setTimeout(1800, null, { signal });
        if (signal && signal.aborted) throw new Error("任务已取消");
        try {
          const rows = await wc.executeJavaScript(MATCH_COLLECT_JS, true);
          if (Array.isArray(rows)) {
            for (const r of rows) {
              const key = r.id || (r.title + r.company);
              if (seen.has(key)) continue;
              seen.add(key);
              all.push(r);
            }
          }
        } catch (e) {
          logger.warn("ipc.match", "collect failed on page", kw, pg, e.message);
        }
        await require("timers/promises").setTimeout(800 + Math.random() * 600, null, { signal });
      }
    }
    return all;
  }

  /** 后台检索窗口登录/风控检测：无法区分"无岗位"与"未登录/验证码"时给出准确提示 */
  async function detectMatchBlocked(wc) {
    try {
      if (!wc || wc.isDestroyed()) return "后台窗口未就绪";
      const t = await wc.executeJavaScript(
        "(function(){ try { var b = document.body; return b ? b.innerText.slice(0, 4000) : ''; } catch (e) { return ''; } })()",
        true
      );
      const s = String(t || "");
      if (/验证码|安全验证|滑动验证/.test(s)) return "安全验证";
      if (/扫码登录|扫码|登录后|未登录/.test(s) && !/立即登录/.test(s)) return "未登录";
      return "";
    } catch (e) {
      return "";
    }
  }

  async function runMatchOnce({ silent } = {}) {
    if (!silent) await orchestrator.yieldBackground();
    if (matchRunning || orchestrator.isBusy()) {
      const reason = matchRunning ? "上一次匹配尚未结束" : "有其他任务（" + ((orchestrator.getCurrent() || {}).agentName || "智能体") + "）执行中";
      store.set({ bossAiMatchLastSkip: { ts: Date.now(), reason } });
      return { ok: false, error: reason, busy: true };
    }
    if (!bossView || bossView.webContents.isDestroyed()) return { ok: false, error: "BOSS 页面未就绪" };
    const settings = store.getSettings();
    const resumeText = store.resolveResume(settings);
    if (!resumeText || !String(resumeText).trim()) return { ok: false, error: "请先在设置页填写简历" };
    matchRunning = true;
    const matchController = new AbortController();
    matchAbort = matchController;
    try {
      const { extractResumeKeywords } = require("./core/tools");
      const keywords = extractResumeKeywords(resumeText);
      if (!keywords.length) return { ok: false, error: "无法从简历提取技能关键词，请完善简历中的技能/经历描述" };
      const city = (() => {
        const cfg = getMatchSettings();
        if (cfg.city && CITY_CODES[cfg.city.replace(/市$/, "")]) return CITY_CODES[cfg.city.replace(/市$/, "")];
        const fromExtra = extractCityCodeFromExtra(cfg.extra);
        if (fromExtra) return fromExtra;
        try { return new URL(bossView.webContents.getURL()).searchParams.get("city") || "101010100"; } catch (e) { return "101010100"; }
      })();
      const onStage = (label) => {
        try { panelView.webContents.send("agent:event", { type: "progress", intent: "match", label }); } catch (e) {}
      };
      onStage("正在从职位库检索：" + keywords.length + " 个关键词");
      const jobs = await searchJobLibrary(matchView, keywords, city, 1, onStage, matchController.signal);
      if (!jobs.length) {
        const blocked = await detectMatchBlocked(matchView.webContents);
        if (blocked) return { ok: false, error: "职位库检索被拦截：" + blocked + "。请在左侧主窗口正常登录 BOSS 并手动打开一次职位列表后重试" };
        return { ok: false, error: "职位库检索无结果（可能触发验证码，请稍后重试或在 BOSS 页面手动操作一次）" };
      }
      const Career = require("./core/career");
      const cfg = getMatchSettings();
      const ignored = new Set((store.get("bossAiCareerJobs") || []).filter(j => j.excluded).map(Career.identity));
      const available = jobs.filter(j => !ignored.has(Career.identity(j)) && Career.checkConditions(j, cfg).eligible);
      if (!available.length) return { ok: false, error: "候选岗位均不符合硬性条件，或已被标为不感兴趣，请调整条件" };
      // 优先匹配标题命中较多的岗位，避免仅按搜索结果先后截断。
      const relevance = j => keywords.reduce((score, word) => score + (j.title.includes(word) ? 1 : 0), 0);
      available.sort((a, b) => relevance(b) - relevance(a));
      const candidates = await enrichJobs(available.slice(0, 60), cfg, matchController.signal, onStage);
      const eligible = candidates.filter(j => Career.checkConditions(j, cfg).eligible);
      if (!eligible.length) return { ok: false, error: "补充 JD 后未发现符合硬性条件的岗位" };
      onStage("已收集 " + jobs.length + " 个岗位，符合初筛 " + eligible.length + " 个，开始评分");
      const res = await orchestrator.invoke("match", { resumeText, jobs: eligible, extra: cfg.extra, conditions: cfg }, { onProgress: onStage, signal: matchController.signal });
      const matched = res.matched || [];
      const prevIds = matchLastIds || new Set();
      // 首跑基线：仅当存在历史运行记录时才提示"新发现"，避免首次全量弹横幅
      const hasBaseline = !!matchLastIds;
      const newOnes = hasBaseline ? matched.filter((j) => j.score >= cfg.threshold && !prevIds.has(j.id)) : [];
      matchLastIds = new Set([...prevIds, ...matched.map(j => j.id).filter(Boolean)].slice(-5000));
      store.set({ bossAiMatchSeenIds: [...matchLastIds], bossAiMatchLastResult: { ...res, total: jobs.length, ts: Date.now() } });
      if (!silent) notifyMatchNew(newOnes, cfg.threshold);
      store.set({ bossAiMatchLastTs: Date.now(), bossAiMatchLastNew: newOnes.slice(0, 10), bossAiMatchLastSkip: null });
      return {
        ok: true,
        total: jobs.length,
        ts: Date.now(),
        keywords,
        city,
        matched,
        newOnes,
        text: res.text
      };
    } catch (err) {
      if (matchController.signal.aborted) return { ok: false, cancelled: true, error: "已停止" };
      return { ok: false, error: String((err && err.message) || err) };
    } finally {
      matchRunning = false;
      matchAbort = null;
    }
  }

  handle("match:run", async () => {
    const r = await runMatchOnce({ silent: false });
    return r;
  });

  handle("match:schedule", (_e, cfg) => {
    const next = { ...getMatchSettings(), ...(cfg || {}) };
    store.set({ [MATCH_SETTINGS_KEY]: next });
    if (matchTimer) { clearInterval(matchTimer); matchTimer = null; }
    if (next.enabled) {
      const interval = Math.min(1440, Math.max(5, Number(next.intervalMin) || 30)) * 60000;
      matchTimer = setInterval(() => { runMatchOnce({ silent: false }).catch(() => {}); }, interval);
      logger.info("ipc", "match timer started, interval=", interval / 60000, "min");
    }
    return { ok: true, settings: next };
  });

  handle("match:status", () => ({
    ok: true,
    settings: getMatchSettings(),
    lastRunTs: store.get("bossAiMatchLastTs") || null,
    lastNew: store.get("bossAiMatchLastNew") || [],
    lastSkip: store.get("bossAiMatchLastSkip") || null,
    lastResult: store.get("bossAiMatchLastResult") || null
  }));

  // 定时器在注册阶段恢复（应用重启后继续生效）
  {
    const cfg = getMatchSettings();
    if (cfg.enabled) {
      const interval = Math.min(1440, Math.max(5, Number(cfg.intervalMin) || 30)) * 60000;
      matchTimer = setInterval(() => { runMatchOnce({ silent: false }).catch(() => {}); }, interval);
      logger.info("ipc", "match timer restored, interval=", interval / 60000, "min");
    }
  }

  // Agent 事件流 → 面板
  const events = ["agent:start", "agent:done", "agent:error", "agent:cancelled"];
  for (const ev of events) {
    orchestrator.on(ev, (data) => {
      try { panelView.webContents.send("agent:event", { type: ev, ...data }); } catch (e) {}
    });
  }
  logger.info("ipc", "agent events forwarded");

  // ---------- 面板/窗口 ----------
  handle("panel:collapse", () => { setCollapsed(true); layoutViews(); return { ok: true }; });
  handle("panel:expand", () => { setCollapsed(false); layoutViews(); return { ok: true }; });

  handle("win:pin", () => {
    const pinned = !win.isAlwaysOnTop();
    win.setAlwaysOnTop(pinned);
    return { ok: true, pinned };
  });
  handle("win:set-size", (_e, w, h) => {
    win.setSize(w, h);
    return { ok: true };
  });

  // ---------- BOSS 视图控制 ----------
  handle("boss:zoom", (_e, level) => {
    const settings = store.getSettings();
    if (level === "auto") {
      delete settings.bossZoom;
    } else {
      settings.bossZoom = Math.min(2, Math.max(0.5, Number(level) || 1));
    }
    store.set({ bossAiSettings: settings });
    const z = applyZoom();
    broadcast("bossAiSettings");
    return { ok: true, zoom: z, manual: typeof settings.bossZoom === "number" };
  });
  handle("boss:zoom-get", () => {
    const s = store.getSettings();
    return { ok: true, zoom: applyZoom(), manual: typeof s.bossZoom === "number" };
  });
  handle("boss:reload", () => {
    bossView.webContents.reload();
    return { ok: true };
  });
  handle("boss:nav", (_e, dir) => {
    if (dir === "back") bossView.webContents.goBack();
    else if (dir === "forward") bossView.webContents.goForward();
    return { ok: true };
  });
  handle("boss:goto", (_e, url) => {
    bossView.webContents.loadURL(jobUrl(url || "https://www.zhipin.com/web/geek/chat")).catch(e => logger.warn("navigation", e.message));
    return { ok: true };
  });
  // 打开岗位详情（匹配结果跳转）：href 为相对路径，拼全域名导航到主视图
  handle("boss:open-job", (_e, href) => {
    try {
      const h = String(href || "").trim();
      if (!h) return { ok: false, error: "缺少岗位链接" };
      const full = jobUrl(h);
      bossView.webContents.loadURL(full).catch(e => logger.warn("navigation", e.message));
      return { ok: true, url: full };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });
  handle("boss:zoom-apply", () => ({ ok: true, zoom: applyZoom() }));

  // ---------- 小红书舆情采集（主视图内打开，记住原页面一键返回） ----------
  const XHS_SEARCH = "https://www.xiaohongshu.com/search_result?keyword=";
  let xhsReturnUrl = null;
  handle("xhs:open", async (_e, company) => {
    const kw = encodeURIComponent(String(company || "").trim());
    if (!kw) return { ok: false, error: "请输入公司名称" };
    try {
      const cur = bossView.webContents.getURL();
      if (cur && !/xiaohongshu\.com/.test(cur)) xhsReturnUrl = cur;
      bossView.webContents.loadURL(XHS_SEARCH + kw + "&source=web_search_result_notes");
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });
  handle("xhs:back", async () => {
    try {
      const target = xhsReturnUrl || "https://www.zhipin.com/web/geek/chat";
      bossView.webContents.loadURL(target);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });

  function applyZoom() {
    if (!bossView.webContents || bossView.webContents.isDestroyed()) return null;
    const s = store.getSettings();
    let zoom = null;
    if (typeof s.bossZoom === "number" && s.bossZoom >= 0.5 && s.bossZoom <= 2) zoom = s.bossZoom;
    if (zoom === null) {
      const b = win.getContentBounds();
      const pw = (panelView.getBounds() || {}).width || 400;
      const bw = b.width - pw;
      zoom = bw >= 1200 ? 1 : Math.max(0.72, Math.round((bw / 1200) * 100) / 100);
    }
    if (Math.abs((bossView.webContents.getZoomFactor() || 1) - zoom) > 0.01) {
      bossView.webContents.setZoomFactor(zoom);
    }
    return zoom;
  }

  return {
    dispatchToBoss,
    dispatchToBossReply: (id, res) => {
      const cb = bossActions.get(id);
      if (cb) cb(res);
    },
    applyZoom
  };
}

module.exports = { registerIpc };
