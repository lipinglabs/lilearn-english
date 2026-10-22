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

# 第 2 关（W2）：16–20 与数量
NUMBERS_W2 = (16, 17, 18, 19, 20)
NUM_WORDS_W2 = {
    16: "sixteen", 17: "seventeen", 18: "eighteen", 19: "nineteen", 20: "twenty",
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

# ---- 第 2 关（W2，16–20）语音 ----
# 题型 A：只听数字，在三个水果堆里找出对应数量 → n16..n20
# 题型 B：听短句找水果标牌 → b_{num}_{fruit} = "Find seventeen bananas."
# 题型 C：数字喂食机 → c_{num}_{fruit} = "Feed me twenty strawberries."
#
# 复用规则（去重自检的依据）：
#   · 题型 A 的 "Sixteen." 若与第 1 关 n11..n15 同格式，新生成 n16..n20（数字不重叠，无重复文本）。
#   · 题型 B 的 "Find seventeen bananas." 与第 1 关题型 C 的 q_17_banana 文本完全相同，
#     因此 B 直接复用 q_* 条目（前提：q_* 已扩展到 16–20），不新增重复文本。
#   · 题型 C 的 "Feed me ..." 是全新句型，每个 (数字, 水果) 组合各一条，共 20 条。
for _n in NUMBERS_W2:
    PHRASES[f"n{_n}"] = (NUM_WORDS_W2[_n].capitalize(), "en", -10, EN_ASK)

for _n in NUMBERS_W2:
    for _f, _plural in FRUITS.items():
        PHRASES[f"q_{_n}_{_f}"] = (f"Find {NUM_WORDS_W2[_n]} {_plural}", "en", -10, EN_ASK)
        PHRASES[f"c_{_n}_{_f}"] = (f"Feed me {NUM_WORDS_W2[_n]} {_plural}", "en", -10, EN_ASK)

# ---- 第 3 关（W3，21–29 与短句组合）语音 ----
# 铁律（RULES §1.10）：21–29 一律写成 Twenty-one … Twenty-nine，
# 文本里绝不允许出现阿拉伯数字，否则 TTS 读成 "two one"，连读节奏就毁了。
#
# 题型 A（听数字点数字底板）：n21..n29 = "Twenty-one" … "Twenty-nine"（9 条）
# 题型 B（听短句找组合图）：q_2..q_5 × 4 水果 = "Find two apples."（16 条）
#     —— 与第 1 关的 q_11..q_20 共用同一句型模板，文本不重复、可单独复用
# 题型 C（数数大挑战）：howmany_{fruit} = "How many oranges?"（4 条）
#     + 复用 n21..n29 读答案，拼成 "How many oranges?" → "Twenty-five."
#     —— 两段拼接而不是 36 条整句，省 32 条额度，且连读效果与独立数字完全一致
NUM_WORDS_W3 = {
    21: "twenty-one", 22: "twenty-two", 23: "twenty-three",
    24: "twenty-four", 25: "twenty-five", 26: "twenty-six",
    27: "twenty-seven", 28: "twenty-eight", 29: "twenty-nine",
}
SMALL_COUNTS = (2, 3, 4, 5)
SMALL_WORDS = {2: "two", 3: "three", 4: "four", 5: "five"}

for _n, _word in NUM_WORDS_W3.items():
    PHRASES[f"n{_n}"] = (_word.capitalize(), "en", -10, EN_ASK)

for _c in SMALL_COUNTS:
    for _f, _plural in FRUITS.items():
        PHRASES[f"q_{_c}_{_f}"] = (f"Find {SMALL_WORDS[_c]} {_plural}", "en", -10, EN_ASK)

for _f, _plural in FRUITS.items():
    PHRASES[f"howmany_{_f}"] = (f"How many {_plural}?", "en", -10, EN_ASK)

# ---- 第 4 关（W4，颜色初体验）语音 ----
# 题型 A：只听颜色名 → col_red / col_blue / col_yellow / col_green（4 条）
# 题型 B："Find the red apple." → fb_{color}（4 条，本题固定为苹果，靠颜色区分）
# 题型 C："Make the car red." → mk_{item}_{color}（汽车/气球 × 4 色 = 8 条）
# 合计 16 条。颜色词全部是单词，无阿拉伯数字（RULES §1.10 自动校验也覆盖本段）。
COLOR_WORDS = {"red": "red", "blue": "blue", "yellow": "yellow", "green": "green"}

for _c, _word in COLOR_WORDS.items():
    PHRASES[f"col_{_c}"] = (_word.capitalize(), "en", -10, EN_ASK)
    PHRASES[f"fb_{_c}"] = (f"Find the {_word} apple", "en", -10, EN_ASK)

# ---- 第 5 关（W5，游乐场终极考验）语音 ----
# 题型 A：喂小怪兽 → "Feed me eighteen apples."（复用 c_ 句型；18 已有，故只补 12/22/28）
# 题型 B：颜色分类 → "Put the red apple in the red basket."（3 色 × 3 种可染色水果）
# 题型 C：听指令找组合 → "Find three red apples."（数量 2–5 × 3 色）
# 合计新增 12 + 9 + 12 = 33 条。
W5_NUMBERS = (12, 18, 22, 28)
W5_NUM_WORDS = {12: "twelve", 18: "eighteen", 22: "twenty-two", 28: "twenty-eight"}
W5_COLORS = {"red": "red", "blue": "blue", "yellow": "yellow"}
W5_FRUITS = {"apple": "apples", "strawberry": "strawberries", "grape": "grapes"}
# 单数形式单独列，不能用 strings[:-1] 砍 s（strawberries → strawberrie 是错的）
W5_FRUIT_SINGULAR = {"apple": "apple", "strawberry": "strawberry", "grape": "grape"}

for _n in W5_NUMBERS:
    for _f, _plural in FRUITS.items():
        PHRASES[f"c_{_n}_{_f}"] = (f"Feed me {W5_NUM_WORDS[_n]} {_plural}", "en", -10, EN_ASK)

for _c, _cw in W5_COLORS.items():
    for _f, _plural in W5_FRUITS.items():
        PHRASES[f"pb_{_c}_{_f}"] = (
            f"Put the {_cw} {W5_FRUIT_SINGULAR[_f]} in the {_cw} basket",
            "en", -10, EN_ASK)

for _n in SMALL_COUNTS:
    for _c, _cw in W5_COLORS.items():
        PHRASES[f"fc_{_n}_{_c}"] = (f"Find {SMALL_WORDS[_n]} {_cw} apples", "en", -10, EN_ASK)

for _item, _noun in (("car", "car"), ("balloon", "balloon")):
    for _c, _word in COLOR_WORDS.items():
        PHRASES[f"mk_{_item}_{_c}"] = (f"Make the {_noun} {_word}", "en", -10, EN_ASK)

# ---- 第 2 岛第 1 关（L2-W1，基础形状）语音 ----
# 题型 A/C：听指令找形状 → "Find the circle."
# 题型 B：生活物品联想 → "Where is the triangle?"
# 只 6 条：3 个形状 × 2 个句型，覆盖全部 12 轮。
W1S_SHAPES = ("circle", "square", "triangle", "rectangle")
for _s in W1S_SHAPES:
    PHRASES[f"fs_{_s}"] = (f"Find the {_s}", "en", -10, EN_ASK)
    PHRASES[f"ws_{_s}"] = (f"Where is the {_s}?", "en", -10, EN_ASK)

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
MANIFEST_PATH = VOICE_DIR / "manifest.md"
HTML_PATH = ROOT / "index.html"
MARK_START = "/* VOICE_BANK_START */"
MARK_END = "/* VOICE_BANK_END */"
CHUNK = 4000


def audit() -> list[str]:
    """去重自检（RULES §1.8）+ 复合数字拼写自检（RULES §1.10）。"""
    problems: list[str] = []
    seen_text: dict[tuple[str, str], str] = {}
    for key, (text, lang, _rate, _ins) in PHRASES.items():
        norm = " ".join(text.strip().lower().split())
        prev = seen_text.get((lang, norm))
        if prev:
            problems.append(f"文本重复：{prev} 与 {key} 都是「{text}」")
        else:
            seen_text[(lang, norm)] = key
        # 英文文本禁止出现阿拉伯数字：21 会被读成 "two one"，破坏 twenty-one 的连读
        if lang == "en" and any(ch.isdigit() for ch in text):
            problems.append(f"英文文本含阿拉伯数字（须写成 Twenty-one 这类连字符单词）：{key}「{text}」")
    return problems


def write_manifest() -> None:
    """把本关全部语音文本写成清单，供人工核对（RULES §1.8）。"""
    lines = [
        "# 语音文本清单（自动生成，勿手改）",
        "",
        f"总条目：**{len(PHRASES)}** 条（英文 "
        f"{sum(1 for v in PHRASES.values() if v[1] == 'en')} + 中文 "
        f"{sum(1 for v in PHRASES.values() if v[1] == 'zh')}）",
        "",
        "| key | 语种 | 文本 | 状态 |",
        "| --- | --- | --- | --- |",
    ]
    for key, (text, lang, _rate, _ins) in PHRASES.items():
        state = "已存在" if (VOICE_DIR / f"{key}.mp3").exists() else "待生成"
        lines.append(f"| `{key}` | {lang} | {text} | {state} |")
    MANIFEST_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


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
    parser.add_argument("--dry-run", action="store_true",
                        help="只做去重自检 + 打印清单 + 统计待生成条数，不调用任何接口")
    args = parser.parse_args()

    VOICE_DIR.mkdir(exist_ok=True)

    problems = audit()
    write_manifest()
    print(f"清单已写出：{MANIFEST_PATH.relative_to(ROOT)}（共 {len(PHRASES)} 条）")
    if problems:
        print("去重自检未通过：", file=sys.stderr)
        for p in problems:
            print("  · " + p, file=sys.stderr)
        return 1
    print("去重自检通过：无重复文本。")

    targets = [k for k in PHRASES if not args.only or k in args.only]
    todo = [k for k in targets if args.force or not (VOICE_DIR / f"{k}.mp3").exists()]
    print(f"本次待生成 {len(todo)} 条，跳过已存在 {len(targets) - len(todo)} 条。")

    if args.dry_run:
        for k in todo:
            print(f"  · {k:<16} {PHRASES[k][1]}  {PHRASES[k][0]}")
        return 0

    if not args.inject_only:
        api_key = os.environ.get("DOUBAO_API_KEY", "").strip()
        if not api_key:
            print("缺少环境变量 DOUBAO_API_KEY", file=sys.stderr)
            return 2

        zh_speaker = None
        if any(PHRASES[k][1] == "zh" for k in todo):
            zh_speaker = pick_chinese_speaker(api_key)

        done = 0
        failed_by_key: list[tuple[str, str]] = []
        total_bytes = 0
        # 单条失败立即跳过并记录，绝不重试（RULES §1.9：配额是钱）
        for key in todo:
            text, lang, rate, instruction = PHRASES[key]
            target = VOICE_DIR / f"{key}.mp3"
            speaker = zh_speaker if lang == "zh" else EN_SPEAKER
            ov = OVERRIDES.get(key, {})
            try:
                audio = synthesize(api_key, text, speaker, rate, instruction,
                                   pitch=ov.get("pitch", 0),
                                   sample_rate=ov.get("sr", 24000),
                                   bit_rate=ov.get("br"))
            except RuntimeError as exc:
                failed_by_key.append((key, str(exc)))
                print(f"  ✗ {key:<16} {exc}")
                continue
            if not audio:
                failed_by_key.append((key, "空音频"))
                print(f"  ✗ {key:<16} 空音频")
                continue
            target.write_bytes(audio)
            done += 1
            total_bytes += len(audio)
            print(f"  ✓ {key:<16} {len(audio):>6} 字节  {speaker[:28]:<28} {text[:38]}")

        print(f"\n新生成 {done} 条，失败 {len(failed_by_key)} 条，"
              f"新增语音 {total_bytes} 字节")
        if failed_by_key:
            print("失败清单（未重试，稍后一起处理）：", file=sys.stderr)
            for k, e in failed_by_key:
                print(f"  · {k}：{e[:160]}", file=sys.stderr)

    missing = [k for k in PHRASES if not (VOICE_DIR / f"{k}.mp3").exists()]
    if missing:
        print(f"缺少语音文件，未注入：{missing}", file=sys.stderr)
        return 1

    bank = {k: (VOICE_DIR / f"{k}.mp3").read_bytes() for k in PHRASES}

    inject(to_js(bank))
    print(f"已注入 {len(bank)} 条语音到 index.html")
    return 0


if __name__ == "__main__":
    sys.exit(main())
