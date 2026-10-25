// 第 9 岛第 1 关（L9-W1，衣物穿戴 Shirt / Pants / Shoes / Hat）专项测试
//   1) 解锁链：1–7 全通 + 8-1~8-5 通关 → 第 9 岛图标亮起、9-1 可玩。
//   2) 教学 10 环节（Shirt 2 演示 + 1 互动 / Pants 2 演示 + 1 互动 / Shoes 1 演示 / Hat 1 演示 + 1 互动 / 过渡）：
//      演示语音播完定格、必须点屏幕才推进（§三.14）；衣物穿上后 data-worn 累加；点错 again 且不推进；4 秒小手（§二.12）。
//   3) 三题型：A 听音穿衣服（拖拽，热区 = 小人 +14%，落点偏外也算中）/ B 听音找衣物（3 个穿不同衣物的小人）/ C TPR（👍）。
//   4) 12 轮（4/4/4）：答对无人声、通关星星=12、cleared['9-1']、unlockedLevel[9]=2、grand=false（非岛末关）。
//   5) 视觉：无英文字母（innerText + aria-label）、双视口无溢出、元素无零尺寸。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'l9';
const PORT = 9793 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));

const A_KEY = { shirt: 'l9_t_shirt_put', pants: 'l9_t_pants_put', shoes: 'l9_t_shoes', hat: 'l9_t_hat' };
const B_KEY = { shirt: 'l9_b_shirt', pants: 'l9_b_pants', shoes: 'l9_b_shoes', hat: 'l9_b_hat' };
const C_KEYS = ['l9_c_shirt', 'l9_c_pants', 'l9_c_shoes', 'l9_c_hat'];

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-l9-' + Date.now()),
  '--window-size=' + W + ',' + H, 'about:blank'], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let id = 0; const pend = new Map();
let finished = false;
const finish = code => {
  if (finished) return;
  finished = true;
  try { proc.kill(); } catch (e) {}
  setTimeout(() => process.exit(code), 120);
};

