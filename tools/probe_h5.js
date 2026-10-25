// 第 8 岛第 5 关（L8-W5，游乐场 · 情绪与感受终极考验 / 变脸魔法师）专项测试
//   1) 解锁链：1–7 全通 + 8-1~8-4 通关 → 8-5 才可玩。
//   2) 教学 10 环节（换面具 2 演示 + 贴面具 1 互动 + 找感受 2 演示 + 找感受 1 互动
//      + 安慰 2 演示 + TPR 1 互动 + 过渡）：演示语音播完定格、必须点屏幕才推进（§三.14）；
//      面具戴上后 .h5-worn 存在且 data-state 变脸；点错 again 且不推进；4 秒小手指向正确目标（§二.12）。
//   3) 三题型：A 听情景戴面具（拖拽 + 热区大一圈）/ B 听长句找小人（4 宫格）/ C TPR（👍 永远判对）。
//   4) 12 轮（4/4/4）：答对无人声、通关星星=12、grand=true、第 8 岛小旗点亮、cleared['8-5']、
//      unlockedLevel[8]=5、unlockedIsland=9、地图第 8 岛 cleared、第 9 岛解锁。
//   5) 视觉：无英文字母（innerText + aria-label）、双视口无溢出、元素无零尺寸。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'h5';
const PORT = 9791 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));

