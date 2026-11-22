/**
 * MatchAgent v2（重构版）：
 * 使用 AgentBase + prompt 模板
 */
const { AgentBase } = require("./agent-base");

class MatchAgent extends AgentBase {
  constructor({ learningAdapter } = {}) {
    super({
      id: "match",
      name: "岗位匹配师",
      role: "岗位智能匹配",
      description: "基于简历与岗位列表深度匹配打分，识别值得投递的岗位",
      temperature: 0.3,
      model: "deepseek-chat",
      learningAdapter
    });
  }

  buildMessages(input, ctx) {
    const { resumeText, jobs, extra, conditions } = input || {};
    const list = Array.isArray(jobs) ? jobs : [];
    const extraText = String(extra || "").trim();

    const sys = this.renderPrompt("system.md");
    const user =
      "【我的简历（基本信息+项目经验）】\n" + (resumeText || "（未提供简历）") +
      (extraText ? "\n\n【我的补充要求（优先于简历执行）】\n" + extraText : "") +
      "\n【硬性筛选条件】" + JSON.stringify(conditions || {}) +
      "\n\n【候选岗位列表】\n" + list.map((j, i) =>
        (i + 1) + ". [id:" + (j.id || "") + "] " + (j.title || "未知") + " | " + (j.company || "未知") + " | " + (j.salary || "薪资未知") +
        (j.location ? " | 地点：" + j.location : "") +
        (j.tags ? " | 标签：" + j.tags : "") +
        "\n完整 JD：" + (j.desc ? String(j.desc).slice(0, 2500) : "未获取，仅可初筛，分数不得超过 60")
      ).join("\n") +
      "\n\n请按上述规则逐个思考并打分，输出 JSON。";

    return [{ role: "system", content: sys }, { role: "user", content: user }];
  }

  parseMatched(text) {
    if (!text) return null;
    let raw = String(text);
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) raw = fence[1];
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      const obj = JSON.parse(raw.slice(start, end + 1));
      const jobs = Array.isArray(obj.jobs) ? obj.jobs : [];
      if (!jobs.length) return null;
      return jobs.map((j) => ({
        id: String(j.id || ""),
        title: String(j.title || ""),
        company: String(j.company || ""),
        score: Math.max(0, Math.min(100, Number(j.score) || 0)),
        level: j.level === "ok" ? "ok" : j.level === "low" ? "low" : "strong",
        reason: String(j.reason || ""),
        matchPoints: Array.isArray(j.matchPoints) ? j.matchPoints.slice(0, 3) : [],
        gaps: Array.isArray(j.gaps) ? j.gaps.slice(0, 3) : []
      }));
    } catch (e) {
      return null;
    }
  }

  async execute(input, ctx) {
    const res = await super.execute(input, ctx);
    const parsed = this.parseMatched(res.text);
    if (!parsed) throw new Error("模型返回的岗位评分格式无效，请重试");
    const byId = new Map();
    for (const j of (input && input.jobs) || []) {
      if (j.id) byId.set(String(j.id), j);
    }
    const seen = new Set();
    const { checkConditions } = require("../core/career");
    const matched = parsed.filter(m => byId.has(m.id) && !seen.has(m.id) && seen.add(m.id)).map(m => {
      const source = byId.get(m.id);
      const checks = checkConditions(source, input.conditions);
      const score = checks.eligible ? (source.desc ? m.score : Math.min(60, m.score)) : 0;
      return { ...source, score, level: score >= 75 ? "strong" : score >= 60 ? "ok" : "low",
        reason: m.reason, matchPoints: m.matchPoints.map(String),
        gaps: [...new Set([...m.gaps.map(String), ...checks.rejected, ...checks.unknown])],
        confidence: source.desc ? "detail" : "summary" };
    });
    return { text: res.text, matched, meta: { agent: this.id, agentName: this.name, ...res.meta } };
  }
}

module.exports = { MatchAgent };
