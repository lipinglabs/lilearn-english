/* ============================================================
   英语冒险 · 岛 11 出题器（外置）
   ------------------------------------------------------------
   由 index.html 主脚本之后加载。core 通过 window.__LLCore 导出所需符号，
   本文件用同名局部变量取值，因此函数体与原版逐字节相同、未作任何改写。
   ============================================================ */
(function () {
  var L = window.__LLCore || {};
  var L111_A_KEY = { wolf: 'l111_a_wolf', pig: 'l111_a_pig', hunter: 'l111_a_hunter' };
  var L111_B_KEY = { straw: 'l111_b_straw', wood: 'l111_b_wood', brick: 'l111_b_brick' };
  var L111_CHARS = L.L111_CHARS;
  var L111_C_KEY = ['l111_c_wolf', 'l111_c_knock'];
  var L111_MATS = ['straw', 'wood', 'brick'];
  var L112_A_KEY = ['l112_a_where', 'l112_a_who'];
  var L112_B_KEY = { wolf: 'l112_b_wolf', hunter: 'l112_b_hunter', grandma: 'l112_b_grandma' };
  var L112_CHARS = L.L112_CHARS;
  var L112_SCENES = ['grandma', 'school', 'park'];
  var L113_A_KEY = { hot: 'l113_a_hot', cold: 'l113_a_cold', just: 'l113_a_just' };
  var L113_B_KEY = { big: 'l113_b_big', just: 'l113_b_just', small: 'l113_b_small' };
  var L113_SIZES = L.L113_SIZES;
  var L113_STATES = L.L113_STATES;
  var L114_PREV = { items: null, slots: null };
  var L114_STORIES = L.L114_STORIES;
  var L114_STORY_IDS = ['pigs', 'red', 'goldi'];
  var L115_A_SETS = [
      { sig: 'A:grandma', audio: 'l115_a_grandma', want: 'red' },
      { sig: 'A:house', audio: 'l115_a_house', want: 'house' },
      { sig: 'A:porridge', audio: 'l115_a_porridge', want: 'porridge' }
    ];
  var L115_B_SETS = [
      { sig: 'B:knock', audio: 'l115_b_knock', want: 'pig' },
      { sig: 'B:blow', audio: 'l115_b_blow', want: 'wolf' },
      { sig: 'B:basket', audio: 'l115_b_basket', want: 'red' }
    ];
  var L115_C_AUDIO = ['l115_c_red_pig', 'l115_c_pig_red'];
  var L115_LAST_ANS = { L115A: -1, L115B: -1 };
  var l114ShuffleDiff = L.l114ShuffleDiff;
  var l114SlotsDiff = L.l114SlotsDiff;
  var l115PickSide = L.l115PickSide;
  var l115PickWho = L.l115PickWho;
  var l115ShuffleAvoid = L.l115ShuffleAvoid;
  var pick = L.pick;
  var shuffle = L.shuffle;

function makeQuestionL111(type, prev) {
    var q, guard = 0;
    do {
      if (type === 0) {
        var kA = pick(L111_CHARS);
        var itemsA = shuffle(L111_CHARS.slice());
        q = {
          type: 'L111A', sig: 'A:' + kA, kind: kA, items: itemsA,
          options: [], answer: itemsA.indexOf(kA), audio: [L111_A_KEY[kA]]
        };
      } else if (type === 1) {
        var kB = pick(L111_MATS);
        var itemsB = shuffle(L111_MATS.slice());
        q = {
          type: 'L111B', sig: 'B:' + kB, kind: kB, items: itemsB,
          options: [], answer: itemsB.indexOf(kB), audio: [L111_B_KEY[kB]]
        };
      } else {
        var cv = Math.random() < 0.5 ? 0 : 1;
        q = {
          type: 'L111C', sig: 'C:' + cv, kind: 'wolf', cv: cv, items: [],
          options: [], answer: 0, audio: [L111_C_KEY[cv]]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionL112(type, prev) {
    var q, guard = 0;
    do {
      if (type === 0) {
        /* A：猎人问路，三张场景里选出「去奶奶家」 */
        var ai = Math.floor(Math.random() * 2);
        var itemsA = shuffle(L112_SCENES.slice());
        q = {
          type: 'L112A', sig: 'A:' + ai, kind: 'grandma', items: itemsA,
          options: [], answer: itemsA.indexOf('grandma'), audio: [L112_A_KEY[ai]]
        };
      } else if (type === 1) {
        /* B：三个角色里找出听到的那个 */
        var kB = pick(L112_CHARS);
        var itemsB = shuffle(L112_CHARS.slice());
        q = {
          type: 'L112B', sig: 'B:' + kB, kind: kB, items: itemsB,
          options: [], answer: itemsB.indexOf(kB), audio: [L112_B_KEY[kB]]
        };
      } else {
        /* C：岔路（奶奶家可能被翻到左边，防止背位置） */
        var flip = Math.random() < 0.5 ? 1 : 0;
        q = {
          type: 'L112C', sig: 'C:' + flip, kind: 'grandma', flip: flip, items: [],
          options: [], answer: 0, audio: ['l112_c_go']
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionL113(type, prev) {
    var q, guard = 0;
    do {
      if (type === 0) {
        var kA = pick(L113_STATES);
        var itemsA = shuffle(L113_STATES.slice());
        q = {
          type: 'L113A', sig: 'A:' + kA, kind: kA, items: itemsA,
          options: [], answer: itemsA.indexOf(kA), audio: [L113_A_KEY[kA]]
        };
      } else if (type === 1) {
        var kB = pick(L113_SIZES);
        var itemsB = shuffle(L113_SIZES.slice());
        q = {
          type: 'L113B', sig: 'B:' + kB, kind: kB, items: itemsB,
          options: [], answer: itemsB.indexOf(kB), audio: [L113_B_KEY[kB]]
        };
      } else {
        /* C：「刚好」的椅子每轮随机在左或右（防背位置，§三.27 的反面要求） */
        var side = Math.random() < 0.5 ? 'left' : 'right';
        q = {
          type: 'L113C', sig: 'C:' + side, kind: 'just', justSide: side, items: [],
          options: [], answer: 0, audio: ['l113_c_chair']
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionL114(type, prev) {
    var q, guard = 0;
    do {
      var story = pick(L114_STORY_IDS);
      if (type === 0) {
        var itemsA = l114ShuffleDiff(L114_PREV.items);
        var slotsA = l114SlotsDiff(L114_PREV.slots);
        L114_PREV.items = itemsA.slice();
        L114_PREV.slots = slotsA.slice();
        q = {
          type: 'L114A', sig: 'A:' + story, story: story,
          items: itemsA,                      /* 底部三张图的顺序每轮打乱（且不与上一轮相同） */
          slots: slotsA,                      /* 1/2/3 三个框的左右位置每轮随机 */
          options: [], answer: 0, audio: [L114_STORIES[story].audio]
        };
      } else if (type === 1) {
        var ask = Math.random() < 0.5 ? 'first' : 'last';
        var itemsB = shuffle([0, 1, 2]);
        var wantStep = ask === 'first' ? 0 : 2;
        q = {
          type: 'L114B', sig: 'B:' + story + ':' + ask, story: story, ask: ask,
          items: itemsB, slots: [1, 2, 3],
          options: [], answer: itemsB.indexOf(wantStep),
          audio: [ask === 'first' ? 'l114_b_first' : 'l114_b_last']
        };
      } else {
        /* C：一半概率给正确的顺序，一半给「对调两张」的错误顺序 */
        var isRight = Math.random() < 0.5;
        var arr = [0, 1, 2];
        if (!isRight) {
          var i1 = Math.floor(Math.random() * 3), i2 = (i1 + 1 + Math.floor(Math.random() * 2)) % 3;
          var tmp = arr[i1]; arr[i1] = arr[i2]; arr[i2] = tmp;
        }
        q = {
          type: 'L114C', sig: 'C:' + story + ':' + (isRight ? 1 : 0), story: story,
          arr: arr, correct: isRight, slots: (function () {
            var sl = l114SlotsDiff(L114_PREV.slots);
            L114_PREV.slots = sl.slice();
            return sl;
          })(),
          options: [], answer: isRight ? 0 : 1, audio: ['l114_c_check']
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionL115(type, prev) {
    var q, guard = 0;
    do {
      if (type === 0) {
        var a = pick(L115_A_SETS);
        var wantA = a.want;
        var kindsA = ['house', 'red', 'porridge'];
        var itemsA = l115ShuffleAvoid(kindsA, wantA, L115_LAST_ANS.L115A);
        var ansA = itemsA.indexOf(wantA);
        L115_LAST_ANS.L115A = ansA;
        q = {
          type: 'L115A', ask: 'L115A', kind: 'pic', sig: a.sig,
          items: itemsA, options: [], answer: ansA,
          audio: [a.audio]
        };
      } else if (type === 1) {
        var b = pick(L115_B_SETS);
        var wantB = b.want;
        var kindsB = ['pig', 'red', 'wolf'];
        var itemsB = l115ShuffleAvoid(kindsB, wantB, L115_LAST_ANS.L115B);
        var ansB = itemsB.indexOf(wantB);
        L115_LAST_ANS.L115B = ansB;
        q = {
          type: 'L115B', ask: 'L115B', kind: 'role', sig: b.sig,
          items: itemsB, options: [], answer: ansB,
          audio: [b.audio]
        };
      } else {
        var side = l115PickSide();
        var destOrder = (side === 'left') ? ['grandma', 'brick'] : ['brick', 'grandma'];
        var whoOrder = l115PickWho();
        q = {
          type: 'L115C', ask: 'L115C', sig: 'C:' + side + ':' + whoOrder.join(''),
          destOrder: destOrder, whoOrder: whoOrder,
          options: [], answer: 0,
          audio: [Math.random() < 0.5 ? L115_C_AUDIO[0] : L115_C_AUDIO[1]]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

  var M = window.__LLMakers = window.__LLMakers || {};
  M.makeL111 = makeQuestionL111;
  M.makeL112 = makeQuestionL112;
  M.makeL113 = makeQuestionL113;
  M.makeL114 = makeQuestionL114;
  M.makeL115 = makeQuestionL115;
})();
