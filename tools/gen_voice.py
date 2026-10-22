#!/usr/bin/env python3
"""语音资源生成工具（第一关：数字与水果）。

用微软 Edge TTS 的 en-US-AnaNeural（小女孩音色）合成幼儿英语语音，
并把音频以 base64 内联进 index.html，保证游戏始终是「单文件、零延迟、离线可用」。

用法：
    pip install edge-tts
    python tools/gen_voice.py

原理说明：
    浏览器页面无法在运行时直连微软消费级语音端点（该端点强制校验
    Origin / Sec-MS-GEC 令牌 / Cookie，仅对官方扩展放行，网页端必然 403），
    因此语音在构建期一次性合成。音色、语速与运行期完全一致，
    新增词条只需在 PHRASES 里加一行再跑一次本脚本。
"""

from __future__ import annotations

import asyncio
import base64
import sys
from pathlib import Path

try:
    import edge_tts
except ImportError:  # pragma: no cover
    sys.exit("缺少依赖，请先执行：pip install edge-tts")

# ---------------------------------------------------------------- 语音参数
VOICE = "en-US-AnaNeural"   # 微软小女孩音色
RATE_ASK = "-11%"           # 提问语速：略慢，便于 3–6 岁幼儿听清
RATE_WORD = "-10%"          # 单词认读
RATE_PRAISE = "-8%"         # 夸奖语：稍快一点，显得有精神
PITCH = "+0Hz"
VOLUME = "+0%"

NUMBERS = (11, 12, 13, 14, 15)
NUM_WORDS = {
    11: "eleven",
    12: "twelve",
    13: "thirteen",
    14: "fourteen",
    15: "fifteen",
}
FRUITS = {
    "apple": "apples",
    "banana": "bananas",
    "strawberry": "strawberries",
    "grape": "grapes",
}

# ---------------------------------------------------------------- 词条表
# key: (朗读文本, 语速)；key 为程序内部标识，不会显示在页面上。
PHRASES: dict[str, tuple[str, str]] = {
    "test": ("Welcome to the English adventure! Let's play!", RATE_PRAISE),
    "yes": ("Yes! Great job!", RATE_PRAISE),
    "again": ("Oops, try again.", RATE_PRAISE),
    "win": ("Wow! You did it! You are a math superstar!", RATE_PRAISE),
}

for number in NUMBERS:
    PHRASES[f"n{number}"] = (NUM_WORDS[number].capitalize(), RATE_WORD)

for fruit_key, plural in FRUITS.items():
    PHRASES[f"f_{fruit_key}"] = (plural.capitalize(), RATE_WORD)

for number in NUMBERS:
    for fruit_key, plural in FRUITS.items():
        PHRASES[f"q_{number}_{fruit_key}"] = (
            f"Find {NUM_WORDS[number]} {plural}",
            RATE_ASK,
        )

ROOT = Path(__file__).resolve().parent.parent
VOICE_DIR = ROOT / "voice"
HTML_PATH = ROOT / "index.html"

MARK_START = "/* VOICE_BANK_START */"
MARK_END = "/* VOICE_BANK_END */"
CHUNK = 4000  # base64 每行字符数，避免单行过长


async def synth(text: str, rate: str, target: Path) -> None:
    """合成单条语音并写入 mp3。"""
    communicate = edge_tts.Communicate(
        text, VOICE, rate=rate, pitch=PITCH, volume=VOLUME
    )
    await communicate.save(str(target))


def to_js(bank: dict[str, bytes]) -> str:
    """把 {key: mp3 bytes} 渲染成可内联的 JS 对象字面量。"""
    lines = [MARK_START, "window.VOICE_BANK = {"]
    for key, data in bank.items():
        uri = "data:audio/mpeg;base64," + base64.b64encode(data).decode("ascii")
        parts = [uri[i : i + CHUNK] for i in range(0, len(uri), CHUNK)] or [""]
        body = "".join(f'      "{p}" +\n' for p in parts[:-1])
        body += f'      "{parts[-1]}"'
        lines.append(f"  {key}:")
        lines.append(body + ",")
    lines.append("};")
    lines.append(MARK_END)
    return "\n".join(lines)


def inject(snippet: str, html_path: Path) -> None:
    """把语音库写入 index.html 的标记区间内。"""
    html = html_path.read_text(encoding="utf-8")
    if MARK_START not in html or MARK_END not in html:
        sys.exit("index.html 中找不到语音库标记，无法注入")
    head, rest = html.split(MARK_START, 1)
    _, tail = rest.split(MARK_END, 1)
    html_path.write_text(head + snippet + tail, encoding="utf-8")


async def main() -> None:
    VOICE_DIR.mkdir(exist_ok=True)

    # --inject-only：跳过合成，直接用 voice/ 里已有的 mp3 重新注入页面
    if "--inject-only" in sys.argv:
        bank = {}
        for key in PHRASES:
            path = VOICE_DIR / f"{key}.mp3"
            if not path.exists():
                sys.exit(f"缺少 {path}，请先完整运行一次本脚本")
            bank[key] = path.read_bytes()
        inject(to_js(bank), HTML_PATH)
        print(f"已用现有 {len(bank)} 条语音重新注入 index.html")
        return

    bank: dict[str, bytes] = {}
    total = 0
    for key, (text, rate) in PHRASES.items():
        target = VOICE_DIR / f"{key}.mp3"
        await synth(text, rate, target)
        data = target.read_bytes()
        bank[key] = data
        total += len(data)
        print(f"  {key:<18} {len(data):>6} 字节  {rate:>6}  {text}")

    # 清掉已不再使用的旧语音，避免目录膨胀
    for stale in VOICE_DIR.glob("*.mp3"):
        if stale.stem not in PHRASES:
            stale.unlink()
            print(f"  已删除过期语音 {stale.name}")

    inject(to_js(bank), HTML_PATH)
    print(f"\n共 {len(bank)} 条语音，{total} 字节 mp3，已内联至 index.html")


if __name__ == "__main__":
    asyncio.run(main())
