// 第 8 岛第 2 关（L8-W2，身体感受 Hungry / Thirsty / Sleepy）专项测试
//   1) 解锁链：第 1–7 岛全通 + 8-1 通关 → 8-2 才可玩。
//   2) 教学 13 环节（3 感受 × 2 演示 + 2 互动 + 过渡）：
//      演示语音播完定格，必须点屏幕才推进（§三.14）；
//      互动 1 送物品（二选一，4 秒小手指 §二.12，点错 again 不推进）；
//      互动 2 找小人（三选一，点错抖 + again）。
//   3) 三题型：A 听音找感受 / B 听音送物品（拖/点） / C 听情景纠错（✅/❌）。
//   4) 12 轮（4/4/4）：答对无人声、通关星星=12、8-2 点亮、unlockedLevel[8]=3。
//   5) 视觉：无英文字母（innerText + aria-label）、双视口无溢出、元素无零尺寸。
// 带 LILEARN_URL 则直接跑线上（发布后回归用）。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'h2';
const PORT = 9783 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));

const A_KEY = { hungry: 'l5w4_a', thirsty: 'h2_t_thirsty_find', sleepy: 'h2_t_sleepy_find' };
const B_KEY = { hungry: 'h2_b_hungry', thirsty: 'h2_b_thirsty', sleepy: 'h2_b_sleepy' };
const NEED = { hungry: 'bread', thirsty: 'water', sleepy: 'pillow' };

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-h2-' + Date.now()),
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
        var s = document.querySelector('.h2-stage');
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
  const overflow = () => ev(`(function(){
    var de = document.documentElement;
    var cut = [], zero = [];
    Array.prototype.forEach.call(document.querySelectorAll('.h2-kid, .h2-mini, .h2-item, .h2-scene-card, .h2-stage, .h2-kid-svg, .h2-scene-svg'), function(n){
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

  // ---------- 0) 解锁链：第 1–7 岛全通 + 8-1 通关 → 8-2 可玩 ----------
  await ev('Game.resetProgress()');
  rep.checks.unlockBefore = await ev(`(function(){
    return { unlockedIsland: Game.progress.unlockedIsland, is8: Game.progress.unlockedIsland >= 8 };
  })()`);
  if (rep.checks.unlockBefore.is8 !== false) rep.errors.push('未通关却显示第 8 岛已解锁');

  await ev('for (var isl = 1; isl <= 7; isl++) { for (var lv = 1; lv <= 5; lv++) Game.markCleared(isl, lv); }');
  await ev('Game.markCleared(8, 1)');   // 先通关 8-1，才有 8-2
  await ev('Game.openIsland(8)');
  await sleep(400);
  rep.checks.unlock = await ev(`(function(){
    var n2 = document.querySelector('.node[data-level="2"]');
    return { node2Playable: n2 ? n2.classList.contains('playable') : false,
             node2Locked: n2 ? n2.classList.contains('locked') : true,
             island8HasIcon: !!document.querySelector('#islandHead .big-icon svg, #islandHead .big-icon img'),
             unlockedIsland: Game.progress.unlockedIsland };
  })()`);
  await shot(TAG + '-island.png');
  if (rep.checks.unlock.node2Playable !== true) rep.errors.push('通关 8-1 后第 8 岛第 2 关没有解锁');
  if (rep.checks.unlock.island8HasIcon !== true) rep.errors.push('第 8 岛岛屿图标缺失（要求手写 SVG）');
  if (rep.checks.unlock.unlockedIsland !== 8) rep.errors.push('通关 7-5 后 unlockedIsland 应为 8，实际 ' + rep.checks.unlock.unlockedIsland);

  // ---------- 1) 进关 → 教学 ----------
  await ev('document.querySelector(\'.node[data-level="2"]\').click()');
  await sleep(300);
  await ev('document.getElementById("btnStart").click()');

  const STEPS = [
    { n: 'hungry1',    sig: 'sid:hungry1',    audio: 'h2_t_hungry1',     demo: true, shot: 'tut-hungry1' },
    { n: 'hungry2',    sig: 'sid:hungry2',    audio: 'h2_t_hungry2',     demo: true, shot: 'tut-hungry2' },
    { n: 'hungryGive', sig: 'sid:hungryGive', audio: 'h2_t_hungry_give', give: 'hungry',  items: ['bread', 'water'],  shot: 'tut-hungryGive' },
    { n: 'hungryFind', sig: 'sid:hungryFind', audio: 'l5w4_a',           find: 'hungry',  shot: 'tut-hungryFind' },
    { n: 'thirsty1',    sig: 'sid:thirsty1',    audio: 'h2_t_thirsty1',     demo: true, shot: 'tut-thirsty1' },
    { n: 'thirsty2',    sig: 'sid:thirsty2',    audio: 'h2_t_thirsty2',     demo: true, shot: 'tut-thirsty2' },
    { n: 'thirstyGive', sig: 'sid:thirstyGive', audio: 'h2_t_thirsty_give', give: 'thirsty', items: ['water', 'pillow'],  shot: 'tut-thirstyGive' },
    { n: 'thirstyFind', sig: 'sid:thirstyFind', audio: 'h2_t_thirsty_find', find: 'thirsty', shot: 'tut-thirstyFind' },
    { n: 'sleepy1',    sig: 'sid:sleepy1',    audio: 'h2_t_sleepy1',     demo: true, shot: 'tut-sleepy1' },
    { n: 'sleepy2',    sig: 'sid:sleepy2',    audio: 'h2_t_sleepy2',     demo: true, shot: 'tut-sleepy2' },
    { n: 'sleepyGive', sig: 'sid:sleepyGive', audio: 'h2_t_sleepy_give', give: 'sleepy',  items: ['pillow', 'bread'], shot: 'tut-sleepyGive' },
    { n: 'sleepyFind', sig: 'sid:sleepyFind', audio: 'h2_t_sleepy_find', find: 'sleepy',  shot: 'tut-sleepyFind' },
    { n: 'out',        sig: 'sid:out',        audio: 'l6w4_t_out',       out: true,   shot: 'tut-out' }
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
    if (entry && (st.give || st.find)) row.hintEarly = await ev(sel('.tut-hint'));

    if (entry) {
      await sleep(180);
      row.audio = (await keysBetween(entry.t - 900, entry.t + 2600)).filter(k => k !== 'unknown');
      row.audioOk = row.audio.indexOf(st.audio) >= 0;
      if (!row.audioOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）语音不符：期望 ' + st.audio + '，实际 ' + row.audio.join(','));
      row.kid = await ev('!!document.querySelector("#askDisplay .h2-stage .h2-kid")');
      if (st.demo && !row.kid) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）缺少小人');
      if (st.give) {
        row.itemCount = await ev('document.querySelectorAll("#askDisplay .h2-items .h2-item").length');
        if (row.itemCount !== 2) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）送物品选项不是 2 个：' + row.itemCount);
        row.targetItem = await ev(`!!document.querySelector('#askDisplay .h2-items .h2-item[data-item="${NEED[st.give]}"]')`);
        if (!row.targetItem) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）缺少正确物品 ' + NEED[st.give]);
      }
      if (st.find) {
        row.minis = await ev('document.querySelectorAll("#askDisplay .h2-grid .h2-mini").length');
        if (row.minis !== 3) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）找小人不是 3 个：' + row.minis);
        row.targetKid = await ev(`!!document.querySelector('#askDisplay .h2-grid .h2-mini[data-state="${st.find}"]')`);
        if (!row.targetKid) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）缺少目标小人 ' + st.find);
      }
    }
    row.overflow = await overflow();
    if (st.shot) { await sleep(80); await shot(TAG + '-' + st.shot + '.png'); }

    // 演示步：等「轻点继续」→ 验证不自动前进 → 点屏幕推进
    if (st.demo) {
      row.tapShown = await wait(sel('.f11-tap'), 5000);
      if (!row.tapShown) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示定格后没有出现「轻点继续」');
      await sleep(2100);
      row.autoAdvanced = (await ev('window.__stageLog.length')) > (foundIdx + 1);
      if (row.autoAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示未点按就自动前进了');
      await tap('#askDisplay .h2-stage');
      row.advanced = await wait('window.__stageLog.length > ' + (foundIdx + 1), 6000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    // 互动 1（送物品）：4 秒小手指指向正确物品；点错 again 不推进；点对推进
    if (st.give) {
      row.hintLater = await wait(sel('.tut-hint'), 7000);
      if (row.hintEarly === true || row.hintLater !== true) {
        rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手指异常：early=' + row.hintEarly + ' later=' + row.hintLater);
      }
      row.hintGeom = await ev(`(function(){
        var h = document.querySelector('.tut-hint');
        var tgt = document.querySelector('#askDisplay .h2-items .h2-item[data-item="${NEED[st.give]}"]');
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
      // 点错物品
      const wrongItem = st.items.filter(function (x) { return x !== NEED[st.give]; })[0];
      const beforeW = await ev('window.__stageLog.length');
      const ctW = Date.now();
      await tap('#askDisplay .h2-items .h2-item[data-item="' + wrongItem + '"]');
      await sleep(900);
      row.wrongAgain = (await keysBetween(ctW - 100, ctW + 1600)).filter(k => k !== 'unknown');
      row.wrongAdvanced = (await ev('window.__stageLog.length')) > beforeW;
      if (row.wrongAgain.indexOf('again') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错物品没播 again：' + row.wrongAgain.join(','));
      if (row.wrongAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错物品却前进了');
      await sleep(700);
      // 点对物品
      const beforeC = await ev('window.__stageLog.length');
      await tap('#askDisplay .h2-items .h2-item[data-item="' + NEED[st.give] + '"]');
      row.advanced = await wait('window.__stageLog.length > ' + beforeC + ' || Game.phase === "asking"', 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点对物品后没有推进');
    }

    // 互动 2（找小人）：4 秒小手指；点错 again 不推进；点对推进
    if (st.find) {
      row.hintLater = await wait(sel('.tut-hint'), 7000);
      if (row.hintEarly === true || row.hintLater !== true) {
        rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手指异常：early=' + row.hintEarly + ' later=' + row.hintLater);
      }
      row.hintGeom = await ev(`(function(){
        var h = document.querySelector('.tut-hint');
        var tgt = document.querySelector('#askDisplay .h2-grid .h2-mini[data-state="${st.find}"]');
        if (!h || !tgt) return null;
        var tb = tgt.getBoundingClientRect();
        var hb = h.getBoundingClientRect();
        var ex = hb.left + hb.width / 2, ey = hb.top + hb.height;
        var near = ex > tb.left - 16 && ex < tb.right + 16 && ey > tb.top - 28 && ey < tb.bottom + 32;
        return { near: near, stars: Game.stars };
      })()`);
      if (row.hintGeom && row.hintGeom.near !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）小手指没指向目标小人');
      await sleep(150);
      const wrongSel = await ev(`(function(){
        var dom = document.querySelectorAll('#askDisplay .h2-grid .h2-mini');
        for (var i = 0; i < dom.length; i++) {
          if (dom[i].dataset.state !== ${JSON.stringify(st.find)}) return '#askDisplay .h2-grid .h2-mini[data-idx="' + dom[i].dataset.idx + '"]';
        }
        return null;
      })()`);
      if (wrongSel) {
        const beforeW = await ev('window.__stageLog.length');
        const ctW = Date.now();
        await tap(wrongSel);
        await sleep(900);
        row.wrongAgain = (await keysBetween(ctW - 100, ctW + 1600)).filter(k => k !== 'unknown');
        row.wrongAdvanced = (await ev('window.__stageLog.length')) > beforeW;
        if (row.wrongAgain.indexOf('again') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错小人没播 again：' + row.wrongAgain.join(','));
        if (row.wrongAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错小人却前进了');
        await sleep(800);
      }
      const beforeC = await ev('window.__stageLog.length');
      await tap('#askDisplay .h2-grid .h2-mini[data-state="' + st.find + '"]');
      row.advanced = await wait('window.__stageLog.length > ' + beforeC + ' || Game.phase === "asking"', 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点目标小人后没有推进');
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
  const wrongTested = { H2A: false, H2B: false, H2C: false };

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(200);
    let snap = await ev('Game.snapshot()');
    let q = snap.question;
    if (!q) { rep.errors.push('第 ' + r + ' 轮：答题阶段未开始（question 为空，phase=' + snap.phase + '）'); break; }
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, audio: q.audio, state: q.h2state };

    if (q.type === 'H2A') {
      row.minis = await ev('document.querySelectorAll("#askDisplay .h2-grid .h2-mini").length');
      row.optsN = await ev('document.querySelectorAll("#options .option[data-drag]").length');
      if (row.minis !== 3) rep.errors.push('第 ' + r + ' 轮 H2A 不是 3 个小人：' + row.minis);
      if (row.optsN !== 0) rep.errors.push('第 ' + r + ' 轮 H2A 不该有选项栏（' + row.optsN + '）');
      row.audioOk = A_KEY[q.h2state] === q.audio;
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 H2A 语音与感受不符：' + q.audio + ' state=' + q.h2state);
    }
    if (q.type === 'H2B') {
      row.kid = await ev('!!document.querySelector("#askDisplay .h2-kid[data-drop=\'kid\']")');
      row.optItems = await ev('document.querySelectorAll("#options .option.h2-opt .slot svg").length');
      if (row.kid !== true) rep.errors.push('第 ' + r + ' 轮 H2B 缺小人投放目标');
      if (row.optItems !== 3) rep.errors.push('第 ' + r + ' 轮 H2B 物品选项不是 3 个：' + row.optItems);
      row.audioOk = B_KEY[q.h2state] === q.audio;
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 H2B 语音与感受不符：' + q.audio + ' state=' + q.h2state);
      row.semanticOk = !!q.h2items && q.h2items[q.correct] === NEED[q.h2state];
      if (!row.semanticOk) rep.errors.push('第 ' + r + ' 轮 H2B 正确物品与感受不匹配：' + JSON.stringify(q.h2items) + ' state=' + q.h2state);
    }
    if (q.type === 'H2C') {
      row.sceneCard = await ev('!!document.querySelector("#askDisplay .h2-scene-card")');
      row.optBtns = await ev('document.querySelectorAll("#options .option:not([hidden])").length');
      if (row.sceneCard !== true) rep.errors.push('第 ' + r + ' 轮 H2C 缺情景卡');
      if (row.optBtns !== 2) rep.errors.push('第 ' + r + ' 轮 H2C 对错按钮不是 2 个：' + row.optBtns);
      const wantKey = 'h2_c_' + (q.h2claim || '');
      row.audioOk = q.audios[0] === wantKey && q.audios[1] === 'yesno';
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 H2C 语音与 claim 不符：' + JSON.stringify(q.audios) + ' claim=' + q.h2claim);
      row.truthOk = (q.truth === (q.h2claim === q.h2state));
      if (!row.truthOk) rep.errors.push('第 ' + r + ' 轮 H2C truth 与 claim/state 不符：truth=' + q.truth + ' claim=' + q.h2claim + ' state=' + q.h2state);
      row.itemOk = (q.h2item === NEED[q.h2state]);
      if (!row.itemOk) rep.errors.push('第 ' + r + ' 轮 H2C 场景物品与画面感受不符：' + q.h2item + ' state=' + q.h2state);
    }

    if (!seenShot[q.type]) {
      seenShot[q.type] = 1;
      await sleep(300);
      row.overflow = await overflow();
      await shot(TAG + '-q-' + q.type + '.png');
    }

    // 每种题型第一轮做一次「答错不推进」测试
    if (!wrongTested[q.type]) {
      wrongTested[q.type] = true;
      let did = false;
      if (q.type === 'H2A') {
        const w = (q.correct + 1) % 3;
        did = await tap('#askDisplay .h2-grid .h2-mini[data-idx="' + w + '"]');
      } else if (q.type === 'H2B') {
        const w = (q.correct + 1) % 3;
        if (await tap('#options .option[data-idx="' + w + '"]')) {
          await sleep(150);
          did = await tap('#askDisplay .h2-kid[data-drop="kid"]');
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

    if (q.type === 'H2A') {
      await tap('#askDisplay .h2-grid .h2-mini[data-idx="' + q.correct + '"]');
    } else if (q.type === 'H2B') {
      await tap('#options .option[data-idx="' + q.correct + '"]');
      await sleep(150);
      await tap('#askDisplay .h2-kid[data-drop="kid"]');
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

  // ---------- 3) 通关（普通关：星星=12、8-2 点亮、unlockedLevel[8]=3） ----------
  rep.checks.done = {
    phase: await ev('Game.phase'),
    stars: await ev('Game.stars'),
    viewDone: await ev('!document.getElementById("viewDone").hidden'),
    grand: await ev('document.getElementById("viewDone").classList.contains("grand")'),
    cleared: await ev('!!Game.progress.cleared["8-2"]'),
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
    return { node1Done: n1.classList.contains('done'),
             node2Done: n2.classList.contains('done'),
             unlockedIsland: Game.progress.unlockedIsland };
  })()`);
  await shot(TAG + '-island-after.png');

  console.log(JSON.stringify(rep, null, 2));

  const sigOk = rep.tutorial.every(s => s.sigOk);
  const noOverflow = rep.tutorial.every(s => !s.overflow ||
    (s.overflow.sw <= s.overflow.iw + 1 && s.overflow.sh <= s.overflow.ih + 1 &&
     s.overflow.cut.length === 0 && s.overflow.zero.length === 0));
  const audioOk = rep.tutorial.every(s => s.audioOk);
  const kidOk = rep.tutorial.filter(s => s.demo).every(s => s.kid === true);
  const giveOk = rep.tutorial.filter(s => s.give).every(s => s.itemCount === 2 && s.targetItem === true);
  const findOk = rep.tutorial.filter(s => s.find).every(s => s.minis === 3 && s.targetKid === true);
  const hintOk = rep.tutorial.filter(s => s.give || s.find).every(s => s.hintEarly !== true && s.hintLater === true && s.hintGeom && s.hintGeom.near === true);
  const demoOk = rep.tutorial.filter(s => s.demo).every(s => s.tapShown === true && s.autoAdvanced === false && s.advanced === true);
  const giveAdvOk = rep.tutorial.filter(s => s.give).every(s => s.wrongAgain.indexOf('again') >= 0 && s.wrongAdvanced === false && s.advanced === true);
  const findAdvOk = rep.tutorial.filter(s => s.find).every(s => s.wrongAgain.indexOf('again') >= 0 && s.wrongAdvanced === false && s.advanced === true);
  const outOk = rep.tutorial.filter(s => s.out).every(s => s.ended === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1 && s.voiceOnCorrect.length === 0);
  const semOk = rep.rounds.every(s => s.type !== 'H2B' || s.semanticOk === true) &&
                rep.rounds.every(s => s.type !== 'H2C' || (s.truthOk === true && s.itemOk === true));
  const ok = rep.errors.length === 0 && sigOk && audioOk && kidOk && giveOk && findOk && hintOk &&
    demoOk && giveAdvOk && findAdvOk && outOk && roundsOk && semOk && noOverflow &&
    rep.rounds.length === 12 &&
    Object.keys(seenType).length === 3 && seenType.H2A === 4 && seenType.H2B === 4 && seenType.H2C === 4 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === false && rep.checks.done.cleared === true &&
    rep.checks.done.unlockedLevel === 3 && rep.checks.done.unlockedIsland === 8 &&
    rep.checks.islandAfter.node1Done === true && rep.checks.islandAfter.node2Done === true &&
    rep.checks.mapAfter.island8Unlocked === true && rep.checks.mapAfter.island8HasIcon === true &&
    rep.checks.mapAfter.island8Cleared === false && rep.checks.mapAfter.island9Unlocked === false &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0 &&
    rep.checks.englishIsland.length === 0 &&
    rep.checks.outro.ended === true;
  console.log('\nPROBE_' + (ok ? 'PASS' : 'FAIL') + ' sigOk=' + sigOk + ' audioOk=' + audioOk + ' kidOk=' + kidOk +
    ' giveOk=' + giveOk + ' findOk=' + findOk + ' hintOk=' + hintOk + ' demoOk=' + demoOk +
    ' giveAdvOk=' + giveAdvOk + ' findAdvOk=' + findAdvOk + ' outOk=' + outOk +
    ' roundsOk=' + roundsOk + ' semOk=' + semOk + ' noOverflow=' + noOverflow +
    ' steps=' + rep.checks.outro.totalSteps + ' types=' + JSON.stringify(seenType) +
    ' stars=' + rep.checks.done.stars + ' grand=' + rep.checks.done.grand +
    ' cleared=' + rep.checks.done.cleared + ' unlockedLevel=' + rep.checks.done.unlockedLevel +
    ' unlockedIsland=' + rep.checks.done.unlockedIsland);
  finish(ok ? 0 : 1);
})().catch(e => { console.error('PROBE_ERROR', e); finish(2); });
