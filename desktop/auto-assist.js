/* 根据网页变化自动分析、准备草稿和同步跟进；不触发发送或提交。 */
(() => {
  const el = id => document.getElementById(id);
  const info = el("webJobInfo"), host = info.parentElement;
  const controls = document.createElement("div"); controls.className = "auto-controls";
  controls.innerHTML = '<label><input type="checkbox" id="autoAssistEnabled" checked> 自动辅助</label><span id="autoAssistStatus" role="status">等待当前网页</span>';
  info.before(controls);
  const panel = document.createElement("div"); panel.id = "autoAssistResult"; panel.hidden = true;
  panel.innerHTML = '<h3>自动岗位分析</h3><div id="autoAnalysis"></div><details><summary>沟通摘要与下一步</summary><div id="autoSummary"></div></details><details><summary>面试准备要点</summary><div id="autoPreparation"></div></details><div id="autoReplyBox" hidden><h3>待确认回复草稿</h3><textarea id="autoReply" rows="3" aria-label="自动回复草稿"></textarea><div class="btn-row"><button class="btn primary" id="autoFillReply">填入聊天框</button><button class="btn ghost" id="autoUseLatest">使用最新建议</button></div></div>';
  info.after(panel);
  const tools = document.createElement("details"); tools.className = "career-gap";
  tools.innerHTML = '<summary>更多工具</summary>';
  host.insertBefore(tools, el("webMock")); tools.append(el("webJobActions"), el("webFollowup"));
  let settings = {}, enabled = true, initialized = false, cache = {}, current = null, pending = null, inflight = null;
  let sequence = 0, timer, busyReading = false, readAgain = false, lastRequest = 0, failureKey = "", failureUntil = 0, lastJob = "";
  let applied = null, replyEdited = false, replyContext = "";
  const recorded = new Set();
  const filled = new Set();
  const status = text => { el("autoAssistStatus").textContent = text; };
  const hash = async text => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))).map(n => n.toString(16).padStart(2, "0")).join("");
  function schedule(delay = 1200) { clearTimeout(timer); if (enabled && pending) timer = setTimeout(drain, delay); }
  function syncFields(context) {
    const key = Career.identity(context.jd);
    if (lastJob === key) return;
    lastJob = key;
    for (const [id, value] of [["ivCompany", context.jd.company], ["ivTitle", context.jd.title], ["ivJd", context.jd.desc], ["coName", context.jd.company]]) {
      const field = el(id); if (field !== document.activeElement) { field.value = value || ""; field.dataset.fromPage = key; }
    }
    el("coName").dispatchEvent(new Event("change"));
    if (!coBusy) {
      el("coResult").textContent = "";
      api.getStore("bossAiCompanyReports").then(data => {
        const report = data.bossAiCompanyReports?.[context.jd.company]?.[0];
        if (report && lastJob === key && !coBusy) el("coResult").innerHTML = renderMd(report.text);
      }).catch(() => {});
    }
    if (!prepBusy) el("prepResult").textContent = "";
    window.currentCareerJobId = null;
  }
  async function observe() {
    if (!initialized) return;
    if (busyReading) { readAgain = true; return; }
    busyReading = true;
    try {
      const response = await api.bossAction({ type: "get-page-context", _timeout: 3000 });
      if (!response.ok || !response.jd?.hasJd || !response.jd.title) {
        current = null; pending = null; panel.hidden = true; status("等待打开具体岗位或聊天"); return;
      }
      const history = (response.history || []).map(m => ({ self: !!m.self, text: String(m.text || "") })).slice(-20);
      const job = { ...response.jd };
      syncFields({ jd: job });
      const resume = (settings.resumes || []).find(r => r.id === settings.activeResumeId) || settings.resumes?.[0];
      job.resumeId = resume?.id || ""; job.resumeText = resume?.text || settings.resumeText || "";
      const key = await hash(AutoAssist.signature(job, settings, history));
      const changed = current?.key !== key;
      current = { key, job, history, seq: ++sequence };
      if (changed) {
        panel.hidden = true;
        if (applied && Career.identity(applied.job) !== Career.identity(job)) { replyEdited = false; el("autoReply").value = ""; }
      }
      if (!enabled) { status("自动辅助已暂停"); return; }
      if (!settings.apiKey) { status("在设置中配置一次 API Key，之后自动分析"); return; }
      if (cache[key] && Date.now() - cache[key].ts < 7 * 86400000) { await apply(current, cache[key].result, true); pending = null; return; }
      if (inflight?.key === key || (failureKey === key && Date.now() < failureUntil)) return;
      pending = current;
      if (inflight && inflight.key !== key) {
        const task = await api.agentCurrent();
        if (task.current?.background) await api.agentCancel();
      }
      if (changed || !timer) { status("网页已更新，正在准备自动分析…"); schedule(); }
    } catch (err) { status("等待页面就绪"); }
    finally { busyReading = false; if (readAgain) { readAgain = false; setTimeout(observe, 100); } }
  }
  async function apply(snapshot, result, cached = false) {
    if (!enabled || current?.key !== snapshot.key) return;
    const sameJob = applied && Career.identity(applied.job) === Career.identity(snapshot.job);
    applied = { ...snapshot, result }; panel.hidden = false;
    el("autoAnalysis").innerHTML = renderMd(result.analysis || "当前信息不足，需先查看完整 JD。");
    el("autoSummary").innerHTML = renderMd(result.summary || "当前没有可整理的聊天记录。");
    el("autoPreparation").innerHTML = renderMd(result.preparation || "当前岗位资料不足，打开完整 JD 后将自动更新。");
    el("autoReplyBox").hidden = !result.reply;
    if (!replyEdited || !sameJob) { el("autoReply").value = result.reply || ""; replyEdited = false; replyContext = snapshot.key; }
    status(cached ? "已自动恢复分析，无需重复生成" : "分析与草稿已自动更新");
    if (result.preparation && el("ivTitle").value === snapshot.job.title && !prepBusy) {
      el("prepResult").innerHTML = '<div class="ver"><div class="txt">' + renderMd(result.preparation) + '</div></div>';
    }
    if (snapshot.history.length && !recorded.has(snapshot.key)) {
      recorded.add(snapshot.key);
      try {
        const record = await api.recordConversation({ job: snapshot.job, history: snapshot.history, result });
        if (record.interviewAdded) status("已识别面试时间并建立待确认记录");
      } catch (err) { recorded.delete(snapshot.key); status("分析已完成，跟进同步失败：" + err.message); }
    }
    if (result.reply && !replyEdited && !filled.has(snapshot.key) && current?.key === snapshot.key) {
      filled.add(snapshot.key);
      const resultFill = await api.bossAction({ type: "fill-if-empty", text: result.reply,
        expected: { title: snapshot.job.title, company: snapshot.job.company, lastText: snapshot.history.at(-1)?.text }, _timeout: 3000 });
      if (resultFill.filled) status("草稿已自动填入聊天框，核对后自行发送");
      else if (resultFill.reason === "input-being-edited") status("草稿已准备，保留你正在编辑的内容");
    }
  }
  async function drain() {
    timer = null;
    if (!enabled || !pending || inflight) return;
    if (current?.key !== pending.key) { pending = null; return; }
    const task = await api.agentCurrent();
    if (task.busy) { status("其他任务完成后自动继续"); schedule(1000); return; }
    const wait = Math.max(0, 15000 - (Date.now() - lastRequest));
    if (wait) { status("正在合并最近更新，稍后自动分析"); schedule(wait); return; }
    const snapshot = pending; pending = null; inflight = snapshot; lastRequest = Date.now();
    status("正在自动分析岗位与聊天…");
    try {
      const content = "当前北京时间：" + new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) +
        "\n聊天记录（self=true 是我方，false 是对方）：\n" + JSON.stringify(snapshot.history);
      const response = await api.agentInvoke("career", { task: "auto", job: snapshot.job, content });
      if (!response.ok) { const err = new Error(response.error); err.code = response.code; throw err; }
      const result = AutoAssist.parse(response.text, snapshot.history);
      cache[snapshot.key] = { ts: Date.now(), result };
      cache = Object.fromEntries(Object.entries(cache).sort((a, b) => b[1].ts - a[1].ts).slice(0, 40));
      await api.setStore({ bossAiAutoCache: cache });
      await apply(snapshot, result);
    } catch (err) {
      if (/已停止|已取消/.test(err.message)) {
        if (current?.key === snapshot.key && enabled && err.code === "BACKGROUND_PREEMPTED") pending = current;
        else if (current?.key === snapshot.key) { failureKey = snapshot.key; failureUntil = Infinity; status("本次自动分析已停止，切换岗位后继续"); }
      } else {
        failureKey = snapshot.key;
        failureUntil = /API Key|余额|认证|401|402/.test(err.message) ? Infinity : Date.now() + 60000;
        if (current?.key === snapshot.key) status("自动分析未完成：" + err.message);
      }
    } finally { inflight = null; if (pending) schedule(); }
  }
  el("autoAssistEnabled").onchange = async () => {
    enabled = el("autoAssistEnabled").checked; failureKey = "";
    await api.setStore({ bossAiAutoAssist: enabled });
    if (!enabled) {
      clearTimeout(timer); pending = null;
      if (inflight) { const task = await api.agentCurrent(); if (task.current?.background) await api.agentCancel(); }
      status("自动辅助已暂停");
    } else observe();
  };
  el("autoReply").oninput = () => { replyEdited = true; };
  el("autoUseLatest").onclick = () => { if (applied) { el("autoReply").value = applied.result.reply; replyEdited = false; replyContext = applied.key; } };
  el("autoFillReply").onclick = async () => {
    try {
      const response = await api.bossAction({ type: "get-page-context", _timeout: 3000 });
      if (!response.jd?.hasJd || !applied || Career.identity(response.jd) !== Career.identity(applied.job)) throw new Error("已切换岗位，等待当前聊天的新草稿");
      const key = await hash(AutoAssist.signature(response.jd, settings, response.history || []));
      if (key !== replyContext) throw new Error("聊天已更新，请先使用最新建议后再填入");
      const result = await api.bossAction({ type: "fill-input", text: el("autoReply").value, _timeout: 3000 });
      if (!result.ok) throw new Error(result.error);
      status("草稿已填入，请核对后自行发送");
    } catch (err) { status(err.message); }
  };
  api.onPageContext(observe);
  api.onBossStatus(state => { if (state.loading) { current = null; pending = null; panel.hidden = true; } else setTimeout(observe, 1200); });
  api.onAgentEvent(event => { if (/agent:(done|cancelled|error)/.test(event.type) && pending) schedule(); });
  api.onStoreChanged(async key => {
    if (key === "bossAiSettings") { const data = await api.getStore(key); settings = data[key] || {}; failureKey = ""; observe(); }
  });
  document.querySelector('[data-tab="company"]').addEventListener("click", async () => {
    if (!enabled || !settings.apiKey || !current?.job.company || coBusy || el("coName").value !== current.job.company) return;
    const data = await api.getStore("bossAiCompanyReports");
    const cached = data.bossAiCompanyReports?.[current.job.company]?.[0];
    if (cached && Date.now() - cached.ts < 86400000) {
      el("coResult").innerHTML = renderMd(cached.text);
      setCoStatus("已自动恢复该公司的报告");
    } else {
      try { await doCompanyAnalyze(); } catch (err) { setCoStatus(err.message, true); }
    }
  });
  Promise.all([api.getStore("bossAiSettings"), api.getStore("bossAiAutoAssist"), api.getStore("bossAiAutoCache")]).then(([profile, option, saved]) => {
    settings = profile.bossAiSettings || {}; enabled = option.bossAiAutoAssist !== false; cache = saved.bossAiAutoCache || {};
    el("autoAssistEnabled").checked = enabled; initialized = true; observe();
  }).catch(err => status(err.message));
  setInterval(() => { if (!document.hidden) observe(); }, 10000);
})();
