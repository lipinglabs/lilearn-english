// 第 12 岛第 5 关（L12-W5：年度游乐场 · 小岛寻宝大结局）专项测试 —— 项目最后一关
//   1) 解锁链：12-4 未通时 12-5 锁着；通 12-4 后解锁；通关 12-5 后 u12=5（不越界）。
//   2) 教学 6 环节：藏宝图+金钥匙 2 演示 → 点出红苹果（互动）→ 奖杯 2 演示 → 过渡。
//      演示步「不点按不前进」；互动步 4 秒小手；点错播 again 且不推进。
//   3) 三题型 12 轮 4/4/4：A 跨主题听音点选 / B 两步按顺序点 / C 拖拽组装奖杯。
//   4) 答对 400ms 内完全静音（禁夸奖人声）；答错播 again 不扣星。
//   5) 年度大结局：grand + finale + 12 面小旗 + 第 12 岛小旗升起 + 收尾台词 l125_finale。
//   6) 无英文字母、双视口无溢出、零尺寸元素。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const os = require('os'), path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const PORT = 9994 + (W === 390 ? 0 : 1);
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));

const STEPS = [
  { n: 'map', word: 'l125_t_intro', demo: true },
  { n: 'mapx', word: 'l125_t_map', demo: true },
  { n: 'findApple', word: 'l125_t_find', ask: true },
  { n: 'trophy', word: 'l125_t_wow', demo: true },
  { n: 'trophy2', word: 'l125_t_super', demo: true },
  { n: 'out', word: 'l125_t_out', out: true }
];

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-l125-' + Date.now()),
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
        var s = document.querySelector('.l125-stage');
        if (!s) return null;
        return 'sid:' + (s.dataset.sid || s.dataset.l125ask || '?');
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
    Array.prototype.forEach.call(document.querySelectorAll('#askDisplay .l125-map, #askDisplay .l125-card, #askDisplay .l125-trophy, #askDisplay .l125-slot, #askDisplay .l125-part'), function(n){
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
  await ev('Game.markCleared(12,3)');
  const u12d = await ev('Game.progress.unlockedLevel[12]');
  if (u12d !== 4) fail('通关 12-3 后 unlockedLevel[12] 应为 4，实际 ' + u12d);
  await ev('Game.openIsland(12)'); await sleep(150);
  rep.checks.locked125 = await ev(`(function(){var n=document.querySelector('[data-level="5"]');return n?n.className:'none';})()`);
  if (String(rep.checks.locked125).indexOf('locked') < 0) fail('12-4 未通关时 12-5 没有锁住：' + rep.checks.locked125);
  await ev('Game.markCleared(12,4)');
  const u12e = await ev('Game.progress.unlockedLevel[12]');
  if (u12e !== 5) fail('通关 12-4 后 unlockedLevel[12] 应为 5，实际 ' + u12e);

  // ---------- 1) 教学 6 环节 ----------
  await ev('Game.openIsland(12)'); await sleep(200);
  await ev('Game.enterLevel(5)'); await sleep(250);
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
    row.audio = await awaitAudio(st.word, entry.t - 1200, st.demo || st.out ? 8000 : 4000);
    row.audioOk = row.audio.indexOf(st.word) >= 0;
    if (!row.audioOk) fail('教学第 ' + (i + 1) + ' 步（' + st.n + '）语音不符：期望 ' + st.word + '，实际 ' + row.audio.join(','));

    if (st.demo) {
      await sleep(1600);
      const stillThere = await ev('!!document.querySelector(".l125-stage[data-sid=\\"' + st.n + '\\"]")');
      row.frozen = stillThere;
      if (!stillThere) fail('教学第 ' + (i + 1) + ' 步（' + st.n + '）演示步自动前进了（违反 §三.14）');
      const tapHint = await ev('!!document.querySelector(".f11-tap")');
      row.tapHint = tapHint;
      if (!tapHint) fail('教学第 ' + (i + 1) + ' 步（' + st.n + '）定格时没有「轻点继续」提示');
      await clickXY(Math.round(W * 0.5), Math.round(H * 0.62));
      await sleep(420);
    } else if (st.ask) {
      let hint = false;
      for (let k = 0; k < 70; k++) { if (await ev('!!document.querySelector(".tut-hint")')) { hint = true; break; } await sleep(100); }
      row.hint4s = hint;
      if (!hint) fail('教学互动步的 4 秒小手没出现（§二.12）');
      // 点错 → 播 again、不推进
      const tW = Date.now();
      await click('#askDisplay .l125-card[data-item="banana"]');
      await sleep(600);
      const spokeW = await keysBetween(tW, tW + 1200);
      row.wrongSpoke = spokeW;
      row.stillThere = await ev('!!document.querySelector(".l125-stage[data-sid=\\"findApple\\"]")');
      if (!row.stillThere) fail('教学互动步点错却推进了');
      if (spokeW.indexOf('again') < 0) fail('教学互动步点错没播 again：' + spokeW.join(','));
      // 点对 → 推进
      await click('#askDisplay .l125-card[data-item="apple"]');
      await sleep(500);
      row.gotOk = await ev('!!document.querySelector(".l125-card[data-item=\\"apple\\"].l125-got")');
      if (!row.gotOk) fail('教学互动步点对红苹果后没有落位反馈');
      await sleep(900);
    }
    rep.tutorial.push(row);
  }
  const inAsk = await wait('Game.phase === "asking"', 9000);
  if (!inAsk) fail('教学没有进入答题（phase=' + await ev('Game.phase') + '）');

  // ---------- 2) 12 轮答题 ----------
  const typeCount = { L125A: 0, L125B: 0, L125C: 0 };
  const aWants = [], aPos = [], bSeqs = [], cParts = [], cTrays = [];
  let wrongTested = 0, wrongOk = 0;

  for (let r = 0; r < 12; r++) {
    const ok = await wait('Game.phase === "asking" && Game.round === ' + r, 13000);
    if (!ok) { fail('第 ' + (r + 1) + ' 轮没开始（round=' + await ev('Game.round') + '）'); break; }
    await sleep(280);
    const s = await snap();
    const q = s.question || {};
    const row = { round: r + 1, type: q.l125ask };
    if (!typeCount[q.l125ask]) typeCount[q.l125ask] = 0;
    typeCount[q.l125ask] += 1;

    const ov = await overflow();
    row.overflow = (ov.cut.length || ov.zero.length) ? ov : 'ok';
    if (ov.cut.length) fail('第 ' + (r + 1) + ' 轮元素越界：' + ov.cut.join(','));
    if (ov.zero.length) fail('第 ' + (r + 1) + ' 轮零尺寸元素：' + ov.zero.join(','));
    if (ov.sw > ov.iw + 1) fail('第 ' + (r + 1) + ' 轮横向溢出 ' + ov.sw + ' > ' + ov.iw);

    const starsBefore = (await snap()).stars;

    if (q.l125ask === 'L125A') {
      const opts = q.l125opts || [];
      aWants.push(q.l125want); aPos.push(q.l125answer);
      row.opts = opts; row.want = q.l125want;
      if (opts.length !== 3) fail('第 ' + (r + 1) + ' 轮 A 型不是 3 个选项：' + JSON.stringify(opts));
      if (opts.indexOf(q.l125want) < 0) fail('第 ' + (r + 1) + ' 轮 A 型目标不在选项里：' + q.l125want);
      if (q.l125answer !== opts.indexOf(q.l125want)) fail('第 ' + (r + 1) + ' 轮 A 型答案下标与题面不一致');
      if (wrongTested === 0) {
        wrongTested += 1;
        const wrongItem = opts.find(x => x !== q.l125want);
        const tW = Date.now();
        await click('#askDisplay .l125-card[data-item="' + wrongItem + '"]');
        await sleep(500);
        const spokeW = await keysBetween(tW, tW + 1100);
        row.wrongSpoke = spokeW;
        const starOk = (await snap()).stars === starsBefore;
        if (spokeW.indexOf('again') < 0) fail('第 ' + (r + 1) + ' 轮 A 点错没播 again：' + spokeW.join(','));
        if (!starOk) fail('第 ' + (r + 1) + ' 轮 A 点错却给了星');
        if (spokeW.indexOf('again') >= 0 && starOk) wrongOk += 1;
        await sleep(500);
      }
      const tC = Date.now();
      await click('#askDisplay .l125-card[data-item="' + q.l125want + '"]');
      await sleep(400);
      const s2 = await snap();
      row.starsDelta = s2.stars - starsBefore;
      if (s2.stars !== starsBefore + 1) fail('第 ' + (r + 1) + ' 轮 A 答对没有加星（' + starsBefore + '→' + s2.stars + '）');
      const spokeAfter = (await keysBetween(tC + 60, tC + 460)).filter(k => k !== 'unknown');
      row.spokeAfter = spokeAfter;
      if (spokeAfter.length) fail('第 ' + (r + 1) + ' 轮 A 答对后 400ms 内有声音：' + spokeAfter.join(','));
      row.afterVoice = await ev('!!document.querySelector("#askDisplay .l125-card[data-item=\\"' + q.l125want + '\\"].l125-got")');
    } else if (q.l125ask === 'L125B') {
      const seq = q.l125seq || [], tray = q.l125tray || [];
      bSeqs.push(seq.join('+'));
      row.seq = seq; row.tray = tray;
      if (seq.length !== 2) fail('第 ' + (r + 1) + ' 轮 B 型不是两步：' + JSON.stringify(seq));
      if (tray.length !== 4) fail('第 ' + (r + 1) + ' 轮 B 型托盘不是 4 个：' + JSON.stringify(tray));
      seq.forEach(id => { if (tray.indexOf(id) < 0) fail('第 ' + (r + 1) + ' 轮 B 型 ' + id + ' 不在托盘里'); });
      // 第一步点错
      const bad1 = tray.find(x => x !== seq[0]);
      await click('#askDisplay .l125-card[data-item="' + bad1 + '"]');
      await sleep(400);
      row.stepAfterWrong1 = await ev('document.querySelector(".l125-stage").dataset.l125step');
      if (row.stepAfterWrong1 !== '1') fail('第 ' + (r + 1) + ' 轮 B 第一步点错却前进了（step=' + row.stepAfterWrong1 + '）');
      await sleep(500);
      // 第一步点对
      await click('#askDisplay .l125-card[data-item="' + seq[0] + '"]');
      await sleep(400);
      row.step1 = await ev('document.querySelector(".l125-stage").dataset.l125step');
      if (row.step1 !== '2') fail('第 ' + (r + 1) + ' 轮 B 第一步点对后 step 不是 2（' + row.step1 + '）');
      if ((await snap()).stars !== starsBefore) fail('第 ' + (r + 1) + ' 轮 B 第一步就给了星');
      // 第二步点错
      const bad2 = tray.find(x => x !== seq[0] && x !== seq[1]);
      await click('#askDisplay .l125-card[data-item="' + bad2 + '"]');
      await sleep(400);
      row.stepAfterWrong2 = await ev('document.querySelector(".l125-stage").dataset.l125step');
      if (row.stepAfterWrong2 !== '2') fail('第 ' + (r + 1) + ' 轮 B 第二步点错却回退了（step=' + row.stepAfterWrong2 + '）');
      await sleep(500);
      // 第二步点对
      const tC = Date.now();
      await click('#askDisplay .l125-card[data-item="' + seq[1] + '"]');
      await sleep(400);
      const s2 = await snap();
      if (s2.stars !== starsBefore + 1) fail('第 ' + (r + 1) + ' 轮 B 两步都对没有加星（' + starsBefore + '→' + s2.stars + '）');
      const spokeAfter = (await keysBetween(tC + 60, tC + 460)).filter(k => k !== 'unknown');
      row.spokeAfter = spokeAfter;
      if (spokeAfter.length) fail('第 ' + (r + 1) + ' 轮 B 答对后 400ms 内有声音：' + spokeAfter.join(','));
    } else {
      const part = q.l125part, parts = q.l125parts || [];
      cParts.push(part); cTrays.push(parts.join(','));
      row.part = part; row.parts = parts;
      if (parts.length !== 3) fail('第 ' + (r + 1) + ' 轮 C 型零件不是 3 个：' + JSON.stringify(parts));
      if (parts.indexOf(part) < 0) fail('第 ' + (r + 1) + ' 轮 C 型目标零件不在底部：' + part);
      const slot = await centerOf('#askDisplay .l125-slot');
      if (!slot) fail('第 ' + (r + 1) + ' 轮 C 型没有奖杯顶槽');
      row.slot = slot ? { w: Math.round(slot.w), h: Math.round(slot.h) } : null;
      // 拖错零件
      const badPart = parts.find(x => x !== part);
      await drag('#askDisplay .l125-part[data-part="' + badPart + '"]', '#askDisplay .l125-slot');
      await sleep(500);
      row.wrongPartStill = await ev('!!document.querySelector("#askDisplay .l125-part[data-part=\\"' + badPart + '\\"]")');
      row.wrongPartOn = await ev('!!document.querySelector("#askDisplay .l125-on")');
      if (!row.wrongPartStill) fail('第 ' + (r + 1) + ' 轮 C 拖错零件后零件消失了');
      if (row.wrongPartOn) fail('第 ' + (r + 1) + ' 轮 C 拖错零件却落位了');
      if ((await snap()).stars !== starsBefore) fail('第 ' + (r + 1) + ' 轮 C 拖错却给了星');
      await sleep(500);
      // 拖对零件
      const tC = Date.now();
      await drag('#askDisplay .l125-part[data-part="' + part + '"]', '#askDisplay .l125-slot');
      /* drag() 自带 220ms；judge 后 430ms 就进下一轮，落位必须在 430ms 之前读（§三.34 的节拍规矩） */
      row.onOk = await ev('!!document.querySelector("#askDisplay .l125-on")');
      if (!row.onOk) fail('第 ' + (r + 1) + ' 轮 C 拖对零件后没有落位');
      const s2 = await snap();
      if (s2.stars !== starsBefore + 1) fail('第 ' + (r + 1) + ' 轮 C 拖对没有加星（' + starsBefore + '→' + s2.stars + '）');
      const spokeAfter = (await keysBetween(tC + 60, tC + 460)).filter(k => k !== 'unknown');
      row.spokeAfter = spokeAfter;
      if (spokeAfter.length) fail('第 ' + (r + 1) + ' 轮 C 答对后 400ms 内有声音：' + spokeAfter.join(','));
    }
    rep.rounds.push(row);
    await sleep(500);
  }

  // ---------- 3) 通关与大结局 ----------
  const done = await wait('Game.phase === "done"', 12000);
  await sleep(900);
  const fin = await snap();
  rep.checks.done = done;
  rep.checks.types = typeCount;
  rep.checks.stars = fin.stars;
  rep.checks.cleared125 = !!fin.progress.cleared['12-5'];
  rep.checks.u12 = fin.progress.unlockedLevel[12];
  rep.checks.uIsland = fin.progress.unlockedIsland;
  rep.checks.wrongOk = wrongOk + '/' + wrongTested;
  if (!done) fail('12 轮后没有通关（phase=' + fin.phase + '）');
  if (typeCount.L125A !== 4 || typeCount.L125B !== 4 || typeCount.L125C !== 4) fail('题型分布不是 4/4/4：' + JSON.stringify(typeCount));
  if (fin.stars !== 12) fail('星星不是 12：' + fin.stars);
  if (!fin.progress.cleared['12-5']) fail('没有记录 cleared["12-5"]');

  const grandOn = await ev('document.getElementById("viewDone").classList.contains("grand")');
  rep.checks.grand = grandOn;
  if (!grandOn) fail('12-5 是岛末关，必须走 grand 模式');
  rep.checks.finale = fin.finale;
  if (!fin.finale) fail('没有触发年度通关大结局（#viewDone 缺少 finale 类）');
  rep.checks.finaleFlags = fin.finaleFlags;
  if (fin.finaleFlags !== 12) fail('大结局小旗不是 12 面：' + fin.finaleFlags);
  rep.checks.islandFlagUp = fin.islandFlagUp;
  rep.checks.islandFlagIsland = fin.islandFlagIsland;
  if (!fin.islandFlagUp) fail('舞台没有升起第 12 岛小旗');
  if (fin.islandFlagIsland !== 12) fail('升起的不是第 12 岛小旗：' + fin.islandFlagIsland);
  const banner = await ev('(function(){var n=document.querySelector(".l125-fin-banner");return n?n.textContent:"";})()');
  rep.checks.banner = banner;
  if (!banner) fail('大结局没有中文横幅');

  // 收尾台词（3 秒后才念）
  const tFin = Date.now();
  const finVoice = await awaitAudio('l125_finale', tFin - 900, 9000);
  rep.checks.finaleVoice = finVoice;
  if (finVoice.indexOf('l125_finale') < 0) fail('通关后没有播收尾台词 l125_finale：' + finVoice.join(','));

  // 地图第 12 岛点亮
  await ev('Game.backToMap()');
  await sleep(600);
  rep.checks.mapCard = await ev(`(function(){
    var n=document.querySelector('.island[data-island="12"]');
    if(!n) return null;
    return { cls: n.className, badge: !!n.querySelector('.island-flag-badge') };
  })()`);
  if (!rep.checks.mapCard || String(rep.checks.mapCard.cls).indexOf('cleared') < 0) fail('地图第 12 岛没有点亮 cleared：' + JSON.stringify(rep.checks.mapCard));
  if (!rep.checks.mapCard || !rep.checks.mapCard.badge) fail('地图第 12 岛没有通关小旗');

  // 防背题
  const distinct = a => new Set(a).size;
  const dup = (a, name) => {
    for (let i = 1; i < a.length; i++) if (a[i] === a[i - 1]) { fail(name + ' 相邻两轮完全相同：' + a[i]); return; }
  };
  rep.checks.aWants = aWants.join(' ');
  rep.checks.aPos = aPos.join(',');
  rep.checks.bSeqs = bSeqs.join(' ');
  rep.checks.cParts = cParts.join(' ');
  rep.checks.cTrays = distinct(cTrays);
  if (distinct(aWants) !== 4) fail('A 型 4 种目标没有各出现一次（牌堆发牌）：' + aWants.join(','));
  if (distinct(aPos) < 2) fail('A 型答案位置没变过（选项没洗牌）：' + aPos.join(','));
  if (distinct(bSeqs) !== 4) fail('B 型 4 种序列没有各出现一次：' + bSeqs.join(','));
  if (distinct(cParts) !== 4) fail('C 型 4 种零件没有各出现一次：' + cParts.join(','));
  if (distinct(cTrays) < 3) fail('C 型零件排列没变过：' + cTrays.join(' | '));
  dup(aWants, 'A 型'); dup(bSeqs, 'B 型'); dup(cTrays, 'C 型');

  const lat = await latin();
  rep.checks.latin = lat;
  if (lat.length) fail('出现英文字母：' + lat.join(' | '));
  const tpr = await ev('document.querySelectorAll("#askDisplay [aria-label=\\"我做到了\\"]").length');
  rep.checks.tpr = tpr;
  if (tpr) fail('出现了 TPR 大按钮（本关不应有）');
  const errs = await ev('window.__errs');
  if (errs && errs.length) fail('页面报错：' + errs.join(' | '));

  console.log(JSON.stringify(rep, null, 1));
  console.log(rep.errors.length ? ('FAIL ' + rep.errors.length + ' 项') : 'PASS 全部通过');
  finish(rep.errors.length ? 1 : 0);
})().catch(e => { console.log('PROBE_ERROR', e && e.message); finish(2); });
