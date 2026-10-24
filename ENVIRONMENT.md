# ENVIRONMENT.md · 接手必读

> **任何新窗口 / 新开发者接手本项目，第一步必须完整读完本文件，然后读 `RULES.md` 全文。**
> 本文件回答「环境长什么样、代码怎么组织、密钥在哪、有哪些不可违反的约束」；`RULES.md` 是最高约束，冲突时以 `RULES.md` 为准。
> 最后更新：2026-10-24（第 3 岛第 5 关彻底重做：旧「比较与分类」全删 → 全新「游乐场 · 综合比较大考」，第 3 岛 5 关全通；第 6 岛 5 关全通；语音 733 条）

---

## 0. 一分钟速览

| 项目 | 值 |
|---|---|
| 名称 | 英语启蒙乐园（3 岁儿童英语启蒙 PWA） |
| 线上地址 | https://lipinglabs.github.io/lilearn-english/ |
| 仓库 | `lipinglabs/lilearn-english`（**public**） |
| 技术形态 | 纯静态：单页 HTML + 两个数据脚本 + Service Worker。**无构建、无框架、无后端、无 npm 依赖** |
| 内容规模 | 12 岛 × 5 关框架；已做第 1–5 岛全部 + 第 6 岛第 1–5 关（第 6 岛已全通） |
| 部署 | GitHub Pages（源 `main` 分支根目录 `/`，legacy 构建），推送即自动重建 |

---

## 1. 环境与部署

### 1.1 推送方式（关键，别踩）

- **本机 `git push` 走 HTTPS 会偶发被拦**（`schannel: failed to receive handshake` / 代理 502）。
  **不要写死循环死磕**：先用 `git ls-remote origin -h refs/heads/main` 探测可达（12s 超时），
  可达就 `fetch` → `rebase` → `push`，不可达就退避重试；实测十几轮内必有一次成功。
- 若仓库有**并行会话**在同分支高频提交，`rebase` 加上 `-X ignore-all-space`
  可躲开对方整体重排缩进造成的假冲突（实测 index.html 有 9000 行纯空白变更）。
- 备用通道：**GitHub Git Data API**（`POST /git/blobs` → `/git/trees`（带 `base_tree`）→
  `/git/commits` → `PATCH /git/refs/heads/main`），认证用 `gh auth token`（账号 `kh4tzjsjfy-eng`）。
- **2026-10-23 起该通道已有脚本**：`python tools/push_via_api.py "<提交说明>"`
  （支持 `--dry-run`，只传远端 main 与本地 HEAD 的差异文件，自动带 `base_tree`）。
  注意它在 `.gitignore` 里（历史上有意忽略），**只存在于本机、不在仓库**，换机器要重新放。
- 何时用哪条：`git ls-remote` 能通就走普通 `fetch/rebase/push`（历史连续，最省事）；
  只有 `github.com` 完全不通、而 `gh api` 正常时才用 `push_via_api.py`。
- **副作用要记住**：API 推送会把本地若干提交压成**远端一个 commit**。此时「远端 tree == 本地 HEAD tree」
  但历史不同，`git status` 会显示分叉。等 `github.com` 恢复后执行
  `git fetch origin && git reset --hard origin/main` 对齐即可（内容一致，不会丢东西）。
- **务必带 `base_tree`**：否则会把别人的新增文件整棵删掉。推送前先 `GET /git/ref/heads/main` 取当前 SHA。

### 1.2 部署与缓存

- Pages 构建 `status` 从 `building` 变 `built` 约需 30–60 秒；查询：`gh api repos/lipinglabs/lilearn-english/pages/builds`。
- `Cache-Control: max-age=600` —— 改版后最多 10 分钟才全量生效，核验线上请加 `?cb=<时间戳>` 绕过缓存。
- `sw.js` 里 `CACHE = 'lilearn-v3'`：文档走 network-first，静态资源走 cache-first。**换版若需强刷可把版本号 +1**。

### 1.3 本机工具链

| 用途 | 路径 / 方式 |
|---|---|
| Node 22（managed） | `C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2-6\node.exe` |
| Python 3.13（managed） | `C:\Users\Administrator\.workbuddy\binaries\python\versions\3.13.12\python.exe` |
| 无头浏览器 | Edge：`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`（`--headless=new --remote-debugging-port`） |
| jsdom / ws 模块 | 在 `C:\Users\Administrator\.workbuddy\binaries\node\workspace\node_modules`，需设 `NODE_PATH` |
| 行尾 | 仓库 `core.autocrlf=true`；`index.html` 为 CRLF，`voice.js` / `assets.js` 为 LF（勿混改） |

---

## 2. 项目架构（index + voice + assets）

### 2.1 三文件结构（2026-10-23 物理切割后的最终形态）

```
index.html   768,096 B / 17,990 行   ← 结构 + 样式 + 全部游戏逻辑
voice.js  22,818,683 B /  6,808 行   ← window.VOICE_BANK，733 条 base64 mp3
assets.js  1,389,354 B /    439 行   ← window.FRUIT_IMG(15) / COLOR_IMG(20) / ANIMAL_IMG(14) / FOOD_IMG(3)
```

**切割前**是 9.5 MB 单文件，iPhone 上解析阻塞主线程导致 1–2 秒卡顿与发热；切割后 `index.html` 降至 327,800 B（−96.6%）。
**不要再把 base64 塞回 `index.html`。**

