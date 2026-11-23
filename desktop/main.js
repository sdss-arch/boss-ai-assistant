const { app, BrowserWindow, WebContentsView, session, shell, Menu, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const logger = require("./src/core/logger");
const store = require("./src/core/store");
const { registerIpc } = require("./src/ipc");

const PANEL_W = 480;
const PANEL_W_MIN = 44;
const CHAT_URL = "https://www.zhipin.com/web/geek/chat";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";

app.commandLine.appendSwitch("disable-blink-features", "AutomationControlled");
// 网络遵循系统设置，避免强制直连导致企业网络或代理环境下白屏。

// 固定 userData 到系统固定目录（%APPDATA%/boss-ai-desktop）：
// portable exe 的 userData 默认跟随 exe 位置，exe 移动/重下会导致登录态与设置丢失，每次都要重新登录。
app.setPath("userData", process.env.BOSS_AI_USER_DATA || path.join(app.getPath("appData"), "boss-ai-desktop"));

// 单实例锁：禁止多开。多个实例并发读写同一 userData 会破坏 Chromium 的
// Cookie/登录态数据库（SQLite 锁冲突），导致"每次都要重新登录"、站点识别不到登录态。
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

let win = null;
let bossView = null;
let panelView = null;
let matchView = null;
let panelCollapsed = false;
let ipc = null;
let networkStatus = { loading: true, error: "" };
let dataLoaded = false;

function layoutViews() {
  if (!win || !bossView || !panelView) return;
  const b = win.getContentBounds();
  const pw = panelCollapsed ? PANEL_W_MIN : PANEL_W;
  bossView.setBounds({ x: 0, y: 0, width: b.width - pw, height: b.height });
  panelView.setBounds({ x: b.width - pw, y: 0, width: pw, height: b.height });
  if (ipc) ipc.applyZoom();
}

function setCollapsed(v) {
  panelCollapsed = !!v;
}

// ---------- BOSS 页注入（content script + chrome.* 桥） ----------
function injectBossHelper(webContents) {
  const shim = `
window.__bossAiDesktop = true;
if (!window.__bossAiInjected) {
window.__bossAiInjected = true;
if (!window.chrome) window.chrome = {};
if (!window.chrome.storage) {
  const bridge = window.__bossBridge;
  const storageLocal = {
    get: (k) => bridge.storeGet(k),
    set: (o) => bridge.storeSet(o),
    remove: (k) => bridge.storeRemove(k)
  };
  window.chrome.storage = {
    local: storageLocal,
    onChanged: {
      addListener: (cb) => bridge.onStoreChanged((key, val) => cb({ [key]: { newValue: val } }, "local"))
    }
  };
  window.chrome.runtime = {
    id: "boss-ai-desktop",
    sendMessage: (msg) => bridge.sendToMain(msg),
    onMessage: {
      addListener: (cb) => {
        bridge.onPageMsg((id, payload) => {
          let sent = false;
          const sendResponse = (res) => { if (!sent) { sent = true; bridge.replyToMain(id, res); } };
          try {
            const ret = cb(payload, {}, sendResponse);
            if (ret === true) return;
            if (!sent) sendResponse(ret);
          } catch (err) { if (!sent) sendResponse({ error: String((err && err.message) || err) }); }
        });
      }
    }
  };
}
}
`;
  const contentSrc = fs.readFileSync(
    fs.existsSync(path.join(__dirname, "content", "content.js"))
      ? path.join(__dirname, "content", "content.js")
      : path.join(__dirname, "..", "content", "content.js"),
    "utf8"
  );
  const wrapped =
    shim +
    "\n;(function(){\ntry {\n" +
    fs.readFileSync(path.join(__dirname, "src", "core", "greeting-format.js"), "utf8") + "\n" +
    fs.readFileSync(path.join(__dirname, "content", "online-resume.js"), "utf8") + "\n" +
    contentSrc +
    "\n} catch (err) { return 'CONTENT_SCRIPT_ERROR: ' + ((err && err.stack) || err); }\n})();";
  webContents.executeJavaScript(wrapped, true).then((ret) => {
    if (typeof ret === "string" && ret.indexOf("CONTENT_SCRIPT_ERROR:") === 0) {
      logger.error("main", "inject content failed:", ret);
    }
  }).catch((e) => {
    logger.error("main", "inject content failed:", e.message, "| isLoading=", webContents.isLoading(), "| url=", webContents.getURL());
  });
}

// ---------- 窗口 ----------
function createWindow() {
  win = new BrowserWindow({
    show: process.env.BOSS_AI_TEST_HEADLESS !== "1",
    width: 1560,
    height: 1000,
    minWidth: 1180,
    minHeight: 720,
    title: "BOSS直聘 AI 助手",
    autoHideMenuBar: true,
    backgroundColor: "#f6f7f9"
  });

  bossView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, "preload-boss.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  panelView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, "preload-panel.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const external = url => { if (/^https?:\/\//.test(url)) shell.openExternal(url).catch(e => logger.warn("navigation", e.message)); };
  panelView.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: "deny" }; });
  panelView.webContents.on("will-navigate", (event, url) => { event.preventDefault(); external(url); });
  win.contentView.addChildView(bossView);
  win.contentView.addChildView(panelView);

  // 隐藏后台窗口：岗位匹配用（搜索职位库，不打扰主视图）
  matchView = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  matchView.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  const layout = () => layoutViews();
  layout();
  win.on("resize", layout);

  const isZhipin = (url) => {
    try { return /(^|\.)zhipin\.com$/.test(new URL(url).hostname); }
    catch (e) { return false; }
  };
  const isXhs = (url) => {
    try { return /(^|\.)xiaohongshu\.com$/.test(new URL(url).hostname); }
    catch (e) { return false; }
  };

  bossView.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) {
      if (isZhipin(url) || isXhs(url)) bossView.webContents.loadURL(url);
      else shell.openExternal(url);
    }
    return { action: "deny" };
  });
  bossView.webContents.on("will-navigate", (e, url) => {
    if (/^https?:\/\//.test(url) && !isZhipin(url) && !isXhs(url)) { e.preventDefault(); shell.openExternal(url); }
  });
  bossView.webContents.on("console-message", (event) => {
    try {
      const d = event && typeof event === "object" ? event : { message: String(event) };
      if (d.level >= 3 || /error|exception|uncaught/i.test(String(d.message))) {
        logger.error("main", "renderer console:", d.message);
      }
    } catch (err) { /* 忽略日志异常 */ }
  });

  bossView.webContents.on("did-finish-load", () => {
    const host = (() => { try { return new URL(bossView.webContents.getURL()).hostname; } catch (e) { return ""; } })();
    if (/(^|\.)zhipin\.com$/.test(host)) {
      setTimeout(() => { injectBossHelper(bossView.webContents); if (ipc) ipc.applyZoom(); }, 900);
    } else if (ipc) {
      ipc.applyZoom();
    }
  });

  function reportNetwork(next) {
    networkStatus = next;
    if (!panelView.webContents.isDestroyed()) panelView.webContents.send("boss:status", next);
  }
  bossView.webContents.on("did-start-loading", () => reportNetwork({ loading: true, error: "" }));
  bossView.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    logger.error("navigation", "load failed", code, description);
    reportNetwork({ loading: false, error: description + " (" + code + ")", url });
  });
  bossView.webContents.on("did-finish-load", () => { if (!bossView.webContents.getURL().startsWith("chrome-error:")) reportNetwork({ loading: false, error: "" }); });
  bossView.webContents.on("render-process-gone", (_event, details) => {
    reportNetwork({ loading: false, error: "网页进程已退出：" + details.reason });
  });
  ipc = registerIpc({ win, bossView, panelView, matchView, layoutViews, setCollapsed, getNetworkStatus: () => networkStatus });

  bossView.webContents.on("ipc-message", (_e, channel, ...args) => {
    if (channel === "boss:reply" && _e.sender === bossView.webContents && _e.senderFrame === bossView.webContents.mainFrame && /(^|\.)zhipin\.com$/.test((() => { try { return new URL(_e.senderFrame.url).hostname; } catch { return ""; } })())) {
      const [id, res] = args;
      ipc.dispatchToBossReply(id, res);
    }
  });

  panelView.webContents.loadFile(path.join(__dirname, "panel.html"));
  bossView.webContents.loadURL(CHAT_URL).catch(e => logger.warn("navigation", e.message));

  win.on("closed", () => {
    win = null;
    // 关闭主窗口即退出整个应用：销毁后台隐藏窗口（岗位匹配用），
    // 否则 window-all-closed 不触发，主进程与后台进程会一直驻留内存。
    if (matchView && !matchView.isDestroyed()) matchView.destroy();
    matchView = null;
  });
}

// ---------- 启动 ----------
process.on("uncaughtException", (err) => {
  logger.error("main", "uncaughtException:", (err && (err.stack || err.message)) || err);
});
process.on("unhandledRejection", (reason) => {
  logger.error("main", "unhandledRejection:", (reason && (reason.stack || reason.message)) || reason);
});

app.whenReady().then(() => {
  if (!gotTheLock) return; // 已有实例在运行，本实例待退出
  logger.init({ dir: path.join(app.getPath("userData"), "logs"), level: "info" });
  logger.info("main", "app starting, version=", app.getVersion());
  try { store.load(); dataLoaded = true; }
  catch (e) { dialog.showErrorBox("无法读取本地设置", e.message); app.quit(); return; }
  session.defaultSession.setUserAgent(UA);
  Menu.setApplicationMenu(null);
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
  if (dataLoaded) {
    try { store.flush(); } catch (e) { logger.error("store", "退出时保存失败", e.message); }
  }
});
