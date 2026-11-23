(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GreetingFormat = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  const names = Object.freeze(["直击痛点版", "极简高冷版", "业务共情版"]);
  const maxLength = 400;
  const forbidden = Object.freeze(["贵司", "本人", "期待能加入", "具备较强的沟通能力"]);
  function parse(text) {
    const source = String(text || "");
    const marker = /(?:【\s*版本\s*([0-9一二三四五六七八九十]+)(?:\s*[：:（(·—-][^】]*)?\s*】|^\s*(?:#{1,3}\s*)?(?:\*\*)?版本\s*([0-9一二三四五六七八九十]+)(?:\s*[（(][^）)\n]*[）)])?\s*[：:](?:\*\*)?\s*)/gm;
    const matches = [...source.matchAll(marker)];
    return matches.map((match, i) => ({ index: ({ 一: 1, 二: 2, 三: 3 })[match[1] || match[2]] || Number(match[1] || match[2]),
      text: source.slice(match.index + match[0].length, matches[i + 1]?.index ?? source.length).trim() }));
  }
  function links(text) {
    const values = String(text || "").match(/https?:\/\/[^\s<>"'\x60，。；、（）【】]+|www\.[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s<>"'\x60，。；、（）【】]*)?|(?:github\.com|gitee\.com|gitlab\.com)\/[^\s<>"'\x60，。；、（）【】]+/gi) || [];
    return [...new Set(values.map(value => value.replace(/[.,;!?)\]}]+$/, "")))];
  }
  function canonicalLink(value) {
    try { return new URL(/^https?:\/\//i.test(value) ? value : "https://" + value).href.replace(/\/$/, ""); }
    catch { return value; }
  }
  function count(text) { return Array.from(String(text || "").replace(/\s/g, "")).length; }
  function conversationIssues(text) {
    let body = String(text || "");
    for (const link of links(body)) body = body.split(link).join("");
    const opening = body.replace(/\s/g, "").slice(0, 100), ending = body.replace(/\s/g, "").slice(-110);
    const errors = [];
    if (!/^(?:[\u4e00-\u9fa5A-Za-z]{1,8})?(?:您好|你好)[，,！!。．.]/.test(opening)) errors.push("需以自然问候开场，不能写成姓名加求职头衔或项目报告");
    if (!/(?:应聘|申请.{0,12}(?:岗位|职位)|对.{1,40}(?:感兴趣|有兴趣)|看到您.{0,12}(?:岗位|职位|招聘)|想.{0,15}(?:聊|沟通|了解).{0,15}(?:岗位|职位))/.test(opening)) errors.push("开场需明确应聘或对当前岗位感兴趣，不能只有自我介绍");
    if (!/(?:(?:方便|希望|期待|想|可以|能否|愿意|有机会|劳烦).{0,22}(?:聊|交流|沟通|了解|看看|看下|参考|查阅|联系|回复)|(?:简历|项目|作品).{0,12}(?:供您参考|请您参考|请查阅|欢迎查看)|请.{0,10}(?:看看|看下|参考|查阅|联系|回复))/.test(ending)) errors.push("需用简短自然的沟通邀请或请对方查看简历收尾，不要止于链接或履历结论");
    if (/(?:体现|展现|彰显|证明)(?:了|出|我的|我)?(?:产品化思维|闭环思维|闭环能力|产品思维)/.test(body)) errors.push("删除体现产品化思维、体现闭环思维等自我评价，用具体经历说话");
    if (/(?:—|→|->)[^\n]{1,30}(?:—|→|->)[^\n]{1,30}(?:—|→|->)/.test(body)) errors.push("不要展开整条技术或项目流程链，只保留与岗位相关的一两个动作");
    return errors;
  }
  function issues(versions, resume, options = {}) {
    const errors = [];
    if (versions.length !== 3 || versions.some((version, i) => version.index !== i + 1)) return ["必须按顺序输出完整的版本1、版本2、版本3，且各输出一次"];
    const allowed = new Set(links(resume).map(canonicalLink));
    versions.forEach((version, i) => {
      const length = count(version.text);
      if (!length) errors.push(names[i] + "正文不能为空");
      if (length > maxLength) errors.push(names[i] + "为" + length + "字，每版最多400字，请保留完整语句并删除冗余，不要截断网址");
      const badWords = forbidden.filter(word => version.text.includes(word));
      if (badWords.length) errors.push(names[i] + "含避坑词：" + badWords.join("、"));
      if (links(version.text).some(link => !allowed.has(canonicalLink(link)))) errors.push(names[i] + "含简历未提供的链接，必须删除或使用材料中的原始链接");
      if (/\[(?:[^\]\n]*(?:链接|URL|作品集)[^\]\n]*)\]|【待[^】]*】/i.test(version.text)) errors.push(names[i] + "含占位文本，请删除");
      if (length && options.conversation !== false) errors.push(...conversationIssues(version.text).map(error => names[i] + "：" + error));
    });
    const comparable = versions.map(version => version.text.replace(/\s|[，。！？、：；,.!?;:]/g, ""));
    if (new Set(comparable).size !== 3) errors.push("三版正文重复，必须按三种策略重新组织");
    if (count(versions[1].text) > Math.min(count(versions[0].text), count(versions[2].text))) errors.push("极简高冷版必须是三版中字数最少的版本");
    return errors;
  }
  function format(versions) { return versions.map((version, i) => "【版本" + (i + 1) + "】\n" + version.text).join("\n\n"); }
  function title(index, total) { return total === 3 ? "招呼语 " + (index + 1) + " · " + names[index] : "招呼语 " + (index + 1); }
  return { names, maxLength, forbidden, parse, links, count, issues, format, title };
});
