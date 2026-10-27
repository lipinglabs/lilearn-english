// 第 10 岛第 4 关（L10-W4：天气 Sunny / Rainy / Cloudy）专项测试
//   1) 解锁链：10-3 未通时 10-4 锁定；通关 10-3 后 unlockedLevel[10]=4。
//   2) 教学 10 环节：晴天 2 演示 + 1 互动 → 雨天 2 演示 + 1 互动 → 阴天 2 演示 + 1 点图 → 过渡；
//      演示定格等点按（§三.14）、互动 4 秒小手（§二.12）、拖错/点错只弹回不判错（§二.11）。
//   3) **本关严禁 TPR**：断言全程不存在大拇指按钮 / 「我做到了」标记，答题只允许 A/B/C。
//   4) 三题型 12 轮 4/4/4：A 找天气图标 / B 拖物品给小人 / C 三场景点选。
//   5) 通关：stars=12、cleared['10-4']、unlockedLevel[10]=4（10-5 不存在，不越界）。
//   6) 视觉：无英文字母、双视口无溢出。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'l104';
const PORT = 9910 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
const BOOT_TRIES = parseInt(process.env.L104_BOOT_TRIES || '1400', 10);

const A_KEY = { sunny: 'l104_a_sunny', rainy: 'l104_a_rainy', cloudy: 'l104_a_cloudy' };
const B_KEY = { sunny: 'l104_b_sunny', rainy: 'l104_b_rainy' };
const C_KEY = { sun: 'l104_c_sun', rain: 'l104_c_rain', cloud: 'l104_c_cloud' };
const ITEM_OF = { sunny: 'sunglasses', rainy: 'umbrella' };

