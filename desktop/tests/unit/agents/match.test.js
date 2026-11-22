const { MatchAgent } = require("../../../src/agents/match");
test("评分只接受真实候选，保留原岗位数据，缺少 JD 时限制高分", async () => {
  const agent = new MatchAgent();
  const result = await agent.execute({ jobs: [{ id: "a", title: "真实岗位", company: "真实公司", salary: "15-20K", href: "/job_detail/a.html" }] }, {
    settings: { apiKey: "test" }, llm: { call: async () => ({ text: JSON.stringify({ jobs: [{ id: "a", title: "模型改名", score: 98 }, { id: "fake", score: 100 }, { id: "a", score: 80 }] }) }) }
  });
  expect(result.matched).toHaveLength(1);
  expect(result.matched[0]).toMatchObject({ title: "真实岗位", company: "真实公司", score: 60, salary: "15-20K", confidence: "summary" });
});
