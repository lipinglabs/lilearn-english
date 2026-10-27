// 第 11 岛第 1 关（L11-W1：三只小猪 · 童话故事岛开篇）专项测试
//   1) 解锁链：10-5 未通时第 11 岛锁定；通关 10-5 后 unlockedIsland=11、unlockedLevel[11]=1。
//   2) 地图第 11 岛图标必须是手写 SVG（不是 emoji 字符）。
//   3) 教学 7 环节：三只小猪演示 → 草房演示（稻草飞过 + 房子长出来）→ 拖砖头给第三只猪 →
//      敲门演示（门抖 + 波纹）→ 大灰狼现身 → 三选一找狼 → 过渡。
//   4) 三题型 12 轮 4/4/4：A 找角色 / B 找材料 / C 点大喇叭喊走狼（台词是动作结果，星星后必须静音）。
//   5) 通关：stars=12、grand=false（非岛末关）、cleared['11-1']、u11=1、无英文、无溢出。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const os = require('os'), path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'l111';
const PORT = 9916 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
const BOOT_TRIES = parseInt(process.env.L111_BOOT_TRIES || '1400', 10);

const A_KEY = { wolf: 'l111_a_wolf', pig: 'l111_a_pig', hunter: 'l111_a_hunter' };
const B_KEY = { straw: 'l111_b_straw', wood: 'l111_b_wood', brick: 'l111_b_brick' };
const C_KEY = ['l111_c_wolf', 'l111_c_knock'];

