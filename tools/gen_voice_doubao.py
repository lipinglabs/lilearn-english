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

# ---- 第 4 岛第 4 关（L4-W4 动物 + 动作短句）：32 条 ----
# 教学按 RULES §三.10 双倍量：3 个句型 ×（2 演示 + 2 互动）+ 1 综合 + 对错题示范/互动 2 步 + 过渡语。
# 演示 A = 整幅场景 + 整句；演示 B = 同一场景拉近 + 换一个句式（地点 / 细节），两次不重样。
add("l4w4_t_dog1", "Look! The dog is running.", "en", -8, EN_ANIMAL)
add("l4w4_t_dog2", "The dog is running fast!", "en", -8, EN_ANIMAL)
add("l4w4_t_dog3", "Touch the picture: the dog is running.", "en", -10, EN_ASK)
add("l4w4_t_dog4", "Which dog is running? Touch it.", "en", -10, EN_ASK)

add("l4w4_t_cat1", "Look! The cat is sleeping.", "en", -8, EN_ANIMAL)
add("l4w4_t_cat2", "The cat is sleeping on the sofa.", "en", -8, EN_ANIMAL)
add("l4w4_t_cat3", "Find the cat that is sleeping.", "en", -10, EN_ASK)
add("l4w4_t_cat4", "Where is the sleeping cat?", "en", -10, EN_ASK)

add("l4w4_t_mon1", "Look! The monkey is eating.", "en", -8, EN_ANIMAL)
add("l4w4_t_mon2", "The monkey is eating a banana.", "en", -8, EN_ANIMAL)
add("l4w4_t_mon3", "Find the monkey that is eating.", "en", -10, EN_ASK)
add("l4w4_t_mon4", "Who is eating a banana? Touch it.", "en", -10, EN_ASK)

# 综合互动 + 对错题（✅ / ❌）的示范与互动 + 过渡语
add("l4w4_t_show", "Show me: the monkey is eating.", "en", -10, EN_ASK)
add("l4w4_t_yn1", "Look at the picture. Is the dog running? No, the horse is running.",
    "en", -8, EN_ANIMAL)
add("l4w4_t_yn2", "Look at the picture. Is the cat sleeping? Yes, the cat is sleeping.",
    "en", -8, EN_ANIMAL)
add("l4w4_t_done", "You know all the sentences! Let's play!", "en", -8, EN_PRAISE)

# 题型 A：听长句找整幅场景（6 条）
add("l4w4_a_dog", "The dog is running. Find the running dog.", "en", -10, EN_ASK)
add("l4w4_a_cat", "The cat is sleeping. Find the sleeping cat.", "en", -10, EN_ASK)
add("l4w4_a_monkey", "The monkey is eating. Find the eating monkey.", "en", -10, EN_ASK)
add("l4w4_a_horse", "The horse is running. Find the running horse.", "en", -10, EN_ASK)
add("l4w4_a_pig", "The pig is sleeping. Find the sleeping pig.", "en", -10, EN_ASK)
add("l4w4_a_bear", "The bear is eating. Find the eating bear.", "en", -10, EN_ASK)

# 题型 B：看图判断句子对不对（6 条，句尾统一接已有的 yesno「Yes or No?」）
add("l4w4_b_dog", "Look at the picture. Is the dog running?", "en", -10, EN_ASK)
add("l4w4_b_cat", "Look at the picture. Is the cat sleeping?", "en", -10, EN_ASK)
add("l4w4_b_monkey", "Look at the picture. Is the monkey eating?", "en", -10, EN_ASK)
add("l4w4_b_horse", "Look at the picture. Is the horse running?", "en", -10, EN_ASK)
add("l4w4_b_pig", "Look at the picture. Is the pig sleeping?", "en", -10, EN_ASK)
add("l4w4_b_bear", "Look at the picture. Is the bear eating?", "en", -10, EN_ASK)

# 题型 C：把整幅场景拖进「在跑 / 在睡」两个筐（4 条）
# 用「dog that is running」而不是第 3 关的「running dog」，既复现本关的短句结构，也避免语音文本重复（§1.12）
add("l4w4_c_dog", "Put the dog that is running in the running box.", "en", -10, EN_ASK)
add("l4w4_c_cat", "Put the cat that is sleeping in the sleeping box.", "en", -10, EN_ASK)
add("l4w4_c_horse", "Put the horse that is running in the running box.", "en", -10, EN_ASK)
add("l4w4_c_pig", "Put the pig that is sleeping in the sleeping box.", "en", -10, EN_ASK)

# ---- 第 4 岛第 5 关（L4-W5 游乐场 · 听音模仿）：27 条 ----
# 教学 14 条：先示范「相机按钮」这个新交互，再按 RULES §三.10 双倍量走 run / jump / sleep
# 各（2 次演示 + 2 次互动），最后过渡语（自带，不叠 t_ready）。
add("l4w5_t_cam", "This is the camera button. Do your move, then touch the camera.",
    "en", -10, EN_ASK)

add("l4w5_t_run1", "Look! The dog is running. Can you run?", "en", -8, EN_ANIMAL)
add("l4w5_t_run2", "Let's run together! Click the camera when you are running!", "en", -8, EN_ANIMAL)
add("l4w5_t_run3", "The horse is running too. Can you run fast?", "en", -8, EN_ANIMAL)
add("l4w5_t_run4", "Show me running! Run, run, run, then touch the camera.", "en", -10, EN_ASK)

add("l4w5_t_jump1", "Look! The frog is jumping. Can you jump?", "en", -8, EN_ANIMAL)
add("l4w5_t_jump2", "Jump with me! Click the camera when you jump!", "en", -8, EN_ANIMAL)
add("l4w5_t_jump3", "The kangaroo is jumping too. Jump up high!", "en", -8, EN_ANIMAL)
add("l4w5_t_jump4", "Show me jumping! Jump, jump, then touch the camera.", "en", -10, EN_ASK)

add("l4w5_t_sleep1", "Look! The cat is sleeping. Can you sleep?", "en", -8, EN_ANIMAL)
add("l4w5_t_sleep2", "Close your eyes and sleep. Click the camera when you are sleeping!",
    "en", -8, EN_ANIMAL)
add("l4w5_t_sleep3", "The pig is sleeping too. Shh, close your eyes.", "en", -8, EN_ANIMAL)
add("l4w5_t_sleep4", "Show me sleeping! Close your eyes, then touch the camera.", "en", -10, EN_ASK)

add("l4w5_t_done", "Wow, you did it! Let's play the real game!", "en", -8, EN_PRAISE)

# 题型 A：听指令做动作（6 组「动物 + 动作」，模仿完点相机）
add("l4w5_a_run_dog", "The dog is running. Can you run like a dog?", "en", -10, EN_ASK)
add("l4w5_a_run_horse", "The horse is running. Can you run like a horse?", "en", -10, EN_ASK)
add("l4w5_a_jump_frog", "The frog is jumping. Can you jump like a frog?", "en", -10, EN_ASK)
add("l4w5_a_jump_kangaroo", "The kangaroo is jumping. Can you jump like a kangaroo?",
    "en", -10, EN_ASK)
add("l4w5_a_sleep_cat", "The cat is sleeping. Can you sleep like a cat?", "en", -10, EN_ASK)
add("l4w5_a_sleep_bear", "The bear is sleeping. Can you sleep like a bear?", "en", -10, EN_ASK)

# 题型 B：看放大镜里的动作剪影猜动物（3 条，按动作分）
add("l4w5_b_run", "Listen and guess! Who is running?", "en", -10, EN_ASK)
add("l4w5_b_jump", "Listen and guess! Who is jumping?", "en", -10, EN_ASK)
add("l4w5_b_sleep", "Listen and guess! Who is sleeping?", "en", -10, EN_ASK)

# 题型 C：同一只动物的三种动作里点出正在做那件事的（4 条）
# 与 W4 的「Put the dog that is running…」句式不同，避免语音文本重复（§1.12）
add("l4w5_c_dog", "Find the dog that is eating.", "en", -10, EN_ASK)
add("l4w5_c_cat", "Find the cat that is running.", "en", -10, EN_ASK)
add("l4w5_c_horse", "Find the horse that is sleeping.", "en", -10, EN_ASK)
add("l4w5_c_pig", "Find the pig that is eating.", "en", -10, EN_ASK)

# ===== 第 5 岛第 1 关（L5-W1：常见食物）：milk / bread / egg / rice =====
# 教学 17 条：每个词 2 次演示 + 2 次互动 + 1 条过渡语（双倍量，RULES §三.10）
add("l5w1_t_milk1", "Look! Milk. It's white.", "en", -10, EN_ASK)
add("l5w1_t_milk2", "I like to drink milk.", "en", -10, EN_ASK)
add("l5w1_t_milk3", "Where is the milk? Touch the milk.", "en", -10, EN_ASK)
add("l5w1_t_milk4", "Which one is milk?", "en", -10, EN_ASK)
add("l5w1_t_bread1", "Look! Bread. It's soft.", "en", -10, EN_ASK)
add("l5w1_t_bread2", "This is a piece of bread.", "en", -10, EN_ASK)
add("l5w1_t_bread3", "Touch the bread.", "en", -10, EN_ASK)
add("l5w1_t_bread4", "Which one is bread?", "en", -10, EN_ASK)
add("l5w1_t_egg1", "Look! An egg. It's round.", "en", -10, EN_ASK)
add("l5w1_t_egg2", "I have an egg for breakfast.", "en", -10, EN_ASK)
add("l5w1_t_egg3", "Where is the egg?", "en", -10, EN_ASK)
add("l5w1_t_egg4", "Show me the egg.", "en", -10, EN_ASK)
add("l5w1_t_rice1", "Look! Rice. It's hot.", "en", -10, EN_ASK)
add("l5w1_t_rice2", "The rice is hot. It smells good.", "en", -10, EN_ASK)
add("l5w1_t_rice3", "Touch the rice.", "en", -10, EN_ASK)
add("l5w1_t_rice4", "Which one is rice?", "en", -10, EN_ASK)
add("l5w1_t_done", "You know the food! Let's eat!", "en", -8, EN_PRAISE)

