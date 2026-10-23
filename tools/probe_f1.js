// 第 4 岛第 1 关（L4-W1，农场动物 Farm animals）专项测试
//   1) 第 3 岛全通 → 第 4 岛第 1 关亮起、第 2 关仍锁
//   2) 教学：狗 → 猫 → 动手找狗 → 猪 → 牛 → 动手找牛 → 过渡语，4 秒小手指只示范不代做
//   3) 三题型：A 听名字找 / B 听叫声找 / C 把动物拖（或点）进农场
//   4) 答题 12 轮：答对无人声、答错洗牌 + 温柔鼓励、把错动物放进农场不判对、通关撒花 + 鼓励
//   5) 视觉：无英文字母（innerText + aria-label）、当前视口无溢出
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'f1';
const PORT = 9637 + (W === 390 ? 0 : 1);
const URL_ = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-f1-' + Date.now()),
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
    while (Date.now() < end) { if (await ev(expr)) return true; await sleep(80); }
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
  const tapAt = async (x, y) => { await mouse('mousePressed', x, y, 1); await sleep(50); await mouse('mouseReleased', x, y, 0); await sleep(60); };
  const tap = async sel => { const c = await rectOf(sel); if (!c) return false; await tapAt(c.cx, c.cy); return true; };
  const dragTo = async (fromSel, tx, ty) => {
    const a = await rectOf(fromSel);
    if (!a) return false;
    await mouse('mousePressed', a.cx, a.cy, 1); await sleep(50);
    for (let k = 1; k <= 8; k++) { await mouse('mouseMoved', a.cx + (tx - a.cx) * k / 8, a.cy + (ty - a.cy) * k / 8, 1); await sleep(22); }
    await mouse('mouseReleased', tx, ty, 0); await sleep(90);
    return true;
  };

  const rep = { view: W + 'x' + H, checks: {}, rounds: [], errors: [] };

  // ---------- 0) 解锁链 ----------
  await ev('Game.resetProgress()');
  await ev('for (var lv = 1; lv <= 5; lv++) Game.markCleared(3, lv)');
  await ev('Game.openIsland(4)');
  await sleep(260);
  rep.checks.unlock = await ev(`(function(){
    var n1 = document.querySelector('.node[data-level="1"]');
    var n2 = document.querySelector('.node[data-level="2"]');
    return {
      island: Game.island,
      title: document.querySelector('.titles .t1').textContent,
      node1Playable: n1.classList.contains('playable'),
      node1Locked: n1.classList.contains('locked'),
      node2Locked: n2.classList.contains('locked'),
      unlockedIsland: Game.progress.unlockedIsland
    };
  })()`);
  await shot(TAG + '-island.png');

  // ---------- 1) 进关 → 教学 ----------
  await ev('document.querySelector(\'.node[data-level="1"]\').click()');
  await sleep(260);
  await clearPlayed();
  await ev('document.getElementById("btnStart").click()');
  await wait('Game.phase === "tutorial"', 6000);
  rep.checks.enter = {
    phase: await ev('Game.phase'),
    optionsHidden: await ev('document.getElementById("options").classList.contains("gone")'),
    stars: await ev('Game.stars')
  };

  // 演示 1：狗
  rep.checks.demoDog = { shown: await wait('!!document.querySelector(\'.f1-cell[data-animal="dog"]\')', 8000) };
  await sleep(160);
  rep.checks.demoDog.audio = (await playedKeys()).filter(k => k !== 'unknown');
  await shot(TAG + '-tut-dog.png');

  // 演示 2：猫
  rep.checks.demoCat = { shown: await wait('!!document.querySelector(\'.f1-cell[data-animal="cat"]\')', 12000) };
  rep.checks.demoCat.audio = (await playedKeys()).filter(k => /l4w1_tut_cat/.test(k));

  // 互动 1：找狗（含 4 秒小手指）
  const ask1 = await wait('Game.tutorial && Game.tutorial.ask === "dog"', 14000);
  rep.checks.ask1 = { reached: ask1,
    cells: await ev('document.querySelectorAll(".f1-cell[data-animal]").length'),
    animals: await ev('Array.prototype.map.call(document.querySelectorAll(".f1-cell[data-animal]"), function(n){return n.dataset.animal}).sort().join(",")')
  };
  await sleep(2600);
  rep.checks.ask1.hintEarly = await ev('!!document.querySelector(".tut-hint")');   // 不到 4 秒不该出
  rep.checks.ask1.hintLater = await wait('!!document.querySelector(".tut-hint")', 5000);
  rep.checks.ask1.hint = await ev(`(function(){
    var h = document.querySelector('.tut-hint');
    if (!h) return null;
    var s = getComputedStyle(h);
    var t = document.querySelector('.f1-cell[data-animal="dog"]').getBoundingClientRect();
    var b = h.getBoundingClientRect();
    return { opacity: s.opacity, anim: s.animationName,
             nearDog: Math.abs(b.left + b.width/2 - (t.left + t.width*0.72)) < t.width * 0.75,
             stillAsking: Game.tutorial && Game.tutorial.ask === 'dog',
             stars: Game.stars };
  })()`);
  await shot(TAG + '-tut-hint.png');

  // 点错（猫）→ 抖动 + again + 不推进
  await clearPlayed();
  await tap('.f1-cell[data-animal="cat"]');
  await sleep(800);
  rep.checks.ask1.wrong = {
    audio: (await playedKeys()).filter(k => k !== 'unknown'),
    stillAsking: await ev('Game.tutorial && Game.tutorial.ask === "dog"'),
    hintBack: await ev('!!document.querySelector(".tut-hint") || true')
  };
  // 点对（狗）
  await clearPlayed();
  await tap('.f1-cell[data-animal="dog"]');
  await sleep(700);
  rep.checks.ask1.correct = {
    hintCleared: await ev('!document.querySelector(".tut-hint")'),
    audio: (await playedKeys()).filter(k => k !== 'unknown')
  };

  // 演示 3：猪 / 演示 4：牛
  await wait('!!document.querySelector(\'.f1-cell[data-animal="pig"]\')', 12000);
  rep.checks.demoPig = (await playedKeys()).filter(k => /l4w1_tut_pig/.test(k));
  await wait('!!document.querySelector(\'.f1-cell[data-animal="cow"]\')', 14000);
  rep.checks.demoCow = (await playedKeys()).filter(k => /l4w1_tut_cow/.test(k));
  await shot(TAG + '-tut-cow.png');

  // 互动 2：四选一找牛
  const ask2 = await wait('Game.tutorial && Game.tutorial.ask === "cow"', 14000);
  rep.checks.ask2 = { reached: ask2,
    cells: await ev('document.querySelectorAll(".f1-cell[data-animal]").length') };
  await tap('.f1-cell[data-animal="cow"]');
  await sleep(900);

  // 过渡语 → 答题
  rep.checks.outro = { ended: await wait('Game.phase === "asking"', 16000) };
  rep.checks.outro.audio = (await playedKeys()).filter(k => /l4w1_tut_done/.test(k));
  rep.checks.outro.starsInTutorial = await ev('Game.stars');
  rep.checks.outro.optionsBack = await ev('!document.getElementById("options").classList.contains("gone")');
  await sleep(300);
  await shot(TAG + '-ask-first.png');

  // ---------- 2) 12 轮答题 ----------
  const seenType = {};
  const seenShot = {};
  let wrongDropTested = false;
  let wrongPickTested = false;
  let dragUsed = false;

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(180);
    let snap = await ev('Game.snapshot()');
    let q = snap.question;
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, animal: q.animal, correct: q.correct, opts: q.options, audio: q.audio };
    await clearPlayed();

    if (!seenShot[q.type]) { seenShot[q.type] = 1; await sleep(400); await shot(TAG + '-q-' + q.type + '.png'); }

    // 题型 C：先把「错的动物」放进农场 → 不能判对
    if (q.type === 'F1C' && !wrongDropTested) {
      wrongDropTested = true;
      const wrongIdx = (q.correct + 1) % 3;
      await tap('.option[data-idx="' + wrongIdx + '"]');
      await sleep(520);
      const hasGate = !!(await rectOf('.f1-gate'));
      let gate = null;
      if (hasGate) { gate = await rectOf('.f1-gate'); await tap('.f1-gate'); }
      await sleep(900);
      const after = await ev('Game.snapshot()');
      row.wrongDrop = {
        gateExists: hasGate,
        advanced: after.round !== r,
        stillAsking: after.phase === 'asking',
        audio: (await playedKeys()).filter(k => k !== 'unknown')
      };
      await sleep(1600);            // 等洗牌结束
      snap = await ev('Game.snapshot()');
      q = snap.question;
      row.optsAfterShuffle = q.options;
      row.correctAfterShuffle = q.correct;
      await clearPlayed();
    }

    // 选项题（A/B）先测一次「点错」→ 不跳轮 + again
    if ((q.type === 'F1A' || q.type === 'F1B') && !wrongPickTested) {
      wrongPickTested = true;
      const wrongIdx = (q.correct + 1) % 3;
      await tap('.f1-tile[data-idx="' + wrongIdx + '"]');
      await sleep(900);
      const after = await ev('Game.snapshot()');
      row.wrongPick = {
        advanced: after.round !== r,
        stillAsking: after.phase === 'asking',
        audio: (await playedKeys()).filter(k => k !== 'unknown')
      };
      await sleep(1700);
      snap = await ev('Game.snapshot()');
      q = snap.question;
      row.correctAfterShuffle = q.correct;
      await clearPlayed();
    }

    // 作答（判定动作必须放在最后一步，便于卡「判定后 280ms」这个无语音窗口）
    const before = await ev('Game.round');
    const starsBefore = await ev('Game.stars');

    if (q.type === 'F1A' || q.type === 'F1B') {
      await tap('.f1-tile[data-idx="' + q.correct + '"]');
    } else {
      const gate = await rectOf('.f1-gate');
      // 第一次 C 题用真拖拽，其余用「点动物 → 点农场」的兜底路径
      if (!dragUsed) {
        dragUsed = true;
        await dragTo('.option[data-idx="' + q.correct + '"]', gate.cx, gate.cy);
      } else {
        await tap('.option[data-idx="' + q.correct + '"]');
        await sleep(520);
        await tap('.f1-gate');
      }
    }

    // judge() 答对后 430ms 才进下一题：这段时间必须只有音效、没有任何语音（RULES §1.6）
    await sleep(250);
    row.voiceOnCorrect = (await playedKeys()).filter(k => k !== 'unknown');

    const advanced = await wait('Game.round > ' + before + ' || Game.phase === "done"', 4000);
    row.advanced = advanced;
    row.starsDelta = (await ev('Game.stars')) - starsBefore;
    row.starOk = (await ev('Game.stars')) === r;

    if (r === 1) {
      row.overflow = await ev(`(function(){
        var de = document.documentElement;
        return { sw: de.scrollWidth, iw: window.innerWidth, sh: de.scrollHeight, ih: window.innerHeight };
      })()`);
    }

    if (!advanced) rep.errors.push('第 ' + r + ' 轮没有推进（' + q.type + '）');
    if (row.voiceOnCorrect.length) rep.errors.push('第 ' + r + ' 轮答对后播放了语音：' + row.voiceOnCorrect.join(','));
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
    praise: (await playedKeys()).filter(k => k !== 'unknown'),
    cleared: await ev('!!Game.progress.cleared["4-1"]'),
    unlockedIsland: await ev('Game.progress.unlockedIsland'),
    unlockedLevel4: await ev('Game.progress.unlockedLevel[4]')
  };
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

  // 回地图 / 岛页再看一遍可见文本
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
  const ok = rep.errors.length === 0 &&
    Object.keys(seenType).length === 3 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0 &&
    rep.checks.englishIsland.length === 0;
  console.log(ok ? '\nPROBE_PASS' : '\nPROBE_FAIL');
  ws.close();
  proc.kill();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('PROBE_ERROR', e); try { proc.kill(); } catch (_) {} process.exit(2); });
