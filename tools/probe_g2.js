// 第 7 岛第 2 关（L7-W2，身体部位与 TPR 动作 head / hand / foot）专项测试
//   1) 解锁链：第 1–6 岛全通 → 第 7 岛第 1 关可玩；7-2 必须等 7-1 通关后才解锁（§交付要求）
//   2) 教学 10 环节（6 演示 + 3 互动 + TPR 模仿）：演示语音播完定格，必须点屏幕才推进（RULES §三.14）；
//      互动 4 秒无反应出小手指（§二.12），放错零件不推进且播 again；综合互动点身体不推进；TPR 👍 永远判对（§三.12）
//   3) 三题型：A 听音拼身体（缺一个部位的身体 + 3 个零件，拖/点到身上）/
//      B 听指令做动作（👍 大按钮 + 小人演示，永远判对）/ C 听指令找部位（3 个完整小人各高亮头/手/脚）
//   4) 12 轮（4/4/4）：答对无人声、答错不推进、拼错不给过、通关奖励
//   5) 视觉：无英文字母（innerText + aria-label）、双视口无溢出（含纵向）、可点目标够大
// 带 LILEARN_URL 则直接跑线上（发布后回归用）。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'g2';
const PORT = 9773 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));

const A_KEY = { head: 'g2_a_head', hand: 'g2_a_hand', foot: 'g2_a_foot' };
const B_KEY = { head: 'g2_b_head', hand: 'g2_t_hand2', foot: 'g2_t_foot2' };
const C_KEY = { head: 'g2_c_head', hand: 'g2_c_hand', foot: 'g2_c_foot' };

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-g2-' + Date.now()),
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
        var s = document.querySelector('.g2-stage');
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
      '.g2-body, .g2-part-btn, .g2-mini, .g2-thumb, .option'), function(n){
      var host = n.closest('#viewAsk, #viewDone, #viewStart');
      if (host && host.hidden) return;   // 视图已切走：隐藏容器里的旧节点不计越界
      var b = n.getBoundingClientRect();
      if (!b.width) {
        if (n.classList.contains('option')) { if (optShown && !n.hidden) zero.push('option:0'); }
        else zero.push((n.className || '?') + ':0');
        return;
      }
      var isClick = n.classList.contains('g2-body') || n.classList.contains('g2-part-btn') ||
                    n.classList.contains('g2-mini') || n.classList.contains('g2-thumb');
      var overH = b.right > window.innerWidth + 1 || b.left < -1;
      var overV = isClick && (b.bottom > window.innerHeight + 1 || b.top < -1);
      if (overH || overV) cut.push(n.className + ':' + Math.round(b.left) + ',' + Math.round(b.top) +
        '..' + Math.round(b.right) + ',' + Math.round(b.bottom));
    });
    return { sw: de.scrollWidth, iw: window.innerWidth, sh: de.scrollHeight, ih: window.innerHeight,
             cut: cut.slice(0, 6), zero: zero.slice(0, 6) };
  })()`);

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };

  // ---------- 0) 解锁链：1–6 岛全通 → 7-1 可玩；7-2 必须等 7-1 通关 ----------
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
  if (rep.checks.unlock.node2Playable === true) rep.errors.push('第 7 岛第 2 关没做却显示可玩（7-2 应锁住直到 7-1 通关）');
  if (rep.checks.unlock.hasIcon !== true) rep.errors.push('第 7 岛岛屿图标缺失（要求手写 SVG）');
  if (rep.checks.unlock.islandTitle.indexOf('身体与五官') < 0) rep.errors.push('第 7 岛标题不是「身体与五官」：' + rep.checks.unlock.islandTitle);

  // 7-1 通关后，7-2 应该解锁
  await ev('Game.markCleared(7,1)');
  await ev('Game.openIsland(7)');
  await sleep(400);
  rep.checks.unlockAfter = await ev(`(function(){
    var n2 = document.querySelector('.node[data-level="2"]');
    return { node2Playable: n2.classList.contains('playable'), node2Locked: n2.classList.contains('locked') };
  })()`);
  if (rep.checks.unlockAfter.node2Playable !== true) rep.errors.push('7-1 通关后第 7 岛第 2 关没有解锁：' + JSON.stringify(rep.checks.unlockAfter));

  // ---------- 1) 进关 → 教学 ----------
  await ev('document.querySelector(\'.node[data-level="2"]\').click()');
  await sleep(300);
  await ev('document.getElementById("btnStart").click()');

  const STEPS = [
    { n: 'body',     sig: 'sid:body',     audio: 'g2_t_body',      demo: true, shot: 'tut-body' },
    { n: 'head',     sig: 'sid:head',     audio: 'g2_t_head',      demo: true, shot: 'tut-head' },
    { n: 'askHead',  sig: 'sid:askHead',  audio: 'g2_t_head_ask',  ask: 'head',  wrong: 'hand',  hint: true, shot: 'tut-askHead' },
    { n: 'hand1',    sig: 'sid:hand1',    audio: 'g2_t_hand1',     demo: true, shot: 'tut-hand1' },
    { n: 'hand2',    sig: 'sid:hand2',    audio: 'g2_t_hand2',     demo: true, shot: 'tut-hand2' },
    { n: 'askHand',  sig: 'sid:askHand',  audio: 'g2_t_hand_ask',  ask: 'hand',  wrong: 'foot',  shot: 'tut-askHand' },
    { n: 'foot1',    sig: 'sid:foot1',    audio: 'g2_t_foot1',     demo: true, shot: 'tut-foot1' },
    { n: 'foot2',    sig: 'sid:foot2',    audio: 'g2_t_foot2',     demo: true, shot: 'tut-foot2' },
    { n: 'askFoot',  sig: 'sid:askFoot',  audio: 'g2_t_happy',     touch: 'body', hint: true, shot: 'tut-askFoot' },
    { n: 'tpr',      sig: 'sid:tpr',      audio: 'g2_t_tpr',       mimic: true, shot: 'tut-tpr' }
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
    if (st.n !== 'tpr') row.overflow = await overflow();
    if (st.shot) { await sleep(80); await shot(TAG + '-' + st.shot + '.png'); }

    // 演示步：等「轻点继续」→ 验证不自动前进 → 点屏幕推进
    if (st.demo) {
      row.tapShown = await wait(sel('.f11-tap'), 5000);
      if (!row.tapShown) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示定格后没有出现「轻点继续」');
      await sleep(2100);
      row.autoAdvanced = (await ev('window.__stageLog.length')) > (foundIdx + 1);
      if (row.autoAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示未点按就自动前进了');
      await tap('#askDisplay .g2-stage');
      row.advanced = await wait('window.__stageLog.length > ' + (foundIdx + 1), 6000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    // 互动（拼身体）：点错零件 → 点到身上，不应该推进，且要播 again
    if (st.ask && st.wrong) {
      const before = await ev('window.__stageLog.length');
      const wt = Date.now();
      await tap('#askDisplay .g2-part-btn[data-part="' + st.wrong + '"]');
      await sleep(140);
      await tap('#askDisplay .g2-body[data-drop="body"]');
      await sleep(1000);
      row.wrongPick = {
        advanced: (await ev('window.__stageLog.length')) > before,
        audio: (await keysBetween(wt - 150, wt + 2400)).filter(k => k !== 'unknown')
      };
      if (row.wrongPick.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）放错零件却推进了');
      if (row.wrongPick.audio.indexOf('again') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）放错后没播 again：' + row.wrongPick.audio.join(','));
      await sleep(700);
    }
    // 互动（综合）：点身体本就是对的（只有单一目标），不做错选测试，仅验证点身体能推进
    if (st.touch && st.wrong) {
      const before = await ev('window.__stageLog.length');
      const wt = Date.now();
      await tap('#askDisplay .g2-part-btn[data-part="' + st.wrong + '"]');
      await sleep(1000);
      row.wrongTouch = {
        advanced: (await ev('window.__stageLog.length')) > before,
        audio: (await keysBetween(wt - 150, wt + 2400)).filter(k => k !== 'unknown')
      };
      if (row.wrongTouch.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错却推进了');
      if (row.wrongTouch.audio.indexOf('again') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错后没播 again：' + row.wrongTouch.audio.join(','));
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
          ? `document.querySelector('#askDisplay .g2-body[data-drop="body"]')`
          : `document.querySelector('#askDisplay .g2-body[data-drop="body"]')`};
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

    // 互动正确作答：拼身体（把零件拖到身上）/ 综合（点身体）
    if (st.ask) {
      const before = await ev('window.__stageLog.length');
      const bodyR = await rectOf('#askDisplay .g2-body[data-drop="body"]');
      if (!bodyR) {
        rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）找不到身体');
      } else {
        await dragTo('#askDisplay .g2-part-btn[data-part="' + st.ask + '"]', bodyR.cx, bodyR.cy);
      }
      await sleep(1500);
      row.advanced = await wait('window.__stageLog.length > ' + before, 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）放对零件后没有推进');
    }
    if (st.touch) {
      const before = await ev('window.__stageLog.length');
      await tap('#askDisplay .g2-body[data-drop="body"]');
      await sleep(1400);
      row.advanced = await wait('window.__stageLog.length > ' + before, 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点身体后没有推进');
    }
    // TPR 模仿：演示拍手 + 👍（先 off 后点亮）→ 点亮后点 👍 过关
    if (st.mimic) {
      // 注：探针 stub 的 Audio 约 70ms 即“结束”，off 几乎瞬时移除，无法在 stub 下稳定断言“演示期 off”；
      // 该行为由代码保证（thumb 初始带 off、仅演示语音播完后点亮，off 期间 pointer-events:none 不可点），此处仅校验点亮与推进。
      row.thumbOn = await wait(sel('.g2-thumb:not(.off)'), 7000);
      if (row.thumbOn !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示后 👍 没有点亮');
      const before = await ev('window.__stageLog.length');
      const ct = Date.now();
      await tap('#askDisplay .g2-thumb:not(.off)');
      await sleep(1600);
      row.mimicGreat = (await keysBetween(ct - 200, ct + 2400)).filter(k => k !== 'unknown');
      if (row.mimicGreat.indexOf('g2_t_great') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点 👍 后没播 g2_t_great：' + row.mimicGreat.join(','));
      row.advanced = await wait('window.__stageLog.length > ' + before + ' || Game.phase === "asking"', 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点 👍 后没有进入答题');
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
  const wrongTested = { G2A: false, G2B: false, G2C: false };

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(200);
    let snap = await ev('Game.snapshot()');
    let q = snap.question;
    if (!q) { rep.errors.push('第 ' + r + ' 轮：答题阶段未开始（question 为空，phase=' + snap.phase + '）'); break; }
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, correct: q.correct, opts: q.options, audio: q.audio, part: q.part };

    if (q.type === 'G2A') {
      row.bodies = await ev('document.querySelectorAll("#askDisplay .g2-body").length');
      row.optsN = await ev('document.querySelectorAll("#options .option[data-drag]").length');
      row.audioOk = q.audio === A_KEY[q.part];
      row.ansOk = q.options[q.correct] === ('i:' + q.part);
      row.optsSafe = q.options.indexOf('i:' + q.part) >= 0;
      if (row.bodies !== 1) rep.errors.push('第 ' + r + ' 轮 G2A 身体不是 1 个：' + row.bodies);
      if (row.optsN !== 3) rep.errors.push('第 ' + r + ' 轮 G2A 可拖零件不是 3 个：' + row.optsN);
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 G2A 语音与缺失部位不符：' + q.audio + ' want=' + A_KEY[q.part]);
      if (!row.ansOk) rep.errors.push('第 ' + r + ' 轮 G2A 正确项不是该部位：' + q.options[q.correct]);
    }
    if (q.type === 'G2B') {
      row.thumb = await ev('document.querySelectorAll("#askDisplay .g2-thumb").length');
      row.actor = await ev('document.querySelectorAll("#askDisplay .g2-actor").length');
      row.audioOk = q.audio === B_KEY[q.act];
      row.ansOk = q.correct === 0;
      if (row.thumb !== 1) rep.errors.push('第 ' + r + ' 轮 G2B 👍 按钮不是 1 个：' + row.thumb);
      if (row.actor !== 1) rep.errors.push('第 ' + r + ' 轮 G2B 演示小人不是 1 个：' + row.actor);
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 G2B 语音与动作不符：' + q.audio + ' want=' + B_KEY[q.act]);
      if (!row.ansOk) rep.errors.push('第 ' + r + ' 轮 G2B 正确项不是 0：' + q.correct);
    }
    if (q.type === 'G2C') {
      row.minis = await ev('document.querySelectorAll("#askDisplay .g2-mini").length');
      row.audioOk = q.audio === C_KEY[q.part];
      row.ansOk = q.options[q.correct] === ('s:' + q.part);
      row.hlOk = await ev(`(function(){
        var c = document.querySelector('#askDisplay .g2-mini[data-hl="${q.part}"]');
        if (!c) return false;
        return !!c.querySelector('.g2-hl');
      })()`);
      if (row.minis !== 3) rep.errors.push('第 ' + r + ' 轮 G2C 小人不是 3 个：' + row.minis);
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 G2C 语音与目标部位不符：' + q.audio + ' want=' + C_KEY[q.part]);
      if (!row.ansOk) rep.errors.push('第 ' + r + ' 轮 G2C 正确项不是目标部位：' + q.options[q.correct]);
      if (!row.hlOk) rep.errors.push('第 ' + r + ' 轮 G2C 正确小人里没有对应的高亮部位：' + q.part);
    }

    if (!seenShot[q.type]) {
      seenShot[q.type] = 1;
      await sleep(300);
      row.overflow = await overflow();
      row.geom = await ev(`(function(){
        var m = document.querySelector('#askDisplay .g2-mini');
        var th = document.querySelector('#askDisplay .g2-thumb');
        var f = document.querySelector('#askDisplay .g2-body');
        function r(n){ if(!n) return null; var x=n.getBoundingClientRect(); return [Math.round(x.left),Math.round(x.right),Math.round(x.width)]; }
        return { mini: r(m), thumb: r(th), body: r(f), iw: window.innerWidth };
      })()`);
      await shot(TAG + '-q-' + q.type + '.png');
    }

    // 每种题型第一轮做一次「答错不推进」测试（G2B 永远判对，跳过）
    if (!wrongTested[q.type]) {
      wrongTested[q.type] = true;
      let did = false;
      if (q.type === 'G2A') {
        const wrongIdx = (q.correct + 1) % 3;
        const bodyR = await rectOf('#askDisplay .g2-body[data-drop="body"]');
        if (bodyR) {
          did = await dragTo('#options .option[data-idx="' + wrongIdx + '"]', bodyR.cx, bodyR.cy);
        }
      } else if (q.type === 'G2C') {
        const wrongIdx = (q.correct + 1) % 3;
        did = await tap('#askDisplay .g2-mini[data-idx="' + wrongIdx + '"]');
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

    if (q.type === 'G2A') {
      const idx = q.options.indexOf('i:' + q.part);
      const bodyR = await rectOf('#askDisplay .g2-body[data-drop="body"]');
      await tap('#options .option[data-idx="' + idx + '"]');
      await sleep(150);
      await dragTo('#options .option[data-idx="' + idx + '"]', bodyR.cx, bodyR.cy);
    } else if (q.type === 'G2B') {
      await tap('#askDisplay .g2-thumb:not(.off)');
    } else {
      await tap('#askDisplay .g2-mini[data-idx="' + q.correct + '"]');
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
    cleared: await ev('!!Game.progress.cleared["7-2"]'),
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
             node2Done: n2.classList.contains('done'),
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
    Object.keys(seenType).length === 3 && seenType.G2A === 4 && seenType.G2B === 4 && seenType.G2C === 4 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === false && rep.checks.done.cleared === true &&
    rep.checks.done.unlockedLevel === 3 &&
    rep.checks.islandAfter.node2Done === true &&
    rep.checks.islandAfter.unlockedLevel === 3 &&
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
