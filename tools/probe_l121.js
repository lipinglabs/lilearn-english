// 第 12 岛第 1 关（L12-W1：自我介绍 What's your name?）专项测试｜第 12 岛开篇
//   1) 解锁链：11-5 未通时 12-1 锁定；通关 11-5 后 unlockedIsland=12、unlockedLevel[12]=1。
//   2) 地图第 12 岛：图标必须是手写 SVG（不是 emoji 字符），主题为「自我介绍」。
//   3) 教学 6 环节：男孩+女孩出场 → 男孩问 → 女孩答 → 点出 Lily（互动）→ 男孩答 → 过渡。
//   4) 三题型 12 轮 4/4/4：A 听音找人 / B 听对话选回答（语音气泡）/ C 拖拽匹配名字（两步）。
//   5) 防背题：A 答案位不连续重复、C 的两个小孩组合不连续重复；探针统计种类数。
//   6) 剧情台词：B 气泡播完自己的句子才判；C 两张牌都挂好后把两个名字念完再给星星，全程无 praise_*。
//   7) **唯一允许拉丁字母的地方是名字牌**（Lily / Leo / Tom）；其余任何英文都必须为零。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const os = require('os'), path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'l121';
const PORT = 9950 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
const BOOT_TRIES = parseInt(process.env.L121_BOOT_TRIES || '1400', 10);

const NAME = { leo: 'Leo', lily: 'Lily', tom: 'Tom' };
const A_AUDIO = { leo: 'l121_a_leo', lily: 'l121_a_lily', tom: 'l121_a_tom' };
const LINE_OF = { leo: 'l121_line_leo', lily: 'l121_b_yes', tom: 'l121_line_tom' };
const ALLOW = /Lily|Leo|Tom/g;

