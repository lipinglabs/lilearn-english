// 第 5 岛第 3 关（L5-W3，喜好与需求表达）专项测试
//   1) 解锁链：第 1–4 岛全通 + 第 5 岛第 1–2 关通关 → 第 3 关可玩、第 4 关仍锁
//   2) 教学（RULES §三.10 双倍量）：4 个句型 × (2 演示 + 2 互动) + 过渡语 = 17 环节，按时间线逐步校验
//   3) 三题型：A 听短语找画面 / B 听情境选回答 / C 把食物拖（或点）进「喜欢 / 不喜欢」框
//   4) 答题 12 轮：答对无人声、答错不推进、放错食物 / 放到框外都不判对、通关撒花 + 鼓励
//   5) 视觉：无英文字母（innerText + aria-label）、当前视口无溢出（含逐元素越界与零尺寸）
// 带 LILEARN_URL 则直接跑线上（发布后回归用）。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'f8';
const PORT = 9679 + (W === 390 ? 0 : 1);
// 默认跑本地文件；带 LILEARN_URL 则跑线上
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));

// 题型 A：画面 → 该画面的语音 key（四个句型各一张标准画面）
const A_KEY = { likeApple: 'l5w3_a_like', dislike: 'l5w3_a_nolike', more: 'l5w3_a_more', full: 'l5w3_a_done' };
// 题型 B：情境 → (正确表情, 语音 key)
const B_CASE = {
  appleBig:  { answer: 'likeApple', key: 'l5w3_b_like' },
  lemonBig:  { answer: 'dislike',   key: 'l5w3_b_nolike' },
  emptyCup:  { answer: 'more',      key: 'l5w3_b_more' },
  doneTable: { answer: 'full',      key: 'l5w3_b_done' }
};
// 题型 C：食物 → 语音 key 前缀（柠檬有两句：进不喜欢的框 / 「他不喜欢柠檬，放进不喜欢的框」）
const C_PREFIX = { apple: 'l5w3_c_apple', milk: 'l5w3_c_milk', lemon: 'l5w3_c_lemon' };

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-f8-' + Date.now()),
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

  // 打桩：Audio 播放记录（带时间戳）+ 教学舞台变更时间线（MutationObserver）
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
        var s = document.querySelector('.f8-stage');
        if (!s) return null;
        var cards = Array.prototype.map.call(s.querySelectorAll('.f8-card'), function(n){ return n.dataset.subj; });
        if (!cards.length) return 'empty';
        var grid = s.querySelector('.f8-grid');
        if (!grid) return 'one:' + cards[0];
        var list = cards.slice().sort().join(',');
        if (grid.classList.contains('f8-final')) return 'final' + cards.length + ':' + list;
        return 'grid' + cards.length + ':' + list;
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
    // 本地文件秒开；线上首次要把 voice.js(≈15MB) + assets.js 拉完，留足 90s
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
    // 容器 overflow 会把超出部分裁掉而不撑大 scrollWidth，所以还要逐个量元素边界
    // 教学阶段选项栏是 gone 状态（元素有意为 0 尺寸），只在选项栏可见时才把 .option 计为零尺寸
    var optBar = document.getElementById('options');
    var optShown = !!optBar && !optBar.classList.contains('gone') && !optBar.classList.contains('off');
    var cut = [], zero = [];
    Array.prototype.forEach.call(document.querySelectorAll(
      '.f8-card, .f8-tile, .f8-box, .f8-inbox, .option'), function(n){
      var b = n.getBoundingClientRect();
      if (!b.width) { if (optShown || !n.classList.contains('option')) zero.push((n.className || '?') + ':0'); return; }
      if (b.right > window.innerWidth + 1 || b.left < -1) cut.push(n.className + ':' + Math.round(b.left) + '..' + Math.round(b.right));
      // 卡片塌成 0 宽时上面的越界判断会静默跳过（RULES §三.11），必须单独断言
      if (n.classList.contains('f8-card') && n.dataset.subj && b.width < 24) {
        zero.push(n.dataset.subj + ':' + Math.round(b.width));
      }
    });
    return { sw: de.scrollWidth, iw: window.innerWidth, sh: de.scrollHeight, ih: window.innerHeight,
             cut: cut.slice(0, 6), zero: zero.slice(0, 6) };
  })()`);

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };

  // ---------- 0) 解锁链：前 4 岛全通 + 第 5 岛第 1、2 关通关 ----------
  await ev('Game.resetProgress()');
  await ev('for (var isl = 1; isl <= 4; isl++) { for (var lv = 1; lv <= 5; lv++) Game.markCleared(isl, lv); }');
  await ev('Game.markCleared(5, 1)');
  await ev('Game.markCleared(5, 2)');
  await ev('Game.openIsland(5)');
  await sleep(300);
  rep.checks.unlock = await ev(`(function(){
    var n2 = document.querySelector('.node[data-level="2"]');
    var n3 = document.querySelector('.node[data-level="3"]');
    var n4 = document.querySelector('.node[data-level="4"]');
    return {
      node2Done: n2.classList.contains('done'),
      node3Playable: n3.classList.contains('playable'),
      node3Locked: n3.classList.contains('locked'),
      node4Locked: n4.classList.contains('locked')
    };
  })()`);
  await shot(TAG + '-island.png');
  if (rep.checks.unlock.node3Playable !== true) rep.errors.push('第 5 岛第 3 关没有亮起（' + JSON.stringify(rep.checks.unlock) + '）');
  if (rep.checks.unlock.node4Locked !== true) rep.errors.push('第 5 岛第 4 关不该已解锁');

  // ---------- 1) 进关 → 教学（按时间线逐步校验） ----------
  await ev('document.querySelector(\'.node[data-level="3"]\').click()');
  await sleep(300);
  await ev('document.getElementById("btnStart").click()');

  const STEPS = [
    // ① I like it：2 次演示 + 2 次互动
    { n: 'like-demo1', sig: 'one:likeApple', audio: 'l5w3_t_like1', shot: 'tut-like-apple' },
    { n: 'like-demo2', sig: 'one:likeMilk',  audio: 'l5w3_t_like2', shot: 'tut-like-milk' },
    { n: 'like-ask1',  sig: 'grid2:dislike,likeApple',     audio: 'l5w3_t_like3',
      hint: true, wrongFirst: 'dislike', click: 'likeApple', shot: 'tut-like-hint' },
    { n: 'like-ask2',  sig: 'grid3:dislike,full,likeApple', audio: 'l5w3_t_like4', click: 'likeApple' },
    // ② I don't like it：2 + 2
    { n: 'nolike-demo1', sig: 'one:dislike', audio: 'l5w3_t_nolike1', shot: 'tut-dislike' },
    { n: 'nolike-demo2', sig: 'one:sour',    audio: 'l5w3_t_nolike2', shot: 'tut-sour' },
    { n: 'nolike-ask1',  sig: 'grid2:dislike,likeApple',     audio: 'l5w3_t_nolike3', hint: true, click: 'dislike' },
    { n: 'nolike-ask2',  sig: 'grid3:dislike,full,likeApple', audio: 'l5w3_t_nolike4', click: 'dislike', shot: 'tut-nolike-three' },
    // ③ More, please：2 + 2
    { n: 'more-demo1', sig: 'one:more',     audio: 'l5w3_t_more1', shot: 'tut-more' },
    { n: 'more-demo2', sig: 'one:emptyCup', audio: 'l5w3_t_more2', shot: 'tut-empty-cup' },
    { n: 'more-ask1',  sig: 'grid2:emptyPlate,fullPlate', audio: 'l5w3_t_more3', hint: true, click: 'emptyPlate', shot: 'tut-plate-hint' },
    { n: 'more-ask2',  sig: 'grid3:dislike,full,more',    audio: 'l5w3_t_more4', click: 'more' },
    // ④ All done：2 + 2（最后一个是三选一综合互动）
    { n: 'done-demo1', sig: 'one:full',     audio: 'l5w3_t_done1', shot: 'tut-full' },
    { n: 'done-demo2', sig: 'one:fullPush', audio: 'l5w3_t_done2', shot: 'tut-full-push' },
    { n: 'done-ask1',  sig: 'grid2:full,likeApple',  audio: 'l5w3_t_done3', hint: true, click: 'full' },
    { n: 'done-ask2',  sig: 'grid3:dislike,full,more', audio: 'l5w3_t_done4', click: 'full', shot: 'tut-done-three' },
    // ⑤ 过渡语（自带）
    { n: 'outro', sig: 'final4:dislike,full,likeApple,more', audio: 'l5w3_t_out' }
  ];

  // 相邻两步的舞台指纹不能相同：MutationObserver 只在指纹变化时记一条，
  // 相邻重复会让时间线不增长，探针把「已推进」误判成「没推进」（第 4 岛第 4 关踩过）。
  // 不相邻的重复是允许的（例如「喜欢」与「不喜欢」都用同一组二选一卡片）。
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
      // 舞台记录由 setTimeout(0) 延迟落库，语音可能早一拍开始，窗口往前放宽 900ms
      row.audio = (await keysBetween(entry.t - 900, entry.t + 2600)).filter(k => k !== 'unknown');
      row.audioOk = row.audio.indexOf(st.audio) >= 0;
      if (!row.audioOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）语音不符：期望 ' + st.audio + '，实际 ' + row.audio.join(','));
    }
    // 过渡语一步说完就立刻清空舞台（tutFinish），量到的会是已脱离文档的节点（尺寸 0），跳过
    if (st.n !== 'outro') row.overflow = await overflow();
    if (st.shot) { await sleep(120); await shot(TAG + '-' + st.shot + '.png'); }

    // 点错不推进：先点错的，等一会儿确认没前进、且只播了温柔鼓励
    if (st.wrongFirst) {
      const before = await ev('window.__stageLog.length');
      const wt = Date.now();
      await tap('#askDisplay .f8-tile[data-subj="' + st.wrongFirst + '"]');
      await sleep(1100);
      row.wrongPick = {
        advanced: (await ev('window.__stageLog.length')) > before,
        stillAsking: await ev('Game.tutorial && Game.tutorial.ask === ' + JSON.stringify(st.click)),
        audio: (await keysBetween(wt, wt + 2000)).filter(k => k !== 'unknown')
      };
      if (row.wrongPick.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错却推进了');
      if (row.wrongPick.stillAsking !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错后没保持等待');
      if (row.wrongPick.audio.indexOf('again') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错后没播温柔鼓励：' + row.wrongPick.audio.join(','));
      await sleep(1200);
    }

    if (st.hint) {
      // 4 秒静默才该出小手指：2.4 秒时必须还没有。
      // 同一步里先做过「点错」测试的话，点错会重新 armHint，计时起点已经变了，early 不再可信 → 跳过
      if (st.wrongFirst) {
        row.hintEarly = null;
      } else {
        await sleep(2400);
        row.hintEarly = await ev(sel('.tut-hint'));
      }
      row.hintLater = await wait(sel('.tut-hint'), 5000);
      if (row.hintEarly === true || row.hintLater !== true) {
        rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手指异常：early=' + row.hintEarly + ' later=' + row.hintLater);
      }
      row.hintGeom = await ev(`(function(){
        var h = document.querySelector('.tut-hint');
        if (!h) return null;
        var tgt = document.querySelector('#askDisplay .f8-tile[data-subj="' + ${JSON.stringify(st.click)} + '"]');
        var hb = h.getBoundingClientRect(), tb = tgt ? tgt.getBoundingClientRect() : null;
        // 指尖落点处命中的是哪一张卡（hintTarget 是 DOM 元素，snapshot 里拿不到，只能按坐标反查）
        var tip = document.elementFromPoint(hb.left + 4, hb.top - 4);
        var tipTile = tip && tip.closest ? tip.closest('.f8-tile') : null;
        return { inDisplay: !!h.closest('#askDisplay'), anim: getComputedStyle(h).animationName,
                 hintSubj: tipTile ? tipTile.dataset.subj : null,
                 // 指尖应落在「正确那张卡」的右下侧（指着它但不盖住图形）
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

    if (st.click) {
      const before = await ev('window.__stageLog.length');
      const cardSel = '#askDisplay .f8-tile[data-subj="' + st.click + '"]';
      // 点击前先记录目标的几何与命中元素：卡片塌陷/被遮挡时能一眼看出来
      row.geo = await ev(`(function(){
        var t = document.querySelector(${JSON.stringify(cardSel)});
        if (!t) return null;
        var b = t.getBoundingClientRect();
        var h = document.elementFromPoint(b.left + b.width/2, b.top + b.height/2);
        var cls = h ? (h.className && h.className.baseVal !== undefined ? h.className.baseVal : h.className) : '';
        return { r: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)],
                 hit: h ? h.tagName + '.' + cls : null,
                 inTarget: h ? !!(h.closest && h.closest(${JSON.stringify(cardSel)})) : false };
      })()`);
      if (!row.geo) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）找不到正确的人物卡');
      else if (!row.geo.inTarget) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）人物卡中心被遮挡：' + row.geo.hit);
      await tap(cardSel);
      await sleep(1400);
      row.clicked = true;
      row.advanced = await wait('window.__stageLog.length > ' + before, 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点对后没有推进');
    }
    rep.tutorial.push(row);
    console.log('STEP ' + (i + 1) + ' ' + JSON.stringify(row).slice(0, 320));
  }

  // 过渡语 → 答题
  rep.checks.outro = { ended: await wait('Game.phase === "asking"', 20000) };
  await sleep(500);
  rep.checks.outro.optionsBack = await ev('!document.getElementById("options").classList.contains("gone")');
  rep.checks.outro.starsInTutorial = await ev('Game.stars');
  rep.checks.outro.totalSteps = await ev('window.__stageLog.length');
  await shot(TAG + '-ask-first.png');

  // ---------- 2) 12 轮答题 ----------
  const seenType = {};
  const seenShot = {};
  let wrongPickTested = false;
  let wrongDropTested = false;
  let dragUsed = false;

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(200);
    let snap = await ev('Game.snapshot()');
    let q = snap.question;
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, scene: q.scene, situation: q.situation, food: q.food,
                  box: q.box, correct: q.correct, opts: q.options, audio: q.audio };
    const wantFp = q.type === 'F8A' ? 'k:' + q.scene
      : q.type === 'F8B' ? 'k:' + q.answer
      : 'f:' + q.food;

    // A：三张人物卡点一张；B：上方情境卡 + 三张「他说什么」小卡
    if (q.type === 'F8A' || q.type === 'F8B') {
      row.tiles = q.type === 'F8A'
        ? await ev('document.querySelectorAll("#askDisplay .f8-tile").length')
        : await ev('document.querySelectorAll("#options .option:not([hidden])").length');
      row.uniqueOpts = new Set(q.options).size;
      row.answerOk = q.options[q.correct] === wantFp;
      row.audioOk = q.audio === (q.type === 'F8A' ? A_KEY[q.scene] : B_CASE[q.situation].key);
      if (q.type === 'F8B') {
        // 情境卡必须真的在屏幕上，否则「听情境选回答」无从判断
        row.situationShown = await ev(`!!document.querySelector('#askDisplay .f8-card[data-subj="' + ${JSON.stringify(q.situation)} + '"]')`);
        row.situationOk = B_CASE[q.situation] && B_CASE[q.situation].answer === q.answer;
        if (!row.situationShown) rep.errors.push('第 ' + r + ' 轮情境卡没有显示：' + q.situation);
        if (!row.situationOk) rep.errors.push('第 ' + r + ' 轮情境与答案不匹配：' + q.situation + ' => ' + q.answer);
      }
      if (row.tiles !== 3) rep.errors.push('第 ' + r + ' 轮卡片数量异常：' + row.tiles);
      if (row.uniqueOpts !== 3) rep.errors.push('第 ' + r + ' 轮选项卡重复：' + JSON.stringify(q.options));
      if (!row.answerOk) rep.errors.push('第 ' + r + ' 轮正确答案指向错误：' + JSON.stringify(q.options) + ' want=' + wantFp);
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮语音与目标不一致：' + q.audio + ' scene=' + q.scene + ' situation=' + q.situation);
      // 干扰项里不能混进目标本身（否则有两个正确项）
      if (q.options.filter(function (f) { return f === wantFp; }).length !== 1) {
        rep.errors.push('第 ' + r + ' 轮选项里目标不是唯一：' + JSON.stringify(q.options));
      }
    }

    // C：两个框（投放目标 = 框本身）+ 两件食物
    if (q.type === 'F8C') {
      row.boxes = await ev(`(function(){
        var list = document.querySelectorAll('#askDisplay .f8-box');
        return Array.prototype.map.call(list, function(n){
          var b = n.getBoundingClientRect();
          return { drop: n.dataset.drop, w: Math.round(b.width), h: Math.round(b.height) };
        });
      })()`);
      row.opts = await ev('document.querySelectorAll("#options .option:not([hidden])").length');
      row.dragAttrs = await ev('document.querySelectorAll("#options .option[data-drag]").length');
      row.uniqueOpts = new Set(q.options).size;
      row.answerOk = q.options[q.correct] === wantFp;
      // 柠檬有两句（c_lemon / c_lemon2），只校验到食物这一级。
      // 注意 snapshot 里 q.audio 是字符串（不是数组），别写成 q.audio[0]
      row.audioOk = q.audio.indexOf(C_PREFIX[q.food]) === 0;
      // 柠檬永远进「不喜欢」，能吃的东西永远进「喜欢」——语义必须对
      row.semanticOk = (q.food === 'lemon') === (q.box === 'sad');
      if (!row.boxes || row.boxes.length !== 2) rep.errors.push('第 ' + r + ' 轮不是两个框：' + JSON.stringify(row.boxes));
      else {
        const drops = row.boxes.map(b => b.drop).sort().join(',');
        if (drops !== 'f8happy,f8sad') rep.errors.push('第 ' + r + ' 轮框的投放标记不对：' + drops);
        if (row.boxes.some(b => b.w < 60)) rep.errors.push('第 ' + r + ' 轮框尺寸异常：' + JSON.stringify(row.boxes));
      }
      if (row.opts !== 2) rep.errors.push('第 ' + r + ' 轮食物选项不是 2 个：' + row.opts);
      if (row.dragAttrs !== 2) rep.errors.push('第 ' + r + ' 轮可拖食物不是 2 个：' + row.dragAttrs);
      if (row.uniqueOpts !== 2) rep.errors.push('第 ' + r + ' 轮 C 题选项重复：' + JSON.stringify(q.options));
      if (!row.answerOk) rep.errors.push('第 ' + r + ' 轮 C 题正确答案指向错误：' + JSON.stringify(q.options));
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 C 题语音与目标不一致：' + q.audio + ' food=' + q.food);
      if (!row.semanticOk) rep.errors.push('第 ' + r + ' 轮食物与框的语义配错了：' + q.food + ' → ' + q.box);
      if (q.options.indexOf('f:lemon') < 0) rep.errors.push('第 ' + r + ' 轮托盘里没有柠檬（想学的「不喜欢」没法考）：' + JSON.stringify(q.options));
    }

    if (!seenShot[q.type]) { seenShot[q.type] = 1; await sleep(400); await shot(TAG + '-q-' + q.type + '.png'); }

    // A / B：先点错的卡片 → 不跳轮 + again
    if ((q.type === 'F8A' || q.type === 'F8B') && !wrongPickTested) {
      wrongPickTested = true;
      const wrongIdx = (q.correct + 1) % 3;
      const wrongSel = q.type === 'F8A'
        ? '#askDisplay .f8-tile[data-idx="' + wrongIdx + '"]'
        : '.option[data-idx="' + wrongIdx + '"]';
      const wt = Date.now();
      await tap(wrongSel);
      await sleep(1100);
      const after = await ev('Game.snapshot()');
      row.wrongPick = {
        advanced: after.round !== r,
        stillAsking: after.phase === 'asking',
        audio: (await keysBetween(wt, wt + 2000)).filter(k => k !== 'unknown')
      };
      if (row.wrongPick.advanced) rep.errors.push('第 ' + r + ' 轮点错却前进了');
      await sleep(1800);
      snap = await ev('Game.snapshot()');
      q = snap.question;
      row.correctAfterShuffle = q.correct;
      const wantFp2 = q.type === 'F8A' ? 'k:' + q.scene : 'k:' + q.answer;
      if (q.options[q.correct] !== wantFp2) rep.errors.push('第 ' + r + ' 轮重洗后正确答案指向错误');
    }

    // C：先把「另一件食物」拖进框 → 不能判对；再把正确的拖到框外 → 也不能判对
    if (q.type === 'F8C' && !wrongDropTested) {
      wrongDropTested = true;
      const br = await rectOf('#askDisplay .f8-box[data-drop="f8' + q.box + '"]');
      const wt = Date.now();
      await dragTo('.option[data-idx="' + ((q.correct + 1) % 2) + '"]', br.cx, br.cy);
      await sleep(1100);
      const after = await ev('Game.snapshot()');
      row.wrongDrop = {
        advanced: after.round !== r,
        stillAsking: after.phase === 'asking',
        audio: (await keysBetween(wt, wt + 2000)).filter(k => k !== 'unknown')
      };
      if (row.wrongDrop.advanced) rep.errors.push('第 ' + r + ' 轮把别的食物放进框里却判过了');
      await sleep(1600);
      snap = await ev('Game.snapshot()');
      q = snap.question;
      row.correctAfterShuffle = q.correct;

      // 正确的食物丢到框外面（显示区左上角空白处）
      const outside = await ev('(function(){var d=document.getElementById("askDisplay").getBoundingClientRect();' +
        'return {x:d.left+8,y:d.top+8};})()');
      await dragTo('.option[data-idx="' + q.correct + '"]', outside.x, outside.y);
      await sleep(1000);
      const after2 = await ev('Game.snapshot()');
      row.dropOutside = { advanced: after2.round !== r, stillAsking: after2.phase === 'asking' };
      if (row.dropOutside.advanced) rep.errors.push('第 ' + r + ' 轮放到框外却判过了');
      await sleep(1200);
      q = (await ev('Game.snapshot()')).question;
    }

    const before = await ev('Game.round');
    const starsBefore = await ev('Game.stars');
    const ct = Date.now();

    if (q.type === 'F8A') {
      await tap('#askDisplay .f8-tile[data-idx="' + q.correct + '"]');
    } else if (q.type === 'F8B') {
      await tap('.option[data-idx="' + q.correct + '"]');
    } else if (!dragUsed) {
      // 第一道 C 题走真拖拽（RULES §二.11 的主路径），其余走点选
      dragUsed = true;
      const br = await rectOf('#askDisplay .f8-box[data-drop="f8' + q.box + '"]');
      await dragTo('.option[data-idx="' + q.correct + '"]', br.cx, br.cy);
    } else {
      await tap('.option[data-idx="' + q.correct + '"]');
      await sleep(520);
      await tap('#askDisplay .f8-box[data-drop="f8' + q.box + '"]');
    }

    // 判对时食物要当场落进框里（视觉反馈，仍然不播语音）
    if (q.type === 'F8C') {
      await sleep(180);
      row.placedInBox = await ev(`(function(){
        var p = document.querySelector('#askDisplay .f8-inbox');
        return p ? (p.dataset.subj || p.tagName) : null;
      })()`);
      row.placedInRightBox = await ev(`!!document.querySelector('#askDisplay .f8-box[data-drop="f8${q.box}"] .f8-inbox')`);
      if (!row.placedInBox) rep.errors.push('第 ' + r + ' 轮答对后框里没有出现食物');
      if (row.placedInBox && row.placedInBox !== q.food) {
        rep.errors.push('第 ' + r + ' 轮框里出现的是别的食物：' + row.placedInBox + '（应为 ' + q.food + '）');
      }
      if (!row.placedInRightBox) rep.errors.push('第 ' + r + ' 轮食物落错了框');
      if (!seenShot['C-placed']) { seenShot['C-placed'] = 1; await shot(TAG + '-q-F8C-placed.png'); }
    }

    // judge() 答对后 430ms 才进下一题：这段时间必须只有音效、没有任何语音（RULES §1.6）
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

  // ---------- 3) 通关（第 5 岛第 3 关是普通关，不是结业关） ----------
  rep.checks.done = {
    phase: await ev('Game.phase'),
    stars: await ev('Game.stars'),
    viewDone: await ev('!document.getElementById("viewDone").hidden'),
    grand: await ev('document.getElementById("viewDone").classList.contains("grand")'),
    confetti: await ev('!document.getElementById("confetti").hidden'),
    cleared: await ev('!!Game.progress.cleared["5-3"]'),
    unlockedLevel: await ev('Game.progress.unlockedLevel[5]')
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
    var c5 = document.querySelector('.island[data-island="5"]');
    return {
      island5Name: c5 ? c5.textContent : null,
      island5Cleared: c5.classList.contains('cleared'),
      island5Unlocked: c5.classList.contains('unlocked'),
      island5Locked: c5.classList.contains('locked'),
      iconIsImg: !!c5.querySelector('img')
    };
  })()`);
  await shot(TAG + '-map-after.png');

  await ev('Game.openIsland(5)'); await sleep(300);
  rep.checks.englishIsland = await scan();
  rep.checks.islandAfter = await ev(`(function(){
    var n3 = document.querySelector('.node[data-level="3"]');
    var n4 = document.querySelector('.node[data-level="4"]');
    return { node3Done: n3.classList.contains('done'),
             node4Locked: n4.classList.contains('locked'), node4Text: n4.textContent,
             node4Class: n4.className, nodeCount: document.querySelectorAll('.node').length,
             unlocked: Game.snapshot().progress.unlockedLevel[5] };
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
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1 && s.voiceOnCorrect.length === 0);
  const ok = rep.errors.length === 0 && sigOk && audioOk && hintOk && wrongOk && advanceOk && roundsOk && noOverflow &&
    Object.keys(seenType).length === 3 && seenType.F8A === 4 && seenType.F8B === 4 && seenType.F8C === 4 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === false && rep.checks.done.cleared === true &&
    rep.checks.done.unlockedLevel === 4 &&
    // 第 4 关内容还没做（LEVEL_DEFS 里没有 5-4），所以是「已解锁但点进去提示准备中」，不是 locked
    rep.checks.islandAfter.node3Done === true &&
    rep.checks.islandAfter.node4Locked === false && rep.checks.islandAfter.node4Text === '4' &&
    // 第 5 岛只通了前三关，不是「全清」，所以不该有 cleared / 小旗，只该解锁
    rep.checks.mapAfter.island5Cleared === false && rep.checks.mapAfter.island5Unlocked === true &&
    rep.checks.mapAfter.iconIsImg === true &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0 &&
    rep.checks.englishIsland.length === 0 &&
    rep.checks.outro.ended === true &&
    rep.checks.overflowIsland.sw <= rep.checks.overflowIsland.iw + 1;
  console.log('\nsigOk=' + sigOk + ' audioOk=' + audioOk + ' hintOk=' + hintOk + ' wrongOk=' + wrongOk +
    ' advanceOk=' + advanceOk + ' roundsOk=' + roundsOk + ' noOverflow=' + noOverflow +
    ' steps=' + rep.checks.outro.totalSteps + ' types=' + JSON.stringify(seenType) +
    ' stars=' + rep.checks.done.stars + ' grand=' + rep.checks.done.grand +
    ' island5=' + rep.checks.mapAfter.island5Cleared + '/' + rep.checks.mapAfter.island5Unlocked);
  if (rep.errors.length) console.log('errors: ' + rep.errors.join(' | '));
  console.log(ok ? 'PROBE_PASS' : 'PROBE_FAIL');
  ws.close();
  proc.kill();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('PROBE_ERROR', e); try { proc.kill(); } catch (_) {} process.exit(2); });
