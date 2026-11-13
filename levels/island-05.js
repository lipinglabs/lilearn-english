/* ============================================================
   英语冒险 · 岛 5 出题器（外置）
   ------------------------------------------------------------
   由 index.html 主脚本之后加载。core 通过 window.__LLCore 导出所需符号，
   本文件用同名局部变量取值，因此函数体与原版逐字节相同、未作任何改写。
   ============================================================ */
(function () {
  var L = window.__LLCore || {};
  var F10_A_CASES = L.F10_A_CASES;
  var F10_B_STATES = L.F10_B_STATES;
  var F10_C_UTENSILS = L.F10_C_UTENSILS;
  var F6_A_CASES = L.F6_A_CASES;
  var F6_B_CASES = L.F6_B_CASES;
  var F6_C_CASES = L.F6_C_CASES;
  var F7_A_CASES = L.F7_A_CASES;
  var F7_B_CASES = L.F7_B_CASES;
  var F7_C_CASES = L.F7_C_CASES;
  var F7_C_ITEMS = L.F7_C_ITEMS;
  var F8_ACTS = L.F8_ACTS;
  var F8_A_CASES = L.F8_A_CASES;
  var F8_B_CASES = L.F8_B_CASES;
  var F8_C_CASES = L.F8_C_CASES;
  var F9_A_STATES = L.F9_A_STATES;
  var F9_B_CASES = L.F9_B_CASES;
  var F9_C_SCENES = L.F9_C_SCENES;
  var ensureF6Css = L.ensureF6Css;
  var ensureF7Css = L.ensureF7Css;
  var ensureF8Css = L.ensureF8Css;
  var ensureF9Css = L.ensureF9Css;
  var f6Distract = L.f6Distract;
  var f7Distract = L.f7Distract;
  var f8Distract = L.f8Distract;
  var randInt = L.randInt;
  var shuffle = L.shuffle;

function makeQuestionF6(type, prev) {
    ensureF6Css();
    var q, guard = 0;
    do {
      if (type === 0 || type === 1) {
        var c = (type === 0 ? F6_A_CASES : F6_B_CASES)[randInt(0, 3)];
        var list = [c.food].concat(f6Distract(c.food, 2));
        shuffle(list);
        var optsAB = list.map(function (f) { return { kind: 'f6food', food: f }; });
        q = {
          type: type === 0 ? 'F6A' : 'F6B',
          sig: (type === 0 ? 'A:' : 'B:') + c.key,
          food: c.food, subj: c.food,
          options: optsAB, correct: list.indexOf(c.food),
          audio: [c.key]
        };
      } else {
        var cc = F6_C_CASES[randInt(0, 3)];
        var listC = [cc.food].concat(f6Distract(cc.food, 2));
        shuffle(listC);
        var optsC = listC.map(function (f) { return { kind: 'f6food', food: f }; });
        q = {
          type: 'F6C', sig: 'C:' + cc.key,
          food: cc.food, subj: cc.food,
          options: optsC, correct: listC.indexOf(cc.food),
          audio: [cc.key]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionF7(type, prev) {
    ensureF7Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        var c = F7_A_CASES[randInt(0, F7_A_CASES.length - 1)];
        var list = [c.item].concat(f7Distract(c.item, 2));
        shuffle(list);
        q = {
          type: 'F7A', sig: 'A:' + c.key,
          utensil: c.item, subj: c.item,
          options: list.map(function (f) { return { kind: 'f7item', item: f }; }),
          correct: list.indexOf(c.item),
          audio: [c.key]
        };
      } else if (type === 1) {
        var b = F7_B_CASES[randInt(0, F7_B_CASES.length - 1)];
        var rest = F7_B_CASES.filter(function (x) { return x.scene !== b.scene; });
        shuffle(rest);
        var scenes = [b.scene].concat(rest.slice(0, 2).map(function (x) { return x.scene; }));
        shuffle(scenes);
        q = {
          type: 'F7B', sig: 'B:' + b.key,
          scene: b.scene, subj: b.scene,
          options: scenes.map(function (s) { return { kind: 'f7scene', scene: s }; }),
          correct: scenes.indexOf(b.scene),
          audio: [b.key]
        };
      } else {
        var cc = F7_C_CASES[randInt(0, F7_C_CASES.length - 1)];
        var listC = F7_C_ITEMS.slice();     // 碗当容器，所以三件餐具全上
        shuffle(listC);
        q = {
          type: 'F7C', sig: 'C:' + cc.key,
          utensil: cc.item, subj: cc.item,
          options: listC.map(function (f) { return { kind: 'f7item', item: f }; }),
          correct: listC.indexOf(cc.item),
          audio: [cc.key]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionF8(type, prev) {
    ensureF8Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        var c = F8_A_CASES[randInt(0, F8_A_CASES.length - 1)];
        var list = [c.scene].concat(f8Distract(c.scene, 2));
        shuffle(list);
        q = {
          type: 'F8A', sig: 'A:' + c.key,
          scene: c.scene, subj: c.scene,
          options: list.map(function (f) { return { kind: 'f8kid', scene: f }; }),
          correct: list.indexOf(c.scene),
          audio: [c.key]
        };
      } else if (type === 1) {
        var b = F8_B_CASES[randInt(0, F8_B_CASES.length - 1)];
        var rest = F8_ACTS.filter(function (x) { return x !== b.answer; });
        shuffle(rest);
        var faces = [b.answer].concat(rest.slice(0, 2));
        shuffle(faces);
        q = {
          type: 'F8B', sig: 'B:' + b.key,
          situation: b.situation, answer: b.answer, subj: b.answer,
          options: faces.map(function (f) { return { kind: 'f8kid', scene: f }; }),
          correct: faces.indexOf(b.answer),
          audio: [b.key]
        };
      } else {
        var cc = F8_C_CASES[randInt(0, F8_C_CASES.length - 1)];
        var pair = [cc.food, cc.other];
        shuffle(pair);
        q = {
          type: 'F8C', sig: 'C:' + cc.key,
          food: cc.food, box: cc.box, subj: cc.food,
          options: pair.map(function (f) { return { kind: 'f8food', food: f }; }),
          correct: pair.indexOf(cc.food),
          audio: [cc.key]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionF9(type, prev) {
    ensureF9Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        var states = F9_A_STATES.slice();
        shuffle(states);
        q = {
          type: 'F9A', sig: 'A:' + states.join(','),
          subj: 'hungry',
          options: states.map(function (s) { return { kind: 'f9scene', scene: s }; }),
          correct: states.indexOf('hungry'),
          audio: ['l5w4_a']
        };
      } else if (type === 1) {
        var b = F9_B_CASES[randInt(0, F9_B_CASES.length - 1)];
        var foods = ['bread', 'milk', 'apple'];
        shuffle(foods);
        q = {
          type: 'F9B', sig: 'B:' + b.food,
          subj: b.food, food: b.food,
          options: foods.map(function (f) { return { kind: 'f9food', food: f }; }),
          correct: foods.indexOf(b.food),
          audio: [b.key]
        };
      } else {
        var dlg = F9_C_SCENES.slice();
        shuffle(dlg);
        q = {
          type: 'F9C', sig: 'C:' + dlg.join(','),
          subj: 'giveApple',
          options: dlg.map(function (s) { return { kind: 'f9scene', scene: s }; }),
          correct: dlg.indexOf('giveApple'),
          audio: ['l5w4_c']
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionF10(type, prev) {
    ensureF9Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        var a = F10_A_CASES[randInt(0, F10_A_CASES.length - 1)];
        var afoods = ['bread', 'milk', 'apple'];
        shuffle(afoods);
        q = {
          type: 'F10A', sig: 'A:' + a.food,
          subj: a.food, food: a.food,
          options: afoods.map(function (f) { return { kind: 'f10food', food: f }; }),
          correct: afoods.indexOf(a.food),
          audio: [a.key]
        };
      } else if (type === 1) {
        var bs = F10_B_STATES.slice();
        shuffle(bs);
        q = {
          type: 'F10B', sig: 'B:' + bs.join(','),
          subj: 'more',
          options: bs.map(function (s) { return { kind: 'f10scene', scene: s }; }),
          correct: bs.indexOf('more'),
          audio: ['l5w5_b']
        };
      } else {
        var us = F10_C_UTENSILS.slice();
        shuffle(us);
        q = {
          type: 'F10C', sig: 'C:' + us.join(','),
          subj: 'spoon', utensil: 'spoon',
          options: us.map(function (u) { return { kind: 'f10utensil', utensil: u }; }),
          correct: us.indexOf('spoon'),
          audio: ['l5w5_c']
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

  var M = window.__LLMakers = window.__LLMakers || {};
  M.makeF6 = makeQuestionF6;
  M.makeF7 = makeQuestionF7;
  M.makeF8 = makeQuestionF8;
  M.makeF9 = makeQuestionF9;
  M.makeF10 = makeQuestionF10;
})();
