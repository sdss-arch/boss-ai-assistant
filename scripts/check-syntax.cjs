// 全量 JavaScript 语法检查：CI 与本地验证共用。
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const ignored = new Set([".git", "node_modules", "dist", "out", "coverage", "test-results"]);

function collect(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return ignored.has(entry.name) ? [] : collect(path.join(dir, entry.name));
    return /\.(js|cjs|mjs)$/.test(entry.name) ? [path.join(dir, entry.name)] : [];
  });
}

const files = collect(root);
const failed = [];
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    failed.push(path.relative(root, file));
    process.stderr.write(result.stderr || "");
  }
}

if (failed.length) {
  console.error(`syntax check failed: ${failed.length}/${files.length}`);
  process.exit(1);
}
console.log(`syntax ok: ${files.length} JavaScript files`);
