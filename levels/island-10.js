/* ============================================================
   英语冒险 · 岛 10 出题器（外置）
   ------------------------------------------------------------
   由 index.html 主脚本之后加载。core 通过 window.__LLCore 导出所需符号，
   本文件用同名局部变量取值，因此函数体与原版逐字节相同、未作任何改写。
   ============================================================ */
(function () {
  var L = window.__LLCore || {};
  var L102_D_PAIRS = L.L102_D_PAIRS;
  var L102_FAST = L.L102_FAST;
  var L102_SLOW = L.L102_SLOW;
  var L103_PICS = L.L103_PICS;
  var L104_A_KEY = L.L104_A_KEY;
  var L104_B_KEY = L.L104_B_KEY;
  var L104_C_KEY = L.L104_C_KEY;
  var L104_ITEM_OF = L.L104_ITEM_OF;
  var L104_WEATHERS = L.L104_WEATHERS;
  var L105_B_KEY = L.L105_B_KEY;
  var L105_C_KEY = L.L105_C_KEY;
  var L105_ICONS = L.L105_ICONS;
  var L105_PICS = L.L105_PICS;
  var L10_A_KEY = L.L10_A_KEY;
  var L10_B_KEY = L.L10_B_KEY;
  var L10_C_KEY = L.L10_C_KEY;
  var L10_SCENES = L.L10_SCENES;
  var L10_SCENE_OF = L.L10_SCENE_OF;
  var L10_VEHICLES = L.L10_VEHICLES;
  var pick = L.pick;
  var shuffle = L.shuffle;

function makeQuestionL10(type, prev) {
    var q, guard = 0;
    do {
      if (type === 0) {
        var item = pick(L10_VEHICLES);
        q = {
          type: 'L10A', sig: 'A:' + item, item: item, scene: L10_SCENE_OF[item],
          sceneOrder: L10_SCENES.slice(), options: [], answer: 0,
          audio: [L10_A_KEY[item]]
        };
      } else if (type === 1) {
        var t = pick(L10_VEHICLES);
        var others = shuffle(L10_VEHICLES.filter(function (x) { return x !== t; })).slice(0, 2);
        var items = shuffle([t].concat(others));
        q = {
          type: 'L10B', sig: 'B:' + t, item: t, items: items, options: [],
          answer: items.indexOf(t), audio: [L10_B_KEY[t]]
        };
      } else {
        var c = pick(L10_VEHICLES);
        q = { type: 'L10C', sig: 'C:' + c, item: c, options: [], answer: 0, audio: [L10_C_KEY[c]] };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionL102(type, prev) {
    var q, guard = 0;
    do {
      if (type === 0) {
        /* A：听指令变道（左 = 蓝，右 = 黄） */
        var lane = pick(['left', 'right']);
        q = {
          type: 'L102A', sig: 'A:' + lane, lane: lane, item: null,
          options: [], answer: 0,
          audio: [lane === 'left' ? 'l102_t_left' : 'l102_t_right']
        };
      } else if (type === 1) {
        /* B：一快一慢，听 fast / slow 点选 */
        var wantFast = Math.random() < 0.5;
        var f = pick(L102_FAST), s = pick(L102_SLOW);
        var items = shuffle([f, s]);
        q = {
          type: 'L102B', sig: 'B:' + (wantFast ? 'f:' : 's:') + f + '|' + s,
          want: wantFast ? 'fast' : 'slow',
          item: wantFast ? f : s,
          items: items, options: [],
          answer: items.indexOf(wantFast ? f : s),
          audio: [wantFast ? 'l102_b_fast' : 'l102_b_slow']
        };
      } else if (type === 2) {
        /* C：TPR 快慢驾驶（永远判对） */
        var fastC = Math.random() < 0.5;
        q = {
          type: 'L102C', sig: 'C:' + (fastC ? 'fast' : 'slow'),
          want: fastC ? 'fast' : 'slow', item: null, options: [], answer: 0,
          audio: [fastC ? 'l102_t_drive_fast' : 'l102_t_drive_slow']
        };
      } else {
        /* D：快慢分类拖拽（把指定物品拖进快 / 慢框） */
        var pair = pick(L102_D_PAIRS);
        var askedFast = Math.random() < 0.5;
        var askedItem = askedFast ? pair.fast : pair.slow;
        q = {
          type: 'L102D', sig: 'D:' + pair.fast + '|' + pair.slow + ':' + (askedFast ? 'f' : 's'),
          item: askedItem, box: askedFast ? 'fast' : 'slow',
          items: shuffle([pair.fast, pair.slow]),
          options: [], answer: 0,
          audio: [askedFast ? pair.fKey : pair.sKey]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionL103(type, prev) {
    var q, guard = 0;
    do {
      if (type === 0) {
        var light = pick(['red', 'green']);
        var actor = pick(['car', 'boy']);
        var zone = light === 'red' ? 'stop' : 'past';
        q = {
          type: 'L103A', sig: 'A:' + light + ':' + actor,
          light: light, actor: actor, item: actor, zone: zone,
          options: [], answer: 0,
          audio: ['l103_a_' + light + '_' + actor]
        };
      } else if (type === 1) {
        /* B：正确画面 + 两个干扰画面（闯红灯 / 行为相反） */
        var greenGo = Math.random() < 0.5;
        var right = greenGo ? 'green_go' : 'red_stop';
        var others = L103_PICS.filter(function (x) { return x !== right; });
        var pics = shuffle([right].concat(others));
        q = {
          type: 'L103B', sig: 'B:' + right, pic: right, pics: pics,
          options: [], answer: pics.indexOf(right),
          audio: [greenGo ? 'l103_b_green_go' : 'l103_b_red_stop']
        };
      } else {
        var lc = pick(['red', 'green']);
        q = {
          type: 'L103C', sig: 'C:' + lc, light: lc, options: [], answer: 0,
          audio: ['l103_c_' + lc]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionL104(type, prev) {
    var q, guard = 0;
    do {
      if (type === 0) {
        /* A：三个天气图标（顺序洗牌），听句子点出对应天气 */
        var w = pick(L104_WEATHERS);
        var icons = shuffle(L104_WEATHERS.slice());
        q = {
          type: 'L104A', sig: 'A:' + w, weather: w, icons: icons,
          options: [], answer: icons.indexOf(w), audio: [L104_A_KEY[w]]
        };
      } else if (type === 1) {
        /* B：只有晴 / 雨两种（阴天不配物品，避免「阴天该戴什么」的歧义） */
        var wb = pick(['sunny', 'rainy']);
        var needItem = L104_ITEM_OF[wb];
        var others = shuffle(['sunglasses', 'umbrella', 'hat'].filter(function (x) { return x !== needItem; })).slice(0, 2);
        var items = shuffle([needItem].concat(others));
        q = {
          type: 'L104B', sig: 'B:' + wb, weather: wb, item: needItem, items: items,
          options: [], answer: items.indexOf(needItem), audio: [L104_B_KEY[wb]]
        };
      } else {
        /* C：三张场景图，听句子点出对应那张 */
        var kind = pick(['sun', 'rain', 'cloud']);
        var pics = shuffle(['sun', 'rain', 'cloud']);
        q = {
          type: 'L104C', sig: 'C:' + kind, kind: kind, pics: pics,
          options: [], answer: pics.indexOf(kind), audio: [L104_C_KEY[kind]]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionL105(type, prev) {
    var q, guard = 0;
    do {
      if (type === 0) {
        /* A：听「天气 + 方向」把车开到对应车道（左右颜色锚点沿用 10-2） */
        var wA = pick(['sunny', 'rainy', 'cloudy']);
        var laneA = pick(['left', 'right']);
        q = {
          type: 'L105A', sig: 'A:' + wA + ':' + laneA, weather: wA, lane: laneA,
          options: [], answer: 0, audio: ['l105_a_' + wA + '_' + laneA]
        };
      } else if (type === 1) {
        /* B：三张场景图，听句子点出对应那张 */
        var kB = pick(L105_PICS);
        var pics = shuffle(L105_PICS.slice());
        q = {
          type: 'L105B', sig: 'B:' + kB, kind: kB, pics: pics,
          options: [], answer: pics.indexOf(kB), audio: [L105_B_KEY[kB]]
        };
      } else {
        /* C：三个图标（天气 / 交通标志），听句子点出对应的那个 */
        var kC = pick(L105_ICONS);
        var icons = shuffle(L105_ICONS.slice());
        q = {
          type: 'L105C', sig: 'C:' + kC, kind: kC, icons: icons,
          options: [], answer: icons.indexOf(kC), audio: [L105_C_KEY[kC]]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

  var M = window.__LLMakers = window.__LLMakers || {};
  M.makeL10 = makeQuestionL10;
  M.makeL102 = makeQuestionL102;
  M.makeL103 = makeQuestionL103;
  M.makeL104 = makeQuestionL104;
  M.makeL105 = makeQuestionL105;
})();