const STEPS = [
  { n: 'sunny1',     word: 'l104_t_sunny',        demo: true },
  { n: 'sunny2',     word: 'l104_t_sunny2',       demo: true },
  { n: 'sunPut',     word: 'l104_t_sun_put',      drag: { item: 'sunglasses' } },
  { n: 'rainy1',     word: 'l104_t_rainy',        demo: true },
  { n: 'rainy2',     word: 'l104_t_rainy2',       demo: true },
  { n: 'rainPut',    word: 'l104_t_rain_put',     drag: { item: 'umbrella' } },
  { n: 'cloudy1',    word: 'l104_t_cloudy',       demo: true },
  { n: 'cloudy2',    word: 'l104_t_cloudy2',      demo: true },
  { n: 'cloudyPick', word: 'l104_t_cloudy_find',  pick: { kind: 'cloud' } },
  { n: 'out',        word: 'l104_t_out',          out: true }
];

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-l104-' + Date.now()),
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
        var s = document.querySelector('.l104-stage');
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
    Array.prototype.forEach.call(document.querySelectorAll('#askDisplay .l104-sky, #askDisplay .l104-card, #askDisplay .l104-icon, #askDisplay .l104-pic'), function(n){
      var r=n.getBoundingClientRect(); if(!r.width||!r.height) zero.push((n.tagName||'')+'.'+String(n.className||'').split(' ')[0]);
    });
    return { sw: d.scrollWidth, iw: iw, sh: d.scrollHeight, ih: ih, cut: cut.slice(0,6), zero: zero.slice(0,6) };
  })()`);
  const keysBetween = (a, b) => ev(`window.__played.filter(function(p){return p.t>=${a}&&p.t<=${b};}).map(function(p){
    for (var k in window.VOICE_BANK) if (window.VOICE_BANK[k] === p.src) return k;
    return 'unknown';
  })`);
  /* 本关严禁 TPR：任何时刻都不允许出现大拇指按钮 */
  const tprPresent = () => ev(`!!document.querySelector('#askDisplay .l104-thumb, #askDisplay [aria-label="我做到了"], #askDisplay .l104-tpr')`);

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };

  // ---------- 0) 解锁链 ----------
  await ev('Game.resetProgress()');
  await ev('for (var i=1;i<=7;i++){ for (var l=1;l<=5;l++) Game.markCleared(i,l); }');
  await ev('for (var l=1;l<=5;l++) Game.markCleared(8,l)');
  await ev('for (var l=1;l<=5;l++) Game.markCleared(9,l)');
  await ev('Game.markCleared(10,1)'); await ev('Game.markCleared(10,2)');
  rep.checks.lockedBefore = await ev('JSON.stringify(Game.progress.unlockedLevel[10])');
  if (rep.checks.lockedBefore !== '3') rep.errors.push('未通 10-3 时 unlockedLevel[10] 应为 3，实际 ' + rep.checks.lockedBefore);
  await ev('Game.markCleared(10,3)');
  rep.checks.after103 = await ev('JSON.stringify(Game.progress.unlockedLevel[10])');
  if (rep.checks.after103 !== '4') rep.errors.push('通关 10-3 后 unlockedLevel[10] 应为 4，实际 ' + rep.checks.after103);

  // ---------- 1) 教学 ----------
  await ev('Game.openIsland(10)'); await sleep(200);
  await ev('Game.enterLevel(4)'); await sleep(250);
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
      if (row.tpr) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）出现了 TPR 大拇指按钮（本关严禁）');
      if (!st.out) row.overflow = await overflow();
    }

    if (st.demo) {
      row.tapShown = await wait(sel('.f11-tap'), 10000);
      if (!row.tapShown) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示定格后没有出现「轻点继续」');
      row.autoAdvanced = (await ev('window.__stageLog.length')) > (foundIdx + 1);
      if (row.autoAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示未点按就自动前进了');
      const pt = await centerOf('#askDisplay .l104-stage');
      if (pt) await clickXY(pt.x, pt.y);
      row.advanced = await wait('window.__stageLog.length > ' + (foundIdx + 1), 6000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    if (st.drag) {
      row.hint = await wait(sel('.tut-hint'), 8000);
      if (!row.hint) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手没有出现');
      row.cards = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l104-tray .l104-card'),function(n){return n.dataset.item;})");
      if (!row.cards || row.cards.length !== 2) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）物品栏不是 2 件：' + JSON.stringify(row.cards));
      const before0 = await ev('window.__stageLog.length');
      const wrongItem = (row.cards || []).filter(x => x !== st.drag.item)[0];
      await drag('#askDisplay .l104-card[data-item="' + wrongItem + '"]', '#askDisplay .l104-sky');
      await sleep(650);
      row.wrongThen = {
        advanced: (await ev('window.__stageLog.length')) > before0,
        ghostGone: await ev('!document.querySelector(".drag-ghost")'),
        cardThere: await ev('!!document.querySelector("#askDisplay .l104-card[data-item=\\"' + wrongItem + '\\"]")')
      };
      if (row.wrongThen.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖错物品却推进了');
      if (row.wrongThen.ghostGone !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖拽幽灵没有回收');
      if (row.wrongThen.cardThere !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖错后卡片消失了');
      await drag('#askDisplay .l104-card[data-item="' + st.drag.item + '"]', '#askDisplay .l104-sky');
      row.advanced = await wait('window.__stageLog.length > ' + before0, 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖对物品后没有推进');
    }

    if (st.pick) {
      row.hint = await wait(sel('.tut-hint'), 8000);
      if (!row.hint) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手没有出现');
      row.pics = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l104-pic'),function(n){return n.dataset.pic;})");
      if (!row.pics || row.pics.length !== 3) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）图片不是 3 张：' + JSON.stringify(row.pics));
      const before0 = await ev('window.__stageLog.length');
      const wi = (row.pics || []).findIndex(x => x !== st.pick.kind);
      if (wi >= 0) {
        const cw = await centerOf('#askDisplay .l104-pic[data-idx="' + wi + '"]');
        if (cw) await clickXY(cw.x, cw.y);
        await sleep(500);
        if ((await ev('window.__stageLog.length')) > before0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错却推进了');
      }
      const c = await centerOf('#askDisplay .l104-pic[data-pic="' + st.pick.kind + '"]');
      if (c) await clickXY(c.x, c.y);
      row.advanced = await wait('window.__stageLog.length > ' + before0, 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点对后没有推进');
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
  const wrongTested = { L104A: false, L104B: false, L104C: false };

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(380);
    const snap = await ev('Game.snapshot()');
    const q = snap.question;
    if (!q) { rep.errors.push('第 ' + r + ' 轮：答题未开始'); break; }
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, weather: q.l104weather, item: q.l104item, kind: q.l104kind, answer: q.l104answer };
    const starsBefore = await ev('Game.stars');
    row.audio = q.audio ? [q.audio] : [];
    let ct = Date.now();
    if (!seenOv[q.type]) { seenOv[q.type] = 1; row.overflow = await overflow(); }
    row.tpr = await tprPresent();
    if (row.tpr) rep.errors.push('第 ' + r + ' 轮出现了 TPR 大拇指按钮（本关严禁）');

    if (q.type === 'L104A') {
      row.icons = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l104-icon'),function(n){return n.dataset.weather;})");
      if (!row.icons || row.icons.length !== 3) rep.errors.push('第 ' + r + ' 轮 L104A 图标不是 3 个：' + JSON.stringify(row.icons));
      if (row.icons && new Set(row.icons).size !== 3) rep.errors.push('第 ' + r + ' 轮 L104A 图标重复：' + JSON.stringify(row.icons));
      row.audioOk = q.audio === A_KEY[q.l104weather];
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L104A 语音不符：期望 ' + A_KEY[q.l104weather] + '，实际 ' + q.audio);
      if (!wrongTested.L104A && row.icons) {
        wrongTested.L104A = true;
        const wi = row.icons.findIndex(x => x !== q.l104weather);
        const cw = await centerOf('#askDisplay .l104-icon[data-idx="' + wi + '"]');
        const ctw = Date.now();
        if (cw) await clickXY(cw.x, cw.y);
        await sleep(700);
        row.wrongVoice = (await keysBetween(ctw, ctw + 900)).filter(k => k !== 'unknown');
        if (row.wrongVoice.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 L104A 点错没有温柔鼓励（again）');
        if ((await ev('Game.round')) > (r - 1)) rep.errors.push('第 ' + r + ' 轮 L104A 点错却推进了');
      }
      const c = await centerOf('#askDisplay .l104-icon[data-idx="' + q.l104answer + '"]');
      if (!c) { rep.errors.push('第 ' + r + ' 轮 L104A 找不到答案图标'); break; }
      ct = Date.now();
      await clickXY(c.x, c.y);
    } else if (q.type === 'L104B') {
      row.cards = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l104-tray .l104-card'),function(n){return n.dataset.item;})");
      if (!row.cards || row.cards.length !== 3) rep.errors.push('第 ' + r + ' 轮 L104B 物品不是 3 件：' + JSON.stringify(row.cards));
      row.audioOk = q.audio === B_KEY[q.l104weather];
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L104B 语音不符：' + q.audio + ' weather=' + q.l104weather);
      row.weatherShown = await ev('(function(){var s=document.querySelector("#askDisplay .l104-sky");return s?s.dataset.weather:null;})()');
      if (row.weatherShown !== q.l104weather) rep.errors.push('第 ' + r + ' 轮 L104B 舞台天气不符：' + row.weatherShown + ' vs ' + q.l104weather);
      if (!wrongTested.L104B && row.cards) {
        wrongTested.L104B = true;
        const wi = row.cards.find(x => x !== q.l104item);
        if (wi) {
          const ctw = Date.now();
          await drag('#askDisplay .l104-card[data-item="' + wi + '"]', '#askDisplay .l104-sky');
          await sleep(700);
          row.wrongVoice = (await keysBetween(ctw, ctw + 900)).filter(k => k !== 'unknown');
          if (row.wrongVoice.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 L104B 拖错物品没有温柔鼓励（again）');
          if ((await ev('Game.round')) > (r - 1)) rep.errors.push('第 ' + r + ' 轮 L104B 拖错物品却推进了');
        }
      }
      ct = Date.now();
      await drag('#askDisplay .l104-card[data-item="' + q.l104item + '"]', '#askDisplay .l104-sky');
    } else {
      row.pics = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l104-pic'),function(n){return n.dataset.pic;})");
      if (!row.pics || row.pics.length !== 3) rep.errors.push('第 ' + r + ' 轮 L104C 图片不是 3 张：' + JSON.stringify(row.pics));
      if (row.pics && new Set(row.pics).size !== 3) rep.errors.push('第 ' + r + ' 轮 L104C 图片重复：' + JSON.stringify(row.pics));
      row.audioOk = q.audio === C_KEY[q.l104kind];
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L104C 语音不符：期望 ' + C_KEY[q.l104kind] + '，实际 ' + q.audio);
      if (!wrongTested.L104C && row.pics) {
        wrongTested.L104C = true;
        const wi = row.pics.findIndex(x => x !== q.l104kind);
        const cw = await centerOf('#askDisplay .l104-pic[data-idx="' + wi + '"]');
        const ctw = Date.now();
        if (cw) await clickXY(cw.x, cw.y);
        await sleep(700);
        row.wrongVoice = (await keysBetween(ctw, ctw + 900)).filter(k => k !== 'unknown');
        if (row.wrongVoice.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 L104C 点错没有温柔鼓励（again）');
        if ((await ev('Game.round')) > (r - 1)) rep.errors.push('第 ' + r + ' 轮 L104C 点错却推进了');
      }
      const c = await centerOf('#askDisplay .l104-pic[data-idx="' + q.l104answer + '"]');
      if (!c) { rep.errors.push('第 ' + r + ' 轮 L104C 找不到答案图'); break; }
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

  await sleep(600);
  rep.checks.done = await ev(`(function(){
    return { phase: Game.phase, stars: Game.stars,
             grand: document.getElementById('viewDone').classList.contains('grand'),
             cleared: !!Game.progress.cleared['10-4'],
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
  await ev('Game.backToMap()'); await sleep(450);
  rep.checks.englishMap = await scan('#screenMap');

  console.log(JSON.stringify(rep, null, 2));

  const sigOk = rep.tutorial.every(s => s.sigOk);
  const audioOk = rep.tutorial.every(s => s.audioOk);
  const demoOk = rep.tutorial.filter(s => s.demo).every(s => s.tapShown === true && s.autoAdvanced === false && s.advanced === true);
  const dragOk = rep.tutorial.filter(s => s.drag).every(s => s.hint === true && s.advanced === true && s.wrongThen.advanced === false && s.wrongThen.cardThere === true);
  const pickOk = rep.tutorial.filter(s => s.pick).every(s => s.hint === true && s.advanced === true);
  const outOk = rep.tutorial.filter(s => s.out).every(s => s.ended === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1 && s.voiceOnCorrect.length === 0);
  const semOk = rep.rounds.every(s => s.audioOk === true);
  const noTpr = rep.tutorial.every(s => s.tpr === false) && rep.rounds.every(s => s.tpr === false);
  const noOv = o => !o || (o.sw <= o.iw + 1 && o.sh <= o.ih + 1 && o.cut.length === 0 && o.zero.length === 0);
  const noOverflow = rep.tutorial.every(s => noOv(s.overflow)) && rep.rounds.every(s => noOv(s.overflow));
  const ok = rep.errors.length === 0 && sigOk && audioOk && demoOk && dragOk && pickOk && outOk &&
    roundsOk && semOk && noTpr && noOverflow &&
    rep.rounds.length === 12 &&
    seenType.L104A === 4 && seenType.L104B === 4 && seenType.L104C === 4 &&
    rep.checks.lockedBefore === '3' && rep.checks.after103 === '4' &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.cleared === true && rep.checks.done.u10 === 4 &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0;

  console.log('PROBE_' + (ok ? 'PASS' : 'FAIL') +
    ' sigOk=' + sigOk + ' audioOk=' + audioOk + ' demoOk=' + demoOk +
    ' dragOk=' + dragOk + ' pickOk=' + pickOk + ' outOk=' + outOk +
    ' roundsOk=' + roundsOk + ' semOk=' + semOk + ' noTpr=' + noTpr +
    ' noOverflow=' + noOverflow + ' steps=' + rep.tutorial.length +
    ' types=' + JSON.stringify(seenType) +
    ' stars=' + rep.checks.done.stars + ' grand=' + rep.checks.done.grand +
    ' cleared=' + rep.checks.done.cleared + ' u10=' + rep.checks.done.u10);

  finish(ok ? 0 : 1);
})().catch(e => { console.log('PROBE_ERROR', e && e.message); finish(2); });
