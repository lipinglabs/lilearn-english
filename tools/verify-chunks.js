/**
 * verify-chunks.js — 校验 voice/chunks/index.js 的 key→分块 映射与磁盘文件一一对应。
 * 岛序重编号后必须跑一次：少一个分块，孩子听到的就是静音。
 * 跑法：node tools/verify-chunks.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'voice', 'chunks', 'index.js');

const src = fs.readFileSync(INDEX, 'utf8');
const body = src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1);
let map;
try {
  map = JSON.parse(body);
} catch (e) {
  // 兜底：不是严格 JSON（有注释）时按行解析
  map = {};
  const re = /"([^"]+)"\s*:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(body))) map[m[1]] = m[2];
}

const names = new Set(Object.values(map));
const files = fs.readdirSync(path.join(ROOT, 'voice', 'chunks'))
  .filter(f => f.endsWith('.js') && f !== 'index.js')
  .map(f => f.replace(/\.js$/, ''));

const missing = [...names].filter(n => !files.includes(n));
const orphan = files.filter(f => !names.has(f));

console.log('语音 key 总数：', Object.keys(map).length);
console.log('引用到的分块：', names.size, ' 磁盘文件：', files.length);
console.log('缺失分块：', missing.length ? missing.join(', ') : '无');
console.log('孤儿文件：', orphan.length ? orphan.join(', ') : '无');

const bad = missing.length || orphan.length;
console.log(bad ? '\n失败' : '\n全部通过');
process.exit(bad ? 1 : 0);
