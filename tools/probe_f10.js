// 第 5 岛第 5 关（L5-W5，上菜终极挑战 · 结业关）专项测试
//   1) 解锁链：第 1–4 岛全通 + 第 5 岛第 1–4 关通关 → 第 5 关可玩
//   2) 教学（延长版综合复习，RULES §三.9 / §三.10）：24 环节，按时间线逐步校验
//   3) 三题型：A 听需求端菜（拖食物给小女孩客人）/ B 听对话找要更多的客人 / C 听场景选餐具（热汤要勺子）
//   4) 答题 12 轮：答对无人声、答错不推进、拖错食物不给过小客人、通关 grand 彩带 + 奖杯 + 岛屿小旗
//   5) 视觉：无英文字母（innerText + aria-label）、当前视口无溢出（含逐元素越界与零尺寸）
// 带 LILEARN_URL 则直接跑线上（发布后回归用）。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'f10';
const PORT = 9683 + (W === 390 ? 0 : 1);
// 默认跑本地文件；带 LILEARN_URL 则跑线上
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));

// 题型 A：食物 → 语音 key（面包 / 牛奶 / 苹果）
const A_KEY = { bread: 'l5w5_a_bread', milk: 'l5w5_a_milk', apple: 'l5w5_a_apple' };

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-f10-' + Date.now()),
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
        var s = document.querySelector('.f9-stage');
        if (!s) return null;
        var cards = Array.prototype.map.call(s.querySelectorAll('.f9-card'), function(n){ return n.dataset.subj; });
        if (!cards.length) return 'empty';
        var grid = s.querySelector('.f9-grid');
        if (grid) {
          var list = cards.slice().sort().join(',');
          if (grid.classList.contains('f9-final')) return 'final' + cards.length + ':' + list;
          return 'grid' + cards.length + ':' + list;
        }
        // 非 grid（演示 或 上菜给小客人）：两张 give 场景视觉相同，用 data-give 区分
        if (s.querySelector('.f9-give-row')) return 'give' + (s.dataset.give || '0') + ':' + cards[0];
        return 'one:' + cards[0];
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
    var optBar = document.getElementById('options');
    var optShown = !!optBar && !optBar.classList.contains('gone') && !optBar.classList.contains('off');
    var cut = [], zero = [];
    Array.prototype.forEach.call(document.querySelectorAll(
      '.f9-card, .f9-tile, .f9-chip, .f9-serve, .option'), function(n){
      var b = n.getBoundingClientRect();
      if (!b.width) { if (optShown || !n.classList.contains('option')) zero.push((n.className || '?') + ':0'); return; }
      if (b.right > window.innerWidth + 1 || b.left < -1) cut.push(n.className + ':' + Math.round(b.left) + '..' + Math.round(b.right));
      if (n.classList.contains('f9-card') && n.dataset.subj && b.width < 24) {
        zero.push(n.dataset.subj + ':' + Math.round(b.width));
      }
    });
    return { sw: de.scrollWidth, iw: window.innerWidth, sh: de.scrollHeight, ih: window.innerHeight,
             cut: cut.slice(0, 6), zero: zero.slice(0, 6) };
  })()`);

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };

  // ---------- 0) 解锁链：前 4 岛全通 + 第 5 岛第 1–4 关通关 → 第 5 关可玩 ----------
  await ev('Game.resetProgress()');
  await ev('for (var isl = 1; isl <= 4; isl++) { for (var lv = 1; lv <= 5; lv++) Game.markCleared(isl, lv); }');
  await ev('for (var lv = 1; lv <= 4; lv++) Game.markCleared(5, lv)');
  await ev('Game.openIsland(5)');
  await sleep(300);
  rep.checks.unlock = await ev(`(function(){
    var n4 = document.querySelector('.node[data-level="4"]');
    var n5 = document.querySelector('.node[data-level="5"]');
    return {
      node4Done: n4.classList.contains('done'),
      node5Playable: n5.classList.contains('playable'),
      node5Locked: n5.classList.contains('locked')
    };
  })()`);
  await shot(TAG + '-island.png');
  if (rep.checks.unlock.node5Playable !== true) rep.errors.push('第 5 岛第 5 关没有亮起（' + JSON.stringify(rep.checks.unlock) + '）');
  if (rep.checks.unlock.node4Done !== true) rep.errors.push('第 5 岛第 4 关应该已通关');

  // ---------- 1) 进关 → 教学（按时间线逐步校验） ----------
  await ev('document.querySelector(\'.node[data-level="5"]\').click()');
  await sleep(300);
  await ev('document.getElementById("btnStart").click()');

  const STEPS = [
    // ① 欢迎客人（开场，只演示）
    { n: 'welcome',     sig: 'one:door',                        audio: 'l5w5_t_welcome', shot: 'tut-door' },
    // ② 肚子饿 + 想要（hungry / I want）2 演示 + 2 互动
    { n: 'hungry-demo1',sig: 'one:hungry',                      audio: 'l5w5_t_hungry1', shot: 'tut-hungry' },
    { n: 'hungry-demo2',sig: 'one:pointApple',                  audio: 'l5w5_t_hungry2', shot: 'tut-point-apple' },
    { n: 'hungry-ask1', sig: 'grid2:full,hungry',               audio: 'l5w5_t_hungry_a1', wrongFirst: 'full', click: 'hungry', shot: 'tut-hungry-ask1' },
    { n: 'hungry-ask2', sig: 'grid3:eating,full,hungry',        audio: 'l5w5_t_hungry_a2', hint: true, click: 'hungry' },
    // ③ 端上食物（Here you are）2 演示 + 2 互动（上菜给小男孩）
    { n: 'here-demo1',  sig: 'one:giveApple',                   audio: 'l5w5_t_here1', shot: 'tut-give-apple' },
    { n: 'here-demo2',  sig: 'one:serve',                       audio: 'l5w5_t_here2', shot: 'tut-serve' },
    { n: 'give-ask1',   sig: 'give7:boyPlate',                  audio: 'l5w5_t_here_a1', give: true, click: 'apple', shot: 'tut-give1' },
    { n: 'give-ask2',   sig: 'give8:boyPlate',                  audio: 'l5w5_t_here_a2', give: true, click: 'bread', shot: 'tut-give2' },
    // ④ 礼貌回应（Thank you）2 演示 + 2 互动
    { n: 'thanks-demo1',sig: 'one:thank',                       audio: 'l5w5_t_thanks1', shot: 'tut-thank' },
    { n: 'thanks-demo2',sig: 'one:girlHappy',                   audio: 'l5w5_t_thanks2', shot: 'tut-girl-happy' },
    { n: 'thanks-ask1', sig: 'grid2:crying,thank',              audio: 'l5w5_t_thanks_a1', wrongFirst: 'crying', click: 'thank', shot: 'tut-thanks-ask1' },
    { n: 'thanks-ask2', sig: 'grid3:eating,sleeping,thank',     audio: 'l5w5_t_thanks_a2', hint: true, click: 'thank' },
    // ⑤ 吃饱 & 听懂拒绝（All done / doesn't want more）2 演示 + 2 互动
    { n: 'full-demo1',  sig: 'one:full',                        audio: 'l5w5_t_full1', shot: 'tut-full' },
    { n: 'full-demo2',  sig: 'one:fullPush',                    audio: 'l5w5_t_full2', shot: 'tut-full-push' },
    { n: 'full-ask1',   sig: 'grid2:fullPush,more',             audio: 'l5w5_t_full_a1', wrongFirst: 'more', click: 'fullPush', shot: 'tut-full-ask1' },
    { n: 'full-ask2',   sig: 'grid3:fullPush,hungry,more',      audio: 'l5w5_t_full_a2', hint: true, click: 'fullPush' },
    // ⑥ 听懂「还要更多」（More, please）1 演示 + 1 互动
    { n: 'more-demo',   sig: 'one:more',                        audio: 'l5w5_t_more1', shot: 'tut-more' },
    { n: 'more-ask',    sig: 'grid2:fullPush,more',             audio: 'l5w5_t_more_a1', click: 'more' },
    // ⑦ 餐具（spoon / cup / fork）2 演示 + 2 互动
    { n: 'utensil-demo1',sig: 'one:soup',                       audio: 'l5w5_t_utensil1', shot: 'tut-soup' },
    { n: 'utensil-demo2',sig: 'one:scSpoon',                    audio: 'l5w5_t_utensil2', shot: 'tut-scspoon' },
    { n: 'utensil-ask1',sig: 'grid2:fork,spoon',                audio: 'l5w5_t_utensil_a1', wrongFirst: 'fork', click: 'spoon', shot: 'tut-utensil-ask1' },
    { n: 'utensil-ask2',sig: 'grid3:cup,fork,spoon',            audio: 'l5w5_t_utensil_a2', hint: true, click: 'spoon' },
    // ⑧ 组合收尾（过渡语自带）
    { n: 'outro',       sig: 'final4:full,girlHappy,more,serve',audio: 'l5w5_t_out' }
  ];

  // 相邻两步的舞台指纹不能相同：MutationObserver 只在指纹变化时记一条，
  // 相邻重复会让时间线不增长，探针把「已推进」误判成「没推进」。
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
      row.audio = (await keysBetween(entry.t - 900, entry.t + 2600)).filter(k => k !== 'unknown');
      row.audioOk = row.audio.indexOf(st.audio) >= 0;
      if (!row.audioOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）语音不符：期望 ' + st.audio + '，实际 ' + row.audio.join(','));
    }
    if (st.n !== 'outro') row.overflow = await overflow();
    if (st.shot) { await sleep(120); await shot(TAG + '-' + st.shot + '.png'); }

    // 点错不推进：先点错的，等一会儿确认没前进、且只播了温柔鼓励
    if (st.wrongFirst) {
      const before = await ev('window.__stageLog.length');
      const wt = Date.now();
      await tap('#askDisplay .f9-tile[data-subj="' + st.wrongFirst + '"]');
      await sleep(1100);
      row.wrongPick = {
        advanced: (await ev('window.__stageLog.length')) > before,
        stillAsking: await ev('Game.tutorial && Game.tutorial.ask === ' + JSON.stringify(st.click)),
        audio: (await keysBetween(wt - 150, wt + 2600)).filter(k => k !== 'unknown')
      };
      if (row.wrongPick.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错却推进了');
      if (row.wrongPick.stillAsking !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错后没保持等待');
      if (row.wrongPick.audio.indexOf('again') < 0) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点错后没播温柔鼓励：' + row.wrongPick.audio.join(','));
      await sleep(1200);    }

    if (st.hint) {
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
        var tgt = document.querySelector('#askDisplay .f9-tile[data-subj="' + ${JSON.stringify(st.click)} + '"]');
        var hb = h.getBoundingClientRect(), tb = tgt ? tgt.getBoundingClientRect() : null;
        var tip = document.elementFromPoint(hb.left + 4, hb.top - 4);
        var tipTile = tip && tip.closest ? tip.closest('.f9-tile') : null;
        return { inDisplay: !!h.closest('#askDisplay'), anim: getComputedStyle(h).animationName,
                 hintSubj: tipTile ? tipTile.dataset.subj : null,
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
      if (st.give) {
        // 上菜给小客人：先点食物 chip，再点小客人
        row.geo = await ev(`(function(){
          function center(n){ var b=n.getBoundingClientRect(); return { cx:b.left+b.width/2, cy:b.top+b.height/2 }; }
          function hit(n){ if(!n) return null; var c=center(n); var h=document.elementFromPoint(c.cx,c.cy);
            return h?(h.tagName+'.'+(h.className&&h.className.baseVal!==undefined?h.className.baseVal:h.className)):null; }
          var chip = document.querySelector('#askDisplay .f9-chip[data-food="' + ${JSON.stringify(st.click)} + '"]');
          var boy = document.querySelector('#askDisplay .f9-serve .f9-card');
          return { chip: chip?{hit:hit(chip)}:null,
                   boy: boy?{hit:hit(boy)}:null };
        })()`);
        if (!row.geo || !row.geo.chip) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）找不到食物按钮');
        if (!row.geo || !row.geo.boy) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）找不到小客人');
        await tap('#askDisplay .f9-chip[data-food="' + st.click + '"]');
        await sleep(250);
        await tap('#askDisplay .f9-serve .f9-card');
        await sleep(1600);
        row.clicked = true;
        row.advanced = await wait('window.__stageLog.length > ' + before, 8000);
        if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点对后没有推进');
      } else {
        const cardSel = '#askDisplay .f9-tile[data-subj="' + st.click + '"]';
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
  let wrongGridTested = false;   // F10B 点错卡
  let wrongClickTested = false;  // F10C 点错餐具
  let wrongDragTested = false;   // F10A 拖错食物
  let dragUsed = false;

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(200);
    let snap = await ev('Game.snapshot()');
    let q = snap.question;
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, subj: q.subj, food: q.food, utensil: q.utensil, correct: q.correct, opts: q.options, audio: q.audio };

    if (q.type === 'F10B') {
      row.tiles = await ev('document.querySelectorAll("#askDisplay .f9-tile").length');
      row.uniqueOpts = new Set(q.options).size;
      row.answerOk = q.options[q.correct] === ('s:' + q.subj);
      row.audioOk = q.audio === 'l5w5_b';
      if (row.tiles !== 3) rep.errors.push('第 ' + r + ' 轮卡片数量异常：' + row.tiles);
      if (row.uniqueOpts !== 3) rep.errors.push('第 ' + r + ' 轮选项卡重复：' + JSON.stringify(q.options));
      if (!row.answerOk) rep.errors.push('第 ' + r + ' 轮正确答案指向错误：' + JSON.stringify(q.options) + ' want=s:' + q.subj);
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮语音与目标不一致：' + q.audio + ' subj=' + q.subj);
      if (q.options.filter(f => f === ('s:' + q.subj)).length !== 1) rep.errors.push('第 ' + r + ' 轮目标不是唯一：' + JSON.stringify(q.options));
    }

    if (q.type === 'F10A') {
      row.opts = await ev('document.querySelectorAll("#options .option:not([hidden])").length');
      row.dragAttrs = await ev('document.querySelectorAll("#options .option[data-drag]").length');
      row.uniqueOpts = new Set(q.options).size;
      row.answerOk = q.options[q.correct] === ('f:' + q.food);
      row.audioOk = q.audio === A_KEY[q.food];
      row.girlShown = await ev('!!document.querySelector(\'#askDisplay .f9-serve .f9-card[data-drop="f10girl"]\')');
      if (row.opts !== 3) rep.errors.push('第 ' + r + ' 轮食物不是 3 个：' + row.opts);
      if (row.dragAttrs !== 3) rep.errors.push('第 ' + r + ' 轮可拖食物不是 3 个：' + row.dragAttrs);
      if (row.uniqueOpts !== 3) rep.errors.push('第 ' + r + ' 轮食物选项重复：' + JSON.stringify(q.options));
      if (!row.answerOk) rep.errors.push('第 ' + r + ' 轮正确答案指向错误：' + JSON.stringify(q.options));
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮语音与目标不一致：' + q.audio + ' food=' + q.food);
      if (!row.girlShown) rep.errors.push('第 ' + r + ' 轮小客人没有显示');
    }

    if (q.type === 'F10C') {
      row.opts = await ev('document.querySelectorAll("#options .option:not([hidden])").length');
      row.dragAttrs = await ev('document.querySelectorAll("#options .option[data-drag]").length');
      row.uniqueOpts = new Set(q.options).size;
      row.answerOk = q.options[q.correct] === ('u:' + q.utensil);
      row.audioOk = q.audio === 'l5w5_c';
      row.soupShown = await ev('!!document.querySelector(\'#askDisplay .f9-serve .f9-card[data-subj="soup"]\')');
      if (row.opts !== 3) rep.errors.push('第 ' + r + ' 轮餐具不是 3 个：' + row.opts);
      if (row.dragAttrs !== 0) rep.errors.push('第 ' + r + ' 轮餐具不该可拖（只能点选）：' + row.dragAttrs);
      if (row.uniqueOpts !== 3) rep.errors.push('第 ' + r + ' 轮餐具选项重复：' + JSON.stringify(q.options));
      if (!row.answerOk) rep.errors.push('第 ' + r + ' 轮正确答案指向错误：' + JSON.stringify(q.options) + ' want=u:' + q.utensil);
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮语音与目标不一致：' + q.audio + ' utensil=' + q.utensil);
      if (!row.soupShown) rep.errors.push('第 ' + r + ' 轮热汤没有显示');
      if (q.options.filter(f => f === ('u:' + q.utensil)).length !== 1) rep.errors.push('第 ' + r + ' 轮目标餐具不是唯一：' + JSON.stringify(q.options));
    }

    if (!seenShot[q.type]) { seenShot[q.type] = 1; await sleep(400); await shot(TAG + '-q-' + q.type + '.png'); }

    // F10B：先点错的卡片 → 不跳轮 + again
    if (q.type === 'F10B' && !wrongGridTested) {
      wrongGridTested = true;
      const wrongIdx = (q.correct + 1) % 3;
      const wrongSel = '#askDisplay .f9-tile[data-idx="' + wrongIdx + '"]';
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
      if (q.options[q.correct] !== ('s:' + q.subj)) rep.errors.push('第 ' + r + ' 轮重洗后正确答案指向错误');
    }

    // F10C：点错的餐具 → 不跳轮 + again
    if (q.type === 'F10C' && !wrongClickTested) {
      wrongClickTested = true;
      const wrongIdx = (q.correct + 1) % 3;
      const wrongSel = '#options .option[data-idx="' + wrongIdx + '"]';
      const wt = Date.now();
      await tap(wrongSel);
      await sleep(1100);
      const after = await ev('Game.snapshot()');
      row.wrongClick = {
        advanced: after.round !== r,
        stillAsking: after.phase === 'asking',
        audio: (await keysBetween(wt, wt + 2000)).filter(k => k !== 'unknown')
      };
      if (row.wrongClick.advanced) rep.errors.push('第 ' + r + ' 轮点错餐具却前进了');
      if (row.wrongClick.audio.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮点错餐具没播温柔鼓励：' + row.wrongClick.audio.join(','));
      await sleep(1800);
      snap = await ev('Game.snapshot()');
      q = snap.question;
      row.correctAfterShuffle = q.correct;
      if (q.options[q.correct] !== ('u:' + q.utensil)) rep.errors.push('第 ' + r + ' 轮重洗后正确答案指向错误');
    }

    // F10A：把别的食物拖给小客人 → 不能判过
    if (q.type === 'F10A' && !wrongDragTested) {
      wrongDragTested = true;
      const girl = await rectOf('#askDisplay .f9-serve .f9-card[data-drop="f10girl"]');
      const wt = Date.now();
      await dragTo('#options .option[data-idx="' + ((q.correct + 1) % 3) + '"]', girl.cx, girl.cy);
      await sleep(1100);
      const after = await ev('Game.snapshot()');
      row.wrongDrag = {
        advanced: after.round !== r,
        stillAsking: after.phase === 'asking',
        audio: (await keysBetween(wt, wt + 2000)).filter(k => k !== 'unknown')
      };
      if (row.wrongDrag.advanced) rep.errors.push('第 ' + r + ' 轮把别的食物端给客人却判过了');
      await sleep(1600);
      snap = await ev('Game.snapshot()');
      q = snap.question;
      row.correctAfterShuffle = q.correct;
    }

    const before = await ev('Game.round');
    const starsBefore = await ev('Game.stars');
    const ct = Date.now();

    if (q.type === 'F10B') {
      await tap('#askDisplay .f9-tile[data-idx="' + q.correct + '"]');
    } else if (q.type === 'F10C') {
      await tap('#options .option[data-idx="' + q.correct + '"]');
    } else if (!dragUsed) {
      // 第一道 A 题走真拖拽（RULES §二.11 的主路径），其余走点选
      dragUsed = true;
      const girl = await rectOf('#askDisplay .f9-serve .f9-card[data-drop="f10girl"]');
      await dragTo('#options .option[data-idx="' + q.correct + '"]', girl.cx, girl.cy);
    } else {
      await tap('#options .option[data-idx="' + q.correct + '"]');
      await sleep(250);
      await tap('#askDisplay .f9-serve .f9-card');
    }

    // 判对时食物要当场落到小客人的盘子上（视觉反馈，仍然不播语音）
    if (q.type === 'F10A') {
      await sleep(180);
      row.placedOnGirl = await ev(`(function(){
        var b = document.querySelector('#askDisplay .f9-serve .f9-card');
        if (!b) return null;
        var o = b.querySelector('.f9-onboy');
        return o ? (o.dataset.subj || o.className) : null;
      })()`);
      row.placedRight = await ev(`!!document.querySelector('#askDisplay .f9-serve .f9-card .f9-onboy[data-subj="${q.food}"]')`);
      if (!row.placedOnGirl) rep.errors.push('第 ' + r + ' 轮答对后小客人盘上没出现食物');
      if (row.placedOnGirl && row.placedOnGirl !== q.food) rep.errors.push('第 ' + r + ' 轮盘上食物不是正确的：' + row.placedOnGirl + '（应为 ' + q.food + '）');
      if (!row.placedRight) rep.errors.push('第 ' + r + ' 轮食物没落到小客人盘上');
      if (!seenShot['A-placed']) { seenShot['A-placed'] = 1; await shot(TAG + '-q-F10A-placed.png'); }
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

  // ---------- 3) 通关（结业关：grand 模式 + 岛屿小旗） ----------
  rep.checks.done = {
    phase: await ev('Game.phase'),
    stars: await ev('Game.stars'),
    viewDone: await ev('!document.getElementById("viewDone").hidden'),
    grand: await ev('document.getElementById("viewDone").classList.contains("grand")'),
    confetti: await ev('!document.getElementById("confetti").hidden'),
    flag: await ev('!!document.querySelector(\'.island-flag[data-island="5"]\')'),
    cleared: await ev('!!Game.progress.cleared["5-5"]'),
    unlockedLevel: await ev('Game.progress.unlockedLevel[5]'),
    unlockedIsland: await ev('Game.progress.unlockedIsland')
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
    var c6 = document.querySelector('.island[data-island="6"]');
    return {
      island5Name: c5 ? c5.textContent : null,
      island5Cleared: c5.classList.contains('cleared'),
      island5Unlocked: c5.classList.contains('unlocked'),
      island5Locked: c5.classList.contains('locked'),
      iconIsImg: !!c5.querySelector('img'),
      island6Unlocked: c6 ? (c6.classList.contains('unlocked') && !c6.classList.contains('locked')) : null
    };
  })()`);
  await shot(TAG + '-map-after.png');

  await ev('Game.openIsland(5)'); await sleep(300);
  rep.checks.englishIsland = await scan();
  rep.checks.islandAfter = await ev(`(function(){
    var n5 = document.querySelector('.node[data-level="5"]');
    return { node5Done: n5.classList.contains('done'),
             node5Locked: n5.classList.contains('locked'), node5Text: n5.textContent,
             nodeCount: document.querySelectorAll('.node').length,
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
    Object.keys(seenType).length === 3 && seenType.F10A === 4 && seenType.F10B === 4 && seenType.F10C === 4 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === true && rep.checks.done.cleared === true && rep.checks.done.flag === true &&
    rep.checks.done.unlockedLevel === 5 &&
    rep.checks.islandAfter.node5Done === true &&
    rep.checks.mapAfter.island5Cleared === true && rep.checks.mapAfter.island5Unlocked === true &&
    rep.checks.mapAfter.iconIsImg === true &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0 &&
    rep.checks.englishIsland.length === 0 &&
    rep.checks.outro.ended === true &&
    rep.checks.overflowIsland.sw <= rep.checks.overflowIsland.iw + 1;
  console.log('\nsigOk=' + sigOk + ' audioOk=' + audioOk + ' hintOk=' + hintOk + ' wrongOk=' + wrongOk +
    ' advanceOk=' + advanceOk + ' roundsOk=' + roundsOk + ' noOverflow=' + noOverflow +
    ' steps=' + rep.checks.outro.totalSteps + ' types=' + JSON.stringify(seenType) +
    ' stars=' + rep.checks.done.stars + ' grand=' + rep.checks.done.grand +
    ' island5=' + rep.checks.mapAfter.island5Cleared + '/' + rep.checks.mapAfter.island5Unlocked +
    ' flag=' + rep.checks.done.flag);
  if (rep.errors.length) console.log('errors: ' + rep.errors.join(' | '));
  console.log(ok ? 'PROBE_PASS' : 'PROBE_FAIL');
  ws.close();
  proc.kill();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('PROBE_ERROR', e); try { proc.kill(); } catch (_) {} process.exit(2); });
