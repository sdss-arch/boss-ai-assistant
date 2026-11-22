# 更新日志

本项目所有重要变更都会记录在此文件中。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/spec/v2.0.0.html)。

## [Unreleased]

### Added

- （待填写）

---

## [1.1.0] - 2026-11-22

> 新仓库 `sdss-arch/boss-ai-assistant` 的首个版本，迁移自 [`96806105/boss-ai-desktop`](https://github.com/96806105/boss-ai-desktop) 并做了系统化完善。

### Added

- **网页助手**：直接从当前 BOSS 页面读取岗位，无需建档即可进行简历诊断、优化、模拟面试与沟通草稿生成。
- **自动辅助**：页面或消息变化时自动生成岗位分析、沟通摘要、回复草稿与面试要点，相同内容复用缓存并合并短时变化。
- **工作台**：收藏与跟进、面试记录、Offer 对比（保证年现金）、数据导出与 ICS 日历导出。
- **职业顾问 Agent**：基于当前网页岗位提供职业规划建议。
- **写作风格**：内置专业稳重 / 热情亲和 / 简洁高效三种风格及自定义风格，自动保存并统一作用于写作类功能。
- **简历导入**：支持 PDF / DOCX / TXT / Markdown 导入与版本快照。
- **访问控制与自动记录**：网页桥接权限校验、面试安排证据校验、沟通进度自动同步。
- **测试体系**：新增真实 Electron 桌面冒烟测试与多项单元 / 集成测试（共 22 个套件、148 项测试）。
- **工程治理**：GitHub Actions CI / Release / CodeQL / Dependabot、Issue 与 PR 模板、分支保护、贡献指南、安全策略、行为准则、架构与路线图文档。

### Changed

- 重构 IPC 路由与主进程能力注入，统一 Agent 生命周期与工具调用边界。
- 完善岗位筛选、匹配条件持久化、重启恢复与加密配置写入。
- README 增加架构图、功能截图、徽章、FAQ 与迁移说明。

### Security

- API Key 使用系统安全存储加密，配置原子写入并保留恢复副本。
- 网页桥接仅暴露必要接口，明确阻断敏感设置读取；消息发送始终由用户手动确认。

---

## [1.0.0] - 2026-08-12

### Added

- Electron 桌面端初版：内置 BOSS 直聘视图 + 常驻 AI 面板。
- 多智能体编排（Supervisor 模式）：招呼语、回复、面试、岗位匹配、公司尽调、求职信、通用聊天、公司名解析、风险速查。
- 基于简历与公开检索信息的提示词体系，内置防编造约束。
- LLM 网关：超时、重试、用量统计与按模型参数裁剪。
- Skills 技能模块、学习适配器与 Jest 测试基础。

[Unreleased]: https://github.com/sdss-arch/boss-ai-assistant/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/sdss-arch/boss-ai-assistant/releases/tag/v1.1.0
[1.0.0]: https://github.com/96806105/boss-ai-desktop/releases/tag/v1.0.0
