// 第 9 岛第 4 关（L9-W4，找错误 · 捣蛋鬼换装）专项测试
//   1) 解锁链：1–7 全通 + 8-1~8-5 + 9-1 + 9-2 + 9-3 通关 → 9-4 可玩（未通 9-3 前锁定）。
//   2) 教学 9 环节：Shoes 2 演示 + 2 互动 / Pants 2 演示 + 2 互动 / 过渡；
//      演示语音播完定格、必须点屏幕才推进（§三.14）；互动 4 秒小手（§二.12）；
//      拖拽宽容：拖到空白处不判错、不消失、不推进（§二.11）；落到小人身上任意处都算成功。
//   3) 三题型：A 听指令把衣物穿到「错」的部位（拖到小人身上任意处）/ B 听句子找荒诞穿搭图 / C TPR（👍 永远判对）。
//   4) 12 轮（4/4/4）：答对无人声、stars=12、cleared['9-4']、unlockedLevel[9]=5、grand=false。
//   5) 视觉：无英文字母、双视口无溢出、无零尺寸。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'l94';
const PORT = 9805 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));

const A_KEY = { hat: 'l94_a_hat', shoes: 'l94_a_shoes', pants: 'l94_a_pants' };
const B_KEY = { 'hat@foot': 'l94_b_hat', 'shoes@head': 'l94_b_shoes', 'pants@arms': 'l94_b_pants' };
const C_KEYS = ['l94_c_hand', 'l94_c_nose', 'l94_c_jump'];
const SLOT = { hat: 'foot', shoes: 'head', pants: 'arms' };

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-l94-' + Date.now()),
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

  const t0 = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId: t0.targetId, flatten: true });
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
        var s = document.querySelector('.l94-stage');
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
  const drag = async (fromSel, tx, ty) => {
    const a = await rectOf(fromSel);
    if (!a) return false;
    await mouse('mousePressed', a.cx, a.cy, 1); await sleep(50);
    for (let k = 1; k <= 8; k++) { await mouse('mouseMoved', a.cx + (tx - a.cx) * k / 8, a.cy + (ty - a.cy) * k / 8, 1); await sleep(22); }
    await mouse('mouseReleased', tx, ty, 0); await sleep(120);
    return true;
  };
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
      '.l94-kidcard, .l92-tray, .l92-card, .l92-thumb, .l94-stage, .l94-ask, .l92-bstage, .l94-kidrow, .l94-kidbtn'), function(n){
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
  const lookOf = () => ev('(function(){ var c = document.querySelector("#askDisplay #l94-kid"); return c ? (c.dataset.look || "") : null; })()');

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };

  // ---------- 0) 解锁链 ----------
  await ev('Game.resetProgress()');
  await ev('for (var isl = 1; isl <= 7; isl++) { for (var lv = 1; lv <= 5; lv++) Game.markCleared(isl, lv); }');
  await ev('for (var l = 1; l <= 5; l++) Game.markCleared(8, l)');
  await ev('Game.markCleared(9, 1)');
  await ev('Game.markCleared(9, 2)');
  await ev('Game.openIsland(9)'); await sleep(300);
  rep.checks.lockedBefore = await ev(`(function(){
    var n4 = document.querySelector('.node[data-level="4"]');
    return { node4Playable: n4 ? n4.classList.contains('playable') : false };
  })()`);
  if (rep.checks.lockedBefore.node4Playable === true) rep.errors.push('未通关 9-3 时 9-4 就能玩');

  await ev('Game.markCleared(9, 3)');
  await ev('Game.openIsland(9)'); await sleep(300);
  rep.checks.unlock = await ev(`(function(){
    var n4 = document.querySelector('.node[data-level="4"]');
    var n3 = document.querySelector('.node[data-level="3"]');
    return { node4Playable: n4 ? n4.classList.contains('playable') : false,
             node3Done: n3 ? n3.classList.contains('done') : false };
  })()`);
  await shot(TAG + '-island.png');
  if (rep.checks.unlock.node4Playable !== true) rep.errors.push('通关 9-3 后 9-4 没有解锁');

  // ---------- 1) 进关 → 教学 ----------
  await ev('document.querySelector(\'.node[data-level="4"]\').click()');
  await sleep(300);
  await ev('document.getElementById("btnStart").click()');

  const STEPS = [
    { n: 'shoes1',    sig: 'sid:shoes1',    audio: 'l94_t_shoes1',      demo: true, on: 'shoes', before: [],                 tray: ['shoes'],           shot: 'tut-shoes1' },
    { n: 'shoes2',    sig: 'sid:shoes2',    audio: 'l94_t_shoes2',      demo: true, on: 'shoes', before: [],                 tray: ['shoes', 'hat'],    shot: 'tut-shoes2' },
    { n: 'shoesTry1', sig: 'sid:shoesTry1', audio: 'l94_t_shoes_your',  drag: { item: 'shoes', before: [] },                  tray: ['shoes', 'hat'],    shot: 'tut-shoesTry1' },
    { n: 'shoesTry2', sig: 'sid:shoesTry2', audio: 'l94_t_shoes_again', drag: { item: 'shoes', before: [] },                  tray: ['pants', 'shoes'],  shot: 'tut-shoesTry2' },
    { n: 'pants1',    sig: 'sid:pants1',    audio: 'l94_t_pants1',      demo: true, on: 'pants', before: [],                  tray: ['pants'],           shot: 'tut-pants1' },
    { n: 'pants2',    sig: 'sid:pants2',    audio: 'l94_t_pants2',      demo: true, on: 'pants', before: [],                  tray: ['pants', 'shirt'],  shot: 'tut-pants2' },
    { n: 'pantsTry1', sig: 'sid:pantsTry1', audio: 'l94_t_pants_put',   drag: { item: 'pants', before: [] },                   tray: ['pants', 'shirt'],  shot: 'tut-pantsTry1' },
    { n: 'pantsTry2', sig: 'sid:pantsTry2', audio: 'l94_t_pants_again', drag: { item: 'pants', before: [] },                   tray: ['pants', 'hat'],    shot: 'tut-pantsTry2' },
    { n: 'out',       sig: 'sid:out',       audio: 'l94_t_out',         out: true,                 before: ['shoes@head', 'pants@arms'], tray: [], shot: 'tut-out' }
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
      row.kid = await ev('!!document.querySelector("#askDisplay .l94-stage #l94-kid")');
      if (!st.out && row.kid !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）缺少小人');
      row.tray = await ev('!!document.querySelector("#askDisplay .l94-stage #l92-tray")');
      if (!st.out && row.tray !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）缺少底部衣物栏');
      row.cards = await ev('document.querySelectorAll("#askDisplay .l94-stage .l92-card").length');
      if (!st.out && row.cards !== (st.tray ? st.tray.length : 0)) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）衣物栏件数不符：' + row.cards);
    }
    row.overflow = await overflow();
    if (st.shot) { await sleep(80); await shot(TAG + '-' + st.shot + '.png'); }

    if (st.demo) {
      row.tapShown = await wait(sel('.f11-tap'), 6000);
      if (!row.tapShown) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示定格后没有出现「轻点继续」');
      row.lookAfter = await lookOf();
      const want = st.on ? (st.on + '@' + SLOT[st.on]) : '';
      if ((row.lookAfter || '') !== want) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）捣蛋穿衣结果不对：' + row.lookAfter + ' != ' + want);
      await sleep(900);
      row.autoAdvanced = (await ev('window.__stageLog.length')) > (foundIdx + 1);
      if (row.autoAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示未点按就自动前进了');
      await tap('#askDisplay .l94-stage');
      row.advanced = await wait('window.__stageLog.length > ' + (foundIdx + 1), 6000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    if (st.drag) {
      row.hintLater = await wait(sel('.tut-hint'), 7000);
      if (row.hintEarly === true || row.hintLater !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手异常');
      const fromSel = '#askDisplay .l92-tray .l92-card[data-item="' + st.drag.item + '"]';
      const before0 = await ev('window.__stageLog.length');

      /* ① 拖到空白处：弹回、不判错、不消失 */
      row.blank = await drag(fromSel, Math.round(W / 2), 40);
      await sleep(700);
      row.blankThen = {
        advanced: (await ev('window.__stageLog.length')) > before0,
        stillThere: await ev('!!document.querySelector(' + JSON.stringify(fromSel) + ')'),
        ghostGone: await ev('!document.querySelector(".drag-ghost")'),
        look: await lookOf()
      };
      if (row.blankThen.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖到空白处却推进了');
      if (row.blankThen.stillThere !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖到空白处后衣服消失了');
      if (row.blankThen.ghostGone !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖拽幽灵没有回收');
      if ((row.blankThen.look || '') !== '') rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖到空白处却穿上了衣服');

      /* ② 正确拖拽：落到小人身上任意处都算成功 */
      row.dragOk = await dragTo(fromSel, '#askDisplay #l94-kid');
      await sleep(700);
      row.lookEnd = await lookOf();
      row.advanced = await wait('window.__stageLog.length > ' + before0 + ' || Game.phase === "asking"', 9000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）正确拖拽后没有推进');
      const want = st.drag.item + '@' + SLOT[st.drag.item];
      if ((row.lookEnd || '') !== want) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）穿上结果不对：' + row.lookEnd);
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
  const seenType = {}; const seenShot = {}; const wrongTested = { L94A: false, L94B: false };

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(400);
    let snap = await ev('Game.snapshot()');
    let q = snap.question;
    if (!q) { rep.errors.push('第 ' + r + ' 轮：答题未开始'); break; }
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, audio: q.audio, item: q.l94item, looks: q.l94looks, silly: q.l94silly, look: q.l94c };

    if (q.type === 'L94A') {
      row.cards = await ev('document.querySelectorAll("#askDisplay .l92-tray .l92-card").length');
      if (row.cards !== 3) rep.errors.push('第 ' + r + ' 轮 L94A 衣物栏不是 3 件：' + row.cards);
      row.look = await lookOf();
      if ((row.look || '') !== '') rep.errors.push('第 ' + r + ' 轮 L94A 小人一开始就穿着衣服：' + row.look);
      row.audioOk = A_KEY[q.l94item] === q.audio;
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L94A 语音与指令不符：' + q.audio + ' item=' + q.l94item);
    }
    if (q.type === 'L94B') {
      row.btnLooks = await ev('Array.prototype.map.call(document.querySelectorAll("#askDisplay .l94-kidbtn"), function(n){return n.dataset.look;})');
      row.btnCount = row.btnLooks ? row.btnLooks.length : 0;
      if (row.btnCount !== 3) rep.errors.push('第 ' + r + ' 轮 L94B 不是 3 张穿搭图：' + row.btnCount);
      const looksOk = !!row.btnLooks && row.btnLooks.join(',') === q.l94looks.join(',');
      if (!looksOk) rep.errors.push('第 ' + r + ' 轮 L94B 穿搭图与题目不符：' + JSON.stringify(row.btnLooks));
      row.distinct = !!row.btnLooks && new Set(row.btnLooks).size === 3;
      if (!row.distinct) rep.errors.push('第 ' + r + ' 轮 L94B 三张图重复：' + JSON.stringify(row.btnLooks));
      row.audioOk = B_KEY[q.l94silly] === q.audio;
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L94B 语音与目标不符：' + q.audio);
    }
    if (q.type === 'L94C') {
      row.thumb = await ev('!!document.querySelector("#askDisplay .l92-thumb")');
      if (row.thumb !== true) rep.errors.push('第 ' + r + ' 轮 L94C 缺巨大👍');
      row.audioOk = C_KEYS.indexOf(q.audio) >= 0;
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L94C 语音不在预期：' + q.audio);
      row.btnGeom = await thumbGeom();
      var okSize = (H >= W) ? (row.btnGeom && row.btnGeom.vw >= 44) : (row.btnGeom && row.btnGeom.px >= 110);
      if (!okSize) rep.errors.push('第 ' + r + ' 轮 L94C 大按钮不够大（' + JSON.stringify(row.btnGeom) + '）');
    }

    if (!seenShot[q.type]) {
      seenShot[q.type] = 1;
      await sleep(300);
      row.overflow = await overflow();
      await shot(TAG + '-q-' + q.type + '.png');
    }

    // 答错：A 拿错衣服 / B 点错图
    if (q.type === 'L94A' && !wrongTested.L94A) {
      wrongTested.L94A = true;
      const trayItems = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l92-tray .l92-card'), function(n){return n.dataset.item;})");
      const wrongItem = (trayItems || []).filter(x => x !== q.l94item)[0];
      const sigB = q.sig, starsB = await ev('Game.stars'), ctW = Date.now();
      await dragTo('#askDisplay .l92-tray .l92-card[data-item="' + wrongItem + '"]', '#askDisplay #l94-kid');
      await sleep(1000);
      const after = await ev('Game.snapshot()');
      row.wrongItem = {
        advanced: !after.question || after.question.sig !== sigB,
        starsDelta: (await ev('Game.stars')) - starsB,
        saidAgain: (await keysBetween(ctW - 200, ctW + 1400)).filter(k => k !== 'unknown'),
        look: await lookOf()
      };
      if (row.wrongItem.advanced) rep.errors.push('第 ' + r + ' 轮 L94A 拿错衣服却判过了');
      if (row.wrongItem.starsDelta !== 0) rep.errors.push('第 ' + r + ' 轮 L94A 拿错衣服却给了星星');
      if (row.wrongItem.saidAgain.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 L94A 拿错衣服没播 again');
      if ((row.wrongItem.look || '') !== '') rep.errors.push('第 ' + r + ' 轮 L94A 拿错衣服却穿上了');
      await sleep(800);
    }
    if (q.type === 'L94B' && !wrongTested.L94B) {
      wrongTested.L94B = true;
      const wrongIdx = q.l94looks.findIndex((s, i) => i !== q.correct);
      const sigB = q.sig, starsB = await ev('Game.stars');
      await tap('#askDisplay .l94-kidbtn[data-idx="' + wrongIdx + '"]');
      await sleep(1000);
      const after = await ev('Game.snapshot()');
      row.wrongKid = { advanced: !after.question || after.question.sig !== sigB,
        starsDelta: (await ev('Game.stars')) - starsB,
        badClass: await ev('!!document.querySelector("#askDisplay .l94-kidbtn.l94-bad")') };
      if (row.wrongKid.advanced) rep.errors.push('第 ' + r + ' 轮 L94B 点错图却判过了');
      if (row.wrongKid.starsDelta !== 0) rep.errors.push('第 ' + r + ' 轮 L94B 点错图却给了星星');
      await sleep(700);
    }

    // 正确作答
    const before = await ev('Game.round');
    const starsBefore = await ev('Game.stars');
    const ct = Date.now();
    if (q.type === 'L94A') {
      await dragTo('#askDisplay .l92-tray .l92-card[data-item="' + q.l94item + '"]', '#askDisplay #l94-kid');
      await sleep(260);
      row.after = { look: await lookOf() };
      const want = q.l94item + '@' + SLOT[q.l94item];
      if (row.after.look !== want) rep.errors.push('第 ' + r + ' 轮 L94A 穿上后捣蛋穿戴不符：' + row.after.look);
    } else if (q.type === 'L94B') {
      await tap('#askDisplay .l94-kidbtn[data-idx="' + q.correct + '"]');
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
    cleared: await ev('!!Game.progress.cleared["9-4"]'),
    unlockedLevel: await ev('Game.progress.unlockedLevel[9]'),
    unlockedIsland: await ev('Game.progress.unlockedIsland'),
    flag: await ev('!!document.querySelector(".stage .island-flag")')
  };
  await sleep(700);
  await shot(TAG + '-done.png');
  if (rep.checks.done.grand !== false) rep.errors.push('9-4 不是岛末关，不该走 grand');
  if (rep.checks.done.flag !== false) rep.errors.push('9-4 不该升起岛屿小旗');

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
    var n4 = document.querySelector('.node[data-level="4"]');
    var n5 = document.querySelector('.node[data-level="5"]');
    return { node4Done: n4.classList.contains('done'),
             node5Playable: n5 ? n5.classList.contains('playable') : false,
             unlockedIsland: Game.progress.unlockedIsland };
  })()`);
  await shot(TAG + '-island-after.png');

  console.log(JSON.stringify(rep, null, 2));

  const sigOk = rep.tutorial.every(s => s.sigOk);
  const noOverflow = rep.tutorial.every(s => !s.overflow ||
    (s.overflow.sw <= s.overflow.iw + 1 && s.overflow.sh <= s.overflow.ih + 1 && s.overflow.cut.length === 0 && s.overflow.zero.length === 0));
  const audioOk = rep.tutorial.every(s => s.audioOk);
  const demoOk = rep.tutorial.filter(s => s.demo).every(s =>
    s.tapShown === true && s.autoAdvanced === false && s.advanced === true);
  const hintOk = rep.tutorial.filter(s => s.drag).every(s => s.hintEarly !== true && s.hintLater === true);
  const blankOk = rep.tutorial.filter(s => s.drag).every(s =>
    s.blankThen && s.blankThen.advanced === false && s.blankThen.stillThere === true && s.blankThen.ghostGone === true);
  const dragOk = rep.tutorial.filter(s => s.drag).every(s => s.fromExists !== false && s.advanced === true);
  const outOk = rep.tutorial.filter(s => s.out).every(s => s.ended === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1 && s.voiceOnCorrect.length === 0);
  const semOk = rep.rounds.every(s => s.audioOk === true);
  const ok = rep.errors.length === 0 && sigOk && audioOk && demoOk && hintOk && blankOk && dragOk &&
    outOk && roundsOk && semOk && noOverflow &&
    rep.rounds.length === 12 && Object.keys(seenType).length === 3 &&
    seenType.L94A === 4 && seenType.L94B === 4 && seenType.L94C === 4 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === false && rep.checks.done.cleared === true &&
    rep.checks.done.unlockedLevel === 4 && rep.checks.done.unlockedIsland === 9 &&
    rep.checks.lockedBefore.node4Playable === false && rep.checks.unlock.node4Playable === true &&
    rep.checks.islandAfter.node4Done === true &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0 && rep.checks.englishIsland.length === 0 &&
    rep.checks.outro.ended === true;
  console.log('\nPROBE_' + (ok ? 'PASS' : 'FAIL') + ' sigOk=' + sigOk + ' audioOk=' + audioOk + ' demoOk=' + demoOk +
    ' hintOk=' + hintOk + ' blankOk=' + blankOk + ' dragOk=' + dragOk + ' outOk=' + outOk +
    ' roundsOk=' + roundsOk + ' semOk=' + semOk + ' noOverflow=' + noOverflow +
    ' steps=' + rep.checks.outro.totalSteps + ' types=' + JSON.stringify(seenType) +
    ' stars=' + rep.checks.done.stars + ' grand=' + rep.checks.done.grand +
    ' cleared=' + rep.checks.done.cleared + ' unlockedLevel=' + rep.checks.done.unlockedLevel +
    ' unlockedIsland=' + rep.checks.done.unlockedIsland);
  finish(ok ? 0 : 1);
})().catch(e => { console.error('PROBE_ERROR', e); finish(2); });