(async () => {
  let v;
  for (let i = 0; i < 200; i++) {
    try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) { v = await r.json(); break; } } catch (e) {}
    await sleep(250);
  }
  const ws = await new Promise((res, rej) => {
    const w = new WebSocket(v.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 1 << 28 });
    w.on('open', () => res(w)); w.on('error', rej);
  });
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails || {};
      const ex = d.exception && (d.exception.description || d.exception.value);
      console.log('PAGE_EXC', String(ex || d.text || '').slice(0, 300));
    }
    if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  });
  const send = (method, params, sessionId) => new Promise((res, rej) => {
    const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params: params || {}, sessionId }));
  });

  const t = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 600 }, sessionId);

  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    (function(){
      window.__played = [];
      var OA = window.Audio;
      window.Audio = function(src){
        var a = new OA(src);
        a.play = function(){ window.__played.push({ t: Date.now(), src: src });
          setTimeout(function(){ try{ a.dispatchEvent(new Event('ended')); }catch(e){} }, 70); return Promise.resolve(); };
        a.pause = function(){};
        return a;
      };
      window.__errs = [];
      window.addEventListener('error', function(ev){
        window.__errs.push(String((ev.error && ev.error.stack) || ev.message || '').slice(0, 500));
      });
      window.__stageLog = [];
      var last = null;
      function stageSig(){
        var s = document.querySelector('.l9-stage');
        if (!s) return null;
        return 'sid:' + (s.dataset.sid || '?');
      }
      function rec(){
        var sig = stageSig();
        if (!sig || sig === last) return;
        last = sig;
        window.__stageLog.push({ t: Date.now(), sig: sig });
      }
      var mo = new MutationObserver(function(){ setTimeout(rec, 0); });
      window.addEventListener('DOMContentLoaded', function(){ mo.observe(document.body, { childList: true, subtree: true }); rec(); });
    })();
  ` }, sessionId);

  await send('Page.navigate', { url: URL_ }, sessionId);
  const boot = async () => {
    for (let i = 0; i < 1400; i++) {
      const r = await send('Runtime.evaluate', { expression: 'typeof window.Game !== "undefined"', returnByValue: true }, sessionId);
      if (r.result.value) break;
      await sleep(150);
    }
    await sleep(420);
  };
  await boot();

  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
    if (r.exceptionDetails) throw new Error('EVAL: ' + expr.slice(0, 90) + ' => ' + JSON.stringify(r.exceptionDetails.exception));
    return r.result.value;
  };
  const wait = async (expr, ms = 14000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await ev(expr)) return true; await sleep(70); }
    return false;
  };
  const sel = s => '!!document.querySelector(' + JSON.stringify(s) + ')';
  const shot = async name => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    fs.writeFileSync(name, Buffer.from(data, 'base64'));
  };
  const keysBetween = (a, b) => ev(`window.__played.filter(function(p){return p.t >= ${a} && p.t <= ${b};}).map(function(p){
    for (var k in window.VOICE_BANK) if (window.VOICE_BANK[k] === p.src) return k;
    return 'unknown';
  })`);
  const rectOf = s => ev(`(function(){
    var n = document.querySelector(${JSON.stringify(s)});
    if (!n) return null;
    var b = n.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height, cx: b.left + b.width/2, cy: b.top + b.height/2 };
  })()`);
  const mouse = (type, x, y, buttons) => send('Input.dispatchMouseEvent',
    { type, x, y, button: 'left', clickCount: 1, buttons: buttons === undefined ? 1 : buttons }, sessionId);
  const tapAt = async (x, y) => { await mouse('mousePressed', x, y, 1); await sleep(50); await mouse('mouseReleased', x, y, 0); await sleep(60); };
  const tap = async s => { const c = await rectOf(s); if (!c) return false; await tapAt(c.cx, c.cy); return true; };
  const dragTo = async (fromSel, tx, ty) => {
    const a = await rectOf(fromSel);
    if (!a) return false;
    await mouse('mousePressed', a.cx, a.cy, 1); await sleep(50);
    for (let k = 1; k <= 8; k++) { await mouse('mouseMoved', a.cx + (tx - a.cx) * k / 8, a.cy + (ty - a.cy) * k / 8, 1); await sleep(22); }
    await mouse('mouseReleased', tx, ty, 0); await sleep(90);
    return true;
  };
  const thumbGeom = () => ev(`(function(){
    var b = document.querySelector('#askDisplay .l9-thumb');
    if (!b) return null;
    var r = b.getBoundingClientRect();
    return { vw: Math.round(r.width / window.innerWidth * 100), px: Math.round(r.width),
             inView: r.right <= window.innerWidth + 1 && r.left >= -1 && r.bottom <= window.innerHeight + 1 && r.top >= -1 };
  })()`);
  const overflow = () => ev(`(function(){
    var de = document.documentElement;
    var optBar = document.getElementById('options');
    var optShown = !!optBar && !optBar.classList.contains('gone') && !optBar.classList.contains('off');
    var cut = [], zero = [];
    Array.prototype.forEach.call(document.querySelectorAll(
      '.l9-kidcard, .l9-itemcard, .l9-thumb, .l9-stage, .l9-ask, .l9-bstage, .l9-kidrow, .l9-items, .option'), function(n){
      var host = n.closest('#viewAsk, #viewDone, #viewStart');
      if (host && host.hidden) return;
      var b = n.getBoundingClientRect();
      if (!b.width) {
        if (n.classList.contains('option')) { if (optShown && !n.hidden) zero.push('option:0'); }
        else zero.push((n.className || '?') + ':0');
        return;
      }
      var overH = b.right > window.innerWidth + 1 || b.left < -1;
      var overV = b.bottom > window.innerHeight + 1 || b.top < -1;
      if (overH || overV) cut.push((n.className || '?') + ':' + Math.round(b.left) + ',' + Math.round(b.top) +
        '..' + Math.round(b.right) + ',' + Math.round(b.bottom));
    });
    return { sw: de.scrollWidth, iw: window.innerWidth, sh: de.scrollHeight, ih: window.innerHeight,
             cut: cut.slice(0, 6), zero: zero.slice(0, 6) };
  })()`);

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };

  // ---------- 0) 解锁链：第 9 岛必须在 8-5 通关后亮起 ----------
  await ev('Game.resetProgress()');
  await ev('for (var isl = 1; isl <= 7; isl++) { for (var lv = 1; lv <= 5; lv++) Game.markCleared(isl, lv); }');
  await ev('Game.markCleared(8, 1); Game.markCleared(8, 2); Game.markCleared(8, 3); Game.markCleared(8, 4)');
  await ev('Game.backToMap()'); await sleep(300);
  rep.checks.before = await ev(`(function(){
    var c9 = document.querySelector('.island[data-island="9"]');
    return { island9Unlocked: c9 ? c9.classList.contains('unlocked') : null,
             island9HasIcon: !!(c9 && c9.querySelector('.icon svg, .icon img')) };
  })()`);
  if (rep.checks.before.island9Unlocked === true) rep.errors.push('未通关 8-5 时第 9 岛就解锁了');

  await ev('Game.markCleared(8, 5)');
  await ev('Game.backToMap()'); await sleep(350);
  rep.checks.after = await ev(`(function(){
    var c9 = document.querySelector('.island[data-island="9"]');
    var c8 = document.querySelector('.island[data-island="8"]');
    return { island9Unlocked: c9 ? c9.classList.contains('unlocked') : null,
             island9HasIcon: !!(c9 && c9.querySelector('.icon svg, .icon img')),
             island9EmojiText: (function(){ var s = c9 && c9.querySelector('.icon span'); return s ? (s.textContent || '') : ''; })(),
             island8Cleared: c8 ? c8.classList.contains('cleared') : null,
             unlockedIsland: Game.progress.unlockedIsland };
  })()`);
  await shot(TAG + '-map.png');
  if (rep.checks.after.island9Unlocked !== true) rep.errors.push('通关 8-5 后第 9 岛没有解锁（图标未亮）');
  if (rep.checks.after.island9HasIcon !== true) rep.errors.push('第 9 岛地图图标缺失');
  if (/[\u{1F300}-\u{1FAFF}]/u.test(rep.checks.after.island9EmojiText || '')) rep.errors.push('第 9 岛图标用了 emoji 字符（应手写 SVG）');
  if (rep.checks.after.unlockedIsland !== 9) rep.errors.push('unlockedIsland 应为 9，实际 ' + rep.checks.after.unlockedIsland);

  await ev('Game.openIsland(9)'); await sleep(350);
  rep.checks.island = await ev(`(function(){
    var n1 = document.querySelector('.node[data-level="1"]');
    var n2 = document.querySelector('.node[data-level="2"]');
    return { node1Playable: n1 ? n1.classList.contains('playable') : false,
             node2Playable: n2 ? n2.classList.contains('playable') : false,
             headIcon: !!document.querySelector('#islandHead .big-icon svg'),
             title: (document.querySelector('#islandHead .t1') || {}).textContent || '' };
  })()`);
  await shot(TAG + '-island.png');
  if (rep.checks.island.node1Playable !== true) rep.errors.push('第 9 岛第 1 关不可玩');
  if (rep.checks.island.headIcon !== true) rep.errors.push('第 9 岛岛头图标缺失');

  // ---------- 1) 进关 → 教学 ----------
  await ev('document.querySelector(\'.node[data-level="1"]\').click()');
  await sleep(300);
  await ev('document.getElementById("btnStart").click()');

  const STEPS = [
    { n: 'shirt1',   sig: 'sid:shirt1',   audio: 'l9_t_shirt',     demo: true, add: 'shirt', before: [], shot: 'tut-shirt1' },
    { n: 'shirt2',   sig: 'sid:shirt2',   audio: 'l9_t_shirt',     demo: true, add: 'shirt', before: [], cards: 4, shot: 'tut-shirt2' },
    { n: 'shirtPut', sig: 'sid:shirtPut', audio: 'l9_t_shirt_put', put: { add: 'shirt', before: [], items: ['shirt', 'pants'] }, shot: 'tut-shirtPut' },
    { n: 'pants1',   sig: 'sid:pants1',   audio: 'l9_t_pants',     demo: true, add: 'pants', before: ['shirt'], shot: 'tut-pants1' },
    { n: 'pants2',   sig: 'sid:pants2',   audio: 'l9_t_pants',     demo: true, add: 'pants', before: ['shirt'], cards: 4, shot: 'tut-pants2' },
    { n: 'pantsPut', sig: 'sid:pantsPut', audio: 'l9_t_pants_put', put: { add: 'pants', before: ['shirt'], items: ['pants', 'hat'] }, shot: 'tut-pantsPut' },
    { n: 'shoes1',   sig: 'sid:shoes1',   audio: 'l9_t_shoes',     demo: true, add: 'shoes', before: ['shirt', 'pants'], shot: 'tut-shoes1' },
    { n: 'hat1',     sig: 'sid:hat1',     audio: 'l9_t_hat',       demo: true, add: 'hat', before: ['shirt', 'pants', 'shoes'], shot: 'tut-hat1' },
    { n: 'hatPut',   sig: 'sid:hatPut',   audio: 'l9_t_hat',       put: { add: 'hat', before: ['shirt', 'pants', 'shoes'], items: ['hat', 'shoes'] }, shot: 'tut-hatPut' },
    { n: 'out',      sig: 'sid:out',      audio: 'l9_t_out',       out: true, shot: 'tut-out' }
  ];

  const findEntry = async (sig, cursor) => ev(`(function(){
    var s = ${JSON.stringify(sig)};
    for (var k = ${cursor}; k < window.__stageLog.length; k++) if (window.__stageLog[k].sig === s) return k;
    return -1;
  })()`);
  let logCursor = 0;
  for (let i = 0; i < STEPS.length; i++) {
    const st = STEPS[i];
    let foundIdx = -1;
    const end = Date.now() + 15000;
    while (Date.now() < end) { foundIdx = await findEntry(st.sig, logCursor); if (foundIdx >= 0) break; await sleep(70); }
    const reached = foundIdx >= 0;
    const entry = reached ? JSON.parse(await ev('JSON.stringify(window.__stageLog[' + foundIdx + '])')) : null;
    if (reached) logCursor = foundIdx + 1;
    const cat = st.demo ? 'demo' : (st.put ? 'put' : 'out');
    const row = { step: st.n, cat: cat, reached: reached, sig: entry ? entry.sig : null, sigOk: !!entry && entry.sig === st.sig };
    if (!row.sigOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）舞台不符：期望 ' + st.sig + '，实际 ' + row.sig);
    if (entry && st.put) row.hintEarly = await ev(sel('.tut-hint'));

    if (entry) {
      await sleep(180);
      row.audio = (await keysBetween(entry.t - 900, entry.t + 2600)).filter(k => k !== 'unknown');
      row.audioOk = row.audio.indexOf(st.audio) >= 0;
      if (!row.audioOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）语音不符：期望 ' + st.audio + '，实际 ' + row.audio.join(','));
      row.kid = await ev('!!document.querySelector("#askDisplay .l9-stage .l9-kidcard")');
      if (!st.out && row.kid !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）缺少小人');
      row.wornBefore = await ev('(function(){ var c = document.querySelector("#askDisplay .l9-stage .l9-kidcard"); return c ? c.dataset.worn : null; })()');
      if (st.before && (row.wornBefore || '') !== st.before.join(',')) {
        rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）初始穿着不符：' + row.wornBefore + ' != ' + st.before.join(','));
      }
      if (st.cards) {
        row.cards = await ev('document.querySelectorAll("#askDisplay .l9-stage .l9-items .l9-itemcard").length');
        if (row.cards !== st.cards) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）衣物卡不是 ' + st.cards + ' 件：' + row.cards);
        row.glowOk = await ev(`!!document.querySelector('#askDisplay .l9-stage .l9-items .l9-itemcard.l9-glow[data-item="${st.add}"]')`);
        if (row.glowOk !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）目标衣物没有高亮');
      }
      if (st.put) {
        row.items = await ev('document.querySelectorAll("#askDisplay .l9-stage .l9-items .l9-itemcard").length');
        if (row.items !== st.put.items.length) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）衣物选项数不符：' + row.items);
        row.targetItem = await ev(`!!document.querySelector('#askDisplay .l9-stage .l9-items .l9-itemcard[data-item="${st.put.add}"]')`);
        if (row.targetItem !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）缺少正确衣物 ' + st.put.add);
      }
    }
    row.overflow = await overflow();
    if (st.shot) { await sleep(80); await shot(TAG + '-' + st.shot + '.png'); }

    // 演示步：等「轻点继续」→ 不自动前进 → 点屏幕推进
    if (st.demo) {
      row.tapShown = await wait(sel('.f11-tap'), 6000);
      if (!row.tapShown) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示定格后没有出现「轻点继续」');
      row.wornAfter = await ev('(function(){ var c = document.querySelector("#askDisplay .l9-stage .l9-kidcard"); return c ? c.dataset.worn : null; })()');
      const wantWorn = st.before.concat([st.add]).join(',');
      if ((row.wornAfter || '') !== wantWorn) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）衣物没穿上：' + row.wornAfter + ' != ' + wantWorn);
      row.garmentDrawn = await ev('document.querySelectorAll("#askDisplay .l9-stage .l9-kid-wrap svg g").length');
      if (!row.garmentDrawn) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）小人身上没有画出衣物');
      await sleep(900);
      row.autoAdvanced = (await ev('window.__stageLog.length')) > (foundIdx + 1);
      if (row.autoAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示未点按就自动前进了');
      await tap('#askDisplay .l9-stage');
      row.advanced = await wait('window.__stageLog.length > ' + (foundIdx + 1), 6000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    // 互动：4 秒小手；点错 again；点对推进 + 穿上
    if (st.put) {
      row.hintLater = await wait(sel('.tut-hint'), 7000);
      if (row.hintEarly === true || row.hintLater !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手异常');
      row.hintGeom = await ev(`(function(){
        var h = document.querySelector('.tut-hint');
        var tgt = document.querySelector('#askDisplay .l9-items .l9-itemcard[data-item="${st.put.add}"]');
        if (!h || !tgt) return null;
        var tb = tgt.getBoundingClientRect(), hb = h.getBoundingClientRect();
        var ex = hb.left + hb.width/2, ey = hb.top + hb.height;
        return { near: ex > tb.left-16 && ex < tb.right+16 && ey > tb.top-28 && ey < tb.bottom+32, stars: Game.stars };
      })()`);
      if (row.hintGeom && row.hintGeom.near !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）小手没指向正确衣物');
      if (row.hintGeom && row.hintGeom.stars !== 0) rep.errors.push('教学阶段不该有星星');
      await sleep(150);
      const wrongItem = st.put.items.filter(x => x !== st.put.add)[0];
      const beforeW = await ev('window.__stageLog.length');
      const ctW = Date.now();
      await tap('#askDisplay .l9-items .l9-itemcard[data-item="' + wrongItem + '"]');
      await sleep(900);
      row.wrongAgain = (await keysBetween(ctW - 100, ctW + 1600)).filter(k => k !== 'unknown');
      row.wrongAdvanced = (await ev('window.__stageLog.length')) > beforeW;
      if (row.wrongAgain.indexOf('again') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错衣物没播 again');
      if (row.wrongAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错衣物却前进了');
      await sleep(700);
      const beforeC = await ev('window.__stageLog.length');
      await tap('#askDisplay .l9-items .l9-itemcard[data-item="' + st.put.add + '"]');
      /* 先读「穿上后」的穿着（l9PutOn 460ms 后落地），再等推进（过渡步会清空舞台） */
      await sleep(760);
      row.wornEnd = await ev('(function(){ var c = document.querySelector("#askDisplay .l9-stage .l9-kidcard"); return c ? c.dataset.worn : null; })()');
      row.advanced = await wait('window.__stageLog.length > ' + beforeC + ' || Game.phase === "asking"', 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点对衣物后没有推进');
    }

    if (st.out) {
      row.ended = await wait('Game.phase === "asking"', 10000);
      if (row.ended !== true) rep.errors.push('过渡语播完没有进入答题');
    }
    rep.tutorial.push(row);
    console.log('STEP ' + (i + 1) + ' ' + JSON.stringify(row).slice(0, 420));
  }

  rep.checks.outro = { ended: await wait('Game.phase === "asking"', 20000) };
  await sleep(500);
  rep.checks.outro.totalSteps = await ev('window.__stageLog.length');
  rep.checks.errs = await ev('window.__errs.slice(0, 3)');
  if (rep.checks.errs.length) console.log('ERRS ' + JSON.stringify(rep.checks.errs));
  await shot(TAG + '-ask-first.png');

  // ---------- 2) 12 轮答题 ----------
  const seenType = {}; const seenShot = {}; const wrongTested = { L9A: false, L9B: false };
  let hotzoneTested = false;

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(200);
    let snap = await ev('Game.snapshot()');
    let q = snap.question;
    if (!q) { rep.errors.push('第 ' + r + ' 轮：答题未开始'); break; }
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, audio: q.audio, item: q.l9item, target: q.l9target };

    if (q.type === 'L9A') {
      row.kid = await ev('!!document.querySelector("#askDisplay #l9-kid[data-drop=\\"kid\\"]")');
      row.opts = await ev('document.querySelectorAll("#options .option.l9-opt .slot svg").length');
      row.optDrag = await ev('document.querySelectorAll("#options .option[data-drag]").length');
      if (row.kid !== true) rep.errors.push('第 ' + r + ' 轮 L9A 缺中央小人（拖放目标）');
      if (row.opts !== 3) rep.errors.push('第 ' + r + ' 轮 L9A 衣物不是 3 件：' + row.opts);
      if (row.optDrag !== 3) rep.errors.push('第 ' + r + ' 轮 L9A 可拖选项不是 3 个：' + row.optDrag);
      row.audioOk = A_KEY[q.l9item] === q.audio;
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L9A 语音与衣物不符：' + q.audio + ' item=' + q.l9item);
      row.semanticOk = !!q.l9items && q.l9items[q.correct] === q.l9item;
      if (!row.semanticOk) rep.errors.push('第 ' + r + ' 轮 L9A 正确件与目标不符：' + JSON.stringify(q.l9items) + ' item=' + q.l9item);
    }
    if (q.type === 'L9B') {
      row.kids = await ev('document.querySelectorAll("#askDisplay .l9-kidrow .l9-kidcard").length');
      row.worns = await ev('Array.prototype.map.call(document.querySelectorAll("#askDisplay .l9-kidrow .l9-kidcard"), function(n){ return n.dataset.worn; })');
      row.optsN = await ev('document.querySelectorAll("#options .option[data-drag]").length');
      if (row.kids !== 3) rep.errors.push('第 ' + r + ' 轮 L9B 不是 3 个小人：' + row.kids);
      if (row.optsN !== 0) rep.errors.push('第 ' + r + ' 轮 L9B 不该有选项栏');
      row.audioOk = B_KEY[q.l9target] === q.audio;
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L9B 语音与目标不符：' + q.audio + ' target=' + q.l9target);
      row.semanticOk = !!q.l9kids && q.l9kids[q.correct] === q.l9target;
      if (!row.semanticOk) rep.errors.push('第 ' + r + ' 轮 L9B 目标与小人不符：' + JSON.stringify(q.l9kids));
      row.uniqueWorn = new Set(row.worns || []).size === 3;
      if (!row.uniqueWorn) rep.errors.push('第 ' + r + ' 轮 L9B 三个小人穿的东西重复：' + JSON.stringify(row.worns));
    }
    if (q.type === 'L9C') {
      row.thumb = await ev('!!document.querySelector("#askDisplay .l9-thumb")');
      row.model = await ev('(function(){ var c = document.querySelector("#askDisplay .l9-kidcard"); return c ? c.dataset.worn : null; })()');
      row.optsN = await ev('document.querySelectorAll("#options .option[data-drag]").length');
      if (row.thumb !== true) rep.errors.push('第 ' + r + ' 轮 L9C 缺巨大👍');
      if (row.optsN !== 0) rep.errors.push('第 ' + r + ' 轮 L9C 不该有选项栏');
      if (row.model !== q.l9item) rep.errors.push('第 ' + r + ' 轮 L9C 示范小人穿着不符：' + row.model + ' != ' + q.l9item);
      row.audioOk = C_KEYS.indexOf(q.audio) >= 0;
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L9C 语音不在预期：' + q.audio);
      row.btnGeom = await thumbGeom();
      var okSize = (H >= W) ? (row.btnGeom && row.btnGeom.vw >= 44) : (row.btnGeom && row.btnGeom.px >= 110);
      if (!okSize) rep.errors.push('第 ' + r + ' 轮 L9C 大按钮不够大（' + JSON.stringify(row.btnGeom) + '）');
    }

    if (!seenShot[q.type]) {
      seenShot[q.type] = 1;
      await sleep(300);
      row.overflow = await overflow();
      await shot(TAG + '-q-' + q.type + '.png');
    }

    // 答错：A 把错衣物拖到小人身上 / B 点错小人
    if (q.type !== 'L9C' && !wrongTested[q.type]) {
      wrongTested[q.type] = true;
      let did = false;
      if (q.type === 'L9A') {
        const kr = await rectOf('#askDisplay #l9-kid');
        if (kr) did = await dragTo('#options .option[data-idx="' + ((q.correct + 1) % 3) + '"]', kr.cx, kr.cy);
      } else {
        did = await tap('#askDisplay .l9-kidrow .l9-kidcard[data-idx="' + ((q.correct + 1) % 3) + '"]');
      }
      if (did) {
        await sleep(1100);
        const after = await ev('Game.snapshot()');
        row.wrongPick = { advanced: after.round !== r };
        if (row.wrongPick.advanced) rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 答错却判过了');
        await sleep(1700);
        snap = await ev('Game.snapshot()'); q = snap.question;
      }
    }

    const before = await ev('Game.round');
    const starsBefore = await ev('Game.stars');
    const ct = Date.now();
    if (q.type === 'L9A') {
      const kr = await rectOf('#askDisplay #l9-kid');
      // 首轮：故意落在卡片左边缘外 10%（热区外扩 14%，落偏也算命中 §二.11）；之后落中心
      if (!hotzoneTested && kr) {
        hotzoneTested = true;
        row.hotzone = true;
        await dragTo('#options .option[data-idx="' + q.correct + '"]', kr.x - kr.w * 0.10, kr.cy);
      } else if (kr) {
        await dragTo('#options .option[data-idx="' + q.correct + '"]', kr.cx, kr.cy);
      }
      await sleep(120);
      row.wornNow = await ev('(function(){ var c = document.querySelector("#askDisplay #l9-kid"); return c ? c.dataset.worn : null; })()');
      if (row.wornNow !== q.l9item) rep.errors.push('第 ' + r + ' 轮 L9A 衣物没穿到小人身上：' + row.wornNow + ' != ' + q.l9item);
    } else if (q.type === 'L9C') {
      await tap('#askDisplay .l9-thumb');
    } else {
      await tap('#askDisplay .l9-kidrow .l9-kidcard[data-idx="' + q.correct + '"]');
    }
    await sleep(250);
    row.voiceOnCorrect = (await keysBetween(ct, ct + 430)).filter(k => k !== 'unknown');
    const advanced = await wait('Game.round > ' + before + ' || Game.phase === "done"', 4500);
    row.advanced = advanced;
    row.starsDelta = (await ev('Game.stars')) - starsBefore;
    if (r === 1) row.overflow = await overflow();
    if (!advanced) rep.errors.push('第 ' + r + ' 轮没有推进（' + q.type + '）');
    if (row.voiceOnCorrect.length) rep.errors.push('第 ' + r + ' 轮答对后播放了语音：' + row.voiceOnCorrect.join(','));
    if (row.starsDelta !== 1) rep.errors.push('第 ' + r + ' 轮星星未 +1（' + row.starsDelta + '）');
    rep.rounds.push(row);
    await sleep(180);
  }

  // ---------- 3) 通关（第 9 岛第 1 关，非岛末关 → 不升小旗） ----------
  await sleep(600);
  rep.checks.done = {
    phase: await ev('Game.phase'), stars: await ev('Game.stars'),
    viewDone: await ev('!document.getElementById("viewDone").hidden'),
    grand: await ev('document.getElementById("viewDone").classList.contains("grand")'),
    cleared: await ev('!!Game.progress.cleared["9-1"]'),
    unlockedLevel: await ev('Game.progress.unlockedLevel[9]'),
    unlockedIsland: await ev('Game.progress.unlockedIsland'),
    flag: await ev('!!document.querySelector(".stage .island-flag")')
  };
  await sleep(700);
  await shot(TAG + '-done.png');
  if (rep.checks.done.grand !== false) rep.errors.push('第 9 岛第 1 关不该走 grand 模式');
  if (rep.checks.done.flag !== false) rep.errors.push('第 9 岛第 1 关不该升起岛屿小旗');

  // ---------- 4) 视觉断言 ----------
  const scan = () => ev(`(function(){
    var bad = []; var txt = document.body.innerText || '';
    var m = txt.match(/[A-Za-z]+/g); if (m) bad.push('innerText:' + m.join(','));
    var labs = [];
    Array.prototype.forEach.call(document.querySelectorAll('[aria-label]'), function(n){
      var v = n.getAttribute('aria-label') || ''; if (/[A-Za-z]/.test(v)) labs.push(v);
    });
    if (labs.length) bad.push('aria:' + labs.join('|'));
    return bad;
  })()`);
  rep.checks.englishDone = await scan();
  rep.checks.types = seenType;

  await ev('Game.backToMap()'); await sleep(400);
  rep.checks.englishMap = await scan();
  rep.checks.mapAfter = await ev(`(function(){
    var c9 = document.querySelector('.island[data-island="9"]');
    var c10 = document.querySelector('.island[data-island="10"]');
    return { island9Unlocked: c9.classList.contains('unlocked'),
             island9HasIcon: !!c9.querySelector('.icon svg, .icon img'),
             island9Cleared: c9.classList.contains('cleared'),
             island10Unlocked: c10 ? c10.classList.contains('unlocked') : null };
  })()`);
  await shot(TAG + '-map-after.png');

  await ev('Game.openIsland(9)'); await sleep(300);
  rep.checks.englishIsland = await scan();
  rep.checks.islandAfter = await ev(`(function(){
    var n1 = document.querySelector('.node[data-level="1"]');
    var n2 = document.querySelector('.node[data-level="2"]');
    return { node1Done: n1.classList.contains('done'), node2Playable: n2.classList.contains('playable'),
             unlockedIsland: Game.progress.unlockedIsland };
  })()`);
  await shot(TAG + '-island-after.png');

  console.log(JSON.stringify(rep, null, 2));

  const sigOk = rep.tutorial.every(s => s.sigOk);
  const noOverflow = rep.tutorial.every(s => !s.overflow ||
    (s.overflow.sw <= s.overflow.iw + 1 && s.overflow.sh <= s.overflow.ih + 1 && s.overflow.cut.length === 0 && s.overflow.zero.length === 0));
  const audioOk = rep.tutorial.every(s => s.audioOk);
  const demoOk = rep.tutorial.filter(s => s.demo).every(s =>
    s.tapShown === true && s.autoAdvanced === false && s.advanced === true &&
    s.wornAfter === s.before.concat([s.add]).join(',') && s.garmentDrawn > 0);
  const cardsOk = rep.tutorial.filter(s => s.cards).every(s => s.cards === 4 && s.glowOk === true);
  const putOk = rep.tutorial.filter(s => s.put).every(s =>
    s.items === s.put.items.length && s.targetItem === true && s.advanced === true &&
    s.wornEnd === s.put.before.concat([s.put.add]).join(','));
  const hintOk = rep.tutorial.filter(s => s.put).every(s => s.hintEarly !== true && s.hintLater === true && s.hintGeom && s.hintGeom.near === true);
  const putWrongOk = rep.tutorial.filter(s => s.put).every(s => s.wrongAgain.indexOf('again') >= 0 && s.wrongAdvanced === false);
  const outOk = rep.tutorial.filter(s => s.out).every(s => s.ended === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1 && s.voiceOnCorrect.length === 0);
  const semOk = rep.rounds.every(s => (s.type === 'L9C') || s.semanticOk === true);
  const ok = rep.errors.length === 0 && sigOk && audioOk && demoOk && cardsOk && putOk && hintOk && putWrongOk &&
    outOk && roundsOk && semOk && noOverflow &&
    rep.rounds.length === 12 && Object.keys(seenType).length === 3 &&
    seenType.L9A === 4 && seenType.L9B === 4 && seenType.L9C === 4 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === false && rep.checks.done.cleared === true &&
    rep.checks.done.unlockedLevel === 2 && rep.checks.done.unlockedIsland === 9 &&
    rep.checks.island.node1Playable === true && rep.checks.island.headIcon === true &&
    /* 9-2 尚未开发：通关 9-1 后只应「解锁到第 2 关」（unlockedLevel=2），但第 2 关还不是可玩关卡 */
    rep.checks.islandAfter.node1Done === true && rep.checks.islandAfter.node2Playable === false &&
    rep.checks.mapAfter.island9Unlocked === true && rep.checks.mapAfter.island9HasIcon === true &&
    rep.checks.mapAfter.island9Cleared === false && rep.checks.mapAfter.island10Unlocked === false &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0 && rep.checks.englishIsland.length === 0 &&
    rep.checks.outro.ended === true;
  console.log('\nPROBE_' + (ok ? 'PASS' : 'FAIL') + ' sigOk=' + sigOk + ' audioOk=' + audioOk + ' demoOk=' + demoOk +
    ' cardsOk=' + cardsOk + ' putOk=' + putOk + ' hintOk=' + hintOk + ' putWrongOk=' + putWrongOk + ' outOk=' + outOk +
    ' roundsOk=' + roundsOk + ' semOk=' + semOk + ' noOverflow=' + noOverflow +
    ' steps=' + rep.checks.outro.totalSteps + ' types=' + JSON.stringify(seenType) +
    ' stars=' + rep.checks.done.stars + ' grand=' + rep.checks.done.grand +
    ' cleared=' + rep.checks.done.cleared + ' unlockedLevel=' + rep.checks.done.unlockedLevel +
    ' unlockedIsland=' + rep.checks.done.unlockedIsland);
  finish(ok ? 0 : 1);
})().catch(e => { console.error('PROBE_ERROR', e); finish(2); });
