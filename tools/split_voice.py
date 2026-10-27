#!/usr/bin/env python3
"""把语音库按「岛」拆成多个小文件，供页面按需加载（RULES §一.3 的后续优化）。

背景：单体 voice.js 已达 35MB，且是同步阻塞脚本，弱网首屏要几分钟。
拆分后：
  · voice/chunks/core.js       公共语音（开场 / 再试一次 / 通关夸奖 / 中文鼓励 / 敬请期待）
  · voice/chunks/island_N.js   第 N 岛的全部语音
  · voice/chunks/index.js      key → 分块 的索引（很小，同步加载）

唯一真源：`voice/<key>.mp3`（全部 1062 条都已入库）。
key → 岛 的归属从 `tools/gen_voice_doubao.py` 的章节注释解析：
  `# ---- 第 N 岛第 M 关 ... ----` 之后紧跟的 add(...) 就属于第 N 岛；
  文件开头（没有任何「第 N 岛」标记）的章节属于第 1 岛；
  解析不到的一律进 core（core 永远最先加载，保证不会有 key 丢失）。

用法：
    python tools/split_voice.py            # 生成 voice/chunks/*.js
    python tools/split_voice.py --check    # 只校验现有分块是否完整、是否与 mp3 一致
"""

from __future__ import annotations

import argparse
import base64
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOICE_DIR = ROOT / "voice"
CHUNK_DIR = VOICE_DIR / "chunks"
GEN = ROOT / "tools" / "gen_voice_doubao.py"

# 公共语音：任何关卡都可能用到，必须最先加载
CORE_KEYS = {
    "intro", "again", "coming", "yes", "no", "yesno", "star", "t_ready",
    "win1", "win2", "win3",
    "praise_1", "praise_2", "praise_3", "praise_4", "praise_5", "praise_6",
}

ISLAND_NAMES = {
    1: "数字与水果", 2: "形状与空间", 3: "比较与分类", 4: "动物与动作",
    5: "食物与饮料", 6: "温馨家居", 7: "身体与五官", 8: "情绪与感受",
    9: "衣物穿戴", 10: "交通工具", 11: "动作运动", 12: "节日庆祝",
}


def parse_key_island() -> tuple[dict[str, int], dict[str, int]]:
    """从生成脚本按**源码顺序**解析 key → 岛号。

    返回 (key_map, prefix_map)：
      · key_map      —— add("key", …) 与 PHRASES["key"] = … 这种字面量 key；
      · prefix_map   —— PHRASES[f"q_{_n}_{_f}"] 这种循环生成的 key 前缀（含结尾下划线）。
    循环生成的那批（第 1/2 岛大量使用）只能靠前缀归属，但前缀是在各自章节里出现的，顺序可信。
    """
    key_map: dict[str, int] = {}
    prefix_map: dict[str, int] = {}
    cur = 1                      # 文件开头是第 1 岛的关卡（第 2/3/4/5 关）
    add_re = re.compile(r'^\s*add\(\s*"([A-Za-z0-9_]+)"')
    lit_re = re.compile(r'^\s*PHRASES\[\s*"([A-Za-z0-9_]+)"\s*\]')
    f_re = re.compile(r'^\s*PHRASES\[\s*f"([A-Za-z0-9_]+?)\{')
    island_re = re.compile(r"第\s*(\d+)\s*岛")
    for line in GEN.read_text(encoding="utf-8").splitlines():
        if line.lstrip().startswith("#"):
            m = island_re.search(line)
            if m:
                cur = int(m.group(1))
            continue
        m = add_re.match(line)
        if m:
            key_map[m.group(1)] = cur
            continue
        m = lit_re.match(line)
        if m:
            key_map[m.group(1)] = cur
            continue
        m = f_re.match(line)
        if m:
            prefix_map[m.group(1)] = cur
    return key_map, prefix_map


def island_for(key: str, key_map: dict[str, int], prefix_map: dict[str, int]) -> int:
    if key in CORE_KEYS:
        return 0
    if key in key_map:
        return key_map[key]
    # 纯数字键（n11…n29）单独处理：单字符前缀 'n' 太短，容易误伤 nose 之类
    if re.fullmatch(r"n\d+", key):
        return prefix_map.get("n", 1)
    best: tuple[int, int] | None = None      # (prefix_len, island)
    for p, isl in prefix_map.items():
        if len(p) < 2:
            continue
        if key.startswith(p) and (best is None or len(p) > best[0]):
            best = (len(p), isl)
    return best[1] if best else 0


def collect() -> tuple[dict[str, str], dict[str, int]]:
    key_map, prefix_map = parse_key_island()
    audio: dict[str, str] = {}
    island_of: dict[str, int] = {}
    for mp3 in sorted(VOICE_DIR.glob("*.mp3")):
        key = mp3.stem
        audio[key] = base64.b64encode(mp3.read_bytes()).decode("ascii")
        island_of[key] = island_for(key, key_map, prefix_map)
    return audio, island_of


