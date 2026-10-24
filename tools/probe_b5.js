// 第 3 岛第 5 关（结业关，游乐场 · 综合比较大考）专项测试
//   1) 解锁链：第 1、2 岛全通 + 第 3 岛第 1、2、3、4 关通关 → 第 3 岛第 5 关可玩
//   2) 教学 8 环节（4 演示 + 3 互动 + 过渡）：演示语音播完定格，必须点屏幕才推进（RULES §三.14）；
//      互动 4 秒无反应出小手指（§二.12），点错不推进；互动 3 是「把重的石头放到跷跷板上」
//   3) 三题型：A 综合判断（2 件物品听比较词点选）/ B 场景匹配（断桥 / 大门 / 跷跷板选一个）/
//      C 终极大拖拽（大象 / 羽毛拖进 重箱 / 轻箱）
//   4) 12 轮（4/4/4）：答对无人声、答错不推进、拖错框不给过、通关走 grand 且第 3 岛点亮
//   5) 视觉：无英文字母（innerText + aria-label）、双视口无溢出（含纵向）、可点目标够大
// 带 LILEARN_URL 则直接跑线上（发布后回归用）。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'b5';
const PORT = 9713 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));

const A_KEY = {
  heavy: 'b5x_a_heavy', light: 'b5x_a_light',
  big: 'b5_a_bigger', small: 'b5_a_smaller',
  long: 'b5_a_longer', short: 'b5_a_shorter'
};
const B_KEY = { bridge: 'b5x_b_bridge', gate: 'b5x_b_gate', seesaw: 'b5x_b_seesaw' };
const C_KEY = {
  'elephant:heavy': 'b4_c_elephant',
  'feather:light': 'b5x_c_feather'
};

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-b5-' + Date.now()),
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
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails || {};
      const ex = d.exception && (d.exception.description || d.exception.value);
      const fr = ((d.stackTrace && d.stackTrace.callFrames) || []).slice(0, 6)
        .map(f => f.functionName + '@' + f.lineNumber + ':' + f.columnNumber).join(' < ');
      console.log('PAGE_EXC', String(ex || d.text || '').slice(0, 200) + ' || ' + fr);
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      console.log('PAGE_ERR', JSON.stringify(m.params.args.map(a => a.value || a.description)).slice(0, 300));
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
        window.__errs.push(String((ev.error && ev.error.stack) || ev.message || '').slice(0, 700));
      });
      window.__stageLog = [];
      var last = null;
      function stageSig(){
        var s = document.querySelector('.b5x-stage');
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
    for (let i = 0; i < 1400; i++) {   // 线上 22.8MB voice.js 冷加载可能很慢，给足 210s
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
      '.b5x-tile, .b5x-box, .b5x-item, .b5x-drop, .b5x-cell, .b5x-see, .b5x-seesaw, .option'), function(n){
      var host = n.closest('#viewAsk, #viewDone, #viewStart');
      if (host && host.hidden) return;   // 视图已切走：隐藏容器里的旧节点不计越界
      var b = n.getBoundingClientRect();
      if (!b.width) {
        if (n.classList.contains('option')) { if (optShown && !n.hidden) zero.push('option:0'); }
        else zero.push((n.className || '?') + ':0');
        return;
      }
      var isClick = n.classList.contains('b5x-tile') || n.classList.contains('b5x-box') ||
                    n.classList.contains('b5x-item') || n.classList.contains('b5x-drop');
      var overH = b.right > window.innerWidth + 1 || b.left < -1;
      var overV = isClick && (b.bottom > window.innerHeight + 1 || b.top < -1);
      if (overH || overV) cut.push(n.className + ':' + Math.round(b.left) + ',' + Math.round(b.top) +
        '..' + Math.round(b.right) + ',' + Math.round(b.bottom));
    });
    return { sw: de.scrollWidth, iw: window.innerWidth, sh: de.scrollHeight, ih: window.innerHeight,
             cut: cut.slice(0, 6), zero: zero.slice(0, 6) };
  })()`);

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };

  // ---------- 0) 解锁链 ----------
  await ev('Game.resetProgress()');
  await ev('for (var isl = 1; isl <= 2; isl++) { for (var lv = 1; lv <= 5; lv++) Game.markCleared(isl, lv); }');
  await ev('Game.markCleared(3, 1)');
  await ev('Game.markCleared(3, 2)');
  await ev('Game.markCleared(3, 3)');
  await ev('Game.markCleared(3, 4)');
  await ev('Game.openIsland(3)');
  await sleep(300);
  rep.checks.unlock = await ev(`(function(){
    var n5 = document.querySelector('.node[data-level="5"]');
    return { node5Playable: n5.classList.contains('playable'), node5Locked: n5.classList.contains('locked') };
  })()`);
  await shot(TAG + '-island.png');
  if (rep.checks.unlock.node5Playable !== true) rep.errors.push('第 3 岛第 5 关没有亮起（' + JSON.stringify(rep.checks.unlock) + '）');

  // ---------- 1) 进关 → 教学 ----------
  await ev('document.querySelector(\'.node[data-level="5"]\').click()');
  await sleep(300);
  await ev('document.getElementById("btnStart").click()');

  const STEPS = [
    { n: 'gate',      sig: 'sid:gate',    audio: 'b5x_t_gate',   demo: true, shot: 'tut-gate' },
    { n: 'ask-big',   sig: 'sid:askBig',  audio: 'b5x_t_ask1',   clickItem: 'elephant', wrongItem: 'mouse', hint: true, shot: 'tut-askBig' },
    { n: 'bridge',    sig: 'sid:bridge',  audio: 'b5x_t_bridge', demo: true, shot: 'tut-bridge' },
    { n: 'ask-long',  sig: 'sid:askLong', audio: 'b5x_t_ask2',   clickItem: 'train', wrongItem: 'car', shot: 'tut-askLong' },
    { n: 'coins',     sig: 'sid:coins',   audio: 'b5x_t_coins',  demo: true, shot: 'tut-coins' },
    { n: 'seesaw',    sig: 'sid:seesaw',  audio: 'b5x_t_seesaw', demo: true, shot: 'tut-seesaw' },
    { n: 'ask-rock',  sig: 'sid:askRock', audio: 'b5x_t_ask3',   dragAsk: true, hint: true, shot: 'tut-askRock' },
    { n: 'out',       sig: 'sid:out',     audio: 'b5x_t_out' }
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

    if (entry) {
      await sleep(180);
      row.audio = (await keysBetween(entry.t - 900, entry.t + 2600)).filter(k => k !== 'unknown');
      row.audioOk = row.audio.indexOf(st.audio) >= 0;
      if (!row.audioOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）语音不符：期望 ' + st.audio + '，实际 ' + row.audio.join(','));
    }
    if (st.n !== 'out') row.overflow = await overflow();
    if (st.shot) { await sleep(80); await shot(TAG + '-' + st.shot + '.png'); }

    // 演示步：等「轻点继续」→ 验证不自动前进 → 点屏幕推进
    if (st.demo) {
      row.tapShown = await wait(sel('.f11-tap'), 5000);
      if (!row.tapShown) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示定格后没有出现「轻点继续」');
      await sleep(2100);
      row.autoAdvanced = (await ev('window.__stageLog.length')) > (foundIdx + 1);
      if (row.autoAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示未点按就自动前进了');
      await tap('#askDisplay .b5x-stage');
      row.advanced = await wait('window.__stageLog.length > ' + (foundIdx + 1), 6000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    // 互动步：点错不推进 + again
    if (st.wrongItem) {
      const before = await ev('window.__stageLog.length');
      const wt = Date.now();
      await tap('#askDisplay .b5x-tile[data-item="' + st.wrongItem + '"]');
      await sleep(1000);
      row.wrongPick = {
        advanced: (await ev('window.__stageLog.length')) > before,
        audio: (await keysBetween(wt - 150, wt + 2400)).filter(k => k !== 'unknown')
      };
      if (row.wrongPick.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错却推进了');
      if (row.wrongPick.audio.indexOf('again') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错后没播 again：' + row.wrongPick.audio.join(','));
      await sleep(700);
    }

    // 互动 3：拖错（气球）不推进
    if (st.dragAsk) {
      const before = await ev('window.__stageLog.length');
      const wt = Date.now();
      await tap('#askDisplay .b5x-item[data-item="balloon"]');
      await sleep(200);
      await tap('#askDisplay .b5x-drop[data-drop="b5xseesaw"]');
      await sleep(1100);
      row.wrongDrop = {
        advanced: (await ev('window.__stageLog.length')) > before,
        audio: (await keysBetween(wt - 150, wt + 2600)).filter(k => k !== 'unknown'),
        stillTut: await ev('Game.phase === "tutorial"')
      };
      if (row.wrongDrop.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖错物品却推进了');
      if (row.wrongDrop.audio.indexOf('again') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖错后没播 again：' + row.wrongDrop.audio.join(','));
      await sleep(700);
    }

    if (st.hint) {
      row.hintEarly = await ev(sel('.tut-hint'));
      row.hintLater = await wait(sel('.tut-hint'), 7000);
      if (row.hintEarly === true || row.hintLater !== true) {
        rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手指异常：early=' + row.hintEarly + ' later=' + row.hintLater);
      }
      row.hintGeom = await ev(`(function(){
        var h = document.querySelector('.tut-hint');
        if (!h) return null;
        var isDrag = h.classList.contains('drag');
        var tgt = ${st.dragAsk
          ? `document.querySelector('#askDisplay .b5x-drop[data-drop="b5xseesaw"]')`
          : `document.querySelector('#askDisplay .b5x-tile[data-item="${st.clickItem}"]')`};
        var tb = tgt ? tgt.getBoundingClientRect() : null;
        if (!tb) return null;
        var hb = h.getBoundingClientRect();
        var ex, ey;
        if (isDrag) {
          var hx = parseFloat(h.style.getPropertyValue('--hx')) || 0;
          var hy = parseFloat(h.style.getPropertyValue('--hy')) || 0;
          ex = hb.left + hx; ey = hb.top + hy;
        } else {
          ex = hb.left + hb.width / 2; ey = hb.top + hb.height;
        }
        return { isDrag: isDrag,
                 near: ex > tb.left - 14 && ex < tb.right + 14 && ey > tb.top - 26 && ey < tb.bottom + 30,
                 stars: Game.stars, tgt: [Math.round(tb.left), Math.round(tb.top), Math.round(tb.right), Math.round(tb.bottom)],
                 end: [Math.round(ex), Math.round(ey)] };
      })()`);
      if (row.hintGeom && row.hintGeom.near !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）小手指没指向正确目标：' + JSON.stringify(row.hintGeom));
      if (row.hintGeom && row.hintGeom.stars !== 0) rep.errors.push('教学阶段不该有星星：' + row.hintGeom.stars);
      await sleep(200);
    }

    // 互动正确作答（点选 / 拖放）
    if (st.clickItem) {
      const before = await ev('window.__stageLog.length');
      const okTap = await tap('#askDisplay .b5x-tile[data-item="' + st.clickItem + '"]');
      if (!okTap) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）找不到正确物品 ' + st.clickItem);
      await sleep(1400);
      row.advanced = await wait('window.__stageLog.length > ' + before, 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点对后没有推进');
    }
    if (st.dragAsk) {
      const before = await ev('window.__stageLog.length');
      const itemR = await rectOf('#askDisplay .b5x-item[data-item="rock"]');
      const dropR = await rectOf('#askDisplay .b5x-drop[data-drop="b5xseesaw"]');
      if (!itemR || !dropR) {
        rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）找不到石头或跷跷板');
      } else {
        await dragTo('#askDisplay .b5x-item[data-item="rock"]', dropR.cx, dropR.cy);
      }
      await sleep(1500);
      row.advanced = await wait('window.__stageLog.length > ' + before, 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖对后没有推进');
    }
    rep.tutorial.push(row);
    console.log('STEP ' + (i + 1) + ' ' + JSON.stringify(row).slice(0, 380));
  }

  rep.checks.outro = { ended: await wait('Game.phase === "asking"', 20000) };
  rep.checks.errs = await ev('window.__errs.slice(0, 3)');
  if (rep.checks.errs.length) console.log('ERRS ' + JSON.stringify(rep.checks.errs));
  await sleep(500);
  rep.checks.outro.totalSteps = await ev('window.__stageLog.length');
  rep.checks.outro.starsInTutorial = await ev('Game.stars');
  await shot(TAG + '-ask-first.png');

  // ---------- 2) 12 轮答题 ----------
  const seenType = {};
  const seenShot = {};
  const wrongTested = { B5A: false, B5B: false, B5C: false };

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(200);
    let snap = await ev('Game.snapshot()');
    let q = snap.question;
    if (!q) { rep.errors.push('第 ' + r + ' 轮：答题阶段未开始（question 为空，phase=' + snap.phase + '）'); break; }
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, correct: q.correct, opts: q.options, audio: q.audio, cmp: q.cmp, ansScene: q.ansScene, ansItem: q.ansItem, ansBox: q.ansBox };

    if (q.type === 'B5A') {
      row.tiles = await ev('document.querySelectorAll("#askDisplay .b5x-tile").length');
      row.audioOk = q.audio === A_KEY[q.cmp];
      if (row.tiles !== 2) rep.errors.push('第 ' + r + ' 轮 B5A 物品不是 2 个：' + row.tiles);
      if (!row.audioOk) rep.errors.push('第 ' + r +  ' 轮 B5A 语音与比较词不符：' + q.audio + ' want=' + A_KEY[q.cmp]);
    }
    if (q.type === 'B5B') {
      row.tiles = await ev('document.querySelectorAll("#askDisplay .b5x-tile").length');
      row.audioOk = q.audio === B_KEY[q.ansScene];
      row.sceneOk = q.options[q.correct] === ('s:' + q.ansScene);
      if (row.tiles !== 3) rep.errors.push('第 ' + r + ' 轮 B5B 场景不是 3 个：' + row.tiles);
      if (!row.audioOk) rep.errors.push('第 ' + r +  ' 轮 B5B 语音与答案场景不符：' + q.audio + ' want=' + B_KEY[q.ansScene]);
      if (!row.sceneOk) rep.errors.push('第 ' + r + ' 轮 B5B 正确项不是答案场景：' + q.options[q.correct] + ' 期望 s:' + q.ansScene);
    }
    if (q.type === 'B5C') {
      row.optsN = await ev('document.querySelectorAll("#options .option[data-drag]").length');
      row.boxes = await ev('document.querySelectorAll("#askDisplay .b5x-box").length');
      row.audioOk = q.audio === C_KEY[q.ansItem + ':' + q.ansBox];
      row.ansOk = q.options[q.correct] === ('i:' + q.ansItem);
      if (row.optsN !== 2) rep.errors.push('第 ' + r + ' 轮 B5C 可拖物品不是 2 个：' + row.optsN);
      if (row.boxes !== 2) rep.errors.push('第 ' + r + ' 轮 B5C 分类框不是 2 个：' + row.boxes);
      if (!row.audioOk) rep.errors.push('第 ' + r +  ' 轮 B5C 语音不符：' + q.audio + ' want=' + C_KEY[q.ansItem + ':' + q.ansBox]);
      if (!row.ansOk) rep.errors.push('第 ' + r + ' 轮 B5C 正确项与答案物品不符：' + q.options[q.correct]);
      if (q.options.indexOf('i:rock') >= 0 || q.options.indexOf('i:balloon') >= 0) {
        rep.errors.push('第 ' + r + ' 轮 B5C 物品里出现了框图标同款（石头/气球），可偷看图标作弊');
      }
    }

    if (!seenShot[q.type]) { seenShot[q.type] = 1; await sleep(300); await shot(TAG + '-q-' + q.type + '.png'); }

    // 每种题型第一轮做一次「答错不推进」测试
    if (!wrongTested[q.type]) {
      wrongTested[q.type] = true;
      let did = false;
      if (q.type === 'B5A') {
        const wrongIdx = (q.correct + 1) % 2;
        did = await tap('#askDisplay .b5x-tile[data-idx="' + wrongIdx + '"]');
      } else if (q.type === 'B5B') {
        const wrongIdx = (q.correct + 1) % 3;
        did = await tap('#askDisplay .b5x-tile[data-idx="' + wrongIdx + '"]');
      } else if (q.type === 'B5C') {
        const wrongBox = q.ansBox === 'heavy' ? 'light' : 'heavy';
        const idx = q.options.indexOf('i:' + q.ansItem);
        const boxR = await rectOf('#askDisplay .b5x-box[data-drop="' + wrongBox + '"]');
        if (boxR) {
          await tap('#options .option[data-idx="' + idx + '"]');
          await sleep(150);
          did = await dragTo('#options .option[data-idx="' + idx + '"]', boxR.cx, boxR.cy);
        }
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

    if (q.type === 'B5A') {
      await tap('#askDisplay .b5x-tile[data-idx="' + q.correct + '"]');
    } else if (q.type === 'B5B') {
      await tap('#askDisplay .b5x-tile[data-idx="' + q.correct + '"]');
    } else {
      // B5C：把正确物品拖进正确框
      const idx = q.options.indexOf('i:' + q.ansItem);
      const boxR = await rectOf('#askDisplay .b5x-box[data-drop="' + q.ansBox + '"]');
      await tap('#options .option[data-idx="' + idx + '"]');
      await sleep(150);
      await dragTo('#options .option[data-idx="' + idx + '"]', boxR.cx, boxR.cy);
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

  // ---------- 3) 通关 ----------
  rep.checks.done = {
    phase: await ev('Game.phase'),
    stars: await ev('Game.stars'),
    viewDone: await ev('!document.getElementById("viewDone").hidden'),
    grand: await ev('document.getElementById("viewDone").classList.contains("grand")'),
    confetti: await ev('!document.getElementById("confetti").hidden'),
    cleared: await ev('!!Game.progress.cleared["3-5"]'),
    unlockedLevel: await ev('Game.progress.unlockedLevel[3]'),
    islandCleared: await ev('Game.isIslandCleared ? !!Game.isIslandCleared(3) : null')
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
    var c3 = document.querySelector('.island[data-island="3"]');
    return { island3Cleared: c3.classList.contains('cleared'),
             island3Unlocked: c3.classList.contains('unlocked'),
             hasFlag: !!c3.querySelector('.flag, .icon svg, .icon img') };
  })()`);
  await shot(TAG + '-map-after.png');

  await ev('Game.openIsland(3)'); await sleep(300);
  rep.checks.englishIsland = await scan();
  rep.checks.islandAfter = await ev(`(function(){
    var n4 = document.querySelector('.node[data-level="4"]');
    var n5 = document.querySelector('.node[data-level="5"]');
    var snap = Game.snapshot();
    return { node4Done: n4.classList.contains('done'),
             node5Done: n5.classList.contains('done'),
             node5Text: n5.textContent,
             unlocked: snap.progress.unlockedLevel[3] };
  })()`);
  const islOverflow = await overflow();
  rep.checks.overflowIsland = { sw: islOverflow.sw, iw: islOverflow.iw, sh: islOverflow.sh, ih: islOverflow.ih, cut: islOverflow.cut, zero: islOverflow.zero };
  await shot(TAG + '-island-after.png');

  console.log(JSON.stringify(rep, null, 2));

  const sigOk = rep.tutorial.every(s => s.sigOk);
  const noOverflow = rep.tutorial.every(s => !s.overflow ||
    (s.overflow.sw <= s.overflow.iw + 1 && s.overflow.sh <= s.overflow.ih + 1 &&
     s.overflow.cut.length === 0 && s.overflow.zero.length === 0));
  const audioOk = rep.tutorial.every(s => s.audioOk);
  const hintOk = rep.tutorial.filter(s => s.hint).every(s => s.hintEarly !== true && s.hintLater === true);
  const wrongOk = rep.tutorial.every(s => {
    if (s.wrongPick) return !s.wrongPick.advanced;
    if (s.wrongDrop) return !s.wrongDrop.advanced;
    return true;
  });
  const advanceOk = rep.tutorial.filter(s => s.advanced !== undefined).every(s => s.advanced === true);
  const demoOk = rep.tutorial.filter(s => s.demo).every(s => s.tapShown === true && s.autoAdvanced === false && s.advanced === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1 && s.voiceOnCorrect.length === 0);
  const ok = rep.errors.length === 0 && sigOk && audioOk && hintOk && wrongOk && advanceOk && demoOk && roundsOk && noOverflow &&
    rep.rounds.length === 12 &&
    Object.keys(seenType).length === 3 && seenType.B5A === 4 && seenType.B5B === 4 && seenType.B5C === 4 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === true && rep.checks.done.cleared === true &&
    rep.checks.done.unlockedLevel === 5 &&
    rep.checks.islandAfter.node4Done === true &&
    rep.checks.islandAfter.node5Done === true &&
    rep.checks.islandAfter.node5Text.indexOf('⭐') >= 0 &&
    rep.checks.islandAfter.unlocked === 5 &&
    rep.checks.mapAfter.island3Unlocked === true && rep.checks.mapAfter.island3Cleared === true &&
    rep.checks.mapAfter.hasFlag === true &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0 &&
    rep.checks.englishIsland.length === 0 &&
    rep.checks.outro.ended === true &&
    rep.checks.overflowIsland.sw <= rep.checks.overflowIsland.iw + 1;
  console.log('\nPROBE_' + (ok ? 'PASS' : 'FAIL') + ' sigOk=' + sigOk + ' audioOk=' + audioOk + ' hintOk=' + hintOk +
    ' wrongOk=' + wrongOk + ' advanceOk=' + advanceOk + ' demoOk=' + demoOk + ' roundsOk=' + roundsOk +
    ' noOverflow=' + noOverflow + ' steps=' + rep.checks.outro.totalSteps + ' types=' + JSON.stringify(seenType) +
    ' stars=' + rep.checks.done.stars + ' grand=' + rep.checks.done.grand);
  finish(ok ? 0 : 1);
})().catch(e => { console.error('PROBE_ERROR', e); finish(2); });