# 题型 A：听音找食物（4 条）
add("l5w1_a_milk", "Find the milk.", "en", -10, EN_ASK)
add("l5w1_a_bread", "Find the bread.", "en", -10, EN_ASK)
add("l5w1_a_egg", "Find the egg.", "en", -10, EN_ASK)
add("l5w1_a_rice", "Find the rice.", "en", -10, EN_ASK)

# 题型 B：听描述找食物（4 条，每条只描述一种食物的属性）
add("l5w1_b_milk", "It is white. We drink it. What is it?", "en", -10, EN_ASK)
add("l5w1_b_bread", "It is soft. We eat it in the morning. What is it?", "en", -10, EN_ASK)
add("l5w1_b_egg", "It is round and white. It is in a shell. What is it?", "en", -10, EN_ASK)
add("l5w1_b_rice", "It is white and hot. We eat it with a spoon. What is it?", "en", -10, EN_ASK)

# 题型 C：把食物拖到盘子上（4 条）
add("l5w1_c_milk", "Put the milk on the plate.", "en", -10, EN_ASK)
add("l5w1_c_bread", "Put the bread on the plate.", "en", -10, EN_ASK)
add("l5w1_c_egg", "Put the egg on the plate.", "en", -10, EN_ASK)
add("l5w1_c_rice", "Put the rice on the plate.", "en", -10, EN_ASK)

# ===== 第 5 岛第 2 关（L5-W2：餐具）：bowl / spoon / cup / fork =====
# 教学 17 环节：每个词 2 次演示 + 2 次互动 + 1 条过渡语（双倍量，RULES §三.10）
# 每句都尽量短（用户要求控制单步语音长度，避免孩子疲劳）
add("l5w2_t_bowl1", "Look! A bowl.", "en", -10, EN_ASK)
add("l5w2_t_bowl2", "The soup is in the bowl.", "en", -10, EN_ASK)
add("l5w2_t_bowl3", "Touch the bowl.", "en", -10, EN_ASK)
add("l5w2_t_bowl4", "Which one is the bowl?", "en", -10, EN_ASK)
add("l5w2_t_spoon1", "A spoon.", "en", -10, EN_ASK)
add("l5w2_t_spoon2", "We eat with a spoon.", "en", -10, EN_ASK)
# 互动 A 用「Find the spoon.」：与题型 A 同一句话，复用同一个 key（RULES §1.12），此处不重复建
add("l5w2_t_spoon4", "Which one is the spoon?", "en", -10, EN_ASK)
add("l5w2_t_cup1", "A cup.", "en", -10, EN_ASK)
add("l5w2_t_cup2", "We drink water with a cup.", "en", -10, EN_ASK)
# 互动 A 同上复用 l5w2_a_cup
add("l5w2_t_cup4", "Which one is the cup?", "en", -10, EN_ASK)
add("l5w2_t_fork1", "A fork.", "en", -10, EN_ASK)
add("l5w2_t_fork2", "We eat meat with a fork.", "en", -10, EN_ASK)
add("l5w2_t_fork3", "Where is the fork?", "en", -10, EN_ASK)
add("l5w2_t_fork4", "Which one is the fork?", "en", -10, EN_ASK)
add("l5w2_t_done", "Let's eat!", "en", -8, EN_PRAISE)

# 题型 A：听音找餐具（4 条）
add("l5w2_a_bowl", "Find the bowl.", "en", -10, EN_ASK)
add("l5w2_a_spoon", "Find the spoon.", "en", -10, EN_ASK)
add("l5w2_a_cup", "Find the cup.", "en", -10, EN_ASK)
add("l5w2_a_fork", "Find the fork.", "en", -10, EN_ASK)

# 题型 B：听句子找场景（4 条，一句一景；与教学演示句不重复，结尾统一带「Find the picture.」）
add("l5w2_b_bowl", "The soup is in the bowl. Find the picture.", "en", -10, EN_ASK)
add("l5w2_b_spoon", "The spoon is in the bowl. Find the picture.", "en", -10, EN_ASK)
add("l5w2_b_cup", "The water is in the cup. Find the picture.", "en", -10, EN_ASK)
add("l5w2_b_fork", "The fork is on the meat. Find the picture.", "en", -10, EN_ASK)

# 题型 C：把餐具放进碗里（3 条；碗自己不能放进碗里，所以只有三件餐具）
add("l5w2_c_spoon", "Put the spoon in the bowl.", "en", -10, EN_ASK)
add("l5w2_c_fork", "Put the fork in the bowl.", "en", -10, EN_ASK)
add("l5w2_c_cup", "Put the cup in the bowl.", "en", -10, EN_ASK)

# ---- 第 5 岛第 3 关：喜好与需求表达（I like it / I don't like it / More, please / All done） ----
# 教学 17：4 个句型 × (2 演示 + 2 互动) + 过渡语
add("l5w3_t_like1", "I like it! The apple is yummy.", "en", -10, EN_ASK)
add("l5w3_t_like2", "I like it! I like milk.", "en", -10, EN_ASK)
add("l5w3_t_like3", "Who likes it? Find the happy one.", "en", -10, EN_ASK)
add("l5w3_t_like4", "Who likes the apple? Find him.", "en", -10, EN_ASK)
add("l5w3_t_nolike1", "I don't like it. It's sour.", "en", -10, EN_ASK)
add("l5w3_t_nolike2", "The lemon is sour. I don't like it.", "en", -10, EN_ASK)
add("l5w3_t_nolike3", "Find the one who doesn't like it.", "en", -10, EN_ASK)
add("l5w3_t_nolike4", "Who doesn't like the lemon? Find him.", "en", -10, EN_ASK)
add("l5w3_t_more1", "More, please! I want more milk.", "en", -10, EN_ASK)
add("l5w3_t_more2", "The cup is empty. More, please!", "en", -10, EN_ASK)
add("l5w3_t_more3", "The plate is empty. Find the empty plate.", "en", -10, EN_ASK)
add("l5w3_t_more4", "He wants more milk. Who is asking for more?", "en", -10, EN_ASK)
add("l5w3_t_done1", "All done! I am full.", "en", -10, EN_ASK)
add("l5w3_t_done2", "All done! No more, thank you.", "en", -10, EN_ASK)
add("l5w3_t_done3", "Find the boy who is all done.", "en", -10, EN_ASK)
add("l5w3_t_done4", "Find the boy who is full.", "en", -10, EN_ASK)
add("l5w3_t_out", "You can tell me what you like. Let's play!", "en", -8, EN_PRAISE)

# 题型 A：听短语找画面（4 条，固定用「冒号 + 短语」的听写式，与 B 的整句提问分开）
add("l5w3_a_like", "Find: I like it.", "en", -10, EN_ASK)
add("l5w3_a_nolike", "Find: I don't like it.", "en", -10, EN_ASK)
add("l5w3_a_more", "Find: more, please.", "en", -10, EN_ASK)
add("l5w3_a_done", "Find: all done.", "en", -10, EN_ASK)

# 题型 B：听情境选回答（4 条，情境卡在屏幕上，问「他会说什么」）
add("l5w3_b_like", "Look at the apple. What does he say?", "en", -10, EN_ASK)
add("l5w3_b_nolike", "Look at the sour lemon. What does he say?", "en", -10, EN_ASK)
add("l5w3_b_more", "The cup is empty. What does he say?", "en", -10, EN_ASK)
add("l5w3_b_done", "He finished his food. What does he say?", "en", -10, EN_ASK)

# 题型 C：把食物拖进「喜欢 / 不喜欢」框（4 条，柠檬永远进不喜欢的框）
add("l5w3_c_apple", "Put the apple in the happy box.", "en", -10, EN_ASK)
add("l5w3_c_milk", "Put the milk in the happy box.", "en", -10, EN_ASK)
add("l5w3_c_lemon", "Put the lemon in the sad box.", "en", -10, EN_ASK)
add("l5w3_c_lemon2", "He doesn't like the lemon. Put it in the sad box.", "en", -10, EN_ASK)

# ---- 第 5 岛第 4 关：餐厅点餐（I am hungry / I want / Here you are / Thank you） ----
# 教学 13 环节：I am hungry(2 演示+2 互动) + I want/Here you are(2 演示+2 互动) + Thank you(2 演示+2 互动) + 过渡
add("l5w4_t_hungry1", "I am hungry! My tummy is rumbling.", "en", -10, EN_ASK)
add("l5w4_t_hungry2", "The boy is hungry. He wants to eat.", "en", -10, EN_ASK)
add("l5w4_t_hungry_a1", "Who is hungry? Find the hungry boy.", "en", -10, EN_ASK)
add("l5w4_t_hungry_a2", "Which boy is hungry? Find him.", "en", -10, EN_ASK)
add("l5w4_t_want1", "I want an apple.", "en", -10, EN_ASK)
add("l5w4_t_here1", "Here you are!", "en", -10, EN_ASK)
add("l5w4_t_here_a1", "The boy wants an apple. Give it to him.", "en", -10, EN_ASK)
add("l5w4_t_here_a2", "Give the apple to the boy.", "en", -10, EN_ASK)
add("l5w4_t_thanks1", "The boy says: Thank you!", "en", -10, EN_ASK)
add("l5w4_t_thanks2", "The waiter gives food. Thank you!", "en", -10, EN_ASK)
add("l5w4_t_thanks_a1", "Find the picture: Here you are.", "en", -10, EN_ASK)
add("l5w4_t_thanks_a2", "Who is giving food? Find Here you are.", "en", -10, EN_ASK)
add("l5w4_t_out", "You are ready! Let's go to the restaurant!", "en", -8, EN_PRAISE)

# 题型 A：听音找客人状态（hungry / full / eating 三选一，题干固定）
add("l5w4_a", "Find the hungry boy.", "en", -10, EN_ASK)

# 题型 B：听需求配餐（面包 / 牛奶 / 苹果，各一条）
add("l5w4_b_bread", "I am hungry. I want some bread. Give it to him.", "en", -10, EN_ASK)
add("l5w4_b_milk", "I am hungry. I want some milk. Give it to him.", "en", -10, EN_ASK)
add("l5w4_b_apple", "I am hungry. I want an apple. Give it to him.", "en", -10, EN_ASK)

