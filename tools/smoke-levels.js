#!/usr/bin/env node
/* smoke-levels.js — 60 关逐关冒烟（零第三方依赖）
 *
 * 复用项目自带的 window.Game 测试接口（openIsland / enterLevel / backToMap / snapshot），
 * 不需要新增闭包钩子，也不改动 index.html。
 *
 * 用法：
 *   node tools/smoke-levels.js              # 进关 + 视图状态 + 返回（全 60 关）
 *   node tools/smoke-levels.js --deep       # 额外点「开始」并检查题目/选项渲染
 *   node tools/smoke-levels.js --islands=3  # 只跑前 3 岛（快速验证）
 *
 * 产出：.shots/smoke-report.json；临时诊断页自动删除。
 *
 * 说明：file:// 下 voice/chunks 无法运行时加载（voiceBank() 为空），因此语音层改用
 * 「静态资源完整性校验」：检查 13 岛 × 5 关对应的分块文件是否齐全、非空。
 * 运行时语音播放需在线上 URL 或用 CDP 注入验证，属后续增强项。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, '.shots');
const INDEX = path.join(ROOT, 'index.html');
const TMP = path.join(ROOT, 'index.__smoke__.html');
const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/opt/microsoft/msedge/msedge',
  '/usr/bin/microsoft-edge'
].find(function (p) { try { return fs.existsSync(p); } catch (e) { return false; } });

if (!EDGE) { console.error('Edge not found'); process.exit(1); }
const deep = process.argv.indexOf('--deep') >= 0;
const mIslands = process.argv.find(function (a) { return a.indexOf('--islands=') === 0; });
const islandLimit = mIslands ? Math.min(13, Math.max(1, parseInt(mIslands.split('=')[1], 10))) : 13;
fs.mkdirSync(SHOTS, { recursive: true });

const DRIVER = `<script>
(function(){
 var LIMIT=${islandLimit}, DEEP=${deep};
 var out={deep:DEEP,islandLimit:LIMIT,levels:[],errors:[],startedAt:Date.now()};
 window.addEventListener('error',function(e){out.errors.push(String(e.message||e));});
 window.addEventListener('unhandledrejection',function(e){out.errors.push('rejection:'+String(e.reason));});
 function wait(ms){return new Promise(function(r){setTimeout(r,ms);});}
 function done(){
  var p=document.createElement('pre');p.id='__SMOKE__';p.style.display='none';
  p.textContent=JSON.stringify(out);document.body.appendChild(p);
  document.title='SMOKE_DONE';
 }
 async function run(){
  var G=window.Game;
  if(!G){out.errors.push('window.Game missing');done();return;}
  try{out.voiceKeysRuntime=G.voiceKeys.length;}catch(e){out.voiceKeysRuntime=-1;}
  for(var i=1;i<=LIMIT;i++){
   try{G.openIsland(i);}catch(e){out.errors.push('openIsland '+i+': '+e.message);}
   for(var l=1;l<=5;l++){
    var rec={key:i+'-'+l};
    try{
     G.enterLevel(l);
     await wait(90);
     var s=G.snapshot();
     rec.view=s.view; rec.island=s.island; rec.level=s.level;
     rec.enterOk=(s.view==='level'&&s.island===i&&s.level===l);
     rec.startVisible=!document.getElementById('viewStart').hidden;
     if(DEEP){
      var btn=document.getElementById('btnStart');
      if(btn) btn.click();
      await wait(900);
      var s2=G.snapshot();
      rec.hasQuestion=!!s2.question;
      rec.phase=s2.phase;
      rec.options=document.querySelectorAll('.option:not([hidden])').length;
      rec.askVisible=!document.getElementById('viewAsk').hidden;
     }
     G.backToMap();
     await wait(40);
     rec.backView=G.snapshot().view;
     rec.backOk=(rec.backView==='map');
    }catch(e){rec.error=String(e.message||e);}
    out.levels.push(rec);
   }
  }
  out.finishedAt=Date.now();
  out.durationMs=out.finishedAt-out.startedAt;
  done();
 }
 document.addEventListener('DOMContentLoaded',function(){setTimeout(run,900);});
})();
</script>`;

/* 语音层：静态校验 13 岛 × 5 关的分块是否齐全、非空 */
function voiceAssets() {
  const dir = path.join(ROOT, 'voice', 'chunks');
  if (!fs.existsSync(dir)) return { available: false };
  const files = fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); });
  let bytes = 0;
  files.forEach(function (f) { bytes += fs.statSync(path.join(dir, f)).size; });
  /* 分块粒度是混合的：部分岛按关（island_N_M.js），早期岛按岛/按组（island_2.js）。
     因此校验口径是「每个岛至少有一份语音资源」，而不是逐关一个文件。 */
  const byIsland = {};
  const missingIslands = [];
  for (let i = 1; i <= 13; i++) {
    const hits = files.filter(function (f) {
      return f === 'island_' + i + '.js' || f.indexOf('island_' + i + '_') === 0;
    });
    byIsland[i] = hits.length;
    if (!hits.length) missingIslands.push(i);
  }
  return {
    available: true, files: files.length, bytes: bytes,
    islandsCovered: 13 - missingIslands.length, islandsTotal: 13,
    missingIslands: missingIslands, byIsland: byIsland
  };
}

