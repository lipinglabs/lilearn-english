#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""renumber-4y.py — 「4 岁起步」岛序重排（专家团裁决·最小改动版，只移 3 个岛）。

依据：《专家团意见清单》D1 / D2、附录 A 裁决 1（主推最小改动版）。
起步岛 = 数字与水果（具体实物主题），不采用理想岛序的「身体与五官当第 1 岛」。

新岛号 ← 原岛号（清单给的映射，原岛号 = 本轮改动前的现状）：
    1←2  2←13 3←3  4←4  5←5  6←6  7←7
    8←8  9←10 10←11 11←12 12←9  13←1
等价的「原岛号 → 新岛号」（OLD2NEW，脚本内部用它做重映射）：
    1→13（字母与首音）  2→1（数字与水果）  9→12（情绪与感受）
    10→9（衣物穿戴）   11→10（交通工具） 12→11（童话故事）
    13→2（自我介绍）   3..8 原样不动

岛号同时绑着的东西，必须一步到位一起搬：
  1) index.html 里所有 '岛-关' 单引号字面量：LEVEL_DEFS 65 个键 + TUTORIALS 教学键
     + 注释里的 VOICE_CHUNK_OF_LEVEL['x-y'] 引用；
  2) ISLANDS 数组（地图顺序 + 名称 + emoji 图标）；
  3) islandIconNode 的 index 硬编码 → 改按「主题名」查表，与岛号彻底解耦
     （上轮 renumber-islands.py 只改了 11/12/13 三个条件，1–10 号图标整体错位一位）；
  4) index.html 里硬编码 loadVoiceChunk('island_N_M') 的跨岛复用补丁；
  5) PROGRESS_VERSION 3→4（旧档按版本号清空；保留 normalizeProgress 补空壳，云合并不崩）；
  6) 派生标志 isFirstLevelOfIsland / isStartingLevel（禁止硬编码岛号）；
  7) VOICE_CHUNK_REV '20261114a'→'20261114b'（分块 URL 失效重取）；
  8) voice/chunks/index.js：VOICE_CHUNK_FOR 的 value、VOICE_CHUNK_OF_LEVEL 的 key+value、
     VOICE_CHUNK_OF_ISLAND 的 key+value 里 island_N[_M] 的岛号重映射；
     **语音 key（VOICE_CHUNK_FOR 的键）零改动、零新增**；
  9) 物理文件两阶段改名：levels/island-NN.js、voice/chunks/island_N[_M].js；
 10) sw.js：CACHE v24→v25、SHELL 里 index.js/core.js 的 ?v= rev 递增。

硬约束（违反即判定失败）：
  - 0 项改题干语音文案、0 项新增语音 key：1351 条 key 集合不动，mp3 数据零改动；
  - Gist payload 结构 / 字段 / 版本号不变：settings/usage 为独立 localStorage 分区，
    不进云同步白名单（由后续 A 组落地，本脚本不碰 progress 字段形状）；
  - 用派生标志判断起步关，不硬编码岛号。

跑法：python tools/renumber-4y.py   （幂等防呆：只接受 v3/v24/首岛=字母与首音 的初始态）
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, 'index.html')
SW = os.path.join(ROOT, 'sw.js')
LEVELS = os.path.join(ROOT, 'levels')
CHUNKS = os.path.join(ROOT, 'voice', 'chunks')
VOICE_INDEX = os.path.join(CHUNKS, 'index.js')

# 原岛号 → 新岛号（4 岁起步·最小改动版，见文件头表格）
OLD2NEW = {1: 13, 2: 1, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7,
           8: 8, 9: 12, 10: 9, 11: 10, 12: 11, 13: 2}

