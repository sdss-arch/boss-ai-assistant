// 独立目录版：保留原始 Electron 二进制，应用和生产依赖完整放在 resources/app。
// 不依赖开发工作区，不修改 Windows 的应用控制策略。单文件分发仍需可信签名。
const { asarUnpack, ...base } = require("./package.json").build;
module.exports = {
  ...base,
  extends: null,
  electronDist: require("path").join(__dirname, "node_modules/electron/dist"),
  productName: "BOSSAI",
  asar: false,
  directories: { output: "dist/standalone" },
  win: { ...base.win, signAndEditExecutable: false }
};
