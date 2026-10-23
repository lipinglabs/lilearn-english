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
import re
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

# 走本地代理出网（沙盒 / 企业网常见：git 推送与直连被拦，但 CONNECT 隧道可用）
_PROXY = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
if _PROXY:
    try:
        urllib.request.install_opener(
            urllib.request.build_opener(urllib.request.ProxyHandler({"https": _PROXY}))
        )
    except Exception:
        pass

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
# 动物叫声 / 农场主题：要活泼俏皮，叫声像真的在叫，孩子一听就笑
EN_ANIMAL = (
    "用活泼、俏皮、有画面感的语气朗读，像在给三岁小朋友介绍小动物。"
    "模仿动物叫声时要轻快、圆润、带一点上扬的笑意，不要念成字母或生硬的单词。"
)

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
    # 英文通关夸奖：必须与学科无关（RULES §1.11）。旧句 "You are a math superstar!" 已废弃。
    "win1": ("Awesome! Level complete!", "en", -6, EN_PRAISE),
    "win2": ("Wow! You are a superstar!", "en", -6, EN_PRAISE),
    "win3": ("Fantastic! You did it!", "en", -6, EN_PRAISE),
    "coming": ("Coming soon!", "en", -6, EN_ASK),
}

def add(key: str, text: str, lang: str, rate: int, instruction: str) -> None:
    """新增一条语音文本。

    必须用本函数而不是直接 PHRASES[key] = ...：重复的 key 会静默覆盖旧条目，
    旧 mp3 又已存在（脚本会跳过合成），结果是新句子永远没有音频、旧句子被换成新文本。
    """
    if key in PHRASES:
        raise ValueError(
            f"重复的语音 key：{key}（已存在「{PHRASES[key][0]}」）——请换一个唯一 key")
    PHRASES[key] = (text, lang, rate, instruction)


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

# ---- 第 2 岛第 2 关（L2-W2，空间方位 in / on）语音 ----
# 教学三步：先给单词、再给整句、再提问；答题复用同一批整句，避免重复文本。
# 单词首次出现放慢（-12），整句与提问用常规 -10，感叹句用 -8。
PHRASES["t_in"] = ("Listen. In.", "en", -12, EN_ASK)
PHRASES["t_on"] = ("Listen. On.", "en", -12, EN_ASK)
PHRASES["s_in"] = ("The ball is in the box.", "en", -10, EN_ASK)
PHRASES["s_on"] = ("The ball is on the box.", "en", -10, EN_ASK)
PHRASES["s_beside"] = ("The ball is next to the box.", "en", -10, EN_ASK)
PHRASES["t_in_ask"] = ("Can you put the ball in the box?", "en", -10, EN_ASK)
PHRASES["t_on_ask"] = ("Can you put the ball on the box?", "en", -10, EN_ASK)
PHRASES["t_show_in"] = ("Show me in.", "en", -10, EN_ASK)
PHRASES["t_show_on"] = ("Show me on.", "en", -10, EN_ASK)
PHRASES["t_ready"] = ("You are ready! Let's play!", "en", -8, EN_PRAISE)
PHRASES["p_where"] = ("Where is the ball?", "en", -10, EN_ASK)
PHRASES["s_cat_on"] = ("The cat is on the plate.", "en", -10, EN_ASK)
PHRASES["s_cat_in"] = ("The cat is in the box.", "en", -10, EN_ASK)
PHRASES["pt_apple"] = ("Put the apple on the table.", "en", -10, EN_ASK)
PHRASES["pt_book"] = ("Put the book on the table.", "en", -10, EN_ASK)
PHRASES["pt_cup"] = ("Put the cup on the table.", "en", -10, EN_ASK)
PHRASES["yesno"] = ("Yes or No?", "en", -8, EN_ASK)

