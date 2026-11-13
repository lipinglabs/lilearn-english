/* ============================================================
   英语冒险 · 岛 7 出题器（外置）
   ------------------------------------------------------------
   由 index.html 主脚本之后加载。core 通过 window.__LLCore 导出所需符号，
   本文件用同名局部变量取值，因此函数体与原版逐字节相同、未作任何改写。
   ============================================================ */
(function () {
  var L = window.__LLCore || {};
  var G1_PARTS = L.G1_PARTS;
  var G2_PARTS = L.G2_PARTS;
  var G3_A_CASES = L.G3_A_CASES;
  var G3_B_CASES = L.G3_B_CASES;
  var G3_C_CASES = L.G3_C_CASES;
  var G3_THEN_KEY = L.G3_THEN_KEY;
  var G4_A_CASES = L.G4_A_CASES;
  var G4_B_CASES = L.G4_B_CASES;
  var G4_SENT = L.G4_SENT;
  var G5_A_ACTS = L.G5_A_ACTS;
  var G5_B_CASES = L.G5_B_CASES;
  var G5_C_CASES = L.G5_C_CASES;
  var ensureG1Css = L.ensureG1Css;
  var ensureG2Css = L.ensureG2Css;
  var ensureG3Css = L.ensureG3Css;
  var ensureG4Css = L.ensureG4Css;
  var ensureG5Css = L.ensureG5Css;
  var g3CmdKey = L.g3CmdKey;
  var g4Scene = L.g4Scene;
  var g4Scene2 = L.g4Scene2;
  var g4SceneC = L.g4SceneC;
  var g4SceneSig = L.g4SceneSig;
  var pick = L.pick;
  var randInt = L.randInt;
  var shuffle = L.shuffle;

function makeQuestionG1(type, prev) {
    ensureG1Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        var want = pick(G1_PARTS);
        var others = G1_PARTS.filter(function (p) { return p !== want; });
        shuffle(others);
        var optsA = [want].concat(others.slice(0, 2));
        shuffle(optsA);
        q = {
          type: 'G1A', sig: 'A:' + want + ':' + optsA.join(','), part: want,
          options: optsA.map(function (p) { return { kind: 'g1part', part: p }; }),
          correct: optsA.indexOf(want), audio: ['g1_a_' + want]
        };
      } else if (type === 1) {
        var hl = pick(G1_PARTS);
        var rest = G1_PARTS.filter(function (p) { return p !== hl; });
        shuffle(rest);
        var faces = [hl].concat(rest.slice(0, 2));
        shuffle(faces);
        q = {
          type: 'G1B', sig: 'B:' + hl + ':' + faces.join(','), hl: hl,
          options: faces.map(function (p) { return { kind: 'g1face', hl: p }; }),
          correct: faces.indexOf(hl), audio: ['g1_b_' + hl]
        };
      } else {
        var target = pick(G1_PARTS);
        var order = G1_PARTS.slice();
        shuffle(order);
        q = {
          type: 'G1C', sig: 'C:' + target + ':' + order.join(','), part: target,
          options: order.map(function (p) { return { kind: 'g1part', part: p }; }),
          correct: order.indexOf(target), audio: ['g1_c_' + target]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionG2(type, prev) {
    ensureG2Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        var want = pick(G2_PARTS);
        var others = G2_PARTS.filter(function (p) { return p !== want; });
        shuffle(others);
        var optsA = [want].concat(others.slice(0, 2));
        shuffle(optsA);
        q = {
          type: 'G2A', sig: 'A:' + want + ':' + optsA.join(','), part: want,
          options: optsA.map(function (p) { return { kind: 'g2part', part: p }; }),
          correct: optsA.indexOf(want), audio: ['g2_a_' + want]
        };
      } else if (type === 1) {
        var actp = pick(G2_PARTS);
        var bkey = actp === 'head' ? 'g2_b_head' : (actp === 'hand' ? 'g2_t_hand2' : 'g2_t_foot2');
        q = {
          type: 'G2B', sig: 'B:' + actp, act: actp, options: [], correct: 0, audio: [bkey]
        };
      } else {
        var target = pick(G2_PARTS);
        var order = G2_PARTS.slice();
        shuffle(order);
        q = {
          type: 'G2C', sig: 'C:' + target + ':' + order.join(','), part: target,
          options: order.map(function (p) { return { kind: 'g2body', hl: p }; }),
          correct: order.indexOf(target), audio: ['g2_c_' + target]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionG3(type, prev) {
    ensureG3Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        var c = G3_A_CASES[randInt(0, G3_A_CASES.length - 1)];
        q = {
          type: 'G3A', sig: 'A:' + c.a1 + '+' + c.a2, a1: c.a1, a2: c.a2,
          options: [], correct: 0, audio: [g3CmdKey(c.a1, c.a2)]
        };
      } else if (type === 1) {
        var b = G3_B_CASES[randInt(0, G3_B_CASES.length - 1)];
        var acts = shuffle([b.a1, b.a2, b.extra]);
        q = {
          type: 'G3B', sig: 'B:' + b.a1 + '+' + b.a2 + ':' + acts.join(','),
          a1: b.a1, a2: b.a2,
          options: acts.map(function (a) { return { kind: 'g3act', act: a }; }),
          correct: acts.indexOf(b.a1),
          steps: [{ act: b.a1, slot: 'step1' }, { act: b.a2, slot: 'step2' }],
          stepsDone: 0,
          stepAudios: [null, G3_THEN_KEY[b.a2]],
          audio: [g3CmdKey(b.a1, b.a2)]
        };
      } else {
        var cc = G3_C_CASES[randInt(0, G3_C_CASES.length - 1)];
        // 画面顺序 50/50：与语音一致（做对了）或相反（做反了）。
        // 没有语音就无法判断对错——防止孩子不看只听、或干脆无脑点同一个按钮（§三.16）。
        var same = Math.random() < 0.5;
        var pic = same ? [cc.a1, cc.a2] : [cc.a2, cc.a1];
        var opts = shuffle([{ kind: 'yesNo', val: true }, { kind: 'yesNo', val: false }]);
        q = {
          type: 'G3C', sig: 'C:' + cc.a1 + '>' + cc.a2 + ':' + (same ? 'y' : 'n') + ':' + opts.map(function (o) { return o.val ? 'y' : 'n'; }).join(''),
          a1: cc.a1, a2: cc.a2, pic: pic, right: same,
          options: opts, correct: opts[0].val === same ? 0 : 1,
          audio: ['g3_c_' + cc.a1 + '_' + cc.a2, 'g3_c_ask']
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionG4(type, prev) {
    ensureG4Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        var c = G4_A_CASES[randInt(0, G4_A_CASES.length - 1)];
        var scene = g4Scene(4 + randInt(0, 1), c);   // 4–5 人
        var ans = -1;
        scene.forEach(function (k, i) { if (k.kid.gender === c.gender && k.act === c.act) ans = i; });
        q = {
          type: 'G4A', sig: 'A:' + c.gender + '+' + c.act + ':' + g4SceneSig(scene),
          noun: c.gender, act: c.act, kids: scene, answer: ans, correct: ans, options: [],
          audio: [G4_SENT[c.gender + '+' + c.act]]
        };
      } else if (type === 1) {
        var b = G4_B_CASES[randInt(0, G4_B_CASES.length - 1)];
        var sceneB = g4Scene2(5, b.s1, b.s2);
        q = {
          type: 'G4B', sig: 'B:' + b.key + ':' + g4SceneSig(sceneB),
          noun: b.s1.gender, act: b.s1.act,
          steps: [b.s1, b.s2], stepsDone: 0,
          stepAudios: [null, b.then],
          kids: sceneB, answer: -1, correct: -1, options: [],
          audio: [b.key]
        };
      } else {
        var cc = G4_A_CASES[randInt(0, G4_A_CASES.length - 1)];
        var sceneC = g4SceneC(cc);
        var ansC = -1;
        sceneC.forEach(function (k, i) { if (k.act === cc.act) ansC = i; });
        q = {
          type: 'G4C', sig: 'C:' + cc.gender + '+' + cc.act + ':' + g4SceneSig(sceneC),
          noun: cc.gender, act: cc.act, kids: sceneC, answer: ansC, correct: ansC, options: [],
          audio: [G4_SENT[cc.gender + '+' + cc.act]]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionG5(type, prev) {
    ensureG5Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        var a = G5_A_ACTS[randInt(0, G5_A_ACTS.length - 1)];
        q = {
          type: 'G5A', sig: 'A:' + a.act, act: a.act,
          options: [], correct: 0, audio: [a.key]
        };
      } else if (type === 1) {
        var b = G5_B_CASES[randInt(0, G5_B_CASES.length - 1)];
        q = {
          type: 'G5B', sig: 'B:' + b.a1 + '+' + b.a2, a1: b.a1, a2: b.a2,
          options: [], correct: 0, audio: [b.key]
        };
      } else {
        var c = G5_C_CASES[randInt(0, G5_C_CASES.length - 1)];
        var scene = g4Scene(3, c);   // 3 个小人，目标（性别+动作）唯一
        var ans = -1;
        scene.forEach(function (k, i) { if (k.kid.gender === c.gender && k.act === c.act) ans = i; });
        q = {
          type: 'G5C', sig: 'C:' + c.gender + '+' + c.act + ':' + g4SceneSig(scene),
          noun: c.gender, act: c.act, kids: scene, answer: ans, correct: ans,
          options: [], audio: [c.key]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

  var M = window.__LLMakers = window.__LLMakers || {};
  M.makeG1 = makeQuestionG1;
  M.makeG2 = makeQuestionG2;
  M.makeG3 = makeQuestionG3;
  M.makeG4 = makeQuestionG4;
  M.makeG5 = makeQuestionG5;
})();
