(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WritingStyle = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  const presets = Object.freeze({
    prof: Object.freeze({ name: "专业稳重", description: "礼貌克制，表达有条理，突出与岗位相关的事实和诉求，不夸张、不奉承。", example: "您好，我对这个岗位很感兴趣，想进一步了解岗位要求。" }),
    warm: Object.freeze({ name: "热情亲和", description: "自然友好，像正常聊天一样表达兴趣，少用公文腔，不过度热情、不堆感叹号。", example: "您好，看到这个岗位挺感兴趣，期待有机会进一步交流。" }),
    brief: Object.freeze({ name: "简洁高效", description: "先说重点，减少铺垫和客套。招呼语和单条聊天回复优先控制在两三句话内。", example: "您好，对该岗位感兴趣，简历供您参考。" })
  });
  function resolve(settings = {}) {
    const custom = String(settings.customPrompt || "").trim().slice(0, 2000);
    // 兼容旧版本已填写的自定义要求，切换新预设后不再叠加隐藏的旧要求。
    const id = settings.writingStyleVersion !== 1 && custom ? "custom" : (settings.style === "custom" || Object.hasOwn(presets, settings.style) ? settings.style : "prof");
    if (id === "custom") return { id, name: "自定义", description: custom || "自然、真诚、清楚地表达，避免夸张和套话。", example: "按你填写的要求生成文案。" };
    return { id, ...presets[id] };
  }
  function instruction(settings, scope = "writing") {
    const style = resolve(settings);
    return "【写作风格：" + style.name + "】\n" + style.description +
      (scope === "auto" ? "\n本风格仅作用于 JSON 的 reply 字段；其他字段按任务要求输出，必须保留 JSON 结构。" : "\n简短要求主要作用于招呼语和招聘聊天单条回复；求职信、问卷和简历须保留各自要求的完整结构。") +
      "\n风格只调整措辞，不得据此编造经历、薪资或可面试时间，也不得改变任务输出格式。";
  }
  return { presets, resolve, instruction };
});
