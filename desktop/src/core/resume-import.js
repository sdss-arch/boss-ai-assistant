const fs = require("fs/promises");
const path = require("path");

async function readResume(file) {
  const stat = await fs.stat(file);
  if (stat.size > 15 * 1024 * 1024) throw new Error("文件超过 15 MB，请压缩后导入");
  const ext = path.extname(file).toLowerCase();
  let text;
  if (ext === ".pdf") {
    const { PDFParse } = require("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(await fs.readFile(file)) });
    try { text = (await parser.getText()).text; } finally { await parser.destroy(); }
  } else if (ext === ".docx") {
    text = (await require("mammoth").extractRawText({ path: file })).value;
  } else if ([".txt", ".md"].includes(ext)) {
    text = await fs.readFile(file, "utf8");
  } else throw new Error("支持 PDF、DOCX、TXT、Markdown 文件；旧版 DOC 请先另存为 DOCX");
  text = String(text || "").trim();
  if (!text) throw new Error("没有提取到文字。扫描版 PDF 请先识别为文字，或手动粘贴简历");
  if (text.length > 150000) throw new Error("简历文本过长，请精简到 15 万字以内");
  return { text, fileName: path.basename(file) };
}
module.exports = { readResume };
