/**
 * verify-merge-v1.js — 回归验证：v1 老存档（只有 4 个字段）经过
 * normalizeProgress → mergeProgress 不再抛 TypeError。
 *
 * 背景：云端 Gist 里现存的是 v1 存档（unlockedIsland/unlockedLevel/cleared/stars），
 * 而 mergeProgress 对 a.daily / a.wordStats / a.levelMistakes 直接 Object.keys()。
 * normalizeProgress 若不预先建好这些空壳，连接云存档时必崩，然后被 catch 误报成
 * 「连接失败，请检查网络后重试」并把令牌清空。
 *
 * 跑法：node tools/verify-merge-v1.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/** 从 index.html 里抠出目标函数的源码（按花括号配平） */
function extract(name) {
  const start = html.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('未找到函数 ' + name);
  let i = html.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return html.slice(start, j + 1);
    }
  }
  throw new Error('花括号未闭合：' + name);
}

const sandbox = {
  ISLANDS: new Array(13).fill({}),   // 13 座岛
  LEVELS_PER_ISLAND: 5,
  PROGRESS_VERSION: 2,
  console
};
vm.createContext(sandbox);
vm.runInContext(
  extract('normalizeProgress') + '\n' + extract('mergeProgress') +
  '\nthis.normalizeProgress = normalizeProgress; this.mergeProgress = mergeProgress;',
  sandbox
);

/* 云端真实存档（2026-11-05 的 v1 版本，逐字节来自 Gist） */
const CLOUD_V1 = {
  unlockedIsland: 2,
  unlockedLevel: { 1: 5, 2: 1 },
  cleared: { '1-1': true, '1-2': true, '1-3': true, '1-4': true, '1-5': true },
  stars: { '1-1': 3, '1-2': 2 }
};

/* 一台新设备的空白进度 */
const LOCAL_EMPTY = { unlockedIsland: 1, unlockedLevel: { 1: 1 }, cleared: {}, stars: {} };

const cases = [
  ['新设备 + 云端 v1', LOCAL_EMPTY, CLOUD_V1],
  ['云端 v1 + 云端 v1', CLOUD_V1, CLOUD_V1],
  ['空 daily 对象', { ...LOCAL_EMPTY, daily: {} }, CLOUD_V1],
  ['daily 条目全为 0', { ...LOCAL_EMPTY, daily: { '2026-11-01': { ms: 0, r: 0, w: 0 } } }, CLOUD_V1],
  ['levelMistakes 存在', { ...LOCAL_EMPTY, levelMistakes: { '1-1': 2 } }, CLOUD_V1],
  ['null 存档', null, CLOUD_V1]
];

let bad = 0;
for (const [label, a, b] of cases) {
  try {
    const out = sandbox.mergeProgress(a, b);
    const ok = out && out.version === 2 && typeof out.unlockedIsland === 'number';
    console.log((ok ? 'OK   ' : 'FAIL ') + label +
      ' → unlockedIsland=' + out.unlockedIsland +
      ' cleared=' + Object.keys(out.cleared).length +
      ' stars=' + Object.keys(out.stars).length +
      ' daily/dayStats/mistakes 空壳=' + [out.daily, out.wordStats, out.levelMistakes].every(x => x && typeof x === 'object'));
    if (!ok) bad++;
  } catch (e) {
    bad++;
    console.log('THROW ' + label + ' → ' + e.message);
  }
}

/* 合并语义校验：最高进度优先，不能倒退 */
const m = sandbox.mergeProgress(LOCAL_EMPTY, CLOUD_V1);
const semantics = m.unlockedIsland === 2 && m.cleared['1-1'] === true && m.stars['1-1'] === 3;
console.log(semantics ? 'OK   合并语义：进度只前进不倒退' : 'FAIL 合并语义异常 ' + JSON.stringify(m));
if (!semantics) bad++;

console.log(bad === 0 ? '\n全部通过（' + cases.length + ' 组 + 语义 1 项）' : '\n失败 ' + bad + ' 项');
process.exit(bad === 0 ? 0 : 1);
