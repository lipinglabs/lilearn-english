// 验证 BUG3/5/6 的修复：注入「每句首次 play() 被系统拒绝」的故障，题面仍必须完整播完
const { spawn } = require('child_process');
const WebSocket = require('ws');
const os = require('os'), path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const ISL = parseInt(process.argv[4] || '3', 10), LVL = parseInt(process.argv[5] || '1', 10);
const INJECT = !!process.env.INJECT;
const PORT = 9983;
const URL_ = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edge-say-' + Date.now()),
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

  const inject = INJECT ? `
        var failed = {};
        a.play = function(){
          var s = String(src);
          window.__try = window.__try || [];
          window.__try.push({ t: Date.now(), s: s.slice(-40), ok: !!failed[s] });
          if (!failed[s]) {
            failed[s] = 1;
            return Promise.reject(new DOMException('blocked', 'NotAllowedError'));
          }
          window.__played.push({ t: Date.now(), src: src });
          setTimeout(function(){ try{ a.dispatchEvent(new Event('ended')); }catch(e){} }, 70);
          return Promise.resolve();
        };` : `
        a.play = function(){ window.__played.push({ t: Date.now(), src: src });
          setTimeout(function(){ try{ a.dispatchEvent(new Event('ended')); }catch(e){} }, 70); return Promise.resolve(); };`;

  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    (function(){
      window.__played = [];
      var OA = window.Audio;
      window.Audio = function(src){
        var a = new OA(src);
        ${inject}
        a.pause = function(){};
        return a;
      };
      window.__errs = [];
      window.addEventListener('error', function(ev){ window.__errs.push(String((ev.error && ev.error.stack) || ev.message || '').slice(0,300)); });
    })();
  ` }, sessionId);
  await send('Page.navigate', { url: URL_ }, sessionId);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception)); return r.result.value; };
  const wait = async (e, ms = 14000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await ev(e)) return true; await sleep(70); } return false; };
  for (let i = 0; i < 1400; i++) { if (await ev('typeof window.Game !== "undefined"')) break; await sleep(120); }
  await sleep(300);
  const centerOf = s => ev(`(function(){var e=document.querySelector(${JSON.stringify(s)});if(!e)return null;var r=e.getBoundingClientRect();return r.width&&r.height?{x:r.left+r.width/2,y:r.top+r.height/2}:null;})()`);
  const clickXY = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 }, sessionId); await sleep(40); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 }, sessionId); await sleep(120); };
  const click = async s => { const c = await centerOf(s); if (!c) return false; await clickXY(c.x, c.y); return true; };
  const keysBetween = (a, b) => ev(`window.__played.filter(function(p){return p.t>=${a}&&p.t<=${b};}).map(function(p){
    for (var k in window.VOICE_BANK) if (window.VOICE_BANK[k] === p.src) return k;
    return 'unknown';
  })`);

  await ev('Game.resetProgress()');
  for (let i = 1; i <= 11; i++) for (let l = 1; l <= 5; l++) await ev('Game.markCleared(' + i + ',' + l + ')');
  await ev('Game.openIsland(' + ISL + ')'); await sleep(150);

  let q = null, played = [], t0q = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    await ev('Game.enterLevel(' + LVL + ')'); await sleep(250);
    await ev('document.getElementById("btnStart").click()');
    await wait('Game.phase === "tutorial"', 9000);
    for (let k = 0; k < 220; k++) {
      if (await ev('Game.phase === "asking"')) break;
      if (await ev('!!document.querySelector(".f11-tap")')) { await click('.f11-tap'); await sleep(320); continue; }
      const cand = await ev(`(function(){
        var sels = ['.b1-node','[data-animal]','[data-size]'];
        for (var i=0;i<sels.length;i++){ var n=document.querySelectorAll(sels[i]); if(n.length){ var r=n[0].getBoundingClientRect(); if(r.width&&r.height) return {sel:sels[i],count:n.length}; } }
        return null;
      })()`);
      if (cand) {
        for (let j = 0; j < cand.count; j++) { if (await ev('Game.phase === "asking"')) break; await click(cand.sel + ':nth-of-type(' + (j + 1) + ')'); await sleep(420); }
        continue;
      }
      await sleep(250);
    }
    if (!(await wait('Game.phase === "asking"', 12000))) { console.log('NO_ASKING'); done(1); return; }
    q = await ev('(function(){var s=Game.snapshot().question;return {type:s.type,audios:s.audios};})()');
    t0q = Date.now();
    await sleep(3000);
    played = (await keysBetween(t0q - 800, Date.now() + 200)).filter(k => k !== 'unknown');
    if ((q.audios || []).length >= 2) break;
    console.log('attempt', attempt, 'type', q.type, 'clips', (q.audios || []).length, '-> 换一局');
  }

  const want = q.audios || [];
  const miss = want.filter(k => played.indexOf(k) < 0);
  console.log('inject =', INJECT, 'question', JSON.stringify(q));
  console.log('played =', JSON.stringify(played));
  if (INJECT) { const tr = await ev('JSON.stringify((window.__try||[]).map(function(x){return x.ok?"OK":"REJ";}))'); console.log('attempts =', tr); }
  console.log(miss.length ? ('FAIL 仍缺 ' + JSON.stringify(miss)) : 'PASS 题面多句都播到了');
  done(miss.length ? 2 : 0);
})().catch(e => { console.log('VERIFY_ERR', e && e.message); done(3); });
