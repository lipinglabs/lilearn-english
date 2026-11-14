/**
 * verify-4y.js — 「4 岁起步」岛序重排后的静态校验（不跑浏览器）。
 * 跑法：node tools/verify-4y.js
 *
 * 校验对象（改前基线取自 backups-4y-20261114/）：
 *  1) 逐 key 校验 1351 条语音映射：key 集合零改动、无遗漏无重复、分块归属按
 *     OLD2NEW 逐 key 重算一致、每个 value 都能找到磁盘分块、无孤儿分块；
 *     VOICE_CHUNK_OF_LEVEL / VOICE_CHUNK_OF_ISLAND 的键与值同步重映射正确；
 *  2) LEVEL_DEFS 65 个键齐全（岛 1..13 × 关 1..5）、每岛 5 关、make 名齐全；
 *  3) ISLANDS 13 个且名称/顺序与清单 D1 表一致；
 *  4) TUTORIALS 教学键 ⊆ LEVEL_DEFS 键（教学脚本与关卡对齐）；
 *  5) 13 个 levels/island-NN.js 存在，且 LEVEL_DEFS 里每关的 make 都在对应岛文件注册；
 *  6) PROGRESS_VERSION=4、sw.js CACHE=v25 且 URL rev=20261114b、
 *     VOICE_CHUNK_REV=20261114b；
 *  7) 派生标志 firstPlayableIsland / isFirstLevelOfIsland / isStartingLevel 存在；
 *  8) Gist payload 结构不变：defaultProgress() 字段集合与改前一致、
 *     normalizeProgress() 的补空壳与版本闸门仍在。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const BACKUP = path.join(ROOT, 'backups-4y-20261114');
const INDEX = path.join(ROOT, 'index.html');
const SW = path.join(ROOT, 'sw.js');
const LEVELS = path.join(ROOT, 'levels');
const CHUNKS = path.join(ROOT, 'voice', 'chunks');

// 清单 D1：原岛号 → 新岛号
const OLD2NEW = { 1: 13, 2: 1, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7,
                  8: 8, 9: 12, 10: 9, 11: 10, 12: 11, 13: 2 };
// 清单 D1：新岛序（主题名）
const EXPECTED_NAMES = ['数字与水果', '自我介绍', '形状与空间', '比较与分类',
  '动物与动作', '食物与饮料', '温馨家居', '身体与五官', '衣物穿戴',
  '交通工具', '童话故事', '情绪与感受', '字母与首音'];

let pass = 0, fail = 0;
function ck(cond, label, detail) {
  if (cond) { pass++; console.log('  [PASS] ' + label + (detail ? ' — ' + detail : '')); }
  else { fail++; console.log('  [FAIL] ' + label + (detail ? ' — ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

function loadVoiceIndex(file) {
  const s = fs.readFileSync(file, 'utf8');
  const ctx = { window: {} };
  vm.runInNewContext(s, ctx);
  return { win: ctx.window, src: s };
}
function mapChunk(v) {
  return v.replace(/^island_(\d+)(_\d+)?$/, function (m, n, tail) {
    return 'island_' + OLD2NEW[+n] + (tail || '');
  });
}
function mapLevelKey(k) {
  return k.replace(/^(\d+)-(\d+)$/, function (m, n, lv) {
    return OLD2NEW[+n] + '-' + lv;
  });
}

const html = fs.readFileSync(INDEX, 'utf8');
const htmlBefore = fs.readFileSync(path.join(BACKUP, 'index.html'), 'utf8');
const sw = fs.readFileSync(SW, 'utf8');
const b = loadVoiceIndex(path.join(BACKUP, 'voice-chunks', 'index.js'));
const a = loadVoiceIndex(path.join(CHUNKS, 'index.js'));

/* ---------------------------------------------------------------- 1. 语音映射 */
section('1. 逐 key 校验 1351 条语音映射');
const bFor = b.win.VOICE_CHUNK_FOR, aFor = a.win.VOICE_CHUNK_FOR;
const bKeys = Object.keys(bFor).sort(), aKeys = Object.keys(aFor).sort();
ck(bKeys.length === 1351, '改前基线语音 key = 1351 条', bKeys.length + ' 条');
ck(aKeys.length === 1351, '改后语音 key = 1351 条', aKeys.length + ' 条');
ck(JSON.stringify(bKeys) === JSON.stringify(aKeys),
   '语音 key 集合零改动（无遗漏 / 无新增 / 无重复）',
   '改前改后逐 key 名称完全一致');

