#!/usr/bin/env node
/* probe-offline.js — 离线语音包端到端（零第三方依赖，用 Node 内置 WebSocket 走 CDP）
 *
 * 为什么不用前面那种「--dump-dom + 虚拟时钟」：Cache Storage 的 caches.open()
 * 在虚拟时钟下永远不会 resolve，测出来全是假的「正在检查」。这里用真实时钟，
 * 直接点面板里的下载按钮，等到状态落定为止。
 *
 * 用法：node tools/probe-offline.js
 * 断言：
 *   1. 面板里能读到「未下载」类文案（说明探测链路通）；
 *   2. 点下载后状态最终变成「已全部下载」；
 *   3. 缓存里确实有全部语音块（数量与索引一致）；
 *   4. 刷新页面后仍显示「已全部下载」（持久化，不是内存态）。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const PROFILE = path.join(ROOT, '.shots', 'edge-profile-offline');
const TMP = path.join(ROOT, 'index.__offline__.html');

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/opt/microsoft/msedge/msedge',
  '/usr/bin/microsoft-edge'
].find(function (p) { try { return fs.existsSync(p); } catch (e) { return false; } });

if (!EDGE) { console.error('Edge not found; abort'); process.exit(1); }

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
  for (var i = 0; i < (tries || 60); i++) {
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
    ws.addEventListener('error', function (e) { reject(new Error('ws error')); });
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
    expression: expr, awaitPromise: true, returnByValue: true, timeout: timeoutMs || 120000
  });
  if (r.exceptionDetails) {
    throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || 'eval failed');
  }
  return r.result.value;
}

(async function main() {
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) { }
  fs.mkdirSync(path.dirname(PROFILE), { recursive: true });

  const html = fs.readFileSync(INDEX, 'utf8');
  fs.writeFileSync(TMP, html);

  const srv = await startServer(ROOT);
  const port = srv.address().port;
  const url = 'http://127.0.0.1:' + port + '/index.html';
  const dbg = 9500 + (process.pid % 400);

  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--no-proxy-server',
    '--remote-debugging-port=' + dbg,
    '--user-data-dir=' + PROFILE,
    '--window-size=780,1688', url
  ], { stdio: 'ignore' });

  let page = null;
  try {
    page = await waitJson(dbg, 80);
    const c = client(page.webSocketDebuggerUrl);
    await c.ready;
    await c.send('Runtime.enable');

    /* 等服务 worker 接管（下载要靠它缓存） */
    await sleep(1500);

    const info = await evaluate(c, `(function(){
      return {
        hasCaches: typeof caches,
        controlled: !!navigator.serviceWorker.controller,
        chunks: (function(){ var m = window.VOICE_CHUNK_FOR || {}, s = {}, a = [];
          Object.keys(m).forEach(function(k){ if (m[k] && !s[m[k]]) { s[m[k]] = 1; a.push(m[k]); } });
          return a.length; })()
      };
    })()`);

    /* 打开家长面板，等状态落定 */
    await evaluate(c, `(function(){ document.getElementById('btnParent').click(); })()`);
    await sleep(2500);
    const before = await evaluate(c, `(function(){
      var el = document.querySelector('#parentBody .p-block:last-child .p-line');
      return el ? el.textContent : '(no line)';
    })()`);

    /* 真点下载按钮，轮询到状态不再变化 */
    await evaluate(c, `(function(){
      var b = document.querySelector('#parentBody .p-btn');
      if (!b) throw new Error('no download button');
      b.click();
    })()`);

    let after = '', states = [];
    for (var i = 0; i < 240; i++) {
      await sleep(1000);
      const s = await evaluate(c, `(function(){
        var el = document.querySelector('#parentBody .p-block:last-child .p-line');
        return el ? el.textContent : '';
      })()`);
      if (states[states.length - 1] !== s) states.push(s);
      after = s;
      if (/已全部下载/.test(s) || /中断|失败|不支持|读不到/.test(s)) break;
    }

    /* 直接查缓存条目数，验证不是只改了文案 */
    const cacheInfo = await evaluate(c, `(async function(){
      if (typeof caches === 'undefined') return { ok: false };
      var keys = await caches.keys();
      var c = await caches.open('lilearn-voice-pack');
      var list = await c.keys();
      return { ok: true, caches: keys, entries: list.length };
    })()`);

    /* 刷新后应仍是已下载 */
    await c.send('Page.enable');
    await c.send('Page.reload', { ignoreCache: false });
    await sleep(4000);
    await evaluate(c, `(function(){ document.getElementById('btnParent').click(); })()`);
    await sleep(2500);
    const afterReload = await evaluate(c, `(function(){
      var el = document.querySelector('#parentBody .p-block:last-child .p-line');
      return el ? el.textContent : '';
    })()`);

    c.close();

    const fails = [];
    function ok(name, cond, detail) { if (!cond) fails.push(name + (detail ? ' → ' + detail : '')); }
    ok('缓存接口存在', info.hasCaches === 'object', info.hasCaches);
    ok('页面已被 worker 接管', info.controlled === true, String(info.controlled));
    ok('语音块数量合理', info.chunks === (cacheInfo.entries || info.chunks), 'index=' + info.chunks + ' cache=' + cacheInfo.entries);
    ok('下载前不是已下载态', !/已全部下载/.test(before), before);
    ok('下载后全部就位', /已全部下载/.test(after), after);
    ok('缓存条目数对得上', cacheInfo.entries === info.chunks, String(cacheInfo.entries));
    ok('刷新后仍是已下载', /已全部下载/.test(afterReload), afterReload);

    console.log('  初始状态：' + before);
    console.log('  过程状态：' + states.join(' | '));
    console.log('  缓存：' + JSON.stringify(cacheInfo.caches) + ' 条目=' + cacheInfo.entries + '/' + info.chunks);
    console.log('  刷新后：' + afterReload);
    if (fails.length) {
      console.error('FAIL');
      fails.forEach(function (f) { console.error('  - ' + f); });
      process.exitCode = 1;
    } else {
      console.log('PASS probe-offline');
    }
  } catch (e) {
    console.error('ERROR ' + (e && e.message || e));
    process.exitCode = 1;
  } finally {
    try { child.kill(); } catch (e) { }
    srv.close();
    try { fs.unlinkSync(TMP); } catch (e) { }
  }
})();
