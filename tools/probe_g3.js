// 第 7 岛第 3 关（L7-W3，复合指令 First... Then...）专项测试
//   1) 解锁链：第 1–6 岛全通 + 7-1 + 7-2 通关 → 7-3 才可玩（§交付要求）
//   2) 教学 10 环节（唤醒 + 3 组「2 演示 + 1 互动」+ 过渡）：演示语音播完定格，必须点屏幕才推进（RULES §三.14）；
//      互动 4 秒无反应出小手指（§二.12）且指向大按钮；点按钮永远判对（§三.12）并播 g2_t_great
//   3) 三题型：A 听指令做两步动作（机器人演示 + 大按钮，永远判对）/
//      B 听指令按顺序拖拽（3 个动作图标按序拖进「先 / 再」框，第一步落位口播 then 分句）/
//      C 听长句找错误（滑稽小人两画面按序排，✅/❌ 判断，画面与语音顺序 50/50 混合）
//   4) 12 轮（4/4/4）：答对无人声、答错不推进、拼错不给过、通关奖励
//   5) 视觉：无英文字母（innerText + aria-label）、双视口无溢出（含纵向）、可点目标够大
// 带 LILEARN_URL 则直接跑线上（发布后回归用）。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'g3';
const PORT = 9775 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));

// 复合指令语音 key（教学 3 句与答题 A/B 共用，RULES §1.12 同句同 key）
const AB_KEY = {
  'ears+clap': 'g3_cmd_ears_clap', 'head+stomp': 'g3_cmd_head_stomp',
  'nose+jump': 'g3_cmd_nose_jump', 'eyes+clap': 'g3_cmd_eyes_clap',
  'nose+clap': 'g3_cmd_nose_clap', 'eyes+jump': 'g3_t_cmd3'
};
const THEN_KEY = { clap: 'g3_then_clap', stomp: 'g3_then_stomp', jump: 'g3_then_jump' };
const C_KEY = (a1, a2) => 'g3_c_' + a1 + '_' + a2;

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-g3-' + Date.now()),
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
        var s = document.querySelector('.g3-stage');
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
      '.g3-robot-wrap, .g3-btn, .g3-slot, .g3-panel, .g3-arrow, .option'), function(n){
      var host = n.closest('#viewAsk, #viewDone, #viewStart');
      if (host && host.hidden) return;   // 视图已切走：隐藏容器里的旧节点不计越界
      var b = n.getBoundingClientRect();
      if (!b.width) {
        if (n.classList.contains('option')) { if (optShown && !n.hidden) zero.push('option:0'); }
        else zero.push((n.className || '?') + ':0');
        return;
      }
      var isClick = n.classList.contains('g3-robot-wrap') || n.classList.contains('g3-btn') ||
                    n.classList.contains('g3-slot') || n.classList.contains('g3-panel');
      var overH = b.right > window.innerWidth + 1 || b.left < -1;
      var overV = isClick && (b.bottom > window.innerHeight + 1 || b.top < -1);
      if (overH || overV) cut.push(n.className + ':' + Math.round(b.left) + ',' + Math.round(b.top) +
        '..' + Math.round(b.right) + ',' + Math.round(b.bottom));
    });
    return { sw: de.scrollWidth, iw: window.innerWidth, sh: de.scrollHeight, ih: window.innerHeight,
             cut: cut.slice(0, 6), zero: zero.slice(0, 6) };
  })()`);

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };

  // ---------- 0) 解锁链：1–6 岛全通 → 7-1 可玩；7-2 必须等 7-1；7-3 必须等 7-2 ----------
  await ev('Game.resetProgress()');
  await ev('for (var isl = 1; isl <= 6; isl++) { for (var lv = 1; lv <= 5; lv++) Game.markCleared(isl, lv); }');
  await ev('Game.openIsland(7)');
  await sleep(400);
  rep.checks.unlock = await ev(`(function(){
    var n1 = document.querySelector('.node[data-level="1"]');
    var n2 = document.querySelector('.node[data-level="2"]');
    var n3 = document.querySelector('.node[data-level="3"]');
    return { node1Playable: n1.classList.contains('playable'),
             node2Playable: n2.classList.contains('playable'),
             node3Playable: n3.classList.contains('playable'),
             node3Locked: n3.classList.contains('locked'),
             islandTitle: (document.querySelector('.island-head .t1') || {}).textContent || '',
             hasIcon: !!document.querySelector('.big-icon svg, .big-icon img') };
  })()`);
  await shot(TAG + '-island.png');
  if (rep.checks.unlock.node1Playable !== true) rep.errors.push('第 7 岛第 1 关没有亮起');
  if (rep.checks.unlock.node2Playable === true) rep.errors.push('7-1 未通关 7-2 却显示可玩');
  if (rep.checks.unlock.node3Playable === true) rep.errors.push('7-2 未通关 7-3 却显示可玩（7-3 应锁住直到 7-2 通关）');
  if (rep.checks.unlock.hasIcon !== true) rep.errors.push('第 7 岛岛屿图标缺失（要求手写 SVG）');
  if (rep.checks.unlock.islandTitle.indexOf('身体与五官') < 0) rep.errors.push('第 7 岛标题不是「身体与五官」：' + rep.checks.unlock.islandTitle);

  await ev('Game.markCleared(7,1)');
  await ev('Game.openIsland(7)');
  await sleep(400);
  rep.checks.unlockAfter1 = await ev(`(function(){
    var n2 = document.querySelector('.node[data-level="2"]');
    var n3 = document.querySelector('.node[data-level="3"]');
    return { node2Playable: n2.classList.contains('playable'), node3Playable: n3.classList.contains('playable') };
  })()`);
  if (rep.checks.unlockAfter1.node2Playable !== true) rep.errors.push('7-1 通关后第 7 岛第 2 关没有解锁');
  if (rep.checks.unlockAfter1.node3Playable === true) rep.errors.push('7-2 未通关 7-3 却显示可玩');

  await ev('Game.markCleared(7,2)');
  await ev('Game.openIsland(7)');
  await sleep(400);
  rep.checks.unlockAfter2 = await ev(`(function(){
    var n3 = document.querySelector('.node[data-level="3"]');
    return { node3Playable: n3.classList.contains('playable'), node3Locked: n3.classList.contains('locked') };
  })()`);
  if (rep.checks.unlockAfter2.node3Playable !== true) rep.errors.push('7-2 通关后第 7 岛第 3 关没有解锁');

  // ---------- 1) 进关 → 教学 ----------
  await ev('document.querySelector(\'.node[data-level="3"]\').click()');
  await sleep(300);
  await ev('document.getElementById("btnStart").click()');

  const STEPS = [
    { n: 'wake', sig: 'sid:wake', audio: 'g3_t_robot', demo: true, shot: 'tut-wake',
      zzz: true },
    { n: 'd1a',  sig: 'sid:d1a',  audio: 'g3_t_cmd1',  demo: true, shot: 'tut-d1a',
      doms: ['.g3-robot-svg.g3-run', '.g3-robot-svg .g3-arms-touch-r', '.g3-robot-svg .g3-arms-clap'] },
    { n: 'a1',   sig: 'sid:a1',   audio: 'g3_t_cmd1',  ask: 'btn', youdo: 'g3_t_youdo', hint: true, shot: 'tut-a1',
      doms: ['.g3-robot-svg.g3-run', '.g3-btn'] },
    { n: 'd2a',  sig: 'sid:d2a',  audio: 'g3_t_cmd2',  demo: true, shot: 'tut-d2a',
      doms: ['.g3-robot-svg.g3-run', '.g3-robot-svg .g3-legs-stomp'] },
    { n: 'd2b',  sig: 'sid:d2b',  audio: 'g3_t_cmd2',  demo: true, shot: 'tut-d2b',
      doms: ['.g3-robot-svg.g3-run', '.g3-robot-svg.g3-st-seq', '.g3-robot-svg .g3-glow-a1'] },
    { n: 'a2',   sig: 'sid:a2',   audio: 'g3_t_cmd2',  ask: 'btn', youdo: 'g3_t_youdo', hint: true, shot: 'tut-a2',
      doms: ['.g3-robot-svg.g3-run', '.g3-btn'] },
    { n: 'd3a',  sig: 'sid:d3a',  audio: 'g3_t_cmd3',  demo: true, shot: 'tut-d3a',
      doms: ['.g3-robot-svg.g3-run', '.g3-robot-svg.g3-has-jump'] },
    { n: 'd3b',  sig: 'sid:d3b',  audio: 'g3_t_cmd3',  demo: true, shot: 'tut-d3b',
      doms: ['.g3-robot-svg.g3-run', '.g3-robot-svg.g3-has-jump', '.g3-robot-svg.g3-st-seq'] },
    { n: 'a3',   sig: 'sid:a3',   audio: 'g3_t_cmd3',  ask: 'btn', youdo: 'g3_t_youdo', hint: true, shot: 'tut-a3',
      doms: ['.g3-robot-svg.g3-run', '.g3-btn'] },
    // 注：out 步语音播完即 tutFinish 进答题（stub 下 ~70ms），开心机器人瞬间被答题画面替换，
    // 不做 DOM 检查；该步由 audioOk + ended 验证。
    { n: 'out',  sig: 'sid:out',  audio: 'g3_t_out',   out: true, shot: 'tut-out' }
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
      if (st.zzz) {
        row.zzzOk = await ev(sel('#askDisplay .g3-zzz'));
        if (row.zzzOk !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）机器人没有睡痕（Zzz 折线缺失）');
      }
      if (st.doms && st.doms.length) {
        const bad = [];
        for (const s of st.doms) { if (!(await ev(sel('#askDisplay ' + s)))) bad.push(s); }
        if (bad.length) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）机器人/按钮缺少：' + bad.join(','));
      }
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
      await tap('#askDisplay .g3-stage');
      row.advanced = await wait('window.__stageLog.length > ' + (foundIdx + 1), 6000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    // 互动步：等大按钮点亮（演示语音播完后才可点）→ 4 秒小手指指向按钮 → 点按钮 → great → 推进
    if (st.ask === 'btn') {
      row.btnOn = await wait(sel('#askDisplay .g3-btn:not(.off)'), 7000);
      if (row.btnOn !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示后大按钮没有点亮');
      row.btnBig = await ev(`(function(){
        var b = document.querySelector('#askDisplay .g3-btn');
        if (!b) return 0;
        return Math.round(b.getBoundingClientRect().width / window.innerWidth * 100);
      })()`);
      row.btnBigPx = await ev(`(function(){
        var b = document.querySelector('#askDisplay .g3-btn');
        if (!b) return 0;
        return Math.round(b.getBoundingClientRect().width);
      })()`);
      // §三.12 要求按钮唯一、够大（竖屏基准 ≥44vw）；横屏 844px 宽下 44vw=371px 放不进 390px 高的屏幕，
      // 故横屏按「绝对像素 ≥110px」（ toddler 大靶子）断言，竖屏仍按 44vw 严格执行。
      var btnOkSize = (H >= W) ? (row.btnBig >= 44) : (row.btnBigPx >= 110);
      if (!btnOkSize) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）大按钮不够大（' + row.btnBig + 'vw / ' + row.btnBigPx + 'px，§三.12）');
      if (st.hint) {
        row.hintEarly = await ev(sel('.tut-hint'));
        row.hintLater = await wait(sel('.tut-hint'), 7000);
        if (row.hintEarly === true || row.hintLater !== true) {
          rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手指异常：early=' + row.hintEarly + ' later=' + row.hintLater);
        }
        row.hintGeom = await ev(`(function(){
          var h = document.querySelector('.tut-hint');
          var tgt = document.querySelector('#askDisplay .g3-btn');
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
      }
      const before = await ev('window.__stageLog.length');
      const ct = Date.now();
      await tap('#askDisplay .g3-btn:not(.off)');
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
    console.log('STEP ' + (i + 1) + ' ' + JSON.stringify(row).slice(0, 400));
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
  const wrongTested = { G3A: false, G3B: false, G3C: false };
  const bTapTested = { done: false };
  const cSeen = { right: 0, wrong: 0 };

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(200);
    let snap = await ev('Game.snapshot()');
    let q = snap.question;
    if (!q) { rep.errors.push('第 ' + r + ' 轮：答题阶段未开始（question 为空，phase=' + snap.phase + '）'); break; }
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, correct: q.correct, opts: q.options, audio: q.audio, a1: q.g3a1, a2: q.g3a2 };

    if (q.type === 'G3A') {
      row.bots = await ev('document.querySelectorAll("#askDisplay .g3-robot-wrap").length');
      row.btns = await ev('document.querySelectorAll("#askDisplay .g3-btn").length');
      row.optsN = await ev('document.querySelectorAll("#options .option[data-drag]").length');
      row.run = await ev('!!document.querySelector("#askDisplay .g3-robot-svg.g3-run")');
      row.audioOk = q.audio === AB_KEY[q.g3a1 + '+' + q.g3a2];
      row.ansOk = q.correct === 0;
      if (row.bots !== 1) rep.errors.push('第 ' + r + ' 轮 G3A 机器人不是 1 个：' + row.bots);
      if (row.btns !== 1) rep.errors.push('第 ' + r + ' 轮 G3A 大按钮不是 1 个：' + row.btns);
      if (row.optsN !== 0) rep.errors.push('第 ' + r + ' 轮 G3A 不该有可拖选项：' + row.optsN);
      if (!row.run) rep.errors.push('第 ' + r + ' 轮 G3A 机器人没有进入动作循环（.g3-run 缺失）');
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 G3A 语音与指令不符：' + q.audio);
      if (!row.ansOk) rep.errors.push('第 ' + r + ' 轮 G3A 正确项不是 0：' + q.correct);
    }
    if (q.type === 'G3B') {
      row.slots = await ev('document.querySelectorAll("#askDisplay .g3-slot").length');
      row.optsN = await ev('document.querySelectorAll("#options .option[data-drag]").length');
      row.badges = await ev(`(function(){
        var b = document.querySelectorAll('#askDisplay .g3-slot .g3-slot-badge');
        return Array.prototype.map.call(b, function(n){ return n.textContent; }).join(',');
      })()`);
      row.audioOk = q.audio === AB_KEY[q.g3a1 + '+' + q.g3a2];
      row.stepsOk = q.g3steps && q.g3steps.length === 2 && q.g3steps[0].slot === 'step1' && q.g3steps[1].slot === 'step2';
      row.stepAudioOk = q.stepAudios && q.stepAudios[1] === THEN_KEY[q.g3a2];
      row.actsOk = q.options.length === 3 && q.options.indexOf('i:' + q.g3a1) >= 0 && q.options.indexOf('i:' + q.g3a2) >= 0;
      if (row.slots !== 2) rep.errors.push('第 ' + r + ' 轮 G3B 框不是 2 个：' + row.slots);
      if (row.optsN !== 3) rep.errors.push('第 ' + r + ' 轮 G3B 可拖图标不是 3 个：' + row.optsN);
      if (row.badges !== '先,再') rep.errors.push('第 ' + r + ' 轮 G3B 框上徽标不是「先,再」：' + row.badges);
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 G3B 语音与指令不符：' + q.audio);
      if (!row.stepsOk) rep.errors.push('第 ' + r + ' 轮 G3B 两步步骤不符：' + JSON.stringify(q.g3steps));
      if (!row.stepAudioOk) rep.errors.push('第 ' + r + ' 轮 G3B 第二步语音不符：' + JSON.stringify(q.stepAudios));
      if (!row.actsOk) rep.errors.push('第 ' + r + ' 轮 G3B 选项里没有两个正确动作：' + q.options.join(','));
    }
    if (q.type === 'G3C') {
      row.panels = await ev('document.querySelectorAll("#askDisplay .g3-panel").length');
      row.panelActs = await ev(`(function(){
        var p = document.querySelectorAll('#askDisplay .g3-panel');
        return Array.prototype.map.call(p, function(n){ return n.dataset.act; }).join(',');
      })()`);
      row.panelBadges = await ev(`(function(){
        var b = document.querySelectorAll('#askDisplay .g3-panel .g3-slot-badge');
        return Array.prototype.map.call(b, function(n){ return n.textContent; }).join(',');
      })()`);
      row.arrows = await ev('document.querySelectorAll("#askDisplay .g3-arrow").length');
      row.ynN = await ev('document.querySelectorAll("#options .option.yn-opt:not([hidden])").length');
      row.audioOk = q.audios && q.audios[0] === C_KEY(q.g3a1, q.g3a2) && q.audios[1] === 'g3_c_ask';
      row.orderOk = q.g3pic && q.g3pic.length === 2 && q.g3pic[0] === row.panelActs.split(',')[0] && q.g3pic[1] === row.panelActs.split(',')[1];
      row.rightOk = (q.g3right === (q.g3pic[0] === q.g3a1));
      if (row.panels !== 2) rep.errors.push('第 ' + r + ' 轮 G3C 画面不是 2 个：' + row.panels);
      if (row.panelBadges !== '先,再') rep.errors.push('第 ' + r + ' 轮 G3C 画面徽标不是「先,再」：' + row.panelBadges);
      if (row.arrows !== 1) rep.errors.push('第 ' + r + ' 轮 G3C 顺序箭头不是 1 个：' + row.arrows);
      if (row.ynN !== 2) rep.errors.push('第 ' + r + ' 轮 G3C 对错按钮不是 2 个：' + row.ynN);
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 G3C 语音不符：' + (q.audios || []).join(','));
      if (!row.orderOk) rep.errors.push('第 ' + r + ' 轮 G3C 画面顺序与题目不符：' + row.panelActs + ' vs ' + JSON.stringify(q.g3pic));
      if (!row.rightOk) rep.errors.push('第 ' + r + ' 轮 G3C 对错判定与顺序不符：right=' + q.g3right + ' pic=' + JSON.stringify(q.g3pic));
      if (q.g3right) cSeen.right++; else cSeen.wrong++;
    }

    if (!seenShot[q.type]) {
      seenShot[q.type] = 1;
      await sleep(300);
      row.overflow = await overflow();
      await shot(TAG + '-q-' + q.type + '.png');
    }

    // 每种题型第一轮做一次「答错不推进」测试（G3A 永远判对，跳过）
    if (!wrongTested[q.type]) {
      wrongTested[q.type] = true;
      let did = false;
      if (q.type === 'G3B') {
        // 拖干扰图标进 step1：动作不对 → 不推进 + again
        const wrongAct = q.options.filter(function (o) { return o !== 'i:' + q.g3a1 && o !== 'i:' + q.g3a2; })[0];
        const wrongIdx = q.options.indexOf(wrongAct);
        const slotR = await rectOf('#askDisplay .g3-slot[data-drop="step1"]');
        if (slotR && wrongIdx >= 0) did = await dragTo('#options .option[data-idx="' + wrongIdx + '"]', slotR.cx, slotR.cy);
      } else if (q.type === 'G3C') {
        const wrongIdx = (q.correct + 1) % 2;
        did = await tap('#options .option[data-idx="' + wrongIdx + '"]');
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

    if (q.type === 'G3A') {
      await tap('#askDisplay .g3-btn');
    } else if (q.type === 'G3B') {
      // 第一个 G3B 轮用「点图标 → 点框」的等价路径（§二.11），其余用拖拽
      const useTap = !bTapTested.done;
      bTapTested.done = true;
      for (let s = 0; s < 2; s++) {
        const step = q.g3steps[s];
        const idx = q.options.indexOf('i:' + step.act);
        const slotR = await rectOf('#askDisplay .g3-slot[data-drop="' + step.slot + '"]');
        if (!slotR || idx < 0) { rep.errors.push('第 ' + r + ' 轮 G3B 第 ' + (s + 1) + ' 步找不到图标或框'); break; }
        if (useTap) {
          await tap('#options .option[data-idx="' + idx + '"]');
          await sleep(160);
          await tap('#askDisplay .g3-slot[data-drop="' + step.slot + '"]');
        } else {
          await dragTo('#options .option[data-idx="' + idx + '"]', slotR.cx, slotR.cy);
        }
        if (s === 0) {
          await sleep(1000);
          const mid = await ev('Game.snapshot()');
          row.step1Done = mid.question ? mid.question.stepsDone : null;
          row.step1Audio = (await keysBetween(ct, Date.now())).filter(k => k !== 'unknown');
          if (row.step1Done !== 1) rep.errors.push('第 ' + r + ' 轮 G3B 第一步落位后 stepsDone 不是 1：' + row.step1Done);
          if (row.step1Audio.indexOf(THEN_KEY[q.g3a2]) < 0) {
            rep.errors.push('第 ' + r + ' 轮 G3B 第一步落位后没口播第二步：' + row.step1Audio.join(','));
          }
        } else {
          // 第二步落位后 430ms 内就会推进：轮询抓 stepsDone===2，抓不到就以「已推进」为证
          row.step2Done = null;
          for (let k = 0; k < 12; k++) {
            const mid = await ev('Game.snapshot()');
            if (mid.question && mid.question.stepsDone === 2) { row.step2Done = 2; break; }
            if (mid.round !== r || mid.phase === 'done') { row.step2Done = 2; break; }
            await sleep(110);
          }
          if (row.step2Done !== 2) rep.errors.push('第 ' + r + ' 轮 G3B 第二步落位后没有两步完成：' + row.step2Done);
        }
      }
    } else {
      await tap('#options .option[data-idx="' + q.correct + '"]');
    }

    await sleep(250);
    // 注意：G3B 第一步落位后会口播第二步指令（题干的一部分，不是答题反馈）——
    // 按第 6 岛第 4 关先例（probe_f14），第二步口播不计入「答对禁人声」（RULES §1.6）。
    row.voiceOnCorrect = (await keysBetween(ct, ct + 430)).filter(function (k) {
      return k !== 'unknown' && !(q.type === 'G3B' && k === THEN_KEY[q.g3a2]);
    });
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
    cleared: await ev('!!Game.progress.cleared["7-3"]'),
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
  rep.checks.cMix = cSeen;

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
    var n3 = document.querySelector('.node[data-level="3"]');
    var snap = Game.snapshot();
    return { node3Playable: n3.classList.contains('playable'),
             node3Done: n3.classList.contains('done'),
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
  const advanceOk = rep.tutorial.filter(s => s.advanced !== undefined).every(s => s.advanced === true);
  const demoOk = rep.tutorial.filter(s => s.demo).every(s => s.tapShown === true && s.autoAdvanced === false && s.advanced === true);
  const btnOk = rep.tutorial.filter(s => s.ask === 'btn').every(s => s.btnOn === true &&
    ((H >= W) ? s.btnBig >= 44 : s.btnBigPx >= 110) && s.great.indexOf('g2_t_great') >= 0);
  const outOk = rep.tutorial.filter(s => s.out).every(s => s.ended === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1 && s.voiceOnCorrect.length === 0);
  const bStepsOk = rep.rounds.filter(s => s.type === 'G3B').every(s => s.step1Done === 1 && s.step2Done === 2);
  const ok = rep.errors.length === 0 && sigOk && audioOk && hintOk && advanceOk && demoOk && btnOk && outOk &&
    roundsOk && bStepsOk && noOverflow &&
    rep.rounds.length === 12 &&
    Object.keys(seenType).length === 3 && seenType.G3A === 4 && seenType.G3B === 4 && seenType.G3C === 4 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === false && rep.checks.done.cleared === true &&
    rep.checks.done.unlockedLevel === 4 &&
    rep.checks.islandAfter.node3Done === true &&
    rep.checks.islandAfter.unlockedLevel === 4 &&
    rep.checks.mapAfter.island7Unlocked === true && rep.checks.mapAfter.island7Cleared === false &&
    rep.checks.mapAfter.hasIcon === true &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0 &&
    rep.checks.englishIsland.length === 0 &&
    rep.checks.outro.ended === true &&
    rep.checks.overflowIsland.sw <= rep.checks.overflowIsland.iw + 1;
  console.log('\nPROBE_' + (ok ? 'PASS' : 'FAIL') + ' sigOk=' + sigOk + ' audioOk=' + audioOk + ' hintOk=' + hintOk +
    ' advanceOk=' + advanceOk + ' demoOk=' + demoOk + ' btnOk=' + btnOk + ' outOk=' + outOk +
    ' roundsOk=' + roundsOk + ' bStepsOk=' + bStepsOk + ' noOverflow=' + noOverflow +
    ' steps=' + rep.checks.outro.totalSteps + ' types=' + JSON.stringify(seenType) +
    ' cMix=' + JSON.stringify(cSeen) + ' stars=' + rep.checks.done.stars + ' cleared=' + rep.checks.done.cleared);
  finish(ok ? 0 : 1);
})().catch(e => { console.error('PROBE_ERROR', e); finish(2); });