# 题型 C：听对话选场景（递苹果 / 哭 / 睡 三选一）
add("l5w4_c", "'Here you are' and 'Thank you'.", "en", -10, EN_ASK)

# ---- 第 5 岛第 5 关：上菜终极挑战（结业关，全岛语言点综合复习） ----
# 教学 24 环节（延长版复习，RULES §三.9 / §三.10）：欢迎 + 肚子饿(2演+2互) + 端上菜(2演+2互)
#   + 礼貌回应(2演+2互) + 吃饱/听懂拒绝(2演+2互) + 还要更多(1演+1互) + 餐具(2演+2互) + 过渡
add("l5w5_t_welcome", "Welcome to the restaurant! Let's serve the food.", "en", -8, EN_PRAISE)
add("l5w5_t_hungry1", "Look! The boy is hungry.", "en", -10, EN_ASK)
add("l5w5_t_hungry2", "He wants an apple.", "en", -10, EN_ASK)
add("l5w5_t_hungry_a1", "Who is hungry? Point to him.", "en", -10, EN_ASK)
add("l5w5_t_hungry_a2", "Find the boy who is hungry.", "en", -10, EN_ASK)
add("l5w5_t_here1", "Here you are. An apple for you.", "en", -10, EN_ASK)
add("l5w5_t_here2", "Here you are. Your food is ready.", "en", -10, EN_ASK)
add("l5w5_t_here_a1", "Give the apple to the boy. Put it on the table.", "en", -10, EN_ASK)
add("l5w5_t_here_a2", "Give the bread to the boy.", "en", -10, EN_ASK)
add("l5w5_t_thanks1", "Yum! The boy says thank you.", "en", -10, EN_ASK)
add("l5w5_t_thanks2", "She is so happy. Thank you!", "en", -10, EN_ASK)
add("l5w5_t_thanks_a1", "Find the happy boy.", "en", -10, EN_ASK)
add("l5w5_t_thanks_a2", "Who says thank you?", "en", -10, EN_ASK)
add("l5w5_t_full1", "Look! The boy is all done. He is full.", "en", -10, EN_ASK)
add("l5w5_t_full2", "He doesn't want more. All done!", "en", -10, EN_ASK)
add("l5w5_t_full_a1", "Who doesn't want more?", "en", -10, EN_ASK)
add("l5w5_t_full_a2", "Which boy is all done? Point to him.", "en", -10, EN_ASK)
add("l5w5_t_more1", "More, please!", "en", -10, EN_ASK)
add("l5w5_t_more_a1", "Who wants more?", "en", -10, EN_ASK)
add("l5w5_t_utensil1", "The soup is hot. We need a spoon.", "en", -10, EN_ASK)
add("l5w5_t_utensil2", "Look! The spoon is in the bowl.", "en", -10, EN_ASK)
add("l5w5_t_utensil_a1", "Point to the spoon.", "en", -10, EN_ASK)
add("l5w5_t_utensil_a2", "What do we eat with?", "en", -10, EN_ASK)
add("l5w5_t_out", "You are a great waiter! Let's play the real game!", "en", -8, EN_PRAISE)

# 题型 A：听需求端菜（面包 / 牛奶 / 苹果，拖给小女孩客人，各一条）
add("l5w5_a_bread", "The girl is hungry. She wants some bread.", "en", -10, EN_ASK)
add("l5w5_a_milk", "The girl is hungry. She wants some milk.", "en", -10, EN_ASK)
add("l5w5_a_apple", "The girl is hungry. She wants an apple.", "en", -10, EN_ASK)

# 题型 B：听对话找场景（在吃 / 不要了 / 还要更多 三选一，题干固定）
add("l5w5_b", "Find the one who wants more.", "en", -10, EN_ASK)

# 题型 C：听场景选餐具（热汤要勺子：勺子 / 杯子 / 叉子 三选一）
add("l5w5_c", "The soup is hot. What do we need?", "en", -10, EN_ASK)

# ---- 第 6 岛第 1 关：家具（Bed / Table / Chair / Sofa） ----
# 教学 17 环节：每个核心词 2 演示 + 2 互动（RULES §三.10 双倍量）+ 过渡语；
#   演示阶段点按推进（RULES §三.14，不自动进下一步）。
add("l6w1_t_bed1", "Look! A bed. We sleep on the bed.", "en", -10, EN_ASK)
add("l6w1_t_bed2", "The boy is sleeping on the bed.", "en", -10, EN_ASK)
add("l6w1_t_bed_a1", "Where is the bed? Touch the bed.", "en", -10, EN_ASK)
add("l6w1_t_bed_a2", "Touch the bed.", "en", -10, EN_ASK)
add("l6w1_t_table1", "Look! A table.", "en", -10, EN_ASK)
add("l6w1_t_table2", "The apple is on the table.", "en", -10, EN_ASK)
add("l6w1_t_table_a1", "Where is the table? Touch the table.", "en", -10, EN_ASK)
add("l6w1_t_table_a2", "Touch the table.", "en", -10, EN_ASK)
add("l6w1_t_chair1", "Look! A chair. We sit on the chair.", "en", -10, EN_ASK)
add("l6w1_t_chair2", "The cat is sitting on the chair.", "en", -10, EN_ASK)
add("l6w1_t_chair_a1", "Where is the chair? Touch the chair.", "en", -10, EN_ASK)
add("l6w1_t_chair_a2", "Touch the chair.", "en", -10, EN_ASK)
add("l6w1_t_sofa1", "Look! A sofa. The sofa is soft.", "en", -10, EN_ASK)
add("l6w1_t_sofa2", "The cat is on the sofa.", "en", -10, EN_ASK)
add("l6w1_t_sofa_a1", "Where is the sofa? Touch the sofa.", "en", -10, EN_ASK)
add("l6w1_t_sofa_a2", "Touch the sofa.", "en", -10, EN_ASK)
add("l6w1_t_out", "You know the house! Let's play!", "en", -8, EN_PRAISE)

# 题型 A：听音找家具（目标 + 2 干扰，抽 3 个）
add("l6w1_a_bed", "Find the bed.", "en", -10, EN_ASK)
add("l6w1_a_table", "Find the table.", "en", -10, EN_ASK)
add("l6w1_a_chair", "Find the chair.", "en", -10, EN_ASK)
add("l6w1_a_sofa", "Find the sofa.", "en", -10, EN_ASK)

# 题型 B：听句子找场景（男孩在床上 / 苹果在桌上 / 猫在沙发上）
add("l6w1_b_bed", "The boy is sleeping on the bed. Find the picture.", "en", -10, EN_ASK)
add("l6w1_b_table", "The apple is on the table. Find the picture.", "en", -10, EN_ASK)
add("l6w1_b_sofa", "The cat is on the sofa. Find the picture.", "en", -10, EN_ASK)

# 题型 C：拖物品布置房间（枕头→床、猫→沙发）
add("l6w1_c_pillow", "Put the pillow on the bed.", "en", -10, EN_ASK)
add("l6w1_c_cat", "Put the cat on the sofa.", "en", -10, EN_ASK)

# ---- 第 6 岛第 2 关：家里的小日常（Watch TV / Read a book / Take a bath / Go to sleep） ----
# 教学 17 环节：每个核心动作 2 演示 + 2 互动（RULES §三.10 双倍量）+ 过渡语；
#   演示阶段点按推进（RULES §三.14，不自动进下一步）。
add("l6w2_t_tv1", "Look! The boy is watching TV.", "en", -10, EN_ASK)
add("l6w2_t_tv2", "He likes watching TV.", "en", -10, EN_ASK)
add("l6w2_t_tv_a1", "Who is watching TV? Touch the boy.", "en", -10, EN_ASK)
add("l6w2_t_tv_a2", "Touch the boy watching TV.", "en", -10, EN_ASK)
add("l6w2_t_read1", "Look! The girl is reading a book.", "en", -10, EN_ASK)
add("l6w2_t_read2", "She is reading a story.", "en", -10, EN_ASK)
add("l6w2_t_read_a1", "Find the one reading a book.", "en", -10, EN_ASK)
add("l6w2_t_read_a2", "Touch the girl reading a book.", "en", -10, EN_ASK)
add("l6w2_t_bath1", "Look! The baby is taking a bath. So many bubbles!", "en", -10, EN_ASK)
add("l6w2_t_bath2", "The baby has a little duck. Splash, splash!", "en", -10, EN_ASK)
add("l6w2_t_bath_a1", "Find the one taking a bath.", "en", -10, EN_ASK)
add("l6w2_t_bath_a2", "Touch the baby taking a bath.", "en", -10, EN_ASK)
add("l6w2_t_sleep1", "It's night. The baby is going to sleep. Good night!", "en", -10, EN_ASK)
add("l6w2_t_sleep2", "The baby is sleeping. Good night.", "en", -10, EN_ASK)
add("l6w2_t_sleep_a1", "Find the one going to sleep.", "en", -10, EN_ASK)
add("l6w2_t_sleep_a2", "Who is going to sleep?", "en", -10, EN_ASK)
add("l6w2_t_out", "You know your daily life! Let's play!", "en", -8, EN_PRAISE)

# 题型 A：听音找动作（看电视 / 看书 / 洗澡 / 睡觉）
add("l6w2_a_tv", "Find the boy watching TV.", "en", -10, EN_ASK)
add("l6w2_a_read", "Find the girl reading a book.", "en", -10, EN_ASK)
add("l6w2_a_bath", "Find the baby taking a bath.", "en", -10, EN_ASK)
add("l6w2_a_sleep", "Find the baby going to sleep.", "en", -10, EN_ASK)

# 题型 B：听场景找房间（浴室 / 客厅 / 卧室）
add("l6w2_b_bath", "Where is he taking a bath? Find the bathroom.", "en", -10, EN_ASK)
add("l6w2_b_tv", "Where is he watching TV? Find the living room.", "en", -10, EN_ASK)
add("l6w2_b_sleep", "Where is he going to sleep? Find the bedroom.", "en", -10, EN_ASK)

