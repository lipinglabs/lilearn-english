// 第 8 岛第 4 关（L8-W4，综合感知 · 表情变变变）专项测试
//   1) 解锁链：1–7 全通 + 8-1/8-2/8-3 通关 → 8-4 才可玩。
//   2) 教学 9 环节（2 情境故事 × 2 演示 + 2 互动 + 过渡）：
//      演示语音播完定格，必须点屏幕才推进（§三.14），且演示 1 有「事件前→后」换脸；
//      互动：给物品（二选一，点错 again）、找情绪脸（三选一）、做生气表情（👍 永远判对）。
//   3) 三题型：A 听音找情景 / B 听因果选表情 / C TPR 拥抱（👍 永远判对）。
//   4) 12 轮（4/4/4）：答对无人声、通关星星=12、8-4 点亮、unlockedLevel[8]=5。
//   5) 视觉：无英文字母（innerText + aria-label）、双视口无溢出、元素无零尺寸。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'h4';
const PORT = 9787 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));

const A_KEY = { ice_fall: 'h4_a_ice', eat_apple: 'h4_a_apple', play_toy: 'h4_a_play', toy_gone: 'h4_a_gone' };
const B_KEY = { sad: 'h4_b_sad', angry: 'h4_b_angry', sleepy: 'h4_b_sleepy', happy: 'h4_b_happy' };
const C_KEYS = ['h4_c_hug', 'h4_c_hug2'];

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-h4-' + Date.now()),
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
        var s = document.querySelector('.h4-stage');
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
  const thumbGeom = () => ev(`(function(){
    var b = document.querySelector('#askDisplay .h4-thumb');
    if (!b) return null;
    var r = b.getBoundingClientRect();
    return { vw: Math.round(r.width / window.innerWidth * 100), px: Math.round(r.width),
             inView: r.right <= window.innerWidth + 1 && r.left >= -1 && r.bottom <= window.innerHeight + 1 && r.top >= -1 };
  })()`);
  const overflow = () => ev(`(function(){
    var de = document.documentElement;
    var cut = [], zero = [];
    Array.prototype.forEach.call(document.querySelectorAll('.h4-scene-card, .h4-face-card, .h4-item, .h4-thumb, .h4-stage, .h4-bstage, .h4-scene-svg, .h4-face-svg, .h4-kid-svg'), function(n){
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

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };

  // ---------- 0) 解锁链 ----------
  await ev('Game.resetProgress()');
  await ev('for (var isl = 1; isl <= 7; isl++) { for (var lv = 1; lv <= 5; lv++) Game.markCleared(isl, lv); }');
  await ev('Game.markCleared(8, 1); Game.markCleared(8, 2); Game.markCleared(8, 3)');
  await ev('Game.openIsland(8)');
  await sleep(400);
  rep.checks.unlock = await ev(`(function(){
    var n4 = document.querySelector('.node[data-level="4"]');
    return { node4Playable: n4 ? n4.classList.contains('playable') : false,
             island8HasIcon: !!document.querySelector('#islandHead .big-icon svg, #islandHead .big-icon img'),
             unlockedIsland: Game.progress.unlockedIsland };
  })()`);
  await shot(TAG + '-island.png');
  if (rep.checks.unlock.node4Playable !== true) rep.errors.push('通关 8-3 后第 8 岛第 4 关没有解锁');
  if (rep.checks.unlock.island8HasIcon !== true) rep.errors.push('第 8 岛岛屿图标缺失');
  if (rep.checks.unlock.unlockedIsland !== 8) rep.errors.push('unlockedIsland 应为 8，实际 ' + rep.checks.unlock.unlockedIsland);

  // ---------- 1) 进关 → 教学 ----------
  await ev('document.querySelector(\'.node[data-level="4"]\').click()');
  await sleep(300);
  await ev('document.getElementById("btnStart").click()');

  const STEPS = [
    { n: 'ice1',     sig: 'sid:ice1',     audio: 'h4_t_ice1',       demo: true, shot: 'tut-ice1' },
    { n: 'ice2',     sig: 'sid:ice2',     audio: 'h4_t_ice2',       demo: true, shot: 'tut-ice2' },
    { n: 'iceGive',  sig: 'sid:iceGive',  audio: 'h4_t_ice_give',   give: { target: 'ice', items: ['ice', 'rock'] }, shot: 'tut-iceGive' },
    { n: 'iceFind',  sig: 'sid:iceFind',  audio: 'h4_t_ice_find',   find: 'sad', shot: 'tut-iceFind' },
    { n: 'toy1',     sig: 'sid:toy1',     audio: 'h4_t_toy1',       demo: true, shot: 'tut-toy1' },
    { n: 'toy2',     sig: 'sid:toy2',     audio: 'h4_t_toy2',       demo: true, shot: 'tut-toy2' },
    { n: 'toyMimic', sig: 'sid:toyMimic', audio: 'h1_t_angry_ask',  mimic: true, shot: 'tut-toyMimic' },
    { n: 'toyFind',  sig: 'sid:toyFind',  audio: 'h4_t_toy_find',   find: 'angry', shot: 'tut-toyFind' },
    { n: 'out',      sig: 'sid:out',      audio: 'h4_t_out',        out: true,  shot: 'tut-out' }
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
    const row = { step: st.n, cat: st.demo ? 'demo' : (st.give ? 'give' : (st.find ? 'find' : (st.mimic ? 'mimic' : 'out'))), reached: reached, sig: entry ? entry.sig : null, sigOk: !!entry && entry.sig === st.sig };
    if (!row.sigOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）舞台不符：期望 ' + st.sig + '，实际 ' + row.sig);
    if (entry && (st.give || st.find || st.mimic)) row.hintEarly = await ev(sel('.tut-hint'));

    if (entry) {
      await sleep(180);
      row.audio = (await keysBetween(entry.t - 900, entry.t + 2600)).filter(k => k !== 'unknown');
      row.audioOk = row.audio.indexOf(st.audio) >= 0;
      if (!row.audioOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）语音不符：期望 ' + st.audio + '，实际 ' + row.audio.join(','));
      row.scene = await ev('!!document.querySelector("#askDisplay .h4-stage .h4-scene-card")');
      if ((st.demo || st.give || st.mimic) && !row.scene) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）缺少情景/小人卡');
      if (st.give) {
        row.itemCount = await ev('document.querySelectorAll("#askDisplay .h4-items .h4-item").length');
        if (row.itemCount !== st.give.items.length) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）物品选项数不符：' + row.itemCount);
        row.targetItem = await ev(`!!document.querySelector('#askDisplay .h4-items .h4-item[data-item="${st.give.target}"]')`);
        if (!row.targetItem) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）缺少正确物品 ' + st.give.target);
      }
      if (st.find) {
        row.faces = await ev('document.querySelectorAll("#askDisplay .h4-face-grid .h4-face-card").length');
        if (row.faces !== 3) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）找脸不是 3 张：' + row.faces);
        row.targetFace = await ev(`!!document.querySelector('#askDisplay .h4-face-grid .h4-face-card[data-emo="${st.find}"]')`);
        if (!row.targetFace) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）缺少目标脸 ' + st.find);
      }
      if (st.mimic) {
        row.thumbPresent = await ev('!!document.querySelector("#askDisplay .h4-thumb")');
        if (!row.thumbPresent) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）缺少巨大👍按钮');
      }
    }
    row.overflow = await overflow();
    if (st.shot) { await sleep(80); await shot(TAG + '-' + st.shot + '.png'); }

    // 演示步：等「轻点继续」→ 不自动前进 → 点屏幕推进
    if (st.demo) {
      row.tapShown = await wait(sel('.f11-tap'), 5000);
      if (!row.tapShown) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示定格后没有出现「轻点继续」');
      await sleep(2100);
      row.autoAdvanced = (await ev('window.__stageLog.length')) > (foundIdx + 1);
      if (row.autoAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示未点按就自动前进了');
      await tap('#askDisplay .h4-stage');
      row.advanced = await wait('window.__stageLog.length > ' + (foundIdx + 1), 6000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    // 给物品：4 秒小手指；点错 again；点对推进
    if (st.give) {
      row.hintLater = await wait(sel('.tut-hint'), 7000);
      if (row.hintEarly === true || row.hintLater !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手异常');
      row.hintGeom = await ev(`(function(){
        var h = document.querySelector('.tut-hint');
        var tgt = document.querySelector('#askDisplay .h4-items .h4-item[data-item="${st.give.target}"]');
        if (!h || !tgt) return null;
        var tb = tgt.getBoundingClientRect(), hb = h.getBoundingClientRect();
        var ex = hb.left + hb.width/2, ey = hb.top + hb.height;
        return { near: ex > tb.left-16 && ex < tb.right+16 && ey > tb.top-28 && ey < tb.bottom+32, stars: Game.stars };
      })()`);
      if (row.hintGeom && row.hintGeom.near !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）小手没指向正确物品');
      if (row.hintGeom && row.hintGeom.stars !== 0) rep.errors.push('教学阶段不该有星星');
      await sleep(150);
      const wrongItem = st.give.items.filter(x => x !== st.give.target)[0];
      const beforeW = await ev('window.__stageLog.length');
      const ctW = Date.now();
      await tap('#askDisplay .h4-items .h4-item[data-item="' + wrongItem + '"]');
      await sleep(900);
      row.wrongAgain = (await keysBetween(ctW - 100, ctW + 1600)).filter(k => k !== 'unknown');
      row.wrongAdvanced = (await ev('window.__stageLog.length')) > beforeW;
      if (row.wrongAgain.indexOf('again') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错物品没播 again');
      if (row.wrongAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错物品却前进了');
      await sleep(700);
      const beforeC = await ev('window.__stageLog.length');
      await tap('#askDisplay .h4-items .h4-item[data-item="' + st.give.target + '"]');
      row.advanced = await wait('window.__stageLog.length > ' + beforeC + ' || Game.phase === "asking"', 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点对物品后没有推进');
    }

    // 找脸：4 秒小手；点错 again；点对推进
    if (st.find) {
      row.hintLater = await wait(sel('.tut-hint'), 7000);
      if (row.hintEarly === true || row.hintLater !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手异常');
      row.hintGeom = await ev(`(function(){
        var h = document.querySelector('.tut-hint');
        var tgt = document.querySelector('#askDisplay .h4-face-grid .h4-face-card[data-emo="${st.find}"]');
        if (!h || !tgt) return null;
        var tb = tgt.getBoundingClientRect(), hb = h.getBoundingClientRect();
        var ex = hb.left + hb.width/2, ey = hb.top + hb.height;
        return { near: ex > tb.left-16 && ex < tb.right+16 && ey > tb.top-28 && ey < tb.bottom+32, stars: Game.stars };
      })()`);
      if (row.hintGeom && row.hintGeom.near !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）小手没指向目标脸');
      if (row.hintGeom && row.hintGeom.stars !== 0) rep.errors.push('教学阶段不该有星星');
      await sleep(150);
      const wrongSel = await ev(`(function(){
        var dom = document.querySelectorAll('#askDisplay .h4-face-grid .h4-face-card');
        for (var i = 0; i < dom.length; i++) if (dom[i].dataset.emo !== ${JSON.stringify(st.find)}) return '#askDisplay .h4-face-grid .h4-face-card[data-idx="' + dom[i].dataset.idx + '"]';
        return null;
      })()`);
      if (wrongSel) {
        const beforeW = await ev('window.__stageLog.length');
        const ctW = Date.now();
        await tap(wrongSel);
        await sleep(900);
        row.wrongAgain = (await keysBetween(ctW - 100, ctW + 1600)).filter(k => k !== 'unknown');
        row.wrongAdvanced = (await ev('window.__stageLog.length')) > beforeW;
        if (row.wrongAgain.indexOf('again') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错脸没播 again');
        if (row.wrongAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错脸却前进了');
        await sleep(800);
      }
      const beforeC = await ev('window.__stageLog.length');
      await tap('#askDisplay .h4-face-grid .h4-face-card[data-emo="' + st.find + '"]');
      row.advanced = await wait('window.__stageLog.length > ' + beforeC + ' || Game.phase === "asking"', 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点目标脸后没有推进');
    }

    // 做表情（👍）：4 秒小手；点按钮 → great → 推进
    if (st.mimic) {
      row.thumbOn = await wait(sel('#askDisplay .h4-thumb'), 7000);
      if (row.thumbOn !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）大按钮未出现');
      row.btnGeom = await thumbGeom();
      var btnOkSize = (H >= W) ? (row.btnGeom && row.btnGeom.vw >= 44) : (row.btnGeom && row.btnGeom.px >= 110);
      if (!btnOkSize) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）大按钮不够大（' + JSON.stringify(row.btnGeom) + '）');
      if (row.btnGeom && row.btnGeom.inView !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）大按钮不在视口内');
      row.hintLater = await wait(sel('.tut-hint'), 7000);
      if (row.hintEarly === true || row.hintLater !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手异常');
      row.hintGeom = await ev(`(function(){
        var h = document.querySelector('.tut-hint');
        var tgt = document.querySelector('#askDisplay .h4-thumb');
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
      await tap('#askDisplay .h4-thumb');
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
    console.log('STEP ' + (i + 1) + ' ' + JSON.stringify(row).slice(0, 440));
  }

  rep.checks.outro = { ended: await wait('Game.phase === "asking"', 20000) };
  await sleep(500);
  rep.checks.outro.totalSteps = await ev('window.__stageLog.length');
  rep.checks.errs = await ev('window.__errs.slice(0, 3)');
  if (rep.checks.errs.length) console.log('ERRS ' + JSON.stringify(rep.checks.errs));
  await shot(TAG + '-ask-first.png');

  // ---------- 2) 12 轮答题 ----------
  const seenType = {}; const seenShot = {}; const wrongTested = { H4A: false, H4B: false };

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(200);
    let snap = await ev('Game.snapshot()');
    let q = snap.question;
    if (!q) { rep.errors.push('第 ' + r + ' 轮：答题未开始'); break; }
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, audio: q.audio, sit: q.h4sit, emo: q.h4emo };

    if (q.type === 'H4A') {
      row.cards = await ev('document.querySelectorAll("#askDisplay .h4-scene-grid .h4-scene-card").length');
      row.optsN = await ev('document.querySelectorAll("#options .option[data-drag]").length');
      if (row.cards !== 3) rep.errors.push('第 ' + r + ' 轮 H4A 不是 3 幅情景：' + row.cards);
      if (row.optsN !== 0) rep.errors.push('第 ' + r + ' 轮 H4A 不该有选项栏');
      row.audioOk = A_KEY[q.h4sit] === q.audio;
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 H4A 语音与情景不符：' + q.audio + ' sit=' + q.h4sit);
      row.semanticOk = !!q.h4sits && q.h4sits[q.correct] === q.h4sit;
      if (!row.semanticOk) rep.errors.push('第 ' + r + ' 轮 H4A 目标与情景不符：' + JSON.stringify(q.h4sits) + ' sit=' + q.h4sit);
    }
    if (q.type === 'H4B') {
      row.scene = await ev('!!document.querySelector("#askDisplay .h4-scene-card")');
      row.optFaces = await ev('document.querySelectorAll("#options .option.h4-opt .slot svg").length');
      if (row.scene !== true) rep.errors.push('第 ' + r + ' 轮 H4B 缺情景');
      if (row.optFaces !== 3) rep.errors.push('第 ' + r + ' 轮 H4B 情绪脸不是 3 张：' + row.optFaces);
      row.audioOk = B_KEY[q.h4emo] === q.audio;
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 H4B 语音与情绪不符：' + q.audio + ' emo=' + q.h4emo);
      row.semanticOk = !!q.h4faces && q.h4faces[q.correct] === q.h4emo;
      if (!row.semanticOk) rep.errors.push('第 ' + r + ' 轮 H4B 正确脸与情绪不符：' + JSON.stringify(q.h4faces) + ' emo=' + q.h4emo);
    }
    if (q.type === 'H4C') {
      row.thumb = await ev('!!document.querySelector("#askDisplay .h4-thumb")');
      row.optsN = await ev('document.querySelectorAll("#options .option[data-drag]").length');
      if (row.thumb !== true) rep.errors.push('第 ' + r + ' 轮 H4C 缺巨大👍');
      if (row.optsN !== 0) rep.errors.push('第 ' + r + ' 轮 H4C 不该有选项栏');
      row.audioOk = C_KEYS.indexOf(q.audio) >= 0;
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 H4C 语音不在预期：' + q.audio);
    }

    if (!seenShot[q.type]) {
      seenShot[q.type] = 1;
      await sleep(300);
      row.overflow = await overflow();
      await shot(TAG + '-q-' + q.type + '.png');
    }

    if (q.type !== 'H4C' && !wrongTested[q.type]) {
      wrongTested[q.type] = true;
      let did = false;
      if (q.type === 'H4A') {
        did = await tap('#askDisplay .h4-scene-grid .h4-scene-card[data-idx="' + ((q.correct + 1) % 3) + '"]');
      } else {
        did = await tap('#options .option[data-idx="' + ((q.correct + 1) % 3) + '"]');
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
    if (q.type === 'H4A') {
      await tap('#askDisplay .h4-scene-grid .h4-scene-card[data-idx="' + q.correct + '"]');
    } else if (q.type === 'H4C') {
      await tap('#askDisplay .h4-thumb');
    } else {
      await tap('#options .option[data-idx="' + q.correct + '"]');
    }
    await sleep(250);
    row.voiceOnCorrect = (await keysBetween(ct, ct + 430)).filter(k => k !== 'unknown');
    const advanced = await wait('Game.round > ' + before + ' || Game.phase === "done"', 4000);
    row.advanced = advanced;
    row.starsDelta = (await ev('Game.stars')) - starsBefore;
    if (r === 1) row.overflow = await overflow();
    if (!advanced) rep.errors.push('第 ' + r + ' 轮没有推进（' + q.type + '）');
    if (row.voiceOnCorrect.length) rep.errors.push('第 ' + r + ' 轮答对后播放了语音：' + row.voiceOnCorrect.join(','));
    if (row.starsDelta !== 1) rep.errors.push('第 ' + r + ' 轮星星未 +1');
    rep.rounds.push(row);
    await sleep(180);
  }

  // ---------- 3) 通关 ----------
  rep.checks.done = {
    phase: await ev('Game.phase'), stars: await ev('Game.stars'),
    viewDone: await ev('!document.getElementById("viewDone").hidden'),
    grand: await ev('document.getElementById("viewDone").classList.contains("grand")'),
    cleared: await ev('!!Game.progress.cleared["8-4"]'),
    unlockedLevel: await ev('Game.progress.unlockedLevel[8]'),
    unlockedIsland: await ev('Game.progress.unlockedIsland')
  };
  await sleep(900);
  await shot(TAG + '-done.png');

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
    return { island8Unlocked: c8.classList.contains('unlocked'),
             island8HasIcon: !!c8.querySelector('.icon svg, .icon img'),
             island8Cleared: c8.classList.contains('cleared'),
             island9Unlocked: (function(){ var i9 = document.querySelector('.island[data-island="9"]'); return i9 ? i9.classList.contains('unlocked') : false; })() };
  })()`);
  await shot(TAG + '-map-after.png');

  await ev('Game.openIsland(8)'); await sleep(300);
  rep.checks.englishIsland = await scan();
  rep.checks.islandAfter = await ev(`(function(){
    var n4 = document.querySelector('.node[data-level="4"]');
    var n3 = document.querySelector('.node[data-level="3"]');
    return { node3Done: n3.classList.contains('done'), node4Done: n4.classList.contains('done'),
             unlockedIsland: Game.progress.unlockedIsland };
  })()`);
  await shot(TAG + '-island-after.png');

  console.log(JSON.stringify(rep, null, 2));

  const sigOk = rep.tutorial.every(s => s.sigOk);
  const noOverflow = rep.tutorial.every(s => !s.overflow ||
    (s.overflow.sw <= s.overflow.iw + 1 && s.overflow.sh <= s.overflow.ih + 1 && s.overflow.cut.length === 0 && s.overflow.zero.length === 0));
  const audioOk = rep.tutorial.every(s => s.audioOk);
  const sceneOk = rep.tutorial.filter(s => s.cat === 'demo' || s.cat === 'give' || s.cat === 'mimic').every(s => s.scene === true);
  const giveOk = rep.tutorial.filter(s => s.give).every(s => s.itemCount === s.give.items.length && s.targetItem === true);
  const findOk = rep.tutorial.filter(s => s.find).every(s => s.faces === 3 && s.targetFace === true);
  const thumbOk = rep.tutorial.filter(s => s.mimic).every(s => s.thumbPresent === true);
  const hintOk = rep.tutorial.filter(s => s.give || s.find || s.mimic).every(s => s.hintEarly !== true && s.hintLater === true && s.hintGeom && s.hintGeom.near === true);
  const demoOk = rep.tutorial.filter(s => s.demo).every(s => s.tapShown === true && s.autoAdvanced === false && s.advanced === true);
  const giveAdvOk = rep.tutorial.filter(s => s.give).every(s => s.wrongAgain.indexOf('again') >= 0 && s.wrongAdvanced === false && s.advanced === true);
  const findAdvOk = rep.tutorial.filter(s => s.find).every(s => s.wrongAgain.indexOf('again') >= 0 && s.wrongAdvanced === false && s.advanced === true);
  const mimicOk = rep.tutorial.filter(s => s.mimic).every(s => s.thumbOn === true && s.great.indexOf('g2_t_great') >= 0 && s.advanced === true && s.btnGeom && s.btnGeom.inView);
  const outOk = rep.tutorial.filter(s => s.out).every(s => s.ended === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1 && s.voiceOnCorrect.length === 0);
  const semOk = rep.rounds.every(s => (s.type !== 'H4A' && s.type !== 'H4B') || s.semanticOk === true);
  const ok = rep.errors.length === 0 && sigOk && audioOk && sceneOk && giveOk && findOk && thumbOk && hintOk &&
    demoOk && giveAdvOk && findAdvOk && mimicOk && outOk && roundsOk && semOk && noOverflow &&
    rep.rounds.length === 12 && Object.keys(seenType).length === 3 &&
    seenType.H4A === 4 && seenType.H4B === 4 && seenType.H4C === 4 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === false && rep.checks.done.cleared === true &&
    rep.checks.done.unlockedLevel === 5 && rep.checks.done.unlockedIsland === 8 &&
    rep.checks.islandAfter.node3Done === true && rep.checks.islandAfter.node4Done === true &&
    rep.checks.mapAfter.island8Unlocked === true && rep.checks.mapAfter.island8HasIcon === true &&
    rep.checks.mapAfter.island8Cleared === false && rep.checks.mapAfter.island9Unlocked === false &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0 && rep.checks.englishIsland.length === 0 &&
    rep.checks.outro.ended === true;
  console.log('\nPROBE_' + (ok ? 'PASS' : 'FAIL') + ' sigOk=' + sigOk + ' audioOk=' + audioOk + ' sceneOk=' + sceneOk +
    ' giveOk=' + giveOk + ' findOk=' + findOk + ' thumbOk=' + thumbOk + ' hintOk=' + hintOk + ' demoOk=' + demoOk +
    ' giveAdvOk=' + giveAdvOk + ' findAdvOk=' + findAdvOk + ' mimicOk=' + mimicOk + ' outOk=' + outOk +
    ' roundsOk=' + roundsOk + ' semOk=' + semOk + ' noOverflow=' + noOverflow +
    ' steps=' + rep.checks.outro.totalSteps + ' types=' + JSON.stringify(seenType) +
    ' stars=' + rep.checks.done.stars + ' grand=' + rep.checks.done.grand +
    ' cleared=' + rep.checks.done.cleared + ' unlockedLevel=' + rep.checks.done.unlockedLevel +
    ' unlockedIsland=' + rep.checks.done.unlockedIsland);
  finish(ok ? 0 : 1);
})().catch(e => { console.error('PROBE_ERROR', e); finish(2); });
