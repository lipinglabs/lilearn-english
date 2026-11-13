/* ============================================================
   英语冒险 · 岛 1 出题器（外置试点）
   ------------------------------------------------------------
   由 index.html 主脚本之后加载。core 在 IIFE 末尾把所需符号导出到
   window.__LLCore；本文件用同名局部变量取值，因此 4 个函数体
   与原版【逐字节相同、未作任何改写】。
   最后通过 window.__LLMakers 注册，newQuestion 会优先调用这里的实现。
   ============================================================ */
(function () {
  var L = window.__LLCore || {};
  var COLORS = L.COLORS;
  var FRUITS = L.FRUITS;
  var NUMBERS_W2 = L.NUMBERS_W2;
  var NUMBERS_W3 = L.NUMBERS_W3;
  var PAINT_ITEMS = [
      { id: 'car', asset: 'car' },
      { id: 'balloon', asset: 'balloon' }
    ];
  var SMALL_COUNTS = [2, 3, 4, 5];
  var W5_CFRUITS = [                           // 有染色素材、可用于题型 B 的水果
      { id: 'apple', name: 'apple' },
      { id: 'strawberry', name: 'strawberry' },
      { id: 'grape', name: 'grape' }
    ];
  var W5_COLORS = [                            // 题型 B/C 只用红蓝黄三种篮子
      { id: 'red',    css: '#E8463C', deep: '#B92F27' },
      { id: 'blue',   css: '#3D8BE8', deep: '#2A63B4' },
      { id: 'yellow', css: '#F5BE3C', deep: '#D19A18' }
    ];
  var W5_NUMBERS = [12, 18, 22, 28];
  var W5_PILE_POOL = [12, 15, 18, 20, 22, 25, 28];
  var pick = L.pick;
  var shuffle = L.shuffle;
  var takeFresh = L.takeFresh;
  var usedPairs = L.usedPairs;
  var withColorDistractors = L.withColorDistractors;
  var withDistractors = L.withDistractors;

function makeQuestionW2(type, prev) {
    var num, fruit, pairKey, guard = 0;
    do {
      num = pick(NUMBERS_W2, prev ? prev.num : null);
      fruit = pick(FRUITS, prev ? prev.fruit : null);
      pairKey = num + '-' + fruit.id;
      guard += 1;
    } while (usedPairs[pairKey] && guard < 60);
    usedPairs[pairKey] = true;

    if (type === 0) {
      // 题型 A：屏幕三堆不同数量的十格阵果堆，听数字选对应堆
      var counts = withDistractors(NUMBERS_W2, num);
      return {
        type: 'W2A', num: num, fruit: fruit,
        options: counts.map(function (v) { return { kind: 'tf', count: v, fruit: fruit }; }),
        correct: counts.indexOf(num),
        audio: ['n' + num]
      };
    }

    if (type === 1) {
      // 题型 B：三张数字标牌（带小水果图标），听 "Find seventeen bananas." 选标牌
      var nums = withDistractors(NUMBERS_W2, num);
      return {
        type: 'W2B', num: num, fruit: fruit,
        options: nums.map(function (v) { return { kind: 'sign2', value: v, fruit: fruit }; }),
        correct: nums.indexOf(num),
        audio: ['q_' + num + '_' + fruit.id]
      };
    }

    // 题型 C：喂食机。三堆松散水果（约 5 / 约 num / 约 35），凭估数选对的喂怪兽
    var small = 5;
    var big = 35;
    var spread = shuffle([small, num, big]);
    return {
      type: 'W2C', num: num, fruit: fruit,
      options: spread.map(function (v) { return { kind: 'loose', count: v, fruit: fruit }; }),
      correct: spread.indexOf(num),
      audio: ['c_' + num + '_' + fruit.id]
    };
  }

function makeQuestionW3(type, prev) {
    var pairKey, guard = 0;

    if (type === 1) {
      // 题型 B：听短句找组合图。答案 = (小数量 2–5, 水果)。
      // 三个选项的「数量 + 水果」各不相同（如 2 苹果 / 3 香蕉 / 4 草莓），
      // 必须整句都听懂才能选对，不能靠"数一数"或"只看水果"蒙。
      var count, fruitB;
      do {
        count = pick(SMALL_COUNTS, prev && prev.type === 'W3B' ? prev.num : null);
        fruitB = pick(FRUITS, prev && prev.type === 'W3B' ? prev.fruit : null);
        pairKey = count + '-' + fruitB.id;
        guard += 1;
      } while (usedPairs[pairKey] && guard < 60);
      usedPairs[pairKey] = true;

      var others = shuffle(FRUITS.filter(function (f) { return f.id !== fruitB.id; })).slice(0, 2);
      var otherCounts = shuffle(SMALL_COUNTS.filter(function (c) { return c !== count; }));
      var list = shuffle([fruitB].concat(others));
      var order = list.map(function (f) { return f.id; });
      return {
        type: 'W3B', num: count, fruit: fruitB,
        options: list.map(function (f) {
          return { kind: 'combo', count: f.id === fruitB.id ? count : otherCounts.pop(), fruit: f };
        }),
        correct: order.indexOf(fruitB.id),
        audio: ['q_' + count + '_' + fruitB.id]
      };
    }

    var num, fruit;
    do {
      num = pick(NUMBERS_W3, prev ? prev.num : null);
      fruit = pick(FRUITS, prev ? prev.fruit : null);
      pairKey = num + '-' + fruit.id;
      guard += 1;
    } while (usedPairs[pairKey] && guard < 60);
    usedPairs[pairKey] = true;

    if (type === 0) {
      // 题型 A：只听 "Twenty-four"，在三个巨大 3D 数字底板里点对的那个
      var nums = withDistractors(NUMBERS_W3, num);
      return {
        type: 'W3A', num: num, fruit: fruit,
        options: nums.map(function (v) { return { kind: 'slab', value: v }; }),
        correct: nums.indexOf(num),
        audio: ['n' + num]
      };
    }

    // 题型 C：数数大挑战。中央十格阵果堆（如 10+10+5=25），
    // 语音 "How many strawberries?" → "Twenty-five."，选三个数字之一
    var counts = withDistractors(NUMBERS_W3, num);
    return {
      type: 'W3C', num: num, fruit: fruit,
      options: counts.map(function (v) { return { kind: 'slab', value: v }; }),
      correct: counts.indexOf(num),
      audio: ['howmany_' + fruit.id, 'n' + num]
    };
  }

function makeQuestionW4(type, prev) {
    var prevKey = prev ? (prev.type + '|' + (prev.color ? prev.color.id : '') + '|' + (prev.item ? prev.item.id : '')) : null;

    if (type === 2) {
      // 题型 C：灰色物品 + 三个颜色按钮，"Make the car red."
      var combosC = [];
      PAINT_ITEMS.forEach(function (it) {
        COLORS.forEach(function (c) {
          combosC.push({ key: 'C|' + it.id + '|' + c.id, item: it, color: c });
        });
      });
      var pickC = takeFresh(combosC, usedPairs, prevKey);
      var paint = withColorDistractors(pickC.color);
      return {
        type: 'W4C', item: pickC.item, color: pickC.color,
        options: paint.map(function (c) { return { kind: 'colorBtn', color: c }; }),
        correct: paint.indexOf(pickC.color),
        audio: ['mk_' + pickC.item.id + '_' + pickC.color.id]
      };
    }

    var combos = COLORS.map(function (c) {
      return { key: (type === 0 ? 'A|' : 'B|') + c.id, color: c };
    });
    var pk = takeFresh(combos, usedPairs, prevKey);
    var color = pk.color;
    var opts = withColorDistractors(color);

    if (type === 0) {
      // 题型 A：三个不同颜色的 3D 气球，只听颜色名
      return {
        type: 'W4A', color: color,
        options: opts.map(function (c) { return { kind: 'colorBalloon', color: c }; }),
        correct: opts.indexOf(color),
        audio: ['col_' + color.id]
      };
    }

    // 题型 B：三个不同颜色的苹果，"Find the red apple."
    return {
      type: 'W4B', color: color,
      options: opts.map(function (c) { return { kind: 'colorFruit', color: c, fruit: 'apple' }; }),
      correct: opts.indexOf(color),
      audio: ['fb_' + color.id]
    };
  }

function makeQuestionW5(type, prev) {
    var prevKey = prev ? (prev.type + '|' + (prev.color ? prev.color.id : '') + '|' +
      (prev.item ? prev.item.id : '') + '|' + (prev.num || '')) : null;

    if (type === 0) {
      // 题型 A：把小怪兽要的果篮拖给它。三个篮子＝十格阵果堆，只有一篮数量正确
      var combosA = [];
      W5_NUMBERS.forEach(function (n) {
        FRUITS.forEach(function (f) {
          combosA.push({ key: 'A|' + n + '|' + f.id, num: n, fruit: f });
        });
      });
      var pickA = takeFresh(combosA, usedPairs, prevKey);

      // 干扰果堆：数量与正确值不同，且彼此不同
      var others = shuffle(W5_PILE_POOL.filter(function (n) { return n !== pickA.num; })).slice(0, 2);
      var counts = shuffle([pickA.num].concat(others));

      return {
        type: 'W5A', num: pickA.num, fruit: pickA.fruit,
        options: counts.map(function (c) { return { kind: 'basketPile', count: c, fruit: pickA.fruit }; }),
        correct: counts.indexOf(pickA.num),
        audio: ['c_' + pickA.num + '_' + pickA.fruit.id]
      };
    }

    if (type === 1) {
      // 题型 B：把指定颜色的水果拖进同色篮子
      var combosB = [];
      W5_COLORS.forEach(function (c) {
        W5_CFRUITS.forEach(function (f) {
          combosB.push({ key: 'B|' + c.id + '|' + f.id, color: c, fruit: f });
        });
      });
      var pickB = takeFresh(combosB, usedPairs, prevKey);

      // 托盘里 3 个水果：正确那一个 + 2 个干扰（颜色或水果不同）
      var tray = [pickB];
      var pool = [];
      W5_COLORS.forEach(function (c) {
        W5_CFRUITS.forEach(function (f) {
          if (!(c.id === pickB.color.id && f.id === pickB.fruit.id)) {
            pool.push({ color: c, fruit: f });
          }
        });
      });
      pool = shuffle(pool);
      // 优先放一个「同色异果」，逼孩子两条线索都听懂
      var sameColor = pool.filter(function (p) {
        return p.color.id === pickB.color.id;
      });
      if (sameColor.length) {
        tray.push(sameColor[0]);
        pool = pool.filter(function (p) { return p !== sameColor[0]; });
      }
      while (tray.length < 3 && pool.length) tray.push(pool.pop());
      shuffle(tray);

      var correctFruit = tray.findIndex(function (t) {
        return t.color.id === pickB.color.id && t.fruit.id === pickB.fruit.id;
      });

      var baskets = shuffle(W5_COLORS.map(function (c) { return { kind: 'basketColor', color: c }; }));

      return {
        type: 'W5B', color: pickB.color, fruit: pickB.fruit, item: pickB.fruit,
        tray: tray, correctFruit: correctFruit,
        options: baskets,
        correct: baskets.map(function (b) { return b.color.id; }).indexOf(pickB.color.id),
        audio: ['pb_' + pickB.color.id + '_' + pickB.fruit.id]
      };
    }

    // 题型 C：三张大卡片 = (数量 + 颜色) 组合，直接点选
    var combosC = [];
    SMALL_COUNTS.forEach(function (n) {
      W5_COLORS.forEach(function (c) {
        combosC.push({ key: 'C|' + n + '|' + c.id, num: n, color: c });
      });
    });
    var pickC = takeFresh(combosC, usedPairs, prevKey);

    var cards = [pickC];
    var otherPool = shuffle(combosC.filter(function (x) {
      return !(x.num === pickC.num && x.color.id === pickC.color.id);
    }));
    while (cards.length < 3 && otherPool.length) cards.push(otherPool.pop());
    // 干扰卡片不能与正确卡完全同值（数量/颜色各不相同）
    shuffle(cards);

    var correctCard = cards.findIndex(function (c) {
      return c.num === pickC.num && c.color.id === pickC.color.id;
    });

    return {
      type: 'W5C', num: pickC.num, color: pickC.color,
      options: cards.map(function (c) { return { kind: 'comboCard', count: c.num, color: c.color, fruit: 'apple' }; }),
      correct: correctCard,
      audio: ['fc_' + pickC.num + '_' + pickC.color.id]
    };
  }

  var M = window.__LLMakers = window.__LLMakers || {};
  M.makeW2 = makeQuestionW2;
  M.makeW3 = makeQuestionW3;
  M.makeW4 = makeQuestionW4;
  M.makeW5 = makeQuestionW5;
})();