### 2.2 index.html 内部地标（行号随改动漂移，用关键字定位）

| 区域 | 位置 |
|---|---|
| `<head>`：PWA meta / manifest / 图标 | 1–28 |
| `<style>` 全部样式 | 29–2585 |
| DOM：`#screenMap` / `#screenIsland` / `#screenLevel` / `#toast` | 2606–2670 |
| **`<script src="voice.js">`** | 2672 |
| **`<script src="assets.js">`** | 2673 |
| 主逻辑：单个 IIFE `<script>` … `</script>` | 2675–8841 |

**加载顺序是硬约束**：`voice.js` → `assets.js` → 主脚本。主脚本一执行就读 `window.VOICE_BANK` / `window.FRUIT_IMG`，顺序错一行就全盘无声无图。

### 2.3 数据格式（改数据时必须守住）

- 每条形如 `key: "data:image/png;base64,..."`，**单行按 4000 字符切块，行尾用 `" +` 拼接**。
- 手工编辑时一旦丢掉行尾的 ` +`，整个脚本语法错误、白屏。
- 键名规则：语音 key 必须唯一，新增一律走生成脚本的 `add()`（见 `RULES.md` §1.12）。

### 2.4 主脚本如何取数据

```js
function voiceBank() {            // 每次现读 window，避免时序/缓存导致空库
  var b = window.VOICE_BANK;
  return (b && typeof b === 'object') ? b : {};
}
var FRUIT_IMG = Object.assign({}, window.FRUIT_IMG || {}, window.COLOR_IMG || {});
var COLOR_IMG = window.COLOR_IMG || {};   // 颜色题型按 lib 精确取图时用（曾漏声明 → 颜色题 ReferenceError）
var ANIMAL_IMG = window.ANIMAL_IMG || {};
```

### 2.5 音频链路（2026-10-23 修复后的正确形态，勿回退）

| 函数 | 职责 |
|---|---|
| `unlockAudio()` | 首次 `touchstart/pointerdown/mousedown/keydown/click` **捕获阶段**播放 0.05s 静音 WAV + `AudioContext.resume()`，解锁 iOS |
| `getAudio(key)` | 按需 `new Audio(dataURI)` 并 cache；未命中返回 `null` |
| `speak(key, onDone)` | 单条播放，带兜底定时器；`NotAllowedError` 时复位解锁标记 |
| `say(keys, onDone)` | 语音链，token 防串台 |
| `ensureCtx / beep / coin / ting` | WebAudio 实时合成音效（答对金币音、星星 ting），**不是音频文件** |
| `WARM_KEYS` | 仅预热 10 条（`intro`、`win1-3`、`praise_1-6`），**禁止改回全量预热 305 条** |

**血泪教训**：`Object.keys(bank).forEach(getAudio)` 一次性建 305 个 `<audio>`，iOS Safari 媒体元素数量超限后 `play()` 会静默失败，表现为「彻底没声音且零报错」。

### 2.6 其余文件

| 路径 | 作用 |
|---|---|
| `sw.js` | PWA Service Worker（Android 全屏必需 + 离线可玩） |
| `manifest.json`、`icons/` | PWA 清单与图标（192/512/maskable/apple-touch-180） |
| `assets/{fruit,color,animal,food}/*.png` | 3D 图标源图（Fluent Emoji 3D，MIT），构建期内联；`food/` 只有 bread / egg / rice（牛奶是手写 SVG）。**第 5 岛第 2 关一件 PNG 都没加**——餐具的 Fluent 素材全是复合图，整组改手写 SVG |
| `voice/*.mp3` | 语音源文件 675 个（`manifest.md` 为目标清单） |
| `tools/gen_voice_doubao.py` | 豆包 2.0 批量 TTS 生成器 |
| `tools/inline_assets.py` | PNG → base64 图库内联 |
| `tools/make_animals.py` / `make_food.py` / `make_colors.py` / `make_icon.py` | 素材下载缩放（**禁止生图接口**） |
| `tools/probe_b3.js` / `probe_b4.js` / `probe_b5.js` / `probe_f1.js` / `probe_f2.js` / `probe_f3.js` / `probe_f4.js` / `probe_f5.js` / `probe_f6.js` / `probe_f7.js` / `probe_f8.js` / `probe_f9.js` / `probe_f10.js` / `probe_f11.js` / `probe_f12.js` / `probe_f13.js` / `probe_f14.js` / `probe_f15.js` / `test_cloud_merge.js` / `test_dev_sandbox.js` | 既有回归脚本（`probe_*.js` 用 Edge headless + CDP 真机模拟；`probe_f2.js` 起的十四个关卡探针都用 MutationObserver 记录教学环节时间线，逐步校验语音、4 秒手指、点错不推进、逐元素越界与**零尺寸**；`probe_f11.js` 起额外断言「演示步不点按则不自动前进」；`probe_f13.js` 额外断言「球的热区比图形大一圈、画得够大」；`probe_f14.js` 用「轻点拾起→点家具」路径跑教学互动，按**期望舞台指纹**匹配（自动跳过物品落位产生的额外指纹），并断言多步 `stepsDone` 落位、第二步口播不计入「答对禁人声」；`probe_f15.js` 为第 6 岛第 5 关综合关，额外断言通关走 grand（岛内收官）、地图第 6 岛 `cleared` 点亮、纵向越界一并检查；`probe_b4.js` 为第 3 岛第 4 关「轻重感知」，断言演示点按推进、互动 4 秒小手、A/B/C 三型语音与重量/跷跷板/分类框一致、拖错框不推进、答对禁人声；`probe_b5.js` 为第 3 岛第 5 关「游乐场综合大考」，教学按 `.b5x-stage[data-sid]` 指纹逐步校验 8 环节（含互动 3 的拖错不推进 + 拖对推进），断言 A/B/C 语音与比较词/答案场景/轻重框一致、通关走 grand、地图第 3 岛 `cleared` 点亮；其 `overflow()` 会跳过已隐藏视图（`#viewAsk/#viewDone/#viewStart`）内的旧节点）。**注意**：多个探针并行跑会因沙箱 PNG 写入串行化而偶发 `EPERM`，回归请**串行**执行。 |
| `review.html` | 素材审查台（独立页面，只读解析 `assets.js`） |

