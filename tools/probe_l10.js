// 第 10 岛第 1 关（L10-W1：交通工具与场景分类 Car / Bus / Train / Plane）专项测试
//   1) 解锁链：9-5 未通时第 10 岛锁定；通关 9-5 后 unlockedIsland=10、unlockedLevel[10]=1；地图亮起第 10 岛。
//   2) 教学 10 环节：Car 2 演示 + 1 互动 / Plane 2 演示 + 1 互动 / Train + Bus 各 1 演示 / 综合互动 / 过渡；
//      演示语音播完必须定格等点按（§三.14）；互动 4 秒小手（§二.12）；拖错场景/拖空白弹回不判错（§二.11）。
//   3) 三题型：A 听音放场景（拖拽）/ B 听音找工具（点选 3 选 1）/ C TPR 模拟驾驶（👍 永远判对，§三.12）。
//   4) 12 轮 4/4/4：答对无人声、stars=12、cleared['10-1']=true、unlockedLevel[10]=1（10-2 不存在，不得越界）。
//   5) 视觉：无英文字母、双视口无溢出、无零尺寸。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'l10';
const PORT = 9880 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
const BOOT_TRIES = parseInt(process.env.L10_BOOT_TRIES || '1400', 10);

const STEPS = [
  { n: 'car1',     word: 'l10_t_car1',      demo: true },
  { n: 'car2',     word: 'l10_t_car2',      demo: true },
  { n: 'carPut',   word: 'l10_t_car_put',   drag: { item: 'car',   scene: 'road',   opts: ['car', 'plane'] } },
  { n: 'plane1',   word: 'l10_t_plane1',    demo: true },
  { n: 'plane2',   word: 'l10_t_plane2',    demo: true },
  { n: 'planePut', word: 'l10_t_plane_put', drag: { item: 'plane', scene: 'sky',    opts: ['plane', 'train'] } },
  { n: 'train',    word: 'l10_t_train',     demo: true },
  { n: 'bus',      word: 'l10_t_bus',       demo: true },
  { n: 'trainPut', word: 'l10_t_train_put', drag: { item: 'train', scene: 'tracks', opts: ['car', 'bus', 'train'] } },
  { n: 'out',      word: 'l10_t_out',       out: true }
];
const A_KEY = { car: 'l10_a_car_road', bus: 'l10_a_bus_road', train: 'l10_a_train_tracks', plane: 'l10_a_plane_sky' };
const B_KEY = { car: 'l10_b_car', bus: 'l10_b_bus', train: 'l10_b_train', plane: 'l10_b_plane' };
const C_KEY = { car: 'l10_c_car', bus: 'l10_c_bus', train: 'l10_c_train', plane: 'l10_c_plane' };
const SCENE_OF = { car: 'road', bus: 'road', train: 'tracks', plane: 'sky' };

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-l10-' + Date.now()),
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
        var s = document.querySelector('.l10-stage');
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
  if (!(await ev('typeof window.Game !== "undefined"'))) { console.log('PROBE_ERROR boot: Game undefined'); finish(2); return; }

  // ---- 点击 / 拖拽 ----
  const mouse = (type, x, y, extra) => send('Input.dispatchMouseEvent', Object.assign({
    type, x, y, button: 'left', clickCount: 1, buttons: type === 'mouseReleased' ? 0 : 1
  }, extra || {}), sessionId);
  const clickXY = async (x, y) => { await mouse('mousePressed', x, y); await sleep(40); await mouse('mouseReleased', x, y); await sleep(80); };
  const centerOf = s => ev(`(function(){var e=document.querySelector(${JSON.stringify(s)});if(!e)return null;var r=e.getBoundingClientRect();return r.width&&r.height?{x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height}:null;})()`);
  const drag = async (fromSel, toSel) => {
    const a = await centerOf(fromSel), b = await centerOf(toSel);
    if (!a || !b) return false;
    await mouse('mousePressed', a.x, a.y);
    const N = 8;
    for (let i = 1; i <= N; i++) await mouse('mouseMoved', a.x + (b.x - a.x) * i / N, a.y + (b.y - a.y) * i / N);
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
    Array.prototype.forEach.call(document.querySelectorAll('#askDisplay .l10-stage, #askDisplay .l10-scene, #askDisplay .l10-card, #askDisplay .l10-pickcard, #askDisplay .l10-thumb'), function(n){
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
  await ev('for (var l=1;l<=4;l++) Game.markCleared(9,l)');
  rep.checks.lockedBefore = await ev(`(function(){
    return { unlockedIsland: Game.progress.unlockedIsland,
             island10Locked: Game.progress.unlockedIsland < 10 };
  })()`);
  if (rep.checks.lockedBefore.unlockedIsland !== 9) rep.errors.push('未通 9-5 时 unlockedIsland 应为 9，实际 ' + rep.checks.lockedBefore.unlockedIsland);

  await ev('Game.markCleared(9,5)');
  rep.checks.after95 = await ev(`(function(){
    return { unlockedIsland: Game.progress.unlockedIsland,
             u10: Game.progress.unlockedLevel[10] || null,
             cleared95: !!Game.progress.cleared['9-5'] };
  })()`);
  if (rep.checks.after95.unlockedIsland !== 10) rep.errors.push('通关 9-5 后 unlockedIsland 应为 10，实际 ' + rep.checks.after95.unlockedIsland);
  if (rep.checks.after95.u10 !== 1) rep.errors.push('通关 9-5 后 unlockedLevel[10] 应为 1，实际 ' + rep.checks.after95.u10);

  // 地图第 10 岛要亮起（unlocked 而非 locked）
  await ev('Game.backToMap()'); await sleep(300);
  rep.checks.mapIsland10 = await ev(`(function(){
    var n=document.querySelector('.island[data-island="10"]');
    return n ? { cls: n.className, unlocked: n.classList.contains('unlocked'), name: (n.querySelector('.name')||{}).textContent } : null;
  })()`);
  if (!rep.checks.mapIsland10 || !rep.checks.mapIsland10.unlocked) rep.errors.push('地图第 10 岛未亮起（应含 unlocked）');

  // ---------- 1) 教学 ----------
  await ev('Game.openIsland(10)'); await sleep(200);
  await ev('Game.enterLevel(1)'); await sleep(250);
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
    const end = Date.now() + 15000;
    while (Date.now() < end) { foundIdx = await findEntry('sid:' + st.n, logCursor); if (foundIdx >= 0) break; await sleep(70); }
    const entry = foundIdx >= 0 ? JSON.parse(await ev('JSON.stringify(window.__stageLog[' + foundIdx + '])')) : null;
    if (foundIdx >= 0) logCursor = foundIdx + 1;
    const row = { step: st.n, reached: !!entry, sigOk: !!entry && entry.sig === 'sid:' + st.n };
    if (!row.sigOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）舞台不符：' + (entry ? entry.sig : 'missing'));

    if (entry) {
      await sleep(200);
      row.audio = (await keysBetween(entry.t - 900, entry.t + 3000)).filter(k => k !== 'unknown');
      row.audioOk = row.audio.indexOf(st.word) >= 0;
      if (!row.audioOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）语音不符：期望 ' + st.word + '，实际 ' + row.audio.join(','));
      // 过渡步的舞台会在语音结束后立刻换成答题舞台，场景数不再有意义
      if (!st.out) {
        row.scenes = await ev('document.querySelectorAll("#askDisplay .l10-scene").length');
        if (row.scenes !== 3) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）场景框不是 3 个：' + row.scenes);
        row.overflow = await overflow();
      }
    }

    if (st.demo) {
      row.tapShown = await wait(sel('.f11-tap'), 7000);
      if (!row.tapShown) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示定格后没有出现「轻点继续」');
      row.autoAdvanced = (await ev('window.__stageLog.length')) > (foundIdx + 1);
      if (row.autoAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示未点按就自动前进了');
      const pt = await centerOf('#askDisplay .l10-stage');
      if (pt) await clickXY(pt.x, pt.y);
      row.advanced = await wait('window.__stageLog.length > ' + (foundIdx + 1), 6000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    if (st.drag) {
      row.hint = await wait(sel('.tut-hint'), 7000);
      if (!row.hint) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手没有出现');
      row.cards = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l10-tray .l10-card'),function(n){return n.dataset.item;})");
      if (!row.cards || row.cards.length !== st.drag.opts.length) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）衣物栏件数不对：' + JSON.stringify(row.cards));
      const before0 = await ev('window.__stageLog.length');
      // ① 先拖到错误的场景：必须弹回、不判错、不推进
      const wrongScene = ['road', 'sky', 'tracks'].filter(x => x !== st.drag.scene)[0];
      await drag('#askDisplay .l10-tray .l10-card[data-item="' + st.drag.item + '"]', '#askDisplay .l10-scene[data-scene="' + wrongScene + '"]');
      await sleep(650);
      row.wrongThen = {
        advanced: (await ev('window.__stageLog.length')) > before0,
        stillThere: await ev('!!document.querySelector("#askDisplay .l10-tray .l10-card[data-item=\\"' + st.drag.item + '\\"]")'),
        ghostGone: await ev('!document.querySelector(".drag-ghost")')
      };
      if (row.wrongThen.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖到错误场景却推进了');
      if (row.wrongThen.stillThere !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖到错误场景后衣物消失了');
      if (row.wrongThen.ghostGone !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖拽幽灵没有回收');
      // ② 拖到正确场景：先是同步停进场景（要在换场前读），再等推进
      await drag('#askDisplay .l10-tray .l10-card[data-item="' + st.drag.item + '"]', '#askDisplay .l10-scene[data-scene="' + st.drag.scene + '"]');
      await sleep(240);
      row.vehInScene = await ev('!!document.querySelector("#askDisplay .l10-scene[data-scene=\\"' + st.drag.scene + '\\"] .l10-veh-in")');
      if (!row.vehInScene) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）正确投放后场景里没有出现交通工具');
      row.advanced = await wait('window.__stageLog.length > ' + before0, 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖到正确场景后没有推进');
    }

    if (st.out) {
      row.ended = await wait('Game.phase === "asking"', 12000);
      if (row.ended !== true) rep.errors.push('过渡语播完没有进入答题');
    }
    rep.tutorial.push(row);
    console.log('STEP ' + (i + 1) + ' ' + JSON.stringify(row).slice(0, 420));
  }

  rep.checks.enterRounds = await wait('Game.phase === "asking"', 15000);
  if (!rep.checks.enterRounds) rep.errors.push('教学结束没有进入答题');
  await sleep(400);
  rep.checks.errs = await ev('window.__errs.slice(0,3)');
  if (rep.checks.errs.length) console.log('ERRS ' + JSON.stringify(rep.checks.errs));

  // ---------- 2) 12 轮答题 ----------
  const seenType = {};
  const wrongTested = { L10A: false, L10B: false };

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(380);
    const snap = await ev('Game.snapshot()');
    const q = snap.question;
    if (!q) { rep.errors.push('第 ' + r + ' 轮：答题未开始'); break; }
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, item: q.l10item, scene: q.l10scene, items: q.l10items, answer: q.l10answer };
    const starsBefore = await ev('Game.stars');
    /* 快照的 question.audio 就是「首个语音键」字符串，直接用来校验题干语音，零竞态 */
    let ct = Date.now();
    row.audio = q.audio ? [q.audio] : [];

    if (q.type === 'L10A') {
      row.scenes = await ev('document.querySelectorAll("#askDisplay .l10-scene").length');
      if (row.scenes !== 3) rep.errors.push('第 ' + r + ' 轮 L10A 场景框不是 3 个：' + row.scenes);
      row.cards = await ev('document.querySelectorAll("#askDisplay .l10-tray .l10-card").length');
      if (row.cards !== 1) rep.errors.push('第 ' + r + ' 轮 L10A 衣物栏不是 1 件：' + row.cards);
      row.audioOk = q.audio === A_KEY[q.l10item];
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L10A 语音不符：期望 ' + A_KEY[q.l10item] + '，实际 ' + q.audio);
      row.thumbAbsent = (await ev('!document.querySelector("#askDisplay .l10-thumb")')) === true;
      if (!row.thumbAbsent) rep.errors.push('第 ' + r + ' 轮 L10A 不应出现 👍 按钮');

      // 错一次：拖到错误场景 → 播放 again、不推进
      if (!wrongTested.L10A) {
        wrongTested.L10A = true;
        const wrongScene = ['road', 'sky', 'tracks'].filter(x => x !== q.l10scene)[0];
        const ctw = Date.now();
        await drag('#askDisplay .l10-tray .l10-card[data-item="' + q.l10item + '"]', '#askDisplay .l10-scene[data-scene="' + wrongScene + '"]');
        await sleep(700);
        row.wrongVoice = (await keysBetween(ctw, ctw + 900)).filter(k => k !== 'unknown');
        row.wrongAdvanced = (await ev('Game.round')) > (r - 1) || (await ev('Game.phase')) === 'done';
        if (row.wrongVoice.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 L10A 拖错场景没有温柔鼓励（again）');
        if (row.wrongAdvanced) rep.errors.push('第 ' + r + ' 轮 L10A 拖错场景却推进了');
      }
      ct = Date.now();
      await drag('#askDisplay .l10-tray .l10-card[data-item="' + q.l10item + '"]', '#askDisplay .l10-scene[data-scene="' + q.l10scene + '"]');
    } else if (q.type === 'L10B') {
      row.cards = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l10-pickcard'),function(n){return n.dataset.item;})");
      if (!row.cards || row.cards.length !== 3) rep.errors.push('第 ' + r + ' 轮 L10B 不是 3 张卡：' + JSON.stringify(row.cards));
      row.distinct = !!row.cards && new Set(row.cards).size === 3;
      if (!row.distinct) rep.errors.push('第 ' + r + ' 轮 L10B 三张卡重复：' + JSON.stringify(row.cards));
      row.audioOk = q.audio === B_KEY[q.l10item];
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L10B 语音不符：期望 ' + B_KEY[q.l10item] + '，实际 ' + q.audio);
      if (!wrongTested.L10B && row.cards) {
        wrongTested.L10B = true;
        const wrongIdx = row.cards.findIndex(x => x !== q.l10item);
        if (wrongIdx >= 0) {
          const ctw = Date.now();
          await clickXY((await centerOf('#askDisplay .l10-pickcard[data-idx="' + wrongIdx + '"]')).x, (await centerOf('#askDisplay .l10-pickcard[data-idx="' + wrongIdx + '"]')).y);
          await sleep(700);
          row.wrongVoice = (await keysBetween(ctw, ctw + 900)).filter(k => k !== 'unknown');
          if (row.wrongVoice.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 L10B 点错没有温柔鼓励（again）');
          if ((await ev('Game.round')) > (r - 1)) rep.errors.push('第 ' + r + ' 轮 L10B 点错却推进了');
        }
      }
      const ci = await centerOf('#askDisplay .l10-pickcard[data-idx="' + q.l10answer + '"]');
      if (!ci) { rep.errors.push('第 ' + r + ' 轮 L10B 找不到答案卡'); break; }
      ct = Date.now();
      await clickXY(ci.x, ci.y);
    } else {
      // L10C：TPR，巨大 👍（≥44vw）
      const th = await centerOf('#askDisplay .l10-thumb');
      if (!th) { rep.errors.push('第 ' + r + ' 轮 L10C 没有 👍 按钮'); break; }
      row.thumbPx = Math.round(th.w);
      row.thumbVw = Math.round(th.w / W * 100);
      /* 工程约定：min(44vw, 190px)——手机屏按 44vw，宽屏封顶 190px；矮屏再收到 150px 仍然好按 */
      if (W <= 500 && th.w / W < 0.40) rep.errors.push('第 ' + r + ' 轮 L10C 👍 太小（' + row.thumbVw + 'vw，需 ≥40vw）');
      if (th.w < 148) rep.errors.push('第 ' + r + ' 轮 L10C 👍 太小（' + row.thumbPx + 'px，需 ≥150px）');
      row.audioOk = q.audio === C_KEY[q.l10item];
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L10C 语音不符：期望 ' + C_KEY[q.l10item] + '，实际 ' + q.audio);
      ct = Date.now();
      await clickXY(th.x, th.y);
    }

    await sleep(260);
    /* 答对后 430ms 内不许有人声：只统计「作答瞬间」起的窗口（430ms 后才是下一题题干） */
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

  // ---------- 3) 通关 ----------
  await sleep(600);
  rep.checks.done = await ev(`(function(){
    return { phase: Game.phase, stars: Game.stars,
             grand: document.getElementById('viewDone').classList.contains('grand'),
             cleared: !!Game.progress.cleared['10-1'],
             u10: Game.progress.unlockedLevel[10] || null,
             ui: Game.progress.unlockedIsland };
  })()`);
  rep.checks.types = seenType;

  // 无英文字母（含 aria-label）
  const scan = () => ev(`(function(){
    var bad = [];
    var t = document.getElementById('screenLevel');
    if (!t) return ['no-screen'];
    var txt = t.innerText || '';
    var m = txt.match(/[A-Za-z]+/g); if (m) bad.push('innerText:' + m.join(','));
    var labs = [];
    Array.prototype.forEach.call(t.querySelectorAll('[aria-label]'), function(n){
      var v = n.getAttribute('aria-label') || ''; if (/[A-Za-z]/.test(v)) labs.push(v);
    });
    if (labs.length) bad.push('aria:' + labs.join('|'));
    return bad;
  })()`);
  rep.checks.englishDone = await scan();
  await ev('Game.backToMap()'); await sleep(350);
  rep.checks.englishMap = await scan();

  console.log(JSON.stringify(rep, null, 2));

  const sigOk = rep.tutorial.every(s => s.sigOk);
  const audioOk = rep.tutorial.every(s => s.audioOk);
  const demoOk = rep.tutorial.filter(s => s.demo).every(s => s.tapShown === true && s.autoAdvanced === false && s.advanced === true);
  const hintOk = rep.tutorial.filter(s => s.drag).every(s => s.hint === true);
  const dragOk = rep.tutorial.filter(s => s.drag).every(s => s.advanced === true && s.vehInScene === true && s.wrongThen.advanced === false && s.wrongThen.stillThere === true);
  const outOk = rep.tutorial.filter(s => s.out).every(s => s.ended === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1 && s.voiceOnCorrect.length === 0);
  const semOk = rep.rounds.every(s => s.audioOk === true);
  const noOv = o => !o || (o.sw <= o.iw + 1 && o.sh <= o.ih + 1 && o.cut.length === 0 && o.zero.length === 0);
  const noOverflow = rep.tutorial.every(s => noOv(s.overflow)) && noOv(rep.rounds[0] && rep.rounds[0].overflow);
  const ok = rep.errors.length === 0 && sigOk && audioOk && demoOk && hintOk && dragOk && outOk &&
    roundsOk && semOk && noOverflow &&
    rep.rounds.length === 12 && seenType.L10A === 4 && seenType.L10B === 4 && seenType.L10C === 4 &&
    rep.checks.lockedBefore.unlockedIsland === 9 &&
    rep.checks.after95.unlockedIsland === 10 && rep.checks.after95.u10 === 1 &&
    rep.checks.mapIsland10 && rep.checks.mapIsland10.unlocked === true &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.cleared === true && rep.checks.done.u10 === 1 &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0;

  console.log('PROBE_' + (ok ? 'PASS' : 'FAIL') +
    ' sigOk=' + sigOk + ' audioOk=' + audioOk + ' demoOk=' + demoOk + ' hintOk=' + hintOk +
    ' dragOk=' + dragOk + ' outOk=' + outOk + ' roundsOk=' + roundsOk + ' semOk=' + semOk +
    ' noOverflow=' + noOverflow + ' steps=' + rep.tutorial.length +
    ' types=' + JSON.stringify(seenType) +
    ' stars=' + rep.checks.done.stars + ' grand=' + rep.checks.done.grand +
    ' cleared=' + rep.checks.done.cleared + ' u10=' + rep.checks.done.u10 +
    ' unlockedIsland=' + rep.checks.done.ui);

  finish(ok ? 0 : 1);
})().catch(e => { console.log('PROBE_ERROR', e && e.message); finish(2); });