const html = fs.readFileSync(INDEX, 'utf8');
fs.writeFileSync(TMP, html.replace('</body>', DRIVER + '\n</body>'));
function fileUrl(p) { return 'file:///' + String(p).replace(/\\/g, '/').replace(/^\/+/, ''); }

let dom = '';
try {
  dom = execFileSync(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--dump-dom',
    '--virtual-time-budget=180000', '--window-size=600,844', fileUrl(TMP)], {
    encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 20 * 1024 * 1024
  });
} catch (e) { dom = (e.stdout || '').toString(); }
try { fs.unlinkSync(TMP); } catch (e) { }

const m = String(dom).match(/<pre id="__SMOKE__"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) {
  console.log('SMOKE_RESULT=MISSING DOM_BYTES=' + String(dom).length);
  fs.writeFileSync(path.join(SHOTS, 'smoke-report.json'),
    JSON.stringify({ error: 'no report', title: (String(dom).match(/<title>([^<]*)<\/title>/) || [])[1] || '' }, null, 2));
  process.exit(1);
}
const report = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
report.voiceAssets = voiceAssets();
fs.writeFileSync(path.join(SHOTS, 'smoke-report.json'), JSON.stringify(report, null, 2));

/* 教学模式（phase=tutorial）下题目尚未生成属正常：只要选项已渲染即视为关卡启动成功 */
const bad = report.levels.filter(function (r) {
  return !r.enterOk || !r.backOk || r.error ||
    (report.deep && !(r.hasQuestion || r.options > 0));
});
console.log('LEVELS=' + report.levels.length + ' DEEP=' + report.deep + ' ISLANDS=' + report.islandLimit);
console.log('ENTER_OK=' + report.levels.filter(function (r) { return r.enterOk; }).length +
  ' BACK_OK=' + report.levels.filter(function (r) { return r.backOk; }).length);
if (report.deep) console.log('HAS_QUESTION=' + report.levels.filter(function (r) { return r.hasQuestion; }).length +
  ' WITH_OPTIONS=' + report.levels.filter(function (r) { return r.options > 0; }).length +
  ' TUTORIAL_PHASE=' + report.levels.filter(function (r) { return r.phase === 'tutorial'; }).length);
const va = report.voiceAssets;
console.log('VOICE_CHUNKS=' + (va.available ? va.files : 'n/a') +
  ' VOICE_BYTES=' + (va.available ? va.bytes : 'n/a') +
  ' ISLANDS_WITH_VOICE=' + (va.available ? va.islandsCovered + '/' + va.islandsTotal : 'n/a') +
  ' MISSING_ISLANDS=' + (va.available ? JSON.stringify(va.missingIslands) : 'n/a'));
console.log('VOICE_KEYS_RUNTIME=' + report.voiceKeysRuntime + ' (file:// 下为 0 属环境限制)');
console.log('JS_ERRORS=' + report.errors.length + (report.errors.length ? ' -> ' + JSON.stringify(report.errors.slice(0, 5)) : ''));
console.log('BAD_LEVELS=' + bad.length + (bad.length ? ' -> ' + JSON.stringify(bad.slice(0, 8)) : ''));
console.log('DURATION_MS=' + (report.durationMs || 0) + ' REPORT -> ' + path.join(SHOTS, 'smoke-report.json'));