# ---- 第 2 岛第 3 关（L2-W3，空间进阶 under / behind）语音 ----
# 教学与答题共用整句；"You are ready! Let's play!" 直接复用已有 t_ready，不重复生成。
# 注意：s_cat_on 在第 2 关已是「猫在盘子上」，本关的椅子上图必须另起唯一 key。
add("u_under", "Listen. Under.", "en", -12, EN_ASK)
add("u_behind", "Listen. Behind.", "en", -12, EN_ASK)
add("s_bear_under", "The bear is under the table.", "en", -10, EN_ASK)
add("s_bear_behind", "The bear is behind the table.", "en", -10, EN_ASK)
add("u_under_ask", "Can you put the bear under the table?", "en", -10, EN_ASK)
add("u_behind_ask", "Can you put the bear behind the table?", "en", -10, EN_ASK)
add("u_show_under", "Show me under.", "en", -10, EN_ASK)
add("u_show_behind", "Show me behind.", "en", -10, EN_ASK)
add("p_where_cat", "Where is the cat?", "en", -10, EN_ASK)
add("s_cat_under", "The cat is under the chair.", "en", -10, EN_ASK)
add("s_cat_behind", "The cat is behind the chair.", "en", -10, EN_ASK)
add("s_cat_chair_on", "The cat is on the chair.", "en", -10, EN_ASK)
add("put_dog_behind", "Put the dog behind the box.", "en", -10, EN_ASK)
add("put_ball_behind", "Put the ball behind the box.", "en", -10, EN_ASK)
add("put_book_behind", "Put the book behind the box.", "en", -10, EN_ASK)
add("s_ball_under", "The ball is under the bed.", "en", -10, EN_ASK)
add("s_ball_on", "The ball is on the bed.", "en", -10, EN_ASK)
add("s_boy_behind", "The boy is behind the door.", "en", -10, EN_ASK)
add("s_boy_under", "The boy is under the door.", "en", -10, EN_ASK)

# ---- 第 2 岛第 4 关（L2-W4，形状 + 空间组合）语音 ----
# 组合指令：形状词 + 方位词同时出现。教学与答题共用整句；ready 复用 t_ready。
add("cb_listen", "Listen. Put the star on the circle.", "en", -12, EN_ASK)
add("cb_star_on_circle", "The star is on the circle.", "en", -10, EN_ASK)
add("cb_ask_in_square", "Can you put the star in the square?", "en", -10, EN_ASK)
add("cb_put_in", "Put the star in the circle.", "en", -10, EN_ASK)
add("cb_put_on", "Put the star on the circle.", "en", -10, EN_ASK)
add("cb_put_beside", "Put the star beside the circle.", "en", -10, EN_ASK)
add("cb_star_in_circle", "The star is in the circle.", "en", -10, EN_ASK)
add("cb_star_beside_circle", "The star is beside the circle.", "en", -10, EN_ASK)
add("cb_book_in", "Put the square book in the square.", "en", -10, EN_ASK)
add("cb_apple_in", "Put the round apple in the square.", "en", -10, EN_ASK)
add("cb_pizza_in", "Put the triangle pizza in the square.", "en", -10, EN_ASK)
add("cb_tri_on", "The triangle is on the square.", "en", -10, EN_ASK)
add("cb_tri_in", "The triangle is in the square.", "en", -10, EN_ASK)
add("cb_circle_in", "The circle is in the square.", "en", -10, EN_ASK)
add("cb_circle_on", "The circle is on the square.", "en", -10, EN_ASK)

# ---- 第 2 岛第 5 关（L2-W5，形状与空间终极考验）语音 ----
# 本关是综合关：教学复习 4 个形状 + 4 个方位，答题把形状与空间组合。
# 复用策略（RULES §1.8 去重自检的依据）：
#   · 方位单词 in / on → 复用 t_in / t_on；under / behind → 复用 u_under / u_behind
#   · 整句 "The ball is in the box." / "on the box" → 复用 s_in / s_on
#   · 题型 B 三句（圆苹果 / 三角披萨 / 长方书 放进正方形）→ 复用 cb_apple_in / cb_pizza_in / cb_book_in
#   · 题型 A 的 in / on 陈述 → 复用 cb_star_in_circle / cb_star_on_circle
#   · 题型 C 的三角 & 圆形陈述 → 复用 cb_tri_on / cb_tri_in / cb_circle_in / cb_circle_on
#   · 教学过渡 → 复用 t_ready
# 因此真正新增只有 15 条（形状名称 4 + 触摸提问 2 + 开场 1 + 方位整句/提问 4 +
#   星星在圈后 1 + 长方形两句 2 + "Where is the star?" 1）。
add("p5_tut_intro", "Let's look at the shapes.", "en", -10, EN_ASK)
add("p5_circle", "This is a circle.", "en", -12, EN_ASK)
add("p5_square", "This is a square.", "en", -12, EN_ASK)
add("p5_triangle", "This is a triangle.", "en", -12, EN_ASK)
add("p5_rectangle", "This is a rectangle.", "en", -12, EN_ASK)
add("p5_touch_triangle", "Can you touch the triangle?", "en", -10, EN_ASK)
add("p5_touch_rectangle", "Can you touch the rectangle?", "en", -10, EN_ASK)
add("p5_where_star", "Where is the star?", "en", -10, EN_ASK)
add("p5_star_behind_circle", "The star is behind the circle.", "en", -10, EN_ASK)
add("p5_under_ball", "The ball is under the table.", "en", -10, EN_ASK)
add("p5_behind_ball", "The ball is behind the table.", "en", -10, EN_ASK)
add("p5_ask_under", "Can you put the ball under the table?", "en", -10, EN_ASK)
add("p5_ask_behind", "Can you put the ball behind the table?", "en", -10, EN_ASK)
add("p5_rect_behind", "The rectangle is behind the square.", "en", -10, EN_ASK)
add("p5_rect_on", "The rectangle is on the square.", "en", -10, EN_ASK)

