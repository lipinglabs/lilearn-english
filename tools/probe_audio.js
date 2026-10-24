// 教学音频专项回归（不 stub Audio，用真实 <audio> 行为）
//   背景：教学演示「语音播完 → 定格 → 点屏幕继续」的监听是挂在 document 捕获阶段的，
//   曾经有两个致命副作用：
//     ① 定格时点喇叭（重播）被 stopPropagation 吞掉 —— 喇叭不发声，还顺手把这一步跳过去；
//     ② 语音还在播时点喇叭 —— me.replay() 的 say() 把 speakToken 顶掉，
//        这一步的「定格」回调永久作废 → 教学卡死（没声音、点屏幕也不动）。
//   本探针在真实音频下逐条断言这两条修复，避免回归。
// 用法：node tools/probe_audio.js [island level]
//   默认 6 5（第 6 岛第 5 关，房间整理教学）
const { spawn } = require('child_process');
const WebSocket = require('ws');
const os = require('os'), path = require('path');
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ISL = parseInt(process.argv[2] || '6', 10);
const LV = parseInt(process.argv[3] || '5', 10);
const PORT = 9765, W = 390, H = 844;

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-audio-' + Date.now()),
  '--window-size=' + W + ',' + H, 'about:blank'], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let id = 0; const pend = new Map();