**✅ 生成脚本已适配切割后的结构，不要再改回 `index.html`**：

- `tools/gen_voice_doubao.py`：生成后走 `merge_into_voicejs()`，**只向 `voice.js` 追加缺失的 key**（先正则扫描已有 key，幂等、绝不覆盖、绝不删除），不再往 `index.html` 注入。
- `tools/inline_assets.py`：目标文件是 `assets.js`（`index.html` 里已没有 `FRUIT_IMG` 标记）。
- 两者默认都跳过已存在条目；`--dry-run` 只打印清单与去重自检，不调接口。

---

## 3. 密钥与机密（全部脱敏存储）

> **原则：本文件永不写入任何明文密钥。仓库是 public，写进去等于公开泄露。**

| 名称 | 用途 | 存放位置 |
|---|---|---|
| `DOUBAO_API_KEY` | 火山引擎 · 豆包语音合成大模型 2.0，仅供 `tools/gen_voice_doubao.py` 调用 | **本地环境变量**（前缀 `62a2`，仅用于核对）。**请在本地环境变量中配置真实的 Key**，例如：`export DOUBAO_API_KEY=...` |
| GitHub 令牌 | 推送 / 查 Pages | `gh` CLI 本地凭据，不入库 |
| 云存档令牌 | 进度同步（Gist） | 仅设备 `localStorage`（键 `lilearn.cloud.v1`），见 `RULES.md` §五.2 |

- 生成脚本读取方式固定为：`os.environ.get("DOUBAO_API_KEY")`，没有任何硬编码兜底。
- 页面运行时**不请求任何外部接口**，语音/图片全部内置。密钥绝不进前端。
- 已知错误码：`45000010` = Key 无效；`45000030` = 该 Key/项目未获该语音资源授权。

---

## 4. RULES 要点速查（全文以 `RULES.md` 为准）

### 4.1 语音铁律（§一）

1. **英文只允许豆包 2.0 Allison**（`en_female_allison_uranus_bigtts` + `context_texts` 情绪指令）。禁止 Edge TTS / `speechSynthesis` / 其他引擎。
2. **中文鼓励只允许豆包 2.0 儿童绘本音色**（`zh_female_xiaoxue_uranus_bigtts` + `pitch=3`），固定 6 句，随机且不连续重复，入口唯一 `playRandomPraise()`；**每次通关必须调用**。
3. **构建期一次性生成 + base64 内联**，运行时不调接口，密钥不入前端不入库。
4. `context_texts` **必须放进 `additions`**，放顶层会被静默忽略（验收：慢速指令 A/B 时长差 >20%）。
5. 豆包输出有随机性：**一次成型，不重跑**；默认跳过已存在 mp3，重做用 `--force` / `--only`；**禁止用文件大小判断参数是否生效**。
6. **单题反馈只用音效，禁止语音**；答对 430ms 内进下一题；语音只在「开场 / 题干 / 通关」三处出现。
7. 失败要如实上报 HTTP 码、`X-Tt-Logid`、`code`、`message`，不静默降级。
8. 先列**全量文本清单 + 去重自检**，再一次性批量生成，不需要人工审批。
9. **绝对禁止循环重试**烧额度；失败即跳过记账，最后一次性汇总。
10. 复合数字写成 `Twenty-one` 形式，**禁止阿拉伯数字**（`audit()` 会拦）。
11. 英文通关夸奖**与学科无关**（禁止 math），固定 3 句，入口 `playLevelComplete()`，链路为 `playRandomPraise(playLevelComplete)`。
12. 语音 key 必须唯一，新增走 `add()`，重复 key 会静默覆盖。

### 4.2 UI 铁律（§二）

