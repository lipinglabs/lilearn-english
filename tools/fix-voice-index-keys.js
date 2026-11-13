#!/usr/bin/env node
/**
 * fix-voice-index-keys.js — 修正重编号后「按岛 / 按关预取索引」的岛号错位。
 *
 * 背景（2026-11-13 第 13 岛移到第 1 岛那次改造的遗留）：
 *   重编号时，关卡键、关卡文件名、语音分块文件名、以及 VOICE_CHUNK_FOR 的「值」
 *   都按新岛号重映射了，但 VOICE_CHUNK_OF_ISLAND / VOICE_CHUNK_OF_LEVEL 的「键」
 *   （岛号）没有跟着改，于是预取整体错开一格：
 *     · 新岛 1（字母岛，语音在 island_1_1..5）→ 索引给的却是 island_2_1/2_2
 *     · 新岛 13（自我介绍，语音在 island_13_1..5）→ 索引给的却是 island_1_1..5
 *   结果：进关时预取的是别的岛的语音，本关第一句要等 say() 的补加载兜底，
 *   弱网下就表现为「进去没有声音」。
 *
 * 映射关系：旧岛 N → 新岛 N+1（旧 13 → 新 1）。
 * 本脚本只改「键」，值保持不动（值在重编号时已经是正确的分块名）。
 *
 * 用法：node tools/fix-voice-index-keys.js [--check]
 *   --check 只校验不写回。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'voice', 'chunks', 'index.js');
const CHECK = process.argv.indexOf('--check') >= 0;

let src = fs.readFileSync(INDEX, 'utf8');
const w = {};
new Function('window', src)(w);

const I = w.VOICE_CHUNK_OF_ISLAND;
const L = w.VOICE_CHUNK_OF_LEVEL;
if (!I || !L) throw new Error('索引里找不到 OF_ISLAND / OF_LEVEL');
if (I[1] && I[1][0] === 'island_1_1') {
  console.log('已经是修正后的索引，跳过');
  process.exit(0);
}

// 旧岛 N → 新岛 N+1；旧 13 → 新 1
const shift = n => (n >= 13 ? 1 : n + 1);

const I2 = {};
if (I[0]) I2[0] = I[0];                       // 0 = 公共 core，保留
for (let n = 1; n <= 13; n++) {
  if (I[n]) I2[shift(n)] = I[n];
}

const L2 = {};
Object.keys(L).forEach(k => {
  const m = k.match(/^(\d+)-(\d+)$/);
  if (!m) throw new Error('无法解析关卡键：' + k);
  L2[shift(Number(m[1])) + '-' + m[2]] = L[k];
});

// ---- 校验：新岛 1 必须是字母岛分块，且所有引用的分块文件都存在 ----
const chunksDir = path.join(ROOT, 'voice', 'chunks');
const files = new Set(fs.readdirSync(chunksDir)
  .filter(f => f.endsWith('.js') && f !== 'index.js')
  .map(f => f.replace(/\.js$/, '')));
const all = new Set();
Object.keys(I2).forEach(k => (I2[k] || []).forEach(c => all.add(c)));
Object.keys(L2).forEach(k => (L2[k] || []).forEach(c => all.add(c)));
const missing = [...all].filter(c => !files.has(c));

console.log('OF_ISLAND 新 1 =', JSON.stringify(I2[1]));
console.log('OF_ISLAND 新 13 =', JSON.stringify(I2[13]));
console.log('OF_LEVEL  新 "1-1" =', JSON.stringify(L2['1-1']));
console.log('OF_LEVEL  新 "13-1" =', JSON.stringify(L2['13-1']));
console.log('引用分块 %d 个，缺失 %d 个', all.size, missing.length);
if (missing.length) {
  console.error('缺失分块：', missing.join(', '));
  process.exit(1);
}
if (!I2[1] || I2[1][0] !== 'island_1_1') throw new Error('新岛 1 未指向字母岛分块');
if (!L2['1-1'] || L2['1-1'][0] !== 'island_1_1') throw new Error('新 1-1 未指向字母岛分块');
if (!I2[13] || I2[13][0] !== 'island_13_1') throw new Error('新岛 13 未指向自我介绍分块');

if (CHECK) { console.log('CHECK OK'); process.exit(0); }

// ---- 序列化并替换两段 ----
function serIsland(o) {
  const keys = Object.keys(o).map(Number).sort((a, b) => a - b);
  return 'window.VOICE_CHUNK_OF_ISLAND = {\n' +
    keys.map(k => k + ':' + JSON.stringify(o[k]) + ',\n').join('') + '};';
}
function serLevel(o) {
  const keys = Object.keys(o).sort((a, b) => {
    const [ai, al] = a.split('-').map(Number);
    const [bi, bl] = b.split('-').map(Number);
    return ai - bi || al - bl;
  });
  return 'window.VOICE_CHUNK_OF_LEVEL = {\n' +
    keys.map(k => JSON.stringify(k) + ':' + JSON.stringify(o[k]) + ',\n').join('') + '};';
}

let n = 0;
src = src.replace(/window\.VOICE_CHUNK_OF_ISLAND = \{[\s\S]*?\n\};/, () => { n++; return serIsland(I2); });
src = src.replace(/window\.VOICE_CHUNK_OF_LEVEL = \{[\s\S]*?\n\};/, () => { n++; return serLevel(L2); });
if (n !== 2) throw new Error('替换次数异常：' + n);

fs.writeFileSync(INDEX, src, 'utf8');
console.log('已写回 ' + INDEX + '（' + src.length + ' 字符）');