# ---- 第 3 岛第 1 关（L3-W1，大与小 Big / Small）语音 ----
# 本关是第 3 岛「比较与分类」的第一关，big / small 首次出现，必须先教后练。
# 清单自检（RULES §1.8）：以下 25 条全是新文本，与既有条目无重复；
#   · 过渡 "You are ready! Let's play!" 复用 t_ready，不重复生成；
#   · 答错鼓励复用 again；通关夸奖复用 win1/win2/win3；
#   · 尺寸词 big / small 都是单音节，rate 收到 -10 让孩子听清。
# 构成：
#   教学 5 条：大象 big（陈述 + 提问）、老鼠 small（陈述 + 提问）、对比测试 Show me the big apple.
#   题型 A 6 条：Find the big/small <apple|balloon|car>.
#   题型 B 10 条：The <elephant|dog|cat|mouse> is <big|small>.（8）+ Find the big/small one.（2）
#   题型 C 4 条：Put the big/small <apple|balloon> in the big/small box.
add("l3_tut_big", "Look! The elephant is big.", "en", -10, EN_ASK)
add("l3_tut_big_ask", "Can you touch the big elephant?", "en", -10, EN_ASK)
add("l3_tut_small", "Look! The mouse is small.", "en", -10, EN_ASK)
add("l3_tut_small_ask", "Can you touch the small mouse?", "en", -10, EN_ASK)
add("l3_show_big", "Show me the big apple.", "en", -10, EN_ASK)

add("l3_find_big_apple", "Find the big apple.", "en", -10, EN_ASK)
add("l3_find_small_apple", "Find the small apple.", "en", -10, EN_ASK)
add("l3_find_big_balloon", "Find the big balloon.", "en", -10, EN_ASK)
add("l3_find_small_balloon", "Find the small balloon.", "en", -10, EN_ASK)
add("l3_find_big_car", "Find the big car.", "en", -10, EN_ASK)
add("l3_find_small_car", "Find the small car.", "en", -10, EN_ASK)

add("l3_find_big_one", "Find the big one.", "en", -10, EN_ASK)
add("l3_find_small_one", "Find the small one.", "en", -10, EN_ASK)
add("l3_el_big", "The elephant is big.", "en", -10, EN_ASK)
add("l3_el_small", "The elephant is small.", "en", -10, EN_ASK)
add("l3_dog_big", "The dog is big.", "en", -10, EN_ASK)
add("l3_dog_small", "The dog is small.", "en", -10, EN_ASK)
add("l3_cat_big", "The cat is big.", "en", -10, EN_ASK)
add("l3_cat_small", "The cat is small.", "en", -10, EN_ASK)
add("l3_mouse_big", "The mouse is big.", "en", -10, EN_ASK)
add("l3_mouse_small", "The mouse is small.", "en", -10, EN_ASK)

add("l3_put_big_apple", "Put the big apple in the big box.", "en", -10, EN_ASK)
add("l3_put_small_apple", "Put the small apple in the small box.", "en", -10, EN_ASK)
add("l3_put_big_balloon", "Put the big balloon in the big box.", "en", -10, EN_ASK)
add("l3_put_small_balloon", "Put the small balloon in the small box.", "en", -10, EN_ASK)

