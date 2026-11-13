/* ============================================================
   英语冒险 · 岛 3 出题器（外置）
   ------------------------------------------------------------
   由 index.html 主脚本之后加载。core 通过 window.__LLCore 导出所需符号，
   本文件用同名局部变量取值，因此函数体与原版逐字节相同、未作任何改写。
   ============================================================ */
(function () {
  var L = window.__LLCore || {};
  var B1_ANIMALS = L.B1_ANIMALS;
  var B1_ITEMS = L.B1_ITEMS;
  var B2_FRUITS_A = L.B2_FRUITS_A;
  var B2_FRUITS_B = L.B2_FRUITS_B;
  var B2_FRUITS_C = L.B2_FRUITS_C;
  var B4_A_CASES = L.B4_A_CASES;
  var B4_B_CASES = L.B4_B_CASES;
  var B4_C_CASES = L.B4_C_CASES;
  var B5X_A_CASES = L.B5X_A_CASES;
  var B5X_B_CASES = L.B5X_B_CASES;
  var B5X_C_CASES = L.B5X_C_CASES;
  var B5X_SCENES = L.B5X_SCENES;
  var b1IndexOfSize = L.b1IndexOfSize;
  var b1Sentence = L.b1Sentence;
  var b2CmpIndex = L.b2CmpIndex;
  var ensureB4Css = L.ensureB4Css;
  var ensureB5xCss = L.ensureB5xCss;
  var pick = L.pick;
  var randInt = L.randInt;
  var shuffle = L.shuffle;
  var takeFresh = L.takeFresh;
  var usedPairs = L.usedPairs;

function makeQuestionB1(type, prev) {
    if (type === 0) {
      // 题型 A：一大一小两个相同物品，听 "Find the big car." 点大的那个
      var aCombos = [];
      B1_ITEMS.forEach(function (it) {
        aCombos.push({ key: 'A-' + it.id + '-big', item: it, size: 'big' });
        aCombos.push({ key: 'A-' + it.id + '-small', item: it, size: 'small' });
      });
      var aPrev = (prev && prev.type === 'B1A') ? 'A-' + prev.item.id + '-' + prev.size : null;
      var pickA = takeFresh(aCombos, usedPairs, aPrev);
      var aOpts = shuffle([
        { kind: 'bsItem', asset: pickA.item.asset, size: 'big' },
        { kind: 'bsItem', asset: pickA.item.asset, size: 'small' }
      ]);
      return {
        type: 'B1A', item: pickA.item, size: pickA.size,
        options: aOpts,
        correct: b1IndexOfSize(aOpts, pickA.size),
        audio: [pickA.size === 'big' ? pickA.item.big : pickA.item.small]
      };
    }

    if (type === 1) {
      // 题型 B：三只动物，只有一只与指令里的大小一致
      //   例："The elephant is big." + "The cat is small." + "Find the big one." → 点大象
      var bCombos = [];
      B1_ANIMALS.forEach(function (an) {
        bCombos.push({ key: 'B-' + an.id + '-big', animal: an, size: 'big' });
        bCombos.push({ key: 'B-' + an.id + '-small', animal: an, size: 'small' });
      });
      var bPrev = (prev && prev.type === 'B1B') ? 'B-' + prev.animal.id + '-' + prev.size : null;
      var pickB = takeFresh(bCombos, usedPairs, bPrev);
      var othersB = shuffle(B1_ANIMALS.filter(function (a) { return a.id !== pickB.animal.id; })).slice(0, 2);
      var opp = pickB.size === 'big' ? 'small' : 'big';
      var bOpts = shuffle([
        { kind: 'bsAnimal', animal: pickB.animal, size: pickB.size },
        { kind: 'bsAnimal', animal: othersB[0], size: opp },
        { kind: 'bsAnimal', animal: othersB[1], size: opp }
      ]);
      return {
        type: 'B1B', animal: pickB.animal, size: pickB.size,
        options: bOpts,
        correct: bOpts.indexOf(bOpts.filter(function (o) {
          return o.animal.id === pickB.animal.id && o.size === pickB.size;
        })[0]),
        audio: [
          b1Sentence(pickB.animal, pickB.size),
          b1Sentence(othersB[0], opp),
          pickB.size === 'big' ? 'l3_find_big_one' : 'l3_find_small_one'
        ]
      };
    }

    // 题型 C：大箱子 / 小箱子分类，把对应大小的物品拖进同尺寸的箱子
    var cCombos = [];
    B1_ITEMS.filter(function (it) { return it.putBig; }).forEach(function (it) {
      cCombos.push({ key: 'C-' + it.id + '-big', item: it, size: 'big' });
      cCombos.push({ key: 'C-' + it.id + '-small', item: it, size: 'small' });
    });
    var cPrev = (prev && prev.type === 'B1C') ? 'C-' + prev.item.id + '-' + prev.size : null;
    var pickC = takeFresh(cCombos, usedPairs, cPrev);
    var cOpts = shuffle([
      { kind: 'bsDrag', asset: pickC.item.asset, size: 'big' },
      { kind: 'bsDrag', asset: pickC.item.asset, size: 'small' }
    ]);
    return {
      type: 'B1C', item: pickC.item, size: pickC.size,
      options: cOpts,
      correct: b1IndexOfSize(cOpts, pickC.size),
      audio: [pickC.size === 'big' ? pickC.item.putBig : pickC.item.putSmall]
    };
  }

function makeQuestionB2(type, prev) {
    if (type === 0) {
      // 题型 A：两堆相同水果，听 "Which one has more / less <果>?" 点对应堆
      var aCombos = [];
      B2_FRUITS_A.forEach(function (f) {
        aCombos.push({ key: 'A|' + f.id + '|more', fruit: f, cmp: 'more' });
        aCombos.push({ key: 'A|' + f.id + '|less', fruit: f, cmp: 'less' });
      });
      var aPrev = (prev && prev.type === 'B2A') ? ('A|' + prev.fruit.id + '|' + prev.cmp) : null;
      var pickA = takeFresh(aCombos, usedPairs, aPrev);
      var moreCount = pick([5, 6, 7, 8]);
      var lessCount = pick([1, 2, 3]);
      var aOpts = shuffle([
        { kind: 'b2Pile', fruit: pickA.fruit, count: moreCount, cmp: 'more' },
        { kind: 'b2Pile', fruit: pickA.fruit, count: lessCount, cmp: 'less' }
      ]);
      return {
        type: 'B2A', fruit: pickA.fruit, cmp: pickA.cmp,
        moreCount: moreCount, lessCount: lessCount,
        options: aOpts,
        correct: b2CmpIndex(aOpts, pickA.cmp),
        audio: [pickA.cmp === 'more' ? 'l3w2a_more_' + pickA.fruit.id : 'l3w2a_less_' + pickA.fruit.id]
      };
    }

    if (type === 1) {
      // 题型 B：三堆不同水果，听 "Find the group with less <果>"，点那一堆
      //   （被点名的水果就是数量最少的那一堆，符合"点少的那堆"设计）
      var bCombos = [];
      B2_FRUITS_B.forEach(function (f) { bCombos.push({ key: 'B|' + f.id, fruit: f }); });
      var bPrev = (prev && prev.type === 'B2B') ? ('B|' + prev.fruit.id) : null;
      var pickB = takeFresh(bCombos, usedPairs, bPrev);
      var others = shuffle(B2_FRUITS_B.filter(function (f) { return f.id !== pickB.fruit.id; })).slice(0, 2);
      var tCount = pick([1, 2, 3]);
      var oCounts = shuffle([6, 7, 8]).slice(0, 2);
      var bOpts = shuffle([
        { kind: 'b2Pile', fruit: pickB.fruit, count: tCount, cmp: 'less' },
        { kind: 'b2Pile', fruit: others[0], count: oCounts[0], cmp: 'more' },
        { kind: 'b2Pile', fruit: others[1], count: oCounts[1], cmp: 'more' }
      ]);
      return {
        type: 'B2B', fruit: pickB.fruit,
        options: bOpts,
        correct: bOpts.indexOf(bOpts.filter(function (o) { return o.fruit.id === pickB.fruit.id; })[0]),
        audio: ['l3w2b_less_' + pickB.fruit.id]
      };
    }

    // 题型 C：两堆相同水果（多 / 少），拖进 More / Less 箱分类
    var cCombos = [];
    B2_FRUITS_C.forEach(function (f) {
      cCombos.push({ key: 'C|' + f.id + '|more', fruit: f, cmp: 'more' });
      cCombos.push({ key: 'C|' + f.id + '|less', fruit: f, cmp: 'less' });
    });
    var cPrev = (prev && prev.type === 'B2C') ? ('C|' + prev.fruit.id + '|' + prev.cmp) : null;
    var pickC = takeFresh(cCombos, usedPairs, cPrev);
    var cmp = pickC.cmp;
    var cMore = pick([5, 6, 7, 8]);
    var cLess = pick([1, 2, 3]);
    var cOpts = shuffle([
      { kind: 'b2Drag', fruit: pickC.fruit, count: cMore, cmp: 'more' },
      { kind: 'b2Drag', fruit: pickC.fruit, count: cLess, cmp: 'less' }
    ]);
    return {
      type: 'B2C', fruit: pickC.fruit, cmp: cmp,
      moreCount: cMore, lessCount: cLess,
      options: cOpts,
      correct: b2CmpIndex(cOpts, cmp),
      audio: ['l3w2c_' + cmp + '_' + pickC.fruit.id]
    };
  }

function makeQuestionB3(type, prev) {
    if (type === 0) {
      // 题型 A：两样相同物品（一长一短），听 "Find the long/short <物>" 点对应
      var objs = ['snake', 'rope', 'pencil', 'bread', 'scarf', 'car'];
      var aCombos = objs.map(function (k) { return { key: 'A|' + k, obj: k }; });
      var aPrev = (prev && prev.type === 'B3A') ? ('A|' + prev.obj) : null;
      var pickA = takeFresh(aCombos, usedPairs, aPrev);
      var cmp = pick(['long', 'short']);
      var aOpts = shuffle([
        { kind: 'lsObj', obj: pickA.obj, cmp: 'long' },
        { kind: 'lsObj', obj: pickA.obj, cmp: 'short' }
      ]);
      return {
        type: 'B3A', obj: pickA.obj, cmp: cmp,
        options: aOpts,
        correct: aOpts.indexOf(aOpts.filter(function (o) { return o.cmp === cmp; })[0]),
        audio: ['l3w3a_' + cmp + '_' + pickA.obj]
      };
    }

    if (type === 1) {
      // 题型 B：三只动物（长颈鹿/兔子/乌龟），听短句找「长」的那只
      var scenes = [
        { id: 'giraffe', word: 'l3w3b_long_giraffe' },
        { id: 'rabbit',  word: 'l3w3b_long_rabbit' }
      ];
      var bPrev = (prev && prev.type === 'B3B') ? ('B|' + prev.animal) : null;
      var pickScene = takeFresh(scenes.map(function (s) {
        return { key: 'B|' + s.id, id: s.id, word: s.word };
      }), usedPairs, bPrev);
      var others = shuffle(['giraffe', 'rabbit', 'turtle'].filter(function (a) { return a !== pickScene.id; })).slice(0, 2);
      var bOpts = shuffle([
        { kind: 'lsAnimal', animal: pickScene.id },
        { kind: 'lsAnimal', animal: others[0] },
        { kind: 'lsAnimal', animal: others[1] }
      ]);
      return {
        type: 'B3B', animal: pickScene.id,
        options: bOpts,
        correct: bOpts.indexOf(bOpts.filter(function (o) { return o.animal === pickScene.id; })[0]),
        audio: [pickScene.word]
      };
    }

    // 题型 C：长香蕉 / 短香蕉，拖进 Long / Short 箱分类
    var cCombos = ['long', 'short'].map(function (c) { return { key: 'C|' + c, cmp: c }; });
    var cPrev = (prev && prev.type === 'B3C') ? ('C|' + prev.cmp) : null;
    var pickC = takeFresh(cCombos, usedPairs, cPrev);
    var cOpts = shuffle([
      { kind: 'b3Drag', obj: 'banana', cmp: 'long' },
      { kind: 'b3Drag', obj: 'banana', cmp: 'short' }
    ]);
    return {
      type: 'B3C', obj: 'banana', cmp: pickC.cmp,
      options: cOpts,
      correct: cOpts.indexOf(cOpts.filter(function (o) { return o.cmp === pickC.cmp; })[0]),
      audio: ['l3w3c_' + pickC.cmp + '_banana']
    };
  }

function makeQuestionB4(type, prev) {
    ensureB4Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        var a = B4_A_CASES[randInt(0, B4_A_CASES.length - 1)];
        var opts = a.items.map(function (it) { return { kind: 'b4item', item: it }; });
        shuffle(opts);
        var correct = opts.map(function (o) { return o.item; }).indexOf(a.ans);
        q = {
          type: 'B4A', sig: 'A:' + a.weight + ':' + opts.map(function (o) { return o.item; }).join(','),
          weight: a.weight, options: opts, correct: correct, audio: [a.key]
        };
      } else if (type === 1) {
        var b = B4_B_CASES[randInt(0, B4_B_CASES.length - 1)];
        var bo = [{ kind: 'b4item', item: b.left }, { kind: 'b4item', item: b.right }];
        var bcorrect = (b.ask === 'heavy') ? 0 : 1;   // 左=重、右=轻
        q = {
          type: 'B4B', sig: 'B:' + b.left + '_' + b.right + ':' + b.ask,
          ask: b.ask, options: bo, correct: bcorrect, audio: [b.key]
        };
      } else {
        var c = B4_C_CASES[randInt(0, B4_C_CASES.length - 1)];
        var co = c.items.map(function (it) { return { kind: 'b4item', item: it }; });
        shuffle(co);
        q = {
          type: 'B4C', sig: 'C:' + c.ansItem + ':' + c.ansBox,
          ansItem: c.ansItem, ansBox: c.ansBox, options: co,
          correct: co.map(function (o) { return o.item; }).indexOf(c.ansItem),
          audio: [c.key]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionB5(type, prev) {
    ensureB5xCss();
    var q, guard = 0;
    do {
      if (type === 0) {
        var a = B5X_A_CASES[randInt(0, B5X_A_CASES.length - 1)];
        var opts = a.items.map(function (it) { return { kind: 'b5xitem', item: it }; });
        shuffle(opts);
        q = {
          type: 'B5A',
          sig: 'A:' + a.cmp + ':' + opts.map(function (o) { return o.item; }).join(','),
          cmp: a.cmp,
          options: opts,
          correct: opts.map(function (o) { return o.item; }).indexOf(a.ans),
          audio: [a.key]
        };
      } else if (type === 1) {
        var b = B5X_B_CASES[randInt(0, B5X_B_CASES.length - 1)];
        var sc = B5X_SCENES.slice();
        shuffle(sc);
        q = {
          type: 'B5B',
          sig: 'B:' + b.ansScene + ':' + sc.join(','),
          ansScene: b.ansScene,
          options: sc.map(function (s) { return { kind: 'b5xscene', scene: s }; }),
          correct: sc.indexOf(b.ansScene),
          audio: [b.key]
        };
      } else {
        var c = B5X_C_CASES[randInt(0, B5X_C_CASES.length - 1)];
        var co = c.items.map(function (it) { return { kind: 'b5xitem', item: it }; });
        shuffle(co);
        q = {
          type: 'B5C',
          sig: 'C:' + co.map(function (o) { return o.item; }).join(',') + ':' + c.ansBox,
          ansItem: c.ansItem, ansBox: c.ansBox,
          options: co,
          correct: co.map(function (o) { return o.item; }).indexOf(c.ansItem),
          audio: [c.key]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

  var M = window.__LLMakers = window.__LLMakers || {};
  M.makeB1 = makeQuestionB1;
  M.makeB2 = makeQuestionB2;
  M.makeB3 = makeQuestionB3;
  M.makeB4 = makeQuestionB4;
  M.makeB5 = makeQuestionB5;
})();
