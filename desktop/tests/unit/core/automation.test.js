const Auto = require("../../../src/core/automation");
const { recordConversation } = require("../../../src/core/auto-record");
test("自己发出消息后不再提供待回复草稿", () => {
  expect(Auto.parse('{"analysis":"分析","reply":"草稿"}', [{ self: true, text: "收到" }]).reply).toBe("");
  expect(Auto.parse('{"analysis":"分析","reply":"草稿"}', [{ self: false, text: "你好" }]).reply).toBe("草稿");
});
test("面试时间必须可在聊天原文找到证据，无法核实的日期不会入库", () => {
  const now = Date.parse("2026-11-20T09:00:00+08:00"), quote = "明天15:30面试，方便吗？";
  const data = { analysis: "分析", interview: { date: "2026-11-21T15:30:00+08:00", quote } };
  expect(Auto.parse(JSON.stringify(data), [{ text: quote }], now).interview).toMatchObject({ date: "2026-11-21T07:30:00.000Z" });
  expect(Auto.parse(JSON.stringify(data), [{ text: "下周再联系" }], now).interview).toBeNull();
  data.interview.date = "无效时间"; expect(Auto.parse(JSON.stringify(data), [{ text: quote }], now).interview).toBeNull();
});
test("重复同步聊天不会创建重复岗位或面试，也不覆盖人工状态和备注", () => {
  const data = {}, store = { get: k => data[k], set: obj => Object.assign(data, obj) };
  const input = { job: { title: "开发", company: "公司", href: "/job_detail/a.html" }, history: [{ self: false, text: "面试" }],
    result: { summary: "沟通摘要", interview: { date: "2026-11-21T07:30:00.000Z", quote: "明天15:30面试" } } };
  recordConversation(store, input);
  data.bossAiCareerJobs[0].stage = "offer"; data.bossAiCareerJobs[0].note = "人工备注";
  data.bossAiInterviews[0].status = "confirmed";
  recordConversation(store, input);
  expect(data.bossAiCareerJobs).toHaveLength(1); expect(data.bossAiInterviews).toHaveLength(1);
  expect(data.bossAiCareerJobs[0]).toMatchObject({ stage: "offer", note: "人工备注", autoSummary: "沟通摘要" });
  expect(data.bossAiInterviews[0].status).toBe("confirmed");
});
test("仅浏览职位不建立跟进记录，简历变化会使分析缓存失效", () => {
  const store = { get: jest.fn(), set: jest.fn() };
  expect(recordConversation(store, { job: { title: "开发" }, history: [], result: {} }).recorded).toBe(false);
  expect(store.set).not.toHaveBeenCalled();
  expect(Auto.signature({ title: "开发" }, { resumeText: "版本A" }, [])).not.toBe(Auto.signature({ title: "开发" }, { resumeText: "版本B" }, []));
});