# ---- 第 3 岛第 2 关（L3-W2，多 / 少 More / Less）语音 ----
# 本关是第 3 岛「比较与分类」的第二关，more / less 首次出现，必须先教后练。
# 清单自检（RULES §1.8）：以下 18 条全是新文本，与既有条目无重复；
#   · 过渡 "You are ready! Let's play!" 复用 t_ready；答错复用 again；通关复用 win1/win2/win3；
#   · more / less 单音节，rate 收到 -10 让孩子听清。
# 构成：
#   教学 3 条：l3w2_tut_more / l3w2_tut_less / l3w2_tut_more_ask
#   题型 A 6 条：l3w2a_{more,less}_{banana,apple,grape}（两堆同物，听 more/less 找对应堆）
#   题型 B 3 条：l3w2b_less_{apple,strawberry,grape}（三堆异果，听 "less <果>" 找那一堆）
#   题型 C 6 条：l3w2c_{more,less}_{apple,banana,grape}（两堆同物拖进 More/Less 箱）
add("l3w2_tut_more", "Look! This basket has more apples.", "en", -10, EN_ASK)
add("l3w2_tut_less", "This basket has less apples.", "en", -10, EN_ASK)
add("l3w2_tut_more_ask", "Can you find the basket with more apples?", "en", -10, EN_ASK)

add("l3w2a_more_banana", "Which one has more bananas?", "en", -10, EN_ASK)
add("l3w2a_less_banana", "Which one has less bananas?", "en", -10, EN_ASK)
add("l3w2a_more_apple", "Which one has more apples?", "en", -10, EN_ASK)
add("l3w2a_less_apple", "Which one has less apples?", "en", -10, EN_ASK)
add("l3w2a_more_grape", "Which one has more grapes?", "en", -10, EN_ASK)
add("l3w2a_less_grape", "Which one has less grapes?", "en", -10, EN_ASK)

add("l3w2b_less_apple", "Find the group with less apples.", "en", -10, EN_ASK)
add("l3w2b_less_strawberry", "Find the group with less strawberries.", "en", -10, EN_ASK)
add("l3w2b_less_grape", "Find the group with less grapes.", "en", -10, EN_ASK)

add("l3w2c_more_apple", "Put the group with more apples in the more box.", "en", -10, EN_ASK)
add("l3w2c_less_apple", "Put the group with less apples in the less box.", "en", -10, EN_ASK)
add("l3w2c_more_banana", "Put the group with more bananas in the more box.", "en", -10, EN_ASK)
add("l3w2c_less_banana", "Put the group with less bananas in the less box.", "en", -10, EN_ASK)
add("l3w2c_more_grape", "Put the group with more grapes in the more box.", "en", -10, EN_ASK)
add("l3w2c_less_grape", "Put the group with less grapes in the less box.", "en", -10, EN_ASK)

# ---------------------------------------------------------------------------
# 第 3 岛第 3 关（L3-W3：长与短 Long / Short）语音清单
#   · 教学 6 条：长×2 案例（蛇/面包）+ 短×2 案例（铅笔/围巾）+ 两道互动提问（长蛇/短铅笔）
#   · 题型 A 12 条：l3w3a_{long,short}_{snake,rope,pencil,bread,scarf,car}（两相同物，听 long/short 找对应）
#   · 题型 B 2 条：l3w3b_long_{giraffe,rabbit}（三动物，听 "long <部位>" 找对应动物）
#   · 题型 C 2 条：l3w3c_{long,short}_banana（长/短香蕉拖进 Long/Short 箱）
# 过渡 "You are ready! Let's play!" 复用 t_ready；答错复用 again；通关复用 win1/win2/win3。
add("l3w3_tut_long1", "Look! The snake is long.", "en", -10, EN_ASK)
add("l3w3_tut_long2", "The bread is long.", "en", -10, EN_ASK)
add("l3w3_tut_short1", "Look! The pencil is short.", "en", -10, EN_ASK)
add("l3w3_tut_short2", "The scarf is short.", "en", -10, EN_ASK)
add("l3w3_tut_long_ask", "Can you find the long snake?", "en", -10, EN_ASK)
add("l3w3_tut_short_ask", "Can you find the short pencil?", "en", -10, EN_ASK)

add("l3w3a_long_snake", "Find the long snake.", "en", -10, EN_ASK)
add("l3w3a_short_snake", "Find the short snake.", "en", -10, EN_ASK)
add("l3w3a_long_rope", "Find the long rope.", "en", -10, EN_ASK)
add("l3w3a_short_rope", "Find the short rope.", "en", -10, EN_ASK)
add("l3w3a_long_pencil", "Find the long pencil.", "en", -10, EN_ASK)
add("l3w3a_short_pencil", "Find the short pencil.", "en", -10, EN_ASK)
add("l3w3a_long_bread", "Find the long bread.", "en", -10, EN_ASK)
add("l3w3a_short_bread", "Find the short bread.", "en", -10, EN_ASK)
add("l3w3a_long_scarf", "Find the long scarf.", "en", -10, EN_ASK)
add("l3w3a_short_scarf", "Find the short scarf.", "en", -10, EN_ASK)
add("l3w3a_long_car", "Find the long car.", "en", -10, EN_ASK)
add("l3w3a_short_car", "Find the short car.", "en", -10, EN_ASK)