# 题型 C：拖宝宝做日常（放床上睡觉、放浴缸洗澡）
add("l6w2_c_sleep", "Put the baby on the bed. He is going to sleep.", "en", -10, EN_ASK)
add("l6w2_c_bath", "Put the baby in the bathtub.", "en", -10, EN_ASK)

# ---- 第 6 岛第 3 关：找东西（Where is the ball? It's in / on / under the ...） ----
# 教学 15 环节：on / under / in 各 2 演示 + 2 互动（RULES §三.10 双倍量）+ 综合 1 演示 1 互动 + 过渡语；
#   演示阶段点按推进（RULES §三.14，播完定格，点屏幕才进下一步）。
add("l6w3_t_on1", "Where is the ball? It's on the sofa.", "en", -10, EN_ASK)
add("l6w3_t_on2", "Look! The ball is on the sofa.", "en", -10, EN_ASK)
add("l6w3_t_on_a1", "Can you see the ball? Touch the ball on the sofa.", "en", -10, EN_ASK)
add("l6w3_t_on_a2", "Now touch the ball on the table.", "en", -10, EN_ASK)
add("l6w3_t_under1", "Where is the ball? It's under the bed.", "en", -10, EN_ASK)
add("l6w3_t_under2", "Look! The ball is under the bed.", "en", -10, EN_ASK)
add("l6w3_t_under_a1", "Find the ball under the bed.", "en", -10, EN_ASK)
add("l6w3_t_under_a2", "Now touch the ball under the table.", "en", -10, EN_ASK)
add("l6w3_t_in1", "Where is the ball? It's in the box.", "en", -10, EN_ASK)
add("l6w3_t_in2", "Look! The ball is in the chest.", "en", -10, EN_ASK)
add("l6w3_t_in_a1", "Where is the ball? It's in the box. Touch the ball.", "en", -10, EN_ASK)
add("l6w3_t_in_a2", "Find the ball in the box.", "en", -10, EN_ASK)
add("l6w3_t_room1", "Look at the room! Where is the ball? It's in the box.", "en", -10, EN_ASK)
add("l6w3_t_room_a1", "It's on the table. Touch the ball.", "en", -10, EN_ASK)
add("l6w3_t_out", "You found it! Let's play!", "en", -8, EN_PRAISE)

# 题型 A：单图寻物（一张图里 3 个球，点语音指定的那个）
add("l6w3_a_under_table", "Where is the ball? It's under the table. Touch the ball.", "en", -10, EN_ASK)
add("l6w3_a_on_sofa", "Where is the ball? It's on the sofa. Touch the ball.", "en", -10, EN_ASK)
add("l6w3_a_under_bed", "Where is the ball? It's under the bed. Touch the ball.", "en", -10, EN_ASK)
add("l6w3_a_on_table", "Where is the ball? It's on the table. Touch the ball.", "en", -10, EN_ASK)

# 题型 B：多场景选一（三张小图，点语音描述的那张）
add("l6w3_b_on_sofa", "The ball is on the sofa. Find the picture.", "en", -10, EN_ASK)
add("l6w3_b_under_bed", "The ball is under the bed. Find the picture.", "en", -10, EN_ASK)
add("l6w3_b_in_box", "The ball is in the box. Find the picture.", "en", -10, EN_ASK)

# 题型 C：拖球藏球（拖到沙发上 / 桌子下）
add("l6w3_c_on_sofa", "Put the ball on the sofa.", "en", -10, EN_ASK)
add("l6w3_c_under_table", "Put the ball under the table.", "en", -10, EN_ASK)

# ---- 第 6 岛第 4 关：听指令做家务（Put the [物品] on/in/under the [家具]） ----
# 本关是长句复合方位指令，语速统一收到 -15（speech_rate=-15 ≈ 0.85x，让孩子听清每个词）。
# 清单自检（RULES §1.8）：与既有条目去重——同一句话复用同一 key（RULES §1.12）：
#   · "Put the ball under the table." 已存在于 l6w3_c_under_table（F13 题型 C，rate -10），本关多处复用它；
#   · "Put the book on the table." 已存在于 pt_book（旧关），本关复用；
#   · 教学互动的短指令 "Put the book on the bed." / "Put the toy in the box." 直接复用本关答题键 l6w4_a_book_bed / l6w4_a_toy_box；
#   · 题型 C 第 4 组（先放书到床、再放玩具进箱）复用 l6w4_c1_s1 + l6w4_c3_s2，不再新建。
# 构成（共 17 条新生成 + 若干复用）：
#   教学 10 环节：书放床上（2 演示 + 1 互动）、玩具进箱子（2 演示 + 1 互动）、球滚桌下（2 演示 + 1 综合互动）、过渡。
#   题型 A 4 条：单指令拖拽（Put the <item> <prep> the <furn>.）。
#   题型 B 3 条：听句找图（The <item> is <prep> the <furn>. Find the picture.）。
#   题型 C 多步指令（First,... Then,...）；实际生成 6 条新句（c1~c3 的两步），第 4 组复用 c1/c3。
# 注：物品 = book / toy / ball；家具 = bed / table / box；方位 = on / in / under。
add("l6w4_t_book1", "Look! A book. We need to put the book on the bed.", "en", -15, EN_ASK)
add("l6w4_t_book2", "Put the book on the bed. Great!", "en", -15, EN_ASK)
add("l6w4_t_toy1", "Look! A box and a toy. Put the toy in the box.", "en", -15, EN_ASK)
add("l6w4_t_toy2", "Put the toy in the box. Perfect!", "en", -15, EN_ASK)
add("l6w4_t_ball1", "Look! A table and a ball. Put the ball under the table.", "en", -15, EN_ASK)
add("l6w4_t_ball2", "Watch! The ball rolls under the table.", "en", -15, EN_ASK)
add("l6w4_t_out", "You are a great helper! Let's play!", "en", -12, EN_PRAISE)

# 题型 A：单指令拖拽（拖正确物品到正确家具）
add("l6w4_a_book_bed", "Put the book on the bed.", "en", -15, EN_ASK)
add("l6w4_a_toy_box", "Put the toy in the box.", "en", -15, EN_ASK)
#   · "Put the book on the table." 复用 pt_book；"Put the ball under the table." 复用 l6w3_c_under_table（见下）

# 题型 B：听句找图（三张复合场景：书在床上 / 球在桌下 / 玩具在箱子里）
add("l6w4_b_bookbed", "The book is on the bed. Find the picture.", "en", -15, EN_ASK)
add("l6w4_b_balltable", "The ball is under the table. Find the picture.", "en", -15, EN_ASK)
add("l6w4_b_toybox", "The toy is in the box. Find the picture.", "en", -15, EN_ASK)

# 题型 C：多步指令（先放 X 到 Y，再放 X 到 Y）
add("l6w4_c1_s1", "First, put the book on the bed.", "en", -15, EN_ASK)
add("l6w4_c1_s2", "Then, put the ball under the table.", "en", -15, EN_ASK)
add("l6w4_c2_s1", "First, put the toy in the box.", "en", -15, EN_ASK)
add("l6w4_c2_s2", "Then, put the book on the table.", "en", -15, EN_ASK)
add("l6w4_c3_s1", "First, put the ball under the table.", "en", -15, EN_ASK)
add("l6w4_c3_s2", "Then, put the toy in the box.", "en", -15, EN_ASK)
#   · 题型 C 第 4 组（书到床→玩具进箱）复用 l6w4_c1_s1 + l6w4_c3_s2
#   · "Put the ball under the table."（C 的 Then / 演示 / 答题 A）统一复用 l6w3_c_under_table

# ---- 第 6 岛第 5 关：游乐场 · 帮小人整理房间综合大考（L6-W5） ----
# 综合复习关，句型仍是 Put the [物品] on/in/under the [家具]，但物品扩到 书/玩具/球/衣服，家具扩到 床/桌/箱/椅/书架。
# 长句统一 rate -15（≈0.85x）。去重复用（RULES §1.12 同句同 key）：
#   · "Put the book on the bed."            → l6w4_a_book_bed（教学互动 1 复用）
#   · "Put the toy in the box."             → l6w4_a_toy_box（演示 3 / 互动 2 复用）
#   · "Put the ball under the table."        → l6w3_c_under_table（题型 A 复用）
#   · "The book is on the bed. Find the picture." → l6w4_b_bookbed（题型 B 复用）
#   · "The toy is in the box. Find the picture."  → l6w4_b_toybox（题型 B 复用）
# 本批共新生成 15 条：教学 3 + 题型 A 3 + 题型 B 1 + 题型 C 8。
add("f15_t_messy", "Look! The room is messy. Let's clean it up.", "en", -15, EN_ASK)
add("f15_t_ask1",  "Can you help me? Put the book on the bookshelf.", "en", -15, EN_ASK)
add("f15_t_out",   "Wow! The room is so clean! You are a great helper! Let's play!", "en", -12, EN_PRAISE)

# 题型 A：单步整理（3 物品 + 3 家具）
add("f15_a_clothes_bed",   "Put the clothes on the bed.", "en", -15, EN_ASK)
add("f15_a_book_shelf",    "Put the book on the bookshelf.", "en", -15, EN_ASK)
add("f15_a_clothes_chair", "Put the clothes on the chair.", "en", -15, EN_ASK)

# 题型 B：听长句找场景（书在床上 / 玩具在箱子里 / 衣服在椅子上；前两句复用第 4 关）
add("f15_b_clothes_chair", "The clothes are on the chair. Find the picture.", "en", -15, EN_ASK)

# 题型 C：多步指令（First… Then…）。与第 4 关重复的 5 句直接复用
#   l6w4_c1_s1（First, put the book on the bed.）/ l6w4_c1_s2（Then, put the ball under the table.）/
#   l6w4_c2_s1（First, put the toy in the box.）/ l6w4_c3_s1（First, put the ball under the table.）/
#   l6w4_c3_s2（Then, put the toy in the box.），只新生成 3 条真正的新句：
add("f15_c2_s2", "Then, put the clothes on the bed.", "en", -15, EN_ASK)
add("f15_c3_s2", "Then, put the book on the bookshelf.", "en", -15, EN_ASK)
add("f15_c4_s1", "First, put the clothes on the chair.", "en", -15, EN_ASK)