const STEPS = [
  { n: 'friends', word: 'l121_t_friends', demo: true, kids: 2 },
  { n: 'askq', word: 'l121_t_ask_q', demo: true, kids: 2 },
  { n: 'aska', word: 'l121_t_ask_a', demo: true, kids: 2 },
  { n: 'findLily', word: 'l121_t_find_lily', ask: true, want: 'lily' },
  { n: 'leo', word: 'l121_t_leo', demo: true, kids: 2 },
  { n: 'out', word: 'l121_t_out', out: true }   /* 过渡步停留极短，不断言画面元素（RULES §三.31） */
];

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-l121-' + Date.now()),
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
        var s = document.querySelector('.l121-stage');
        if (!s) return null;
        return 'sid:' + (s.dataset.sid || (s.dataset.l121ask ? 'q' : '?'));
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
    await sleep(150);
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
    Array.prototype.forEach.call(document.querySelectorAll('#askDisplay .l121-card, #askDisplay .l121-bubble, #askDisplay .l121-kidbox, #askDisplay .l121-badge, #askDisplay .l121-big'), function(n){
      var r=n.getBoundingClientRect(); if(!r.width||!r.height) zero.push((n.tagName||'')+'.'+(n.getAttribute('class')||''));
    });
    return { sw: d.scrollWidth, iw: iw, sh: d.scrollHeight, ih: ih, cut: cut.slice(0,6), zero: zero.slice(0,6) };
  })()`);
  const keysBetween = (a, b) => ev(`window.__played.filter(function(p){return p.t>=${a}&&p.t<=${b};}).map(function(p){
    for (var k in window.VOICE_BANK) if (window.VOICE_BANK[k] === p.src) return k;
    return 'unknown';
  })`);
  const cards = () => ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l121-card'),function(n){return n.dataset.who;})");
  const badgeNames = () => ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l121-card text'),function(n){return n.textContent;})");
  const bubbles = () => ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l121-bubble'),function(n){return n.dataset.kind;})");
  const kidBoxes = () => ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l121-kidbox'),function(n){return n.dataset.kid;})");
  const trayBadges = () => ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l121-tray3 .l121-badge'),function(n){return n.dataset.who;})");
  const hanged = () => ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l121-badge-on'),function(n){return n.dataset.who;}).sort().join(',')");

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };

  // ---------- 0) 解锁链 + 地图第 12 岛 ----------
  await ev('Game.resetProgress()');
  await ev('for (var i=1;i<=7;i++){ for (var l=1;l<=5;l++) Game.markCleared(i,l); }');
  await ev('for (var l=1;l<=5;l++) Game.markCleared(8,l)');
  await ev('for (var l=1;l<=5;l++) Game.markCleared(9,l)');
  for (let l = 1; l <= 5; l++) await ev('Game.markCleared(10,' + l + ')');
  for (let l = 1; l <= 4; l++) await ev('Game.markCleared(11,' + l + ')');
  rep.checks.lockedBefore = JSON.parse(await ev('JSON.stringify({ui:Game.progress.unlockedIsland, u12:Game.progress.unlockedLevel[12]||null, c115:!!Game.progress.cleared["11-5"]})'));
  if (rep.checks.lockedBefore.u12 !== null) rep.errors.push('未通 11-5 时 unlockedLevel[12] 应为空，实际 ' + rep.checks.lockedBefore.u12);
  if (rep.checks.lockedBefore.c115 !== false) rep.errors.push('未通关时 cleared[11-5] 不该为真');

  await ev('Game.markCleared(11,5)');
  rep.checks.after115 = JSON.parse(await ev('JSON.stringify({ui:Game.progress.unlockedIsland, u12:Game.progress.unlockedLevel[12]||null})'));
  if (rep.checks.after115.ui !== 12) rep.errors.push('通关 11-5 后 unlockedIsland 应为 12，实际 ' + rep.checks.after115.ui);
  if (rep.checks.after115.u12 !== 1) rep.errors.push('通关 11-5 后 unlockedLevel[12] 应为 1，实际 ' + rep.checks.after115.u12);

  await ev('Game.backToMap()'); await sleep(500);
  rep.checks.island12 = await ev(`(function(){
    var c=document.querySelector('#islandGrid .island[data-island="12"]');
    if(!c) return {found:false};
    var ic=c.querySelector('.icon');
    return {
      found: true,
      hasSvg: !!(ic && ic.querySelector('svg')),
      text: (ic ? (ic.textContent||'').trim() : ''),
      unlocked: c.classList.contains('unlocked'),
      label: c.getAttribute('aria-label') || ''
    };
  })()`);
  if (!rep.checks.island12.found) rep.errors.push('地图上找不到第 12 岛');
  else {
    if (rep.checks.island12.hasSvg !== true) rep.errors.push('第 12 岛图标不是手写 SVG');
    if (rep.checks.island12.text !== '') rep.errors.push('第 12 岛图标里出现了文字/emoji：「' + rep.checks.island12.text + '」');
    if (rep.checks.island12.unlocked !== true) rep.errors.push('通关 11-5 后第 12 岛应解锁');
    if (rep.checks.island12.label.indexOf('自我介绍') < 0) rep.errors.push('第 12 岛主题不是「自我介绍」：' + rep.checks.island12.label);
  }

  // ---------- 1) 教学 ----------
  await ev('Game.openIsland(12)'); await sleep(200);
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
    const end = Date.now() + 20000;
    while (Date.now() < end) { foundIdx = await findEntry('sid:' + st.n, logCursor); if (foundIdx >= 0) break; await sleep(70); }
    const entry = foundIdx >= 0 ? JSON.parse(await ev('JSON.stringify(window.__stageLog[' + foundIdx + '])')) : null;
    if (foundIdx >= 0) logCursor = foundIdx + 1;
    const row = { step: st.n, reached: !!entry, sigOk: !!entry && entry.sig === 'sid:' + st.n };
    if (!row.sigOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）舞台不符：' + (entry ? entry.sig : 'missing'));

    if (entry) {
      await sleep(220);
      row.audio = (await keysBetween(entry.t - 900, entry.t + 3600)).filter(k => k !== 'unknown');
      row.audioOk = row.audio.indexOf(st.word) >= 0;
      if (!row.audioOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）语音不符：期望 ' + st.word + '，实际 ' + row.audio.join(','));
      if (st.kids) {
        row.kids = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l121-bigkid'),function(n){return n.dataset.who;})");
        row.kidsOk = (row.kids || []).length === st.kids;
        if (!row.kidsOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）小朋友不是 ' + st.kids + ' 个：' + JSON.stringify(row.kids));
      }
      if (st.ask) {
        row.cards = await cards();
        if ((row.cards || []).length !== 3) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）角色卡不是 3 张：' + JSON.stringify(row.cards));
        if (row.cards && new Set(row.cards).size !== 3) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）角色卡重复：' + JSON.stringify(row.cards));
        row.badges = await badgeNames();
        row.badgesOk = !!row.badges && row.badges.length === 3;
        if (!row.badgesOk) rep.errors.push('教学互动里三个名字牌没画出来：' + JSON.stringify(row.badges));
      }
      row.overflow = await overflow();
    }

    if (st.demo) {
      row.tapShown = await wait(sel('.f11-tap'), 12000);
      if (!row.tapShown) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示定格后没有出现「轻点继续」');
      row.autoAdvanced = (await ev('window.__stageLog.length')) > (foundIdx + 1);
      if (row.autoAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示未点按就自动前进了');
      const pt = await centerOf('#askDisplay .l121-stage');
      if (pt) await clickXY(pt.x, pt.y);
      row.advanced = await wait('window.__stageLog.length > ' + (foundIdx + 1), 7000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    if (st.ask) {
      row.hint = await wait(sel('.tut-hint'), 9500);
      if (!row.hint) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手没有出现');
      const before0 = await ev('window.__stageLog.length');
      const wrong = (row.cards || []).filter(k => k !== st.want)[0];
      const cw = await centerOf('#askDisplay .l121-card[data-who="' + wrong + '"]');
      if (cw) await clickXY(cw.x, cw.y);
      await sleep(700);
      row.wrongThen = {
        advanced: (await ev('window.__stageLog.length')) > before0,
        stuck: await ev("document.querySelectorAll('#askDisplay .l121-card').length")
      };
      if (row.wrongThen.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错角色却推进了');
      if (row.wrongThen.stuck !== 3) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错后卡片消失了：' + row.wrongThen.stuck);
      const c = await centerOf('#askDisplay .l121-card[data-who="' + st.want + '"]');
      if (!c) { rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）找不到正确角色卡'); }
      else {
        await clickXY(c.x, c.y);
        row.advanced = await wait('window.__stageLog.length > ' + before0, 7000);
        if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点对后没有推进');
      }
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
  const seenOv = {};
  const posSets = new Set();
  const pairSets = new Set();
  const badgeSeen = new Set();
  const wrongTested = { L121A: false, L121B: false, L121C: false };

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(430);
    const snap = await ev('Game.snapshot()');
    const q = snap.question;
    if (!q) { rep.errors.push('第 ' + r + ' 轮：答题未开始'); break; }
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, items: q.l121items, answer: q.l121answer };
    const starsBefore = await ev('Game.stars');
    let ct = Date.now();
    if (!seenOv[q.type]) { seenOv[q.type] = 1; row.overflow = await overflow(); }

    if (q.type === 'L121A') {
      row.cards = await cards();
      row.badges = await badgeNames();
      (row.badges || []).forEach(b => badgeSeen.add(b));
      row.audioOk = q.audio === A_AUDIO[q.l121items[q.l121answer]];
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L121A 语音与答案人不符：' + q.audio + ' / ' + q.l121items[q.l121answer]);
      if (!row.cards || row.cards.length !== 3) rep.errors.push('第 ' + r + ' 轮 L121A 卡片不是 3 张：' + JSON.stringify(row.cards));
      if (row.cards && new Set(row.cards).size !== 3) rep.errors.push('第 ' + r + ' 轮 L121A 卡片重复：' + JSON.stringify(row.cards));
      if (row.cards && JSON.stringify(row.cards) !== JSON.stringify(q.l121items)) rep.errors.push('第 ' + r + ' 轮 L121A 卡片顺序与题面不一致：' + JSON.stringify(row.cards) + ' vs ' + JSON.stringify(q.l121items));
      const wantName = NAME[q.l121items[q.l121answer]];
      if (!row.badges || row.badges.indexOf(wantName) < 0) rep.errors.push('第 ' + r + ' 轮 L121A 三个名字牌里没有 ' + wantName + '：' + JSON.stringify(row.badges));
      posSets.add(q.l121answer);

      if (!wrongTested.L121A && row.cards) {
        wrongTested.L121A = true;
        const wi = q.l121answer === 0 ? 1 : 0;
        const cw = await centerOf('#askDisplay .l121-card[data-idx="' + wi + '"]');
        const ctw = Date.now();
        if (cw) await clickXY(cw.x, cw.y);
        await sleep(720);
        row.wrongVoice = (await keysBetween(ctw, ctw + 950)).filter(k => k !== 'unknown');
        if (row.wrongVoice.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 L121A 点错没有温柔鼓励（again）');
        if ((await ev('Game.round')) > (r - 1)) rep.errors.push('第 ' + r + ' 轮 L121A 点错却推进了');
      }
      const c = await centerOf('#askDisplay .l121-card[data-idx="' + q.l121answer + '"]');
      if (!c) { rep.errors.push('第 ' + r + ' 轮 L121A 找不到答案卡'); break; }
      ct = Date.now();
      await clickXY(c.x, c.y);
      await sleep(260);
      row.voiceOnCorrect = (await keysBetween(ct, ct + 400)).filter(k => k !== 'unknown');
      if (row.voiceOnCorrect.length) rep.errors.push('第 ' + r + ' 轮 L121A 答对后播放了语音：' + row.voiceOnCorrect.join(','));
    } else if (q.type === 'L121B') {
      row.bubbles = await bubbles();
      row.audioOk = q.audio === 'l121_b_ask';
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L121B 问句语音不符：' + q.audio);
      if (!row.bubbles || row.bubbles.length !== 2) rep.errors.push('第 ' + r + ' 轮 L121B 气泡不是 2 个：' + JSON.stringify(row.bubbles));
      if (row.bubbles && row.bubbles.indexOf('yes') < 0) rep.errors.push('第 ' + r + ' 轮 L121B 没有正确气泡：' + JSON.stringify(row.bubbles));
      if (row.bubbles && q.l121items[q.l121answer] !== 'yes') rep.errors.push('第 ' + r + ' 轮 L121B 答案位不是正确气泡');
      /* 气泡里不许出现文字（本关只有名字牌允许字母，气泡是纯语音） */
      row.bubbleText = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l121-bubble'),function(n){return (n.textContent||'').trim();}).join('|')");
      if (row.bubbleText !== '' && row.bubbleText !== '|') rep.errors.push('第 ' + r + ' 轮 L121B 气泡里出现了文字：' + row.bubbleText);

      if (!wrongTested.L121B) {
        wrongTested.L121B = true;
        const wi = row.bubbles ? row.bubbles.indexOf('no') : -1;
        const cw = await centerOf('#askDisplay .l121-bubble[data-idx="' + wi + '"]');
        const ctw = Date.now();
        if (cw) await clickXY(cw.x, cw.y);
        await sleep(900);
        row.wrongVoice = (await keysBetween(ctw, ctw + 1200)).filter(k => k !== 'unknown');
        if (row.wrongVoice.indexOf('l121_b_no') < 0) rep.errors.push('第 ' + r + ' 轮 L121B 点了错误气泡却没播它的句子：' + row.wrongVoice.join(','));
        if (row.wrongVoice.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 L121B 选错没有温柔鼓励（again）');
        if ((await ev('Game.round')) > (r - 1)) rep.errors.push('第 ' + r + ' 轮 L121B 选错却推进了');
      }
      const c = await centerOf('#askDisplay .l121-bubble[data-idx="' + q.l121answer + '"]');
      if (!c) { rep.errors.push('第 ' + r + ' 轮 L121B 找不到正确气泡'); break; }
      ct = Date.now();
      await clickXY(c.x, c.y);
      await sleep(900);
      row.voiceOnCorrect = (await keysBetween(ct, Date.now())).filter(k => k !== 'unknown');
      if (row.voiceOnCorrect.indexOf('l121_b_yes') < 0) rep.errors.push('第 ' + r + ' 轮 L121B 选对却没播回答句：' + row.voiceOnCorrect.join(','));
    } else {
      row.kids = await kidBoxes();
      row.tray = await trayBadges();
      /* 注意：snapshot 的 audio 只取第一句，完整数组在 audios（§探针口径） */
      const auds = q.audios || [];
      row.audioOk = JSON.stringify(auds) === JSON.stringify(q.l121kids.map(k => 'l121_c_' + k));
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L121C 语音与两个小孩不匹配：' + JSON.stringify(auds) + ' / ' + JSON.stringify(q.l121kids));
      if (JSON.stringify(row.kids) !== JSON.stringify(q.l121kids)) rep.errors.push('第 ' + r + ' 轮 L121C 小孩顺序与题面不一致：' + JSON.stringify(row.kids) + ' vs ' + JSON.stringify(q.l121kids));
      if (JSON.stringify(row.tray) !== JSON.stringify(q.l121badges)) rep.errors.push('第 ' + r + ' 轮 L121C 名字牌顺序与题面不一致：' + JSON.stringify(row.tray) + ' vs ' + JSON.stringify(q.l121badges));
      if ((row.kids || []).length !== 2 || (row.tray || []).length !== 2) rep.errors.push('第 ' + r + ' 轮 L121C 小孩/名字牌不是各 2 个');
      pairSets.add((q.l121kids || []).join('-'));

      if (!wrongTested.L121C) {
        wrongTested.L121C = true;
        /* 把 A 的牌子拖给 B（错的） */
        const badBadge = q.l121kids[0], badKid = q.l121kids[1];
        const ctw = Date.now();
        await drag('#askDisplay .l121-badge[data-who="' + badBadge + '"]', '#askDisplay .l121-kidbox[data-kid="' + badKid + '"]');
        await sleep(780);
        row.wrongThen = {
          voice: (await keysBetween(ctw, ctw + 1000)).filter(k => k !== 'unknown'),
          residents: await hanged(),
          badgeBack: await ev(`!!document.querySelector('#askDisplay .l121-badge[data-who="${badBadge}"]')`),
          advanced: (await ev('Game.round')) > (r - 1)
        };
        if (row.wrongThen.voice.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 L121C 挂错人没有温柔鼓励（again）');
        if (row.wrongThen.residents !== '') rep.errors.push('第 ' + r + ' 轮 L121C 挂错人却留下了名字牌：' + row.wrongThen.residents);
        if (row.wrongThen.advanced) rep.errors.push('第 ' + r + ' 轮 L121C 挂错人却推进了');
      }

      ct = Date.now();
      /* 逐个挂对 */
      for (let i = 0; i < (q.l121kids || []).length; i++) {
        const who = q.l121kids[i];
        await drag('#askDisplay .l121-badge[data-who="' + who + '"]', '#askDisplay .l121-kidbox[data-kid="' + who + '"]');
        await sleep(300);
      }
      row.hanged = await hanged();
      const want = (q.l121kids || []).slice().sort().join(',');
      if (row.hanged !== want) rep.errors.push('第 ' + r + ' 轮 L121C 名字牌没有全部挂好：' + row.hanged + ' 期望 ' + want);
      row.trayLeft = (await trayBadges()).length;
      if (row.trayLeft !== 0) rep.errors.push('第 ' + r + ' 轮 L121C 底部还剩名字牌：' + row.trayLeft);
    }

    const advanced = await wait('Game.round > ' + (r - 1) + ' || Game.phase === "done"', 9000);
    row.advanced = advanced;
    if (q.type === 'L121B' || q.type === 'L121C') {
      row.voicesAll = (await keysBetween(ct, Date.now())).filter(k => k !== 'unknown');
      const need = (q.type === 'L121B')
        ? ['l121_b_yes']
        : (q.l121kids || []).map(k => LINE_OF[k]);
      row.linesOk = need.every(k => row.voicesAll.indexOf(k) >= 0);
      if (!row.linesOk) rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 剧情台词没播全：期望 ' + need.join('+') + '，实际 ' + row.voicesAll.join(','));
      row.praise = row.voicesAll.filter(k => k.indexOf('praise') === 0);
      row.praiseBad = (r < 12) ? row.praise : [];   /* 最后一轮是通关庆祝（§三.25） */
      if (row.praiseBad.length) rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 播了夸奖人声：' + row.praiseBad.join(','));
    }
    row.starsDelta = (await ev('Game.stars')) - starsBefore;
    if (!advanced) rep.errors.push('第 ' + r + ' 轮没有推进（' + q.type + '）');
    if (row.starsDelta !== 1) rep.errors.push('第 ' + r + ' 轮星星未 +1（' + row.starsDelta + '）');
    rep.rounds.push(row);
    await sleep(150);
  }

  await sleep(900);
  rep.checks.done = await ev(`(function(){
    var flag = document.querySelector('.island-flag');
    return { phase: Game.phase, stars: Game.stars,
             grand: document.getElementById('viewDone').classList.contains('grand'),
             stageFlag: !!flag,
             cleared: !!Game.progress.cleared['12-1'],
             u12: Game.progress.unlockedLevel[12] || null,
             ui: Game.progress.unlockedIsland };
  })()`);
  rep.checks.types = seenType;
  rep.checks.posVariants = Array.from(posSets).sort();
  rep.checks.pairVariants = Array.from(pairSets);
  rep.checks.badgeSeen = Array.from(badgeSeen).sort();
  if (posSets.size < 2) rep.errors.push('L121A 的答案位置从未变化：' + JSON.stringify(rep.checks.posVariants));
  if (pairSets.size < 2) rep.errors.push('L121C 的两个小孩组合从未变化：' + JSON.stringify(rep.checks.pairVariants));
  if (rep.checks.badgeSeen.join(',') !== 'Leo,Lily,Tom') rep.errors.push('三个名字牌没有都出现过：' + JSON.stringify(rep.checks.badgeSeen));

  const scan = (root) => ev(`(function(){
    var out = [];
    var ALLOW = ${JSON.stringify('Lily|Leo|Tom')};
    function strip(t){
      return String(t||'').replace(new RegExp(ALLOW, 'g'), '');
    }
    var t = document.querySelector(${JSON.stringify(root)});
    if (!t) return ['no-root'];
    var txt = t.textContent || '';
    var m = strip(txt).match(/[A-Za-z]+/g); if (m) out.push('text:' + m.join(','));
    var labs = [];
    Array.prototype.forEach.call(t.querySelectorAll('[aria-label]'), function(n){
      var v = strip(n.getAttribute('aria-label') || ''); if (/[A-Za-z]/.test(v)) labs.push(n.getAttribute('aria-label'));
    });
    if (labs.length) out.push('aria:' + labs.join('|'));
    return out;
  })()`);
  /* 通关页上也有名字牌（C 的 resident），单独扫一遍 */
  rep.checks.englishDone = await scan('#screenLevel');
  await ev('Game.backToMap()'); await sleep(500);
  rep.checks.englishMap = await scan('#screenMap');

  console.log(JSON.stringify(rep, null, 2));

  const sigOk = rep.tutorial.every(s => s.sigOk);
  const audioOk = rep.tutorial.every(s => s.audioOk);
  const demoOk = rep.tutorial.filter(s => s.demo).every(s => s.tapShown === true && s.autoAdvanced === false && s.advanced === true);
  const artOk = rep.tutorial.every(s => s.kidsOk !== false && s.badgesOk !== false);
  const askOk = rep.tutorial.filter(s => s.ask).every(s => s.hint === true && s.advanced === true &&
    s.wrongThen.advanced === false && s.wrongThen.stuck === 3);
  const outOk = rep.tutorial.filter(s => s.out).every(s => s.ended === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1);
  const semOk = rep.rounds.every(s => s.audioOk === true);
  const dragOk = rep.rounds.every(s => s.type !== 'L121C' || (s.hanged === (s.kids || []).slice().sort().join(',') && s.trayLeft === 0));
  const quietOk = rep.rounds.every(s => (s.type === 'L121B' || s.type === 'L121C')
    ? (s.linesOk === true && (s.praiseBad || []).length === 0)
    : (s.voiceOnCorrect || []).length === 0);
  const noOv = o => !o || (o.sw <= o.iw + 1 && o.sh <= o.ih + 1 && o.cut.length === 0 && o.zero.length === 0);
  const noOverflow = rep.tutorial.every(s => noOv(s.overflow)) && rep.rounds.every(s => noOv(s.overflow));
  const ok = rep.errors.length === 0 && sigOk && audioOk && demoOk && artOk && askOk && outOk &&
    roundsOk && semOk && dragOk && quietOk && noOverflow &&
    rep.rounds.length === 12 &&
    seenType.L121A === 4 && seenType.L121B === 4 && seenType.L121C === 4 &&
    posSets.size >= 2 && pairSets.size >= 2 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === false && rep.checks.done.cleared === true &&
    rep.checks.done.u12 === 1 && rep.checks.done.ui === 12 &&
    rep.checks.island12.hasSvg === true && rep.checks.island12.unlocked === true &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0;

  console.log('PROBE_' + (ok ? 'PASS' : 'FAIL') +
    ' sigOk=' + sigOk + ' audioOk=' + audioOk + ' demoOk=' + demoOk + ' artOk=' + artOk +
    ' askOk=' + askOk + ' outOk=' + outOk + ' roundsOk=' + roundsOk + ' semOk=' + semOk +
    ' dragOk=' + dragOk + ' quietOk=' + quietOk + ' noOverflow=' + noOverflow +
    ' steps=' + rep.tutorial.length + ' types=' + JSON.stringify(seenType) +
    ' posVariants=' + posSets.size + ' pairVariants=' + pairSets.size +
    ' stars=' + rep.checks.done.stars + ' grand=' + rep.checks.done.grand +
    ' cleared=' + rep.checks.done.cleared + ' u12=' + rep.checks.done.u12 + ' ui=' + rep.checks.done.ui +
    ' island12=' + JSON.stringify(rep.checks.island12));

  finish(ok ? 0 : 1);
})().catch(e => { console.log('PROBE_ERROR', e && e.message); finish(2); });
