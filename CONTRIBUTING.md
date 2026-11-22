# 贡献指南

感谢你愿意参与 **BOSS直聘 AI 助手** 的维护。本项目欢迎功能增强、Bug 修复、文档改进与测试用例补充。

在参与之前，请先阅读 [行为准则](./CODE_OF_CONDUCT.md) 与 [安全策略](./SECURITY.md)。

---

## 一、开发环境

| 要求 | 版本 |
|---|---|
| Node.js | 18 LTS 及以上（推荐 20 / 22） |
| npm | 9 及以上 |
| 操作系统 | Windows 10+（桌面端目前仅打包 Windows 便携版） |

```bash
git clone https://github.com/sdss-arch/boss-ai-assistant.git
cd boss-ai-assistant/desktop
npm ci
npm start
```

首次运行请在应用「设置」中填入自己的 DeepSeek API Key 与简历文本。**不要**把 API Key、简历、登录态或任何真实用户数据提交到仓库。

---

## 二、目录速览

- `desktop/main.js`：Electron 主进程，窗口、多视图与生命周期
- `desktop/preload-*.js`：渲染进程与主进程之间的安全桥
- `desktop/content/`：注入到 BOSS 页面的内容脚本
- `desktop/panel.html` / `panel.js` / `panel.css`：AI 面板 UI
- `desktop/src/agents/`：专业智能体（每个 Agent 独立角色与提示词）
- `desktop/src/skills/`：可插拔技能模块
- `desktop/src/core/`：LLM 网关、存储、采集工具等基础设施
- `desktop/prompts/`：各 Agent 的 Prompt 模板
- `desktop/tests/`：单元测试、集成测试与真实 Electron 冒烟测试
- `docs/`：架构、路线图与隐私说明

新增能力前请先看 [架构说明](./docs/ARCHITECTURE.md)，确认应该放在 Agent、Skill 还是 core 层。

---

## 三、提交前检查

```bash
cd desktop

# 1) 全量语法检查
node -e "const{execFileSync}=require('child_process'),fs=require('fs'),p=require('path');const w=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()&&!['node_modules','dist','test-results','coverage'].includes(e.name)?w(p.join(d,e.name)):/\\.(js|cjs)$/.test(e.name)?[p.join(d,e.name)]:[]);w('.').forEach(f=>execFileSync(process.execPath,['--check',f],{stdio:'inherit'}));console.log('syntax ok')"

# 2) 单元测试 + 集成测试
npm test -- --runInBand

# 3) 真实 Electron 冒烟测试（使用临时用户目录与模拟模型，不消耗真实 API）
npm run test:desktop
```

三项全部通过后再提交 PR；CI 会在 push / PR 时重复执行相同检查。

---

## 四、提交与 PR 规范

### 提交信息

采用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/)：

```
feat(agent): 新增offer谈判顾问
fix(ipc): 修复面板重启后桥接丢失
docs: 补充架构图
test: 增加写作风格单元测试
chore(deps): 升级 electron-builder
```

常用类型：`feat` / `fix` / `docs` / `test` / `refactor` / `perf` / `chore` / `security`。

### Pull Request

1. 从 `main` 新建分支，命名如 `feature/xxx`、`fix/xxx`、`docs/xxx`。
2. 一个 PR 只做一件事；改动较大时先在 Issue 中讨论方案。
3. 描述**动机**、**实现方式**、**验证结果**（贴测试输出）。
4. 涉及 UI 时附上截图；涉及新依赖时说明体积与许可影响。
5. 保持提交历史整洁，合并前 rebase / squash 由维护者决定。
6. CI 必须全绿；`main` 分支受保护，不允许直接推送。

---

## 五、隐私与合规

- 仓库中只能出现占位数据；示例简历、聊天记录一律使用虚构内容。
- 截图请使用 `npm run capture:screenshots`，脚本会自动使用 mock 数据。
- 不得添加绕过平台风控、自动发送消息、批量注册或爬虫滥用的功能。
- 用户配置保存在本机 `%APPDATA%\boss-ai-desktop`，API Key 加密存储；任何改动不得削弱该边界。

---

## 六、发布流程（维护者）

1. 更新 `CHANGELOG.md`，把 `Unreleased` 内容归入新版本。
2. 对齐 `desktop/package.json` 与 README 中的版本号。
3. 执行完整验证（见第三节）与 `npm run build`。
4. 打 tag 并推送：`git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z`。
5. `release.yml` 会自动构建便携版并上传到 GitHub Release；确认资产与 Release Notes 无误。