add("l3w3b_long_giraffe", "The giraffe has a long neck. Find the long one.", "en", -10, EN_ASK)
add("l3w3b_long_rabbit", "The rabbit has long ears. Find the long one.", "en", -10, EN_ASK)

add("l3w3c_long_banana", "Put the long banana in the long box.", "en", -10, EN_ASK)
add("l3w3c_short_banana", "Put the short banana in the short box.", "en", -10, EN_ASK)

# ---- 第 3 岛第 4 关（L3-W4，找不同 Odd one out）语音清单 ----
# 教学 2 条：演示「3 苹果 + 1 香蕉，香蕉不同」+ 互动「点不同的」（过渡复用 t_ready）
# 题型 A（动物）6 条：l3w4_a_{majority}_{odd} = "Three <majority> and one <odd>. Find the different one."
# 题型 B（水果）1 条：l3w4_odd = "Which one is odd?"（不点名水果，多种组合复用同一句）
# 题型 C（颜色）6 条：l3w4_c_{majority}_{odd} = "Three <颜色> cars and one <颜色> car. Find the different one."
# 合计 15 条新语音。复用：t_ready（过渡）、again（答错）、win1/2/3（通关）、praise_1..6（中文鼓励）。
add("l3w4_tut_demo", "Look! Three apples and one banana. The banana is different.", "en", -10, EN_ASK)
add("l3w4_tut_ask", "Find the different one.", "en", -10, EN_ASK)
add("l3w4_odd", "Which one is odd?", "en", -10, EN_ASK)
add("l3w4_a_dog_cat", "Three dogs and one cat. Find the different one.", "en", -10, EN_ASK)
add("l3w4_a_cat_dog", "Three cats and one dog. Find the different one.", "en", -10, EN_ASK)
add("l3w4_a_elephant_cat", "Three elephants and one cat. Find the different one.", "en", -10, EN_ASK)
add("l3w4_a_dog_elephant", "Three dogs and one elephant. Find the different one.", "en", -10, EN_ASK)
add("l3w4_a_cat_elephant", "Three cats and one elephant. Find the different one.", "en", -10, EN_ASK)
add("l3w4_a_elephant_dog", "Three elephants and one dog. Find the different one.", "en", -10, EN_ASK)
add("l3w4_c_red_blue", "Three red cars and one blue car. Find the different one.", "en", -10, EN_ASK)
add("l3w4_c_blue_red", "Three blue cars and one red car. Find the different one.", "en", -10, EN_ASK)
add("l3w4_c_yellow_green", "Three yellow cars and one green car. Find the different one.", "en", -10, EN_ASK)
add("l3w4_c_green_yellow", "Three green cars and one yellow car. Find the different one.", "en", -10, EN_ASK)
add("l3w4_c_red_yellow", "Three red cars and one yellow car. Find the different one.", "en", -10, EN_ASK)
add("l3w4_c_blue_green", "Three blue cars and one green car. Find the different one.", "en", -10, EN_ASK)

# ---- 第 3 岛第 5 关（L3-W5，游乐场 · 比较与分类终极考验）语音清单 ----
# 结业复习关：四个知识点各两个案例 + 一问；答题三种组合题型。
# 教学 11 条（找不同的提问复用 l3w4_tut_ask「Find the different one.」，不新建）：
add("b5_tut_bs1", "Look! A big elephant and a small mouse.", "en", -10, EN_ASK)
add("b5_tut_bs2", "A big apple and a small apple.", "en", -10, EN_ASK)
add("b5_tut_bs_ask", "Find the big elephant.", "en", -10, EN_ASK)
add("b5_tut_ml1", "Look! Six apples and two apples.", "en", -10, EN_ASK)
add("b5_tut_ml2", "One apple and four apples.", "en", -10, EN_ASK)
add("b5_tut_ml_ask", "Find the basket with less apples.", "en", -10, EN_ASK)
add("b5_tut_ls1", "Look! A long snake and a short snake.", "en", -10, EN_ASK)
add("b5_tut_ls2", "A long train and a short train.", "en", -10, EN_ASK)
add("b5_tut_ls_ask", "Find the short train.", "en", -10, EN_ASK)
add("b5_tut_odd1", "Three dogs and one cat. The cat is different.", "en", -10, EN_ASK)
add("b5_tut_odd2", "Three red balloons and one blue balloon. The blue one is different.", "en", -10, EN_ASK)
# 答题 9 条：A 混合比较（bigger/smaller/longer/shorter）4；B 混合分类 1；C 拖拽游乐场 4
add("b5_a_bigger", "Which one is bigger?", "en", -10, EN_ASK)
add("b5_a_smaller", "Which one is smaller?", "en", -10, EN_ASK)
add("b5_a_longer", "Which one is longer?", "en", -10, EN_ASK)
add("b5_a_shorter", "Which one is shorter?", "en", -10, EN_ASK)
add("b5_b_odd", "Find the odd one out.", "en", -10, EN_ASK)
add("b5_c_big", "Put the big one in.", "en", -10, EN_ASK)
add("b5_c_small", "Put the small one in.", "en", -10, EN_ASK)
add("b5_c_long", "Put the long one in.", "en", -10, EN_ASK)
add("b5_c_short", "Put the short one in.", "en", -10, EN_ASK)

