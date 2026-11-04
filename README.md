# 听书阁 · ReadAloud

> **云端版本（主版本）**：https://www.workbuddy.cn/space/d/gO9r1Zl99uE2k3p449mciC
> 后续文档改动以云端版本为准，本地这份保持同步。
>
> **代码仓库**：https://github.com/mutonglook/readaloud

## 直接下载 APK

**最新安装包**：https://github.com/mutonglook/readaloud/releases/latest/download/tingshuge.apk

链接里的文件名是固定的，永远指向最新版本，不用每次改地址。

手机浏览器打开即可下载，安装时如提示「未知来源」，在系统设置里允许本次安装。这是 debug 签名包，可以正常安装使用，但不能上架应用商店。

每次往 `main` 分支提交，GitHub Actions 会自动重新打包（约 3 分钟）；推一个 `v*` 标签则自动发布新版本到 Releases。

一个能**看**也能**听**的 Android 阅读器。导入 TXT / EPUB / PDF / DOCX 等七种格式，像翻书一样读，也可以让它一句句念给你听——锁屏了还在念。

技术栈：React 19 + TypeScript + Vite + Capacitor 8，朗读走 Android 原生 `TextToSpeech` + 前台服务。

---

## 已经做好的

| 能力 | 说明 |
| --- | --- |
| 结构 | 底部两页签：书架 / 我的（书城与发现已移除，只留能真正跑通的页面） |
| 书架 | 3 列隐形书架 + 列表双视图、继续阅读卡、全部/在读/已读筛选、长按多选删除 |
| 搜索 | 按书名或作者即时过滤，无结果有单独空态 |
| 格式 | TXT（UTF-8/GBK 自动判别）、EPUB（OPF + 目录 + 封面）、HTML、Markdown、DOCX、FB2、PDF（文本层提取） |
| 导入 | 安卓上直接拉起**系统文件管理**（SAF）选文件，可多选，不需要存储权限；浏览器里回退到 `<input type=file>` |
| 阅读 | CSS 多栏真实分页，点屏幕左/中/右 = 上一页 / 唤起菜单 / 下一页 |
| 翻页 | 五档：**仿真翻页**（纸张绕书脊 3D 旋转 + 阴影）/ **覆盖翻页**（新页从右侧压过来）/ 平移 / 无动画 / 上下滚动，全部支持手指拖动跟手 |
| 主题 | 白底 / 纸质 / 护眼绿 / 羊皮 / 夜间，五套阅读背景 |
| 字体 | 系统字体 4 档（宋体 / 黑体 / 楷体 / 仿宋）+ **10 款开源中文字体**（按需下载、可离线缓存）+ 导入本地 ttf |
| 排版 | 字号 14–30px、字重、行距、段距、页边距实时可调 |
| 朗读 | 两引擎：**系统离线语音**（可用离线语音包，可切换讯飞/百度等第三方引擎）+ 在线 AI 语音 |
| 跟随 | 朗读时当前句高亮，自动翻到所在页 |
| 后台 | 锁屏继续朗读，通知栏「上一句 / 暂停 / 下一句」 |
| 媒体卡片 | 按 MediaSession + MediaStyle 接入**系统媒体播放器**，ColorOS 状态栏 / 控制中心 / 锁屏能显示书名章节并控制播放 |
| 守护 | 设置页「后台朗读守护」：通知权限、忽略电池优化、ColorOS 自启动，一键跳转系统设置 |
| 全屏 | 沉浸式 edge-to-edge：状态栏与导航栏透明隐藏、内容延伸到挖孔区，安全区用 `env(safe-area-inset-*)` 让位 |
| 同步 | **国内网盘同步**（WebDAV）：坚果云 / 群晖 / Nextcloud，书本正文 + 阅读进度 + 阅读设置双向同步，可自动也可手动 |
| 界面 | 参照掌阅 iReader：白底 + 橙红品牌色、隐形书架、点中唤起工具栏、抬起式设置面板 |
| 进度 | 自动记住每本书读到哪一章哪一段，下次打开接着看 |
| 示例书 | 空书架时可一键载入《桃花源记》《岳阳楼记》直接体验 |

