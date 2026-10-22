#!/usr/bin/env python3
"""用豆包语音合成大模型 2.0 批量生成全部语音，并内联进 index.html。

铁律（见 RULES.md）：
  · 英文语音一律 en_female_allison_uranus_bigtts + context_texts 情绪指令
  · 中文鼓励一律中文女童/儿童绘本音色
  · 豆包输出有随机性 —— 已生成的 mp3 默认跳过，绝不重复合成（避免音色漂移）；
    确实要重做时用 --force。

用法：
    set DOUBAO_API_KEY=xxxx
    python tools/gen_voice_doubao.py                # 生成缺失的 + 注入页面
    python tools/gen_voice_doubao.py --inject-only  # 只注入，不合成
    python tools/gen_voice_doubao.py --force --only n11 n12   # 强制重做指定条目
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ENDPOINT = "https://openspeech.bytedance.com/api/v3/tts/unidirectional"
RESOURCE_ID = "seed-tts-2.0"

EN_SPEAKER = "en_female_allison_uranus_bigtts"
# 中文女童音/儿童绘本音色，按优先级回退
ZH_CANDIDATES = [
    "zh_female_xiaoxue_uranus_bigtts",          # 儿童绘本 2.0
    "zh_female_tianmeixiaoyuan_uranus_bigtts",  # 甜美小源 2.0
    "zh_female_linjianvhai_uranus_bigtts",      # 邻家女孩 2.0
]

EN_ASK = "用温柔、清晰、鼓励的语气朗读，像在教小朋友说英语。"
EN_PRAISE = "用非常开心、兴奋、夸张的语气朗读，像在夸奖一个三岁的小朋友。"

ZH_PRAISE = (
    "用非常开心、惊喜的语气说这句话，像妈妈看到孩子闯关成功时脱口而出的夸奖。"
    "要带笑意，语速自然偏快，句尾明显上扬，音量比平时大一点，真实口语，不要播音腔。"
)

# 中文鼓励（= 试听样本 A 的配置）：儿童绘本 2.0 + 音调 +3 + 48kHz/160kbps
PRAISE_PITCH = 3
PRAISE_SR = 48000
PRAISE_BR = 160000
OVERRIDES = {f"praise_{i}": {"pitch": PRAISE_PITCH, "sr": PRAISE_SR, "br": PRAISE_BR}
             for i in range(1, 7)}

NUMBERS = (11, 12, 13, 14, 15)
NUM_WORDS = {11: "eleven", 12: "twelve", 13: "thirteen", 14: "fourteen", 15: "fifteen"}
FRUITS = {
    "apple": "apples",
    "banana": "bananas",
    "strawberry": "strawberries",
    "grape": "grapes",
}

# key -> (文本, 语种, 语速, 情绪指令)
PHRASES: dict[str, tuple[str, str, int, str]] = {
    "intro": ("Welcome to the English adventure! Let's play!", "en", -8, EN_PRAISE),
    "yes": ("Yes! Great job!", "en", -6, EN_PRAISE),
    "star": ("You got a star!", "en", -6, EN_PRAISE),
    "again": ("Oops, try again.", "en", -8, EN_ASK),
    "win": ("Wow! You did it! You are a math superstar!", "en", -6, EN_PRAISE),
    "coming": ("Coming soon!", "en", -6, EN_ASK),
}

for _n in NUMBERS:
    PHRASES[f"n{_n}"] = (NUM_WORDS[_n].capitalize(), "en", -10, EN_ASK)

for _f, _plural in FRUITS.items():
    PHRASES[f"f_{_f}"] = (_plural.capitalize(), "en", -10, EN_ASK)

for _n in NUMBERS:
    for _f, _plural in FRUITS.items():
        PHRASES[f"q_{_n}_{_f}"] = (f"Find {NUM_WORDS[_n]} {_plural}", "en", -10, EN_ASK)

PRAISES = [
    "李旻泽，你真棒",
    "李旻泽，你又过了一关",
    "李旻泽，你又进步了一点点",
    "李旻泽，这都难不倒你呀",
    "李旻泽，给你一个大大的赞",
    "李旻泽，接下来也要保持这么棒哦",
]
for _i, _text in enumerate(PRAISES, start=1):
    PHRASES[f"praise_{_i}"] = (_text, "zh", -4, ZH_PRAISE)

ROOT = Path(__file__).resolve().parent.parent
VOICE_DIR = ROOT / "voice"
HTML_PATH = ROOT / "index.html"
MARK_START = "/* VOICE_BANK_START */"
MARK_END = "/* VOICE_BANK_END */"
CHUNK = 4000


def build_payload(text: str, speaker: str, rate: int, instruction: str,
                  pitch: int = 0, sample_rate: int = 24000,
                  bit_rate: int | None = None) -> dict:
    """注意：context_texts 必须放进 additions 的 JSON 字符串里。

    实测放在 req_params 顶层会被服务端静默忽略（时长与无指令完全一致），
    放进 additions 后才真正生效（+30% 时长差异）。见 RULES.md。
    """
    additions: dict = {"disable_markdown_filter": True}
    if instruction:
        additions["context_texts"] = [instruction]

    req: dict = {
        "text": text,
        "speaker": speaker,
        "audio_params": {"format": "mp3", "sample_rate": sample_rate, "speech_rate": rate},
        "additions": json.dumps(additions, ensure_ascii=False),
    }
    if bit_rate:
        req["audio_params"]["bit_rate"] = bit_rate
    if pitch:
        req["post_process"] = {"pitch": pitch}

    return {"user": {"uid": "lilearn-english"}, "req_params": req}


def parse_frames(raw_text: str) -> bytes:
    decoder = json.JSONDecoder()
    idx = 0
    audio = bytearray()
    length = len(raw_text)
    while idx < length:
        while idx < length and raw_text[idx] in " \r\n\t":
            idx += 1
        if idx >= length:
            break
        obj, idx = decoder.raw_decode(raw_text, idx)
        code = obj.get("code", 0)
        if code == 20000000:
            break
        if code and code > 0:
            raise RuntimeError(f"code={code} message={obj.get('message')}")
        if isinstance(obj.get("data"), str) and obj["data"]:
            audio.extend(base64.b64decode(obj["data"]))
    return bytes(audio)


def synthesize(api_key: str, text: str, speaker: str, rate: int, instruction: str,
               pitch: int = 0, sample_rate: int = 24000,
               bit_rate: int | None = None) -> bytes:
    body = json.dumps(
        build_payload(text, speaker, rate, instruction, pitch, sample_rate, bit_rate),
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        ENDPOINT,
        data=body,
        method="POST",
        headers={
            "X-Api-Key": api_key,
            "X-Api-Resource-Id": RESOURCE_ID,
            "X-Api-Request-Id": str(uuid.uuid4()),
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:400]
        raise RuntimeError(f"HTTP {exc.code}：{detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"网络错误：{exc.reason}") from exc

    audio = parse_frames(raw)
    if not audio:
        raise RuntimeError("响应成功但没有音频数据")
    return audio


def pick_chinese_speaker(api_key: str) -> str:
    """预检中文音色是否可用，避免批量生成到一半才发现未授权。"""
    for speaker in ZH_CANDIDATES:
        try:
            synthesize(api_key, "你好", speaker, 0, ZH_PRAISE)
            print(f"中文音色可用：{speaker}")
            return speaker
        except RuntimeError as exc:
            print(f"中文音色不可用，跳过 {speaker}：{exc}")
    sys.exit("所有候选中文音色都不可用，请检查控制台授权")


def to_js(bank: dict[str, bytes]) -> str:
    lines = [MARK_START, "window.VOICE_BANK = {"]
    for key, data in bank.items():
        uri = "data:audio/mpeg;base64," + base64.b64encode(data).decode("ascii")
        parts = [uri[i:i + CHUNK] for i in range(0, len(uri), CHUNK)] or [""]
        body = "".join(f'      "{p}" +\n' for p in parts[:-1])
        body += f'      "{parts[-1]}"'
        lines.append(f"  {key}:")
        lines.append(body + ",")
    lines.append("};")
    lines.append(MARK_END)
    return "\n".join(lines)


def inject(snippet: str) -> None:
    html = HTML_PATH.read_text(encoding="utf-8")
    if MARK_START not in html or MARK_END not in html:
        sys.exit("index.html 缺少语音库标记，无法注入")
    head, rest = html.split(MARK_START, 1)
    _, tail = rest.split(MARK_END, 1)
    HTML_PATH.write_text(head + snippet + tail, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inject-only", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--only", nargs="*", help="只处理指定 key")
    args = parser.parse_args()

    VOICE_DIR.mkdir(exist_ok=True)
    targets = [k for k in PHRASES if not args.only or k in args.only]

    if not args.inject_only:
        api_key = os.environ.get("DOUBAO_API_KEY", "").strip()
        if not api_key:
            print("缺少环境变量 DOUBAO_API_KEY", file=sys.stderr)
            return 2

        zh_speaker = None
        if any(PHRASES[k][1] == "zh" for k in targets):
            zh_speaker = pick_chinese_speaker(api_key)

        done = skipped = failed = 0
        total_bytes = 0
        for key in targets:
            text, lang, rate, instruction = PHRASES[key]
            target = VOICE_DIR / f"{key}.mp3"
            if target.exists() and not args.force:
                skipped += 1
                total_bytes += target.stat().st_size
                continue
            speaker = zh_speaker if lang == "zh" else EN_SPEAKER
            ov = OVERRIDES.get(key, {})
            try:
                audio = synthesize(api_key, text, speaker, rate, instruction,
                                   pitch=ov.get("pitch", 0),
                                   sample_rate=ov.get("sr", 24000),
                                   bit_rate=ov.get("br"))
            except RuntimeError as exc:
                failed += 1
                print(f"  ✗ {key:<16} {exc}")
                continue
            target.write_bytes(audio)
            done += 1
            total_bytes += len(audio)
            print(f"  ✓ {key:<16} {len(audio):>6} 字节  {speaker[:28]:<28} {text[:38]}")

        print(f"\n新生成 {done} 条，跳过已存在 {skipped} 条，失败 {failed} 条，"
              f"语音总量 {total_bytes} 字节")
        if failed:
            print("存在失败条目，未注入页面。修正后重跑会跳过已成功的条目。", file=sys.stderr)
            return 1

    missing = [k for k in PHRASES if not (VOICE_DIR / f"{k}.mp3").exists()]
    if missing:
        print(f"缺少语音文件：{missing}", file=sys.stderr)
        return 1

    bank = {k: (VOICE_DIR / f"{k}.mp3").read_bytes() for k in PHRASES}
    inject(to_js(bank))
    print(f"已注入 {len(bank)} 条语音到 index.html")
    return 0


if __name__ == "__main__":
    sys.exit(main())