# ---- 第 4 岛第 1 关（L4-W1，农场动物 Farm animals）语音清单 ----
# 教学 6 条：四个动物逐个登场（名字 + 叫声）+ 第一次动手提问 + 过渡语
#   （第二次动手的「Find the cow.」直接复用答题 key l4w1_f_cow，不另建同文本条目，RULES §1.12）
# 答题 12 条：A 听名字找（l4w1_f_*）/ B 听叫声找（l4w1_s_*）/ C 拖进农场（l4w1_c_*）
# 复用：again（答错）、win1/2/3（通关）、praise_1..6（中文鼓励）；过渡语自带，不用 t_ready。
add("l4w1_tut_dog", "Look! A dog. Woof woof!", "en", -10, EN_ANIMAL)
add("l4w1_tut_cat", "Look! A cat. Meow meow!", "en", -10, EN_ANIMAL)
add("l4w1_tut_pig", "Look! A pig. Oink oink!", "en", -10, EN_ANIMAL)
add("l4w1_tut_cow", "Look! A cow. Moo moo!", "en", -10, EN_ANIMAL)
add("l4w1_tut_ask_dog", "Where is the dog? Touch the dog.", "en", -10, EN_ASK)
add("l4w1_tut_done", "You know all the farm animals! Let's play!", "en", -8, EN_PRAISE)

add("l4w1_f_dog", "Find the dog.", "en", -10, EN_ASK)
add("l4w1_f_cat", "Find the cat.", "en", -10, EN_ASK)
add("l4w1_f_pig", "Find the pig.", "en", -10, EN_ASK)
add("l4w1_f_cow", "Find the cow.", "en", -10, EN_ASK)

add("l4w1_s_dog", "Woof woof! Who is it?", "en", -8, EN_ANIMAL)
add("l4w1_s_cat", "Meow meow! Who is it?", "en", -8, EN_ANIMAL)
add("l4w1_s_pig", "Oink oink! Who is it?", "en", -8, EN_ANIMAL)
add("l4w1_s_cow", "Moo moo! Who is it?", "en", -8, EN_ANIMAL)

add("l4w1_c_dog", "Put the dog in the farm.", "en", -10, EN_ASK)
add("l4w1_c_cat", "Put the cat in the farm.", "en", -10, EN_ASK)
add("l4w1_c_pig", "Put the pig in the farm.", "en", -10, EN_ASK)
add("l4w1_c_cow", "Put the cow in the farm.", "en", -10, EN_ASK)

# ---- 第 4 岛第 2 关（L4-W2 野生动物）：26 条 ----
# 教学按 RULES §三.10 双倍量：每个词 2 次不同演示 + 2 次互动。
# 演示 A 走「单词 + 拟声」，演示 B 走「场景大图 / 局部特写 / 属性描述」，两类必须不同。
add("l4w2_t_lion1", "Look! A lion. Roar!", "en", -8, EN_ANIMAL)
add("l4w2_t_lion2", "The lion is the king of the jungle.", "en", -10, EN_ASK)
add("l4w2_t_tiger1", "Look! A tiger. Grrr!", "en", -8, EN_ANIMAL)
add("l4w2_t_tiger2", "The tiger has stripes.", "en", -10, EN_ASK)
add("l4w2_t_monkey1", "Look! A monkey. Ooh ooh ah ah!", "en", -8, EN_ANIMAL)
add("l4w2_t_monkey2", "The monkey likes bananas.", "en", -10, EN_ASK)
add("l4w2_t_elephant1", "Look! An elephant. Pawoo!", "en", -8, EN_ANIMAL)
# 演示 B「The elephant is big.」与第 3 岛 l3_el_big 文本完全相同 → 复用 l3_el_big（§1.12）
add("l4w2_t_ask_lion", "Where is the lion? Touch the lion.", "en", -10, EN_ASK)
add("l4w2_t_done", "You are ready! Let's go to the jungle!", "en", -8, EN_PRAISE)

