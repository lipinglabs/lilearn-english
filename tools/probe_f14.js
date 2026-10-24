// 第 6 岛第 4 关（L6-W4，听指令做家务 Put the [物品] on / in / under the [家具]）专项测试
//   1) 解锁链：第 1–5 岛全通 + 第 6 岛第 1、2、3 关通关 → 第 6 岛第 4 关可玩
//   2) 教学（RULES §三.10 双倍量 + §三.14 点按推进）：书/玩具/球 各 2 演示 + 1 互动 + 过渡 = 10 环节；
//      演示步语音播完定格，必须点屏幕才推进（不点不前进）
//   3) 三题型：A 单指令拖拽（拖正确物品到正确家具）/ B 听句找图（书在床上/球在桌下/玩具在箱子里）/
//      C 多步指令（先放 X 到 Y，再放 X 到 Y，按顺序拖拽）
//   4) 12 轮（A/B/C 各 4）：答对无人声、答错不推进、拖错家具不给过、通关奖励
//   5) 视觉：无英文字母（innerText + aria-label）、当前视口无溢出、物品够大且热区比图形大一圈
// 带 LILEARN_URL 则直接跑线上（发布后回归用）。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'f14';
const PORT = 9705 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));

const A_KEY = {
  'book:bed': 'l6w4_a_book_bed', 'book:table': 'pt_book',
  'toy:box': 'l6w4_a_toy_box', 'ball:table': 'l6w3_c_under_table'
};
const B_KEY = { bookBed: 'l6w4_b_bookbed', ballTable: 'l6w4_b_balltable', toyBox: 'l6w4_b_toybox' };
const C1_KEY = {
  'book:bed': 'l6w4_c1_s1', 'toy:box': 'l6w4_c2_s1', 'ball:table': 'l6w4_c3_s1'
};

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-f14-' + Date.now()),
  '--window-size=' + W + ',' + H, 'about:blank'], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let id = 0; const pend = new Map();