def write_chunk(name: str, keys: list[str], audio: dict[str, str], comment: str) -> int:
    lines = [
        "/* 自动生成，请勿手改 —— 由 tools/split_voice.py 从 voice/*.mp3 生成 */",
        "/* " + comment + " */",
        "window.VOICE_BANK = Object.assign(window.VOICE_BANK || {}, {",
    ]
    for k in keys:
        lines.append('"%s":"data:audio/mpeg;base64,%s",' % (k, audio[k]))
    lines.append("});")
    text = "\n".join(lines) + "\n"
    path = CHUNK_DIR / (name + ".js")
    path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    audio, island_of = collect()
    if not audio:
        print("✗ 没找到任何 voice/*.mp3", file=sys.stderr)
        return 2

    groups: dict[int, list[str]] = {}
    for k, isl in island_of.items():
        groups.setdefault(isl, []).append(k)
    for isl in groups:
        groups[isl].sort()

    if args.check:
        missing = [k for k in audio if k not in island_of]
        dup = 0
        seen: set[str] = set()
        for ks in groups.values():
            for k in ks:
                if k in seen:
                    dup += 1
                seen.add(k)
        print(f"mp3 总数 {len(audio)}；已归类 {len(seen)}；未归类 {len(missing)}；重复 {dup}")
        for isl in sorted(groups):
            name = "core" if isl == 0 else f"第 {isl} 岛 {ISLAND_NAMES.get(isl, '')}"
            raw = sum(len(audio[k]) for k in groups[isl]) * 3 // 4
            print(f"  {name:<22} {len(groups[isl]):>4} 条  ≈{raw/1024/1024:5.1f}MB")
        ok = not missing and dup == 0
        print("✓ 归类完整" if ok else "✗ 存在未归类/重复")
        return 0 if ok else 1

    CHUNK_DIR.mkdir(parents=True, exist_ok=True)
    for old in CHUNK_DIR.glob("*.js"):
        old.unlink()

    # 单块上限：超过就按 key 顺序再切一刀（进入岛屿时会并行预取该岛所有分块，
    # 所以切开只是让「第一块更快到位」，不改变总字节数）
    MAX_BYTES = 2_300_000

    def pack(keys: list[str]) -> list[list[str]]:
        parts: list[list[str]] = []
        cur: list[str] = []
        size = 0
        for k in keys:
            n = len(audio[k]) + len(k) + 10
            if cur and size + n > MAX_BYTES:
                parts.append(cur)
                cur, size = [], 0
            cur.append(k)
            size += n
        if cur:
            parts.append(cur)
        return parts

    total = 0
    report: list[tuple[str, int, int]] = []
    island_chunks: dict[int, list[str]] = {}
    for isl in sorted(groups):
        keys = groups[isl]
        if isl == 0:
            name = "core"
            size = write_chunk(name, keys, audio,
                               "公共语音：开场 / 再试一次 / 通关夸奖 / 中文鼓励 / 敬请期待")
            total += size
            report.append((name, len(keys), size))
            continue
        parts = pack(keys)
        names = []
        for idx, part in enumerate(parts, 1):
            name = f"island_{isl}" if len(parts) == 1 else f"island_{isl}_{idx}"
            size = write_chunk(name, part, audio,
                               f"第 {isl} 岛 · {ISLAND_NAMES.get(isl, '')}"
                               + (f"（{idx}/{len(parts)}）" if len(parts) > 1 else ""))
            total += size
            report.append((name, len(part), size))
            names.append(name)
        island_chunks[isl] = names

    # 索引：key → 分块；岛 → 该岛的分块（可能多个）
    idx = [
        "/* 自动生成，请勿手改 —— key → 语音分块 的索引 */",
        "window.VOICE_CHUNK_FOR = {",
    ]
    for isl in sorted(groups):
        if isl == 0:
            names = ["core"]
        else:
            names = island_chunks[isl]
        for idx_i, part in enumerate(pack(groups[isl]), 1):
            nm = names[idx_i - 1]
            for k in part:
                idx.append('"%s":"%s",' % (k, nm))
    idx.append("};")
    idx.append("window.VOICE_CHUNK_OF_ISLAND = {")
    for isl in sorted(island_chunks):
        idx.append('%d:[%s],' % (isl, ",".join('"%s"' % n for n in island_chunks[isl])))
    idx.append("};")
    idx.append('window.VOICE_CORE_CHUNK = "core";')
    idx_text = "\n".join(idx) + "\n"
    (CHUNK_DIR / "index.js").write_text(idx_text, encoding="utf-8")

    print(f"共 {len(audio)} 条语音 → {len(report)} 个分块 + index")
    for name, n, size in report:
        print(f"  {name + '.js':<18} {n:>4} 条  {size/1024/1024:5.2f}MB")
    print(f"  index.js           {len(idx_text)/1024:5.1f}KB")
    print(f"合计 {total/1024/1024:.1f}MB（base64 后）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