1. **页面可见文本绝不出现英文字母**（含 `aria-label`），断言 `document.body.innerText` 不匹配 `/[A-Za-z]/`。
2. 适配手机竖屏，基准 **390×844**，无溢出，按钮在拇指区。
3. 风格柔和温暖：圆角 ≥16px、浅暖描边、低饱和粉彩、`ease-in-out`，禁止闪烁抖动（答错抖动为唯一例外）。
4. 动画音效不遮挡答题区，音频卡住必须有兜底定时器推进。
5. **禁止 Emoji 充当配图**，实体物件用 3D PNG。
6. 星星必须 SVG 绘制（无黑描边、`#FFD700`、drop-shadow、呼吸动画）。
7. 控件图标一律内联 SVG。
8. 数字不得纯文本裸奔，统一 `numberSign()`（3D 键帽）。
9. 选项顺序每局重排，答错再 `reshuffleOptions()`。
10. **选项槽位固定 3 个**，题库 >3 时「正确 + 2 干扰」抽取，不得整库塞入。
11. 拖拽题必须同时支持「点选 + 点目标」等价路径；`<8px` 视为轻点；指针与 click 用 400ms 去重；投放判定用 `elementsFromPoint()`。
12. **教学互动必须有 4 秒静默小手指**（全局，第 2 岛第 5 关起）：只示范不代替，统一 `armHint/clearHint/showHint`，禁止关卡自写计时器，退出/答对/重开必须清理。
13. **图片资产只能复用现有图库**（fruit / color / animal / food）或内联 SVG，**严禁任何生图接口**（Seedream / 即梦等）。
14. **3D 素材要按实际卡片尺寸（80–110px）验语义**：缩小后关键属性还在吗？不在就换手写 SVG；
    同一个词绝不用两张不同的图；被替换的旧文件要从 `assets/` 与内联脚本的 `*_ORDER` 里一起删掉。
15. **复合素材不能教单词**：碗配勺 / 叉配刀 / 杯配吸管这类图里有第二个同类物体，孩子会「看错」而不是「看不清」，
    整组改手写 SVG（一组同一套描边 / 高光 / 落影）；勺与叉靠**轮廓**（椭圆勺头 vs 四根粗齿）分开，不靠旋转角度；
    场景要画出动作真的发生（碗沿压住勺头 / 肉盖住齿尖 / 倒水要有壶）。

### 4.3 关卡框架铁律（§三）

1. 12 岛 × 5 关。
2. 严格前置解锁：同岛 N→N+1，岛 5 关通关解锁下一岛。
3. 未解锁内容点击播 `Coming soon!`，不得「点不动也没反应」。
4. 进度：`localStorage`（`lilearn.progress.v1`）+ 云端，**跨设备以云端为准**。
5. 新增关卡只实现 `playableContent(island, level)` 并挂到 `screenLevel`，**不得改地图与解锁逻辑**。
6. **新概念必须先教后练**（Tutorial）：单词 → 整句 → 提问 → 动手 → 对比检验；用 `say([...])` 串链，**不得用 setTimeout 猜时长**；教学不给星星、不显示选项栏；登记 `tutorial: true`。
7. 教学登记进 `TUTORIALS` 规格表（`steps/show/scene/hit`），不复制流程函数；**演示完必须把角色放回原位**；区域判定用 `hit(scene, ratioY, pos)`，放错不推进。
8. 结构差异大用 `custom` 分支，但收尾必须走 `tutFinish()` → `beginRounds()`；题型 B 投放目标必须是**容器本身**。
9. 每岛第 5 关是结业关：只考不教新词，延长版复习 + 三种组合题型，走 `finish()` 的 `grand` 模式。
10. **模仿型交互（相机确认）**：按钮唯一、≥44vw、位置固定，点它永远判对（没有答错分支）；
    演示阶段半透明不可点，只有互动阶段可点。**猜剪影题必须把动作画出来**（速度线 / 向上竖线 / Z），
    且备选动物的剪影要一眼能分开。
11. **新增图库六处接入**：`make_*.py` → `inline_assets.py` 的 `*_ORDER`/`emit` → `var XXX_IMG` →
    `xxxImg()` → `snapshot()` 指纹 → 样式定宽。验收 `git diff --numstat assets.js` 必须是 `N 0`。

### 4.4 工程约定（§四）

- 目录职责：`index.html`（应用）、`voice/*.mp3`（语音源）、`tools/`（生成与推送）、`assets/`（预览图）。
- 推送：本机 `git push` 被代理拦截，**统一走 GitHub API**，推送后确认 Pages 已重建。
- 提交前必须通过：无英文字母断言、双视口无溢出断言、12 轮通关不卡死、全部语音可解码。
- 脚本与测试**不得包含任何密钥**，只从 `DOUBAO_API_KEY` 读取。

### 4.5 云存档铁律（§五）

1. **云端为主源**，启动先拉取合并再渲染；本地只作离线缓存。
2. 访问令牌**绝不进仓库、绝不进页面**（只存设备 `localStorage`；若写死 `CLOUD_TOKEN_DEFAULT` 只能带 Gists 读权限）。
3. **推送前必须先合并**（`GET` → `mergeProgress()` → `PATCH`），直接覆盖会让另一台设备进度回滚。
4. 合并规则：`cleared` 并集、`unlockedLevel` 取最大、`unlockedIsland` 取最远、`stars` 取最高。
5. 失败不空转：只变红提示，禁止重试循环；本地永远先落盘。
6. 存档固定 `lilearn-progress.json`，Gist 描述固定 `lilearn-english-save`。
7. 云存档面板文案不得出现英文字母（含 `Gist`）。
8. 令牌填一次即全自动静默同步（连接全量同步 → 通关 500ms 推送 → 60s 拉取 → 前后台/网络恢复各一次 → 15/30/60/120s 退避，4 次后静默等待）。
9. **最高进度优先（Max-Progress Wins）**：任何连接/拉取/推送都先做「本地 ∪ 云端」，合并结果双向落盘，**绝不允许低进度设备覆盖高进度云端**。
10. **开发者测试后门（沙盒）**：地图左上角连点 5 次（间隔 >1.6s 重置）→ 暗号 `123` → 进入后切断一切云端同步、内存态全解锁、🛠️ 角标；**沙盒进度绝不写 localStorage / 云端**，六个云函数全部静默拦截；退出（刷新 / 点角标）必须用进入前快照恢复并重新拉取云端。

