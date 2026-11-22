// 生成 README 用的真实界面截图：临时用户目录 + mock 模型响应，不读取真实数据。
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const desktop = path.join(root, "desktop");
const output = path.join(root, "assets", "screenshots");

function electronBinary() {
  return require(require.resolve("electron", { paths: [desktop] }));
}

async function run(profile) {
  await new Promise((resolve, reject) => {
    const child = spawn(electronBinary(), [path.join(desktop, "tests", "desktop.runner.cjs")], {
      cwd: desktop,
      windowsHide: true,
      stdio: "inherit",
      env: {
        ...process.env,
        BOSS_AI_USER_DATA: profile,
        // 截图需要窗口可见（Electron 无法捕获隐藏窗口），不设置 BOSS_AI_TEST_HEADLESS。
        BOSS_AI_TEST_PHASE: "create",
        BOSS_AI_CAPTURE_DIR: output
      }
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("截图生成超时"));
    }, 90000);
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("exit", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error("截图生成失败，退出码 " + code));
    });
  });
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "boss-capture-"));
  try {
    await fs.writeFile(
      path.join(profile, "settings.json"),
      JSON.stringify({
        bossAiAutoAssist: false,
        bossAiSettings: {
          resumes: [{ id: "r1", name: "示例简历", text: "参与 Node.js 项目开发与接口测试。" }],
          activeResumeId: "r1"
        }
      })
    );
    await run(profile);
    console.log("截图已保存到 " + output);
  } finally {
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
