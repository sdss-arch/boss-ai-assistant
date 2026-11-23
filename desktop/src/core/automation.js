(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AutoAssist = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  const clip = (value, max = 16000) => typeof value === "string" ? value.slice(0, max) : "";
  function parse(text, history = [], now = Date.now()) {
    let data;
    try { data = JSON.parse(String(text).replace(/^\s*```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim()); }
    catch { return { analysis: clip(String(text)), summary: "", reply: "", preparation: "", interview: null }; }
    if (!data || typeof data !== "object") throw new Error("自动分析结果格式无效");
    const last = history.at(-1);
    const result = { analysis: clip(data.analysis), summary: clip(data.summary, 5000),
      reply: last && !last.self ? clip(data.reply, 3000) : "", preparation: clip(data.preparation, 10000), interview: null };
    if (![result.analysis, result.summary, result.reply, result.preparation].some(value => value.trim())) throw new Error("模型未返回有效的自动分析内容");
    const date = data.interview?.date, quote = clip(data.interview?.quote, 1000);
    const raw = history.map(m => m.text || "").join("\n");
    // 自动识别只建立待确认记录：必须有原文证据、明确面试语义与带时区的有效时间。
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/.test(date) &&
        Number.isFinite(Date.parse(date)) && Date.parse(date) >= now - 86400000 && Date.parse(date) <= now + 366 * 86400000 &&
        quote.length >= 4 && raw.includes(quote) && /面试|面谈/.test(quote) && /\d{1,2}[:：点]|明天|后天|周[一二三四五六日天]|\d{1,2}月/.test(quote)) {
      result.interview = { date: new Date(date).toISOString(), quote };
    }
    return result;
  }
  function signature(job, settings, history) {
    const resumes = settings.resumes || [];
    const resume = resumes.find(r => r.id === settings.activeResumeId) || resumes[0];
    return JSON.stringify({ title: job.title, company: job.company, href: job.href, desc: job.desc, salary: job.salary,
      resume: resume?.text || settings.resumeText || "", provider: settings.provider || "deepseek", baseUrl: settings.baseUrl || "", freeOnly: settings.freeOnly ?? false, contextSize: settings.contextSize, maxOutputTokens: settings.maxOutputTokens, model: settings.model || "deepseek-chat", style: settings.style || "prof", styleVersion: settings.writingStyleVersion || 0, custom: settings.customPrompt || "", history });
  }
  return { parse, signature };
});
