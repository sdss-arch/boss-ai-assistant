const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("panelApi", {
  importResume: () => ipcRenderer.invoke("resume:import"),
  recordConversation: input => ipcRenderer.invoke("auto:record", input),
  // 存储
  getStore: (key) => ipcRenderer.invoke("store:get", key),
  setStore: (obj) => ipcRenderer.invoke("store:set", obj),
  patchSettings: patch => ipcRenderer.invoke("settings:patch", patch),
  onPageContext: cb => ipcRenderer.on("boss:context", () => cb()),
  bossStatus: () => ipcRenderer.invoke("boss:status"),
  onBossStatus: cb => ipcRenderer.on("boss:status", (_e, info) => cb(info)),
  // BOSS 页
  bossAction: (payload) => ipcRenderer.invoke("boss:action", payload),
  reloadBoss: () => ipcRenderer.invoke("boss:reload"),
  navBoss: (dir) => ipcRenderer.invoke("boss:nav", dir),
  setBossZoom: (level) => ipcRenderer.invoke("boss:zoom", level),
  getBossZoom: () => ipcRenderer.invoke("boss:zoom-get"),
  gotoChat: () => ipcRenderer.invoke("boss:goto"),
  gotoUrl: (url) => ipcRenderer.invoke("boss:goto", url),
  openJob: (href) => ipcRenderer.invoke("boss:open-job", href),
  // 小红书舆情采集（主视图内打开）
  xhsOpen: (company) => ipcRenderer.invoke("xhs:open", company),
  xhsBack: () => ipcRenderer.invoke("xhs:back"),
  // 智能体编排
  agentInvoke: (intent, input) => ipcRenderer.invoke("agent:invoke", { intent, input }),
  agentList: () => ipcRenderer.invoke("agent:list"),
  agentLog: () => ipcRenderer.invoke("agent:log"),
  agentLogClear: () => ipcRenderer.invoke("agent:log-clear"),
  agentStats: () => ipcRenderer.invoke("agent:stats"),
  agentCancel: () => ipcRenderer.invoke("agent:cancel"),
  agentCurrent: () => ipcRenderer.invoke("agent:current"),
  // 能力
  testApi: draft => ipcRenderer.invoke("api:test", draft),
  listModels: draft => ipcRenderer.invoke("model:list", draft),
  modelHelp: provider => ipcRenderer.invoke("model:help", provider),
  saveReport: (name, content) => ipcRenderer.invoke("file:save-report", name, content),
  readLog: (lines) => ipcRenderer.invoke("log:read", lines),
  // 岗位匹配
  matchRun: () => ipcRenderer.invoke("match:run"),
  matchSchedule: (cfg) => ipcRenderer.invoke("match:schedule", cfg),
  matchStatus: () => ipcRenderer.invoke("match:status"),
  onMatchNew: (cb) => ipcRenderer.on("match:new", (_e, data) => cb(data)),
  // 简历图片库
  getImages: () => ipcRenderer.invoke("img:list"),
  pickImage: () => ipcRenderer.invoke("img:pick"),
  delImage: (id) => ipcRenderer.invoke("img:del", id),
  readImage: (id) => ipcRenderer.invoke("img:read", id),
  // 窗口
  setPin: () => ipcRenderer.invoke("win:pin"),
  collapse: () => ipcRenderer.invoke("panel:collapse"),
  expand: () => ipcRenderer.invoke("panel:expand"),
  // 事件
  onStoreChanged: (cb) => ipcRenderer.on("store:changed", (_e, key, val) => cb(key, val)),
  onNav: (cb) => ipcRenderer.on("panel:nav", (_e, section) => cb(section)),
  onAgentEvent: (cb) => ipcRenderer.on("agent:event", (_e, data) => cb(data))
});
