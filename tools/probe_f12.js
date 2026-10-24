// 第 6 岛第 2 关（L6-W2，家里的小日常 Watch TV / Read a book / Take a bath / Go to sleep）专项测试
//   1) 解锁链：第 1–5 岛全通 + 第 6 岛第 1 关通关 → 第 6 岛第 2 关可玩
//   2) 教学（RULES §三.10 双倍量 + §三.14 点按推进）：每个核心动作 2 演示 + 2 互动 + 过渡 = 17 环节；
//      演示步语音播完画面定格，必须点屏幕才推进（断言：不点则不自动前进）
//   3) 三题型：A 听音找动作 / B 听场景找房间（卧室/浴室/客厅）/ C 拖宝宝做日常（放床上睡觉、放浴缸洗澡）
//   4) 答题 12 轮：答对无人声、答错不推进、拖错宝宝/放错家具不给过、通关奖励
//   5) 视觉：无英文字母（innerText + aria-label）、当前视口无溢出
// 带 LILEARN_URL 则直接跑线上（发布后回归用）。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'f12';
const PORT = 9691 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));

const A_KEY = { watchTV: 'l6w2_a_tv', read: 'l6w2_a_read', bath: 'l6w2_a_bath', sleep: 'l6w2_a_sleep' };
const B_KEY = { bathroom: 'l6w2_b_bath', living: 'l6w2_b_tv', bedroom: 'l6w2_b_sleep' };
const C_KEY = { babySleep: 'l6w2_c_sleep', babyBath: 'l6w2_c_bath' };

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-f12-' + Date.now()),
  '--window-size=' + W + ',' + H, 'about:blank'], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let id = 0; const pend = new Map();