## 还没做的

- **账号与自建云端**：同步目前走 WebDAV 网盘，没有注册登录。多设备共享同一个网盘目录即可，但也不能跨账号合书架。
- **MOBI / AZW3**：Kindle 系格式有 DRM 与专属压缩结构，暂未支持。
- 在线 AI 语音在锁屏后台的表现受系统限制，长时间听书建议用离线引擎。

---

## 翻页动画是怎么做的

难点在于「不能碰 React 的渲染」。一页正文是上千个 `<span>`（每个句子一个，用于朗读高亮），如果为了做动画复制一份 React 树，一次翻页就要 diff 两棵大树，中低端机直接掉帧。

所以走的是另一条路：翻页时用 `stream.cloneNode(true)` 把当前页整块 DOM 复制到一个绝对定位的动画层（`.rd__flip`），**这层完全脱离 React**，之后只改它的 `transform`，浏览器合成器就能跑满 60fps。

- **覆盖翻页**：新页在底下先切好，动画层从 `translate3d(100%)` 滑到 `0`，像一张纸压过来。
- **仿真翻页**：动画层 `transform-origin: left center` + 父层 `perspective: 1800px`，`rotateY` 从 `0` 转到 `-180deg`，纸页绕书脊翻出去；阴影用 `--sp = sin(θ)` 驱动一层线性渐变，转到侧面时最暗，符合物理直觉。
- **拖动跟手**：`touchmove` 里算 `p = |dx| / innerWidth`，直接把这一个数喂给同一个 `paintFlip()`，松手时 `p > 0.28` 判定翻页成功，否则弹回。手指拖动和自动翻页共用一条渲染路径，不会出现「拖的时候一个样、松手又一个样」。
- **方向差异**：覆盖翻页是「新页在下面」，所以必须先切页再动画；仿真翻页是「旧页翻走」，必须先动画再切页。用一个 `commitAtStart` 标记区分，避免两条路径各写一遍。

---

## 字体是怎么做的

10 款开源字体全部来自 `cn-fontsource-*` 系列 npm 包，每款都是「一个 `font.css` + 几百个按 `unicode-range` 切好的 woff2 分片」。中文字体动辄十几 MB，全量下载不现实，靠分片就只下载**这本书里真正出现过的字**，通常一两百 KB。

- 四路 CDN 镜像并发探测，取最快的那个并记到 `localStorage`，下次直接用；`font.css` 缓存在 IndexedDB，woff2 分片交给浏览器 HTTP 缓存，第二次打开完全离线可用。
- 关键坑：`font.css` 里的 `url('L1_4e00_192.woff2')` 是相对路径，注入 `<style>` 后会按**页面地址**解析，全部 404。必须在注入前把每个 `url()` 补成 CDN 绝对地址。
- 下载过的字体在设置页显示「已缓存」，可单个清除。

---

## 网盘同步怎么配

设置 → 云同步 → 选 WebDAV，填三项：

| 网盘 | 地址 | 账号 | 密码 |
| --- | --- | --- | --- |
| 坚果云 | `https://dav.jianguoyun.com/dav/` | 登录邮箱 | **应用密码**（网页端「安全选项」里生成，不是登录密码） |
| 群晖 | `https://你的域名:5006/` | 用户名 | 密码 |
| Nextcloud | `https://你的域名/remote.php/dav/files/用户名/` | 用户名 | 密码 |

点「测试连接」通了再点「立即同步」。结构是：

```
readaloud/shelf.json          书单 + 每本进度 + 阅读设置
readaloud/books/<id>.json     单本正文
```

