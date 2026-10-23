#!/usr/bin/env python3
"""准备 3D 动物图：第 3 岛用 elephant / mouse / dog / cat，第 4 岛农场用 pig / cow。

来源：microsoft/fluentui-emoji 的 3D 资源（MIT 许可，透明通道）。
**这不是生图**：只是把开源仓库里现成的 PNG 下载下来缩放到 192px，
与水果/颜色素材完全同一套风格。严禁改用 Seedream 之类的生图接口（RULES §二.13）。

下载通道：优先 raw.githubusercontent.com；本机该域名常被代理拦截（CONNECT 502），
此时自动回退到 GitHub Contents API（`gh api`，凭本机 gh 凭据，只读公开仓库、不涉及本项目密钥）。

用法：
    python tools/make_animals.py          # 缺哪张补哪张
    python tools/make_animals.py --force  # 全部重下
"""

from __future__ import annotations

import base64
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "assets" / "animal"
SIZE = 192

REPO = "microsoft/fluentui-emoji"
BASE = f"https://raw.githubusercontent.com/{REPO}/main/assets"
ANIMALS = {
    "elephant": "Elephant/3D/elephant_3d.png",
    "mouse": "Mouse/3D/mouse_3d.png",
    "dog": "Dog/3D/dog_3d.png",
    "cat": "Cat/3D/cat_3d.png",
    # 第 4 岛第 1 关（农场动物）：猪 / 奶牛
    "pig": "Pig/3D/pig_3d.png",
    "cow": "Cow/3D/cow_3d.png",
    # 第 4 岛第 2 关（野生动物）：狮子 / 老虎 / 猴子（大象复用上面的 elephant）
    "lion": "Lion/3D/lion_3d.png",
    "tiger": "Tiger/3D/tiger_3d.png",
    "monkey": "Monkey/3D/monkey_3d.png",
}


def _fetch_raw(rel: str, dst: Path) -> None:
    urllib.request.urlretrieve(f"{BASE}/{rel}", dst)


def _fetch_api(rel: str, dst: Path) -> None:
    """回退通道：GitHub Contents API（gh api）取 base64 再还原成 PNG。"""
    out = subprocess.run(
        ["gh", "api", f"repos/{REPO}/contents/assets/{rel}", "--jq", ".content"],
        capture_output=True, check=True, timeout=90,
    )
    dst.write_bytes(base64.b64decode(out.stdout))


def download(rel: str, dst: Path) -> None:
    try:
        _fetch_raw(rel, dst)
        if dst.exists() and dst.stat().st_size > 1024:
            return
    except Exception as exc:
        print(f"    raw 通道失败（{type(exc).__name__}），改用 GitHub API 回退")
    _fetch_api(rel, dst)


def main() -> int:
    force = "--force" in sys.argv
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        for name, rel in ANIMALS.items():
            dst = OUT_DIR / f"{name}.png"
            if dst.exists() and not force:
                print(f"  跳过 {name}（已存在，{dst.stat().st_size} 字节）")
                continue
            tmp = Path(td) / f"{name}.png"
            try:
                download(rel, tmp)
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
