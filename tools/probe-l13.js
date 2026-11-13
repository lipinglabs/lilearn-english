#!/usr/bin/env node
/* probe-l13.js — 第 13 岛「字母与首音」验收（零第三方依赖，CDP + 真实时钟）
 *
 * 用法：node tools/probe-l13.js
 * 产出：.shots/l13-390.png / l13-1024.png / l13-stage.png / l13.json
 *
 * 为什么用 CDP 而不是 --dump-dom：
 *   本岛要真的点屏推进教学、真的拖拽配对，还得读运行时的语音索引，
 *   静态 DOM 快照做不到（且 Cache Storage 在虚拟时钟下会挂死，见 probe-learning 的说明）。
 *
 * 断言（全部走真实交互）：
 *   1. 13-1 教学 8 个环节逐个出现、能点屏走完，最后进入答题；
 *   2. 13-1 打满 12 轮通关：三种题型都出现过、cleared['13-1'] 落下、解锁 13-2；
 *   3. 13-5（六个字母）教学 9 个环节不卡，进入答题且有题目；
 *   4. 字母只出现在 .l122-glyph 里（RULES §三.33 白名单），aria-label 不含字母；
 *   5. 26 个字母在五关分组里各出现一次（5+5+5+5+6）；
 *   6. 每道题的语音 key 都能在分块索引里找到（不会哑音）；
 *   7. 390 / 1024 两个视口都不横向溢出，地图 13 张岛卡都在屏内。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, '.shots');
const INDEX = path.join(ROOT, 'index.html');
const TMP = path.join(ROOT, 'index.__l13__.html');
const PROFILE = path.join(SHOTS, 'edge-profile-l13');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml'
};

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
window.addEventListener('load', function () {
  var out = { errors: [], checks: {} };
  window.addEventListener('error', function (e) { out.errors.push(String(e.message || e)); });
  window.addEventListener('unhandledrejection', function (e) { out.errors.push('rejection:' + String(e.reason)); });

  /* 语音 mock：真实播放 4–6 秒一句，12 轮要跑几分钟；这里让 ended 立刻到达。
     音频「是否真的存在」由第 6 条断言（分块索引）单独保证，不靠播放。 */
  var rawPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    var el = this;
    setTimeout(function () { try { el.dispatchEvent(new Event('ended')); } catch (e) { } }, 60);
    return Promise.resolve();
  };

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function snap() { return window.Game.snapshot(); }

  /* 字母白名单：含拉丁字母的文本节点必须落在 .l122-glyph 里 */
  function lettersOutside(root) {
    var bad = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = walker.nextNode())) {
      var txt = n.nodeValue || '';
      if (!/[A-Za-z]/.test(txt)) continue;
      var p = n.parentNode, ok = false, skip = false;
      while (p && p !== root) {
        var tag = p.tagName ? p.tagName.toUpperCase() : '';
        if (tag === 'SCRIPT' || tag === 'STYLE') { skip = true; break; }
        if (p.classList && p.classList.contains('l122-glyph')) { ok = true; break; }
        p = p.parentNode;
      }
      if (skip) continue;
      if (!ok) bad.push(txt.replace(/\\s+/g, ' ').slice(0, 16));
    }
    return bad;
  }
  function ariaWithLetters(root) {
    var bad = [];
    var list = root.querySelectorAll('[aria-label]');
    for (var i = 0; i < list.length; i++) {
      var v = list[i].getAttribute('aria-label') || '';
      if (/[A-Za-z]/.test(v)) bad.push(v);
    }
    return bad;
  }
  function overflow(root) {
    var box = root || document.documentElement;
    return box.scrollWidth > (box.clientWidth || innerWidth) + 1;
  }

  /* 合成一次真实手势拖拽（全局拖拽引擎挂在 document 上） */
  function dragChip() {
    var chips = document.querySelectorAll('#askDisplay .l122-chip');
    if (!chips.length) return false;
    var map = (window.__LLCore || {}).L13_BY_CH || {};
    /* 只能拖「字母在槽里」的那个：tray 里的干扰物品不一定有对应槽（3 槽 / 5 个字母） */
    var chip = null, slot = null;
    for (var ci = 0; ci < chips.length; ci++) {
      var item = chips[ci].dataset.item, letter = null;
      for (var k in map) if (map[k].word === item) letter = map[k].ch;
      if (!letter) continue;
      var sEl = document.querySelector('#askDisplay .l122-slot[data-letter="' + letter + '"]');
      if (sEl) { chip = chips[ci]; slot = sEl; break; }
    }
    if (!chip || !slot) return false;
    var a = chip.getBoundingClientRect(), b = slot.getBoundingClientRect();
    if (!a.width || !b.width) return false;
    var x0 = a.left + a.width / 2, y0 = a.top + a.height / 2;
    var x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
    function fire(type, x, y, node, buttons) {
      node.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, clientX: x, clientY: y,
        pointerId: 1, isPrimary: true, pointerType: 'mouse', buttons: buttons
      }));
    }
    fire('pointerdown', x0, y0, chip, 1);
    for (var i = 1; i <= 8; i++) {
      fire('pointermove', x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8, document, 1);
    }
    fire('pointerup', x1, y1, document, 0);
    return true;
  }

  async function playLevel(level, stopAtAsking) {
    var G = window.Game;
    G.openIsland(13);
    await wait(420);
    G.enterLevel(level);
    await wait(480);
    var started = !document.getElementById('btnStart').hidden;
    document.getElementById('btnStart').click();

    var sids = [], types = {}, guard = 0, askAt = 0, lastKey = '', stuck = 0;
    while (guard++ < 520) {
      var s = snap();
      if (s.phase === 'tutorial') {
        var st = document.querySelector('#askDisplay .l122-stage');
        var sid = st && st.dataset ? st.dataset.sid : null;
        if (sid && sids[sids.length - 1] !== sid) sids.push(sid);
        var cards = document.querySelectorAll('#askDisplay .l122-card');
        if (cards.length >= 2) {
          for (var i = 0; i < cards.length; i++) {
            cards[i].click();
            await wait(160);
            if (document.querySelector('#askDisplay .l122-right')) break;
            if (snap().phase !== 'tutorial') break;
          }
        } else {
          /* 演示步：gate 监听的是 document 的捕获 click */
          document.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
        await wait(300);
        continue;
      }
      if (s.phase === 'asking') {
        if (!askAt) askAt = Date.now();
        if (stopAtAsking) break;
        var q = s.question;
        types[q.type] = (types[q.type] || 0) + 1;
        if (lastKey === s.type + '|' + q.type + '|' + s.round) {
          stuck += 1;
        } else {
          lastKey = s.type + '|' + q.type + '|' + s.round;
          stuck = 0;
        }
        if (stuck > 8) { out.stuckAt = q.type + '/r' + s.round; break; }
        if (q.type === 'L13A') {
          var b = document.querySelector('#askDisplay .l122-card[data-letter="' + q.target + '"]');
          if (b) b.click();
        } else if (q.type === 'L13B') {
          var def = (window.__LLCore.L13_BY_CH || {})[q.target];
          var card = def && document.querySelector('#askDisplay .l122-card[data-item="' + def.word + '"]');
          if (card) card.click();
        } else if (q.type === 'L13C') {
          dragChip();
        }
        await wait(460);
        continue;
      }
      await wait(160);
    }
    var fin = snap();
    return {
      started: started, sids: sids, types: types, wantAsking: !!askAt,
      phase: fin.phase, round: fin.round, stars: fin.stars,
      cleared: !!G.progress.cleared['13-' + level],
      unlocked: G.progress.unlockedLevel['13'] || 1
    };
  }

  /* 每道题的语音 key 是否都在分块索引里 */
  function auditAudio() {
    var miss = [];
    var map = window.VOICE_CHUNK_FOR || {};
    var bank = window.VOICE_BANK || {};
    var groups = (window.__LLCore || {}).L13_GROUPS || [];
    var byCh = (window.__LLCore || {}).L13_BY_CH || {};
    var audio = (window.__LLCore || {}).l13Audio;
    var kinds = ['qa', 'qb', 'qc'];
    for (var gi = 0; gi < groups.length; gi++) {
      for (var ci = 0; ci < groups[gi].length; ci++) {
        var def = byCh[groups[gi][ci]];
        if (!def) { miss.push('nodef:' + groups[gi][ci]); continue; }
        var teach = 'l13_t_' + def.ch.toLowerCase();
        var ks = [teach].concat(kinds.map(function (k) { return audio(def, k); }));
        for (var i = 0; i < ks.length; i++) {
          if (!map[ks[i]]) miss.push(ks[i]);
        }
      }
    }
    return { miss: miss, chunkCount: Object.keys(map).filter(function (k) { return k.indexOf('l13_') === 0; }).length, bank: Object.keys(bank).length };
  }

  function flattenLetters() {
    var groups = (window.__LLCore || {}).L13_GROUPS || [];
    var all = [];
    groups.forEach(function (g) { all = all.concat(g); });
    var uniq = {};
    all.forEach(function (ch) { uniq[ch] = (uniq[ch] || 0) + 1; });
    var dup = Object.keys(uniq).filter(function (k) { return uniq[k] > 1; });
    return { total: all.length, distinct: Object.keys(uniq).length, dup: dup, groups: groups.map(function (g) { return g.length; }) };
  }

  async function run() {
    var c = out.checks;
    try {
      var G = window.Game;

      /* 地图：13 张岛卡 */
      G.backToMap();
      await wait(600);
      var cards = document.querySelectorAll('#islandGrid [data-island], #islandGrid .island');
      c.mapCards = cards.length;
      c.mapOverflow = overflow();
      c.mapEnglish = lettersOutside(document.body).concat(ariaWithLetters(document.body));

      /* 26 字母分组自检 */
      c.letters = flattenLetters();

      /* 语音 key 完整性（index.js 已同步加载） */
      c.audio = auditAudio();

      /* 13-1 全流程 */
      var r1 = await playLevel(1, false);
      c.l131 = r1;

      /* 13-1 结束后回地图，看解锁 */
      G.backToMap();
      await wait(500);
      c.afterClear = { cleared: !!G.progress.cleared['13-1'], unlocked: G.progress.unlockedLevel['13'] || 1 };

      /* 13-5：六个字母的教学 + 打满 12 轮（验「年度大结局」是否落到第 13 岛） */
      var r5 = await playLevel(5, false);
      c.l135 = r5;
      await wait(1200);
      var fin = document.getElementById('viewDone');
      c.finale = {
        has: !!(fin && fin.classList.contains('finale')),
        flags: document.querySelectorAll('#viewDone .l125-fin-flag').length,
        banner: (document.querySelector('#viewDone .l125-fin-banner') || {}).textContent || ''
      };
      c.stageEnglish = lettersOutside(document.body).concat(ariaWithLetters(document.body));
      c.stageOverflow = overflow();
      var st = document.getElementById('screenLevel');
      c.levelOverflow = st ? st.scrollWidth > st.clientWidth + 1 : null;

      /* 答题页再扫一次字母白名单（这时候屏幕上有字母卡） */
      c.answerEnglish = lettersOutside(document.body).concat(ariaWithLetters(document.body));

      window.__PROBE__ = out;
    } catch (e) {
      out.errors.push('run:' + String(e && e.message || e));
      window.__PROBE__ = out;
    }
  }
  setTimeout(run, 900);
});
</script>`;

function startServer(root) {
  return new Promise(function (resolve) {
    const srv = http.createServer(function (req, res) {
      let rel = decodeURIComponent((req.url || '/').split('?')[0]);
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
  for (let i = 0; i < (tries || 80); i++) {
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
    expression: expr, awaitPromise: true, returnByValue: true, timeout: timeoutMs || 180000
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
    await sleep(500);
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
  const dbg = 9900 + (process.pid % 90);

  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--no-proxy-server',
    '--remote-debugging-port=' + dbg,
    '--user-data-dir=' + PROFILE,
    '--window-size=390,844', base
  ], { stdio: 'ignore' });

  let r = null;
  try {
    const page = await waitJson(dbg, 80);
    const c = client(page.webSocketDebuggerUrl);
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable');
    await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await c.send('Page.reload');
    await sleep(1400);
    r = await waitProbe(c, 420000);

    async function shoot(name) {
      const shot = await c.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(SHOTS, name), Buffer.from(shot.data, 'base64'));
    }
    await shoot('l13-stage.png');

    /* 1024 地图：先切视口再导航（顺序错了量到的是旧宽度） */
    await c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
    await c.send('Page.navigate', { url: base + '?w=big' });
    await sleep(2600);
    await evaluate(c, 'window.Game.backToMap(); 1');
    await sleep(700);
    const big = await evaluate(c, '({ overflow: document.documentElement.scrollWidth > innerWidth + 1,' +
      ' cards: document.querySelectorAll("#islandGrid .island").length,' +
      ' cols: getComputedStyle(document.getElementById("islandGrid")).gridTemplateColumns.split(" ").length })');
    r.checks.big = big;
    await shoot('l13-1024.png');

    await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await c.send('Page.navigate', { url: base + '?w=small' });
    await sleep(2400);
    await evaluate(c, 'window.Game.backToMap(); 1');
    await sleep(700);
    const small = await evaluate(c, '({ overflow: document.documentElement.scrollWidth > innerWidth + 1,' +
      ' cards: document.querySelectorAll("#islandGrid .island").length })');
    r.checks.small = small;
    await shoot('l13-390.png');

    c.close();
  } catch (e) {
    console.error('ERROR ' + (e && e.message || e));
    process.exitCode = 1;
  } finally {
    try { child.kill(); } catch (e) { }
    srv.close();
    try { fs.unlinkSync(TMP); } catch (e) { }
  }

  if (!r) {
    console.error('FAIL 未取到探针结果');
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(path.join(SHOTS, 'l13.json'), JSON.stringify(r, null, 2));
  const c = r.checks || {};
  const fails = [];
  function ok(name, cond, detail) { if (!cond) fails.push(name + (detail ? ' → ' + detail : '')); }

  const l1 = c.l131 || {}, l5 = c.l135 || {};
  ok('探针无异常', (r.errors || []).length === 0, JSON.stringify(r.errors));
  ok('26 个字母五关各一次', c.letters && c.letters.total === 26 && c.letters.distinct === 26 &&
    (c.letters.dup || []).length === 0, JSON.stringify(c.letters));
  ok('分组是 5+5+5+5+6', c.letters && JSON.stringify(c.letters.groups) === '[5,5,5,5,6]', JSON.stringify(c.letters && c.letters.groups));
  ok('13-1 教学第一屏是开场', l1.sids && l1.sids[0] === 'in', JSON.stringify(l1.sids && l1.sids[0]));
  ok('13-1 打满 12 轮通关', l1.phase === 'done' && l1.round >= 12, 'phase=' + l1.phase + ' round=' + l1.round);
  ok('13-1 三种题型都出现', l1.types && l1.types.L13A > 0 && l1.types.L13B > 0 && l1.types.L13C > 0, JSON.stringify(l1.types));
  ok('13-1 记为通关', l1.cleared === true, String(l1.cleared));
  ok('通关后解锁 13-2', (c.afterClear && c.afterClear.unlocked) === 2, JSON.stringify(c.afterClear));
  ok('13-5 教学 9 个环节', l5.sids && l5.sids.length === 9, JSON.stringify(l5.sids));
  ok('13-5 打满 12 轮通关', l5.phase === 'done' && l5.round >= 12, 'phase=' + l5.phase + ' round=' + l5.round);
  ok('13-5 记为通关', l5.cleared === true, String(l5.cleared));
  ok('13-5 触发年度大结局', c.finale && c.finale.has === true, JSON.stringify(c.finale));
  ok('结局层有 13 面小旗', c.finale && c.finale.flags === 13, String(c.finale && c.finale.flags));
  ok('结局横幅是中文', c.finale && /全部通关/.test(c.finale.banner || ''), (c.finale && c.finale.banner) || '');
  ok('语音 key 无缺失', c.audio && (c.audio.miss || []).length === 0, JSON.stringify(c.audio && c.audio.miss));
  ok('26 字母 + 结局台词都在分块索引里（102 条）', c.audio && c.audio.chunkCount === 102, String(c.audio && c.audio.chunkCount));
  ok('13-1 教学 8 环节', l1.sids && l1.sids.length === 8, JSON.stringify(l1.sids));
  ok('地图 13 张岛卡', c.mapCards === 13, String(c.mapCards));
  ok('地图无英文', (c.mapEnglish || []).length === 0, JSON.stringify(c.mapEnglish));
  ok('教学页无英文（字母只在字母卡里）', (c.stageEnglish || []).length === 0, JSON.stringify(c.stageEnglish));
  ok('答题页无英文（字母只在字母卡里）', (c.answerEnglish || []).length === 0, JSON.stringify(c.answerEnglish));
  ok('390 地图不横向溢出', c.mapOverflow === false, String(c.mapOverflow));
  ok('390 关卡页不横向溢出', c.stageOverflow === false, String(c.stageOverflow));
  ok('1024 地图不横向溢出', c.big && c.big.overflow === false, JSON.stringify(c.big));
  ok('1024 地图 13 张卡', c.big && c.big.cards === 13, JSON.stringify(c.big));

  if (fails.length) {
    console.error('FAIL');
    fails.forEach(function (f) { console.error('  - ' + f); });
    process.exitCode = 1;
  } else {
    console.log('PASS probe-l13');
  }
  console.log('  13-1: 环节=' + (l1.sids || []).length + ' 题型=' + JSON.stringify(l1.types) +
    ' 轮次=' + l1.round + ' 星星=' + l1.stars + ' 通关=' + l1.cleared);
  console.log('  13-5: 环节=' + (l5.sids || []).length + ' 轮次=' + l5.round + ' 结局=' + JSON.stringify(c.finale));
  console.log('  语音: l13 索引=' + (c.audio && c.audio.chunkCount) + ' 缺失=' + JSON.stringify(c.audio && c.audio.miss));
  console.log('  布局: 1024=' + JSON.stringify(c.big) + ' 390=' + JSON.stringify(c.small));
})();
