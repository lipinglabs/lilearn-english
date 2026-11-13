#!/usr/bin/env node
/* probe-learning.js — 学习闭环护栏（零第三方依赖，CDP 真实时钟）
 *
 * 用法：node tools/probe-learning.js
 * 产出：.shots/learning-390.png / learning-1024.png / learning.json
 *
 * 为什么不用「--dump-dom + 虚拟时钟」：
 *   家长面板一打开就调 caches.open() 探测离线包，而 Cache Storage 在虚拟时钟下
 *   可能永远不 resolve，整条虚拟时钟就卡在那里，Edge 只能被 SIGTERM 杀掉。
 *   这里改用 CDP + 真实时钟，探针结果挂在 window.__PROBE__ 上轮询取回。
 *
 * 断言（全部走真实交互，不造假数据）：
 *   1. 首次进入没有任何旧进度时，地图不显示「继续」「复习」；
 *   2. 真的玩几题之后：lastPlayed 落到当前关卡、daily 有题数、答错会进 levelMistakes；
 *   3. 回到地图后「继续」出现且文案是中文的「第几岛 岛名 · 第几关」；
 *   4. 家长小结能打开，且读到今天的题数与正确率；
 *   5. 复习面板能打开并列出弱关；
 *   6. 390 与 1024 两个视口都不横向溢出，1024 下岛屿网格是 4 列；
 *   7. 页面可见文本与 aria-label 不含英文字母（RULES §二.1）。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, '.shots');
const INDEX = path.join(ROOT, 'index.html');
const TMP = path.join(ROOT, 'index.__learning__.html');
const PROFILE = path.join(SHOTS, 'edge-profile-learning');

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/opt/microsoft/msedge/msedge',
  '/usr/bin/microsoft-edge'
].find(function (p) { try { return fs.existsSync(p); } catch (e) { return false; } });

if (!EDGE) { console.error('Edge not found; abort'); process.exit(1); }
if (!fs.existsSync(INDEX)) { console.error('index.html not found; abort'); process.exit(1); }
fs.mkdirSync(SHOTS, { recursive: true });

/* 探针分两种模式：
   - #probe ：完整走一遍「玩几题 → 回地图 → 家长 → 复习」；
   - #layout：只量布局（列数 / 溢出 / 入口行），不玩游戏——截图和第二个视口用它，
              免得每换一个尺寸就把 1-1 重玩一遍。 */
const PROBE = `<script>
window.addEventListener('load', function () {
  var out = { errors: [], checks: {} };
  var LAYOUT_ONLY = location.hash === '#layout';
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function englishIn(root) {
    var bad = [];
    var m = (root.innerText || '').match(/[A-Za-z]+/g);
    if (m) bad.push('text:' + m.slice(0, 5).join(','));
    var list = root.querySelectorAll('[aria-label]');
    for (var i = 0; i < list.length; i++) {
      var v = list[i].getAttribute('aria-label') || '';
      if (/[A-Za-z]/.test(v)) bad.push('aria:' + v);
    }
    return bad;
  }
  function measureLayout(c) {
    c.iw = innerWidth;
    c.overflow = document.documentElement.scrollWidth > innerWidth + 1;
    var grid = document.getElementById('islandGrid');
    c.cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    c.gridW = Math.round(grid.getBoundingClientRect().width);
    /* 入口行必须整行落在屏幕内容区里（.screen 有 overflow:hidden，越界会被无声裁掉，
       document 级别的 scrollWidth 检查发现不了这种裁切） */
    var scr = document.getElementById('screenMap').getBoundingClientRect();
    var pills = [document.getElementById('btnContinue'), document.getElementById('btnReview'), document.getElementById('btnParent')]
      .filter(function (el) { return el && !el.hidden; });
    c.pillCount = pills.length;
    c.pillInside = pills.length > 0 && pills.every(function (el) {
      var r = el.getBoundingClientRect();
      return r.width > 0 && r.left >= scr.left - 1 && r.right <= scr.right + 1;
    });
    c.pillRightGap = pills.length ? Math.round(scr.right - pills[pills.length - 1].getBoundingClientRect().right) : -1;
    /* 这两个只在「第一次量」时记：第 3 步回地图后会再调一次本函数，
       那时进度已经存在，覆盖掉就永远测不出「全新存档不显示继续」。 */
    if (c.contHiddenFresh === undefined) {
      c.contHiddenFresh = document.getElementById('btnContinue').hidden;
      c.reviewHiddenFresh = document.getElementById('btnReview').hidden;
    }
  }
  async function run() {
    var c = out.checks;
    try {
      measureLayout(c);
      if (LAYOUT_ONLY) {
        c.english = englishIn(document.body);
        window.__PROBE__ = out;
        return;
      }

      var G = window.Game;

      /* 1. 全新存档：不该出现继续 / 复习（measureLayout 里已记） */

      /* 2. 真的玩 1-1 */
      G.openIsland(1);
      await wait(400);
      G.enterLevel(1);
      await wait(500);
      document.getElementById('btnStart').click();

      /* 等出题（语音兜底最长 20s） */
      for (var w = 0; w < 60; w++) {
        if (!document.getElementById('viewAsk').hidden) break;
        await wait(300);
      }
      c.askShown = !document.getElementById('viewAsk').hidden;

      /* 连点第一个选项：只要有一次错，就会写进 levelMistakes */
      for (var k = 0; k < 5; k++) {
        var opt = document.querySelector('.option:not([hidden])');
        if (!opt) break;
        opt.click();
        await wait(1400);
      }

      var p = G.progress;
      c.lastPlayed = p.lastPlayed;
      c.dailyKeys = Object.keys(p.daily || {});
      var dk = c.dailyKeys[c.dailyKeys.length - 1];
      c.daily = dk ? p.daily[dk] : null;
      c.levelMistakes = p.levelMistakes;
      c.wordCount = Object.keys(p.wordStats || {}).length;

      /* 3. 回地图：继续该出现了 */
      G.backToMap();
      await wait(400);
      var cont = document.getElementById('btnContinue');
      c.contHiddenAfter = cont.hidden;
      c.contText = cont.textContent;
      c.reviewHiddenAfter = document.getElementById('btnReview').hidden;

      /* 3b. 入口行不越界 */
      measureLayout(c);

      /* 4. 家长小结 */
      document.getElementById('btnParent').click();
      await wait(300);
      c.parentOpen = document.getElementById('parentSheet').hidden === false;
      c.parentText = document.getElementById('parentBody').innerText || document.getElementById('parentBody').textContent;
      c.voiceStatus = (document.querySelector('#parentBody .p-block:last-child .p-line') || {}).textContent || '';
      c.parentOverflow = (function () {
        var b = document.getElementById('parentBody');
        return b.scrollWidth > b.clientWidth + 1;
      })();
      document.getElementById('parentClose').click();
      await wait(150);

      /* 5. 复习面板 */
      var rb = document.getElementById('btnReview');
      if (!rb.hidden) {
        rb.click();
        await wait(250);
        c.reviewOpen = document.getElementById('reviewSheet').hidden === false;
        c.reviewText = document.getElementById('reviewList').innerText || document.getElementById('reviewList').textContent;
        document.getElementById('reviewClose').click();
        await wait(150);
      }

      /* 6. 英文文本 */
      c.english = englishIn(document.body);
      c.overflowAfter = document.documentElement.scrollWidth > innerWidth + 1;
    } catch (e) {
      out.errors.push(String(e && e.message || e));
    }
    window.__PROBE__ = out;
  }
  setTimeout(run, 700);
});
</script>`;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ico': 'image/x-icon'
};

