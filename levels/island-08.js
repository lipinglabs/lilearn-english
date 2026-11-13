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
  var G3_A_CASES = [
      { a1: 'ears', a2: 'clap' },
      { a1: 'head', a2: 'stomp' },
      { a1: 'nose', a2: 'jump' },
      { a1: 'eyes', a2: 'clap' }
    ];
  var G3_B_CASES = [
      { a1: 'nose', a2: 'clap', extra: 'jump' },
      { a1: 'head', a2: 'stomp', extra: 'clap' },
      { a1: 'eyes', a2: 'jump', extra: 'stomp' },
      { a1: 'ears', a2: 'clap', extra: 'stomp' }
    ];
  var G3_C_CASES = [
      { a1: 'head', a2: 'nose' },
      { a1: 'nose', a2: 'head' },
      { a1: 'ears', a2: 'nose' },
      { a1: 'nose', a2: 'ears' },
      { a1: 'head', a2: 'ears' },
      { a1: 'ears', a2: 'head' }
    ];
  var G3_THEN_KEY = { clap: 'g3_then_clap', stomp: 'g3_then_stomp', jump: 'g3_then_jump' };
  var G4_A_CASES = [
      { gender: 'boy', act: 'ear' }, { gender: 'girl', act: 'clap' },
      { gender: 'boy', act: 'stomp' }, { gender: 'girl', act: 'jump' },
      { gender: 'boy', act: 'nose' }, { gender: 'girl', act: 'eyes' },
      { gender: 'boy', act: 'head' }, { gender: 'girl', act: 'ear' }
    ];
  var G4_B_CASES = [
      { s1: { gender: 'boy', act: 'nose' }, s2: { gender: 'girl', act: 'jump' }, key: 'g4_b1', then: 'g4_b1_then' },
      { s1: { gender: 'girl', act: 'ear' }, s2: { gender: 'boy', act: 'clap' }, key: 'g4_b2', then: 'g4_b2_then' },
      { s1: { gender: 'boy', act: 'head' }, s2: { gender: 'girl', act: 'stomp' }, key: 'g4_b3', then: 'g4_b3_then' },
      { s1: { gender: 'girl', act: 'eyes' }, s2: { gender: 'boy', act: 'jump' }, key: 'g4_b4', then: 'g4_b4_then' }
    ];
  var G4_SENT = {
      'boy+ear': 'g4_t_ear', 'girl+clap': 'g4_t_clap',
      'boy+stomp': 'g4_a_boy_stomp', 'girl+jump': 'g4_a_girl_jump',
      'boy+nose': 'g4_a_boy_nose', 'girl+eyes': 'g4_a_girl_eyes',
      'boy+head': 'g4_a_boy_head', 'girl+ear': 'g4_a_girl_ear'
    };
  var G5_A_ACTS = [
      { act: 'clap', key: 'g2_t_hand2' }, { act: 'stomp', key: 'g2_t_foot2' },
      { act: 'jump', key: 'g5_a_jump' },   { act: 'head', key: 'g2_b_head' },
      { act: 'nose', key: 'g1_c_nose' },   { act: 'ears', key: 'g5_a_ears' },
      { act: 'eyes', key: 'g5_a_eyes' }
    ];
  var G5_B_CASES = [
      { a1: 'head', a2: 'clap', key: 'g3_t_cmd1' }, { a1: 'nose', a2: 'stomp', key: 'g3_t_cmd2' },
      { a1: 'eyes', a2: 'jump', key: 'g3_t_cmd3' }, { a1: 'ears', a2: 'clap', key: 'g3_cmd_ears_clap' },
      { a1: 'head', a2: 'stomp', key: 'g3_cmd_head_stomp' }, { a1: 'nose', a2: 'jump', key: 'g3_cmd_nose_jump' },
      { a1: 'eyes', a2: 'clap', key: 'g3_cmd_eyes_clap' }, { a1: 'nose', a2: 'clap', key: 'g3_cmd_nose_clap' },
      { a1: 'ears', a2: 'jump', key: 'g5_b_ears_jump' }
    ];
  var G5_C_CASES = [
      { gender: 'boy', act: 'ear', key: 'g4_t_ear' }, { gender: 'girl', act: 'clap', key: 'g4_t_clap' },
      { gender: 'boy', act: 'stomp', key: 'g4_a_boy_stomp' }, { gender: 'girl', act: 'jump', key: 'g4_a_girl_jump' },
      { gender: 'boy', act: 'nose', key: 'g4_a_boy_nose' }, { gender: 'girl', act: 'eyes', key: 'g4_a_girl_eyes' },
      { gender: 'boy', act: 'head', key: 'g4_a_boy_head' }, { gender: 'girl', act: 'ear', key: 'g4_a_girl_ear' },
      { gender: 'boy', act: 'eyes', key: 'g5_c_boy_eyes' }
    ];
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
