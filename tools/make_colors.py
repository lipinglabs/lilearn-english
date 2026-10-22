#!/usr/bin/env python3
"""把 Fluent 3D 素材染成指定颜色，用于「颜色初体验」关卡。

原理：只在「本体色相带」内替换 hue，保留明度/饱和度轮廓；
叶子、果柄、车窗、轮胎、车灯等落在带外的像素原样保留，
所以染出来的蓝苹果依旧是绿叶子 + 褐果柄，不会整只变蓝。

用法：python tools/make_colors.py
输出：assets/color/<item>_<color>.png（160×160 RGBA）
"""

from __future__ import annotations

import colorsys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC_FRUIT = ROOT / "assets" / "fruit"
OUT = ROOT / "assets" / "color"
SIZE = 160

# 每种素材的「本体色相」与容差（度）
BODY_HUE = {
    "apple": (355, 42),
    "balloon": (345, 45),
    "car": (350, 40),
}

COLORS = {
    "red": 356,
    "blue": 212,
    "yellow": 48,
    "green": 130,
}

# 需要染色的素材：key -> 源文件
SOURCES = {
    "apple": ROOT / "assets" / "fruit" / "apple.png",
    "balloon": ROOT / "_base_balloon.png",
    "car": ROOT / "_base_car.png",
}


def hue_dist(a: float, b: float) -> float:
    d = abs(a - b) % 360
    return min(d, 360 - d)


def recolor(img: Image.Image, body_hue: float, tol: float,
            target_hue: float | None, gray: bool) -> Image.Image:
    """target_hue=None 且 gray=True 时输出灰色版本。"""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            hh, ss, vv = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            deg = hh * 360
            if hue_dist(deg, body_hue) > tol:
                continue          # 带外像素（叶子/车窗/轮胎）保持原样
            if ss < 0.10:
                continue          # 近灰像素（反光、白高光）不动
            if gray:
                nr, ng, nb = colorsys.hsv_to_rgb(hh, 0.04, min(1.0, vv * 0.94 + 0.05))
            else:
                nh = (target_hue % 360) / 360.0
                ns = min(1.0, max(ss * 1.02, 0.62))
                nr, ng, nb = colorsys.hsv_to_rgb(nh, ns, vv)
            px[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
    return img


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    made = []
    for key, src in SOURCES.items():
        if not src.exists():
            print(f"缺少源图：{src}")
            continue
        base = Image.open(src).convert("RGBA")
        body_hue, tol = BODY_HUE[key]
        for cname, chue in COLORS.items():
            out = recolor(base, body_hue, tol, chue, gray=False)
            out = out.resize((SIZE, SIZE), Image.LANCZOS)
            p = OUT / f"{key}_{cname}.png"
            out.save(p, optimize=True)
            made.append((p, p.stat().st_size))
        if key != "apple":
            g = recolor(base, body_hue, tol, None, gray=True)
            g = g.resize((SIZE, SIZE), Image.LANCZOS)
            p = OUT / f"{key}_gray.png"
            g.save(p, optimize=True)
            made.append((p, p.stat().st_size))

    for p, size in made:
        print(f"  ✓ {p.name:<22} {size:>6} 字节")
    print(f"共 {len(made)} 张，总 {sum(s for _, s in made)} 字节")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
