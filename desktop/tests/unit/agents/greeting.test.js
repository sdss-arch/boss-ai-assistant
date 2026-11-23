const {GreetingAgent,extractVersionTexts}=require("../../../src/agents/greeting");
const store=require("../../../src/core/store"),sample=require("../../greeting.fixture.cjs");
const settings={provider:"ollama",model:"qwen3:4b",resumeText:sample.resume};
const jd={title:"Node.js开发",desc:"接口开发及问题处理"};
const response=(text,tokens=10)=>({text,usage:{total_tokens:tokens}});
function goodModel(){return {call:jest.fn().mockResolvedValueOnce(response(sample.modelOutput)).mockResolvedValueOnce(response(sample.reviewOutput,5))};}

test("正文保持模型自然措辞，写作与独立复核实际调用两次同一服务",async()=>{
 const llm=goodModel(),result=await new GreetingAgent().execute({jd},{settings,llm});
 expect(result.text).toBe(sample.text);expect(extractVersionTexts(result.text)).toEqual(sample.texts);
 expect(result.text).not.toContain("我曾");expect(result.meta.reviewed).toBe(true);
 expect(result.meta.evidence[0].source).toContain("参与订单接口");
 expect(result.meta.usage.total_tokens).toBe(15);expect(llm.call).toHaveBeenCalledTimes(2);
 for(const [request] of llm.call.mock.calls)expect(request).toMatchObject({provider:"ollama",model:"qwen3:4b",json:true});
 expect(llm.call.mock.calls[1][0].messages[0].content).toContain("独立复核者");
});

test("写作偏好和多条原文完整进入生成，旧话术不再污染事实",()=>{
 const history=jest.spyOn(store,"get").mockReturnValue([{kind:"greeting",result:"我正在备考英语六级"}]);
 try{
  const messages=new GreetingAgent().buildMessages({jd,settings:{...settings,style:"custom",writingStyleVersion:1,customPrompt:"使用你好，少客套"}},{});
  expect(messages[0].content).toContain("使用你好，少客套");expect(messages[0].content).toContain("允许压缩、归纳");
  expect(messages[1].content).toContain(sample.url);expect(messages[1].content).not.toContain("我正在备考英语六级");expect(history).not.toHaveBeenCalled();
 }finally{history.mockRestore();}
});

test("独立复核指出生拉硬凑或事实不符后，携具体意见重写再复核",async()=>{
 const failed=JSON.parse(sample.reviewOutput);failed.checks[2].jobFit="weak";failed.checks[2].issues=["把接口排查解释成供应链经验，关联不成立"];
 const llm={call:jest.fn().mockResolvedValueOnce(response(sample.modelOutput)).mockResolvedValueOnce(response(JSON.stringify(failed))).mockResolvedValueOnce(response(sample.modelOutput)).mockResolvedValueOnce(response(sample.reviewOutput))};
 await expect(new GreetingAgent().execute({jd},{settings,llm})).resolves.toMatchObject({text:sample.text});
 expect(llm.call).toHaveBeenCalledTimes(4);expect(llm.call.mock.calls[2][0].messages[1].content).toContain("关联不成立");
});

test("程序拦住捏造备考状态，不交给审核模型侥幸放行",async()=>{
 const bad={versions:sample.draft.versions.map(v=>({...v,text:v.text.replace('做过订单接口校验和联调','六级正在备考，做过订单接口校验和联调')}))};
 const llm={call:jest.fn().mockResolvedValue(response(JSON.stringify(bad)))};
 await expect(new GreetingAgent().execute({jd:{...jd,desc:'必须英语六级'}},{settings,llm})).rejects.toThrow("未确认");
 expect(llm.call).toHaveBeenCalledTimes(2);
});

test("复核一直不合格时不显示可填入草稿，不回退到模板",async()=>{
 const bad={...sample.review,distinct:false};const llm={call:jest.fn().mockResolvedValueOnce(response(sample.modelOutput)).mockResolvedValueOnce(response(JSON.stringify(bad))).mockResolvedValueOnce(response(sample.modelOutput)).mockResolvedValueOnce(response(JSON.stringify(bad)))};
 await expect(new GreetingAgent().execute({jd},{settings,llm})).rejects.toThrow("策略没有区别");
});

test("服务失败和取消不伪造审核通过，也不改用其他模型",async()=>{
 const llm={call:jest.fn().mockResolvedValueOnce(response(sample.modelOutput)).mockRejectedValueOnce(Error("请求限流"))};
 await expect(new GreetingAgent().execute({jd},{settings,llm})).rejects.toThrow("请求限流");expect(llm.call).toHaveBeenCalledTimes(2);
});

test("保留文本解析兼容，空简历不生成",async()=>{
 expect(extractVersionTexts('【版本1】你好\n【版本2】您好')).toEqual(['你好','您好']);
 const llm=goodModel();await expect(new GreetingAgent().execute({}, {settings:{resumeText:''},llm})).rejects.toThrow("选择一份有内容");expect(llm.call).not.toHaveBeenCalled();
});
