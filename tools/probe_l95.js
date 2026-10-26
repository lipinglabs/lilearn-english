// 第 9 岛第 5 关（L9-W5，游乐场 · 变装大秀综合考验）专项测试
//   1) 解锁链：1–7 全通 + 8-1~8-5 + 9-1~9-4 通关 → 9-5 可玩（未通 9-4 前锁定）；9-5 是岛末关 → 通关后走 grand + 升岛旗 + 解锁第 10 岛。
//   2) 教学 7 环节：欢迎 2 演示穿上 + 1 互动穿上 / 2 演示脱下 + 1 互动脱下 / 过渡；
//      演示语音播完定格、必须点屏幕才推进（§三.14）；互动 4 秒小手（§二.12）；
//      双向拖拽宽容：穿上落点大、脱下可拖回栏；拖到空白处不判错、不消失、不推进（§二.11）。
//   3) 四题型：A 听天气穿搭（拖到小人任意处）/ B 听长句搞破坏（拖到身上任意处即成功）/ C 多步穿脱（双向拖拽）/ D 听音找捣蛋（点选）。
//   4) 12 轮（4/4/4/4）：答对无人声、stars=12、cleared['9-5']、unlockedLevel[9]=5、grand=true、unlockedIsland=10。
//   5) 视觉：无英文字母、双视口无溢出、无零尺寸。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const TAG = process.argv[4] || 'l95';
const PORT = 9805 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));

