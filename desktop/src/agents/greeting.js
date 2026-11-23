const { AgentBase } = require("./agent-base");
const store = require("../core/store");
const WritingStyle = require("../core/writing-style");
const Format = require("../core/greeting-format");
const Evidence = require("../core/greeting-evidence");
const Models = require("../core/model-config");
function extractVersionTexts(text) { return Format.parse(text).map(v=>v.text).filter(text=>text.trim()); }
class GreetingAgent extends AgentBase {
  constructor({learningAdapter}={}) {
    super({id:"greeting",name:"招呼语专家",role:"求职沟通撰写",description:"根据岗位写自然开场消息，并独立核对事实与关联",temperature:0.65,learningAdapter});
    this.reasoningEffort="low";
  }
  buildSys(settings) { return this.renderPrompt("system.md",{style:WritingStyle.instruction(settings||{})}); }
  responseSchema(input) {
    const ids=input.evidenceData.facts.map(f=>f.id);
    return {type:"object",properties:{versions:{type:"array",minItems:3,maxItems:3,items:{type:"object",properties:{text:{type:"string"},evidenceIds:{type:"array",items:{type:"string",enum:ids},minItems:1}},required:["text","evidenceIds"],additionalProperties:false}}},required:["versions"],additionalProperties:false};
  }
  reviewSchema(data) {
    return {type:"object",properties:{distinct:{type:"boolean"},checks:{type:"array",minItems:3,maxItems:3,items:{type:"object",properties:{index:{type:"integer",enum:[1,2,3]},natural:{type:"boolean"},jobFit:{type:"string",enum:["direct","transferable","weak"]},issues:{type:"array",items:{type:"string"}},claims:{type:"array",items:{type:"object",properties:{text:{type:"string"},sourceIds:{type:"array",items:{type:"string",enum:data.facts.map(f=>f.id)}},supported:{type:"boolean"}},required:["text","sourceIds","supported"],additionalProperties:false}}},required:["index","natural","jobFit","issues","claims"],additionalProperties:false}}},required:["distinct","checks"],additionalProperties:false};
  }
  material(jd,data) {
    return {currentDate:new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'}),job:{title:jd.title||"",company:jd.company||"",desc:jd.desc||"",tags:jd.tags||""},facts:data.facts.map(f=>({id:f.id,text:f.text,context:f.group})),links:data.links,requirementChecks:Evidence.requirementChecks(jd,data.normalized)};
  }
  buildMessages(input,ctx={}) {
    const settings=input?.settings||ctx.settings||{},jd=input?.jd||{},data=input?.evidenceData||Evidence.catalog(store.resolveResume(settings));
    return [{role:"system",content:this.buildSys(settings)},{role:"user",content:JSON.stringify({...this.material(jd,data),...(input?.greetingFeedback?{correction:input.greetingFeedback}:{})})}];
  }
  reviewMessages(jd,data,versions,settings) {
    const selected=new Set(versions.flatMap(version=>version.evidenceIds));
    return [{role:"system",content:this.renderPrompt("review.md")},{role:"user",content:JSON.stringify({...this.material(jd,{...data,facts:data.facts.filter(fact=>selected.has(fact.id))}),versions,writingStyle:WritingStyle.resolve(settings||{})})}];
  }
  async execute(input,ctx={}) {
    const started=Date.now(),settings=input?.settings||ctx.settings||{},jd=input?.jd||{},resume=store.resolveResume(settings);
    if(!resume.trim()) throw Error("请先选择一份有内容的简历，再生成三版招呼语");
    const data=Evidence.catalog(resume);
    if(!data.facts.length) throw Error("未识别到有效简历材料，请检查导入的文字是否完整");
    let feedback="";
    const usages=[];
    for(let attempt=0;attempt<2;attempt++) {
      if(attempt) ctx.onProgress?.("正在修正事实或表达问题…");
      const written=await super.execute({jd,settings,evidenceData:data,greetingFeedback:feedback},{...ctx,settings});
      usages.push(written.meta?.usage||{});
      let draft;
      try { draft=Evidence.parseDraft(written.text,data,jd); }
      catch(error) {feedback=error.message;continue;}
      ctx.onProgress?.("正在独立核对事实、岗位关联和表达…");
      const reviewed=await ctx.llm.call({...Models.connection(settings),messages:this.reviewMessages(jd,data,draft.versions,settings),json:true,responseSchema:this.reviewSchema(data),temperature:0,reasoningEffort:"low",maxRetries:this.maxRetries,signal:ctx.signal});
      usages.push(reviewed.usage||{});
      try {
        const verified=Evidence.validateReview(reviewed.text,draft.versions,data);
        const usage=Object.fromEntries(["prompt_tokens","completion_tokens","total_tokens"].map(key=>[key,usages.reduce((sum,u)=>sum+(u[key]||0),0)]));
        return {...written,text:Format.format(draft.versions),meta:{...written.meta,ms:Date.now()-started,usage,greetingStrategies:[...Format.names],evidence:verified.evidence,requirementChecks:draft.requirementChecks,reviewed:true}};
      } catch(error) { feedback=error.message; }
    }
    throw Error("招呼语未通过事实与表达复核，未生成可填入文案："+feedback);
  }
}
module.exports={GreetingAgent,extractVersionTexts};
