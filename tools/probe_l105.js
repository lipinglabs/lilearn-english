// 第 10 岛第 5 关（L10-W5：游乐场 · 交通与自然终极考验）专项测试
//   1) 解锁链：10-4 未通时 10-5 锁定；通关 10-4 后 unlockedLevel[10]=5。
//   2) 教学 9 环节：快/左转 2 演示 → 右转互动 → 红灯 2 演示 → 绿灯互动 → 下雨 2 演示 → 过渡；
//      演示定格等点按（§三.14）、互动 4 秒小手（§二.12）、拖错车道只弹回不判错（§二.11）。
//   3) 三题型 12 轮 4/4/4：A 天气+方向拖车道 / B 三张场景点选 / C 三个标志点选。
//   4) 通关：stars=12、grand=true（岛末关）、cleared['10-5']、第 10 岛地图小旗亮起、unlockedIsland=11。
//   5) 视觉：无英文字母、双视口无溢出、全程无 TPR 大拇指。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const os = require('os'), path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'l105';
const PORT = 9914 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
const BOOT_TRIES = parseInt(process.env.L105_BOOT_TRIES || '1400', 10);

const A_KEY = {
  sunny_left: 'l105_a_sunny_left', sunny_right: 'l105_a_sunny_right',
  rainy_left: 'l105_a_rainy_left', rainy_right: 'l105_a_rainy_right',
  cloudy_left: 'l105_a_cloudy_left', cloudy_right: 'l105_a_cloudy_right'
};
const B_KEY = { green_go: 'l103_b_green_go', red_stop: 'l103_b_red_stop', rain_umbrella: 'l105_b_rain' };
const C_KEY = { sun: 'l104_a_sunny', umbrella: 'l105_c_umbrella', redlight: 'l105_c_stop' };