同步策略是「进度按 `updatedAt` 取较新、书按 id 双向补齐」，所以两台手机各自读到不同地方再同步，不会互相覆盖成旧进度。开了「自动同步」后，每次翻页停止 8 秒会静默推一次书单（最多 3 分钟一次），正文只在手动或首次上传时传。

---

## 目录结构

```
readaloud/
├── src/
│   ├── lib/
│   │   ├── epub.ts            EPUB 解析（JSZip + DOM，输出统一章节结构）
│   │   ├── txt.ts             TXT 解析（编码识别 + 章节标题正则）
│   │   ├── formats/           其它格式解析：html / markdown / docx / fb2 / pdf
│   │   │   └── index.ts       扩展名识别与统一分派
│   │   ├── splitter.ts        句子切分（朗读的最小单位）
│   │   ├── db.ts              IndexedDB：书籍 / 索引 / 进度
│   │   ├── fonts.ts           字体系统：系统字体栈 + 10 款开源字体的下载与缓存
│   │   ├── sync/
│   │   │   ├── webdav.ts      WebDAV 客户端（PROPFIND / MKCOL / PUT / GET）
│   │   │   └── index.ts       书架与正文的推送、拉取、合并
│   │   └── tts/
│   │       ├── controller.ts  朗读调度器（单句模式 / 原生队列模式）
│   │       ├── native.ts      Capacitor 原生插件封装
│   │       ├── online.ts      OpenAI 兼容 /v1/audio/speech
│   │       └── webSpeech.ts   浏览器内置语音（调试降级）
│   ├── store/                 zustand：书架 / 设置
│   ├── pages/                 Shelf / Reader / Settings
│   └── styles/                theme.css（四套主题变量）+ app.css
├── android/
│   └── app/src/main/java/com/readaloud/app/
│       ├── MainActivity.java        注册插件、edge-to-edge 窗口
│       ├── ReadAloudPlugin.java     JS ↔ 原生桥（TTS / 通知 / 系统栏 / HTTP / SAF 选文件）
│       └── ReadAloudService.java    前台服务 + MediaSession + 通知栏 + TTS 队列
└── .github/workflows/android.yml    云端自动打包 APK
```

---

## 本地跑起来（看界面、调样式）

```bash
cd readaloud
npm install
npm run dev          # 浏览器打开 http://127.0.0.1:5173
```

浏览器里能完整跑通「导入 → 阅读 → 朗读」，但朗读用的是浏览器内置语音，**后台保活、通知栏、媒体卡片、SAF 选文件、网盘直连只有装成 APK 才有**。

---

## 打成 APK

### 方式一：Android Studio（最省事）

```bash
npm run build
npx cap sync android
npx cap open android
```

在 Android Studio 里点 Run 装到手机，或 `Build → Build Bundle(s)/APK(s) → Build APK(s)`。
产物在 `android/app/build/outputs/apk/debug/app-debug.apk`。

### 方式二：命令行

需要 **JDK 21** + **Android SDK（compileSdk 36）**：

```bash
npm run build && npx cap sync android
cd android
./gradlew assembleDebug          # Windows: gradlew.bat assembleDebug
```

### 方式三：GitHub Actions（已配置好，无需本机环境）

仓库已接好流水线，两条触发路径：

- **推 `main`** → 自动构建，APK 以制品形式挂在 Actions 运行页（`tingshuge-debug-apk`，保留 90 天）
- **推 `v*` 标签** → 自动构建并发布到 Releases，APK 有免登录直链

发新版本的完整流程：

```bash
git tag v1.5.0 && git push origin v1.5.0
```

要出**正式签名包**，先在仓库 Settings → Secrets 里配置下面四项，流水线会自动多跑一个 release 步骤：

| Secret | 内容 |
| --- | --- |
| `KEYSTORE_BASE64` | `base64 -w0 release.keystore` 的输出 |
| `KEYSTORE_PASSWORD` | keystore 密码 |
| `KEY_ALIAS` | 密钥别名 |
| `KEY_PASSWORD` | 密钥密码 |

