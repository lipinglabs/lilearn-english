/* ============================================================
   英语冒险 · 岛 2 出题器（外置）
   ------------------------------------------------------------
   由 index.html 主脚本之后加载。core 通过 window.__LLCore 导出所需符号，
   本文件用同名局部变量取值，因此函数体与原版逐字节相同、未作任何改写。
   ============================================================ */
(function () {
  var L = window.__LLCore || {};
  var P2_ITEMS = L.P2_ITEMS;
  var P2_POS = L.P2_POS;
  var P2_SENTENCE = L.P2_SENTENCE;
  var P2_VERDICTS = L.P2_VERDICTS;
  var P3_ITEMS = L.P3_ITEMS;
  var P3_POS = L.P3_POS;
  var P3_SENT = L.P3_SENT;
  var P3_VERDICTS = L.P3_VERDICTS;
  var P4_ITEMS = L.P4_ITEMS;
  var P4_POS = L.P4_POS;
  var P4_VERDICTS = L.P4_VERDICTS;
  var P5_ITEMS = L.P5_ITEMS;
  var P5_POS = L.P5_POS;
  var P5_POS_SENT = L.P5_POS_SENT;
  var P5_VERDICTS = L.P5_VERDICTS;
  var SHAPES = L.SHAPES;
  var SHAPE_COLORS = L.SHAPE_COLORS;
  var pick = L.pick;
  var shuffle = L.shuffle;
  var state = L.state;
  var takeFresh = L.takeFresh;
  var usedPairs = L.usedPairs;

function makeQuestionS1(type, prev) {
    var prevShape = prev && prev.shape ? prev.shape : null;
    var shape = pick(SHAPES, prevShape);

    // 选项栏只有 3 个槽位，而形状有 4 种：本题正确答案 + 2 个干扰形状（顺序打乱）
    var others = shuffle(SHAPES.filter(function (s2) { return s2.id !== shape.id; })).slice(0, 2);
    var list = shuffle([shape].concat(others));
    var palette = shuffle(SHAPE_COLORS.slice());

    function colorFor(i) { return palette[i % palette.length]; }

    if (type === 1) {
      // 题型 B：生活物品联想
      return {
        type: 'S1B', shape: shape,
        options: list.map(function (s, i) {
          return { kind: 'object', shape: s, color: colorFor(i) };
        }),
        correct: list.indexOf(shape),
        audio: ['ws_' + shape.id]
      };
    }

    if (type === 2) {
      // 题型 C：拼图房子，点形状按钮
      return {
        type: 'S1C', shape: shape,
        options: list.map(function (s, i) {
          return { kind: 'shapeBtn', shape: s, color: colorFor(i) };
        }),
        correct: list.indexOf(shape),
        audio: ['fs_' + shape.id]
      };
    }

    // 题型 A：三个彩色几何图形
    return {
      type: 'S1A', shape: shape,
      options: list.map(function (s, i) {
        return { kind: 'shape', shape: s, color: colorFor(i) };
      }),
      correct: list.indexOf(shape),
      audio: ['fs_' + shape.id]
    };
  }

function makeQuestionP2(type, prev) {
    if (type === 0) {
      // 题型 A：三个盒子场景（里面 / 上面 / 旁边），听整句找位置
      var aCombos = P2_POS.map(function (p) { return { key: 'A-' + p, pos: p }; });
      var aPrev = (prev && prev.type === 'P2A') ? 'A-' + prev.pos : null;
      var pos = takeFresh(aCombos, usedPairs, aPrev).pos;
      var list = shuffle(P2_POS.slice());
      return {
        type: 'P2A', pos: pos,
        options: list.map(function (p) { return { kind: 'posScene', pos: p }; }),
        correct: list.indexOf(pos),
        audio: ['p_where', P2_SENTENCE[pos]]
      };
    }

    if (type === 1) {
      // 题型 B：听 "Put the apple on the table."，把对应物品拖到桌上
      var bCombos = P2_ITEMS.map(function (it) { return { key: 'B-' + it.id, item: it }; });
      var bPrev = (prev && prev.type === 'P2B') ? 'B-' + prev.item.id : null;
      var item = takeFresh(bCombos, usedPairs, bPrev).item;
      var itemOpts = shuffle(P2_ITEMS.slice());
      return {
        type: 'P2B', item: item,
        options: itemOpts.map(function (it) { return { kind: 'p2item', item: it }; }),
        correct: itemOpts.indexOf(item),
        audio: [item.audio]
      };
    }

    // 题型 C：看图判断句子对错（✅ / ❌）
    var cCombos = P2_VERDICTS.map(function (v) { return { key: 'C-' + v.key, v: v }; });
    var cPrev = (prev && prev.type === 'P2C') ? 'C-' + prev.verdict.key : null;
    var verdict = takeFresh(cCombos, usedPairs, cPrev).v;

    // 对错交替出现，保证一局里 ✅ 与 ❌ 都有，不靠运气
    state.vFlip = !state.vFlip;
    var truth = state.vFlip;
    var sentence = truth ? verdict.match : verdict.mismatch;

    var opts = shuffle([{ kind: 'yesNo', val: true }, { kind: 'yesNo', val: false }]);
    return {
      type: 'P2C', verdict: verdict, kind: verdict.kind, truth: truth, sentence: sentence,
      options: opts,
      correct: opts[0].val === truth ? 0 : 1,
      audio: [sentence, 'yesno']
    };
  }

function makeQuestionP3(type, prev) {
    if (type === 0) {
      // 题型 A：三张场景（椅子下 / 椅子后 / 椅子上），听整句找位置
      var aCombos = P3_POS.map(function (p) { return { key: 'A-' + p, pos: p }; });
      var aPrev = (prev && prev.type === 'P3A') ? 'A-' + prev.pos : null;
      var pos = takeFresh(aCombos, usedPairs, aPrev).pos;
      var list = shuffle(P3_POS.slice());
      return {
        type: 'P3A', pos: pos,
        options: list.map(function (p) { return { kind: 'p3chair', pos: p }; }),
        correct: list.indexOf(pos),
        audio: ['p_where_cat', P3_SENT[pos]]
      };
    }

    if (type === 1) {
      // 题型 B：听 "Put the dog behind the box."，把对应物品放到箱子后面
      var bCombos = P3_ITEMS.map(function (it) { return { key: 'B-' + it.id, item: it }; });
      var bPrev = (prev && prev.type === 'P3B') ? 'B-' + prev.item.id : null;
      var item = takeFresh(bCombos, usedPairs, bPrev).item;
      var itemOpts = shuffle(P3_ITEMS.slice());
      return {
        type: 'P3B', item: item,
        options: itemOpts.map(function (it) { return { kind: 'p3item', item: it }; }),
        correct: itemOpts.indexOf(item),
        audio: [item.audio]
      };
    }

    // 题型 C：场景对错判断
    var cCombos = P3_VERDICTS.map(function (v) { return { key: 'C-' + v.key, v: v }; });
    var cPrev = (prev && prev.type === 'P3C') ? 'C-' + prev.verdict.key : null;
    var verdict = takeFresh(cCombos, usedPairs, cPrev).v;

    state.vFlip = !state.vFlip;
    var truth = state.vFlip;
    var sentence = truth ? verdict.match : verdict.mismatch;

    var opts = shuffle([{ kind: 'yesNo', val: true }, { kind: 'yesNo', val: false }]);
    return {
      type: 'P3C', verdict: verdict, kind: verdict.kind, truth: truth, sentence: sentence,
      options: opts,
      correct: opts[0].val === truth ? 0 : 1,
      audio: [sentence, 'yesno']
    };
  }

function makeQuestionP4(type, prev) {
    if (type === 0) {
      // 题型 A：三个场景（圈上 / 圈里 / 圈旁），指令可能是祈使句也可能是陈述句
      var aCombos = P4_POS.map(function (p) { return { key: 'A-' + p, pos: p }; });
      var aPrev = (prev && prev.type === 'P4A') ? 'A-' + prev.pos : null;
      var pos = takeFresh(aCombos, usedPairs, aPrev).pos;

      var form = Math.random() < 0.5 ? 'put' : 'is';
      var audioKey = (form === 'put') ? ('cb_put_' + pos) : ('cb_star_' + pos + '_circle');

      var list = shuffle(P4_POS.slice());
      return {
        type: 'P4A', pos: pos, form: form,
        options: list.map(function (p) { return { kind: 'p4star', pos: p }; }),
        correct: list.indexOf(pos),
        audio: [audioKey]
      };
    }

    if (type === 1) {
      // 题型 B：把「正方形书本 / 圆形苹果 / 三角形披萨」拖进正方形
      var bCombos = P4_ITEMS.map(function (it) { return { key: 'B-' + it.id, item: it }; });
      var bPrev = (prev && prev.type === 'P4B') ? 'B-' + prev.item.id : null;
      var item = takeFresh(bCombos, usedPairs, bPrev).item;
      var itemOpts = shuffle(P4_ITEMS.slice());
      return {
        type: 'P4B', item: item,
        options: itemOpts.map(function (it) { return { kind: 'p4item', item: it }; }),
        correct: itemOpts.indexOf(item),
        audio: [item.audio]
      };
    }

    // 题型 C：夸张场景对错
    var cCombos = P4_VERDICTS.map(function (v) { return { key: 'C-' + v.key, v: v }; });
    var cPrev = (prev && prev.type === 'P4C') ? 'C-' + prev.verdict.key : null;
    var verdict = takeFresh(cCombos, usedPairs, cPrev).v;

    state.vFlip = !state.vFlip;
    var truth = state.vFlip;
    var sentence = truth ? verdict.match : verdict.mismatch;

    var opts = shuffle([{ kind: 'yesNo', val: true }, { kind: 'yesNo', val: false }]);
    return {
      type: 'P4C', verdict: verdict, kind: verdict.kind, truth: truth, sentence: sentence,
      options: opts,
      correct: opts[0].val === truth ? 0 : 1,
      audio: [sentence, 'yesno']
    };
  }

function makeQuestionP5(type, prev) {
    if (type === 0) {
      // 题型 A：三个场景（星星在圈上 / 圈里 / 圈后），听 "Where is the star?" + 整句
      var aCombos = P5_POS.map(function (p) { return { key: 'A-' + p, pos: p }; });
      var aPrev = (prev && prev.type === 'P5A') ? 'A-' + prev.pos : null;
      var pos = takeFresh(aCombos, usedPairs, aPrev).pos;
      var list = shuffle(P5_POS.slice());
      return {
        type: 'P5A', pos: pos,
        options: list.map(function (p) { return { kind: 'p5star', pos: p }; }),
        correct: list.indexOf(pos),
        audio: ['p5_where_star', P5_POS_SENT[pos]]
      };
    }

    if (type === 1) {
      // 题型 B：把"圆苹果 / 三角披萨 / 长方书"拖进中央的透明正方形
      var bCombos = P5_ITEMS.map(function (it) { return { key: 'B-' + it.key, item: it }; });
      var bPrev = (prev && prev.type === 'P5B') ? 'B-' + prev.item.key : null;
      var item = takeFresh(bCombos, usedPairs, bPrev).item;
      var itemOpts = shuffle(P5_ITEMS.slice());
      return {
        type: 'P5B', item: item,
        options: itemOpts.map(function (it) { return { kind: 'p5item', item: it }; }),
        correct: itemOpts.indexOf(item),
        audio: [item.audio]
      };
    }

    // 题型 C：夸张场景对错（三角形坐在正方形上 / 圆形在正方形里 / 长方形在正方形后）
    var cCombos = P5_VERDICTS.map(function (v) { return { key: 'C-' + v.key, v: v }; });
    var cPrev = (prev && prev.type === 'P5C') ? 'C-' + prev.verdict.key : null;
    var verdict = takeFresh(cCombos, usedPairs, cPrev).v;

    state.vFlip = !state.vFlip;
    var truth = state.vFlip;
    var sentence = truth ? verdict.match : verdict.mismatch;

    var opts = shuffle([{ kind: 'yesNo', val: true }, { kind: 'yesNo', val: false }]);
    return {
      type: 'P5C', verdict: verdict, kind: verdict.kind, truth: truth, sentence: sentence,
      options: opts,
      correct: opts[0].val === truth ? 0 : 1,
      audio: [sentence, 'yesno']
    };
  }

  var M = window.__LLMakers = window.__LLMakers || {};
  M.makeS1 = makeQuestionS1;
  M.makeP2 = makeQuestionP2;
  M.makeP3 = makeQuestionP3;
  M.makeP4 = makeQuestionP4;
  M.makeP5 = makeQuestionP5;
})();