# ---- 第 3 岛第 4 关重做：重量感知 Heavy / Light（旧「找不同」已彻底删除）----
# 长句统一 rate -15（≈0.85x，让孩子听清 heavy / light / who is ...）。去重：本批全部为新句。
# 教学 7 环节：石头vs羽毛 / 石头坠地 / 大象vs气球(互动) / 羽毛特写 / 跷跷板 / 书vs羽毛(互动) / 过渡；
# 互动 2 的 "Find the light one." 与题型 A 复用同一 key b4_a_light。
add("b4_t_rock_feather", "Look! A rock and a feather. The rock is heavy.", "en", -15, EN_ASK)
add("b4_t_rock_falls",   "The rock is heavy. It falls down fast.", "en", -15, EN_ASK)
add("b4_t_elephant_ask", "The elephant is heavy. Find the heavy one.", "en", -15, EN_ASK)
add("b4_t_feather",      "Look at the feather. It is light. It flies in the sky.", "en", -15, EN_ASK)
add("b4_t_seesaw",       "The balloon is light. The rock is heavy.", "en", -15, EN_ASK)
add("b4_t_out",          "You know heavy and light! Let's play!", "en", -12, EN_PRAISE)

# 题型 A：听音找重量
add("b4_a_heavy", "Find the heavy one.", "en", -15, EN_ASK)
add("b4_a_light", "Find the light one.", "en", -15, EN_ASK)

# 题型 B：跷跷板逻辑（长句）
add("b4_b_elephant_monkey_heavy", "The elephant is heavy. The monkey is light. Who is heavy?", "en", -15, EN_ASK)
add("b4_b_rock_balloon_light",    "The rock is heavy. The balloon is light. Who is light?", "en", -15, EN_ASK)
add("b4_b_elephant_feather_heavy", "The elephant is heavy. The feather is light. Who is heavy?", "en", -15, EN_ASK)
add("b4_b_rock_apple_light",      "The rock is heavy. The apple is light. Who is light?", "en", -15, EN_ASK)

# 题型 C：拖拽分类
add("b4_c_rock",     "Put the heavy rock in the heavy box.", "en", -15, EN_ASK)
add("b4_c_balloon",  "Put the light balloon in the light box.", "en", -15, EN_ASK)
add("b4_c_elephant", "Put the heavy elephant in the heavy box.", "en", -15, EN_ASK)
add("b4_c_apple",    "Put the light apple in the light box.", "en", -15, EN_ASK)

# ---- 第 3 岛第 5 关彻底重做：游乐场 · 综合比较大考（旧的「比较与分类」全删）----
# 长句统一 rate -15（≈0.85x）。去重说明（RULES §一.12）：
#   · 题型 A 的 bigger / smaller / longer / shorter 复用旧批 b5_a_bigger / b5_a_smaller / b5_a_longer / b5_a_shorter
#   · 题型 C 的 rock / balloon / elephant 与第 4 关同句，复用 b4_c_rock / b4_c_balloon / b4_c_elephant
#   · 只有下面 14 条是真正的新句
# 教学 8 环节：大门钥匙 / 大象vs老鼠(互动) / 断桥木板 / 长火车vs短汽车(互动) / 硬币 / 跷跷板 / 石头放跷跷板(互动) / 过渡
add("b5x_t_gate",   "Look! The big key and the small key. We need the big key.", "en", -15, EN_ASK)
add("b5x_t_ask1",   "Find the big animal to help us.", "en", -15, EN_ASK)
add("b5x_t_bridge", "The short board is too short. We need the long board.", "en", -15, EN_ASK)
add("b5x_t_ask2",   "Find the long one.", "en", -15, EN_ASK)
add("b5x_t_coins",  "We have few coins. We need more coins!", "en", -15, EN_ASK)
add("b5x_t_seesaw", "The elephant is heavy. The feather is light.", "en", -15, EN_ASK)
add("b5x_t_ask3",   "Put the heavy rock on the seesaw.", "en", -15, EN_ASK)
add("b5x_t_out",    "Wow! You know big, long, more and heavy! Let's play!", "en", -12, EN_PRAISE)

# 题型 A：两件物品听比较词（只需新生成 heavy / light 两问）
add("b5x_a_heavy", "Which one is heavy?", "en", -15, EN_ASK)
add("b5x_a_light", "Which one is light?", "en", -15, EN_ASK)

# 题型 B：三个场景选画面（断桥 / 大门 / 跷跷板）
add("b5x_b_bridge", "We need the long board. Find the picture.", "en", -15, EN_ASK)
add("b5x_b_gate",   "We need the big key. Find the picture.", "en", -15, EN_ASK)
add("b5x_b_seesaw", "The elephant is heavy. The feather is light. Find the picture.", "en", -15, EN_ASK)

# 题型 C：终极大拖拽（其余三句复用第 4 关）
add("b5x_c_feather", "Put the light feather in the light box.", "en", -15, EN_ASK)

# ---- 第 7 岛第 1 关：认识五官 eye / nose / mouth / ear ----
# 全部为长句/短句混排，统一 rate -15（≈0.85x）；本批 25 条都是新句（去重自检已确认无重复文本）。
# 教学 13 环节：空白脸 → 眼睛(演示×2+互动) → 鼻子(×2+互动) → 嘴巴(×2+互动) → 耳朵(×2) → 综合互动(点耳) → 过渡
add("g1_t_face",      "Look! A face. But it has no eyes. Where are the eyes?", "en", -15, EN_ASK)
add("g1_t_eyes",      "Eyes. We see with our eyes.", "en", -15, EN_ASK)
add("g1_t_eyes_ask",  "Find the eyes. Put the eyes on the face.", "en", -15, EN_ASK)
add("g1_t_nose1",     "A nose.", "en", -15, EN_ASK)
add("g1_t_nose2",     "We smell with our nose.", "en", -15, EN_ASK)
add("g1_t_nose_ask",  "Put the nose on the face.", "en", -15, EN_ASK)
add("g1_t_mouth1",    "A mouth.", "en", -15, EN_ASK)
add("g1_t_mouth2",    "We eat with our mouth.", "en", -15, EN_ASK)
add("g1_t_mouth_ask", "Put the mouth on the face.", "en", -15, EN_ASK)
add("g1_t_ear1",      "Ears.", "en", -15, EN_ASK)
add("g1_t_ear2",      "We hear with our ears.", "en", -15, EN_ASK)
add("g1_t_ear_ask",   "Where is the ear? Touch the ear.", "en", -15, EN_ASK)
add("g1_t_out",       "Wow! A happy face! Let's play!", "en", -12, EN_PRAISE)

# 题型 A：听音拼脸（缺一个器官）
add("g1_a_eye",   "Where are the eyes? Put the eyes on the face.", "en", -15, EN_ASK)
add("g1_a_nose",  "Where is the nose? Put the nose on the face.", "en", -15, EN_ASK)
add("g1_a_mouth", "Where is the mouth? Put the mouth on the face.", "en", -15, EN_ASK)
add("g1_a_ear",   "Where is the ear? Put the ear on the face.", "en", -15, EN_ASK)

# 题型 B：听音找五官（三张小脸选一张）
add("g1_b_eye",   "Find the eyes.", "en", -15, EN_ASK)
add("g1_b_nose",  "Find the nose.", "en", -15, EN_ASK)
add("g1_b_mouth", "Find the mouth.", "en", -15, EN_ASK)
add("g1_b_ear",   "Find the ear.", "en", -15, EN_ASK)

# 题型 C：快速反应（四个器官点目标）
add("g1_c_eye",   "Touch your eyes!", "en", -15, EN_ASK)
add("g1_c_nose",  "Touch your nose!", "en", -15, EN_ASK)
add("g1_c_mouth", "Touch your mouth!", "en", -15, EN_ASK)
add("g1_c_ear",   "Touch your ear!", "en", -15, EN_ASK)

# ---- 第 7 岛第 2 关：身体部位与 TPR 动作（Head / Hand / Foot）----
# 全部长句/短语混排，统一 rate -15（≈0.85x，满足用户「语速调慢 0.85 倍」）。
# 教学 11 环节：身体登场 → 头(2 演示+1 互动) → 手(2 演示+1 互动) → 脚(2 演示+1 综合互动) → TPR 模仿(拍手+👍)；
# 其中演示 4 的 "Clap your hands!" 与答题 B(hand) 同一句，复用同一 key g2_t_hand2；
# 演示 6 的 "Stomp your feet!" 与答题 B(foot) 同一句，复用 g2_t_foot2（RULES §1.12 同句同 key）。
# 本批 20 条新生成（g2_t_hand2 / g2_t_foot2 被 B 型复用，不另建重复文本），已通过 audit 去重自检。
add("g2_t_body",      "Look! A silly body. Where is the head?", "en", -15, EN_ASK)
add("g2_t_head",      "A head. We nod our head.", "en", -15, EN_ASK)
add("g2_t_head_ask",  "Put the head on the body.", "en", -15, EN_ASK)
add("g2_t_hand1",     "Now, the hands.", "en", -15, EN_ASK)
add("g2_t_hand2",     "Clap your hands!", "en", -15, EN_ASK)
add("g2_t_hand_ask",  "Put the hands on the body.", "en", -15, EN_ASK)
add("g2_t_foot1",     "Look at the feet.", "en", -15, EN_ASK)
add("g2_t_foot2",     "Stomp your feet!", "en", -15, EN_ASK)
add("g2_t_happy",     "Look at the happy boy! Let's move!", "en", -15, EN_ASK)
add("g2_t_tpr",       "Listen and do! Clap your hands!", "en", -15, EN_ASK)
add("g2_t_youdo",     "Now you! Clap your hands, then touch the button!", "en", -15, EN_ASK)
add("g2_t_great",     "Great! You did it!", "en", -12, EN_PRAISE)
# 答题 A：听音拼身体（缺一个部位）
add("g2_a_head",  "Where is the head? Put the head here.", "en", -15, EN_ASK)
add("g2_a_hand",  "Where are the hands? Put the hands here.", "en", -15, EN_ASK)
add("g2_a_foot",  "Where are the feet? Put the feet here.", "en", -15, EN_ASK)
# 答题 B：听指令做动作（hand/foot 复用 g2_t_hand2 / g2_t_foot2；head 新生成）
add("g2_b_head",  "Touch your head!", "en", -15, EN_ASK)
# 答题 C：听指令找部位（三个小人各高亮头/手/脚并演示该动作）
add("g2_c_head",  "Find the head. Who is nodding?", "en", -15, EN_ASK)
add("g2_c_hand",  "Find the hands. Who is clapping?", "en", -15, EN_ASK)
add("g2_c_foot",  "Find the feet. Who is stomping?", "en", -15, EN_ASK)

