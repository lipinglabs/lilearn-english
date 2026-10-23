// 第 3 岛第 3 关（B3，长 / 短 Long / Short）专项测试
//   1) 第 3 岛第 2 关通关 → 第 3 关可玩
//   2) 教学：四个案例（长蛇/长面包/短铅笔/短围巾）→ 两道互动跟做 → 4 秒无操作出小手指 → 点对进答题
//   3) 三题型：A 两同物听 long/short 找对应、B 三动物听长特征找长动物、C 拖/点长/短香蕉进 Long/Short 箱
//   4) 答题 12 轮：答对无人声、答错洗牌、放错箱（C）不判对、通关彩带 + 中文鼓励 + 通用英文夸奖
//   5) 视觉：无英文字母、双视口无溢出
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'b3';
const PORT = 9635;
const URL_ = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-b3-' + Date.now()),
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
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true }, sessionId);

  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    (function(){
      window.__played = [];
      var OA = window.Audio;
      window.Audio = function(src){
        var a = new OA(src);
        a.play = function(){ window.__played.push(src); setTimeout(function(){ try{ a.dispatchEvent(new Event('ended')); }catch(e){} }, 70); return Promise.resolve(); };
        a.pause = function(){};
        return a;
      };
    })();
  ` }, sessionId);

  await send('Page.navigate', { url: URL_ }, sessionId);
  const boot = async () => {
    for (let i = 0; i < 200; i++) {
      const r = await send('Runtime.evaluate', { expression: 'typeof window.Game !== "undefined"', returnByValue: true }, sessionId);
      if (r.result.value) break;
      await sleep(120);
    }
    await sleep(360);
  };
  await boot();

  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
    if (r.exceptionDetails) throw new Error('EVAL: ' + expr.slice(0, 90) + ' => ' + JSON.stringify(r.exceptionDetails.exception));
    return r.result.value;
  };
  const wait = async (expr, ms = 12000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await ev(expr)) return true; await sleep(60); }
    return false;
  };
  const shot = async name => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    fs.writeFileSync(name, Buffer.from(data, 'base64'));
  };
  const playedKeys = () => ev(`window.__played.map(function(s){
    for (var k in window.VOICE_BANK) if (window.VOICE_BANK[k] === s) return k;
    return 'unknown';
  })`);
  const clearPlayed = () => ev('window.__played.length = 0');
  const rectOf = sel => ev(`(function(){
    var n = document.querySelector(${JSON.stringify(sel)});
    if (!n) return null;
    var b = n.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height, cx: b.left + b.width/2, cy: b.top + b.height/2 };
  })()`);
  const mouse = (type, x, y, buttons) => send('Input.dispatchMouseEvent',
    { type, x, y, button: 'left', clickCount: 1, buttons: buttons === undefined ? 1 : buttons }, sessionId);
  const tapAt = async (x, y) => { await mouse('mousePressed', x, y, 1); await sleep(40); await mouse('mouseReleased', x, y, 0); await sleep(40); };
  const tap = async sel => { const c = await rectOf(sel); if (!c) return false; await tapAt(c.cx, c.cy); return true; };
  const dragTo = async (fromSel, tx, ty) => {
    const a = await rectOf(fromSel);
    if (!a) return false;
    await mouse('mousePressed', a.cx, a.cy, 1); await sleep(40);
    for (let k = 1; k <= 7; k++) { await mouse('mouseMoved', a.cx + (tx - a.cx) * k / 7, a.cy + (ty - a.cy) * k / 7, 1); await sleep(20); }
    await mouse('mouseReleased', tx, ty, 0); await sleep(60);
    return true;
  };

  const rep = { checks: {}, types: {}, rounds: [], errors: [] };

  // ---------- 0) 第 3 岛第 2 关已通 → 第 3 关可玩 ----------
  // 关键：unlockedLevel[3] = 3 且 cleared['3-2'] = true → 第 3 关解锁
  const base = { unlockedIsland: 3, unlockedLevel: { 1: 5, 2: 5, 3: 3 },
    cleared: { '1-1': true, '1-2': true, '1-3': true, '1-4': true, '1-5': true,
               '2-1': true, '2-2': true, '2-3': true, '2-4': true, '2-5': true,
               '3-1': true, '3-2': true }, stars: {} };
  await ev('localStorage.setItem("lilearn.progress.v1", ' + JSON.stringify(JSON.stringify(base)) + ')');
  await send('Page.reload', {}, sessionId);
  await boot();
  rep.checks.level3 = await ev(`(function(){
    Game.openIsland(3);
    var n3 = document.querySelector('.node[data-level="3"]');
    return { cls: n3.className, locked: n3.classList.contains('locked') };
  })()`);
  // 同时确认第 4 关（不存在）不会越界，且第 3 关是最后一关
  rep.checks.level3.nodeCount = await ev('document.querySelectorAll(".node[data-level]").length');

  // ---------- 1) 进关 → 默认走教学 ----------
  await ev('document.querySelector(\'.node[data-level="3"]\').click()');
  await sleep(240);
  rep.checks.startScreen = {
    phase: await ev('Game.phase'),
    hasStart: await ev('!document.getElementById("btnStart").hidden')
  };
  await clearPlayed();
  await ev('document.getElementById("btnStart").click()');
  await wait('Game.phase === "tutorial"', 5000);
  rep.checks.enter = {
    phase: await ev('Game.phase'),
    optionsHidden: await ev('document.getElementById("options").classList.contains("gone")'),
    stars: await ev('Game.stars')
  };
  rep.checks.tutObjs = await ev(`(function(){
    var a = Array.prototype.map.call(document.querySelectorAll('.b3-tut-obj'), function(n){
      return { ls: n.dataset.ls, obj: (n.querySelector('.ls-obj') ? n.querySelector('.ls-obj').dataset.obj : null) };
    });
    return { count: a.length, objs: a, ask: Game.tutorial && Game.tutorial.ask };
  })()`);
  rep.checks.tutObjs.audio = (await playedKeys()).filter(k => k !== 'unknown' && /l3w3_tut/.test(k));
  await shot(TAG + '-tut.png');

  // 等第一道互动题出现（教学四案例播完后 ask 被设为 long/short）
  rep.checks.tutObjs.firstAsk = await wait('Game.tutorial && Game.tutorial.ask', 16000)
    ? await ev('Game.tutorial.ask') : null;
  // 不到 4 秒不能出小手指
  await sleep(2600);
  rep.checks.tutObjs.hintEarly = await ev('!!document.querySelector(".tut-hint")');

  // ---------- 2) 4 秒静默引导：小手指只示范，不代做 ----------
  rep.checks.hintAppeared = await wait('!!document.querySelector(".tut-hint")', 6000);
  const askCmp = rep.checks.tutObjs.firstAsk;
  rep.checks.hint = await ev(`(function(){
    var h = document.querySelector('.tut-hint');
    if (!h) return null;
    var s = getComputedStyle(h);
    var t = document.querySelector('.b3-tut-obj[data-ls="${askCmp}"]').getBoundingClientRect();
    var b = h.getBoundingClientRect();
    return { opacity: s.opacity, anim: s.animationName,
             nearTarget: Math.abs(b.left + b.width/2 - (t.left + t.width*0.74)) < t.width * 0.7,
             stillAsking: Game.tutorial && Game.tutorial.ask === ${JSON.stringify(askCmp)},
             stars: Game.stars };
  })()`);
  await shot(TAG + '-hint.png');
  await sleep(1200);
  rep.checks.hintLoops = await ev('!!document.querySelector(".tut-hint")');

  // 点错（与 ask 相反的那个）→ 抖动 + 温柔鼓励 + 不推进
  await clearPlayed();
  const wrongLs = askCmp === 'long' ? 'short' : 'long';
  await tap('.b3-tut-obj[data-ls="' + wrongLs + '"]');
  await sleep(600);
  const hintRep = rep.checks.hint || (rep.checks.hint = {});
  hintRep.wrongAudio = (await playedKeys()).filter(k => k !== 'unknown');
  hintRep.wrongBlocked = await ev('Game.tutorial && Game.tutorial.ask === ' + JSON.stringify(askCmp));

  // 点对（与 ask 一致）→ 手指消失、进下一题/答题
  await tap('.b3-tut-obj[data-ls="' + askCmp + '"]');
  await sleep(1100);
  hintRep.cleared = await ev('!document.querySelector(".tut-hint")');

  // 第二道互动题（铅笔短）→ 直接点对
  const secondAsk = await wait('Game.tutorial && Game.tutorial.ask', 6000) ? await ev('Game.tutorial.ask') : null;
  if (secondAsk) {
    rep.checks.secondAsk = secondAsk;
    await clearPlayed();
    await tap('.b3-tut-obj[data-ls="' + secondAsk + '"]');
    await sleep(1200);
  }
  rep.checks.enter.quizStarted = await wait('Game.phase === "asking"', 14000);
  rep.checks.enter.optionsBack = await ev('!document.getElementById("options").classList.contains("gone")');
  rep.checks.enter.starsDuringTutorial = await ev('Game.stars');
  rep.checks.enter.readyAudio = (await playedKeys()).filter(k => k !== 'unknown');
  await sleep(300);
  await shot(TAG + '-ask-A.png');

  // ---------- 3) 12 轮答题 ----------
  const seenType = {};
  const seenShot = {};
  let wrongTested = false;
  let wrongBoxTested = false;
  let dragTested = false;
  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 10000);
    await sleep(160);
    const snap = await ev('Game.snapshot()');
    let q = snap.question;
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, cmp: q.cmp, correct: q.correct, audio: q.audio, opts: q.options };
    await clearPlayed();

    if (!seenShot[q.type]) { seenShot[q.type] = 1; await sleep(420); await shot(TAG + '-q-' + q.type + '.png'); }

    // 题型 C：先用对的物品放进「错箱」→ 不判对
    if (q.type === 'B3C' && !wrongBoxTested) {
      wrongBoxTested = true;
      const wrongBox = q.cmp === 'long' ? 'short' : 'long';
      await tap('.option[data-idx="' + q.correct + '"]');   // 选中对的
      await sleep(180);
      await tap('.b3-box[data-box="' + wrongBox + '"]');
      await sleep(700);
      const after = await ev('Game.snapshot()');
      row.wrongBox = { advanced: after.round !== r, audio: (await playedKeys()).filter(k => k !== 'unknown'), stillAsking: after.phase === 'asking' };
      if (after.round === r) q = after.question;
      await clearPlayed();
    }

    // 第 3 轮故意答错（题型 A/B 点错选项）→ 不跳轮 + 重洗 + 温柔鼓励
    if (r === 3 && !wrongTested && (q.type === 'B3A' || q.type === 'B3B')) {
      wrongTested = true;
      const wrong = q.options.findIndex((o, i) => i !== q.correct && o);
      const before = JSON.stringify(q.options);
      await tap('.option[data-idx="' + wrong + '"]');
      await sleep(800);
      const after = await ev('Game.snapshot()');
      row.wrong = { sameRound: after.round === r, reshuffled: JSON.stringify(after.question.options) !== before, audio: (await playedKeys()).filter(k => k !== 'unknown') };
      if (after.round === r) q = after.question;
      await clearPlayed();
    }

    if (q.type === 'B3C') {
      if (!dragTested) {
        dragTested = true;
        const box = await rectOf('.b3-box[data-box="' + q.cmp + '"]');
        await dragTo('.option[data-idx="' + q.correct + '"]', box.cx, box.cy);
        await sleep(220);
        if (!seenShot.placed) { seenShot.placed = 1; await shot(TAG + '-placed.png'); }
      } else {
        await tap('.option[data-idx="' + q.correct + '"]');
        await sleep(180);
        const box = await rectOf('.b3-box[data-box="' + q.cmp + '"]');
        await tapAt(box.cx, box.cy);
        await sleep(220);
      }
      row.inBox = await ev('!!document.querySelector(".b3-box .b3-in-box")');
    } else {
      await tap('.option[data-idx="' + q.correct + '"]');
    }
    const advanced = await wait('Game.round === ' + r, 6000);
    row.advanced = advanced;
    row.voiceOnCorrect = (await playedKeys()).filter(k => k !== 'unknown');
    rep.rounds.push(row);
  }
  rep.types = seenType;

  // ---------- 4) 通关 ----------
  rep.checks.finish = {
    phase: await wait('Game.phase === "done"', 12000) ? await ev('Game.phase') : await ev('Game.phase'),
    stars: await ev('Game.stars'),
    confetti: await ev('!document.getElementById("confetti").hidden'),
    cleared: await ev('!!Game.progress.cleared["3-3"]'),
    voice: []
  };
  await sleep(1400);
  rep.checks.finish.voice = (await playedKeys()).filter(k => /^(praise_|win\d)/.test(k));
  await sleep(300);
  await shot(TAG + '-done.png');

  // ---------- 5) UI 断言 ----------
  rep.checks.ui = await ev(`(function(){
    var txt = document.body.innerText;
    var aria = Array.prototype.map.call(document.querySelectorAll('[aria-label]'), function(n){ return n.getAttribute('aria-label'); }).join(' ');
    var de = document.documentElement;
    return { letters: (txt.match(/[A-Za-z]/g) || []).join(''),
             ariaLetters: (aria.match(/[A-Za-z]/g) || []).join(''),
             overflowX: de.scrollWidth - de.clientWidth,
             overflowY: de.scrollHeight - de.clientHeight };
  })()`);

  await ev('Game.backToMap()');
  await sleep(320);
  rep.checks.map = await ev(`(function(){
    var de = document.documentElement;
    return { letters: ((document.body.innerText.match(/[A-Za-z]/g)||[]).join('')),
             overflowX: de.scrollWidth - de.clientWidth,
             overflowY: de.scrollHeight - de.clientHeight };
  })()`);
  await shot(TAG + '-map.png');

  console.log(JSON.stringify(rep, null, 1));
  try { proc.kill(); } catch (e) {}
  process.exit(0);
})().catch(e => {
  console.error('FATAL', e && e.stack || e);
  try { proc.kill(); } catch (err) {}
  process.exit(1);
});
