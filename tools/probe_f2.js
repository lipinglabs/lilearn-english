// 第 4 岛第 2 关（L4-W2，野生动物 Wild animals）专项测试
//   1) 第 3 岛全通 + 第 4 岛第 1 关通关 → 第 2 关亮起、第 3 关仍锁
//   2) 教学（RULES §三.10 双倍量）：16 环节 + 过渡语，每词 2 演示 + 2 互动，按时间线逐步校验
//   3) 三题型：A 听名字找 / B 听描述找 / C 把动物拖（或点）进丛林 / 农场
//   4) 答题 12 轮：答对无人声、答错不推进、放错栖息地不判对、通关撒花 + 鼓励
//   5) 视觉：无英文字母（innerText + aria-label）、当前视口无溢出
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'f2';
const PORT = 9641 + (W === 390 ? 0 : 1);
const URL_ = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-f2-' + Date.now()),
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
        var s = document.querySelector('.f2-stage');
        if (!s) return null;
        if (s.querySelector('.f2-zoom')) return 'zoom';
        if (s.querySelector('.f2-scene')) return 'scene';
        var g = s.querySelector('.f2-grid');
        if (g) return 'grid' + g.dataset.n + ':' + Array.prototype.map.call(
          g.querySelectorAll('.f2-cell[data-animal]'), function(n){ return n.dataset.animal; }).sort().join(',');
        var p = s.querySelector('.f2-pair');
        if (p) return 'pair:' + Array.prototype.map.call(p.querySelectorAll('.f2-cell'), function(n){
          return n.dataset.animal || (n.querySelector('[data-asset]') ? 'banana' : '?');
        }).sort().join(',');
        var c = s.querySelector('.f2-cell');
        if (c) return 'one:' + (c.dataset.animal || '?');
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

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };

  // ---------- 0) 解锁链 ----------
  await ev('Game.resetProgress()');
  await ev('for (var lv = 1; lv <= 5; lv++) Game.markCleared(3, lv)');
  await ev('Game.markCleared(4, 1)');
  await ev('Game.openIsland(4)');
  await sleep(300);
  rep.checks.unlock = await ev(`(function(){
    var n2 = document.querySelector('.node[data-level="2"]');
    var n3 = document.querySelector('.node[data-level="3"]');
    return {
      islandTitle: document.querySelector('.titles .t1').textContent,
      node2Playable: n2.classList.contains('playable'),
      node2Locked: n2.classList.contains('locked'),
      node3Locked: n3.classList.contains('locked')
    };
  })()`);
  await shot(TAG + '-island.png');

  // ---------- 1) 进关 → 教学（按时间线逐步校验） ----------
  await ev('document.querySelector(\'.node[data-level="2"]\').click()');
  await sleep(300);
  await ev('document.getElementById("btnStart").click()');

  const STEPS = [
    // 狮子：演示 A（单词+吼叫）→ 演示 B（草原大图）→ 互动 A（二选一）→ 互动 B（三选一）
    { n: 'lion-demo1', sig: 'one:lion', audio: 'l4w2_t_lion1', shot: 'tut-lion' },
    { n: 'lion-demo2', sig: 'scene', audio: 'l4w2_t_lion2', shot: 'tut-savanna' },
    { n: 'lion-ask1', sig: 'pair:dog,lion', audio: 'l4w2_t_ask_lion', hint: true,
      click: '.f2-pair .f2-cell[data-animal="lion"]', wrong: '.f2-pair .f2-cell[data-animal="dog"]', shot: 'tut-hint' },
    { n: 'lion-ask2', sig: 'grid3:lion,monkey,tiger', audio: 'l4w2_f_lion',
      click: '.f2-grid .f2-cell[data-animal="lion"]' },
    // 老虎
    { n: 'tiger-demo1', sig: 'one:tiger', audio: 'l4w2_t_tiger1' },
    { n: 'tiger-demo2', sig: 'zoom', audio: 'l4w2_t_tiger2', shot: 'tut-stripes' },
    { n: 'tiger-ask1', sig: 'pair:cat,tiger', audio: 'l4w2_f_tiger',
      click: '.f2-pair .f2-cell[data-animal="tiger"]' },
    { n: 'tiger-ask2', sig: 'grid3:elephant,lion,tiger', audio: 'l4w2_b_stripes',
      click: '.f2-grid .f2-cell[data-animal="tiger"]' },
    // 猴子
    { n: 'monkey-demo1', sig: 'one:monkey', audio: 'l4w2_t_monkey1' },
    { n: 'monkey-demo2', sig: 'pair:banana,monkey', audio: 'l4w2_t_monkey2', shot: 'tut-monkey' },
    { n: 'monkey-ask1', sig: 'pair:dog,monkey', audio: 'l4w2_f_monkey',
      click: '.f2-pair .f2-cell[data-animal="monkey"]' },
    { n: 'monkey-ask2', sig: 'grid3:lion,monkey,tiger', audio: 'l4w2_b_bananas',
      click: '.f2-grid .f2-cell[data-animal="monkey"]' },
    // 大象
    { n: 'elephant-demo1', sig: 'one:elephant', audio: 'l4w2_t_elephant1' },
    { n: 'elephant-demo2', sig: 'pair:elephant,mouse', audio: 'l3_el_big', shot: 'tut-big' },
    { n: 'elephant-ask1', sig: 'pair:elephant,pig', audio: 'l4w2_f_elephant',
      click: '.f2-pair .f2-cell[data-animal="elephant"]' },
    { n: 'elephant-ask2', sig: 'grid3:cat,elephant,monkey', audio: 'l4w2_b_big',
      click: '.f2-grid .f2-cell[data-animal="elephant"]' }
  ];

  for (let i = 0; i < STEPS.length; i++) {
    const st = STEPS[i];
    const reached = await wait('window.__stageLog.length >= ' + (i + 1), 20000);
    const entry = reached ? JSON.parse(await ev('JSON.stringify(window.__stageLog[' + i + '])')) : null;
    const row = { step: st.n, reached: reached, sig: entry ? entry.sig : null, sigOk: !!entry && entry.sig === st.sig };
    if (entry) {
      await sleep(180);
      // 舞台记录由 setTimeout(0) 延迟落库，语音可能早一拍开始，窗口往前放宽 900ms
      row.audio = (await keysBetween(entry.t - 900, entry.t + 2600)).filter(k => k !== 'unknown');
      row.audioOk = row.audio.indexOf(st.audio) >= 0;
    }
    row.overflow = await ev(`(function(){
      var de = document.documentElement;
      // 容器 overflow 会把超出部分裁掉而不撑大 scrollWidth，所以还要逐个量元素边界
      var cut = [];
      Array.prototype.forEach.call(document.querySelectorAll('.f2-tile, .f2-cell, .f2-zone, .f2-zoom, .f2-scene'), function(n){
        var b = n.getBoundingClientRect();
        if (b.width && (b.right > window.innerWidth + 1 || b.left < -1)) cut.push(n.className + ':' + Math.round(b.left) + '..' + Math.round(b.right));
      });
      return { sw: de.scrollWidth, iw: window.innerWidth, sh: de.scrollHeight, ih: window.innerHeight, cut: cut };
    })()`);
    if (st.shot) { await sleep(120); await shot(TAG + '-' + st.shot + '.png'); }

    if (st.hint) {
      // 4 秒静默才该出小手指：2.4 秒时必须还没有
      await sleep(2400);
      row.hintEarly = await ev(sel('.tut-hint'));
      row.hintLater = await wait(sel('.tut-hint'), 5000);
      row.hintGeom = await ev(`(function(){
        var h = document.querySelector('.tut-hint');
        if (!h) return null;
        var s = getComputedStyle(h);
        var tg = document.querySelector('.f2-pair .f2-cell[data-animal="lion"]');
        var b = h.getBoundingClientRect();
        var tr = tg ? tg.getBoundingClientRect() : null;
        return { opacity: s.opacity, anim: s.animationName,
                 onRightSide: !tr || (b.left > tr.left + tr.width * 0.45),
                 stillAsking: Game.tutorial && Game.tutorial.ask === 'lion',
                 stars: Game.stars };
      })()`);
      const wt = Date.now();
      await tap(st.wrong);
      await sleep(1100);
      row.wrong = {
        advanced: await ev('Game.tutorial && Game.tutorial.ask !== "lion"'),
        stillAsking: await ev('Game.tutorial && Game.tutorial.ask === "lion"'),
        audio: (await keysBetween(wt, wt + 1800)).filter(k => k !== 'unknown')
      };
      await sleep(300);
    }

    if (st.click) {
      const ct = Date.now();
      await tap(st.click);
      await sleep(1500);
      row.clicked = true;
      row.advanced = !(await ev(sel(st.sig.indexOf('pair') === 0 ? '.f2-pair' : '.f2-grid')));
      row.clickAudio = (await keysBetween(ct, ct + 900)).filter(k => k !== 'unknown');
    }
    rep.tutorial.push(row);
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
  }).filter(function(k){ return /l4w2_t_done/.test(k); }).length`);
  await shot(TAG + '-ask-first.png');

  // ---------- 2) 12 轮答题 ----------
  const seenType = {};
  const seenShot = {};
  let wrongDropTested = false;
  let wrongPickTested = false;
  let dragUsed = false;

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(200);
    let snap = await ev('Game.snapshot()');
    let q = snap.question;
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, animal: q.animal, zone: q.zone, desc: q.desc,
                  correct: q.correct, opts: q.options, audio: q.audio };
    if (!seenShot[q.type]) { seenShot[q.type] = 1; await sleep(400); await shot(TAG + '-q-' + q.type + '.png'); }

    // 题型 C：先把动物放到「另一个栖息地」→ 不能判对
    if (q.type === 'F2C' && !wrongDropTested) {
      wrongDropTested = true;
      const wrongZone = q.zone === 'jungle' ? 'farm' : 'jungle';
      const wt = Date.now();
      await tap('.option[data-idx="' + q.correct + '"]');
      await sleep(520);
      await tap('.f2-zone[data-zone="' + wrongZone + '"]');
      await sleep(1100);
      const after = await ev('Game.snapshot()');
      row.wrongDrop = {
        advanced: after.round !== r,
        stillAsking: after.phase === 'asking',
        audio: (await keysBetween(wt, wt + 2000)).filter(k => k !== 'unknown')
      };
      await sleep(1800);
      snap = await ev('Game.snapshot()');
      q = snap.question;
      row.correctAfterShuffle = q.correct;
    }

    // 选择题（A/B）先测一次「点错」→ 不跳轮 + again
    if ((q.type === 'F2A' || q.type === 'F2B') && !wrongPickTested) {
      wrongPickTested = true;
      const wt = Date.now();
      await tap('.f2-tile[data-idx="' + ((q.correct + 1) % 3) + '"]');
      await sleep(1100);
      const after = await ev('Game.snapshot()');
      row.wrongPick = {
        advanced: after.round !== r,
        stillAsking: after.phase === 'asking',
        audio: (await keysBetween(wt, wt + 2000)).filter(k => k !== 'unknown')
      };
      await sleep(1800);
      snap = await ev('Game.snapshot()');
      q = snap.question;
      row.correctAfterShuffle = q.correct;
    }

    const before = await ev('Game.round');
    const starsBefore = await ev('Game.stars');
    const ct = Date.now();

    if (q.type === 'F2A' || q.type === 'F2B') {
      await tap('.f2-tile[data-idx="' + q.correct + '"]');
    } else {
      const zoneSel = '.f2-zone[data-zone="' + q.zone + '"]';
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

    if (r === 1) {
      row.overflow = await ev(`(function(){
        var de = document.documentElement;
        return { sw: de.scrollWidth, iw: window.innerWidth, sh: de.scrollHeight, ih: window.innerHeight };
      })()`);
    }

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
    cleared: await ev('!!Game.progress.cleared["4-2"]'),
    unlockedLevel: await ev('Game.progress.unlockedLevel[4]')
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

  await ev('Game.backToMap()'); await sleep(300);
  rep.checks.englishMap = await scan();
  await ev('Game.openIsland(4)'); await sleep(300);
  rep.checks.englishIsland = await scan();
  rep.checks.overflowIsland = await ev(`(function(){
    var de = document.documentElement;
    return { sw: de.scrollWidth, iw: window.innerWidth, sh: de.scrollHeight, ih: window.innerHeight };
  })()`);
  await shot(TAG + '-island-after.png');

  console.log(JSON.stringify(rep, null, 2));

  const sigOk = rep.tutorial.every(s => s.sigOk);
  const noOverflow = rep.tutorial.every(s => !s.overflow ||
    (s.overflow.sw <= s.overflow.iw + 1 && s.overflow.sh <= s.overflow.ih + 1 && s.overflow.cut.length === 0));
  const audioOk = rep.tutorial.every(s => s.audioOk);
  const hintOk = rep.tutorial.filter(s => s.hint).every(s => s.hintEarly === false && s.hintLater === true);
  const wrongOk = rep.tutorial.filter(s => s.wrong).every(s => s.wrong.advanced === false);
  const ok = rep.errors.length === 0 && sigOk && audioOk && hintOk && wrongOk && noOverflow &&
    Object.keys(seenType).length === 3 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0 &&
    rep.checks.englishIsland.length === 0 &&
    rep.checks.outro.ended === true;
  console.log('\nsigOk=' + sigOk + ' audioOk=' + audioOk + ' hintOk=' + hintOk + ' wrongOk=' + wrongOk +
    ' noOverflow=' + noOverflow +
    ' steps=' + rep.checks.outro.totalSteps + ' types=' + JSON.stringify(seenType) + ' stars=' + rep.checks.done.stars);
  console.log(ok ? 'PROBE_PASS' : 'PROBE_FAIL');
  ws.close();
  proc.kill();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('PROBE_ERROR', e); try { proc.kill(); } catch (_) {} process.exit(2); });
