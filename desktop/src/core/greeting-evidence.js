const Format = require("./greeting-format");
const pdfCharacters = { "⻚": "页", "⻜": "飞", "⻛": "风", "⻬": "齐", "⻘": "青", "⻓": "长", "⻔": "门", "戶": "户" };
function normalize(value) {
  return String(value || "").normalize("NFKC").replace(/[⻚⻜⻛⻬⻘⻓⻔戶]/g, value => pdfCharacters[value]);
}
function clean(value) { return normalize(value).replace(/\s+/g, " ").trim(); }
const negative = /(?:尚未|暂未|还未|未曾|未能|未通过|未取得|未获得|未考取|没有|不具备|不满足|仅有|只有|不熟悉|不掌握|不足|无证|备考|待考)/;
const explicitLack = /(?:尚未|暂未|还未|未能|未通过|未取得|未获得|未考取|没有|不具备|无证)/;


// Keep complete source statements and their context. These are evidence, never final copy.
function catalog(resume) {
  const normalized=normalize(resume).replace(/\r/g,""), facts=[], links=[];
  let group="resume";
  for (const raw of normalized.split(/\n/)) {
    const line=clean(raw);
    if (!line || /^(?:专业技能|教育经历|工作经历|项目经历|个人总结)$/.test(line) || /@|(?:1[3-9]\d{9})/.test(line) || /^-- \d+ of \d+ --$/.test(line)) continue;
    if (/\d{4}[.年/-].*\d{4}[.年/-]/.test(line) && !/[:：]/.test(line)) group=line;
    for(const url of Format.links(line)) if(!links.some(link=>link.url===url)) links.push({id:"L"+(links.length+1),url,group});
    if (line.length<7 || Format.links(line).length && line.replace(/https?:\/\/\S+/g,"").length<7) continue;
    facts.push({id:"E"+(facts.length+1),text:line,source:line,group});
  }
  return {normalized,facts,links};
}

const credentials = [
  { name: "英语六级", pattern: /(?:大学)?英语六级|CET[ -]?6|六级/ig },
  { name: "英语四级", pattern: /(?:大学)?英语四级|CET[ -]?4|四级/ig },
  { name: "教师资格证", pattern: /教师资格证/g },
  { name: "法律职业资格", pattern: /法律职业资格/g },
  { name: "注册会计师", pattern: /注册会计师|CPA/ig },
  { name: "驾驶证", pattern: /驾驶证/g }
];
function requirementChecks(jd, resume) {
  const description = normalize(jd.desc), source = normalize(resume), checks = [];
  for (const credential of credentials) {
    const contains = text => new RegExp(credential.pattern.source, credential.pattern.flags).test(text);
    const requirements = description.split(/[\n。；;，,]/).filter(contains);
    if (!requirements.length) continue;
    const hard = requirements.some(text => !/优先|加分|更佳|不限|不要求|无需|非必需/.test(text));
    const evidence = source.split(/[\n。；;，,]/).map(clean).filter(contains);
    const explicitNegative = evidence.find(text => explicitLack.test(text));
    const explicitPositive = evidence.find(text => !negative.test(text) && /通过|取得|获得|持有|持证|证书|[456][0-9]{2}分/.test(text));
    checks.push({ name: credential.name, hard, status: explicitNegative && !explicitPositive ? "unmet" : explicitPositive && !explicitNegative ? "met" : "unknown", source: explicitNegative || explicitPositive || "" });
  }
  // School names and education dates alone do not establish a degree.
  const degrees = ["大专", "本科", "硕士", "博士"];
  const requirement = description.split(/[\n。；;，,]/).find(text => /(?:大专|本科|硕士|博士)(?:及以上|以上|学历)/.test(text) && !/优先|加分|不限/.test(text));
  const degreeSources = source.split(/[\n。；;，,]/).map(clean).filter(text => /(?:学历\s*[:：为]?\s*(?:大专|本科|硕士|博士)|(?:大专|本科|硕士|博士)(?:学历|毕业))/.test(text) && !/未|不|待|在读|预计/.test(text));
  const rank = text => Math.max(...degrees.map((value, i) => text.includes(value) ? i : -1));
  const degreeSource = degreeSources.sort((a, b) => rank(b) - rank(a))[0];
  if (requirement) {
    const expected = degrees.findIndex(value => requirement.includes(value));
    const actual = degreeSource ? Math.max(...degrees.map((value, i) => degreeSource.includes(value) ? i : -1)) : -1;
    checks.push({ name: "学历", hard: true, status: actual < 0 ? "unknown" : actual < expected ? "unmet" : "met", source: degreeSource || "" });
  }
  return checks;
}