# ---- 第 7 岛第 3 关：复合指令（First... Then... Touch your..., then...）----
# 主题「魔法机器人」：机器人睡着 → 唤醒 → 演示两步复合指令 → 孩子模仿 + 点大按钮确认。
# 全部 rate -15（≈0.85x）。教学 10 环节：唤醒(演示1) + 头拍手(演示2+互动1) +
# 鼻跺脚(演示3/4 + 互动2) + 眼跳(演示5/6 + 互动3) + 过渡语；每指令 2 次演示（第二次为分步高亮，视觉不同）。
# 语音复用（RULES §1.12 同句同 key）：
#   - 互动成功句复用 g2_t_great（"Great! You did it!"）；
#   - 答题 B 的 eyes+jump 复用教学 g3_t_cmd3；head+stomp / ears+clap 与答题 A 共用；
#   - 答题 B 第一步落位后播 then 分句（g3_then_*）。
# 本批 21 条新生成，已通过 audit 去重自检。
add("g3_t_robot",   "Look! A magic robot. Let's start it!", "en", -15, EN_ASK)
add("g3_t_cmd1",    "First, touch your head. Then, clap your hands.", "en", -15, EN_ASK)
add("g3_t_cmd2",    "First, touch your nose. Then, stomp your feet.", "en", -15, EN_ASK)
add("g3_t_cmd3",    "First, close your eyes. Then, jump!", "en", -15, EN_ASK)
add("g3_t_youdo",   "Now you! Do it, then touch the button!", "en", -15, EN_ASK)
add("g3_t_out",     "Wow! The robot is awake! Let's play!", "en", -12, EN_PRAISE)
# 答题 A/B 共用指令（A 听指令做两步动作 / B 听指令按顺序拖拽）
add("g3_cmd_ears_clap",  "First, touch your ears. Then, clap your hands.", "en", -15, EN_ASK)
add("g3_cmd_head_stomp", "First, touch your head. Then, stomp your feet.", "en", -15, EN_ASK)
add("g3_cmd_nose_jump",  "First, touch your nose. Then, jump!", "en", -15, EN_ASK)
add("g3_cmd_eyes_clap",  "First, close your eyes. Then, clap your hands.", "en", -15, EN_ASK)
add("g3_cmd_nose_clap",  "First, touch your nose. Then, clap your hands.", "en", -15, EN_ASK)
# 答题 B：第一步落位后口播第二步（then 分句）
add("g3_then_clap",  "Then, clap your hands!", "en", -15, EN_ASK)
add("g3_then_stomp", "Then, stomp your feet!", "en", -15, EN_ASK)
add("g3_then_jump",  "Then, jump!", "en", -15, EN_ASK)
# 答题 C：听长句找错误（滑稽小人动作做反 / 做对，✅/❌ 判断，答案 50/50 混合防视觉作弊）
add("g3_c_ask",        "Did he do it right?", "en", -15, EN_ASK)
add("g3_c_head_nose",  "First, touch your head. Then, touch your nose.", "en", -15, EN_ASK)
add("g3_c_nose_head",  "First, touch your nose. Then, touch your head.", "en", -15, EN_ASK)
add("g3_c_ears_nose",  "First, touch your ears. Then, touch your nose.", "en", -15, EN_ASK)
add("g3_c_nose_ears",  "First, touch your nose. Then, touch your ears.", "en", -15, EN_ASK)
add("g3_c_head_ears",  "First, touch your head. Then, touch your ears.", "en", -15, EN_ASK)
add("g3_c_ears_head",  "First, touch your ears. Then, touch your head.", "en", -15, EN_ASK)

# ---- 第 7 岛第 4 关：快速反应群像找茬（I Spy）----
# 主题「视力大挑战」：3–5 个手写 SVG 卡通小人同屏，听指令找出做对应动作的那个。
# 全部 rate -15（≈0.85x）。教学 13 环节（3 个知识点 × 2 演示 + 2 互动 + 过渡，RULES §三.10 双倍量）：
#   摸耳朵男孩(3→4 人) / 拍手女孩(4→5 人) / 闭眼小人(4→5 人)。
# 语音复用（RULES §1.12 同句同 key）：
#   - 教学「摸耳朵男孩」「拍手女孩」两句同时是答题 A/C 的题干；
#   - 答题 C（动作纠错）复用 A 的题干句（名词是陷阱，答案靠动作）；
#   - 互动成功句 g4_t_great 本关专用（找到啦的夸奖）。
# 本批 20 条新生成，已通过 audit 去重自检。
add("g4_t_ear_intro", "Look! So many children. Find the boy touching his ear.", "en", -15, EN_ASK)
add("g4_t_ear",       "Find the boy touching his ear.", "en", -15, EN_ASK)
add("g4_t_clap",      "Find the girl clapping her hands.", "en", -15, EN_ASK)
add("g4_t_eyes",      "Find the one closing his eyes.", "en", -15, EN_ASK)
add("g4_t_out",       "You have sharp eyes! Let's play!", "en", -12, EN_PRAISE)
add("g4_t_great",     "Great! You found him!", "en", -12, EN_PRAISE)
# 答题 A 题干（单目标群像找茬；boy+ear / girl+clap 复用教学句）
add("g4_a_boy_stomp",  "Find the boy stomping his feet.", "en", -15, EN_ASK)
add("g4_a_girl_jump",  "Find the girl jumping.", "en", -15, EN_ASK)
add("g4_a_boy_nose",   "Find the boy touching his nose.", "en", -15, EN_ASK)
add("g4_a_girl_eyes",  "Find the girl closing her eyes.", "en", -15, EN_ASK)
add("g4_a_boy_head",   "Find the boy touching his head.", "en", -15, EN_ASK)
add("g4_a_girl_ear",   "Find the girl touching her ear.", "en", -15, EN_ASK)
# 答题 B 题干（双目标复合找茬：先点一个，再点另一个；第一步落位后口播 then 分句）
add("g4_b1",      "First, find the boy touching his nose. Then, find the girl jumping.", "en", -15, EN_ASK)
add("g4_b1_then", "Then, find the girl jumping.", "en", -15, EN_ASK)
add("g4_b2",      "First, find the girl touching her ear. Then, find the boy clapping his hands.", "en", -15, EN_ASK)
add("g4_b2_then", "Then, find the boy clapping his hands.", "en", -15, EN_ASK)
add("g4_b3",      "First, find the boy touching his head. Then, find the girl stomping her feet.", "en", -15, EN_ASK)
add("g4_b3_then", "Then, find the girl stomping her feet.", "en", -15, EN_ASK)
add("g4_b4",      "First, find the girl closing her eyes. Then, find the boy jumping.", "en", -15, EN_ASK)
add("g4_b4_then", "Then, find the boy jumping.", "en", -15, EN_ASK)

# ---- 第 7 岛第 5 关：TPR 终极游乐场（结业关，只考不教新词，RULES §三.9）----
# 主题「全身运动游乐场 / 街机跳舞机」：热身复习本岛全部身体部位与动作，答题大量 TPR（做动作 + 点大👍确认）。
# 全部 rate -15（≈0.85x）。教学 7 环节：摸头+拍手（2 演示 + 1 互动）→ 摸鼻+跺脚（2 演示 + 1 互动）→ 过渡。
# 语音复用（RULES §1.12 同句同 key）：
#   - 互动成功句复用 g2_t_great（"Great! You did it!"）；
#   - 答题 A 单步动作复用 g2_t_hand2 / g2_t_foot2 / g2_b_head / g1_c_nose；
#   - 答题 B 复合指令复用 g3 的 8 条 First... Then... 句；
#   - 答题 C 找小人复用 g4 的 8 条 Find the boy/girl... 句。
# 本批仅 10 条新生成，已通过 audit 去重自检。
add("g5_t_warmup",  "Welcome to the action park! Let's warm up. First, touch your head. Then, clap your hands.", "en", -15, EN_ASK)
add("g5_t_youdo1",  "Now you try! Touch your head, then clap your hands.", "en", -15, EN_ASK)
add("g5_t_next",    "Great! Next, touch your nose. Then, stomp your feet.", "en", -15, EN_ASK)
add("g5_t_youdo2",  "Touch your nose, then stomp your feet.", "en", -15, EN_ASK)
add("g5_t_out",     "You are ready! Let's start the action!", "en", -12, EN_PRAISE)
# 答题 A：单步动作大比拼（clap/stomp/head/nose 复用既有 key；jump/ears/闭眼 新生成）
add("g5_a_jump",  "Jump!", "en", -15, EN_ASK)
add("g5_a_ears",  "Touch your ears!", "en", -15, EN_ASK)
add("g5_a_eyes",  "Close your eyes!", "en", -15, EN_ASK)
# 答题 B：复合指令大挑战（ears+jump 是用户示例句，新生成；其余复用 g3 复合句）
add("g5_b_ears_jump", "First, touch your ears. Then, jump!", "en", -15, EN_ASK)
# 答题 C：听指令找对应小人（boy+eyes 为用户示例句；其余复用 g4 的 Find... 句）
add("g5_c_boy_eyes", "Find the boy touching his eyes.", "en", -15, EN_ASK)

