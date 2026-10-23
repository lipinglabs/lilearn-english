# ENVIRONMENT.md · 接手必读

> **任何新窗口 / 新开发者接手本项目，第一步必须完整读完本文件，然后读 `RULES.md` 全文。**
> 本文件回答「环境长什么样、代码怎么组织、密钥在哪、有哪些不可违反的约束」；`RULES.md` 是最高约束，冲突时以 `RULES.md` 为准。
> 最后更新：2026-10-23（对应 commit `6856e97`）

---

## 0. 一分钟速览

| 项目 | 值 |
|---|---|
| 名称 | 英语启蒙乐园（3 岁儿童英语启蒙 PWA） |
| 线上地址 | https://lipinglabs.github.io/lilearn-english/ |
| 仓库 | `lipinglabs/lilearn-english`（**public**） |
| 技术形态 | 纯静态：单页 HTML + 两个数据脚本 + Service Worker。**无构建、无框架、无后端、无 npm 依赖** |
| 内容规模 | 12 岛 × 5 关框架；已做第 1、2 岛全部 + 第 3 岛前 3 关 |
| 部署 | GitHub Pages（源 `main` 分支根目录 `/`，legacy 构建），推送即自动重建 |

---

## 1. 环境与部署

### 1.1 推送方式（关键，别踩）

- **本机 `git push` 走 HTTPS 会被拦截**（`schannel: failed to receive handshake`）。不要反复重试。
- 统一走 **GitHub Git Data API**：`POST /git/blobs` → `POST /git/trees`（带 `base_tree`）→ `POST /git/commits` → `PATCH /git/refs/heads/main`。
- 认证：`gh auth token`（账号 `kh4tzjsjfy-eng`，scope 含 `repo`）。`gh api` 本身畅通，可用于读状态、查 Pages 构建。
- **务必带 `base_tree`**：否则会把别人的新增文件（如 `review.html`）整棵删掉。推送前先 `GET /git/ref/heads/main` 取当前 SHA。

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
index.html   327,800 B / 8,842 行   ← 结构 + 样式 + 全部游戏逻辑（316 KB 级，必须保持）
voice.js   8,347,177 B / 2,551 行   ← window.VOICE_BANK，305 条 base64 mp3
assets.js    918,828 B /   293 行   ← window.FRUIT_IMG(15) / COLOR_IMG(20) / ANIMAL_IMG(4)
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
| `assets/{fruit,color,animal}/*.png` | 3D 图标源图（Fluent Emoji 3D，MIT），构建期内联 |
| `voice/*.mp3` | 语音源文件 306 个（`manifest.md` 为目标清单） |
| `tools/gen_voice_doubao.py` | 豆包 2.0 批量 TTS 生成器 |
| `tools/inline_assets.py` | PNG → base64 图库内联 |
| `tools/make_animals.py` / `make_colors.py` / `make_icon.py` | 素材下载缩放（**禁止生图接口**） |
| `tools/probe_b3.js` / `test_cloud_merge.js` / `test_dev_sandbox.js` | 既有回归脚本 |
| `review.html` | 素材审查台（独立页面，只读解析 `assets.js`） |

**⚠️ 生成脚本的目标文件仍是 `index.html`**（`HTML_PATH` + `VOICE_BANK_START/END`、`FRUIT_IMG_START/END` 标记）。切割后这些标记已随数据移入 `voice.js` / `assets.js`，**直接运行会报「缺少标记」或注入错位**。新增语音/图片前必须先把脚本的 `HTML_PATH` 改指向 `voice.js` / `assets.js`。

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
13. **图片资产只能复用现有图库**（fruit / color / animal）或内联 SVG，**严禁任何生图接口**（Seedream / 即梦等）。

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

- **已完成**：第 1 岛（5 关）、第 2 岛（5 关）、第 3 岛 W1「大与小」/ W2「多与少」/ W3「长与短」。
- **未完成**：第 3 岛 W4、第 3 岛 W5（结业关）；第 4–12 岛。
- **文档已知过期**：`README.md` 里「当前进度仅到第 3 岛第 1 关」「第 3 岛第 2 关起尚未制作」等段落已过时，以本文件与 commit 记录为准。

---

## 7. 新窗口接手清单

1. 读完本文件 → 再读 `RULES.md` 全文。
2. 确认 `DOUBAO_API_KEY` 已在环境变量中（需要生成语音时）。
3. 确认推送走 GitHub Git Data API，且 `base_tree` 取自最新 `main`。
4. 改动前先 `git log` 看最近 5 次提交，确认没有并行开发。
5. 改完跑 §5 五项验证。
6. 推送后等 Pages `built`，用 `?cb=` 拉线上文件比对 SHA256。
