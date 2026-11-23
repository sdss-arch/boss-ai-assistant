module.exports = `<!doctype html><html><body>
<main><h2>测试用户</h2>
<section class="resume-item"><h3>个人优势</h3><div class="item-primary">
<div class="text" id="advantage" onclick="document.getElementById('adv-form').hidden=false">参与 Node.js 服务开发和接口测试，负责异常处理与文档整理。</div>
<form id="adv-form" hidden onsubmit="event.preventDefault();window.saved=(window.saved||0)+1">
<textarea id="adv-input" maxlength="1000">参与 Node.js 服务开发和接口测试，负责异常处理与文档整理。</textarea><button type="submit">保存</button></form>
</div></section>
<section class="resume-item"><h3>工作经历</h3><div class="history-item">
<h4>示例公司 · 开发实习生</h4><div class="text">维护订单接口并编写测试用例，协助定位返回异常。</div>
<button onclick="document.getElementById('work-form').hidden=false">编辑</button>
<form id="work-form" hidden><textarea id="work-input">维护订单接口并编写测试用例，协助定位返回异常。</textarea><button type="button">完成</button></form>
</div></section>
<section><h3>教育经历</h3><p>示例大学，本科</p></section>
<section><h3>专业技能</h3><div class="text">熟悉 Node.js、JavaScript 与接口测试，能够编写和维护自动化测试。</div></section>
<section><h3>自定义添加</h3></section>
</main></body></html>`;
