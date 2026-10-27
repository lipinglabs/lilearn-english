#!/usr/bin/env python3
"""音素发音自检：合成候选文本 → 测 F1/F2 → 判断是不是目标音素。

为什么需要它（RULES §三.33）：
    本项目的 TTS 只有纯文本输入，没有 SSML / 音素标注。老师要求的「A says /æ/」
    如果直接把字母当文本喂进去，英文 TTS 会读成**字母名 /eɪ/**（"ay"），
    孩子学到的就是错的。所以必须：合成若干候选写法 → **用声学指标验一遍** → 只留下真的那个。

判据（女声，24 kHz）：
    /æ/   F1 700–1050，F2 1550–2100，且**全程基本不动**（单元音）
    /eɪ/  F2 > 2050 且**明显滑动**（双元音，F1 下沉 / F2 上扬）
    /ɑː/  F2 < 1300（舌位靠后，跟 /æ/ 完全不同的 F2）
    /ə/   F1 450–650 且 F2 1100–1600（弱读中央元音，最容易被误当成 /æ/）

用法：
    python tools/check_phonics.py "a" "ah" "ae" --ref
    python tools/check_phonics.py --texts apple ape at
"""

from __future__ import annotations

import cmath
import importlib.util
import json
import math
import os
import struct
import sys
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SR = 24000
WIN = 512
HOP = 256


