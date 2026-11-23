const fs = require("fs/promises"), path = require("path"), os = require("os"), { spawn } = require("child_process");
const root = path.resolve(__dirname, "..");
async function run(profile, phase) {
  await new Promise((resolve, reject) => {
    const child = spawn(require("electron"), [path.join(__dirname, "desktop.runner.cjs")], {
      cwd: root, windowsHide: true, stdio: "inherit", env: { ...process.env, BOSS_AI_USER_DATA: profile, BOSS_AI_TEST_HEADLESS: "1", BOSS_AI_TEST_PHASE: phase }
    });
    const timer = setTimeout(() => { child.kill(); reject(new Error("桌面测试超时")); }, 60000);
    child.on("error", err => { clearTimeout(timer); reject(err); });
    child.on("exit", code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error("桌面测试失败：" + code)); });
  });
}
(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "boss-desktop-smoke-"));
  try {
    await fs.writeFile(path.join(profile, "settings.json"), JSON.stringify({ bossAiAutoAssist: false, bossAiSettings: { resumes: [{ id: "r1", name: "开发简历", text: "参与 Node.js 项目开发与接口测试。" }], activeResumeId: "r1" } }));
    await run(profile, "create");
    const data = JSON.parse(await fs.readFile(path.join(profile, "settings.json"), "utf8"));
    if (data.bossAiSettings.apiKey || !data.bossAiSettings.encryptedApiKey) throw new Error("密钥未加密");
    if (data.bossAiCareerJobs.length !== 1 || data.bossAiInterviews.length !== 2) throw new Error("资料未保存");
    await run(profile, "restore");
    await run(profile, "online-resume");
    await run(profile, "greeting");
    console.log("PASS: 真实 Electron 悬浮按钮拖动/关闭/恢复、工作台、收藏/进度、简历诊断、模拟面试、Offer、关联面试、筛选保存、加密及重启恢复");
  } finally { await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
})().catch(err => { console.error(err); process.exitCode = 1; });
