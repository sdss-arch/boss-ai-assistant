const fs = require("fs"), path = require("path"), crypto = require("crypto");
const root = path.resolve(__dirname, "../desktop");
const output = path.join(root, "dist/standalone/win-unpacked");
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
if (hash(path.join(root, "node_modules/electron/dist/electron.exe")) !== hash(path.join(output, "BOSSAI.exe"))) throw new Error("独立目录版的运行时发生了意外修改");
for (const file of ["main.js", "panel.html", "panel.js", "panel.css", "content/content.js", "content/online-resume.js", "online-resume.js", "src/agents/base.js", "src/agents/career.js", "src/agents/greeting.js", "src/core/llm.js", "src/core/greeting-format.js", "src/core/greeting-evidence.js", "prompts/greeting/system.md", "prompts/greeting/review.md", "src/core/model-config.js"]) {
  if (hash(path.join(root, file)) !== hash(path.join(output, "resources/app", file))) throw new Error("独立目录版缺少最新文件：" + file);
}
if (!fs.existsSync(path.join(output, "resources/app/node_modules/pdf-parse/package.json"))) throw new Error("独立目录版缺少生产依赖");
console.log("独立目录版完整性通过；启动入口 dist/standalone/win-unpacked/BOSSAI.exe，应用和生产依赖已打包，无需 npm 或源项目。");