---

## 5. 改动后必须跑的验证（缺一不可）

| # | 验证 | 手段 |
|---|---|---|
| 1 | 无英文字母 | 无头浏览器断言 `document.body.innerText` 与 `aria-label` 不含 `/[A-Za-z]/` |
| 2 | 双视口无溢出 | 390×844 与桌面视口比对 `scrollWidth/scrollHeight` |
| 3 | 12 轮通关不卡死 | 脚本驱动答题至 `finish()`，断言星级与解锁写入 |
| 4 | 语音可解码 | 取 `window.VOICE_BANK` 全键，`new Audio()` 等 `loadedmetadata`，断言 `duration > 0` |
| 5 | 音频链路未回退 | 启动创建 `<audio>` 数量应为 ~11（非 305）；首次真实点击后 `play()` 0 拒绝 |

**工具链要点**

- jsdom 必须在 **HTTP** 下跑（file:// 会因 `localStorage` 抛 `SecurityError`），需 `resources: 'usable'`。
- 真机行为模拟用 **Edge headless + CDP**：`Input.dispatchMouseEvent` 产生可信手势；`Runtime.evaluate` 里调 `speak()` **不带手势标记**会 `NotAllowedError`，必须先派发一次真实点击。
- 统计 `new Audio` 用量：`Page.addScriptToEvaluateOnNewDocument` 里打桩 `window.Audio`。

---

## 6. 当前进度与下一步