const STEPS = [
  { n: 'fast1', word: 'l105_t_fast', demo: true },
  { n: 'left2', word: 'l105_t_left', demo: true },
  { n: 'rightPut', word: 'l105_t_right_put', drag: { lane: 'right', wrong: 'left' } },
  { n: 'red1', word: 'l105_t_red', demo: true },
  { n: 'stop2', word: 'l105_t_stop', demo: true },
  { n: 'goPut', word: 'l105_t_go', drag: { goal: true, wrong: 'left' } },
  { n: 'rain1', word: 'l105_t_rain', demo: true },
  { n: 'rain2', word: 'l105_t_rain2', demo: true },
  { n: 'out', word: 'l105_t_out', out: true }
];

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-l105-' + Date.now()),
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
        var s = document.querySelector('.l105-stage');
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
    for (let i = 1; i <= 9; i++) await mouse('mouseMoved', a.x + (b.x - a.x) * i / 9, a.y + (b.y - a.y) * i / 9);
    await sleep(90);
    await mouse('mouseReleased', b.x, b.y);
    await sleep(130);
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
    Array.prototype.forEach.call(document.querySelectorAll('#askDisplay .l105-race, #askDisplay .l105-lane, #askDisplay .l105-car, #askDisplay .l105-pic, #askDisplay .l105-icon'), function(n){
      var r=n.getBoundingClientRect(); if(!r.width||!r.height) zero.push((n.tagName||'')+'.'+String(n.className||'').split(' ')[0]);
    });
    return { sw: d.scrollWidth, iw: iw, sh: d.scrollHeight, ih: ih, cut: cut.slice(0,6), zero: zero.slice(0,6) };
  })()`);
  const keysBetween = (a, b) => ev(`window.__played.filter(function(p){return p.t>=${a}&&p.t<=${b};}).map(function(p){
    for (var k in window.VOICE_BANK) if (window.VOICE_BANK[k] === p.src) return k;
    return 'unknown';
  })`);
  /* 本关题面全是拖拽 / 点选，不允许出现 TPR 大拇指 */
  const tprPresent = () => ev(`!!document.querySelector('#askDisplay .l105-thumb, #askDisplay [aria-label="我做到了"], #askDisplay .l105-tpr')`);
  const carAt = () => ev(`(function(){var c=document.querySelector('#askDisplay .l105-car');return c?c.dataset.at:null;})()`);

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };

  // ---------- 0) 解锁链 ----------
  await ev('Game.resetProgress()');
  await ev('for (var i=1;i<=7;i++){ for (var l=1;l<=5;l++) Game.markCleared(i,l); }');
  await ev('for (var l=1;l<=5;l++) Game.markCleared(8,l)');
  await ev('for (var l=1;l<=5;l++) Game.markCleared(9,l)');
  await ev('Game.markCleared(10,1)'); await ev('Game.markCleared(10,2)'); await ev('Game.markCleared(10,3)');
  rep.checks.lockedBefore = await ev('JSON.stringify(Game.progress.unlockedLevel[10])');
  if (rep.checks.lockedBefore !== '4') rep.errors.push('未通 10-4 时 unlockedLevel[10] 应为 4，实际 ' + rep.checks.lockedBefore);
  await ev('Game.markCleared(10,4)');
  rep.checks.after104 = await ev('JSON.stringify(Game.progress.unlockedLevel[10])');
  if (rep.checks.after104 !== '5') rep.errors.push('通关 10-4 后 unlockedLevel[10] 应为 5，实际 ' + rep.checks.after104);

  // ---------- 1) 教学 ----------
  await ev('Game.openIsland(10)'); await sleep(200);
  await ev('Game.enterLevel(5)'); await sleep(250);
  await ev('document.getElementById("btnStart").click()');
  await wait('Game.phase === "tutorial"', 8000);

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
      row.tpr = await tprPresent();
      if (row.tpr) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）出现了 TPR 大拇指按钮');
      row.lanes = await ev('document.querySelectorAll("#askDisplay .l105-lane").length');
      row.car = await carAt();
      if (!st.out) {
        if (row.lanes !== 3) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）车道不是 3 条：' + row.lanes);
        if (!row.car) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）舞台里没有小汽车');
      }
      if (!st.out) row.overflow = await overflow();
    }

    if (st.demo) {
      row.tapShown = await wait(sel('.f11-tap'), 10000);
      if (!row.tapShown) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示定格后没有出现「轻点继续」');
      row.autoAdvanced = (await ev('window.__stageLog.length')) > (foundIdx + 1);
      if (row.autoAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示未点按就自动前进了');
      row.carEnd = await carAt();
      const pt = await centerOf('#askDisplay .l105-stage');
      if (pt) await clickXY(pt.x, pt.y);
      row.advanced = await wait('window.__stageLog.length > ' + (foundIdx + 1), 6000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    if (st.drag) {
      row.hint = await wait(sel('.tut-hint'), 8000);
      if (!row.hint) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手没有出现');
      const before0 = await ev('window.__stageLog.length');
      /* ① 先拖到错的地方：只许弹回，不许推进、车不许消失 */
      const wrongSel = '#askDisplay .l105-lane[data-lane="' + st.drag.wrong + '"]';
      await drag('#askDisplay .l105-car', wrongSel);
      await sleep(700);
      row.wrongThen = {
        advanced: (await ev('window.__stageLog.length')) > before0,
        ghostGone: await ev('!document.querySelector(".drag-ghost")'),
        carThere: await ev('!!document.querySelector("#askDisplay .l105-car")')
      };
      if (row.wrongThen.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖错位置却推进了');
      if (row.wrongThen.ghostGone !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖拽幽灵没有回收');
      if (row.wrongThen.carThere !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖错后小汽车消失了');
      /* ② 再拖对 */
      const okSel = st.drag.lane
        ? '#askDisplay .l105-lane[data-lane="' + st.drag.lane + '"]'
        : '#askDisplay .l105-goal';
      await drag('#askDisplay .l105-car', okSel);
      /* 必须在推进之前读车位：推进后舞台会换成下一步，读到的是下一台车 */
      await sleep(240);
      row.carEnd = await carAt();
      row.advanced = await wait('window.__stageLog.length > ' + before0, 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖到正确位置后没有推进');
      if (st.drag.lane && row.advanced && row.carEnd !== st.drag.lane) {
        rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）车没有停到目标车道：' + row.carEnd);
      }
      if (st.drag.goal && row.advanced && row.carEnd !== 'past') {
        rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）车没有开到斑马线对面：' + row.carEnd);
      }
    }

    if (st.out) {
      row.ended = await wait('Game.phase === "asking"', 14000);
      if (row.ended !== true) rep.errors.push('过渡语播完没有进入答题');
    }
    rep.tutorial.push(row);
    console.log('STEP ' + (i + 1) + ' ' + JSON.stringify(row).slice(0, 380));
  }

  rep.checks.enterRounds = await wait('Game.phase === "asking"', 15000);
  if (!rep.checks.enterRounds) rep.errors.push('教学结束没有进入答题');
  await sleep(400);
  rep.checks.errs = await ev('window.__errs.slice(0,3)');
  if (rep.checks.errs.length) console.log('ERRS ' + JSON.stringify(rep.checks.errs));

  // ---------- 2) 12 轮 ----------
  const seenType = {};
  const seenOv = {};
  const wrongTested = { L105A: false, L105B: false, L105C: false };

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(400);
    const snap = await ev('Game.snapshot()');
    const q = snap.question;
    if (!q) { rep.errors.push('第 ' + r + ' 轮：答题未开始'); break; }
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, weather: q.l105weather, lane: q.l105lane, kind: q.l105kind, answer: q.l105answer };
    const starsBefore = await ev('Game.stars');
    row.audio = q.audio ? [q.audio] : [];
    let ct = Date.now();
    if (!seenOv[q.type]) { seenOv[q.type] = 1; row.overflow = await overflow(); }
    row.tpr = await tprPresent();
    if (row.tpr) rep.errors.push('第 ' + r + ' 轮出现了 TPR 大拇指按钮');

    if (q.type === 'L105A') {
      row.weatherShown = await ev('(function(){var s=document.querySelector("#askDisplay .l105-stage");return s?s.getAttribute("data-l105weather"):null;})()');
      if (row.weatherShown !== q.l105weather) rep.errors.push('第 ' + r + ' 轮 L105A 舞台天气不符：' + row.weatherShown + ' vs ' + q.l105weather);
      row.lanes = await ev('document.querySelectorAll("#askDisplay .l105-lane").length');
      if (row.lanes !== 3) rep.errors.push('第 ' + r + ' 轮 L105A 车道不是 3 条：' + row.lanes);
      row.car = await carAt();
      if (!row.car) rep.errors.push('第 ' + r + ' 轮 L105A 舞台里没有小汽车');
      const want = A_KEY[q.l105weather + '_' + q.l105lane];
      row.audioOk = q.audio === want;
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L105A 语音不符：期望 ' + want + '，实际 ' + q.audio);
      if (!wrongTested.L105A) {
        wrongTested.L105A = true;
        const bad = q.l105lane === 'left' ? 'right' : 'left';
        const ctw = Date.now();
        await drag('#askDisplay .l105-car', '#askDisplay .l105-lane[data-lane="' + bad + '"]');
        await sleep(750);
        row.wrongVoice = (await keysBetween(ctw, ctw + 900)).filter(k => k !== 'unknown');
        if (row.wrongVoice.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 L105A 拖错车道没有温柔鼓励（again）');
        if ((await ev('Game.round')) > (r - 1)) rep.errors.push('第 ' + r + ' 轮 L105A 拖错车道却推进了');
        row.carAfterWrong = await carAt();
        if (!row.carAfterWrong) rep.errors.push('第 ' + r + ' 轮 L105A 拖错后小汽车消失了');
      }
      ct = Date.now();
      await drag('#askDisplay .l105-car', '#askDisplay .l105-lane[data-lane="' + q.l105lane + '"]');
      row.carEnd = await carAt();
    } else if (q.type === 'L105B') {
      row.pics = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l105-pic'),function(n){return n.dataset.pic;})");
      if (!row.pics || row.pics.length !== 3) rep.errors.push('第 ' + r + ' 轮 L105B 图片不是 3 张：' + JSON.stringify(row.pics));
      if (row.pics && new Set(row.pics).size !== 3) rep.errors.push('第 ' + r + ' 轮 L105B 图片重复：' + JSON.stringify(row.pics));
      row.audioOk = q.audio === B_KEY[q.l105kind];
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L105B 语音不符：期望 ' + B_KEY[q.l105kind] + '，实际 ' + q.audio);
      if (!wrongTested.L105B && row.pics) {
        wrongTested.L105B = true;
        const wi = row.pics.findIndex(x => x !== q.l105kind);
        const cw = await centerOf('#askDisplay .l105-pic[data-idx="' + wi + '"]');
        const ctw = Date.now();
        if (cw) await clickXY(cw.x, cw.y);
        await sleep(700);
        row.wrongVoice = (await keysBetween(ctw, ctw + 900)).filter(k => k !== 'unknown');
        if (row.wrongVoice.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 L105B 点错没有温柔鼓励（again）');
        if ((await ev('Game.round')) > (r - 1)) rep.errors.push('第 ' + r + ' 轮 L105B 点错却推进了');
      }
      const c = await centerOf('#askDisplay .l105-pic[data-idx="' + q.l105answer + '"]');
      if (!c) { rep.errors.push('第 ' + r + ' 轮 L105B 找不到答案图'); break; }
      ct = Date.now();
      await clickXY(c.x, c.y);
    } else {
      row.icons = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l105-icon'),function(n){return n.dataset.icon;})");
      if (!row.icons || row.icons.length !== 3) rep.errors.push('第 ' + r + ' 轮 L105C 图标不是 3 个：' + JSON.stringify(row.icons));
      if (row.icons && new Set(row.icons).size !== 3) rep.errors.push('第 ' + r + ' 轮 L105C 图标重复：' + JSON.stringify(row.icons));
      row.audioOk = q.audio === C_KEY[q.l105kind];
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L105C 语音不符：期望 ' + C_KEY[q.l105kind] + '，实际 ' + q.audio);
      if (!wrongTested.L105C && row.icons) {
        wrongTested.L105C = true;
        const wi = row.icons.findIndex(x => x !== q.l105kind);
        const cw = await centerOf('#askDisplay .l105-icon[data-idx="' + wi + '"]');
        const ctw = Date.now();
        if (cw) await clickXY(cw.x, cw.y);
        await sleep(700);
        row.wrongVoice = (await keysBetween(ctw, ctw + 900)).filter(k => k !== 'unknown');
        if (row.wrongVoice.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 L105C 点错没有温柔鼓励（again）');
        if ((await ev('Game.round')) > (r - 1)) rep.errors.push('第 ' + r + ' 轮 L105C 点错却推进了');
      }
      const c = await centerOf('#askDisplay .l105-icon[data-idx="' + q.l105answer + '"]');
      if (!c) { rep.errors.push('第 ' + r + ' 轮 L105C 找不到答案图标'); break; }
      ct = Date.now();
      await clickXY(c.x, c.y);
    }

    await sleep(260);
    row.voiceOnCorrect = (await keysBetween(ct, ct + 400)).filter(k => k !== 'unknown');
    const advanced = await wait('Game.round > ' + (r - 1) + ' || Game.phase === "done"', 4500);
    row.advanced = advanced;
    row.starsDelta = (await ev('Game.stars')) - starsBefore;
    if (!advanced) rep.errors.push('第 ' + r + ' 轮没有推进（' + q.type + '）');
    if (row.voiceOnCorrect.length) rep.errors.push('第 ' + r + ' 轮答对后播放了语音：' + row.voiceOnCorrect.join(','));
    if (row.starsDelta !== 1) rep.errors.push('第 ' + r + ' 轮星星未 +1（' + row.starsDelta + '）');
    rep.rounds.push(row);
    await sleep(150);
  }

  await sleep(700);
  rep.checks.done = await ev(`(function(){
    return { phase: Game.phase, stars: Game.stars,
             grand: document.getElementById('viewDone').classList.contains('grand'),
             stageFlag: !!document.querySelector('.stage .island-flag'),
             cleared: !!Game.progress.cleared['10-5'],
             u10: Game.progress.unlockedLevel[10] || null,
             ui: Game.progress.unlockedIsland };
  })()`);
  rep.checks.types = seenType;

  const scan = (root) => ev(`(function(){
    var bad = [];
    var t = document.querySelector(${JSON.stringify(root)});
    if (!t) return ['no-root'];
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
  await ev('Game.backToMap()'); await sleep(500);
  rep.checks.englishMap = await scan('#screenMap');
  rep.checks.mapFlag = await ev(`(function(){
    var c=document.querySelector('#islandGrid .island[data-island="10"]');
    if(!c) return null;
    return { cleared: c.classList.contains('cleared'), badge: !!c.querySelector('.island-flag-badge') };
  })()`);
  if (!rep.checks.mapFlag) rep.errors.push('地图上找不到第 10 岛');
  else {
    if (rep.checks.mapFlag.cleared !== true) rep.errors.push('通关 10-5 后第 10 岛未标记为已通关');
    if (rep.checks.mapFlag.badge !== true) rep.errors.push('通关 10-5 后第 10 岛没有亮起通关小旗');
  }

  console.log(JSON.stringify(rep, null, 2));

  const sigOk = rep.tutorial.every(s => s.sigOk);
  const audioOk = rep.tutorial.every(s => s.audioOk);
  const demoOk = rep.tutorial.filter(s => s.demo).every(s => s.tapShown === true && s.autoAdvanced === false && s.advanced === true && !!s.car);
  const dragOk = rep.tutorial.filter(s => s.drag).every(s => s.hint === true && s.advanced === true && s.wrongThen.advanced === false && s.wrongThen.carThere === true && s.wrongThen.ghostGone === true);
  const outOk = rep.tutorial.filter(s => s.out).every(s => s.ended === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1 && s.voiceOnCorrect.length === 0);
  const semOk = rep.rounds.every(s => s.audioOk === true);
  const noTpr = rep.tutorial.every(s => s.tpr === false) && rep.rounds.every(s => s.tpr === false);
  const noOv = o => !o || (o.sw <= o.iw + 1 && o.sh <= o.ih + 1 && o.cut.length === 0 && o.zero.length === 0);
  const noOverflow = rep.tutorial.every(s => noOv(s.overflow)) && rep.rounds.every(s => noOv(s.overflow));
  const ok = rep.errors.length === 0 && sigOk && audioOk && demoOk && dragOk && outOk &&
    roundsOk && semOk && noTpr && noOverflow &&
    rep.rounds.length === 12 &&
    seenType.L105A === 4 && seenType.L105B === 4 && seenType.L105C === 4 &&
    rep.checks.lockedBefore === '4' && rep.checks.after104 === '5' &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === true && rep.checks.done.stageFlag === true &&
    rep.checks.done.cleared === true && rep.checks.done.u10 === 5 && rep.checks.done.ui === 11 &&
    rep.checks.mapFlag && rep.checks.mapFlag.cleared === true && rep.checks.mapFlag.badge === true &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0;

  console.log('PROBE_' + (ok ? 'PASS' : 'FAIL') +
    ' sigOk=' + sigOk + ' audioOk=' + audioOk + ' demoOk=' + demoOk +
    ' dragOk=' + dragOk + ' outOk=' + outOk +
    ' roundsOk=' + roundsOk + ' semOk=' + semOk + ' noTpr=' + noTpr +
    ' noOverflow=' + noOverflow + ' steps=' + rep.tutorial.length +
    ' types=' + JSON.stringify(seenType) +
    ' stars=' + rep.checks.done.stars + ' grand=' + rep.checks.done.grand +
    ' flag=' + JSON.stringify(rep.checks.mapFlag) +
    ' cleared=' + rep.checks.done.cleared + ' u10=' + rep.checks.done.u10 + ' ui=' + rep.checks.done.ui);

  finish(ok ? 0 : 1);
})().catch(e => { console.log('PROBE_ERROR', e && e.message); finish(2); });