# 新岛序（新岛号, emoji, 主题名） = 清单 D1 表
NEW_ISLANDS = [
    (1,  '\U0001F34E', '数字与水果'),   # ← 原 2（起步岛：具体实物主题）
    (2,  '\U0001F4DB', '自我介绍'),     # ← 原 13
    (3,  '\U0001F53A', '形状与空间'),   # ← 原 3
    (4,  '\U0001F418', '比较与分类'),   # ← 原 4
    (5,  '\U0001F981', '动物与动作'),   # ← 原 5
    (6,  '\U0001F370', '食物与饮料'),   # ← 原 6
    (7,  '\U0001F3E0', '温馨家居'),     # ← 原 7
    (8,  '\U0001F476', '身体与五官'),   # ← 原 8
    (9,  '\U0001F455', '衣物穿戴'),     # ← 原 10
    (10, '\U0001F697', '交通工具'),     # ← 原 11
    (11, '\U0001F437', '童话故事'),     # ← 原 12
    (12, '\U0001F642', '情绪与感受'),   # ← 原 9
    (13, '\U0001F524', '字母与首音'),   # ← 原 1
]

# islandIconNode：原 index 条件 → 该分支图标实际对应的「主题名」
# （按图标语义判定，而非当前岛号；上轮重编号后 1–10 号图标整体错位一位）
ICON_BY_OLD_INDEX = {
    '1_return': '数字与水果',   # 3D 苹果 fruitImg
    '3': '比较与分类',          # 3D 大象 elephant
    '4': '动物与动作',          # 3D 狮子 lion
    '5': '食物与饮料',          # 面包 bread
    '6': '温馨家居',            # 小房子 house
    '7': '身体与五官',          # 笑脸 face
    '8': '情绪与感受',          # 三连情绪脸 emotion
    '9': '衣物穿戴',            # 小上衣 tee
    '10': '交通工具',           # 小汽车 car
    '12': '童话故事',           # 小猪脸 pig
    '13': '自我介绍',           # 挂名字牌的小孩 kid
    '1_block': '字母与首音',    # 字母积木 blocks
    '2': '形状与空间',          # 三色形状 box
}


def die(msg):
    sys.exit('[renumber-4y] 中止：' + msg)


def must_once(text, old, label):
    """精确替换前的防呆：old 必须且只能出现 1 次"""
    n = text.count(old)
    if n != 1:
        die('%s 期望 1 处，实际 %d 处' % (label, n))


def rename_two_phase(pairs):
    """pairs: [(src, dst)]；先全部改成 __tmp__ 再改成目标名，避免链式覆盖撞名"""
    tmp = []
    for src, dst in pairs:
        if not os.path.exists(src):
            die('缺文件：' + os.path.basename(src))
        t = os.path.join(os.path.dirname(src), '__tmp4y__' + os.path.basename(dst))
        os.rename(src, t)
        tmp.append((t, dst))
    for t, dst in tmp:
        if os.path.exists(dst):
            die('目标已存在（撞名）：' + os.path.basename(dst))
        os.rename(t, dst)
    return len(pairs)


def new_island(old):
    return OLD2NEW[int(old)]


