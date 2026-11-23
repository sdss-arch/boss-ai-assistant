const path = require("path"), { pathToFileURL } = require("url");
jest.mock("electron", () => ({ ipcMain: { handle: jest.fn() }, dialog: {}, app: {} }));
jest.mock("../../src/core/store", () => ({ get: jest.fn(() => undefined), set: jest.fn(() => []), remove: jest.fn(), flush: jest.fn(), getSettings: () => ({ apiKey: "test-secret", resumeText: "private resume" }), resolveResume: s => s.resumeText }));
jest.mock("../../src/orchestrator", () => ({ on: jest.fn(), isBusy: () => false }));
jest.mock("../../src/registry", () => ({ list: () => [] }));
jest.mock("../../src/core/image-bank", () => ({ list: () => [] }));
const { ipcMain } = require("electron");
const { registerIpc } = require("../../src/ipc");
let handlers, panel, boss, panelEvent, bossEvent;
beforeEach(() => {
  handlers = new Map(); ipcMain.handle.mockImplementation((key, fn) => handlers.set(key, fn));
  const wc = url => ({ mainFrame: { url }, isDestroyed: () => false, send: jest.fn(), loadURL: jest.fn(() => Promise.resolve()), getURL: () => url });
  panel = { webContents: wc(pathToFileURL(path.resolve(__dirname, "../../panel.html")).href) };
  boss = { webContents: wc("https://www.zhipin.com/job_detail/test.html") };
  panelEvent = { sender: panel.webContents, senderFrame: panel.webContents.mainFrame };
  bossEvent = { sender: boss.webContents, senderFrame: boss.webContents.mainFrame };
  registerIpc({ win: {}, bossView: boss, panelView: panel, layoutViews() {}, setCollapsed() {} });
});
test("网页只获得配置状态，密钥与简历正文不会返回", async () => {
  const result = await handlers.get("store:get")(bossEvent, "bossAiSettings");
  expect(result.bossAiSettings).toMatchObject({ hasApiKey: true, hasResume: true });
  expect(JSON.stringify(result)).not.toContain("test-secret"); expect(JSON.stringify(result)).not.toContain("private resume");
  await expect(handlers.get("store:get")(bossEvent, "bossAiCareerJobs")).rejects.toThrow();
  await expect(handlers.get("store:set")(bossEvent, { bossAiSettings: {} })).rejects.toThrow();
  for (const channel of ["settings:patch", "model:list", "model:help", "api:test"]) await expect(handlers.get(channel)(bossEvent, {})).rejects.toThrow("无权调用");
});
test("非受信来源、子 frame 与网页调用面板能力均被拒绝", async () => {
  const subframe = { ...bossEvent, senderFrame: { url: bossEvent.senderFrame.url } };
  await expect(handlers.get("store:get")(subframe, "bossAiSettings")).rejects.toThrow();
  await expect(handlers.get("img:list")(bossEvent)).rejects.toThrow();
  await expect(handlers.get("agent:list")({ sender: {}, senderFrame: { url: "https://evil.invalid" } })).rejects.toThrow();
});
test("域名伪装的岗位链接不触发导航，合法相对链接正常跳转", async () => {
  const invalid = await handlers.get("boss:open-job")(panelEvent, "https://zhipin.com.evil.invalid/job");
  expect(invalid.ok).toBe(false); expect(boss.webContents.loadURL).not.toHaveBeenCalled();
  const valid = await handlers.get("boss:open-job")(panelEvent, "/job_detail/test.html");
  expect(valid.ok).toBe(true); expect(boss.webContents.loadURL).toHaveBeenCalledWith("https://www.zhipin.com/job_detail/test.html");
});
