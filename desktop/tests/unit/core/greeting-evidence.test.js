const Evidence=require("../../../src/core/greeting-evidence"),sample=require("../../greeting.fixture.cjs");
const data=Evidence.catalog(sample.resume),jd={title:'Node.js开发',desc:'接口开发，必须英语六级'};
const parse=(draft=sample.draft,resumeData=data,job=jd)=>Evidence.parseDraft(JSON.stringify(draft),resumeData,job);
const review=(r=sample.review)=>Evidence.validateReview(JSON.stringify(r),parse().versions,data);

test("证书否定词不跨条件传播；矛盾证据保留未知", () => {
  expect(Evidence.requirementChecks(jd,"英语六级已通过，尚未取得驾驶证")[0].status).toBe("met");
  expect(Evidence.requirementChecks(jd,"英语六级尚未通过。英语六级已通过。")[0].status).toBe("unknown");
});

test("学历仅在材料明确写明时判断，不能根据学校名称编造学历", () => {
  const jd = {desc:"必须本科及以上学历"};
  expect(Evidence.requirementChecks(jd,"某学院 2021.09-2025.06")[0].status).toBe("unknown");
  expect(Evidence.requirementChecks(jd,"学历：大专")[0]).toMatchObject({status:"unmet",source:"学历:大专"});
  expect(Evidence.requirementChecks(jd,"本科毕业")[0].status).toBe("met");
  expect(Evidence.requirementChecks(jd,"尚未本科毕业")[0].status).toBe("unknown");
  expect(Evidence.requirementChecks({desc:"硕士及以上学历"},"学历：本科。硕士毕业。")[0].status).toBe("met");
});


test("不再拼接固定开头结尾，允许改写、多条事实与自然提问",()=>{
 const draft=JSON.parse(sample.modelOutput);draft.versions[0].text=draft.versions[0].text.replace('您好','你好').replace('方便的话想和您聊聊','希望了解一下团队的具体工作');
 draft.versions[0].evidenceIds=['E3','E4'];
 const result=parse(draft);expect(result.versions[0].text).toBe(draft.versions[0].text);expect(result.versions[0].evidenceIds).toHaveLength(2);
});

test("不存在的引用、虚构链接和新数字在语义复核前被拒收",()=>{
 for(const mutate of [v=>v.evidenceIds=['不存在'],v=>v.text+='https://evil.invalid/fiction',v=>v.text+='已有3年经验']) {
  const d=JSON.parse(sample.modelOutput);mutate(d.versions[0]);expect(()=>parse(d)).toThrow();
 }
});

test("无依据的备考与参与升级为主导仍由程序拦截",()=>{
 for(const phrase of ['我正在备考英语六级。','我主导过订单系统。']) {
  const d=JSON.parse(sample.modelOutput);d.versions[0].text=d.versions[0].text.replace('我参与过',phrase+'我参与过');expect(()=>parse(d)).toThrow();
 }
});

test("引用来源完整保留否定和背景，不再靠动词过滤丢掉关键材料",()=>{
 const material=Evidence.catalog('工作：参与需求访谈，但没有主导上线。\n技能：B端客户需求沟通、功能设计。\n英语六级尚未通过。');
 expect(material.facts.map(f=>f.source).join()).toContain('没有主导');expect(material.facts.map(f=>f.source).join()).toContain('B端客户需求沟通');expect(material.facts.map(f=>f.source).join()).toContain('英语六级尚未通过');
});

test("复核必须逐项引用正文与真实来源，仅给一个通过标志不能放行",()=>{
 expect(review().evidence).toHaveLength(3);
 for(const mutate of [r=>r.checks=[],r=>r.checks[0].claims=[],r=>r.checks[0].claims[0].text='正文里没有这句话',r=>r.checks[0].claims[0].sourceIds=['E4'],r=>r.checks[0].claims[0].supported=false]) {
  const r=JSON.parse(sample.reviewOutput);mutate(r);expect(()=>review(r)).toThrow();
 }
});

test("有真实证据仍要检查关联和语感，不能把不编造当成可用",()=>{
 for(const mutate of [r=>r.distinct=false,r=>r.checks[0].natural=false,r=>r.checks[0].jobFit='weak',r=>r.checks[0].issues=['只是简历摘要']]){
  const r=JSON.parse(sample.reviewOutput);mutate(r);expect(()=>review(r)).toThrow();
 }
});

test("正常开场和有意义的岗位提问不再被固定句式正则误杀",()=>{
 const d=JSON.parse(sample.modelOutput);d.versions[0].text=d.versions[0].text.replace('您好，想应聘您发布的Node.js开发岗位。','您好，看到岗位需要处理接口问题，想进一步了解。').replace('方便的话想和您聊聊。','您看这些项目是否符合团队的工作方向？');
 expect(parse(d).versions[0].text).toBe(d.versions[0].text);
 d.versions[0].text='在某公司，我参与过订单接口开发，主要做参数校验、异常处理和联调，也补过边界测试。简历里有具体项目，方便的话想和您聊聊。';expect(()=>parse(d)).toThrow('正常问候');
});
