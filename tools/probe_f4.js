// 第 4 岛第 4 关（L4-W4，动物 + 动作短句 The dog is running / The cat is sleeping / The monkey is eating）专项测试
//   1) 第 1–3 岛全通 + 第 4 岛第 1–3 关通关 → 第 4 关亮起、第 5 关仍锁
//   2) 教学（RULES §三.10 双倍量）：3 个句型 × 4 环节 + 综合 + 对错题示范/互动 2 步 + 过渡语 = 16 环节，按时间线逐步校验
//   3) 三题型：A 听长句找场景 / B 看图判断句子对错（✅ / ❌）/ C 把场景拖（或点）进「在跑 / 在睡」筐
//   4) 答题 12 轮：答对无人声、答错不推进、判错对错不推进、放错筐不判对、通关撒花 + 鼓励
//   5) 视觉：无英文字母（innerText + aria-label）、当前视口无溢出（含逐元素越界）
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'f4';
const PORT = 9671 + (W === 390 ? 0 : 1);
const URL_ = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-f4-' + Date.now()),
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
      function list(sel, root){
        return Array.prototype.map.call(root.querySelectorAll(sel), function(n){ return n.dataset.subj; }).sort().join(',');
      }
      function stageSig(){
        var s = document.querySelector('.f4-stage');
        if (!s) return null;
        var card = s.querySelector('.f4-card');
        var subj = card ? card.dataset.subj : '';
        if (s.querySelector('.f4-yn')) return 'yn:' + subj;
        if (s.querySelector('.f4-zoom')) return 'zoom:' + subj;
        var g = s.querySelector('.f4-grid');
        if (g) return 'grid' + g.dataset.n + ':' + list('.f4-card[data-subj]', g);
        var p = s.querySelector('.f4-pair');
        if (p) return 'pair:' + list('.f4-card[data-subj]', p);
        if (card) return 'one:' + subj;
        return 'empty';
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
    for (let i = 0; i < 200; i++) {
      const r = await send('Runtime.evaluate', { expression: 'typeof window.Game !== "undefined"', returnByValue: true }, sessionId);
      if (r.result.value) break;
      await sleep(120);
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
    var cut = [], zero = [];
    Array.prototype.forEach.call(document.querySelectorAll(
      '.f4-tile, .f4-card, .f4-zone, .f4-yn-btn, .f4-actor'), function(n){
      var b = n.getBoundingClientRect();
      if (b.width && (b.right > window.innerWidth + 1 || b.left < -1)) cut.push(n.className + ':' + Math.round(b.left) + '..' + Math.round(b.right));
      // 卡片塌成 0×0 时上面的越界判断会静默跳过（width=0 直接 continue），必须单独断言
      if (n.classList.contains('f4-card') && n.dataset.subj && b.width < 24) zero.push(n.dataset.subj + ':' + Math.round(b.width));
    });
    return { sw: de.scrollWidth, iw: window.innerWidth, sh: de.scrollHeight, ih: window.innerHeight,
             cut: cut.slice(0, 6), zero: zero.slice(0, 6) };
  })()`);

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };

  // ---------- 0) 解锁链：前 3 岛全通 + 第 4 岛前 3 关通关 ----------
  await ev('Game.resetProgress()');
  await ev('for (var isl = 1; isl <= 3; isl++) { for (var lv = 1; lv <= 5; lv++) Game.markCleared(isl, lv); }');
  await ev('Game.markCleared(4, 1); Game.markCleared(4, 2); Game.markCleared(4, 3)');
  await ev('Game.openIsland(4)');
  await sleep(300);
  rep.checks.unlock = await ev(`(function(){
    var n3 = document.querySelector('.node[data-level="3"]');
    var n4 = document.querySelector('.node[data-level="4"]');
    var n5 = document.querySelector('.node[data-level="5"]');
    return {
      islandTitle: document.querySelector('.titles .t1').textContent,
      node3Cleared: n3.classList.contains('cleared'),
      node4Playable: n4.classList.contains('playable'),
      node4Locked: n4.classList.contains('locked'),
      node5Locked: n5.classList.contains('locked')
    };
  })()`);
  await shot(TAG + '-island.png');

  // ---------- 1) 进关 → 教学（按时间线逐步校验） ----------
  await ev('document.querySelector(\'.node[data-level="4"]\').click()');
  await sleep(300);
  await ev('document.getElementById("btnStart").click()');

  const STEPS = [
    // 狗在跑：演示 A（整幅场景）→ 演示 B（拉近 + 跑得快）→ 二选一 → 三选一
    { n: 'dog-demo1', sig: 'one:dog_run', audio: 'l4w4_t_dog1', shot: 'tut-dog' },
    { n: 'dog-demo2', sig: 'zoom:dog_run', audio: 'l4w4_t_dog2', shot: 'tut-dog-fast' },
    { n: 'dog-ask1', sig: 'pair:dog_run,dog_sleep', audio: 'l4w4_t_dog3', hint: true, hintAsk: 'dog_run',
      click: '.f4-pair .f4-card[data-subj="dog_run"]', wrong: '.f4-pair .f4-card[data-subj="dog_sleep"]',
      shot: 'tut-hint' },
    { n: 'dog-ask2', sig: 'grid3:cat_sleep,dog_run,horse_run', audio: 'l4w4_t_dog4',
      click: '.f4-grid .f4-card[data-subj="dog_run"]' },
    // 猫在睡
    { n: 'cat-demo1', sig: 'one:cat_sleep', audio: 'l4w4_t_cat1', shot: 'tut-cat' },
    { n: 'cat-demo2', sig: 'zoom:cat_sleep', audio: 'l4w4_t_cat2', shot: 'tut-cat-sofa' },
    { n: 'cat-ask1', sig: 'pair:cat_sleep,dog_eat', audio: 'l4w4_t_cat3',
      click: '.f4-pair .f4-card[data-subj="cat_sleep"]' },
    { n: 'cat-ask2', sig: 'grid3:cat_sleep,horse_run,monkey_eat', audio: 'l4w4_t_cat4',
      click: '.f4-grid .f4-card[data-subj="cat_sleep"]' },
    // 猴子在吃
    { n: 'mon-demo1', sig: 'one:monkey_eat', audio: 'l4w4_t_mon1', shot: 'tut-monkey' },
    { n: 'mon-demo2', sig: 'zoom:monkey_eat', audio: 'l4w4_t_mon2', shot: 'tut-monkey-banana' },
    { n: 'mon-ask1', sig: 'pair:bear_sleep,monkey_eat', audio: 'l4w4_t_mon3',
      click: '.f4-pair .f4-card[data-subj="monkey_eat"]' },
    { n: 'mon-ask2', sig: 'grid3:dog_run,horse_run,monkey_eat', audio: 'l4w4_t_mon4',
      click: '.f4-grid .f4-card[data-subj="monkey_eat"]' },
    // 综合互动：三幅场景里挑出「猴子在吃」（先点错一次，验证不推进）
    { n: 'show', sig: 'grid3:cat_sleep,dog_run,monkey_eat', audio: 'l4w4_t_show',
      wrong: '.f4-grid .f4-card[data-subj="cat_sleep"]',
      click: '.f4-grid .f4-card[data-subj="monkey_eat"]', shot: 'tut-show' },
    // 对错题：老师先示范一次判断（马在跑，问「狗在跑吗」→ ❌），自动推进
    { n: 'yn-demo', sig: 'yn:horse_run', audio: 'l4w4_t_yn1', shot: 'tut-yn-demo' },
    // 再让孩子自己判一次（猫在睡，问「猫在睡吗」→ ✅），带 4 秒小手指
    { n: 'yn-ask', sig: 'yn:cat_sleep', audio: 'l4w4_t_yn2', hint: true, hintAsk: 'yes',
      click: '.f4-yn-btn[data-val="1"]', wrong: '.f4-yn-btn[data-val="0"]', shot: 'tut-yn-ask' },
    // 过渡语（自带）
    { n: 'outro', sig: 'grid4:cat_sleep,dog_run,horse_run,monkey_eat', audio: 'l4w4_t_done' }
  ];

  // 舞台指纹必须两步各不相同：MutationObserver 只在指纹变化时记一条，
  // 相邻两步指纹相同时时间线不会增长，探针会把「已推进」误判成「没推进」（第 4 岛第 4 关踩过）
  (function () {
    const seen = new Set();
    STEPS.forEach(s => {
      if (seen.has(s.sig)) throw new Error('教学步骤舞台指纹重复：' + s.sig + '（' + s.n + '）');
      seen.add(s.sig);
    });
  })();

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
    row.overflow = await overflow();
    if (st.shot) { await sleep(120); await shot(TAG + '-' + st.shot + '.png'); }

    if (st.hint) {
      // 4 秒静默才该出小手指：2.4 秒时必须还没有
      await sleep(2400);
      row.hintEarly = await ev(sel('.tut-hint'));
      row.hintLater = await wait(sel('.tut-hint'), 5000);
      if (row.hintEarly !== false || row.hintLater !== true) {
        rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手指异常：early=' + row.hintEarly + ' later=' + row.hintLater);
      }
      row.hintGeom = await ev(`(function(){
        var h = document.querySelector('.tut-hint');
        if (!h) return null;
        var s = getComputedStyle(h);
        return { opacity: s.opacity, anim: s.animationName, inDisplay: !!h.closest('#askDisplay'),
                 stillAsking: Game.tutorial && Game.tutorial.ask === ${JSON.stringify(st.hintAsk)},
                 stars: Game.stars };
      })()`);
      const wt = Date.now();
      await tap(st.wrong);
      await sleep(1100);
      row.wrong = {
        advanced: await ev('Game.tutorial && Game.tutorial.ask !== ' + JSON.stringify(st.hintAsk)),
        stillAsking: await ev('Game.tutorial && Game.tutorial.ask === ' + JSON.stringify(st.hintAsk)),
        audio: (await keysBetween(wt, wt + 1800)).filter(k => k !== 'unknown')
      };
      if (row.wrong.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错却前进了');
      if (row.wrong.audio.indexOf('again') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错没有 again 鼓励：' + row.wrong.audio.join(','));
      await sleep(300);
    }

    if (st.wrong && !st.hint) {
      // 第二个「点错」测试放在三选一上：难度最高的位置也不能靠乱点过关
      const before = await ev('window.__stageLog.length');
      const wt = Date.now();
      await tap(st.wrong);
      await sleep(1100);
      row.wrong = {
        advanced: (await ev('window.__stageLog.length')) > before,
        audio: (await keysBetween(wt, wt + 1800)).filter(k => k !== 'unknown')
      };
      if (row.wrong.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错却前进了');
      await sleep(300);
    }

    if (st.click) {
      const ct = Date.now();
      const before = await ev('window.__stageLog.length');
      // 点击前先记录目标的几何与命中元素：卡片塌陷/被遮挡时能一眼看出来
      row.geo = await ev(`(function(){
        var t = document.querySelector(${JSON.stringify(st.click)});
        if (!t) return null;
        var b = t.getBoundingClientRect();
        var h = document.elementFromPoint(b.left + b.width/2, b.top + b.height/2);
        var cls = h ? (h.className && h.className.baseVal !== undefined ? h.className.baseVal : h.className) : '';
        return { r: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)],
                 hit: h ? h.tagName + '.' + cls : null,
                 inTarget: h ? !!(h.closest && h.closest(${JSON.stringify(st.click)})) : false };
      })()`);
      await tap(st.click);
      await sleep(1400);
      row.clicked = true;
      // 用「舞台时间线是否多出一条」判断推进，避免用选择器误判（相邻两步可能是同一种容器）
      row.advanced = await wait('window.__stageLog.length > ' + before, 8000);
      row.clickAudio = (await keysBetween(ct, ct + 900)).filter(k => k !== 'unknown');
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点对后没有推进');
    }
    rep.tutorial.push(row);
    console.log('STEP ' + (i + 1) + ' ' + JSON.stringify(row).slice(0, 300));
  }

  // 过渡语 → 答题
  rep.checks.outro = { ended: await wait('Game.phase === "asking"', 20000) };
  await sleep(500);
  rep.checks.outro.optionsBack = await ev('!document.getElementById("options").classList.contains("gone")');
  rep.checks.outro.starsInTutorial = await ev('Game.stars');
  rep.checks.outro.totalSteps = await ev('window.__stageLog.length');
  rep.checks.outroAudio = await ev(`window.__played.map(function(p){
    for (var k in window.VOICE_BANK) if (window.VOICE_BANK[k] === p.src) return k;
    return 'unknown';
  }).filter(function(k){ return /l4w4_t_done/.test(k); }).length`);
  await shot(TAG + '-ask-first.png');

  // ---------- 2) 12 轮答题 ----------
  const seenType = {};
  const seenShot = {};
  const truths = [];
  let wrongDropTested = false;
  let wrongPickTested = false;
  let ynWrongTested = false;
  let dragUsed = false;

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(200);
    let snap = await ev('Game.snapshot()');
    let q = snap.question;
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, subj: q.subj, zone: q.zone, pic: q.pic, claim: q.claim,
                  truth: q.truth, correct: q.correct, opts: q.options, audio: q.audio };
    if (q.type === 'F4B') {
      truths.push(q.truth);
      // 选项指纹必须与 truth 对得上：truth=true 时正确项是 yes
      row.verdictOk = q.options[q.correct] === (q.truth ? 'yes' : 'no');
      if (!row.verdictOk) rep.errors.push('第 ' + r + ' 轮对错题的正确答案指向错误：' + JSON.stringify(q.options) + ' truth=' + q.truth);
      if (q.truth && q.pic !== q.claim) rep.errors.push('第 ' + r + ' 轮说「对」但画面与句子不一致');
      if (!q.truth && q.pic === q.claim) rep.errors.push('第 ' + r + ' 轮说「不对」但画面与句子一致');
    }
    if (!seenShot[q.type]) { seenShot[q.type] = 1; await sleep(400); await shot(TAG + '-q-' + q.type + '.png'); }

    // 题型 C：先把场景放进「另一个筐」→ 不能判对
    if (q.type === 'F4C' && !wrongDropTested) {
      wrongDropTested = true;
      const wrongZone = q.zone === 'run' ? 'sleep' : 'run';
      const wt = Date.now();
      await tap('.option[data-idx="' + q.correct + '"]');
      await sleep(520);
      await tap('.f4-zone[data-zone="' + wrongZone + '"]');
      await sleep(1100);
      const after = await ev('Game.snapshot()');
      row.wrongDrop = {
        advanced: after.round !== r,
        stillAsking: after.phase === 'asking',
        audio: (await keysBetween(wt, wt + 2000)).filter(k => k !== 'unknown')
      };
      if (row.wrongDrop.advanced) rep.errors.push('第 ' + r + ' 轮放错筐却判过了');
      await sleep(1800);
      snap = await ev('Game.snapshot()');
      q = snap.question;
      row.correctAfterShuffle = q.correct;
    }

    // 题型 B：先点错一个对错按钮 → 不跳轮
    if (q.type === 'F4B' && !ynWrongTested) {
      ynWrongTested = true;
      const wrongIdx = (q.correct + 1) % 2;
      const wt = Date.now();
      await tap('.option[data-idx="' + wrongIdx + '"]');
      await sleep(1100);
      const after = await ev('Game.snapshot()');
      row.wrongPick = {
        advanced: after.round !== r,
        stillAsking: after.phase === 'asking',
        audio: (await keysBetween(wt, wt + 2000)).filter(k => k !== 'unknown')
      };
      if (row.wrongPick.advanced) rep.errors.push('第 ' + r + ' 轮判断错却前进了');
      await sleep(1800);
      snap = await ev('Game.snapshot()');
      q = snap.question;
      row.correctAfterShuffle = q.correct;
      if (q.options[q.correct] !== (q.truth ? 'yes' : 'no')) {
        rep.errors.push('第 ' + r + ' 轮重洗后正确答案指向错误');
      }
    }

    // 选择题（A）先测一次「点错」→ 不跳轮 + again
    if (q.type === 'F4A' && !wrongPickTested && ynWrongTested) {
      wrongPickTested = true;
      const wt = Date.now();
      await tap('.f4-tile[data-idx="' + ((q.correct + 1) % q.options.length) + '"]');
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
    }

    const before = await ev('Game.round');
    const starsBefore = await ev('Game.stars');
    const ct = Date.now();

    if (q.type === 'F4A') {
      await tap('.f4-tile[data-idx="' + q.correct + '"]');
    } else if (q.type === 'F4B') {
      await tap('.option[data-idx="' + q.correct + '"]');
    } else {
      const zoneSel = '.f4-zone[data-zone="' + q.zone + '"]';
      const zr = await rectOf(zoneSel);
      if (!dragUsed) {
        dragUsed = true;
        await dragTo('.option[data-idx="' + q.correct + '"]', zr.cx, zr.cy);
      } else {
        await tap('.option[data-idx="' + q.correct + '"]');
        await sleep(520);
        await tap(zoneSel);
      }
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

  // ---------- 3) 通关 ----------
  rep.checks.done = {
    phase: await ev('Game.phase'),
    stars: await ev('Game.stars'),
    viewDone: await ev('!document.getElementById("viewDone").hidden'),
    confetti: await ev('!document.getElementById("confetti").hidden'),
    cleared: await ev('!!Game.progress.cleared["4-4"]'),
    unlockedLevel: await ev('Game.progress.unlockedLevel[4]')
  };
  rep.checks.done.tail = await ev(`window.__played.slice(-10).map(function(p){
    for (var k in window.VOICE_BANK) if (window.VOICE_BANK[k] === p.src) return k;
    return 'unknown';
  })`);
  rep.checks.bothVerdicts = truths.indexOf(true) >= 0 && truths.indexOf(false) >= 0;
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

  await ev('Game.backToMap()'); await sleep(300);
  rep.checks.englishMap = await scan();
  await ev('Game.openIsland(4)'); await sleep(300);
  rep.checks.englishIsland = await scan();
  const islOverflow = await overflow();
  rep.checks.overflowIsland = { sw: islOverflow.sw, iw: islOverflow.iw, sh: islOverflow.sh, ih: islOverflow.ih };
  await shot(TAG + '-island-after.png');

  console.log(JSON.stringify(rep, null, 2));

  const sigOk = rep.tutorial.every(s => s.sigOk);
  const noOverflow = rep.tutorial.every(s => !s.overflow ||
    (s.overflow.sw <= s.overflow.iw + 1 && s.overflow.sh <= s.overflow.ih + 1 &&
     s.overflow.cut.length === 0 && s.overflow.zero.length === 0));
  const audioOk = rep.tutorial.every(s => s.audioOk);
  const hintOk = rep.tutorial.filter(s => s.hint).every(s => s.hintEarly === false && s.hintLater === true);
  const wrongOk = rep.tutorial.filter(s => s.wrong).every(s => s.wrong.advanced === false);
  const advanceOk = rep.tutorial.filter(s => s.click).every(s => s.advanced === true);
  const ok = rep.errors.length === 0 && sigOk && audioOk && hintOk && wrongOk && advanceOk && noOverflow &&
    Object.keys(seenType).length === 3 &&
    rep.checks.bothVerdicts === true &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0 &&
    rep.checks.englishIsland.length === 0 &&
    rep.checks.outro.ended === true &&
    rep.checks.overflowIsland.sw <= rep.checks.overflowIsland.iw + 1;
  console.log('\nsigOk=' + sigOk + ' audioOk=' + audioOk + ' hintOk=' + hintOk + ' wrongOk=' + wrongOk +
    ' advanceOk=' + advanceOk + ' noOverflow=' + noOverflow +
    ' steps=' + rep.checks.outro.totalSteps + ' types=' + JSON.stringify(seenType) +
    ' verdicts=' + JSON.stringify(truths) + ' stars=' + rep.checks.done.stars);
  if (rep.errors.length) console.log('errors: ' + rep.errors.join(' | '));
  console.log(ok ? 'PROBE_PASS' : 'PROBE_FAIL');
  ws.close();
  proc.kill();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('PROBE_ERROR', e); try { proc.kill(); } catch (_) {} process.exit(2); });
