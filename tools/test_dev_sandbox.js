// 开发者测试后门（沙盒模式）测试（RULES §五.10）
//
//   U1 连点窗口：4 次不弹框；超过 1.6 秒间隔重新计数（3+2 次也不弹）
//   U2 暗号框：连点 5 次弹出；暗号错误→抖卡片不进入；暗号 123→进入沙盒
//   U3 核心铁律：沙盒内试玩通关(markCleared) + 手动 pull/push/connect
//      → 云端 Gist 内容逐字节不变、localStorage 真实进度不被污染
//   U4 退出：点 🛠️ → 沙盒销毁、真实进度恢复并落盘、重新拉取云端、角标隐藏
//   U5 刷新：沙盒仅存内存 → 重开后自动销毁，恢复真实进度，云端同步恢复正常
//
// 说明：每个场景独立启动一次无头浏览器，设备数据经 addScriptToEvaluateOnNewDocument
// 在游戏脚本之前写入 localStorage（保证时序）；fetch 打桩成内存 Gist。
const { spawn } = require('child_process');
const WebSocket = require('ws');
const os = require('os'), path = require('path');
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const W = 390, H = 844;
const URL_ = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 真实进度（设备与云端一致，避免合并写回干扰断言） */
const REAL = {
  unlockedIsland: 3,
  unlockedLevel: { 1: 5, 2: 5, 3: 3 },
  cleared: { '1-1': true, '1-2': true, '1-3': true, '1-4': true, '1-5': true,
             '2-1': true, '2-2': true, '2-3': true, '2-4': true, '2-5': true, '3-1': true, '3-2': true },
  stars: { '1-1': 3, '1-2': 3, '1-3': 2, '2-1': 3, '2-2': 3, '2-3': 3, '2-4': 3, '2-5': 3, '3-1': 3, '3-2': 2 }
};

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
      window.__BOOT_ID = String(Date.now()) + '-' + Math.random();
`;

/** 启一个全新浏览器场景，返回 { ev, wait, reload, kill } */
async function makeSession(inject) {
  const PORT = 9800 + Math.floor(Math.random() * 150);
  const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'edge-sandbox-' + Date.now() + '-' + Math.floor(Math.random() * 1e6)),
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
  /** 重载并确认跑在「新文档」上（__BOOT_ID 每文档随机） */
  const reload = async () => {
    const prev = await ev('window.__BOOT_ID');
    await send('Page.reload', {}, sessionId);
    const end = Date.now() + 15000;
    while (Date.now() < end) {
      const r = await send('Runtime.evaluate', {
        expression: 'typeof window.Game !== "undefined" && window.__BOOT_ID !== ' + JSON.stringify(prev),
        returnByValue: true
      }, sessionId);
      if (r.result.value) break;
      await sleep(120);
    }
    await sleep(420);
  };
  const kill = () => { try { proc.kill(); } catch (e) {} };
  return { ev, wait, reload, kill };
}

/** 组装注入脚本：设备进度 + 云端种子 + 云令牌（可选） */
function injectFor(device, seed, cloudKey) {
  let s = '(function(){\n';
  if (device) s += '  localStorage.setItem("lilearn.progress.v1", ' + JSON.stringify(JSON.stringify(device)) + ');\n';
  if (seed !== null && seed !== undefined) s += '  localStorage.setItem("__test_cloud_seed", ' + JSON.stringify(seed) + ');\n';
  if (cloudKey) s += '  localStorage.setItem("lilearn.cloud.v1", ' + JSON.stringify(JSON.stringify(cloudKey)) + ');\n';
  s += MOCK_FN + '\n})();';
  return s;
}

/** 页面内小工具：连点触发区 / 输暗号 / 读沙盒快照 */
const HELPERS = `
  window.__t = {
    tap: function (n) { for (var i = 0; i < n; i++) document.getElementById('devTrigger').click(); },
    pass: function (v) { var p = document.getElementById('devPass'); p.value = v; document.getElementById('devOk').click(); },
    badge: function () { document.getElementById('devBadge').click(); },
    sheetHidden: function () { return document.getElementById('devSheet').hidden; },
    badgeHidden: function () { return document.getElementById('devBadge').hidden; },
    ls: function () { try { return JSON.parse(localStorage.getItem('lilearn.progress.v1') || 'null'); } catch (e) { return null; } },
    gist: function () { try { return window.__CLOUD_STORE ? JSON.parse(window.__CLOUD_STORE.content) : null; } catch (e) { return null; } },
    gistRaw: function () { return window.__CLOUD_STORE ? window.__CLOUD_STORE.content : null; },
    devText: function () {
      var s = document.getElementById('devSheet').textContent + '|' + document.getElementById('devBadge').textContent;
      return s;
    }
  };