# ---- 第 8 岛第 1 关：基础情绪（Happy / Sad / Angry）----
# 第 8 岛主题改为「情绪与感受」，本关是开篇：空白脸谱 + 情绪零件（弯眼睛/笑眯眯嘴、流泪眼/下垂嘴、倒竖眉/生气嘴）。
# 全部 rate -15（≈0.85x，用户要求的慢速）；过渡语用 EN_PRAISE。
# 教学 13 环节（RULES §三.10 双倍量：3 个情绪 × 2 演示 + 2 互动）+ 过渡：
#   · 演示 1：空白脸 → 语音描述零件 → 动画拼上（播完定格等点按，§三.14）；
#   · 演示 2：完整脸 + 情绪氛围（笑脸闪光 / 流泪动画 / 生气蒸汽），句式与画面都不同；
#   · 互动 1：模仿做表情 + 巨大👍按钮确认（§三.12 永远判对，4 秒小手 §二.12）；
#   · 互动 2：三张脸谱点出目标情绪（点错抖 + again）。
# 语音复用：互动 1 成功句复用 g2_t_great（"Great! You did it!"，RULES §1.12 同句同 key）。
# 本批 23 条新生成，已通过 audit 去重自检。
add("h1_t_happy1",    "Let's make a happy face! Look at the smiling mouth and happy eyes.", "en", -15, EN_ASK)
add("h1_t_happy2",    "He is happy! Look at his big smile!", "en", -15, EN_ASK)
add("h1_t_happy_ask", "Can you make a happy face? Smile!", "en", -15, EN_ASK)
add("h1_t_happy_find","Which face is happy? Touch the happy face.", "en", -15, EN_ASK)
add("h1_t_sad1",      "Oh no. Let's make a sad face. Look at the crying eyes and sad mouth.", "en", -15, EN_ASK)
add("h1_t_sad2",      "The little boy is sad. He is crying.", "en", -15, EN_ASK)
add("h1_t_sad_ask",   "Show me a sad face.", "en", -15, EN_ASK)
add("h1_t_sad_find",  "Which face is sad? Touch the sad face.", "en", -15, EN_ASK)
add("h1_t_angry1",    "Grrr! Let's make an angry face. Look at the angry eyebrows.", "en", -15, EN_ASK)
add("h1_t_angry2",    "He is angry! His eyebrows go down.", "en", -15, EN_ASK)
add("h1_t_angry_ask", "Show me an angry face!", "en", -15, EN_ASK)
add("h1_t_angry_find","Which face is angry? Touch the angry face.", "en", -15, EN_ASK)
add("h1_t_out",       "You know all the feelings! Let's play!", "en", -12, EN_PRAISE)
# 答题 A：听音找脸谱（3 张情绪脸里点目标）
add("h1_a_happy", "Find the happy face.", "en", -15, EN_ASK)
add("h1_a_sad",   "Find the sad face.", "en", -15, EN_ASK)
add("h1_a_angry", "Find the angry face.", "en", -15, EN_ASK)
# 答题 B：听情景找情绪（3 张情景卡：开心/难过/生气各一，语音描述目标情景）
add("h1_b_ice_eat",  "The boy is eating ice cream! Yum yum! How does he feel? Find the happy face.", "en", -15, EN_ASK)
add("h1_b_ice_fall", "The boy's ice cream fell down. How does he feel? Find the sad face.", "en", -15, EN_ASK)
add("h1_b_toy",      "A big boy took his toy! How does he feel? Find the angry face.", "en", -15, EN_ASK)
add("h1_b_balloon",  "The girl's balloon flew away! How does she feel? Find the sad face.", "en", -15, EN_ASK)
# 答题 C：拼脸谱（缺嘴巴的脸 + 3 个嘴巴选项，拖/点拼上去）
add("h1_c_happy", "The girl is happy. Put the happy mouth on the face.", "en", -15, EN_ASK)
add("h1_c_sad",   "The boy is sad. Put the sad mouth on the face.", "en", -15, EN_ASK)
add("h1_c_angry", "The girl is angry. Put the angry mouth on the face.", "en", -15, EN_ASK)

# ============================================================
# 第 8 岛第 2 关（L8-W2：身体感受 Hungry / Thirsty / Sleepy）
# 教学 13 环节（RULES §三.10 双倍量：3 个感受 × 2 演示 + 2 互动）+ 过渡：
#   · 演示 1：小人做感受动作 + 语音 + 物品飞过去（播完定格等点按，§三.14）；
#   · 演示 2：换氛围装饰 + 不同句式；
#   · 互动 1：二选一送对的东西（4 秒小手 §二.12）；
#   · 互动 2：三选一找出该感受的小人（点错抖 + again）。
# 答题 A 复用 h2_t_*_find；B 听音送物品；C 听情景纠错（✅/❌ 复用 yesno）。
# 本批 17 条新生成（"Find the hungry boy." 复用 l5w4_a、"You are a great helper! Let's play!" 复用 l6w4_t_out，RULES §1.12 同句同 key）。
# ------------------------------------------------------------
add("h2_t_hungry1",  "His tummy is rumbling. He is hungry. Give him some bread.", "en", -15, EN_ASK)
add("h2_t_hungry2",  "Look! He is holding his tummy. He is very hungry. Bread, please!", "en", -15, EN_ASK)
add("h2_t_hungry_give", "Give the bread to the hungry boy.", "en", -15, EN_ASK)
add("h2_t_thirsty1", "He is sweating. He is thirsty. Give him some water.", "en", -15, EN_ASK)
add("h2_t_thirsty2", "Look! He is hot and thirsty. Water, please!", "en", -15, EN_ASK)
add("h2_t_thirsty_give", "Give the water to the thirsty boy.", "en", -15, EN_ASK)
add("h2_t_thirsty_find", "Find the thirsty boy.", "en", -15, EN_ASK)
add("h2_t_sleepy1",  "He is yawning. He is sleepy. Give him a pillow.", "en", -15, EN_ASK)
add("h2_t_sleepy2",  "Look! His eyes are closing. He is sleepy. Pillow, please!", "en", -15, EN_ASK)
add("h2_t_sleepy_give", "Give the pillow to the sleepy boy.", "en", -15, EN_ASK)
add("h2_t_sleepy_find", "Find the sleepy boy.", "en", -15, EN_ASK)
# 答题 B：听音送物品（中央小人 + 3 件物品）
add("h2_b_hungry",  "The boy is hungry. Give him the bread.", "en", -15, EN_ASK)
add("h2_b_thirsty", "The boy is thirsty. Give him the water.", "en", -15, EN_ASK)
add("h2_b_sleepy",  "The boy is sleepy. Give him the pillow.", "en", -15, EN_ASK)
# 答题 C：听情景纠错（✅/❌ 判断语音描述是否与画面一致）
add("h2_c_hungry",  "The boy is hungry. Is he eating bread?", "en", -15, EN_ASK)
add("h2_c_thirsty", "The boy is thirsty. Is he drinking water?", "en", -15, EN_ASK)
add("h2_c_sleepy",  "The boy is sleepy. Is he holding a pillow?", "en", -15, EN_ASK)

# ============================================================
# 第 8 岛第 3 关（L8-W3：安慰别人 Give him a toy / a hug / candy）
# 教学 13 环节（RULES §三.10 双倍量：3 个安抚动作 × 2 演示 + 2 互动 + 过渡）：
#   · 演示 1：婴儿大哭 + 语音 + 安抚物飞过去 → 变开心（播完定格等点按，§三.14）；
#   · 演示 2：开心结果 + 不同句式/装饰；
#   · 互动 1/2：给物品（二选一 / 三选一）、拥抱（👍 永远判对 §三.12）+ 4 秒小手（§二.12）。
# 答题 A 听音送物品 / B TPR 拥抱（👍） / C 听情景纠错（✅/❌ 复用 yesno）。
# 本批 19 条新生成，已通过 audit 去重自检。
# ------------------------------------------------------------
add("h3_t_toy1",   "Look! The baby is crying. He is sad. Give him a toy.", "en", -15, EN_ASK)
add("h3_t_toy2",   "Look! The baby is happy now. He loves the toy!", "en", -15, EN_ASK)
add("h3_t_toy_give", "Give the toy to the baby.", "en", -15, EN_ASK)
add("h3_t_toy_find", "Find the toy. Give it to the baby.", "en", -15, EN_ASK)
add("h3_t_hug1",   "The baby is crying again. Give him a hug.", "en", -15, EN_ASK)
add("h3_t_hug2",   "The baby is happy now. A big hug is so warm!", "en", -15, EN_ASK)
add("h3_t_hug_self", "Can you give a hug? Hug yourself!", "en", -15, EN_ASK)
add("h3_t_hug_baby", "Now give the baby a big hug!", "en", -15, EN_ASK)
add("h3_t_candy1", "The baby wants some candy. Give him some candy.", "en", -15, EN_ASK)
add("h3_t_candy2", "Look! The baby is happy now. Candy is sweet!", "en", -15, EN_ASK)
add("h3_t_candy_give", "Give him some candy.", "en", -15, EN_ASK)
add("h3_t_candy_find", "Find the candy. Give it to the baby.", "en", -15, EN_ASK)
add("h3_t_out",    "You are so kind! Let's play!", "en", -12, EN_PRAISE)
# 答题 A：听音送物品（中央婴儿 + 3 件物品）
add("h3_a_toy",    "The baby is crying. Give him a toy.", "en", -15, EN_ASK)
add("h3_a_candy",  "The baby is crying. Give him some candy.", "en", -15, EN_ASK)
# 答题 B：TPR 拥抱（👍 永远判对）
add("h3_b_hug",    "He is sad. Give him a hug!", "en", -15, EN_ASK)
add("h3_b_hug2",   "The baby is crying. Give him a big hug!", "en", -15, EN_ASK)
# 答题 C：听情景纠错（✅/❌ 判断语音描述是否与画面一致）
add("h3_c_toy",    "The baby is crying. Did we give him a toy?", "en", -15, EN_ASK)
add("h3_c_candy",  "The baby is crying. Did we give him some candy?", "en", -15, EN_ASK)

