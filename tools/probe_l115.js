// 第 11 岛第 5 关（L11-W5：童话故事游乐场大结局）专项测试｜岛末综合关
//   1) 解锁链：11-4 未通时 11-5 锁定；通关 11-4 后 unlockedLevel[11]=5。
//   2) 教学 6 环节：三个主角入场 → 逐个点名 → 点出小红帽（互动）→ 大灰狼出场 → 狼在森林 → 过渡。
//   3) 三题型 12 轮 4/4/4：A 听故事找细节 / B 听台词找角色 / C 两个角色各回各家（两步拖拽）。
//   4) 防背题（用户重点要求）：选项洗牌 + 答案位不连续重复 + C 的奶奶家左右变化 + 底部角色先后变化。
//   5) 剧情台词：C 两个都送到后先播「What a party!」再给星星，且不得有 praise_* 人声。
//   6) 岛末关三件事（§三.25）：cleared['11-5'] / grand + 舞台小旗 / 地图第 11 岛 .cleared + .island-flag-badge。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const os = require('os'), path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'l115';
const PORT = 9940 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
const BOOT_TRIES = parseInt(process.env.L115_BOOT_TRIES || '1400', 10);

const LINE = 'l115_line_party';
const A_WANT = { l115_a_grandma: 'red', l115_a_house: 'house', l115_a_porridge: 'porridge' };
const B_WANT = { l115_b_knock: 'pig', l115_b_blow: 'wolf', l115_b_basket: 'red' };
const DEST_WHO = { grandma: 'red', brick: 'pig' };

