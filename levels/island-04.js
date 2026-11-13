/* ============================================================
   英语冒险 · 岛 4 出题器（外置）
   ------------------------------------------------------------
   由 index.html 主脚本之后加载。core 通过 window.__LLCore 导出所需符号，
   本文件用同名局部变量取值，因此函数体与原版逐字节相同、未作任何改写。
   ============================================================ */
(function () {
  var L = window.__LLCore || {};
  var F1_ANIMALS = L.F1_ANIMALS;
  var F2_DESC = L.F2_DESC;
  var F2_FARM = L.F2_FARM;
  var F2_JUNGLE = L.F2_JUNGLE;
  var F3_ACTIONS = L.F3_ACTIONS;
  var F3_ALL_ITEMS = L.F3_ALL_ITEMS;
  var F3_CANON = L.F3_CANON;
  var F3_SCENES = L.F3_SCENES;
  var F3_ZONE_OF = L.F3_ZONE_OF;
  var F4_C_ITEMS = L.F4_C_ITEMS;
  var F4_POOL = L.F4_POOL;
  var F4_SCENES = L.F4_SCENES;
  var F4_ZONE_OF = L.F4_ZONE_OF;
  var F5_A_CASES = L.F5_A_CASES;
  var F5_B_SETS = L.F5_B_SETS;
  var F5_C_CASES = L.F5_C_CASES;
  var ensureF1Css = L.ensureF1Css;
  var ensureF2Css = L.ensureF2Css;
  var ensureF3Css = L.ensureF3Css;
  var ensureF4Css = L.ensureF4Css;
  var ensureF5Css = L.ensureF5Css;
  var f2Split = L.f2Split;
  var f3SplitFrom = L.f3SplitFrom;
  var randInt = L.randInt;
  var shuffle = L.shuffle;
  var state = L.state;

function makeQuestionF1(type, prev) {
    ensureF1Css();
    var pickC, sig, guard = 0;
    do {
      pickC = F1_ANIMALS[randInt(0, F1_ANIMALS.length - 1)];
      sig = type + ':' + pickC;
      guard += 1;
    } while (prev && prev.sig === sig && guard < 30);

    var others = F1_ANIMALS.filter(function (a) { return a !== pickC; });
    shuffle(others);
    var opts = [
      { kind: 'f1animal', animal: pickC },
      { kind: 'f1animal', animal: others[0] },
      { kind: 'f1animal', animal: others[1] }
    ];
    var answerOpt = opts[0];
    shuffle(opts);
    var correct = opts.indexOf(answerOpt);

    var typeName = type === 0 ? 'F1A' : type === 1 ? 'F1B' : 'F1C';
    var prefix = type === 0 ? 'l4w1_f_' : type === 1 ? 'l4w1_s_' : 'l4w1_c_';
    return {
      type: typeName, sig: sig, animal: pickC,
      options: opts, correct: correct, audio: [prefix + pickC]
    };
  }

function makeQuestionF2(type, prev) {
    ensureF2Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        var a1 = F2_JUNGLE[randInt(0, F2_JUNGLE.length - 1)];
        var s1 = f2Split(a1, F2_JUNGLE);
        q = {
          type: 'F2A', sig: 'A:' + a1, animal: a1, options: s1.options, correct: s1.correct,
          audio: ['l4w2_f_' + a1]
        };
      } else if (type === 1) {
        var d = F2_DESC[randInt(0, F2_DESC.length - 1)];
        var s2 = f2Split(d.ans, d.pool);
        q = {
          type: 'F2B', sig: 'B:' + d.key, animal: d.ans, desc: d.key,
          options: s2.options, correct: s2.correct, audio: ['l4w2_b_' + d.key]
        };
      } else {
        // 两个干扰项全部来自「另一种栖息地」：因此只有两个变量同时正确才算对
        var zone = Math.random() < 0.5 ? 'jungle' : 'farm';
        var same = zone === 'jungle' ? F2_JUNGLE : F2_FARM;
        var other = zone === 'jungle' ? F2_FARM : F2_JUNGLE;
        var a3 = same[randInt(0, same.length - 1)];
        var s3 = f2Split(a3, other);
        q = {
          type: 'F2C', sig: 'C:' + zone + ':' + a3, animal: a3, zone: zone,
          options: s3.options, correct: s3.correct,
          // 农场的 4 句与第 1 关文本完全相同，直接复用 l4w1_c_*（RULES §1.12 不建同文本第二条 key）
          audio: [(zone === 'farm' ? 'l4w1_c_' : 'l4w2_c_jungle_') + a3]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionF3(type, prev) {
    ensureF3Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        var act = F3_ACTIONS[randInt(0, F3_ACTIONS.length - 1)];
        var rest = F3_ACTIONS.filter(function (a) { return a !== act; });
        shuffle(rest);
        var s1 = f3SplitFrom(F3_CANON[act], [F3_CANON[rest[0]], F3_CANON[rest[1]]]);
        q = {
          type: 'F3A', sig: 'A:' + act, act: act,
          options: s1.options, correct: s1.correct, audio: ['l4w3_a_' + act]
        };
      } else if (type === 1) {
        var sc = F3_SCENES[randInt(0, F3_SCENES.length - 1)];
        var opts = sc.subs.map(function (s2) { return { kind: 'f3act', subj: s2 }; });
        var ansOpt = opts.filter(function (o) { return o.subj === sc.ans; })[0];
        shuffle(opts);
        q = {
          type: 'F3B', sig: 'B:' + sc.key, act: sc.key, subj: sc.ans,
          options: opts, correct: opts.indexOf(ansOpt), audio: ['l4w3_b_' + sc.key]
        };
      } else {
        // 干扰项必须来自「另一个动作」：所以「动作对 + 筐对」两个条件同时成立才算对
        var tgt = F3_ALL_ITEMS[randInt(0, F3_ALL_ITEMS.length - 1)];
        var zone = F3_ZONE_OF[tgt];
        var otherSet = zone === 'run' ? ['boy_sleep', 'cat_sleep'] : ['boy_run', 'dog_run'];
        var other = otherSet[randInt(0, otherSet.length - 1)];
        var opts3 = [{ kind: 'f3act', subj: tgt }, { kind: 'f3act', subj: other }];
        var ans3 = opts3[0];
        shuffle(opts3);
        q = {
          type: 'F3C', sig: 'C:' + zone + ':' + tgt, subj: tgt, zone: zone,
          options: opts3, correct: opts3.indexOf(ans3), audio: ['l4w3_c_' + tgt]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionF4(type, prev) {
    ensureF4Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        var tgt = F4_POOL[randInt(0, F4_POOL.length - 1)];
        var rest = F4_POOL.filter(function (s) { return s !== tgt; });
        shuffle(rest);
        var optsA = [
          { kind: 'f4scene', subj: tgt },
          { kind: 'f4scene', subj: rest[0] },
          { kind: 'f4scene', subj: rest[1] }
        ];
        var ansA = optsA[0];
        shuffle(optsA);
        q = {
          type: 'F4A', sig: 'A:' + tgt, subj: tgt,
          options: optsA, correct: optsA.indexOf(ansA),
          audio: ['l4w4_a_' + F4_SCENES[tgt].key]
        };
      } else if (type === 1) {
        // 题型 B：说出的句子与画面「有时对、有时不对」，✅ / ❌ 交替出现，不靠运气
        var claim = F4_POOL[randInt(0, F4_POOL.length - 1)];
        state.f4Flip = !state.f4Flip;
        var truth = state.f4Flip;
        var pic = claim;
        if (!truth) {
          var cand = F4_POOL.filter(function (s) { return s !== claim; });
          pic = cand[randInt(0, cand.length - 1)];
        }
        var optsB = shuffle([{ kind: 'yesNo', val: true }, { kind: 'yesNo', val: false }]);
        q = {
          type: 'F4B', sig: 'B:' + claim + ':' + pic, claim: claim, pic: pic, truth: truth,
          options: optsB, correct: optsB[0].val === truth ? 0 : 1,
          audio: ['l4w4_b_' + F4_SCENES[claim].key, 'yesno']
        };
      } else {
        // 干扰项必须来自「另一个动作」：所以「动作对 + 筐对」两个条件同时成立才算对
        var ct = F4_C_ITEMS[randInt(0, F4_C_ITEMS.length - 1)];
        var cz = F4_ZONE_OF[ct];
        var pool2 = F4_C_ITEMS.filter(function (s) { return F4_ZONE_OF[s] !== cz; });
        var other = pool2[randInt(0, pool2.length - 1)];
        var optsC = [{ kind: 'f4scene', subj: ct }, { kind: 'f4scene', subj: other }];
        var ansC = optsC[0];
        shuffle(optsC);
        q = {
          type: 'F4C', sig: 'C:' + cz + ':' + ct, subj: ct, zone: cz,
          options: optsC, correct: optsC.indexOf(ansC),
          audio: ['l4w4_c_' + F4_SCENES[ct].key]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionF5(type, prev) {
    ensureF5Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        var ca = F5_A_CASES[randInt(0, F5_A_CASES.length - 1)];
        var listA = [ca.target].concat(ca.set);
        shuffle(listA);
        var optsA = listA.map(function (s) { return { kind: 'f4scene', subj: s }; });
        q = {
          type: 'F5A', sig: 'A:' + ca.key, subj: ca.target,
          options: optsA, correct: listA.indexOf(ca.target),
          audio: [ca.key]
        };
      } else if (type === 1) {
        var sb = F5_B_SETS[randInt(0, F5_B_SETS.length - 1)];
        var animals = shuffle(sb.animals.slice());
        var target = animals[randInt(0, animals.length - 1)];
        var optsB = animals.map(function (a) { return { kind: 'f5animal', animal: a }; });
        q = {
          type: 'F5B', sig: 'B:' + sb.act + ':' + target, animal: target, act: sb.act,
          options: optsB, correct: animals.indexOf(target),
          audio: [sb.key]
        };
      } else {
        var cc = F5_C_CASES[randInt(0, F5_C_CASES.length - 1)];
        var listC = shuffle(cc.set.slice());
        var optsC = listC.map(function (s) { return { kind: 'f4scene', subj: s }; });
        q = {
          type: 'F5C', sig: 'C:' + cc.animal + ':' + cc.ans, subj: cc.ans, animal: cc.animal,
          options: optsC, correct: listC.indexOf(cc.ans),
          audio: [cc.key]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

  var M = window.__LLMakers = window.__LLMakers || {};
  M.makeF1 = makeQuestionF1;
  M.makeF2 = makeQuestionF2;
  M.makeF3 = makeQuestionF3;
  M.makeF4 = makeQuestionF4;
  M.makeF5 = makeQuestionF5;
})();
