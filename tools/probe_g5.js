// 第 7 岛第 5 关（L7-W5，TPR 终极游乐场 · 结业关）专项测试
//   1) 解锁链：第 1–6 岛全通 + 7-1/7-2/7-3/7-4 通关 → 7-5 才可玩；通关后地图第 7 岛 cleared 点亮、
//      解锁第 8 岛、通关走 grand 模式（大彩带 + 奖杯 + 第 7 岛小旗，RULES §三.9）
//   2) 教学 7 环节（热身复习：摸头+拍手 / 摸鼻+跺脚 各 2 演示 + 1 互动 + 过渡）：
//      演示语音播完定格，必须点屏幕才推进（§三.14）；主角小人用双半窗口循环展示两步动作；
//      互动 4 秒无反应出小手指（§二.12）且指向巨大👍按钮；点按钮永远判对（§三.12）
//   3) 三题型：A 单步动作大比拼（屏幕中央只有巨大👍按钮）/
//      B 复合指令大挑战（两步按顺序做，点按钮确认）/
//      C 听指令找对应小人（3 个做不同动作的小人，点对应的那个）
//   4) 12 轮（4/4/4）：答对无人声、通关奖励
//   5) 视觉：无英文字母（innerText + aria-label）、双视口无溢出、👍按钮 ≥44vw 且始终醒目
// 带 LILEARN_URL 则直接跑线上（发布后回归用）。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'g5';
const PORT = 9781 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));

