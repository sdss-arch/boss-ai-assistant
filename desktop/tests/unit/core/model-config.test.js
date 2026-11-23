const Models = require("../../../src/core/model-config");
const llm = require("../../../src/core/llm");
const Auto = require("../../../src/core/automation");
test("旧 DeepSeek 配置保持兼容，新空配置优先本地", () => {
  expect(Models.resolve({ apiKey: "old", model: "deepseek-chat" })).toMatchObject({ provider: "deepseek", freeOnly: false });
  expect(Models.resolve({})).toMatchObject({ provider: "ollama", freeOnly: true, apiKey: "" });
  expect(Models.ready({ provider: "ollama", model: "qwen3:4b" })).toBe(true);
  expect(Models.ready({ provider: "deepseek", model: "deepseek-chat" })).toBe(false);
});
test("免费模式阻止付费 OpenRouter 模型，免费请求含服务端零价格上限", () => {
  expect(() => Models.validate(Models.resolve({ provider: "openrouter", model: "paid/model", apiKey: "key" }))).toThrow("拒绝付费模型");
  const c = Models.validate(Models.resolve({ provider: "openrouter", model: "openrouter/free", apiKey: "key" }));
  const request = llm.request(c, [], 0.2);
  expect(request.url).toBe("https://openrouter.ai/api/v1/chat/completions");
  expect(request.body.provider.max_price).toEqual({ prompt: 0, completion: 0, request: 0 });
  expect(request.body.models).toBeUndefined();
});
test("免费本地配置不允许公网模型端点、云端模型标签或 HTTP 公网 Key 传输", () => {
  expect(() => Models.validate(Models.resolve({ provider: "ollama", baseUrl: "https://example.com", model: "local" }))).toThrow("无法保证零计费");
  expect(() => Models.validate(Models.resolve({ provider: "ollama", model: "huge:cloud" }))).toThrow("云端模型标签");
  expect(() => Models.resolve({ provider: "custom", baseUrl: "http://public.example.com/v1" })).toThrow("HTTPS");
});
test("切换服务、端点或模型时不会复用其他模型的自动分析缓存", () => {
  const job = { title: "岗位" };
  const a = Auto.signature(job, { provider: "ollama", model: "same" }, []);
  expect(a).not.toBe(Auto.signature(job, { provider: "lmstudio", model: "same" }, []));
  expect(a).not.toBe(Auto.signature(job, { provider: "ollama", model: "same", baseUrl: "http://127.0.0.1:9000" }, []));
});
