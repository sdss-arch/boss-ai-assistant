jest.mock("timers/promises", () => ({ setTimeout: jest.fn(async () => {}) }));
const { call } = require("../../../src/core/llm");
afterEach(() => jest.restoreAllMocks());
test("OpenRouter选材任务使用实际JSON接口和低推理开销，保留零价格保护", async () => {
  const mock=jest.spyOn(global,"fetch").mockResolvedValue({ok:true,json:async()=>({choices:[{message:{content:'{"versions":[]}'}}]})});
  await call({provider:"openrouter",model:"openrouter/free",apiKey:"test",messages:[],json:true,reasoningEffort:"low"});
  expect(JSON.parse(mock.mock.calls[0][1].body)).toMatchObject({response_format:{type:"json_object"},reasoning:{effort:"low"},provider:{max_price:{prompt:0,completion:0,request:0}}});
});
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
test("免费额度限流保留冷却时间，不立即重试或切换模型", async () => {
  const mock = jest.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 429, headers: { get: () => "120" }, json: async () => ({ error: { message: "limited" } }) });
  await expect(call({ provider: "openrouter", model: "openrouter/free", apiKey: "test", messages: [] })).rejects.toMatchObject({ status: 429, retryAfterMs: 120000 });
  expect(mock).toHaveBeenCalledTimes(1);
});
test("模型列表连接失败给出可操作的本地服务提示", async () => {
  jest.spyOn(global, "fetch").mockRejectedValue(new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } }));
  await expect(require("../../../src/core/llm").listModels({ provider: "ollama" })).rejects.toThrow("本地模型服务未启动");
});

test("结构化招呼语通过OpenRouter原生schema路由，不能静默丢弃结构要求",()=>{
 const {request}=require('../../../src/core/llm'),Models=require('../../../src/core/model-config');
 const config=Models.resolve({provider:'openrouter',model:'openrouter/free',apiKey:'test'}),schema={type:'object',properties:{versions:{type:'array'}},required:['versions'],additionalProperties:false};
 const req=request(config,[],0.5,true,'low',schema);
 expect(req.body.response_format).toMatchObject({type:'json_schema',json_schema:{strict:true,schema}});
 expect(req.body.provider).toMatchObject({require_parameters:true,max_price:{prompt:0,completion:0,request:0}});
});

test("免费自动路由只有思考而无正文时至多重试一次，始终保留零费用限制",async()=>{
 const empty={choices:[{finish_reason:'length',message:{content:null}}],usage:{completion_tokens_details:{reasoning_tokens:8192}}};
 const mock=jest.spyOn(global,'fetch').mockResolvedValueOnce({ok:true,json:async()=>empty}).mockResolvedValueOnce({ok:true,json:async()=>({choices:[{message:{content:'有效正文'}}]})});
 await expect(call({provider:'openrouter',model:'openrouter/free',apiKey:'test',messages:[]})).resolves.toMatchObject({text:'有效正文'});
 expect(mock).toHaveBeenCalledTimes(2);for(const [,options] of mock.mock.calls)expect(JSON.parse(options.body).provider.max_price.completion).toBe(0);
 mock.mockReset().mockResolvedValue({ok:true,json:async()=>empty});
 await expect(call({provider:'openrouter',model:'openrouter/free',apiKey:'test',messages:[]})).rejects.toThrow('思考而没有正文');expect(mock).toHaveBeenCalledTimes(2);
});
