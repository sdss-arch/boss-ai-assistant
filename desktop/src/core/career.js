/* 同一套求职数据规则供主进程、面板与测试使用。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Career = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  const STAGES = { saved: "感兴趣", contacted: "已沟通", applied: "已投简历", interview: "面试中", offer: "Offer", closed: "已结束" };
  const uid = () => "j_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const text = (v, max = 100000) => String(v ?? "").slice(0, max);
  function identity(job) {
    try {
      const u = new URL(job.href, "https://www.zhipin.com");
      const m = u.pathname.match(/\/job_detail\/([^/.]+)\.html/);
      if (m) return "boss:" + m[1];
    } catch {}
    return [job.company, job.title, job.location].map(x => text(x, 300).trim().toLowerCase()).join("|");
  }
  function saveJob(jobs, input, now = Date.now()) {
    if (!text(input.title).trim()) throw new Error("请填写岗位名称");
    const existing = jobs.find(j => input.id ? j.id === input.id : identity(j) === identity(input));
    const stage = input.stage || existing?.stage || "saved";
    if (!STAGES[stage]) throw new Error("岗位状态无效");
    const job = { ...existing, id: existing?.id || uid(), createdAt: existing?.createdAt || now, updatedAt: now, stage };
    for (const key of ["title", "company", "salary", "location", "href", "desc", "tags", "resumeId", "resumeText", "channel", "note", "summary", "nextAction", "followUpAt", "closeReason"]) {
      if (input[key] !== undefined) job[key] = text(input[key]);
    }
    if (input.href) {
      const u = new URL(input.href, "https://www.zhipin.com");
      if (u.protocol !== "https:" || !(u.hostname === "zhipin.com" || u.hostname.endsWith(".zhipin.com"))) throw new Error("岗位链接必须来自 BOSS 站内");
      job.href = u.href;
    }
    if (input.followUpAt && !Number.isFinite(Date.parse(input.followUpAt))) throw new Error("跟进时间无效");
    if (input.replied !== undefined) job.replied = !!input.replied;
    job.history = [...(existing?.history || [])];
    if (!existing || existing.stage !== stage) job.history.push({ stage, ts: now });
    job.artifacts = existing?.artifacts || [];
    job.offer = existing?.offer || {};
    return { job, jobs: existing ? jobs.map(j => j.id === job.id ? job : j) : [job, ...jobs] };
  }
  function salaryRange(job) {
    const raw = text(job.salary);
    const range = raw.match(/(\d+(?:\.\d+)?)\s*[-~—至]\s*(\d+(?:\.\d+)?)\s*[kK]/);
    if (range) return { min: +range[1], max: +range[2] };
    const single = raw.match(/(\d+(?:\.\d+)?)\s*[kK]/);
    return single ? { min: +single[1], max: +single[1] } : null;
  }
  function checkConditions(job, cfg = {}) {
    const rejected = [], unknown = [];
    if (cfg.city) {
      if (!job.location) unknown.push("工作地点待确认");
      else if (!text(job.location).includes(text(cfg.city).replace(/市$/, ""))) rejected.push("城市不符合");
    }
    const salary = salaryRange(job);
    if (+cfg.minSalary > 0) {
      if (!salary) unknown.push("薪资待确认");
      else if (salary.max < +cfg.minSalary) rejected.push("薪资低于底线");
      else if (salary.min < +cfg.minSalary) unknown.push("薪资区间跨越底线，需确认实际报价");
    }
    const body = [job.title, job.company, job.tags, job.desc].join(" ");
    const excluded = text(cfg.excludeKeywords).split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
    if (cfg.noOutsource) excluded.push("外包", "劳务派遣", "人力外包");
    for (const keyword of excluded) if (body.includes(keyword)) rejected.push("包含排除项：" + keyword);
    if (cfg.doubleWeekend) {
      if (/单休|单双休|大小周|六天制/.test(body)) rejected.push("休息制度不符合");
      else if (!/双休/.test(body)) unknown.push("是否双休待确认");
    }
    if (!text(job.desc).trim()) unknown.push("未获取完整 JD，仅能初筛");
    return { eligible: !rejected.length, rejected, unknown };
  }
  function offerSummary(offer = {}) {
    const monthly = Number(offer.monthly), months = Number(offer.months || 12), bonus = Number(offer.bonus || 0);
    if (!Number.isFinite(monthly) || monthly <= 0 || !Number.isFinite(months) || months <= 0 || !Number.isFinite(bonus) || bonus < 0) return null;
    return { annual: monthly * months + bonus, commute: Number(offer.commute || 0) };
  }
  function metrics(jobs) {
    const reached = (job, stage) => job.stage === stage || (job.history || []).some(h => h.stage === stage);
    const contacted = jobs.filter(j => ["contacted", "applied", "interview", "offer"].some(stage => reached(j, stage))).length;
    const replied = jobs.filter(j => j.replied || reached(j, "interview") || reached(j, "offer")).length;
    const interviews = jobs.filter(j => reached(j, "interview")).length;
    const offers = jobs.filter(j => reached(j, "offer")).length;
    return { total: jobs.length, contacted, replied, interviews, offers, responseRate: contacted ? Math.min(100, Math.round(replied / contacted * 100)) : 0, interviewRate: contacted ? Math.round(interviews / contacted * 100) : 0 };
  }
  function calendarEvent(rec) {
    const date = new Date(rec.date);
    if (!Number.isFinite(date.getTime())) throw new Error("请先填写有效的面试日期和时间");
    const stamp = d => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const escape = s => text(s).replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BossAI//Career//ZH", "BEGIN:VEVENT", "UID:" + text(rec.id) + "@bossai.local", "DTSTAMP:" + stamp(new Date()), "DTSTART:" + stamp(date), "DTEND:" + stamp(new Date(+date + 3600000)), "SUMMARY:" + escape((rec.company || "") + " " + (rec.title || "") + " 面试"), "DESCRIPTION:" + escape(rec.note || ""), "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", "DESCRIPTION:面试提醒", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  }
  return { STAGES, uid, identity, saveJob, salaryRange, checkConditions, offerSummary, metrics, calendarEvent };
});
