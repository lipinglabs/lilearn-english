#!/usr/bin/env python3
"""语音资源生成工具。

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
RATE = "-8%"                # 略微放慢，便于幼儿听清
PITCH = "+0Hz"
VOLUME = "+0%"

# ---------------------------------------------------------------- 词条表
# key 为程序内部标识，value 为朗读文本。key 不会显示在页面上。
PHRASES: dict[str, str] = {
    "test": "Welcome to the English adventure! Let's play!",
    "apple": "Apple. Apple.",
    "banana": "Banana. Banana.",
    "orange": "Orange. Orange.",
    "grape": "Grape. Grape.",
    "praise": "Well done!",
}

ROOT = Path(__file__).resolve().parent.parent
VOICE_DIR = ROOT / "voice"
HTML_PATH = ROOT / "index.html"

MARK_START = "/* VOICE_BANK_START */"
MARK_END = "/* VOICE_BANK_END */"
CHUNK = 4000  # base64 每行字符数，避免单行过长


async def synth(text: str, target: Path) -> None:
    """合成单条语音并写入 mp3。"""
    communicate = edge_tts.Communicate(
        text, VOICE, rate=RATE, pitch=PITCH, volume=VOLUME
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
    bank: dict[str, bytes] = {}
    total = 0
    for key, text in PHRASES.items():
        target = VOICE_DIR / f"{key}.mp3"
        await synth(text, target)
        data = target.read_bytes()
        bank[key] = data
        total += len(data)
        print(f"  {key:<8} {len(data):>6} 字节  {text}")

    inject(to_js(bank), HTML_PATH)
    print(f"\n共 {len(bank)} 条语音，{total} 字节 mp3，已内联至 index.html")


if __name__ == "__main__":
    asyncio.run(main())