# ============================================================
# 第 8 岛第 4 关（L8-W4：综合感知 · 表情变变变 · 因果 → 情绪）
# 教学 9 环节（RULES §三.10 双倍量：2 个情境故事 × 2 演示 + 2 互动 + 过渡）：
#   · 演示 1：开心 → 事件（掉落/被抢）→ 变脸（播完定格等点按，§三.14）；
#   · 演示 2：结果特写 + 不同句式；
#   · 互动：给物品（二选一）、找情绪脸（三选一）、听指令做生气表情（复用 h1_t_angry_ask，§1.12）。
# 答题 A 听音找情景 / B 听因果选表情 / C TPR 拥抱（👍 永远判对）。
# 本批 18 条新生成，已通过 audit 去重自检。
# ------------------------------------------------------------
add("h4_t_ice1",     "The ice cream fell down. He is sad.", "en", -15, EN_ASK)
add("h4_t_ice2",     "Look! He is sad now. His ice cream is on the ground.", "en", -15, EN_ASK)
add("h4_t_ice_give", "The boy is sad. Give him an ice cream.", "en", -15, EN_ASK)
add("h4_t_ice_find", "Find the sad boy.", "en", -15, EN_ASK)
add("h4_t_toy1",     "His toy is gone. He is angry.", "en", -15, EN_ASK)
add("h4_t_toy2",     "Look! He is angry now. His toy is gone.", "en", -15, EN_ASK)
add("h4_t_toy_find", "Find the angry boy.", "en", -15, EN_ASK)
add("h4_t_out",      "You know how they feel! Let's play!", "en", -12, EN_PRAISE)
# 答题 A：听音找情景（3 幅情景卡点目标）
add("h4_a_ice",   "The ice cream fell down. He is sad. Find the picture.", "en", -15, EN_ASK)
add("h4_a_apple", "He is eating an apple. He is happy. Find the picture.", "en", -15, EN_ASK)
add("h4_a_play",  "He is playing with his toy. He is happy. Find the picture.", "en", -15, EN_ASK)
add("h4_a_gone",  "His toy is gone. He is angry. Find the picture.", "en", -15, EN_ASK)
# 答题 B：听因果选表情（中央无表情情景 + 3 张情绪脸）
add("h4_b_sad",    "The ice cream fell down. How does he feel?", "en", -15, EN_ASK)
add("h4_b_angry",  "His toy is gone. How does he feel?", "en", -15, EN_ASK)
add("h4_b_sleepy", "He is in bed. It is night. How does he feel?", "en", -15, EN_ASK)
add("h4_b_happy",  "He is eating an apple. How does he feel?", "en", -15, EN_ASK)
# 答题 C：TPR 拥抱（👍 永远判对）
add("h4_c_hug",  "The baby is crying. Give him a hug!", "en", -15, EN_ASK)
add("h4_c_hug2", "He is sad. Give him a big hug!", "en", -15, EN_ASK)

# ------------------------------------------------------------
# 第 8 岛第 5 关（L8-W5：游乐场 · 情绪与感受终极考验 / 变脸魔法师）
# 教学：换面具（2 演示）→ 贴面具（互动）→ 找生理感受（2 演示 + 互动）→ 安慰（2 演示 + TPR）
# 答题 A 听情景戴面具 / B 听长句找小人 / C TPR「Show me ...」
# ------------------------------------------------------------
add("h5_t_mask1", "Look! A magic face. Let's put on the happy mask!", "en", -15, EN_ASK)
add("h5_t_mask2", "Now the sad mask. Put on the sad mask!", "en", -15, EN_ASK)
add("h5_t_angry_put", "The boy is angry. Put on the angry mask.", "en", -15, EN_ASK)
add("h5_t_feel1", "Look at the boy. His tummy is rumbling. He is hungry.", "en", -15, EN_ASK)
add("h5_t_feel2", "Look! This boy is yawning. He is sleepy.", "en", -15, EN_ASK)
add("h5_t_find_sleepy", "Find the sleepy boy. Touch the sleepy boy.", "en", -15, EN_ASK)
add("h5_t_cry1", "The baby is crying. He is sad. What should we do?", "en", -15, EN_ASK)
add("h5_t_hug", "Give him a hug!", "en", -12, EN_PRAISE)
add("h5_t_hug2", "Look! A hug makes him happy!", "en", -15, EN_ASK)
add("h5_t_tpr", "Show me a happy face! Then give a hug.", "en", -15, EN_ASK)
add("h5_t_out", "You are the best emotion master! Let's play!", "en", -12, EN_PRAISE)
# 答题 A：听情景戴面具
add("h5_a_ice",  "His ice cream fell down. How does he feel? Put on the correct mask.", "en", -15, EN_ASK)
add("h5_a_toy",  "His toy is gone. How does he feel? Put on the correct mask.", "en", -15, EN_ASK)
add("h5_a_gift", "He got a new toy. How does he feel? Put on the correct mask.", "en", -15, EN_ASK)
add("h5_a_bed",  "He is going to bed. How does he feel? Put on the correct mask.", "en", -15, EN_ASK)
# 答题 B：听长句在 4 个小人里找目标
add("h5_b_happy",  "Find the boy who is happy. He has an ice cream.", "en", -15, EN_ASK)
add("h5_b_hungry", "Find the boy who is hungry and crying.", "en", -15, EN_ASK)
add("h5_b_angry",  "Find the boy who is angry. His toy is gone.", "en", -15, EN_ASK)
add("h5_b_sleepy", "Find the boy who is sleepy. He is yawning.", "en", -15, EN_ASK)
# 答题 C：TPR 做动作（👍 永远判对）
add("h5_c_thirsty", "Show me thirsty! Pretend to drink water.", "en", -15, EN_ASK)
add("h5_c_hungry",  "Show me hungry! Pretend to eat.", "en", -15, EN_ASK)
add("h5_c_sleepy",  "Show me sleepy! Pretend to yawn.", "en", -15, EN_ASK)
add("h5_c_happy",   "Show me happy! Smile for me.", "en", -15, EN_ASK)

# ------------------------------------------------------------
# 第 9 岛第 1 关（L9-W1：衣物穿戴 Shirt / Pants / Shoes / Hat）
# 教学：Shirt 2 演示 + 1 互动 / Pants 2 演示 + 1 互动 / Shoes 1 演示 / Hat 1 演示 + 1 互动
# 答题 A 听音穿衣服 / B 听音找衣物 / C TPR 模仿穿衣
# ------------------------------------------------------------
add("l9_t_shirt",     "Look! He needs clothes. Put on the shirt.", "en", -15, EN_ASK)
add("l9_t_shirt_put", "Put on the shirt.", "en", -15, EN_ASK)
add("l9_t_pants",     "Now, put on the pants.", "en", -15, EN_ASK)
add("l9_t_pants_put", "Put on the pants.", "en", -15, EN_ASK)
add("l9_t_shoes",     "Put on the shoes.", "en", -15, EN_ASK)
add("l9_t_hat",       "Put on the hat.", "en", -15, EN_ASK)
add("l9_t_out",       "Wow! He is fully dressed! Let's play!", "en", -12, EN_PRAISE)
# 答题 B：听音找衣物（3 个各穿一件衣物的小人）
add("l9_b_shirt", "Find the boy wearing a shirt.", "en", -15, EN_ASK)
add("l9_b_pants", "Find the boy wearing pants.", "en", -15, EN_ASK)
add("l9_b_shoes", "Find the boy wearing shoes.", "en", -15, EN_ASK)
add("l9_b_hat",   "Find the boy wearing a hat.", "en", -15, EN_ASK)
# 答题 C：TPR 模仿穿衣（👍 永远判对）
add("l9_c_shirt", "Put on your shirt!", "en", -15, EN_ASK)
add("l9_c_pants", "Put on your pants!", "en", -15, EN_ASK)
add("l9_c_shoes", "Put on your shoes!", "en", -15, EN_ASK)
add("l9_c_hat",   "Put on your hat!", "en", -15, EN_ASK)

# ------------------------------------------------------------
# 第 9 岛第 2 关（L9-W2：穿脱动作 Put on / Take off）
# 教学：Put on 2 演示 + 1 互动（"Put on the shoes." 复用 l9_t_shoes）/ Take off 2 演示 + 1 互动 / 再 2 演示 + 1 互动
# 答题 A 听指令脱 / B 听指令穿 / C TPR「Show me. Put on/Take off your ...」
# ------------------------------------------------------------
add("l92_t_shoes_on",   "Look! He has no shoes. Put on the shoes.", "en", -15, EN_ASK)
add("l92_t_hat_off",    "It's hot. Take off the hat.", "en", -15, EN_ASK)
add("l92_t_coat_off",   "Take off the coat.", "en", -15, EN_ASK)
add("l92_t_pants_off",  "Now, take off the pants.", "en", -15, EN_ASK)
add("l92_t_pants_take", "Take off the pants.", "en", -15, EN_ASK)
add("l92_t_out",        "You can dress up and take off! Let's play!", "en", -12, EN_PRAISE)
# 答题 A：听指令脱（身上穿着某件 → 拖回物品栏）
add("l92_a_hat",   "It's time to sleep. Take off the hat.", "en", -15, EN_ASK)
add("l92_a_shoes", "It's time to sleep. Take off the shoes.", "en", -15, EN_ASK)
add("l92_a_coat",  "It's hot. Take off the coat.", "en", -15, EN_ASK)
add("l92_a_pants", "It's time to sleep. Take off the pants.", "en", -15, EN_ASK)
# 答题 B：听指令穿（物品栏 3 件 → 拖到身上）
add("l92_b_hat",   "It's cold. Put on the hat.", "en", -15, EN_ASK)
add("l92_b_coat",  "It's cold. Put on the coat.", "en", -15, EN_ASK)
add("l92_b_pants", "It's cold. Put on the pants.", "en", -15, EN_ASK)
add("l92_b_shoes", "It's cold. Put on the shoes.", "en", -15, EN_ASK)
# 答题 C：TPR 模仿穿脱（👍 永远判对）
add("l92_c_on_hat",   "Show me. Put on your hat!", "en", -15, EN_ASK)
add("l92_c_off_hat",  "Show me. Take off your hat!", "en", -15, EN_ASK)
add("l92_c_on_coat",  "Show me. Put on your coat!", "en", -15, EN_ASK)
add("l92_c_off_coat", "Show me. Take off your coat!", "en", -15, EN_ASK)

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
