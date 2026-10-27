// 第 12 岛第 3 关（L12-W3：综合听力大复习）专项测试
//   1) 解锁链：12-2 未通时 12-3 锁定；通关 12-2 后 unlockedLevel[12]=3（12-4 不存在，不得越界）。
//   2) 教学 6 环节：红苹果 → 苹果在跳 → 听长句找蓝汽车（互动）→ 男孩饿了 → 想要面包 → 过渡。
//      演示步「不点按不前进」；互动步 4 秒小手、点错不推进。
//   3) 三题型 12 轮 4/4/4：A 长句听音 / B 跨主题选择 / C 拖拽分类。
//   4) 答对 400ms 内完全静音（禁夸奖人声）；拖错框 / 拿错宝宝都不给星星。
//   5) 无英文字母（全屏 textContent + aria-label）、双视口无溢出、零尺寸元素。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const os = require('os'), path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const PORT = 9990 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));

const STEPS = [
  { n: 'appleShow', word: 'l123_t_apple', demo: true },
  { n: 'appleJump', word: 'l123_t_jump', demo: true },
  { n: 'findCar', word: 'l123_t_find', ask: true, want: 'car' },
  { n: 'boyHungry', word: 'l123_t_hungry', demo: true },
  { n: 'boyBread', word: 'l123_t_bread', demo: true },
  { n: 'out', word: 'l105_t_out', out: true }
];

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-l123-' + Date.now()),
  '--window-size=' + W + ',' + H, 'about:blank'], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let id = 0; const pend = new Map();