生成 keystore：

```bash
keytool -genkey -v -keystore release.keystore -alias readaloud \
  -keyalg RSA -keysize 2048 -validity 10000
```

---

## 在线 AI 语音怎么配

设置 → 语音朗读 → 选「在线 AI 语音」，填三项：

- **接口地址**：兼容 OpenAI `/v1/audio/speech` 的服务，填到 `/v1` 即可
  - OpenAI：`https://api.openai.com/v1`
  - 硅基流动、火山、智谱等兼容网关同理
- **API Key**：只存在本机，不会上传
- **音色**：如 `alloy` / `nova` / `shimmer`

配好后点「试听当前音色」验证。句子级别的音频会预取下一句，减少句间停顿。

> 注意：Key 存在客户端，请用**额度受限**的 Key，别放主账号的。

**离线语音怎么换引擎**：设置 → 语音朗读 →「语音引擎」，会列出手机里所有实现了 TTS 服务的应用。想用讯飞/百度的合成音色，先点「下载离线语音包」装好对应引擎，回来选它即可。切换引擎会重建原生 `TextToSpeech` 实例并重新拉音色列表。

---

## 实现上的几个坑（已处理）

1. **TXT 编码**：中文书源大量是 GBK。先按 UTF-8 解码，出现超过 0.2% 替换符就回退 GBK，并处理 UTF-16 BOM。
2. **章节识别**：`第一章 / 第1章 / 楔子 / 序章 / Chapter 1` 等正则匹配，且要求标题前后有空行，避免正文误命中。单章超过 1.2 万字自动切分，防止渲染卡顿。
3. **EPUB 段落**：直接取 `body.textContent` 会把段落糊成一片，朗读失去节奏。改为按 block 元素遍历，保留段落边界。
4. **Android TTS 没有 pause**：只能句级暂停，恢复时从句首重读——这也是为什么朗读队列按「句」而不是按「段」组织。
5. **TTS 的 `onDone` 偶尔不回调**：按字数估算时长加了看门狗，超时自动推进，否则整本书会卡在某一句。
6. **Android 14 前台服务**：必须声明 `foregroundServiceType="mediaPlayback"` 并持有对应权限，否则启动即崩。
7. **WebView 被挂起**：切后台后 JS 停止执行，所以朗读队列放在原生 Service 里，JS 只负责投递和收进度。
8. **翻页动画不能走 React**：见上文「翻页动画是怎么做的」，用 DOM 克隆层 + 直接改 `transform`。
9. **字体相对路径**：`@font-face` 的 `url()` 必须绝对化，否则注入后按页面地址解析全部 404。另外 `document.fonts.check()` 对分片字体返回 `true` 只代表「规则已注册」，真实字形要等 `loadingdone`。
10. **WebDAV 必须走原生 HTTP**：`HttpURLConnection` 直接拒绝 `PROPFIND` / `MKCOL`（非法方法），WebView 里 `fetch` 又会被 CORS 拦掉——所以插件里放了一个 OkHttp 通道给同步用。
11. **ColorOS 不认普通通知**：只有带 `MediaSessionCompat` token 的 `MediaStyle` 通知才会被渲染成媒体卡片。另外 ColorOS 12+ 默认「纯净后台」，长时间后台朗读需手动把应用加入自启动/允许后台运行，设置页的「后台朗读守护」里给了跳转入口。

---

## 下一步

1. **MOBI / AZW3 解析**：无 DRM 的 MOBI 结构（PalmDB + MOBI header）其实可解，AZW3 是 KF8 变体，愿意啃可以加。
2. **多网盘**：阿里云盘 / 百度网盘有官方 OAuth 接口，但都需要开发者资质；WebDAV 是当前唯一零门槛的通用选择。
3. **阅读统计**：书架已经有 `updatedAt` 和进度百分比，加个本地统计页成本很低。