// 题型 B（搞破坏）的错位槽位表
const B_SLOT = { shoes: 'head', pants: 'arms', hat: 'foot' };
const A_HOT = 'l93_t_hot_put';   // 复用既有热天穿 T 恤（§1.12 禁止重复文本）
const A_COLD = 'l92_b_coat';     // 复用既有冷天穿外套（§1.12 禁止重复文本）
const B_KEY = { 'hat@foot': 'l95_b_hat', 'shoes@head': 'l95_b_shoes', 'pants@arms': 'l95_b_pants' };
const SILLY_SET = ['pants@head', 'shoes@hand'];

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-l95-' + Date.now()),
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
  for (let i = 0; i < 200; i++) {
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

  const t0 = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId: t0.targetId, flatten: true });
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
        var s = document.querySelector('.l94-stage, .l95-stage');
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
    for (let i = 0; i < 1400; i++) {
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
  const SHOTS = !!process.env.L95_SHOTS;
  const shot = async name => {
    if (!SHOTS) return;
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
  const drag = async (fromSel, tx, ty) => {
    const a = await rectOf(fromSel);
    if (!a) return false;
    await mouse('mousePressed', a.cx, a.cy, 1); await sleep(50);
    for (let k = 1; k <= 8; k++) { await mouse('mouseMoved', a.cx + (tx - a.cx) * k / 8, a.cy + (ty - a.cy) * k / 8, 1); await sleep(22); }
    await mouse('mouseReleased', tx, ty, 0); await sleep(120);
    return true;
  };
  const dragXY = async (sx, sy, tx, ty) => {
    await mouse('mousePressed', sx, sy, 1); await sleep(50);
    for (let k = 1; k <= 8; k++) { await mouse('mouseMoved', sx + (tx - sx) * k / 8, sy + (ty - sy) * k / 8, 1); await sleep(22); }
    await mouse('mouseReleased', tx, ty, 0); await sleep(120);
    return true;
  };
  const dragTo = async (fromSel, toSel) => {
    const b = await rectOf(toSel);
    if (!b) return false;
    return drag(fromSel, b.cx, b.cy);
  };
  /* 身上衣物的「实际可见位置」抓取点（.l92-on 整卡不拦截，仅衣物绘制处可抓） */
  const kidRect = async () => (await rectOf('#askDisplay #l92-kidcard')) || (await rectOf('#askDisplay #l92-kid'));
  /* 身上衣物按「真实绘制像素」抓取：.l92-on 整卡不拦截（pointer-events:none），
     仅 SVG 的 visiblePainted 区域可抓。所以不能用整卡中心，必须命中该衣物实际绘制覆盖的点。
     做法：用 getBBox() 取衣物几何包围盒中心（必然落在绘制实体附近），映射到屏幕坐标，
     再用 elementFromPoint 校验确实命中该衣物；命中不到则在包围盒内小幅扫描找实心点。 */
  const grabWorn = async (item, tx, ty) => {
    const res = await ev(`(function(){
      var card = document.querySelector('#askDisplay #l92-kid');
      if (!card) return null;
      var target = card.querySelector('.l92-on[data-item="${item}"]');
      if (!target) return null;
      var svg = target.querySelector('svg');
      var g = target.querySelector('g');
      if (!svg || !g) return null;
      var vb = svg.viewBox.baseVal || { x:0, y:0, width:120, height:175 };
      var bb = g.getBBox();
      var svgB = svg.getBoundingClientRect();
      function toScreen(ux, uy){
        return { x: svgB.left + (ux - vb.x) / vb.width * svgB.width,
                 y: svgB.top  + (uy - vb.y) / vb.height * svgB.height };
      }
      function hitOK(x, y){ var el = document.elementFromPoint(x, y); var n = el; while (n && n !== card && n !== document.body){ if (n === target) return true; n = n.parentElement; } return false; }
      var pt = toScreen(bb.x + bb.width/2, bb.y + bb.height/2);
      if (!hitOK(pt.x, pt.y)) {
        var found = null;
        for (var dy = -bb.height*0.45; dy <= bb.height*0.45 && !found; dy += Math.max(2, bb.height*0.1)) {
          for (var dx = -bb.width*0.45; dx <= bb.width*0.45; dx += Math.max(2, bb.width*0.1)) {
            var p = toScreen(bb.x + bb.width/2 + dx, bb.y + bb.height/2 + dy);
            if (hitOK(p.x, p.y)) { found = p; break; }
          }
        }
        if (!found) return null;
        pt = found;
      }
      return { x: Math.round(pt.x), y: Math.round(pt.y) };
    })()`);
    if (!res) return false;
    await dragXY(res.x, res.y, tx, ty);
    return res;
  };
  const overflow = () => ev(`(function(){
    var de = document.documentElement;
    var cut = [], zero = [];
    Array.prototype.forEach.call(document.querySelectorAll(
      '.l94-kidcard, .l92-tray, .l92-card, .l92-on, .l94-stage, .l95-stage, .l94-ask, .l94-kidrow, .l94-kidbtn, .l92-on svg, .l92-card svg'), function(n){
      var host = n.closest('#viewAsk, #viewDone, #viewStart');
      if (host && host.hidden) return;
      var b = n.getBoundingClientRect();
      if (!b.width) { zero.push((n.className || '?') + ':0'); return; }
      var overH = b.right > window.innerWidth + 1 || b.left < -1;
      var overV = b.bottom > window.innerHeight + 1 || b.top < -1;
      if (overH || overV) cut.push((n.className || '?') + ':' + Math.round(b.left) + ',' + Math.round(b.top) +
        '..' + Math.round(b.right) + ',' + Math.round(b.bottom));
    });
    return { sw: de.scrollWidth, iw: window.innerWidth, sh: de.scrollHeight, ih: window.innerHeight,
             cut: cut.slice(0, 6), zero: zero.slice(0, 6) };
  })()`);
  // 小人当前实际穿在身上的衣物（.l92-on 的 data-item 列表，含正确穿与捣蛋穿）
  const onItems = () => ev(`(function(){
    var c = document.querySelector("#askDisplay #l92-kid");
    if (!c) return [];
    return Array.prototype.map.call(c.querySelectorAll('.l92-on'), function(n){return n.dataset.item;});
  })()`);
  // dataset.worn（仅正确穿戴会写，捣蛋穿不写 worn，故穿搭题另用 onItems）
  const wornOf = () => ev('(function(){ var c = document.querySelector("#askDisplay #l92-kid"); return c ? (c.dataset.worn || "") : null; })()');
  const woreSet = s => (s || '').split(',').filter(Boolean).sort().join(',');

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };

  // ---------- 0) 解锁链 ----------
  await ev('Game.resetProgress()');
  await ev('for (var isl = 1; isl <= 7; isl++) { for (var lv = 1; lv <= 5; lv++) Game.markCleared(isl, lv); }');
  await ev('for (var l = 1; l <= 5; l++) Game.markCleared(8, l)');
  await ev('Game.markCleared(9, 1)');
  await ev('Game.markCleared(9, 2)');
  await ev('Game.markCleared(9, 3)');
  await ev('Game.openIsland(9)'); await sleep(300);
  // 未通关 9-4 时，9-5 必须锁定
  rep.checks.lockedBefore = await ev(`(function(){
    var n4 = document.querySelector('.node[data-level="4"]');
    var n5 = document.querySelector('.node[data-level="5"]');
    return { node4Playable: n4 ? n4.classList.contains('playable') : false,
             node5Playable: n5 ? n5.classList.contains('playable') : false };
  })()`);
  if (rep.checks.lockedBefore.node5Playable === true) rep.errors.push('未通关 9-4 时 9-5 就能玩');
  // 通关 9-4 后，9-5 解锁
  await ev('Game.markCleared(9, 4)');
  await ev('Game.openIsland(9)'); await sleep(300);
  rep.checks.unlock = await ev(`(function(){
    var n4 = document.querySelector('.node[data-level="4"]');
    var n5 = document.querySelector('.node[data-level="5"]');
    return { node4Done: n4 ? n4.classList.contains('done') : false,
             node5Playable: n5 ? n5.classList.contains('playable') : false };
  })()`);
  if (rep.checks.unlock.node5Playable !== true) rep.errors.push('通关 9-4 后 9-5 没有解锁');
  await shot(TAG + '-island.png');

  // ---------- 1) 进关 → 教学 ----------
  await ev('document.querySelector(\'.node[data-level="5"]\').click()');
  await sleep(300);
  await ev('document.getElementById("btnStart").click()');

  const STEPS = [
    { n: 'welcome1', sig: 'sid:welcome1', audio: 'l95_t_welcome', demo: true, on: 'shoes,coat', before: [],                tray: ['shoes', 'coat'], shot: 'tut-welcome1' },
    { n: 'welcome2', sig: 'sid:welcome2', audio: 'l95_t_welcome2', demo: true, on: 'shoes,coat', before: ['shoes', 'coat'], tray: [],               shot: 'tut-welcome2' },
    { n: 'coatPut',  sig: 'sid:coatPut',  audio: 'l95_t_coat',  drag: { item: 'coat', before: [] },                 tray: ['shoes', 'coat'], shot: 'tut-coatPut' },
    { n: 'hot1',     sig: 'sid:hot1',     audio: 'l95_t_hot1', demo: true, on: 'shoes',      before: ['shoes', 'coat'], take: 'coat', tray: [],     shot: 'tut-hot1' },
    { n: 'hot2',     sig: 'sid:hot2',     audio: 'l95_t_hot2', demo: true, on: 'shoes',      before: ['shoes'],           tray: [],               shot: 'tut-hot2' },
    { n: 'hatTake',  sig: 'sid:hatTake',  audio: 'l95_t_hat',  drag: { item: 'hat', before: ['hat', 'shoes'] },        tray: [],                   shot: 'tut-hatTake' },
    { n: 'out',      sig: 'sid:out',      audio: 'l95_t_out',  out: true,                    before: ['shoes'],           tray: [],                   shot: 'tut-out' }
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
    const cat = st.demo ? 'demo' : (st.drag ? 'drag' : 'out');
    const row = { step: st.n, cat: cat, reached: reached, sig: entry ? entry.sig : null, sigOk: !!entry && entry.sig === st.sig };
    if (!row.sigOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）舞台不符：期望 ' + st.sig + '，实际 ' + row.sig);
    if (entry && st.drag) row.hintEarly = await ev(sel('.tut-hint'));

    if (entry) {
      await sleep(180);
      row.audio = (await keysBetween(entry.t - 900, entry.t + 2600)).filter(k => k !== 'unknown');
      row.audioOk = row.audio.indexOf(st.audio) >= 0;
      if (!row.audioOk) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）语音不符：期望 ' + st.audio + '，实际 ' + row.audio.join(','));
      row.kid = await ev('!!document.querySelector("#askDisplay .l94-stage #l92-kid")');
      if (!st.out && row.kid !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）缺少小人');
      row.tray = await ev('!!document.querySelector("#askDisplay .l94-stage #l92-tray")');
      if (!st.out && row.tray !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）缺少底部衣物栏');
      row.cards = await ev('document.querySelectorAll("#askDisplay .l94-stage .l92-card").length');
      if (!st.out && row.cards !== (st.tray ? st.tray.length : 0)) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）衣物栏件数不符：' + row.cards);
    }
    row.overflow = await overflow();
    if (st.shot) { await sleep(80); await shot(TAG + '-' + st.shot + '.png'); }

    if (st.demo) {
      row.tapShown = await wait(sel('.f11-tap'), 6000);
      if (!row.tapShown) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示定格后没有出现「轻点继续」');
      // 等衣物穿脱动画稳定后再读结果
      const want = st.on;
      row.lookStable = await wait('(function(){var c=document.querySelector("#askDisplay #l92-kid");return c && (' +
        JSON.stringify(woreSet(want)) + '=== (function(s){return s.split(",").filter(Boolean).sort().join(",");})(c.dataset.worn||""));})()', 4000);
      row.lookAfter = await wornOf();
      if (woreSet(row.lookAfter) !== woreSet(want)) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）穿脱结果不对：' + row.lookAfter + ' != ' + want);
      await sleep(900);
      row.autoAdvanced = (await ev('window.__stageLog.length')) > (foundIdx + 1);
      if (row.autoAdvanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示未点按就自动前进了');
      await tap('#askDisplay .l94-stage');
      row.advanced = await wait('window.__stageLog.length > ' + (foundIdx + 1), 6000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）点按后没有推进');
    }

    if (st.drag) {
      row.hintLater = await wait(sel('.tut-hint'), 7000);
      if (row.hintEarly === true || row.hintLater !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）4 秒小手异常');
      const fromSel = st.drag.item
        ? (st.n === 'hatTake'
            ? '#askDisplay #l92-kid .l92-on[data-item="' + st.drag.item + '"]'
            : '#askDisplay .l92-tray .l92-card[data-item="' + st.drag.item + '"]')
        : null;
      const before0 = await ev('window.__stageLog.length');

      /* ① 拖到空白处：弹回、不判错、不消失 */
      row.blank = st.n === 'hatTake'
        ? await grabWorn(st.drag.item, Math.round(W / 2), 40)
        : await drag(fromSel, Math.round(W / 2), 40);
      await sleep(700);
      row.blankThen = {
        advanced: (await ev('window.__stageLog.length')) > before0,
        stillThere: await ev('!!document.querySelector(' + JSON.stringify(fromSel) + ')'),
        ghostGone: await ev('!document.querySelector(".drag-ghost")'),
        worn: await wornOf()
      };
      if (row.blankThen.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖到空白处却推进了');
      if (row.blankThen.stillThere !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖到空白处后衣物消失了');
      if (row.blankThen.ghostGone !== true) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖拽幽灵没有回收');
      // 拖拽题的 before 嵌在 st.drag.before；演示/过渡题的 before 在 st.before
      const beforeArr = (st.before || (st.drag && st.drag.before) || []);
      if (woreSet(row.blankThen.worn) !== woreSet(beforeArr.join(','))) {
        rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）拖到空白处却穿脱了衣物：期望 ' + beforeArr.join(',') + '，实际 ' + row.blankThen.worn);
      }

      /* ② 正确拖拽：穿上落点大 / 脱下拖回栏 */
      let trayC = await rectOf('#askDisplay #l92-tray');
      row.dragOk = st.n === 'hatTake'
        ? await grabWorn(st.drag.item, trayC ? trayC.cx : Math.round(W / 2), trayC ? trayC.cy : H - 40)
        : await dragTo(fromSel, '#askDisplay #l92-kid');
      await sleep(700);
      row.wornEnd = await wornOf();
      row.advanced = await wait('window.__stageLog.length > ' + before0 + ' || Game.phase === "asking"', 9000);
      if (!row.advanced) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）正确拖拽后没有推进');
      const want = st.n === 'hatTake' ? 'shoes' : 'coat';
      if (woreSet(row.wornEnd) !== woreSet(want)) rep.errors.push('教学第 ' + (i + 1) + ' 步（' + st.n + '）穿脱结果不对：' + row.wornEnd);
    }

    if (st.out) {
      row.ended = await wait('Game.phase === "asking"', 10000);
      if (row.ended !== true) rep.errors.push('过渡语播完没有进入答题');
    }
    rep.tutorial.push(row);
    console.log('STEP ' + (i + 1) + ' ' + JSON.stringify(row).slice(0, 460));
  }

  rep.checks.outro = { ended: await wait('Game.phase === "asking"', 20000) };
  await sleep(500);
  rep.checks.outro.totalSteps = await ev('window.__stageLog.length');
  rep.checks.errs = await ev('window.__errs.slice(0, 3)');
  if (rep.checks.errs.length) console.log('ERRS ' + JSON.stringify(rep.checks.errs));
  await shot(TAG + '-ask-first.png');

  // ---------- 2) 12 轮答题 ----------
  const seenType = {}; const seenShot = {}; const wrongTested = { L95A: false, L95B: false, L95D: false };

  for (let r = 1; r <= 12; r++) {
    await wait('Game.phase === "asking"', 12000);
    await sleep(400);
    let snap = await ev('Game.snapshot()');
    let q = snap.question;
    if (!q) { rep.errors.push('第 ' + r + ' 轮：答题未开始'); break; }
    seenType[q.type] = (seenType[q.type] || 0) + 1;
    const row = { round: r, type: q.type, audio: q.audio, weather: q.l95weather, need: q.l95need, item: q.l95item, looks: q.l95looks, steps: q.l95steps, answer: q.l95answer };

    if (q.type === 'L95A') {
      row.cards = await ev('document.querySelectorAll("#askDisplay .l92-tray .l92-card").length');
      if (row.cards !== 3) rep.errors.push('第 ' + r + ' 轮 L95A 衣物栏不是 3 件：' + row.cards);
      row.worn0 = await onItems();
      if (row.worn0.length !== 0) rep.errors.push('第 ' + r + ' 轮 L95A 小人一开始就穿着衣物：' + row.worn0.join(','));
      row.audioOk = (q.l95weather === 'hot' ? A_HOT : A_COLD) === q.audio;
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L95A 语音与天气不符：' + q.audio + ' weather=' + q.l95weather);
    }
    if (q.type === 'L95B') {
      row.cards = await ev('document.querySelectorAll("#askDisplay .l92-tray .l92-card").length');
      if (row.cards !== 3) rep.errors.push('第 ' + r + ' 轮 L95B 衣物栏不是 3 件：' + row.cards);
      row.worn0 = await onItems();
      if (row.worn0.length !== 0) rep.errors.push('第 ' + r + ' 轮 L95B 小人一开始就穿着衣物：' + row.worn0.join(','));
      row.audioOk = B_KEY[q.l95item + '@' + B_SLOT[q.l95item]] === q.audio;
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L95B 语音与目标不符：' + q.audio);
    }
    if (q.type === 'L95C') {
      row.cards = await ev('document.querySelectorAll("#askDisplay .l92-tray .l92-card").length');
      if (row.cards !== 1) rep.errors.push('第 ' + r + ' 轮 L95C 衣物栏不是 1 件：' + row.cards);
      row.worn0 = await onItems();
      // 题面：先穿上 X 再脱下 Y → kid 初始穿着 [Y]（待脱的那件）
      if (row.worn0.length !== 1) rep.errors.push('第 ' + r + ' 轮 L95C 小人初始穿着数不对：' + row.worn0.join(','));
      if (q.l95steps && q.l95steps.length !== 2) rep.errors.push('第 ' + r + ' 轮 L95C 步骤数不对：' + JSON.stringify(q.l95steps));
      // 快照里 q.audio 是字符串（首个语音键），直接校验前缀
      row.audioOk = /^l95_c_/.test(q.audio || '');
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L95C 语音不在预期：' + JSON.stringify(q.audio));
    }
    if (q.type === 'L95D') {
      row.btnLooks = await ev('Array.prototype.map.call(document.querySelectorAll("#askDisplay .l94-kidbtn"), function(n){return n.dataset.look;})');
      row.btnCount = row.btnLooks ? row.btnLooks.length : 0;
      if (row.btnCount !== 3) rep.errors.push('第 ' + r + ' 轮 L95D 不是 3 张小人图：' + row.btnCount);
      const looksOk = !!row.btnLooks && row.btnLooks.join(',') === q.l95looks.join(',');
      if (!looksOk) rep.errors.push('第 ' + r + ' 轮 L95D 小人图与题目不符：' + JSON.stringify(row.btnLooks));
      row.distinct = !!row.btnLooks && new Set(row.btnLooks).size === 3;
      if (!row.distinct) rep.errors.push('第 ' + r + ' 轮 L95D 三张图重复：' + JSON.stringify(row.btnLooks));
      row.audioOk = q.audio === 'l95_d_find';
      if (!row.audioOk) rep.errors.push('第 ' + r + ' 轮 L95D 语音不在预期：' + q.audio);
    }

    if (!seenShot[q.type]) {
      seenShot[q.type] = 1;
      await sleep(300);
      row.overflow = await overflow();
      await shot(TAG + '-q-' + q.type + '.png');
    }

    // 答错：A 拿错衣服 / B 拿错衣服 / D 点错图
    if (q.type === 'L95A' && !wrongTested.L95A) {
      wrongTested.L95A = true;
      const trayItems = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l92-tray .l92-card'), function(n){return n.dataset.item;})");
      const wrongItem = (trayItems || []).filter(x => x !== q.l95need)[0];
      const sigB = q.sig, starsB = await ev('Game.stars'), ctW = Date.now();
      await dragTo('#askDisplay .l92-tray .l92-card[data-item="' + wrongItem + '"]', '#askDisplay #l92-kid');
      await sleep(1000);
      const after = await ev('Game.snapshot()');
      row.wrongItem = {
        advanced: !after.question || after.question.sig !== sigB,
        starsDelta: (await ev('Game.stars')) - starsB,
        saidAgain: (await keysBetween(ctW - 200, ctW + 1400)).filter(k => k !== 'unknown'),
        worn: await onItems()
      };
      if (row.wrongItem.advanced) rep.errors.push('第 ' + r + ' 轮 L95A 拿错衣服却判过了');
      if (row.wrongItem.starsDelta !== 0) rep.errors.push('第 ' + r + ' 轮 L95A 拿错衣服却给了星星');
      if (row.wrongItem.saidAgain.indexOf('again') < 0) rep.errors.push('第 ' + r + ' 轮 L95A 拿错衣服没播 again');
      if (row.wrongItem.worn.length !== 0) rep.errors.push('第 ' + r + ' 轮 L95A 拿错衣服却穿上了');
      await sleep(800);
    }
    if (q.type === 'L95B' && !wrongTested.L95B) {
      wrongTested.L95B = true;
      const trayItemsB = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l92-tray .l92-card'), function(n){return n.dataset.item;})");
      const wrongItem = (trayItemsB || []).filter(x => x !== q.l95item)[0];
      const sigB = q.sig, starsB = await ev('Game.stars');
      await dragTo('#askDisplay .l92-tray .l92-card[data-item="' + wrongItem + '"]', '#askDisplay #l92-kid');
      await sleep(1000);
      const after = await ev('Game.snapshot()');
      row.wrongKid = { advanced: !after.question || after.question.sig !== sigB,
        starsDelta: (await ev('Game.stars')) - starsB,
        worn: await onItems() };
      if (row.wrongKid.advanced) rep.errors.push('第 ' + r + ' 轮 L95B 拿错衣服却判过了');
      if (row.wrongKid.starsDelta !== 0) rep.errors.push('第 ' + r + ' 轮 L95B 拿错衣服却给了星星');
      if (row.wrongKid.worn.length !== 0) rep.errors.push('第 ' + r + ' 轮 L95B 拿错衣服却穿上了');
      await sleep(700);
    }
    if (q.type === 'L95D' && !wrongTested.L95D) {
      wrongTested.L95D = true;
      const wrongIdx = q.l95looks.findIndex(s => SILLY_SET.indexOf(s) < 0);
      const sigB = q.sig, starsB = await ev('Game.stars');
      await tap('#askDisplay .l94-kidbtn[data-idx="' + wrongIdx + '"]');
      await sleep(1000);
      const after = await ev('Game.snapshot()');
      row.wrongKid = { advanced: !after.question || after.question.sig !== sigB,
        starsDelta: (await ev('Game.stars')) - starsB,
        badClass: await ev('!!document.querySelector("#askDisplay .l94-kidbtn.l94-bad")') };
      if (row.wrongKid.advanced) rep.errors.push('第 ' + r + ' 轮 L95D 点错图却判过了');
      if (row.wrongKid.starsDelta !== 0) rep.errors.push('第 ' + r + ' 轮 L95D 点错图却给了星星');
      await sleep(700);
    }

    // 正确作答
    const before = await ev('Game.round');
    const starsBefore = await ev('Game.stars');
    const ct = Date.now();
    if (q.type === 'L95A' || q.type === 'L95B') {
      const dragItem = q.l95need || q.l95item;
      await dragTo('#askDisplay .l92-tray .l92-card[data-item="' + dragItem + '"]', '#askDisplay #l92-kid');
      await sleep(260);
      row.after = { on: await onItems() };
      if (q.type === 'L95A') {
        if (row.after.on.indexOf(dragItem) < 0) rep.errors.push('第 ' + r + ' 轮 L95A 穿上后没有正确穿戴：' + row.after.on.join(','));
      } else {
        if (row.after.on.indexOf(dragItem) < 0) rep.errors.push('第 ' + r + ' 轮 L95B 捣蛋穿戴未出现：' + row.after.on.join(','));
      }
    } else if (q.type === 'L95C') {
      const steps = q.l95steps;
      const putStep = steps.filter(s => s.op === 'put')[0];
      const takeStep = steps.filter(s => s.op === 'take')[0];
      await ev('window.__l95r = [];');
      // 第 1 步：把待穿的衣物从栏里拖到身上
      await dragTo('#askDisplay .l92-tray .l92-card[data-item="' + putStep.item + '"]', '#askDisplay #l92-kid');
      await sleep(900);
      row.mid = { on: await onItems() };
      if (row.mid.on.indexOf(putStep.item) < 0 || row.mid.on.indexOf(takeStep.item) < 0) rep.errors.push('第 ' + r + ' 轮 L95C 第 1 步后穿脱状态不对：' + row.mid.on.join(','));
      // 第 2 步：把待脱的衣物从身上拖回栏里（身上衣物按可见位置抓取，不能再用整卡中心）
      let trayC2 = await rectOf('#askDisplay #l92-tray');
      const takeGrab = await grabWorn(takeStep.item, trayC2 ? trayC2.cx : 200, trayC2 ? trayC2.cy : 700);
      row.takeGrab = takeGrab;
      await sleep(60);
      row.l95r = await ev('(window.__l95r || []).slice(0)');
      // 用 take-post 的 wornAfter（resolveL95 同步记录，先于下一题渲染）作为权威「脱后」状态，
      // 避免读 onItems() 时恰好被下一题重建清空而误判。
      const takePost = (row.l95r || []).filter(e => e.stage === 'take-post' && e.item === takeStep.item).pop();
      const wornAfter = takePost ? (takePost.wornAfter || '') : null;
      row.wornAfter = wornAfter;
      row.after = { on: await onItems() };
      if (wornAfter === null) {
        rep.errors.push('第 ' + r + ' 轮 L95C 第 2 步没有触发脱下（take 未执行）');
      } else {
        const wa = (wornAfter || '').split(',').filter(Boolean).sort().join(',');
        if (wa.indexOf(takeStep.item) >= 0) rep.errors.push('第 ' + r + ' 轮 L95C 第 2 步后没脱下：' + (wornAfter || ''));
        if (wa.indexOf(putStep.item) < 0) rep.errors.push('第 ' + r + ' 轮 L95C 第 2 步后穿上的还在吗：' + (wornAfter || ''));
      }
    } else {
      // L95D：点选捣蛋小人
      await tap('#askDisplay .l94-kidbtn[data-idx="' + q.l95answer + '"]');
    }
    await sleep(250);
    row.voiceOnCorrect = (await keysBetween(ct, ct + 430)).filter(k => k !== 'unknown');
    const advanced = await wait('Game.round > ' + before + ' || Game.phase === "done"', 4500);
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
  await sleep(600);
  rep.checks.done = {
    phase: await ev('Game.phase'), stars: await ev('Game.stars'),
    viewDone: await ev('!document.getElementById("viewDone").hidden'),
    grand: await ev('document.getElementById("viewDone").classList.contains("grand")'),
    cleared: await ev('!!Game.progress.cleared["9-5"]'),
    unlockedLevel: await ev('Game.progress.unlockedLevel[9]'),
    unlockedIsland: await ev('Game.progress.unlockedIsland'),
    flag: await ev('!!document.querySelector(".stage .island-flag")')
  };
  await sleep(700);
  await shot(TAG + '-done.png');
  if (rep.checks.done.grand !== true) rep.errors.push('9-5 是岛末关，通关后应走 grand');
  if (rep.checks.done.flag !== true) rep.errors.push('9-5 通关后岛屿小旗未升起');
  if (rep.checks.done.unlockedIsland !== 10) rep.errors.push('9-5 通关后未解锁第 10 岛：' + rep.checks.done.unlockedIsland);

  // ---------- 4) 视觉断言 ----------
  const scan = () => ev(`(function(){
    var bad = []; var txt = document.body.innerText || '';
    var m = txt.match(/[A-Za-z]+/g); if (m) bad.push('innerText:' + m.join(','));
    var labs = [];
    Array.prototype.forEach.call(document.querySelectorAll('[aria-label]'), function(n){
      var v = n.getAttribute('aria-label') || ''; if (/[A-Za-z]/.test(v)) labs.push(v);
    });
    if (labs.length) bad.push('aria:' + labs.join('|'));
    return bad;
  })()`);
  rep.checks.englishDone = await scan();
  rep.checks.types = seenType;

  await ev('Game.backToMap()'); await sleep(400);
  rep.checks.englishMap = await scan();
  await shot(TAG + '-map-after.png');
  await ev('Game.openIsland(9)'); await sleep(300);
  rep.checks.englishIsland = await scan();
  rep.checks.islandAfter = await ev(`(function(){
    var n5 = document.querySelector('.node[data-level="5"]');
    return { node5Done: n5 ? n5.classList.contains('done') : false,
             unlockedIsland: Game.progress.unlockedIsland };
  })()`);
  await shot(TAG + '-island-after.png');

  console.log(JSON.stringify(rep, null, 2));

  const sigOk = rep.tutorial.every(s => s.sigOk);
  const noOverflow = rep.tutorial.every(s => !s.overflow ||
    (s.overflow.sw <= s.overflow.iw + 1 && s.overflow.sh <= s.overflow.ih + 1 && s.overflow.cut.length === 0 && s.overflow.zero.length === 0));
  const audioOk = rep.tutorial.every(s => s.audioOk);
  const demoOk = rep.tutorial.filter(s => s.demo).every(s =>
    s.tapShown === true && s.autoAdvanced === false && s.advanced === true);
  const hintOk = rep.tutorial.filter(s => s.drag).every(s => s.hintEarly !== true && s.hintLater === true);
  const blankOk = rep.tutorial.filter(s => s.drag).every(s =>
    s.blankThen && s.blankThen.advanced === false && s.blankThen.stillThere === true && s.blankThen.ghostGone === true);
  const dragOk = rep.tutorial.filter(s => s.drag).every(s => s.fromExists !== false && s.advanced === true);
  const outOk = rep.tutorial.filter(s => s.out).every(s => s.ended === true);
  const roundsOk = rep.rounds.every(s => s.advanced && s.starsDelta === 1 && s.voiceOnCorrect.length === 0);
  const semOk = rep.rounds.every(s => s.audioOk === true);
  const ok = rep.errors.length === 0 && sigOk && audioOk && demoOk && hintOk && blankOk && dragOk &&
    outOk && roundsOk && semOk && noOverflow &&
    rep.rounds.length === 12 && Object.keys(seenType).length === 4 &&
    seenType.L95A === 3 && seenType.L95B === 3 && seenType.L95C === 3 && seenType.L95D === 3 &&
    rep.checks.done.phase === 'done' && rep.checks.done.stars === 12 &&
    rep.checks.done.grand === true && rep.checks.done.cleared === true &&
    rep.checks.done.unlockedLevel === 5 && rep.checks.done.unlockedIsland === 10 &&
    rep.checks.lockedBefore.node5Playable === false &&
    rep.checks.islandAfter.node5Done === true &&
    rep.checks.englishDone.length === 0 && rep.checks.englishMap.length === 0 && rep.checks.englishIsland.length === 0 &&
    rep.checks.outro.ended === true;
  console.log('\nPROBE_' + (ok ? 'PASS' : 'FAIL') + ' sigOk=' + sigOk + ' audioOk=' + audioOk + ' demoOk=' + demoOk +
    ' hintOk=' + hintOk + ' blankOk=' + blankOk + ' dragOk=' + dragOk + ' outOk=' + outOk +
    ' roundsOk=' + roundsOk + ' semOk=' + semOk + ' noOverflow=' + noOverflow +
    ' steps=' + rep.checks.outro.totalSteps + ' types=' + JSON.stringify(seenType) +
    ' stars=' + rep.checks.done.stars + ' grand=' + rep.checks.done.grand +
    ' cleared=' + rep.checks.done.cleared + ' unlockedLevel=' + rep.checks.done.unlockedLevel +
    ' unlockedIsland=' + rep.checks.done.unlockedIsland);
  finish(ok ? 0 : 1);
})().catch(e => { console.error('PROBE_ERROR', e); finish(2); });
