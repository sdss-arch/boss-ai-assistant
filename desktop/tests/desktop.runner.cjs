const { app, webContents, session } = require("electron");
const fs = require("fs/promises"), path = require("path");
// 同一主进程执行原应用，通过原生 Electron API 驱动实际面板。
global.autoCalls = 0;
global.localCalls = 0;
global.fetch = async (_url, options) => {
  if (String(_url).endsWith("/api/tags")) return {ok:true,json:async()=>({models:[{name:"qwen3:4b",size:2500000000}]})};
  if (String(_url).endsWith("/api/show")) return {ok:true,json:async()=>({details:{family:"qwen3"}})};
  if (String(_url).endsWith("/v1/models")) return {ok:true,json:async()=>({data:[{id:"local-chat"}]})};
  const body = JSON.parse(options?.body || "{}");
  if (body.messages?.[0]?.content.includes("独立复核者")) {
    global.lastGreetingReviewBody=body;
    return {ok:true,json:async()=>({choices:[{message:{content:require('./greeting.fixture.cjs').reviewOutput}}],usage:{total_tokens:5}})};
  }
  if (body.messages?.[0]?.content.includes("输出固定3个版本")) {
    global.lastGreetingBody = body;
    const sample=require('./greeting.fixture.cjs'),material=JSON.parse(body.messages[1].content),role=material.job.title||'这个岗位';
    const title=/(?:岗位|职位)$/.test(role)?role:role+'岗位';
    const content=JSON.stringify({versions:sample.draft.versions.map(v=>({...v,text:v.text.replace('Node.js开发岗位',title)}))});
    return {ok:true,json:async()=>({choices:[{message:{content}}],usage:{total_tokens:10}})};
  }
  if (body.messages?.[0]?.content.includes("优化 BOSS 在线简历当前这一段")) global.lastOnlineBody = body;
  const automatic = body.messages?.[0]?.content.includes('"analysis"');
  if (automatic) global.autoCalls++;
  const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10) + "T15:30:00+08:00";
  const content = automatic ? JSON.stringify({ analysis: "自动分析：已有 Node.js 项目依据，需核实岗位细节。", summary: "对方提出面试时间。", reply: JSON.stringify(body.messages).includes("请补充一下项目经历") ? "好的，我补充一下项目经历。" : "好的，这个时间方便。", preparation: "准备介绍接口开发项目。", interview: { date, quote: "明天15:30面试，方便吗？" } }) : "测试草稿：请介绍一个你参与的接口开发项目。\n\n根据真实经历补充项目细节。";
  if (String(_url).endsWith("/api/chat")) {
    if (options.headers.Authorization) throw new Error("本地调用不应复用云端 Key");
    global.localCalls++;
    return {ok:true,json:async()=>({message:{content},prompt_eval_count:3,eval_count:4})};
  }
  return { ok: true, json: async () => ({ choices: [{ message: { content } }], usage: { total_tokens: 12 } }) };
};
app.whenReady().then(() => session.defaultSession.protocol.handle("https", request => new Response(new URL(request.url).pathname === "/web/geek/resume" ? require("./online-resume.fixture.cjs") : '<!doctype html><html><body><h1>本地测试岗位</h1><div class="company-name">示例公司</div><div class="salary">15-20K</div><div class="job-detail"><div class="job-sec-text">Node.js 开发，双休，本地测试页面。</div></div><div class="chat-conversation"><div class="message-item other"><div class="msg-text">明天15:30面试，方便吗？</div></div><textarea class="chat-input"></textarea></div></body></html>', { headers: { "content-type": "text/html;charset=utf-8" } })));
require("../main");
async function wait(fn) { for (let i = 0; i < 120; i++) { const value = fn(); if (value) return value; await new Promise(r => setTimeout(r, 100)); } throw new Error("等待面板超时"); }
async function widgetTest(boss, panel, restore) {
  const read = () => boss.executeJavaScript(`(() => {
    const root = document.getElementById('boss-ai-helper-host')?.shadowRoot;
    const wrap = root?.querySelector('.fab-wrap'); if (!wrap) return null;
    const box = wrap.getBoundingClientRect(), popup = root.querySelector('.panel').getBoundingClientRect();
    return {hidden:wrap.hidden,x:box.x,y:box.y,width:box.width,height:box.height,viewportWidth:innerWidth,viewportHeight:innerHeight,
      open:root.querySelector('.panel').classList.contains('open'),popup:{left:popup.left,top:popup.top,right:popup.right,bottom:popup.bottom}};
  })()`);
  const until = async (fn, label) => { for (let i = 0; i < 80; i++) { const value = await fn(); if (value) return value; await new Promise(r => setTimeout(r, 50)); } throw new Error('悬浮按钮验证失败：' + label); };
  await until(async () => !!await read(), '初始化');
  if (restore) {
    await until(async () => (await read()).hidden, '重启恢复关闭状态');
    await panel.executeJavaScript(`document.getElementById('btnResetWidget').click(); void 0;`);
    await until(async () => !(await read()).hidden, '设置重新显示按钮');
    const state = await read();
    if (Math.abs(state.x - (state.viewportWidth - 76)) > 2 || Math.abs(state.y - (state.viewportHeight - 142)) > 2) throw new Error('恢复默认位置无效');
    return;
  }
  await until(async () => !(await read()).hidden, '默认显示');
  const initial = await read();
  // 隐藏窗口使用 DOM PointerEvent 驱动实际组件；跨窗口捕获另在可见桌面验证。
  await boss.executeJavaScript(`(() => {
    const fab=document.getElementById('boss-ai-helper-host').shadowRoot.querySelector('.fab');
    const rect=fab.getBoundingClientRect();
    const pointer=(type,x,y)=>fab.dispatchEvent(new PointerEvent(type,{bubbles:true,composed:true,pointerId:1,isPrimary:true,button:0,clientX:x,clientY:y}));
    pointer('pointerdown',rect.x+26,rect.y+26); pointer('pointermove',166,156); pointer('pointerup',166,156);
    fab.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));
  })()`);
  await until(async () => { const state = await read(); return Math.abs(state.x-140)<2 && Math.abs(state.y-130)<2; }, '鼠标拖动');
  if ((await read()).open) throw new Error('拖动结束误触打开面板');
  await until(async () => Number.isFinite((await require('../src/core/store').get('bossAiWidget'))?.x), '自动保存位置');
  const position = await read();
  boss.reload();
  await until(async () => { const state = await read().catch(()=>null); return state && !state.hidden && Math.abs(state.x-position.x)<2 && Math.abs(state.y-position.y)<2; }, '刷新恢复位置');
  await boss.executeJavaScript(`document.getElementById('boss-ai-helper-host').shadowRoot.querySelector('.fab').click(); void 0;`);
  await until(async () => (await read()).open, '点击打开面板');
  const { BrowserWindow } = require('electron');
  const win = BrowserWindow.getAllWindows()[0], originalSize = win.getSize();
  win.setSize(1180,720);
  await new Promise(r=>setTimeout(r,150));
  const resized = await read();
  if (resized.x<0 || resized.y<0 || resized.x+52>resized.viewportWidth || resized.y+52>resized.viewportHeight || resized.popup.left<0 || resized.popup.top<0 || resized.popup.right>resized.viewportWidth+1 || resized.popup.bottom>resized.viewportHeight+1) throw new Error('缩小窗口后按钮或面板超出视口');
  win.setSize(...originalSize);
  await boss.executeJavaScript(`document.getElementById('boss-ai-helper-host').shadowRoot.querySelector('.fab-close').click(); void 0;`);
  await until(async () => (await read()).hidden && require('../src/core/store').get('bossAiWidget')?.hidden, '关闭并保存状态');
  await panel.executeJavaScript(`(() => {const toggle=document.getElementById('floatingWidget'); toggle.checked=true; toggle.dispatchEvent(new Event('change'));})()`);
  await until(async () => !(await read()).hidden, '从设置重新显示');
  if (Math.abs((await read()).x-position.x)>2) throw new Error('重新显示丢失拖动位置');
  await boss.executeJavaScript(`document.getElementById('boss-ai-helper-host').shadowRoot.querySelector('.fab-close').click(); void 0;`);
  await until(async () => (await read()).hidden && require('../src/core/store').get('bossAiWidget')?.hidden, '关闭状态留待重启验证');
}
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
  fill("#resumeText", draftResume);
  fill("#apiKey", "deepseek-only-fixture-key");
  await wait(() => $("#modelSaveStatus").textContent.includes("已自动保存"), "云端 Key 独立保存");
  change("#provider", "ollama");
  if ($("#apiKey").value || !$("#modelFreeOnly").checked) throw new Error("切换本地服务复用了云端 Key");
  click("#btnReadModels");
  await wait(() => $("#model").value === "qwen3:4b", "真实读取服务模型列表");
  click("#btnTestApi");
  await wait(() => $("#apiTestStatus").textContent.includes("连接正常"), "无 Key 本地调用连接测试");
  change("#provider", "openrouter");
  if ($("#apiKey").value || !$("#modelFreeOnly").checked) throw new Error("免费云端服务复用了其他 Key 或关闭免费保护");
  fill("#apiKey", "router-fixture-key"); fill("#model", "paid/model");
  click("#btnTestApi");
  await wait(() => $("#apiTestStatus").textContent.includes("拒绝付费模型"), "免费模式 UI 拦截付费调用");
  change("#provider", "deepseek");
  if ($("#apiKey").value !== "deepseek-only-fixture-key") throw new Error("切回服务丢失独立 Key");
  await wait(() => $("#modelSaveStatus").textContent.includes("已自动保存"), "恢复原有云端配置");
  showTab("assist");
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
    if (process.env.BOSS_AI_TEST_PHASE === "greeting") {
      await require("./greeting.ui.cjs")(panel, boss);
      console.log("PASS: 三版招呼语策略标签、真实请求材料、跨页草稿与第三版回填；未发送消息");
      app.quit(); return;
    }
    if (process.env.BOSS_AI_TEST_PHASE === "online-resume") {
      await require("./online-resume.ui.cjs")(panel, boss);
      console.log("PASS: 在线简历读取、优化、回填、撤回、原文变化与人工编辑保护；未提交网页");
      app.quit(); return;
    }
    await widgetTest(boss, panel, process.env.BOSS_AI_TEST_PHASE === "restore");
    console.log("smoke: draggable widget, close, settings and persistence passed");
    const result = await panel.executeJavaScript("(" + uiTest.toString() + ")(" + (process.env.BOSS_AI_TEST_PHASE === "restore") + ")", true);
    if (process.env.BOSS_AI_TEST_PHASE === "create") {
      if (global.localCalls !== 1) throw new Error("本地模型连接未实际发起原生请求");
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

    // 可选的截图模式：由 scripts/capture-screenshots.cjs 触发，使用 mock 数据。
    if (process.env.BOSS_AI_CAPTURE_DIR) {
      const dir = process.env.BOSS_AI_CAPTURE_DIR;
      await fs.mkdir(dir, { recursive: true });
      const snap = async (tab, file) => {
        await panel.executeJavaScript(`showTab(${JSON.stringify(tab)}); void 0`);
        await new Promise(resolve => setTimeout(resolve, 900));
        await fs.writeFile(path.join(dir, file), (await panel.capturePage()).toPNG());
        console.log("capture: " + file);
      };
      await snap("assist", "01-web-assistant.png");
      await snap("workbench", "02-workbench.png");
      await snap("settings", "03-settings.png");
    }

    app.quit();
  } catch (err) { console.error(err); app.exit(1); }
});
