const url="https://github.com/example/boss-fixture";
const resume="软件工程本科，熟悉Node.js、JavaScript、接口测试。\n订单接口项目 2024.01-2024.08\n开发：参与订单接口的参数校验、异常处理和联调，也补充边界测试用例。\n问题处理：排查失败请求日志中的问题，补充测试用例并整理接口文档。\n项目源码："+url;
const texts=[
 "您好，想应聘您发布的Node.js开发岗位。我参与过订单接口开发，主要做参数校验、异常处理和联调，也补过边界测试。简历里有具体项目，方便的话想和您聊聊。\n"+url,
 "您好，对Node.js开发岗位感兴趣。做过订单接口校验和联调，方便看看我的项目吗？\n"+url,
 "您好，想了解Node.js开发岗位。我处理接口问题时，会先排查失败请求日志，再补充测试和接口文档。希望有机会和您进一步沟通。\n"+url
];
const claimTexts=["我参与过订单接口开发，主要做参数校验、异常处理和联调，也补过边界测试","做过订单接口校验和联调","我处理接口问题时，会先排查失败请求日志，再补充测试和接口文档"];
const ids=[["E3"],["E3"],["E4"]];
const draft={versions:texts.map((text,i)=>({text,evidenceIds:ids[i]}))};
const review={distinct:true,checks:texts.map((_,i)=>({index:i+1,natural:true,jobFit:"direct",issues:[],claims:[{text:claimTexts[i],sourceIds:ids[i],supported:true}]}))};
const modelOutput=JSON.stringify(draft),reviewOutput=JSON.stringify(review),text=texts.map((t,i)=>"【版本"+(i+1)+"】\n"+t).join("\n\n");
module.exports={url,resume,texts,draft,review,modelOutput,reviewOutput,text};
