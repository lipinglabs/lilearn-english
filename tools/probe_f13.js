// 第 6 岛第 3 关（L6-W3，找东西 Where is the ball? It's in / on / under the ...）专项测试
//   1) 解锁链：第 1–5 岛全通 + 第 6 岛第 1、2 关通关 → 第 6 岛第 3 关可玩
//   2) 教学（RULES §三.10 双倍量 + §三.14 点按推进）：on / under / in 各 2 演示 + 2 互动、
//      综合 1 演示 + 1 互动 + 过渡 = 15 环节；演示步语音播完定格，必须点屏幕才推进（不点不前进）
//   3) 三题型：A 单图寻物（点指定位置的球）/ B 多场景选一（沙发上 / 床底下 / 箱子里）/
//      C 拖拽藏球（拖到沙发上 / 桌子下）
//   4) 答题 12 轮：答对无人声、答错不推进、拖错家具不给过、通关奖励
//   5) 视觉：无英文字母（innerText + aria-label）、当前视口无溢出、球够大且热区比图形大一圈
// 带 LILEARN_URL 则直接跑线上（发布后回归用）。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'f13';
const PORT = 9703 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));

const A_KEY = { 'table:under': 'l6w3_a_under_table', 'sofa:on': 'l6w3_a_on_sofa', 'bed:under': 'l6w3_a_under_bed', 'table:on': 'l6w3_a_on_table' };
const B_KEY = { onSofa: 'l6w3_b_on_sofa', underBed: 'l6w3_b_under_bed', inBox: 'l6w3_b_in_box' };
const C_KEY = { sofa: 'l6w3_c_on_sofa', table: 'l6w3_c_under_table' };

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-f13-' + Date.now()),
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
        var r = s.querySelector('.f13-room');
        if (!r) return 'noroom';
        var list = Array.prototype.map.call(r.querySelectorAll('.f13-furn'), function(n){
          var b = n.querySelector('.f13-ball');
          return n.dataset.furn + '@' + (b ? b.dataset.place : '-');
        });
        if (!list.length) return 'empty';
        return r.dataset.subj + ':' + list.join(',');
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
      '.f9-card, .f9-tile, .f11-furn, .f13-room, .f13-furn, .option'), function(n){
      var b = n.getBoundingClientRect();
      if (!b.width) { if (optShown || !n.classList.contains('option')) zero.push((n.className || '?') + ':0'); return; }
      if (b.right > window.innerWidth + 1 || b.left < -1) cut.push(n.className + ':' + Math.round(b.left) + '..' + Math.round(b.right));
      if (n.classList.contains('f13-furn') && b.width < 40) zero.push(n.dataset.furn + ':' + Math.round(b.width));
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
  await ev('Game.openIsland(6)');
  await sleep(300);
  rep.checks.unlock = await ev(`(function(){
    var n3 = document.querySelector('.node[data-level="3"]');
    return { node3Playable: n3.classList.contains('playable'), node3Locked: n3.classList.contains('locked') };
  })()`);
  await shot(TAG + '-island.png');
  if (rep.checks.unlock.node3Playable !== true) rep.errors.push('第 6 岛第 3 关没有亮起（' + JSON.stringify(rep.checks.unlock) + '）');

  // ---------- 1) 进关 → 教学 ----------
  await ev('document.querySelector(\'.node[data-level="3"]\').click()');
  await sleep(300);
  await ev('document.getElementById("btnStart").click()');

  const STEPS = [
    // on：2 演示 + 2 互动
    { n: 'on-demo1',   sig: 'onSofa1:sofa@on',              audio: 'l6w3_t_on1',      demo: true, shot: 'tut-on' },
    { n: 'on-demo2',   sig: 'onSofa2:sofa@on',              audio: 'l6w3_t_on2',      demo: true, shot: 'tut-on-bounce' },
    { n: 'on-ask1',    sig: 'onPick1:bed@on,sofa@on',       audio: 'l6w3_t_on_a1',    wrongFirst: 'bed',   click: 'sofa',  shot: 'tut-on-ask1' },
    { n: 'on-ask2',    sig: 'onPick2:sofa@on,table@on',     audio: 'l6w3_t_on_a2',    hint: true, click: 'table' },
    // under：2 演示 + 2 互动
    { n: 'under-demo1',sig: 'underBed1:bed@under',          audio: 'l6w3_t_under1',   demo: true, shot: 'tut-under' },
    { n: 'under-demo2',sig: 'underBed2:bed@under',          audio: 'l6w3_t_under2',   demo: true, shot: 'tut-under-again' },
    { n: 'under-ask1', sig: 'underPick1:table@under,bed@under', audio: 'l6w3_t_under_a1', wrongFirst: 'table', click: 'bed', shot: 'tut-under-ask1' },
    { n: 'under-ask2', sig: 'underPick2:bed@under,table@under', audio: 'l6w3_t_under_a2', hint: true, click: 'table' },
    // in：2 演示 + 2 互动
    { n: 'in-demo1',   sig: 'inBox1:box@in',                audio: 'l6w3_t_in1',      demo: true, shot: 'tut-in-box' },
    { n: 'in-demo2',   sig: 'inChest2:chest@in',            audio: 'l6w3_t_in2',      demo: true, shot: 'tut-in-chest' },
    { n: 'in-ask1',    sig: 'inPick1:box@in,bed@under',     audio: 'l6w3_t_in_a1',    wrongFirst: 'bed',   click: 'box', shot: 'tut-in-ask1' },
    { n: 'in-ask2',    sig: 'inPick2:box@in,table@on',      audio: 'l6w3_t_in_a2',    hint: true, click: 'box' },
    // 综合：1 演示 + 1 互动
    { n: 'room-demo',  sig: 'room1:sofa@on,table@on,box@in', audio: 'l6w3_t_room1',   demo: true, shot: 'tut-room' },
    { n: 'room-ask',   sig: 'roomPick:sofa@under,table@on,box@in', audio: 'l6w3_t_room_a1', click: 'table', shot: 'tut-room-ask' },
    // 过渡语
    { n: 'outro',      sig: 'final4:on,under,in,table',     audio: 'l6w3_t_out' }
  ];

  for (let i = 1; i < STEPS.length; i++) {
    if (STEPS[i].sig === STEPS[i - 1].sig) throw new Error('教学相邻两步舞台指纹相同：' + STEPS[i].sig + '（' + STEPS[i].n + '）');
  }

  for (let i = 0; i < STEPS.length; i++) {
    const st = STEPS[i];
    const reached = await wait('window.__stageLog.length >= ' + (i + 1), 12000);
    const entry = reached ? JSON.parse(await ev('JSON.stringify(window.__stageLog[' + i + '])')) : null;
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

    if (st.wrongFirst) {
      const before = await ev('window.__stageLog.length');
      const wt = Date.now();
      await tap('#askDisplay .f13-ball[data-furn="' + st.wrongFirst + '"]');
      await sleep(1100);
      row.wrongPick = {
        advanced: (await ev('window.__stageLog.length')) > before,
        stillAsking: await ev('Game.tutorial && Game.tutorial.ask === ' + JSON.stringify(st.click)),
        audio: (await keysBetween(wt - 150, wt + 2600)).filter(k => k !== 'unknown')
      };
      if (row.wrongPick.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错却推进了');
      if (row.wrongPick.stillAsking !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错后没保持等待');
      if (row.wrongPick.audio.indexOf('again') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错后没播温柔鼓励：' + row.wrongPick.audio.join(','));
      await sleep(1200);
    }

    if (st.hint) {
      if (st.wrongFirst) { row.hintEarly = null; }
      else { await sleep(2400); row.hintEarly = await ev(sel('.tut-hint')); }
      row.hintLater = await wait(sel('.tut-hint'), 5000);
      if (row.hintEarly === true || row.hintLater !== true) {
        rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手指异常：early=' + row.hintEarly + ' later=' + row.hintLater);
      }
      row.hintGeom = await ev(`(function(){
        var h = document.querySelector('.tut-hint');
        if (!h) return null;
        var tgt = document.querySelector('#askDisplay .f13-ball[data-furn="${st.click}"]');
        var hb = h.getBoundingClientRect(), tb = tgt ? tgt.getBoundingClientRect() : null;
        if (!tb) return null;
        // .tut-hint 用 translate(-50%,-100%) 定位，指尖 = 盒子底边中点
        var tipx = hb.left + hb.width / 2, tipy = hb.top + hb.height;
        var hit = document.elementFromPoint(tipx, tipy - 6);
        var ball = hit && hit.closest ? hit.closest('.f13-ball') : null;
        return { hitFurn: ball ? ball.dataset.furn : null,
                 nearTarget: tipx > tb.left - 4 && tipx < tb.right + 4 && tipy > tb.top - 10 && tipy < tb.bottom + 26,
                 stars: Game.stars };
      })()`);
      if (row.hintGeom && row.hintGeom.nearTarget === false) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）小手指没有指向正确的球');
      if (row.hintGeom && row.hintGeom.hitFurn !== st.click) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）小手指指尖不在正确的球上：' + row.hintGeom.hitFurn);
      if (row.hintGeom && row.hintGeom.stars !== 0) rep.errors.push('教学阶段不该有星星：' + row.hintGeom.stars);
      await sleep(300);
    }

    // 演示步（RULES §三.14 点按推进）：等「轻点继续」→ 验证不自动前进 → 点屏幕推进
    if (st.demo) {
      row.tapShown = await wait(sel('.f11-tap'), 5000);
      if (!row.tapShown) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示定格后没有出现「轻点继续」提示');
      await sleep(2200);
      row.autoAdvanced = (await ev('window.__stageLog.length')) > (i + 1);
      if (row.autoAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示未点按就自动前进了（违反 §三.14 点按推进）');
      await tap('#askDisplay .f13-room');
      row.advanced = await wait('window.__stageLog.length > ' + (i + 1), 6000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    if (st.click && !st.demo) {
      const before = await ev('window.__stageLog.length');
      const ballSel = '#askDisplay .f13-ball[data-furn="' + st.click + '"]';
      row.geo = await ev(`(function(){
        var b = document.querySelector(${JSON.stringify(ballSel)});
        if (!b) return null;
        var r = b.getBoundingClientRect();
        var svg = b.querySelector('svg');
        var sr = svg ? svg.getBoundingClientRect() : null;
        var hit = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
        return { w: Math.round(r.width), svgW: sr ? Math.round(sr.width) : null,
                 hotBigger: sr ? (r.width >= sr.width + 10) : false,
                 inTarget: hit ? !!(hit.closest && hit.closest(${JSON.stringify(ballSel)})) : false };
      })()`);
      if (!row.geo) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）找不到正确的球');
      else {
        if (!row.geo.inTarget) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）球心被遮挡');
        if (!row.geo.hotBigger) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）球的热区没有比图形大一圈');
        if (row.geo.svgW !== null && row.geo.svgW < 40) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）球画得太小：' + row.geo.svgW);
      }
      await tap(ballSel);
      await sleep(1400);
      row.clicked = true;
      row.advanced = await wait('window.__stageLog.length > ' + before, 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点对后没有推进');
    }
    rep.tutorial.push(row);
    console.log('STEP ' + (i + 1) + ' ' + JSON.stringify(row).slice(0, 340));
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
  let wrongPickTested = false;
  let wrongTargetTested = false;
  let dragUsed = false;

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(200);
    let snap = await ev('Game.snapshot()');
    let q = snap.question;
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, subj: q.subj, item: q.item, target: q.target, correct: q.correct, opts: q.options, audio: q.audio };

    if (q.type === 'F13A') {
      // 快照只暴露 options（"b:家具:方位"），目标家具 / 方位从正确项解析
      const ap = (q.options[q.correct] || '').split(':');
      q.furn = ap[1]; q.place = ap[2];
      row.balls = await ev('document.querySelectorAll("#askDisplay .f13-ball").length');
      row.uniqueOpts = new Set(q.options).size;
      row.answerOk = q.options[q.correct] === ('b:' + q.furn + ':' + q.place);
      row.audioOk = q.audio === A_KEY[q.furn + ':' + q.place];
      if (row.balls !== 3) rep.errors.push('第 ' + r + ' 轮球的数量异常：' + row.balls);
      if (row.uniqueOpts !== 3) rep.errors.push('第 ' + r + ' 轮球的位置重复：' + JSON.stringify(q.options));
      if (!row.answerOk) rep.errors.push('第 ' + r + ' 轮正确答案指向错误：' + JSON.stringify(q.options) + ' want=b:' + q.furn + ':' + q.place);
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮语音与目标不一致：' + q.audio + ' furn=' + q.furn + ' place=' + q.place);
      if (q.options.filter(f => f === ('b:' + q.furn + ':' + q.place)).length !== 1) rep.errors.push('第 ' + r + ' 轮目标球不唯一：' + JSON.stringify(q.options));
      row.ballGeom = await ev(`(function(){
        var b = document.querySelector('#askDisplay .f13-ball[data-furn="${q.furn}"]');
        if (!b) return null;
        var r = b.getBoundingClientRect(), s = b.querySelector('svg').getBoundingClientRect();
        return { hot: Math.round(r.width), draw: Math.round(s.width) };
      })()`);
      if (row.ballGeom && row.ballGeom.draw < 40) rep.errors.push('第 ' + r + ' 轮球画得太小：' + row.ballGeom.draw);
      if (row.ballGeom && row.ballGeom.hot < row.ballGeom.draw + 10) rep.errors.push('第 ' + r + ' 轮球的热区不够大：' + JSON.stringify(row.ballGeom));
    }

    if (q.type === 'F13B') {
      row.tiles = await ev('document.querySelectorAll("#askDisplay .f9-tile").length');
      row.uniqueOpts = new Set(q.options).size;
      row.answerOk = q.options[q.correct] === ('s:' + q.subj);
      row.audioOk = q.audio === B_KEY[q.subj];
      if (row.tiles !== 3) rep.errors.push('第 ' + r + ' 轮小图数量异常：' + row.tiles);
      if (row.uniqueOpts !== 3) rep.errors.push('第 ' + r + ' 轮小图重复：' + JSON.stringify(q.options));
      if (!row.answerOk) rep.errors.push('第 ' + r + ' 轮正确答案指向错误：' + JSON.stringify(q.options) + ' want=s:' + q.subj);
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮语音与目标不一致：' + q.audio + ' subj=' + q.subj);
      if (q.options.filter(f => f === ('s:' + q.subj)).length !== 1) rep.errors.push('第 ' + r + ' 轮目标小图不唯一：' + JSON.stringify(q.options));
    }

    if (q.type === 'F13C') {
      row.opts = await ev('document.querySelectorAll("#options .option:not([hidden])").length');
      row.dragAttrs = await ev('document.querySelectorAll("#options .option[data-drag]").length');
      row.answerOk = q.options[q.correct] === ('i:' + q.item);
      row.audioOk = q.audio === C_KEY[q.target];
      row.sofaShown = await ev('!!document.querySelector(\'#askDisplay .f11-furn[data-drop="sofa"]\')');
      row.tableShown = await ev('!!document.querySelector(\'#askDisplay .f11-furn[data-drop="table"]\')');
      row.ballOpt = await ev(`(function(){
        var o = document.querySelector('#options .option[data-drag] svg');
        if (!o) return null;
        var r = o.getBoundingClientRect();
        return { draw: Math.round(r.width) };
      })()`);
      if (row.opts !== 1) rep.errors.push('第 ' + r + ' 轮可选项不是 1 个（球）：' + row.opts);
      if (row.dragAttrs !== 1) rep.errors.push('第 ' + r + ' 轮可拖的球不是 1 个：' + row.dragAttrs);
      if (!row.answerOk) rep.errors.push('第 ' + r + ' 轮正确答案指向错误：' + JSON.stringify(q.options) + ' want=i:' + q.item);
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮语音与目标不一致：' + q.audio + ' target=' + q.target);
      if (!row.sofaShown || !row.tableShown) rep.errors.push('第 ' + r + ' 轮房间没有同时显示沙发和桌子');
      if (row.ballOpt && row.ballOpt.draw < 40) rep.errors.push('第 ' + r + ' 轮选项栏的球太小：' + row.ballOpt.draw);
    }

    if (!seenShot[q.type]) { seenShot[q.type] = 1; await sleep(400); await shot(TAG + '-q-' + q.type + '.png'); }

    if ((q.type === 'F13A' || q.type === 'F13B') && !wrongPickTested) {
      wrongPickTested = true;
      const wt = Date.now();
      if (q.type === 'F13A') {
        const wrongFurn = q.options.map(o => o.split(':')[1]).find(f => f !== q.furn);
        await tap('#askDisplay .f13-ball[data-furn="' + wrongFurn + '"]');
      } else {
        await tap('#askDisplay .f9-tile[data-idx="' + ((q.correct + 1) % 3) + '"]');
      }
      await sleep(1100);
      const after = await ev('Game.snapshot()');
      row.wrongPick = { advanced: after.round !== r, stillAsking: after.phase === 'asking',
        audio: (await keysBetween(wt - 150, wt + 2600)).filter(k => k !== 'unknown') };
      if (row.wrongPick.advanced) rep.errors.push('第 ' + r + ' 轮点错却前进了');
      await sleep(1800);
      snap = await ev('Game.snapshot()');
      q = snap.question;
      row.correctAfterShuffle = q.correct;
      // 重洗只是打乱顺序，正确项必须仍指向同一个目标
      const wantOk = q.type === 'F13A'
        ? (String(q.options[q.correct]).split(':')[1] === q.subj)
        : (q.options[q.correct] === ('s:' + q.subj));
      if (!wantOk) rep.errors.push('第 ' + r + ' 轮重洗后正确答案指向错误：' + JSON.stringify(q.options) + ' correct=' + q.correct + ' subj=' + q.subj);
    }

    if (q.type === 'F13C' && !wrongTargetTested) {
      wrongTargetTested = true;
      const wrongDrop = q.target === 'sofa' ? 'table' : 'sofa';
      const tgt = await rectOf('#askDisplay .f11-furn[data-drop="' + wrongDrop + '"]');
      await dragTo('#options .option[data-idx="' + q.correct + '"]', tgt.cx, tgt.cy);
      await sleep(1100);
      const after = await ev('Game.snapshot()');
      row.wrongTarget = { advanced: after.round !== r, stillAsking: after.phase === 'asking' };
      if (row.wrongTarget.advanced) rep.errors.push('第 ' + r + ' 轮把球放到错误家具上却判过了');
      await sleep(1500);
    }

    const before = await ev('Game.round');
    const starsBefore = await ev('Game.stars');
    const ct = Date.now();

    if (q.type === 'F13A') {
      const ap2 = (q.options[q.correct] || '').split(':');
      await tap('#askDisplay .f13-ball[data-furn="' + ap2[1] + '"]');
    } else if (q.type === 'F13B') {
      await tap('#askDisplay .f9-tile[data-idx="' + q.correct + '"]');
    } else if (!dragUsed) {
      dragUsed = true;
      const tgt = await rectOf('#askDisplay .f11-furn[data-drop="' + q.target + '"]');
      await dragTo('#options .option[data-idx="' + q.correct + '"]', tgt.cx, tgt.cy);
    } else {
      await tap('#options .option[data-idx="' + q.correct + '"]');
      await sleep(250);
      await tap('#askDisplay .f11-furn[data-drop="' + q.target + '"]');
    }

    if (q.type === 'F13C') {
      await sleep(180);
      row.placedRight = await ev(`!!document.querySelector('#askDisplay .f11-furn[data-drop="${q.target}"] .f13-on-furn')`);
      if (!row.placedRight) rep.errors.push('第 ' + r + ' 轮球没落到正确的家具上');
      if (!seenShot['C-placed']) { seenShot['C-placed'] = 1; await shot(TAG + '-q-F13C-placed.png'); }
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
    cleared: await ev('!!Game.progress.cleared["6-3"]'),
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
             node4Locked: n4.classList.contains('locked'),
             node4Playable: n4.classList.contains('playable'),
             node4Text: n4.textContent,
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
  const wrongOk = rep.tutorial.filter(s => s.wrongFirst).every(s => s.wrongPick && !s.wrongPick.advanced);
  const advanceOk = rep.tutorial.filter(s => s.click).every(s => s.advanced === true);
  const demoOk = rep.tutorial.filter(s => s.demo).every(s => s.tapShown === true && s.autoAdvanced === false && s.advanced === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1 && s.voiceOnCorrect.length === 0);
  const ok = rep.errors.length === 0 && sigOk && audioOk && hintOk && wrongOk && advanceOk && demoOk && roundsOk && noOverflow &&
    Object.keys(seenType).length === 3 && seenType.F13A === 4 && seenType.F13B === 4 && seenType.F13C === 4 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === false && rep.checks.done.cleared === true &&
    rep.checks.done.unlockedLevel === 4 &&
    rep.checks.islandAfter.node3Done === true &&
    rep.checks.islandAfter.node4Locked === false &&
    rep.checks.islandAfter.node4Playable === true &&   // 6-4 已上线，清 6-3 后第 4 关应可玩
    rep.checks.islandAfter.node4Text === '4' &&
    rep.checks.mapAfter.island6Unlocked === true && rep.checks.mapAfter.island6Cleared === false &&
    rep.checks.mapAfter.iconIsSvg === true &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0 &&
    rep.checks.englishIsland.length === 0 &&
    rep.checks.outro.ended === true &&
    rep.checks.overflowIsland.sw <= rep.checks.overflowIsland.iw + 1;
  console.log('\nsigOk=' + sigOk + ' audioOk=' + audioOk + ' hintOk=' + hintOk + ' wrongOk=' + wrongOk +
    ' advanceOk=' + advanceOk + ' demoOk=' + demoOk + ' roundsOk=' + roundsOk + ' noOverflow=' + noOverflow +
    ' steps=' + rep.checks.outro.totalSteps + ' types=' + JSON.stringify(seenType) +
    ' stars=' + rep.checks.done.stars + ' grand=' + rep.checks.done.grand +
    ' island6=' + rep.checks.mapAfter.island6Cleared + '/' + rep.checks.mapAfter.island6Unlocked);
  if (rep.errors.length) console.log('errors: ' + rep.errors.join(' | '));
  console.log(ok ? 'PROBE_PASS' : 'PROBE_FAIL');
  ws.close();
  proc.kill();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('PROBE_ERROR', e); try { proc.kill(); } catch (_) {} process.exit(2); });