`;

(async () => {
  const rep = {};
  const fail = (name, ok) => { if (!ok) rep.failed = (rep.failed || []).concat(name); };
  const base = injectFor(REAL, JSON.stringify(REAL), { token: 'test-token', gistId: 'gist-test-1', lastSync: 0 });

  // ---------- U1：连点窗口逻辑（不弹框） ----------
  {
    const s = await makeSession(base + HELPERS);
    try {
      await s.wait('typeof window.Game !== "undefined"');
      await s.wait('Game.cloud.state === "synced"', 12000);
      await s.ev('window.__t.tap(3)');
      await sleep(120);
      const after3 = await s.ev('window.__t.sheetHidden()');
      await sleep(1900);                       // 超过 1.6s 窗口 → 下一次点击计数归 1
      await s.ev('window.__t.tap(2)');
      await sleep(120);
      const after32 = await s.ev('window.__t.sheetHidden()');
      await sleep(1900);                       // 再次超过窗口，彻底归零
      await s.ev('window.__t.tap(5)');
      await sleep(150);
      const after5 = await s.ev('window.__t.sheetHidden()');
      rep.u1 = { after3Hidden: after3, after32Hidden: after32, after5Hidden: after5 };
      fail('u1.threeTapsNoSheet', after3 === true);
      fail('u1.windowResetNoSheet', after32 === true);
      fail('u1.fiveFreshTapsOpenSheet', after5 === false);
    } catch (e) { rep.u1 = { error: String(e) }; fail('u1', false); }
    finally { s.kill(); }
  }

  // ---------- U2：暗号框（错误不进 / 123 进） ----------
  {
    const s = await makeSession(base + HELPERS);
    try {
      await s.wait('typeof window.Game !== "undefined"');
      await s.wait('Game.cloud.state === "synced"', 12000);
      await s.ev('window.__t.tap(5)');
      await sleep(150);
      const opened = await s.ev('window.__t.sheetHidden()') === false;
      await s.ev('window.__t.pass("000")');
      await sleep(150);
      const afterWrong = await s.ev('(function(){ return { hidden: window.__t.sheetHidden(), sandbox: Game.sandbox, status: document.getElementById("devStatus").textContent }; })()');
      await s.ev('window.__t.pass("123")');
      await sleep(250);
      const afterOk = await s.ev(`(function(){
        return {
          hidden: window.__t.sheetHidden(), sandbox: Game.sandbox,
          badgeHidden: window.__t.badgeHidden(),
          island: Game.progress.unlockedIsland,
          lvl9: Game.progress.unlockedLevel['9'] | 0,
          lvl12: Game.progress.unlockedLevel['12'] | 0,
          text: window.__t.devText()
        };
      })()`);
      rep.u2 = { opened: opened, afterWrong: afterWrong, afterOk: afterOk };
      fail('u2.fiveTapsOpenSheet', opened);
      fail('u2.wrongPassStaysOut', afterWrong.hidden === false && afterWrong.sandbox === false && /暗号/.test(afterWrong.status));
      fail('u2.rightPassEnters', afterOk.hidden === true && afterOk.sandbox === true && afterOk.badgeHidden === false);
      fail('u2.allUnlockedInMemory', afterOk.island === 12 && afterOk.lvl9 === 5 && afterOk.lvl12 === 5);
      fail('u2.noEnglishLetters', !/[A-Za-z]/.test(afterOk.text));
    } catch (e) { rep.u2 = { error: String(e) }; fail('u2', false); }
    finally { s.kill(); }
  }

  // ---------- U3：核心铁律——沙盒内绝不写云端、绝不污染本地 ----------
  {
    const s = await makeSession(base + HELPERS);
    try {
      await s.wait('typeof window.Game !== "undefined"');
      await s.wait('Game.cloud.state === "synced"', 12000);
      const before = await s.ev('(function(){ return { gistRaw: window.__t.gistRaw(), lsRaw: localStorage.getItem("lilearn.progress.v1"), log: window.__MOCK_LOG.length }; })()');
      // 进入沙盒
      await s.ev('window.__t.tap(5)');
      await sleep(120);
      await s.ev('window.__t.pass("123")');
      await sleep(250);
      // 沙盒内：模拟试玩未开发关卡并通关 + 手动尝试拉取/推送/连接
      await s.ev('Game.markCleared(12, 5)');
      await s.ev('Game.markCleared(9, 3)');
      await s.ev('Game.cloud.pull()');
      await s.ev('Game.cloud.push()');
      await s.ev('Game.cloud.connect("another-token")');
      await sleep(900);
      const after = await s.ev(`(function(){
        return {
          sandbox: Game.sandbox,
          gistRaw: window.__t.gistRaw(),
          lsRaw: localStorage.getItem("lilearn.progress.v1"),
          ls: window.__t.ls(),
          log: window.__MOCK_LOG.slice(${before.log}),
          memCleared125: !!Game.progress.cleared['12-5'],
          memIsland: Game.progress.unlockedIsland
        };
      })()`);
      rep.u3 = {
        gistUnchanged: before.gistRaw === after.gistRaw,
        lsUnchanged: before.lsRaw === after.lsRaw,
        noCloudCalls: after.log.filter(function (l) { return l.indexOf('PATCH') === 0 || l.indexOf('UNMATCHED') >= 0; }).length === 0,
        sandboxStillOn: after.sandbox === true,
        memHasSandboxWin: after.memCleared125 === true,
        memIsland12: after.memIsland === 12,
        lsIslandReal: after.ls ? after.ls.unlockedIsland === 3 && !after.ls.cleared['12-5'] && !after.ls.cleared['9-3'] : false,
        calls: after.log
      };
      fail('u3.gistUntouched', rep.u3.gistUnchanged);
      fail('u3.localStoreUntouched', rep.u3.lsUnchanged && rep.u3.lsIslandReal);
      fail('u3.noCloudCallsInSandbox', rep.u3.noCloudCalls);
      fail('u3.sandboxStillActive', rep.u3.sandboxStillOn && rep.u3.memHasSandboxWin && rep.u3.memIsland12);
    } catch (e) { rep.u3 = { error: String(e) }; fail('u3', false); }
    finally { s.kill(); }
  }

  // ---------- U4：点 🛠️ 退出 → 恢复真实进度 + 重新拉取云端 ----------
  {
    const s = await makeSession(base + HELPERS);
    try {
      await s.wait('typeof window.Game !== "undefined"');
      await s.wait('Game.cloud.state === "synced"', 12000);
      await s.ev('window.__t.tap(5)');
      await sleep(120);
      await s.ev('window.__t.pass("123")');
      await sleep(200);
      await s.ev('Game.markCleared(12, 5)');
      const gistBefore = await s.ev('window.__t.gistRaw()');
      await s.ev('window.__t.badge()');
      await sleep(1200);
      const r = await s.ev(`(function(){
        return {
          sandbox: Game.sandbox,
          badgeHidden: window.__t.badgeHidden(),
          island: Game.progress.unlockedIsland,
          lvl12: Game.progress.unlockedLevel['12'] | 0,
          cleared125: !!Game.progress.cleared['12-5'],
          cleared32: !!Game.progress.cleared['3-2'],
          stars32: Game.progress.stars['3-2'] | 0,
          ls: window.__t.ls(),
          gistRaw: window.__t.gistRaw(),
          state: Game.cloud.state,
          log: window.__MOCK_LOG.slice(-4)
        };
      })()`);
      rep.u4 = {
        exited: r.sandbox === false && r.badgeHidden === true,
        restored: r.island === 3 && r.lvl12 === 0 && r.cleared125 === false && r.cleared32 === true && r.stars32 === 2,
        persistedReal: !!r.ls && r.ls.unlockedIsland === 3 && !r.ls.cleared['12-5'],
        gistStillClean: gistBefore === r.gistRaw,
        repulled: r.log.some(function (l) { return l.indexOf('GET') === 0; }),
        state: r.state
      };
      fail('u4.exitedSandbox', rep.u4.exited);
      fail('u4.realProgressRestored', rep.u4.restored && rep.u4.persistedReal);
      fail('u4.cloudRepulledAndClean', rep.u4.repulled && rep.u4.gistStillClean);
    } catch (e) { rep.u4 = { error: String(e) }; fail('u4', false); }
    finally { s.kill(); }
  }

  // ---------- U5：刷新页面 → 沙盒销毁，恢复正常 ----------
  {
    const s = await makeSession(base + HELPERS);
    try {
      await s.wait('typeof window.Game !== "undefined"');
      await s.wait('Game.cloud.state === "synced"', 12000);
      await s.ev('window.__t.tap(5)');
      await sleep(120);
      await s.ev('window.__t.pass("123")');
      await sleep(200);
      const inSandbox = await s.ev('Game.sandbox');
      await s.reload();
      await s.wait('typeof window.Game !== "undefined"');
      await s.wait('Game.cloud.state === "synced"', 12000);
      const r = await s.ev(`(function(){
        return {
          sandbox: Game.sandbox,
          badgeHidden: window.__t.badgeHidden(),
          island: Game.progress.unlockedIsland,
          lvl12: Game.progress.unlockedLevel['12'] | 0,
          cleared32: !!Game.progress.cleared['3-2'],
          ls: window.__t.ls()
        };
      })()`);
      rep.u5 = {
        enteredBefore: inSandbox === true,
        sandboxGone: r.sandbox === false && r.badgeHidden === true,
        realProgress: r.island === 3 && r.lvl12 === 0 && r.cleared32 === true,
        lsReal: !!r.ls && r.ls.unlockedIsland === 3
      };
      fail('u5.refreshDestroysSandbox', rep.u5.enteredBefore && rep.u5.sandboxGone && rep.u5.realProgress && rep.u5.lsReal);
    } catch (e) { rep.u5 = { error: String(e) }; fail('u5', false); }
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
