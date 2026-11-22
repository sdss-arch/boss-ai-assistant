const { app, webContents, session } = require("electron");
const fs = require("fs/promises"), path = require("path");
// 同一主进程执行原应用，通过原生 Electron API 驱动实际面板。
global.autoCalls = 0;
global.fetch = async (_url, options) => {
  const body = JSON.parse(options?.body || "{}");
  const automatic = body.messages?.[0]?.content.includes('"analysis"');
  if (automatic) global.autoCalls++;
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10) + "T15:30:00+08:00";
  const content = automatic ? JSON.stringify({ analysis: "自动分析：已有 Node.js 项目依据，需核实岗位细节。", summary: "对方提出面试时间。", reply: JSON.stringify(body.messages).includes("请补充一下项目经历") ? "好的，我补充一下项目经历。" : "好的，这个时间方便。", preparation: "准备介绍接口开发项目。", interview: { date, quote: "明天15:30面试，方便吗？" } }) : "测试草稿：请介绍一个你参与的接口开发项目。\n\n根据真实经历补充项目细节。";
  return { ok: true, json: async () => ({ choices: [{ message: { content } }], usage: { total_tokens: 12 } }) };
};
app.whenReady().then(() => session.defaultSession.protocol.handle("https", () => new Response('<!doctype html><html><body><h1>本地测试岗位</h1><div class="company-name">示例公司</div><div class="salary">15-20K</div><div class="job-detail"><div class="job-sec-text">Node.js 开发，双休，本地测试页面。</div></div><div class="chat-conversation"><div class="message-item other"><div class="msg-text">明天15:30面试，方便吗？</div></div><textarea class="chat-input"></textarea></div></body></html>', { headers: { "content-type": "text/html;charset=utf-8" } })));
require("../main");
async function wait(fn) { for (let i = 0; i < 120; i++) { const value = fn(); if (value) return value; await new Promise(r => setTimeout(r, 100)); } throw new Error("等待面板超时"); }
async function uiTest(restore) {
  const $ = s => document.querySelector(s);
  const wait = async (fn, label) => { for (let i = 0; i < 100; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 100)); } throw new Error("等待失败：" + label); };
  const click = s => { const e = $(s); if (!e) throw new Error("找不到 " + s); e.click(); };
  const fill = (s, value) => { $(s).value = value; $(s).dispatchEvent(new Event("input", { bubbles: true })); };
  const change = (s, value) => { fill(s, value); $(s).dispatchEvent(new Event("change", { bubbles: true })); };
  await wait(() => window.careerUI && window.webpageAssistant, "网页助手初始化");
  if (!$("#tab-assist").classList.contains("active")) throw new Error("首页必须是网页助手");
  if ($("#careerNew")) throw new Error("不应出现手动建档入口");
  if (restore) {
    if ($("#style").value !== "warm" || !$("#customStyleField").hidden) throw new Error("写作风格未正确恢复");
    await wait(() => document.querySelectorAll(".career-job").length === 1, "岗位恢复"); click(".career-job");
    await wait(() => $("#careerDetail").textContent.includes("简历诊断与修改建议"), "资料恢复");
    if (document.querySelectorAll(".career-turn").length !== 4) throw new Error("模拟面试未恢复");
    if ($("#careerQuickStage").value !== "offer") throw new Error("岗位阶段未恢复");
    await wait(() => $("#matchCity").value === "杭州" && $("#matchDoubleWeekend").checked, "筛选恢复");
    await wait(() => $("#autoAnalysis").textContent.includes("自动分析"), "重启自动恢复分析");
    return "restore passed";
  }
  const options = [...$("#style").options].map(o => o.value);
  if (options.join(",") !== "prof,warm,brief,custom") throw new Error("应有三个内置风格和一个自定义入口");
  showTab("settings");
  const draftResume = $("#resumeText").value;
  fill("#resumeText", draftResume + "临时未保存编辑");
  change("#style", "brief");
  await wait(() => $("#writingStyleStatus").textContent.includes("已自动保存"), "预设风格自动保存");
  if (!$("#resumeText").value.includes("临时未保存编辑")) throw new Error("保存风格覆盖了未保存的简历编辑");
  const savedStyle = await panelApi.getStore("bossAiSettings");
  if (savedStyle.bossAiSettings.style !== "brief" || savedStyle.bossAiSettings.resumes[0].text.includes("临时未保存编辑")) throw new Error("风格保存范围不正确");
  change("#style", "custom");
  if ($("#customStyleField").hidden) throw new Error("未显示自定义输入");
  fill("#customPrompt", "不用感叹号，每条回复不超过50字");
  await wait(() => $("#writingStyleStatus").textContent.includes("已自动保存"), "自定义风格自动保存");
  const customStyle = await panelApi.getStore("bossAiSettings");
  if (customStyle.bossAiSettings.style !== "custom" || !customStyle.bossAiSettings.customPrompt.includes("50字")) throw new Error("自定义风格未保存");
  change("#style", "warm");
  await wait(() => $("#writingStyleStatus").textContent.includes("已自动保存"), "切回内置风格");
  if (!$("#customStyleField").hidden) throw new Error("切回预设后应隐藏自定义输入");
  fill("#resumeText", draftResume); showTab("assist");
  await wait(() => $("#webJobInfo").textContent.includes("本地测试岗位"), "自动读取网页岗位");
  if ($("#webJobActions").scrollWidth > $("#webJobActions").clientWidth + 2) throw new Error("网页工具按钮超出面板宽度");
  const initial = await panelApi.getStore("bossAiCareerJobs");
  if ((initial.bossAiCareerJobs || []).length) throw new Error("读取网页不应自动建立档案");
  const originalSettings = await panelApi.getStore("bossAiSettings");
  await panelApi.setStore({ bossAiSettings: { ...originalSettings.bossAiSettings, apiKey: "smoke-key-only" } });
  click('[data-web-task="resume"]');
  await wait(() => $("#webTaskStatus").textContent.includes("已基于当前网页生成"), "无需建档直接分析");
  if (!$("#webResultJob").textContent.includes("本地测试岗位")) throw new Error("分析未使用网页岗位");
  const afterAnalysis = await panelApi.getStore("bossAiCareerJobs");
  if ((afterAnalysis.bossAiCareerJobs || []).length) throw new Error("使用工具不应强制创建收藏");
  click('[data-web-action="collect"]');
  await wait(() => document.querySelectorAll(".career-job").length === 1, "一键从网页收藏");
  if (!$("#careerEditor").hidden) throw new Error("收藏不应要求填写表单");
  showTab("workbench");
  change("#careerQuickStage", "applied"); await wait(() => $("#careerDetail").textContent.includes("已投简历"), "更新进度");
  const data = await panelApi.getStore("bossAiSettings"); await panelApi.setStore({ bossAiSettings: { ...data.bossAiSettings, apiKey: "smoke-key-only" } });
  click('[data-action="resume"]'); await wait(() => $("#careerStatus").textContent.includes("已保存到收藏记录"), "简历诊断");
  if (!$("#careerDraft").value.includes("测试草稿")) throw new Error("生成结果未显示");
  click('[data-action="mock"]'); await wait(() => document.querySelectorAll(".career-turn").length === 2, "模拟面试首题");
  fill("#careerMockAnswer", "我负责接口测试，并修复异常返回。"); click('[data-action="mock"]'); await wait(() => document.querySelectorAll(".career-turn").length === 4, "模拟面试追问");
  click('[data-action="offer"]'); fill("#coMonthly", "20000"); fill("#coMonths", "13"); fill("#coBonus", "10000"); $("#careerOfferForm").requestSubmit();
  await wait(() => $("#careerComparison").textContent.includes("270,000"), "Offer 对比");
  click('[data-action="interview"]'); fill("#ivRecDate", "2026-11-21T14:00"); fill("#ivRecRound", "技术一面"); click("#btnSaveIv");
  await wait(() => $("#ivList").textContent.includes("技术一面"), "关联面试");
  fill("#matchCity", "杭州"); fill("#matchMinSalary", "15"); $("#matchDoubleWeekend").checked = true; click("#matchSaveConditions");
  await wait(() => $("#matchStatus").textContent.includes("已保存"), "保存筛选");
  $("#autoAssistEnabled").checked = true; $("#autoAssistEnabled").dispatchEvent(new Event("change"));
  await wait(() => $("#autoAnalysis").textContent.includes("自动分析"), "自动分析无需点击生成");
  await wait(() => $("#autoReply").value.includes("这个时间方便"), "自动准备回复草稿");
  await wait(() => $("#ivList").textContent.includes("从聊天识别"), "自动识别面试安排");
  if ($("#ivCompany").value !== "示例公司" || $("#coName").value !== "示例公司") throw new Error("岗位信息没有自动带入其他功能");
  showTab("workbench"); window.scrollTo(0, 0); return "create passed";
}
app.whenReady().then(async () => {
  try {
    const panel = await wait(() => webContents.getAllWebContents().find(wc => wc.getURL().endsWith("/panel.html")));
    if (panel.isLoading()) await new Promise(resolve => panel.once("did-finish-load", resolve));
    console.log("smoke: panel ready");
    panel.on("console-message", event => { if (event.level >= 3) console.log("panel error:", event.message); });
    const boss = await wait(() => webContents.getAllWebContents().find(wc => wc.getURL().startsWith("https://www.zhipin.com/")));
    for (let i = 0; i < 60; i++) {
      if (await boss.executeJavaScript("!!window.__bossAiInjected").catch(() => false)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log("smoke: helper ready");
    const privacy = await boss.executeJavaScript("window.__bossBridge.storeGet('bossAiSettings')");
    if (privacy.bossAiSettings.apiKey || privacy.bossAiSettings.resumeText || privacy.bossAiSettings.resumes) throw new Error("网页获得了敏感设置");
    console.log("smoke: privacy read passed");
    const bridgeStatus = await panel.executeJavaScript("window.panelApi.bossAction({type:'panel-status',_timeout:3000})");
    if (!bridgeStatus.ok) throw new Error("BOSS 页面桥接不可用：" + bridgeStatus.error);
    console.log("smoke: bridge status passed");
    const result = await panel.executeJavaScript("(" + uiTest.toString() + ")(" + (process.env.BOSS_AI_TEST_PHASE === "restore") + ")", true);
    if (process.env.BOSS_AI_TEST_PHASE === "create") {
      if (global.autoCalls !== 1) throw new Error("相同内容自动分析发生重复请求：" + global.autoCalls);
      await boss.executeJavaScript(`document.querySelector('.chat-conversation').insertAdjacentHTML('beforeend', '<div class="message-item other"><div class="msg-text">请补充一下项目经历</div></div>'); void 0;`);
      await panel.executeJavaScript(`(async () => { for(let i=0;i<220;i++){ if(document.getElementById('autoReply').value.includes('补充一下项目经历') && document.getElementById('autoAssistStatus').textContent.includes('自动填入')) return true; await new Promise(r=>setTimeout(r,100)); } throw new Error('新消息未自动更新回复草稿'); })()`);
      if (global.autoCalls !== 2) throw new Error("新消息未合并为一次自动请求：" + global.autoCalls);
      const inputValue = await boss.executeJavaScript("document.querySelector('.chat-input').value");
      if (!inputValue.includes("补充一下项目经历")) throw new Error("新消息草稿未自动填入");
      const messageCount = await boss.executeJavaScript("document.querySelectorAll('.message-item').length");
      if (messageCount !== 2) throw new Error("不应自动发送消息");
      await boss.executeJavaScript("document.querySelector('.chat-input').value = '我自己正在编辑的内容'; void 0;");
      const protection = await panel.executeJavaScript(`(async () => { const c = await panelApi.bossAction({type:'get-page-context'}); return panelApi.bossAction({type:'fill-if-empty',text:'不应覆盖',expected:{title:c.jd.title,company:c.jd.company,lastText:c.history.at(-1).text}}); })()`);
      if (protection.filled || protection.reason !== "input-being-edited") throw new Error("人工草稿保护无效");
      const protectedText = await boss.executeJavaScript("document.querySelector('.chat-input').value");
      if (protectedText !== "我自己正在编辑的内容") throw new Error("人工草稿被覆盖");
      await boss.executeJavaScript(`history.replaceState(null, '', '/web/geek/jobs'); document.body.innerHTML = '<ul><li class="job-card-box"><a class="job-name" href="/job_detail/first.html">第一张岗位</a><span class="company-name">公司甲</span></li><li class="job-card-box"><a class="job-name" href="/job_detail/second.html">正在选择的岗位</a><span class="company-name">公司乙</span></li></ul>'`);
      const unknown = await panel.executeJavaScript("window.panelApi.bossAction({type:'get-page-context',_timeout:3000})");
      if (unknown.jd?.hasJd) throw new Error("未选中岗位时不应读取第一张卡片");
      await boss.executeJavaScript("document.querySelectorAll('.job-card-box')[1].classList.add('active')");
      const picked = await panel.executeJavaScript("window.panelApi.bossAction({type:'get-page-context',_timeout:3000})");
      if (picked.jd?.title !== "正在选择的岗位" || picked.jd?.company !== "公司乙") throw new Error("未读取明确选中的岗位");
      await boss.executeJavaScript(`history.replaceState(null, '', '/web/geek/chat'); document.body.innerHTML = '<div class="chat-conversation">当前会话没有岗位信息</div>'; window.fetch = async () => ({ok: true, json: async () => ({zpData: {friendList: [{friendId: 1, jobName: '别人的岗位', brandName: '其他公司', updateTime: 999999}]}})}); void 0;`);
      const unidentified = await panel.executeJavaScript("window.panelApi.bossAction({type:'getJd',_timeout:3000})");
      if (unidentified.jd?.hasJd) throw new Error("不能把最近更新的其他联系人当成当前岗位");
    }
    if (process.env.BOSS_AI_TEST_PHASE === "restore" && global.autoCalls) throw new Error("重启未复用自动分析缓存");
    console.log(result);
    await fs.mkdir(path.resolve(__dirname, "../test-results"), { recursive: true });

    app.quit();
  } catch (err) { console.error(err); app.exit(1); }
});
