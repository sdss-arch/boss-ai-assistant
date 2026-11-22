const fs = require("fs");
const path = require("path");
const { app, safeStorage } = require("electron");
const logger = require("./logger");

let store = {};
let writeTimer = null;
const copy = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function storeFile() {
  return path.join(app.getPath("userData"), "settings.json");
}

function load() {
  store = {};
  let loaded = false;
  for (const file of [storeFile(), storeFile() + ".bak"]) {
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!data || Array.isArray(data) || typeof data !== "object") throw new Error("配置格式无效");
      if (data.bossAiSettings?.encryptedApiKey) {
        data.bossAiSettings.apiKey = safeStorage.decryptString(Buffer.from(data.bossAiSettings.encryptedApiKey, "base64"));
        delete data.bossAiSettings.encryptedApiKey;
      }
      store = data;
      loaded = true;
      if (file.endsWith(".bak")) logger.warn("store", "配置损坏，已从备份恢复");
      break;
    } catch (e) {
      if (e.code !== "ENOENT") logger.error("store", "load failed:", e.message);
    }
  }
  if (!loaded && (fs.existsSync(storeFile()) || fs.existsSync(storeFile() + ".bak"))) throw new Error("配置及备份无法读取。已保留原文件，请检查 logs/app.log，避免覆盖已有数据。");
  logger.info("store", "loaded keys:", Object.keys(store).join(",") || "(empty)");
  return copy(store);
}

function protectKey(data) {
  if (data.bossAiSettings?.apiKey) {
    if (!safeStorage?.isEncryptionAvailable()) throw new Error("系统密钥保护不可用，无法安全保存 API Key");
    data.bossAiSettings.encryptedApiKey = safeStorage.encryptString(data.bossAiSettings.apiKey).toString("base64");
    delete data.bossAiSettings.apiKey;
  }
  return data;
}

function flush() {
  clearTimeout(writeTimer);
  writeTimer = null;
  const data = copy(store);
  protectKey(data);
  const file = storeFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  // 仅备份有效配置，避免将损坏文件覆盖到恢复副本。
  if (fs.existsSync(file)) {
    try {
      const old = JSON.parse(fs.readFileSync(file, "utf8"));
      fs.writeFileSync(file + ".bak", JSON.stringify(protectKey(old), null, 2), "utf8");
    } catch (e) {
      logger.warn("store", "保留现有备份:", e.message);
    }
  }
  fs.renameSync(tmp, file);
}

function persist() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try { flush(); } catch (e) { logger.error("store", "write failed:", e.message); }
  }, 150);
}

function get(key) {
  return copy(store[key]);
}

function set(obj) {
  const changed = [];
  for (const k of Object.keys(obj || {})) {
    if (["__proto__", "constructor", "prototype"].includes(k)) throw new Error("非法设置字段");
    if (JSON.stringify(store[k]) !== JSON.stringify(obj[k])) changed.push(k);
    store[k] = copy(obj[k]);
  }
  if (changed.length) persist();
  return changed;
}

function remove(key) {
  const existed = key in store;
  delete store[key];
  if (existed) persist();
  return existed;
}

function getSettings() {
  return get("bossAiSettings") || {};
}

/**
 * 解析当前生效的简历文本（多简历支持）：
 * - 优先取 activeResumeId 命中的简历；
 * - 无命中取 resumes[0]；
 * - 无 resumes 时回退旧字段 resumeText（迁移兼容）。
 */
function resolveResume(settings) {
  const s = settings || {};
  const list = Array.isArray(s.resumes) ? s.resumes : [];
  const active = list.find((r) => r && r.id === s.activeResumeId) || list[0];
  if (active && String(active.text || "").trim()) return active.text;
  for (const r of list) {
    if (r && String(r.text || "").trim()) return r.text;
  }
  return String(s.resumeText || "");
}

module.exports = { load, get, set, remove, getSettings, resolveResume, flush };