// 无重复：从原始文本统计 VOICE_CHUNK_FOR 区块里 "key": 的出现次数
const forBlockA = a.src.slice(a.src.indexOf('{'), a.src.indexOf('};') + 1);
const rawKeys = forBlockA.match(/"([^"]+)"\s*:/g) || [];
const uniqRaw = new Set(rawKeys.map(function (x) { return x.replace(/["\s:]/g, ''); }));
ck(rawKeys.length === 1351 && uniqRaw.size === 1351,
   '索引文本无重复 key 定义', '字面量 ' + rawKeys.length + ' 个 / 去重 ' + uniqRaw.size + ' 个');

// 逐 key 校验分块归属按 OLD2NEW 重算一致
let mapBad = [];
bKeys.forEach(function (k) {
  const expect = mapChunk(bFor[k]);
  if (aFor[k] !== expect) mapBad.push(k + ': ' + bFor[k] + ' → ' + aFor[k] + '（应为 ' + expect + '）');
});
ck(mapBad.length === 0, '1351 条 key 的分块归属逐 key 按岛号映射重算一致',
   mapBad.length ? mapBad.slice(0, 5).join(' ; ') : '全部命中');

// 每个 key 都能找到磁盘分块；无孤儿分块
const disk = new Set(fs.readdirSync(CHUNKS)
  .filter(function (f) { return f.endsWith('.js') && f !== 'index.js'; })
  .map(function (f) { return f.replace(/\.js$/, ''); }));
const referenced = new Set();
Object.keys(aFor).forEach(function (k) { referenced.add(aFor[k]); });
Object.keys(a.win.VOICE_CHUNK_OF_LEVEL || {}).forEach(function (k) {
  a.win.VOICE_CHUNK_OF_LEVEL[k].forEach(function (v) { referenced.add(v); });
});
Object.keys(a.win.VOICE_CHUNK_OF_ISLAND || {}).forEach(function (k) {
  a.win.VOICE_CHUNK_OF_ISLAND[k].forEach(function (v) { referenced.add(v); });
});
const missing = [...referenced].filter(function (v) { return !disk.has(v); });
const orphan = [...disk].filter(function (v) { return !referenced.has(v); });
ck(missing.length === 0, '每个 key / 索引都能找到磁盘分块（缺失 0）',
   missing.length ? missing.join(', ') : '引用分块 ' + referenced.size + ' 个全部存在');
ck(orphan.length === 0, '无孤儿分块文件（未被引用的磁盘分块 0）',
   orphan.length ? orphan.join(', ') : '磁盘分块 ' + disk.size + ' 个全部被引用');

// VOICE_CHUNK_OF_LEVEL：键与值同步重映射
const bLvl = b.win.VOICE_CHUNK_OF_LEVEL, aLvl = a.win.VOICE_CHUNK_OF_LEVEL;
const bLvlKeys = Object.keys(bLvl).sort(), aLvlKeys = Object.keys(aLvl).sort();
const expectLvlKeys = bLvlKeys.map(mapLevelKey).sort();
ck(JSON.stringify(aLvlKeys) === JSON.stringify(expectLvlKeys),
   'VOICE_CHUNK_OF_LEVEL 的 45 个「岛-关」键按映射重算一致',
   aLvlKeys.length + ' 键');
let lvlBad = [];
bLvlKeys.forEach(function (k) {
  const nk = mapLevelKey(k);
  const expect = bLvl[k].map(mapChunk);
  if (JSON.stringify(aLvl[nk]) !== JSON.stringify(expect)) lvlBad.push(k + '→' + nk);
});
ck(lvlBad.length === 0, 'VOICE_CHUNK_OF_LEVEL 每个键的分块数组逐项重算一致',
   lvlBad.length ? lvlBad.slice(0, 5).join(', ') : '全部命中');

// VOICE_CHUNK_OF_ISLAND：键与值同步重映射
const bIsl = b.win.VOICE_CHUNK_OF_ISLAND, aIsl = a.win.VOICE_CHUNK_OF_ISLAND;
let islBad = [];
Object.keys(bIsl).forEach(function (k) {
  const nk = (+k === 0) ? '0' : String(OLD2NEW[+k]);
  const expect = bIsl[k].map(mapChunk);
  if (JSON.stringify(aIsl[nk]) !== JSON.stringify(expect)) islBad.push(k + '→' + nk);
});
ck(Object.keys(aIsl).length === 14, 'VOICE_CHUNK_OF_ISLAND 键数 = 14（0..13）');
ck(islBad.length === 0, 'VOICE_CHUNK_OF_ISLAND 每个岛的分块数组逐项重算一致',
   islBad.length ? islBad.slice(0, 5).join(', ') : '全部命中');

/* ---------------------------------------------------------------- 2. LEVEL_DEFS */
section('2. LEVEL_DEFS 65 个键');
const defBlock = html.match(/var LEVEL_DEFS = \{([\s\S]*?)\n  \};/);
const defEntries = defBlock ? [...defBlock[1].matchAll(/'(\d+)-(\d+)'\s*:\s*\{([^}]*)\}/g)] : [];
const defKeys = defEntries.map(function (m) { return m[1] + '-' + m[2]; });
ck(defEntries.length === 65, 'LEVEL_DEFS 键数 = 65', defEntries.length + ' 键');
const perIsland = {};
let badRange = [];
defEntries.forEach(function (m) {
  const i = +m[1], lv = +m[2];
  if (i < 1 || i > 13 || lv < 1 || lv > 5) badRange.push(m[1] + '-' + m[2]);
  perIsland[i] = (perIsland[i] || 0) + 1;
});
ck(badRange.length === 0, '所有键的岛号 ∈ 1..13、关号 ∈ 1..5');
ck(Object.keys(perIsland).length === 13 && Object.keys(perIsland).every(function (i) { return perIsland[i] === 5; }),
   '每岛恰好 5 关（13 × 5 = 65）', JSON.stringify(perIsland));
ck(new Set(defKeys).size === 65, 'LEVEL_DEFS 键无重复');

// 改前 65 键按映射重算 = 改后 65 键（证明关卡键重映射正确、无丢无重）
const defBlockB = htmlBefore.match(/var LEVEL_DEFS = \{([\s\S]*?)\n  \};/);
const defKeysB = defBlockB ? [...defBlockB[1].matchAll(/'(\d+-\d+)'\s*:/g)].map(function (m) { return m[1]; }) : [];
const expectDefKeys = defKeysB.map(mapLevelKey).sort();
ck(defKeysB.length === 65 && JSON.stringify(defKeys.slice().sort()) === JSON.stringify(expectDefKeys),
   '改前 65 键按映射重算 = 改后 65 键', '关卡键重映射无遗漏无重复');

/* ---------------------------------------------------------------- 3. ISLANDS */
section('3. ISLANDS 13 个与新岛序');
const islBlock = html.match(/var ISLANDS = \[([\s\S]*?)\n  \];/);
const names = islBlock ? [...islBlock[1].matchAll(/name: '([^']+)'/g)].map(function (m) { return m[1]; }) : [];
ck(names.length === 13, 'ISLANDS 个数 = 13', names.length + ' 个');
ck(JSON.stringify(names) === JSON.stringify(EXPECTED_NAMES),
   '新岛序与清单 D1 表逐项一致', names.join(' → '));
ck(names[0] === '数字与水果', '起步岛 = 数字与水果（具体实物主题）', names[0]);

/* ---------------------------------------------------------------- 4. TUTORIALS */
section('4. TUTORIALS 教学键对齐');
const tutBlock = html.match(/var TUTORIALS = \{([\s\S]*?)\n  \};/);
const tutKeys = tutBlock ? [...tutBlock[1].matchAll(/^\s*'(\d+-\d+)'\s*:/gm)].map(function (m) { return m[1]; }) : [];
const defSet = new Set(defKeys);
const tutOrphan = tutKeys.filter(function (k) { return !defSet.has(k); });
ck(tutKeys.length > 0, 'TUTORIALS 教学键已提取', tutKeys.length + ' 键');
ck(tutOrphan.length === 0, 'TUTORIALS 键全部 ⊆ LEVEL_DEFS 键（教学脚本与关卡对齐）',
   tutOrphan.length ? tutOrphan.join(', ') : '无错位');

/* ---------------------------------------------------------------- 5. levels 出题器归属 */
section('5. 13 个 levels 出题器与 LEVEL_DEFS 归属');
const levelFiles = fs.readdirSync(LEVELS).filter(function (f) { return /^island-\d{2}\.js$/.test(f); }).sort();
ck(levelFiles.length === 13, 'levels/island-01..13.js 齐全', levelFiles.join(', '));
let makerBad = [];
defEntries.forEach(function (m) {
  const isl = +m[1], body = m[3];
  const mm = body.match(/make:\s*'([^']+)'/);
  if (!mm) return;                       // numbers 关 make: null，跳过
  const make = mm[1];
  const f = path.join(LEVELS, 'island-' + String(isl).padStart(2, '0') + '.js');
  if (!fs.existsSync(f) || !fs.readFileSync(f, 'utf8').includes('M.' + make)) {
    makerBad.push(m[1] + '-' + m[2] + ':' + make);
  }
});
ck(makerBad.length === 0, '每关 make 都在对应岛号文件里注册（物理改名正确）',
   makerBad.length ? makerBad.slice(0, 6).join(', ') : '全部命中');
// 抽查两个被移岛
ck(fs.readFileSync(path.join(LEVELS, 'island-13.js'), 'utf8').includes('M.makeL131'),
   '新第 13 岛 = 字母与首音（makeL131）');
ck(fs.readFileSync(path.join(LEVELS, 'island-02.js'), 'utf8').includes('M.makeL121'),
   '新第 2 岛 = 自我介绍（makeL121）');
ck(fs.readFileSync(path.join(LEVELS, 'island-01.js'), 'utf8').includes('M.makeW2'),
   '新第 1 岛 = 数字与水果（makeW2）');

/* ---------------------------------------------------------------- 6. 版本与缓存 */
section('6. 进度版本 / SW 缓存 / URL rev');
ck(/var PROGRESS_VERSION = 4;/.test(html), 'PROGRESS_VERSION = 4');
ck(/raw\.version !== PROGRESS_VERSION\) return out;/.test(html),
   'normalizeProgress 版本闸门保留（v3 旧档按版本号清空）');
ck(html.includes('normalizeProgress(raw)') && html.includes('v2 字段必须在这里就全部建好空壳'),
   'normalizeProgress 补空壳逻辑保留（旧 Gist 合并不崩）');
ck(/var CACHE = 'lilearn-v25';/.test(sw), "sw.js CACHE = 'lilearn-v25'");
ck(sw.includes("index.js?v=20261114b") && sw.includes("core.js?v=20261114b"),
   'sw.js SHELL 里 index.js / core.js 的 ?v= 已递增');
ck(html.includes("window.VOICE_CHUNK_REV = '20261114b'"),
   "index.html VOICE_CHUNK_REV = '20261114b'（与 sw.js 一致）");

/* ---------------------------------------------------------------- 7. 派生标志 */
section('7. 起步关派生标志（禁硬编码岛号）');
['function firstPlayableIsland()', 'function isFirstLevelOfIsland(island, level)',
 'function isStartingLevel(island, level)'].forEach(function (sig) {
  ck(html.includes(sig), '存在 ' + sig.replace('()', ''));
});
ck(/island === firstPlayableIsland\(\)/.test(html),
   'isStartingLevel 用派生值判断，未硬编码岛号');

/* ---------------------------------------------------------------- 8. Gist payload 结构 */
section('8. Gist payload 结构 / 字段 / 版本号不变');
function defaultFields(txt) {
  const m = txt.match(/function defaultProgress\(\) \{([\s\S]*?)\n  \}/);
  if (!m) return [];
  return [...m[1].matchAll(/^\s*([a-zA-Z][a-zA-Z0-9]*):/gm)].map(function (x) { return x[1]; }).sort();
}
const fb = defaultFields(htmlBefore), fa = defaultFields(html);
ck(fb.length > 0 && JSON.stringify(fb) === JSON.stringify(fa),
   'defaultProgress() 字段集合与改前完全一致（settings/usage 未进 progress）',
   '[' + fa.join(', ') + ']');
ck(/JSON\.stringify\(progress\)/.test(html), '云同步仍只序列化 progress.*');
// 语音 key 零改动已由第 1 节证明；音频数据零改动：分块文件仅改名，内容逐一比对
let contentBad = [];
fs.readdirSync(path.join(BACKUP, 'voice-chunks'))
  .filter(function (f) { return /^island_\d+(_\d+)?\.js$/.test(f); })
  .forEach(function (f) {
    const m = f.match(/^island_(\d+)(_\d+)?\.js$/);
    const nf = 'island_' + OLD2NEW[+m[1]] + (m[2] || '') + '.js';
    const bp = path.join(BACKUP, 'voice-chunks', f), ap = path.join(CHUNKS, nf);
    if (!fs.existsSync(ap) || fs.readFileSync(bp, 'utf8') !== fs.readFileSync(ap, 'utf8')) {
      contentBad.push(f + '→' + nf);
    }
  });
ck(contentBad.length === 0, '53 个分块仅改名、音频数据逐字节零改动',
   contentBad.length ? contentBad.slice(0, 5).join(', ') : '全部一致');

/* ---------------------------------------------------------------- 汇总 */
console.log('\n============================================');
console.log('校验结果：PASS ' + pass + ' / FAIL ' + fail);
console.log('语音 key：1351 条零改动；引用分块 ' + referenced.size +
            ' 个 / 磁盘分块 ' + disk.size + ' 个；缺失 ' + missing.length + ' / 孤儿 ' + orphan.length);
console.log('新岛序：' + names.join(' → '));
console.log(fail === 0 ? '全部通过' : '存在失败项，请检查');
console.log('============================================');
process.exit(fail ? 1 : 0);
