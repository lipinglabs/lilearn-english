// 第 9 岛第 2 关（L9-W2，穿脱动作 Put on / Take off）专项测试
//   1) 解锁链：1–7 全通 + 8-1~8-5 + 9-1 通关 → 9-2 可玩（未通 9-1 前锁定）。
//   2) 教学 10 环节：Put on 2 演示 + 1 互动 / Take off 2 演示 + 1 互动 / 再 2 演示 + 1 互动 / 过渡；
//      演示语音播完定格、必须点屏幕才推进（§三.14）；互动 4 秒小手（§二.12）；
//      **双向拖拽容错**：拖错方向 / 拖到空白处 → 不判错、不消失、不推进（§二.11）。
//   3) 三题型：A 身上穿着 → 拖回物品栏 / B 物品栏 → 拖到身上 / C TPR（👍 永远判对）。
//   4) 12 轮（4/4/4）：答对无人声、stars=12、cleared['9-2']、unlockedLevel[9]=3、grand=false。
//   5) 视觉：无英文字母、双视口无溢出、无零尺寸。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'l92';
const PORT = 9795 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));

const A_KEY = { hat: 'l92_a_hat', shoes: 'l92_a_shoes', coat: 'l92_a_coat', pants: 'l92_a_pants' };
const B_KEY = { hat: 'l92_b_hat', shoes: 'l92_b_shoes', coat: 'l92_b_coat', pants: 'l92_b_pants' };
const C_KEYS = ['l92_c_on_hat', 'l92_c_off_hat', 'l92_c_on_coat', 'l92_c_off_coat'];

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-l92-' + Date.now()),
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
        var s = document.querySelector('.l92-stage');
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
  /* 从一个元素拖到坐标 */
  const drag = async (fromSel, tx, ty) => {
    const a = await rectOf(fromSel);
    if (!a) return false;
    await mouse('mousePressed', a.cx, a.cy, 1); await sleep(50);
    for (let k = 1; k <= 8; k++) { await mouse('mouseMoved', a.cx + (tx - a.cx) * k / 8, a.cy + (ty - a.cy) * k / 8, 1); await sleep(22); }
    await mouse('mouseReleased', tx, ty, 0); await sleep(120);
    return true;
  };
  /* 拖到另一个元素的中心 */
  const dragTo = async (fromSel, toSel) => {
    const b = await rectOf(toSel);
    if (!b) return false;
    return drag(fromSel, b.cx, b.cy);
  };
  const thumbGeom = () => ev(`(function(){
    var b = document.querySelector('#askDisplay .l92-thumb');
    if (!b) return null;
    var r = b.getBoundingClientRect();
    return { vw: Math.round(r.width / window.innerWidth * 100), px: Math.round(r.width),
             inView: r.right <= window.innerWidth + 1 && r.left >= -1 && r.bottom <= window.innerHeight + 1 && r.top >= -1 };
  })()`);
  const overflow = () => ev(`(function(){
    var de = document.documentElement;
    var cut = [], zero = [];
    Array.prototype.forEach.call(document.querySelectorAll(
      '.l92-kidcard, .l92-tray, .l92-card, .l92-thumb, .l92-stage, .l92-ask, .l92-bstage'), function(n){
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
  const wornOf = () => ev('(function(){ var c = document.querySelector("#askDisplay #l92-kid"); return c ? (c.dataset.worn || "") : null; })()');

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };

  // ---------- 0) 解锁链 ----------
  await ev('Game.resetProgress()');
  await ev('for (var isl = 1; isl <= 7; isl++) { for (var lv = 1; lv <= 5; lv++) Game.markCleared(isl, lv); }');
  await ev('for (var l = 1; l <= 5; l++) Game.markCleared(8, l)');
  await ev('Game.openIsland(9)'); await sleep(300);
  rep.checks.lockedBefore = await ev(`(function(){
    var n2 = document.querySelector('.node[data-level="2"]');
    return { node2Playable: n2 ? n2.classList.contains('playable') : false };
  })()`);
  if (rep.checks.lockedBefore.node2Playable === true) rep.errors.push('未通关 9-1 时 9-2 就能玩');

  await ev('Game.markCleared(9, 1)');
  await ev('Game.openIsland(9)'); await sleep(300);
  rep.checks.unlock = await ev(`(function(){
    var n2 = document.querySelector('.node[data-level="2"]');
    var n1 = document.querySelector('.node[data-level="1"]');
    return { node2Playable: n2 ? n2.classList.contains('playable') : false,
             node1Done: n1 ? n1.classList.contains('done') : false };
  })()`);
  await shot(TAG + '-island.png');
  if (rep.checks.unlock.node2Playable !== true) rep.errors.push('通关 9-1 后 9-2 没有解锁');

  // ---------- 1) 进关 → 教学 ----------
  await ev('document.querySelector(\'.node[data-level="2"]\').click()');
  await sleep(300);
  await ev('document.getElementById("btnStart").click()');

  const STEPS = [
    { n: 'shoesOn1',  sig: 'sid:shoesOn1',  audio: 'l92_t_shoes_on', demo: true, act: 'on',  item: 'shoes', before: [],        shot: 'tut-shoesOn1' },
    { n: 'shoesOn2',  sig: 'sid:shoesOn2',  audio: 'l92_t_shoes_on', demo: true, act: 'on',  item: 'shoes', before: [],        shot: 'tut-shoesOn2' },
    { n: 'shoesPut',  sig: 'sid:shoesPut',  audio: 'l9_t_shoes',     drag: { act: 'on',  item: 'shoes', before: [] },            shot: 'tut-shoesPut' },
    { n: 'hatOff1',   sig: 'sid:hatOff1',   audio: 'l92_t_hat_off',  demo: true, act: 'off', item: 'hat',   before: ['hat'],   shot: 'tut-hatOff1' },
    { n: 'hatOff2',   sig: 'sid:hatOff2',   audio: 'l92_t_hat_off',  demo: true, act: 'off', item: 'hat',   before: ['hat'],   shot: 'tut-hatOff2' },
    { n: 'coatTake',  sig: 'sid:coatTake',  audio: 'l92_t_coat_off', drag: { act: 'off', item: 'coat',  before: ['coat'] },        shot: 'tut-coatTake' },
    { n: 'pantsOff1', sig: 'sid:pantsOff1', audio: 'l92_t_pants_off', demo: true, act: 'off', item: 'pants', before: ['pants'], shot: 'tut-pantsOff1' },
    { n: 'pantsOff2', sig: 'sid:pantsOff2', audio: 'l92_t_pants_off', demo: true, act: 'off', item: 'pants', before: ['pants'], shot: 'tut-pantsOff2' },
    { n: 'pantsTake', sig: 'sid:pantsTake', audio: 'l92_t_pants_take', drag: { act: 'off', item: 'pants', before: ['pants'] },    shot: 'tut-pantsTake' },
    { n: 'out',       sig: 'sid:out',       audio: 'l92_t_out',      out: true, shot: 'tut-out' }
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
    const cat = st.demo ? 'demo' : (st.drag ? 'drag' : 'out');
    const row = { step: st.n, cat: cat, reached: reached, sig: entry ? entry.sig : null, sigOk: !!entry && entry.sig === st.sig };
    if (!row.sigOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）舞台不符：期望 ' + st.sig + '，实际 ' + row.sig);
    if (entry && st.drag) row.hintEarly = await ev(sel('.tut-hint'));

    if (entry) {
      await sleep(180);
      row.audio = (await keysBetween(entry.t - 900, entry.t + 2600)).filter(k => k !== 'unknown');
      row.audioOk = row.audio.indexOf(st.audio) >= 0;
      if (!row.audioOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）语音不符：期望 ' + st.audio + '，实际 ' + row.audio.join(','));
      row.kid = await ev('!!document.querySelector("#askDisplay .l92-stage #l92-kid")');
      if (!st.out && row.kid !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）缺少小人');
      row.tray = await ev('!!document.querySelector("#askDisplay .l92-stage #l92-tray")');
      if (!st.out && row.tray !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）缺少底部物品栏');
      row.wornBefore = await wornOf();
      if (st.before && (row.wornBefore || '') !== st.before.join(',')) {
        rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）初始穿着不符：' + row.wornBefore + ' != ' + st.before.join(','));
      }
      if (st.drag) {
        /* 拖拽起点：穿上 = 物品栏里的卡；脱下 = 身上的可拖层 */
        const fromSel = st.drag.act === 'on'
          ? '#askDisplay .l92-tray .l92-card[data-item="' + st.drag.item + '"]'
          : '#askDisplay .l92-on[data-item="' + st.drag.item + '"]';
        row.fromExists = await ev('!!document.querySelector(' + JSON.stringify(fromSel) + ')');
        if (row.fromExists !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）缺少可拖的衣物：' + fromSel);
      }
    }
    row.overflow = await overflow();
    if (st.shot) { await sleep(80); await shot(TAG + '-' + st.shot + '.png'); }

    // 演示：等「轻点继续」→ 不自动前进 → 点屏幕推进
    if (st.demo) {
      row.tapShown = await wait(sel('.f11-tap'), 6000);
      if (!row.tapShown) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示定格后没有出现「轻点继续」');
      row.wornAfter = await wornOf();
      const want = (st.act === 'on') ? st.before.concat([st.item]).join(',') : st.before.filter(x => x !== st.item).join(',');
      if ((row.wornAfter || '') !== want) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）穿衣结果不对：' + row.wornAfter + ' != ' + want);
      if (st.act === 'off') {
        row.trayHas = await ev('!!document.querySelector(\'#askDisplay .l92-tray .l92-card[data-item="' + st.item + '"]\')');
        if (row.trayHas !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）脱下的衣物没有回到物品栏');
      }
      await sleep(900);
      row.autoAdvanced = (await ev('window.__stageLog.length')) > (foundIdx + 1);
      if (row.autoAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示未点按就自动前进了');
      await tap('#askDisplay .l92-stage');
      row.advanced = await wait('window.__stageLog.length > ' + (foundIdx + 1), 6000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    // 互动：4 秒小手 → 拖错方向 / 拖空白 → 弹回不推进 → 正确拖拽推进
    if (st.drag) {
      row.hintLater = await wait(sel('.tut-hint'), 7000);
      if (row.hintEarly === true || row.hintLater !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手异常');
      const fromSel = st.drag.act === 'on'
        ? '#askDisplay .l92-tray .l92-card[data-item="' + st.drag.item + '"]'
        : '#askDisplay .l92-on[data-item="' + st.drag.item + '"]';
      const before0 = await ev('window.__stageLog.length');

      /* ① 拖错方向：穿上时把卡拖回物品栏 / 脱下时把衣物拖到小人身上 */
      const wrongTarget = st.drag.act === 'on' ? '#askDisplay .l92-tray' : '#askDisplay #l92-kid';
      const ctW = Date.now();
      row.wrongDir = await dragTo(fromSel, wrongTarget);
      await sleep(700);
      row.wrongDirThen = {
        advanced: (await ev('window.__stageLog.length')) > before0,
        stillThere: await ev('!!document.querySelector(' + JSON.stringify(fromSel) + ')'),
        saidAgain: (await keysBetween(ctW - 200, ctW + 1200)).filter(k => k !== 'unknown')
      };
      if (row.wrongDirThen.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖错方向却推进了');
      if (row.wrongDirThen.stillThere !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖错方向后衣物消失了');

      /* ② 拖到空白处：弹回、不判错、不消失 */
      row.blank = await drag(fromSel, Math.round(W / 2), 40);
      await sleep(700);
      row.blankThen = {
        advanced: (await ev('window.__stageLog.length')) > before0,
        stillThere: await ev('!!document.querySelector(' + JSON.stringify(fromSel) + ')'),
        ghostGone: await ev('!document.querySelector(".drag-ghost")')
      };
      if (row.blankThen.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖到空白处却推进了');
      if (row.blankThen.stillThere !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖到空白处后衣物消失了');
      if (row.blankThen.ghostGone !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖拽幽灵没有回收');

      /* ③ 正确拖拽 */
      const okTarget = st.drag.act === 'on' ? '#askDisplay #l92-kid' : '#askDisplay .l92-tray';
      row.dragOk = await dragTo(fromSel, okTarget);
      row.advanced = await wait('window.__stageLog.length > ' + before0 + ' || Game.phase === "asking"', 9000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）正确拖拽后没有推进');
      row.wornEnd = await wornOf();
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
  const seenType = {}; const seenShot = {}; const wrongTested = { L92A: false, L92B: false };

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(400);
    let snap = await ev('Game.snapshot()');
    let q = snap.question;
    if (!q) { rep.errors.push('第 ' + r + ' 轮：答题未开始'); break; }
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, audio: q.audio, item: q.l92item, act: q.l92act };

    if (q.type === 'L92A') {
      row.worn = await wornOf();
      row.trayCards = await ev('document.querySelectorAll("#askDisplay .l92-tray .l92-card").length');
      row.dragLayerOn = await ev('!!document.querySelector("#askDisplay .l92-on[data-drag=\\"item\\"]")');
      if (row.worn !== q.l92item) rep.errors.push('第 ' + r + ' 轮 L92A 小人没穿着目标衣物：' + row.worn + ' != ' + q.l92item);
      if (row.trayCards !== 0) rep.errors.push('第 ' + r + ' 轮 L92A 物品栏应为空：' + row.trayCards);
      if (row.dragLayerOn !== true) rep.errors.push('第 ' + r + ' 轮 L92A 身上的衣物不可拖');
      row.audioOk = A_KEY[q.l92item] === q.audio;
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L92A 语音与衣物不符：' + q.audio + ' item=' + q.l92item);
      if (q.l92act !== 'off') rep.errors.push('第 ' + r + ' 轮 L92A 动作应为 off：' + q.l92act);
    }
    if (q.type === 'L92B') {
      row.cards = await ev('document.querySelectorAll("#askDisplay .l92-tray .l92-card").length');
      row.worn = await wornOf();
      if (row.cards !== 3) rep.errors.push('第 ' + r + ' 轮 L92B 物品栏不是 3 件：' + row.cards);
      if ((row.worn || '') !== '') rep.errors.push('第 ' + r + ' 轮 L92B 小人应为光着：' + row.worn);
      row.audioOk = B_KEY[q.l92item] === q.audio;
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L92B 语音与衣物不符：' + q.audio + ' item=' + q.l92item);
      row.semanticOk = !!q.l92items && q.l92items[q.correct] === q.l92item;
      if (!row.semanticOk) rep.errors.push('第 ' + r + ' 轮 L92B 正确件与目标不符：' + JSON.stringify(q.l92items));
      if (q.l92act !== 'on') rep.errors.push('第 ' + r + ' 轮 L92B 动作应为 on：' + q.l92act);
    }
    if (q.type === 'L92C') {
      row.thumb = await ev('!!document.querySelector("#askDisplay .l92-thumb")');
      row.model = await ev('(function(){ var c = document.querySelector("#askDisplay .l92-kidcard"); return c ? (c.dataset.worn||"") : null; })()');
      if (row.thumb !== true) rep.errors.push('第 ' + r + ' 轮 L92C 缺巨大👍');
      if (row.model !== q.l92item) rep.errors.push('第 ' + r + ' 轮 L92C 示范小人穿着不符：' + row.model + ' != ' + q.l92item);
      row.audioOk = C_KEYS.indexOf(q.audio) >= 0;
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L92C 语音不在预期：' + q.audio);
      row.btnGeom = await thumbGeom();
      var okSize = (H >= W) ? (row.btnGeom && row.btnGeom.vw >= 44) : (row.btnGeom && row.btnGeom.px >= 110);
      if (!okSize) rep.errors.push('第 ' + r + ' 轮 L92C 大按钮不够大（' + JSON.stringify(row.btnGeom) + '）');
    }

    if (!seenShot[q.type]) {
      seenShot[q.type] = 1;
      await sleep(300);
      row.overflow = await overflow();
      await shot(TAG + '-q-' + q.type + '.png');
    }

    // 答错 / 拖错方向
    if (q.type === 'L92A' && !wrongTested.L92A) {
      wrongTested.L92A = true;
      const sigB = q.sig;
      const starsB = await ev('Game.stars');
      await dragTo('#askDisplay .l92-on[data-item="' + q.l92item + '"]', '#askDisplay #l92-kid');
      await sleep(1000);
      const after = await ev('Game.snapshot()');
      row.wrongDir = { advanced: !after.question || after.question.sig !== sigB, starsDelta: (await ev('Game.stars')) - starsB };
      if (row.wrongDir.advanced) rep.errors.push('第 ' + r + ' 轮 L92A 拖错方向却判过了');
      if (row.wrongDir.starsDelta !== 0) rep.errors.push('第 ' + r + ' 轮 L92A 拖错方向却给了星星');
      await sleep(700);
    }
    if (q.type === 'L92B' && !wrongTested.L92B) {
      wrongTested.L92B = true;
      const wrongItem = q.l92items.filter(x => x !== q.l92item)[0];
      const sigB = q.sig;
      const starsB = await ev('Game.stars');
      const ctW = Date.now();
      await dragTo('#askDisplay .l92-tray .l92-card[data-item="' + wrongItem + '"]', '#askDisplay #l92-kid');
      await sleep(1000);
      const after = await ev('Game.snapshot()');
      row.wrongItem = { advanced: !after.question || after.question.sig !== sigB,
        starsDelta: (await ev('Game.stars')) - starsB,
        saidAgain: (await keysBetween(ctW - 200, ctW + 1400)).filter(k => k !== 'unknown') };
      if (row.wrongItem.advanced) rep.errors.push('第 ' + r + ' 轮 L92B 拿错衣物却判过了');
      if (row.wrongItem.starsDelta !== 0) rep.errors.push('第 ' + r + ' 轮 L92B 拿错衣物却给了星星');
      if (row.wrongItem.saidAgain.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 L92B 拿错衣物没播 again');
      await sleep(900);
    }

    // 正确作答
    const before = await ev('Game.round');
    const starsBefore = await ev('Game.stars');
    const ct = Date.now();
    if (q.type === 'L92A') {
      await dragTo('#askDisplay .l92-on[data-item="' + q.l92item + '"]', '#askDisplay .l92-tray');
      await sleep(260);
      row.after = {
        worn: await wornOf(),
        trayCards: await ev('document.querySelectorAll("#askDisplay .l92-tray .l92-card").length')
      };
      if ((row.after.worn || '') !== '') rep.errors.push('第 ' + r + ' 轮 L92A 脱下后仍穿着：' + row.after.worn);
      if (row.after.trayCards < 1) rep.errors.push('第 ' + r + ' 轮 L92A 脱下的衣物没进物品栏');
    } else if (q.type === 'L92B') {
      await dragTo('#askDisplay .l92-tray .l92-card[data-item="' + q.l92item + '"]', '#askDisplay #l92-kid');
      await sleep(260);
      row.after = { worn: await wornOf() };
      if (row.after.worn !== q.l92item) rep.errors.push('第 ' + r + ' 轮 L92B 穿上后穿着不符：' + row.after.worn);
    } else {
      await tap('#askDisplay .l92-thumb');
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

  // ---------- 3) 通关 ----------
  await sleep(600);
  rep.checks.done = {
    phase: await ev('Game.phase'), stars: await ev('Game.stars'),
    viewDone: await ev('!document.getElementById("viewDone").hidden'),
    grand: await ev('document.getElementById("viewDone").classList.contains("grand")'),
    cleared: await ev('!!Game.progress.cleared["9-2"]'),
    unlockedLevel: await ev('Game.progress.unlockedLevel[9]'),
    unlockedIsland: await ev('Game.progress.unlockedIsland'),
    flag: await ev('!!document.querySelector(".stage .island-flag")')
  };
  await sleep(700);
  await shot(TAG + '-done.png');
  if (rep.checks.done.grand !== false) rep.errors.push('9-2 不是岛末关，不该走 grand');
  if (rep.checks.done.flag !== false) rep.errors.push('9-2 不该升起岛屿小旗');

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
  await shot(TAG + '-map-after.png');
  await ev('Game.openIsland(9)'); await sleep(300);
  rep.checks.englishIsland = await scan();
  rep.checks.islandAfter = await ev(`(function(){
    var n2 = document.querySelector('.node[data-level="2"]');
    var n3 = document.querySelector('.node[data-level="3"]');
    return { node2Done: n2.classList.contains('done'),
             node3Playable: n3 ? n3.classList.contains('playable') : null,
             unlockedIsland: Game.progress.unlockedIsland };
  })()`);
  await shot(TAG + '-island-after.png');

  console.log(JSON.stringify(rep, null, 2));

  const sigOk = rep.tutorial.every(s => s.sigOk);
  const noOverflow = rep.tutorial.every(s => !s.overflow ||
    (s.overflow.sw <= s.overflow.iw + 1 && s.overflow.sh <= s.overflow.ih + 1 && s.overflow.cut.length === 0 && s.overflow.zero.length === 0));
  const audioOk = rep.tutorial.every(s => s.audioOk);
  const demoOk = rep.tutorial.filter(s => s.demo).every(s =>
    s.tapShown === true && s.autoAdvanced === false && s.advanced === true && s.tray === true);
  const hintOk = rep.tutorial.filter(s => s.drag).every(s => s.hintEarly !== true && s.hintLater === true);
  const wrongDirOk = rep.tutorial.filter(s => s.drag).every(s =>
    s.wrongDirThen && s.wrongDirThen.advanced === false && s.wrongDirThen.stillThere === true);
  const blankOk = rep.tutorial.filter(s => s.drag).every(s =>
    s.blankThen && s.blankThen.advanced === false && s.blankThen.stillThere === true && s.blankThen.ghostGone === true);
  const dragOk = rep.tutorial.filter(s => s.drag).every(s => s.fromExists === true && s.advanced === true);
  const outOk = rep.tutorial.filter(s => s.out).every(s => s.ended === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1 && s.voiceOnCorrect.length === 0);
  const semOk = rep.rounds.every(s => (s.type === 'L92C') || s.audioOk === true);
  const ok = rep.errors.length === 0 && sigOk && audioOk && demoOk && hintOk && wrongDirOk && blankOk && dragOk &&
    outOk && roundsOk && semOk && noOverflow &&
    rep.rounds.length === 12 && Object.keys(seenType).length === 3 &&
    seenType.L92A === 4 && seenType.L92B === 4 && seenType.L92C === 4 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === false && rep.checks.done.cleared === true &&
    rep.checks.done.unlockedLevel === 3 && rep.checks.done.unlockedIsland === 9 &&
    rep.checks.lockedBefore.node2Playable === false && rep.checks.unlock.node2Playable === true &&
    rep.checks.islandAfter.node2Done === true &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0 && rep.checks.englishIsland.length === 0 &&
    rep.checks.outro.ended === true;
  console.log('\nPROBE_' + (ok ? 'PASS' : 'FAIL') + ' sigOk=' + sigOk + ' audioOk=' + audioOk + ' demoOk=' + demoOk +
    ' hintOk=' + hintOk + ' wrongDirOk=' + wrongDirOk + ' blankOk=' + blankOk + ' dragOk=' + dragOk + ' outOk=' + outOk +
    ' roundsOk=' + roundsOk + ' semOk=' + semOk + ' noOverflow=' + noOverflow +
    ' steps=' + rep.checks.outro.totalSteps + ' types=' + JSON.stringify(seenType) +
    ' stars=' + rep.checks.done.stars + ' grand=' + rep.checks.done.grand +
    ' cleared=' + rep.checks.done.cleared + ' unlockedLevel=' + rep.checks.done.unlockedLevel +
    ' unlockedIsland=' + rep.checks.done.unlockedIsland);
  finish(ok ? 0 : 1);
})().catch(e => { console.error('PROBE_ERROR', e); finish(2); });
