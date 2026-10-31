// 验证 BUG2：第 2 岛第 5 关教学里的球必须能用「真触摸事件」拖动（不只是鼠标）
const { spawn } = require('child_process');
const WebSocket = require('ws');
const os = require('os'), path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const PORT = 9986;
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edge-vp5-' + Date.now()),
  '--window-size=' + W + ',' + H, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let id = 0; const pend = new Map();
const done = c => { try { proc.kill(); } catch (e) {} setTimeout(() => process.exit(c), 100); };

(async () => {
  let v;
  for (let i = 0; i < 200; i++) { try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) { v = await r.json(); break; } } catch (e) {} await sleep(250); }
  const ws = await new Promise((res, rej) => { const w = new WebSocket(v.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 1 << 28 }); w.on('open', () => res(w)); w.on('error', rej); });
  ws.on('message', raw => { const m = JSON.parse(raw); if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails || {}; console.log('PAGE_EXC', String((d.exception && d.exception.description) || d.text).slice(0, 300)); } if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
  const send = (m, p, s) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p || {}, sessionId: s })); });
  const t0 = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId: t0.targetId, flatten: true });
  await send('Page.enable', {}, sessionId); await send('Runtime.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true }, sessionId);
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
  await send('Page.navigate', { url: URL_ }, sessionId);

  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception)); return r.result.value; };
  const wait = async (e, ms = 14000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await ev(e)) return true; await sleep(70); } return false; };
  for (let i = 0; i < 1400; i++) { if (await ev('typeof window.Game !== "undefined"')) break; await sleep(120); }
  await sleep(300);

  const centerOf = s => ev(`(function(){var e=document.querySelector(${JSON.stringify(s)});if(!e)return null;var r=e.getBoundingClientRect();return r.width&&r.height?{x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height}:null;})()`);
  const tap = async (x, y) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }, sessionId);
    await sleep(50);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sessionId);
    await sleep(120);
  };
  const touchDrag = async (a, b) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] }, sessionId);
    for (let i = 1; i <= 12; i++) {
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (b.x - a.x) * i / 12, y: a.y + (b.y - a.y) * i / 12 }] }, sessionId);
      await sleep(16);
    }
    await sleep(80);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sessionId);
    await sleep(420);
  };

  await ev('Game.resetProgress()');
  for (let i = 1; i <= 11; i++) for (let l = 1; l <= 5; l++) await ev('Game.markCleared(' + i + ',' + l + ')');
  await ev('Game.openIsland(2)'); await sleep(150);
  await ev('Game.enterLevel(5)'); await sleep(250);
  await ev('document.getElementById("btnStart").click()');
  if (!(await wait('Game.phase === "tutorial"', 9000))) { console.log('FAIL 没进教学'); done(1); return; }

  // 1) 等 4 张形状卡
  await wait('document.querySelectorAll(".p5-shape-card").length === 4', 12000);
  // 2) 两个「摸一摸」互动：三角形 / 长方形
  for (const sid of ['triangle', 'rectangle']) {
    if (!(await wait('!!document.querySelector(".p5-shape-card.tappable")', 14000))) { console.log('FAIL 形状互动没出现', sid); done(1); return; }
    const c = await centerOf('.p5-shape-card[data-shape="' + sid + '"]');
    if (!c) { console.log('FAIL 找不到形状卡', sid); done(1); return; }
    await tap(c.x, c.y);
    await sleep(900);
  }
  // 3) 等盒子 + 球，并且进入可拖状态
  if (!(await wait('!!document.querySelector(".pos-ball")', 16000))) { console.log('FAIL 盒子场景没出现'); done(1); return; }
  if (!(await wait('!!document.querySelector(".pos-scene.ready")', 20000))) { console.log('FAIL 球没进入可拖状态'); done(1); return; }

  const ta = await ev('(function(){var n=document.querySelector(".pos-ball");return n?getComputedStyle(n).touchAction:null;})()');
  if (process.env.OLD) await ev('document.querySelector(".pos-ball").style.touchAction="auto"');   // 复现旧状态
  console.log('pos-ball touch-action =', ta);

  const ball = await centerOf('.pos-ball');
  const scene = await centerOf('.pos-scene');
  console.log('ball', JSON.stringify(ball), 'scene', JSON.stringify(scene));
  const to = { x: scene.x, y: scene.y + scene.h * 0.18 };
  await touchDrag(ball, to);
  await sleep(600);

  const res1 = await ev('(function(){var s=document.querySelector(".pos-scene");return {pos:s?s.dataset.pos:null,shake:s?s.className.indexOf("shake")>=0:null,stage:!!document.querySelector(".p3-actor")};})()');
  console.log('after touch drag:', JSON.stringify(res1));

  // 4) 桌子 + 球（under）也测一次
  let res2 = null;
  if (await wait('!!document.querySelector(".p3-actor")', 16000)) {
    await wait('!!document.querySelector(".p3-scene.ready")', 16000);
    const ta2 = await ev('(function(){var n=document.querySelector(".p3-actor");return n?getComputedStyle(n).touchAction:null;})()');
    const b2 = await centerOf('.p3-actor');
    const s2 = await centerOf('.p3-scene');
    await touchDrag(b2, { x: s2.x, y: s2.y + s2.h * 0.3 });
    await sleep(500);
    res2 = { touchAction: ta2, pos: await ev('(document.querySelector(".p3-scene")||{}).dataset ? document.querySelector(".p3-scene").dataset.pos : null') };
    console.log('p3-actor touch-action =', ta2, 'pos after drag =', res2.pos);
  }

  /* 盒子这一步成功后教学会立刻切到桌子场景（.p3-actor 出现），所以「已推进」也算成功 */
  const ok1 = res1.pos === 'in' || res1.stage === true;
  const ok2 = !res2 || res2.pos === 'under';
  console.log((ok1 && ok2) ? 'PASS 球可以用触摸拖动并正确落位' : 'FAIL 触摸拖拽未生效');
  done((ok1 && ok2) ? 0 : 2);
})().catch(e => { console.log('VERIFY_ERR', e && e.message); done(3); });