# 题型 A：听名字找（4 条；教学互动也复用，不另建同文本 key，见 §1.12）
add("l4w2_f_lion", "Find the lion.", "en", -10, EN_ASK)
add("l4w2_f_tiger", "Find the tiger.", "en", -10, EN_ASK)
add("l4w2_f_monkey", "Find the monkey.", "en", -10, EN_ASK)
add("l4w2_f_elephant", "Find the elephant.", "en", -10, EN_ASK)

# 题型 B：听描述找（4 条；每条描述都只对应唯一一种动物）
add("l4w2_b_stripes", "Who has stripes?", "en", -10, EN_ASK)
add("l4w2_b_king", "Who is the king of the jungle?", "en", -10, EN_ASK)
add("l4w2_b_bananas", "Who likes bananas?", "en", -10, EN_ASK)
add("l4w2_b_big", "Who is big?", "en", -10, EN_ASK)

# 题型 C：拖进丛林 / 农场（丛林 4 条；农场的 4 句与第 1 关文本完全相同，
# 按 §1.12 复用 l4w1_c_dog/cat/pig/cow，绝不新建同文本的第二条 key）
add("l4w2_c_jungle_lion", "Put the lion in the jungle.", "en", -10, EN_ASK)
add("l4w2_c_jungle_tiger", "Put the tiger in the jungle.", "en", -10, EN_ASK)
add("l4w2_c_jungle_monkey", "Put the monkey in the jungle.", "en", -10, EN_ASK)
add("l4w2_c_jungle_elephant", "Put the elephant in the jungle.", "en", -10, EN_ASK)

# ---- 第 4 岛第 3 关（L4-W3 动词 Run / Jump / Eat / Sleep）：30 条 ----
# 教学按 RULES §三.10 双倍量：4 个动词 ×（2 演示 + 2 互动）+ 1 综合互动 + 1 过渡语。
# 演示 A 走「主语 + 动作 + 拟声」，演示 B 必须换主语或换场景后再说一遍。
add("l4w3_t_run1", "Look! He is running. Run, run, run!", "en", -8, EN_ANIMAL)
add("l4w3_t_run2", "The dog is running too. Run!", "en", -8, EN_ANIMAL)
add("l4w3_t_ask_run", "Who is running? Touch the running boy.", "en", -10, EN_ASK)
add("l4w3_t_run3", "Look carefully. Who is running?", "en", -10, EN_ASK)

add("l4w3_t_jump1", "Look! The kangaroo is jumping. Jump, jump!", "en", -8, EN_ANIMAL)
add("l4w3_t_jump2", "The frog can jump too. Jump!", "en", -8, EN_ANIMAL)
add("l4w3_t_jump3", "Find the jumping frog.", "en", -10, EN_ASK)
add("l4w3_t_jump4", "Who is jumping? Find it.", "en", -10, EN_ASK)

add("l4w3_t_eat1", "Look! The monkey is eating an apple. Eat!", "en", -8, EN_ANIMAL)
add("l4w3_t_eat2", "The pig is eating too. Yum, yum!", "en", -8, EN_ANIMAL)
add("l4w3_t_eat3", "Who is eating? Touch the eating monkey.", "en", -10, EN_ASK)
add("l4w3_t_eat4", "Which one is eating? Touch it.", "en", -10, EN_ASK)

add("l4w3_t_sleep1", "Look! The bear is sleeping. Shh, sleep.", "en", -8, EN_ANIMAL)
add("l4w3_t_sleep2", "The cat is sleeping too. Good night!", "en", -8, EN_ANIMAL)
add("l4w3_t_sleep3", "Who is sleeping? Touch the sleeping bear.", "en", -10, EN_ASK)
add("l4w3_t_sleep4", "Who is sleeping? Find it.", "en", -10, EN_ASK)

add("l4w3_t_show_eat", "Show me eating.", "en", -10, EN_ASK)
add("l4w3_t_done", "You know all the actions! Let's play!", "en", -8, EN_PRAISE)