const A_KEY = { sad: 'h5_a_ice', angry: 'h5_a_toy', happy: 'h5_a_gift', sleepy: 'h5_a_bed' };
const B_KEY = { happy: 'h5_b_happy', hungry: 'h5_b_hungry', angry: 'h5_b_angry', sleepy: 'h5_b_sleepy' };
const C_KEYS = ['h5_c_thirsty', 'h5_c_hungry', 'h5_c_sleepy', 'h5_c_happy'];

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-h5-' + Date.now()),
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
        var s = document.querySelector('.h5-stage');
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
    var b = document.querySelector('#askDisplay .h5-thumb') || document.querySelector('#askDisplay .h5-thumb');
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
      '.h5-kidcard, .h5-maskcard, .h5-thumb, .h5-stage, .h5-ask, .h5-bstage, .h5-kidrow, .h5-kidgrid, .option'), function(n){
      var host = n.closest('#viewAsk, #viewDone, #viewStart');
      if (host && host.hidden) return;
      var b = n.getBoundingClientRect();
      if (!b.width) {
        /* 选项栏收起（none/off）时槽位天然 0 宽，不算问题 */
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

  // ---------- 0) 解锁链 ----------
  await ev('Game.resetProgress()');
  await ev('for (var isl = 1; isl <= 7; isl++) { for (var lv = 1; lv <= 5; lv++) Game.markCleared(isl, lv); }');
  await ev('Game.markCleared(8, 1); Game.markCleared(8, 2); Game.markCleared(8, 3); Game.markCleared(8, 4)');
  await ev('Game.openIsland(8)');
  await sleep(400);
  rep.checks.unlock = await ev(`(function(){
    var n5 = document.querySelector('.node[data-level="5"]');
    var n4 = document.querySelector('.node[data-level="4"]');
    return { node5Playable: n5 ? n5.classList.contains('playable') : false,
             node5Locked: n5 ? n5.classList.contains('locked') : null,
             node4Playable: n4 ? n4.classList.contains('playable') : false,
             island8HasIcon: !!document.querySelector('#islandHead .big-icon svg, #islandHead .big-icon img'),
             unlockedIsland: Game.progress.unlockedIsland };
  })()`);
  await shot(TAG + '-island.png');
  if (rep.checks.unlock.node5Playable !== true) rep.errors.push('通关 8-4 后第 8 岛第 5 关没有解锁');
  if (rep.checks.unlock.island8HasIcon !== true) rep.errors.push('第 8 岛岛屿图标缺失');
  if (rep.checks.unlock.unlockedIsland !== 8) rep.errors.push('unlockedIsland 应为 8，实际 ' + rep.checks.unlock.unlockedIsland);

  // ---------- 1) 进关 → 教学 ----------
  await ev('document.querySelector(\'.node[data-level="5"]\').click()');
  await sleep(300);
  await ev('document.getElementById("btnStart").click()');

  const STEPS = [
    { n: 'maskHappy',  sig: 'sid:maskHappy',  audio: 'h5_t_mask1', demo: true, mask: 'happy', shot: 'tut-maskHappy' },
    { n: 'maskSad',    sig: 'sid:maskSad',    audio: 'h5_t_mask2', demo: true, mask: 'sad',   shot: 'tut-maskSad' },
    { n: 'maskTap',    sig: 'sid:maskTap',    audio: 'h5_t_angry_put', maskPick: { target: 'angry', items: ['angry', 'happy'] }, shot: 'tut-maskTap' },
    { n: 'feelHungry', sig: 'sid:feelHungry', audio: 'h5_t_feel1', demo: true, focus: 'hungry', shot: 'tut-feelHungry' },
    { n: 'feelSleepy', sig: 'sid:feelSleepy', audio: 'h5_t_feel2', demo: true, focus: 'sleepy', shot: 'tut-feelSleepy' },
    { n: 'findSleepy', sig: 'sid:findSleepy', audio: 'h5_t_find_sleepy', find: 'sleepy', shot: 'tut-findSleepy' },
    { n: 'hugAsk',     sig: 'sid:hugAsk',     audio: 'h5_t_cry1', demo: true, hug: true, shot: 'tut-hugAsk' },
    { n: 'hugResult',  sig: 'sid:hugResult',  audio: 'h5_t_hug2', demo: true, hugResult: true, shot: 'tut-hugResult' },
    { n: 'tprHappy',   sig: 'sid:tprHappy',   audio: 'h5_t_tpr', mimic: true, shot: 'tut-tprHappy' },
    { n: 'out',        sig: 'sid:out',        audio: 'h5_t_out', out: true, shot: 'tut-out' }
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
    const cat = st.demo ? 'demo' : (st.maskPick ? 'mask' : (st.find ? 'find' : (st.mimic ? 'mimic' : 'out')));
    const row = { step: st.n, cat: cat, reached: reached, sig: entry ? entry.sig : null,
      sigOk: !!entry && entry.sig === st.sig };
    if (!row.sigOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）舞台不符：期望 ' + st.sig + '，实际 ' + row.sig);
    if (entry && (st.maskPick || st.find || st.mimic)) row.hintEarly = await ev(sel('.tut-hint'));

    if (entry) {
      await sleep(180);
      row.audio = (await keysBetween(entry.t - 900, entry.t + 2600)).filter(k => k !== 'unknown');
      row.audioOk = row.audio.indexOf(st.audio) >= 0;
      if (!row.audioOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）语音不符：期望 ' + st.audio + '，实际 ' + row.audio.join(','));
      row.kidCards = await ev('document.querySelectorAll("#askDisplay .h5-stage .h5-kidcard").length');
      if (!st.out && row.kidCards < 1) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）缺少小人卡');
      if (st.mask || st.maskPick) {
        row.masks = await ev('document.querySelectorAll("#askDisplay .h5-stage .h5-maskrow .h5-maskcard").length');
        const wantMasks = st.mask ? 3 : st.maskPick.items.length;
        if (row.masks !== wantMasks) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）面具数不符：' + row.masks + ' != ' + wantMasks);
      }
      if (st.focus) {
        row.focusState = await ev('(function(){ var f = document.querySelector("#askDisplay .h5-stage .h5-kidcard.h5-focus"); return f ? f.dataset.state : null; })()');
        if (row.focusState !== st.focus) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）高亮小人不是 ' + st.focus + '：' + row.focusState);
        row.kidRow = await ev('document.querySelectorAll("#askDisplay .h5-stage .h5-kidrow .h5-kidcard").length');
        if (row.kidRow !== 3) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）感受小人不是 3 个：' + row.kidRow);
      }
      if (st.find) {
        row.kidRow = await ev('document.querySelectorAll("#askDisplay .h5-stage .h5-kidrow .h5-kidcard").length');
        if (row.kidRow !== 3) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）找感受不是 3 个：' + row.kidRow);
        row.targetKid = await ev(`!!document.querySelector('#askDisplay .h5-stage .h5-kidrow .h5-kidcard[data-state="${st.find}"]')`);
        if (!row.targetKid) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）缺少目标小人 ' + st.find);
      }
      if (st.mimic) {
        row.thumbPresent = await ev('!!document.querySelector("#askDisplay .h5-thumb")');
        if (!row.thumbPresent) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）缺少巨大👍按钮');
      }
    }
    row.overflow = await overflow();
    if (st.shot) { await sleep(80); await shot(TAG + '-' + st.shot + '.png'); }

    // 演示步：等「轻点继续」→ 不自动前进 → 点屏幕推进
    if (st.demo) {
      row.tapShown = await wait(sel('.f11-tap'), 6000);
      if (!row.tapShown) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示定格后没有出现「轻点继续」');
      if (st.mask) {
        row.worn = await ev('!!document.querySelector("#askDisplay .h5-stage .h5-worn")');
        row.wornState = await ev('(function(){ var c = document.querySelector("#askDisplay .h5-stage .h5-kidcard"); return c ? c.dataset.state : null; })()');
        if (row.worn !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）面具没有戴到小人脸上');
        if (row.wornState !== st.mask) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）戴面具后没变脸：' + row.wornState);
      }
      if (st.hug) {
        row.hugArms = await ev('!!document.querySelector("#askDisplay .h5-hugarms")');
        row.hugAudio = (await keysBetween(Date.now() - 3000, Date.now() + 300)).filter(k => k !== 'unknown');
        if (row.hugArms !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）没有出现拥抱画面');
        if (row.hugAudio.indexOf('h5_t_hug') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拥抱时没播 h5_t_hug：' + row.hugAudio.join(','));
      }
      if (st.hugResult) {
        row.wornState = await ev('(function(){ var c = document.querySelector("#askDisplay .h5-kidcard"); return c ? c.dataset.state : null; })()');
        if (row.wornState !== 'happy') rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拥抱后小人没变开心：' + row.wornState);
      }
      await sleep(1500);
      row.autoAdvanced = (await ev('window.__stageLog.length')) > (foundIdx + 1);
      if (row.autoAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示未点按就自动前进了');
      await tap('#askDisplay .h5-stage');
      row.advanced = await wait('window.__stageLog.length > ' + (foundIdx + 1), 6000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    // 贴面具：4 秒小手；点错 again；点对推进
    if (st.maskPick) {
      row.hintLater = await wait(sel('.tut-hint'), 7000);
      if (row.hintEarly === true || row.hintLater !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手异常');
      row.hintGeom = await ev(`(function(){
        var h = document.querySelector('.tut-hint');
        var tgt = document.querySelector('#askDisplay .h5-maskrow .h5-maskcard[data-mask="${st.maskPick.target}"]');
        if (!h || !tgt) return null;
        var tb = tgt.getBoundingClientRect(), hb = h.getBoundingClientRect();
        var ex = hb.left + hb.width/2, ey = hb.top + hb.height;
        return { near: ex > tb.left-16 && ex < tb.right+16 && ey > tb.top-28 && ey < tb.bottom+32, stars: Game.stars };
      })()`);
      if (row.hintGeom && row.hintGeom.near !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）小手没指向正确面具');
      if (row.hintGeom && row.hintGeom.stars !== 0) rep.errors.push('教学阶段不该有星星');
      await sleep(150);
      const wrongMask = st.maskPick.items.filter(x => x !== st.maskPick.target)[0];
      const beforeW = await ev('window.__stageLog.length');
      const ctW = Date.now();
      await tap('#askDisplay .h5-maskrow .h5-maskcard[data-mask="' + wrongMask + '"]');
      await sleep(900);
      row.wrongAgain = (await keysBetween(ctW - 100, ctW + 1600)).filter(k => k !== 'unknown');
      row.wrongAdvanced = (await ev('window.__stageLog.length')) > beforeW;
      if (row.wrongAgain.indexOf('again') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错面具没播 again');
      if (row.wrongAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错面具却前进了');
      await sleep(700);
      const beforeC = await ev('window.__stageLog.length');
      await tap('#askDisplay .h5-maskrow .h5-maskcard[data-mask="' + st.maskPick.target + '"]');
      row.advanced = await wait('window.__stageLog.length > ' + beforeC + ' || Game.phase === "asking"', 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点对面具后没有推进');
    }

    // 找感受：4 秒小手；点错 again；点对推进
    if (st.find) {
      row.hintLater = await wait(sel('.tut-hint'), 7000);
      if (row.hintEarly === true || row.hintLater !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手异常');
      row.hintGeom = await ev(`(function(){
        var h = document.querySelector('.tut-hint');
        var tgt = document.querySelector('#askDisplay .h5-kidrow .h5-kidcard[data-state="${st.find}"]');
        if (!h || !tgt) return null;
        var tb = tgt.getBoundingClientRect(), hb = h.getBoundingClientRect();
        var ex = hb.left + hb.width/2, ey = hb.top + hb.height;
        return { near: ex > tb.left-16 && ex < tb.right+16 && ey > tb.top-28 && ey < tb.bottom+32, stars: Game.stars };
      })()`);
      if (row.hintGeom && row.hintGeom.near !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）小手没指向目标小人');
      if (row.hintGeom && row.hintGeom.stars !== 0) rep.errors.push('教学阶段不该有星星');
      await sleep(150);
      const wrongSel = await ev(`(function(){
        var dom = document.querySelectorAll('#askDisplay .h5-kidrow .h5-kidcard');
        for (var i = 0; i < dom.length; i++) if (dom[i].dataset.state !== ${JSON.stringify(st.find)}) return '#askDisplay .h5-kidrow .h5-kidcard[data-idx="' + dom[i].dataset.idx + '"]';
        return null;
      })()`);
      if (wrongSel) {
        const beforeW = await ev('window.__stageLog.length');
        const ctW = Date.now();
        await tap(wrongSel);
        await sleep(900);
        row.wrongAgain = (await keysBetween(ctW - 100, ctW + 1600)).filter(k => k !== 'unknown');
        row.wrongAdvanced = (await ev('window.__stageLog.length')) > beforeW;
        if (row.wrongAgain.indexOf('again') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错小人没播 again');
        if (row.wrongAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错小人却前进了');
        await sleep(800);
      }
      const beforeC = await ev('window.__stageLog.length');
      await tap('#askDisplay .h5-kidrow .h5-kidcard[data-state="' + st.find + '"]');
      row.advanced = await wait('window.__stageLog.length > ' + beforeC + ' || Game.phase === "asking"', 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点目标小人后没有推进');
    }

    // TPR（👍）：4 秒小手；点按钮 → great → 推进
    if (st.mimic) {
      row.thumbOn = await wait(sel('#askDisplay .h5-thumb'), 7000);
      if (row.thumbOn !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）大按钮未出现');
      row.btnGeom = await thumbGeom();
      var btnOkSize = (H >= W) ? (row.btnGeom && row.btnGeom.vw >= 44) : (row.btnGeom && row.btnGeom.px >= 110);
      if (!btnOkSize) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）大按钮不够大（' + JSON.stringify(row.btnGeom) + '）');
      if (row.btnGeom && row.btnGeom.inView !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）大按钮不在视口内');
      row.hintLater = await wait(sel('.tut-hint'), 7000);
      if (row.hintEarly === true || row.hintLater !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手异常');
      row.hintGeom = await ev(`(function(){
        var h = document.querySelector('.tut-hint');
        var tgt = document.querySelector('#askDisplay .h5-thumb');
        if (!h || !tgt) return null;
        var tb = tgt.getBoundingClientRect(), hb = h.getBoundingClientRect();
        var ex = hb.left + hb.width/2, ey = hb.top + hb.height;
        return { near: ex > tb.left-16 && ex < tb.right+16 && ey > tb.top-28 && ey < tb.bottom+32, stars: Game.stars };
      })()`);
      if (row.hintGeom && row.hintGeom.near !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）小手没指向大按钮');
      if (row.hintGeom && row.hintGeom.stars !== 0) rep.errors.push('教学阶段不该有星星');
      await sleep(200);
      const before = await ev('window.__stageLog.length');
      const ct = Date.now();
      await tap('#askDisplay .h5-thumb');
      await sleep(1500);
      row.great = (await keysBetween(ct - 200, ct + 2400)).filter(k => k !== 'unknown');
      if (row.great.indexOf('g2_t_great') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按钮后没播 g2_t_great');
      row.advanced = await wait('window.__stageLog.length > ' + before + ' || Game.phase === "asking"', 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按钮后没有推进');
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
  const seenType = {}; const seenShot = {}; const wrongTested = { H5A: false, H5B: false };
  let hotzoneTested = false;

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(200);
    let snap = await ev('Game.snapshot()');
    let q = snap.question;
    if (!q) { rep.errors.push('第 ' + r + ' 轮：答题未开始'); break; }
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, audio: q.audio, emo: q.h5emo, target: q.h5target };

    if (q.type === 'H5A') {
      row.face = await ev('!!document.querySelector("#askDisplay #h5-face[data-drop=\\"face\\"]")');
      row.optMasks = await ev('document.querySelectorAll("#options .option.h5-opt .slot svg").length');
      row.optDrag = await ev('document.querySelectorAll("#options .option[data-drag]").length');
      if (row.face !== true) rep.errors.push('第 ' + r + ' 轮 H5A 缺无表情小人（拖放目标）');
      if (row.optMasks !== 3) rep.errors.push('第 ' + r + ' 轮 H5A 面具不是 3 张：' + row.optMasks);
      if (row.optDrag !== 3) rep.errors.push('第 ' + r + ' 轮 H5A 可拖选项不是 3 个：' + row.optDrag);
      row.audioOk = A_KEY[q.h5emo] === q.audio;
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 H5A 语音与情绪不符：' + q.audio + ' emo=' + q.h5emo);
      row.semanticOk = !!q.h5masks && q.h5masks[q.correct] === q.h5emo;
      if (!row.semanticOk) rep.errors.push('第 ' + r + ' 轮 H5A 正确面具与情绪不符：' + JSON.stringify(q.h5masks) + ' emo=' + q.h5emo);
    }
    if (q.type === 'H5B') {
      row.kids = await ev('document.querySelectorAll("#askDisplay .h5-kidgrid .h5-kidcard").length');
      row.optsN = await ev('document.querySelectorAll("#options .option[data-drag]").length');
      if (row.kids !== 4) rep.errors.push('第 ' + r + ' 轮 H5B 不是 4 个小人：' + row.kids);
      if (row.optsN !== 0) rep.errors.push('第 ' + r + ' 轮 H5B 不该有选项栏');
      row.audioOk = B_KEY[q.h5target] === q.audio;
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 H5B 语音与目标不符：' + q.audio + ' target=' + q.h5target);
      row.semanticOk = !!q.h5states && q.h5states[q.correct] === q.h5target;
      if (!row.semanticOk) rep.errors.push('第 ' + r + ' 轮 H5B 目标与宫格不符：' + JSON.stringify(q.h5states) + ' target=' + q.h5target);
      row.statesUnique = new Set(q.h5states || []).size === 4;
      if (!row.statesUnique) rep.errors.push('第 ' + r + ' 轮 H5B 四个小人状态重复：' + JSON.stringify(q.h5states));
    }
    if (q.type === 'H5C') {
      row.thumb = await ev('!!document.querySelector("#askDisplay .h5-thumb")');
      row.model = await ev('(function(){ var c = document.querySelector("#askDisplay .h5-kidcard"); return c ? c.dataset.state : null; })()');
      row.optsN = await ev('document.querySelectorAll("#options .option[data-drag]").length');
      if (row.thumb !== true) rep.errors.push('第 ' + r + ' 轮 H5C 缺巨大👍');
      if (row.optsN !== 0) rep.errors.push('第 ' + r + ' 轮 H5C 不该有选项栏');
      if (row.model !== q.h5emo) rep.errors.push('第 ' + r + ' 轮 H5C 示范小人状态不符：' + row.model + ' != ' + q.h5emo);
      row.audioOk = C_KEYS.indexOf(q.audio) >= 0;
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 H5C 语音不在预期：' + q.audio);
    }

    if (!seenShot[q.type]) {
      seenShot[q.type] = 1;
      await sleep(300);
      row.overflow = await overflow();
      await shot(TAG + '-q-' + q.type + '.png');
    }

    // 答错：A 把错面具拖到脸上 / B 点错小人
    if (q.type !== 'H5C' && !wrongTested[q.type]) {
      wrongTested[q.type] = true;
      let did = false;
      if (q.type === 'H5A') {
        const fr = await rectOf('#askDisplay #h5-face');
        const wrongIdx = (q.correct + 1) % 3;
        if (fr) did = await dragTo('#options .option[data-idx="' + wrongIdx + '"]', fr.cx, fr.cy);
      } else {
        did = await tap('#askDisplay .h5-kidgrid .h5-kidcard[data-idx="' + ((q.correct + 1) % 4) + '"]');
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
    if (q.type === 'H5A') {
      const fr = await rectOf('#askDisplay #h5-face');
      // 第一次：故意落在卡片左边缘外 8%（热区比视觉大一圈，§二.11）；之后正常落中心
      if (!hotzoneTested && fr) {
        hotzoneTested = true;
        row.hotzone = true;
        await dragTo('#options .option[data-idx="' + q.correct + '"]', fr.x - fr.w * 0.08, fr.cy);
      } else if (fr) {
        await dragTo('#options .option[data-idx="' + q.correct + '"]', fr.cx, fr.cy);
      }
      await sleep(260);
      row.worn = await ev('(function(){ var c = document.querySelector("#askDisplay #h5-face"); return { worn: !!document.querySelector("#askDisplay .h5-worn"), state: c ? c.dataset.state : null }; })()');
    } else if (q.type === 'H5C') {
      await tap('#askDisplay .h5-thumb');
    } else {
      await tap('#askDisplay .h5-kidgrid .h5-kidcard[data-idx="' + q.correct + '"]');
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
    if (q.type === 'H5A' && row.worn && row.worn.state !== undefined) {
      if (!row.worn.worn || row.worn.state !== q.h5emo) rep.errors.push('第 ' + r + ' 轮 H5A 戴面具后没变脸：' + JSON.stringify(row.worn));
    }
    rep.rounds.push(row);
    await sleep(180);
  }

  // ---------- 3) 通关（第 8 岛结业关） ----------
  await sleep(700);
  rep.checks.done = {
    phase: await ev('Game.phase'), stars: await ev('Game.stars'),
    viewDone: await ev('!document.getElementById("viewDone").hidden'),
    grand: await ev('document.getElementById("viewDone").classList.contains("grand")'),
    cleared: await ev('!!Game.progress.cleared["8-5"]'),
    unlockedLevel: await ev('Game.progress.unlockedLevel[8]'),
    unlockedIsland: await ev('Game.progress.unlockedIsland'),
    flag: await ev(`(function(){
      var f = document.querySelector('.stage .island-flag');
      return { present: !!f, island: f ? f.dataset.island : null, risen: f ? f.classList.contains('rise') : false };
    })()`)
  };
  await sleep(600);
  await shot(TAG + '-done.png');
  if (rep.checks.done.grand !== true) rep.errors.push('第 8 岛第 5 关通关没有走 grand 模式（大彩带 + 小旗）');
  if (rep.checks.done.flag.present !== true) rep.errors.push('通关后没有升起第 8 岛小旗');
  if (rep.checks.done.flag.island !== '8') rep.errors.push('小旗岛号不对：' + rep.checks.done.flag.island);

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
    var c8 = document.querySelector('.island[data-island="8"]');
    var c9 = document.querySelector('.island[data-island="9"]');
    return { island8Unlocked: c8.classList.contains('unlocked'),
             island8HasIcon: !!c8.querySelector('.icon svg, .icon img'),
             island8Cleared: c8.classList.contains('cleared'),
             island9Unlocked: c9 ? c9.classList.contains('unlocked') : null };
  })()`);
  await shot(TAG + '-map-after.png');

  await ev('Game.openIsland(8)'); await sleep(300);
  rep.checks.englishIsland = await scan();
  rep.checks.islandAfter = await ev(`(function(){
    var n5 = document.querySelector('.node[data-level="5"]');
    var n4 = document.querySelector('.node[data-level="4"]');
    return { node4Done: n4.classList.contains('done'), node5Done: n5.classList.contains('done'),
             unlockedIsland: Game.progress.unlockedIsland };
  })()`);
  await shot(TAG + '-island-after.png');

  console.log(JSON.stringify(rep, null, 2));

  const sigOk = rep.tutorial.every(s => s.sigOk);
  const noOverflow = rep.tutorial.every(s => !s.overflow ||
    (s.overflow.sw <= s.overflow.iw + 1 && s.overflow.sh <= s.overflow.ih + 1 && s.overflow.cut.length === 0 && s.overflow.zero.length === 0));
  const audioOk = rep.tutorial.every(s => s.audioOk);
  const maskOk = rep.tutorial.filter(s => s.mask).every(s => s.worn === true && s.wornState === s.mask && s.masks === 3);
  const maskPickOk = rep.tutorial.filter(s => s.maskPick).every(s =>
    s.masks === s.maskPick.items.length && s.wrongAgain.indexOf('again') >= 0 && s.wrongAdvanced === false && s.advanced === true);
  const feelOk = rep.tutorial.filter(s => s.focus).every(s => s.kidRow === 3 && s.focusState === s.focus);
  const findOk = rep.tutorial.filter(s => s.find).every(s =>
    s.kidRow === 3 && s.targetKid === true && s.wrongAgain.indexOf('again') >= 0 && s.wrongAdvanced === false && s.advanced === true);
  const hugOk = rep.tutorial.filter(s => s.hug).every(s => s.hugArms === true && s.hugAudio.indexOf('h5_t_hug') >= 0);
  const hugResOk = rep.tutorial.filter(s => s.hugResult).every(s => s.wornState === 'happy');
  const hintOk = rep.tutorial.filter(s => s.maskPick || s.find || s.mimic).every(s =>
    s.hintEarly !== true && s.hintLater === true && s.hintGeom && s.hintGeom.near === true);
  const demoOk = rep.tutorial.filter(s => s.demo).every(s => s.tapShown === true && s.autoAdvanced === false && s.advanced === true);
  const mimicOk = rep.tutorial.filter(s => s.mimic).every(s =>
    s.thumbOn === true && s.great.indexOf('g2_t_great') >= 0 && s.advanced === true && s.btnGeom && s.btnGeom.inView);
  const outOk = rep.tutorial.filter(s => s.out).every(s => s.ended === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1 && s.voiceOnCorrect.length === 0);
  const semOk = rep.rounds.every(s => (s.type === 'H5C') || s.semanticOk === true);
  const ok = rep.errors.length === 0 && sigOk && audioOk && maskOk && maskPickOk && feelOk && findOk &&
    hugOk && hugResOk && hintOk && demoOk && mimicOk && outOk && roundsOk && semOk && noOverflow &&
    rep.rounds.length === 12 && Object.keys(seenType).length === 3 &&
    seenType.H5A === 4 && seenType.H5B === 4 && seenType.H5C === 4 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === true && rep.checks.done.cleared === true &&
    rep.checks.done.unlockedLevel === 5 && rep.checks.done.unlockedIsland === 9 &&
    rep.checks.done.flag.present === true && rep.checks.done.flag.island === '8' &&
    rep.checks.islandAfter.node4Done === true && rep.checks.islandAfter.node5Done === true &&
    rep.checks.mapAfter.island8Unlocked === true && rep.checks.mapAfter.island8HasIcon === true &&
    rep.checks.mapAfter.island8Cleared === true && rep.checks.mapAfter.island9Unlocked === true &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0 && rep.checks.englishIsland.length === 0 &&
    rep.checks.outro.ended === true;
  console.log('\nPROBE_' + (ok ? 'PASS' : 'FAIL') + ' sigOk=' + sigOk + ' audioOk=' + audioOk + ' maskOk=' + maskOk +
    ' maskPickOk=' + maskPickOk + ' feelOk=' + feelOk + ' findOk=' + findOk + ' hugOk=' + hugOk + ' hugResOk=' + hugResOk +
    ' hintOk=' + hintOk + ' demoOk=' + demoOk + ' mimicOk=' + mimicOk + ' outOk=' + outOk +
    ' roundsOk=' + roundsOk + ' semOk=' + semOk + ' noOverflow=' + noOverflow +
    ' steps=' + rep.checks.outro.totalSteps + ' types=' + JSON.stringify(seenType) +
    ' stars=' + rep.checks.done.stars + ' grand=' + rep.checks.done.grand +
    ' flag=' + JSON.stringify(rep.checks.done.flag) + ' cleared=' + rep.checks.done.cleared +
    ' unlockedLevel=' + rep.checks.done.unlockedLevel + ' unlockedIsland=' + rep.checks.done.unlockedIsland);
  finish(ok ? 0 : 1);
})().catch(e => { console.error('PROBE_ERROR', e); finish(2); });
