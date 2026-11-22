const Career = require("../../../src/core/career");

test("重复收藏使用岗位身份去重，更新时保留阶段与资料", () => {
  const first = Career.saveJob([], { title: "工程师", company: "测试公司", href: "/job_detail/test.html?x=1" });
  first.job.artifacts.push({ text: "准备卡" });
  const next = Career.saveJob(first.jobs, { title: "工程师", company: "测试公司", href: "/job_detail/test.html?x=2", stage: "applied" });
  expect(next.jobs).toHaveLength(1);
  expect(next.job.id).toBe(first.job.id);
  expect(next.job.history.map(h => h.stage)).toEqual(["saved", "applied"]);
  expect(next.job.artifacts).toHaveLength(1);
});
test("明确违反硬条件的岗位被排除，未知信息只标记待核实", () => {
  expect(Career.checkConditions({ title: "工程师", salary: "10-12K", location: "杭州", tags: "单休" }, { minSalary: 15, doubleWeekend: true }).eligible).toBe(false);
  const unknown = Career.checkConditions({ title: "工程师" }, { city: "杭州", minSalary: 15, doubleWeekend: true });
  expect(unknown.eligible).toBe(true);
  expect(unknown.unknown).toHaveLength(4);
});
test("拒绝外部岗位链接以及非法阶段或时间", () => {
  expect(() => Career.saveJob([], { title: "岗位", href: "https://zhipin.com.evil.invalid" })).toThrow();
  expect(() => Career.saveJob([], { title: "岗位", stage: "unknown" })).toThrow();
  expect(() => Career.saveJob([], { title: "岗位", followUpAt: "bad-date" })).toThrow();
});
test("Offer 保证年现金不会重复计算，缺失薪资不伪造结果", () => {
  expect(Career.offerSummary({ monthly: 20000, months: 13, bonus: 10000 }).annual).toBe(270000);
  expect(Career.offerSummary({})).toBeNull();
  expect(Career.offerSummary({ monthly: -1 })).toBeNull();
});
test("日历导出使用 UTC 时间并转义用户内容", () => {
  const ics = Career.calendarEvent({ id: "test", date: "2026-11-21T14:00:00+08:00", company: "测试,公司", title: "开发", note: "第一行\n第二行" });
  expect(ics).toContain("DTSTART:20261121T060000Z");
  expect(ics).toContain("测试\\,公司");
  expect(ics).toContain("第一行\\n第二行");
  expect(() => Career.calendarEvent({ date: "无效" })).toThrow();
});
test("阶段变更保留面试历史，关闭岗位后仍计入求职复盘", () => {
  let jobs = Career.saveJob([], { title: "岗位", stage: "applied" }).jobs;
  jobs = Career.saveJob(jobs, { id: jobs[0].id, title: "岗位", stage: "interview" }).jobs;
  jobs = Career.saveJob(jobs, { id: jobs[0].id, title: "岗位", stage: "closed" }).jobs;
  expect(Career.metrics(jobs)).toMatchObject({ contacted: 1, interviews: 1, interviewRate: 100 });
});
