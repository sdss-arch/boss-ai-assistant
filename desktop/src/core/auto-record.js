const Career = require("./career");

function recordConversation(store, { job, history, result }) {
  if (!job?.title || !Array.isArray(history) || !history.some(m => String(m.text || "").trim())) return { recorded: false };
  const jobs = store.get("bossAiCareerJobs") || [];
  const old = jobs.find(j => Career.identity(j) === Career.identity(job));
  const data = { ...job };
  for (const key of ["desc", "salary", "location", "href"]) if (!data[key]) delete data[key];
  const saved = Career.saveJob(jobs, { ...data, id: old?.id, stage: old?.stage || "contacted", channel: old?.channel || "BOSS直聘",
    resumeId: old?.resumeId || job.resumeId || "", resumeText: old?.resumeText || job.resumeText || "",
    replied: !!old?.replied || history.some(m => !m.self) });
  saved.job.autoSummary = result.summary || saved.job.autoSummary || "";
  saved.job.lastSeenAt = Date.now();
  store.set({ bossAiCareerJobs: saved.jobs });
  let interviewAdded = false;
  if (result.interview) {
    const list = store.get("bossAiInterviews") || [];
    const date = result.interview.date;
    if (!list.some(i => i.jobId === saved.job.id && +new Date(i.date) === +new Date(date))) {
      list.push({ id: Career.uid(), jobId: saved.job.id, company: saved.job.company, title: saved.job.title,
        date, status: "pending", note: "从聊天识别，待本人核实：" + result.interview.quote, source: "chat", ts: Date.now() });
      store.set({ bossAiInterviews: list }); interviewAdded = true;
    }
  }
  return { recorded: true, jobId: saved.job.id, interviewAdded };
}
module.exports = { recordConversation };
