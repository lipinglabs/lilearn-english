#!/usr/bin/env python3
"""把「字母岛（新第 1 岛）借用新 13-2 的 7 句」放进一个**全新分块** l13_shared.js。

为什么不直接追加到 island_1_1.js
----------------------------------
index.html / SW 对 voice/chunks/*.js 是 cache-first，且浏览器自身还有一层
HTTP 缓存。实测：给 island_1_1.js 追加 7 条后，fetch(cache:'reload') 能拿到
新文件，但 <script src> 仍执行旧副本 —— 家长设备上大概率同样拿旧缓存，
于是照样静音。改用**从未出现过的文件名**，任何缓存都不会命中，必然回源。

背景
----
岛序重编号（原 13 岛 → 新 1 岛）后，runL13Tutorial 里硬编码的
loadVoiceChunk('island_12_2') 指向重编号前的分块（装的是 l112_*），
拿不到要用的 l122_* 句子；say() 兜底在缓存下也可能失败。
第 1 关教学互动用 l122_t_find，题型 A/B/C 的 override 用另外 6 句。

做法
----
不复造音频（同句同 key 是 RULES §一.12 的复用规则，重新合成会音色漂移）。
  · 生成 voice/chunks/l13_shared.js（7 条，约 228KB base64）
  · VOICE_CHUNK_FOR 中这 7 个 key 改指 l13_shared
  · VOICE_CHUNK_OF_LEVEL['1-1'] 与 OF_ISLAND[1] 追加 l13_shared
  · island_1_1.js 恢复原状（不追加，避免同一 key 两处定义）
新 13-2 关仍从 island_13_2 取这 7 句，不受影响。

幂等：可重复运行。
用法：python tools/add-l13-shared-voice.py [--check]
"""
from __future__ import annotations

import argparse
import base64
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOICE_DIR = ROOT / "voice"
CHUNK_DIR = VOICE_DIR / "chunks"
SHARED_FILE = CHUNK_DIR / "l13_shared.js"
INDEX = CHUNK_DIR / "index.js"
ORIGINAL_CHUNK = CHUNK_DIR / "island_1_1.js"
BACKUP = ROOT / "backups-voice-fix-20261114" / "island_1_1.js"

# 与 L13_AUDIO_OVERRIDE（index.html）一一对应，共 7 句
SHARED = [
    "l122_t_find",                                   # qa: at
    "l122_b_a", "l122_b_b", "l122_b_c",             # qb: at / buh / kuh
    "l122_c_apple", "l122_c_ball", "l122_c_cat",    # qc: apple / ball / cat
]
NAME = "l13_shared"


def data_uri(key: str) -> str:
    p = VOICE_DIR / (key + ".mp3")
    if not p.exists():
        raise SystemExit("缺少语音真源: " + str(p))
    return "data:audio/mpeg;base64," + base64.b64encode(p.read_bytes()).decode("ascii")


def write_shared() -> None:
    lines = [
        "/* 自动生成，请勿手改 —— 由 tools/add-l13-shared-voice.py 从 voice/*.mp3 生成 */",
        "/* 新第 1 岛（字母与首音）借用新 13-2 的 7 句；独立分块以绕开历史缓存 */",
        "window.VOICE_BANK = Object.assign(window.VOICE_BANK || {}, {",
    ]
    for k in SHARED:
        lines.append('"%s":"%s",' % (k, data_uri(k)))
    lines.append("});")
    SHARED_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="")


def patch_index() -> None:
    s = INDEX.read_text(encoding="utf-8")

    # 1) FOR：7 个 key 改指新分块
    for k in SHARED:
        pat = re.compile(r'"%s"\s*:\s*"[^"]+"' % re.escape(k))
        if not pat.search(s):
            raise SystemExit("index.js 中找不到 key: " + k)
        s = pat.sub('"%s":"%s"' % (k, NAME), s, count=1)

    # 2) OF_LEVEL['1-1'] 追加（若还没有）
    m = re.search(r'"1-1"\s*:\s*\[([^\]]*)\]', s)
    if not m:
        raise SystemExit("index.js 中找不到 OF_LEVEL['1-1']")
    if NAME not in m.group(1):
        items = [x.strip().strip('"') for x in m.group(1).split(",") if x.strip()]
        items.append(NAME)
        s = s[:m.start()] + '"1-1":[' + ",".join('"%s"' % x for x in items) + "]" + s[m.end():]

    # 3) OF_ISLAND[1] 追加
    m = re.search(r'(window\.VOICE_CHUNK_OF_ISLAND\s*=\s*\{[\s\S]*?\n)1\s*:\s*\[([^\]]*)\]', s)
    if not m:
        raise SystemExit("index.js 中找不到 OF_ISLAND[1]")
    if NAME not in m.group(2):
        items = [x.strip().strip('"') for x in m.group(2).split(",") if x.strip()]
        items.append(NAME)
        full = m.group(0)
        pos = full.rindex("[")
        new_full = full[:pos] + "[" + ",".join('"%s"' % x for x in items) + "]"
        s = s[:m.start()] + new_full + s[m.end():]

    INDEX.write_text(s, encoding="utf-8", newline="")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只检查，不写入")
    args = ap.parse_args()

    if args.check:
        ok = SHARED_FILE.exists() and INDEX.exists()
        if ok:
            s = INDEX.read_text(encoding="utf-8")
            ok = all(('"%s":"%s"' % (k, NAME)) in s for k in SHARED)
            ok = ok and '"1-1":["island_1_1","%s"]' % NAME in s
        print("共用分块:", "OK" if ok else "缺失/未登记")
        return 0 if ok else 1

    # 恢复 island_1_1.js 到追加前的版本（若备份存在）
    if BACKUP.exists():
        cur = ORIGINAL_CHUNK.read_text(encoding="utf-8")
        if "l122_t_find" in cur:
            ORIGINAL_CHUNK.write_text(BACKUP.read_text(encoding="utf-8"), encoding="utf-8", newline="")
            print("已恢复 island_1_1.js（移除上一轮的追加）")

    write_shared()
    print("生成 %s（%d 条，%d 字节）" % (SHARED_FILE.name, len(SHARED), SHARED_FILE.stat().st_size))
    patch_index()
    print("index.js：7 个 key 改指 %s；OF_LEVEL['1-1'] / OF_ISLAND[1] 已登记" % NAME)
    return main_check()


def main_check() -> int:
    import subprocess
    import sys
    r = subprocess.run([sys.executable, str(Path(__file__)), "--check"], capture_output=True, text=True)
    print(r.stdout.strip())
    return 0 if r.returncode == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