- **已完成**：第 1 岛（5 关）、第 2 岛（5 关）、第 3 岛（5 关，W4 轻重感知 / W5 游乐场综合大考）、
  **第 4 岛全部 5 关**——W1「农场动物」（狗 / 猫 / 猪 / 牛）、W2「野生动物」（狮子 / 老虎 / 猴子 / 大象，
  并建立「丛林 vs 农场」栖息地分类）、W3「动词初识」（跑 / 跳 / 吃 / 睡）、
  W4「动物 + 动作短句」（The dog is running / The cat is sleeping / The monkey is eating，
  新增 ✅ / ❌ 对错判断题与「动物 + 动作 + 场景」整幅场景卡）、
  W5「游乐场 · 听音模仿」（结业关：听指令做动作 + 点「我做好啦」相机按钮确认、放大镜剪影猜动物、
  同一只动物三种动作里找出正在做那件事的那一只）；
  **第 5 岛 W1「常见食物」**（milk / bread / egg / rice：4 个词各 2 演示 + 2 互动、
  答题 A 听音找食物 / B 听描述找食物 / C 把食物拖到盘子上）、
  **第 5 岛 W2「餐具」**（bowl / spoon / cup / fork：4 个词各 2 演示 + 2 互动、
  答题 A 听音找餐具 / B 听句子找场景（汤在碗里 / 勺在碗里 / 水倒进杯里 / 叉子叉着肉）/
  C 把餐具拖进碗里）、
  **第 5 岛 W3「喜好与需求表达」**（I like it / I don't like it / More, please / All done：
  4 个句型各 2 演示 + 2 互动、答题 A 听短语找画面 / B 听情境选回答 / C 把食物拖进笑脸框或摇头框，
  柠檬永远进摇头框——语义由探针断言）。
  **第 5 岛 W4「餐厅点餐」**（I am hungry / I want... / Here you are / Thank you：
  4 个句型各 2 演示 + 2 互动、答题 A 听音找客人状态（饿了 / 饱了 / 在吃）/ B 听需求把食物拖给小客人 /
  C 听对话选场景（递苹果 / 哭 / 睡），全部人物与食物为手写 SVG，零新增 PNG、零生图）。
  **第 5 岛 W5「上菜终极挑战」**（结业关，RULES §三.9：全岛语言点综合复习，只考不教新词）：
  沉浸式角色扮演「你是小服务员，去给客人上菜」，教学 24 环节延长版复习（欢迎客人 + 肚子饿/想要 2演2互 +
  端上菜 2演2互 + 礼貌回应 2演2互 + 吃饱/听懂拒绝 2演2互 + 还要更多 1演1互 + 餐具 2演2互 + 过渡语，充分玩透）；
  答题 12 轮（4/4/4）三种组合题型：A 听需求把食物端给小女孩客人（真拖拽 + 点选等价）/
  B 听对话找「还要更多」的客人（三态：在吃 / 不要了 / 还要更多）/ C 听场景选餐具（热汤要勺子，勺子/杯子/叉子三选一）；
  通关走 finish() 的 grand 模式（大彩带 + 奖杯 + 第 5 岛小旗），地图上第 5 岛全亮、解锁第 6 岛。
  全部手写 SVG：复用第 2 关餐具（F7_SOUP / F7_SPOON / F7_CUP / F7_FORK）、第 3/4 关小男孩姿态（F8_* / F9_*），
  仅新画「小女孩客人」（A 字裙 + 双辫，与小男孩同一套轮廓 / 描边 / 肤色）与「餐厅门」两张，零新增 PNG、零生图。
  **第 6 岛 W1「家具」**（Bed / Table / Chair / Sofa，第 6 岛改主题为「温馨家居」，地图图标改手写小房子 SVG）：
  教学每个核心词 2 次不同演示 + 2 次互动（RULES §三.10 双倍量）+ 过渡语，共 17 环节；
  **演示阶段「点按推进」**（RULES §三.14）——每句演示播完画面定格停留，必须孩子点击屏幕任意位置才进下一步，
  禁止定时器自动前进（给孩子充足时间观察画面、听清语音，做到声音 ↔ 画面绝对匹配）；
  答题 12 轮（4/4/4）：A 听音找家具（3 家具点选）/ B 听句子找场景（男孩在床上 / 苹果在桌上 / 猫在沙发上）/
  C 拖物品布置房间（把枕头拖到床上、把猫拖到沙发上，床 / 沙发是两个投放目标）。整套家具 + 小猫 + 场景全手写 SVG，零新增 PNG、零生图。
  **第 6 岛 W2「家里的小日常」**（Watch TV / Read a book / Take a bath / Go to sleep）：
  教学每个核心动作 2 次不同演示 + 2 次互动（RULES §三.10 双倍量）+ 过渡语，共 17 环节；
  演示阶段沿用「点按推进」（RULES §三.14，复用 L6-W1 的 `me._onTap` / `me.waitTap` / 「轻点继续」机制）；
  答题 12 轮（4/4/4）：A 听音找动作（看电视 / 看书 / 洗澡 / 睡觉 四选三）/
  B 听场景找房间（卧室 / 浴室 / 客厅，如 "Where is he taking a bath? Find the bathroom."）/
  C 拖宝宝做日常（把睡着的宝宝拖到床上、把洗澡的宝宝拖到浴缸，床 / 浴缸双投放目标）。
  客厅 / 电视动画 / 书房 / 书本 / 浴缸泡泡 / 卧室月亮 / 宝宝等场景全部手写 SVG，复用 F8 男孩 / F10 女孩 / F11 床沙发零件，零新增 PNG、零生图。
  **第 6 岛 W3「找东西」**（Where is the ball? It's in / on / under the ...）：
  教学每个方位 2 演示 + 2 互动 + 综合 1 演示 1 互动 + 过渡语，共 15 环节；
  演示阶段沿用「点按推进」（RULES §三.14，复用 `me._onTap` / `me.waitTap` / 「轻点继续」机制）；
  答题 12 轮（4/4/4）：A 单图寻物（一张房间图里床 / 沙发 / 桌子各有一个球，听 "Where is the ball? It's under the table." 点指定位置的球）/
  B 多场景选一（球在沙发上 / 床底下 / 箱子里三张小图，听句点选）/ C 拖拽藏球（把球拖到沙发上 / 桌子下，点选等价，答对球吸附到家具上）。
  **球画得大而鲜艳（亮红 + 白条纹，视觉 48px），点击热区 66px 比图形大一圈**，4 岁孩子轻松点中（探针断言）。
  复用 F11 沙发 / 床 / 桌，新画纸箱 / 玩具箱 / 大球，零新增 PNG、零生图（RULES §二.17）。
  `ANIMAL_IMG` 现为 14 张、`FOOD_IMG` 3 张，全部由 `tools/make_animals.py` / `make_food.py`
  从 Fluent 3D Emoji 下载缩放，**没有调用过任何生图接口**；
  手写内联 SVG 的部分：W3 的小男孩 / W5 的跳跃小人（跑 / 走 / 跳 / 睡四姿态）、W4 的 7 张场景背景
  （草地 / 垫子 / 沙发 / 大树 / 草原 / 床 / 树林）、第 5 岛的**牛奶杯 / 清水杯 / 倒奶场景 / 煎蛋锅 /
  盘子 / 热气**、第 5 岛第 2 关**整套餐具**（碗 / 汤 / 勺 / 杯 / 叉 + 勺在碗里 / 倒水 / 叉叉肉三个场景）、
  第 5 岛第 3 关**同一个小男孩的四种用餐姿态**（开心吃苹果 / 皱眉推开柠檬 / 双手递空杯 / 摸圆肚子 +
  推开盘子，同一套肤色 / 发型 / 描边 / 腮红，只换姿态与道具）（肢体用 CSS `transform-box:view-box` 摆动，睡姿的「Z」与相机 / 放大镜也都是 path，
  页面里没有任何 emoji 字符充当图形）；第 5 岛第 4 关**餐厅点餐的小男孩 / 服务员姿态与法式面包**也全部手写 SVG——
  小男孩沿用第 3 关的同一套零件（`f8Body` / `f8Head` / `f8Apple` / `f8Cup`），服务员只换马甲 + 服务帽，
  F9_BREAD 新画一条法式面包，饥饿 / 吃饱 / 在吃 / 在哭 / 在睡五态齐全；第 5 岛第 5 关只新画「小女孩客人 / 餐厅门」两张、其余全复用；
  第 6 岛第 1 关**整套家具与场景**（床 / 桌子 / 椅子 / 沙发 / 枕头 / 小猫 + 男孩睡着 / 苹果在桌上 / 猫在椅上 / 猫在沙发上）也全部手写 SVG，地图小房子图标同为手写 SVG；第 6 岛第 2 关**整套日常场景**（客厅 + 亮屏电视 / 电视动画特写 / 书房书架 / 摊开的书 / 浴缸泡泡 / 宝宝洗澡 + 小黄鸭 / 卧室月亮 / 宝宝睡觉 / 睡觉与洗澡两个宝宝）也全部手写 SVG，同样无任何 emoji 字符充当图形）；第 6 岛第 3 关只新画**纸箱 / 玩具箱 / 大球**三件，家具复用 F11，同样零 PNG、零生图。
  **第 6 岛 W4「听指令做家务」**（Put the [物品] on/in/under the [家具]，复合方位短句）：
  教学 10 环节（书放床上 / 玩具放进箱子 / 球滚到桌下，各 2 演示 + 1 互动，末加过渡语），演示沿用「点按推进」（RULES §三.14）；
  答题 12 轮（4/4/4）：A 单指令拖拽（书/玩具拖到床/桌/箱）/ B 听句选场景图（书在床上 / 球在桌下 / 玩具在箱子里）/
  C 多步指令（先放 X 到 Y，再放 Z 到 W，按顺序两步拖拽，第一步落位后口播第二步指令）。
  家具容器 `.f14-furn` 用 `padding:9%` 让投放热区比 SVG 视觉大一圈（防坑铁律）；新画**书 / 玩具熊 / 球**三件物品（球复用 F13 红球造型），家具复用 F11 床/桌 + F13 箱子，零 PNG、零生图。
  横屏矮屏（`@media (max-height:560px)`）为 3 件家具强制单行 `flex-wrap:nowrap` 并压缩房间/托盘，避免家具换行把托盘顶到视口外（竖屏不受影响）。
  另修两处交互缺陷：`resolveF14` 教学分支把 DOM 元素当 `furn` 与字符串 `step.target` 比较会恒判错（改为统一取 `data-drop`）；`askPutItem` 未设 `me.hintTarget` 导致 4 秒小手指不出现（已补）。
  **第 6 岛 W5「游乐场 · 帮小人整理房间综合大考」**（结业关，把 W1–W4 的家具/物品/方位综合复习；仍是 `Put the [物品] on/in/under the [家具]`）：
  物品扩到 **书 / 玩具 / 球 / 衣服**（衣服为新手写 T 恤 SVG），家具扩到 **床 / 桌 / 箱 / 椅 / 书架**（书架画成带两层隔板的大柜子，新写 `F15_SHELF`）。
  教学 7 环节：乱糟糟房间（衣服在床上、书在地上）→ 书上书架 → 玩具进箱 → 衣服上床（4 演示）+ 2 互动 + 过渡，演示沿用「点按推进」；
  答题 12 轮（4/4/4）：A 单步整理（3 物品拖到正确家具）/ B 听长句找场景（书在床 / 玩具在箱 / 衣服在椅）/
  C 多步指令（First… Then…，两步按顺序拖拽）。通关走 `grand`（岛内收官：大彩带 + 奖杯 + 通关旗），地图第 6 岛点亮 `cleared`。
  复用第 4 关的整套房间渲染 / 判定 / 拖拽引擎（题型 kind 仍用 `f14item` / `f14scene`）；把 `runF14Tutorial` 重构成工厂 `makeRoomTutorial(ACTS, OUTRO_SCENES)`，第 4/5 关共用同一套教学引擎（差异只在 ACTS 与收尾三图）。
  `snapshot()` 增补 `steps / stepsDone / stepAudios / furns`，供探针校验多步落位与家具集合。
  语音去重复用：`Put the book on the bed.` / `Put the toy in the box.` / `Put the ball under the table.` / `The book is on the bed. Find the picture.` / `The toy is in the box. Find the picture.` / 5 条 C 组句均复用既有 key，本关只新生成 10 条。
