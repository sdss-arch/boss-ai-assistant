const logger = require("./logger");
const Models = require("./model-config");
const DEFAULT_MODEL = "deepseek-chat";
let usageStat = { calls: 0, tokens: 0, errors: 0 };

function buildBody(model, messages, temperature) {
  const m = model || DEFAULT_MODEL;
  const body = { model: m, messages, stream: false };
  if (!/reasoner/i.test(m)) body.temperature = temperature ?? 0.7;
  return body;
}
function request(config, messages, temperature, json, reasoningEffort, responseSchema) {
  const headers = { "Content-Type": "application/json" };
  if (config.protocol === "gemini") {
    headers["x-goog-api-key"] = config.apiKey;
    const system = messages.filter(m => m.role === "system").map(m => m.content).join("\n");
    const body = { contents: messages.filter(m => m.role !== "system").map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: String(m.content) }] })), generationConfig: { temperature: temperature ?? 0.7, maxOutputTokens: config.maxOutputTokens } };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (json) body.generationConfig.responseMimeType = "application/json";
    return { url: config.baseUrl + "/models/" + encodeURIComponent(config.model.replace(/^models\//, "")) + ":generateContent", headers, body };
  }
  if (config.apiKey) headers.Authorization = "Bearer " + config.apiKey;
  if (config.protocol === "ollama") {
    const body = { model: config.model, messages, stream: false, options: { temperature: temperature ?? 0.7, num_ctx: config.contextSize, num_predict: config.maxOutputTokens } };
    if (/qwen3|deepseek-r1|gpt-oss/i.test(config.model)) body.think = false;
    if (json) body.format = "json";
    return { url: config.baseUrl + "/api/chat", headers, body };
  }
  const body = buildBody(config.model, messages, temperature);
  body.max_tokens = config.maxOutputTokens;
  if (config.provider === "openrouter" && config.freeOnly) body.provider = { max_price: { prompt: 0, completion: 0, request: 0 }, allow_fallbacks: true };
  if (json && ["deepseek", "lmstudio", "openrouter"].includes(config.provider)) body.response_format = { type: "json_object" };
  if (json && config.provider === "openrouter" && responseSchema) {
    body.response_format = { type: "json_schema", json_schema: { name: "greeting_result", strict: true, schema: responseSchema } };
    body.provider = { ...body.provider, require_parameters: true };
  }
  if (config.provider === "openrouter" && reasoningEffort === "low") body.reasoning = { effort: "low" };
  return { url: config.baseUrl + "/chat/completions", headers, body };
}
function decode(config, data) {
  if (config.protocol === "ollama") return { text: data.message?.content, usage: { prompt_tokens: data.prompt_eval_count || 0, completion_tokens: data.eval_count || 0, total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0) } };
  if (config.protocol === "gemini") return { text: data.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text || "").join(""), usage: { prompt_tokens: data.usageMetadata?.promptTokenCount || 0, completion_tokens: data.usageMetadata?.candidatesTokenCount || 0, total_tokens: data.usageMetadata?.totalTokenCount || 0 } };
  const content = data.choices?.[0]?.message?.content;
  return { text: Array.isArray(content) ? content.map(p => p.text || "").join("") : content, usage: data.usage || {} };
}
function cleanError(error, config) {
  let message = String(error?.message || error);
  if (config.apiKey) message = message.split(config.apiKey).join("[REDACTED]");
  return message;
}
async function jsonRequest(url, options, config) {
  let response;
  try { response = await fetch(url, { ...options, redirect: "error" }); }
  catch (error) {
    if (config.local && (error.cause?.code === "ECONNREFUSED" || error.code === "ECONNREFUSED")) throw new Error("本地模型服务未启动，请先开启 Ollama / LM Studio 服务", { cause: error.cause || error });
    const wrapped = new Error(cleanError(error, config), { cause: error }); wrapped.name = error.name; throw wrapped;
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    let message = data?.error?.message || (typeof data?.error === "string" ? data.error : "HTTP " + response.status);
    if (response.status === 401) message = "API Key 无效，请检查当前服务的 Key 和地域";
    if (response.status === 429) message = "请求限流或免费额度已用尽，请稍后重试；不会切换付费模型";
    const error = new Error(cleanError(message, config)); error.status = response.status;
    if (response.status === 429) {
      const retry = response.headers?.get?.("retry-after");
      const delay = retry ? (Number.isFinite(Number(retry)) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()) : 60000;
      error.retryAfterMs = Math.min(86400000, Math.max(10000, Number.isFinite(delay) ? delay : 60000));
    }
    error.retryable = response.status >= 500; // 429 不立即重试消耗免费额度。
    throw error;
  }
  if (!data) { const error = new Error("服务未返回有效 JSON，请检查 API 地址"); error.retryable = false; throw error; }
  if (data.error) { const error = new Error(cleanError(data.error.message || data.error, config)); error.retryable = false; throw error; }
  return data;
}
async function assertLocalOllama(config, signal) {
  if (config.protocol !== "ollama" || !config.freeOnly) return;
  const data = await jsonRequest(config.baseUrl + "/api/show", { method: "POST", headers: { "Content-Type": "application/json", ...(config.apiKey ? { Authorization: "Bearer " + config.apiKey } : {}) }, body: JSON.stringify({ model: config.model }), signal }, config);
  if (data.remote_host || data.remote_model) { const error = new Error("此 Ollama 模型实际指向云端，仅免费模式已阻止调用"); error.retryable = false; throw error; }
}
async function call(options) {
  const config = Models.validate(Models.resolve(options));
  const { messages, temperature, signal, json } = options;
  if (signal?.aborted) throw new Error("任务已取消");
  const maxRetries = config.local ? 0 : Math.min(3, Math.max(0, options.maxRetries ?? 2));
  const totalTimeout = AbortSignal.timeout(Math.min(1200000, config.timeoutMs * 2));
  const taskSignal = signal ? AbortSignal.any([signal, totalTimeout]) : totalTimeout;
  let lastError;
  let reasoningRetryUsed = false;
  const started = Date.now();
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (taskSignal.aborted) throw new Error(signal?.aborted ? "任务已取消" : "模型请求超时");
    if (attempt) await require("timers/promises").setTimeout(Math.min(15000, 1000 * 2 ** (attempt - 1)), null, { signal: taskSignal });
    const abort = AbortSignal.any([taskSignal, AbortSignal.timeout(config.timeoutMs)]);
    try {
      await assertLocalOllama(config, abort);
      const payload = request(config, messages, temperature, json, options.reasoningEffort, options.responseSchema);
      const data = await jsonRequest(payload.url, { method: "POST", headers: payload.headers, body: JSON.stringify(payload.body), signal: abort }, config);
      const result = decode(config, data);
      if (typeof result.text !== "string" || !result.text.trim()) {
        const exhausted = data.choices?.[0]?.finish_reason === "length" && data.usage?.completion_tokens_details?.reasoning_tokens > 0;
        const error = new Error(exhausted ? "模型将输出额度用于思考而没有正文，请稍后重试或选择其他模型" : "模型未返回正文，请检查所选模型、输出长度及服务日志");
        if (exhausted && config.provider === "openrouter" && config.model === "openrouter/free" && !reasoningRetryUsed) { reasoningRetryUsed = true; error.retryable = true; }
        else error.retryable = false;
        throw error;
      }
      usageStat.calls++; usageStat.tokens += result.usage.total_tokens || 0;
      logger.info("llm", "ok provider=" + config.provider, "model=" + config.model, "tokens=" + (result.usage.total_tokens || 0), "cost=" + (Date.now() - started) + "ms");
      return { ...result, provider: config.provider, model: config.model };
    } catch (err) {
      if (signal?.aborted) throw new Error("任务已取消");
      if (err.retryable === false) { usageStat.errors++; throw err; }
      const timeout = ["AbortError", "TimeoutError"].includes(err.name);
      const refused = err.cause?.code === "ECONNREFUSED" || err.code === "ECONNREFUSED";
      lastError = new Error(timeout ? "模型请求超时，可在高级设置提高等待时间，或换用更小的本地模型" : refused && config.local ? "本地模型服务未启动，请先开启 Ollama / LM Studio 服务" : cleanError(err, config));
      logger.warn("llm", "attempt=" + (attempt + 1), lastError.message);
    }
  }
  usageStat.errors++; throw lastError || new Error("模型调用失败");
}
async function listModels(settings) {
  const config = Models.resolve(settings);
  // 列表不进行推理；只要求有效地址和必要的鉴权。
  if (!config.apiKey && !(config.local && ["ollama", "lmstudio", "custom"].includes(config.provider)) && config.provider !== "openrouter") throw new Error("请先填写当前服务的 API Key");
  const headers = {};
  if (config.apiKey) {
    if (config.protocol === "gemini") headers["x-goog-api-key"] = config.apiKey;
    else headers.Authorization = "Bearer " + config.apiKey;
  }
  const url = config.baseUrl + (config.protocol === "ollama" ? "/api/tags" : "/models");
  const data = await jsonRequest(url, { headers, signal: AbortSignal.timeout(12000) }, config);
  const entries = data.models || data.data || [];
  const models = entries.filter(m => config.protocol !== "gemini" || !m.supportedGenerationMethods || m.supportedGenerationMethods.includes("generateContent")).map(m => ({
    id: String(config.protocol === "ollama" ? m.name : (m.id || m.name || "")).replace(/^models\//, ""),
    name: String(m.displayName || m.name || m.id || ""), size: m.size || null, contextLength: m.context_length || m.inputTokenLimit || null,
    remote: !!(m.remote_host || m.remote_model), pricing: m.pricing || null
  })).filter(m => m.id);
  if (config.provider === "openrouter" && config.freeOnly) {
    const free = models.filter(m => m.id.endsWith(":free") || m.id === "openrouter/free");
    if (!free.some(m => m.id === "openrouter/free")) free.unshift({ id: "openrouter/free", name: "自动选择可用免费模型" });
    return free;
  }
  return config.freeOnly ? models.filter(m => !m.remote && !/cloud/i.test(m.id)) : models;
}
module.exports = { call, listModels, getStats: () => ({ ...usageStat }), buildBody, request, decode, DEFAULT_MODEL };
