// 云存档「最高进度优先（Max-Progress Wins）」合并测试（RULES §五.9）
//
//   U  单元：Game.cloud.merge 通关并集 / 解锁取最远 / 星星取最高 / 交换律 / 绝不倒退 / 损坏数据钳制
//   S1 双设备：云端高进度 + 低进度设备上线 → 合并后两端都是高进度（核心恐惧场景：绝不被覆盖掉）
//   S2 双设备：云端落后 + 本地领先（离线玩过）→ 连接后合并写回，云端追上
//   S3 拉取写回：令牌已连 + 本地领先 → 启动自动 cloudPull → 合并结果写回云端
//   S4 旧云端不回退：本地高进度 + 过期低进度云端 → 启动自动拉取合并后，本地进度绝不倒退
//
// 说明：每个场景独立启动一次无头浏览器，设备数据经 addScriptToEvaluateOnNewDocument
// 在游戏脚本之前写入 localStorage（保证时序）。不依赖跨重载的存储持久化——
// 无头 Edge 下「改 localStorage 后 reload」存在写入不落盘的怪癖，不可靠（实测踩坑）。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const os = require('os'), path = require('path');
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = 390, H = 844;
const URL_ = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 测试数据 */
const HIGH = { unlockedIsland: 3, unlockedLevel: { 1: 5, 2: 5, 3: 3 },
  cleared: { '1-1': true, '1-2': true, '1-3': true, '1-4': true, '1-5': true,
             '2-1': true, '2-2': true, '2-3': true, '2-4': true, '2-5': true, '3-1': true, '3-2': true },
  stars: { '1-1': 3, '1-2': 3, '1-3': 2, '2-1': 3, '2-2': 3, '2-3': 3, '2-4': 3, '2-5': 3, '3-1': 3, '3-2': 2 } };
const LOW = { unlockedIsland: 1, unlockedLevel: { 1: 2 }, cleared: { '1-1': true }, stars: { '1-1': 3 } };
const OLD_CLOUD = { unlockedIsland: 1, unlockedLevel: { 1: 2 }, cleared: { '1-1': true }, stars: { '1-1': 3 } };

const MOCK_FN = `
      window.__CLOUD_STORE = null;
      try {
        var seed = localStorage.getItem('__test_cloud_seed');
        if (seed) window.__CLOUD_STORE = { content: seed };
      } catch (e) {}
      var mk = function (body) { return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }); };
      window.__MOCK_LOG = [];
      window.fetch = function (url, opts) {
        url = String(url || '');
        var method = (opts && opts.method) || 'GET';
        window.__MOCK_LOG.push(method + ' ' + url.slice(0, 50));
        if (url.indexOf('https://api.github.com/user') === 0) return Promise.resolve(mk({ login: 'tester' }));
        if (url.indexOf('https://api.github.com/gists?per_page=100') === 0) {
          return Promise.resolve(mk([{ id: 'gist-test-1', description: 'lilearn-english-save' }]));
        }
        if (url === 'https://api.github.com/gists/gist-test-1') {
          if (method === 'PATCH') {
            try {
              var body = JSON.parse(opts.body);
              window.__CLOUD_STORE = { content: body.files['lilearn-progress.json'].content };
            } catch (e) {}
            return Promise.resolve(mk({ id: 'gist-test-1' }));
          }
          var content = window.__CLOUD_STORE ? window.__CLOUD_STORE.content : null;
          return Promise.resolve(mk({ files: { 'lilearn-progress.json': { content: content } } }));
        }
        window.__MOCK_LOG.push('UNMATCHED! ' + url.slice(0, 50));
        return Promise.reject(new Error('mock: unmatched ' + url));
      };
`;

/** 启一个全新浏览器场景，返回 { ev, wait, kill } */
async function makeSession(inject) {
  const PORT = 9700 + Math.floor(Math.random() * 200);
  const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'edge-merge-' + Date.now() + '-' + Math.floor(Math.random() * 1e6)),
    '--window-size=' + W + ',' + H, 'about:blank'], { stdio: 'ignore' });

  let v;
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) { v = await r.json(); break; } } catch (e) {}
    await sleep(250);
  }
  const ws = await new Promise((res, rej) => {
    const w = new WebSocket(v.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 1 << 28 });
    w.on('open', () => res(w)); w.on('error', rej);
  });
  let id = 0; const pend = new Map();
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
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true }, sessionId);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: inject }, sessionId);
  await send('Page.navigate', { url: URL_ }, sessionId);

  for (let i = 0; i < 200; i++) {
    const r = await send('Runtime.evaluate', { expression: 'typeof window.Game !== "undefined"', returnByValue: true }, sessionId);
    if (r.result.value) break;
    await sleep(120);
  }
  await sleep(360);

  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
    if (r.exceptionDetails) throw new Error('EVAL: ' + expr.slice(0, 120) + ' => ' + JSON.stringify(r.exceptionDetails.exception));
    return r.result.value;
  };
  const wait = async (expr, ms = 12000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await ev(expr)) return true; await sleep(80); }
    return false;
  };
  const kill = () => { try { proc.kill(); } catch (e) {} };
  return { ev, wait, kill };
}

