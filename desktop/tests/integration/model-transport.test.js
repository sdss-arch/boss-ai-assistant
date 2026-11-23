const http = require("http");
const { call, listModels } = require("../../src/core/llm");
let server, baseUrl, seen;
beforeEach(async () => {
  seen = [];
  server = http.createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    seen.push({ path: req.url, method: req.method, headers: req.headers, body });
    res.setHeader("Content-Type", "application/json");
    let data;
    if (req.url === "/api/tags") data = { models: [{ name: "qwen3:4b", size: 2500000000 }, { name: "remote-cloud", remote_host: "https://example.invalid" }] };
    else if (req.url === "/api/show") data = body.model === "remote-alias" ? { remote_host: "https://cloud.invalid", remote_model: "large" } : { details: { family: "qwen3" } };
    else if (req.url === "/api/chat") data = { message: { content: "本地接口已完成调用" }, prompt_eval_count: 11, eval_count: 7 };
    else if (req.url === "/v1/models") data = { data: [{ id: "local-chat" }] };
    else if (req.url === "/v1/chat/completions") data = { choices: [{ message: { content: "兼容接口已完成调用" } }], usage: { total_tokens: 21 } };
    else if (req.url === "/v1beta/models") data = { models: [{ name: "models/gemini-test", supportedGenerationMethods: ["generateContent"] }, { name: "models/embedding", supportedGenerationMethods: ["embedContent"] }] };
    else if (req.url === "/v1beta/models/gemini-test:generateContent") data = { candidates: [{ content: { parts: [{ text: "不应展示的思考", thought: true }, { text: "Gemini 原生接口完成调用" }] } }], usageMetadata: { totalTokenCount: 32 } };
    else { res.statusCode = 404; data = { error: "not found" }; }
    res.end(JSON.stringify(data));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  baseUrl = "http://127.0.0.1:" + server.address().port;
});
afterEach(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
test("真实 HTTP：Ollama 读取本机列表、无 Key 调用、原生 JSON 模式及用量解析", async () => {
  const config = { provider: "ollama", baseUrl, model: "qwen3:4b", freeOnly: true };
  expect((await listModels(config)).map(m => m.id)).toEqual(["qwen3:4b"]);
  const result = await call({ ...config, messages: [{ role: "user", content: "接口测试" }], json: true });
  expect(result.text).toBe("本地接口已完成调用"); expect(result.usage.total_tokens).toBe(18);
  const actual = seen.find(r => r.path === "/api/chat");
  expect(actual.headers.authorization).toBeUndefined();
  expect(actual.body).toMatchObject({ model: "qwen3:4b", stream: false, think: false, format: "json" });
  expect(seen.some(r => r.path === "/api/show")).toBe(true);
});
test("真实 HTTP：LM Studio 及自建兼容服务不需要云端 Key", async () => {
  const config = { provider: "lmstudio", baseUrl: baseUrl + "/v1", model: "local-chat" };
  expect((await listModels(config))[0].id).toBe("local-chat");
  await expect(call({ ...config, messages: [{ role: "user", content: "测试" }] })).resolves.toMatchObject({ text: "兼容接口已完成调用" });
  expect(seen.at(-1).body.model).toBe("local-chat"); expect(seen.at(-1).headers.authorization).toBeUndefined();
});
test("真实 HTTP：Gemini 使用原生请求与认证，提取最终回答并过滤思考字段", async () => {
  const config = { provider: "gemini", baseUrl: baseUrl + "/v1beta", apiKey: "gemini-test-key", model: "gemini-test", freeOnly: false };
  expect((await listModels(config)).map(m => m.id)).toEqual(["gemini-test"]);
  const result = await call({ ...config, messages: [{ role: "system", content: "系统内容" }, { role: "assistant", content: "上文" }, { role: "user", content: "测试" }], json: true });
  expect(result.text).toBe("Gemini 原生接口完成调用"); expect(result.usage.total_tokens).toBe(32);
  const req = seen.at(-1); expect(req.headers["x-goog-api-key"]).toBe("gemini-test-key"); expect(req.headers.authorization).toBeUndefined();
  expect(req.path).not.toContain("key="); expect(req.body.contents[0].role).toBe("model");
  expect(req.body.systemInstruction.parts[0].text).toBe("系统内容"); expect(req.body.generationConfig.responseMimeType).toBe("application/json");
});
test("免费保护：Ollama 云端别名在推理请求发出前被拒绝", async () => {
  await expect(call({ provider: "ollama", baseUrl, model: "remote-alias", freeOnly: true, messages: [] })).rejects.toThrow("实际指向云端");
  expect(seen.map(r => r.path)).toEqual(["/api/show"]);
});
test("免费保护：无法保证零费用的云端模型不会发出推理请求", async () => {
  await expect(call({ provider: "gemini", baseUrl: baseUrl + "/v1beta", apiKey: "test", model: "gemini-test", freeOnly: true, messages: [] })).rejects.toThrow("无法保证零计费");
  expect(seen).toHaveLength(0);
});
