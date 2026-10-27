/* ============================================================
   英语冒险 Service Worker
   ------------------------------------------------------------
   作用有两个，缺一不可：
   1. 让 Android Chrome 认为本站是「可安装应用」——没有 SW 时
      「添加到主屏幕」只会生成一个普通书签，点开仍然带地址栏；
   2. 断网也能玩：语音和图片全部内联在 index.html 里，缓存住
      这个文件就等于缓存了整个游戏。

   缓存策略：
   - index.html / manifest.json：**network-first**，联网时永远拿最新的，
     断网才回落到缓存（绝不让孩子看到旧版本卡住不动）；
   - 图标等静态资源：cache-first。
   改版本号即可让孩子设备上下一次联网时换新缓存。
   ============================================================ */

var CACHE = 'lilearn-v9';
var SHELL = [
  './',
  './index.html',
  './manifest.json',
  /* 语音分块：索引 + 公共语音随 SW 一起预缓存（0.7MB），
     其余 voice/chunks/island_*.js 走运行时缓存（首次进岛时缓存，之后离线可玩）。
     注意：v4 及更早缓存里存着单体 voice.js（35MB），activate 时会整体删掉。 */
  './voice/chunks/index.js',
  './voice/chunks/core.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon-180.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // 单个资源失败不能连累整个安装（例如图标还没部署）
      return Promise.all(SHELL.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () { });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  // 只接管本站资源：GitHub API（云存档）等跨域请求一律放行，不缓存
  if (url.origin !== self.location.origin) return;

  var isDoc = req.mode === 'navigate' ||
    /\/(index\.html)?$/.test(url.pathname) ||
    /manifest\.json$/.test(url.pathname);

  if (isDoc) {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () { });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('./index.html');
        });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () { });
        }
        return res;
      });
    })
  );
});
