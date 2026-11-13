#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""renumber-islands.py — 把第 13 岛「字母与首音」提到第 1 岛，原 1–12 岛顺移为 2–13。

岛号同时绑着三样东西，必须一起搬：
  1) ISLANDS 数组（地图顺序 + 名称/图标）
  2) LEVEL_DEFS / TUTORIALS 的关卡键（'13-1' → '1-1'，'1-1' → '2-1' …）
  3) 物理文件：levels/island-NN.js、voice/chunks/island_N_M.js
     （改名用两阶段，避免 island_13_1 → island_1_1 时撞上原有的 island_1_1）

映射：old 13 → new 1；old N(1..12) → new N+1。
用户已确认：旧存档作废（PROGRESS_VERSION 2 → 3，旧档一律按空档处理）。
"""
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, 'index.html')
SW = os.path.join(ROOT, 'sw.js')
LEVELS = os.path.join(ROOT, 'levels')
CHUNKS = os.path.join(ROOT, 'voice', 'chunks')
VOICE_INDEX = os.path.join(CHUNKS, 'index.js')


def new_island(old):
    old = int(old)
    return 1 if old == 13 else old + 1


def rename_two_phase(pairs):
    """pairs: [(src, dst)]；先全部改成 __tmp__ 再改成目标名"""
    tmp = []
    for src, dst in pairs:
        if not os.path.exists(src):
            sys.exit('missing: ' + os.path.basename(src))
        t = os.path.join(os.path.dirname(src), '__tmp__' + os.path.basename(dst))
        os.rename(src, t)
        tmp.append((t, dst))
    for t, dst in tmp:
        if os.path.exists(dst):
            sys.exit('collision: ' + os.path.basename(dst))
        os.rename(t, dst)


def main():
    # ---------- 1. 关卡键重编号 + 图标条件 + 版本号 ----------
    html = open(INDEX, encoding='utf-8').read()
    before = len(re.findall(r"'(?:1[0-3]|[1-9])-[1-5]'", html))

    def key_sub(m):
        return "'%d-%s'" % (new_island(m.group(1)), m.group(2))

    html = re.sub(r"'(1[0-3]|[1-9])-([1-5])'", key_sub, html)
    print('关卡键替换：%d 处' % before)

    # 地图图标：13→1、11→12、12→13（占位符断开链式覆盖）
    icon_pairs = [
        ('if (index === 11) {', 'if (index === @@A@@) {'),
        ('if (index === 12) {', 'if (index === @@B@@) {'),
        ('if (index === 13) {', 'if (index === @@C@@) {'),
    ]
    for old, new in icon_pairs:
        if html.count(old) != 1:
            sys.exit('图标条件出现次数异常：%s × %d' % (old, html.count(old)))
        html = html.replace(old, new)
    html = html.replace('@@A@@', '12').replace('@@B@@', '13').replace('@@C@@', '1')
    print('地图图标条件：11→12、12→13、13→1')

    # ISLANDS：字母岛提到最前（先整行删掉，再插到首位；顺序不能反，否则会插出两个字母岛）
    alpha_line = "    { icon: '🔤', name: '字母与首音' }\n"
    if alpha_line not in html:
        sys.exit('未找到字母岛定义')
    html = html.replace(alpha_line, '', 1)
    html = html.replace("{ icon: '📛', name: '自我介绍' },",
                        "{ icon: '📛', name: '自我介绍' }", 1)
    html = html.replace("  var ISLANDS = [\n",
                        "  var ISLANDS = [\n    { icon: '🔤', name: '字母与首音' },\n", 1)
    print('ISLANDS：字母岛置于首位')

    # 存档版本 2 → 3（旧档作废）
    html = html.replace('var PROGRESS_VERSION = 2;', 'var PROGRESS_VERSION = 3;', 1)
    # 版本闸门 + out 里带上 version
    html = html.replace(
        "      unlockedIsland: 1, unlockedLevel: { 1: 1 }, cleared: {}, stars: {},\n"
        "      lastPlayed: null, levelMistakes: {}, wordStats: {}, daily: {}\n"
        "    };\n"
        "    if (!raw || typeof raw !== 'object') return out;",
        "      version: PROGRESS_VERSION,\n"
        "      unlockedIsland: 1, unlockedLevel: { 1: 1 }, cleared: {}, stars: {},\n"
        "      lastPlayed: null, levelMistakes: {}, wordStats: {}, daily: {}\n"
        "    };\n"
        "    if (!raw || typeof raw !== 'object') return out;\n"
        "    /* 岛序重编号（2026-11-13）：第 13 岛提到第 1，其余顺移。旧档的 12-5 现在\n"
        "       对应「自我介绍」，进度会整片错位，所以版本不符一律按空档处理。 */\n"
        "    if (raw.version !== PROGRESS_VERSION) return out;", 1)
    open(INDEX, 'w', encoding='utf-8', newline='').write(html)

    # ---------- 2. 关卡文件改名 ----------
    pairs = []
    for n in range(1, 14):
        src = os.path.join(LEVELS, 'island-%02d.js' % n)
        pairs.append((src, os.path.join(LEVELS, 'island-%02d.js' % new_island(n))))
    rename_two_phase(pairs)
    print('levels/ 改名 %d 个' % len(pairs))

    # ---------- 3. 语音分块改名 ----------
    chunk_pairs = []
    for name in sorted(os.listdir(CHUNKS)):
        m = re.match(r'island_(\d+)_(\d+)\.js$', name)
        if not m:
            continue
        old_i, lv = int(m.group(1)), m.group(2)
        chunk_pairs.append((os.path.join(CHUNKS, name),
                            os.path.join(CHUNKS, 'island_%d_%s.js' % (new_island(old_i), lv))))
    rename_two_phase(chunk_pairs)
    print('voice/chunks 改名 %d 个' % len(chunk_pairs))

    # ---------- 4. 语音索引重映射 ----------
    vi = open(VOICE_INDEX, encoding='utf-8').read()
    def chunk_sub(m):
        return '"island_%d_%s"' % (new_island(m.group(1)), m.group(2))
    vi2 = re.sub(r'"island_(\d+)_(\d+)"', chunk_sub, vi)
    open(VOICE_INDEX, 'w', encoding='utf-8', newline='').write(vi2)
    print('语音索引重映射：%d 处' % len(re.findall(r'"island_\d+_\d+"', vi)))

    # ---------- 5. sw 版本 ----------
    sw = open(SW, encoding='utf-8').read()
    sw = sw.replace("var CACHE = 'lilearn-v20';", "var CACHE = 'lilearn-v21';", 1)
    open(SW, 'w', encoding='utf-8', newline='').write(sw)
    print('sw 升 v21')


if __name__ == '__main__':
    main()
