// 第 11 岛第 4 关（L11-W4：故事排序）专项测试
//   1) 解锁链：11-3 未通时 11-4 锁定；通关 11-3 后 unlockedLevel[11]=4。
//   2) 教学 4 环节：讲三只小猪（三张图按序高亮）→ 演示图飞进 1/2/3 → 动手排三张 → 过渡。
//   3) 三题型 12 轮 4/4/4：A 听故事排三张 / B 找首尾 / C 判断这个顺序对不对。
//   4) 防背题（用户重点要求）：1/2/3 三个框每轮随机左右、下方三张图每轮打乱；
//      探针断言 DOM 顺序与题面一致，且 4 轮里两种顺序都至少变过一次。
//   5) 剧情台词：A 排对三张后先播「First, then, finally!」再给星星，且不得有 praise_* 人声。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const os = require('os'), path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'l114';
const PORT = 9922 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
const BOOT_TRIES = parseInt(process.env.L114_BOOT_TRIES || '1400', 10);

const LINE = 'l114_line_order';
const STORY_AUDIO = { pigs: 'l114_t_story', red: 'l114_a_red', goldi: 'l114_a_goldi' };

const STEPS = [
  { n: 'story1', word: 'l114_t_story', demo: true },
  { n: 'order2', word: 'l114_t_story2', demo: true, filled: true },
  { n: 'sortPut', word: 'l114_t_order', drag: true },
  { n: 'out', word: 'l114_t_out', out: true }
];

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-l114-' + Date.now()),
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
        var s = document.querySelector('.l114-stage');
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
      if(n.ownerSVGElement) return;
      var r=n.getBoundingClientRect(); if(!r.width||!r.height) return;
      if(r.right>iw+1||r.left<-1||r.bottom>ih+1||r.top<-1){
        if(r.width>2&&r.height>2) cut.push((n.tagName||'')+'.'+(n.getAttribute('class')||''));
      }
    });
    Array.prototype.forEach.call(document.querySelectorAll('#askDisplay .l114-slot, #askDisplay .l114-pic, #askDisplay .l114-card, #askDisplay .l114-yn'), function(n){
      var r=n.getBoundingClientRect(); if(!r.width||!r.height) zero.push((n.tagName||'')+'.'+(n.getAttribute('class')||''));
    });
    return { sw: d.scrollWidth, iw: iw, sh: d.scrollHeight, ih: ih, cut: cut.slice(0,6), zero: zero.slice(0,6) };
  })()`);
  const keysBetween = (a, b) => ev(`window.__played.filter(function(p){return p.t>=${a}&&p.t<=${b};}).map(function(p){
    for (var k in window.VOICE_BANK) if (window.VOICE_BANK[k] === p.src) return k;
    return 'unknown';
  })`);
  const slotOrder = () => ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l114-slot'),function(n){return Number(n.dataset.slot);})");
  const trayOrder = () => ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l114-tray .l114-pic'),function(n){return Number(n.dataset.step);})");
  const filledCount = () => ev("document.querySelectorAll('#askDisplay .l114-slot .l114-pic').length");
  /* 把第 step 张图拖进第 (step+1) 个框；返回是否成功拖拽 */
  const dropStep = async (step) => drag('#askDisplay .l114-tray .l114-pic[data-step="' + step + '"]',
    '#askDisplay .l114-slot[data-slot="' + (step + 1) + '"]');

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };

  // ---------- 0) 解锁链 ----------
  await ev('Game.resetProgress()');
  await ev('for (var i=1;i<=7;i++){ for (var l=1;l<=5;l++) Game.markCleared(i,l); }');
  await ev('for (var l=1;l<=5;l++) Game.markCleared(8,l)');
  await ev('for (var l=1;l<=5;l++) Game.markCleared(9,l)');
  for (let l = 1; l <= 5; l++) await ev('Game.markCleared(10,' + l + ')');
  await ev('Game.markCleared(11,1)'); await ev('Game.markCleared(11,2)');
  rep.checks.lockedBefore = JSON.parse(await ev('JSON.stringify({u11:Game.progress.unlockedLevel[11]||null, c113:!!Game.progress.cleared["11-3"]})'));
  if (rep.checks.lockedBefore.u11 !== 3) rep.errors.push('未通 11-3 时 unlockedLevel[11] 应为 3，实际 ' + rep.checks.lockedBefore.u11);
  if (rep.checks.lockedBefore.c113 !== false) rep.errors.push('未通关时 cleared[11-3] 不该为真');
  await ev('Game.markCleared(11,3)');
  rep.checks.after113 = JSON.parse(await ev('JSON.stringify({u11:Game.progress.unlockedLevel[11]||null})'));
  if (rep.checks.after113.u11 !== 4) rep.errors.push('通关 11-3 后 unlockedLevel[11] 应为 4，实际 ' + rep.checks.after113.u11);

  // ---------- 1) 教学 ----------
  await ev('Game.openIsland(11)'); await sleep(200);
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
      row.audio = (await keysBetween(entry.t - 900, entry.t + 3400)).filter(k => k !== 'unknown');
      row.audioOk = row.audio.indexOf(st.word) >= 0;
      if (!row.audioOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）语音不符：期望 ' + st.word + '，实际 ' + row.audio.join(','));
      if (!st.out) {
        row.pics = await ev("document.querySelectorAll('#askDisplay .l114-pic').length");
        if (row.pics !== 3) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）图片不是 3 张：' + row.pics);
        row.overflow = await overflow();
      }
    }

    if (st.demo) {
      row.tapShown = await wait(sel('.f11-tap'), 11000);
      if (!row.tapShown) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示定格后没有出现「轻点继续」');
      row.autoAdvanced = (await ev('window.__stageLog.length')) > (foundIdx + 1);
      if (row.autoAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示未点按就自动前进了');
      if (st.filled) {
        row.filled = await filledCount();
        if (row.filled !== 3) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示后三个框没有全部填上：' + row.filled);
        row.slots = await slotOrder();
        if ((row.slots || []).length !== 3 || new Set(row.slots).size !== 3) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）框不是 3 个不重复的编号：' + JSON.stringify(row.slots));
      }
      const pt = await centerOf('#askDisplay .l114-stage');
      if (pt) await clickXY(pt.x, pt.y);
      row.advanced = await wait('window.__stageLog.length > ' + (foundIdx + 1), 6000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    if (st.drag) {
      row.hint = await wait(sel('.tut-hint'), 9000);
      if (!row.hint) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手没有出现');
      row.slots = await slotOrder();
      row.tray = await trayOrder();
      if (!row.tray || row.tray.length !== 3 || new Set(row.tray).size !== 3) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）底部图片不是 3 张不重复：' + JSON.stringify(row.tray));
      const before0 = await ev('window.__stageLog.length');
      /* ① 先放错一张：只许弹回 */
      const wrongStep = row.tray.filter(x => x !== 0)[0];
      await drag('#askDisplay .l114-tray .l114-pic[data-step="' + wrongStep + '"]', '#askDisplay .l114-slot[data-slot="1"]');
      await sleep(700);
      row.wrongThen = {
        advanced: (await ev('window.__stageLog.length')) > before0,
        filled: await filledCount(),
        ghostGone: await ev('!document.querySelector(".drag-ghost")'),
        stillInTray: await ev('!!document.querySelector("#askDisplay .l114-tray .l114-pic[data-step=\\"' + wrongStep + '\\"]")')
      };
      if (row.wrongThen.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）放错位置却推进了');
      if (row.wrongThen.filled !== 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）放错位置却填进了框');
      if (row.wrongThen.ghostGone !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖拽幽灵没有回收');
      if (row.wrongThen.stillInTray !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）放错后图片消失了');
      /* ② 按 1/2/3 全部排对 */
      for (let step = 0; step < 3; step++) { await dropStep(step); await sleep(240); }
      row.filled = await filledCount();
      if (row.filled !== 3) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）三张没有全部排进框：' + row.filled);
      row.advanced = await wait('window.__stageLog.length > ' + before0, 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）排对后没有推进');
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
  const slotSets = new Set();
  const traySets = new Set();
  const wrongTested = { L114A: false, L114B: false, L114C: false };

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(430);
    const snap = await ev('Game.snapshot()');
    const q = snap.question;
    if (!q) { rep.errors.push('第 ' + r + ' 轮：答题未开始'); break; }
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, story: q.l114story, ask: q.l114ask, answer: q.l114answer, correct: q.l114correct };
    const starsBefore = await ev('Game.stars');
    row.audio = q.audio ? [q.audio] : [];
    let ct = Date.now();
    if (!seenOv[q.type]) { seenOv[q.type] = 1; row.overflow = await overflow(); }

    if (q.type === 'L114A') {
      row.audioOk = q.audio === STORY_AUDIO[q.l114story];
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L114A 语音不符：期望 ' + STORY_AUDIO[q.l114story] + '，实际 ' + q.audio);
      row.slots = await slotOrder();
      row.tray = await trayOrder();
      slotSets.add((row.slots || []).join(''));
      traySets.add((row.tray || []).join(''));
      if (JSON.stringify(row.slots) !== JSON.stringify(q.l114slots)) rep.errors.push('第 ' + r + ' 轮 L114A 框的左右顺序与题面不一致：' + JSON.stringify(row.slots) + ' vs ' + JSON.stringify(q.l114slots));
      if (JSON.stringify(row.tray) !== JSON.stringify(q.l114items)) rep.errors.push('第 ' + r + ' 轮 L114A 底部图片顺序与题面不一致：' + JSON.stringify(row.tray) + ' vs ' + JSON.stringify(q.l114items));
      if (!wrongTested.L114A) {
        wrongTested.L114A = true;
        const bad = (row.tray || []).filter(x => x !== 0)[0];
        const ctw = Date.now();
        await drag('#askDisplay .l114-tray .l114-pic[data-step="' + bad + '"]', '#askDisplay .l114-slot[data-slot="1"]');
        await sleep(750);
        row.wrongVoice = (await keysBetween(ctw, ctw + 900)).filter(k => k !== 'unknown');
        if (row.wrongVoice.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 L114A 放错位置没有温柔鼓励（again）');
        if ((await ev('Game.round')) > (r - 1)) rep.errors.push('第 ' + r + ' 轮 L114A 放错位置却推进了');
        if ((await filledCount()) !== 0) rep.errors.push('第 ' + r + ' 轮 L114A 放错位置却填进了框');
      }
      ct = Date.now();
      for (let step = 0; step < 3; step++) { await dropStep(step); await sleep(220); }
      row.filled = await filledCount();
      if (row.filled !== 3) rep.errors.push('第 ' + r + ' 轮 L114A 三张没有全部排进框：' + row.filled);
      /* 每个编号框里必须是对应那一步的图（1←第一张、2←第二张、3←第三张） */
      row.map = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l114-slot'),function(s){var p=s.querySelector('.l114-pic');return s.dataset.slot+':'+(p?p.dataset.step:'-');}).sort().join(',')");
      if (row.map !== '1:0,2:1,3:2') rep.errors.push('第 ' + r + ' 轮 L114A 框里的图没有对号：' + row.map);
    } else if (q.type === 'L114B') {
      row.audioOk = q.audio === (q.l114ask === 'first' ? 'l114_b_first' : 'l114_b_last');
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L114B 语音不符：' + q.audio);
      row.cards = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l114-card'),function(n){return Number(n.dataset.step);})");
      if (!row.cards || row.cards.length !== 3) rep.errors.push('第 ' + r + ' 轮 L114B 卡片不是 3 张：' + JSON.stringify(row.cards));
      if (row.cards && new Set(row.cards).size !== 3) rep.errors.push('第 ' + r + ' 轮 L114B 卡片重复：' + JSON.stringify(row.cards));
      const wantStep = q.l114ask === 'first' ? 0 : 2;
      if (row.cards && row.cards[q.l114answer] !== wantStep) rep.errors.push('第 ' + r + ' 轮 L114B 答案位不是第 ' + (wantStep + 1) + ' 张：' + JSON.stringify(row.cards));
      if (!wrongTested.L114B && row.cards) {
        wrongTested.L114B = true;
        const wi = row.cards.findIndex(x => x !== wantStep);
        const cw = await centerOf('#askDisplay .l114-card[data-idx="' + wi + '"]');
        const ctw = Date.now();
        if (cw) await clickXY(cw.x, cw.y);
        await sleep(700);
        row.wrongVoice = (await keysBetween(ctw, ctw + 900)).filter(k => k !== 'unknown');
        if (row.wrongVoice.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 L114B 点错没有温柔鼓励（again）');
        if ((await ev('Game.round')) > (r - 1)) rep.errors.push('第 ' + r + ' 轮 L114B 点错却推进了');
      }
      const c = await centerOf('#askDisplay .l114-card[data-idx="' + q.l114answer + '"]');
      if (!c) { rep.errors.push('第 ' + r + ' 轮 L114B 找不到答案卡'); break; }
      ct = Date.now();
      await clickXY(c.x, c.y);
      await sleep(260);
      row.voiceOnCorrect = (await keysBetween(ct, ct + 400)).filter(k => k !== 'unknown');
      if (row.voiceOnCorrect.length) rep.errors.push('第 ' + r + ' 轮 L114B 答对后播放了语音：' + row.voiceOnCorrect.join(','));
    } else {
      row.audioOk = q.audio === 'l114_c_check';
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L114C 语音不符：' + q.audio);
      row.slots = await slotOrder();
      slotSets.add((row.slots || []).join(''));
      if (JSON.stringify(row.slots) !== JSON.stringify(q.l114slots)) rep.errors.push('第 ' + r + ' 轮 L114C 框的左右顺序与题面不一致：' + JSON.stringify(row.slots));
      row.map = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l114-slot'),function(s){var p=s.querySelector('.l114-pic');return s.dataset.slot+':'+(p?p.dataset.step:'-');}).sort().join(',');");
      const want = (q.l114arr || []).map((st, i) => (i + 1) + ':' + st).sort().join(',');
      if (row.map !== want) rep.errors.push('第 ' + r + ' 轮 L114C 框里的图与题面不符：' + row.map + ' vs ' + want);
      const isTrueOrder = (q.l114arr || []).join('') === '012';
      if (isTrueOrder !== q.l114correct) rep.errors.push('第 ' + r + ' 轮 L114C correct 与 arr 不一致');
      if (!wrongTested.L114C) {
        wrongTested.L114C = true;
        const wi = q.l114answer === 0 ? 1 : 0;
        const cw = await centerOf('#askDisplay .l114-yn[data-idx="' + wi + '"]');
        const ctw = Date.now();
        if (cw) await clickXY(cw.x, cw.y);
        await sleep(700);
        row.wrongVoice = (await keysBetween(ctw, ctw + 900)).filter(k => k !== 'unknown');
        if (row.wrongVoice.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 L114C 判断错没有温柔鼓励（again）');
        if ((await ev('Game.round')) > (r - 1)) rep.errors.push('第 ' + r + ' 轮 L114C 判断错却推进了');
      }
      const c = await centerOf('#askDisplay .l114-yn[data-idx="' + q.l114answer + '"]');
      if (!c) { rep.errors.push('第 ' + r + ' 轮 L114C 找不到按钮'); break; }
      ct = Date.now();
      await clickXY(c.x, c.y);
      await sleep(260);
      row.voiceOnCorrect = (await keysBetween(ct, ct + 400)).filter(k => k !== 'unknown');
      if (row.voiceOnCorrect.length) rep.errors.push('第 ' + r + ' 轮 L114C 答对后播放了语音：' + row.voiceOnCorrect.join(','));
    }

    const advanced = await wait('Game.round > ' + (r - 1) + ' || Game.phase === "done"', 8000);
    row.advanced = advanced;
    /* A 型的台词在「第三张排进去」之后才播，必须在推进之后整段窗口回看，
       否则 2.4 秒的固定窗口会漏掉它（实测第 2/4 轮误报） */
    if (q.type === 'L114A') {
      row.voicesAll = (await keysBetween(ct, Date.now())).filter(k => k !== 'unknown');
      row.lineOk = row.voicesAll.indexOf(LINE) >= 0;
      if (!row.lineOk) rep.errors.push('第 ' + r + ' 轮 L114A 排对后没播剧情台词：' + row.voicesAll.join(','));
      row.praise = row.voicesAll.filter(k => k.indexOf('praise') === 0);
      /* 最后一轮之后的 praise_* 是「通关 playRandomPraise」，是要求的行为；
         其余轮次出现才是「答对禁人声」被破坏。这里把「违规项」单独记下来，
         让汇总判据与报错判据用同一套口径（否则通关庆祝会让 quietOk 恒为假）。 */
      row.praiseBad = (r < 12) ? row.praise : [];
      if (row.praiseBad.length) rep.errors.push('第 ' + r + ' 轮 L114A 排对后播了夸奖人声：' + row.praiseBad.join(','));
    }
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
             cleared: !!Game.progress.cleared['11-4'],
             u11: Game.progress.unlockedLevel[11] || null,
             ui: Game.progress.unlockedIsland };
  })()`);
  rep.checks.types = seenType;
  rep.checks.slotVariants = Array.from(slotSets);
  rep.checks.trayVariants = Array.from(traySets);
  /* 防背题（用户重点要求）：三个框的左右顺序、底部三张图的顺序都必须真的变过 */
  if (slotSets.size < 2) rep.errors.push('1/2/3 三个框的左右顺序从未变化：' + JSON.stringify(Array.from(slotSets)));
  if (traySets.size < 2) rep.errors.push('底部三张图的顺序从未变化：' + JSON.stringify(Array.from(traySets)));

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
  const fillOk = rep.tutorial.filter(s => s.filled !== undefined && s.step !== 'sortPut').every(s => s.filled === 3);
  const dragOk = rep.tutorial.filter(s => s.drag).every(s => s.hint === true && s.advanced === true && s.filled === 3 &&
    s.wrongThen.advanced === false && s.wrongThen.filled === 0 && s.wrongThen.stillInTray === true);
  const outOk = rep.tutorial.filter(s => s.out).every(s => s.ended === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1);
  const semOk = rep.rounds.every(s => s.audioOk === true);
  const orderOk = rep.rounds.every(s => s.type !== 'L114A' || s.filled === 3);
  const quietOk = rep.rounds.every(s => s.type === 'L114A'
    ? (s.lineOk === true && (s.praiseBad || []).length === 0)
    : (s.voiceOnCorrect || []).length === 0);
  const noOv = o => !o || (o.sw <= o.iw + 1 && o.sh <= o.ih + 1 && o.cut.length === 0 && o.zero.length === 0);
  const noOverflow = rep.tutorial.every(s => noOv(s.overflow)) && rep.rounds.every(s => noOv(s.overflow));
  const ok = rep.errors.length === 0 && sigOk && audioOk && demoOk && fillOk && dragOk && outOk &&
    roundsOk && semOk && orderOk && quietOk && noOverflow &&
    rep.rounds.length === 12 &&
    seenType.L114A === 4 && seenType.L114B === 4 && seenType.L114C === 4 &&
    slotSets.size >= 2 && traySets.size >= 2 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === false && rep.checks.done.cleared === true &&
    rep.checks.done.u11 === 4 && rep.checks.done.ui === 11 &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0;

  console.log('PROBE_' + (ok ? 'PASS' : 'FAIL') +
    ' sigOk=' + sigOk + ' audioOk=' + audioOk + ' demoOk=' + demoOk + ' fillOk=' + fillOk +
    ' dragOk=' + dragOk + ' outOk=' + outOk +
    ' roundsOk=' + roundsOk + ' semOk=' + semOk + ' orderOk=' + orderOk + ' quietOk=' + quietOk +
    ' noOverflow=' + noOverflow + ' steps=' + rep.tutorial.length +
    ' types=' + JSON.stringify(seenType) +
    ' slotVariants=' + slotSets.size + ' trayVariants=' + traySets.size +
    ' stars=' + rep.checks.done.stars + ' grand=' + rep.checks.done.grand +
    ' cleared=' + rep.checks.done.cleared + ' u11=' + rep.checks.done.u11 + ' ui=' + rep.checks.done.ui);

  finish(ok ? 0 : 1);
})().catch(e => { console.log('PROBE_ERROR', e && e.message); finish(2); });
