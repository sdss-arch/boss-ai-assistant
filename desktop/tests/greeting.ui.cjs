module.exports = async function greetingTest(panel, boss) {
  const sample = require('./greeting.fixture.cjs'), store = require('../src/core/store');
  const texts = sample.texts.map(text=>text.replace('Node.js开发岗位','本地测试岗位'));
  store.set({ bossAiSettings: { ...store.getSettings(), resumeText:sample.resume, resumes:[{id:'greeting-resume',name:'测试简历',text:sample.resume}],activeResumeId:'greeting-resume' }, bossAiAutoAssist:false }); store.flush();
  await panel.executeJavaScript("(async()=>{await loadSettings();showTab('assist');document.getElementById('btnGreeting').click();})()");
  for (let i=0;i<120;i++) {
    if (await panel.executeJavaScript("document.querySelectorAll('#content .ver').length===3")) break;
    if (i===119) throw new Error('未显示三版招呼语：'+await panel.executeJavaScript("document.getElementById('status').textContent").catch(()=>''));
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const titles = await panel.executeJavaScript("[...document.querySelectorAll('#content .ver .tag')].map(node=>node.textContent)");
  for (let i=0;i<3;i++) if (!titles[i]?.includes(require('../src/core/greeting-format').names[i])) throw new Error('招呼语卡片缺少策略名');
  const pending = store.get('bossAiPendingGreeting');
  if (pending.versions.length!==3 || pending.versions[2]!==texts[2]) throw new Error('第三版未保存到跨页待发送草稿');
  if (pending.evidence?.length!==3) throw new Error('草稿缺少简历原文依据');
  const sources = await panel.executeJavaScript("[...document.querySelectorAll('#content .greeting-source')].map(node=>node.textContent)");
  if (sources.length!==3 || !sources[2].includes('排查失败请求日志中的问题')) throw new Error('未展示可核对的简历原文');
  await panel.executeJavaScript("document.querySelectorAll('#content .greeting-source')[2].open=true; void 0;");
  if (require('../src/core/greeting-format').count(pending.versions[1])>=100) throw new Error('测试未覆盖不足100字的极简版');
  await panel.executeJavaScript("document.querySelectorAll('#content .ver')[2].querySelector('.ops button').click(); void 0;");
  for (let i=0;i<50;i++) {
    if (await boss.executeJavaScript("document.querySelector('.chat-input').value")==texts[2]) break;
    if (i===49) throw new Error('业务共情版未正确填入聊天框');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const value=await boss.executeJavaScript("document.querySelector('.chat-input').value");
  if (/版本3|业务共情版/.test(value) || await boss.executeJavaScript("document.querySelectorAll('.message-item').length")!==1) throw new Error('标题被填入正文或擅自发送');
  if (!global.lastGreetingBody?.messages?.[1]?.content.includes(sample.url)) throw new Error('作品链接未实际传入模型请求');
  if (!global.lastGreetingReviewBody?.messages?.[1]?.content.includes('evidenceIds')) throw new Error('未实际调用独立事实与表达复核');
};