def main():
    html = open(INDEX, encoding='utf-8').read()
    sw = open(SW, encoding='utf-8').read()
    vi = open(VOICE_INDEX, encoding='utf-8').read()

    # ---------- 防呆：只接受初始态，防止重复运行把映射叠加 ----------
    if 'var PROGRESS_VERSION = 3;' not in html:
        die('index.html 不是 v3 初始态（PROGRESS_VERSION 已改？）')
    if "var CACHE = 'lilearn-v24';" not in sw:
        die('sw.js 不是 v24 初始态（CACHE 已改？）')
    if "{ icon: '\U0001F524', name: '字母与首音' },\n    { icon: '\U0001F34E'" not in html:
        die('ISLANDS 首岛不是「字母与首音」（可能已重排过）')

    # ---------- 1. '岛-关' 字面量重映射（一次正则，无链式覆盖） ----------
    # 覆盖：LEVEL_DEFS 65 键、TUTORIALS 教学键、注释 VOICE_CHUNK_OF_LEVEL['x-y']。
    # 4 岁起步：岛号按 OLD2NEW 平移，关号永远不变。
    key_re = re.compile(r"'(1[0-3]|[1-9])-([1-5])'")

    def key_sub(m):
        return "'%d-%s'" % (new_island(m.group(1)), m.group(2))

    n_keys = len(key_re.findall(html))
    html = key_re.sub(key_sub, html)
    print('[1] index.html 岛-关字面量重映射：%d 处' % n_keys)

    # ---------- 2. ISLANDS 数组整体换成新序 ----------
    old_islands = (
        "  var ISLANDS = [\n"
        "    { icon: '\U0001F524', name: '字母与首音' },\n"
        "    { icon: '\U0001F34E', name: '数字与水果' },\n"
        "    { icon: '\U0001F53A', name: '形状与空间' },\n"
        "    { icon: '\U0001F418', name: '比较与分类' },\n"
        "    { icon: '\U0001F981', name: '动物与动作' },\n"
        "    { icon: '\U0001F370', name: '食物与饮料' },\n"
        "    { icon: '\U0001F3E0', name: '温馨家居' },\n"
        "    { icon: '\U0001F476', name: '身体与五官' },\n"
        "    { icon: '\U0001F642', name: '情绪与感受' },\n"
        "    { icon: '\U0001F455', name: '衣物穿戴' },\n"
        "    { icon: '\U0001F697', name: '交通工具' },\n"
        "    { icon: '\U0001F437', name: '童话故事' },\n"
        "    { icon: '\U0001F4DB', name: '自我介绍' }\n"
        "  ];"
    )
    must_once(html, old_islands, 'ISLANDS 旧数组')
    new_islands = "  var ISLANDS = [\n" + "".join(
        "    { icon: '%s', name: '%s' }%s\n" % (ic, nm, ',' if i < 13 else '')
        for i, (_n, ic, nm) in enumerate(NEW_ISLANDS, start=1)
    ) + "  ];"
    html = html.replace(old_islands, new_islands, 1)
    print('[2] ISLANDS 重排为 13 岛新序：起步岛=数字与水果')

    # ---------- 3. islandIconNode 改按主题名查表（与岛号解耦） ----------
    icon_head = "  function islandIconNode(index, island) {\n"
    must_once(html, icon_head, 'islandIconNode 函数头')
    html = html.replace(
        icon_head,
        icon_head +
        "    /* 4 岁起步岛序重排：图标一律按「主题名」查表，与岛号彻底解耦。\n"
        "       上轮 renumber-islands.py 只改了 11/12/13 三个 index 条件，\n"
        "       1–10 号图标整体错位一位（字母首音岛错显苹果）；本次全部改为按 name 命中。 */\n"
        "    var name = island && island.name;\n", 1)
    icon_pairs = [
        ("    if (index === 1) return fruitImg(FRUITS[0]);", "数字与水果"),
        ("    if (index === 3) {", "比较与分类"),
        ("    if (index === 4) {", "动物与动作"),
        ("    if (index === 5) {", "食物与饮料"),
        ("    if (index === 6) {", "温馨家居"),
        ("    if (index === 7) {", "身体与五官"),
        ("    if (index === 8) {", "情绪与感受"),
        ("    if (index === 9) {", "衣物穿戴"),
        ("    if (index === 10) {", "交通工具"),
        ("    if (index === 12) {", "童话故事"),
        ("    if (index === 13) {", "自我介绍"),
        ("    if (index === 1) {", "字母与首音"),
        ("    if (index === 2) {", "形状与空间"),
    ]
    for old, theme in icon_pairs:
        must_once(html, old, '图标条件 ' + repr(old))
        if 'return fruitImg' in old:
            new = "    if (name === '%s') return fruitImg(FRUITS[0]);" % theme
        else:
            new = "    if (name === '%s') {" % theme
        html = html.replace(old, new, 1)
    print('[3] islandIconNode 13 个 index 条件 → 按主题名查表（图标跟随主题，岛序无关）')

    # ---------- 4. 硬编码 loadVoiceChunk('island_N_M') 补丁重映射 ----------
    # 这些是跨岛复用语音的预取补丁，分块所属主题不变，只把分块名的岛号按 OLD2NEW 改。
    patch_re = re.compile(r"loadVoiceChunk\('island_(\d+)(_\d+)?'\)")

    def patch_sub(m):
        return "loadVoiceChunk('island_%d%s')" % (new_island(m.group(1)), m.group(2) or '')

    n_patch = len(patch_re.findall(html))
    html = patch_re.sub(patch_sub, html)
    print('[4] index.html 硬编码分块补丁重映射：%d 处' % n_patch)

    # ---------- 5. PROGRESS_VERSION 3→4 + 版本闸门注释 ----------
    html = html.replace('var PROGRESS_VERSION = 3;', 'var PROGRESS_VERSION = 4;', 1)
    old_gate = (
        "    /* 岛序重编号（2026-11-13）：第 13 岛提到第 1，其余顺移。旧档的 12-5 现在\n"
        "       对应「自我介绍」，进度会整片错位，所以版本不符一律按空档处理。 */\n"
        "    if (raw.version !== PROGRESS_VERSION) return out;"
    )
    must_once(html, old_gate, 'normalizeProgress 版本闸门注释')
    new_gate = (
        "    /* 岛序重排（2026-11-14，4 岁起步·最小改动版）：只移 3 个岛——\n"
        "       字母首音→13、自我介绍→2、情绪→12，数字与水果升为起步岛。\n"
        "       PROGRESS_VERSION 3→4：旧档 cleared / stars / unlockedIsland /\n"
        "       unlockedLevel 的岛号整片错位，按版本号一律清空回空档（私人自用、\n"
        "       孩子刚满 4 周岁，可接受）。normalizeProgress() 仍先补齐空壳，\n"
        "       保证旧 Gist 合并不崩、Gist payload 结构与版本号不变。 */\n"
        "    if (raw.version !== PROGRESS_VERSION) return out;"
    )
    html = html.replace(old_gate, new_gate, 1)
    print('[5] PROGRESS_VERSION 3→4，旧档按版本号清空（保留补空壳/云合并路径）')

    # ---------- 6. 派生标志：判断起步关，禁止硬编码岛号 ----------
    leveldef_block = (
        "  function levelDef(island, level) {\n"
        "    return LEVEL_DEFS[island + '-' + level] || null;\n"
        "  }"
    )
    must_once(html, leveldef_block, 'levelDef 定义')
    derived = leveldef_block + (
        "\n\n"
        "  /* 4 岁起步：起步关 / 岛内首关一律用派生标志判断，禁止硬编码岛号\n"
        "     （项目经历过岛屿彻底重编号，见 PROGRESS_VERSION 3→4）。 */\n"
        "  function firstPlayableIsland() {\n"
        "    for (var i = 1; i <= ISLANDS.length; i++) {\n"
        "      if (levelDef(i, 1)) return i;\n"
        "    }\n"
        "    return 1;\n"
        "  }\n"
        "  function isFirstLevelOfIsland(island, level) {\n"
        "    return level === 1 && !!levelDef(island, 1);\n"
        "  }\n"
        "  function isStartingLevel(island, level) {\n"
        "    return isFirstLevelOfIsland(island, level) && island === firstPlayableIsland();\n"
        "  }"
    )
    html = html.replace(leveldef_block, derived, 1)
    print('[6] 新增派生标志 firstPlayableIsland / isFirstLevelOfIsland / isStartingLevel')

    # ---------- 7. VOICE_CHUNK_REV 递增（分块 URL 失效重取） ----------
    old_rev = "<script>window.VOICE_CHUNK_REV = '20261114a';</script>"
    must_once(html, old_rev, 'VOICE_CHUNK_REV')
    html = html.replace(old_rev,
                        "<script>window.VOICE_CHUNK_REV = '20261114b';</script>", 1)
    print('[7] VOICE_CHUNK_REV 20261114a → 20261114b')

    open(INDEX, 'w', encoding='utf-8', newline='').write(html)

    # ---------- 8. voice/chunks/index.js 重映射 ----------
    # (a) 所有 "island_N" / "island_N_M"（value 里的分块名）按岛号重映射。
    #     l13_shared / core 不是该格式，保持不动；语音 key（VOICE_CHUNK_FOR 的键）零改动。
    chunk_re = re.compile(r'"island_(\d+)(_\d+)?"')

    def chunk_sub(m):
        return '"island_%d%s"' % (new_island(m.group(1)), m.group(2) or '')

    n_chunk = len(chunk_re.findall(vi))
    vi = chunk_re.sub(chunk_sub, vi)

    # (b) VOICE_CHUNK_OF_LEVEL 的 "岛-关" 双引号 key 重映射
    level_key_re = re.compile(r'"(1[0-3]|[1-9])-([1-5])"')

    def level_key_sub(m):
        return '"%d-%s"' % (new_island(m.group(1)), m.group(2))

    n_lvl = len(level_key_re.findall(vi))
    vi = level_key_re.sub(level_key_sub, vi)

    # (c) VOICE_CHUNK_OF_ISLAND 的行首数字 key（0 为 core，保持不变）
    island_key_re = re.compile(r'^(\d+):', re.M)

    def island_key_sub(m):
        n = int(m.group(1))
        return ('0:' if n == 0 else '%d:' % new_island(n))

    n_isl = len(island_key_re.findall(vi))
    vi = island_key_re.sub(island_key_sub, vi)
    open(VOICE_INDEX, 'w', encoding='utf-8', newline='').write(vi)
    print('[8] voice/chunks/index.js：分块名 %d 处、岛-关键 %d 处、岛号键 %d 处重映射'
          % (n_chunk, n_lvl, n_isl))
    print('    （VOICE_CHUNK_FOR 的 1351 条语音 key 集合零改动）')

    # ---------- 9. 物理文件两阶段改名 ----------
    level_pairs = []
    for n in range(1, 14):
        level_pairs.append((
            os.path.join(LEVELS, 'island-%02d.js' % n),
            os.path.join(LEVELS, 'island-%02d.js' % new_island(n)),
        ))
    print('[9] levels/ 改名 %d 个' % rename_two_phase(level_pairs))

    chunk_pairs = []
    for name in sorted(os.listdir(CHUNKS)):
        m = re.match(r'island_(\d+)(_\d+)?\.js$', name)
        if not m:
            continue
        dst = 'island_%d%s.js' % (new_island(m.group(1)), m.group(2) or '')
        chunk_pairs.append((os.path.join(CHUNKS, name), os.path.join(CHUNKS, dst)))
    print('    voice/chunks/ 改名 %d 个（core.js / index.js / l13_shared.js 不动）'
          % rename_two_phase(chunk_pairs))

    # ---------- 10. sw.js：CACHE v25 + SHELL URL rev 递增 ----------
    sw = sw.replace("var CACHE = 'lilearn-v24';", "var CACHE = 'lilearn-v25';", 1)
    sw = sw.replace("index.js?v=20261114a", "index.js?v=20261114b", 1)
    sw = sw.replace("core.js?v=20261114a", "core.js?v=20261114b", 1)
    open(SW, 'w', encoding='utf-8', newline='').write(sw)
    print('[10] sw.js：CACHE v24→v25，index.js/core.js 的 ?v=20261114b')

    print('\n完成。请用 tools/verify-4y.js 逐 key 校验 1351 条映射与结构/版本。')


if __name__ == '__main__':
    main()
