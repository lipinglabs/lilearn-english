#!/usr/bin/env python3
"""把 assets/fruit/*.png 以 base64 内联进 index.html（保持单文件）。

图片来源：microsoft/fluentui-emoji 的 3D 资源（MIT 许可，256×256 RGBA 透明背景）。
"""

from __future__ import annotations

import base64
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRUIT_DIR = ROOT / "assets" / "fruit"
HTML_PATH = ROOT / "index.html"

MARK_START = "/* FRUIT_IMG_START */"
MARK_END = "/* FRUIT_IMG_END */"
CHUNK = 4000

ORDER = ["apple", "banana", "strawberry", "grape", "trophy",
         "digit0", "digit1", "digit2", "digit3", "digit4",
         "digit5", "digit6", "digit7", "digit8", "digit9"]

# 第 4 关（颜色）染色素材：apple/balloon/car × 4 色（+ 灰）
COLOR_ORDER = [f"{item}_{c}" for item in ("apple", "balloon", "car")
               for c in ("red", "blue", "yellow", "green")]
# 第 5 关题型 B 的彩色水果（香蕉剥皮双层色块染色会串色，故不染）
COLOR_ORDER += [f"{item}_{c}" for item in ("strawberry", "grape")
                for c in ("red", "blue", "yellow")]
COLOR_ORDER += ["balloon_gray", "car_gray"]

ANIMAL_DIR = ROOT / "assets" / "animal"
# 第 3 岛（比较与分类）用到的动物：同样来自 microsoft/fluentui-emoji 的 3D 资源，
# 由 make_animals.py 统一缩放到 192px，禁止调用任何生图接口。
ANIMAL_ORDER = ["elephant", "mouse", "dog", "cat"]


def emit(lines: list[str], bank: str, mapping: dict[str, Path], total_box: list[int]) -> None:
    lines.append(f"window.{bank} = {{")
    for key, path in mapping.items():
        data = path.read_bytes()
        total_box[0] += len(data)
        uri = "data:image/png;base64," + base64.b64encode(data).decode("ascii")
        parts = [uri[i:i + CHUNK] for i in range(0, len(uri), CHUNK)]
        body = "".join(f'    "{p}" +\n' for p in parts[:-1]) + f'    "{parts[-1]}"'
        lines.append(f"  {key}:")
        lines.append(body + ",")
        print(f"  {key:<16} {len(data):>6} 字节")
    lines.append("};")


def main() -> int:
    files = {p.stem: p for p in FRUIT_DIR.glob("*.png")}
    missing = [k for k in ORDER if k not in files]
    if missing:
        print(f"缺少水果图：{missing}", file=sys.stderr)
        return 1

    color_dir = ROOT / "assets" / "color"
    color_files = {p.stem: p for p in color_dir.glob("*.png")}
    missing_c = [k for k in COLOR_ORDER if k not in color_files]
    if missing_c:
        print(f"缺少颜色图：{missing_c}（先跑 tools/make_colors.py）", file=sys.stderr)
        return 1

    animal_files = {p.stem: p for p in ANIMAL_DIR.glob("*.png")}
    missing_a = [k for k in ANIMAL_ORDER if k not in animal_files]
    if missing_a:
        print(f"缺少动物图：{missing_a}（先跑 tools/make_animals.py）", file=sys.stderr)
        return 1

    lines = [MARK_START]
    total_box = [0]
    emit(lines, "FRUIT_IMG", {k: files[k] for k in ORDER}, total_box)
    emit(lines, "COLOR_IMG", {k: color_files[k] for k in COLOR_ORDER}, total_box)
    emit(lines, "ANIMAL_IMG", {k: animal_files[k] for k in ANIMAL_ORDER}, total_box)
    lines.append(MARK_END)
    snippet = "\n".join(lines)
    total = total_box[0]

    html = HTML_PATH.read_text(encoding="utf-8")
    if MARK_START not in html or MARK_END not in html:
        print("index.html 缺少水果图标记", file=sys.stderr)
        return 1
    head, rest = html.split(MARK_START, 1)
    _, tail = rest.split(MARK_END, 1)
    HTML_PATH.write_text(head + snippet + tail, encoding="utf-8")
    print(f"\n共 {len(ORDER)} 张图、{total} 字节 PNG，已内联至 index.html")
    return 0


if __name__ == "__main__":
    sys.exit(main())
