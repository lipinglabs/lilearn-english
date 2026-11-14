#!/usr/bin/env node
/* audit-voice-keys.js — 全量语音 key 覆盖审计
 *
 * 唯一真源：voice/<key>.mp3（1351 条）。
 * 审计三件事：
 *   1. 代码里所有「疑似语音 key」字面量是否都有 mp3；
 *   2. 分块索引 VOICE_CHUNK_FOR / OF_LEVEL / OF_ISLAND 是否与 mp3 一一对应；
 *   3. say([...]) / audio: / word: 等语音调用点里是否存在「没有 word 字段」的 act。
 *
 * 用法：node tools/audit-voice-keys.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const voiceDir = path.join(ROOT, 'voice');
const mp3Keys = new Set(
  fs.readdirSync(voiceDir).filter(f => f.endsWith('.mp3')).map(f => f.slice(0, -4))
);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const levelFiles = fs.readdirSync(path.join(ROOT, 'levels')).filter(f => f.endsWith('.js'));
const levelSrc = levelFiles.map(f => ({ file: 'levels/' + f, src: fs.readFileSync(path.join(ROOT, 'levels', f), 'utf8') }));
const sources = [{ file: 'index.html', src: html }, ...levelSrc];

/* ---- 1. 索引完整性 ---- */
const w = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'voice/chunks/index.js'), 'utf8'))(w);
const FOR = w.VOICE_CHUNK_FOR || {};
const OF_LEVEL = w.VOICE_CHUNK_OF_LEVEL || {};
const OF_ISLAND = w.VOICE_CHUNK_OF_ISLAND || {};
const chunkFiles = new Set(
  fs.readdirSync(path.join(ROOT, 'voice/chunks'))
    .filter(f => f.endsWith('.js') && f !== 'index.js').map(f => f.slice(0, -3))
);
const indexProblems = [];
for (const k of mp3Keys) if (!FOR[k]) indexProblems.push('mp3 无索引: ' + k);
for (const k of Object.keys(FOR)) {
  if (!mp3Keys.has(k)) indexProblems.push('索引指向不存在的 mp3: ' + k);
  if (!chunkFiles.has(FOR[k])) indexProblems.push('索引指向不存在的分块: ' + k + ' -> ' + FOR[k]);
}
/* 65 关都能解析出素材清单 */
for (let i = 1; i <= 13; i++) for (let l = 1; l <= 5; l++) {
  const k = i + '-' + l;
  const list = OF_LEVEL[k] || OF_ISLAND[i] || [];
  if (!list.length) indexProblems.push('关卡无素材清单: ' + k);
  for (const c of list) if (!chunkFiles.has(c)) indexProblems.push('关卡清单含缺失分块: ' + k + ' -> ' + c);
}

/* ---- 2. 代码里的语音 key 字面量 ---- */
/* 语音上下文：say( / audio: / word: / sentence: / ask: / show: / sayKey / intro: / praise */
const CTX = /(?:say\s*\(|audio\s*:|word\s*:|sentence\s*:|ask\s*:|show\s*:|intro\s*:|replay\s*=|voiceKey\s*:|keys\s*:)/;
const KEYISH = /^[a-z][a-z0-9_]{1,48}$/;
const referenced = new Map();   // key -> Set(文件)
const candidates = new Map();   // 不在 mp3 中的疑似 key -> Set(文件:行)
for (const { file, src } of sources) {
  const lines = src.split('\n');
  lines.forEach((line, idx) => {
    if (!CTX.test(line)) return;
    const re = /['"]([a-z][a-z0-9_]{1,48})['"]/g;
    let m;
    while ((m = re.exec(line))) {
      const k = m[1];
      if (!KEYISH.test(k)) continue;
      const tag = file + ':' + (idx + 1);
      if (mp3Keys.has(k)) {
        if (!referenced.has(k)) referenced.set(k, new Set());
        referenced.get(k).add(file);
      } else {
        if (!candidates.has(k)) candidates.set(k, new Set());
        candidates.get(k).add(tag);
      }
    }
  });
}

/* ---- 3. 动态拼接的 key（人工推导规则）---- */
const dynamicMissing = [];
/* 第 1 岛教学：l13_t_<ch>（26 字母）*/
const L13 = 'abcdefghijklmnopqrstuvwxyz'.split('');
for (const ch of L13) if (!mp3Keys.has('l13_t_' + ch)) dynamicMissing.push('l13_t_' + ch);
for (let l = 1; l <= 5; l++) if (!mp3Keys.has('l13_t_out_' + l)) dynamicMissing.push('l13_t_out_' + l);
for (const k of ['l13_t_in', 'l13_finale']) if (!mp3Keys.has(k)) dynamicMissing.push(k);

/* ---- 输出 ---- */
console.log('=== 语音资源 ===');
console.log('mp3 总数:', mp3Keys.size, ' 分块文件:', chunkFiles.size, ' 索引 key:', Object.keys(FOR).length);
console.log('索引问题:', indexProblems.length ? '\n  ' + indexProblems.join('\n  ') : '无');
console.log('\n=== 代码中命中 mp3 的 key 字面量 ===');
console.log('数量:', referenced.size);
console.log('\n=== 代码中「疑似语音 key 但无 mp3」的字面量（候选，需人工判读）===');
const nonVoiceWords = new Set(['true', 'false', 'null', 'undefined', 'function', 'return', 'var', 'string', 'number', 'object', 'length', 'push', 'slice', 'concat', 'filter', 'forEach', 'indexOf']);
const suspicious = [...candidates.entries()].filter(([k]) => !nonVoiceWords.has(k));
if (!suspicious.length) console.log('无');
else suspicious.sort((a, b) => a[0].localeCompare(b[0])).forEach(([k, tags]) => {
  console.log('  ' + k.padEnd(30) + [...tags].slice(0, 3).join(', '));
});
console.log('\n=== 动态拼接 key 缺失 ===');
console.log(dynamicMissing.length ? dynamicMissing.join(', ') : '无');

/* ---- 4. act 对象缺 word 字段检查 ---- */
console.log('\n=== 教学 act 定义中缺 word 的行 ===');
sources.forEach(({ file, src }) => {
  src.split('\n').forEach((line, idx) => {
    if (/acts\.push\(\{\s*t:\s*'demo'/.test(line) && !/word\s*:/.test(line)) {
      console.log('  ' + file + ':' + (idx + 1) + '  ' + line.trim().slice(0, 160));
    }
    if (/\{\s*t:\s*'demo'/.test(line) && !/word\s*:/.test(line)) {
      // 数组字面量里的 demo
      if (/^\s*\{\s*type:\s*'demo'/.test(line)) console.log('  [array] ' + file + ':' + (idx + 1) + '  ' + line.trim().slice(0, 160));
    }
  });
});