const fin = c => { try { proc.kill(); } catch (e) {} setTimeout(() => process.exit(c), 150); };

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
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails || {};
      console.log('PAGE_EXC', String((d.exception && d.exception.description) || d.text).slice(0, 240));
    }
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
    window.__played = [];
    window.__rej = [];
    var P = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(){
      var self = this;
      window.__played.push({ t: Date.now() });
      var r;
      try { r = P.call(self); } catch (e) { window.__rej.push(String(e && e.name)); throw e; }
      if (r && r.catch) r.catch(function(e){ window.__rej.push(String(e && e.name)); });
      return r;
    };
    // 记录「冒泡阶段」是否还能收到喇叭的 click（被 capture+stopPropagation 吞掉时收不到）
    window.__spkSeen = 0;
    document.addEventListener('click', function(e){
      if (e.target && e.target.closest && e.target.closest('#btnReplay')) window.__spkSeen++;
    }, false);
  ` }, sessionId);

  await send('Page.navigate', { url: 'file:///' + path.resolve('index.html').replace(/\\/g, '/') }, sessionId);
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, sessionId);
    if (r.exceptionDetails) throw new Error('EVAL ' + e.slice(0, 60));
    return r.result.value;
  };
  const wait = async (e, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await ev(e)) return true; await sleep(80); } return false; };
  const rectOf = s => ev(`(function(){var n=document.querySelector(${JSON.stringify(s)});if(!n)return null;var b=n.getBoundingClientRect();return {cx:b.left+b.width/2,cy:b.top+b.height/2};})()`);
  const mouse = (ty, x, y, b) => send('Input.dispatchMouseEvent', { type: ty, x, y, button: 'left', clickCount: 1, buttons: b === undefined ? 1 : b }, sessionId);
  const tap = async s => { const c = await rectOf(s); if (!c) return false; await mouse('mousePressed', c.cx, c.cy, 1); await sleep(50); await mouse('mouseReleased', c.cx, c.cy, 0); await sleep(90); return true; };
  const subj = () => ev('(function(){var n=document.querySelector("#askDisplay .f14-room, #askDisplay .b5x-stage");return n&&n.dataset?(n.dataset.subj||n.dataset.sid||null):null;})()');
  /* 是否换了新的一步：给当前舞台节点打一个标记，下一步会重建舞台节点（旧节点被丢弃）。
     比「innerHTML 长度」可靠 —— 演示步定格时只是给元素加了个 glow 类，不该算换步。 */
  const markStage = () => ev(`(function(){
    var a = document.getElementById('askDisplay'); if (!a) return false;
    var f = a.firstElementChild; if (!f) return false;
    f.setAttribute('data-probe-mark', '1'); return true;
  })()`);
  const stageReplaced = () => ev(`(function(){
    var a = document.getElementById('askDisplay'); if (!a) return true;
    var f = a.firstElementChild; if (!f) return true;
    return f.getAttribute('data-probe-mark') !== '1';
  })()`);

  await wait('typeof window.Game !== "undefined"', 90000);
  await sleep(400);

  // 解锁到目标关
  await ev('Game.resetProgress()');
  await ev(`for (var i=1;i<${ISL};i++){for(var l=1;l<=5;l++){Game.markCleared(i,l);}}`);
  await ev(`for (var l=1;l<${LV};l++) Game.markCleared(${ISL},l)`);
  await ev(`Game.openIsland(${ISL})`); await sleep(250);
  await ev(`document.querySelector('.node[data-level="${LV}"]').click()`); await sleep(300);
  await ev('document.getElementById("btnStart").click()');

  const rep = { island: ISL, level: LV, checks: {}, errors: [] };

  // ---------- A) 语音还在播时点喇叭：不能把这一步的「定格」吃掉 ----------
  await sleep(320);
  const subjA0 = await subj();
  await markStage();
  const playsA0 = await ev('window.__played.length');
  await tap('#btnReplay');
  const gateA = await wait('!!document.querySelector(".f11-tap")', 9000);
  rep.checks.midPlayReplay = {
    subjBefore: subjA0, subjAfter: await subj(),
    playedMore: (await ev('window.__played.length')) > playsA0,
    gateAppeared: gateA
  };
  if (!rep.checks.midPlayReplay.playedMore) rep.errors.push('播放中点喇叭没有重新发声');
  if (!gateA) rep.errors.push('播放中点喇叭后「轻点继续」超过 9 秒不出现（教学会卡死）');
  if (await stageReplaced()) rep.errors.push('播放中点喇叭意外推进了步骤');

  // 还能正常点屏幕推进（证明没卡死）
  await tap('#askDisplay');
  const advancedA = await wait(`(function(){
    var a = document.getElementById('askDisplay'); if (!a) return true;
    var f = a.firstElementChild; if (!f) return true;
    return f.getAttribute('data-probe-mark') !== '1';
  })()`, 6000);
  rep.checks.midPlayReplay.canAdvance = advancedA;
  if (!advancedA) rep.errors.push('播放中点喇叭后点屏幕无法推进（教学卡死）');

  // ---------- B) 定格时点喇叭：要发声、不推进、定格保留 ----------
  const gateB = await wait('!!document.querySelector(".f11-tap")', 12000);
  rep.checks.frozenReplay = { gateReady: gateB };
  if (gateB) {
    const subjB0 = await subj();
    await markStage();
    const playsB0 = await ev('window.__played.length');
    const spkBefore = await ev('window.__spkSeen');
    await tap('#btnReplay');
    await sleep(900);
    const playsB1 = await ev('window.__played.length');
    const spkAfter = await ev('window.__spkSeen');
    rep.checks.frozenReplay = {
      gateReady: true,
      subjBefore: subjB0, subjAfter: await subj(),
      playedMore: playsB1 > playsB0,
      clickReachedButton: spkAfter > spkBefore,
      gateStillThere: await ev('!!document.querySelector(".f11-tap")')
    };
    if (!rep.checks.frozenReplay.clickReachedButton) rep.errors.push('定格时喇叭的 click 被拦截（冒泡阶段收不到）');
    if (!rep.checks.frozenReplay.playedMore) rep.errors.push('定格时点喇叭没有发声');
    if (await stageReplaced()) rep.errors.push('定格时点喇叭意外推进了步骤');
    if (!rep.checks.frozenReplay.gateStillThere) rep.errors.push('定格时点喇叭把「轻点继续」弄丢了');
  } else {
    rep.errors.push('没能等到第二个演示的定格（前置步骤可能已异常）');
  }

  rep.checks.rejects = await ev('window.__rej.length');

  const ok = rep.errors.length === 0 &&
    rep.checks.midPlayReplay.gateAppeared && rep.checks.midPlayReplay.canAdvance &&
    rep.checks.frozenReplay.gateReady !== false;
  console.log(JSON.stringify(rep, null, 2));
  console.log('\nAUDIO_' + (ok ? 'PASS' : 'FAIL') + ' ' + JSON.stringify(rep.checks));
  fin(ok ? 0 : 1);
})().catch(e => { console.error('AUDIO_ERROR', e); fin(2); });