- **未完成**：第 7–12 岛（第 5 岛「食物与饮料」、第 6 岛「温馨家居」5 关均已全部收官）。
- **第 5 岛主题**：`ISLANDS[4]` 为**「食物与饮料」**，地图图标用 3D 面包 PNG；
  **第 6 岛改为「温馨家居」**（`ISLANDS[5]`，原「交通工具」主题让位；地图图标已用手写小房子 SVG，不再用 emoji 字符）。
- **第 4 岛主题**：`ISLANDS[3]` 为**「动物与动作」**，地图图标为 3D 狮子 PNG
  （RULES §二.5 禁止 emoji 充当配图）——该岛含农场动物、野生动物、动作动词、动作短句、听音模仿五类内容。
- **教学口径**：从 W2 起按 `RULES.md §三.10`「双倍量」执行——每个新单词 / 新句型 2 次不同演示 + 2 次互动；
  W3 起追加「动画型知识点」要求（动作要真的动起来，跑 / 跳剪影必须能分开）；
  W4 起追加「新交互先示范」（✅ / ❌ 这类新交互必须先由老师示范一次）；
  W5 起追加 `RULES.md §三.12`「模仿型交互」——相机按钮唯一且永远判对、演示阶段不可点、猜剪影题必须把动作画出来；
  第 5 岛 W1 起追加 `RULES.md §二.14`「素材按实际卡片尺寸验语义」——牛奶的 3D 图缩小后与清水不可分，
  改为手写 SVG（同一条杯身 path、只换内容物）；
  第 5 岛 W2 起追加 `RULES.md §二.15`「复合素材不能教单词」——餐具的 Fluent 素材全是碗配勺 / 叉配刀 /
  杯配吸管，整组改手写 SVG，勺与叉靠轮廓分开、场景必须把动作画出来；
  第 5 岛 W3 起追加 `RULES.md §二.16`「同人物多姿态必须共用一套零件」——四个句型用同一个小男孩，
  只换嘴型 / 眉毛 / 手臂与道具，孩子认的是「同一个他在做不同的事」，不是四张不相干的脸；
  第 5 岛 W4 起追加 `RULES.md §二.17`「图片生成最高优先」——第一优先免费手写 SVG、失败才降级 Emoji、
  严禁调用外部收费生图模型，本关全部人物与食物即以免费手写 SVG 实现（零 PNG、零生图）。
