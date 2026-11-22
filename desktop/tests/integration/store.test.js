const fs = require("fs"), path = require("path"), os = require("os");
let mockDataDir;
jest.mock("electron", () => ({ app: { getPath: () => mockDataDir }, safeStorage: {
  isEncryptionAvailable: () => true,
  encryptString: text => Buffer.from("protected:" + text),
  decryptString: buffer => buffer.toString().replace(/^protected:/, "")
} }));
const store = require("../../src/core/store");
beforeEach(() => { mockDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-store-test-")); store.load(); });
afterEach(() => { store.flush(); fs.rmSync(mockDataDir, { recursive: true, force: true }); });
test("读取后修改对象仍会触发保存，传入对象后续修改不污染存储", () => {
  store.set({ bossAiSettings: { bossZoom: 1 }, bossAiAgentLog: [] }); store.flush();
  const settings = store.getSettings(); settings.bossZoom = 1.25;
  expect(store.set({ bossAiSettings: settings })).toEqual(["bossAiSettings"]);
  settings.bossZoom = 2;
  const log = store.get("bossAiAgentLog"); log.push({ type: "done" }); store.set({ bossAiAgentLog: log }); store.flush();
  store.load(); expect(store.getSettings().bossZoom).toBe(1.25); expect(store.get("bossAiAgentLog")).toHaveLength(1);
});
test("旧明文密钥迁移后，主文件与备份都不含明文", () => {
  const file = path.join(mockDataDir, "settings.json");
  fs.writeFileSync(file, JSON.stringify({ bossAiSettings: { apiKey: "test-secret-key" } }));
  store.load(); store.flush();
  expect(JSON.parse(fs.readFileSync(file)).bossAiSettings.apiKey).toBeUndefined();
  expect(JSON.parse(fs.readFileSync(file + ".bak")).bossAiSettings.apiKey).toBeUndefined();
  store.load(); expect(store.getSettings().apiKey).toBe("test-secret-key");
});
test("主文件损坏时恢复备份；两个文件均损坏时拒绝静默清空", () => {
  store.set({ example: "old" }); store.flush(); store.set({ example: "new" }); store.flush();
  const file = path.join(mockDataDir, "settings.json"); fs.writeFileSync(file, "broken");
  store.load(); expect(store.get("example")).toBe("old");
  fs.writeFileSync(file + ".bak", "broken"); expect(() => store.load()).toThrow("配置及备份无法读取");
});
