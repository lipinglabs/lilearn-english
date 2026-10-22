#!/usr/bin/env python3
"""把证件照处理成 512×512 PWA 图标：抠背景 → 换天空蓝 → 头部居中裁切。

思路：
  1. 证件照背景是均匀纯白（255,255,255），白衬衫带阴影（~196-226），二者亮度可分。
  2. 从四周边缘做 4 连通 BFS，只吃「近白且中性」的像素 —— 这样衬衫的高光不会因为
     与主体断开而误判，背景也不会越过衬衫边缘「漏」进主体。
  3. 对 alpha 做轻微羽化，避免锯齿；再按头部高度比例计算裁切窗口。
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

SRC = Path("_portrait.jpg")
OUT = Path("icon.png")
CUTOUT = Path("_cutout.png")

SKY = (135, 206, 235)      # #87CEEB
SIZE = 512

BG_MIN = 244               # 近白阈值：三通道最小值不低于此
BG_NEUTRAL = 8             # 中性度：max-min 不超过此


def build_alpha(im: Image.Image) -> Image.Image:
    w, h = im.size
    rgb = im.convert("RGB")
    px = rgb.load()

    def is_bg(x: int, y: int) -> bool:
        r, g, b = px[x, y]
        return min(r, g, b) >= BG_MIN and (max(r, g, b) - min(r, g, b)) <= BG_NEUTRAL

    bg = bytearray(w * h)          # 1 = 背景
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_bg(x, y) and not bg[y * w + x]:
                bg[y * w + x] = 1
                dq.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_bg(x, y) and not bg[y * w + x]:
                bg[y * w + x] = 1
                dq.append((x, y))

    while dq:
        x, y = dq.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not bg[ny * w + nx] and is_bg(nx, ny):
                bg[ny * w + nx] = 1
                dq.append((nx, ny))

    filled = sum(bg)
    print(f"  背景占比 {filled / (w * h):.1%}（预期 30%~50%，过高说明漏进了主体）")

    # ---- 按亮度逐层剥离边界 ----
    # 证件照的发丝与白底之间有一圈 200~243 的混色带（不透明），
    # 单靠阈值抠不掉，会形成白色描边。这里沿边界反复剥掉「较亮」的像素，
    # 只剥 4 层，避免把白衬衫整体吃掉。
    mask = [1 - v for v in bg]      # 1 = 主体
    for _ in range(4):
        bgset = [i for i, v in enumerate(bg) if v]
        frontier = set()
        for i in bgset:
            x, y = i % w, i // w
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < w and 0 <= ny < h:
                    j = ny * w + nx
                    if mask[j]:
                        frontier.add(j)
        peeled = 0
        for j in frontier:
            x, y = j % w, j // w
            if min(px[x, y]) > 195:
                mask[j] = 0
                bg[j] = 1
                peeled += 1
        if not peeled:
            break
    print(f"  亮度剥离：仍在主体内的近白像素已清除")

    # ---- 清理发丝缝隙里透出的白底 ----
    # 这些近白像素被头发包围、与外部背景不连通，阈值抠图抓不到；
    # 只处理头部区域（y < 0.5h）且面积很小的连通块，绝对不会误伤白衬衫。
    head_limit = int(h * 0.5)
    visited = bytearray(w * h)
    speck_removed = 0
    for sy in range(head_limit):
        for sx in range(w):
            i0 = sy * w + sx
            if visited[i0] or bg[i0]:
                continue
            r, g, b = px[sx, sy]
            if min(r, g, b) < 225 or (max(r, g, b) - min(r, g, b)) > 14:
                continue
            comp = []
            dq2 = deque([(sx, sy)])
            visited[i0] = 1
            while dq2:
                cx, cy = dq2.popleft()
                comp.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < head_limit:
                        j = ny * w + nx
                        if not visited[j] and not bg[j]:
                            rr, gg, bb = px[nx, ny]
                            if min(rr, gg, bb) >= 225 and (max(rr, gg, bb) - min(rr, gg, bb)) <= 14:
                                visited[j] = 1
                                dq2.append((nx, ny))
            if len(comp) <= 600:
                for cx, cy in comp:
                    j = cy * w + cx
                    mask[j] = 0
                    bg[j] = 1
                    speck_removed += 1
    print(f"  发丝缝隙白点清理：{speck_removed} 像素")

    alpha = Image.new("L", (w, h), 0)
    ap = alpha.load()
    for y in range(h):
        row = y * w
        for x in range(w):
            if mask[row + x]:
                ap[x, y] = 255
    return alpha.filter(ImageFilter.GaussianBlur(0.6))


def main() -> None:
    im = Image.open(SRC)
    alpha = build_alpha(im)
    rgba = im.convert("RGBA")
    rgba.putalpha(alpha)
    rgba.save(CUTOUT)
    print(f"  抠图已保存 {CUTOUT}（{rgba.size[0]}×{rgba.size[1]}）")

    bbox = alpha.point(lambda v: 255 if v > 40 else 0).getbbox()
    print(f"  主体包围盒 {bbox}")

    left, top, right, bottom = bbox
    head_h = (bottom - top) if False else None  # 占位，下面按固定比例算
    # 头部（含头发）大致从包围盒顶部到下巴；证件照里下巴约在主体高度的 42%
    subject_h = bottom - top
    chin_y = top + int(subject_h * 0.42)
    head_top = top
    head_height = chin_y - head_top
    head_cx = (left + right) // 2

    # 头部约占图标高度 52%，头顶留 9% 余量（留出系统圆角遮罩的安全区）
    target_ratio = 0.52
    crop_side = int(head_height / target_ratio)
    crop_top = head_top - int(crop_side * 0.09)
    crop_left = head_cx - crop_side // 2
    print(f"  裁切窗口 side={crop_side} left={crop_left} top={crop_top}  头部高={head_height}")

    # ---- 白底反解（defringe）----
    # 观测像素 = a*F + (1-a)*255，反解出前景色 F，消除发丝边缘的白色描边
    arr = np.asarray(rgba, dtype=np.float32)
    rgb = arr[:, :, :3]
    a = (arr[:, :, 3:4] / 255.0)
    edge = (a > 0.04) & (a < 0.985)
    safe_a = np.where(a > 0.04, a, 1.0)
    fg = (rgb - (1.0 - safe_a) * 255.0) / safe_a
    rgb_clean = np.where(edge, np.clip(fg, 0, 255), rgb)
    rgba = Image.fromarray(np.dstack([rgb_clean, arr[:, :, 3]]).astype(np.uint8), "RGBA")

    canvas = Image.new("RGBA", (crop_side, crop_side), SKY + (255,))
    canvas.alpha_composite(rgba, (-crop_left, -crop_top))
    icon = canvas.convert("RGB").resize((SIZE, SIZE), Image.LANCZOS)
    icon.save(OUT, optimize=True)
    print(f"  已生成 {OUT}（{SIZE}×{SIZE}，{OUT.stat().st_size} 字节）")


if __name__ == "__main__":
    main()
