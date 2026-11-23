const { spawn } = require("child_process"), fs = require("fs/promises"), os = require("os"), path = require("path");
(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "boss-online-resume-"));
  try {
    await fs.writeFile(path.join(profile, "settings.json"), JSON.stringify({ bossAiAutoAssist: false, bossAiSettings: { provider: "deepseek", apiKey: "fictional-online-test", resumeText: "本地简历，不应替代网页原文。" } }));
    await new Promise((resolve, reject) => {
      const child = spawn(require("electron"), [path.join(__dirname, "desktop.runner.cjs")], { cwd: path.resolve(__dirname, ".."), windowsHide: true, stdio: "inherit", env: { ...process.env, BOSS_AI_USER_DATA: profile, BOSS_AI_TEST_HEADLESS: "1", BOSS_AI_TEST_PHASE: process.argv[2] === "greeting" ? "greeting" : "online-resume" } });
      const timer = setTimeout(() => { child.kill(); reject(new Error("在线简历桌面测试超时")); }, 45000);
      child.on("error", error => { clearTimeout(timer); reject(error); });
      child.on("exit", code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error("在线简历桌面测试失败：" + code)); });
    });
  } finally { await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
