/* ============================================================
   英语冒险 · 岛 13 出题器（字母与首音 A–Z）
   ------------------------------------------------------------
   主脚本之后加载。数据（26 个字母 / 五关分组 / 语音 key 映射）全部来自
   window.__LLCore，本文件只负责组题，不复制任何字母表。

   题型与 12-2 完全一致（孩子已经会操作）：
     A 听音找字母（三张卡，点出读该音的）
     B 听音找物品（三个物品，点出以该音开头的）
     C 拖拽配对（把物品拖到它开头的字母旁边）

   防背题（RULES §三.28）：A/B 的正确位置不与上一轮相同；C 抽到的物品不与上一轮相同。
   ============================================================ */
(function () {
  var L = window.__LLCore || {};
  var L13_BY_CH = L.L13_BY_CH || {};
  var L13_GROUPS = L.L13_GROUPS || [];
  var pick = L.pick;
  var shuffle = L.shuffle;
  var audio = L.l13Audio;

  var LAST = { A: -1, B: -1, C: '' };

  function groupOf(level) {
    var i = level - 1;
    if (i < 0) i = 0;
    if (i >= L13_GROUPS.length) i = L13_GROUPS.length - 1;
    return L13_GROUPS[i] || [];
  }

  function wordsOf(g) {
    return g.map(function (ch) { return L13_BY_CH[ch].word; });
  }

  function defOfWord(g, word) {
    for (var i = 0; i < g.length; i++) {
      if (L13_BY_CH[g[i]] && L13_BY_CH[g[i]].word === word) return L13_BY_CH[g[i]];
    }
    return null;
  }

  /** 洗牌直到「答案不在上一轮那个位置」（最多试 8 次，防止小池子死循环） */
  function shuffleAvoid(list, want, prevAns) {
    var a = shuffle(list.slice());
    for (var k = 0; k < 8 && a.indexOf(want) === prevAns; k++) a = shuffle(list.slice());
    return a;
  }

  function makeL13(level, type, prev) {
    var g = groupOf(level);
    var words = wordsOf(g);
    var q, guard = 0;
    do {
      if (type === 0) {
        /* A：听音找字母 */
        var ch = pick(g);
        var aOthers = shuffle(g.filter(function (x) { return x !== ch; })).slice(0, 2);
        var aItems = shuffleAvoid([ch].concat(aOthers), ch, LAST.A);
        LAST.A = aItems.indexOf(ch);
        q = {
          type: 'L13A', target: ch, items: aItems, answer: LAST.A, options: [],
          word: L13_BY_CH[ch].word,
          audio: [audio(L13_BY_CH[ch], 'qa')]
        };
      } else if (type === 1) {
        /* B：听音找物品 */
        var bw = pick(words);
        var bDef = defOfWord(g, bw);
        var bOthers = shuffle(words.filter(function (w) { return w !== bw; })).slice(0, 2);
        var bItems = shuffleAvoid([bw].concat(bOthers), bw, LAST.B);
        LAST.B = bItems.indexOf(bw);
        q = {
          type: 'L13B', target: bDef.ch, items: bItems, answer: LAST.B, options: [],
          word: bw,
          audio: [audio(bDef, 'qb')]
        };
      } else {
        /* C：拖拽配对（3 个字母槽 + 3 个物品，只要求投放其中一个） */
        var cw = pick(words);
        for (var cg = 0; cg < 8 && cw === LAST.C; cg++) cw = pick(words);
        LAST.C = cw;
        var cDef = defOfWord(g, cw);
        var slotRest = shuffle(g.filter(function (x) { return x !== cDef.ch; })).slice(0, 2);
        var slots = shuffle([cDef.ch].concat(slotRest));
        var trayRest = shuffle(words.filter(function (w) { return w !== cw; })).slice(0, 2);
        var tray = shuffle([cw].concat(trayRest));
        q = {
          type: 'L13C', pick: cw, slots: slots, tray: tray, answer: 0, options: [],
          word: cw,
          audio: [audio(cDef, 'qc')]
        };
      }
      guard += 1;
    } while (prev && prev.type === q.type && prev.audio && q.audio &&
             prev.audio[0] === q.audio[0] && guard < 30);
    return q;
  }

  function makerFor(level) {
    return function (type, prev) { return makeL13(level, type, prev); };
  }

  var M = window.__LLMakers = window.__LLMakers || {};
  M.makeL131 = makerFor(1);
  M.makeL132 = makerFor(2);
  M.makeL133 = makerFor(3);
  M.makeL134 = makerFor(4);
  M.makeL135 = makerFor(5);
})();