(async () => {
  let v;
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) { v = await r.json(); break; } } catch (e) {}
    await sleep(250);
  }
  const ws = await new Promise((res, rej) => {
    const w = new WebSocket(v.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 1 << 28 });
    w.on('open', () => res(w)); w.on('error', rej);
  });
  ws.on('message', raw => {
    const m = JSON.parse(raw);
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
      window.__stageLog = [];
      var last = null;
      function stageSig(){
        var s = document.querySelector('.f9-stage');
        if (!s) return null;
        var grid = s.querySelector('.f9-grid');
        if (grid) {
          var cards = Array.prototype.map.call(grid.querySelectorAll('.f9-card'), function(n){ return n.dataset.subj; });
          return 'final' + cards.length + ':' + cards.join(',');
        }
        var room = s.querySelector('.f14-room');
        if (!room) return 'noroom';
        var list = Array.prototype.map.call(room.querySelectorAll('.f14-furn'), function(n){
          var on = n.querySelector('.f14-on');
          var name = n.dataset.furn || n.dataset.drop;
          return name + (on ? ':on' : '-');
        });
        var beside = room.querySelectorAll('.f14-beside').length;
        var trayItems = s.querySelectorAll('.f14-tray .f14-item').length;
        if (!list.length) return 'empty';
        return 'room|' + list.join(',') + '|b' + beside + '|t' + trayItems;
      }
      function rec(){
        var sig = stageSig();
        if (!sig || sig === 'empty' || sig === last) return;
        last = sig;
        window.__stageLog.push({ t: Date.now(), sig: sig });
      }
      var mo = new MutationObserver(function(){ setTimeout(rec, 0); });
      window.addEventListener('DOMContentLoaded', function(){ mo.observe(document.body, { childList: true, subtree: true }); rec(); });
    })();
  ` }, sessionId);

  await send('Page.navigate', { url: URL_ }, sessionId);
  const boot = async () => {
    for (let i = 0; i < 600; i++) {
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
  const overflow = () => ev(`(function(){
    var de = document.documentElement;
    var optBar = document.getElementById('options');
    var optShown = !!optBar && !optBar.classList.contains('gone') && !optBar.classList.contains('off');
    var cut = [], zero = [];
    Array.prototype.forEach.call(document.querySelectorAll(
      '.f9-card, .f9-tile, .f14-room, .f14-furn, .f14-tray .f14-item, .f14-scene, .option'), function(n){
      var b = n.getBoundingClientRect();
      if (!b.width) { if ((optShown && !n.hidden) || !n.classList.contains('option')) zero.push((n.className || '?') + ':0'); return; }
      // 横向越界：全部元素都查；纵向越界：只查「可点目标」（家具 / 托盘物品 / 图格），避免容器误报（RULES §三.15）
      var isClick = n.classList.contains('f14-furn') || n.classList.contains('f14-item') || n.classList.contains('f9-tile') || n.classList.contains('f9-card');
      var overH = b.right > window.innerWidth + 1 || b.left < -1;
      var overV = isClick && (b.bottom > window.innerHeight + 1 || b.top < -1);
      if (overH || overV) cut.push(n.className + ':' + Math.round(b.left) + ',' + Math.round(b.top) + '..' + Math.round(b.right) + ',' + Math.round(b.bottom));
      if (n.classList.contains('f14-furn') && b.width < 40) zero.push(n.dataset.furn + ':' + Math.round(b.width));
    });
    return { sw: de.scrollWidth, iw: window.innerWidth, sh: de.scrollHeight, ih: window.innerHeight,
             cut: cut.slice(0, 6), zero: zero.slice(0, 6) };
  })()`);

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };

  // ---------- 0) 解锁链 ----------
  await ev('Game.resetProgress()');
  await ev('for (var isl = 1; isl <= 5; isl++) { for (var lv = 1; lv <= 5; lv++) Game.markCleared(isl, lv); }');
  await ev('Game.markCleared(6, 1)');
  await ev('Game.markCleared(6, 2)');
  await ev('Game.markCleared(6, 3)');
  await ev('Game.openIsland(6)');
  await sleep(300);
  rep.checks.unlock = await ev(`(function(){
    var n4 = document.querySelector('.node[data-level="4"]');
    return { node4Playable: n4.classList.contains('playable'), node4Locked: n4.classList.contains('locked') };
  })()`);
  await shot(TAG + '-island.png');
  if (rep.checks.unlock.node4Playable !== true) rep.errors.push('第 6 岛第 4 关没有亮起（' + JSON.stringify(rep.checks.unlock) + '）');

  // ---------- 1) 进关 → 教学 ----------
  await ev('document.querySelector(\'.node[data-level="4"]\').click()');
  await sleep(300);
  await ev('document.getElementById("btnStart").click()');

  const STEPS = [
    { n: 'book-demo1', sig: 'room|bed-,table-|b1|t0', audio: 'l6w4_t_book1', demo: true, shot: 'tut-book1' },
    { n: 'book-demo2', sig: 'room|bed:on,table-|b0|t0', audio: 'l6w4_t_book2', demo: true, shot: 'tut-book2' },
    { n: 'book-ask',   sig: 'room|bed-,table-|b0|t2', audio: 'l6w4_a_book_bed', item: 'book', wrongFirst: 'table', click: 'bed', shot: 'tut-bookA1' },
    { n: 'toy-demo1',  sig: 'room|box-|b1|t0', audio: 'l6w4_t_toy1', demo: true, shot: 'tut-toy1' },
    { n: 'toy-demo2',  sig: 'room|box:on|b0|t0', audio: 'l6w4_t_toy2', demo: true, shot: 'tut-toy2' },
    { n: 'toy-ask',    sig: 'room|box-,bed-|b0|t1', audio: 'l6w4_a_toy_box', item: 'toy', hint: true, click: 'box', shot: 'tut-toyA2' },
    { n: 'ball-demo1', sig: 'room|table-|b1|t0', audio: 'l6w4_t_ball1', demo: true, shot: 'tut-ball1' },
    { n: 'ball-demo2', sig: 'room|table:on|b0|t0', audio: 'l6w4_t_ball2', demo: true, shot: 'tut-ball2' },
    { n: 'ball-ask',   sig: 'room|bed-,table-,box-|b0|t3', audio: 'l6w3_c_under_table', item: 'ball', wrongFirst: 'bed', click: 'table', shot: 'tut-ballA3' },
    { n: 'outro',      sig: 'final3:bookBed,toyBox,ballTable', audio: 'l6w4_t_out' }
  ];

  for (let i = 1; i < STEPS.length; i++) {
    if (STEPS[i].sig === STEPS[i - 1].sig) throw new Error('教学相邻两步舞台指纹相同：' + STEPS[i].sig + '（' + STEPS[i].n + '）');
  }

  // 教学舞台指纹按「期望签名」匹配，跳过物品落位导致的额外指纹（家具出现 :on 后缀）。
  const findEntry = async (sig, cursor) => ev(`(function(){
    var s = ${JSON.stringify(sig)};
    for (var k = ${cursor}; k < window.__stageLog.length; k++) if (window.__stageLog[k].sig === s) return k;
    return -1;
  })()`);
  let logCursor = 0;
  for (let i = 0; i < STEPS.length; i++) {
    const st = STEPS[i];
    let foundIdx = -1;
    const end = Date.now() + 14000;
    while (Date.now() < end) { foundIdx = await findEntry(st.sig, logCursor); if (foundIdx >= 0) break; await sleep(70); }
    const reached = foundIdx >= 0;
    const entry = reached ? JSON.parse(await ev('JSON.stringify(window.__stageLog[' + foundIdx + '])')) : null;
    if (reached) logCursor = foundIdx + 1;
    const row = { step: st.n, reached: reached, sig: entry ? entry.sig : null, sigOk: !!entry && entry.sig === st.sig };
    if (!row.sigOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）舞台不符：期望 ' + st.sig + '，实际 ' + row.sig);

    if (entry) {
      await sleep(180);
      row.audio = (await keysBetween(entry.t - 900, entry.t + 2600)).filter(k => k !== 'unknown');
      row.audioOk = row.audio.indexOf(st.audio) >= 0;
      if (!row.audioOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）语音不符：期望 ' + st.audio + '，实际 ' + row.audio.join(','));
    }
    if (st.n !== 'outro') row.overflow = await overflow();
    if (st.shot) { await sleep(120); await shot(TAG + '-' + st.shot + '.png'); }

    // 教学互动（错误测试 + 正确推进）：用「轻点（tap）」路径。
    //   先点物品拾起，再点家具。游戏侧 tutPickF14 / 家具 click 都会以 data-drop 字符串判定，可靠。
    //   注意：教学 tutMe 分支里拖拽把 DOM 元素当 furn 与字符串 step.target 比较曾恒为错（已修 resolveF14），这里统一用 tap。
    if (st.wrongFirst) {
      const before = await ev('window.__stageLog.length');
      const wt = Date.now();
      await tap('#askDisplay .f14-tray .f14-item[data-item="' + st.item + '"]');
      await sleep(160);
      const wrongOk = await tap('#askDisplay .f14-furn[data-drop="' + st.wrongFirst + '"]');
      if (!wrongOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）找不到错误家具 ' + st.wrongFirst);
      await sleep(1100);
      row.wrongPick = {
        advanced: (await ev('window.__stageLog.length')) > before,
        audio: (await keysBetween(wt - 150, wt + 2600)).filter(k => k !== 'unknown')
      };
      if (row.wrongPick.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错却推进了');
      if (row.wrongPick.audio.indexOf('again') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错后没播温柔鼓励：' + row.wrongPick.audio.join(','));
      await sleep(700);
    }

    if (st.hint) {
      row.hintEarly = await ev(sel('.tut-hint'));
      row.hintLater = await wait(sel('.tut-hint'), 6000);
      if (row.hintEarly === true || row.hintLater !== true) {
        rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手指异常：early=' + row.hintEarly + ' later=' + row.hintLater);
      }
      row.hintGeom = await ev(`(function(){
        var h = document.querySelector('.tut-hint');
        if (!h) return null;
        var tgt = document.querySelector('#askDisplay .f14-furn[data-drop="${st.click}"]');
        var tb = tgt ? tgt.getBoundingClientRect() : null;
        if (!tb) return null;
        var hostR = document.getElementById('askDisplay').getBoundingClientRect();
        var isDrag = h.classList.contains('drag');
        var ex, ey;
        if (isDrag) {
          // 拖拽示范：起点由内联 left/top 给出，终点 = 起点 + --hx/--hy（应落在正确家具上）。
          // 用内联样式而非 getBoundingClientRect，避免动画 transform 干扰。
          var sx = hostR.left + parseFloat(h.style.left || '0');
          var sy = hostR.top + parseFloat(h.style.top || '0');
          var hx = parseFloat(h.style.getPropertyValue('--hx')) || 0;
          var hy = parseFloat(h.style.getPropertyValue('--hy')) || 0;
          ex = sx + hx; ey = sy + hy;
        } else {
          var hb = h.getBoundingClientRect();
          ex = hb.left + hb.width / 2; ey = hb.top + hb.height;
        }
        var near = ex > tb.left - 12 && ex < tb.right + 12 && ey > tb.top - 26 && ey < tb.bottom + 26;
        return { isDrag: isDrag, nearTarget: near, stars: Game.stars, ex: Math.round(ex), ey: Math.round(ey),
                 tb: [Math.round(tb.left), Math.round(tb.top), Math.round(tb.right), Math.round(tb.bottom)] };
      })()`);
      if (row.hintGeom && row.hintGeom.nearTarget !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）小手指落点不在正确的家具上：' + JSON.stringify(row.hintGeom));
      if (row.hintGeom && row.hintGeom.stars !== 0) rep.errors.push('教学阶段不该有星星：' + row.hintGeom.stars);
      await sleep(300);
    }

    // 演示步（RULES §三.14 点按推进）：等「轻点继续」→ 验证不自动前进 → 点屏幕推进
    if (st.demo) {
      row.tapShown = await wait(sel('.f11-tap'), 5000);
      if (!row.tapShown) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示定格后没有出现「轻点继续」提示');
      await sleep(2200);
      row.autoAdvanced = (await ev('window.__stageLog.length')) > (foundIdx + 1);
      if (row.autoAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示未点按就自动前进了（违反 §三.14 点按推进）');
      await tap('#askDisplay .f9-stage');
      row.advanced = await wait('window.__stageLog.length > ' + (foundIdx + 1), 6000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    // 教学互动（wrongFirst / hint 之后或独立）用正确轻点推进：点物品 → 点正确家具
    if (st.item && st.click && !st.demo) {
      const before = await ev('window.__stageLog.length');
      await tap('#askDisplay .f14-tray .f14-item[data-item="' + st.item + '"]');
      await sleep(180);
      const rightOk = await tap('#askDisplay .f14-furn[data-drop="' + st.click + '"]');
      if (!rightOk) {
        const diag = await ev(`(function(){
          var fs = Array.prototype.map.call(document.querySelectorAll('#askDisplay .f14-furn'), function(n){return n.dataset.drop;});
          var its = Array.prototype.map.call(document.querySelectorAll('#askDisplay .f14-item'), function(n){return n.dataset.item;});
          return { furn: fs, items: its };
        })()`);
        rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）找不到正确家具 ' + st.click + '；诊断=' + JSON.stringify(diag));
      }
      await sleep(1500);
      row.advanced = await wait('window.__stageLog.length > ' + before, 9000);
      if (!row.advanced) {
        const dump = await ev(`(function(){
          var furns = Array.prototype.map.call(document.querySelectorAll('#askDisplay .f14-furn'), function(n){var b=n.getBoundingClientRect();return {drop:n.dataset.drop,l:Math.round(b.left),t:Math.round(b.top),r:Math.round(b.right),b:Math.round(b.bottom)};});
          var items = Array.prototype.map.call(document.querySelectorAll('#askDisplay .f14-item'), function(n){var b=n.getBoundingClientRect();return {item:n.dataset.item,l:Math.round(b.left),t:Math.round(b.top),r:Math.round(b.right),b:Math.round(b.bottom)};});
          var tut = Game.tutorial || {};
          return {furns:furns, items:items, phase:Game.phase, vw:window.innerWidth, vh:window.innerHeight, picked:tut.pickedItem||null, canDrag:tut.canDrag, hint:!!document.querySelector('.tut-hint')};
        })()`);
        console.log('DUMP_' + st.n + ' ' + JSON.stringify(dump));
        rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）正确操作后没有推进；dump=' + JSON.stringify(dump));
      }
    }
    rep.tutorial.push(row);
    console.log('STEP ' + (i + 1) + ' ' + JSON.stringify(row).slice(0, 360));
  }

  rep.checks.outro = { ended: await wait('Game.phase === "asking"', 20000) };
  await sleep(500);
  rep.checks.outro.optionsBack = await ev('!document.getElementById("options").classList.contains("gone")');
  rep.checks.outro.starsInTutorial = await ev('Game.stars');
  rep.checks.outro.totalSteps = await ev('window.__stageLog.length');
  await shot(TAG + '-ask-first.png');

  // ---------- 2) 12 轮答题 ----------
  const seenType = {};
  const seenShot = {};
  let wrongPickTested = { A: false, B: false, C: false };
  let dragUsed = false;

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(200);
    let snap = await ev('Game.snapshot()');
    let q = snap.question;
    if (!q) { rep.errors.push('第 ' + r + ' 轮：答题阶段未开始（question 为空，phase=' + snap.phase + '）'); break; }
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, subj: q.subj, item: q.item, target: q.target, correct: q.correct, opts: q.options, audio: q.audio, stepAudios: q.stepAudios || null };

    if (q.type === 'F14A') {
      const item = q.item, furn = q.target;
      row.opts = await ev('document.querySelectorAll("#options .option[data-drag]").length');
      row.answerOk = q.options[q.correct] === ('i:' + item);
      row.audioOk = q.audio === A_KEY[item + ':' + furn];
      row.furnShown = await ev('!!document.querySelector(\'#askDisplay .f14-furn[data-drop="' + furn + '"]\')');
      row.itemGeom = await ev(`(function(){
        var o = document.querySelector('#options .option[data-idx="' + ${q.correct} + '"] svg');
        if (!o) return null; var b = o.getBoundingClientRect(); return { draw: Math.round(b.width) };
      })()`);
      if (row.opts !== 2) rep.errors.push('第 ' + r + ' 轮 F14A 可拖物品不是 2 个：' + row.opts);
      if (!row.answerOk) rep.errors.push('第 ' + r + ' 轮 F14A 正确答案指向错误：' + JSON.stringify(q.options) + ' want=i:' + item);
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 F14A 语音与目标不一致：' + q.audio + ' item=' + item + ' furn=' + furn);
      if (!row.furnShown) rep.errors.push('第 ' + r + ' 轮 F14A 房间没有显示目标家具 ' + furn);
      if (row.itemGeom && row.itemGeom.draw < 40) rep.errors.push('第 ' + r + ' 轮 F14A 选项物品太小：' + row.itemGeom.draw);
    }

    if (q.type === 'F14B') {
      row.tiles = await ev('document.querySelectorAll("#askDisplay .f9-tile").length');
      row.uniqueOpts = new Set(q.options).size;
      row.answerOk = q.options[q.correct] === ('s:' + q.subj);
      row.audioOk = q.audio === B_KEY[q.subj];
      if (row.tiles !== 3) rep.errors.push('第 ' + r + ' 轮 F14B 小图数量异常：' + row.tiles);
      if (row.uniqueOpts !== 3) rep.errors.push('第 ' + r + ' 轮 F14B 小图重复：' + JSON.stringify(q.options));
      if (!row.answerOk) rep.errors.push('第 ' + r + ' 轮 F14B 正确答案指向错误：' + JSON.stringify(q.options) + ' want=s:' + q.subj);
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 F14B 语音与目标不一致：' + q.audio + ' subj=' + q.subj);
      if (q.options.filter(f => f === ('s:' + q.subj)).length !== 1) rep.errors.push('第 ' + r + ' 轮 F14B 目标小图不唯一：' + JSON.stringify(q.options));
    }

    if (q.type === 'F14C') {
      row.opts = await ev('document.querySelectorAll("#options .option[data-drag]").length');
      row.step1 = q.steps[0];
      row.answerOk = q.options.indexOf('i:' + q.steps[0].item) >= 0;
      row.audioOk = q.audio === C1_KEY[q.steps[0].item + ':' + q.steps[0].target];
      row.furnsShown = await ev('(function(){ var fs=["bed","table","box"]; return fs.filter(function(f){return !!document.querySelector(\'#askDisplay .f14-furn[data-drop="\'+f+\'"]\');}).length; })()');
      row.itemGeom = await ev(`(function(){
        var o = document.querySelector('#options .option[data-idx="' + ${q.correct} + '"] svg');
        if (!o) return null; var b = o.getBoundingClientRect(); return { draw: Math.round(b.width) };
      })()`);
      if (row.opts !== 3) rep.errors.push('第 ' + r + ' 轮 F14C 可选项不是 3 个：' + row.opts);
      if (!row.answerOk) rep.errors.push('第 ' + r + ' 轮 F14C 第一步正确物品指向错误：' + JSON.stringify(q.options) + ' want=i:' + q.steps[0].item);
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 F14C 第一步语音不一致：' + q.audio + ' step1=' + JSON.stringify(q.steps[0]));
      if (row.furnsShown !== 3) rep.errors.push('第 ' + r + ' 轮 F14C 房间没有同时显示床/桌/箱');
      if (row.itemGeom && row.itemGeom.draw < 40) rep.errors.push('第 ' + r + ' 轮 F14C 选项物品太小：' + row.itemGeom.draw);
    }

    if (!seenShot[q.type]) { seenShot[q.type] = 1; await sleep(400); await shot(TAG + '-q-' + q.type + '.png'); }

    // 每种题型第一轮做一次「答错不推进」测试
    if ((q.type === 'F14A' || q.type === 'F14C') && !wrongPickTested[q.type]) {
      wrongPickTested[q.type] = true;
      const wt = Date.now();
      const correctItem = q.options[q.correct].replace('i:', '');
      // 找一个错误的家具（不是第一步目标）
      const wrongFurn = q.type === 'F14A' ? q.target : q.steps[0].target;
      const wrongDrop = wrongFurn === 'bed' ? 'table' : 'bed';
      const tgt = await rectOf('#askDisplay .f14-furn[data-drop="' + wrongDrop + '"]');
      await tap('#options .option[data-idx="' + q.correct + '"]');
      await sleep(150);
      await dragTo('#options .option[data-idx="' + q.correct + '"]', tgt.cx, tgt.cy);
      await sleep(1100);
      const after = await ev('Game.snapshot()');
      row.wrongPick = { advanced: after.round !== r, stillAsking: after.phase === 'asking' };
      if (row.wrongPick.advanced) rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 拖错家具却判过了');
      await sleep(1800);
      snap = await ev('Game.snapshot()');
      q = snap.question;
    }
    if (q.type === 'F14B' && !wrongPickTested.B) {
      wrongPickTested.B = true;
      const wt = Date.now();
      await tap('#askDisplay .f9-tile[data-idx="' + ((q.correct + 1) % 3) + '"]');
      await sleep(1100);
      const after = await ev('Game.snapshot()');
      row.wrongPick = { advanced: after.round !== r, stillAsking: after.phase === 'asking' };
      if (row.wrongPick.advanced) rep.errors.push('第 ' + r + ' 轮 F14B 点错却前进了');
      await sleep(1800);
      snap = await ev('Game.snapshot()');
      q = snap.question;
    }

    const before = await ev('Game.round');
    const starsBefore = await ev('Game.stars');
    const ct = Date.now();

    if (q.type === 'F14B') {
      await tap('#askDisplay .f9-tile[data-idx="' + q.correct + '"]');
    } else if (!dragUsed) {
      // 第一步：直接拖正确物品到正确家具
      const item = q.type === 'F14A' ? q.item : q.steps[0].item;
      const furn = q.type === 'F14A' ? q.target : q.steps[0].target;
      const idx = q.options.indexOf('i:' + item);
      const tgt = await rectOf('#askDisplay .f14-furn[data-drop="' + furn + '"]');
      await tap('#options .option[data-idx="' + idx + '"]');
      await sleep(150);
      await dragTo('#options .option[data-idx="' + idx + '"]', tgt.cx, tgt.cy);

      if (q.type === 'F14C') {
        await sleep(400);
        // 验证第一步已落位（stepsDone === 1，证明第一步点对）
        const q1 = (await ev('Game.snapshot()')).question;
        row.placedRight = !!(q1 && q1.stepsDone === 1);
        if (!seenShot['C-placed']) { seenShot['C-placed'] = 1; await shot(TAG + '-q-F14C-placed.png'); }
        // 第二步
        const q2 = (await ev('Game.snapshot()')).question;
        const item2 = q2.steps[1].item, furn2 = q2.steps[1].target;
        const idx2 = q2.options.indexOf('i:' + item2);
        const tgt2 = await rectOf('#askDisplay .f14-furn[data-drop="' + furn2 + '"]');
        await tap('#options .option[data-idx="' + idx2 + '"]');
        await sleep(150);
        await dragTo('#options .option[data-idx="' + idx2 + '"]', tgt2.cx, tgt2.cy);
      }
      dragUsed = true;
    } else {
      // 后续轮次：先点选项栏拾起，再点家具（点选等价路径）
      if (q.type === 'F14A') {
        await tap('#options .option[data-idx="' + q.correct + '"]');
        await sleep(200);
        await tap('#askDisplay .f14-furn[data-drop="' + q.target + '"]');
      } else {
        const item = q.steps[0].item, furn = q.steps[0].target;
        const idx = q.options.indexOf('i:' + item);
        await tap('#options .option[data-idx="' + idx + '"]');
        await sleep(200);
        await tap('#askDisplay .f14-furn[data-drop="' + furn + '"]');
        await sleep(400);
        // 验证第一步已落位
        const q1 = (await ev('Game.snapshot()')).question;
        row.placedRight = !!(q1 && q1.stepsDone === 1);
        const q2 = (await ev('Game.snapshot()')).question;
        const idx2 = q2.options.indexOf('i:' + q2.steps[1].item);
        await tap('#options .option[data-idx="' + idx2 + '"]');
        await sleep(200);
        await tap('#askDisplay .f14-furn[data-drop="' + q2.steps[1].target + '"]');
      }
    }

    await sleep(250);

    row.voiceOnCorrect = (await keysBetween(ct, ct + 430)).filter(k => k !== 'unknown');
    const advanced = await wait('Game.round > ' + before + ' || Game.phase === "done"', 4000);
    row.advanced = advanced;
    row.starsDelta = (await ev('Game.stars')) - starsBefore;

    // F14C 两步都落位 = 第一步 stepsDone===1（已在校验分支记录）且整体推进（第二步 judge(true) 才前进）
    if (q.type === 'F14C') {
      row.placedRight = !!row.placedRight && advanced;
      if (!row.placedRight) rep.errors.push('第 ' + r + ' 轮 F14C 两步没都落到正确家具（stepsDone/推进失败）');
    }

    // 答对禁人声：但 F14C 多步题在第一步落位后会口播「第二步指令」（属引导，非奖励人声），需排除
    const badVoice = row.voiceOnCorrect.filter(function (k) {
      return !(row.stepAudios && row.stepAudios.indexOf(k) >= 0);
    });
    row.badVoice = badVoice;
    if (r === 1) row.overflow = await overflow();
    if (!advanced) rep.errors.push('第 ' + r + ' 轮没有推进（' + q.type + '）');
    if (badVoice.length) rep.errors.push('第 ' + r + ' 轮答对后播放了奖励人声：' + badVoice.join(','));
    if (row.starsDelta !== 1) rep.errors.push('第 ' + r + ' 轮星星未 +1（' + row.starsDelta + '）');
    rep.rounds.push(row);
    await sleep(180);
  }

  // ---------- 3) 通关 ----------
  rep.checks.done = {
    phase: await ev('Game.phase'),
    stars: await ev('Game.stars'),
    viewDone: await ev('!document.getElementById("viewDone").hidden'),
    grand: await ev('document.getElementById("viewDone").classList.contains("grand")'),
    confetti: await ev('!document.getElementById("confetti").hidden'),
    cleared: await ev('!!Game.progress.cleared["6-4"]'),
    unlockedLevel: await ev('Game.progress.unlockedLevel[6]')
  };
  rep.checks.done.tail = await ev(`window.__played.slice(-10).map(function(p){
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
    var c6 = document.querySelector('.island[data-island="6"]');
    return { island6Cleared: c6.classList.contains('cleared'),
             island6Unlocked: c6.classList.contains('unlocked'),
             iconIsSvg: !!c6.querySelector('.icon svg') };
  })()`);
  await shot(TAG + '-map-after.png');

  await ev('Game.openIsland(6)'); await sleep(300);
  rep.checks.englishIsland = await scan();
  rep.checks.islandAfter = await ev(`(function(){
    var n3 = document.querySelector('.node[data-level="3"]');
    var n4 = document.querySelector('.node[data-level="4"]');
    return { node3Done: n3.classList.contains('done'),
             node4Done: n4.classList.contains('done'),
             node4Locked: n4.classList.contains('locked'),
             node4Playable: n4.classList.contains('playable'),
             node4Text: n4.textContent,
             node5Playable: (document.querySelector('.node[data-level="5"]')||{classList:{contains:function(){return false;}}}).classList.contains('playable'),
             unlocked: Game.snapshot().progress.unlockedLevel[6] };
  })()`);
  const islOverflow = await overflow();
  rep.checks.overflowIsland = { sw: islOverflow.sw, iw: islOverflow.iw, sh: islOverflow.sh, ih: islOverflow.ih };
  await shot(TAG + '-island-after.png');

  console.log(JSON.stringify(rep, null, 2));

  const sigOk = rep.tutorial.every(s => s.sigOk);
  const noOverflow = rep.tutorial.every(s => !s.overflow ||
    (s.overflow.sw <= s.overflow.iw + 1 && s.overflow.sh <= s.overflow.ih + 1 &&
     s.overflow.cut.length === 0 && s.overflow.zero.length === 0));
  const audioOk = rep.tutorial.every(s => s.audioOk);
  const hintOk = rep.tutorial.filter(s => s.hint).every(s => s.hintEarly !== true && s.hintLater === true);
  const wrongOk = rep.tutorial.filter(s => s.wrongPick).every(s => s.wrongPick && !s.wrongPick.advanced);
  const advanceOk = rep.tutorial.filter(s => s.advanced !== undefined).every(s => s.advanced === true);
  const demoOk = rep.tutorial.filter(s => s.demo).every(s => s.tapShown === true && s.autoAdvanced === false && s.advanced === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1 && (!s.badVoice || s.badVoice.length === 0));
  const ok = rep.errors.length === 0 && sigOk && audioOk && hintOk && wrongOk && advanceOk && demoOk && roundsOk && noOverflow &&
    Object.keys(seenType).length === 3 && seenType.F14A === 4 && seenType.F14B === 4 && seenType.F14C === 4 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === false && rep.checks.done.cleared === true &&
    rep.checks.done.unlockedLevel === 5 &&
    rep.checks.islandAfter.node3Done === true &&
    rep.checks.islandAfter.node4Done === true &&
    rep.checks.islandAfter.node4Locked === false &&
    rep.checks.islandAfter.node4Playable === false &&
    rep.checks.islandAfter.node4Text.indexOf('⭐') >= 0 &&
    rep.checks.islandAfter.unlocked === 5 &&
    rep.checks.mapAfter.island6Unlocked === true && rep.checks.mapAfter.island6Cleared === false &&
    rep.checks.mapAfter.iconIsSvg === true &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0 &&
    rep.checks.englishIsland.length === 0 &&
    rep.checks.outro.ended === true &&
    rep.checks.overflowIsland.sw <= rep.checks.overflowIsland.iw + 1;
  console.log('\nPROBE_' + (ok ? 'PASS' : 'FAIL') + ' sigOk=' + sigOk + ' audioOk=' + audioOk + ' hintOk=' + hintOk +
    ' wrongOk=' + wrongOk + ' advanceOk=' + advanceOk + ' demoOk=' + demoOk + ' roundsOk=' + roundsOk +
    ' noOverflow=' + noOverflow + ' steps=' + rep.checks.outro.totalSteps + ' types=' + JSON.stringify(seenType) +
    ' stars=' + rep.checks.done.stars + ' grand=' + rep.checks.done.grand);
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('PROBE_ERROR', e); process.exit(2); });
