/* ============================================================
   英语冒险 · 岛 6 出题器（外置）
   ------------------------------------------------------------
   由 index.html 主脚本之后加载。core 通过 window.__LLCore 导出所需符号，
   本文件用同名局部变量取值，因此函数体与原版逐字节相同、未作任何改写。
   ============================================================ */
(function () {
  var L = window.__LLCore || {};
  var F11_A_CASES = [
      { furn: 'bed',   key: 'l6w1_a_bed' },
      { furn: 'table', key: 'l6w1_a_table' },
      { furn: 'chair', key: 'l6w1_a_chair' },
      { furn: 'sofa',  key: 'l6w1_a_sofa' }
    ];
  var F11_B_CASES = [
      { scene: 'bedSleep',   key: 'l6w1_b_bed' },
      { scene: 'tableApple', key: 'l6w1_b_table' },
      { scene: 'sofaCat',    key: 'l6w1_b_sofa' }
    ];
  var F11_C_CASES = [
      { item: 'pillow', target: 'bed',  key: 'l6w1_c_pillow' },
      { item: 'cat',    target: 'sofa', key: 'l6w1_c_cat' }
    ];
  var F11_FURN = ['bed', 'table', 'chair', 'sofa'];
  var F12_A_CASES = [
      { act: 'watchTV', key: 'l6w2_a_tv' },
      { act: 'read',    key: 'l6w2_a_read' },
      { act: 'bath',    key: 'l6w2_a_bath' },
      { act: 'sleep',   key: 'l6w2_a_sleep' }
    ];
  var F12_B_CASES = [
      { scene: 'bathroom', key: 'l6w2_b_bath' },
      { scene: 'living',   key: 'l6w2_b_tv' },
      { scene: 'bedroom',  key: 'l6w2_b_sleep' }
    ];
  var F12_C_CASES = [
      { item: 'babySleep', target: 'bed', key: 'l6w2_c_sleep' },
      { item: 'babyBath',  target: 'tub', key: 'l6w2_c_bath' }
    ];
  var F13_A_CASES = [
      { scene: [['bed', 'on'], ['sofa', 'on'], ['table', 'under']], furn: 'table', place: 'under', key: 'l6w3_a_under_table' },
      { scene: [['bed', 'under'], ['sofa', 'on'], ['table', 'on']], furn: 'sofa', place: 'on', key: 'l6w3_a_on_sofa' },
      { scene: [['bed', 'under'], ['sofa', 'on'], ['table', 'on']], furn: 'bed', place: 'under', key: 'l6w3_a_under_bed' },
      { scene: [['bed', 'under'], ['sofa', 'under'], ['table', 'on']], furn: 'table', place: 'on', key: 'l6w3_a_on_table' }
    ];
  var F13_B_CASES = [
      { scene: 'onSofa', furn: 'sofa', place: 'on', key: 'l6w3_b_on_sofa' },
      { scene: 'underBed', furn: 'bed', place: 'under', key: 'l6w3_b_under_bed' },
      { scene: 'inBox', furn: 'box', place: 'in', key: 'l6w3_b_in_box' }
    ];
  var F13_C_CASES = [
      { target: 'sofa', key: 'l6w3_c_on_sofa' },
      { target: 'table', key: 'l6w3_c_under_table' }
    ];
  var F14_A_CASES = [
      { items: ['book', 'toy'],  furns: ['bed', 'table'], item: 'book', target: 'bed',   place: 'on',   key: 'l6w4_a_book_bed' },
      { items: ['book', 'ball'], furns: ['bed', 'table'], item: 'book', target: 'table', place: 'on',   key: 'pt_book' },
      { items: ['toy', 'book'],  furns: ['box', 'bed'],   item: 'toy',  target: 'box',   place: 'in',   key: 'l6w4_a_toy_box' },
      { items: ['ball', 'book'], furns: ['table', 'bed'], item: 'ball', target: 'table', place: 'under', key: 'l6w3_c_under_table' }
    ];
  var F14_B_CASES = [
      { target: 'bookBed',   item: 'book', furn: 'bed',   place: 'on',    key: 'l6w4_b_bookbed' },
      { target: 'ballTable', item: 'ball', furn: 'table', place: 'under', key: 'l6w4_b_balltable' },
      { target: 'toyBox',    item: 'toy',  furn: 'box',   place: 'in',    key: 'l6w4_b_toybox' }
    ];
  var F14_C_CASES = [
      { furns: ['bed', 'table', 'box'], items: ['book', 'ball', 'toy'], steps: [['book', 'bed', 'on'], ['ball', 'table', 'under']], s: ['l6w4_c1_s1', 'l6w4_c1_s2'] },
      { furns: ['bed', 'table', 'box'], items: ['book', 'ball', 'toy'], steps: [['toy', 'box', 'in'], ['book', 'table', 'on']],    s: ['l6w4_c2_s1', 'l6w4_c2_s2'] },
      { furns: ['bed', 'table', 'box'], items: ['book', 'ball', 'toy'], steps: [['ball', 'table', 'under'], ['toy', 'box', 'in']], s: ['l6w4_c3_s1', 'l6w4_c3_s2'] },
      { furns: ['bed', 'table', 'box'], items: ['book', 'ball', 'toy'], steps: [['book', 'bed', 'on'], ['toy', 'box', 'in']],      s: ['l6w4_c1_s1', 'l6w4_c3_s2'] }
    ];
  var F15_A_CASES = [
      { items: ['book', 'toy', 'ball'],     furns: ['bed', 'table', 'chair'],   item: 'book',    target: 'bed',       place: 'on',    key: 'l6w4_a_book_bed' },
      { items: ['toy', 'book', 'clothes'],  furns: ['box', 'bed', 'table'],     item: 'toy',     target: 'box',       place: 'in',    key: 'l6w4_a_toy_box' },
      { items: ['clothes', 'toy', 'ball'],  furns: ['bed', 'chair', 'table'],   item: 'clothes', target: 'bed',       place: 'on',    key: 'f15_a_clothes_bed' },
      { items: ['book', 'toy', 'clothes'],  furns: ['bookshelf', 'bed', 'box'], item: 'book',    target: 'bookshelf', place: 'on',    key: 'f15_a_book_shelf' },
      { items: ['ball', 'book', 'toy'],     furns: ['table', 'bed', 'chair'],   item: 'ball',    target: 'table',     place: 'under', key: 'l6w3_c_under_table' },
      { items: ['clothes', 'ball', 'book'], furns: ['chair', 'table', 'box'],   item: 'clothes', target: 'chair',     place: 'on',    key: 'f15_a_clothes_chair' }
    ];
  var F15_B_CASES = [
      { target: 'bookBed',      item: 'book',    furn: 'bed',   place: 'on',    key: 'l6w4_b_bookbed' },
      { target: 'toyBox',       item: 'toy',     furn: 'box',   place: 'in',    key: 'l6w4_b_toybox' },
      { target: 'clothesChair', item: 'clothes', furn: 'chair', place: 'on',    key: 'f15_b_clothes_chair' }
    ];
  var F15_C_CASES = [
      { furns: ['bed', 'table', 'box'],       items: ['book', 'ball', 'toy'],    steps: [['book', 'bed', 'on'], ['ball', 'table', 'under']],       s: ['l6w4_c1_s1', 'l6w4_c1_s2'] },
      { furns: ['bed', 'table', 'box'],       items: ['toy', 'clothes', 'book'], steps: [['toy', 'box', 'in'], ['clothes', 'bed', 'on']],          s: ['l6w4_c2_s1', 'f15_c2_s2'] },
      { furns: ['bed', 'table', 'bookshelf'], items: ['ball', 'book', 'toy'],    steps: [['ball', 'table', 'under'], ['book', 'bookshelf', 'on']],  s: ['l6w4_c3_s1', 'f15_c3_s2'] },
      { furns: ['chair', 'table', 'box'],     items: ['clothes', 'toy', 'ball'], steps: [['clothes', 'chair', 'on'], ['toy', 'box', 'in']],         s: ['f15_c4_s1', 'l6w4_c3_s2'] }
    ];
  var ensureF11Css = L.ensureF11Css;
  var ensureF13Css = L.ensureF13Css;
  var ensureF14Css = L.ensureF14Css;
  var randInt = L.randInt;
  var shuffle = L.shuffle;

function makeQuestionF11(type, prev) {
    ensureF11Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        var a = F11_A_CASES[randInt(0, F11_A_CASES.length - 1)];
        var others = F11_FURN.filter(function (f) { return f !== a.furn; });
        shuffle(others);
        var picks = [a.furn, others[0], others[1]];
        shuffle(picks);
        q = {
          type: 'F11A', sig: 'A:' + picks.join(','),
          subj: a.furn,
          options: picks.map(function (f) { return { kind: 'f11furn', scene: f }; }),
          correct: picks.indexOf(a.furn),
          audio: [a.key]
        };
      } else if (type === 1) {
        var b = F11_B_CASES[randInt(0, F11_B_CASES.length - 1)];
        var scenes = F11_B_CASES.map(function (c) { return c.scene; });
        shuffle(scenes);
        q = {
          type: 'F11B', sig: 'B:' + scenes.join(','),
          subj: b.scene,
          options: scenes.map(function (s) { return { kind: 'f11scene', scene: s }; }),
          correct: scenes.indexOf(b.scene),
          audio: [b.key]
        };
      } else {
        var c = F11_C_CASES[randInt(0, F11_C_CASES.length - 1)];
        var items = ['pillow', 'cat'];
        shuffle(items);
        q = {
          type: 'F11C', sig: 'C:' + c.item + ':' + items.join(','),
          subj: c.item, item: c.item, target: c.target,
          options: items.map(function (it) { return { kind: 'f11item', item: it }; }),
          correct: items.indexOf(c.item),
          audio: [c.key]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionF12(type, prev) {
    ensureF11Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        var a = F12_A_CASES[randInt(0, F12_A_CASES.length - 1)];
        var others = F12_A_CASES.map(function (c) { return c.act; }).filter(function (x) { return x !== a.act; });
        shuffle(others);
        var picks = [a.act, others[0], others[1]];
        shuffle(picks);
        q = {
          type: 'F12A', sig: 'A:' + picks.join(','),
          subj: a.act,
          options: picks.map(function (s) { return { kind: 'f12act', scene: s }; }),
          correct: picks.indexOf(a.act),
          audio: [a.key]
        };
      } else if (type === 1) {
        var b = F12_B_CASES[randInt(0, F12_B_CASES.length - 1)];
        var rooms = F12_B_CASES.map(function (c) { return c.scene; });
        shuffle(rooms);
        q = {
          type: 'F12B', sig: 'B:' + rooms.join(','),
          subj: b.scene,
          options: rooms.map(function (s) { return { kind: 'f12room', scene: s }; }),
          correct: rooms.indexOf(b.scene),
          audio: [b.key]
        };
      } else {
        var c = F12_C_CASES[randInt(0, F12_C_CASES.length - 1)];
        var items = ['babySleep', 'babyBath'];
        shuffle(items);
        q = {
          type: 'F12C', sig: 'C:' + c.item + ':' + items.join(','),
          subj: c.item, item: c.item, target: c.target,
          options: items.map(function (it) { return { kind: 'f12item', item: it }; }),
          correct: items.indexOf(c.item),
          audio: [c.key]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionF13(type, prev) {
    ensureF13Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        var a = F13_A_CASES[randInt(0, F13_A_CASES.length - 1)];
        var balls = a.scene.map(function (p) { return { kind: 'f13ball', furn: p[0], place: p[1] }; });
        q = {
          type: 'F13A', sig: 'A:' + a.furn + ':' + a.place,
          subj: a.furn, furn: a.furn, place: a.place, scene: a.scene,
          options: balls,
          correct: a.scene.findIndex(function (p) { return p[0] === a.furn; }),
          audio: [a.key]
        };
      } else if (type === 1) {
        var b = F13_B_CASES[randInt(0, F13_B_CASES.length - 1)];
        var scenes = F13_B_CASES.slice();
        shuffle(scenes);
        q = {
          type: 'F13B', sig: 'B:' + b.scene + ':' + scenes.map(function (s) { return s.scene; }).join(','),
          subj: b.scene,
          options: scenes.map(function (s) { return { kind: 'f13scene', scene: s.scene, furn: s.furn, place: s.place }; }),
          correct: scenes.findIndex(function (s) { return s.scene === b.scene; }),
          audio: [b.key]
        };
      } else {
        var c = F13_C_CASES[randInt(0, F13_C_CASES.length - 1)];
        q = {
          type: 'F13C', sig: 'C:' + c.target,
          subj: 'ball', item: 'ball', target: c.target,
          options: [{ kind: 'f13item', item: 'ball' }],
          correct: 0,
          audio: [c.key]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionF14(type, prev) {
    ensureF14Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        var a = F14_A_CASES[randInt(0, F14_A_CASES.length - 1)];
        q = {
          type: 'F14A', sig: 'A:' + a.item + ':' + a.target + ':' + a.items.join(',') + ':' + a.furns.join(','),
          subj: a.item, item: a.item, target: a.target, furns: a.furns,
          options: a.items.map(function (it) { return { kind: 'f14item', item: it }; }),
          steps: [{ item: a.item, target: a.target, place: a.place }], stepsDone: 0,
          correct: a.items.indexOf(a.item), audio: [a.key]
        };
      } else if (type === 1) {
        var b = F14_B_CASES[randInt(0, F14_B_CASES.length - 1)];
        var scenes = F14_B_CASES.slice();
        shuffle(scenes);
        q = {
          type: 'F14B', sig: 'B:' + b.target + ':' + scenes.map(function (s) { return s.target; }).join(','),
          subj: b.target,
          options: scenes.map(function (s) { return { kind: 'f14scene', item: s.item, furn: s.furn, place: s.place, target: s.target }; }),
          correct: scenes.findIndex(function (s) { return s.target === b.target; }),
          audio: [b.key]
        };
      } else {
        var c = F14_C_CASES[randInt(0, F14_C_CASES.length - 1)];
        q = {
          type: 'F14C', sig: 'C:' + c.steps.map(function (s) { return s[0] + '_' + s[1]; }).join('+'),
          subj: 'tasks', furns: c.furns, items: c.items,
          options: c.items.map(function (it) { return { kind: 'f14item', item: it }; }),
          steps: c.steps.map(function (s) { return { item: s[0], target: s[1], place: s[2] }; }),
          stepsDone: 0, stepAudio: (function (ss) { return function (i) { return ss[i]; }; })(c.s),
          stepAudios: c.s,
          correct: 0, audio: [c.s[0]]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionF15(type, prev) {
    ensureF14Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        var a = F15_A_CASES[randInt(0, F15_A_CASES.length - 1)];
        q = {
          type: 'F15A', sig: 'A:' + a.item + ':' + a.target + ':' + a.items.join(',') + ':' + a.furns.join(','),
          subj: a.item, item: a.item, target: a.target, furns: a.furns,
          options: a.items.map(function (it) { return { kind: 'f14item', item: it }; }),
          steps: [{ item: a.item, target: a.target, place: a.place }], stepsDone: 0,
          correct: a.items.indexOf(a.item), audio: [a.key]
        };
      } else if (type === 1) {
        var b = F15_B_CASES[randInt(0, F15_B_CASES.length - 1)];
        var scenes = F15_B_CASES.slice();
        shuffle(scenes);
        q = {
          type: 'F15B', sig: 'B:' + b.target + ':' + scenes.map(function (s) { return s.target; }).join(','),
          subj: b.target,
          options: scenes.map(function (s) { return { kind: 'f14scene', item: s.item, furn: s.furn, place: s.place, target: s.target }; }),
          correct: scenes.findIndex(function (s) { return s.target === b.target; }),
          audio: [b.key]
        };
      } else {
        var c = F15_C_CASES[randInt(0, F15_C_CASES.length - 1)];
        q = {
          type: 'F15C', sig: 'C:' + c.steps.map(function (s) { return s[0] + '_' + s[1]; }).join('+'),
          subj: 'tasks', furns: c.furns, items: c.items,
          options: c.items.map(function (it) { return { kind: 'f14item', item: it }; }),
          steps: c.steps.map(function (s) { return { item: s[0], target: s[1], place: s[2] }; }),
          stepsDone: 0, stepAudio: (function (ss) { return function (i) { return ss[i]; }; })(c.s),
          stepAudios: c.s,
          correct: 0, audio: [c.s[0]]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

  var M = window.__LLMakers = window.__LLMakers || {};
  M.makeF11 = makeQuestionF11;
  M.makeF12 = makeQuestionF12;
  M.makeF13 = makeQuestionF13;
  M.makeF14 = makeQuestionF14;
  M.makeF15 = makeQuestionF15;
})();
