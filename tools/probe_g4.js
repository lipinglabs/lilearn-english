// 第 7 岛第 4 关（L7-W4，快速反应群像找茬 I Spy）专项测试
//   1) 解锁链：第 1–6 岛全通 + 7-1 + 7-2 + 7-3 通关 → 7-4 才可玩（§交付要求）
//   2) 教学 13 环节（3 知识点 × 2 演示 + 2 互动 + 过渡）：演示语音播完定格，必须点屏幕才推进（RULES §三.14）；
//      演示步高亮目标小人；互动 4 秒无反应出小手指（§二.12）且指向目标；点错不推进且播 again
//   3) 三题型：A 单目标群像找茬（4–5 人，唯一匹配性别+动作）/
//      B 双目标复合找茬（5 人，先点第一个再点第二个，第一步落位口播 then 分句）/
//      C 动作纠错（3 人：名词性别的人做错动作=陷阱，另一个性别的人做对动作=答案）
//   4) 12 轮（4/4/4）：答对无人声、答错不推进、通关奖励
//   5) 视觉：无英文字母（innerText + aria-label）、双视口无溢出、热区比视觉大一圈
// 带 LILEARN_URL 则直接跑线上（发布后回归用）。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'g4';
const PORT = 9779 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));

// (性别+动作) → 题干语音 key（教学两句同时是 A/C 题干，RULES §1.12 同句同 key）
const SENT = {
  'boy+ear': 'g4_t_ear', 'girl+clap': 'g4_t_clap',
  'boy+stomp': 'g4_a_boy_stomp', 'girl+jump': 'g4_a_girl_jump',
  'boy+nose': 'g4_a_boy_nose', 'girl+eyes': 'g4_a_girl_eyes',
  'boy+head': 'g4_a_boy_head', 'girl+ear': 'g4_a_girl_ear'
};

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-g4-' + Date.now()),
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
        var s = document.querySelector('.g4-stage');
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
    for (let i = 0; i < 1400; i++) {   // 线上 25MB voice.js 冷加载可能很慢，给足 210s
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
  const kidCount = () => ev('document.querySelectorAll("#askDisplay .g4-kid").length');
  const overflow = () => ev(`(function(){
    var de = document.documentElement;
    var cut = [], zero = [], hot = [];
    Array.prototype.forEach.call(document.querySelectorAll('.g4-kid'), function(n){
      var host = n.closest('#viewAsk, #viewDone, #viewStart');
      if (host && host.hidden) return;   // 视图已切走：隐藏容器里的旧节点不计越界
      var b = n.getBoundingClientRect();
      if (!b.width) { zero.push('g4-kid:0'); return; }
      var overH = b.right > window.innerWidth + 1 || b.left < -1;
      var overV = b.bottom > window.innerHeight + 1 || b.top < -1;
      if (overH || overV) cut.push('g4-kid:' + Math.round(b.left) + ',' + Math.round(b.top) +
        '..' + Math.round(b.right) + ',' + Math.round(b.bottom));
      // 热区比视觉大一圈（§三.15）：按钮矩形必须明显大于内部 SVG
      var svg = n.querySelector('svg');
      if (svg) {
        var sb = svg.getBoundingClientRect();
        if (b.width < sb.width + 4 || b.height < sb.height + 4) hot.push('hot:' + Math.round(b.width) + '<' + Math.round(sb.width));
      }
    });
    return { sw: de.scrollWidth, iw: window.innerWidth, sh: de.scrollHeight, ih: window.innerHeight,
             cut: cut.slice(0, 6), zero: zero.slice(0, 6), hot: hot.slice(0, 6) };
  })()`);

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };

  // ---------- 0) 解锁链：1–6 岛全通 → 7-1；7-1 通关 → 7-2；7-2 通关 → 7-3；7-3 通关 → 7-4 ----------
  await ev('Game.resetProgress()');
  await ev('for (var isl = 1; isl <= 6; isl++) { for (var lv = 1; lv <= 5; lv++) Game.markCleared(isl, lv); }');
  await ev('Game.openIsland(7)');
  await sleep(400);
  rep.checks.unlock = await ev(`(function(){
    var n1 = document.querySelector('.node[data-level="1"]');
    var n2 = document.querySelector('.node[data-level="2"]');
    var n4 = document.querySelector('.node[data-level="4"]');
    return { node1Playable: n1.classList.contains('playable'),
             node2Playable: n2.classList.contains('playable'),
             node4Playable: n4.classList.contains('playable'),
             node4Locked: n4.classList.contains('locked'),
             islandTitle: (document.querySelector('.island-head .t1') || {}).textContent || '',
             hasIcon: !!document.querySelector('.big-icon svg, .big-icon img') };
  })()`);
  await shot(TAG + '-island.png');
  if (rep.checks.unlock.node1Playable !== true) rep.errors.push('第 7 岛第 1 关没有亮起');
  if (rep.checks.unlock.node2Playable === true) rep.errors.push('7-1 未通关 7-2 却显示可玩');
  if (rep.checks.unlock.node4Playable === true) rep.errors.push('7-3 未通关 7-4 却显示可玩（7-4 应锁住直到 7-3 通关）');
  if (rep.checks.unlock.hasIcon !== true) rep.errors.push('第 7 岛岛屿图标缺失（要求手写 SVG）');
  if (rep.checks.unlock.islandTitle.indexOf('身体与五官') < 0) rep.errors.push('第 7 岛标题不是「身体与五官」：' + rep.checks.unlock.islandTitle);

  await ev('Game.markCleared(7,1)');
  await ev('Game.openIsland(7)');
  await sleep(350);
  rep.checks.unlock1 = await ev(`(function(){
    var n2 = document.querySelector('.node[data-level="2"]');
    return { node2Playable: n2.classList.contains('playable') };
  })()`);
  if (rep.checks.unlock1.node2Playable !== true) rep.errors.push('7-1 通关后第 7 岛第 2 关没有解锁');

  await ev('Game.markCleared(7,2)');
  await ev('Game.openIsland(7)');
  await sleep(350);
  rep.checks.unlock2 = await ev(`(function(){
    var n3 = document.querySelector('.node[data-level="3"]');
    var n4 = document.querySelector('.node[data-level="4"]');
    return { node3Playable: n3.classList.contains('playable'),
             node4Playable: n4.classList.contains('playable') };
  })()`);
  if (rep.checks.unlock2.node3Playable !== true) rep.errors.push('7-2 通关后第 7 岛第 3 关没有解锁');
  if (rep.checks.unlock2.node4Playable === true) rep.errors.push('7-3 未通关 7-4 却显示可玩');

  await ev('Game.markCleared(7,3)');
  await ev('Game.openIsland(7)');
  await sleep(400);
  rep.checks.unlockAfter = await ev(`(function(){
    var n4 = document.querySelector('.node[data-level="4"]');
    return { node4Playable: n4.classList.contains('playable'), node4Locked: n4.classList.contains('locked') };
  })()`);
  if (rep.checks.unlockAfter.node4Playable !== true) rep.errors.push('7-3 通关后第 7 岛第 4 关没有解锁');

  // ---------- 1) 进关 → 教学 ----------
  await ev('document.querySelector(\'.node[data-level="4"]\').click()');
  await sleep(300);
  await ev('document.getElementById("btnStart").click()');

  // 13 环节：3 知识点 × 2 演示 + 2 互动 + 过渡
  const STEPS = [
    { n: 'intro',  sig: 'sid:intro',  audio: 'g4_t_ear_intro', demo: true, n_kids: 3, hl: false, shot: 'tut-intro' },
    { n: 'ear1',   sig: 'sid:ear1',   audio: 'g4_t_ear_intro', demo: true, n_kids: 3, hl: 'boy+ear', shot: 'tut-ear1' },
    { n: 'earA',   sig: 'sid:earA',   audio: 'g4_t_ear',  ask: 'boy+ear', n_kids: 3, shot: 'tut-earA' },
    { n: 'earB',   sig: 'sid:earB',   audio: 'g4_t_ear',  ask: 'boy+ear', n_kids: 4, shot: 'tut-earB' },
    { n: 'clap1',  sig: 'sid:clap1',  audio: 'g4_t_clap', demo: true, n_kids: 4, hl: 'girl+clap', shot: 'tut-clap1' },
    { n: 'clap2',  sig: 'sid:clap2',  audio: 'g4_t_clap', demo: true, n_kids: 5, hl: 'girl+clap', shot: 'tut-clap2' },
    { n: 'clapA',  sig: 'sid:clapA',  audio: 'g4_t_clap', ask: 'girl+clap', n_kids: 4, shot: 'tut-clapA' },
    { n: 'clapB',  sig: 'sid:clapB',  audio: 'g4_t_clap', ask: 'girl+clap', n_kids: 5, shot: 'tut-clapB' },
    { n: 'eyes1',  sig: 'sid:eyes1',  audio: 'g4_t_eyes', demo: true, n_kids: 4, hl: 'boy+eyes', shot: 'tut-eyes1' },
    { n: 'eyes2',  sig: 'sid:eyes2',  audio: 'g4_t_eyes', demo: true, n_kids: 5, hl: 'boy+eyes', shot: 'tut-eyes2' },
    { n: 'eyesA',  sig: 'sid:eyesA',  audio: 'g4_t_eyes', ask: 'boy+eyes', n_kids: 5, shot: 'tut-eyesA' },
    { n: 'eyesB',  sig: 'sid:eyesB',  audio: 'g4_t_eyes', ask: 'boy+eyes', n_kids: 5, shot: 'tut-eyesB' },
    { n: 'out',    sig: 'sid:out',    audio: 'g4_t_out',   out: true, shot: 'tut-out' }
  ];
  const kidSel = key => {
    const p = key.split('+');
    return '#askDisplay .g4-kid[data-gender="' + p[0] + '"][data-act="' + p[1] + '"]';
  };

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
    // 互动步的「4 秒内不出小手指」必须紧贴着舞台条目检查（CDP 经代理往返有抖动，
    // 放在前奏后面会超过 4s 阈值，把本步自己的定时器误判成提前出现）
    if (entry && st.ask) row.hintEarly = await ev(sel('.tut-hint'));

    if (entry) {
      await sleep(180);
      row.audio = (await keysBetween(entry.t - 900, entry.t + 2600)).filter(k => k !== 'unknown');
      row.audioOk = row.audio.indexOf(st.audio) >= 0;
      if (!row.audioOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）语音不符：期望 ' + st.audio + '，实际 ' + row.audio.join(','));
      // 群像人数
      row.kids = await kidCount();
      if (st.n_kids && row.kids !== st.n_kids) {
        rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）小人数不符：期望 ' + st.n_kids + '，实际 ' + row.kids);
      }
      // 目标小人存在且唯一
      if (st.hl || st.ask) {
        row.targetN = await ev('document.querySelectorAll(' + JSON.stringify(kidSel(st.hl || st.ask)) + ').length');
        if (row.targetN !== 1) {
          rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）目标小人不唯一：' + row.targetN);
        }
      }
      // 演示高亮
      if (st.hl) {
        row.hlOk = await ev(`(function(){
          var k = document.querySelector(${JSON.stringify(kidSel(st.hl))});
          return !!k && k.classList.contains('g4-hl');
        })()`);
        if (row.hlOk !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）目标小人没有高亮');
      }
      if (!st.hl && st.demo) {
        row.noHl = await ev('document.querySelectorAll("#askDisplay .g4-kid.g4-hl").length');
        if (row.noHl !== 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）第一步演示不该出现高亮');
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
      await tap('#askDisplay .g4-stage');
      row.advanced = await wait('window.__stageLog.length > ' + (foundIdx + 1), 6000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    // 互动步：4 秒小手指指向目标 → 点错不推进+again → 点对推进+great
    if (st.ask) {
      // hintEarly 已在找到舞台条目时立即采集（见上）；这里等它出现
      row.hintLater = await wait(sel('.tut-hint'), 7000);
      if (row.hintEarly === true || row.hintLater !== true) {
        rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手指异常：early=' + row.hintEarly + ' later=' + row.hintLater);
      }
      row.hintGeom = await ev(`(function(){
        var h = document.querySelector('.tut-hint');
        var tgt = document.querySelector(${JSON.stringify(kidSel(st.ask))});
        if (!h || !tgt) return null;
        var tb = tgt.getBoundingClientRect();
        var hb = h.getBoundingClientRect();
        var ex = hb.left + hb.width / 2, ey = hb.top + hb.height;
        var near = ex > tb.left - 16 && ex < tb.right + 16 && ey > tb.top - 28 && ey < tb.bottom + 32;
        return { near: near, stars: Game.stars };
      })()`);
      if (row.hintGeom && row.hintGeom.near !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）小手指没指向目标小人');
      if (row.hintGeom && row.hintGeom.stars !== 0) rep.errors.push('教学阶段不该有星星：' + row.hintGeom.stars);
      await sleep(200);

      // 点错一个非目标小人：不推进 + 播 again
      const wrongSel = await ev(`(function(){
        var ks = document.querySelectorAll('#askDisplay .g4-kid');
        for (var i = 0; i < ks.length; i++) {
          if (ks[i].dataset.gender + '+' + ks[i].dataset.act !== ${JSON.stringify(st.ask)}) {
            return '#askDisplay .g4-kid[data-kid="' + ks[i].dataset.kid + '"][data-act="' + ks[i].dataset.act + '"]';
          }
        }
        return null;
      })()`);
      const before = await ev('window.__stageLog.length');
      const wt = Date.now();
      if (wrongSel) await tap(wrongSel);
      await sleep(1000);
      row.wrongPick = {
        advanced: (await ev('window.__stageLog.length')) > before,
        audio: (await keysBetween(wt - 150, wt + 2400)).filter(k => k !== 'unknown')
      };
      if (row.wrongPick.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错小人却推进了');
      if (row.wrongPick.audio.indexOf('again') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错后没播 again：' + row.wrongPick.audio.join(','));
      await sleep(700);

      // 点对目标：great + 推进
      const before2 = await ev('window.__stageLog.length');
      const ct = Date.now();
      await tap(kidSel(st.ask));
      await sleep(1500);
      row.great = (await keysBetween(ct - 200, ct + 2400)).filter(k => k !== 'unknown');
      if (row.great.indexOf('g4_t_great') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点对后没播鼓励语：' + row.great.join(','));
      row.advanced = await wait('window.__stageLog.length > ' + before2 + ' || Game.phase === "asking"', 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点对后没有推进');
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
  const wrongTested = { G4A: false, G4B: false, G4C: false };

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(200);
    let snap = await ev('Game.snapshot()');
    let q = snap.question;
    if (!q) { rep.errors.push('第 ' + r + ' 轮：答题阶段未开始（question 为空，phase=' + snap.phase + '）'); break; }
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, correct: q.correct, audio: q.audio, noun: q.g4noun, act: q.g4act };

    if (q.type === 'G4A' || q.type === 'G4C') {
      row.kids = await kidCount();
      row.want = (q.type === 'G4A') ? (4 + '') : '3';
      row.audioOk = q.audio === SENT[q.g4noun + '+' + q.g4act];
      row.matchN = await ev(`(function(){
        var n = 0;
        Array.prototype.forEach.call(document.querySelectorAll('#askDisplay .g4-kid'), function(k){
          if (k.dataset.gender === ${JSON.stringify(q.g4noun)} && k.dataset.act === ${JSON.stringify(q.g4act)}) n++;
        });
        return n;
      })()`);
      row.semOk = await ev(`(function(){
        var ks = ${JSON.stringify(q.g4kids)};
        var dom = document.querySelectorAll('#askDisplay .g4-kid');
        if (ks.length !== dom.length) return false;
        for (var i = 0; i < ks.length; i++) {
          if (dom[i].dataset.kid !== ks[i].kid || dom[i].dataset.act !== ks[i].act) return false;
        }
        return true;
      })()`);
      if (row.kids < 3 || row.kids > 5) rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 小人数异常：' + row.kids);
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 语音不符：' + q.audio);
      if (!row.semOk) rep.errors.push('第 ' + r + ' 轮 ' + q.type + ' 画面与题目不一致：' + JSON.stringify(q.g4kids));
      if (q.type === 'G4A' && row.matchN !== 1) {
        rep.errors.push('第 ' + r + ' 轮 G4A 匹配(性别+动作)的小人不是唯一：' + row.matchN);
      }
      if (q.type === 'G4C') {
        // C 型语义：答案小人动作对但性别≠名词；陷阱小人性别=名词但动作不对
        row.cSem = await ev(`(function(){
          var ks = ${JSON.stringify(q.g4kids)};
          var ans = -1, trap = -1;
          for (var i = 0; i < ks.length; i++) {
            if (ks[i].act === ${JSON.stringify(q.g4act)}) ans = i;
            if (ks[i].gender === ${JSON.stringify(q.g4noun)} && ks[i].act !== ${JSON.stringify(q.g4act)}) trap = i;
          }
          return { ans: ans, trap: trap, ansGenderOk: ans >= 0 && ks[ans].gender !== ${JSON.stringify(q.g4noun)},
                   trapGenderOk: trap >= 0, n: ks.length };
        })()`);
        if (row.kids !== 3) rep.errors.push('第 ' + r + ' 轮 G4C 不是 3 个小人：' + row.kids);
        if (!row.cSem.ansGenderOk) rep.errors.push('第 ' + r + ' 轮 G4C 答案小人性别应与名词不同（陷阱设计）：' + JSON.stringify(row.cSem));
        if (!row.cSem.trapGenderOk) rep.errors.push('第 ' + r + ' 轮 G4C 缺少名词性别的陷阱小人：' + JSON.stringify(row.cSem));
        if (q.correct !== row.cSem.ans) rep.errors.push('第 ' + r + ' 轮 G4C 正确项不是「真在做该动作的人」：correct=' + q.correct + ' ans=' + row.cSem.ans);
      }
    }
    if (q.type === 'G4B') {
      row.kids = await kidCount();
      row.slots = await ev('document.querySelectorAll("#askDisplay .g4-kid").length');
      row.audioOk = q.audio && q.audio.indexOf('g4_b') === 0;
      row.stepsOk = q.g4steps && q.g4steps.length === 2 && q.g4steps[0].gender !== q.g4steps[1].gender;
      row.stepAudioOk = q.stepAudios && q.stepAudios[1] && q.stepAudios[1].indexOf('g4_b') === 0 && q.stepAudios[1].indexOf('_then') > 0;
      row.bothOk = await ev(`(function(){
        var ks = ${JSON.stringify(q.g4kids)};
        var st = ${JSON.stringify(q.g4steps)};
        function has(g, a) {
          for (var i = 0; i < ks.length; i++) if (ks[i].gender === g && ks[i].act === a) return true;
          return false;
        }
        return has(st[0].gender, st[0].act) && has(st[1].gender, st[1].act);
      })()`);
      if (row.kids !== 5) rep.errors.push('第 ' + r + ' 轮 G4B 不是 5 个小人：' + row.kids);
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 G4B 题干语音不符：' + JSON.stringify(q.audio));
      if (!row.stepsOk) rep.errors.push('第 ' + r + ' 轮 G4B 两步目标不是一男一女：' + JSON.stringify(q.g4steps));
      if (!row.stepAudioOk) rep.errors.push('第 ' + r + ' 轮 G4B 第二步语音不是 then 分句：' + JSON.stringify(q.stepAudios));
      if (!row.bothOk) rep.errors.push('第 ' + r + ' 轮 G4B 画面里找不到两个目标小人');
    }

    if (!seenShot[q.type]) {
      seenShot[q.type] = 1;
      await sleep(300);
      row.overflow = await overflow();
      await shot(TAG + '-q-' + q.type + '.png');
    }

    // 每种题型第一轮做一次「答错不推进」测试
    if (!wrongTested[q.type]) {
      wrongTested[q.type] = true;
      let did = false;
      if (q.type === 'G4A' || q.type === 'G4C') {
        // 点一个不做该动作的小人（群像里动作互异，按动作区分最稳；
        // G4C 的答案是「另一个性别但做对动作」的人，不能按名词性别找错项）
        const wrongSel = await ev(`(function(){
          var dom = document.querySelectorAll('#askDisplay .g4-kid');
          for (var i = 0; i < dom.length; i++) {
            if (dom[i].dataset.act !== ${JSON.stringify(q.g4act)}) {
              return '#askDisplay .g4-kid[data-kid="' + dom[i].dataset.kid + '"][data-act="' + dom[i].dataset.act + '"]';
            }
          }
          return null;
        })()`);
        if (wrongSel) did = await tap(wrongSel);
      } else if (q.type === 'G4B') {
        // 点一个两步目标之外的小人
        const wrongSel = await ev(`(function(){
          var ks = ${JSON.stringify(q.g4kids)};
          var st = ${JSON.stringify(q.g4steps)};
          var dom = document.querySelectorAll('#askDisplay .g4-kid');
          for (var i = 0; i < dom.length; i++) {
            var isT = (ks[i].gender === st[0].gender && ks[i].act === st[0].act) ||
                      (ks[i].gender === st[1].gender && ks[i].act === st[1].act);
            if (!isT) return '#askDisplay .g4-kid[data-kid="' + dom[i].dataset.kid + '"][data-act="' + dom[i].dataset.act + '"]';
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

    if (q.type === 'G4B') {
      // 两步：先点第一个目标，再点第二个目标
      for (let s = 0; s < 2; s++) {
        const stp = q.g4steps[s];
        const selS = '#askDisplay .g4-kid[data-gender="' + stp.gender + '"][data-act="' + stp.act + '"]';
        await tap(selS);
        if (s === 0) {
          await sleep(1000);
          const mid = await ev('Game.snapshot()');
          row.step1Done = mid.question ? mid.question.stepsDone : null;
          row.step1Audio = (await keysBetween(ct, Date.now())).filter(k => k !== 'unknown');
          if (row.step1Done !== 1) rep.errors.push('第 ' + r + ' 轮 G4B 第一步落位后 stepsDone 不是 1：' + row.step1Done);
          if (row.step1Audio.indexOf(q.stepAudios[1]) < 0) {
            rep.errors.push('第 ' + r + ' 轮 G4B 第一步落位后没口播第二步：' + row.step1Audio.join(','));
          }
        } else {
          row.step2Done = null;
          for (let k = 0; k < 12; k++) {
            const mid = await ev('Game.snapshot()');
            if (mid.question && mid.question.stepsDone === 2) { row.step2Done = 2; break; }
            if (mid.round !== r || mid.phase === 'done') { row.step2Done = 2; break; }
            await sleep(110);
          }
          if (row.step2Done !== 2) rep.errors.push('第 ' + r + ' 轮 G4B 第二步落位后没有两步完成：' + row.step2Done);
        }
      }
    } else {
      // 单目标：点唯一在做该动作的小人。群像里动作互异，按动作点即唯一；
      // G4C 的答案正是「另一个性别但做对动作」的人（名词性别的那位是陷阱）。
      await tap('#askDisplay .g4-kid[data-act="' + q.g4act + '"]');
    }

    await sleep(250);
    // G4B 第一步落位后的 then 分句是题干的一部分，按 probe_f14 先例不计入「答对禁人声」
    row.voiceOnCorrect = (await keysBetween(ct, ct + 430)).filter(function (k) {
      return k !== 'unknown' && !(q.type === 'G4B' && q.stepAudios && k === q.stepAudios[1]);
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
    cleared: await ev('!!Game.progress.cleared["7-4"]'),
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
    var n4 = document.querySelector('.node[data-level="4"]');
    var snap = Game.snapshot();
    return { node4Playable: n4.classList.contains('playable'),
             node4Done: n4.classList.contains('done'),
             unlockedLevel: snap.progress.unlockedLevel[7] };
  })()`);
  await shot(TAG + '-island-after.png');

  console.log(JSON.stringify(rep, null, 2));

  const sigOk = rep.tutorial.every(s => s.sigOk);
  const noOverflow = rep.tutorial.every(s => !s.overflow ||
    (s.overflow.sw <= s.overflow.iw + 1 && s.overflow.sh <= s.overflow.ih + 1 &&
     s.overflow.cut.length === 0 && s.overflow.zero.length === 0 && s.overflow.hot.length === 0));
  const audioOk = rep.tutorial.every(s => s.audioOk);
  const hintOk = rep.tutorial.filter(s => s.ask).every(s => s.hintEarly !== true && s.hintLater === true);
  const advanceOk = rep.tutorial.filter(s => s.advanced !== undefined).every(s => s.advanced === true);
  const demoOk = rep.tutorial.filter(s => s.demo).every(s => s.tapShown === true && s.autoAdvanced === false && s.advanced === true);
  const wrongOk = rep.tutorial.filter(s => s.wrongPick).every(s => !s.wrongPick.advanced);
  const greatOk = rep.tutorial.filter(s => s.ask).every(s => s.great.indexOf('g4_t_great') >= 0);
  const outOk = rep.tutorial.filter(s => s.out).every(s => s.ended === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1 && s.voiceOnCorrect.length === 0);
  const bStepsOk = rep.rounds.filter(s => s.type === 'G4B').every(s => s.step1Done === 1 && s.step2Done === 2);
  const ok = rep.errors.length === 0 && sigOk && audioOk && hintOk && advanceOk && demoOk && wrongOk &&
    greatOk && outOk && roundsOk && bStepsOk && noOverflow &&
    rep.rounds.length === 12 &&
    Object.keys(seenType).length === 3 && seenType.G4A === 4 && seenType.G4B === 4 && seenType.G4C === 4 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === false && rep.checks.done.cleared === true &&
    rep.checks.done.unlockedLevel === 5 &&
    rep.checks.islandAfter.node4Done === true &&
    rep.checks.islandAfter.unlockedLevel === 5 &&
    rep.checks.mapAfter.island7Unlocked === true && rep.checks.mapAfter.island7Cleared === false &&
    rep.checks.mapAfter.hasIcon === true &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0 &&
    rep.checks.englishIsland.length === 0 &&
    rep.checks.outro.ended === true;
  console.log('\nPROBE_' + (ok ? 'PASS' : 'FAIL') + ' sigOk=' + sigOk + ' audioOk=' + audioOk + ' hintOk=' + hintOk +
    ' advanceOk=' + advanceOk + ' demoOk=' + demoOk + ' wrongOk=' + wrongOk + ' greatOk=' + greatOk +
    ' outOk=' + outOk + ' roundsOk=' + roundsOk + ' bStepsOk=' + bStepsOk + ' noOverflow=' + noOverflow +
    ' steps=' + rep.checks.outro.totalSteps + ' types=' + JSON.stringify(seenType) +
    ' stars=' + rep.checks.done.stars + ' cleared=' + rep.checks.done.cleared);
  finish(ok ? 0 : 1);
})().catch(e => { console.error('PROBE_ERROR', e); finish(2); });
