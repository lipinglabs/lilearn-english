// 第 10 岛第 2 关（L10-W2：快慢与方向 Fast / Slow / Left / Right）专项测试
//   1) 解锁链：10-1 未通时 10-2 锁定；通关 10-1 后 unlockedLevel[10]=2。
//   2) 教学 11 环节：赛跑 2 演示 → TPR 快/慢 2 互动 → 变道 2 演示 → 变道 1 互动 →
//      交警 2 演示 → 交警 1 互动 → 过渡；演示定格等点按（§三.14）、互动 4 秒小手（§二.12）。
//   3) 四题型 12 轮 3/3/3/3：A 变道拖拽 / B 快慢对比点选 / C TPR / D 快慢分类拖拽。
//   4) 通关：stars=12、cleared['10-2']、unlockedLevel[10]=2（10-3 不存在，不越界）。
//   5) 视觉：无英文字母、双视口无溢出。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'l102';
const PORT = 9890 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
const BOOT_TRIES = parseInt(process.env.L102_BOOT_TRIES || '1400', 10);

const A_KEY = { left: 'l102_t_left', right: 'l102_t_right' };
const C_KEY = { fast: 'l102_t_drive_fast', slow: 'l102_t_drive_slow' };
const D_KEY = { rocket: 'l102_d_rocket', snail: 'l102_d_snail', car: 'l102_d_car', turtle: 'l102_d_turtle' };

const STEPS = [
  { n: 'race1',      word: 'l102_t_race_car',     demo: true },
  { n: 'race2',      word: 'l102_t_race_turtle',  demo: true },
  { n: 'fastTpr',    word: 'l102_t_drive_fast',   tpr: true },
  { n: 'slowTpr',    word: 'l102_t_drive_slow',   tpr: true },
  { n: 'leftDemo',   word: 'l102_t_left',         demo: true },
  { n: 'rightDemo',  word: 'l102_t_right',        demo: true },
  { n: 'rightDrag',  word: 'l102_t_right_drag',   drag: { lane: 'right' } },
  { n: 'policeLeft', word: 'l102_t_police_left',  demo: true },
  { n: 'policeRight',word: 'l102_t_police_right', demo: true },
  { n: 'policeDrag', word: 'l102_t_police_left',  drag: { lane: 'left' } },
  { n: 'out',        word: 'l102_t_out',          out: true }
];

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-l102-' + Date.now()),
  '--window-size=' + W + ',' + H, 'about:blank'], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let id = 0; const pend = new Map();