# 题型 A：听音找动作（4 条）
add("l4w3_a_run", "Find the one who is running.", "en", -10, EN_ASK)
add("l4w3_a_jump", "Find the one who is jumping.", "en", -10, EN_ASK)
add("l4w3_a_eat", "Find the one who is eating.", "en", -10, EN_ASK)
add("l4w3_a_sleep", "Find the one who is sleeping.", "en", -10, EN_ASK)

# 题型 B：听三句短句，找出被问到的那一个（答案同时锁定「动物」和「动作」）
add("l4w3_b_eat",
    "The bird is flying. The cat is sleeping. The monkey is eating. Find the eating monkey.",
    "en", -10, EN_ASK)
add("l4w3_b_sleep",
    "The kangaroo is jumping. The bear is sleeping. The boy is running. Find the sleeping bear.",
    "en", -10, EN_ASK)
add("l4w3_b_run",
    "The frog is jumping. The dog is running. The pig is eating. Find the running dog.",
    "en", -10, EN_ASK)
add("l4w3_b_jump",
    "The cat is sleeping. The monkey is eating. The kangaroo is jumping. Find the jumping kangaroo.",
    "en", -10, EN_ASK)

# 题型 C：把动作画面拖进「在跑 / 在睡」两个筐（4 条）
add("l4w3_c_boy_run", "Put the running boy in the running box.", "en", -10, EN_ASK)
add("l4w3_c_dog_run", "Put the running dog in the running box.", "en", -10, EN_ASK)
add("l4w3_c_boy_sleep", "Put the sleeping boy in the sleeping box.", "en", -10, EN_ASK)
add("l4w3_c_cat_sleep", "Put the sleeping cat in the sleeping box.", "en", -10, EN_ASK)

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
VOICE_JS_PATH = ROOT / "voice.js"
MARK_START = "/* VOICE_BANK_START */"
MARK_END = "/* VOICE_BANK_END */"
CHUNK = 4000


def audit() -> list[str]:
    """去重自检（RULES §1.8）+ 复合数字拼写（§1.10）+ 学科无关（§1.11）。"""
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
        # 英文文本禁止绑定具体学科：第 2 岛起不再是数学岛（RULES §1.11）
        if lang == "en":
            for word in ("math", "maths", "mathematics"):
                if word in norm:
                    problems.append(f"英文文本含限学科词「{word}」：{key}「{text}」（RULES §1.11）")
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


def merge_into_voicejs(bank_new: dict[str, bytes]) -> None:
    """把新生成的语音合并进 voice.js：只追加缺失的 key，绝不删除 / 覆盖已有条目。

    物理切割后语音库整体搬到了 voice.js（window.VOICE_BANK），index.html 已无标记位，
    因此注入目标改为 voice.js。本函数幂等：已存在的 key 跳过，重复运行不会重复追加。
    """
    if not bank_new:
        print("没有新语音需要合并（全部已存在）")
        return
    text = VOICE_JS_PATH.read_text(encoding="utf-8")
    existing = set(re.findall(r"^\s*([A-Za-z0-9_]+):", text, re.M))
    if "};" not in text:
        sys.exit("voice.js 缺少结尾 };，无法合并")
    head, tail = text.rsplit("};", 1)
    lines = []
    inserted = 0
    for key, data in bank_new.items():
        if key in existing:
            continue
        uri = "data:audio/mpeg;base64," + base64.b64encode(data).decode("ascii")
        parts = [uri[i:i + CHUNK] for i in range(0, len(uri), CHUNK)] or [""]
        body = "".join(f'      "{p}" +\n' for p in parts[:-1])
        body += f'      "{parts[-1]}"'
        lines.append(f"  {key}:")
        lines.append(body + ",")
        inserted += 1
    if inserted == 0:
        print("voice.js 已包含全部新 key，无需追加")
        return
    snippet = "\n".join(lines) + "\n"
    VOICE_JS_PATH.write_text(head + snippet + "};" + tail, encoding="utf-8")
    print(f"已向 voice.js 合并 {inserted} 条新语音（共 {len(existing) + inserted} 条）")


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

    # 只要求本次待生成的 key 已落地；已有条目直接从 voice.js 保留（绝不删除 / 覆盖）
    missing = [k for k in todo if not (VOICE_DIR / f"{k}.mp3").exists()]
    if missing:
        print(f"缺少语音文件，未注入：{missing}", file=sys.stderr)
        return 1

    bank_new = {k: (VOICE_DIR / f"{k}.mp3").read_bytes() for k in todo}
    merge_into_voicejs(bank_new)
    return 0


if __name__ == "__main__":
    sys.exit(main())
