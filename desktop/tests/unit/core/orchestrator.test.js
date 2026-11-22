jest.mock("../../../src/core/store", () => ({ get: () => [], set: jest.fn(), getSettings: () => ({}) }));
jest.mock("../../../src/registry", () => ({ registry: new Map() }));
const { registry } = require("../../../src/registry");
const orchestrator = require("../../../src/orchestrator");
test("手动任务会中断后台分析并自动接续，无需用户重复点击", async () => {
  registry.set("slow", { id: "slow", name: "后台分析", execute: (_input, ctx) => new Promise((resolve, reject) => ctx.signal.addEventListener("abort", () => reject(new Error("cancelled")))) });
  registry.set("manual", { id: "manual", name: "手动任务", execute: async () => ({ text: "完成" }) });
  const background = orchestrator.invoke("slow", {}, { background: true }).catch(e => e.message);
  await expect(orchestrator.invoke("manual", {})).resolves.toMatchObject({ text: "完成" });
  await expect(background).resolves.toBe("任务已停止");
  expect(orchestrator.isBusy()).toBe(false);
});
