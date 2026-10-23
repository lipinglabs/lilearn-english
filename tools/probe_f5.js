// 第 4 岛第 5 关（L4-W5，游乐场 · 听音模仿）专项测试
//   1) 第 1–3 岛全通 + 第 4 岛第 1–4 关通关 → 第 5 关亮起
//   2) 教学 14 环节：相机示范 1 步 + run/jump/sleep 各（2 演示 + 2 互动）+ 过渡语，按时间线逐步校验
//   3) 三种题型：A 三场景 + 大相机（模仿完点相机）/ B 放大镜剪影猜动物 / C 同种动物三动作里点一只
//   4) 答题 12 轮：答对无人声、答错不推进、点错不推进、通关撒花 + 中文鼓励
//   5) 通关后：岛上旗帜升起、地图第 4 岛「已全清 + 小旗」、第 5 岛解锁
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'f5';
const PORT = 9673 + (W === 390 ? 0 : 1);
const URL_ = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-f5-' + Date.now()),
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
      function cards(root){
        return Array.prototype.map.call(root.querySelectorAll('.f4-card'), function(n){ return n.dataset.subj; }).sort().join(',');
      }
      function stageSig(){
        var s = document.querySelector('.f5-stage');
        if (!s) return null;
        var lens = s.querySelector('.f5-lens');
        if (lens) return 'lens:' + lens.dataset.subj;
        var cam = s.querySelector('.f5-cam');
        var kid = s.querySelector('.f5-kid');
        if (kid) return (cam ? 'camkid:' : 'kid:') + kid.dataset.subj;
        // 演示舞台是「一张场景卡 + 相机」，没有 .f5-row，必须直接数 .f4-card
        var cs = s.querySelectorAll('.f4-card');
        if (cs.length) {
          var list = cards(s);
          if (!cam) return 'row:' + list;
          return (cs.length === 1 ? 'camsolo:' : 'cam' + cs.length + ':') + list;
        }
        if (cam) return 'camonly';
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
  const overflow = () => ev(`(function(){
    var de = document.documentElement;
    // 容器 overflow 会把超出部分裁掉而不撑大 scrollWidth，所以还要逐个量元素边界
    // 教学阶段选项栏是 gone 状态（元素有意为 0 尺寸），只在选项栏可见时才把 .option 计为零尺寸
    var optBar = document.getElementById('options');
    var optShown = !!optBar && !optBar.classList.contains('gone') && !optBar.classList.contains('off');
    var cut = [], zero = [];
    Array.prototype.forEach.call(document.querySelectorAll(
      '.f5-cam, .f5-kid, .f5-lens, .f5-sil, .f4-card, .f4-tile, .option'), function(n){
      var b = n.getBoundingClientRect();
      if (!b.width) { if (optShown || !n.classList.contains('option')) zero.push((n.className || '?') + ':0'); return; }
      if (b.right > window.innerWidth + 1 || b.left < -1) cut.push(n.className + ':' + Math.round(b.left) + '..' + Math.round(b.right));
      // 卡片 / 相机塌成 0 宽时上面的越界判断会静默跳过（RULES §三.11），必须单独断言
      if ((n.classList.contains('f4-card') || n.classList.contains('f5-cam') ||
           n.classList.contains('f5-kid') || n.classList.contains('f5-lens')) && b.width < 24) {
        zero.push((n.dataset.subj || n.className) + ':' + Math.round(b.width));
      }
    });
    return { sw: de.scrollWidth, iw: window.innerWidth, sh: de.scrollHeight, ih: window.innerHeight,
             cut: cut.slice(0, 6), zero: zero.slice(0, 6) };
  })()`);

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };

  // ---------- 0) 解锁链：前 3 岛全通 + 第 4 岛前 4 关通关 ----------
  await ev('Game.resetProgress()');
  await ev('for (var isl = 1; isl <= 3; isl++) { for (var lv = 1; lv <= 5; lv++) Game.markCleared(isl, lv); }');
  await ev('Game.markCleared(4, 1); Game.markCleared(4, 2); Game.markCleared(4, 3); Game.markCleared(4, 4)');
  await ev('Game.openIsland(4)');
  await sleep(300);
  rep.checks.unlock = await ev(`(function(){
    var n4 = document.querySelector('.node[data-level="4"]');
    var n5 = document.querySelector('.node[data-level="5"]');
    return {
      islandTitle: document.querySelector('.titles .t1').textContent,
      node4Playable: n4.classList.contains('playable'),
      node5Locked: n5.classList.contains('locked'),
      node5Text: n5.textContent
    };
  })()`);
  await shot(TAG + '-island.png');

  // ---------- 1) 进关 → 教学（按时间线逐步校验） ----------
  await ev('document.querySelector(\'.node[data-level="5"]\').click()');
  await sleep(300);
  await ev('document.getElementById("btnStart").click()');

  const STEPS = [
    // 新交互：只有一台大相机，老师示范「它是什么、什么时候点它」
    { n: 'cam-intro', sig: 'camonly', audio: 'l4w5_t_cam', shot: 'tut-cam' },
    // run：演示 A（狗在跑）+ 互动 A（小人原地跑）+ 演示 B（马在跑，拉近）+ 互动 B
    { n: 'run-demo1', sig: 'camsolo:dog_run', audio: 'l4w5_t_run1', noop: '.f5-cam', shot: 'tut-run-demo' },
    { n: 'run-ask1', sig: 'camkid:kid_run_a', audio: 'l4w5_t_run2', hint: true, click: '.f5-cam', shot: 'tut-run-hint' },
    { n: 'run-demo2', sig: 'camsolo:horse_run', audio: 'l4w5_t_run3', shot: 'tut-run-horse' },
    { n: 'run-ask2', sig: 'camkid:kid_run_b', audio: 'l4w5_t_run4', click: '.f5-cam' },
    // jump
    { n: 'jump-demo1', sig: 'camsolo:frog_jump', audio: 'l4w5_t_jump1', shot: 'tut-jump-frog' },
    { n: 'jump-ask1', sig: 'camkid:kid_jump_a', audio: 'l4w5_t_jump2', hint: true, click: '.f5-cam', shot: 'tut-jump-hint' },
    { n: 'jump-demo2', sig: 'camsolo:kangaroo_jump', audio: 'l4w5_t_jump3' },
    { n: 'jump-ask2', sig: 'camkid:kid_jump_b', audio: 'l4w5_t_jump4', click: '.f5-cam' },
    // sleep
    { n: 'sleep-demo1', sig: 'camsolo:cat_sleep', audio: 'l4w5_t_sleep1', shot: 'tut-sleep-cat' },
    { n: 'sleep-ask1', sig: 'camkid:kid_sleep_a', audio: 'l4w5_t_sleep2', hint: true, click: '.f5-cam', shot: 'tut-sleep-hint' },
    { n: 'sleep-demo2', sig: 'camsolo:pig_sleep', audio: 'l4w5_t_sleep3' },
    { n: 'sleep-ask2', sig: 'camkid:kid_sleep_b', audio: 'l4w5_t_sleep4', click: '.f5-cam' },
    // 过渡语（自带）
    { n: 'outro', sig: 'row:cat_sleep,dog_run,frog_jump', audio: 'l4w5_t_done' }
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

    // 演示阶段的相机是「提示」，点它不能推进（唯一按钮也要防误触）。
    // 必须紧贴舞台出现时测：演示步说完 1.5 秒会自动前进，晚测就把「自动推进」误判成「被点推进」。
    if (st.noop) {
      const before = await ev('window.__stageLog.length');
      await tap(st.noop);
      await sleep(260);
      row.noop = {
        advanced: (await ev('window.__stageLog.length')) > before,
        gotRight: await ev(`(function(){
          var c = document.querySelector('.f5-cam');
          return c ? c.classList.contains('right') : null;
        })()`)
      };
      if (row.noop.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示里的相机被点却前进了');
      if (row.noop.gotRight) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示里的相机被点却亮了');
    }

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
        var cam = document.querySelector('.f5-cam');
        var hb = h.getBoundingClientRect(), cb = cam ? cam.getBoundingClientRect() : null;
        return { inDisplay: !!h.closest('#askDisplay'), anim: getComputedStyle(h).animationName,
                 stillAsking: Game.tutorial && Game.tutorial.ask === 'cam',
                 // 指尖应落在相机按钮右下侧（指着它但不盖住图标）
                 nearCam: cb ? (hb.left > cb.left && hb.left < cb.right && hb.top > cb.top - 8 && hb.top < cb.bottom + 40) : null,
                 stars: Game.stars };
      })()`);
      if (row.hintGeom && row.hintGeom.nearCam === false) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）小手指没有指向相机按钮');
      if (row.hintGeom && row.hintGeom.stars !== 0) rep.errors.push('教学阶段不该有星星：' + row.hintGeom.stars);
      await sleep(300);
    }

    if (st.click) {
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
      if (row.geo && !row.geo.inTarget) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）相机按钮中心被遮挡：' + row.geo.hit);
      await tap(st.click);
      await sleep(1400);
      row.clicked = true;
      row.advanced = await wait('window.__stageLog.length > ' + before, 8000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点相机后没有推进');
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
  rep.checks.outroAudio = await ev(`window.__played.map(function(p){
    for (var k in window.VOICE_BANK) if (window.VOICE_BANK[k] === p.src) return k;
    return 'unknown';
  }).filter(function(k){ return /l4w5_t_done/.test(k); }).length`);
  await shot(TAG + '-ask-first.png');

  // ---------- 2) 12 轮答题 ----------
  const seenType = {};
  const seenShot = {};
  let wrongPickTested = false;
  let lensTapTested = false;

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(200);
    let snap = await ev('Game.snapshot()');
    let q = snap.question;
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, subj: q.subj, animal: q.animal, act: q.act,
                  correct: q.correct, opts: q.options, audio: q.audio };

    // 题型 A：三个不同动作场景 + 一台相机
    if (q.type === 'F5A') {
      row.sceneCount = q.options.length;
      row.uniqueOpts = new Set(q.options).size;
      row.camCount = await ev('document.querySelectorAll("#askDisplay .f5-cam").length');
      row.choiceTiles = await ev('document.querySelectorAll("#askDisplay .f4-card").length');
      if (row.sceneCount !== 3 || row.uniqueOpts !== 3) rep.errors.push('第 ' + r + ' 轮 A 题场景不是 3 个不同的：' + JSON.stringify(q.options));
      if (row.camCount !== 1) rep.errors.push('第 ' + r + ' 轮 A 题相机按钮数量异常：' + row.camCount);
      if (row.choiceTiles !== 3) rep.errors.push('第 ' + r + ' 轮 A 题场景卡数量异常：' + row.choiceTiles);
      // 选项指纹里必须包含语音点名的那一个（场景与语音成对出现）
      if (q.options[q.correct] !== q.subj) rep.errors.push('第 ' + r + ' 轮 A 题正确答案指向错误：' + JSON.stringify(q.options) + ' subj=' + q.subj);
    }

    // 题型 B：剪影必须就是正确选项那只动物，动作与语音一致
    if (q.type === 'F5B') {
      row.lens = await ev(`(function(){
        var l = document.querySelector('.f5-lens');
        return l ? l.dataset.subj : null;
      })()`);
      row.silOpts = await ev('document.querySelectorAll("#options .option:not([hidden])").length');
      row.lensOk = row.lens === q.animal + '_' + q.act;
      row.audioActOk = (q.audios && q.audios[0] || '') === 'l4w5_b_' + q.act;
      row.answerOk = q.options[q.correct] === q.animal;
      row.uniqueOpts = new Set(q.options).size;
      if (!row.lensOk) rep.errors.push('第 ' + r + ' 轮剪影与答案不一致：' + row.lens + ' vs ' + q.animal + '_' + q.act);
      if (!row.audioActOk) rep.errors.push('第 ' + r + ' 轮语音与动作不一致：' + (q.audios || []).join(',') + ' act=' + q.act);
      if (!row.answerOk) rep.errors.push('第 ' + r + ' 轮正确答案不指向剪影动物：' + JSON.stringify(q.options));
      if (row.uniqueOpts !== 3) rep.errors.push('第 ' + r + ' 轮 B 题选项重复：' + JSON.stringify(q.options));
      if (row.silOpts !== 3) rep.errors.push('第 ' + r + ' 轮 B 题可见选项不是 3 个：' + row.silOpts);
      // 剪影本身分不出「在跑 / 在跳 / 在睡」，动作提示必须画在镜片里、且不能被圆形裁掉
      row.deco = await ev(`(function(){
        var d = document.querySelector('.f5-lens-deco');
        if (!d) return null;
        var sil = document.querySelector('.f5-sil').getBoundingClientRect();
        var ps = Array.prototype.map.call(d.querySelectorAll('path'), function(p){
          var b = p.getBoundingClientRect();
          return { w: Math.round(b.width), h: Math.round(b.height),
                   inside: b.left >= sil.left - 2 && b.right <= sil.right + 2 &&
                           b.top >= sil.top - 2 && b.bottom <= sil.bottom + 2 };
        });
        return { n: ps.length, parts: ps };
      })()`);
      if (!row.deco || row.deco.n === 0) rep.errors.push('第 ' + r + ' 轮剪影里没有动作提示');
      // 直线的 bbox 高/宽天然为 0，所以只有「两个方向都极小」才算被裁没了
      else if (row.deco.parts.some(function (p) { return (p.w < 3 && p.h < 3) || !p.inside; })) {
        rep.errors.push('第 ' + r + ' 轮动作提示被裁掉了：' + JSON.stringify(row.deco.parts));
      }
    }

    // 题型 C：三张同一只动物的不同动作
    if (q.type === 'F5C') {
      row.sameAnimal = q.options.every(function (s) { return String(s).indexOf(q.animal + '_') === 0; });
      row.uniqueOpts = new Set(q.options).size;
      row.answerOk = q.options[q.correct] === q.subj;
      if (!row.sameAnimal) rep.errors.push('第 ' + r + ' 轮 C 题混进了别的动物：' + JSON.stringify(q.options) + ' animal=' + q.animal);
      if (row.uniqueOpts !== 3) rep.errors.push('第 ' + r + ' 轮 C 题选项重复：' + JSON.stringify(q.options));
      if (!row.answerOk) rep.errors.push('第 ' + r + ' 轮 C 题正确答案指向错误：' + JSON.stringify(q.options) + ' subj=' + q.subj);
    }

    if (!seenShot[q.type + (q.act || '')]) {
      seenShot[q.type + (q.act || '')] = 1;
      await sleep(400);
      await shot(TAG + '-q-' + q.type + (q.act ? '-' + q.act : '') + '.png');
    }

    // 题型 B：先点错一个动物 → 不跳轮 + again
    if (q.type === 'F5B' && !lensTapTested) {
      lensTapTested = true;
      const wrongIdx = (q.correct + 1) % 3;
      const wt = Date.now();
      await tap('.option[data-idx="' + wrongIdx + '"]');
      await sleep(1100);
      const after = await ev('Game.snapshot()');
      row.wrongPick = {
        advanced: after.round !== r,
        stillAsking: after.phase === 'asking',
        audio: (await keysBetween(wt, wt + 2000)).filter(k => k !== 'unknown')
      };
      if (row.wrongPick.advanced) rep.errors.push('第 ' + r + ' 轮点错动物却前进了');
      await sleep(1800);
      snap = await ev('Game.snapshot()');
      q = snap.question;
      row.correctAfterShuffle = q.correct;
      if (q.options[q.correct] !== q.animal) rep.errors.push('第 ' + r + ' 轮重洗后正确答案指向错误');
    }

    // 题型 C：先点错一只 → 不跳轮
    if (q.type === 'F5C' && !wrongPickTested) {
      wrongPickTested = true;
      const wt = Date.now();
      await tap('.f4-tile[data-idx="' + ((q.correct + 1) % 3) + '"]');
      await sleep(1100);
      const after = await ev('Game.snapshot()');
      row.wrongPick = {
        advanced: after.round !== r,
        stillAsking: after.phase === 'asking',
        audio: (await keysBetween(wt, wt + 2000)).filter(k => k !== 'unknown')
      };
      if (row.wrongPick.advanced) rep.errors.push('第 ' + r + ' 轮点错动作却前进了');
      await sleep(1800);
      snap = await ev('Game.snapshot()');
      q = snap.question;
      row.correctAfterShuffle = q.correct;
    }

    const before = await ev('Game.round');
    const starsBefore = await ev('Game.stars');
    const ct = Date.now();

    if (q.type === 'F5A') {
      await tap('#askDisplay .f5-cam');
    } else if (q.type === 'F5B') {
      await tap('.option[data-idx="' + q.correct + '"]');
    } else {
      await tap('.f4-tile[data-idx="' + q.correct + '"]');
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
    grand: await ev('document.getElementById("viewDone").classList.contains("grand")'),
    confetti: await ev('!document.getElementById("confetti").hidden'),
    islandFlag: await ev('!!document.querySelector(".stage .island-flag")'),
    cleared: await ev('!!Game.progress.cleared["4-5"]'),
    unlockedIsland: await ev('Game.progress.unlockedIsland')
  };
  rep.checks.done.tail = await ev(`window.__played.slice(-10).map(function(p){
    for (var k in window.VOICE_BANK) if (window.VOICE_BANK[k] === p.src) return k;
    return 'unknown';
  })`);
  await sleep(900);
  await shot(TAG + '-done.png');

  // ---------- 4) 视觉断言 + 地图上的「第 4 岛全清」 ----------
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
    var c4 = document.querySelector('.island[data-island="4"]');
    var c5 = document.querySelector('.island[data-island="5"]');
    return {
      island4Cleared: c4.classList.contains('cleared'),
      island4Flag: !!c4.querySelector('.island-flag-badge'),
      island4Locked: c4.classList.contains('locked'),
      island5Unlocked: c5 && c5.classList.contains('unlocked'),
      island5Locked: c5 && c5.classList.contains('locked')
    };
  })()`);
  await shot(TAG + '-map-after.png');

  await ev('Game.openIsland(4)'); await sleep(300);
  rep.checks.englishIsland = await scan();
  rep.checks.islandAfter = await ev(`(function(){
    var n5 = document.querySelector('.node[data-level="5"]');
    return { node5Cleared: n5.classList.contains('done'), node5Text: n5.textContent };
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
  const hintOk = rep.tutorial.filter(s => s.hint).every(s => s.hintEarly === false && s.hintLater === true);
  const noopOk = rep.tutorial.filter(s => s.noop).every(s => s.noop.advanced === false);
  const advanceOk = rep.tutorial.filter(s => s.click).every(s => s.advanced === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1 && s.voiceOnCorrect.length === 0);
  const ok = rep.errors.length === 0 && sigOk && audioOk && hintOk && noopOk && advanceOk && roundsOk && noOverflow &&
    Object.keys(seenType).length === 3 && seenType.F5A === 4 && seenType.F5B === 4 && seenType.F5C === 4 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === true && rep.checks.done.islandFlag === true &&
    rep.checks.done.unlockedIsland === 5 &&
    rep.checks.mapAfter.island4Cleared === true && rep.checks.mapAfter.island4Flag === true &&
    rep.checks.mapAfter.island5Unlocked === true &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0 &&
    rep.checks.englishIsland.length === 0 &&
    rep.checks.outro.ended === true &&
    rep.checks.overflowIsland.sw <= rep.checks.overflowIsland.iw + 1;
  console.log('\nsigOk=' + sigOk + ' audioOk=' + audioOk + ' hintOk=' + hintOk + ' noopOk=' + noopOk +
    ' advanceOk=' + advanceOk + ' roundsOk=' + roundsOk + ' noOverflow=' + noOverflow +
    ' steps=' + rep.checks.outro.totalSteps + ' types=' + JSON.stringify(seenType) +
    ' stars=' + rep.checks.done.stars + ' grand=' + rep.checks.done.grand +
    ' flag=' + rep.checks.done.islandFlag + ' island4Cleared=' + rep.checks.mapAfter.island4Cleared);
  if (rep.errors.length) console.log('errors: ' + rep.errors.join(' | '));
  console.log(ok ? 'PROBE_PASS' : 'PROBE_FAIL');
  ws.close();
  proc.kill();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('PROBE_ERROR', e); try { proc.kill(); } catch (_) {} process.exit(2); });