(async () => {
  let v;
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) { v = await r.json(); break; } } catch (e) {}
    await sleep(250);
  }
  const ws = await new Promise((res, rej) => {
    const w = new WebSocket(v.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 1 << 28 });
    w.on('open', () => res(w)); w.on('error', rej);
  });
  ws.on('message', raw => {
    const m = JSON.parse(raw);
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
      window.__stageLog = [];
      var last = null;
      function stageSig(){
        var s = document.querySelector('.f9-stage');
        if (!s) return null;
        var cards = Array.prototype.map.call(s.querySelectorAll('.f9-card'), function(n){ return n.dataset.subj; });
        if (!cards.length) return 'empty';
        var grid = s.querySelector('.f9-grid');
        if (grid) {
          var list = cards.slice().sort().join(',');
          if (grid.classList.contains('f9-final')) return 'final' + cards.length + ':' + list;
          return 'grid' + cards.length + ':' + list;
        }
        return 'one:' + cards[0];
      }
      function rec(){
        var sig = stageSig();
        if (!sig || sig === 'empty' || sig === last) return;
        last = sig;
        window.__stageLog.push({ t: Date.now(), sig: sig });
      }
      var mo = new MutationObserver(function(){ setTimeout(rec, 0); });
      window.addEventListener('DOMContentLoaded', function(){ mo.observe(document.body, { childList: true, subtree: true }); rec(); });
    })();
  ` }, sessionId);

  await send('Page.navigate', { url: URL_ }, sessionId);
  const boot = async () => {
    for (let i = 0; i < 600; i++) {
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
  const dragTo = async (fromSel, tx, ty) => {
    const a = await rectOf(fromSel);
    if (!a) return false;
    await mouse('mousePressed', a.cx, a.cy, 1); await sleep(50);
    for (let k = 1; k <= 8; k++) { await mouse('mouseMoved', a.cx + (tx - a.cx) * k / 8, a.cy + (ty - a.cy) * k / 8, 1); await sleep(22); }
    await mouse('mouseReleased', tx, ty, 0); await sleep(90);
    return true;
  };
  const overflow = () => ev(`(function(){
    var de = document.documentElement;
    var optBar = document.getElementById('options');
    var optShown = !!optBar && !optBar.classList.contains('gone') && !optBar.classList.contains('off');
    var cut = [], zero = [];
    Array.prototype.forEach.call(document.querySelectorAll(
      '.f9-card, .f9-tile, .f9-chip, .f9-serve, .f11-furn, .option'), function(n){
      var b = n.getBoundingClientRect();
      if (!b.width) { if (optShown || !n.classList.contains('option')) zero.push((n.className || '?') + ':0'); return; }
      if (b.right > window.innerWidth + 1 || b.left < -1) cut.push(n.className + ':' + Math.round(b.left) + '..' + Math.round(b.right));
      if (n.classList.contains('f9-card') && n.dataset.subj && b.width < 24) {
        zero.push(n.dataset.subj + ':' + Math.round(b.width));
      }
    });
    return { sw: de.scrollWidth, iw: window.innerWidth, sh: de.scrollHeight, ih: window.innerHeight,
             cut: cut.slice(0, 6), zero: zero.slice(0, 6) };
  })()`);

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };

  // ---------- 0) 解锁链：第 1–5 岛全通 + 第 6 岛第 1 关通关 → 第 6 岛第 2 关可玩 ----------
  await ev('Game.resetProgress()');
  await ev('for (var isl = 1; isl <= 5; isl++) { for (var lv = 1; lv <= 5; lv++) Game.markCleared(isl, lv); }');
  await ev('Game.markCleared(6, 1)');
  await ev('Game.openIsland(6)');
  await sleep(300);
  rep.checks.unlock = await ev(`(function(){
    var n2 = document.querySelector('.node[data-level="2"]');
    return { node2Playable: n2.classList.contains('playable'), node2Locked: n2.classList.contains('locked') };
  })()`);
  await shot(TAG + '-island.png');
  if (rep.checks.unlock.node2Playable !== true) rep.errors.push('第 6 岛第 2 关没有亮起（' + JSON.stringify(rep.checks.unlock) + '）');

  // ---------- 1) 进关 → 教学 ----------
  await ev('document.querySelector(\'.node[data-level="2"]\').click()');
  await sleep(300);
  await ev('document.getElementById("btnStart").click()');

  const STEPS = [
    // Watch TV：2 演示 + 2 互动
    { n: 'tv-demo1',  sig: 'one:watchTV',                audio: 'l6w2_t_tv1',   demo: true, shot: 'tut-tv' },
    { n: 'tv-demo2',  sig: 'one:tvCartoon',              audio: 'l6w2_t_tv2',   demo: true, shot: 'tut-tv-cartoon' },
    { n: 'tv-ask1',   sig: 'grid2:read,watchTV',         audio: 'l6w2_t_tv_a1', wrongFirst: 'read', click: 'watchTV', shot: 'tut-tv-ask1' },
    { n: 'tv-ask2',   sig: 'grid3:bath,sleep,watchTV',   audio: 'l6w2_t_tv_a2', hint: true, click: 'watchTV' },
    // Read a book：2 演示 + 2 互动
    { n: 'read-demo1',sig: 'one:read',                   audio: 'l6w2_t_read1', demo: true, shot: 'tut-read' },
    { n: 'read-demo2',sig: 'one:bookCloseup',            audio: 'l6w2_t_read2', demo: true, shot: 'tut-book' },
    { n: 'read-ask1', sig: 'grid2:bath,read',            audio: 'l6w2_t_read_a1', wrongFirst: 'bath', click: 'read', shot: 'tut-read-ask1' },
    { n: 'read-ask2', sig: 'grid3:read,sleep,watchTV',   audio: 'l6w2_t_read_a2', hint: true, click: 'read' },
    // Take a bath：2 演示 + 2 互动
    { n: 'bath-demo1',sig: 'one:bathBubbles',            audio: 'l6w2_t_bath1', demo: true, shot: 'tut-bath' },
    { n: 'bath-demo2',sig: 'one:bath',                   audio: 'l6w2_t_bath2', demo: true, shot: 'tut-bath-baby' },
    { n: 'bath-ask1', sig: 'grid2:bath,sleep',           audio: 'l6w2_t_bath_a1', wrongFirst: 'sleep', click: 'bath', shot: 'tut-bath-ask1' },
    { n: 'bath-ask2', sig: 'grid4:bath,read,sleep,watchTV', audio: 'l6w2_t_bath_a2', hint: true, click: 'bath' },
    // Go to sleep：2 演示 + 2 互动
    { n: 'sleep-demo1',sig: 'one:sleepRoom',             audio: 'l6w2_t_sleep1', demo: true, shot: 'tut-sleep-room' },
    { n: 'sleep-demo2',sig: 'one:sleep',                 audio: 'l6w2_t_sleep2', demo: true, shot: 'tut-sleep' },
    { n: 'sleep-ask1',sig: 'grid2:read,sleep',           audio: 'l6w2_t_sleep_a1', wrongFirst: 'read', click: 'sleep', shot: 'tut-sleep-ask1' },
    { n: 'sleep-ask2',sig: 'grid3:bath,sleep,watchTV',   audio: 'l6w2_t_sleep_a2', hint: true, click: 'sleep' },
    // 过渡语
    { n: 'outro',     sig: 'final4:bath,read,sleep,watchTV', audio: 'l6w2_t_out' }
  ];

  for (let i = 1; i < STEPS.length; i++) {
    if (STEPS[i].sig === STEPS[i - 1].sig) throw new Error('教学相邻两步舞台指纹相同：' + STEPS[i].sig + '（' + STEPS[i].n + '）');
  }

  for (let i = 0; i < STEPS.length; i++) {
    const st = STEPS[i];
    const reached = await wait('window.__stageLog.length >= ' + (i + 1), 12000);
    const entry = reached ? JSON.parse(await ev('JSON.stringify(window.__stageLog[' + i + '])')) : null;
    const row = { step: st.n, reached: reached, sig: entry ? entry.sig : null, sigOk: !!entry && entry.sig === st.sig };
    if (!row.sigOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）舞台不符：期望 ' + st.sig + '，实际 ' + row.sig);

    if (entry) {
      await sleep(180);
      row.audio = (await keysBetween(entry.t - 900, entry.t + 2600)).filter(k => k !== 'unknown');
      row.audioOk = row.audio.indexOf(st.audio) >= 0;
      if (!row.audioOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）语音不符：期望 ' + st.audio + '，实际 ' + row.audio.join(','));
    }
    if (st.n !== 'outro') row.overflow = await overflow();
    if (st.shot) { await sleep(120); await shot(TAG + '-' + st.shot + '.png'); }

    if (st.wrongFirst) {
      const before = await ev('window.__stageLog.length');
      const wt = Date.now();
      await tap('#askDisplay .f9-tile[data-subj="' + st.wrongFirst + '"]');
      await sleep(1100);
      row.wrongPick = {
        advanced: (await ev('window.__stageLog.length')) > before,
        stillAsking: await ev('Game.tutorial && Game.tutorial.ask === ' + JSON.stringify(st.click)),
        audio: (await keysBetween(wt - 150, wt + 2600)).filter(k => k !== 'unknown')
      };
      if (row.wrongPick.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错却推进了');
      if (row.wrongPick.stillAsking !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错后没保持等待');
      if (row.wrongPick.audio.indexOf('again') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错后没播温柔鼓励：' + row.wrongPick.audio.join(','));
      await sleep(1200);
    }

    if (st.hint) {
      if (st.wrongFirst) { row.hintEarly = null; }
      else { await sleep(2400); row.hintEarly = await ev(sel('.tut-hint')); }
      row.hintLater = await wait(sel('.tut-hint'), 5000);
      if (row.hintEarly === true || row.hintLater !== true) {
        rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手指异常：early=' + row.hintEarly + ' later=' + row.hintLater);
      }
      row.hintGeom = await ev(`(function(){
        var h = document.querySelector('.tut-hint');
        if (!h) return null;
        var tgt = document.querySelector('#askDisplay .f9-tile[data-subj="' + ${JSON.stringify(st.click)} + '"]');
        var hb = h.getBoundingClientRect(), tb = tgt ? tgt.getBoundingClientRect() : null;
        var tip = document.elementFromPoint(hb.left + 4, hb.top - 4);
        var tipTile = tip && tip.closest ? tip.closest('.f9-tile') : null;
        return { hintSubj: tipTile ? tipTile.dataset.subj : null,
                 nearTarget: tb ? (hb.left > tb.left && hb.left < tb.right && hb.top > tb.top - 8 && hb.top < tb.bottom + 40) : null,
                 stars: Game.stars };
      })()`);
      if (row.hintGeom && row.hintGeom.hintSubj !== st.click) {
        rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）小手指指错了卡：' + row.hintGeom.hintSubj + '（应为 ' + st.click + '）');
      }
      if (row.hintGeom && row.hintGeom.nearTarget === false) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）小手指没有指向正确卡片');
      if (row.hintGeom && row.hintGeom.stars !== 0) rep.errors.push('教学阶段不该有星星：' + row.hintGeom.stars);
      await sleep(300);
    }

    // 演示步（RULES §三.14 点按推进）：等「轻点继续」→ 验证不自动前进 → 点屏幕推进
    if (st.demo) {
      row.tapShown = await wait(sel('.f11-tap'), 5000);
      if (!row.tapShown) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示定格后没有出现「轻点继续」提示');
      await sleep(2200);
      row.autoAdvanced = (await ev('window.__stageLog.length')) > (i + 1);
      if (row.autoAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示未点按就自动前进了（违反 §三.14 点按推进）');
      await tap('#askDisplay .f9-card');
      row.advanced = await wait('window.__stageLog.length > ' + (i + 1), 6000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    if (st.click && !st.demo) {
      const before = await ev('window.__stageLog.length');
      const cardSel = '#askDisplay .f9-tile[data-subj="' + st.click + '"]';
      row.geo = await ev(`(function(){
        var t = document.querySelector(${JSON.stringify(cardSel)});
        if (!t) return null;
        var b = t.getBoundingClientRect();
        var h = document.elementFromPoint(b.left + b.width/2, b.top + b.height/2);
        return { inTarget: h ? !!(h.closest && h.closest(${JSON.stringify(cardSel)})) : false };
      })()`);
      if (!row.geo) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）找不到正确的卡片');
      else if (!row.geo.inTarget) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）卡片中心被遮挡');
      await tap(cardSel);
      await sleep(1400);
      row.clicked = true;
      row.advanced = await wait('window.__stageLog.length > ' + before, 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点对后没有推进');
    }
    rep.tutorial.push(row);
    console.log('STEP ' + (i + 1) + ' ' + JSON.stringify(row).slice(0, 340));
  }

  rep.checks.outro = { ended: await wait('Game.phase === "asking"', 20000) };
  await sleep(500);
  rep.checks.outro.optionsBack = await ev('!document.getElementById("options").classList.contains("gone")');
  rep.checks.outro.starsInTutorial = await ev('Game.stars');
  rep.checks.outro.totalSteps = await ev('window.__stageLog.length');
  await shot(TAG + '-ask-first.png');

  // ---------- 2) 12 轮答题 ----------
  const seenType = {};
  const seenShot = {};
  let wrongGridTested = false;
  let wrongDragTested = false;
  let wrongTargetTested = false;
  let dragUsed = false;

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(200);
    let snap = await ev('Game.snapshot()');
    let q = snap.question;
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, subj: q.subj, item: q.item, target: q.target, correct: q.correct, opts: q.options, audio: q.audio };

    if (q.type === 'F12A' || q.type === 'F12B') {
      row.tiles = await ev('document.querySelectorAll("#askDisplay .f9-tile").length');
      row.uniqueOpts = new Set(q.options).size;
      row.answerOk = q.options[q.correct] === ('s:' + q.subj);
      row.audioOk = q.type === 'F12A' ? (q.audio === A_KEY[q.subj]) : (q.audio === B_KEY[q.subj]);
      if (row.tiles !== 3) rep.errors.push('第 ' + r + ' 轮卡片数量异常：' + row.tiles);
      if (row.uniqueOpts !== 3) rep.errors.push('第 ' + r + ' 轮选项卡重复：' + JSON.stringify(q.options));
      if (!row.answerOk) rep.errors.push('第 ' + r + ' 轮正确答案指向错误：' + JSON.stringify(q.options) + ' want=s:' + q.subj);
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮语音与目标不一致：' + q.audio + ' subj=' + q.subj);
      if (q.options.filter(f => f === ('s:' + q.subj)).length !== 1) rep.errors.push('第 ' + r + ' 轮目标不是唯一：' + JSON.stringify(q.options));
    }

    if (q.type === 'F12C') {
      row.opts = await ev('document.querySelectorAll("#options .option:not([hidden])").length');
      row.dragAttrs = await ev('document.querySelectorAll("#options .option[data-drag]").length');
      row.uniqueOpts = new Set(q.options).size;
      row.answerOk = q.options[q.correct] === ('i:' + q.item);
      row.audioOk = q.audio === C_KEY[q.item];
      row.bedShown = await ev('!!document.querySelector(\'#askDisplay .f11-furn[data-drop="bed"]\')');
      row.tubShown = await ev('!!document.querySelector(\'#askDisplay .f11-furn[data-drop="tub"]\')');
      if (row.opts !== 2) rep.errors.push('第 ' + r + ' 轮宝宝不是 2 个：' + row.opts);
      if (row.dragAttrs !== 2) rep.errors.push('第 ' + r + ' 轮可拖宝宝不是 2 个：' + row.dragAttrs);
      if (row.uniqueOpts !== 2) rep.errors.push('第 ' + r + ' 轮宝宝选项重复：' + JSON.stringify(q.options));
      if (!row.answerOk) rep.errors.push('第 ' + r + ' 轮正确答案指向错误：' + JSON.stringify(q.options) + ' want=i:' + q.item);
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮语音与目标不一致：' + q.audio + ' item=' + q.item);
      if (!row.bedShown || !row.tubShown) rep.errors.push('第 ' + r + ' 轮房间没有同时显示床和浴缸');
    }

    if (!seenShot[q.type]) { seenShot[q.type] = 1; await sleep(400); await shot(TAG + '-q-' + q.type + '.png'); }

    if ((q.type === 'F12A' || q.type === 'F12B') && !wrongGridTested) {
      wrongGridTested = true;
      const wrongIdx = (q.correct + 1) % 3;
      const wt = Date.now();
      await tap('#askDisplay .f9-tile[data-idx="' + wrongIdx + '"]');
      await sleep(1100);
      const after = await ev('Game.snapshot()');
      row.wrongPick = { advanced: after.round !== r, stillAsking: after.phase === 'asking',
        audio: (await keysBetween(wt - 150, wt + 2600)).filter(k => k !== 'unknown') };
      if (row.wrongPick.advanced) rep.errors.push('第 ' + r + ' 轮点错却前进了');
      await sleep(1800);
      snap = await ev('Game.snapshot()');
      q = snap.question;
      row.correctAfterShuffle = q.correct;
      if (q.options[q.correct] !== ('s:' + q.subj)) rep.errors.push('第 ' + r + ' 轮重洗后正确答案指向错误');
    }

    if (q.type === 'F12C' && !wrongDragTested) {
      wrongDragTested = true;
      const tgt = await rectOf('#askDisplay .f11-furn[data-drop="' + q.target + '"]');
      await dragTo('#options .option[data-idx="' + ((q.correct + 1) % 2) + '"]', tgt.cx, tgt.cy);
      await sleep(1100);
      const after = await ev('Game.snapshot()');
      row.wrongDrag = { advanced: after.round !== r, stillAsking: after.phase === 'asking' };
      if (row.wrongDrag.advanced) rep.errors.push('第 ' + r + ' 轮把错宝宝拖到家具上却判过了');
      await sleep(1500);
    }

    if (q.type === 'F12C' && !wrongTargetTested) {
      wrongTargetTested = true;
      const wrongDrop = q.target === 'bed' ? 'tub' : 'bed';
      const tgt = await rectOf('#askDisplay .f11-furn[data-drop="' + wrongDrop + '"]');
      await dragTo('#options .option[data-idx="' + q.correct + '"]', tgt.cx, tgt.cy);
      await sleep(1100);
      const after = await ev('Game.snapshot()');
      row.wrongTarget = { advanced: after.round !== r, stillAsking: after.phase === 'asking' };
      if (row.wrongTarget.advanced) rep.errors.push('第 ' + r + ' 轮把对的宝宝放到错误家具上却判过了');
      await sleep(1500);
    }

    const before = await ev('Game.round');
    const starsBefore = await ev('Game.stars');
    const ct = Date.now();

    if (q.type === 'F12A' || q.type === 'F12B') {
      await tap('#askDisplay .f9-tile[data-idx="' + q.correct + '"]');
    } else if (!dragUsed) {
      dragUsed = true;
      const tgt = await rectOf('#askDisplay .f11-furn[data-drop="' + q.target + '"]');
      await dragTo('#options .option[data-idx="' + q.correct + '"]', tgt.cx, tgt.cy);
    } else {
      await tap('#options .option[data-idx="' + q.correct + '"]');
      await sleep(250);
      await tap('#askDisplay .f11-furn[data-drop="' + q.target + '"]');
    }

    if (q.type === 'F12C') {
      await sleep(180);
      row.placedRight = await ev(`!!document.querySelector('#askDisplay .f11-furn[data-drop="${q.target}"] .f11-on[data-subj="${q.item}"]')`);
      if (!row.placedRight) rep.errors.push('第 ' + r + ' 轮宝宝没落到正确的家具上');
      if (!seenShot['C-placed']) { seenShot['C-placed'] = 1; await shot(TAG + '-q-F12C-placed.png'); }
    }

    await sleep(250);
    row.voiceOnCorrect = (await keysBetween(ct, ct + 430)).filter(k => k !== 'unknown');

    const advanced = await wait('Game.round > ' + before + ' || Game.phase === "done"', 4000);
    row.advanced = advanced;
    row.starsDelta = (await ev('Game.stars')) - starsBefore;

    if (r === 1) row.overflow = await overflow();

    if (!advanced) rep.errors.push('第 ' + r + ' 轮没有推进（' + q.type + '）');
    if (row.voiceOnCorrect.length) rep.errors.push('第 ' + r + ' 轮答对后播放了语音：' + row.voiceOnCorrect.join(','));
    if (row.starsDelta !== 1) rep.errors.push('第 ' + r + ' 轮星星未 +1（' + row.starsDelta + '）');
    rep.rounds.push(row);
    await sleep(180);
  }

  // ---------- 3) 通关 ----------
  rep.checks.done = {
    phase: await ev('Game.phase'),
    stars: await ev('Game.stars'),
    viewDone: await ev('!document.getElementById("viewDone").hidden'),
    grand: await ev('document.getElementById("viewDone").classList.contains("grand")'),
    confetti: await ev('!document.getElementById("confetti").hidden'),
    cleared: await ev('!!Game.progress.cleared["6-2"]'),
    unlockedLevel: await ev('Game.progress.unlockedLevel[6]')
  };
  rep.checks.done.tail = await ev(`window.__played.slice(-10).map(function(p){
    for (var k in window.VOICE_BANK) if (window.VOICE_BANK[k] === p.src) return k;
    return 'unknown';
  })`);
  await sleep(900);
  await shot(TAG + '-done.png');

  // ---------- 4) 视觉断言 ----------
  const scan = () => ev(`(function(){
    var bad = [];
    var txt = document.body.innerText || '';
    var m = txt.match(/[A-Za-z]+/g);
    if (m) bad.push('innerText:' + m.join(','));
    var labs = [];
    Array.prototype.forEach.call(document.querySelectorAll('[aria-label]'), function(n){
      var v = n.getAttribute('aria-label') || '';
      if (/[A-Za-z]/.test(v)) labs.push(v);
    });
    if (labs.length) bad.push('aria:' + labs.join('|'));
    return bad;
  })()`);
  rep.checks.englishDone = await scan();
  rep.checks.types = seenType;

  await ev('Game.backToMap()'); await sleep(400);
  rep.checks.englishMap = await scan();
  rep.checks.mapAfter = await ev(`(function(){
    var c6 = document.querySelector('.island[data-island="6"]');
    return { island6Cleared: c6.classList.contains('cleared'),
             island6Unlocked: c6.classList.contains('unlocked'),
             iconIsSvg: !!c6.querySelector('.icon svg') };
  })()`);
  await shot(TAG + '-map-after.png');

  await ev('Game.openIsland(6)'); await sleep(300);
  rep.checks.englishIsland = await scan();
  rep.checks.islandAfter = await ev(`(function(){
    var n2 = document.querySelector('.node[data-level="2"]');
    var n3 = document.querySelector('.node[data-level="3"]');
    return { node2Done: n2.classList.contains('done'),
             node3Locked: n3.classList.contains('locked'),
             // 第 6 岛第 3 关（F13）上线后，6-2 通关会让第 3 关亮起
             node3Playable: n3.classList.contains('playable'),
             node3Text: n3.textContent,
             unlocked: Game.snapshot().progress.unlockedLevel[6] };
  })()`);
  const islOverflow = await overflow();
  rep.checks.overflowIsland = { sw: islOverflow.sw, iw: islOverflow.iw, sh: islOverflow.sh, ih: islOverflow.ih };
  await shot(TAG + '-island-after.png');

  console.log(JSON.stringify(rep, null, 2));

  const sigOk = rep.tutorial.every(s => s.sigOk);
  const noOverflow = rep.tutorial.every(s => !s.overflow ||
    (s.overflow.sw <= s.overflow.iw + 1 && s.overflow.sh <= s.overflow.ih + 1 &&
     s.overflow.cut.length === 0 && s.overflow.zero.length === 0));
  const audioOk = rep.tutorial.every(s => s.audioOk);
  const hintOk = rep.tutorial.filter(s => s.hint).every(s => s.hintEarly !== true && s.hintLater === true);
  const wrongOk = rep.tutorial.filter(s => s.wrongFirst).every(s => s.wrongPick && !s.wrongPick.advanced);
  const advanceOk = rep.tutorial.filter(s => s.click).every(s => s.advanced === true);
  const demoOk = rep.tutorial.filter(s => s.demo).every(s => s.tapShown === true && s.autoAdvanced === false && s.advanced === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1 && s.voiceOnCorrect.length === 0);
  const ok = rep.errors.length === 0 && sigOk && audioOk && hintOk && wrongOk && advanceOk && demoOk && roundsOk && noOverflow &&
    Object.keys(seenType).length === 3 && seenType.F12A === 4 && seenType.F12B === 4 && seenType.F12C === 4 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === false && rep.checks.done.cleared === true &&
    rep.checks.done.unlockedLevel === 3 &&
    rep.checks.islandAfter.node2Done === true &&
    rep.checks.islandAfter.node3Locked === false &&
    rep.checks.islandAfter.node3Playable === true &&   // F13（6-3）上线后第 3 关解锁
    rep.checks.islandAfter.node3Text === '3' &&
    rep.checks.mapAfter.island6Unlocked === true && rep.checks.mapAfter.island6Cleared === false &&
    rep.checks.mapAfter.iconIsSvg === true &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0 &&
    rep.checks.englishIsland.length === 0 &&
    rep.checks.outro.ended === true &&
    rep.checks.overflowIsland.sw <= rep.checks.overflowIsland.iw + 1;
  console.log('\nsigOk=' + sigOk + ' audioOk=' + audioOk + ' hintOk=' + hintOk + ' wrongOk=' + wrongOk +
    ' advanceOk=' + advanceOk + ' demoOk=' + demoOk + ' roundsOk=' + roundsOk + ' noOverflow=' + noOverflow +
    ' steps=' + rep.checks.outro.totalSteps + ' types=' + JSON.stringify(seenType) +
    ' stars=' + rep.checks.done.stars + ' grand=' + rep.checks.done.grand +
    ' island6=' + rep.checks.mapAfter.island6Cleared + '/' + rep.checks.mapAfter.island6Unlocked);
  if (rep.errors.length) console.log('errors: ' + rep.errors.join(' | '));
  console.log(ok ? 'PROBE_PASS' : 'PROBE_FAIL');
  ws.close();
  proc.kill();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('PROBE_ERROR', e); try { proc.kill(); } catch (_) {} process.exit(2); });
