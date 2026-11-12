#!/usr/bin/env node
/* regress-skin.js — 视觉回归护栏（零第三方依赖）
 *
 * 用法：node tools/regress-skin.js
 * 产出：.shots/home-390.png / home-600.png / regress.json
 *
 * 每次改动前后各跑一次：对比两张截图与 regress.json 里的
 * innerWidth / scrollWidth / data-island / tint / 岛屿数量，
 * 即可发现布局溢出、皮肤失效、岛色调丢失等回归。
 * 临时诊断页会在运行结束自动删除，不污染仓库。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, '.shots');
const INDEX = path.join(ROOT, 'index.html');
const TMP = path.join(ROOT, 'index.__regress__.html');

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/opt/microsoft/msedge/msedge',
  '/usr/bin/microsoft-edge'
].find(function (p) { try { return fs.existsSync(p); } catch (e) { return false; } });

if (!EDGE) { console.error('Edge not found; abort'); process.exit(1); }
if (!fs.existsSync(INDEX)) { console.error('index.html not found; abort'); process.exit(1); }
fs.mkdirSync(SHOTS, { recursive: true });

const PROBE = `<script>
window.addEventListener('load',function(){setTimeout(function(){
 var b=document.body,cs=getComputedStyle(b);
 /* 注意：主脚本在 IIFE 闭包内，NUMBERS / LEVEL_DEFS 等常量不在 window 上，
    不能从页面外部探测。第 2 批验收前需先在闭包内暴露只读测试钩子。
    这里只记录可观测的资源加载指标。 */
 document.title='DIAG'+JSON.stringify({
  iw:innerWidth, bodySW:b.scrollWidth, docSW:document.documentElement.scrollWidth,
  view:b.dataset.view||'', island:b.dataset.island||'',
  skin:b.classList.contains('live-skin'),
  tint:cs.getPropertyValue('--lv-tint').trim(),
  islands:document.querySelectorAll('#islandGrid .island').length,
  externalScripts:document.querySelectorAll('script[src]').length,
  sheets:document.styleSheets.length
 });
},1200);});
</script>`;

const html = fs.readFileSync(INDEX, 'utf8');
fs.writeFileSync(TMP, html.replace('</body>', PROBE + '\n</body>'));

function fileUrl(p) { return 'file:///' + String(p).replace(/\\/g, '/').replace(/^\/+/, ''); }
function run(args, timeout) {
  try {
    return execFileSync(EDGE, args, {
      encoding: 'utf8', timeout: timeout || 60000, stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch (e) { return (e.stdout || '').toString(); }
}

const report = { generatedAt: new Date().toISOString(), sizes: {} };
[[390, 844], [600, 844]].forEach(function (wh) {
  const w = wh[0], h = wh[1], key = w + 'x' + h;
  const shot = path.join(SHOTS, 'home-' + w + '.png');
  run(['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    '--screenshot=' + shot, '--window-size=' + w + ',' + h,
    '--virtual-time-budget=5000', fileUrl(INDEX)], 90000);
  const dom = run(['--headless=new', '--disable-gpu', '--no-first-run', '--dump-dom',
    '--virtual-time-budget=6000', '--window-size=' + w + ',' + h, fileUrl(TMP)], 90000);
  const m = String(dom).match(/<title>DIAG([^<]*)<\/title>/);
  let diag = null;
  if (m) { try { diag = JSON.parse(m[1]); } catch (e) { diag = null; } }
  report.sizes[key] = {
    screenshot: path.basename(shot),
    bytes: fs.existsSync(shot) ? fs.statSync(shot).size : 0,
    diag: diag
  };
  console.log(key + ' | shot=' + report.sizes[key].bytes + 'B | ' + (diag ? JSON.stringify(diag) : 'NO_DIAG'));
});

try { fs.unlinkSync(TMP); } catch (e) { }
fs.writeFileSync(path.join(SHOTS, 'regress.json'), JSON.stringify(report, null, 2));
console.log('REPORT -> ' + path.join(SHOTS, 'regress.json'));