需要哪一项，说一声即可。

---

## 云端版本与当前进度

这份文档是「听书阁」项目的云端主版本，之后的改动都会更新到这里。代码已托管在 GitHub：https://github.com/mutonglook/readaloud ，资料库这边放的是说明文档与可分享的页面。

- **v1.5.0 新增**：
  - ① **翻页动画**：新增仿真翻页（3D 纸张旋转）与覆盖翻页，加上原有平移/无动画/滚动共五档，全部支持手指拖动跟手，松手按位移判定翻页或回弹。
  - ② **ColorOS 适配**：媒体卡片接入（MediaSession + MediaStyle，状态栏/锁屏/控制中心可控制播放）、沉浸式 edge-to-edge（透明双栏 + 挖孔区延伸 + 安全区留白）、导入图书改走系统文件管理（SAF，免存储权限、支持多选）。
  - ③ **图标重绘**：深蓝渐变底 + 白色摊开的书 + 橙色书签，含 Android 13 单色主题图标与同色系启动页。
  - ④ **语音**：删除 Edge 免费在线语音（鉴权算法随微软前端改版反复失效，不可靠），改为「系统离线语音 + 可选第三方引擎 + 离线语音包跳转」，保留在线 AI 语音。
  - ⑤ **字体**：新增 10 款开源中文字体（思源宋体/黑体、霞鹜文楷、霞鹜新致宋、霞鹜新晰黑、975 圆体、悠哉字体、小赖字体、得意黑、欣意吉祥宋），按需下载、分片缓存、可离线复用。
  - ⑥ **网盘同步**：WebDAV 接入坚果云/群晖/Nextcloud，同步书单 + 进度 + 阅读设置 + 正文，支持自动与手动。
- **v1.4.0 内容**：修好离线朗读试听（改走系统 TTS，不再依赖 WebView 里不存在的 `speechSynthesis`）；新增 HTML / Markdown / DOCX / FB2 / PDF 四种格式解析；设置页加「后台朗读守护」；换掉默认图标。
- **v1.3.0 内容**：去掉书城与发现两页，底部导航收成书架 / 我的。
- **v1.2.0 内容**：按掌阅 iReader 重做信息架构与交互，阅读页改 CSS 多栏真实分页，抬起式设置面板。
- **验证方式**：无头浏览器 390×844 逐屏跑通。翻页动画用 computed `transform` 逐帧采样——仿真模式 20 帧 / 315ms，中间帧 `matrix3d(-0.9658, …, 0.2593, …)`；覆盖模式 20 帧 / 317ms，`translate3d` 从 390px 连续减到 0；拖动跟手用 CDP 派发真实 touch 序列验证，左滑 10 帧连续旋转、松手推进，右滑回退，小幅拖动正确回弹，纵向滑动不误触发。字体侧确认真实渲染：`Source Han Serif SC VF` 注入后 379 个 `@font-face` 分片规则生效。控制台零报错。
- **已通过编译**：网页部分 `tsc + vite build` 通过（70 modules，gzip 后主包 137 KB）。原生 Java 部分（MediaSession/MediaStyle、OkHttp 通道、SAF 回调、引擎切换、edge-to-edge 窗口设置）在 GitHub Actions 的 JDK 21 + Android SDK 36 环境编译出包。
- **待真机验证**：ColorOS 状态栏/锁屏媒体卡片实际渲染、与系统媒体控制的联动、SAF 选文件界面、第三方 TTS 引擎与离线语音包下载、网盘同步在移动网络下的表现。
- **已知限制**：仿真翻页在极低端机（GPU 较弱）上可能掉到 30fps，可在设置里切「平移」或「无动画」；夜间主题下翻页阴影已加深，但 OLED 纯黑背景下仍可能看到渐变边界。
- **待开发**：MOBI / AZW3、账号体系与自建云端。

最后更新：2026-11-04
