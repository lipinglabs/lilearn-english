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


def main() -> int:
    files = {p.stem: p for p in FRUIT_DIR.glob("*.png")}
    missing = [k for k in ORDER if k not in files]
    if missing:
        print(f"缺少水果图：{missing}", file=sys.stderr)
        return 1

    lines = [MARK_START, "window.FRUIT_IMG = {"]
    total = 0
    for key in ORDER:
        data = files[key].read_bytes()
        total += len(data)
        uri = "data:image/png;base64," + base64.b64encode(data).decode("ascii")
        parts = [uri[i:i + CHUNK] for i in range(0, len(uri), CHUNK)]
        body = "".join(f'    "{p}" +\n' for p in parts[:-1]) + f'    "{parts[-1]}"'
        lines.append(f"  {key}:")
        lines.append(body + ",")
        print(f"  {key:<12} {len(data):>6} 字节")
    lines.append("};")
    lines.append(MARK_END)
    snippet = "\n".join(lines)

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
