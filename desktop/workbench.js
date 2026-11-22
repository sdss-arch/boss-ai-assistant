/* 收藏后的历史与跟进；当前网页工具不依赖建立档案。 */
(() => {
  const KEY = "bossAiCareerJobs";
  let jobs = [], selected = null, draftKind = "", working = false;
  let interviewRecords = [], profile = {};
  const el = id => document.getElementById(id);
  const html = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const stageOptions = () => Object.entries(Career.STAGES).map(([v, label]) => `<option value="${v}">${label}</option>`).join("");
  const page = document.createElement("section");
  page.id = "tab-workbench"; page.className = "page";
  page.innerHTML = `
    <div class="card"><div class="card-head"><h2>收藏与跟进</h2><span class="badge">本地保存</span></div>
      <div id="careerMetrics" class="career-metrics"></div><div id="careerToday" class="career-today"></div>
      <div class="btn-row"><button class="btn primary flex" id="careerCapture">收藏当前岗位</button></div>
      <div class="btn-row career-gap"><button class="link-btn" id="careerExport">导出收藏记录</button><button class="link-btn" id="careerCompare">对比 Offer</button><button class="link-btn" id="careerStats">渠道与简历统计</button></div>
    </div>
    <div id="careerStatus" class="status" role="status"></div>
    <div class="card" id="careerEditor" hidden><h2>补充跟进信息</h2><form id="careerForm"><details><summary>网页读取的职位信息（只读）</summary>
      <div class="field-row"><div class="field"><label for="cjTitle">岗位名称 *</label><input id="cjTitle" required maxlength="200"></div><div class="field"><label for="cjCompany">公司</label><input id="cjCompany" maxlength="200"></div></div>
      <div class="field-row"><div class="field"><label for="cjStage">求职阶段</label><select id="cjStage">${stageOptions()}</select></div><div class="field"><label for="cjChannel">渠道</label><input id="cjChannel" placeholder="BOSS直聘 / 内推"></div></div>
      <div class="field-row"><div class="field"><label for="cjSalary">薪资</label><input id="cjSalary" placeholder="15-20K"></div><div class="field"><label for="cjLocation">地点</label><input id="cjLocation"></div></div>
      <div class="field"><label for="cjHref">岗位链接</label><input id="cjHref" type="url" placeholder="https://www.zhipin.com/job_detail/…"></div>
      <div class="field"><label for="cjResume">关联简历（保存时留存版本快照）</label><select id="cjResume"></select></div>
      <div class="field"><label for="cjDesc">JD 快照</label><textarea id="cjDesc" rows="6" placeholder="可手动粘贴完整职位描述"></textarea></div>
      </details>
      <label><input type="checkbox" id="cjReplied"> 招聘方已回复</label>
      <div class="field"><label for="cjSummary">沟通摘要 / 已确认条件</label><textarea id="cjSummary" rows="3"></textarea></div>
      <div class="field"><label for="cjNote">备注 / 结束原因</label><textarea id="cjNote" rows="2"></textarea></div>
      <div class="field"><label for="cjAction">下一步行动</label><input id="cjAction" placeholder="询问面试安排 / 补充作品集"></div>
      <div class="field"><label for="cjFollow">跟进时间</label><input id="cjFollow" type="datetime-local"></div>
      <div class="btn-row"><button class="btn primary flex" type="submit">保存岗位</button><button class="btn ghost" type="button" id="careerEditCancel">取消</button></div>
    </form></div>
    <div class="card"><div class="field"><label for="careerSearch">搜索岗位或公司</label><input id="careerSearch" type="search" placeholder="公司、岗位、备注"></div>
      <div id="careerStages" class="career-stages"></div><div id="careerList"></div>
    </div>
    <div id="careerDetail"></div>
    <div class="card" id="careerOutput" hidden><div class="card-head"><h2 id="careerOutputTitle">生成结果</h2><button class="link-btn" id="careerCopy">复制</button></div>
      <p class="desc">可直接编辑草稿；改写会保留上一版。确认后自行复制或填入聊天框。</p>
      <textarea id="careerDraft" rows="12" aria-label="生成草稿"></textarea>
      <div class="field career-gap"><label for="careerRewriteRequest">局部修改要求</label><input id="careerRewriteRequest" placeholder="更短一点 / 只调整第二段 / 突出某段经历"></div>
      <div class="btn-row"><button class="btn secondary" id="careerRewrite">修改文案</button><button class="btn secondary" id="careerKeep">保存到岗位</button><button class="btn ghost" id="careerStop">停止生成</button></div>
      <button class="link-btn career-gap" id="careerFill">填入当前聊天框</button><button class="link-btn career-gap" id="careerSaveResume">另存为简历版本</button>
    </div>
    <div class="card" id="careerComparison" hidden></div>`;
  document.querySelector("main.body").prepend(page);
  let stageFilter = "all", editId = null;
  const current = () => jobs.find(j => j.id === selected);
  function status(message, error = false) { el("careerStatus").textContent = message; el("careerStatus").className = "status" + (error ? " err" : ""); }
  async function persist() {
    await api.setStore({ [KEY]: jobs });
    render();
  }
  function download(name, content, type) {
    const a = document.createElement("a"), url = URL.createObjectURL(new Blob([content], { type }));
    a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function refresh() {
    const [data, settingsData, interviews] = await Promise.all([api.getStore(KEY), api.getStore("bossAiSettings"), api.getStore("bossAiInterviews")]);
    jobs = Array.isArray(data[KEY]) ? data[KEY] : [];
    profile = settingsData.bossAiSettings || {};
    interviewRecords = interviews.bossAiInterviews || [];
    const editing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
    render(!editing && el("careerEditor").hidden && !working);
  }
  function render(refreshDetail = true) {
    const counts = Career.metrics(jobs);
    el("careerMetrics").innerHTML = [["收藏", counts.total], ["已沟通/投递", counts.contacted], ["获面试", counts.interviews], ["获 Offer", counts.offers]].map(([label, n]) => `<div><strong>${n}</strong><span>${label}</span></div>`).join("");
    const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
    const due = jobs.filter(j => j.stage !== "closed" && j.followUpAt && +new Date(j.followUpAt) <= +endToday);
    const upcoming = interviewRecords.filter(i => ["confirmed", "pending"].includes(i.status) && Number.isFinite(Date.parse(i.date)) && +new Date(i.date) >= Date.now() && +new Date(i.date) <= Date.now() + 86400000);
    el("careerToday").innerHTML = `<strong>今日待办</strong><p>${due.length} 项待跟进 · 未来 24 小时 ${upcoming.length} 场面试</p>` + due.slice(0, 8).map(j => `<button class="link-btn" data-select="${html(j.id)}">${+new Date(j.followUpAt) < Date.now() ? "逾期 · " : ""}${html(j.company)} · ${html(j.nextAction || j.title)}</button>`).join("") + upcoming.slice(0, 5).map(i => `<p>${html(i.company)} · ${html(new Date(i.date).toLocaleString())} · ${html(i.round || "面试")}</p>`).join("");
    el("careerStages").innerHTML = [["all", "全部"], ...Object.entries(Career.STAGES)].map(([key, label]) => `<button class="career-stage ${key === stageFilter ? "on" : ""}" data-stage="${key}">${label} ${key === "all" ? jobs.length : jobs.filter(j => j.stage === key).length}</button>`).join("");
    const query = el("careerSearch").value.trim().toLowerCase();
    const visible = jobs.filter(j => (stageFilter === "all" || j.stage === stageFilter) && [j.title, j.company, j.note].join(" ").toLowerCase().includes(query));
    el("careerList").innerHTML = visible.length ? visible.map(j => `<button class="career-job ${selected === j.id ? "selected" : ""}" data-select="${html(j.id)}"><strong>${html(j.title)}</strong><span>${html(j.company || "公司待补充")} · ${html(j.salary || "薪资待确认")}</span><small>${html(Career.STAGES[j.stage])}${j.followUpAt ? " · 跟进 " + html(new Date(j.followUpAt).toLocaleString()) : ""}</small></button>`).join("") : '<p class="desc">暂无收藏。在左侧浏览岗位，点击收藏即可，不需要录入职位信息。</p>';
    if (refreshDetail) renderDetail();
  }
  function renderDetail() {
    const job = current(), box = el("careerDetail");
    if (!job) { box.innerHTML = ""; return; }
    const linked = interviewRecords.filter(i => i.jobId === job.id);
    box.innerHTML = `<div class="card"><div class="card-head"><h2>${html(job.title)}</h2><button class="link-btn" data-action="edit">编辑</button></div>
      <p>${html(job.company)} · ${html(Career.STAGES[job.stage])}</p>
      <div class="btn-row"><button class="btn secondary" data-action="open">打开岗位</button><button class="btn secondary" data-action="prep">面试准备</button><button class="btn secondary" data-action="interview">记录面试</button></div>
      <div class="field career-gap"><label for="careerQuickStage">更新进度</label><select id="careerQuickStage">${stageOptions()}</select></div>
      <p class="desc">下一步：${html(job.nextAction || "尚未填写")}${job.followUpAt ? " · " + html(new Date(job.followUpAt).toLocaleString()) : ""}</p>
      <div class="btn-row"><button class="link-btn" data-action="complete">完成本次跟进</button><button class="link-btn" data-action="summary">整理当前聊天</button></div>
      <details class="career-gap"><summary>JD 与简历版本快照</summary><pre class="career-pre">${html(job.desc || "尚无 JD，请编辑补充")}</pre><h3>关联简历</h3><pre class="career-pre">${html(job.resumeText || "未关联简历")}</pre></details>
      <details class="career-gap"><summary>沟通摘要与备注</summary><pre class="career-pre">${html(job.summary || job.autoSummary || "尚无沟通摘要")}</pre><pre class="career-pre">${html(job.note)}</pre></details>
      <h3 class="career-gap">岗位工具</h3><div class="btn-row"><button class="btn secondary" data-action="resume">简历诊断</button><button class="btn secondary" data-action="resume-draft">生成简历草稿</button><button class="btn secondary" data-action="company">公司档案</button><button class="btn secondary" data-action="offer">录入 Offer</button></div>
      <div class="field career-gap"><label for="careerScenario">沟通场景</label><select id="careerScenario"><option>询问进度</option><option>确认面试</option><option>薪资沟通</option><option>婉拒机会</option></select></div>
      <button class="btn secondary block" data-action="followup">生成跟进草稿</button>
      <details class="career-gap" open><summary>模拟面试</summary><p class="desc">围绕本岗位逐题练习，回答后点评并追问。练习记录自动保存。</p><div class="career-mock">${(job.mock || []).map(m => `<div class="career-turn"><b>${m.role === "user" ? "我的回答" : "面试教练"}</b><div>${renderMd(m.content)}</div></div>`).join("")}</div>
      <textarea id="careerMockAnswer" rows="3" placeholder="输入你的回答，首次可直接开始"></textarea><div class="btn-row"><button class="btn primary" data-action="mock">${job.mock?.length ? "提交回答并追问" : "开始模拟面试"}</button><button class="btn ghost" data-action="mock-reset">新一轮练习</button><button class="btn ghost" data-action="question">存入问题库</button></div></details>
      <details class="career-gap"><summary>关联资料（${(job.artifacts || []).length}）与面试（${linked.length}）</summary>${(job.artifacts || []).map((a, i) => `<details><summary>${html(a.label)} · ${html(new Date(a.ts).toLocaleString())}</summary><div>${renderMd(a.text)}</div><button class="link-btn" data-artifact="${i}">编辑 / 改写此版本</button></details>`).join("")}${linked.map(i => `<p>${html(i.date)} · ${html(i.round || "面试")} · ${html(i.review || i.note)}</p>`).join("")}</details>
      <details class="career-gap"><summary>阶段记录</summary>${(job.history || []).map(h => `<p>${html(Career.STAGES[h.stage])} · ${html(new Date(h.ts).toLocaleString())}</p>`).join("")}</details>
      ${job.excluded ? '<button class="link-btn career-gap" data-action="restore-match">恢复参与岗位匹配</button>' : ''}
      <button class="link-btn career-gap" data-action="delete">删除收藏记录</button>
    </div>`;
    el("careerQuickStage").value = job.stage;
    el("careerQuickStage").onchange = async e => { const result = Career.saveJob(jobs, { id: job.id, stage: e.target.value, title: job.title }); jobs = result.jobs; await persist(); };
  }
  function edit(input = {}) {
    editId = input.id || null;
    el("careerEditor").hidden = false;
    for (const id of ["cjTitle", "cjCompany", "cjSalary", "cjLocation", "cjHref", "cjDesc"]) el(id).readOnly = true;
    const versions = Array.isArray(profile.resumes) ? profile.resumes : [];
    el("cjResume").innerHTML = '<option value="">不关联</option>' + versions.map(r => `<option value="${html(r.id)}">${html(r.name)}</option>`).join("");
    if (!input.id) return;
    const fields = { Title: "title", Company: "company", Salary: "salary", Location: "location", Href: "href", Desc: "desc", Summary: "summary", Note: "note", Action: "nextAction", Follow: "followUpAt", Channel: "channel" };
    for (const [suffix, key] of Object.entries(fields)) el("cj" + suffix).value = input[key] || "";
    el("cjReplied").checked = !!input.replied;
    el("cjStage").value = input.stage || "saved";
    el("cjChannel").value ||= "BOSS直聘";
    el("cjResume").value = input.resumeId ?? profile.activeResumeId ?? "";
    showTab("workbench"); el("careerEditor").scrollIntoView({ block: "start", behavior: "smooth" });
  }
  async function save(input) {
    const result = Career.saveJob(jobs, input);
    jobs = result.jobs; selected = result.job.id; await persist();
    return result.job;
  }
  async function attach(text, label, jobId = selected, kind = "") {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return false;
    job.artifacts = [{ id: Career.uid(), label, text, kind, ts: Date.now() }, ...(job.artifacts || [])].slice(0, 100);
    await persist(); return true;
  }
  async function generate(task, content = "", messages) {
    const job = current();
    if (!job) throw new Error("请先选择岗位");
    if (working) throw new Error("当前任务执行中，可先点击停止");
    const jobId = job.id;
    working = true; status("求职教练正在生成，可在下方停止…");
    el("careerOutput").hidden = false;
    try {
      const result = await api.agentInvoke("career", { task, content, messages, job });
      if (!result.ok) throw new Error(result.error);
      
      if (task !== "rewrite") draftKind = task;
      el("careerSaveResume").hidden = draftKind !== "resume-draft";
      el("careerFill").hidden = draftKind !== "followup";
      el("careerDraft").value = result.text;
      el("careerOutputTitle").textContent = ({ resume: "简历诊断与修改建议", "resume-draft": "岗位简历草稿", summary: "沟通摘要", followup: "跟进草稿", review: "面试复盘", mock: "模拟面试点评", rewrite: "修改后的文案" })[task];
      const target = jobs.find(j => j.id === jobId);
      if (task === "summary" && target) { target.summary = result.text; }
      if (task === "mock" && target) target.mock = [...messages, { role: "assistant", content: result.text }].slice(-40);
      await attach(result.text, el("careerOutputTitle").textContent, jobId, draftKind);
      status("已保存到收藏记录。请核对内容后使用。");
      return result.text;
    } finally { working = false; }
  }
  async function runAction(action) {
    const job = current(); if (!job) return;
    if (working && !["open"].includes(action)) throw new Error("当前任务执行中，请先停止或等待完成");
    if (action === "edit") return edit(job);
    if (action === "open") { if (!job.href) throw new Error("此岗位没有链接，请编辑补充"); const r = await api.openJob(job.href); if (!r.ok) throw new Error(r.error); return; }
    if (action === "prep" || action === "interview") {
      window.editingInterviewId = null;
      window.currentCareerJobId = job.id;
      el("ivCompany").value = job.company || ""; el("ivTitle").value = job.title;
      el("ivJd").value = job.desc || "";
      el("ivRecCompany").value = job.company || ""; el("ivRecTitle").value = job.title;
      if (action === "interview") el("ivForm").style.display = "block";
      showTab("interview"); return;
    }
    if (action === "company") { el("coName").value = job.company || ""; await loadXhsEvidence(); showTab("company"); return; }
    if (action === "complete") { job.followUpAt = ""; job.nextAction = ""; job.updatedAt = Date.now(); await persist(); status("已完成本次跟进，请按需要设置下一次时间"); return; }
    if (action === "resume") return generate("resume");
    if (action === "resume-draft") return generate("resume-draft");
    if (action === "followup") return generate("followup", el("careerScenario").value);
    if (action === "summary") {
      const r = await api.bossAction({ type: "get-chat-history", _timeout: 10000 });
      if (!r.ok || !r.history?.length) throw new Error("请先在左侧打开该岗位的聊天窗口");
      if (!confirm("请确认左侧聊天属于「" + job.company + " · " + job.title + "」，再整理到此岗位。")) return;
      return generate("summary", r.history.map(m => (m.self ? "我：" : "对方：") + m.text).join("\n"));
    }
    if (action === "mock") {
      const answer = el("careerMockAnswer").value.trim();
      if (job.mock?.length && !answer) throw new Error("请先输入你的回答");
      return generate("mock", "", [...(job.mock || []), { role: "user", content: answer || "请开始本岗位的模拟面试，每次只问一道题。" }]);
    }
    if (action === "mock-reset") { if (!working && confirm("结束当前练习并开始新一轮？既有点评仍保留在关联资料中。")) { job.mock = []; await persist(); } return; }
    if (action === "question") {
      const answer = (job.mock || []).filter(m => m.role === "user").at(-1);
      const question = (job.mock || []).filter(m => m.role === "assistant").at(-1);
      if (!question) throw new Error("请先开始一次练习");
      const data = await api.getStore("bossAiInterviewQuestions");
      await api.setStore({ bossAiInterviewQuestions: [{ id: Career.uid(), question: question.content, answer: answer?.content || "", company: job.company, title: job.title, ts: Date.now() }, ...(data.bossAiInterviewQuestions || [])] });
      await renderQuestionList(); status("已保存练习内容到面试问题库"); return;
    }
    if (action === "offer") return editOffer(job);
    if (action === "restore-match") { job.excluded = false; await persist(); status("此岗位将重新参与后续匹配"); return; }
    if (action === "delete" && confirm("删除此岗位及其关联资料？面试记录会保留。")) { jobs = jobs.filter(j => j.id !== job.id); selected = null; await persist(); }
  }
  function editOffer(job) {
    const box = el("careerComparison"); box.hidden = false;
    box.innerHTML = `<h2>录入 Offer</h2><p>${html(job.company)} · ${html(job.title)}</p><form id="careerOfferForm">
      <div class="field-row"><div class="field"><label>税前月薪（元）<input id="coMonthly" type="number" min="1" required></label></div><div class="field"><label>保证发薪月数<input id="coMonths" type="number" min="1" max="24" step="0.5" value="12" required></label></div></div>
      <div class="field-row"><div class="field"><label>另计保证奖金（元/年）<input id="coBonus" type="number" min="0" value="0"></label></div><div class="field"><label>单程通勤（分钟）<input id="coCommute" type="number" min="0"></label></div></div>
      <div class="field"><label>工作时间、试用期及其他条件<textarea id="coTerms" rows="3"></textarea></label></div><button class="btn primary block">保存 Offer</button></form>`;
    for (const [id, key] of [["coMonthly", "monthly"], ["coMonths", "months"], ["coBonus", "bonus"], ["coCommute", "commute"], ["coTerms", "terms"]]) if (job.offer?.[key] !== undefined) el(id).value = job.offer[key];
    el("careerOfferForm").onsubmit = async e => { e.preventDefault(); await guard(async () => {
      const offer = { monthly: +el("coMonthly").value, months: +el("coMonths").value, bonus: +el("coBonus").value, commute: +el("coCommute").value, terms: el("coTerms").value };
      if (!Career.offerSummary(offer)) throw new Error("请检查薪资、月数与奖金");
      jobs = Career.saveJob(jobs, { id: job.id, title: job.title, stage: "offer" }).jobs;
      jobs.find(j => j.id === job.id).offer = offer; await persist(); compareOffers(); status("Offer 已保存");
    }); };
    box.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  function compareOffers() {
    const box = el("careerComparison"); box.hidden = false;
    const offers = jobs.filter(j => Career.offerSummary(j.offer));
    box.innerHTML = '<h2>Offer 对比</h2><p class="desc">保证年现金 = 月薪 × 保证月数 + 另计保证奖金。未含浮动绩效，不推算税后收入。</p>' + (offers.length ? `<div class="career-table-wrap"><table class="career-table"><thead><tr><th>公司 / 岗位</th><th>保证年现金</th><th>通勤</th><th>其他条件</th></tr></thead><tbody>${offers.map(j => { const s = Career.offerSummary(j.offer); return `<tr><td>${html(j.company)}<br>${html(j.title)}</td><td>${s.annual.toLocaleString()} 元</td><td>${s.commute || "待填"} 分钟</td><td>${html(j.offer.terms || "待确认")}</td></tr>`; }).join("")}</tbody></table></div>` : '<p class="desc">选择岗位后点击“录入 Offer”，即可进行比较。</p>');
    box.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  async function guard(fn) { try { await fn(); } catch (e) { status(e.message || "操作失败，请重试", true); } }
  el("careerForm").onsubmit = e => { e.preventDefault(); guard(async () => {
    const old = jobs.find(j => j.id === editId), resumeId = el("cjResume").value;
    const resume = (profile.resumes || []).find(r => r.id === resumeId);
    await save({ id: editId, title: el("cjTitle").value.trim(), company: el("cjCompany").value.trim(), salary: el("cjSalary").value, location: el("cjLocation").value, href: el("cjHref").value, desc: el("cjDesc").value, stage: el("cjStage").value, replied: el("cjReplied").checked, resumeId, resumeText: old?.resumeId === resumeId ? old.resumeText : resume?.text || "", note: el("cjNote").value, summary: el("cjSummary").value, channel: el("cjChannel").value, nextAction: el("cjAction").value, followUpAt: el("cjFollow").value });
    el("careerEditor").hidden = true; status("岗位已保存，JD 和简历版本可随时查看");
  }); };
  el("careerCapture").onclick = () => guard(async () => { await window.webpageAssistant.collect(); });
  el("careerEditCancel").onclick = () => { el("careerEditor").hidden = true; };
  el("careerSearch").oninput = render;
  page.addEventListener("click", e => {
    const button = e.target.closest("button"); if (!button) return;
    if (button.dataset.select) {
      if (working) { status("请等待当前任务完成或先停止，再切换岗位", true); return; }
      selected = button.dataset.select; el("careerOutput").hidden = true; render();
    }
    if (button.dataset.stage) { stageFilter = button.dataset.stage; render(); }
    if (button.dataset.action) guard(() => runAction(button.dataset.action));
    if (button.dataset.artifact !== undefined) { const a = current()?.artifacts[+button.dataset.artifact]; if (a) { draftKind = a.kind || (a.label === "岗位简历草稿" ? "resume-draft" : a.label === "跟进草稿" ? "followup" : ""); el("careerSaveResume").hidden = draftKind !== "resume-draft"; el("careerFill").hidden = draftKind !== "followup"; el("careerDraft").value = a.text;  el("careerOutput").hidden = false; el("careerOutputTitle").textContent = a.label; } }
  });
  el("careerCopy").onclick = () => guard(async () => { await navigator.clipboard.writeText(el("careerDraft").value); status("已复制草稿"); });
  el("careerRewrite").onclick = () => guard(async () => { const request = el("careerRewriteRequest").value.trim(); if (!request) throw new Error("请填写修改要求"); await attach(el("careerDraft").value, "修改前版本", selected, draftKind); await generate("rewrite", "修改要求：" + request + "\n原文：\n" + el("careerDraft").value); });
  el("careerKeep").onclick = () => guard(async () => { if (!el("careerDraft").value.trim()) throw new Error("没有可保存的内容"); await attach(el("careerDraft").value, "手动编辑版本", selected, draftKind); status("已保存新版本"); });
  el("careerStop").onclick = () => api.agentCancel();
  el("careerFill").onclick = () => guard(async () => { if (draftKind !== "followup") throw new Error("请选择沟通草稿后再填入"); const r = await api.bossAction({ type: "fill-input", text: el("careerDraft").value, _timeout: 10000 }); if (!r.ok) throw new Error(r.error); status("已填入当前聊天框，请核对接收方和内容后发送"); });
  el("careerSaveResume").onclick = () => guard(async () => {
    if (draftKind !== "resume-draft") throw new Error("请先生成岗位简历草稿");
    const text = el("careerDraft").value.trim(), job = current();
    if (!text || !job) throw new Error("请选择岗位并生成简历草稿");
    if (!confirm("请确认草稿事实准确。另存后会保留原简历，并将此岗位绑定到新版本。")) return;
    const data = await api.getStore("bossAiSettings"), settings = data.bossAiSettings || {};
    const resume = { id: Career.uid(), name: job.title + " · " + new Date().toLocaleDateString(), text, fileName: "" };
    await api.setStore({ bossAiSettings: { ...settings, resumes: [...(settings.resumes || []), resume] } });
    await refresh();
    const target = jobs.find(j => j.id === job.id); target.resumeId = resume.id; target.resumeText = text;
    await persist(); status("已另存简历版本并关联此岗位；全局当前简历保持原选择");
  });
  el("careerCompare").onclick = compareOffers;
  el("careerExport").onclick = () => { download("求职档案.json", JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), jobs }, null, 2), "application/json"); status("已导出收藏记录，包含简历快照与关联资料，请妥善保存"); };
  el("careerStats").onclick = () => {
    const box = el("careerComparison"); box.hidden = false;
    const groups = key => { const map = new Map(); for (const job of jobs) { const label = job[key] || "未填写"; if (!map.has(label)) map.set(label, []); map.get(label).push(job); } return [...map].map(([label, list]) => ({ label, ...Career.metrics(list) })); };
    box.innerHTML = '<h2>求职复盘</h2><p class="desc">按手动记录的阶段统计；面试率为获面试岗位数 / 已沟通或投递岗位数。阶段记录不完整时仅供参考。</p>' + [["渠道", groups("channel")], ["简历版本", groups("resumeId")]].map(([title, rows]) => `<h3>${title}</h3>${rows.map(r => `<p>${html(title === "简历版本" ? (profile.resumes || []).find(v => v.id === r.label)?.name || r.label : r.label)}：${r.total} 个收藏，${r.contacted} 个沟通/投递，${r.interviews} 个面试，${r.offers} 个 Offer，回复率 ${r.responseRate}%，面试率 ${r.interviewRate}%</p>`).join("")}`).join("");
  };
  async function renderCompanyArchive() {
    let box = el("companyArchive");
    if (!box) {
      box = document.createElement("details"); box.id = "companyArchive"; box.className = "career-gap";
      el("coResult").after(box);
    }
    const company = el("coName").value.trim(), data = await api.getStore("bossAiCompanyReports");
    const history = (data.bossAiCompanyReports || {})[company] || [];
    box.hidden = !history.length;
    box.innerHTML = '<summary>公司历史报告（' + history.length + '）</summary>' + history.map((r, i) => '<details><summary>' + html(new Date(r.ts).toLocaleString()) + (r.hasPrevious ? ' · 较上一版新增 ' + r.added + ' 个检索来源' : ' · 首次归档') + '</summary><div>' + renderMd(r.text) + '</div></details>').join("");
  }
  el("coName").addEventListener("change", () => guard(renderCompanyArchive));
  window.careerUI = {
    refresh, attach,
    selectedJob: () => current(),
    findJob: id => jobs.find(j => j.id === id),
    async attachGenerated(entry) { const job = jobs.find(j => j.title === entry.title && j.company === entry.company); if (job) await attach(entry.result, ({ greeting: "招呼语", reply: "回复草稿", application: "求职信" })[entry.kind] || "生成结果", job.id); },
    async saveMatched(job) {
      await refresh();
      const resume = (profile.resumes || []).find(r => r.id === profile.activeResumeId);
      const old = jobs.find(j => Career.identity(j) === Career.identity(job));
      const data = { ...job };
      if (old) for (const key of ["desc", "salary", "location", "href"]) if (!data[key]) delete data[key];
      const saved = await save({ ...data, id: old?.id, resumeId: old?.resumeId ?? resume?.id ?? "", resumeText: old?.resumeText ?? resume?.text ?? profile.resumeText ?? "", channel: old?.channel || "BOSS直聘" });
      status("已收藏：" + saved.title); return saved;
    },
    async rejectMatched(job) {
      const reason = prompt("不感兴趣的原因（下次匹配将跳过此岗位）");
      if (reason === null) return;
      const saved = await this.saveMatched(job);
      jobs = Career.saveJob(jobs, { id: saved.id, title: saved.title, stage: "closed", closeReason: reason, note: "不感兴趣：" + reason }).jobs;
      jobs.find(j => j.id === saved.id).excluded = true;
      await persist(); setMatchStatus("已记录原因，下次匹配将跳过此岗位");
    },
    async markInterview(record) {
      await refresh(); const job = jobs.find(j => j.id === record.jobId); if (!job) return;
      if (!["offer", "closed"].includes(job.stage)) jobs = Career.saveJob(jobs, { id: job.id, title: job.title, stage: "interview" }).jobs;
      await persist();
    },
    async attachCompany(company, report, sources = []) {
      await refresh();
      const data = await api.getStore("bossAiCompanyReports"), all = data.bossAiCompanyReports || {};
      const previous = all[company] || [], known = new Set((previous[0]?.sources || []).map(s => s.href));
      const added = previous.length ? sources.filter(s => !known.has(s.href)).length : sources.length;
      const entry = { text: report, sources, ts: Date.now(), added, hasPrevious: previous.length > 0 };
      await api.setStore({ bossAiCompanyReports: { ...all, [company]: [entry, ...previous].slice(0, 5) } });
      for (const j of jobs.filter(j => j.company?.trim() === company.trim())) await attach(report, "公司报告", j.id);
      await renderCompanyArchive();
    },
    exportCalendar(record) { download("面试安排.ics", Career.calendarEvent(record), "text/calendar;charset=utf-8"); },
    reviewInterview(record) { selected = jobs.find(j => j.id === record.jobId)?.id || selected; showTab("workbench"); render(); return guard(() => generate("review", JSON.stringify(record))); },
    async openMatched(job) { await this.saveMatched(job); showTab("workbench"); }
  };
  api.onStoreChanged(key => {
    if (["bossAiInterviews", "bossAiSettings"].includes(key)) guard(refresh);
    if (key === KEY) guard(async () => {
      const data = await api.getStore(KEY); jobs = data[KEY] || [];
      const editing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
      render(!editing && el("careerEditor").hidden && !working);
    });
  });
  el("btnImportResume").onclick = () => guard(async () => {
    const result = await api.importResume();
    if (!result.ok) throw new Error(result.error);
    if (result.cancelled) return;
    syncResumeTextFromEditor();
    const resume = { id: Career.uid(), name: result.fileName.replace(/\.[^.]+$/, ""), fileName: result.fileName, text: result.text };
    resumes.push(resume); activeResumeId = resume.id; renderResumeList();
    toast("简历已提取，请预览后保存设置");
  });
  const conditions = () => ({ city: el("matchCity").value.trim(), minSalary: +el("matchMinSalary").value || 0,
    excludeKeywords: el("matchExclude").value.trim(), noOutsource: el("matchNoOutsource").checked,
    doubleWeekend: el("matchDoubleWeekend").checked, detailLimit: +el("matchDetailLimit").value });
  el("matchSaveConditions").onclick = () => guard(async () => { await api.matchSchedule(conditions()); setMatchStatus("硬性条件已保存，下次匹配生效"); });
  api.matchStatus().then(r => { if (!r.ok) return; const c = r.settings;
    el("matchCity").value = c.city || ""; el("matchMinSalary").value = c.minSalary || "";
    el("matchExclude").value = c.excludeKeywords || ""; el("matchNoOutsource").checked = !!c.noOutsource;
    el("matchDoubleWeekend").checked = !!c.doubleWeekend; el("matchDetailLimit").value = String(c.detailLimit || 10);
  }).catch(e => status(e.message, true));
  const oldMatchRun = el("btnMatchRun").onclick;
  el("btnMatchRun").onclick = () => guard(async () => { await api.matchSchedule(conditions()); await oldMatchRun(); });
  if (api.onBossStatus) {
    const showNetwork = info => {
      const banner = el("networkBanner");
      banner.hidden = !info.error;
      banner.textContent = info.error ? "BOSS 页面未加载：" + info.error + "。可点击顶部刷新重试；也可继续使用本地工作台。" : "";
    };
    api.onBossStatus(showNetwork); api.bossStatus().then(showNetwork).catch(() => {});
  }
  // 仅更新本应用的今日待办；不创建系统或云端自动任务。
  setInterval(() => { if (document.visibilityState === "visible" && !working && el("careerEditor").hidden) render(false); }, 60000);
  guard(refresh);
})();
