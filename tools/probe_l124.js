// 第 12 岛第 4 关（L12-W4：情景闯关 · 多步指令）专项测试
//   1) 解锁链：12-4 只允许通关 12-3 后解锁；通关 12-4 后 unlockedLevel[12]=4（12-5 不存在，不得越界）。
//   2) 教学 7 环节：拿苹果 2 演示 + 1 互动 → 递给爸爸 2 演示 + 1 互动 → 过渡。
//      演示步「不点按不前进」；互动步 4 秒小手；第一步交到手上、第二步递给人，两步都要真的落位。
//   3) 三题型 12 轮 4/4/4：A 两步拖拽 / B 听指令做动作（👍 永远判对）/ C 先·再排先后。
//   4) 答对 400ms 内完全静音（禁夸奖人声）；A 型答对必须播剧情台词 l124_line_thanks 再给星星（§三.26）。
//   5) 无英文字母、双视口无溢出、零尺寸元素。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const os = require('os'), path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const PORT = 9990 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));

const STEPS = [
  { n: 'get1', word: 'l124_t_intro', demo: true },
  { n: 'get2', word: 'l124_t_inhand', demo: true },
  { n: 'getAsk', word: 'l124_t_getask', ask: 1 },
  { n: 'give1', word: 'l124_t_dad', demo: true },
  { n: 'give2', word: 'l124_t_dadhold', demo: true },
  { n: 'giveAsk', word: 'l124_t_giveask', ask: 2 },
  { n: 'out', word: 'l124_t_out', out: true }
];

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-l124-' + Date.now()),
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
        var s = document.querySelector('.l124-stage');
        if (!s) return null;
        return 'sid:' + (s.dataset.sid || s.dataset.l124ask || '?');
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
    await sleep(220);
    return true;
  };
  const snap = async () => JSON.parse(await ev('JSON.stringify(Game.snapshot())'));
  const keysBetween = (a, b) => ev(`window.__played.filter(function(p){return p.t>=${a}&&p.t<=${b};}).map(function(p){
    for (var k in window.VOICE_BANK) if (window.VOICE_BANK[k] === p.src) return k;
    return 'unknown';
  })`);
  /* 跨岛复用 key（g3_cmd_* 在 island_7_3）要现补分块，必须等到真的开播再断言 */
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
    Array.prototype.forEach.call(document.querySelectorAll('#askDisplay .l124-room, #askDisplay .l124-hand, #askDisplay .l124-item, #askDisplay .l124-person, #askDisplay .l124-slot, #askDisplay .l124-card, #askDisplay .l124-twokid, #askDisplay .l124-thumb'), function(n){
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
      if(!r.width||!r.height) continue;
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
  await ev('Game.markCleared(12,1)');
  await ev('Game.markCleared(12,2)');
  const u12c = await ev('Game.progress.unlockedLevel[12]');
  if (u12c !== 3) fail('通关 12-2 后 unlockedLevel[12] 应为 3，实际 ' + u12c);
  // 12-3 未通时 12-4 必须锁着
  await ev('Game.openIsland(12)'); await sleep(150);
  rep.checks.locked124 = await ev(`(function(){var n=document.querySelector('[data-level="4"]');return n?n.className:'none';})()`);
  if (String(rep.checks.locked124).indexOf('locked') < 0) fail('12-3 未通关时 12-4 没有锁住：' + rep.checks.locked124);
  await ev('Game.markCleared(12,3)');
  const u12d = await ev('Game.progress.unlockedLevel[12]');
  if (u12d !== 4) fail('通关 12-3 后 unlockedLevel[12] 应为 4，实际 ' + u12d);

  // ---------- 1) 教学 7 环节 ----------
  await ev('Game.openIsland(12)'); await sleep(200);
  await ev('Game.enterLevel(4)'); await sleep(250);
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
    const end = Date.now() + 24000;
    while (Date.now() < end) { idx = await findEntry('sid:' + st.n, logCursor); if (idx >= 0) break; await sleep(70); }
    const entry = idx >= 0 ? JSON.parse(await ev('JSON.stringify(window.__stageLog[' + idx + '])')) : null;
    if (idx >= 0) logCursor = idx + 1;
    const row = { step: st.n, reached: !!entry };
    if (!row.reached) { fail('教学第 ' + (i + 1) + ' 步（' + st.n + '）没到'); rep.tutorial.push(row); continue; }

    await sleep(240);
    row.audio = await awaitAudio(st.word, entry.t - 1200, st.demo || st.out ? 7000 : 4000);
    row.audioOk = row.audio.indexOf(st.word) >= 0;
    if (!row.audioOk) fail('教学第 ' + (i + 1) + ' 步（' + st.n + '）语音不符：期望 ' + st.word + '，实际 ' + row.audio.join(','));

    if (st.demo) {
      // 演示定格：不点按不得前进（§三.14）
      await sleep(1600);
      const stillThere = await ev('!!document.querySelector(".l124-stage[data-sid=\\"' + st.n + '\\"]")');
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
      if (!hint) fail('教学互动步 ' + st.ask + ' 的 4 秒小手没出现（§二.12）');
      if (st.ask === 1) {
        // 第一步：物品不在手上时拖到人 → 只弹回、不推进
        const before = await ev('document.querySelector(".l124-stage").dataset.l124step');
        await drag('#askDisplay .l124-stage .l124-item', '#askDisplay .l124-hand');
        await sleep(500);
        row.step1 = await ev('document.querySelector(".l124-stage") ? document.querySelector(".l124-stage").dataset.l124step : "none"');
        row.handHasItem = await ev('!!document.querySelector("#askDisplay .l124-hand .l124-on")');
        if (row.step1 !== '2') fail('教学互动 1：把苹果拖到手上后 step 不是 2，实际 ' + row.step1 + '（before ' + before + '）');
        if (!row.handHasItem) fail('教学互动 1：手上没有出现苹果');
      } else {
        // 第二步：手上的苹果拖给爸爸
        const wrong = await ev('!!document.querySelector("#askDisplay .l124-on")');
        row.heldOk = wrong;
        if (!wrong) fail('教学互动 2：手上没有可拖的苹果');
        row.dragFrom = await centerOf('#askDisplay .l124-on');
        row.dragTo = await centerOf('#askDisplay .l124-person[data-who="dad"]');
        await drag('#askDisplay .l124-on', '#askDisplay .l124-person[data-who="dad"]');
        /* 递完 900ms 才进下一步，drag() 内含 220ms，这里只再等 260ms（合计约 480ms） */
        await sleep(260);
        row.step3 = await ev('(function(){var s=document.querySelector(".l124-stage");return (s&&s.dataset.l124step)||"none";})()');
        row.gaveOk = await ev('!!document.querySelector("#askDisplay .l124-person[data-who=\\"dad\\"] .l124-heart")');
        if (!row.gaveOk) fail('教学互动 2：递给爸爸后没有出现爱心（没落位）step=' + row.step3 +
          ' from=' + JSON.stringify(row.dragFrom) + ' to=' + JSON.stringify(row.dragTo));
      }
      await sleep(900);
    }
    rep.tutorial.push(row);
  }
  const inAsk = await wait('Game.phase === "asking"', 9000);
  if (!inAsk) fail('教学没有进入答题（phase=' + await ev('Game.phase') + '）');

  // ---------- 2) 12 轮答题 ----------
  const typeCount = { L124A: 0, L124B: 0, L124C: 0 };
  const combos = [], actSeqs = [], trays = [];
  let wrongTested = 0, wrongOk = 0;

  for (let r = 0; r < 12; r++) {
    const ok = await wait('Game.phase === "asking" && Game.round === ' + r, 13000);
    if (!ok) { fail('第 ' + (r + 1) + ' 轮没开始（round=' + await ev('Game.round') + '）'); break; }
    await sleep(280);
    const s = await snap();
    const q = s.question || {};
    const row = { round: r + 1, type: q.l124ask };
    if (!typeCount[q.l124ask]) typeCount[q.l124ask] = 0;
    typeCount[q.l124ask] += 1;

    const ov = await overflow();
    row.overflow = ov.cut.length ? ov.cut : 'ok';
    if (ov.cut.length) fail('第 ' + (r + 1) + ' 轮溢出：' + ov.cut.join(','));
    if (ov.zero.length) fail('第 ' + (r + 1) + ' 轮零尺寸元素：' + ov.zero.join(','));
    if (ov.sw > ov.iw + 1 || ov.sh > ov.ih + 1) fail('第 ' + (r + 1) + ' 轮页面滚动溢出 ' + ov.sw + 'x' + ov.sh);

    if (q.l124ask === 'L124A') {
      combos.push(q.l124item + '|' + q.l124who);
      const items = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l124-item'),function(n){return n.dataset.item;})");
      const people = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l124-person'),function(n){return n.dataset.who;})");
      row.items = items; row.people = people;
      if ((items || []).length !== 2) fail('第 ' + (r + 1) + ' 轮物品不是 2 个：' + JSON.stringify(items));
      if ((people || []).length !== 2) fail('第 ' + (r + 1) + ' 轮人物不是 2 个：' + JSON.stringify(people));
      if ((items || []).indexOf(q.l124item) < 0) fail('第 ' + (r + 1) + ' 轮目标物品不在场景里：' + q.l124item);

      const starsBefore = (await snap()).stars;
      // 步骤 1 拿错物品 → 播 again、不推进
      if (wrongTested < 1) {
        wrongTested += 1;
        const wrongItem = (items || []).find(x => x !== q.l124item);
        const tW = Date.now();
        await drag('#askDisplay .l124-item[data-item="' + wrongItem + '"]', '#askDisplay .l124-hand');
        await sleep(500);
        const st1 = await ev('document.querySelector(".l124-stage").dataset.l124step');
        const spokeW = await keysBetween(tW, tW + 900);
        row.wrongItemSpoke = spokeW;
        if (st1 !== '1') fail('第 ' + (r + 1) + ' 轮拿错物品却推进了（step=' + st1 + '）');
        if (spokeW.indexOf('again') < 0) fail('第 ' + (r + 1) + ' 轮拿错物品没播 again：' + spokeW.join(','));
        const starOk = (await snap()).stars === starsBefore;
        if (!starOk) fail('第 ' + (r + 1) + ' 轮拿错物品却给了星');
        if (st1 === '1' && spokeW.indexOf('again') >= 0 && starOk) wrongOk += 1;
        await sleep(700);
      }
      // 步骤 1：正确物品 → 手上
      await drag('#askDisplay .l124-item[data-item="' + q.l124item + '"]', '#askDisplay .l124-hand');
      await sleep(420);
      row.step1 = await ev('document.querySelector(".l124-stage").dataset.l124step');
      row.handItem = await ev('(function(){var n=document.querySelector("#askDisplay .l124-hand .l124-on");return n?n.dataset.item:null;})()');
      if (row.step1 !== '2') fail('第 ' + (r + 1) + ' 轮第一步没进到 2（step=' + row.step1 + '）');
      if (row.handItem !== q.l124item) fail('第 ' + (r + 1) + ' 轮手上不是目标物品：' + row.handItem);

      // 步骤 2：先递错人 → 播 again、不推进
      const wrongWho = q.l124who === 'dad' ? 'mom' : 'dad';
      const tW2 = Date.now();
      await drag('#askDisplay .l124-on', '#askDisplay .l124-person[data-who="' + wrongWho + '"]');
      await sleep(500);
      const st2 = await ev('document.querySelector(".l124-stage").dataset.l124step');
      const spokeW2 = await keysBetween(tW2, tW2 + 900);
      row.wrongWhoSpoke = spokeW2;
      if (st2 !== '2') fail('第 ' + (r + 1) + ' 轮递错人却推进了（step=' + st2 + '）');
      if (spokeW2.indexOf('again') < 0) fail('第 ' + (r + 1) + ' 轮递错人没播 again：' + spokeW2.join(','));
      await sleep(700);

      // 步骤 2：正确 → 台词 → 星星
      const tOk = Date.now();
      await drag('#askDisplay .l124-on', '#askDisplay .l124-person[data-who="' + q.l124who + '"]');
      const line = await awaitAudio('l124_line_thanks', tOk, 5000);
      row.line = line;
      const all = await keysBetween(tOk, tOk + 2600);
      if (all.some(k => String(k).indexOf('praise_') === 0)) fail('第 ' + (r + 1) + ' 轮出现了夸奖人声：' + all.join(','));
      if (line.indexOf('l124_line_thanks') < 0) fail('第 ' + (r + 1) + ' 轮递对了没有播剧情台词 l124_line_thanks：' + line.join(','));
      await sleep(900);
      const s2 = await snap();
      if (s2.stars !== starsBefore + 1) fail('第 ' + (r + 1) + ' 轮答对没有加星（' + starsBefore + '→' + s2.stars + '）');
    } else if (q.l124ask === 'L124B') {
      actSeqs.push(q.l124acts.join('+'));
      const thumb = await centerOf('#askDisplay .l124-thumb');
      row.thumb = thumb ? Math.round(thumb.w) : 0;
      /* 矮屏（max-height:600px）CSS 会把拇指压到 min(38vw,170px)，阈值同步下调 */
      const minW = H <= 600 ? Math.min(W * 0.38, 170) : Math.min(W * 0.44, 190);
      if (!thumb) fail('第 ' + (r + 1) + ' 轮没有大拇指按钮');
      else if (thumb.w < minW - 8) fail('第 ' + (r + 1) + ' 轮大拇指按钮太小：' + Math.round(thumb.w) + ' < ' + Math.round(minW));
      const kids = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l124-twokid'),function(n){return n.dataset.act;})");
      row.kids = kids;
      if ((kids || []).length !== 2) fail('第 ' + (r + 1) + ' 轮小孩不是 2 个：' + JSON.stringify(kids));
      if ((kids || []).join('+') !== q.l124acts.join('+')) fail('第 ' + (r + 1) + ' 轮小孩动作与题面不一致：' + JSON.stringify(kids) + ' vs ' + JSON.stringify(q.l124acts));

      const starsBefore = (await snap()).stars;
      const tTap = Date.now();
      await click('#askDisplay .l124-thumb');
      await sleep(400);
      const spoke = (await keysBetween(tTap + 80, tTap + 400)).filter(k => k !== 'unknown');
      row.spokeAfter = spoke;
      if (spoke.length) fail('第 ' + (r + 1) + ' 轮点👍后 400ms 内出现语音：' + spoke.join(','));
      const s2 = await snap();
      if (s2.stars !== starsBefore + 1) fail('第 ' + (r + 1) + ' 轮点👍没有加星（' + starsBefore + '→' + s2.stars + '）');
    } else {
      trays.push(q.l124pics.join(','));
      const slots = await ev("document.querySelectorAll('#askDisplay .l124-slot').length");
      const cards = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l124-card'),function(n){return n.dataset.pic;})");
      row.slots = slots; row.cards = cards;
      if (slots !== 2) fail('第 ' + (r + 1) + ' 轮框数不是 2：' + slots);
      if ((cards || []).length !== 4) fail('第 ' + (r + 1) + ' 轮候选图不是 4 张：' + JSON.stringify(cards));
      if ((cards || []).join(',') !== q.l124pics.join(',')) fail('第 ' + (r + 1) + ' 轮候选图顺序与题面不一致');
      if ((cards || []).indexOf(q.l124arr[0]) < 0) fail('第 ' + (r + 1) + ' 轮第一张答案图不在栏里：' + q.l124arr[0]);
      if ((cards || []).indexOf(q.l124arr[1]) < 0) fail('第 ' + (r + 1) + ' 轮第二张答案图不在栏里：' + q.l124arr[1]);

      const starsBefore = (await snap()).stars;
      // 先点错一张 → 播 again、不填框
      const wrongPic = (cards || []).find(x => x !== q.l124arr[0]);
      const tW = Date.now();
      await click('#askDisplay .l124-card[data-pic="' + wrongPic + '"]');
      await sleep(500);
      const filled0 = await ev("document.querySelectorAll('#askDisplay .l124-slot .l124-pic').length");
      const spokeW = await keysBetween(tW, tW + 900);
      row.wrongPicSpoke = spokeW;
      if (filled0 !== 0) fail('第 ' + (r + 1) + ' 轮点错却填了框');
      if (spokeW.indexOf('again') < 0) fail('第 ' + (r + 1) + ' 轮点错没播 again：' + spokeW.join(','));
      await sleep(700);

      const tOk = Date.now();
      await click('#askDisplay .l124-card[data-pic="' + q.l124arr[0] + '"]');
      await sleep(420);
      const filled1 = await ev("Array.prototype.map.call(document.querySelectorAll('#askDisplay .l124-slot .l124-pic'),function(n){return n.dataset.pic;})");
      row.filled1 = filled1;
      if ((filled1 || []).length !== 1 || filled1[0] !== q.l124arr[0]) fail('第 ' + (r + 1) + ' 轮第一张放错位：' + JSON.stringify(filled1));
      await click('#askDisplay .l124-card[data-pic="' + q.l124arr[1] + '"]');
      await sleep(400);
      const spoke = (await keysBetween(tOk + 900, tOk + 1500)).filter(k => k !== 'unknown');
      row.spokeAfter = spoke;
      if (spoke.length) fail('第 ' + (r + 1) + ' 轮排对后 400ms 内出现语音：' + spoke.join(','));
      await sleep(500);
      const s2 = await snap();
      if (s2.stars !== starsBefore + 1) fail('第 ' + (r + 1) + ' 轮排对没有加星（' + starsBefore + '→' + s2.stars + '）');
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
  rep.checks.cleared124 = !!fin.progress.cleared['12-4'];
  rep.checks.u12 = fin.progress.unlockedLevel[12];
  rep.checks.wrongOk = wrongOk + '/' + wrongTested;
  if (!done) fail('12 轮后没有通关（phase=' + fin.phase + '）');
  if (typeCount.L124A !== 4 || typeCount.L124B !== 4 || typeCount.L124C !== 4) fail('题型分布不是 4/4/4：' + JSON.stringify(typeCount));
  if (fin.stars !== 12) fail('星星不是 12：' + fin.stars);
  if (!fin.progress.cleared['12-4']) fail('没有记录 cleared["12-4"]');
  if (fin.progress.unlockedLevel[12] !== 4) fail('unlockedLevel[12] 应为 4（12-5 不存在，不得越界），实际 ' + fin.progress.unlockedLevel[12]);
  const grandOn = await ev('document.getElementById("viewDone").classList.contains("grand")');
  if (grandOn) fail('12-4 不是岛末关，不该走 grand 模式');

  // 防背题：组合 / 动作序列 / 候选图排列都真的变过
  const distinct = a => new Set(a).size;
  rep.checks.combos = combos.join(' ');
  rep.checks.distinctCombos = distinct(combos);
  rep.checks.acts = actSeqs.join(' ');
  rep.checks.distinctActs = distinct(actSeqs);
  rep.checks.trays = distinct(trays);
  if (distinct(combos) < 2) fail('A 型「物品×人」组合没变过：' + combos.join(','));
  if (distinct(actSeqs) < 2) fail('B 型动作组合没变过：' + actSeqs.join(','));
  if (distinct(trays) < 2) fail('C 型候选图排列没变过');
  /* 不许连续两轮相同（§三.28）：按题型分别检查相邻重复 */
  const dup = (a, name) => {
    for (let i = 1; i < a.length; i++) if (a[i] === a[i - 1]) { fail(name + ' 第 ' + (i + 1) + ' 轮与上一轮完全相同：' + a[i]); return; }
  };
  dup(combos, 'A 型'); dup(actSeqs, 'B 型'); dup(trays, 'C 型');
  rep.checks.trayList = trays.join(' | ');

  const lat = await latin();
  rep.checks.latin = lat;
  if (lat.length) fail('出现英文字母：' + lat.join(' | '));
  const errs = await ev('window.__errs');
  if (errs && errs.length) fail('页面报错：' + errs.join(' | '));

  console.log(JSON.stringify(rep, null, 1));
  console.log(rep.errors.length ? ('FAIL ' + rep.errors.length + ' 项') : 'PASS 全部通过');
  finish(rep.errors.length ? 1 : 0);
})().catch(e => { console.log('PROBE_ERROR', e && e.message); finish(2); });
