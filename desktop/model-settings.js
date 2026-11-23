(() => {
  const sdk = window.panelApi, el = id => document.getElementById(id);
  let active = null, profiles = {}, timer, saving = 0, revision = 0, queue = Promise.resolve();
  const options = el("provider");
  for (const [id, provider] of Object.entries(ModelConfig.providers)) {
    const option = document.createElement("option"); option.value = id; option.textContent = provider.name; options.appendChild(option);
  }
  function fields(provider = el("provider").value) {
    return ModelConfig.connection({ provider, baseUrl: el("modelBaseUrl").value, model: el("model").value.trim(), apiKey: el("apiKey").value.trim(),
      freeOnly: el("modelFreeOnly").checked, modelTimeoutMs: Number(el("modelTimeout").value) * 1000,
      contextSize: Number(el("modelContext").value), maxOutputTokens: Number(el("modelOutput").value) });
  }
  function display(config) {
    active = config.provider;
    el("provider").value = active; el("modelBaseUrl").value = config.baseUrl; el("model").value = config.model;
    el("apiKey").value = config.apiKey; el("modelFreeOnly").checked = config.freeOnly;
    el("modelTimeout").value = config.timeoutMs / 1000; el("modelContext").value = config.contextSize; el("modelOutput").value = config.maxOutputTokens;
    el("modelProviderHint").textContent = ModelConfig.providers[active].hint;
    el("modelLocalGuide").hidden = active !== "ollama";
    el("apiTestStatus").textContent = ""; el("modelDiscoveredField").hidden = true; el("modelSuggestions").textContent = "";
  }
  function load(settings = {}) {
    profiles = JSON.parse(JSON.stringify(settings.modelProfiles || {}));
    const config = ModelConfig.resolve(settings);
    profiles[config.provider] = ModelConfig.connection(settings);
    display(config);
  }
  async function save() {
    const data = fields();
    profiles[data.provider] = data;
    saving++;
    try {
      await sdk.patchSettings({ ...data, modelProfiles: { ...profiles } });
      el("modelSaveStatus").textContent = ModelConfig.ready(data) ? "模型配置已自动保存。" : "配置已保存，请选择模型、填写所需 Key 并测试连接。";
    } finally { saving--; }
  }
  function soon() {
    clearTimeout(timer); const token = ++revision;
    el("modelSaveStatus").textContent = "正在保存…";
    timer = setTimeout(() => { queue = queue.catch(() => {}).then(async () => {
      if (token !== revision) return;
      try { await save(); } catch (err) { el("modelSaveStatus").textContent = err.message; }
    }); }, 500);
  }
  async function readModels() {
    const button = el("btnReadModels"), message = el("apiTestStatus");
    button.disabled = true; message.textContent = "正在向当前服务读取模型列表…";
    try {
      const draft = fields();
      await save();
      const result = await sdk.listModels(draft);
      if (!result.ok) throw new Error(result.error);
      if (draft.provider !== active || fields().baseUrl !== draft.baseUrl) return;
      const models = result.models || [];
      el("modelSuggestions").textContent = ""; el("modelDiscovered").textContent = "";
      for (const model of models) {
        const option = document.createElement("option"); option.value = model.id;
        option.textContent = model.id + (model.size ? " · " + (model.size / 1024 ** 3).toFixed(1) + " GB" : "");
        el("modelDiscovered").appendChild(option);
        const hint = document.createElement("option"); hint.value = model.id; el("modelSuggestions").appendChild(hint);
      }
      el("modelDiscoveredField").hidden = !models.length;
      if (!el("model").value.trim() && models.length) { el("model").value = models[0].id; await save(); }
      if (models.some(m => m.id === el("model").value)) el("modelDiscovered").value = el("model").value;
      message.textContent = models.length ? "读取到 " + models.length + " 个模型。请选择适合文本对话的模型，再测试连接。" : "服务可连接，但没有可用模型。请先下载、加载本地模型，或检查服务商权限和免费筛选条件。";
    } catch (err) { message.textContent = "读取失败：" + err.message; }
    finally { button.disabled = false; }
  }
  async function test() {
    const button = el("btnTestApi"), message = el("apiTestStatus"); button.disabled = true;
    try {
      const draft = fields(); ModelConfig.validate(ModelConfig.resolve(draft));
      await save(); message.textContent = "正在实际调用所选模型，首次加载本地模型可能较慢…";
      const result = await sdk.testApi(draft);
      if (!result.ok) throw new Error(result.error);
      message.textContent = "连接正常 · " + result.provider + " / " + result.model + "：" + result.text;
    } catch (err) { message.textContent = "连接失败：" + err.message; }
    finally { button.disabled = false; }
  }
  el("provider").onchange = () => {
    try {
      if (active) profiles[active] = fields(active);
      const provider = el("provider").value;
      display(ModelConfig.resolve(profiles[provider] || { provider })); soon();
    } catch (err) { el("modelSaveStatus").textContent = err.message; }
  };
  for (const id of ["apiKey", "model"]) el(id).addEventListener("input", soon);
  for (const id of ["modelBaseUrl", "modelFreeOnly", "modelTimeout", "modelContext", "modelOutput"]) el(id).addEventListener("change", soon);
  el("modelDiscovered").onchange = () => { el("model").value = el("modelDiscovered").value; soon(); };
  el("btnReadModels").onclick = readModels;
  el("btnModelHelp").onclick = () => sdk.modelHelp(el("provider").value);
  el("btnUseLocalModel").onclick = () => { el("provider").value = "ollama"; el("provider").onchange(); };
  function snapshot() { const current = fields(); return { ...current, modelProfiles: { ...profiles, [current.provider]: current } }; }
  window.ModelSettings = { load, fields, snapshot, save, test, get saving() { return saving > 0; } };
})();