// 题型语音 key 映射（A 单步复用 g2/g1，B 复合复用 g3，C 找小人复用 g4）
const A_KEY = { clap: 'g2_t_hand2', stomp: 'g2_t_foot2', jump: 'g5_a_jump', head: 'g2_b_head', nose: 'g1_c_nose', ears: 'g5_a_ears', eyes: 'g5_a_eyes' };
const B_KEY = {
  'head+clap': 'g3_t_cmd1', 'nose+stomp': 'g3_t_cmd2', 'eyes+jump': 'g3_t_cmd3',
  'ears+clap': 'g3_cmd_ears_clap', 'head+stomp': 'g3_cmd_head_stomp', 'nose+jump': 'g3_cmd_nose_jump',
  'eyes+clap': 'g3_cmd_eyes_clap', 'nose+clap': 'g3_cmd_nose_clap', 'ears+jump': 'g5_b_ears_jump'
};
const C_SENT = {
  'boy+ear': 'g4_t_ear', 'girl+clap': 'g4_t_clap', 'boy+stomp': 'g4_a_boy_stomp', 'girl+jump': 'g4_a_girl_jump',
  'boy+nose': 'g4_a_boy_nose', 'girl+eyes': 'g4_a_girl_eyes', 'boy+head': 'g4_a_boy_head', 'girl+ear': 'g4_a_girl_ear',
  'boy+eyes': 'g5_c_boy_eyes'
};

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-g5-' + Date.now()),
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
  for (let i = 0; i < 200; i++) {   // Edge 冷启动开端口可能要 16s+，给足 50s
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
        var s = document.querySelector('.g5-stage');
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
    for (let i = 0; i < 1400; i++) {   // 线上 26MB voice.js 冷加载可能很慢，给足 210s
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
    var b = document.querySelector('#askDisplay .g5-thumb');
    if (!b) return null;
    var r = b.getBoundingClientRect();
    return { vw: Math.round(r.width / window.innerWidth * 100), px: Math.round(r.width),
             inView: r.right <= window.innerWidth + 1 && r.left >= -1 && r.bottom <= window.innerHeight + 1 && r.top >= -1 };
  })()`);
  const overflow = () => ev(`(function(){
    var de = document.documentElement;
    var cut = [], zero = [];
    Array.prototype.forEach.call(document.querySelectorAll('.g5-thumb, .g5-hero, .g4-kid'), function(n){
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

  // ---------- 0) 解锁链：1–6 岛全通 → 7-1…7-4 逐个通关 → 7-5 才可玩 ----------
  await ev('Game.resetProgress()');
  await ev('for (var isl = 1; isl <= 6; isl++) { for (var lv = 1; lv <= 5; lv++) Game.markCleared(isl, lv); }');
  await ev('Game.openIsland(7)');
  await sleep(400);
  rep.checks.unlock = await ev(`(function(){
    var n5 = document.querySelector('.node[data-level="5"]');
    return { node5Playable: n5.classList.contains('playable'),
             node5Locked: n5.classList.contains('locked'),
             islandTitle: (document.querySelector('.island-head .t1') || {}).textContent || '',
             hasIcon: !!document.querySelector('.big-icon svg, .big-icon img') };
  })()`);
  await shot(TAG + '-island.png');
  if (rep.checks.unlock.node5Playable === true) rep.errors.push('7-4 未通关 7-5 却显示可玩（7-5 应锁住直到 7-4 通关）');
  if (rep.checks.unlock.hasIcon !== true) rep.errors.push('第 7 岛岛屿图标缺失（要求手写 SVG）');
  if (rep.checks.unlock.islandTitle.indexOf('身体与五官') < 0) rep.errors.push('第 7 岛标题不是「身体与五官」：' + rep.checks.unlock.islandTitle);

  await ev('Game.markCleared(7,1)'); await ev('Game.markCleared(7,2)');
  await ev('Game.markCleared(7,3)'); await ev('Game.markCleared(7,4)');
  await ev('Game.openIsland(7)');
  await sleep(400);
  rep.checks.unlockAfter = await ev(`(function(){
    var n5 = document.querySelector('.node[data-level="5"]');
    return { node5Playable: n5.classList.contains('playable'), node5Locked: n5.classList.contains('locked') };
  })()`);
  if (rep.checks.unlockAfter.node5Playable !== true) rep.errors.push('7-4 通关后第 7 岛第 5 关没有解锁');

  // ---------- 1) 进关 → 教学 ----------
  await ev('document.querySelector(\'.node[data-level="5"]\').click()');
  await sleep(300);
  await ev('document.getElementById("btnStart").click()');

  const STEPS = [
    { n: 'warm1', sig: 'sid:warm1', audio: 'g5_t_warmup', demo: true, hero: 'head+clap', shot: 'tut-warm1' },
    { n: 'warm2', sig: 'sid:warm2', audio: 'g5_t_warmup', demo: true, hero: 'head+clap', shot: 'tut-warm2' },
    { n: 'ask1',  sig: 'sid:ask1',  audio: 'g5_t_youdo1', ask: 'btn', hero: 'head+clap', shot: 'tut-ask1' },
    { n: 'next1', sig: 'sid:next1', audio: 'g5_t_next',   demo: true, hero: 'nose+stomp', shot: 'tut-next1' },
    { n: 'next2', sig: 'sid:next2', audio: 'g5_t_next',   demo: true, hero: 'nose+stomp', shot: 'tut-next2' },
    { n: 'ask2',  sig: 'sid:ask2',  audio: 'g5_t_youdo2', ask: 'btn', hero: 'nose+stomp', shot: 'tut-ask2' },
    { n: 'out',   sig: 'sid:out',   audio: 'g5_t_out',    out: true, shot: 'tut-out' }
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
    const row = { step: st.n, reached: reached, sig: entry ? entry.sig : null, sigOk: !!entry && entry.sig === st.sig };
    if (!row.sigOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）舞台不符：期望 ' + st.sig + '，实际 ' + row.sig);
    if (entry && st.ask) row.hintEarly = await ev(sel('.tut-hint'));   // 紧贴条目采集，避免 CDP 抖动误判

    if (entry) {
      await sleep(180);
      row.audio = (await keysBetween(entry.t - 900, entry.t + 2600)).filter(k => k !== 'unknown');
      row.audioOk = row.audio.indexOf(st.audio) >= 0;
      if (!row.audioOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）语音不符：期望 ' + st.audio + '，实际 ' + row.audio.join(','));
      // 主角小人：双半窗口复合展示（两步各一份 SVG）
      if (st.hero) {
        row.heroHalves = await ev('document.querySelectorAll("#askDisplay .g5-combo svg").length');
        row.heroA1 = await ev(sel('#askDisplay .g5-combo .g5-half-a1'));
        row.heroA2 = await ev(sel('#askDisplay .g5-combo .g5-half-a2'));
        if (row.heroHalves !== 2) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）复合主角不是两步各一份：' + row.heroHalves);
        if (row.heroA1 !== true || row.heroA2 !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）复合主角缺少半窗口类');
      }
      // 街机场景（天空 + 跳舞机踏板）
      row.scene = await ev(`(function(){
        return { sky: !!document.querySelector('#askDisplay .g5-sky svg'),
                 floor: !!document.querySelector('#askDisplay .g5-floor svg') };
      })()`);
      if (!row.scene.sky || !row.scene.floor) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）街机场景不完整：' + JSON.stringify(row.scene));
    }
    row.overflow = await overflow();
    if (st.shot) { await sleep(80); await shot(TAG + '-' + st.shot + '.png'); }

    // 演示步：等「轻点继续」→ 验证不自动前进 → 点屏幕推进
    if (st.demo) {
      row.tapShown = await wait(sel('.f11-tap'), 5000);
      if (!row.tapShown) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示定格后没有出现「轻点继续」');
      await sleep(2100);
      row.autoAdvanced = (await ev('window.__stageLog.length')) > (foundIdx + 1);
      if (row.autoAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示未点按就自动前进了');
      await tap('#askDisplay .g5-stage');
      row.advanced = await wait('window.__stageLog.length > ' + (foundIdx + 1), 6000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    // 互动步：大按钮点亮（演示语音播完后才可点）→ 4 秒小手指指向按钮 → 点按钮 → great → 推进
    if (st.ask === 'btn') {
      row.btnOn = await wait(sel('#askDisplay .g5-thumb:not(.off)'), 7000);
      if (row.btnOn !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示后大按钮没有点亮');
      row.btnGeom = await thumbGeom();
      var btnOkSize = (H >= W) ? (row.btnGeom && row.btnGeom.vw >= 44) : (row.btnGeom && row.btnGeom.px >= 110);
      if (!btnOkSize) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）大按钮不够大（' + JSON.stringify(row.btnGeom) + '，§三.12）');
      if (row.btnGeom && row.btnGeom.inView !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）大按钮不在视口内');
      row.hintLater = await wait(sel('.tut-hint'), 7000);
      if (row.hintEarly === true || row.hintLater !== true) {
        rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手指异常：early=' + row.hintEarly + ' later=' + row.hintLater);
      }
      row.hintGeom = await ev(`(function(){
        var h = document.querySelector('.tut-hint');
        var tgt = document.querySelector('#askDisplay .g5-thumb');
        if (!h || !tgt) return null;
        var tb = tgt.getBoundingClientRect();
        var hb = h.getBoundingClientRect();
        var ex = hb.left + hb.width / 2, ey = hb.top + hb.height;
        var near = ex > tb.left - 16 && ex < tb.right + 16 && ey > tb.top - 28 && ey < tb.bottom + 32;
        return { near: near, stars: Game.stars };
      })()`);
      if (row.hintGeom && row.hintGeom.near !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）小手指没指向大按钮');
      if (row.hintGeom && row.hintGeom.stars !== 0) rep.errors.push('教学阶段不该有星星：' + row.hintGeom.stars);
      await sleep(200);

      const before = await ev('window.__stageLog.length');
      const ct = Date.now();
      await tap('#askDisplay .g5-thumb:not(.off)');
      await sleep(1500);
      row.great = (await keysBetween(ct - 200, ct + 2400)).filter(k => k !== 'unknown');
      if (row.great.indexOf('g2_t_great') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按钮后没播鼓励语：' + row.great.join(','));
      row.advanced = await wait('window.__stageLog.length > ' + before + ' || Game.phase === "asking"', 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按钮后没有推进');
    }

    // 过渡步：语音播完自动进入答题（§三.14 允许 outro 自动 tutFinish）
    if (st.out) {
      row.ended = await wait('Game.phase === "asking"', 10000);
      if (row.ended !== true) rep.errors.push('过渡语播完没有进入答题');
    }
    rep.tutorial.push(row);
    console.log('STEP ' + (i + 1) + ' ' + JSON.stringify(row).slice(0, 420));
  }

  rep.checks.outro = { ended: await wait('Game.phase === "asking"', 20000) };
  await sleep(500);
  rep.checks.outro.totalSteps = await ev('window.__stageLog.length');
  rep.checks.outro.starsInTutorial = await ev('Game.stars');
  rep.checks.errs = await ev('window.__errs.slice(0, 3)');
  if (rep.checks.errs.length) console.log('ERRS ' + JSON.stringify(rep.checks.errs));
  await shot(TAG + '-ask-first.png');

  // ---------- 2) 12 轮答题 ----------
  const seenType = {};
  const seenShot = {};
  const wrongTested = { G5A: false, G5B: false, G5C: false };

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(200);
    let snap = await ev('Game.snapshot()');
    let q = snap.question;
    if (!q) { rep.errors.push('第 ' + r + ' 轮：答题阶段未开始（question 为空，phase=' + snap.phase + '）'); break; }
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, audio: q.audio, act: q.g5act, a1: q.g5a1, a2: q.g5a2, noun: q.g5noun };

    if (q.type === 'G5A' || q.type === 'G5B') {
      // 屏幕中央只有巨大👍按钮（无小人、无选项）
      row.thumbs = await ev('document.querySelectorAll("#askDisplay .g5-thumb").length');
      row.kids = await ev('document.querySelectorAll("#askDisplay .g4-kid").length');
      row.optsN = await ev('document.querySelectorAll("#options .option[data-drag]").length');
      row.btnGeom = await thumbGeom();
      var btnOkSize = (H >= W) ? (row.btnGeom && row.btnGeom.vw >= 44) : (row.btnGeom && row.btnGeom.px >= 110);
      if (row.thumbs !== 1) rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 大按钮不是 1 个：' + row.thumbs);
      if (row.kids !== 0) rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 屏幕不该出现小人：' + row.kids);
      if (row.optsN !== 0) rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 不该有可拖选项：' + row.optsN);
      if (!btnOkSize) rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 大按钮不够大：' + JSON.stringify(row.btnGeom));
      if (row.btnGeom && row.btnGeom.inView !== true) rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 大按钮不在视口内');
      if (q.type === 'G5A') {
        row.audioOk = q.audio === A_KEY[q.g5act];
        if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 G5A 语音与动作不符：' + q.audio + ' act=' + q.g5act);
      } else {
        row.audioOk = q.audio === B_KEY[q.g5a1 + '+' + q.g5a2];
        if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 G5B 语音与两步指令不符：' + q.audio + ' steps=' + q.g5a1 + '+' + q.g5a2);
      }
    }
    if (q.type === 'G5C') {
      row.kids = await ev('document.querySelectorAll("#askDisplay .g4-kid").length');
      row.thumbs = await ev('document.querySelectorAll("#askDisplay .g5-thumb").length');
      row.audioOk = q.audio === C_SENT[q.g5noun + '+' + q.g5act];
      row.matchN = await ev(`(function(){
        var n = 0;
        Array.prototype.forEach.call(document.querySelectorAll('#askDisplay .g4-kid'), function(k){
          if (k.dataset.gender === ${JSON.stringify(q.g5noun)} && k.dataset.act === ${JSON.stringify(q.g5act)}) n++;
        });
        return n;
      })()`);
      row.semOk = await ev(`(function(){
        var ks = ${JSON.stringify(q.g5kids)};
        var dom = document.querySelectorAll('#askDisplay .g4-kid');
        if (ks.length !== dom.length) return false;
        for (var i = 0; i < ks.length; i++) {
          if (dom[i].dataset.kid !== ks[i].kid || dom[i].dataset.act !== ks[i].act) return false;
        }
        return true;
      })()`);
      if (row.kids !== 3) rep.errors.push('第 ' + r + ' 轮 G5C 不是 3 个小人：' + row.kids);
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 G5C 语音不符：' + q.audio);
      if (row.matchN !== 1) rep.errors.push('第 ' + r + ' 轮 G5C 匹配(性别+动作)的小人不是唯一：' + row.matchN);
      if (!row.semOk) rep.errors.push('第 ' + r + ' 轮 G5C 画面与题目不一致：' + JSON.stringify(q.g5kids));
      if (q.correct < 0) rep.errors.push('第 ' + r + ' 轮 G5C 没有正确项：' + q.correct);
    }

    if (!seenShot[q.type]) {
      seenShot[q.type] = 1;
      await sleep(300);
      row.overflow = await overflow();
      await shot(TAG + '-q-' + q.type + '.png');
    }

    // 每种题型第一轮做一次「答错不推进」测试（A/B 永远判对，跳过）
    if (!wrongTested[q.type]) {
      wrongTested[q.type] = true;
      let did = false;
      if (q.type === 'G5C') {
        const wrongSel = await ev(`(function(){
          var dom = document.querySelectorAll('#askDisplay .g4-kid');
          for (var i = 0; i < dom.length; i++) {
            if (dom[i].dataset.act !== ${JSON.stringify(q.g5act)}) {
              return '#askDisplay .g4-kid[data-kid="' + dom[i].dataset.kid + '"][data-act="' + dom[i].dataset.act + '"]';
            }
          }
          return null;
        })()`);
        if (wrongSel) did = await tap(wrongSel);
      }
      if (did) {
        await sleep(1100);
        const after = await ev('Game.snapshot()');
        row.wrongPick = { advanced: after.round !== r, stillAsking: after.phase === 'asking' };
        if (row.wrongPick.advanced) rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 答错却判过了');
        await sleep(1700);
        snap = await ev('Game.snapshot()');
        q = snap.question;
      }
    }

    const before = await ev('Game.round');
    const starsBefore = await ev('Game.stars');
    const ct = Date.now();

    if (q.type === 'G5A' || q.type === 'G5B') {
      await tap('#askDisplay .g5-thumb');
    } else {
      await tap('#askDisplay .g4-kid[data-act="' + q.g5act + '"]');
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

  // ---------- 3) 通关（结业关：grand 模式 + 第 7 岛小旗 + 岛 cleared 点亮） ----------
  rep.checks.done = {
    phase: await ev('Game.phase'),
    stars: await ev('Game.stars'),
    viewDone: await ev('!document.getElementById("viewDone").hidden'),
    grand: await ev('document.getElementById("viewDone").classList.contains("grand")'),
    islandFlag: await ev('!!document.querySelector(\'.island-flag[data-island="7"]\')'),
    cleared: await ev('!!Game.progress.cleared["7-5"]'),
    unlockedLevel: await ev('Game.progress.unlockedLevel[7]'),
    unlockedIsland: await ev('Game.progress.unlockedIsland')
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
    var c7 = document.querySelector('.island[data-island="7"]');
    var c8 = document.querySelector('.island[data-island="8"]');
    return { island7Unlocked: c7.classList.contains('unlocked'),
             island7Cleared: c7.classList.contains('cleared'),
             island7HasIcon: !!c7.querySelector('.icon svg, .icon img'),
             island8Unlocked: c8 ? c8.classList.contains('unlocked') : null };
  })()`);
  await shot(TAG + '-map-after.png');

  await ev('Game.openIsland(7)'); await sleep(300);
  rep.checks.englishIsland = await scan();
  rep.checks.islandAfter = await ev(`(function(){
    var n5 = document.querySelector('.node[data-level="5"]');
    var snap = Game.snapshot();
    return { node5Playable: n5.classList.contains('playable'),
             node5Done: n5.classList.contains('done'),
             unlockedLevel: snap.progress.unlockedLevel[7],
             unlockedIsland: snap.progress.unlockedIsland };
  })()`);
  await shot(TAG + '-island-after.png');

  console.log(JSON.stringify(rep, null, 2));

  const sigOk = rep.tutorial.every(s => s.sigOk);
  const noOverflow = rep.tutorial.every(s => !s.overflow ||
    (s.overflow.sw <= s.overflow.iw + 1 && s.overflow.sh <= s.overflow.ih + 1 &&
     s.overflow.cut.length === 0 && s.overflow.zero.length === 0));
  const audioOk = rep.tutorial.every(s => s.audioOk);
  const heroOk = rep.tutorial.filter(s => s.hero).every(s => s.heroHalves === 2 && s.heroA1 === true && s.heroA2 === true && s.scene.sky && s.scene.floor);
  const hintOk = rep.tutorial.filter(s => s.ask).every(s => s.hintEarly !== true && s.hintLater === true);
  const advanceOk = rep.tutorial.filter(s => s.advanced !== undefined).every(s => s.advanced === true);
  const demoOk = rep.tutorial.filter(s => s.demo).every(s => s.tapShown === true && s.autoAdvanced === false && s.advanced === true);
  const btnOk = rep.tutorial.filter(s => s.ask === 'btn').every(s => s.btnOn === true && s.great.indexOf('g2_t_great') >= 0 && s.btnGeom && s.btnGeom.inView);
  const outOk = rep.tutorial.filter(s => s.out).every(s => s.ended === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1 && s.voiceOnCorrect.length === 0);
  const ok = rep.errors.length === 0 && sigOk && audioOk && heroOk && hintOk && advanceOk && demoOk &&
    btnOk && outOk && roundsOk && noOverflow &&
    rep.rounds.length === 12 &&
    Object.keys(seenType).length === 3 && seenType.G5A === 4 && seenType.G5B === 4 && seenType.G5C === 4 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === true && rep.checks.done.islandFlag === true &&
    rep.checks.done.cleared === true && rep.checks.done.unlockedLevel === 5 &&
    rep.checks.done.unlockedIsland === 8 &&
    rep.checks.islandAfter.node5Done === true &&
    rep.checks.islandAfter.unlockedLevel === 5 && rep.checks.islandAfter.unlockedIsland === 8 &&
    rep.checks.mapAfter.island7Unlocked === true && rep.checks.mapAfter.island7Cleared === true &&
    rep.checks.mapAfter.island7HasIcon === true && rep.checks.mapAfter.island8Unlocked === true &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0 &&
    rep.checks.englishIsland.length === 0 &&
    rep.checks.outro.ended === true;
  console.log('\nPROBE_' + (ok ? 'PASS' : 'FAIL') + ' sigOk=' + sigOk + ' audioOk=' + audioOk + ' heroOk=' + heroOk +
    ' hintOk=' + hintOk + ' advanceOk=' + advanceOk + ' demoOk=' + demoOk + ' btnOk=' + btnOk +
    ' outOk=' + outOk + ' roundsOk=' + roundsOk + ' noOverflow=' + noOverflow +
    ' steps=' + rep.checks.outro.totalSteps + ' types=' + JSON.stringify(seenType) +
    ' stars=' + rep.checks.done.stars + ' grand=' + rep.checks.done.grand +
    ' flag=' + rep.checks.done.islandFlag + ' cleared=' + rep.checks.done.cleared +
    ' unlockedIsland=' + rep.checks.done.unlockedIsland);
  finish(ok ? 0 : 1);
})().catch(e => { console.error('PROBE_ERROR', e); finish(2); });
