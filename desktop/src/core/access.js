const path = require("path");
const { pathToFileURL } = require("url");

const PAGE_KEYS = new Set(["bossAiHistory", "bossAiPendingGreeting", "bossAiAutoFill", "bossAiWidget"]);
function isSite(url, domain) {
  try { const u = new URL(url); return u.protocol === "https:" && (u.hostname === domain || u.hostname.endsWith("." + domain)); }
  catch { return false; }
}
function isPanel(event, view) {
  const wc = view.webContents;
  return event.sender === wc && event.senderFrame === wc.mainFrame &&
    event.senderFrame.url === pathToFileURL(path.join(__dirname, "../../panel.html")).href;
}
function isBoss(event, view) {
  const wc = view.webContents;
  return event.sender === wc && event.senderFrame === wc.mainFrame && isSite(event.senderFrame.url, "zhipin.com");
}
function pageSettings(s, resolveResume) {
  return { hasApiKey: !!s.apiKey, modelReady: require("./model-config").ready(s), hasResume: !!resolveResume(s).trim(), autoReply: s.autoReply !== false,
    cooldown: s.cooldown || 10, maxContext: s.maxContext || 8, notifySound: !!s.notifySound, msgSelector: s.msgSelector || "" };
}
function jobUrl(href) {
  const u = new URL(String(href || ""), "https://www.zhipin.com");
  if (!isSite(u.href, "zhipin.com") || u.username || u.password) throw new Error("仅支持 BOSS 站内 HTTPS 链接");
  return u.href;
}
module.exports = { PAGE_KEYS, isSite, isPanel, isBoss, pageSettings, jobUrl };
