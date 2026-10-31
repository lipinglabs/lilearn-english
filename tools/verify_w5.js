// 验证 BUG1：第 1 岛第 5 关 C 型组合卡里的水果必须全部落在卡片内（手机端不能少看见 1 个）
const { spawn } = require('child_process');
const WebSocket = require('ws');
const os = require('os'), path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = parseInt(process.argv[2] || '390', 10), H = parseInt(process.argv[3] || '844', 10);
const PORT = 9987;
const URL_ = process.env.LILEARN_URL || ('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edge-vw5-' + Date.now()),
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
  await send('Page.navigate', { url: URL_ }, sessionId);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception)); return r.result.value; };
  const wait = async (e, ms = 12000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await ev(e)) return true; await sleep(70); } return false; };
  for (let i = 0; i < 1400; i++) { if (await ev('typeof window.Game !== "undefined"')) break; await sleep(120); }
  await sleep(300);

  await ev('Game.resetProgress()');
  for (let i = 1; i <= 11; i++) for (let l = 1; l <= 5; l++) await ev('Game.markCleared(' + i + ',' + l + ')');
  await ev('Game.openIsland(1)'); await sleep(150);

  const measure = () => ev(`(function(){
    var out = [];
    Array.prototype.forEach.call(document.querySelectorAll('#options .option'), function(op){
      var r = op.getBoundingClientRect();
      var card = op.querySelector('.combo-card');
      var fruits = card ? card.querySelectorAll('.card-fruit') : [];
      var inside = 0, out1 = [];
      Array.prototype.forEach.call(fruits, function(f){
        var b = f.getBoundingClientRect();
        var ok = b.left >= r.left - 1 && b.right <= r.right + 1 && b.top >= r.top - 1 && b.bottom <= r.bottom + 1;
        if (ok) inside++; else out1.push(Math.round(b.top) + '/' + Math.round(b.bottom) + ' vs ' + Math.round(r.top) + '/' + Math.round(r.bottom));
      });
      out.push({ idx: op.dataset.idx, count: card ? card.dataset.count : null,
        total: fruits.length, inside: inside, clipped: out1,
        optH: Math.round(r.height), cardH: card ? Math.round(card.getBoundingClientRect().height) : 0 });
    });
    return out;
  })()`);

  let hit = null;
  for (let attempt = 0; attempt < 30 && !hit; attempt++) {
    await ev('Game.enterLevel(5)'); await sleep(200);
    await ev('document.getElementById("btnStart").click()');
    if (!(await wait('Game.phase === "asking"', 9000))) continue;
    const q = await ev('(function(){var s=Game.snapshot().question;return {t:s.type};})()');
    if (q.t !== 'W5C') continue;
    /* snapshot 的 options 对 comboCard 只回 "count:color" 字符串，这里直接读 DOM 的 data-count */
    const counts = await ev("Array.prototype.map.call(document.querySelectorAll('#options .combo-card'),function(n){return +n.dataset.count;})");
    console.log('attempt', attempt, 'W5C counts', JSON.stringify(counts));
    if (counts.indexOf(5) < 0) continue;
    hit = { counts: counts, m: await measure() };
  }
  if (!hit) { console.log('NOT_FOUND_W5C_5'); done(1); return; }
  console.log('counts', JSON.stringify(hit.counts), 'view', W + 'x' + H);
  console.log(JSON.stringify(hit.m, null, 1));
  const bad = hit.m.filter(o => o.total !== o.inside);
  console.log(bad.length ? ('FAIL 有 ' + bad.length + ' 张卡片的水果被裁掉') : 'PASS 5 个水果全部在卡片内');
  done(bad.length ? 2 : 0);
})().catch(e => { console.log('VERIFY_ERR', e && e.message); done(3); });