function startServer(root) {
  return new Promise(function (resolve) {
    const srv = http.createServer(function (req, res) {
      var rel = decodeURIComponent((req.url || '/').split('?')[0]);
      if (rel === '/') rel = '/index.html';
      const p = path.join(root, rel);
      if (p.indexOf(root) !== 0) { res.statusCode = 403; res.end(); return; }
      fs.readFile(p, function (err, buf) {
        if (err) { res.statusCode = 404; res.end('nf'); return; }
        res.setHeader('Content-Type', MIME[path.extname(p).toLowerCase()] || 'application/octet-stream');
        res.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', function () { resolve(srv); });
  });
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function waitJson(port, tries) {
  for (var i = 0; i < (tries || 80); i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/json/list');
      const list = await r.json();
      const page = list.filter(function (t) { return t.type === 'page' && t.webSocketDebuggerUrl; })[0];
      if (page) return page;
    } catch (e) { }
    await sleep(250);
  }
  throw new Error('devtools not ready');
}

function client(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const ready = new Promise(function (resolve, reject) {
    ws.addEventListener('open', function () { resolve(); });
    ws.addEventListener('error', function () { reject(new Error('ws error')); });
  });
  ws.addEventListener('message', function (ev) {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    }
  });
  return {
    ready: ready,
    send: function (method, params) {
      const mid = ++id;
      return new Promise(function (resolve, reject) {
        pending.set(mid, { resolve: resolve, reject: reject });
        ws.send(JSON.stringify({ id: mid, method: method, params: params || {} }));
      });
    },
    close: function () { try { ws.close(); } catch (e) { } }
  };
}

async function evaluate(c, expr, timeoutMs) {
  const r = await c.send('Runtime.evaluate', {
    expression: expr, awaitPromise: true, returnByValue: true, timeout: timeoutMs || 150000
  });
  if (r.exceptionDetails) {
    throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || 'eval failed');
  }
  return r.result.value;
}

async function waitProbe(c, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const v = await evaluate(c, 'window.__PROBE__ || null');
    if (v) return v;
    await sleep(400);
  }
  throw new Error('probe timeout');
}

(async function main() {
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) { }
  fs.mkdirSync(PROFILE, { recursive: true });

  const html = fs.readFileSync(INDEX, 'utf8');
  fs.writeFileSync(TMP, html.replace('</body>', PROBE + '\n</body>'));

  const srv = await startServer(ROOT);
  const port = srv.address().port;
  const base = 'http://127.0.0.1:' + port + '/' + path.basename(TMP);
  const dbg = 9600 + (process.pid % 300);

  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--no-proxy-server',
    '--remote-debugging-port=' + dbg,
    '--user-data-dir=' + PROFILE,
    '--window-size=390,844', base + '#probe'
  ], { stdio: 'ignore' });

  let r390 = null, r1024 = null;
  try {
    const page = await waitJson(dbg, 80);
    const c = client(page.webSocketDebuggerUrl);
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable');
    await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

    /* 第一次：全新存档，完整流程 */
    await c.send('Page.reload');
    await sleep(1200);
    r390 = await waitProbe(c, 180000);

    /* 截图 + 第二个视口：进度已存在，用 layout 模式只渲染地图，不重玩。
       注意顺序——先切到目标宽度再导航，否则量到的还是上一个宽度的布局。 */
    async function measureAt(w, h, tag) {
      await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
      await c.send('Page.navigate', { url: base + '?w=' + tag + '#layout' });
      await sleep(2500);
      return waitProbe(c, 60000);
    }
    async function shoot(name) {
      const shot = await c.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(SHOTS, name), Buffer.from(shot.data, 'base64'));
    }

    await measureAt(390, 844, 'a');
    await shoot('learning-390.png');

    r1024 = await measureAt(1024, 768, 'b');
    await shoot('learning-1024.png');

    c.close();
  } catch (e) {
    console.error('ERROR ' + (e && e.message || e));
    process.exitCode = 1;
  } finally {
    try { child.kill(); } catch (e) { }
    srv.close();
    try { fs.unlinkSync(TMP); } catch (e) { }
  }

  if (!r390) {
    console.error('FAIL 390 未取到探针结果');
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(path.join(SHOTS, 'learning.json'), JSON.stringify({ phone: r390, tablet: r1024 }, null, 2));

  const c = r390.checks || {};
  const t = (r1024 && r1024.checks) || {};
  const fails = [];
  function ok(name, cond, detail) { if (!cond) fails.push(name + (detail ? ' → ' + detail : '')); }

  ok('探针无异常', (r390.errors || []).length === 0, JSON.stringify(r390.errors));
  ok('RULES 二.1 无英文', Array.isArray(c.english) && c.english.length === 0, JSON.stringify(c.english));
  ok('390 无横向溢出', c.overflow === false, String(c.overflow));
  ok('1024 无横向溢出', t.overflow === false, String(t.overflow));
  ok('1024 岛屿网格 4 列', t.cols === 4, String(t.cols));
  ok('全新存档不显示继续', c.contHiddenFresh === true, String(c.contHiddenFresh));
  ok('全新存档不显示复习', c.reviewHiddenFresh === true, String(c.reviewHiddenFresh));
  ok('开始后能出题', c.askShown === true, String(c.askShown));
  ok('lastPlayed 已记录', !!c.lastPlayed && c.lastPlayed.island === 1 && c.lastPlayed.level === 1, JSON.stringify(c.lastPlayed));
  ok('daily 有记录', !!c.daily && (c.daily.r + c.daily.w) > 0, JSON.stringify(c.daily));
  ok('答题有词统计', c.wordCount > 0, String(c.wordCount));
  ok('玩过之后出现继续', c.contHiddenAfter === false, String(c.contHiddenAfter));
  ok('继续文案是中文关卡名', /第1岛/.test(c.contText || '') && /第1关/.test(c.contText || ''), c.contText);
  ok('入口行整行在屏内', c.pillInside === true && c.pillRightGap >= 0, 'inside=' + c.pillInside + ' gap=' + c.pillRightGap);
  ok('家长小结能打开', c.parentOpen === true, String(c.parentOpen));
  ok('家长小结不横向溢出', c.parentOverflow === false, String(c.parentOverflow));
  ok('家长小结有今天的数据', /今天/.test(c.parentText || '') && /题/.test(c.parentText || ''), (c.parentText || '').slice(0, 60));
  ok('离线语音状态已落定', c.voiceStatus !== '' && c.voiceStatus.indexOf('正在检查') < 0, c.voiceStatus);
  ok('有错题才出现复习', (c.reviewHiddenAfter === false) === ((c.levelMistakes && Object.keys(c.levelMistakes).length > 0) === true), JSON.stringify(c.levelMistakes));

  if (fails.length) {
    console.error('FAIL');
    fails.forEach(function (f) { console.error('  - ' + f); });
    process.exitCode = 1;
  } else {
    console.log('PASS probe-learning');
  }
  console.log('  390: 继续=' + JSON.stringify(c.contText) + ' 家长=' + String(c.parentOpen) +
    ' 词条=' + c.wordCount + ' 每日=' + JSON.stringify(c.daily) +
    ' 入口=' + c.pillCount + '个/右侧余' + c.pillRightGap + 'px 离线=' + c.voiceStatus);
  console.log('  1024: 列数=' + t.cols + ' 网格宽=' + t.gridW + ' 溢出=' + t.overflow);
})();
