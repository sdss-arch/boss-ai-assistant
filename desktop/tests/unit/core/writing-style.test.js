const Style = require("../../../src/core/writing-style");
const { GreetingAgent } = require("../../../src/agents/greeting");
const { ReplyAgent } = require("../../../src/agents/reply");
const { ApplicationAgent } = require("../../../src/agents/application");
const { CareerAgent } = require("../../../src/agents/career");
const { ChatAgent } = require("../../../src/agents/chat");
const Auto = require("../../../src/core/automation");

test("恰好三个内置风格，未知值安全回退", () => {
  expect(Object.keys(Style.presets)).toEqual(["prof", "warm", "brief"]);
  expect(Style.resolve({ style: "constructor" }).id).toBe("prof");
  expect(Style.resolve({ style: "unknown" }).name).toBe("专业稳重");
});
test("兼容旧自定义要求，显式选预设后不叠加隐藏的自定义", () => {
  expect(Style.resolve({ customPrompt: "不用感叹号" }).id).toBe("custom");
  expect(Style.instruction({ style: "warm", customPrompt: "每条20字", writingStyleVersion: 1 })).not.toContain("每条20字");
  expect(Style.instruction({ style: "custom", customPrompt: "每条20字", writingStyleVersion: 1 })).toContain("每条20字");
});
test.each(["prof", "warm", "brief", "custom"])("招呼语、回复、求职信、对话与自动回复统一接入 %s", style => {
  const settings = { style, customPrompt: style === "custom" ? "不使用感叹号，先回答问题" : "", writingStyleVersion: 1 };
  const label = Style.resolve(settings).name;
  const messages = [
    new GreetingAgent().buildSys(settings, true, [], [], true, false, false),
    new ReplyAgent().buildMessages({ jd: {}, history: [], settings })[0].content,
    new ApplicationAgent().buildMessages({}, { settings })[0].content,
    new ChatAgent().buildMessages({ messages: [], settings })[0].content,
    new CareerAgent().buildMessages({ task: "auto", job: {} }, { settings })[0].content
  ];
  for (const prompt of messages) expect(prompt).toContain("【写作风格：" + label + "】");
  expect(messages[4]).toContain("仅作用于 JSON 的 reply 字段");
});
test("切换风格会使自动回复缓存失效", () => {
  const job = { title: "开发" };
  expect(Auto.signature(job, { style: "prof" }, [])).not.toBe(Auto.signature(job, { style: "warm" }, []));
});

test("自定义要求中的替换符按原文保留", () => {
  const text = "不要用感叹号，原样保留 $& 符号";
  const prompt = new GreetingAgent().buildSys({ style: "custom", customPrompt: text, writingStyleVersion: 1 }, true, [], [], true, false, false);
  expect(prompt).toContain(text);
});
