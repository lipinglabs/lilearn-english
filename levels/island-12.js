/* ============================================================
   英语冒险 · 岛 12 出题器（外置）
   ------------------------------------------------------------
   由 index.html 主脚本之后加载。core 通过 window.__LLCore 导出所需符号，
   本文件用同名局部变量取值，因此函数体与原版逐字节相同、未作任何改写。
   ============================================================ */
(function () {
  var L = window.__LLCore || {};
  var L121_IDS = L.L121_IDS;
  var L121_LAST = L.L121_LAST;
  var L122_ITEMS = L.L122_ITEMS;
  var L122_LAST = L.L122_LAST;
  var L122_LETTERS = L.L122_LETTERS;
  var L122_LETTER_OF = L.L122_LETTER_OF;
  var L123_ANIMALS = L.L123_ANIMALS;
  var L123_BQ = L.L123_BQ;
  var L123_FACES = L.L123_FACES;
  var L123_FACE_BOX = L.L123_FACE_BOX;
  var L123_ITEMS = L.L123_ITEMS;
  var L123_LAST = L.L123_LAST;
  var L124_BQ = L.L124_BQ;
  var L124_ITEMS = L.L124_ITEMS;
  var L124_LAST = L.L124_LAST;
  var L124_PEOPLE = L.L124_PEOPLE;
  var L125_A = L.L125_A;
  var L125_B = L.L125_B;
  var L125_C = L.L125_C;
  var L125_LAST = L.L125_LAST;
  var L125_PARTS = L.L125_PARTS;
  var l122ShuffleAvoid = L.l122ShuffleAvoid;
  var l123PickDiff = L.l123PickDiff;
  var l123ShuffleAvoid = L.l123ShuffleAvoid;
  var l124TrayIds = L.l124TrayIds;
  var l125Draw = L.l125Draw;
  var pick = L.pick;
  var shuffle = L.shuffle;

function makeQuestionL121(type, prev) {
    var q, guard = 0;
    do {
      if (type === 0) {
        var target = pick(L121_IDS);
        var items = shuffle(L121_IDS.slice());
        /* 防背题：答案位不与上一轮相同 */
        for (var k = 0; k < 8 && items.indexOf(target) === L121_LAST.ans; k++) items = shuffle(L121_IDS.slice());
        var ans = items.indexOf(target);
        L121_LAST.ans = ans;
        q = {
          type: 'L121A', sig: 'A:' + target, items: items, options: [], answer: ans,
          audio: ['l121_a_' + target]
        };
      } else if (type === 1) {
        var itemsB = shuffle(['yes', 'no']);
        q = {
          type: 'L121B', sig: 'B:' + itemsB.join(''), items: itemsB, options: [],
          answer: itemsB.indexOf('yes'), audio: ['l121_b_ask']
        };
      } else {
        /* C：两个小孩（从三人里取两个）+ 同名两张牌（顺序打乱）；音频按孩子从左到右念 */
        var pool = shuffle(L121_IDS.slice());
        var kids = [pool[0], pool[1]];
        var badges = shuffle(kids.slice());
        for (var k2 = 0; k2 < 6 && badges.join('') === kids.join(''); k2++) badges = shuffle(kids.slice());
        var pair = kids.join('');
        for (var k3 = 0; k3 < 6 && pair === L121_LAST.pair; k3++) {
          pool = shuffle(L121_IDS.slice());
          kids = [pool[0], pool[1]];
          badges = shuffle(kids.slice());
          pair = kids.join('');
        }
        L121_LAST.pair = pair;
        q = {
          type: 'L121C', sig: 'C:' + kids.join('-'), kidsWho: kids, badges: badges,
          options: [], answer: 0,
          audio: kids.map(function (w) { return 'l121_c_' + w; })
        };
      }
      guard += 1;
    } while (prev && prev.sig === q.sig && guard < 30);
    return q;
  }

function makeQuestionL122(type, prev) {
    var q, guard = 0;
    do {
      if (type === 0) {
        var ch = pick(L122_LETTERS);
        var itemsA = l122ShuffleAvoid(L122_LETTERS, ch, L122_LAST.A);
        var ansA = itemsA.indexOf(ch);
        L122_LAST.A = ansA;
        q = {
          type: 'L122A', items: itemsA, answer: ansA, options: [],
          audio: ['l122_a_' + ch.toLowerCase()]
        };
      } else if (type === 1) {
        var item = pick(L122_ITEMS);
        var itemsB = l122ShuffleAvoid(L122_ITEMS, item, L122_LAST.B);
        var ansB = itemsB.indexOf(item);
        L122_LAST.B = ansB;
        q = {
          type: 'L122B', items: itemsB, answer: ansB, options: [],
          audio: ['l122_b_' + L122_LETTER_OF[item].toLowerCase()]
        };
      } else {
        var want = pick(L122_ITEMS);
        for (var g = 0; g < 8 && want === L122_LAST.C; g++) want = pick(L122_ITEMS);
        L122_LAST.C = want;
        q = {
          type: 'L122C', slots: L122_LETTERS.slice(), trayItems: shuffle(L122_ITEMS.slice()),
          pick: want, answer: 0, options: [],
          audio: ['l122_c_' + want]
        };
      }
      guard += 1;
    } while (prev && prev.type === q.type && prev.audio && q.audio &&
             prev.audio[0] === q.audio[0] && guard < 30);
    return q;
  }

function makeQuestionL123(type, prev) {
    if (type === 0) {
      var beast = l123PickDiff(L123_ANIMALS, L123_LAST.beast);
      L123_LAST.beast = beast;
      var itemsA = l123ShuffleAvoid(L123_ANIMALS, beast, L123_LAST.A);
      var ansA = itemsA.indexOf(beast);
      L123_LAST.A = ansA;
      return {
        type: 'L123A', beast: beast, items: itemsA, answer: ansA, options: [],
        audio: ['l123_a_' + beast]
      };
    }
    if (type === 1) {
      var prevAsk = L123_LAST.ask;
      var tpl = pick(L123_BQ.filter(function (t) { return t.ans !== prevAsk; }));
      if (!tpl) tpl = pick(L123_BQ);
      L123_LAST.ask = tpl.ans;
      var others = shuffle(L123_ITEMS.filter(function (x) { return x !== tpl.ans; })).slice(0, 2);
      var itemsB = l123ShuffleAvoid([tpl.ans].concat(others), tpl.ans, L123_LAST.B);
      var ansB = itemsB.indexOf(tpl.ans);
      L123_LAST.B = ansB;
      return {
        type: 'L123B', askAns: tpl.ans, items: itemsB, answer: ansB, options: [],
        audio: [tpl.key]
      };
    }
    var target = L123_LAST.target === 'cry' ? 'laugh' : 'cry';
    if (!L123_LAST.target) target = pick(['cry', 'laugh']);
    L123_LAST.target = target;
    /* 难过框的左右：不与上一轮同侧（真的换边，防背位置） */
    var sadSide = Math.random() < 0.5 ? 'left' : 'right';
    if (sadSide === L123_LAST.sadSide) sadSide = sadSide === 'left' ? 'right' : 'left';
    L123_LAST.sadSide = sadSide;
    return {
      type: 'L123C', target: target, box: L123_FACE_BOX[target],
      sides: { sad: sadSide, happy: sadSide === 'left' ? 'right' : 'left' },
      chips: shuffle(L123_FACES.slice()), answer: 0, options: [],
      audio: [target === 'cry' ? 'l123_c_cry' : 'l123_c_laugh']
    };
  }

function makeQuestionL124(type, prev) {
    if (type === 0) {
      var combos = [];
      L124_ITEMS.forEach(function (it) {
        L124_PEOPLE.forEach(function (w) { combos.push(it + '|' + w); });
      });
      var c = pick(combos.filter(function (x) { return x !== L124_LAST.Akey; }));
      L124_LAST.Akey = c;
      var parts = c.split('|');
      return {
        type: 'L124A', getItem: parts[0], giveWho: parts[1], answer: 0, options: [],
        audio: ['l124_a_' + parts[0] + '_' + parts[1]]
      };
    }
    if (type === 1) {
      var set = pick(L124_BQ.filter(function (b) { return b.k !== L124_LAST.Bkey; }));
      L124_LAST.Bkey = set.k;
      var swap = Math.random() < 0.5;
      var acts = swap ? [set.acts[1], set.acts[0]] : [set.acts[0], set.acts[1]];
      return {
        type: 'L124B', acts: acts, swap: swap ? 1 : 0, answer: 0, options: [],
        audio: [set.k]
      };
    }
    var who = L124_LAST.Cwho === 'dad' ? 'mom' : 'dad';
    L124_LAST.Cwho = who;
    var tray = shuffle(l124TrayIds());
    for (var k = 0; k < 8 && tray.join(',') === L124_LAST.Ctray; k++) tray = shuffle(l124TrayIds());
    L124_LAST.Ctray = tray.join(',');
    return {
      type: 'L124C', giveWho: who, orderArr: ['get:apple', 'give:' + who], trayPics: tray,
      answer: 0, options: [], audio: ['l124_c_' + who]
    };
  }

function makeQuestionL125(type, prev) {
    if (type === 0) {
      var set = l125Draw('a', L125_A, function (x) { return x.key; });
      var opts = shuffle(set.opts.slice());
      return {
        type: 'L125A', want: set.want, optsArr: opts, answer: opts.indexOf(set.want),
        options: [], audio: [set.key]
      };
    }
    if (type === 1) {
      var sb = l125Draw('b', L125_B, function (x) { return x.key; });
      var tray = shuffle(sb.tray.slice());
      return {
        type: 'L125B', seq: sb.seq.slice(), trayArr: tray, answer: 0,
        options: [], audio: [sb.key]
      };
    }
    var sc = l125Draw('c', L125_C, function (x) { return x.part; });
    var decoys = shuffle(L125_PARTS.filter(function (p) { return p !== sc.part; })).slice(0, 2);
    var parts = shuffle([sc.part].concat(decoys));
    for (var k = 0; k < 8 && parts.join(',') === L125_LAST.cparts; k++) {
      parts = shuffle([sc.part].concat(decoys));
    }
    L125_LAST.cparts = parts.join(',');
    return {
      type: 'L125C', part: sc.part, partsArr: parts, answer: 0,
      options: [], audio: [sc.key]
    };
  }

  var M = window.__LLMakers = window.__LLMakers || {};
  M.makeL121 = makeQuestionL121;
  M.makeL122 = makeQuestionL122;
  M.makeL123 = makeQuestionL123;
  M.makeL124 = makeQuestionL124;
  M.makeL125 = makeQuestionL125;
})();