function json(raw) {
  try { return JSON.parse(String(raw).trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i,"$1")); }
  catch { throw Error("模型未返回有效的招呼语 JSON"); }
}
function strictKeys(value, keys) { return value && typeof value==="object" && !Array.isArray(value) && Object.keys(value).every(key=>keys.includes(key)); }
function compact(value) { return normalize(value).replace(/\s/g,""); }
function parseDraft(raw,data,jd) {
  const draft=json(raw);
  if(!strictKeys(draft,["versions"]) || !Array.isArray(draft.versions) || draft.versions.length!==3) throw Error("必须返回完整三版正文及引用的原文编号");
  const versions=draft.versions.map((version,i)=>{
    if(!strictKeys(version,["text","evidenceIds"]) || typeof version.text!=="string" || !Array.isArray(version.evidenceIds) || !version.evidenceIds.length || version.evidenceIds.some(id=>typeof id!=="string" || !data.facts.some(f=>f.id===id))) throw Error("版本"+(i+1)+"缺少有效的简历依据");
    return {index:i+1,text:version.text.trim(),evidenceIds:[...new Set(version.evidenceIds)]};
  });
  // A separate semantic review reads the whole conversation; do not require stock phrases.
  const errors=Format.issues(versions,data.normalized,{conversation:false}), checks=requirementChecks(jd,data.normalized);
  for(const version of versions) {
    const text=normalize(version.text), source=version.evidenceIds.map(id=>data.facts.find(f=>f.id===id).source).join("\n");
    if(!/^(?:[\u4e00-\u9fa5A-Za-z]{0,12})?(?:您好|你好|hello|hi)[，,！!。.\s]/i.test(text)) errors.push("版本"+version.index+"应有正常问候，不能写成履历介绍");
    const factualChecks=[...checks];
    for(const credential of credentials) {
      if(new RegExp(credential.pattern.source,credential.pattern.flags).test(text) && !factualChecks.some(c=>c.name===credential.name)) factualChecks.push(...requirementChecks({desc:credential.name},data.normalized));
    }
    for(const check of factualChecks) {
      const credential=credentials.find(c=>c.name===check.name);
      const mentioned=credential ? new RegExp(credential.pattern.source,credential.pattern.flags).test(text) : /大专|本科|硕士|博士/.test(text);
      if(mentioned && check.status==="unknown") errors.push("版本"+version.index+"不得把未确认的"+check.name+"写成已具备、缺失或备考状态");
    }
    if(/备考|正在准备.{0,8}(?:考试|考证)/.test(text) && !/备考|准备.{0,8}(?:考试|考证)/.test(source)) errors.push("版本"+version.index+"编造了备考状态");
    for(const verb of ["主导","独立","带领"]) {
      const supported=source.split(/[\n。；;，,]/).some(clause=>clause.includes(verb) && !new RegExp('(?:未|不|没有).{0,4}'+verb).test(clause));
      if(text.includes(verb) && !supported) errors.push("版本"+version.index+"缺少“"+verb+"”的原文依据，不能升级参与程度");
    }
    for(const number of text.match(/\d+(?:\.\d+)?(?:%|年|万|人|次|倍|天)/g)||[]) if(!data.normalized.includes(number)) errors.push("版本"+version.index+"包含未提供的量化事实："+number);
    for(const link of Format.links(version.text)) {
      const item=data.links.find(value=>value.url===link);
      if(item && !version.evidenceIds.some(id=>data.facts.find(f=>f.id===id).group===item.group)) errors.push("版本"+version.index+"附上了不属于所选经历的链接");
    }
  }
  for(const gap of checks.filter(c=>c.hard&&c.status==="unmet")) {
    if(!versions.some(v=>v.text.includes(gap.name) || gap.name==="学历" && /大专|本科|硕士|博士/.test(v.text))) errors.push("简历已明确不符合的"+gap.name+"门槛应自然如实说明，不能隐去后暗示完全满足");
  }
  if(errors.length) throw Error(errors.join("；"));
  return {versions,requirementChecks:checks};
}

function validateReview(raw,versions,data) {
  const report=json(raw);
  if(!Array.isArray(report.checks) || report.checks.length!==3) throw Error("独立复核缺少完整三版检查结果");
  const errors=[],evidence=[];
  for(let i=0;i<3;i++) {
    const check=report.checks[i],version=versions[i];
    if(check.index!==i+1 || check.natural!==true || !["direct","transferable"].includes(check.jobFit) || !Array.isArray(check.issues) || check.issues.length) errors.push("版本"+(i+1)+"："+(check.issues?.join("；")||"表达不自然或岗位关联不成立"));
    if(!Array.isArray(check.claims)||!check.claims.length) { errors.push("版本"+(i+1)+"缺少逐项事实复核"); continue; }
    const sources=[];
    for(const claim of check.claims) {
      if(typeof claim.text!=="string" || !claim.text.trim() || !compact(version.text).includes(compact(claim.text)) || claim.supported!==true || !Array.isArray(claim.sourceIds) || !claim.sourceIds.length) { errors.push("版本"+(i+1)+"有未经证实的事实："+(claim.text||"缺少原句")); continue; }
      for(const id of claim.sourceIds) {
        const fact=data.facts.find(f=>f.id===id);
        if(!fact || !version.evidenceIds.includes(id)) errors.push("版本"+(i+1)+"的复核引用不属于实际选材");
        else if(!sources.some(s=>s.id===id)) sources.push(fact);
      }
    }
    if(!sources.length) errors.push("版本"+(i+1)+"未核实任何简历依据");
    evidence.push({quote:check.claims.map(c=>c.text).join("；"),source:sources.map(s=>s.source).join("\n\n"),context:[...new Set(sources.map(s=>s.group))].filter(g=>g!=="resume").join("\n"),claims:check.claims});
  }
  if(report.distinct!==true) errors.push("三版只更换开头结尾或罗列同一份摘要，策略没有区别");
  if(errors.length) throw Error(errors.join("；"));
  return {evidence,review:report};
}
module.exports={normalize,catalog,requirementChecks,parseDraft,validateReview};
