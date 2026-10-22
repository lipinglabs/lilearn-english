#!/usr/bin/env python3
"""准备第 3 岛（比较与分类）需要的 3D 动物图：elephant / mouse / dog / cat。

来源：microsoft/fluentui-emoji 的 3D 资源（MIT 许可，透明通道）。
**这不是生图**：只是把开源仓库里现成的 PNG 下载下来缩放到 192px，
与水果/颜色素材完全同一套风格。严禁改用 Seedream 之类的生图接口（RULES §二.5）。

用法：
    python tools/make_animals.py          # 缺哪张补哪张
    python tools/make_animals.py --force  # 全部重下
"""

from __future__ import annotations

import sys
import tempfile
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "assets" / "animal"
SIZE = 192

BASE = "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets"
ANIMALS = {
    "elephant": "Elephant/3D/elephant_3d.png",
    "mouse": "Mouse/3D/mouse_3d.png",
    "dog": "Dog/3D/dog_3d.png",
    "cat": "Cat/3D/cat_3d.png",
}


def main() -> int:
    force = "--force" in sys.argv
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        for name, rel in ANIMALS.items():
            dst = OUT_DIR / f"{name}.png"
            if dst.exists() and not force:
                print(f"  跳过 {name}（已存在，{dst.stat().st_size} 字节）")
                continue
            url = f"{BASE}/{rel}"
            tmp = Path(td) / f"{name}.png"
            try:
                urllib.request.urlretrieve(url, tmp)
            except Exception as exc:  # 网络失败只报告，不重试（RULES §1.9 同理）
                print(f"  失败 {name}：{exc}", file=sys.stderr)
                return 1
            im = Image.open(tmp).convert("RGBA").resize((SIZE, SIZE), Image.LANCZOS)
            im.save(dst, optimize=True)
            print(f"  {name:<9} {dst.stat().st_size:>6} 字节")
    print(f"\n共 {len(ANIMALS)} 张动物图就绪：{OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