const STEPS = [
  { n: 'pigs1', word: 'l111_t_pigs', demo: true },
  { n: 'straw2', word: 'l111_t_straw_house', demo: true, build: true },
  { n: 'brickPut', word: 'l111_t_bricks_put', drag: { item: 'brick', pig: 3 } },
  { n: 'knock1', word: 'l111_t_knock', demo: true, knock: true },
  { n: 'wolf2', word: 'l111_t_wolf', demo: true },
  { n: 'findWolf', word: 'l111_a_wolf', pick: { kind: 'wolf' } },
  { n: 'out', word: 'l111_t_out', out: true }
];

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-l111-' + Date.now()),
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
        var s = document.querySelector('.l111-stage');
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
      if(n.ownerSVGElement) return;           /* SVG 内部图元被父级裁掉，不算布局溢出 */
      var r=n.getBoundingClientRect(); if(!r.width||!r.height) return;
      if(r.right>iw+1||r.left<-1||r.bottom>ih+1||r.top<-1){
        if(r.width>2&&r.height>2) cut.push((n.tagName||'')+'.'+(n.getAttribute('class')||''));
      }
    });
    Array.prototype.forEach.call(document.querySelectorAll('#askDisplay .l111-story, #askDisplay .l111-doorstage, #askDisplay .l111-card, #askDisplay .l111-mat, #askDisplay .l111-horn'), function(n){
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
  for (let l = 1; l <= 4; l++) await ev('Game.markCleared(10,' + l + ')');
  rep.checks.lockedBefore = JSON.parse(await ev('JSON.stringify({ui:Game.progress.unlockedIsland, u11:Game.progress.unlockedLevel[11]||null})'));
  if (rep.checks.lockedBefore.ui !== 10) rep.errors.push('未通 10-5 时 unlockedIsland 应为 10，实际 ' + rep.checks.lockedBefore.ui);
  if (rep.checks.lockedBefore.u11 !== null) rep.errors.push('未通 10-5 时 unlockedLevel[11] 应为空，实际 ' + rep.checks.lockedBefore.u11);
  await ev('Game.markCleared(10,5)');
  rep.checks.after105 = JSON.parse(await ev('JSON.stringify({ui:Game.progress.unlockedIsland, u11:Game.progress.unlockedLevel[11]||null})'));
  if (rep.checks.after105.ui !== 11) rep.errors.push('通关 10-5 后 unlockedIsland 应为 11，实际 ' + rep.checks.after105.ui);
  if (rep.checks.after105.u11 !== 1) rep.errors.push('通关 10-5 后 unlockedLevel[11] 应为 1，实际 ' + rep.checks.after105.u11);

  await ev('Game.openIsland(10)'); await sleep(150);
  await ev('Game.backToMap()'); await sleep(350);
  rep.checks.mapIcon = await ev(`(function(){
    var c=document.querySelector('#islandGrid .island[data-island="11"]');
    if(!c) return null;
    return { svg: !!c.querySelector('svg'), text: (c.querySelector('.icon')||{}).textContent || '', locked: c.classList.contains('locked') };
  })()`);
  if (!rep.checks.mapIcon) rep.errors.push('地图上找不到第 11 岛');
  else {
    if (rep.checks.mapIcon.locked) rep.errors.push('通关 10-5 后第 11 岛仍然是锁定状态');
    if (!rep.checks.mapIcon.svg) rep.errors.push('第 11 岛图标不是手写 SVG');
    if (/[A-Za-z\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(rep.checks.mapIcon.text)) {
      rep.errors.push('第 11 岛图标是 emoji / 文字：' + rep.checks.mapIcon.text);
    }
  }

  // ---------- 1) 教学 ----------
  await ev('Game.openIsland(11)'); await sleep(200);
  await ev('Game.enterLevel(1)'); await sleep(250);
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
      if (!st.out) {
        row.hasArt = await ev('!!document.querySelector("#askDisplay .l111-story, #askDisplay .l111-doorstage, #askDisplay .l111-cards")');
        if (!row.hasArt) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）舞台没有画面');
        row.overflow = await overflow();
      }
    }

    if (st.demo) {
      row.tapShown = await wait(sel('.f11-tap'), 10000);
      if (!row.tapShown) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示定格后没有出现「轻点继续」');
      row.autoAdvanced = (await ev('window.__stageLog.length')) > (foundIdx + 1);
      if (row.autoAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示未点按就自动前进了');
      if (st.build) {
        row.built = await ev('!!document.querySelector("#askDisplay .l111-plot.l111-built")');
        if (!row.built) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）稻草飞过之后房子没有搭起来');
      }
      if (st.knock) {
        row.knockDone = await ev('!!document.querySelector("#askDisplay .l111-door.l111-knock") || !!document.querySelector("#askDisplay .l111-knockfx.l111-on")');
        row.wolfThere = await ev('!!document.querySelector("#askDisplay .l111-wolf")');
        if (!row.wolfThere) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）门口没有大灰狼');
      }
      const pt = await centerOf('#askDisplay .l111-stage');
      if (pt) await clickXY(pt.x, pt.y);
      row.advanced = await wait('window.__stageLog.length > ' + (foundIdx + 1), 6000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    if (st.drag) {
      row.hint = await wait(sel('.tut-hint'), 8000);
      if (!row.hint) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手没有出现');
      row.mats = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l111-mat'),function(n){return n.dataset.item;})");
      if (!row.mats || row.mats.length !== 3) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）材料不是 3 份：' + JSON.stringify(row.mats));
      const before0 = await ev('window.__stageLog.length');
      /* ① 先把错的材料拖给第三只猪：只许弹回 */
      const wrongMat = (row.mats || []).filter(x => x !== st.drag.item)[0];
      await drag('#askDisplay .l111-mat[data-item="' + wrongMat + '"]', '#askDisplay .l111-pig[data-pig="3"]');
      await sleep(700);
      row.wrongThen = {
        advanced: (await ev('window.__stageLog.length')) > before0,
        ghostGone: await ev('!document.querySelector(".drag-ghost")'),
        cardThere: await ev('!!document.querySelector("#askDisplay .l111-mat[data-item=\\"' + wrongMat + '\\"]")')
      };
      if (row.wrongThen.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖错材料却推进了');
      if (row.wrongThen.ghostGone !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖拽幽灵没有回收');
      if (row.wrongThen.cardThere !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖错后材料卡消失了');
      /* ② 拖砖头给第三只猪 */
      await drag('#askDisplay .l111-mat[data-item="' + st.drag.item + '"]', '#askDisplay .l111-pig[data-pig="' + st.drag.pig + '"]');
      await sleep(260);
      row.builtAfter = await ev('!!document.querySelector("#askDisplay .l111-plot.l111-built")');
      row.matGone = await ev('!document.querySelector("#askDisplay .l111-mat[data-item=\\"' + st.drag.item + '\\"]")');
      row.advanced = await wait('window.__stageLog.length > ' + before0, 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖对材料后没有推进');
      if (!row.builtAfter) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）砖房没有搭起来');
      if (!row.matGone) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）材料用掉后卡片还在');
    }

    if (st.pick) {
      row.hint = await wait(sel('.tut-hint'), 8000);
      if (!row.hint) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手没有出现');
      row.cards = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l111-card'),function(n){return n.dataset.item;})");
      if (!row.cards || row.cards.length !== 3) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）角色不是 3 个：' + JSON.stringify(row.cards));
      const before0 = await ev('window.__stageLog.length');
      const wi = (row.cards || []).findIndex(x => x !== st.pick.kind);
      if (wi >= 0) {
        const cw = await centerOf('#askDisplay .l111-card[data-idx="' + wi + '"]');
        if (cw) await clickXY(cw.x, cw.y);
        await sleep(500);
        if ((await ev('window.__stageLog.length')) > before0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错却推进了');
      }
      const c = await centerOf('#askDisplay .l111-card[data-item="' + st.pick.kind + '"]');
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
  const wrongTested = { L111A: false, L111B: false };

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(400);
    const snap = await ev('Game.snapshot()');
    const q = snap.question;
    if (!q) { rep.errors.push('第 ' + r + ' 轮：答题未开始'); break; }
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, kind: q.l111kind, answer: q.l111answer, cv: q.l111cv };
    const starsBefore = await ev('Game.stars');
    row.audio = q.audio ? [q.audio] : [];
    let ct = Date.now();
    if (!seenOv[q.type]) { seenOv[q.type] = 1; row.overflow = await overflow(); }

    if (q.type === 'L111A' || q.type === 'L111B') {
      const want = q.type === 'L111A' ? A_KEY[q.l111kind] : B_KEY[q.l111kind];
      row.audioOk = q.audio === want;
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 语音不符：期望 ' + want + '，实际 ' + q.audio);
      row.cards = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l111-card'),function(n){return n.dataset.item;})");
      if (!row.cards || row.cards.length !== 3) rep.errors.push('第 ' + r + ' 轮卡片不是 3 张：' + JSON.stringify(row.cards));
      if (row.cards && new Set(row.cards).size !== 3) rep.errors.push('第 ' + r + ' 轮卡片重复：' + JSON.stringify(row.cards));
      if (!wrongTested[q.type] && row.cards) {
        wrongTested[q.type] = true;
        const wi = row.cards.findIndex(x => x !== q.l111kind);
        const cw = await centerOf('#askDisplay .l111-card[data-idx="' + wi + '"]');
        const ctw = Date.now();
        if (cw) await clickXY(cw.x, cw.y);
        await sleep(700);
        row.wrongVoice = (await keysBetween(ctw, ctw + 900)).filter(k => k !== 'unknown');
        if (row.wrongVoice.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 点错没有温柔鼓励（again）');
        if ((await ev('Game.round')) > (r - 1)) rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 点错却推进了');
      }
      const c = await centerOf('#askDisplay .l111-card[data-idx="' + q.l111answer + '"]');
      if (!c) { rep.errors.push('第 ' + r + ' 轮找不到答案卡'); break; }
      ct = Date.now();
      await clickXY(c.x, c.y);
      await sleep(260);
      row.voiceOnCorrect = (await keysBetween(ct, ct + 400)).filter(k => k !== 'unknown');
      if (row.voiceOnCorrect.length) rep.errors.push('第 ' + r + ' 轮答对后播放了语音：' + row.voiceOnCorrect.join(','));
    } else {
      row.audioOk = q.audio === C_KEY[q.l111cv];
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L111C 语音不符：期望 ' + C_KEY[q.l111cv] + '，实际 ' + q.audio);
      const horn = await centerOf('#askDisplay .l111-horn');
      if (!horn) { rep.errors.push('第 ' + r + ' 轮 L111C 找不到大喇叭按钮'); break; }
      row.hornW = Math.round(horn.w / W * 100);
      ct = Date.now();
      await clickXY(horn.x, horn.y);
      /* 台词「Go away!」是本题的动作结果（剧情），不是夸奖音；但必须在星星之前播完 */
      row.blast = await wait('!!document.querySelector("#askDisplay .l111-wolf.l111-flee")', 4000);
      row.blastVoice = (await keysBetween(ct, ct + 1500)).filter(k => k !== 'unknown');
      if (row.blastVoice.indexOf('l111_c_go_away') < 0) rep.errors.push('第 ' + r + ' 轮 L111C 点喇叭没播「Go away!」：' + row.blastVoice.join(','));
      if (!row.blast) rep.errors.push('第 ' + r + ' 轮 L111C 大灰狼没有被喊走');
      row.voicesAll = (await keysBetween(ct, ct + 2600)).filter(k => k !== 'unknown');
      row.praise = row.voicesAll.filter(k => k.indexOf('praise') === 0);
      if (row.praise.length) rep.errors.push('第 ' + r + ' 轮 L111C 答对后播了夸奖人声：' + row.praise.join(','));
    }

    const advanced = await wait('Game.round > ' + (r - 1) + ' || Game.phase === "done"', 6000);
    row.advanced = advanced;
    row.starsDelta = (await ev('Game.stars')) - starsBefore;
    if (!advanced) rep.errors.push('第 ' + r + ' 轮没有推进（' + q.type + '）');
    if (row.starsDelta !== 1) rep.errors.push('第 ' + r + ' 轮星星未 +1（' + row.starsDelta + '）');
    rep.rounds.push(row);
    await sleep(150);
  }

  await sleep(700);
  rep.checks.done = await ev(`(function(){
    return { phase: Game.phase, stars: Game.stars,
             grand: document.getElementById('viewDone').classList.contains('grand'),
             cleared: !!Game.progress.cleared['11-1'],
             u11: Game.progress.unlockedLevel[11] || null,
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

  console.log(JSON.stringify(rep, null, 2));

  const sigOk = rep.tutorial.every(s => s.sigOk);
  const audioOk = rep.tutorial.every(s => s.audioOk);
  const demoOk = rep.tutorial.filter(s => s.demo).every(s => s.tapShown === true && s.autoAdvanced === false && s.advanced === true);
  const dragOk = rep.tutorial.filter(s => s.drag).every(s => s.hint === true && s.advanced === true && s.wrongThen.advanced === false && s.wrongThen.cardThere === true && s.builtAfter === true);
  const pickOk = rep.tutorial.filter(s => s.pick).every(s => s.hint === true && s.advanced === true);
  const outOk = rep.tutorial.filter(s => s.out).every(s => s.ended === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1);
  const semOk = rep.rounds.every(s => s.audioOk === true);
  const quietOk = rep.rounds.every(s => (s.type === 'L111C') ? (s.blast === true && (s.praise || []).length === 0) : (s.voiceOnCorrect || []).length === 0);
  const noOv = o => !o || (o.sw <= o.iw + 1 && o.sh <= o.ih + 1 && o.cut.length === 0 && o.zero.length === 0);
  const noOverflow = rep.tutorial.every(s => noOv(s.overflow)) && rep.rounds.every(s => noOv(s.overflow));
  const ok = rep.errors.length === 0 && sigOk && audioOk && demoOk && dragOk && pickOk && outOk &&
    roundsOk && semOk && quietOk && noOverflow &&
    rep.rounds.length === 12 &&
    seenType.L111A === 4 && seenType.L111B === 4 && seenType.L111C === 4 &&
    rep.checks.mapIcon && rep.checks.mapIcon.svg === true && rep.checks.mapIcon.locked === false &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === false && rep.checks.done.cleared === true &&
    rep.checks.done.u11 === 1 && rep.checks.done.ui === 11 &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0;

  console.log('PROBE_' + (ok ? 'PASS' : 'FAIL') +
    ' sigOk=' + sigOk + ' audioOk=' + audioOk + ' demoOk=' + demoOk +
    ' dragOk=' + dragOk + ' pickOk=' + pickOk + ' outOk=' + outOk +
    ' roundsOk=' + roundsOk + ' semOk=' + semOk + ' quietOk=' + quietOk +
    ' noOverflow=' + noOverflow + ' steps=' + rep.tutorial.length +
    ' types=' + JSON.stringify(seenType) +
    ' stars=' + rep.checks.done.stars + ' grand=' + rep.checks.done.grand +
    ' cleared=' + rep.checks.done.cleared + ' u11=' + rep.checks.done.u11 + ' ui=' + rep.checks.done.ui);

  finish(ok ? 0 : 1);
})().catch(e => { console.log('PROBE_ERROR', e && e.message); finish(2); });
