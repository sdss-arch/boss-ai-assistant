(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ModelConfig = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  const providers = Object.freeze({
    ollama: { name: "Ollama · 本地开源模型", protocol: "ollama", baseUrl: "http://127.0.0.1:11434", model: "", local: true, freeOnly: true, help: "https://ollama.com/download/windows", hint: "无需 API Key。先在 Ollama 加载本地模型，再点读取模型列表；可运行 Qwen、DeepSeek、Llama 等。" },
    lmstudio: { name: "LM Studio · 本地开源模型", protocol: "openai", baseUrl: "http://127.0.0.1:1234/v1", model: "", local: true, freeOnly: true, help: "https://lmstudio.ai/download", hint: "在 LM Studio 中下载并加载模型，开启本地服务；无需云端 API Key。" },
    openrouter: { name: "OpenRouter · 免费云端模型", protocol: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "openrouter/free", freeOnly: true, help: "https://openrouter.ai/collections/free-models/", hint: "需要 OpenRouter Key。仅免费模式只调用 :free 或 openrouter/free，且发送零价格上限。免费额度有频率和每日限制。" },
    deepseek: { name: "DeepSeek", protocol: "openai", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", freeOnly: false, help: "https://platform.deepseek.com/", hint: "原有 DeepSeek 配置保持兼容，按平台价格计费。" },
    siliconflow: { name: "硅基流动 · 开源模型云服务", protocol: "openai", baseUrl: "https://api.siliconflow.cn/v1", model: "", freeOnly: false, help: "https://cloud.siliconflow.cn/models", hint: "读取账号可用模型，价格和赠送额度以平台为准；无法确认零计费时，仅免费模式会阻止调用。" },
    dashscope: { name: "阿里云百炼 · 千问", protocol: "openai", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus", freeOnly: false, help: "https://bailian.console.aliyun.com/", hint: "使用对应地域的 Key 和 API 地址，可填写业务空间专属地址。免费试用额度不等于永久免费。" },
    gemini: { name: "Google Gemini", protocol: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "", freeOnly: false, help: "https://aistudio.google.com/api-keys", hint: "使用 Gemini 原生接口；部分模型和项目有免费额度。应用无法确认项目是否启用付费，因此不将其视为可保证零计费。" },
    custom: { name: "自定义 OpenAI 兼容服务", protocol: "openai", baseUrl: "http://127.0.0.1:8080/v1", model: "", freeOnly: true, local: true, help: "https://github.com/ggml-org/llama.cpp", hint: "可连接 llama.cpp、vLLM 等自建服务。免费模式仅允许本机地址，不会自动转发到其他服务。" }
  });
  function isLoopback(hostname) { return hostname === "localhost" || hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(hostname); }
  function normalizeUrl(value, protocol) {
    const url = new URL(String(value || "").trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("API 地址需为不带账号、查询参数和锚点的 HTTP(S) 地址");
    const privateHost = isLoopback(url.hostname) || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname);
    if (url.protocol === "http:" && !privateHost) throw new Error("公网 API 地址必须使用 HTTPS");
    url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
    if (protocol === "ollama") url.pathname = url.pathname.replace(/\/api(?:\/chat|\/tags)?$/, "");
    return url.href.replace(/\/$/, "");
  }
  function resolve(settings = {}) {
    // 旧版设置含 model/apiKey/简历等字段，保持 DeepSeek；全新空配置优先本地。
    const provider = settings.provider || (Object.keys(settings).length ? "deepseek" : "ollama");
    if (!Object.hasOwn(providers, provider)) throw new Error("未知模型服务，请重新选择");
    const preset = providers[provider];
    const baseUrl = normalizeUrl(settings.baseUrl || preset.baseUrl, preset.protocol);
    return { provider, protocol: preset.protocol, baseUrl, model: String(settings.model ?? preset.model).trim(),
      apiKey: String(settings.apiKey || "").trim(), freeOnly: settings.freeOnly ?? preset.freeOnly,
      local: isLoopback(new URL(baseUrl).hostname), timeoutMs: Math.min(600000, Math.max(5000, Number(settings.modelTimeoutMs) || (preset.local ? 300000 : 120000))),
      contextSize: Math.min(131072, Math.max(2048, Number(settings.contextSize) || 16384)),
      maxOutputTokens: Math.min(32768, Math.max(256, Number(settings.maxOutputTokens) || 8192)) };
  }
  function validate(config, requireModel = true) {
    if (requireModel && !config.model) throw new Error("请先读取模型列表并选择模型，或填写模型 ID");
    if (config.freeOnly) {
      if (config.provider === "openrouter") {
        if (new URL(config.baseUrl).hostname !== "openrouter.ai") throw new Error("仅免费模式下 OpenRouter 必须使用官方地址");
        if (requireModel && config.model !== "openrouter/free" && !config.model.endsWith(":free")) throw new Error("仅免费模式拒绝付费模型，请选择 :free 模型或 openrouter/free");
      } else if (["ollama", "lmstudio", "custom"].includes(config.provider) && config.local) {
        if (/cloud/i.test(config.model)) throw new Error("仅免费模式不能调用云端模型标签，请选择实际下载到本机的模型");
      } else throw new Error("当前服务无法保证零计费。请选择本地模型或 OpenRouter 免费模型；如需调用计费服务，请手动关闭仅免费模式。");
    }
    if (!config.apiKey && !(config.local && ["ollama", "lmstudio", "custom"].includes(config.provider))) throw new Error("未配置当前模型服务的 API Key，请在设置中填写");
    return config;
  }
  function ready(settings) { try { validate(resolve(settings)); return true; } catch { return false; } }
  function connection(settings) {
    const c = resolve(settings);
    return { provider: c.provider, baseUrl: c.baseUrl, model: c.model, apiKey: c.apiKey, freeOnly: c.freeOnly,
      modelTimeoutMs: c.timeoutMs, contextSize: c.contextSize, maxOutputTokens: c.maxOutputTokens };
  }
  function fingerprint(settings) { const c = resolve(settings); return JSON.stringify([c.provider, c.baseUrl, c.model, c.freeOnly, c.contextSize, c.maxOutputTokens]); }
  return { providers, isLoopback, normalizeUrl, resolve, validate, ready, connection, fingerprint };
});