const STEPS = [
  { n: 'meet', word: 'l115_t_friends', demo: true, cards: 3 },
  { n: 'names', word: 'l115_t_names', demo: true, cards: 3 },
  { n: 'findRed', word: 'l115_t_find_red', ask: true, want: 'red' },
  { n: 'wolf', word: 'l115_t_wolf_q', demo: true, big: true },
  { n: 'forest', word: 'l115_t_forest', demo: true, big: true },
  { n: 'out', word: 'l115_t_out', out: true }   /* 过渡步停留极短（mock 音频 70ms 就结束），不在这里断言卡片数 */
];

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-l115-' + Date.now()),
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
        var s = document.querySelector('.l115-stage');
        if (!s) return null;
        return 'sid:' + (s.dataset.sid || (s.dataset.l115ask ? 'q' : '?'));
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
    Array.prototype.forEach.call(document.querySelectorAll('#askDisplay .l115-card, #askDisplay .l115-goal, #askDisplay .l115-runner, #askDisplay .l115-big'), function(n){
      var r=n.getBoundingClientRect(); if(!r.width||!r.height) zero.push((n.tagName||'')+'.'+(n.getAttribute('class')||''));
    });
    return { sw: d.scrollWidth, iw: iw, sh: d.scrollHeight, ih: ih, cut: cut.slice(0,6), zero: zero.slice(0,6) };
  })()`);
  const keysBetween = (a, b) => ev(`window.__played.filter(function(p){return p.t>=${a}&&p.t<=${b};}).map(function(p){
    for (var k in window.VOICE_BANK) if (window.VOICE_BANK[k] === p.src) return k;
    return 'unknown';
  })`);
  const cards = () => ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l115-card'),function(n){return n.dataset.kind;})");
  const residents = () => ev("document.querySelectorAll('#askDisplay .l115-goal .l115-resident').length");
  const runners = () => ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l115-tray2 .l115-runner'),function(n){return n.dataset.who;})");

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };

  // ---------- 0) 解锁链 ----------
  await ev('Game.resetProgress()');
  await ev('for (var i=1;i<=7;i++){ for (var l=1;l<=5;l++) Game.markCleared(i,l); }');
  await ev('for (var l=1;l<=5;l++) Game.markCleared(8,l)');
  await ev('for (var l=1;l<=5;l++) Game.markCleared(9,l)');
  for (let l = 1; l <= 5; l++) await ev('Game.markCleared(10,' + l + ')');
  for (let l = 1; l <= 3; l++) await ev('Game.markCleared(11,' + l + ')');
  rep.checks.lockedBefore = JSON.parse(await ev('JSON.stringify({u11:Game.progress.unlockedLevel[11]||null, c114:!!Game.progress.cleared["11-4"]})'));
  if (rep.checks.lockedBefore.u11 !== 4) rep.errors.push('未通 11-4 时 unlockedLevel[11] 应为 4，实际 ' + rep.checks.lockedBefore.u11);
  if (rep.checks.lockedBefore.c114 !== false) rep.errors.push('未通关时 cleared[11-4] 不该为真');
  await ev('Game.markCleared(11,4)');
  rep.checks.after114 = JSON.parse(await ev('JSON.stringify({u11:Game.progress.unlockedLevel[11]||null})'));
  if (rep.checks.after114.u11 !== 5) rep.errors.push('通关 11-4 后 unlockedLevel[11] 应为 5，实际 ' + rep.checks.after114.u11);

  // ---------- 1) 教学 ----------
  await ev('Game.openIsland(11)'); await sleep(200);
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
      if (st.cards) {
        row.cards = await cards();
        if ((row.cards || []).length !== st.cards) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）角色卡不是 ' + st.cards + ' 张：' + JSON.stringify(row.cards));
        if (row.cards && new Set(row.cards).size !== row.cards.length) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）角色卡重复：' + JSON.stringify(row.cards));
      }
      if (st.big) {
        row.big = await ev("document.querySelectorAll('#askDisplay .l115-big').length");
        if (row.big !== 1) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）没有大画面：' + row.big);
      }
      row.overflow = await overflow();
    }

    if (st.demo) {
      row.tapShown = await wait(sel('.f11-tap'), 12000);
      if (!row.tapShown) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示定格后没有出现「轻点继续」');
      row.autoAdvanced = (await ev('window.__stageLog.length')) > (foundIdx + 1);
      if (row.autoAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示未点按就自动前进了');
      const pt = await centerOf('#askDisplay .l115-stage');
      if (pt) await clickXY(pt.x, pt.y);
      row.advanced = await wait('window.__stageLog.length > ' + (foundIdx + 1), 7000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    if (st.ask) {
      row.hint = await wait(sel('.tut-hint'), 9500);
      if (!row.hint) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手没有出现');
      const before0 = await ev('window.__stageLog.length');
      /* ① 先点错一张：只许抖动，不许推进 */
      const wrong = (row.cards || []).filter(k => k !== st.want)[0];
      const cw = await centerOf('#askDisplay .l115-card[data-kind="' + wrong + '"]');
      if (cw) await clickXY(cw.x, cw.y);
      await sleep(700);
      row.wrongThen = {
        advanced: (await ev('window.__stageLog.length')) > before0,
        stuck: await ev("document.querySelectorAll('#askDisplay .l115-card').length"),
        voice: (await keysBetween(Date.now() - 700, Date.now())).filter(k => k !== 'unknown')
      };
      if (row.wrongThen.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错角色却推进了');
      if (row.wrongThen.stuck !== 3) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错后卡片消失了：' + row.wrongThen.stuck);
      /* ② 再点对的 */
      const c = await centerOf('#askDisplay .l115-card[data-kind="' + st.want + '"]');
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
  const posSets = { L115A: new Set(), L115B: new Set() };
  const destSets = new Set();
  const whoSets = new Set();
  const wrongTested = { L115A: false, L115B: false, L115C: false };

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(430);
    const snap = await ev('Game.snapshot()');
    const q = snap.question;
    if (!q) { rep.errors.push('第 ' + r + ' 轮：答题未开始'); break; }
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, ask: q.l115ask, items: q.l115items, answer: q.l115answer };
    const starsBefore = await ev('Game.stars');
    let ct = Date.now();
    if (!seenOv[q.type]) { seenOv[q.type] = 1; row.overflow = await overflow(); }

    if (q.type === 'L115A' || q.type === 'L115B') {
      const isA = q.type === 'L115A';
      const want = isA ? A_WANT[q.audio] : B_WANT[q.audio];
      row.want = want || null;
      row.audioOk = !!want;
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 语音不在预期：' + q.audio);
      row.cards = await cards();
      if (!row.cards || row.cards.length !== 3) rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 卡片不是 3 张：' + JSON.stringify(row.cards));
      if (row.cards && new Set(row.cards).size !== 3) rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 卡片重复：' + JSON.stringify(row.cards));
      if (row.cards && JSON.stringify(row.cards) !== JSON.stringify(q.l115items)) rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 卡片顺序与题面不一致：' + JSON.stringify(row.cards) + ' vs ' + JSON.stringify(q.l115items));
      if (row.cards && q.l115items[q.l115answer] !== want) rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 答案位与语音不符：' + q.l115items[q.l115answer] + ' vs ' + want);
      posSets[q.type].add(q.l115answer);

      if (!wrongTested[q.type] && row.cards) {
        wrongTested[q.type] = true;
        const wi = q.l115answer === 0 ? (q.l115answer === 1 ? 2 : 1) : 0;
        const cw = await centerOf('#askDisplay .l115-card[data-idx="' + wi + '"]');
        const ctw = Date.now();
        if (cw) await clickXY(cw.x, cw.y);
        await sleep(720);
        row.wrongVoice = (await keysBetween(ctw, ctw + 950)).filter(k => k !== 'unknown');
        if (row.wrongVoice.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 点错没有温柔鼓励（again）');
        if ((await ev('Game.round')) > (r - 1)) rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 点错却推进了');
      }
      const c = await centerOf('#askDisplay .l115-card[data-idx="' + q.l115answer + '"]');
      if (!c) { rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 找不到答案卡'); break; }
      ct = Date.now();
      await clickXY(c.x, c.y);
      await sleep(260);
      row.voiceOnCorrect = (await keysBetween(ct, ct + 400)).filter(k => k !== 'unknown');
      if (row.voiceOnCorrect.length) rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 答对后播放了语音：' + row.voiceOnCorrect.join(','));
    } else {
      row.dest = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l115-goal'),function(n){return n.dataset.dest;})");
      row.who = await runners();
      row.audioOk = (q.audio === 'l115_c_red_pig' || q.audio === 'l115_c_pig_red');
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L115C 语音不在预期：' + q.audio);
      if (JSON.stringify(row.dest) !== JSON.stringify(q.l115dest)) rep.errors.push('第 ' + r + ' 轮 L115C 房子左右顺序与题面不一致：' + JSON.stringify(row.dest) + ' vs ' + JSON.stringify(q.l115dest));
      if (JSON.stringify(row.who) !== JSON.stringify(q.l115who)) rep.errors.push('第 ' + r + ' 轮 L115C 底部角色顺序与题面不一致：' + JSON.stringify(row.who) + ' vs ' + JSON.stringify(q.l115who));
      destSets.add((q.l115dest || [])[0]);
      whoSets.add((q.l115who || []).join(''));

      if (!wrongTested.L115C) {
        wrongTested.L115C = true;
        /* 把小红帽拖到砖房（错的） */
        const ctw = Date.now();
        await drag('#askDisplay .l115-runner[data-who="red"]', '#askDisplay .l115-goal[data-dest="brick"]');
        await sleep(760);
        row.wrongThen = {
          voice: (await keysBetween(ctw, ctw + 950)).filter(k => k !== 'unknown'),
          residents: await residents(),
          runnerBack: await ev('!!document.querySelector("#askDisplay .l115-runner[data-who=\\"red\\"]")'),
          advanced: (await ev('Game.round')) > (r - 1)
        };
        if (row.wrongThen.voice.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 L115C 送错房子没有温柔鼓励（again）');
        if (row.wrongThen.residents !== 0) rep.errors.push('第 ' + r + ' 轮 L115C 送错房子却留下角色：' + row.wrongThen.residents);
        if (row.wrongThen.runnerBack !== true) rep.errors.push('第 ' + r + ' 轮 L115C 送错后角色消失了');
        if (row.wrongThen.advanced) rep.errors.push('第 ' + r + ' 轮 L115C 送错房子却推进了');
      }

      ct = Date.now();
      await drag('#askDisplay .l115-runner[data-who="red"]', '#askDisplay .l115-goal[data-dest="grandma"]');
      await sleep(320);
      row.afterFirst = { residents: await residents(), runners: await runners() };
      if (row.afterFirst.residents !== 1) rep.errors.push('第 ' + r + ' 轮 L115C 第一个角色没送到：' + row.afterFirst.residents);
      if ((row.afterFirst.runners || []).length !== 1) rep.errors.push('第 ' + r + ' 轮 L115C 底部剩的角色数不对：' + JSON.stringify(row.afterFirst.runners));
      await drag('#askDisplay .l115-runner[data-who="pig"]', '#askDisplay .l115-goal[data-dest="brick"]');
      await sleep(420);
      row.residents = await residents();
      if (row.residents !== 2) rep.errors.push('第 ' + r + ' 轮 L115C 两个角色没有都送到：' + row.residents);
      row.nestOk = await ev(`(function(){
        var g=document.querySelector('#askDisplay .l115-goal[data-dest="grandma"]');
        if(!g) return false;
        var r=g.querySelector('.l115-resident');
        return !!r && r.dataset.who==='red';
      })()`);
      if (row.nestOk !== true) rep.errors.push('第 ' + r + ' 轮 L115C 奶奶家里待的不是小红帽');
    }

    const advanced = await wait('Game.round > ' + (r - 1) + ' || Game.phase === "done"', 9000);
    row.advanced = advanced;
    if (q.type === 'L115C') {
      row.voicesAll = (await keysBetween(ct, Date.now())).filter(k => k !== 'unknown');
      row.lineOk = row.voicesAll.indexOf(LINE) >= 0;
      if (!row.lineOk) rep.errors.push('第 ' + r + ' 轮 L115C 两个都送到后没播剧情台词：' + row.voicesAll.join(','));
      row.praise = row.voicesAll.filter(k => k.indexOf('praise') === 0);
      /* 最后一轮的 praise_* 是「通关 playRandomPraise」，属要求行为（§三.25 / 探针口径） */
      row.praiseBad = (r < 12) ? row.praise : [];
      if (row.praiseBad.length) rep.errors.push('第 ' + r + ' 轮 L115C 播了夸奖人声：' + row.praiseBad.join(','));
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
             cleared: !!Game.progress.cleared['11-5'],
             u11: Game.progress.unlockedLevel[11] || null,
             ui: Game.progress.unlockedIsland };
  })()`);
  rep.checks.types = seenType;
  rep.checks.posA = Array.from(posSets.L115A);
  rep.checks.posB = Array.from(posSets.L115B);
  rep.checks.destVariants = Array.from(destSets);
  rep.checks.whoVariants = Array.from(whoSets);
  /* 防背题（用户重点要求）：答案位 / 房子左右 / 底部角色先后都必须真的变过 */
  if (posSets.L115A.size < 2) rep.errors.push('A 型的答案位置从未变化：' + JSON.stringify(rep.checks.posA));
  if (posSets.L115B.size < 2) rep.errors.push('B 型的答案位置从未变化：' + JSON.stringify(rep.checks.posB));
  if (destSets.size < 2) rep.errors.push('C 型奶奶家的左右位置从未变化：' + JSON.stringify(rep.checks.destVariants));
  if (whoSets.size < 2) rep.errors.push('C 型底部角色先后从未变化：' + JSON.stringify(rep.checks.whoVariants));

  /* 岛末关第 ③ 件：地图第 11 岛必须真的亮起通关标记 */
  await ev('Game.backToMap()'); await sleep(600);
  rep.checks.islandFlag = await ev(`(function(){
    var c=document.querySelector('#islandGrid .island[data-island="11"]');
    if(!c) return {found:false};
    return { cleared: c.classList.contains('cleared'), badge: !!c.querySelector('.island-flag-badge') };
  })()`);
  if (rep.checks.islandFlag.found === false || rep.checks.islandFlag.cleared !== true || rep.checks.islandFlag.badge !== true) {
    rep.errors.push('地图第 11 岛没有亮起通关标记：' + JSON.stringify(rep.checks.islandFlag));
  }

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
  rep.checks.englishMap = await scan('#screenMap');

  console.log(JSON.stringify(rep, null, 2));

  const sigOk = rep.tutorial.every(s => s.sigOk);
  const audioOk = rep.tutorial.every(s => s.audioOk);
  const demoOk = rep.tutorial.filter(s => s.demo).every(s => s.tapShown === true && s.autoAdvanced === false && s.advanced === true);
  const artOk = rep.tutorial.every(s => (s.cards === undefined || s.cards.length === 3) && (s.big === undefined || s.big === 1));
  const askOk = rep.tutorial.filter(s => s.ask).every(s => s.hint === true && s.advanced === true &&
    s.wrongThen.advanced === false && s.wrongThen.stuck === 3);
  const outOk = rep.tutorial.filter(s => s.out).every(s => s.ended === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1);
  const semOk = rep.rounds.every(s => s.audioOk === true);
  const runOk = rep.rounds.every(s => s.type !== 'L115C' ||
    (s.residents === 2 && s.nestOk === true &&
      !!s.afterFirst && (s.afterFirst.runners || []).length === 1 && s.afterFirst.residents === 1));
  const quietOk = rep.rounds.every(s => s.type === 'L115C'
    ? (s.lineOk === true && (s.praiseBad || []).length === 0)
    : (s.voiceOnCorrect || []).length === 0);
  const noOv = o => !o || (o.sw <= o.iw + 1 && o.sh <= o.ih + 1 && o.cut.length === 0 && o.zero.length === 0);
  const noOverflow = rep.tutorial.every(s => noOv(s.overflow)) && rep.rounds.every(s => noOv(s.overflow));
  const ok = rep.errors.length === 0 && sigOk && audioOk && demoOk && artOk && askOk && outOk &&
    roundsOk && semOk && runOk && quietOk && noOverflow &&
    rep.rounds.length === 12 &&
    seenType.L115A === 4 && seenType.L115B === 4 && seenType.L115C === 4 &&
    posSets.L115A.size >= 2 && posSets.L115B.size >= 2 && destSets.size >= 2 && whoSets.size >= 2 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === true && rep.checks.done.stageFlag === true &&
    rep.checks.done.cleared === true && rep.checks.done.u11 === 5 && rep.checks.done.ui === 12 &&
    rep.checks.islandFlag.cleared === true && rep.checks.islandFlag.badge === true &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0;

  console.log('PROBE_' + (ok ? 'PASS' : 'FAIL') +
    ' sigOk=' + sigOk + ' audioOk=' + audioOk + ' demoOk=' + demoOk + ' artOk=' + artOk +
    ' askOk=' + askOk + ' outOk=' + outOk + ' roundsOk=' + roundsOk + ' semOk=' + semOk +
    ' runOk=' + runOk + ' quietOk=' + quietOk + ' noOverflow=' + noOverflow +
    ' steps=' + rep.tutorial.length + ' types=' + JSON.stringify(seenType) +
    ' posA=' + rep.checks.posA.length + ' posB=' + rep.checks.posB.length +
    ' destVariants=' + destSets.size + ' whoVariants=' + whoSets.size +
    ' stars=' + rep.checks.done.stars + ' grand=' + rep.checks.done.grand +
    ' stageFlag=' + rep.checks.done.stageFlag + ' cleared=' + rep.checks.done.cleared +
    ' u11=' + rep.checks.done.u11 + ' ui=' + rep.checks.done.ui +
    ' mapFlag=' + JSON.stringify(rep.checks.islandFlag));

  finish(ok ? 0 : 1);
})().catch(e => { console.log('PROBE_ERROR', e && e.message); finish(2); });