def load_gen():
    spec = importlib.util.spec_from_file_location("gv", ROOT / "tools" / "gen_voice_doubao.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def synth_pcm(gv, key: str, text: str, rate: int = -15) -> bytes:
    payload = gv.build_payload(text, gv.EN_SPEAKER, rate, gv.EN_ASK)
    payload["req_params"]["audio_params"]["format"] = "pcm"
    body = json.dumps(payload, ensure_ascii=False).encode()
    req = urllib.request.Request(
        gv.ENDPOINT, data=body, method="POST",
        headers={
            "X-Api-Key": key,
            "X-Api-Resource-Id": gv.RESOURCE_ID,
            "X-Api-Request-Id": str(uuid.uuid4()),
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=90) as r:
        raw = r.read().decode("utf-8", errors="replace")
    return gv.parse_frames(raw)


def to_samples(pcm: bytes) -> list[float]:
    n = len(pcm) // 2
    return [v / 32768.0 for v in struct.unpack("<%dh" % n, pcm[: n * 2])]


def fft(re: list[float], im: list[float]) -> None:
    n = len(re)
    j = 0
    for i in range(1, n):
        bit = n >> 1
        while j & bit:
            j ^= bit
            bit >>= 1
        j |= bit
        if i < j:
            re[i], re[j] = re[j], re[i]
            im[i], im[j] = im[j], im[i]
    length = 2
    while length <= n:
        ang = -2 * math.pi / length
        wl = complex(math.cos(ang), math.sin(ang))
        half = length >> 1
        for i in range(0, n, length):
            w = 1 + 0j
            for k in range(half):
                u = complex(re[i + k], im[i + k])
                v = complex(re[i + k + half], im[i + k + half]) * w
                re[i + k], im[i + k] = (u + v).real, (u + v).imag
                re[i + k + half], im[i + k + half] = (u - v).real, (u - v).imag
                w *= wl
        length <<= 1


def mag_spectrum(seg: list[float]) -> list[float]:
    n = len(seg)
    re = [seg[i] * (0.5 - 0.5 * math.cos(2 * math.pi * i / (n - 1))) for i in range(n)]
    im = [0.0] * n
    fft(re, im)
    return [math.hypot(re[i], im[i]) for i in range(n // 2)]


def smooth(mag: list[float], half: int = 3) -> list[float]:
    out = []
    for i in range(len(mag)):
        a = max(0, i - half)
        b = min(len(mag), i + half + 1)
        out.append(sum(mag[a:b]) / (b - a))
    return out


def flux(a: list[float], b: list[float]) -> float:
    """两段平均对数谱的余弦距离（0=完全一样，越大越说明音在滑动）。

    比共振峰跟踪稳得多：爆破音 / 谐波不会把结果带偏，只有「音本身变了」才会拉高。
    """
    la = [math.log(v + 1e-9) for v in a]
    lb = [math.log(v + 1e-9) for v in b]
    num = sum(x * y for x, y in zip(la, lb))
    da = math.sqrt(sum(x * x for x in la)) or 1e-9
    db = math.sqrt(sum(y * y for y in lb)) or 1e-9
    return 1.0 - num / (da * db)


def envelope(acc: list[float], half: int = 5) -> list[float]:
    """对数域宽平滑 —— 抹掉谐波结构，留下共振峰包络。

    512 点 / 24 kHz ⇒ 每个 bin ≈ 47 Hz，女声谐波间隔约 200 Hz（≈4 个 bin）。
    直接在原始幅度上找峰只会找到谐波，必须先在 log 域做 ±5 bin 平滑。
    """
    logm = [math.log(v + 1e-9) for v in acc]
    out = []
    for i in range(len(logm)):
        a = max(0, i - half)
        b = min(len(logm), i + half + 1)
        out.append(sum(logm[a:b]) / (b - a))
    return out


def peaks(env: list[float], fmin: float, fmax: float, count: int) -> list[float]:
    """在 fmin..fmax 内找前 count 个局部极大（按幅度降序、再按频率升序）。"""
    lo = int(fmin * WIN / SR)
    hi = min(len(env) - 2, int(fmax * WIN / SR))
    cand = []
    for i in range(max(1, lo), hi):
        if env[i] > env[i - 1] and env[i] >= env[i + 1]:
            cand.append((env[i], i * SR / WIN))
    cand.sort(reverse=True)
    got = [f for _, f in cand[:count]]
    return sorted(got)


def analyze(pcm: bytes) -> dict:
    x = to_samples(pcm)
    dur = len(x) / SR
    # 能量包络，用于裁剪静音并找浊音段
    frames = []
    for s in range(0, max(0, len(x) - WIN), HOP):
        seg = x[s: s + WIN]
        frames.append((s, sum(v * v for v in seg) / WIN))
    if not frames:
        return {"dur": dur, "ok": False}
    peak = max(e for _, e in frames) or 1e-9
    voiced = [(s, e) for s, e in frames if e > peak * 0.06]
    if not voiced:
        return {"dur": dur, "ok": False}
    # 去掉首尾极弱的帧，只保留中间连续段
    idx = [i for i, (s, e) in enumerate(frames) if e > peak * 0.06]
    lo, hi = idx[0], idx[-1]
    body = frames[lo: hi + 1]
    n = len(body)
    if n < 3:
        return {"dur": dur, "ok": False}

    def seg_f(f0: int, f1: int) -> dict:
        sub = body[int(n * f0): max(int(n * f0) + 1, int(n * f1))]
        if not sub:
            sub = body[-1:]
        # 只取高能量帧（元音核）：停顿/爆破音的能量低、谱也不代表元音
        emax = max(e for _, e in sub) or 1e-9
        core = [(s, e) for s, e in sub if e > emax * 0.25] or sub
        acc = None
        for s, _ in core:
            env = mag_spectrum(x[s: s + WIN])
            acc = env if acc is None else [a + b for a, b in zip(acc, env)]
        acc = [v / len(core) for v in acc]
        env = envelope(acc)
        p1 = peaks(env, 420, 1150, 1)
        p2 = peaks(env, 1150, 2900, 2)
        return {"F1": p1[0] if p1 else None, "F2": p2[0] if p2 else None, "F2b": p2[1] if len(p2) > 1 else None}

    head = seg_f(0.15, 0.42)
    tail = seg_f(0.58, 0.90)
    mid = seg_f(0.30, 0.70)

    # 滑动量：头 vs 尾的平均对数谱余弦距离（单元音≈0.0x，双元音≈0.2+）
    def mean_spec(part):
        sub = body[int(n * part[0]): max(int(n * part[0]) + 1, int(n * part[1]))] or body[-1:]
        emax = max(e for _, e in sub) or 1e-9
        core = [(s, e) for s, e in sub if e > emax * 0.25] or sub
        acc = None
        for s, _ in core:
            env = mag_spectrum(x[s: s + WIN])
            acc = env if acc is None else [a + b for a, b in zip(acc, env)]
        return [v / len(core) for v in acc]

    glide = round(flux(mean_spec((0.10, 0.35)), mean_spec((0.65, 0.92))), 4)
    return {"dur": round(dur, 3), "voiced": round(n * HOP / SR, 3),
            "glide": glide, "head": head, "mid": mid, "tail": tail}


def classify(r: dict) -> str:
    m = r.get("mid") or {}
    f1, f2 = m.get("F1"), m.get("F2")
    if not f1 or not f2:
        return "?"
    h = r.get("head") or {}
    t = r.get("tail") or {}
    glide_f2 = (t.get("F2") or f2) - (h.get("F2") or f2)
    glide_f1 = (t.get("F1") or f1) - (h.get("F1") or f1)
    if f2 > 2050 and (glide_f2 > 120 or glide_f1 < -80):
        return "letter-name(≈/eɪ/ 双元音)"
    if f2 < 1300:
        return "back-vowel(≈/ɑː/ 舌位太后)"
    if 650 <= f1 <= 1080 and 1550 <= f2 <= 2100 and abs(glide_f2) < 200:
        return "TARGET /æ/"
    if f1 < 650 and 1100 <= f2 <= 1600:
        return "schwa(≈/ə/ 太弱太短)"
    return "unclear"


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    ref = "--ref" in sys.argv
    if not args:
        print(__doc__)
        return 2
    key = os.environ.get("DOUBAO_API_KEY", "")
    if not key:
        print("缺少 DOUBAO_API_KEY")
        return 2
    gv = load_gen()
    out = {}
    for text in args:
        try:
            pcm = synth_pcm(gv, key, text)
        except Exception as exc:  # noqa: BLE001
            print(f"{text!r:12} ERR {exc}")
            continue
        r = analyze(pcm)
        tag = classify(r)
        m, h, t = r.get("mid") or {}, r.get("head") or {}, r.get("tail") or {}
        print(f"{text!r:12} 滑动={r.get('glide'):<7} F1={str(m.get('F1')):8} F2={str(m.get('F2')):8} "
              f"时长 {r.get('dur')}s   [{tag}]")
        out[text] = {"tag": tag, **r}
        Path(ROOT / "tmp_phonics").mkdir(exist_ok=True)
        (ROOT / "tmp_phonics" / (text.replace("/", "_").replace(" ", "_") + ".pcm")).write_bytes(pcm)
    if "--json" in sys.argv:
        print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