let finished = false;
const finish = code => { if (finished) return; finished = true; try { proc.kill(); } catch (e) {} setTimeout(() => process.exit(code), 120); };

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
      function sig(){
        var s = document.querySelector('.l102-stage');
        if (!s) return null;
        return 'sid:' + (s.dataset.sid || '?');
      }
      function rec(){
        var x = sig();
        if (!x || x === last) return;
        last = x;
        window.__stageLog.push({ t: Date.now(), sig: x });
      }
      var mo = new MutationObserver(function(){ setTimeout(rec, 0); });
      window.addEventListener('DOMContentLoaded', function(){ mo.observe(document.body, { childList: true, subtree: true }); rec(); });
    })();
  ` }, sessionId);

  await send('Page.navigate', { url: URL_ }, sessionId);

  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
    if (r.exceptionDetails) throw new Error('EVAL: ' + expr.slice(0, 90) + ' => ' + JSON.stringify(r.exceptionDetails.exception));
    return r.result.value;
  };
  const wait = async (expr, ms = 14000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await ev(expr)) return true; await sleep(70); } return false; };
  const sel = s => '!!document.querySelector(' + JSON.stringify(s) + ')';

  for (let i = 0; i < BOOT_TRIES; i++) { if (await ev('typeof window.Game !== "undefined"')) break; await sleep(150); }
  await sleep(420);
  if (!(await ev('typeof window.Game !== "undefined"'))) { console.log('PROBE_ERROR boot'); finish(2); return; }

  const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mouseReleased' ? 0 : 1 }, sessionId);
  const clickXY = async (x, y) => { await mouse('mousePressed', x, y); await sleep(40); await mouse('mouseReleased', x, y); await sleep(80); };
  const centerOf = s => ev(`(function(){var e=document.querySelector(${JSON.stringify(s)});if(!e)return null;var r=e.getBoundingClientRect();return r.width&&r.height?{x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height}:null;})()`);
  const drag = async (fromSel, toSel) => {
    const a = await centerOf(fromSel), b = await centerOf(toSel);
    if (!a || !b) return false;
    await mouse('mousePressed', a.x, a.y);
    for (let i = 1; i <= 8; i++) await mouse('mouseMoved', a.x + (b.x - a.x) * i / 8, a.y + (b.y - a.y) * i / 8);
    await sleep(90);
    await mouse('mouseReleased', b.x, b.y);
    await sleep(120);
    return true;
  };
  const overflow = () => ev(`(function(){
    var d=document.documentElement, cut=[], zero=[];
    var iw=window.innerWidth, ih=window.innerHeight;
    Array.prototype.forEach.call(document.querySelectorAll('#screenLevel *'), function(n){
      var r=n.getBoundingClientRect(); if(!r.width||!r.height) return;
      if(r.right>iw+1||r.left<-1||r.bottom>ih+1||r.top<-1){
        if(r.width>2&&r.height>2) cut.push((n.tagName||'')+'.'+String(n.className||'').split(' ')[0]);
      }
    });
    Array.prototype.forEach.call(document.querySelectorAll('#askDisplay .l102-stage, #askDisplay .l102-lane, #askDisplay .l102-box, #askDisplay .l102-card, #askDisplay .l102-thumb'), function(n){
      var r=n.getBoundingClientRect(); if(!r.width||!r.height) zero.push((n.tagName||'')+'.'+String(n.className||'').split(' ')[0]);
    });
    return { sw: d.scrollWidth, iw: iw, sh: d.scrollHeight, ih: ih, cut: cut.slice(0,6), zero: zero.slice(0,6) };
  })()`);
  const keysBetween = (a, b) => ev(`window.__played.filter(function(p){return p.t>=${a}&&p.t<=${b};}).map(function(p){
    for (var k in window.VOICE_BANK) if (window.VOICE_BANK[k] === p.src) return k;
    return 'unknown';
  })`);

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };

  // ---------- 0) 解锁链 ----------
  await ev('Game.resetProgress()');
  await ev('for (var i=1;i<=7;i++){ for (var l=1;l<=5;l++) Game.markCleared(i,l); }');
  await ev('for (var l=1;l<=5;l++) Game.markCleared(8,l)');
  await ev('for (var l=1;l<=5;l++) Game.markCleared(9,l)');
  rep.checks.lockedBefore = await ev(`(function(){
    return { u10: Game.progress.unlockedLevel[10] || null, ui: Game.progress.unlockedIsland };
  })()`);
  if (rep.checks.lockedBefore.u10 !== 1) rep.errors.push('未通 10-1 时 unlockedLevel[10] 应为 1，实际 ' + rep.checks.lockedBefore.u10);
  await ev('Game.markCleared(10,1)');
  // markCleared(10,1) 只会在 10-2 存在时把 u10 推到 2
  rep.checks.after101 = await ev('JSON.stringify(Game.progress.unlockedLevel[10])');
  if (rep.checks.after101 !== '2') rep.errors.push('通关 10-1 后 unlockedLevel[10] 应为 2，实际 ' + rep.checks.after101);

  // ---------- 1) 教学 ----------
  await ev('Game.openIsland(10)'); await sleep(200);
  await ev('Game.enterLevel(2)'); await sleep(250);
  await ev('document.getElementById("btnStart").click()');
  await wait('Game.phase === "tutorial"', 6000);

  const findEntry = async (sig, cursor) => ev(`(function(){
    var s=${JSON.stringify(sig)};
    for (var k=${cursor};k<window.__stageLog.length;k++) if (window.__stageLog[k].sig===s) return k;
    return -1;
  })()`);

  let logCursor = 0;
  for (let i = 0; i < STEPS.length; i++) {
    const st = STEPS[i];
    let foundIdx = -1;
    const end = Date.now() + 18000;
    while (Date.now() < end) { foundIdx = await findEntry('sid:' + st.n, logCursor); if (foundIdx >= 0) break; await sleep(70); }
    const entry = foundIdx >= 0 ? JSON.parse(await ev('JSON.stringify(window.__stageLog[' + foundIdx + '])')) : null;
    if (foundIdx >= 0) logCursor = foundIdx + 1;
    const row = { step: st.n, reached: !!entry, sigOk: !!entry && entry.sig === 'sid:' + st.n };
    if (!row.sigOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）舞台不符：' + (entry ? entry.sig : 'missing'));

    if (entry) {
      await sleep(200);
      row.audio = (await keysBetween(entry.t - 900, entry.t + 3200)).filter(k => k !== 'unknown');
      row.audioOk = row.audio.indexOf(st.word) >= 0;
      if (!row.audioOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）语音不符：期望 ' + st.word + '，实际 ' + row.audio.join(','));
      if (!st.out) row.overflow = await overflow();
    }

    if (st.demo) {
      row.tapShown = await wait(sel('.f11-tap'), 9000);
      if (!row.tapShown) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示定格后没有出现「轻点继续」');
      row.autoAdvanced = (await ev('window.__stageLog.length')) > (foundIdx + 1);
      if (row.autoAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示未点按就自动前进了');
      const pt = await centerOf('#askDisplay .l102-stage');
      if (pt) await clickXY(pt.x, pt.y);
      row.advanced = await wait('window.__stageLog.length > ' + (foundIdx + 1), 6000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    if (st.tpr) {
      row.thumb = await centerOf('#askDisplay .l102-thumb');
      if (!row.thumb) { rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）没有 👍 按钮'); }
      else {
        row.thumbPx = Math.round(row.thumb.w);
        row.hint = await wait(sel('.tut-hint'), 7000);
        if (!row.hint) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手没有出现');
        const b4 = await ev('window.__stageLog.length');
        await clickXY(row.thumb.x, row.thumb.y);
        row.advanced = await wait('window.__stageLog.length > ' + b4, 6000);
        if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点 👍 后没有推进');
      }
    }

    if (st.drag) {
      row.hint = await wait(sel('.tut-hint'), 7000);
      if (!row.hint) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手没有出现');
      row.lanes = await ev('document.querySelectorAll("#askDisplay .l102-lane").length');
      if (row.lanes !== 3) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）车道不是 3 条：' + row.lanes);
      const before0 = await ev('window.__stageLog.length');
      const wrong = st.drag.lane === 'left' ? 'right' : 'left';
      await drag('#askDisplay .l102-car', '#askDisplay .l102-lane[data-lane="' + wrong + '"]');
      await sleep(650);
      row.wrongThen = {
        advanced: (await ev('window.__stageLog.length')) > before0,
        ghostGone: await ev('!document.querySelector(".drag-ghost")'),
        carThere: await ev('!!document.querySelector("#askDisplay .l102-car")')
      };
      if (row.wrongThen.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖到错误车道却推进了');
      if (row.wrongThen.ghostGone !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖拽幽灵没有回收');
      if (row.wrongThen.carThere !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖到错误车道后汽车消失了');
      // 正确车道
      const carR = await centerOf('#askDisplay .l102-car');
      const laneR = await centerOf('#askDisplay .l102-lane[data-lane="' + st.drag.lane + '"]');
      if (carR && laneR) {
        await mouse('mousePressed', carR.x, carR.y);
        for (let k = 1; k <= 8; k++) await mouse('mouseMoved', carR.x + (laneR.x - carR.x) * k / 8, carR.y + (laneR.y - carR.y) * k / 8);
        await sleep(80);
        await mouse('mouseReleased', laneR.x, laneR.y);
      }
      await sleep(240);
      row.carInLane = await ev('!!document.querySelector("#askDisplay .l102-lane[data-lane=\\"' + st.drag.lane + '\\"] .l102-car")');
      if (!row.carInLane) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）正确变道后车不在目标车道');
      row.advanced = await wait('window.__stageLog.length > ' + before0, 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖到正确车道后没有推进');
    }

    if (st.out) {
      row.ended = await wait('Game.phase === "asking"', 14000);
      if (row.ended !== true) rep.errors.push('过渡语播完没有进入答题');
    }
    rep.tutorial.push(row);
    console.log('STEP ' + (i + 1) + ' ' + JSON.stringify(row).slice(0, 400));
  }

  rep.checks.enterRounds = await wait('Game.phase === "asking"', 15000);
  if (!rep.checks.enterRounds) rep.errors.push('教学结束没有进入答题');
  await sleep(400);
  rep.checks.errs = await ev('window.__errs.slice(0,3)');
  if (rep.checks.errs.length) console.log('ERRS ' + JSON.stringify(rep.checks.errs));

  // ---------- 2) 12 轮 ----------
  const seenType = {};
  const wrongTested = { L102A: false, L102B: false, L102D: false };

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(380);
    const snap = await ev('Game.snapshot()');
    const q = snap.question;
    if (!q) { rep.errors.push('第 ' + r + ' 轮：答题未开始'); break; }
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, lane: q.l102lane, want: q.l102want, box: q.l102box, items: q.l102items, answer: q.l102answer };
    const starsBefore = await ev('Game.stars');
    row.audio = q.audio ? [q.audio] : [];
    let ct = Date.now();

    if (q.type === 'L102A') {
      row.lanes = await ev('document.querySelectorAll("#askDisplay .l102-lane").length');
      if (row.lanes !== 3) rep.errors.push('第 ' + r + ' 轮 L102A 车道不是 3 条：' + row.lanes);
      row.audioOk = q.audio === A_KEY[q.l102lane];
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L102A 语音不符：期望 ' + A_KEY[q.l102lane] + '，实际 ' + q.audio);
      row.bg = await ev(`(function(){
        var l=document.querySelector('#askDisplay .l102-lane[data-lane="left"] .l102-lane-art');
        var rr=document.querySelector('#askDisplay .l102-lane[data-lane="right"] .l102-lane-art');
        if(!l||!rr) return null;
        return { left: getComputedStyle(l).backgroundColor, right: getComputedStyle(rr).backgroundColor };
      })()`);
      if (!row.bg || row.bg.left === row.bg.right) rep.errors.push('第 ' + r + ' 轮 L102A 左右车道颜色没有区分：' + JSON.stringify(row.bg));
      if (!wrongTested.L102A) {
        wrongTested.L102A = true;
        const wrong = q.l102lane === 'left' ? 'right' : 'left';
        const ctw = Date.now();
        await drag('#askDisplay .l102-car', '#askDisplay .l102-lane[data-lane="' + wrong + '"]');
        await sleep(700);
        row.wrongVoice = (await keysBetween(ctw, ctw + 900)).filter(k => k !== 'unknown');
        if (row.wrongVoice.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 L102A 拖错车道没有温柔鼓励（again）');
        if ((await ev('Game.round')) > (r - 1)) rep.errors.push('第 ' + r + ' 轮 L102A 拖错车道却推进了');
      }
      ct = Date.now();
      await drag('#askDisplay .l102-car', '#askDisplay .l102-lane[data-lane="' + q.l102lane + '"]');
    } else if (q.type === 'L102B') {
      row.cards = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l102-pickcard'),function(n){return n.dataset.item;})");
      if (!row.cards || row.cards.length !== 2) rep.errors.push('第 ' + r + ' 轮 L102B 不是 2 张卡：' + JSON.stringify(row.cards));
      row.audioOk = q.audio === (q.l102want === 'fast' ? 'l102_b_fast' : 'l102_b_slow');
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L102B 语音不符：' + q.audio + ' want=' + q.l102want);
      if (!wrongTested.L102B && row.cards) {
        wrongTested.L102B = true;
        const wi = row.cards.findIndex(x => x !== q.l102item);
        if (wi >= 0) {
          const c = await centerOf('#askDisplay .l102-pickcard[data-idx="' + wi + '"]');
          const ctw = Date.now();
          if (c) await clickXY(c.x, c.y);
          await sleep(700);
          row.wrongVoice = (await keysBetween(ctw, ctw + 900)).filter(k => k !== 'unknown');
          if (row.wrongVoice.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 L102B 点错没有温柔鼓励（again）');
        }
      }
      const ci = await centerOf('#askDisplay .l102-pickcard[data-idx="' + q.l102answer + '"]');
      if (!ci) { rep.errors.push('第 ' + r + ' 轮 L102B 找不到答案卡'); break; }
      ct = Date.now();
      await clickXY(ci.x, ci.y);
    } else if (q.type === 'L102C') {
      const th = await centerOf('#askDisplay .l102-thumb');
      if (!th) { rep.errors.push('第 ' + r + ' 轮 L102C 没有 👍'); break; }
      row.thumbPx = Math.round(th.w);
      if (W <= 500 && th.w / W < 0.40) rep.errors.push('第 ' + r + ' 轮 L102C 👍 太小（' + Math.round(th.w / W * 100) + 'vw）');
      if (th.w < 148) rep.errors.push('第 ' + r + ' 轮 L102C 👍 太小（' + row.thumbPx + 'px）');
      row.audioOk = q.audio === C_KEY[q.l102want];
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L102C 语音不符：' + q.audio + ' want=' + q.l102want);
      ct = Date.now();
      await clickXY(th.x, th.y);
    } else {
      row.boxes = await ev('document.querySelectorAll("#askDisplay .l102-box").length');
      if (row.boxes !== 2) rep.errors.push('第 ' + r + ' 轮 L102D 框不是 2 个：' + row.boxes);
      row.cardCount = await ev('document.querySelectorAll("#askDisplay .l102-tray .l102-card").length');
      if (row.cardCount !== 2) rep.errors.push('第 ' + r + ' 轮 L102D 物品不是 2 件：' + row.cardCount);
      row.audioOk = q.audio === D_KEY[q.l102item];
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L102D 语音不符：期望 ' + D_KEY[q.l102item] + '，实际 ' + q.audio);
      if (!wrongTested.L102D) {
        wrongTested.L102D = true;
        const wrongBox = q.l102box === 'fast' ? 'slow' : 'fast';
        const ctw = Date.now();
        await drag('#askDisplay .l102-card[data-item="' + q.l102item + '"]', '#askDisplay .l102-box[data-box="' + wrongBox + '"]');
        await sleep(700);
        row.wrongVoice = (await keysBetween(ctw, ctw + 900)).filter(k => k !== 'unknown');
        if (row.wrongVoice.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 L102D 放错框没有温柔鼓励（again）');
        if ((await ev('Game.round')) > (r - 1)) rep.errors.push('第 ' + r + ' 轮 L102D 放错框却推进了');
      }
      ct = Date.now();
      await drag('#askDisplay .l102-card[data-item="' + q.l102item + '"]', '#askDisplay .l102-box[data-box="' + q.l102box + '"]');
    }

    await sleep(260);
    row.voiceOnCorrect = (await keysBetween(ct, ct + 400)).filter(k => k !== 'unknown');
    const advanced = await wait('Game.round > ' + (r - 1) + ' || Game.phase === "done"', 4500);
    row.advanced = advanced;
    row.starsDelta = (await ev('Game.stars')) - starsBefore;
    if (r === 1) row.overflow = await overflow();
    if (!advanced) rep.errors.push('第 ' + r + ' 轮没有推进（' + q.type + '）');
    if (row.voiceOnCorrect.length) rep.errors.push('第 ' + r + ' 轮答对后播放了语音：' + row.voiceOnCorrect.join(','));
    if (row.starsDelta !== 1) rep.errors.push('第 ' + r + ' 轮星星未 +1（' + row.starsDelta + '）');
    rep.rounds.push(row);
    await sleep(150);
  }

  await sleep(600);
  rep.checks.done = await ev(`(function(){
    return { phase: Game.phase, stars: Game.stars,
             grand: document.getElementById('viewDone').classList.contains('grand'),
             cleared: !!Game.progress.cleared['10-2'],
             u10: Game.progress.unlockedLevel[10] || null,
             ui: Game.progress.unlockedIsland };
  })()`);
  rep.checks.types = seenType;

  const scan = (root) => ev(`(function(){
    var bad = [];
    var t = document.querySelector(${JSON.stringify(root)});
    if (!t) return ['no-root'];
    /* 用 textContent 而不是 innerText：隐藏子树取 innerText 在 Chrome 下会给出异常值 */
    var txt = t.textContent || '';
    var m = txt.match(/[A-Za-z]+/g); if (m) bad.push('text:' + m.join(','));
    var labs = [];
    Array.prototype.forEach.call(t.querySelectorAll('[aria-label]'), function(n){
      var v = n.getAttribute('aria-label') || ''; if (/[A-Za-z]/.test(v)) labs.push(v);
    });
    if (labs.length) bad.push('aria:' + labs.join('|'));
    return bad;
  })()`);
  rep.checks.englishDone = await scan('#screenLevel');
  await ev('Game.backToMap()'); await sleep(450);
  rep.checks.englishMap = await scan('#screenMap');

  console.log(JSON.stringify(rep, null, 2));

  const sigOk = rep.tutorial.every(s => s.sigOk);
  const audioOk = rep.tutorial.every(s => s.audioOk);
  const demoOk = rep.tutorial.filter(s => s.demo).every(s => s.tapShown === true && s.autoAdvanced === false && s.advanced === true);
  const tprOk = rep.tutorial.filter(s => s.tpr).every(s => s.hint === true && s.advanced === true);
  const dragOk = rep.tutorial.filter(s => s.drag).every(s => s.hint === true && s.advanced === true && s.carInLane === true && s.wrongThen.advanced === false && s.wrongThen.carThere === true);
  const outOk = rep.tutorial.filter(s => s.out).every(s => s.ended === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1 && s.voiceOnCorrect.length === 0);
  const semOk = rep.rounds.every(s => s.audioOk === true);
  const noOv = o => !o || (o.sw <= o.iw + 1 && o.sh <= o.ih + 1 && o.cut.length === 0 && o.zero.length === 0);
  const noOverflow = rep.tutorial.every(s => noOv(s.overflow)) && noOv(rep.rounds[0] && rep.rounds[0].overflow);
  const ok = rep.errors.length === 0 && sigOk && audioOk && demoOk && tprOk && dragOk && outOk &&
    roundsOk && semOk && noOverflow &&
    rep.rounds.length === 12 &&
    seenType.L102A === 3 && seenType.L102B === 3 && seenType.L102C === 3 && seenType.L102D === 3 &&
    rep.checks.lockedBefore.u10 === 1 && rep.checks.after101 === '2' &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.cleared === true && rep.checks.done.u10 === 2 &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0;

  console.log('PROBE_' + (ok ? 'PASS' : 'FAIL') +
    ' sigOk=' + sigOk + ' audioOk=' + audioOk + ' demoOk=' + demoOk + ' tprOk=' + tprOk +
    ' dragOk=' + dragOk + ' outOk=' + outOk + ' roundsOk=' + roundsOk + ' semOk=' + semOk +
    ' noOverflow=' + noOverflow + ' steps=' + rep.tutorial.length +
    ' types=' + JSON.stringify(seenType) +
    ' stars=' + rep.checks.done.stars + ' grand=' + rep.checks.done.grand +
    ' cleared=' + rep.checks.done.cleared + ' u10=' + rep.checks.done.u10 +
    ' unlockedIsland=' + rep.checks.done.ui);

  finish(ok ? 0 : 1);
})().catch(e => { console.log('PROBE_ERROR', e && e.message); finish(2); });
