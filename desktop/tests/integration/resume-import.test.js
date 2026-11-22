const fs = require("fs/promises"), os = require("os"), path = require("path");
const { readResume } = require("../../src/core/resume-import");
let dir;
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), "boss-import-test-")); });
afterEach(async () => fs.rm(dir, { recursive: true, force: true }));
test("文本简历在本地提取，空文件给出可执行提示", async () => {
  const file = path.join(dir, "resume.txt"); await fs.writeFile(file, "真实项目经验");
  await expect(readResume(file)).resolves.toEqual({ text: "真实项目经验", fileName: "resume.txt" });
  await fs.writeFile(file, " "); await expect(readResume(file)).rejects.toThrow("没有提取到文字");
});
test("DOCX 简历提取正文，不渲染不受信 HTML", async () => {
  const JSZip = require("jszip"), zip = new JSZip();
  zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Node.js 项目开发经历</w:t></w:r></w:p></w:body></w:document>');
  const file = path.join(dir, "resume.docx"); await fs.writeFile(file, await zip.generateAsync({ type: "nodebuffer" }));
  await expect(readResume(file)).resolves.toMatchObject({ text: "Node.js 项目开发经历" });
});
test("PDF 简历提取文本", async () => {
  const content = "BT /F1 12 Tf 72 720 Td (Resume Node.js project) Tj ET";
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream"];
  let pdf = "%PDF-1.4\n", offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(pdf)); pdf += (i + 1) + " 0 obj\n" + objects[i] + "\nendobj\n"; }
  const xref = Buffer.byteLength(pdf);
  pdf += "xref\n0 6\n0000000000 65535 f \n" + offsets.slice(1).map(n => String(n).padStart(10, "0") + " 00000 n \n").join("") + "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
  const file = path.join(dir, "resume.pdf"); await fs.writeFile(file, pdf);
  // pdf.js 的 ESM worker 在独立 Node 进程运行，避免 Jest VM 阻断动态导入。
  const { promisify } = require("util"), { execFile } = require("child_process");
  const script = 'require("./src/core/resume-import").readResume(process.argv[1]).then(r => process.stdout.write(r.text)).catch(e => { console.error(e); process.exit(1); });';
  const result = await promisify(execFile)(process.execPath, ["-e", script, file], { cwd: path.resolve(__dirname, "../..") });
  expect(result.stdout).toContain("Resume Node.js project");
});
