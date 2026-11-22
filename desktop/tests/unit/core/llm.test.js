jest.mock("timers/promises", () => ({ setTimeout: jest.fn(async () => {}) }));
const { call } = require("../../../src/core/llm");
afterEach(() => jest.restoreAllMocks());
test("401 不重复请求", async () => {
  const mock = jest.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: { message: "invalid" } }) });
  await expect(call({ apiKey: "test", messages: [] })).rejects.toThrow("API Key 无效");
  expect(mock).toHaveBeenCalledTimes(1);
});
test("临时服务器错误退避后可恢复", async () => {
  const mock = jest.spyOn(global, "fetch").mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) }).mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: "ok" } }] }) });
  await expect(call({ apiKey: "test", messages: [] })).resolves.toMatchObject({ text: "ok" });
  expect(mock).toHaveBeenCalledTimes(2); expect(require("timers/promises").setTimeout).toHaveBeenCalled();
});
test("预先取消的任务不发送请求", async () => {
  const mock = jest.spyOn(global, "fetch"), controller = new AbortController(); controller.abort();
  await expect(call({ apiKey: "test", messages: [], signal: controller.signal })).rejects.toThrow("任务已取消"); expect(mock).not.toHaveBeenCalled();
});