/** 组装注入脚本：设备进度 + 云端种子（可选）+ 云令牌（可选）+ fetch 打桩 */
function injectFor(device, seed, cloudKey) {
  let s = '(function(){\n';
  if (device) s += '  localStorage.setItem("lilearn.progress.v1", ' + JSON.stringify(JSON.stringify(device)) + ');\n';
  if (seed !== null && seed !== undefined) s += '  localStorage.setItem("__test_cloud_seed", ' + JSON.stringify(seed) + ');\n';
  if (cloudKey) s += '  localStorage.setItem("lilearn.cloud.v1", ' + JSON.stringify(JSON.stringify(cloudKey)) + ');\n';
  s += MOCK_FN + '\n})();';
  return s;
}

(async () => {
  const rep = { unit: {}, sim: {} };
  const fail = (name, ok) => { if (!ok) rep.failed = (rep.failed || []).concat(name); };

  // ---------- U：mergeProgress 单元测试（无需网络） ----------
  {
    const s = await makeSession(injectFor(null, null, null));
    try {
      rep.unit.u1 = await s.ev(`(function(){
        var A = ${JSON.stringify(HIGH)}, B = ${JSON.stringify(LOW)};
        var m1 = Game.cloud.merge(A, B), m2 = Game.cloud.merge(B, A);
        var commutative = JSON.stringify(m1) === JSON.stringify(m2);
        var maxWins = m1.unlockedIsland === 3
          && m1.unlockedLevel['1'] === 5 && m1.unlockedLevel['2'] === 5 && m1.unlockedLevel['3'] === 3
          && !!m1.cleared['3-2'] && !!m1.cleared['1-1']
          && m1.stars['1-1'] === 3 && m1.stars['3-2'] === 2 && m1.stars['1-3'] === 2;
        function worse(m, src) {
          if (m.unlockedIsland < src.unlockedIsland) return true;
          for (var k in src.unlockedLevel) if ((m.unlockedLevel[k] || 0) < src.unlockedLevel[k]) return true;
          for (var k2 in src.cleared) if (!m.cleared[k2]) return true;
          for (var k3 in src.stars) if ((m.stars[k3] || 0) < src.stars[k3]) return true;
          return false;
        }
        var clamp = Game.cloud.merge({ unlockedIsland: 9, unlockedLevel: { 1: 99, 2: 4 }, cleared: {}, stars: {} }, {});
        var stars = Game.cloud.merge(
          { unlockedIsland: 1, unlockedLevel: { 1: 1 }, cleared: {}, stars: { '2-1': 2, '3-1': 5 } },
          { unlockedIsland: 1, unlockedLevel: { 1: 1 }, cleared: {}, stars: { '2-1': 3 } });
        return {
          commutative: commutative, maxWins: maxWins,
          noRegressVsHigh: !worse(m1, A), noRegressVsLow: !worse(m1, B),
          clampLvl1: clamp.unlockedLevel['1'], clampLvl2: clamp.unlockedLevel['2'],
          starsMax: stars.stars['2-1'], starsCarried: stars.stars['3-1'], starsNoPhantom: !stars.stars['9-9']
        };
      })()`);
      fail('u1.commutative', rep.unit.u1.commutative);
      fail('u1.maxWins', rep.unit.u1.maxWins);
      fail('u1.noRegressVsHigh', rep.unit.u1.noRegressVsHigh);
      fail('u1.noRegressVsLow', rep.unit.u1.noRegressVsLow);
      fail('u1.clampLvl1===5', rep.unit.u1.clampLvl1 === 5);
      fail('u1.clampLvl2===4', rep.unit.u1.clampLvl2 === 4);
      fail('u1.starsMax===3', rep.unit.u1.starsMax === 3);
      fail('u1.starsCarried===5', rep.unit.u1.starsCarried === 5);
      fail('u1.starsNoPhantom', rep.unit.u1.starsNoPhantom);
    } finally { s.kill(); }
  }

  // ---------- S1：云端高进度 + 低进度设备上线（核心场景：绝不允许覆盖掉） ----------
  {
    const s = await makeSession(injectFor(LOW, JSON.stringify(HIGH), null));
    try {
      await s.ev(`Game.cloud.connect('test-token')`);
      await s.wait('Game.cloud.state === "synced"', 10000);
      rep.sim.s1 = await s.ev(`(function(){
        var g = window.__CLOUD_STORE ? JSON.parse(window.__CLOUD_STORE.content) : null;
        return {
          deviceIsland: Game.progress.unlockedIsland,
          deviceCleared32: !!Game.progress.cleared['3-2'],
          deviceStars32: Game.progress.stars['3-2'] | 0,
          gistIsland: g ? g.unlockedIsland : null,
          gistCleared32: g ? !!g.cleared['3-2'] : null,
          gistStars12: g ? (g.stars['1-2'] | 0) : null
        };
      })()`);
      rep.sim.s1.pass = rep.sim.s1.deviceIsland === 3 && rep.sim.s1.deviceCleared32 && rep.sim.s1.deviceStars32 === 2 &&
        rep.sim.s1.gistIsland === 3 && rep.sim.s1.gistCleared32 && rep.sim.s1.gistStars12 === 3;
      fail('s1', rep.sim.s1.pass);
    } catch (e) { rep.sim.s1 = { error: String(e) }; fail('s1', false); }
    finally { s.kill(); }
  }

  // ---------- S2：云端落后 + 本地领先（离线玩过）→ 连接后云端追上 ----------
  {
    const s = await makeSession(injectFor(HIGH, JSON.stringify(OLD_CLOUD), null));
    try {
      await s.ev(`Game.cloud.connect('test-token')`);
      await s.wait('Game.cloud.state === "synced"', 10000);
      rep.sim.s2 = await s.ev(`(function(){
        var g = window.__CLOUD_STORE ? JSON.parse(window.__CLOUD_STORE.content) : null;
        return {
          deviceIsland: Game.progress.unlockedIsland,
          gistIsland: g ? g.unlockedIsland : null,
          gistCleared32: g ? !!g.cleared['3-2'] : null
        };
      })()`);
      rep.sim.s2.pass = rep.sim.s2.deviceIsland === 3 && rep.sim.s2.gistIsland === 3 && rep.sim.s2.gistCleared32;
      fail('s2', rep.sim.s2.pass);
    } catch (e) { rep.sim.s2 = { error: String(e) }; fail('s2', false); }
    finally { s.kill(); }
  }

  // ---------- S3：令牌已连 + 本地领先 → 启动自动 cloudPull → 合并结果写回云端 ----------
  {
    const s = await makeSession(injectFor(HIGH, JSON.stringify(OLD_CLOUD),
      { token: 'test-token', gistId: 'gist-test-1', lastSync: 0 }));
    try {
      const pulled = await s.wait('Game.cloud.state === "synced"', 12000);
      rep.sim.s3 = await s.ev(`(function(){
        var g = window.__CLOUD_STORE ? JSON.parse(window.__CLOUD_STORE.content) : null;
        return {
          deviceIsland: Game.progress.unlockedIsland,
          deviceStars12: Game.progress.stars['1-2'] | 0,
          gistIsland: g ? g.unlockedIsland : null,
          gistCleared32: g ? !!g.cleared['3-2'] : null,
          log: window.__MOCK_LOG.length
        };
      })()`);
      rep.sim.s3.pulled = pulled;
      rep.sim.s3.pass = pulled && rep.sim.s3.deviceIsland === 3 && rep.sim.s3.deviceStars12 === 3 &&
        rep.sim.s3.gistIsland === 3 && rep.sim.s3.gistCleared32;
      fail('s3', rep.sim.s3.pass);
    } catch (e) { rep.sim.s3 = { error: String(e) }; fail('s3', false); }
    finally { s.kill(); }
  }

  // ---------- S4：过期低进度云端 + 本地高进度 → 启动拉取合并后，本地绝不倒退 ----------
  {
    const s = await makeSession(injectFor(HIGH, JSON.stringify(LOW),
      { token: 'test-token', gistId: 'gist-test-1', lastSync: 0 }));
    try {
      const pulled = await s.wait('Game.cloud.state === "synced"', 12000);
      rep.sim.s4 = await s.ev(`(function(){
        var g = window.__CLOUD_STORE ? JSON.parse(window.__CLOUD_STORE.content) : null;
        return {
          island: Game.progress.unlockedIsland,
          cleared32: !!Game.progress.cleared['3-2'],
          gistIsland: g ? g.unlockedIsland : null
        };
      })()`);
      rep.sim.s4.pass = pulled && rep.sim.s4.island === 3 && rep.sim.s4.cleared32 && rep.sim.s4.gistIsland === 3;
      fail('s4', rep.sim.s4.pass);
    } catch (e) { rep.sim.s4 = { error: String(e) }; fail('s4', false); }
    finally { s.kill(); }
  }

  console.log(JSON.stringify(rep, null, 1));
  const ok = !rep.failed;
  console.log(ok ? 'ALL_PASS' : 'HAS_FAILURE: ' + rep.failed.join(', '));
  process.exit(ok ? 0 : 1);
})().catch(e => {
  console.error('FATAL', e && e.stack || e);
  process.exit(1);
});
