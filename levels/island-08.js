/* ============================================================
   英语冒险 · 岛 8 出题器（外置）
   ------------------------------------------------------------
   由 index.html 主脚本之后加载。core 通过 window.__LLCore 导出所需符号，
   本文件用同名局部变量取值，因此函数体与原版逐字节相同、未作任何改写。
   ============================================================ */
(function () {
  var L = window.__LLCore || {};
  var H1_B_POOL = L.H1_B_POOL;
  var H1_B_TARGETS = L.H1_B_TARGETS;
  var H1_MOODS = L.H1_MOODS;
  var H2_FIND_KEY = L.H2_FIND_KEY;
  var H2_NEED = L.H2_NEED;
  var H2_STATES = L.H2_STATES;
  var H3_COMFORT = L.H3_COMFORT;
  var H3_DISTRACT = L.H3_DISTRACT;
  var H4_A_KEY = L.H4_A_KEY;
  var H4_A_SITS = L.H4_A_SITS;
  var H4_B_CAUSES = L.H4_B_CAUSES;
  var H4_EMO = L.H4_EMO;
  var H5_A_CAUSES = L.H5_A_CAUSES;
  var H5_B_KEY = L.H5_B_KEY;
  var H5_C_KEYS = L.H5_C_KEYS;
  var H5_EMO = L.H5_EMO;
  var ensureH1Css = L.ensureH1Css;
  var ensureH2Css = L.ensureH2Css;
  var ensureH3Css = L.ensureH3Css;
  var ensureH4Css = L.ensureH4Css;
  var ensureH5Css = L.ensureH5Css;
  var pick = L.pick;
  var randInt = L.randInt;
  var shuffle = L.shuffle;
  var state = L.state;

function makeQuestionH1(type, prev) {
    ensureH1Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        /* A：3 张情绪脸（开心/难过/生气），听 "Find the X face." 点目标 */
        var want = pick(H1_MOODS);
        var faces = shuffle(H1_MOODS.slice());
        q = {
          type: 'H1A', sig: 'A:' + want + ':' + faces.join(','), mood: want, faces: faces,
          answer: faces.indexOf(want), correct: faces.indexOf(want),
          options: [], audio: ['h1_a_' + want]
        };
      } else if (type === 1) {
        /* B：3 张情景卡（3 种情绪各一张），听情景描述点对应脸谱 */
        var tgt = pick(H1_B_TARGETS);
        var others = [];
        H1_MOODS.forEach(function (m) {
          if (m !== tgt.mood) others.push(pick(H1_B_POOL[m]));
        });
        var scenes = shuffle([tgt.scene].concat(others));
        q = {
          type: 'H1B', sig: 'B:' + tgt.scene + ':' + scenes.join(','), mood: tgt.mood,
          scene: tgt.scene, scenes: scenes, answer: scenes.indexOf(tgt.scene),
          correct: scenes.indexOf(tgt.scene), options: [], audio: [tgt.key]
        };
      } else {
        /* C：缺嘴巴的脸 + 3 个嘴巴选项（拖/点拼上去） */
        var wantM = pick(H1_MOODS);
        var opts = shuffle(H1_MOODS.slice());
        q = {
          type: 'H1C', sig: 'C:' + wantM + ':' + opts.join(','), mouth: wantM,
          options: opts.map(function (m) { return { kind: 'h1mouth', mood: m }; }),
          correct: opts.indexOf(wantM), audio: ['h1_c_' + wantM]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionH2(type, prev) {
    ensureH2Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        /* A：3 个不同感受的小人，听 "Find the X boy." 点目标 */
        var want = pick(H2_STATES);
        var states = shuffle(H2_STATES.slice());
        q = {
          type: 'H2A', sig: 'A:' + want + ':' + states.join(','), state: want, states: states,
          answer: states.indexOf(want), correct: states.indexOf(want),
          options: [], audio: [H2_FIND_KEY[want]]
        };
      } else if (type === 1) {
        /* B：中央一个感受的小人 + 3 件物品，听句把对的东西拖给他 */
        var kid = pick(H2_STATES);
        var needed = H2_NEED[kid];
        var items = shuffle(['bread', 'water', 'pillow']);
        q = {
          type: 'H2B', sig: 'B:' + kid + ':' + items.join(','), state: kid, items: items,
          options: items.map(function (it) { return { kind: 'h2item', item: it }; }),
          correct: items.indexOf(needed), audio: ['h2_b_' + kid]
        };
      } else {
        /* C：中央一个完整小场景（小人 + 正确物品）+ ✅/❌ 判断语音描述是否与画面一致。
           claimState 有 50/50 与画面相同 / 不同，只有听懂语音才能判断（无视觉作弊 §三.16）。 */
        var scene = pick(H2_STATES);
        state.h2Flip = !state.h2Flip;
        var same = state.h2Flip;
        var claim = scene;
        if (!same) {
          var others = H2_STATES.filter(function (s2) { return s2 !== scene; });
          claim = pick(others);
        }
        var truth = (claim === scene);
        var optsC = shuffle([{ kind: 'yesNo', val: true }, { kind: 'yesNo', val: false }]);
        q = {
          type: 'H2C', sig: 'C:' + scene + ':' + claim + ':' + truth, state: scene, claim: claim,
          item: H2_NEED[scene], truth: truth,
          options: optsC, correct: optsC[0].val === truth ? 0 : 1,
          audio: ['h2_c_' + claim, 'yesno']
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionH3(type, prev) {
    ensureH3Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        /* A：中央哭泣婴儿 + 3 件物品，听 "Give him a toy/some candy." 送对的 */
        var target = pick(H3_COMFORT);
        var pool = H3_DISTRACT.slice();
        shuffle(pool);
        var items = shuffle([target, pool[0], pool[1]]);
        q = {
          type: 'H3A', sig: 'A:' + target + ':' + items.join(','), target: target, items: items,
          options: items.map(function (it) { return { kind: 'h3item', item: it }; }),
          answer: items.indexOf(target), correct: items.indexOf(target),
          audio: ['h3_a_' + target]
        };
      } else if (type === 1) {
        /* B：中央难过婴儿 + 巨大👍按钮（TPR，永远判对 §三.12） */
        state.h3bFlip = !state.h3bFlip;
        var hkey = state.h3bFlip ? 'h3_b_hug' : 'h3_b_hug2';
        q = {
          type: 'H3B', sig: 'B:' + hkey, state: 'sad', hug: hkey,
          options: [], correct: 0, audio: [hkey]
        };
      } else {
        /* C：中央一个完整小场景（哭婴 + 一件物品）+ ✅/❌。
           claim 与画面物品 50/50 相同 / 不同，只有听懂语音才能判断（无视觉作弊 §三.16）。 */
        var sceneItem = pick(H3_COMFORT);
        state.h3Flip = !state.h3Flip;
        var truth = state.h3Flip;
        var claim = truth ? sceneItem : (sceneItem === 'toy' ? 'candy' : 'toy');
        var optsC = shuffle([{ kind: 'yesNo', val: true }, { kind: 'yesNo', val: false }]);
        q = {
          type: 'H3C', sig: 'C:' + sceneItem + ':' + claim + ':' + truth,
          state: 'cry', item: sceneItem, claim: claim, truth: truth,
          options: optsC, correct: optsC[0].val === truth ? 0 : 1,
          audio: ['h3_c_' + claim, 'yesno']
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionH4(type, prev) {
    ensureH4Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        /* A：3 幅情景（目标 + 2 干扰），听 voice 描述事件点目标画面 */
        var target = pick(H4_A_SITS);
        var others = H4_A_SITS.filter(function (s) { return s !== target; });
        shuffle(others);
        var sits = shuffle([target, others[0], others[1]]);
        q = {
          type: 'H4A', sig: 'A:' + target + ':' + sits.join(','), sitTarget: target, sits: sits,
          answer: sits.indexOf(target), correct: sits.indexOf(target),
          options: [], audio: [H4_A_KEY[target]]
        };
      } else if (type === 1) {
        /* B：中央「无表情」情景 + 3 张情绪脸，听因果选对的脸 */
        var cause = H4_B_CAUSES[randInt(0, H4_B_CAUSES.length - 1)];
        var emo = cause.emo;
        var pool = H4_EMO.filter(function (e) { return e !== emo; });
        shuffle(pool);
        var faces = shuffle([emo, pool[0], pool[1]]);
        q = {
          type: 'H4B', sig: 'B:' + cause.sit + ':' + emo + ':' + faces.join(','),
          sit: cause.sit, emo: emo, faces: faces,
          options: faces.map(function (f) { return { kind: 'h4face', emo: f }; }),
          answer: faces.indexOf(emo), correct: faces.indexOf(emo),
          audio: [cause.key]
        };
      } else {
        /* C：TPR 情绪大爆发（巨大👍，永远判对 §三.12） */
        state.h4cFlip = !state.h4cFlip;
        var hkey = state.h4cFlip ? 'h4_c_hug' : 'h4_c_hug2';
        q = {
          type: 'H4C', sig: 'C:' + hkey, emo: 'sad',
          options: [], correct: 0, audio: [hkey]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionH5(type, prev) {
    ensureH5Css();
    var q, guard = 0;
    do {
      if (type === 0) {
        /* A：中央无表情小人 + 3 张面具；听情景把对的面具拖/点上去 */
        var cause = H5_A_CAUSES[randInt(0, H5_A_CAUSES.length - 1)];
        var emo = cause.emo;
        var pool = H5_EMO.filter(function (e) { return e !== emo; });
        shuffle(pool);
        var masks = shuffle([emo, pool[0], pool[1]]);
        q = {
          type: 'H5A', sig: 'A:' + emo + ':' + masks.join(','), emo: emo, masks: masks,
          options: masks.map(function (m) { return { kind: 'h5mask', emo: m }; }),
          answer: masks.indexOf(emo), correct: masks.indexOf(emo),
          audio: [cause.key]
        };
      } else if (type === 1) {
        /* B：4 个不同状态的小人（开心吃冰淇淋 / 饿得哭 / 生气 / 困），听长句找目标 */
        var target = pick(['happy', 'hungry', 'angry', 'sleepy']);
        var states = shuffle(['happy', 'hungry', 'angry', 'sleepy']);
        q = {
          type: 'H5B', sig: 'B:' + target + ':' + states.join(','), states: states, target: target,
          options: [], answer: states.indexOf(target), correct: states.indexOf(target),
          audio: [H5_B_KEY[target]]
        };
      } else {
        /* C：TPR 情绪大爆发（巨大👍，永远判对 §三.12） */
        state.h5cIdx = ((state.h5cIdx || 0) + 1) % H5_C_KEYS.length;
        var c = H5_C_KEYS[state.h5cIdx];
        q = {
          type: 'H5C', sig: 'C:' + c.key, emo: c.emo,
          options: [], correct: 0, audio: [c.key]
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

  var M = window.__LLMakers = window.__LLMakers || {};
  M.makeH1 = makeQuestionH1;
  M.makeH2 = makeQuestionH2;
  M.makeH3 = makeQuestionH3;
  M.makeH4 = makeQuestionH4;
  M.makeH5 = makeQuestionH5;
})();
