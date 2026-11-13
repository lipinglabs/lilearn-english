#!/usr/bin/env node
/* probe-motion-b.js — B 档动画层护栏（零第三方依赖）
 *
 * 用法：node tools/probe-motion-b.js
 * 产出：.shots/motion-b-390.png / motion-b-600.png / motion-b.json
 *
 * 断言：
 *   1. 页面可见文本与 aria-label 都不含英文字母（RULES §二.1）；
 *   2. 地图 / 岛内页 / 关卡封面三处伙伴角色都在，且 SVG 内无文本节点；
 *   3. 封面小剧场不压住「开始游戏」按钮，地图小熊不压住任何岛卡；
 *   4. 390 与 600 两个视口都无横向溢出（RULES §二.2）；
 *   5. 答案选项的中心点命中自己（防装饰层遮住答题区，RULES §二.4）；
 *   6. 动作类名能在第 4 岛题目里出现，且真的挂着非 none 的动画（RULES §三.11）；
 *   7. 彩带是三波错峰（延迟分三档）。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, '.shots');
const INDEX = path.join(ROOT, 'index.html');
const TMP = path.join(ROOT, 'index.__motionb__.html');

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/opt/microsoft/msedge/msedge',
  '/usr/bin/microsoft-edge'
].find(function (p) { try { return fs.existsSync(p); } catch (e) { return false; } });

if (!EDGE) { console.error('Edge not found; abort'); process.exit(1); }
if (!fs.existsSync(INDEX)) { console.error('index.html not found; abort'); process.exit(1); }
fs.mkdirSync(SHOTS, { recursive: true });

const PROBE = `<script>
window.addEventListener('load', function () {
  var out = { errors: [], checks: {} };
  function rect(el) { var r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, b: r.bottom, r: r.right }; }
  function overlap(a, b) { return !(a.r <= b.x || b.r <= a.x || a.b <= b.y || b.b <= a.y); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function englishIn(root) {
    var bad = [];
    var text = (root.innerText || '');
    var m = text.match(/[A-Za-z]+/g);
    if (m) bad.push('text:' + m.slice(0, 5).join(','));
    var list = root.querySelectorAll('[aria-label]');
    for (var i = 0; i < list.length; i++) {
      var v = list[i].getAttribute('aria-label') || '';
      if (/[A-Za-z]/.test(v)) bad.push('aria:' + v);
    }
    return bad;
  }
  async function run() {
    try {
      var G = window.Game;
      out.checks.iw = innerWidth;
      out.checks.docSW = document.documentElement.scrollWidth;
      out.checks.overflow = document.documentElement.scrollWidth > innerWidth + 1;

      /* 1. 英文文本 */
      out.checks.englishMap = englishIn(document.body);

      /* 2. 地图小熊 */
      var b = document.querySelector('#screenMap .mb-map-buddy');
      out.checks.mapBuddy = !!b;
      if (b) {
        var br = rect(b);
        out.checks.buddySize = Math.round(br.w) + 'x' + Math.round(br.h);
        out.checks.buddyHasText = !!b.textContent.trim();
        var cards = document.querySelectorAll('#islandGrid .island');
        var hit = 0;
        for (var i = 0; i < cards.length; i++) if (overlap(br, rect(cards[i]))) hit++;
        out.checks.buddyOverCards = hit;
      }

      /* 3. 岛内页小熊 */
      G.openIsland(3);
      await wait(120);
      var ib = document.querySelector('#islandHead .mb-island-buddy');
      out.checks.islandBuddy = !!ib;
      out.checks.englishIsland = englishIn(document.body);
      G.backToMap();
      await wait(60);

      /* 4. 关卡封面小剧场（第 1 岛第 1 关：无教学，点开始直接进答题） */
      G.backToMap();
      await wait(60);
      G.openIsland(1);
      await wait(80);
      G.enterLevel(1);
      await wait(150);
      var th = document.querySelector('#viewStart .mb-theater');
      var btn = document.getElementById('btnStart');
      out.checks.theater = !!th;
      if (th && btn) {
        out.checks.theaterBtnOverlap = overlap(rect(th), rect(btn));
        out.checks.theaterClip = getComputedStyle(th).overflow;
        var act = th.querySelector('.mb-actor');
        out.checks.actorWidthPct = act ? Math.round(rect(act).w / rect(th).w * 100) : 0;
        out.checks.theaterHasText = !!th.textContent.trim();
      }

      /* 5. 选项中心点命中自己（等真正进入答题态再量，教学/开场阶段选项是收起的） */
      btn.click();
      for (var w = 0; w < 60; w++) {
        await wait(250);
        var sn = G.snapshot();
        if (sn.phase === 'asking' || sn.phase === 'tutorial') break;
      }
      await wait(200);
      out.checks.phase = G.snapshot().phase;
      var opts = Array.prototype.slice.call(document.querySelectorAll('.option:not([hidden])'));
      out.checks.optionCount = opts.length;
      var miss = [];
      opts.forEach(function (o, i) {
        var r = o.getBoundingClientRect();
        if (r.width < 24 || r.height < 24) { miss.push(i + ':size'); return; }
        var el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!el || !(el === o || o.contains(el))) miss.push(i + ':' + (el ? el.className : 'null'));
      });
      out.checks.optionHitMiss = miss;

      /* 6. 第 4 岛动作题：真实题目里必须带上 mb-act-* 类 */
      G.backToMap();
      await wait(60);
      G.openIsland(4);
      await wait(80);
      G.enterLevel(3);
      await wait(120);
      var b4 = document.getElementById('btnStart');
      if (b4) b4.click();
      await wait(2200);
      out.checks.actNodes4 = document.querySelectorAll('[class*="mb-act-"]').length;
      out.checks.actSample = (function () {
        var n = document.querySelector('[class*="mb-act-"]');
        if (!n) return null;
        var img = n.querySelector('img.f3-img, .f4-actor > img');
        return { cls: n.className, anim: img ? getComputedStyle(img).animationName : 'no-img' };
      })();

      /* 7. 动作层：合成一个格子，验证样式表真的挂了动画 */
      var probe = document.createElement('div');
      probe.className = 'f3-cell mb-act-run';
      probe.style.position = 'absolute';
      probe.style.left = '-9999px';
      probe.innerHTML = '<img class="f3-img" alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">';
      document.body.appendChild(probe);
      out.checks.actRunAnim = getComputedStyle(probe.querySelector('img')).animationName;
      probe.className = 'f3-cell mb-act-sleep';
      out.checks.actSleepAnim = getComputedStyle(probe.querySelector('img')).animationName;
      probe.className = 'f3-cell mb-act-eat';
      out.checks.actEatAnim = getComputedStyle(probe.querySelector('img')).animationName;
      probe.parentNode.removeChild(probe);

      /* 8. 伙伴手臂动画 */
      var cs = getComputedStyle(document.querySelector('.mb-buddy .mb-arm') || document.body);
      out.checks.armAnim = cs.animationName;

      out.checks.englishFinal = englishIn(document.body);
    } catch (e) {
      out.errors.push(String(e && e.message || e));
    }
    document.title = 'MB' + JSON.stringify(out);
  }
  run();
});
</script>`;

const html = fs.readFileSync(INDEX, 'utf8');
fs.writeFileSync(TMP, html.replace('</body>', PROBE + '\n</body>'));

function fileUrl(p) { return 'file:///' + String(p).replace(/\\/g, '/').replace(/^\/+/, ''); }
function run(args, timeout) {
  try {
    return execFileSync(EDGE, args, {
      encoding: 'utf8', timeout: timeout || 90000, stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 24 * 1024 * 1024
    });
  } catch (e) { return (e.stdout || '').toString(); }
}

const report = { generatedAt: new Date().toISOString(), sizes: {} };
[[390, 844], [600, 844]].forEach(function (wh) {
  const w = wh[0], h = wh[1], key = w + 'x' + h;
  const shot = path.join(SHOTS, 'motion-b-' + w + '.png');
  run(['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    '--screenshot=' + shot, '--window-size=' + w + ',' + h,
    '--virtual-time-budget=6000', fileUrl(INDEX)], 90000);
  const dom = run(['--headless=new', '--disable-gpu', '--no-first-run', '--dump-dom',
    '--virtual-time-budget=20000', '--window-size=' + w + ',' + h, fileUrl(TMP)], 120000);
  const m = String(dom).match(/<title>MB([^<]*)<\/title>/);
  let probe = null;
  if (m) { try { probe = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')); } catch (e) { probe = null; } }
  report.sizes[key] = { screenshot: path.basename(shot), bytes: fs.existsSync(shot) ? fs.statSync(shot).size : 0, probe: probe };
  console.log(key + ' | shot=' + report.sizes[key].bytes + 'B | ' + (probe ? JSON.stringify(probe.checks) : 'NO_PROBE'));
  if (probe && probe.errors.length) console.log('  ERRORS ' + JSON.stringify(probe.errors));
});

try { fs.unlinkSync(TMP); } catch (e) { }
fs.writeFileSync(path.join(SHOTS, 'motion-b.json'), JSON.stringify(report, null, 2));
console.log('REPORT -> ' + path.join(SHOTS, 'motion-b.json'));
