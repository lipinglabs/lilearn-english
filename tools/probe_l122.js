// 第 12 岛第 2 关（L12-W2：字母音觉醒 A B C）专项测试
//   1) 解锁链：12-1 未通时 12-2 锁定；通关 12-1 后 unlockedLevel[12]=2。
//   2) 教学 6 环节：大字母 A → A 的音 + 苹果跳 → 点出读该音的字母（互动）→ B + 球 → C + 猫 → 过渡。
//   3) 三题型 12 轮 4/4/4：A 听音找字母 / B 听音找物品 / C 拖拽配对。
//   4) 防背题：A/B 答案位不连续重复、C 抽到的物品不连续重复（统计种类数）。
//   5) 剧情台词：C 放对先念「苹果从 A 开始」再给星星；A/B 答对必须完全静音（禁夸奖人声）。
//   6) **拉丁字母只允许出现在字母卡片内**（.l122-glyph）；其余任何位置出现字母即失败。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const os = require('os'), path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'l122';
const PORT = 9970 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
const BOOT_TRIES = parseInt(process.env.L122_BOOT_TRIES || '1400', 10);

const LETTER_OF = { apple: 'A', ball: 'B', cat: 'C' };
const STEPS = [
  { n: 'aName', word: 'l122_t_a_name', demo: true, letter: 'A' },
  { n: 'aSay', word: 'l122_t_a_say', demo: true, letter: 'A', item: 'apple' },
  { n: 'findA', word: 'l122_t_find', ask: true, want: 'A' },
  { n: 'bSay', word: 'l122_t_b', demo: true, letter: 'B', item: 'ball' },
  { n: 'cSay', word: 'l122_t_c', demo: true, letter: 'C', item: 'cat' },
  { n: 'out', word: 'l122_t_out', out: true }   /* 过渡步停留极短，不断言画面元素（§三.31） */
];

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-l122-' + Date.now()),
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
        var s = document.querySelector('.l122-stage');
        if (!s) return null;
        return 'sid:' + (s.dataset.sid || (s.dataset.l122ask ? 'q' : '?'));
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
    Array.prototype.forEach.call(document.querySelectorAll('#askDisplay .l122-card, #askDisplay .l122-slot, #askDisplay .l122-chip, #askDisplay .l122-bigletter, #askDisplay .l122-bigitem'), function(n){
      var r=n.getBoundingClientRect(); if(!r.width||!r.height) zero.push((n.tagName||'')+'.'+(n.getAttribute('class')||''));
    });
    return { sw: d.scrollWidth, iw: iw, sh: d.scrollHeight, ih: ih, cut: cut.slice(0,6), zero: zero.slice(0,6) };
  })()`);
  const keysBetween = (a, b) => ev(`window.__played.filter(function(p){return p.t>=${a}&&p.t<=${b};}).map(function(p){
    for (var k in window.VOICE_BANK) if (window.VOICE_BANK[k] === p.src) return k;
    return 'unknown';
  })`);
  const letterCards = () => ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l122-card'),function(n){return n.dataset.letter;})");
  const itemCards = () => ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l122-card'),function(n){return n.dataset.item;})");
  const slotLetters = () => ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l122-slot'),function(n){return n.dataset.letter;})");
  const trayItems = () => ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l122-chip'),function(n){return n.dataset.item;})");
  const placedIn = () => ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l122-on'),function(n){return n.parentNode.dataset.letter+':'+n.dataset.item;})");

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };

  // ---------- 0) 解锁链 ----------
  await ev('Game.resetProgress()');
  await ev('for (var i=1;i<=7;i++){ for (var l=1;l<=5;l++) Game.markCleared(i,l); }');
  for (let i = 8; i <= 11; i++) for (let l = 1; l <= 5; l++) await ev('Game.markCleared(' + i + ',' + l + ')');
  rep.checks.lockedBefore = JSON.parse(await ev('JSON.stringify({ui:Game.progress.unlockedIsland, u12:Game.progress.unlockedLevel[12]||null, c121:!!Game.progress.cleared["12-1"]})'));
  if (rep.checks.lockedBefore.u12 !== 1) rep.errors.push('通关 11-5 后 unlockedLevel[12] 应为 1（只开 12-1），实际 ' + rep.checks.lockedBefore.u12);

  await ev('Game.markCleared(12,1)');
  rep.checks.after121 = JSON.parse(await ev('JSON.stringify({u12:Game.progress.unlockedLevel[12]||null})'));
  if (rep.checks.after121.u12 !== 2) rep.errors.push('通关 12-1 后 unlockedLevel[12] 应为 2，实际 ' + rep.checks.after121.u12);

  // ---------- 1) 教学 ----------
  await ev('Game.openIsland(12)'); await sleep(200);
  await ev('Game.enterLevel(2)'); await sleep(250);
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
      if (st.letter) {
        row.letters = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l122-bigletter'),function(n){return n.dataset.letter;})");
        row.lettersOk = (row.letters || []).length === 1 && row.letters[0] === st.letter;
        if (!row.lettersOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）大字母不是 ' + st.letter + '：' + JSON.stringify(row.letters));
        if (st.item) {
          row.items = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l122-bigitem'),function(n){return n.dataset.item;})");
          row.itemsOk = (row.items || []).length === 1 && row.items[0] === st.item;
          if (!row.itemsOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）物品不是 ' + st.item + '：' + JSON.stringify(row.items));
        }
      }
      if (st.ask) {
        row.cards = await letterCards();
        if ((row.cards || []).length !== 3) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）字母卡不是 3 张：' + JSON.stringify(row.cards));
        if (row.cards && new Set(row.cards).size !== 3) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）字母卡重复：' + JSON.stringify(row.cards));
      }
      row.overflow = await overflow();
    }

    if (st.demo) {
      row.tapShown = await wait(sel('.f11-tap'), 12000);
      if (!row.tapShown) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示定格后没有出现「轻点继续」');
      row.autoAdvanced = (await ev('window.__stageLog.length')) > (foundIdx + 1);
      if (row.autoAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示未点按就自动前进了');
      const pt = await centerOf('#askDisplay .l122-stage');
      if (pt) await clickXY(pt.x, pt.y);
      row.advanced = await wait('window.__stageLog.length > ' + (foundIdx + 1), 7000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    if (st.ask) {
      row.hint = await wait(sel('.tut-hint'), 9500);
      if (!row.hint) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手没有出现');
      const before0 = await ev('window.__stageLog.length');
      const wrong = (row.cards || []).filter(k => k !== st.want)[0];
      const cw = await centerOf('#askDisplay .l122-card[data-letter="' + wrong + '"]');
      if (cw) await clickXY(cw.x, cw.y);
      await sleep(700);
      row.wrongThen = {
        advanced: (await ev('window.__stageLog.length')) > before0,
        stuck: await ev("document.querySelectorAll('#askDisplay .l122-card').length")
      };
      if (row.wrongThen.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错字母却推进了');
      if (row.wrongThen.stuck !== 3) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错后字母卡消失了：' + row.wrongThen.stuck);
      const c = await centerOf('#askDisplay .l122-card[data-letter="' + st.want + '"]');
      if (!c) { rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）找不到正确字母卡'); }
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
  const seenType = {}, seenOv = {};
  const posA = new Set(), posB = new Set(), pickC = new Set();
  const wrongTested = { L122A: false, L122B: false, L122C: false };

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(430);
    const snap = await ev('Game.snapshot()');
    const q = snap.question;
    if (!q) { rep.errors.push('第 ' + r + ' 轮：答题未开始'); break; }
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type };
    const starsBefore = await ev('Game.stars');
    let ct = Date.now();
    if (!seenOv[q.type]) { seenOv[q.type] = 1; row.overflow = await overflow(); }

    if (q.type === 'L122A') {
      row.items = q.l122items;
      row.answer = q.l122answer;
      row.cards = await letterCards();
      const wantLetter = q.l122items[q.l122answer];
      row.audioOk = q.audios[0] === 'l122_a_' + wantLetter.toLowerCase();
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L122A 语音与答案字母不符：' + q.audios[0] + ' / ' + wantLetter);
      if (!row.cards || row.cards.length !== 3) rep.errors.push('第 ' + r + ' 轮 L122A 卡片不是 3 张：' + JSON.stringify(row.cards));
      if (row.cards && new Set(row.cards).size !== 3) rep.errors.push('第 ' + r + ' 轮 L122A 卡片重复：' + JSON.stringify(row.cards));
      if (row.cards && JSON.stringify(row.cards) !== JSON.stringify(q.l122items)) rep.errors.push('第 ' + r + ' 轮 L122A 卡片顺序与题面不一致：' + JSON.stringify(row.cards) + ' vs ' + JSON.stringify(q.l122items));
      posA.add(q.l122answer);

      if (!wrongTested.L122A && row.cards) {
        wrongTested.L122A = true;
        const wi = q.l122answer === 0 ? 1 : 0;
        const cw = await centerOf('#askDisplay .l122-card[data-idx="' + wi + '"]');
        const ctw = Date.now();
        if (cw) await clickXY(cw.x, cw.y);
        await sleep(720);
        row.wrongVoice = (await keysBetween(ctw, ctw + 950)).filter(k => k !== 'unknown');
        if (row.wrongVoice.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 L122A 点错没有温柔鼓励（again）');
        if ((await ev('Game.round')) > (r - 1)) rep.errors.push('第 ' + r + ' 轮 L122A 点错却推进了');
      }
      const c = await centerOf('#askDisplay .l122-card[data-idx="' + q.l122answer + '"]');
      if (!c) { rep.errors.push('第 ' + r + ' 轮 L122A 找不到答案卡'); break; }
      ct = Date.now();
      await clickXY(c.x, c.y);
      await sleep(260);
      row.voiceOnCorrect = (await keysBetween(ct, ct + 400)).filter(k => k !== 'unknown');
      if (row.voiceOnCorrect.length) rep.errors.push('第 ' + r + ' 轮 L122A 答对后播放了语音：' + row.voiceOnCorrect.join(','));
    } else if (q.type === 'L122B') {
      row.items = q.l122items;
      row.answer = q.l122answer;
      row.cards = await itemCards();
      const wantItem = q.l122items[q.l122answer];
      row.audioOk = q.audios[0] === 'l122_b_' + LETTER_OF[wantItem].toLowerCase();
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L122B 语音与答案物品不符：' + q.audios[0] + ' / ' + wantItem);
      if (!row.cards || row.cards.length !== 3) rep.errors.push('第 ' + r + ' 轮 L122B 图片不是 3 张：' + JSON.stringify(row.cards));
      if (row.cards && new Set(row.cards).size !== 3) rep.errors.push('第 ' + r + ' 轮 L122B 图片重复：' + JSON.stringify(row.cards));
      if (row.cards && JSON.stringify(row.cards) !== JSON.stringify(q.l122items)) rep.errors.push('第 ' + r + ' 轮 L122B 图片顺序与题面不一致：' + JSON.stringify(row.cards) + ' vs ' + JSON.stringify(q.l122items));
      posB.add(q.l122answer);

      if (!wrongTested.L122B && row.cards) {
        wrongTested.L122B = true;
        const wi = q.l122answer === 0 ? 1 : 0;
        const cw = await centerOf('#askDisplay .l122-card[data-idx="' + wi + '"]');
        const ctw = Date.now();
        if (cw) await clickXY(cw.x, cw.y);
        await sleep(720);
        row.wrongVoice = (await keysBetween(ctw, ctw + 950)).filter(k => k !== 'unknown');
        if (row.wrongVoice.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 L122B 点错没有温柔鼓励（again）');
        if ((await ev('Game.round')) > (r - 1)) rep.errors.push('第 ' + r + ' 轮 L122B 点错却推进了');
      }
      const c = await centerOf('#askDisplay .l122-card[data-idx="' + q.l122answer + '"]');
      if (!c) { rep.errors.push('第 ' + r + ' 轮 L122B 找不到答案卡'); break; }
      ct = Date.now();
      await clickXY(c.x, c.y);
      await sleep(260);
      row.voiceOnCorrect = (await keysBetween(ct, ct + 400)).filter(k => k !== 'unknown');
      if (row.voiceOnCorrect.length) rep.errors.push('第 ' + r + ' 轮 L122B 答对后播放了语音：' + row.voiceOnCorrect.join(','));
    } else {
      row.pick = q.l122pick;
      row.slots = q.l122slots;
      row.tray = q.l122tray;
      row.audioOk = q.audios[0] === 'l122_c_' + q.l122pick;
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L122C 语音与要拖的物品不符：' + q.audios[0] + ' / ' + q.l122pick);
      row.domSlots = await slotLetters();
      row.domTray = await trayItems();
      if (JSON.stringify(row.domSlots) !== JSON.stringify(q.l122slots)) rep.errors.push('第 ' + r + ' 轮 L122C 字母槽与题面不一致：' + JSON.stringify(row.domSlots) + ' vs ' + JSON.stringify(q.l122slots));
      if (JSON.stringify(row.domTray) !== JSON.stringify(q.l122tray)) rep.errors.push('第 ' + r + ' 轮 L122C 底部物品与题面不一致：' + JSON.stringify(row.domTray) + ' vs ' + JSON.stringify(q.l122tray));
      if ((row.domSlots || []).length !== 3 || (row.domTray || []).length !== 3) rep.errors.push('第 ' + r + ' 轮 L122C 字母槽/物品不是各 3 个');
      pickC.add(q.l122pick);

      const rightLetter = LETTER_OF[q.l122pick];
      if (!wrongTested.L122C) {
        wrongTested.L122C = true;
        /* 把要拖的那个物品拖到**错的**字母槽 */
        const badSlot = (row.domSlots || []).filter(l => l !== rightLetter)[0];
        const ctw = Date.now();
        await drag('#askDisplay .l122-chip[data-item="' + q.l122pick + '"]', '#askDisplay .l122-slot[data-letter="' + badSlot + '"]');
        await sleep(820);
        row.wrongThen = {
          voice: (await keysBetween(ctw, ctw + 1000)).filter(k => k !== 'unknown'),
          placed: await placedIn(),
          back: await ev(`!!document.querySelector('#askDisplay .l122-chip[data-item="${q.l122pick}"]')`),
          advanced: (await ev('Game.round')) > (r - 1)
        };
        if (row.wrongThen.voice.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 L122C 放错字母没有温柔鼓励（again）');
        if ((row.wrongThen.placed || []).length !== 0) rep.errors.push('第 ' + r + ' 轮 L122C 放错字母却留下了物品：' + JSON.stringify(row.wrongThen.placed));
        if (row.wrongThen.back !== true) rep.errors.push('第 ' + r + ' 轮 L122C 放错后物品没有回到栏里（不能消失）');
        if (row.wrongThen.advanced) rep.errors.push('第 ' + r + ' 轮 L122C 放错却推进了');
      }

      ct = Date.now();
      await drag('#askDisplay .l122-chip[data-item="' + q.l122pick + '"]', '#askDisplay .l122-slot[data-letter="' + rightLetter + '"]');
      await sleep(400);
      row.placed = await placedIn();
      if (JSON.stringify(row.placed) !== JSON.stringify([rightLetter + ':' + q.l122pick])) {
        rep.errors.push('第 ' + r + ' 轮 L122C 物品没有放进正确的字母槽：' + JSON.stringify(row.placed));
      }
      row.trayLeft = (await trayItems()).length;
      if (row.trayLeft !== 2) rep.errors.push('第 ' + r + ' 轮 L122C 放进后底部应剩 2 个，实际 ' + row.trayLeft);
    }

    const advanced = await wait('Game.round > ' + (r - 1) + ' || Game.phase === "done"', 9000);
    row.advanced = advanced;
    if (q.type === 'L122C') {
      row.voicesAll = (await keysBetween(ct, Date.now())).filter(k => k !== 'unknown');
      const need = 'l122_line_' + q.l122pick;
      row.linesOk = row.voicesAll.indexOf(need) >= 0;
      if (!row.linesOk) rep.errors.push('第 ' + r + ' 轮 L122C 剧情台词没播：期望 ' + need + '，实际 ' + row.voicesAll.join(','));
      row.praise = row.voicesAll.filter(k => k.indexOf('praise') === 0);
      row.praiseBad = (r < 12) ? row.praise : [];   /* 最后一轮是通关庆祝（§三.25） */
      if (row.praiseBad.length) rep.errors.push('第 ' + r + ' 轮 L122C 播了夸奖人声：' + row.praiseBad.join(','));
    }
    row.starsDelta = (await ev('Game.stars')) - starsBefore;
    if (!advanced) rep.errors.push('第 ' + r + ' 轮没有推进（' + q.type + '）');
    if (row.starsDelta !== 1) rep.errors.push('第 ' + r + ' 轮星星未 +1（' + row.starsDelta + '）');
    rep.rounds.push(row);
    await sleep(150);
  }

  await sleep(900);
  rep.checks.done = await ev(`(function(){
    return { phase: Game.phase, stars: Game.stars,
             grand: document.getElementById('viewDone').classList.contains('grand'),
             cleared: !!Game.progress.cleared['12-2'],
             u12: Game.progress.unlockedLevel[12] || null,
             ui: Game.progress.unlockedIsland };
  })()`);
  rep.checks.types = seenType;
  rep.checks.posA = Array.from(posA).sort();
  rep.checks.posB = Array.from(posB).sort();
  rep.checks.pickC = Array.from(pickC).sort();
  if (posA.size < 2) rep.errors.push('L122A 的答案位置从未变化：' + JSON.stringify(rep.checks.posA));
  if (posB.size < 2) rep.errors.push('L122B 的答案位置从未变化：' + JSON.stringify(rep.checks.posB));
  if (pickC.size < 2) rep.errors.push('L122C 要拖的物品从未变化：' + JSON.stringify(rep.checks.pickC));

  /* 字母白名单：只允许出现在 .l122-glyph（字母卡里的 <text>） */
  const scan = (root) => ev(`(function(){
    var out = [];
    var t = document.querySelector(${JSON.stringify(root)});
    if (!t) return ['no-root'];
    var wk = document.createTreeWalker(t, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = wk.nextNode())) {
      var v = n.nodeValue || '';
      if (!/[A-Za-z]/.test(v)) continue;
      var p = n.parentElement;
      if (!p || !p.closest('.l122-glyph')) out.push('text:' + v.trim().slice(0, 12));
    }
    var labs = [];
    Array.prototype.forEach.call(t.querySelectorAll('[aria-label]'), function(el){
      if (/[A-Za-z]/.test(el.getAttribute('aria-label') || '')) labs.push(el.getAttribute('aria-label'));
    });
    if (labs.length) out.push('aria:' + labs.join('|'));
    return out;
  })()`);
  rep.checks.englishDone = await scan('#screenLevel');
  await ev('Game.backToMap()'); await sleep(500);
  rep.checks.englishMap = await scan('#screenMap');

  console.log(JSON.stringify(rep, null, 2));

  const sigOk = rep.tutorial.every(s => s.sigOk);
  const audioOk = rep.tutorial.every(s => s.audioOk);
  const demoOk = rep.tutorial.filter(s => s.demo).every(s => s.tapShown === true && s.autoAdvanced === false && s.advanced === true);
  const artOk = rep.tutorial.every(s => s.lettersOk !== false && s.itemsOk !== false);
  const askOk = rep.tutorial.filter(s => s.ask).every(s => s.hint === true && s.advanced === true &&
    s.wrongThen.advanced === false && s.wrongThen.stuck === 3);
  const outOk = rep.tutorial.filter(s => s.out).every(s => s.ended === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1);
  const semOk = rep.rounds.every(s => s.audioOk === true);
  const dragOk = rep.rounds.every(s => s.type !== 'L122C' ||
    (JSON.stringify(s.placed) === JSON.stringify([LETTER_OF[s.pick] + ':' + s.pick]) && s.trayLeft === 2));
  const quietOk = rep.rounds.every(s => (s.type === 'L122C')
    ? (s.linesOk === true && (s.praiseBad || []).length === 0)
    : (s.voiceOnCorrect || []).length === 0);
  const noOv = o => !o || (o.sw <= o.iw + 1 && o.sh <= o.ih + 1 && o.cut.length === 0 && o.zero.length === 0);
  const noOverflow = rep.tutorial.every(s => noOv(s.overflow)) && rep.rounds.every(s => noOv(s.overflow));
  const ok = rep.errors.length === 0 && sigOk && audioOk && demoOk && artOk && askOk && outOk &&
    roundsOk && semOk && dragOk && quietOk && noOverflow &&
    rep.rounds.length === 12 &&
    seenType.L122A === 4 && seenType.L122B === 4 && seenType.L122C === 4 &&
    posA.size >= 2 && posB.size >= 2 && pickC.size >= 2 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === false && rep.checks.done.cleared === true &&
    /* 12-3 还不存在，markCleared 不会越界解锁，所以仍是 2（不是 bug） */
    rep.checks.done.u12 === 2 && rep.checks.done.ui === 12 &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0;

  console.log('PROBE_' + (ok ? 'PASS' : 'FAIL') +
    ' sigOk=' + sigOk + ' audioOk=' + audioOk + ' demoOk=' + demoOk + ' artOk=' + artOk +
    ' askOk=' + askOk + ' outOk=' + outOk + ' roundsOk=' + roundsOk + ' semOk=' + semOk +
    ' dragOk=' + dragOk + ' quietOk=' + quietOk + ' noOverflow=' + noOverflow +
    ' steps=' + rep.tutorial.length + ' types=' + JSON.stringify(seenType) +
    ' posA=' + posA.size + ' posB=' + posB.size + ' pickC=' + pickC.size +
    ' stars=' + rep.checks.done.stars + ' grand=' + rep.checks.done.grand +
    ' cleared=' + rep.checks.done.cleared + ' u12=' + rep.checks.done.u12 + ' ui=' + rep.checks.done.ui +
    ' en=' + JSON.stringify([rep.checks.englishDone, rep.checks.englishMap]));

  finish(ok ? 0 : 1);
})().catch(e => { console.log('PROBE_ERROR', e && e.message); finish(2); });
