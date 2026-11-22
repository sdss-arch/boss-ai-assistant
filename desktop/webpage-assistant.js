/* 当前网页直接驱动助手；收藏记录只用于用户主动选择的长期跟进。 */
(() => {
  const el = id => document.getElementById(id);
  let pageJob = null, reading = false, readAgain = false, running = false, mockKey = "", mockMessages = [];
  let resultJob = null, resultKind = "";
  const card = document.createElement("div"); card.className = "card";
  card.innerHTML = `<div class="card-head"><h2>当前网页</h2><button class="link-btn" id="webRead">重新读取</button></div>
    <div id="webJobInfo" class="desc">在左侧打开职位详情或聊天，自动读取当前岗位。</div>
    <div class="btn-row" id="webJobActions" hidden>
      <button class="btn secondary" data-web-task="resume">岗位与简历分析</button><button class="btn secondary" data-web-task="resume-draft">优化简历</button>
      <button class="btn secondary" data-web-task="mock">模拟面试</button><button class="btn secondary" data-web-action="prep">面试准备</button>
      <button class="btn ghost" data-web-task="summary">整理当前聊天</button><button class="btn ghost" data-web-action="collect">收藏跟进</button>
    </div><div id="webFollowup" hidden class="field career-gap"><label for="webScenario">沟通场景</label><div class="btn-row"><select id="webScenario"><option>询问进度</option><option>确认面试</option><option>薪资沟通</option><option>婉拒机会</option></select><button class="btn secondary" data-web-task="followup">生成草稿</button></div></div>
    <div id="webMock" hidden class="career-gap"><div id="webMockHistory" class="career-mock"></div><textarea id="webMockAnswer" rows="3" placeholder="输入回答，提交后点评并追问"></textarea><button class="btn primary block" data-web-task="mock">提交回答并追问</button></div>
    <div id="webTaskStatus" class="status" role="status"></div>`;
  el("agentStrip").after(card);
  const output = document.createElement("div"); output.id = "webTaskOutput"; output.className = "card"; output.hidden = true;
  output.innerHTML = `<h2 id="webResultTitle">生成结果</h2><p id="webResultJob" class="desc"></p><textarea id="webResultText" rows="10" aria-label="当前岗位生成结果"></textarea>
    <div class="btn-row"><button class="btn secondary" id="webCopy">复制</button><button class="btn ghost" id="webStop">停止生成</button><button class="btn ghost" id="webFill" hidden>填入当前聊天框</button><button class="btn ghost" id="webSaveResume" hidden>另存简历版本</button></div>
    <div class="field career-gap"><label for="webRewriteRequest">修改要求</label><input id="webRewriteRequest" placeholder="更简洁 / 只修改第二段 / 保留原有事实"></div><button class="btn secondary block" id="webRewrite">修改这份文案</button>`;
  card.after(output);
  const say = (message, error = false) => { el("webTaskStatus").textContent = message; el("webTaskStatus").className = "status" + (error ? " err" : ""); };
  const guard = fn => async () => { try { await fn(); } catch (err) { say(err.message || "操作失败", true); } };
  async function readJob(required = false) {
    const result = await api.bossAction({ type: "get-page-context", _timeout: 2500 });
    const jd = result.ok && result.jd?.hasJd && result.jd.title ? result.jd : null;
    pageJob = jd;
    el("webJobInfo").textContent = jd ? [jd.title, jd.company, jd.salary].filter(Boolean).join(" · ") + (jd.desc ? "\n已读取当前职位描述。" : "\n当前页面未显示完整 JD，分析时会标记信息缺失。") : "未识别到当前岗位。请在左侧打开职位详情或具体聊天，不需要手动录入。";
    el("webJobActions").hidden = !jd; el("webFollowup").hidden = !jd;
    if (jd && mockKey && mockKey !== Career.identity(jd)) { mockMessages = []; mockKey = ""; el("webMock").hidden = true; }
    if (!jd) el("webMock").hidden = true;
    if (required && !jd) throw new Error("当前页面没有可确认的岗位，请打开职位详情或具体聊天");
    return jd;
  }
  async function update() {
    if (running) return;
    if (reading) { readAgain = true; return; }
    reading = true;
    try { await readJob(); } catch { /* 页面跳转或注入尚未完成，等待下次通知。 */ }
    finally { reading = false; if (readAgain) { readAgain = false; setTimeout(update, 100); } }
  }
  async function collect() {
    const jd = await readJob(true);
    const saved = await careerUI.saveMatched(jd);
    say("已从网页收藏「" + saved.title + "」，可在“跟进”查看历史。");
    return saved;
  }
  async function run(task, rewrite) {
    if (running) throw new Error("已有任务执行中，请等待完成或停止");
    // 每次点击都重新取当前网页，避免沿用上一个职位。
    const jd = rewrite ? resultJob : await readJob(true);
    if (!jd) throw new Error("没有可修改的生成结果");
    const settingsData = await api.getStore("bossAiSettings"), settings = settingsData.bossAiSettings || {};
    const resume = (settings.resumes || []).find(r => r.id === settings.activeResumeId) || settings.resumes?.[0];
    const job = { ...jd, resumeText: jd.resumeText || resume?.text || settings.resumeText || "" };
    let content = rewrite || "", messages;
    if (task === "followup" || task === "summary") {
      const context = await api.bossAction({ type: "get-chat-history", _timeout: 5000 });
      if (context.ok && context.history?.length) content += "\n" + context.history.map(m => (m.self ? "我：" : "对方：") + m.text).join("\n");
      if (task === "summary" && !context.history?.length) throw new Error("当前网页没有可读取的聊天记录，请打开具体聊天");
      if (task === "followup") content = "场景：" + el("webScenario").value + content;
    }
    if (task === "mock") {
      const key = Career.identity(job);
      if (key !== mockKey) { mockKey = key; mockMessages = []; }
      const answer = el("webMockAnswer").value.trim();
      if (mockMessages.length && !answer) { el("webMock").hidden = false; el("webMockAnswer").focus(); throw new Error("请先输入你的回答"); }
      messages = [...mockMessages, { role: "user", content: answer || "根据当前岗位开始模拟面试，每次只问一题。" }];
    }
    running = true; say("正在分析当前网页…"); output.hidden = false;
    card.querySelectorAll("button[data-web-task], button[data-web-action]").forEach(b => b.disabled = true);
    try {
      const response = await api.agentInvoke("career", { task, job, content, messages });
      if (!response.ok) throw new Error(response.error);
      resultJob = job; if (task !== "rewrite") resultKind = task;
      el("webResultTitle").textContent = ({ resume: "岗位与简历分析", "resume-draft": "简历优化草稿", followup: "沟通草稿", summary: "聊天摘要", mock: "模拟面试", rewrite: "修改后的文案" })[task];
      el("webResultJob").textContent = [job.company, job.title].filter(Boolean).join(" · ");
      el("webResultText").value = response.text;
      el("webFill").hidden = resultKind !== "followup"; el("webSaveResume").hidden = resultKind !== "resume-draft";
      if (task === "mock") {
        mockMessages = [...messages, { role: "assistant", content: response.text }].slice(-30);
        el("webMock").hidden = false; el("webMockAnswer").value = "";
        el("webMockHistory").innerHTML = mockMessages.map(m => `<div class="career-turn"><b>${m.role === "user" ? "我的回答" : "面试教练"}</b><div>${renderMd(m.content)}</div></div>`).join("");
      }
      await careerUI.attachGenerated({ title: job.title, company: job.company, result: response.text });
      say("已基于当前网页生成。请核对后使用。");
    } finally { running = false; card.querySelectorAll("button[data-web-task], button[data-web-action]").forEach(b => b.disabled = false); }
  }
  card.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.webTask) guard(() => run(b.dataset.webTask))();
    if (b.dataset.webAction === "collect") guard(collect)();
    if (b.dataset.webAction === "prep") guard(async () => { const job = await readJob(true); el("ivCompany").value = job.company || ""; el("ivTitle").value = job.title; el("ivJd").value = job.desc || ""; window.currentCareerJobId = null; showTab("interview"); })();
  });
  el("webRead").onclick = guard(update);
  el("webCopy").onclick = guard(async () => { await navigator.clipboard.writeText(el("webResultText").value); say("已复制"); });
  el("webStop").onclick = () => api.agentCancel();
  el("webRewrite").onclick = guard(async () => { const request = el("webRewriteRequest").value.trim(); if (!request) throw new Error("请填写修改要求"); await run("rewrite", "要求：" + request + "\n原文：\n" + el("webResultText").value); });
  el("webFill").onclick = guard(async () => {
    const now = await readJob(true);
    if (Career.identity(now) !== Career.identity(resultJob)) throw new Error("网页已切换到其他岗位，请回到生成草稿时的聊天后再填入");
    const result = await api.bossAction({ type: "fill-input", text: el("webResultText").value, _timeout: 5000 });
    if (!result.ok) throw new Error(result.error); say("已填入聊天框，请核对后自行发送");
  });
  el("webSaveResume").onclick = guard(async () => {
    if (resultKind !== "resume-draft") return;
    if (!confirm("确认简历草稿事实准确后另存为新版本？原简历将保留。")) return;
    const data = await api.getStore("bossAiSettings"), settings = data.bossAiSettings || {};
    const resume = { id: Career.uid(), name: (resultJob.title || "岗位") + " · 优化稿", text: el("webResultText").value, fileName: "" };
    await api.setStore({ bossAiSettings: { ...settings, resumes: [...(settings.resumes || []), resume] } }); say("已另存为新简历版本，可在设置中选择使用");
  });
  api.onPageContext(update);
  api.onBossStatus(info => { if (info.loading) { pageJob = null; el("webJobActions").hidden = true; el("webFollowup").hidden = true; el("webJobInfo").textContent = "网页加载中…"; } else setTimeout(update, 1100); });
  window.webpageAssistant = { collect, refresh: update };
  update();
  // 仅从页面 DOM 读取；不在后台遍历联系人或请求职位库。
  setInterval(() => { if (!document.hidden && el("tab-assist").classList.contains("active")) update(); }, 10000);
})();
