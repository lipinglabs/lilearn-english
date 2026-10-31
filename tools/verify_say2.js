// 验证 BUG5/6 的共用音频层：多句题面必须都播到；单句卡顿必须「续播一次」而不是半句收场
const { spawn } = require('child_process');
const WebSocket = require('ws');
const os = require('os'), path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = 390, H = 844, PORT = 9981;
const URL_ = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');
const MODE = process.env.MODE || 'inject';   // inject | stall
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edge-say2-' + Date.now()),
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

  const behavior = MODE === 'stall'
    ? `
        a.play = function(){
          window.__try = window.__try || [];
          window.__try.push(String(src).slice(-24));
          if (!window.__stallOnce) {
            window.__stallOnce = 1;
            /* 第一句：永远不 ended，进度卡在 30%，用来模拟手机端解码/缓冲卡死 */
            a.__stalled = 1;
            try { Object.defineProperty(a, 'currentTime', { get: function () { return 0.3; }, set: function () {}, configurable: true }); } catch (e) {}
            window.__played.push({ t: Date.now(), src: src });
            return Promise.resolve();
          }
          window.__played.push({ t: Date.now(), src: src });
          setTimeout(function(){ try{ a.dispatchEvent(new Event('ended')); }catch(e){} }, 60);
          return Promise.resolve();
        };`
    : `
        a.play = function(){
          var s = String(src);
          if (!a.__failed) { a.__failed = 1; return Promise.reject(new DOMException('blocked', 'NotAllowedError')); }
          window.__played.push({ t: Date.now(), src: src });
          setTimeout(function(){ try{ a.dispatchEvent(new Event('ended')); }catch(e){} }, 70);
          return Promise.resolve();
        };`;

  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    (function(){
      window.__played = []; window.__try = [];
      var OA = window.Audio;
      window.Audio = function(src){
        var a = new OA(src);
        ${behavior}
        a.pause = function(){};
        return a;
      };
      window.__errs = [];
      window.addEventListener('error', function(ev){ window.__errs.push(String((ev.error && ev.error.stack) || ev.message || '').slice(0,300)); });
    })();
  ` }, sessionId);
  await send('Page.navigate', { url: URL_ }, sessionId);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception)); return r.result.value; };
  const wait = async (e, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await ev(e)) return true; await sleep(90); } return false; };
  for (let i = 0; i < 1400; i++) { if (await ev('typeof window.Game !== "undefined"')) break; await sleep(120); }
  await sleep(300);
  const keysPlayed = () => ev(`window.__played.map(function(p){
    for (var k in window.VOICE_BANK) if (window.VOICE_BANK[k] === p.src) return k;
    return 'unknown';
  })`);

  const cases = [
    { island: 3, level: 1, keys: ['b4_a_heavy', 'b4_a_light', 'b4_b_rock_apple_light'], tag: '3-5 用到的分块(island_3_1)' },
    { island: 5, level: 1, keys: ['l5w1_a_bread', 'l5w1_a_egg', 'l5w1_a_milk'], tag: '5-1 分块(island_5_1)' }
  ];
  let bad = 0;
  for (const c of cases) {
    await ev('Game.resetProgress()');
    for (let i = 1; i <= 11; i++) for (let l = 1; l <= 5; l++) await ev('Game.markCleared(' + i + ',' + l + ')');
    await ev('Game.openIsland(' + c.island + ')'); await sleep(150);
    await ev('Game.enterLevel(' + c.level + ')');
    const okKeys = await wait(`(function(){var b=window.VOICE_BANK||{};return ${JSON.stringify(c.keys)}.every(function(k){return Object.prototype.hasOwnProperty.call(b,k);});})()`, 20000);
    if (!okKeys) { console.log('SKIP', c.tag, '分块未就绪'); continue; }
    await ev('window.__played = []; window.__try = []; window.__cb = 0');
    await ev(`Game.say(${JSON.stringify(c.keys)}, function(){ window.__cb = 1; })`);
    const cbAt = await wait('window.__cb === 1', MODE === 'stall' ? 12000 : 6000);
    await sleep(600);
    const played = await keysPlayed();
    const miss = c.keys.filter(k => played.indexOf(k) < 0);
    console.log(c.tag, 'mode =', MODE, 'played =', JSON.stringify(played), 'callback =', cbAt);
    if (miss.length) { console.log('  FAIL 缺', JSON.stringify(miss)); bad += 1; }
    else if (!cbAt) { console.log('  FAIL 串行链没有交付回调（会卡住流程）'); bad += 1; }
    else console.log('  PASS');
    if (MODE === 'stall') {
      const tries = await ev('JSON.stringify(window.__try)');
      console.log('  attempts =', tries.slice(0, 120));
    }
  }
  console.log(bad ? ('FAIL ' + bad + ' 项') : 'PASS 全部通过');
  done(bad ? 2 : 0);
})().catch(e => { console.log('VERIFY_ERR', e && e.message); done(3); });
