/**
 * 从 public/logo.svg 生成整套 PWA 图标，保证「安装到主屏」和网页里是同一颗四叶草。
 *
 *   node scripts/gen-icons.mjs
 *
 * 需要本机有 Chromium（脚本会自动找系统 Chrome / Playwright 自带浏览器）。
 * 生成结果已提交进仓库，CI / 部署不需要跑这个脚本。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "icons");
const logoSvg = fs.readFileSync(path.join(root, "public", "logo.svg"), "utf8");

// logo.svg 是 240×240 viewBox；渲染时强制撑满容器
const svg = logoSvg.replace(/width="240"\s+height="240"/, 'width="100%" height="100%"');

// 通知 badge：白色剪影 + 笑脸镂空（透明底，系统可按单色模板着色）
const badgeSvg = svg
  .replace('fill="url(#clover)"', 'fill="#FFFFFF" mask="url(#face)"')
  .replace("</defs>", `</defs>
  <mask id="face"><rect x="0" y="0" width="240" height="240" fill="#fff"/>
    <g fill="none" stroke="#000" stroke-width="15" stroke-linecap="round" stroke-linejoin="round">
      <path d="M84 100 L110 126 L84 152"/><path d="M136 140 Q152 155 168 140"/>
    </g></mask>`)
  .replace(/<g fill="none" stroke="#FFFFFF"[\s\S]*?<\/g>/, "");

const BG = "radial-gradient(135% 125% at 22% 10%, #30306e 0%, #1d1c4b 46%, #10102c 100%)";

function chromePath() {
  for (const p of ["/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/usr/local/bin/chromium"]) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function pageHtml(size, inner, transparent = false, badge = false) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden}
    body{background:${transparent ? "transparent" : BG};display:grid;place-items:center}
    .mark{width:${inner}px;height:${inner}px;line-height:0;
      ${badge ? "" : "filter:drop-shadow(0 5px 18px rgba(120,110,255,.42)) drop-shadow(0 0 1px rgba(255,255,255,.35))"}}
    svg{display:block;width:100%;height:100%}
  </style></head><body><div class="mark">${badge ? badgeSvg : svg}</div></body></html>`;
}

let chromium;
for (const candidate of ["/usr/local/lib/node_modules/playwright", "playwright", "playwright-core"]) {
  try { chromium = require(candidate).chromium; break; } catch { /* next */ }
}
if (!chromium) throw new Error("需要 playwright：npm i -D playwright");

const executablePath = chromePath();
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb"],
});

const jobs = [
  // 普通图标：满幅品牌深底，四叶草占 82%（系统自行裁圆/圆角）
  { file: "icon-192.png", size: 192, inner: 0.82 },
  { file: "icon-512.png", size: 512, inner: 0.82 },
  // maskable：四叶草缩到 62%，完整落在 80% 直径安全区内；背景满 bleed 不留透明边
  { file: "icon-maskable.png", size: 512, inner: 0.62 },
  // iOS 会自己加圆角，这里给不透明方形底（PNG 无 alpha，避免透明变黑）
  { file: "apple-touch-icon.png", size: 180, inner: 0.86 },
  // 桌面通知 badge：白色剪影 + 透明底
  { file: "icon-badge.png", size: 96, inner: 0.92, transparent: true, badge: true },
];

fs.mkdirSync(outDir, { recursive: true });
for (const j of jobs) {
  const page = await browser.newPage({
    viewport: { width: j.size, height: j.size },
    deviceScaleFactor: 1,
  });
  await page.setContent(pageHtml(j.size, Math.round(j.size * j.inner), j.transparent, j.badge));
  await page.waitForTimeout(120);
  await page.screenshot({
    path: path.join(outDir, j.file),
    omitBackground: Boolean(j.transparent),
    type: "png",
  });
  await page.close();
  console.log("generated", j.file, `${j.size}x${j.size}`);
}
await browser.close();
console.log("all PWA icons now match public/logo.svg");
