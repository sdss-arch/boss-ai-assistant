const Format = require("../../../src/core/greeting-format");
const sample = require("../../greeting.fixture.cjs");
test("三版均符合字数要求，极简版最短；规范格式不把策略名写入正文", () => {
  const versions = Format.parse(sample.text);
  expect(Format.issues(versions, sample.resume)).toEqual([]);
  expect(Format.format(versions)).toBe(sample.text);
  expect(Format.title(2, 3)).toContain("业务共情版");
  expect(Format.title(1, 2)).toBe("招呼语 2");
});
test("支持中文编号、带策略名的标题和分段正文", () => {
  const text = sample.text.replace("【版本1】", "【版本一（直击痛点版）】").replace("【版本2】", "版本二（极简高冷版）：").replace("【版本3】", "【版本三：业务共情版】");
  expect(Format.parse(text).map(v => v.text)).toEqual(sample.texts);
  const numbered = sample.text.replace("【版本2】", "1、项目测试记录可供参考。\n【版本2】");
  expect(Format.parse(numbered)).toHaveLength(3);
  expect(Format.parse(numbered)[0].text).toContain("1、项目测试记录");
});
test("超过长度、重复正文、套话和虚构链接会被识别", () => {
  const versions = Format.parse(sample.text);
  expect(Format.issues([{...versions[0],text:'字'.repeat(401)},versions[1],versions[2]],sample.resume).join()).toContain("每版最多400字");
  expect(Format.issues([versions[0],{...versions[1],text:versions[0].text},versions[2]],sample.resume).join()).toContain("重复");
  expect(Format.issues([{...versions[0],text:versions[0].text.replace(sample.url,'https://evil.invalid/fiction')},versions[1],versions[2]],sample.resume).join()).toContain("未提供的链接");
  expect(Format.issues([{...versions[0],text:'贵司'+versions[0].text},versions[1],versions[2]],sample.resume).join()).toContain("避坑词");
});
test("400字可接受、401字被拦截；极简版没有100字最低限制，空正文仍会报错", () => {
  const prefix = '您好，我想应聘开发岗位。', ending = '方便的话想和您聊聊。';
  const full = filler => prefix + filler.repeat(400-Format.count(prefix+ending)) + ending;
  const versions = [{index:1,text:full('甲')},{index:2,text:'您好，想应聘开发岗。做过接口测试，方便聊聊吗？'},{index:3,text:full('乙')}];
  expect(Format.count(versions[1].text)).toBeLessThan(100);
  expect(Format.issues(versions, '')).toEqual([]);
  expect(Format.issues([{...versions[0],text:'甲'.repeat(401)},versions[1],versions[2]],'').join()).toContain("每版最多400字");
  expect(Format.issues([versions[0],{index:2,text:' \n '},versions[2]],'').join()).toContain("正文不能为空");
});
test("拦截简历摘要、求职标题和项目复盘形式的招呼语", () => {
  const bad = [
    {index:1,text:'您好，我是张某，具备产品设计经验。负责平台链路和AI解析，体现产品化思维。期待与团队探讨优化方案。'},
    {index:2,text:'张某·产品经理求职，擅长数据驱动产品设计。负责项目链路与分析报告。'},
    {index:3,text:'作为一名产品实习生，我经常关注数据变化，设计了采集—解析—入库—复盘的流程，体现闭环思维。'}
  ];
  const errors = Format.issues(bad,'').join('；');
  expect(errors).toContain('直击痛点版：开场需明确应聘');
  expect(errors).toContain('极简高冷版：需以自然问候');
  expect(errors).toContain('业务共情版：需以自然问候');
  expect(errors).toContain('简短自然的沟通邀请');
  expect(errors).toContain('不要展开整条技术或项目流程链');
});
