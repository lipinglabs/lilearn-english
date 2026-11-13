/* ============================================================
   英语冒险 · 岛 9 出题器（外置）
   ------------------------------------------------------------
   由 index.html 主脚本之后加载。core 通过 window.__LLCore 导出所需符号，
   本文件用同名局部变量取值，因此函数体与原版逐字节相同、未作任何改写。
   ============================================================ */
(function () {
  var L = window.__LLCore || {};
  var L92_A_KEY = { hat: 'l92_a_hat', shoes: 'l92_a_shoes', coat: 'l92_a_coat', pants: 'l92_a_pants' };
  var L92_B_KEY = { hat: 'l92_b_hat', shoes: 'l92_b_shoes', coat: 'l92_b_coat', pants: 'l92_b_pants' };
  var L92_C_KEYS = [
      { act: 'on',  item: 'hat',  key: 'l92_c_on_hat' },
      { act: 'off', item: 'hat',  key: 'l92_c_off_hat' },
      { act: 'on',  item: 'coat', key: 'l92_c_on_coat' },
      { act: 'off', item: 'coat', key: 'l92_c_off_coat' }
    ];
  var L92_ITEMS = L.L92_ITEMS;
  var L93_A_KEY = { hot: 'l93_t_hot_put', cold: 'l92_b_coat' };
  var L93_B_KEY = { hot: 'l93_b_hot', cold: 'l93_b_cold', rain: 'l93_b_rain' };
  var L93_C_KEY = { hot: 'l93_c_hot', cold: 'l93_c_cold' };
  var L93_ITEMS = ['tshirt', 'coat'];
  var L93_NEED = { hot: 'tshirt', cold: 'coat' };
  var L93_SKY = ['hot', 'cold'];
  var L93_STATES = ['hot', 'cold', 'rain'];
  var L94_A_KEY = { hat: 'l94_a_hat', shoes: 'l94_a_shoes', pants: 'l94_a_pants' };
  var L94_C = [
      { key: 'l94_c_hand', look: 'shoes@head' },
      { key: 'l94_c_nose', look: 'hat@foot' },
      { key: 'l94_c_jump', look: 'pants@arms' }
    ];
  var L94_ITEMS = ['hat', 'shoes', 'pants'];
  var L94_NORMAL = ['hat@head', 'pants@legs', 'shoes@feet'];
  var L94_SILLY = [
      { look: 'shoes@head', key: 'l94_b_shoes', item: 'shoes' },
      { look: 'pants@arms', key: 'l94_b_pants', item: 'pants' },
      { look: 'hat@foot', key: 'l94_b_hat', item: 'hat' }
    ];
  var L94_SLOT = L.L94_SLOT;
  var L95_C_COMBOS = [
      { key: 'l95_c_pants_hat',  steps: [{ op: 'put', item: 'pants', slot: 'legs' }, { op: 'take', item: 'hat',  slot: 'head' }] },
      { key: 'l95_c_shoes_coat', steps: [{ op: 'put', item: 'shoes', slot: 'feet' }, { op: 'take', item: 'coat', slot: 'body' }] },
      { key: 'l95_c_coat_hat',   steps: [{ op: 'put', item: 'coat',  slot: 'body' }, { op: 'take', item: 'hat',  slot: 'head' }] }
    ];
  var L95_SILLY_SET = ['pants@head', 'shoes@hand'];
  var L9_A_KEY = { shirt: 'l9_t_shirt_put', pants: 'l9_t_pants_put', shoes: 'l9_t_shoes', hat: 'l9_t_hat' };
  var L9_B_KEY = { shirt: 'l9_b_shirt', pants: 'l9_b_pants', shoes: 'l9_b_shoes', hat: 'l9_b_hat' };
  var L9_C_KEY = { shirt: 'l9_c_shirt', pants: 'l9_c_pants', shoes: 'l9_c_shoes', hat: 'l9_c_hat' };
  var L9_ITEMS = L.L9_ITEMS;
  var L9_PART = L.L9_PART;
  var ensureL92Css = L.ensureL92Css;
  var ensureL93Css = L.ensureL93Css;
  var ensureL94Css = L.ensureL94Css;
  var ensureL95Css = L.ensureL95Css;
  var ensureL9Css = L.ensureL9Css;
  var pick = L.pick;
  var shuffle = L.shuffle;
  var state = L.state;

function makeQuestionL9(type, prev) {
    ensureL9Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        /* A：中央小人（打底衫）+ 3 件衣物，听指令把孩子拖到小人身上 */
        var item = pick(L9_ITEMS);
        var rest = L9_ITEMS.filter(function (x) { return x !== item; });
        shuffle(rest);
        var items = shuffle([item, rest[0], rest[1]]);
        q = {
          type: 'L9A', sig: 'A:' + item + ':' + items.join(','), item: item, items: items,
          part: L9_PART[item],
          options: items.map(function (it) { return { kind: 'l9item', item: it }; }),
          answer: items.indexOf(item), correct: items.indexOf(item),
          audio: [L9_A_KEY[item]]
        };
      } else if (type === 1) {
        /* B：3 个各穿一件衣物的小人，听句子点目标 */
        var target = pick(L9_ITEMS);
        var pool = L9_ITEMS.filter(function (x) { return x !== target; });
        shuffle(pool);
        var kids = shuffle([target, pool[0], pool[1]]);
        q = {
          type: 'L9B', sig: 'B:' + target + ':' + kids.join(','), target: target, wearKids: kids,
          options: [], answer: kids.indexOf(target), correct: kids.indexOf(target),
          audio: [L9_B_KEY[target]]
        };
      } else {
        /* C：TPR 模仿穿衣服（巨大👍，永远判对 §三.12） */
        state.l9cIdx = ((state.l9cIdx || 0) + 1) % L9_ITEMS.length;
        var it = L9_ITEMS[state.l9cIdx];
        q = {
          type: 'L9C', sig: 'C:' + it, item: it,
          options: [], correct: 0, audio: [L9_C_KEY[it]]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionL92(type, prev) {
    ensureL92Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        /* A：小人身上已穿着某件，听指令把它拖回底部物品栏 */
        var off = pick(L92_ITEMS);
        q = {
          type: 'L92A', sig: 'A:' + off, item: off, act: 'off', from: 'body', to: 'tray',
          options: [], correct: 0, audio: [L92_A_KEY[off]]
        };
      } else if (type === 1) {
        /* B：小人光着，底部 3 件衣物，听指令把对的那件拖到身上 */
        var on = pick(L92_ITEMS);
        var rest = L92_ITEMS.filter(function (x) { return x !== on; });
        shuffle(rest);
        var items = shuffle([on, rest[0], rest[1]]);
        q = {
          type: 'L92B', sig: 'B:' + on + ':' + items.join(','), item: on, act: 'on', from: 'tray', to: 'kid',
          items: items,
          options: items.map(function (it) { return { kind: 'l92item', item: it }; }),
          answer: items.indexOf(on), correct: items.indexOf(on),
          audio: [L92_B_KEY[on]]
        };
      } else {
        /* C：TPR 模仿穿脱（巨大👍，永远判对 §三.12） */
        state.l92cIdx = ((state.l92cIdx || 0) + 1) % L92_C_KEYS.length;
        var c = L92_C_KEYS[state.l92cIdx];
        q = {
          type: 'L92C', sig: 'C:' + c.key, item: c.item, act: c.act,
          options: [], correct: 0, audio: [c.key]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionL93(type, prev) {
    ensureL93Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        /* A：屏幕随机出现太阳 / 雪花，下方 T 恤 + 外套，听指令拖对的那件 */
        var sky = pick(L93_SKY);
        var need = L93_NEED[sky];
        var other = L93_ITEMS.filter(function (x) { return x !== need; })[0];
        var items = shuffle([need, other]);
        q = {
          type: 'L93A', sig: 'A:' + sky + ':' + items.join(','),
          sky: sky, state: sky, item: need, items: items,
          options: items.map(function (it) { return { kind: 'l93item', item: it }; }),
          answer: items.indexOf(need), correct: items.indexOf(need),
          audio: [L93_A_KEY[sky]]
        };
      } else if (type === 1) {
        /* B：3 个不同感受的小人（流汗 / 发抖 / 打伞），听句子点目标 */
        var target = pick(L93_STATES);
        var kids = shuffle(L93_STATES.slice());
        q = {
          type: 'L93B', sig: 'B:' + target + ':' + kids.join(','),
          target: target, kidStates: kids,
          options: [], answer: kids.indexOf(target), correct: kids.indexOf(target),
          audio: [L93_B_KEY[target]]
        };
      } else {
        /* C：TPR 模仿天气（巨大👍，永远判对 §三.12） */
        state.l93cIdx = ((state.l93cIdx || 0) + 1) % L93_SKY.length;
        var st = L93_SKY[state.l93cIdx];
        q = {
          type: 'L93C', sig: 'C:' + st, state: st,
          options: [], correct: 0, audio: [L93_C_KEY[st]]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionL94(type, prev) {
    ensureL94Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        /* A：小人只穿打底衫，下方 3 件衣物，听指令把指定那件「穿到错的地方」 */
        var item = pick(L94_ITEMS);
        var rest = L94_ITEMS.filter(function (x) { return x !== item; });
        shuffle(rest);
        var items = shuffle([item, rest[0], rest[1]]);
        q = {
          type: 'L94A', sig: 'A:' + item + ':' + items.join(','),
          l94Item: item, l94Slot: L94_SLOT[item], items: items,
          look: item + '@' + L94_SLOT[item],
          options: items.map(function (it) { return { kind: 'l94item', item: it }; }),
          answer: items.indexOf(item), correct: items.indexOf(item),
          audio: [L94_A_KEY[item]]
        };
      } else if (type === 1) {
        /* B：3 张穿搭图（1 张荒诞 + 2 张正常），听句子点出「捣蛋的那张」 */
        var S = pick(L94_SILLY);
        var decoys = L94_NORMAL.filter(function (l) { return l.split('@')[0] !== S.item; });
        var looks = shuffle([S.look, decoys[0], decoys[1]]);
        q = {
          type: 'L94B', sig: 'B:' + S.look + ':' + looks.join(','),
          l94Looks: looks, l94Silly: S.look,
          options: [], answer: looks.indexOf(S.look), correct: looks.indexOf(S.look),
          audio: [S.key]
        };
      } else {
        /* C：TPR 极速搞怪（巨大👍，永远判对 §三.12） */
        state.l94cIdx = ((state.l94cIdx || 0) + 1) % L94_C.length;
        var c = L94_C[state.l94cIdx];
        q = {
          type: 'L94C', sig: 'C:' + c.key, l94Look: c.look,
          options: [], correct: 0, audio: [c.key]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionL95(type, prev) {
    ensureL95Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        /* A：屏幕出现太阳/雪花，下方 3 件衣物，听指令把对的拖到身上 */
        var w = pick(['hot', 'cold']);
        var need = (w === 'hot') ? 'tshirt' : 'coat';
        var pool = ['coat', 'tshirt', 'pants', 'hat'].filter(function (x) { return x !== need; });
        shuffle(pool);
        var tray = shuffle([need, pool[0], pool[1]]);
        q = {
          type: 'L95A', sig: 'A:' + w + ':' + tray.join(','), weather: w, need: need, items: tray,
          options: tray.map(function (it) { return { kind: 'l95item', item: it }; }),
          answer: tray.indexOf(need), correct: tray.indexOf(need),
          audio: [w === 'hot' ? 'l93_t_hot_put' : 'l92_b_coat']
        };
      } else if (type === 1) {
        /* B：听长句，把指定衣物「穿到错的部位」（任意落点都算中，触发搞笑音效） */
        var B = pick(['shoes', 'pants', 'hat']);
        var slot = { shoes: 'head', pants: 'arms', hat: 'foot' }[B];
        var restB = ['shoes', 'pants', 'hat'].filter(function (x) { return x !== B; });
        shuffle(restB);
        var itemsB = shuffle([B, restB[0], restB[1]]);
        q = {
          type: 'L95B', sig: 'B:' + B + ':' + itemsB.join(','), item: B, slot: slot, look: B + '@' + slot, items: itemsB,
          options: itemsB.map(function (it) { return { kind: 'l95item', item: it }; }),
          answer: itemsB.indexOf(B), correct: itemsB.indexOf(B),
          audio: ['l95_b_' + B]
        };
      } else if (type === 2) {
        /* C：多步指令（先穿 X 再脱 Y），双向拖拽 */
        var C = pick(L95_C_COMBOS);
        q = {
          type: 'L95C', sig: 'C:' + C.key, steps: C.steps.slice(), audio: [C.key]
        };
      } else {
        /* D：听音找捣蛋（正常 + 裤子套头上 + 手里拎鞋；任一个捣蛋都算对） */
        var normalLook = pick(['shirt@body,pants@legs,shoes@feet', 'pants@legs,shoes@feet,hat@head', 'shirt@body,pants@legs']);
        var looksD = shuffle([normalLook, 'pants@head', 'shoes@hand']);
        var firstSilly = looksD.findIndex(function (l) { return L95_SILLY_SET.indexOf(l) >= 0; });
        q = {
          type: 'L95D', sig: 'D:' + looksD.join('|'), looks: looksD, sillySet: L95_SILLY_SET.slice(),
          options: [], answer: firstSilly, correct: firstSilly, audio: ['l95_d_find']
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

  var M = window.__LLMakers = window.__LLMakers || {};
  M.makeL9 = makeQuestionL9;
  M.makeL92 = makeQuestionL92;
  M.makeL93 = makeQuestionL93;
  M.makeL94 = makeQuestionL94;
  M.makeL95 = makeQuestionL95;
})();