let finished = false;
const finish = code => { if (finished) return; finished = true; try { proc.kill(); } catch (e) {} setTimeout(() => process.exit(code), 120); };

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
      function sig(){
        var s = document.querySelector('.l123-stage');
        if (!s) return null;
        return 'sid:' + (s.dataset.sid || s.dataset.l123ask || '?');
      }
      function rec(){ var x = sig(); if (!x || x === last) return; last = x; window.__stageLog.push({ t: Date.now(), sig: x }); }
      var mo = new MutationObserver(function(){ setTimeout(rec, 0); });
      window.addEventListener('DOMContentLoaded', function(){ mo.observe(document.body, { childList: true, subtree: true }); rec(); });
    })();
  ` }, sessionId);

  await send('Page.navigate', { url: URL_ }, sessionId);

  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
    if (r.exceptionDetails) throw new Error('EVAL: ' + expr.slice(0, 90) + ' => ' + JSON.stringify(r.exceptionDetails.exception));
    return r.result.value;
  };
  const wait = async (expr, ms = 14000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await ev(expr)) return true; await sleep(70); } return false; };

  for (let i = 0; i < 1400; i++) { if (await ev('typeof window.Game !== "undefined"')) break; await sleep(120); }
  await sleep(400);
  if (!(await ev('typeof window.Game !== "undefined"'))) { console.log('PROBE_ERROR boot'); finish(2); return; }

  const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mouseReleased' ? 0 : 1 }, sessionId);
  const clickXY = async (x, y) => { await mouse('mousePressed', x, y); await sleep(40); await mouse('mouseReleased', x, y); await sleep(90); };
  const centerOf = s => ev(`(function(){var e=document.querySelector(${JSON.stringify(s)});if(!e)return null;var r=e.getBoundingClientRect();return r.width&&r.height?{x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height}:null;})()`);
  const click = async s => { const c = await centerOf(s); if (!c) return false; await clickXY(c.x, c.y); return true; };
  const drag = async (fromSel, toSel) => {
    const a = await centerOf(fromSel), b = await centerOf(toSel);
    if (!a || !b) return false;
    await mouse('mousePressed', a.x, a.y);
    for (let i = 1; i <= 9; i++) await mouse('mouseMoved', a.x + (b.x - a.x) * i / 9, a.y + (b.y - a.y) * i / 9);
    await sleep(90);
    await mouse('mouseReleased', b.x, b.y);
    await sleep(200);
    return true;
  };
  const snap = async () => JSON.parse(await ev('JSON.stringify(Game.snapshot())'));
  const keysBetween = (a, b) => ev(`window.__played.filter(function(p){return p.t>=${a}&&p.t<=${b};}).map(function(p){
    for (var k in window.VOICE_BANK) if (window.VOICE_BANK[k] === p.src) return k;
    return 'unknown';
  })`);
  /* 等某一句真的开播再断言：跨岛复用 key（l105_t_out 在 island_10_5）要现补分块，
     固定只看舞台出现后 240ms 会把「一秒后才响」误判成「没声音」。 */
  const awaitAudio = async (key, fromT, ms) => {
    const end = Date.now() + ms;
    let list = [];
    while (Date.now() < end) {
      list = (await keysBetween(fromT, Date.now() + 300)).filter(k => k !== 'unknown');
      if (list.indexOf(key) >= 0) return list;
      await sleep(120);
    }
    return list;
  };
  const overflow = () => ev(`(function(){
    var d=document.documentElement, cut=[], zero=[];
    var iw=window.innerWidth, ih=window.innerHeight;
    Array.prototype.forEach.call(document.querySelectorAll('#screenLevel *'), function(n){
      if(n.ownerSVGElement) return;
      var r=n.getBoundingClientRect(); if(!r.width||!r.height) return;
      if(r.right>iw+1||r.left<-1||r.bottom>ih+1||r.top<-1){
        if(r.width>2&&r.height>2) cut.push((n.tagName||'')+'.'+(n.getAttribute('class')||''));
      }
    });
    Array.prototype.forEach.call(document.querySelectorAll('#askDisplay .l123-card, #askDisplay .l123-box, #askDisplay .l123-chip, #askDisplay .l123-bigart'), function(n){
      var r=n.getBoundingClientRect(); if(!r.width||!r.height) zero.push((n.tagName||'')+'.'+(n.getAttribute('class')||''));
    });
    return { sw: d.scrollWidth, iw: iw, sh: d.scrollHeight, ih: ih, cut: cut.slice(0,6), zero: zero.slice(0,6) };
  })()`);
  const latin = () => ev(`(function(){
    var bad=[], tw=document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var SKIP={SCRIPT:1,STYLE:1,TEMPLATE:1,NOSCRIPT:1};
    var n;
    while((n=tw.nextNode())){
      var t=(n.nodeValue||'').trim(); if(!t) continue;
      if(!/[A-Za-z]/.test(t)) continue;
      var el=n.parentNode, skip=false;
      while(el && el!==document.body){
        if(SKIP[el.tagName]){ skip=true; break; }
        el=el.parentNode;
      }
      if(skip) continue;
      var host=n.parentNode;
      var r=host.getBoundingClientRect?host.getBoundingClientRect():{width:0,height:0};
      if(!r.width||!r.height) continue;                 /* 不可见（隐藏视图）不算 */
      bad.push((host.getAttribute('class')||host.tagName)+':'+t.slice(0,20));
    }
    Array.prototype.forEach.call(document.querySelectorAll('[aria-label]'), function(n){
      var a=n.getAttribute('aria-label')||''; if(/[A-Za-z]/.test(a)) bad.push('aria:'+a.slice(0,20));
    });
    return bad.slice(0,6);
  })()`);

  const rep = { view: W + 'x' + H, checks: {}, tutorial: [], rounds: [], errors: [] };
  const fail = m => rep.errors.push(m);

  // ---------- 0) 解锁链 ----------
  await ev('Game.resetProgress()');
  for (let i = 1; i <= 11; i++) for (let l = 1; l <= 5; l++) await ev('Game.markCleared(' + i + ',' + l + ')');
  rep.checks.before = JSON.parse(await ev('JSON.stringify({ui:Game.progress.unlockedIsland, u12:Game.progress.unlockedLevel[12]||null})'));
  if (rep.checks.before.u12 !== 1) fail('通关 11-5 后 unlockedLevel[12] 应为 1，实际 ' + rep.checks.before.u12);
  await ev('Game.markCleared(12,1)');
  const u12a = await ev('Game.progress.unlockedLevel[12]');
  if (u12a !== 2) fail('通关 12-1 后 unlockedLevel[12] 应为 2，实际 ' + u12a);
  // 12-2 未通时 12-3 必须锁着
  await ev('Game.openIsland(12)'); await sleep(150);
  rep.checks.locked123 = await ev(`(function(){var n=document.querySelector('[data-level="3"]');return n?n.className:'none';})()`);
  await ev('Game.markCleared(12,2)');
  const u12b = await ev('Game.progress.unlockedLevel[12]');
  if (u12b !== 3) fail('通关 12-2 后 unlockedLevel[12] 应为 3，实际 ' + u12b);

  // ---------- 1) 教学 6 环节 ----------
  await ev('Game.openIsland(12)'); await sleep(200);
  await ev('Game.enterLevel(3)'); await sleep(250);
  await ev('document.getElementById("btnStart").click()');
  await wait('Game.phase === "tutorial"', 8000);

  const findEntry = async (sig, cursor) => ev(`(function(){
    var s=${JSON.stringify(sig)};
    for (var k=${cursor};k<window.__stageLog.length;k++) if (window.__stageLog[k].sig===s) return k;
    return -1;
  })()`);

  let logCursor = 0;
  for (let i = 0; i < STEPS.length; i++) {
    const st = STEPS[i];
    let idx = -1;
    const end = Date.now() + 22000;
    while (Date.now() < end) { idx = await findEntry('sid:' + st.n, logCursor); if (idx >= 0) break; await sleep(70); }
    const entry = idx >= 0 ? JSON.parse(await ev('JSON.stringify(window.__stageLog[' + idx + '])')) : null;
    if (idx >= 0) logCursor = idx + 1;
    const row = { step: st.n, reached: !!entry };
    if (!row.reached) { fail('教学第 ' + (i + 1) + ' 步（' + st.n + '）没到'); rep.tutorial.push(row); continue; }

    await sleep(240);
    row.audio = await awaitAudio(st.word, entry.t - 900, st.demo || st.out ? 6000 : 3200);
    row.audioOk = row.audio.indexOf(st.word) >= 0;
    if (!row.audioOk) fail('教学第 ' + (i + 1) + ' 步（' + st.n + '）语音不符：期望 ' + st.word + '，实际 ' + row.audio.join(','));

    if (st.demo) {
      // 演示定格：不点按不得前进
      await sleep(1500);
      const stillThere = await ev('!!document.querySelector(".l123-stage[data-sid=\\"' + st.n + '\\"]")');
      row.frozen = stillThere;
      if (!stillThere) fail('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示步自动前进了（违反 §三.14）');
      const tapHint = await ev('!!document.querySelector(".f11-tap")');
      row.tapHint = tapHint;
      if (!tapHint) fail('教学第 ' + (i + 1) + ' 步（' + st.n + '）定格时没有「轻点继续」提示');
      await clickXY(Math.round(W * 0.5), Math.round(H * 0.62));
      await sleep(420);
    } else if (st.ask) {
      // 4 秒小手
      let hint = false;
      for (let k = 0; k < 70; k++) { if (await ev('!!document.querySelector(".tut-hint")')) { hint = true; break; } await sleep(100); }
      row.hint4s = hint;
      if (!hint) fail('教学互动步 4 秒没出现小手（§二.12）');
      const pics = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l123-card'),function(n){return n.dataset.pic;})");
      row.pics = pics;
      if (!(pics || []).length === 3) fail('教学互动步不是三张图：' + JSON.stringify(pics));
      const wrongPick = (pics || []).find(p => p !== st.want);
      await click('#askDisplay .l123-card[data-pic="' + wrongPick + '"]');
      await sleep(500);
      row.wrongStays = await ev('!!document.querySelector(".l123-stage[data-sid=\\"' + st.n + '\\"]")');
      if (!row.wrongStays) fail('教学互动点点错却推进了');
      await click('#askDisplay .l123-card[data-pic="' + st.want + '"]');
      await sleep(900);
    }
    rep.tutorial.push(row);
  }
  const inAsk = await wait('Game.phase === "asking"', 8000);
  if (!inAsk) fail('教学没有进入答题（phase=' + await ev('Game.phase') + '）');

  // ---------- 2) 12 轮答题 ----------
  const typeCount = { L123A: 0, L123B: 0, L123C: 0 };
  const posA = [], posB = [], sadSides = [];
  let wrongTested = 0, wrongOk = 0;

  for (let r = 0; r < 12; r++) {
    const ok = await wait('Game.phase === "asking" && Game.round === ' + r, 12000);
    if (!ok) { fail('第 ' + (r + 1) + ' 轮没开始（round=' + await ev('Game.round') + '）'); break; }
    await sleep(260);
    const s = await snap();
    const q = s.question || {};
    const row = { round: r + 1, type: q.l123ask, answer: q.l123answer, items: q.l123items };
    if (!typeCount[q.l123ask]) typeCount[q.l123ask] = 0;
    typeCount[q.l123ask] += 1;

    if (q.l123ask === 'L123A' || q.l123ask === 'L123B') {
      const sel = q.l123ask === 'L123A' ? '#askDisplay .l123-card' : '#askDisplay .l123-card';
      const n = await ev('document.querySelectorAll(' + JSON.stringify(sel) + ').length');
      row.cards = n;
      if (n !== 3) fail('第 ' + (r + 1) + ' 轮卡片数不是 3：' + n);
      if (q.l123ask === 'L123A') posA.push(q.l123answer); else posB.push(q.l123answer);

      // 偶尔先点错一次（前两轮各测一次：不推进、播 again、不给星星）
      if (wrongTested < 2 && n === 3) {
        wrongTested += 1;
        const wrongIdx = (q.l123answer + 1) % 3;
        const before = (await snap()).stars;
        const tClick = Date.now();
        await click(sel + ':nth-child(' + (wrongIdx + 1) + ')');
        await sleep(600);
        const after = await snap();
        const spoke = await keysBetween(tClick, tClick + 900);
        row.wrongSpoke = spoke;
        if (after.round === r + 1 && after.stars === before && spoke.indexOf('again') >= 0) wrongOk += 1;
        else fail('第 ' + (r + 1) + ' 轮点错处理不对：round=' + after.round + ' stars=' + after.stars + ' spoke=' + spoke.join(','));
        await sleep(700);
      }

      const ov = await overflow();
      row.overflow = ov.cut.length ? ov.cut : 'ok';
      if (ov.cut.length) fail('第 ' + (r + 1) + ' 轮溢出：' + ov.cut.join(','));
      if (ov.zero.length) fail('第 ' + (r + 1) + ' 轮零尺寸元素：' + ov.zero.join(','));
      if (ov.sw > ov.iw + 1 || ov.sh > ov.ih + 1) fail('第 ' + (r + 1) + ' 轮页面滚动溢出 ' + ov.sw + 'x' + ov.sh);

      const starsBefore = (await snap()).stars;
      const tClick = Date.now();
      await click(sel + ':nth-child(' + (q.l123answer + 1) + ')');
      await sleep(500);
      const spokeAfter = (await keysBetween(tClick + 80, tClick + 400)).filter(k => k !== 'unknown');
      row.spokeAfter = spokeAfter;
      if (spokeAfter.length) fail('第 ' + (r + 1) + ' 轮答对 400ms 内出现了语音：' + spokeAfter.join(','));
      const s2 = await snap();
      if (s2.stars !== starsBefore + 1) fail('第 ' + (r + 1) + ' 轮答对没有加星（' + starsBefore + '→' + s2.stars + '）');
    } else {
      // C：两个框 + 三个宝宝
      const boxes = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l123-box'),function(n){return n.dataset.box+'@'+n.dataset.side;})");
      row.boxes = boxes;
      if ((boxes || []).length !== 2) fail('第 ' + (r + 1) + ' 轮框数不是 2：' + JSON.stringify(boxes));
      sadSides.push(q.l123sides[0]);
      const chips = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l123-chip'),function(n){return n.dataset.face;})");
      row.chips = chips;
      if ((chips || []).length !== 3) fail('第 ' + (r + 1) + ' 轮宝宝数不是 3：' + JSON.stringify(chips));
      if ((chips || []).indexOf(q.l123target) < 0) fail('第 ' + (r + 1) + ' 轮目标宝宝不在栏里：' + q.l123target);

      const ov = await overflow();
      row.overflow = ov.cut.length ? ov.cut : 'ok';
      if (ov.cut.length) fail('第 ' + (r + 1) + ' 轮溢出：' + ov.cut.join(','));
      if (ov.zero.length) fail('第 ' + (r + 1) + ' 轮零尺寸元素：' + ov.zero.join(','));
      if (ov.sw > ov.iw + 1 || ov.sh > ov.ih + 1) fail('第 ' + (r + 1) + ' 轮页面滚动溢出 ' + ov.sw + 'x' + ov.sh);

      const starsBefore = (await snap()).stars;
      // 先测一次拖到错误的框：不推进、不给星
      const wrongBox = q.l123box === 'sad' ? 'happy' : 'sad';
      const tW = Date.now();
      await drag('#askDisplay .l123-chip[data-face="' + q.l123target + '"]', '#askDisplay .l123-box[data-box="' + wrongBox + '"]');
      await sleep(500);
      const sW = await snap();
      const spokeW = await keysBetween(tW, tW + 800);
      row.wrongBoxSpoke = spokeW;
      if (sW.stars !== starsBefore || sW.round !== r + 1) fail('第 ' + (r + 1) + ' 轮拖错框却推进/给星：stars=' + sW.stars + ' round=' + sW.round);
      if (spokeW.indexOf('again') < 0) fail('第 ' + (r + 1) + ' 轮拖错框没播 again：' + spokeW.join(','));
      await sleep(500);

      const tClick = Date.now();
      const dragged = await drag('#askDisplay .l123-chip[data-face="' + q.l123target + '"]', '#askDisplay .l123-box[data-box="' + q.l123box + '"]');
      row.dragged = dragged;
      const placed = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l123-resident'),function(n){return n.parentNode.dataset.box+':'+n.dataset.face;})");
      row.placed = placed;
      if (!placed || placed.indexOf(q.l123box + ':' + q.l123target) < 0) fail('第 ' + (r + 1) + ' 轮拖对了但框里没有宝宝：' + JSON.stringify(placed));
      const spokeAfter = (await keysBetween(tClick + 80, tClick + 400)).filter(k => k !== 'unknown');
      row.spokeAfter = spokeAfter;
      if (spokeAfter.length) fail('第 ' + (r + 1) + ' 轮答对 400ms 内出现了语音：' + spokeAfter.join(','));
      const s2 = await snap();
      if (s2.stars !== starsBefore + 1) fail('第 ' + (r + 1) + ' 轮答对没有加星（' + starsBefore + '→' + s2.stars + '）');
    }
    rep.rounds.push(row);
    await sleep(320);
  }

  // ---------- 3) 通关与统计 ----------
  const done = await wait('Game.phase === "done"', 12000);
  await sleep(600);
  const fin = await snap();
  rep.checks.done = done;
  rep.checks.types = typeCount;
  rep.checks.stars = fin.stars;
  rep.checks.cleared123 = !!fin.progress.cleared['12-3'];
  rep.checks.u12 = fin.progress.unlockedLevel[12];
  rep.checks.wrongOk = wrongOk + '/' + wrongTested;
  if (!done) fail('12 轮后没有通关（phase=' + fin.phase + '）');
  if (typeCount.L123A !== 4 || typeCount.L123B !== 4 || typeCount.L123C !== 4) fail('题型分布不是 4/4/4：' + JSON.stringify(typeCount));
  if (fin.stars !== 12) fail('星星不是 12：' + fin.stars);
  if (!fin.progress.cleared['12-3']) fail('没有记录 cleared["12-3"]');
  if (fin.progress.unlockedLevel[12] !== 3) fail('unlockedLevel[12] 应为 3（12-4 不存在，不得越界），实际 ' + fin.progress.unlockedLevel[12]);
  const grandOn = await ev('document.getElementById("viewDone").classList.contains("grand")');
  if (grandOn) fail('12-3 不是岛末关，不该走 grand 模式');

  // 防背题：答案位 / 框侧真的变过
  const distinct = a => new Set(a).size;
  rep.checks.posA = posA.join(','); rep.checks.posB = posB.join(',');
  rep.checks.distinctA = distinct(posA); rep.checks.distinctB = distinct(posB); rep.checks.distinctSide = distinct(sadSides);
  if (distinct(posA) < 2) fail('A 型答案位置没变过：' + posA.join(','));
  if (distinct(posB) < 2) fail('B 型答案位置没变过：' + posB.join(','));
  if (distinct(sadSides) < 2) fail('C 型难过框左右没换过：' + sadSides.join(','));

  const lat = await latin();
  rep.checks.latin = lat;
  if (lat.length) fail('出现英文字母：' + lat.join(' | '));
  const errs = await ev('window.__errs');
  if (errs && errs.length) fail('页面报错：' + errs.join(' | '));

  console.log(JSON.stringify(rep, null, 1));
  console.log(rep.errors.length ? ('FAIL ' + rep.errors.length + ' 项') : 'PASS 全部通过');
  finish(rep.errors.length ? 1 : 0);
})().catch(e => { console.log('PROBE_ERROR', e && e.message); finish(2); });
