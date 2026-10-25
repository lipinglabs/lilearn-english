// 第 8 岛第 3 关（L8-W3，安慰别人 Give him a toy / a hug / candy）专项测试
//   1) 解锁链：第 1–7 岛全通 + 8-1 + 8-2 通关 → 8-3 才可玩。
//   2) 教学 13 环节（3 安抚动作 × 2 演示 + 2 互动 + 过渡）：
//      演示语音播完定格，必须点屏幕才推进（§三.14）；
//      给物品（二选一 / 三选一，4 秒小手指 §二.12，点错 again 不推进）；
//      拥抱（巨大👍确认，§三.12 永远判对、≥44vw）。
//   3) 三题型：A 听音送物品 / B TPR 拥抱（👍 永远判对） / C 听情景纠错（✅/❌）。
//   4) 12 轮（4/4/4）：答对无人声、通关星星=12、8-3 点亮、unlockedLevel[8]=4。
//   5) 视觉：无英文字母（innerText + aria-label）、双视口无溢出、元素无零尺寸。
// 带 LILEARN_URL 则直接跑线上（发布后回归用）。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'h3';
const PORT = 9785 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));

const A_KEY = { toy: 'h3_a_toy', candy: 'h3_a_candy' };
const B_KEYS = ['h3_b_hug', 'h3_b_hug2'];

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-h3-' + Date.now()),
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
        var s = document.querySelector('.h3-stage');
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
  const thumbGeom = () => ev(`(function(){
    var b = document.querySelector('#askDisplay .h3-thumb');
    if (!b) return null;
    var r = b.getBoundingClientRect();
    return { vw: Math.round(r.width / window.innerWidth * 100), px: Math.round(r.width),
             inView: r.right <= window.innerWidth + 1 && r.left >= -1 && r.bottom <= window.innerHeight + 1 && r.top >= -1 };
  })()`);
  const overflow = () => ev(`(function(){
    var de = document.documentElement;
    var cut = [], zero = [];
    Array.prototype.forEach.call(document.querySelectorAll('.h3-baby, .h3-item, .h3-thumb, .h3-scene-card, .h3-stage, .h3-baby-svg, .h3-scene-svg'), function(n){
      var host = n.closest('#viewAsk, #viewDone, #viewStart');
      if (host && host.hidden) return;
      var b = n.getBoundingClientRect();
      if (!b.width) { zero.push((n.className || '?') + ':0'); return; }
      var overH = b.right > window.innerWidth + 1 || b.left < -1;
      var overV = b.bottom > window.innerHeight + 1 || b.top < -1;
      if (overH || overV) cut.push((n.className || '?') + ':' + Math.round(b.left) + ',' + Math.round(b.top) +
        '..' + Math.round(b.right) + ',' + Math.round(b.bottom));
    });
    return { sw: de.scrollWidth, iw: window.innerWidth, sh: de.scrollHeight, ih: window.innerHeight,
             cut: cut.slice(0, 6), zero: zero.slice(0, 6) };
  })()`);

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };

  // ---------- 0) 解锁链：1–7 全通 + 8-1 + 8-2 → 8-3 可玩 ----------
  await ev('Game.resetProgress()');
  rep.checks.unlockBefore = await ev(`(function(){
    return { unlockedIsland: Game.progress.unlockedIsland, is8: Game.progress.unlockedIsland >= 8 };
  })()`);
  if (rep.checks.unlockBefore.is8 !== false) rep.errors.push('未通关却显示第 8 岛已解锁');

  await ev('for (var isl = 1; isl <= 7; isl++) { for (var lv = 1; lv <= 5; lv++) Game.markCleared(isl, lv); }');
  await ev('Game.markCleared(8, 1); Game.markCleared(8, 2)');
  await ev('Game.openIsland(8)');
  await sleep(400);
  rep.checks.unlock = await ev(`(function(){
    var n3 = document.querySelector('.node[data-level="3"]');
    return { node3Playable: n3 ? n3.classList.contains('playable') : false,
             island8HasIcon: !!document.querySelector('#islandHead .big-icon svg, #islandHead .big-icon img'),
             unlockedIsland: Game.progress.unlockedIsland };
  })()`);
  await shot(TAG + '-island.png');
  if (rep.checks.unlock.node3Playable !== true) rep.errors.push('通关 8-2 后第 8 岛第 3 关没有解锁');
  if (rep.checks.unlock.island8HasIcon !== true) rep.errors.push('第 8 岛岛屿图标缺失（要求手写 SVG）');
  if (rep.checks.unlock.unlockedIsland !== 8) rep.errors.push('unlockedIsland 应为 8，实际 ' + rep.checks.unlock.unlockedIsland);

  // ---------- 1) 进关 → 教学 ----------
  await ev('document.querySelector(\'.node[data-level="3"]\').click()');
  await sleep(300);
  await ev('document.getElementById("btnStart").click()');

  const STEPS = [
    { n: 'toy1',      sig: 'sid:toy1',      audio: 'h3_t_toy1',       demo: true, shot: 'tut-toy1' },
    { n: 'toy2',      sig: 'sid:toy2',      audio: 'h3_t_toy2',       demo: true, shot: 'tut-toy2' },
    { n: 'toyGive',   sig: 'sid:toyGive',   audio: 'h3_t_toy_give',   give: { target: 'toy', items: ['toy', 'pepper'] }, shot: 'tut-toyGive' },
    { n: 'toyFind',   sig: 'sid:toyFind',   audio: 'h3_t_toy_find',   give: { target: 'toy', items: ['toy', 'pepper', 'rock'] }, shot: 'tut-toyFind' },
    { n: 'hug1',      sig: 'sid:hug1',      audio: 'h3_t_hug1',       demo: true, shot: 'tut-hug1' },
    { n: 'hug2',      sig: 'sid:hug2',      audio: 'h3_t_hug2',       demo: true, shot: 'tut-hug2' },
    { n: 'hugSelf',   sig: 'sid:hugSelf',   audio: 'h3_t_hug_self',   mimic: true, shot: 'tut-hugSelf' },
    { n: 'hugBaby',   sig: 'sid:hugBaby',   audio: 'h3_t_hug_baby',   mimic: true, shot: 'tut-hugBaby' },
    { n: 'candy1',    sig: 'sid:candy1',    audio: 'h3_t_candy1',     demo: true, shot: 'tut-candy1' },
    { n: 'candy2',    sig: 'sid:candy2',    audio: 'h3_t_candy2',     demo: true, shot: 'tut-candy2' },
    { n: 'candyGive', sig: 'sid:candyGive', audio: 'h3_t_candy_give', give: { target: 'candy', items: ['candy', 'rock'] }, shot: 'tut-candyGive' },
    { n: 'candyFind', sig: 'sid:candyFind', audio: 'h3_t_candy_find', give: { target: 'candy', items: ['candy', 'book', 'rock'] }, shot: 'tut-candyFind' },
    { n: 'out',       sig: 'sid:out',       audio: 'h3_t_out',        out: true,  shot: 'tut-out' }
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
    const row = { step: st.n, reached: reached, sig: entry ? entry.sig : null, sigOk: !!entry && entry.sig === st.sig };
    if (!row.sigOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）舞台不符：期望 ' + st.sig + '，实际 ' + row.sig);
    if (entry && (st.give || st.mimic)) row.hintEarly = await ev(sel('.tut-hint'));

    if (entry) {
      await sleep(180);
      row.audio = (await keysBetween(entry.t - 900, entry.t + 2600)).filter(k => k !== 'unknown');
      row.audioOk = row.audio.indexOf(st.audio) >= 0;
      if (!row.audioOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）语音不符：期望 ' + st.audio + '，实际 ' + row.audio.join(','));
      row.baby = await ev('!!document.querySelector("#askDisplay .h3-stage .h3-baby")');
      if (!st.out && !row.baby) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）缺少婴儿');
      if (st.give) {
        row.itemCount = await ev('document.querySelectorAll("#askDisplay .h3-items .h3-item").length');
        if (row.itemCount !== st.give.items.length) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）物品选项数不符：' + row.itemCount + ' vs ' + st.give.items.length);
        row.targetItem = await ev(`!!document.querySelector('#askDisplay .h3-items .h3-item[data-item="${st.give.target}"]')`);
        if (!row.targetItem) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）缺少正确物品 ' + st.give.target);
      }
      if (st.mimic) {
        row.thumbPresent = await ev('!!document.querySelector("#askDisplay .h3-thumb")');
        if (!row.thumbPresent) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）缺少巨大👍按钮');
      }
    }
    row.overflow = await overflow();
    if (st.shot) { await sleep(80); await shot(TAG + '-' + st.shot + '.png'); }

    // 演示步：等「轻点继续」→ 不自动前进 → 点屏幕推进
    if (st.demo) {
      row.tapShown = await wait(sel('.f11-tap'), 5000);
      if (!row.tapShown) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示定格后没有出现「轻点继续」');
      await sleep(2100);
      row.autoAdvanced = (await ev('window.__stageLog.length')) > (foundIdx + 1);
      if (row.autoAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示未点按就自动前进了');
      await tap('#askDisplay .h3-stage');
      row.advanced = await wait('window.__stageLog.length > ' + (foundIdx + 1), 6000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    // 给物品：4 秒小手指指向目标；点错 again 不推进；点对推进
    if (st.give) {
      row.hintLater = await wait(sel('.tut-hint'), 7000);
      if (row.hintEarly === true || row.hintLater !== true) {
        rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手指异常：early=' + row.hintEarly + ' later=' + row.hintLater);
      }
      row.hintGeom = await ev(`(function(){
        var h = document.querySelector('.tut-hint');
        var tgt = document.querySelector('#askDisplay .h3-items .h3-item[data-item="${st.give.target}"]');
        if (!h || !tgt) return null;
        var tb = tgt.getBoundingClientRect();
        var hb = h.getBoundingClientRect();
        var ex = hb.left + hb.width / 2, ey = hb.top + hb.height;
        var near = ex > tb.left - 16 && ex < tb.right + 16 && ey > tb.top - 28 && ey < tb.bottom + 32;
        return { near: near, stars: Game.stars };
      })()`);
      if (row.hintGeom && row.hintGeom.near !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）小手指没指向正确物品');
      if (row.hintGeom && row.hintGeom.stars !== 0) rep.errors.push('教学阶段不该有星星：' + row.hintGeom.stars);
      await sleep(150);
      const wrongItem = st.give.items.filter(function (x) { return x !== st.give.target; })[0];
      const beforeW = await ev('window.__stageLog.length');
      const ctW = Date.now();
      await tap('#askDisplay .h3-items .h3-item[data-item="' + wrongItem + '"]');
      await sleep(900);
      row.wrongAgain = (await keysBetween(ctW - 100, ctW + 1600)).filter(k => k !== 'unknown');
      row.wrongAdvanced = (await ev('window.__stageLog.length')) > beforeW;
      if (row.wrongAgain.indexOf('again') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错物品没播 again：' + row.wrongAgain.join(','));
      if (row.wrongAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错物品却前进了');
      await sleep(700);
      const beforeC = await ev('window.__stageLog.length');
      await tap('#askDisplay .h3-items .h3-item[data-item="' + st.give.target + '"]');
      row.advanced = await wait('window.__stageLog.length > ' + beforeC + ' || Game.phase === "asking"', 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点对物品后没有推进');
    }

    // 拥抱（👍 永远判对）：4 秒小手指指向按钮 → 点按钮 → great → 推进
    if (st.mimic) {
      row.thumbOn = await wait(sel('#askDisplay .h3-thumb'), 7000);
      if (row.thumbOn !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）大按钮未出现');
      row.btnGeom = await thumbGeom();
      var btnOkSize = (H >= W) ? (row.btnGeom && row.btnGeom.vw >= 44) : (row.btnGeom && row.btnGeom.px >= 110);
      if (!btnOkSize) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）大按钮不够大（' + JSON.stringify(row.btnGeom) + '，§三.12）');
      if (row.btnGeom && row.btnGeom.inView !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）大按钮不在视口内');
      row.hintLater = await wait(sel('.tut-hint'), 7000);
      if (row.hintEarly === true || row.hintLater !== true) {
        rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手指异常：early=' + row.hintEarly + ' later=' + row.hintLater);
      }
      row.hintGeom = await ev(`(function(){
        var h = document.querySelector('.tut-hint');
        var tgt = document.querySelector('#askDisplay .h3-thumb');
        if (!h || !tgt) return null;
        var tb = tgt.getBoundingClientRect();
        var hb = h.getBoundingClientRect();
        var ex = hb.left + hb.width / 2, ey = hb.top + hb.height;
        var near = ex > tb.left - 16 && ex < tb.right + 16 && ey > tb.top - 28 && ey < tb.bottom + 32;
        return { near: near, stars: Game.stars };
      })()`);
      if (row.hintGeom && row.hintGeom.near !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）小手指没指向大按钮');
      if (row.hintGeom && row.hintGeom.stars !== 0) rep.errors.push('教学阶段不该有星星：' + row.hintGeom.stars);
      await sleep(200);
      const before = await ev('window.__stageLog.length');
      const ct = Date.now();
      await tap('#askDisplay .h3-thumb');
      await sleep(1500);
      row.great = (await keysBetween(ct - 200, ct + 2400)).filter(k => k !== 'unknown');
      if (row.great.indexOf('g2_t_great') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按钮后没播鼓励语：' + row.great.join(','));
      row.advanced = await wait('window.__stageLog.length > ' + before + ' || Game.phase === "asking"', 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按钮后没有推进');
    }

    // 过渡步：语音播完进入答题
    if (st.out) {
      row.ended = await wait('Game.phase === "asking"', 10000);
      if (row.ended !== true) rep.errors.push('过渡语播完没有进入答题');
    }
    rep.tutorial.push(row);
    console.log('STEP ' + (i + 1) + ' ' + JSON.stringify(row).slice(0, 460));
  }

  rep.checks.outro = { ended: await wait('Game.phase === "asking"', 20000) };
  await sleep(500);
  rep.checks.outro.totalSteps = await ev('window.__stageLog.length');
  rep.checks.outro.starsInTutorial = await ev('Game.stars');
  rep.checks.errs = await ev('window.__errs.slice(0, 3)');
  if (rep.checks.errs.length) console.log('ERRS ' + JSON.stringify(rep.checks.errs));
  await shot(TAG + '-ask-first.png');

  // ---------- 2) 12 轮答题 ----------
  const seenType = {};
  const seenShot = {};
  const wrongTested = { H3A: false, H3C: false };

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(200);
    let snap = await ev('Game.snapshot()');
    let q = snap.question;
    if (!q) { rep.errors.push('第 ' + r + ' 轮：答题阶段未开始（question 为空，phase=' + snap.phase + '）'); break; }
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, audio: q.audio, target: q.h3target, item: q.h3item, claim: q.h3claim };

    if (q.type === 'H3A') {
      row.baby = await ev('!!document.querySelector("#askDisplay .h3-baby[data-drop=\'baby\']")');
      row.optItems = await ev('document.querySelectorAll("#options .option.h3-opt .slot svg").length');
      if (row.baby !== true) rep.errors.push('第 ' + r + ' 轮 H3A 缺婴儿投放目标');
      if (row.optItems !== 3) rep.errors.push('第 ' + r + ' 轮 H3A 物品选项不是 3 个：' + row.optItems);
      row.audioOk = A_KEY[q.h3target] === q.audio;
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 H3A 语音与目标不符：' + q.audio + ' target=' + q.h3target);
      row.semanticOk = !!q.h3items && q.h3items[q.correct] === q.h3target;
      if (!row.semanticOk) rep.errors.push('第 ' + r + ' 轮 H3A 正确项与目标不符：' + JSON.stringify(q.h3items) + ' target=' + q.h3target);
    }
    if (q.type === 'H3B') {
      row.thumb = await ev('!!document.querySelector("#askDisplay .h3-thumb")');
      row.optItems = await ev('document.querySelectorAll("#options .option[data-drag]").length');
      if (row.thumb !== true) rep.errors.push('第 ' + r + ' 轮 H3B 缺巨大👍按钮');
      if (row.optItems !== 0) rep.errors.push('第 ' + r + ' 轮 H3B 不该有选项栏（' + row.optItems + '）');
      row.audioOk = B_KEYS.indexOf(q.audio) >= 0;
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 H3B 语音不在预期集合：' + q.audio);
    }
    if (q.type === 'H3C') {
      row.sceneCard = await ev('!!document.querySelector("#askDisplay .h3-scene-card")');
      row.optBtns = await ev('document.querySelectorAll("#options .option:not([hidden])").length');
      if (row.sceneCard !== true) rep.errors.push('第 ' + r + ' 轮 H3C 缺情景卡');
      if (row.optBtns !== 2) rep.errors.push('第 ' + r + ' 轮 H3C 对错按钮不是 2 个：' + row.optBtns);
      const wantKey = 'h3_c_' + (q.h3claim || '');
      row.audioOk = q.audios[0] === wantKey && q.audios[1] === 'yesno';
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 H3C 语音与 claim 不符：' + JSON.stringify(q.audios) + ' claim=' + q.h3claim);
      row.truthOk = (q.h3truth === (q.h3claim === q.h3item));
      if (!row.truthOk) rep.errors.push('第 ' + r + ' 轮 H3C truth 与 claim/item 不符：truth=' + q.h3truth + ' claim=' + q.h3claim + ' item=' + q.h3item);
    }

    if (!seenShot[q.type]) {
      seenShot[q.type] = 1;
      await sleep(300);
      row.overflow = await overflow();
      await shot(TAG + '-q-' + q.type + '.png');
    }

    // 每题型首轮做一次「答错不推进」（H3B 无错误分支，跳过）
    if (q.type !== 'H3B' && !wrongTested[q.type]) {
      wrongTested[q.type] = true;
      let did = false;
      if (q.type === 'H3A') {
        const w = (q.correct + 1) % 3;
        if (await tap('#options .option[data-idx="' + w + '"]')) {
          await sleep(150);
          did = await tap('#askDisplay .h3-baby[data-drop="baby"]');
        }
      } else {
        const w = 1 - q.correct;
        did = await tap('#options .option[data-idx="' + w + '"]');
      }
      if (did) {
        await sleep(1100);
        const after = await ev('Game.snapshot()');
        row.wrongPick = { advanced: after.round !== r, stillAsking: after.phase === 'asking' };
        if (row.wrongPick.advanced) rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 答错却判过了');
        await sleep(1700);
        snap = await ev('Game.snapshot()');
        q = snap.question;
      }
    }

    const before = await ev('Game.round');
    const starsBefore = await ev('Game.stars');
    const ct = Date.now();

    if (q.type === 'H3A') {
      await tap('#options .option[data-idx="' + q.correct + '"]');
      await sleep(150);
      await tap('#askDisplay .h3-baby[data-drop="baby"]');
    } else if (q.type === 'H3B') {
      await tap('#askDisplay .h3-thumb');
    } else {
      await tap('#options .option[data-idx="' + q.correct + '"]');
    }

    await sleep(250);
    row.voiceOnCorrect = (await keysBetween(ct, ct + 430)).filter(k => k !== 'unknown');
    const advanced = await wait('Game.round > ' + before + ' || Game.phase === "done"', 4000);
    row.advanced = advanced;
    row.starsDelta = (await ev('Game.stars')) - starsBefore;

    if (r === 1) row.overflow = await overflow();
    if (!advanced) rep.errors.push('第 ' + r + ' 轮没有推进（' + q.type + '）');
    if (row.voiceOnCorrect.length) rep.errors.push('第 ' + r + ' 轮答对后播放了语音：' + row.voiceOnCorrect.join(','));
    if (row.starsDelta !== 1) rep.errors.push('第 ' + r + ' 轮星星未 +1（' + row.starsDelta + '）');
    rep.rounds.push(row);
    await sleep(180);
  }

  // ---------- 3) 通关（普通关：星星=12、8-3 点亮、unlockedLevel[8]=4） ----------
  rep.checks.done = {
    phase: await ev('Game.phase'),
    stars: await ev('Game.stars'),
    viewDone: await ev('!document.getElementById("viewDone").hidden'),
    grand: await ev('document.getElementById("viewDone").classList.contains("grand")'),
    cleared: await ev('!!Game.progress.cleared["8-3"]'),
    unlockedLevel: await ev('Game.progress.unlockedLevel[8]'),
    unlockedIsland: await ev('Game.progress.unlockedIsland')
  };
  rep.checks.done.tail = await ev(`window.__played.slice(-8).map(function(p){
    for (var k in window.VOICE_BANK) if (window.VOICE_BANK[k] === p.src) return k;
    return 'unknown';
  })`);
  await sleep(900);
  await shot(TAG + '-done.png');

  // ---------- 4) 视觉断言 ----------
  const scan = () => ev(`(function(){
    var bad = [];
    var txt = document.body.innerText || '';
    var m = txt.match(/[A-Za-z]+/g);
    if (m) bad.push('innerText:' + m.join(','));
    var labs = [];
    Array.prototype.forEach.call(document.querySelectorAll('[aria-label]'), function(n){
      var v = n.getAttribute('aria-label') || '';
      if (/[A-Za-z]/.test(v)) labs.push(v);
    });
    if (labs.length) bad.push('aria:' + labs.join('|'));
    return bad;
  })()`);
  rep.checks.englishDone = await scan();
  rep.checks.types = seenType;

  await ev('Game.backToMap()'); await sleep(400);
  rep.checks.englishMap = await scan();
  rep.checks.mapAfter = await ev(`(function(){
    var c8 = document.querySelector('.island[data-island="8"]');
    return { island8Unlocked: c8.classList.contains('unlocked'),
             island8HasIcon: !!c8.querySelector('.icon svg, .icon img'),
             island8Cleared: c8.classList.contains('cleared'),
             island9Unlocked: (function(){ var i9 = document.querySelector('.island[data-island="9"]'); return i9 ? i9.classList.contains('unlocked') : false; })() };
  })()`);
  await shot(TAG + '-map-after.png');

  await ev('Game.openIsland(8)'); await sleep(300);
  rep.checks.englishIsland = await scan();
  rep.checks.islandAfter = await ev(`(function(){
    var n1 = document.querySelector('.node[data-level="1"]');
    var n2 = document.querySelector('.node[data-level="2"]');
    var n3 = document.querySelector('.node[data-level="3"]');
    return { node1Done: n1.classList.contains('done'),
             node2Done: n2.classList.contains('done'),
             node3Done: n3.classList.contains('done'),
             unlockedIsland: Game.progress.unlockedIsland };
  })()`);
  await shot(TAG + '-island-after.png');

  console.log(JSON.stringify(rep, null, 2));

  const sigOk = rep.tutorial.every(s => s.sigOk);
  const noOverflow = rep.tutorial.every(s => !s.overflow ||
    (s.overflow.sw <= s.overflow.iw + 1 && s.overflow.sh <= s.overflow.ih + 1 &&
     s.overflow.cut.length === 0 && s.overflow.zero.length === 0));
  const audioOk = rep.tutorial.every(s => s.audioOk);
  const babyOk = rep.tutorial.filter(s => s.step !== 'out').every(s => s.baby === true);
  const giveOk = rep.tutorial.filter(s => s.give).every(s => s.itemCount === s.give.items.length && s.targetItem === true);
  const thumbOk = rep.tutorial.filter(s => s.mimic).every(s => s.thumbPresent === true);
  const hintOk = rep.tutorial.filter(s => s.give || s.mimic).every(s => s.hintEarly !== true && s.hintLater === true && s.hintGeom && s.hintGeom.near === true);
  const demoOk = rep.tutorial.filter(s => s.demo).every(s => s.tapShown === true && s.autoAdvanced === false && s.advanced === true);
  const giveAdvOk = rep.tutorial.filter(s => s.give).every(s => s.wrongAgain.indexOf('again') >= 0 && s.wrongAdvanced === false && s.advanced === true);
  const mimicOk = rep.tutorial.filter(s => s.mimic).every(s => s.thumbOn === true && s.great.indexOf('g2_t_great') >= 0 && s.advanced === true && s.btnGeom && s.btnGeom.inView);
  const outOk = rep.tutorial.filter(s => s.out).every(s => s.ended === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1 && s.voiceOnCorrect.length === 0);
  const semOk = rep.rounds.every(s => s.type !== 'H3A' || s.semanticOk === true) &&
                rep.rounds.every(s => s.type !== 'H3C' || s.truthOk === true);
  const ok = rep.errors.length === 0 && sigOk && audioOk && babyOk && giveOk && thumbOk && hintOk &&
    demoOk && giveAdvOk && mimicOk && outOk && roundsOk && semOk && noOverflow &&
    rep.rounds.length === 12 &&
    Object.keys(seenType).length === 3 && seenType.H3A === 4 && seenType.H3B === 4 && seenType.H3C === 4 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === false && rep.checks.done.cleared === true &&
    rep.checks.done.unlockedLevel === 4 && rep.checks.done.unlockedIsland === 8 &&
    rep.checks.islandAfter.node1Done === true && rep.checks.islandAfter.node2Done === true && rep.checks.islandAfter.node3Done === true &&
    rep.checks.mapAfter.island8Unlocked === true && rep.checks.mapAfter.island8HasIcon === true &&
    rep.checks.mapAfter.island8Cleared === false && rep.checks.mapAfter.island9Unlocked === false &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0 &&
    rep.checks.englishIsland.length === 0 &&
    rep.checks.outro.ended === true;
  console.log('\nPROBE_' + (ok ? 'PASS' : 'FAIL') + ' sigOk=' + sigOk + ' audioOk=' + audioOk + ' babyOk=' + babyOk +
    ' giveOk=' + giveOk + ' thumbOk=' + thumbOk + ' hintOk=' + hintOk + ' demoOk=' + demoOk +
    ' giveAdvOk=' + giveAdvOk + ' mimicOk=' + mimicOk + ' outOk=' + outOk +
    ' roundsOk=' + roundsOk + ' semOk=' + semOk + ' noOverflow=' + noOverflow +
    ' steps=' + rep.checks.outro.totalSteps + ' types=' + JSON.stringify(seenType) +
    ' stars=' + rep.checks.done.stars + ' grand=' + rep.checks.done.grand +
    ' cleared=' + rep.checks.done.cleared + ' unlockedLevel=' + rep.checks.done.unlockedLevel +
    ' unlockedIsland=' + rep.checks.done.unlockedIsland);
  finish(ok ? 0 : 1);
})().catch(e => { console.error('PROBE_ERROR', e); finish(2); });
