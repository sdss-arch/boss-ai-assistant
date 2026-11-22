/**
 * AgentBase - 增强版 Agent 基类
 *
 * 在 BaseAgent 基础上增加：
 * - Prompt 模板加载（外部化 prompt）
 * - Skill 动态调用
 * - 学习数据记录
 * - 条件 prompt 段落组装
 */
const { BaseAgent } = require("./base");
const { PromptLoader } = require("../utils/prompt-loader");
const logger = require("../core/logger");
const path = require("path");

class AgentBase extends BaseAgent {
  constructor({ promptsDir, learningAdapter, ...opts }) {
    super(opts);
    this.promptsDir = promptsDir || path.join(__dirname, "../../prompts");
    this.promptLoader = new PromptLoader(this.promptsDir);
    this.learningAdapter = learningAdapter || null;
  }

  /**
   * 加载并渲染 prompt 模板
   * @param {string} filename - 文件名（如 "system.md"）
   * @param {object} vars - 模板变量
   * @returns {string}
   */
  renderPrompt(filename, vars = {}) {
    const text = this.promptLoader.render(this.id, filename, vars);
    if (filename === "system.md" && !text.trim()) throw new Error("缺少智能体提示词模板，请重新安装完整应用：" + this.id);
    return text;
  }

  /**
   * 组装条件 prompt 段落
   * @param {Array<{condition: boolean, content: string}>} sections
   * @returns {string} 满足条件的段落拼接
   */
  buildConditionalSections(sections) {
    return sections
      .filter((s) => s.condition)
      .map((s) => s.content)
      .join("\n\n");
  }

  /**
   * 调用 skill 工具
   * @param {object} skillLoader - SkillLoader 实例
   * @param {string} skillId
   * @param {string} toolName
   * @param {object} input
   * @returns {Promise<any>}
   */
  async callSkillTool(skillLoader, skillId, toolName, input) {
    const toolId = `${skillId}:${toolName}`;
    const tool = skillLoader.getToolById(toolId);
    if (!tool) {
      logger.warn("agent." + this.id, `skill tool ${toolId} not found`);
      return null;
    }
    try {
      return await tool.run(input);
    } catch (err) {
      logger.warn("agent." + this.id, `skill tool ${toolId} failed:`, err.message);
      return null;
    }
  }

  /**
   * 记录学习事件
   * @param {string} eventType - accept / modify / reject
   * @param {object} payload
   */
  recordEvent(eventType, payload = {}) {
    if (this.learningAdapter) {
      this.learningAdapter.recordEvent(this.id, eventType, payload);
    }
  }
}

module.exports = { AgentBase };