- **第 3 岛第 4 关重做（2026-10-24，见 `RULES.md §三.16`）**：旧「找不同（Odd one out）」体验不佳、存在视觉作弊
  （孩子不听语音、只看哪张图不一样就能点对，没训练到听力）。已**彻底删除**全部旧逻辑
  （`B4_ANIMAL / B4_FRUIT / B4_COLOR`、`b4Img`、`renderB4Grid`、旧 `makeQuestionB4`、旧 `runB4Tutorial`），
  重做为「轻重感知 Heavy / Light」：A 听音找重量（3 物品里点「重的/轻的」）/ B 跷跷板逻辑（看谁沉底，问谁重/谁轻）/
  C 拖拽分类（拖进 ⬇重 / ⬆轻 两个框）；三种题型都必须听懂 heavy / light 才能作答。
  教学 7 环节（4 演示 + 2 互动 + 过渡），演示点按推进、互动 4 秒小手；新画石头 / 羽毛 / 气球 / 大象 / 猴子 / 苹果 + 跷跷板 + 上下箭头，零生图、零 emoji 充当图形。
  语音本关新增 16 条；`snapshot()` 增补 `weight / ask / ansItem / ansBox`，选项 kind 用 `b4item`。
- **第 3 岛第 5 关重做（2026-10-24，见 `RULES.md §三.17`）**：第 4 关改题后，旧 W5「比较与分类（含找不同）」的口径已不成立，
  故**彻底删除**旧逻辑（`B5_ATTR_CN`、`b5Img`、`b5Train / b5Snake / b5Rod / b5ItemNode`、`ensureB5Css`、
  `renderB5Grid / renderB5Gate / findB5Odd`、旧 `makeQuestionB5`、旧 `resolveB5C`、旧 `runB5Tutorial`），
  重做为「游乐场 · 综合比较大考」结业关：只考不教新词，综合复习第 3 岛四组比较（大 / 长 / 多 / 重）。
  教学 8 环节：大门钥匙(演示) → 大象vs老鼠(互动) → 断桥木板(演示) → 长火车vs短汽车(互动) →
  售票处硬币(演示) → 跷跷板(演示) → 石头放跷跷板(互动·拖拽) → 过渡；
  答题 12 轮（4/4/4）：A 综合判断（2 件物品听比较词点选）/ B 场景匹配（断桥 / 大门 / 跷跷板选画面）/
  C 终极大拖拽（大象 / 羽毛拖进 石头=重箱、气球=轻箱）。通关走 `grand`，地图第 3 岛点亮 `cleared`。
  新画钥匙 / 木板 / 火车 / 轿车 / 硬币 / 售票亭 / 大门 / 断桥 / 跷跷板 / 老鼠，复用 B4 的石头 / 羽毛 / 气球 / 大象 / 苹果，零生图、零 emoji。
  语音本关新增 14 条（heavy / light 两问 + 3 段场景句 + 1 条 C 组句，其余复用 `b5_a_*`、`b4_c_*`）；
  `snapshot()` 增补 `cmp / ansScene`，选项 kind 用 `b5xitem`（C 组拖拽物）/ `b5xscene`（B 组场景）。
  教学互动的拖拽走全局拖拽引擎的自定义模式 `B5T`（`me.canDrag + me.customMode='B5T'` → `endDrag` → `resolveB5T`）。
- **文档已知过期**：`README.md` 里「当前进度仅到第 3 岛第 1 关」等段落已过时，以本文件与 commit 记录为准。

---

## 7. 新窗口接手清单

1. 读完本文件 → 再读 `RULES.md` 全文。
2. 确认 `DOUBAO_API_KEY` 已在环境变量中（需要生成语音时）。
3. 确认推送走 GitHub Git Data API，且 `base_tree` 取自最新 `main`。
4. 改动前先 `git log` 看最近 5 次提交，确认没有并行开发。
5. 改完跑 §5 五项验证。
6. 推送后等 Pages `built`，用 `?cb=` 拉线上文件比对 SHA256。
