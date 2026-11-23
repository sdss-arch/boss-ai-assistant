/* 当前账号在线简历：网页原文 → 可编辑优化稿 → 编辑框回填，正式保存由本人完成。 */
(() => {
  const el = id => document.getElementById(id), sdk = window.panelApi;
  let snapshot = null, selected = null, busy = false, targetJob = null;
  const card = document.createElement("div"); card.id = "onlineResumeCard"; card.className = "card";
  card.innerHTML = `<div class="card-head"><h2>在线简历</h2><button class="link-btn" id="onlineOpen">打开 BOSS 在线简历</button></div>
    <p class="desc">直接读取 HR 查看的网站简历，选择段落优化，不需要重复填写。</p>
    <div class="btn-row"><button class="btn secondary" id="onlineRead">读取当前在线简历</button></div>
    <div id="onlineEditor" hidden>
      <div class="field"><label for="onlineSection">优化段落</label><select id="onlineSection"></select></div>
      <details><summary>网页原文</summary><textarea id="onlineOriginal" rows="5" readonly aria-label="在线简历网页原文"></textarea></details>
      <div class="field career-gap"><label for="onlineRequest">优化要求（可选）</label><input id="onlineRequest" placeholder="例如：突出 AI 产品交付经验，表达简洁"></div>
      <button class="btn secondary block" id="onlineOptimize">优化这一段</button>
      <div class="field career-gap"><label for="onlineDraft">优化稿（可自行修改）</label><textarea id="onlineDraft" rows="7"></textarea></div>
      <label><input id="onlineReviewed" type="checkbox"> 已对照原文核对事实</label>
      <div class="btn-row career-gap"><button class="btn primary" id="onlineFill" disabled>回填网页编辑框</button><button class="btn ghost" id="onlineRestore">撤回本次回填</button></div>
      <p class="desc">回填前保存本地原文备份，不自动点击网页的保存/完成。请在 BOSS 编辑框核对后保存；如未识别编辑入口，可先点击该段的「编辑」。</p>
    </div><div class="status" id="onlineStatus" role="status"></div>`;
  document.getElementById("agentStrip").after(card);
  const say = value => { el("onlineStatus").textContent = value; };
  const guard = fn => async () => { try { await fn(); } catch (error) { say(error.message); } };
  function showSection() {
    selected = snapshot?.sections.find(section => section.id === el("onlineSection").value) || null;
    el("onlineOriginal").value = selected?.original || ""; el("onlineDraft").value = ""; el("onlineReviewed").checked = false; updateFill();
  }
  function updateFill() { el("onlineFill").disabled = busy || !selected || !el("onlineReviewed").checked || !el("onlineDraft").value.trim(); }
  async function read(quiet = false) {
    if (busy) return;
    if (quiet && selected && el("onlineDraft").value.trim()) return;
    const response = await sdk.bossAction({ type: "online-resume:read", _timeout: 4000 });
    if (!response.ok) {
      if (!quiet) say(response.error || "请先打开在线简历页面");
      el("onlineFill").disabled = true; return;
    }
    if (!response.sections.length) { say("已打开在线简历，但暂未识别到可优化的正文段落；请等待页面加载后重新读取。"); return; }
    const previous = selected;
    snapshot = response;
    el("onlineSection").replaceChildren(...response.sections.map(section => { const option = document.createElement("option"); option.value = section.id; option.textContent = section.label; return option; }));
    el("onlineEditor").hidden = false;
    if (previous && response.sections.some(section => section.id === previous.id && section.original === previous.original)) {
      el("onlineSection").value = previous.id; selected = response.sections.find(section => section.id === previous.id); updateFill();
    } else showSection();
    say("已直接读取 " + response.sections.length + " 个正文段落，可选择后优化。姓名、公司、职务、日期等结构字段保留在网页中。");
  }
  el("onlineOpen").onclick = guard(async () => {
    const context = await sdk.bossAction({ type: "get-page-context", _timeout: 3000 });
    if (context.ok && context.jd?.hasJd) targetJob = context.jd;
    await sdk.gotoUrl("https://www.zhipin.com/web/geek/resume"); say("正在打开在线简历，加载后会自动读取。");
  });
  el("onlineRead").onclick = guard(() => read());
  el("onlineSection").onchange = showSection;
  el("onlineReviewed").onchange = updateFill;
  el("onlineDraft").oninput = () => { el("onlineReviewed").checked = false; updateFill(); };
  el("onlineOptimize").onclick = guard(async () => {
    if (busy || !selected) return;
    const settings = (await sdk.getStore("bossAiSettings")).bossAiSettings || {};
    if (!ModelConfig.ready(settings)) throw new Error("请先在设置中配置可用模型，本地模型无需 Key");
    const original = { ...selected }; busy = true; updateFill(); el("onlineOptimize").disabled = true;
    say("正在优化网页原文…");
    try {
      const response = await sdk.agentInvoke("career", { task: "online-resume", job: { ...(targetJob || {}), resumeText: original.original }, content: "当前分段：" + original.label + "\n要求：" + el("onlineRequest").value });
      if (!response.ok) throw new Error(response.error);
      if (selected?.id !== original.id || selected?.original !== original.original) throw new Error("所选段落已变化，请重新生成");
      el("onlineDraft").value = response.text; el("onlineReviewed").checked = false;
      say("优化稿已生成，请对照网页原文核对事实后回填。尚未修改在线简历。");
    } finally { busy = false; el("onlineOptimize").disabled = false; updateFill(); }
  });
  el("onlineFill").onclick = guard(async () => {
    if (!selected || !el("onlineReviewed").checked || busy) return;
    busy = true; updateFill();
    try {
      const data = await sdk.getStore("bossAiOnlineResumeBackups"), backups = Array.isArray(data.bossAiOnlineResumeBackups) ? data.bossAiOnlineResumeBackups : [];
      await sdk.setStore({ bossAiOnlineResumeBackups: [{ at: Date.now(), url: snapshot.url, section: selected.label, original: selected.original, draft: el("onlineDraft").value }, ...backups].slice(0, 20) });
      const response = await sdk.bossAction({ type: "online-resume:fill", id: selected.id, original: selected.original, text: el("onlineDraft").value, _timeout: 6000 });
      if (!response.ok) throw new Error(response.error);
      backups.unshift({ at: Date.now(), url: snapshot.url, section: selected.label, original: response.original, draft: el("onlineDraft").value });
      await sdk.setStore({ bossAiOnlineResumeBackups: backups.slice(0, 20) });
      say("已回填网页编辑框，原文已在本机备份。请检查后点击 BOSS 网页的保存/完成。");
    } finally { busy = false; updateFill(); }
  });
  el("onlineRestore").onclick = guard(async () => {
    const response = await sdk.bossAction({ type: "online-resume:restore", _timeout: 3000 });
    if (!response.ok) throw new Error(response.error); say("编辑框已恢复本次回填前的原文，尚未提交网页。");
  });
  sdk.onPageContext(() => read(true).catch(() => {}));
  sdk.onBossStatus(status => { if (!status.loading) setTimeout(() => read(true).catch(() => {}), 1200); });
  read(true).catch(() => {});
})();
