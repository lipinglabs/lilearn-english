// 第 7 岛第 1 关（L7-W1，认识五官 eye / nose / mouth / ear）专项测试
//   1) 解锁链：第 1–6 岛全通（6-5 通关）→ 第 7 岛第 1 关可玩，7-2 仍是「准备中」
//   2) 教学 13 环节（8 演示 + 4 互动 + 过渡）：演示语音播完定格，必须点屏幕才推进（RULES §三.14）；
//      互动 4 秒无反应出小手指（§二.12），点错不推进；综合互动点错器官也要有温柔反馈
//   3) 三题型：A 听音拼脸（缺一个器官的脸 + 3 个零件，拖/点到脸上）/
//      B 听音找五官（3 张小脸各高亮不同器官）/ C 快速反应（4 个器官点目标）
//   4) 12 轮（4/4/4）：答对无人声、答错不推进、拖错零件不给过、通关奖励
//   5) 视觉：无英文字母（innerText + aria-label）、双视口无溢出（含纵向）、可点目标够大
// 带 LILEARN_URL 则直接跑线上（发布后回归用）。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'g1';
const PORT = 9771 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));

const A_KEY = { eye: 'g1_a_eye', nose: 'g1_a_nose', mouth: 'g1_a_mouth', ear: 'g1_a_ear' };
const B_KEY = { eye: 'g1_b_eye', nose: 'g1_b_nose', mouth: 'g1_b_mouth', ear: 'g1_b_ear' };
const C_KEY = { eye: 'g1_c_eye', nose: 'g1_c_nose', mouth: 'g1_c_mouth', ear: 'g1_c_ear' };

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-g1-' + Date.now()),
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
        var s = document.querySelector('.g1-stage');
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
    for (let i = 0; i < 1400; i++) {   // 线上 23MB voice.js 冷加载可能很慢，给足 210s
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
      '.g1-face, .g1-part-btn, .g1-mini, .g1-opt-btn, .g1-on, .option'), function(n){
      var host = n.closest('#viewAsk, #viewDone, #viewStart');
      if (host && host.hidden) return;   // 视图已切走：隐藏容器里的旧节点不计越界
      var b = n.getBoundingClientRect();
      if (!b.width) {
        if (n.classList.contains('option')) { if (optShown && !n.hidden) zero.push('option:0'); }
        else zero.push((n.className || '?') + ':0');
        return;
      }
      var isClick = n.classList.contains('g1-face') || n.classList.contains('g1-part-btn') ||
                    n.classList.contains('g1-mini') || n.classList.contains('g1-opt-btn');
      var overH = b.right > window.innerWidth + 1 || b.left < -1;
      var overV = isClick && (b.bottom > window.innerHeight + 1 || b.top < -1);
      if (overH || overV) cut.push(n.className + ':' + Math.round(b.left) + ',' + Math.round(b.top) +
        '..' + Math.round(b.right) + ',' + Math.round(b.bottom));
    });
    return { sw: de.scrollWidth, iw: window.innerWidth, sh: de.scrollHeight, ih: window.innerHeight,
             cut: cut.slice(0, 6), zero: zero.slice(0, 6) };
  })()`);

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };

  // ---------- 0) 解锁链：1–6 岛全通 → 7-1 可玩 ----------
  await ev('Game.resetProgress()');
  await ev('for (var isl = 1; isl <= 6; isl++) { for (var lv = 1; lv <= 5; lv++) Game.markCleared(isl, lv); }');
  await ev('Game.openIsland(7)');
  await sleep(400);
  rep.checks.unlock = await ev(`(function(){
    var n1 = document.querySelector('.node[data-level="1"]');
    var n2 = document.querySelector('.node[data-level="2"]');
    return { node1Playable: n1.classList.contains('playable'),
             node1Text: n1.textContent,
             node2Playable: n2.classList.contains('playable'),
             node2Locked: n2.classList.contains('locked'),
             islandTitle: (document.querySelector('.island-head .t1') || {}).textContent || '',
             hasIcon: !!document.querySelector('.big-icon svg, .big-icon img') };
  })()`);
  await shot(TAG + '-island.png');
  if (rep.checks.unlock.node1Playable !== true) rep.errors.push('第 7 岛第 1 关没有亮起（' + JSON.stringify(rep.checks.unlock) + '）');
  if (rep.checks.unlock.node2Playable === true) rep.errors.push('第 7 岛第 2 关没做却显示可玩');
  if (rep.checks.unlock.hasIcon !== true) rep.errors.push('第 7 岛岛屿图标缺失（要求手写 SVG）');
  if (rep.checks.unlock.islandTitle.indexOf('身体与五官') < 0) rep.errors.push('第 7 岛标题不是「身体与五官」：' + rep.checks.unlock.islandTitle);

  // ---------- 1) 进关 → 教学 ----------
  await ev('document.querySelector(\'.node[data-level="1"]\').click()');
  await sleep(300);
  await ev('document.getElementById("btnStart").click()');

  const STEPS = [
    { n: 'face',      sig: 'sid:face',     audio: 'g1_t_face',      demo: true, shot: 'tut-face' },
    { n: 'eye',       sig: 'sid:eye',      audio: 'g1_t_eyes',      demo: true, shot: 'tut-eye' },
    { n: 'ask-eye',   sig: 'sid:askEye',   audio: 'g1_t_eyes_ask',  ask: 'eye',   wrong: 'nose',  hint: true, shot: 'tut-askEye' },
    { n: 'nose1',     sig: 'sid:nose1',    audio: 'g1_t_nose1',     demo: true, shot: 'tut-nose1' },
    { n: 'nose2',     sig: 'sid:nose2',    audio: 'g1_t_nose2',     demo: true, shot: 'tut-nose2' },
    { n: 'ask-nose',  sig: 'sid:askNose',  audio: 'g1_t_nose_ask',  ask: 'nose',  wrong: 'ear',   shot: 'tut-askNose' },
    { n: 'mouth1',    sig: 'sid:mouth1',   audio: 'g1_t_mouth1',    demo: true, shot: 'tut-mouth1' },
    { n: 'mouth2',    sig: 'sid:mouth2',   audio: 'g1_t_mouth2',    demo: true, shot: 'tut-mouth2' },
    { n: 'ask-mouth', sig: 'sid:askMouth', audio: 'g1_t_mouth_ask', ask: 'mouth', wrong: 'eye',   shot: 'tut-askMouth' },
    { n: 'ear1',      sig: 'sid:ear1',     audio: 'g1_t_ear1',      demo: true, shot: 'tut-ear1' },
    { n: 'ear2',      sig: 'sid:ear2',     audio: 'g1_t_ear2',      demo: true, shot: 'tut-ear2' },
    { n: 'ask-ear',   sig: 'sid:askEar',   audio: 'g1_t_ear_ask',   touch: 'ear', wrong: 'eye',   hint: true, shot: 'tut-askEar' },
    { n: 'out',       sig: 'sid:out',      audio: 'g1_t_out' }
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

    if (entry) {
      await sleep(180);
      row.audio = (await keysBetween(entry.t - 900, entry.t + 2600)).filter(k => k !== 'unknown');
      row.audioOk = row.audio.indexOf(st.audio) >= 0;
      if (!row.audioOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）语音不符：期望 ' + st.audio + '，实际 ' + row.audio.join(','));
    }
    if (st.n !== 'out') row.overflow = await overflow();
    if (st.shot) { await sleep(80); await shot(TAG + '-' + st.shot + '.png'); }

    // 演示步：等「轻点继续」→ 验证不自动前进 → 点屏幕推进
    if (st.demo) {
      row.tapShown = await wait(sel('.f11-tap'), 5000);
      if (!row.tapShown) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示定格后没有出现「轻点继续」');
      await sleep(2100);
      row.autoAdvanced = (await ev('window.__stageLog.length')) > (foundIdx + 1);
      if (row.autoAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示未点按就自动前进了');
      await tap('#askDisplay .g1-stage');
      row.advanced = await wait('window.__stageLog.length > ' + (foundIdx + 1), 6000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    // 互动（拼脸）：点错零件 → 点脸，不应该推进，且要播 again
    if (st.ask && st.wrong) {
      const before = await ev('window.__stageLog.length');
      const wt = Date.now();
      await tap('#askDisplay .g1-part-btn[data-part="' + st.wrong + '"]');
      await sleep(140);
      await tap('#askDisplay .g1-face[data-drop="face"]');
      await sleep(1000);
      row.wrongPick = {
        advanced: (await ev('window.__stageLog.length')) > before,
        audio: (await keysBetween(wt - 150, wt + 2400)).filter(k => k !== 'unknown')
      };
      if (row.wrongPick.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）放错零件却推进了');
      if (row.wrongPick.audio.indexOf('again') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）放错后没播 again：' + row.wrongPick.audio.join(','));
      await sleep(700);
    }
    // 互动（综合）：点错器官 → 也要有 again，且不推进
    if (st.touch && st.wrong) {
      const before = await ev('window.__stageLog.length');
      const wt = Date.now();
      await tap('#askDisplay .g1-on[data-part="' + st.wrong + '"]');
      await sleep(1000);
      row.wrongTouch = {
        advanced: (await ev('window.__stageLog.length')) > before,
        audio: (await keysBetween(wt - 150, wt + 2400)).filter(k => k !== 'unknown')
      };
      if (row.wrongTouch.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错器官却推进了');
      if (row.wrongTouch.audio.indexOf('again') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错器官后没播 again：' + row.wrongTouch.audio.join(','));
      await sleep(700);
    }

    if (st.hint) {
      row.hintEarly = await ev(sel('.tut-hint'));
      row.hintLater = await wait(sel('.tut-hint'), 7000);
      if (row.hintEarly === true || row.hintLater !== true) {
        rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手指异常：early=' + row.hintEarly + ' later=' + row.hintLater);
      }
      row.hintGeom = await ev(`(function(){
        var h = document.querySelector('.tut-hint');
        if (!h) return null;
        var isDrag = h.classList.contains('drag');
        var tgt = ${st.touch
          ? `document.querySelector('#askDisplay .g1-on[data-part="${st.touch}"]')`
          : `document.querySelector('#askDisplay .g1-face[data-drop="face"]')`};
        var tb = tgt ? tgt.getBoundingClientRect() : null;
        if (!tb) return null;
        var hb = h.getBoundingClientRect();
        var ex, ey;
        if (isDrag) {
          var hx = parseFloat(h.style.getPropertyValue('--hx')) || 0;
          var hy = parseFloat(h.style.getPropertyValue('--hy')) || 0;
          ex = hb.left + hx; ey = hb.top + hy;
        } else {
          ex = hb.left + hb.width / 2; ey = hb.top + hb.height;
        }
        var near = ex > tb.left - 16 && ex < tb.right + 16 && ey > tb.top - 28 && ey < tb.bottom + 32;
        return { isDrag: isDrag, near: near, stars: Game.stars,
                 end: [Math.round(ex), Math.round(ey)],
                 tgt: [Math.round(tb.left), Math.round(tb.top), Math.round(tb.right), Math.round(tb.bottom)] };
      })()`);
      if (row.hintGeom && row.hintGeom.near !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）小手指没指向正确目标：' + JSON.stringify(row.hintGeom));
      if (row.hintGeom && row.hintGeom.stars !== 0) rep.errors.push('教学阶段不该有星星：' + row.hintGeom.stars);
      await sleep(200);
    }

    // 互动正确作答：拼脸（拖到脸上）/ 综合（点耳朵）
    if (st.ask) {
      const before = await ev('window.__stageLog.length');
      const faceR = await rectOf('#askDisplay .g1-face[data-drop="face"]');
      if (!faceR) {
        rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）找不到脸');
      } else {
        await dragTo('#askDisplay .g1-part-btn[data-part="' + st.ask + '"]', faceR.cx, faceR.cy);
      }
      await sleep(1500);
      row.advanced = await wait('window.__stageLog.length > ' + before, 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）放对零件后没有推进');
    }
    if (st.touch) {
      const before = await ev('window.__stageLog.length');
      await tap('#askDisplay .g1-on[data-part="' + st.touch + '"]');
      await sleep(1400);
      row.advanced = await wait('window.__stageLog.length > ' + before, 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点对器官后没有推进');
    }
    rep.tutorial.push(row);
    console.log('STEP ' + (i + 1) + ' ' + JSON.stringify(row).slice(0, 380));
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
  const wrongTested = { G1A: false, G1B: false, G1C: false };

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(200);
    let snap = await ev('Game.snapshot()');
    let q = snap.question;
    if (!q) { rep.errors.push('第 ' + r + ' 轮：答题阶段未开始（question 为空，phase=' + snap.phase + '）'); break; }
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, correct: q.correct, opts: q.options, audio: q.audio, part: q.part, hl: q.hl };

    if (q.type === 'G1A') {
      row.faces = await ev('document.querySelectorAll("#askDisplay .g1-face").length');
      row.optsN = await ev('document.querySelectorAll("#options .option[data-drag]").length');
      row.audioOk = q.audio === A_KEY[q.part];
      row.ansOk = q.options[q.correct] === ('i:' + q.part);
      row.optsSafe = q.options.indexOf('i:' + q.part) >= 0;
      if (row.faces !== 1) rep.errors.push('第 ' + r + ' 轮 G1A 脸不是 1 张：' + row.faces);
      if (row.optsN !== 3) rep.errors.push('第 ' + r + ' 轮 G1A 可拖零件不是 3 个：' + row.optsN);
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 G1A 语音与缺失器官不符：' + q.audio + ' want=' + A_KEY[q.part]);
      if (!row.ansOk) rep.errors.push('第 ' + r + ' 轮 G1A 正确项不是该器官：' + q.options[q.correct]);
    }
    if (q.type === 'G1B') {
      row.minis = await ev('document.querySelectorAll("#askDisplay .g1-mini").length');
      row.audioOk = q.audio === B_KEY[q.hl];
      row.ansOk = q.options[q.correct] === ('s:' + q.hl);
      row.hlOk = await ev(`(function(){
        var c = document.querySelector('#askDisplay .g1-mini[data-hl="${q.hl}"]');
        if (!c) return false;
        return !!c.querySelector('.g1-on[data-part="${q.hl}"].g1-hl');
      })()`);
      if (row.minis !== 3) rep.errors.push('第 ' + r + ' 轮 G1B 小脸不是 3 张：' + row.minis);
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 G1B 语音与高亮器官不符：' + q.audio + ' want=' + B_KEY[q.hl]);
      if (!row.ansOk) rep.errors.push('第 ' + r + ' 轮 G1B 正确项不是高亮那张：' + q.options[q.correct]);
      if (!row.hlOk) rep.errors.push('第 ' + r + ' 轮 G1B 正确小脸里没有对应的放大高亮器官：' + q.hl);
    }
    if (q.type === 'G1C') {
      row.btns = await ev('document.querySelectorAll("#askDisplay .g1-opt-btn").length');
      row.audioOk = q.audio === C_KEY[q.part];
      row.ansOk = q.options[q.correct] === ('i:' + q.part);
      row.parts = q.options.slice().sort().join(',');
      if (row.btns !== 4) rep.errors.push('第 ' + r + ' 轮 G1C 器官不是 4 个：' + row.btns);
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 G1C 语音与目标器官不符：' + q.audio + ' want=' + C_KEY[q.part]);
      if (!row.ansOk) rep.errors.push('第 ' + r + ' 轮 G1C 正确项不是目标器官：' + q.options[q.correct]);
      if (row.parts !== 'i:ear,i:eye,i:mouth,i:nose') rep.errors.push('第 ' + r + ' 轮 G1C 四个器官不全：' + row.parts);
    }

    if (!seenShot[q.type]) {
      seenShot[q.type] = 1;
      await sleep(300);
      row.overflow = await overflow();
      row.geom = await ev(`(function(){
        var m = document.querySelector('#askDisplay .g1-mini');
        var b = document.querySelector('#askDisplay .g1-opt-btn');
        var f = document.querySelector('#askDisplay .g1-face');
        function r(n){ if(!n) return null; var x=n.getBoundingClientRect(); return [Math.round(x.left),Math.round(x.right),Math.round(x.width)]; }
        return { mini: r(m), opt: r(b), face: r(f), iw: window.innerWidth };
      })()`);
      await shot(TAG + '-q-' + q.type + '.png');
    }

    // 每种题型第一轮做一次「答错不推进」测试
    if (!wrongTested[q.type]) {
      wrongTested[q.type] = true;
      let did = false;
      if (q.type === 'G1A') {
        const wrongIdx = (q.correct + 1) % 3;
        const faceR = await rectOf('#askDisplay .g1-face[data-drop="face"]');
        if (faceR) {
          await tap('#options .option[data-idx="' + wrongIdx + '"]');
          await sleep(150);
          did = await dragTo('#options .option[data-idx="' + wrongIdx + '"]', faceR.cx, faceR.cy);
        }
      } else if (q.type === 'G1B') {
        const wrongIdx = (q.correct + 1) % 3;
        did = await tap('#askDisplay .g1-mini[data-idx="' + wrongIdx + '"]');
      } else {
        const wrongIdx = (q.correct + 1) % 4;
        did = await tap('#askDisplay .g1-opt-btn[data-idx="' + wrongIdx + '"]');
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

    if (q.type === 'G1A') {
      const idx = q.options.indexOf('i:' + q.part);
      const faceR = await rectOf('#askDisplay .g1-face[data-drop="face"]');
      await tap('#options .option[data-idx="' + idx + '"]');
      await sleep(150);
      await dragTo('#options .option[data-idx="' + idx + '"]', faceR.cx, faceR.cy);
    } else if (q.type === 'G1B') {
      await tap('#askDisplay .g1-mini[data-idx="' + q.correct + '"]');
    } else {
      await tap('#askDisplay .g1-opt-btn[data-idx="' + q.correct + '"]');
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
    cleared: await ev('!!Game.progress.cleared["7-1"]'),
    unlockedLevel: await ev('Game.progress.unlockedLevel[7]')
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
    return { island7Unlocked: c7.classList.contains('unlocked'),
             island7Cleared: c7.classList.contains('cleared'),
             hasIcon: !!c7.querySelector('.icon svg, .icon img') };
  })()`);
  await shot(TAG + '-map-after.png');

  await ev('Game.openIsland(7)'); await sleep(300);
  rep.checks.englishIsland = await scan();
  rep.checks.islandAfter = await ev(`(function(){
    var n1 = document.querySelector('.node[data-level="1"]');
    var n2 = document.querySelector('.node[data-level="2"]');
    var snap = Game.snapshot();
    return { node1Done: n1.classList.contains('done'),
             node1Text: n1.textContent,
             node2Playable: n2.classList.contains('playable'),
             unlockedLevel: snap.progress.unlockedLevel[7] };
  })()`);
  const islOverflow = await overflow();
  rep.checks.overflowIsland = { sw: islOverflow.sw, iw: islOverflow.iw, sh: islOverflow.sh, ih: islOverflow.ih, cut: islOverflow.cut, zero: islOverflow.zero };
  await shot(TAG + '-island-after.png');

  console.log(JSON.stringify(rep, null, 2));

  const sigOk = rep.tutorial.every(s => s.sigOk);
  const noOverflow = rep.tutorial.every(s => !s.overflow ||
    (s.overflow.sw <= s.overflow.iw + 1 && s.overflow.sh <= s.overflow.ih + 1 &&
     s.overflow.cut.length === 0 && s.overflow.zero.length === 0));
  const audioOk = rep.tutorial.every(s => s.audioOk);
  const hintOk = rep.tutorial.filter(s => s.hint).every(s => s.hintEarly !== true && s.hintLater === true);
  const wrongOk = rep.tutorial.every(s => {
    if (s.wrongPick) return !s.wrongPick.advanced;
    if (s.wrongTouch) return !s.wrongTouch.advanced;
    return true;
  });
  const advanceOk = rep.tutorial.filter(s => s.advanced !== undefined).every(s => s.advanced === true);
  const demoOk = rep.tutorial.filter(s => s.demo).every(s => s.tapShown === true && s.autoAdvanced === false && s.advanced === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1 && s.voiceOnCorrect.length === 0);
  const ok = rep.errors.length === 0 && sigOk && audioOk && hintOk && wrongOk && advanceOk && demoOk && roundsOk && noOverflow &&
    rep.rounds.length === 12 &&
    Object.keys(seenType).length === 3 && seenType.G1A === 4 && seenType.G1B === 4 && seenType.G1C === 4 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === false && rep.checks.done.cleared === true &&
    rep.checks.done.unlockedLevel === 2 &&
    rep.checks.islandAfter.node1Done === true &&
    rep.checks.islandAfter.node1Text.indexOf('⭐') >= 0 &&
    rep.checks.islandAfter.unlockedLevel === 2 &&
    rep.checks.mapAfter.island7Unlocked === true && rep.checks.mapAfter.island7Cleared === false &&
    rep.checks.mapAfter.hasIcon === true &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0 &&
    rep.checks.englishIsland.length === 0 &&
    rep.checks.outro.ended === true &&
    rep.checks.overflowIsland.sw <= rep.checks.overflowIsland.iw + 1;
  console.log('\nPROBE_' + (ok ? 'PASS' : 'FAIL') + ' sigOk=' + sigOk + ' audioOk=' + audioOk + ' hintOk=' + hintOk +
    ' wrongOk=' + wrongOk + ' advanceOk=' + advanceOk + ' demoOk=' + demoOk + ' roundsOk=' + roundsOk +
    ' noOverflow=' + noOverflow + ' steps=' + rep.checks.outro.totalSteps + ' types=' + JSON.stringify(seenType) +
    ' stars=' + rep.checks.done.stars + ' cleared=' + rep.checks.done.cleared);
  finish(ok ? 0 : 1);
})().catch(e => { console.error('PROBE_ERROR', e); finish(2); });
