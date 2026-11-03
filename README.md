# 听书阁 · ReadAloud

> **云端版本（主版本）**：https://www.workbuddy.cn/space/d/gO9r1Zl99uE2k3p449mciC
> 后续文档改动以云端版本为准，本地这份保持同步。

一个能**看**也能**听**的 Android 阅读器。导入 TXT / EPUB，像翻书一样读，也可以让它一句句念给你听——锁屏了还在念。

技术栈：React 19 + TypeScript + Vite + Capacitor 8，朗读走 Android 原生 `TextToSpeech` + 前台服务。

---

## 已经做好的

| 能力 | 说明 |
| --- | --- |
| 书架 | 网格封面、作者/章节数、阅读进度条、长按管理删除 |
| 格式 | TXT（自动识别章节标题，UTF-8/GBK 自动判别）、EPUB（解析 OPF + 目录，提取封面） |
| 阅读 | 句级渲染，点击任意一句即可从那里开始朗读 |
| 主题 | 纸质 / 护眼 / 羊皮 / 夜间，四套配色整站联动 |
| 排版 | 字号 14–30px、行距、页边距、宋体/黑体实时可调 |
| 朗读 | 离线系统语音 + 在线 AI 语音双引擎，语速/音调/句间停顿可调 |
| 跟随 | 朗读时当前句高亮，自动滚动到视野中间 |
| 后台 | 锁屏继续朗读，通知栏「上一句 / 暂停 / 下一句」 |
| 进度 | 自动记住每本书读到哪一章哪一段，下次打开接着看 |
| 示例书 | 空书架时可一键载入《桃花源记》《岳阳楼记》直接体验 |

## 还没做的

- **账号与云端同步**：目前书架和进度只存在本机 IndexedDB。设计方案见文末「下一步」。
- 在线 AI 语音在锁屏后台的表现受系统限制，长时间听书建议用离线引擎。

---

## 目录结构

```
readaloud/
├── src/
│   ├── lib/
│   │   ├── epub.ts            EPUB 解析（JSZip + DOM，输出统一章节结构）
│   │   ├── txt.ts             TXT 解析（编码识别 + 章节标题正则）
│   │   ├── splitter.ts        句子切分（朗读的最小单位）
│   │   ├── db.ts              IndexedDB：书籍 / 索引 / 进度
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
│       ├── MainActivity.java        注册插件
│       ├── ReadAloudPlugin.java     JS ↔ 原生桥
│       └── ReadAloudService.java    前台服务 + 通知栏 + TTS 队列
└── .github/workflows/android.yml    云端自动打包 APK
```

---

## 本地跑起来（看界面、调样式）

```bash
cd readaloud
npm install
npm run dev          # 浏览器打开 http://127.0.0.1:5173
```

浏览器里能完整跑通「导入 → 阅读 → 朗读」，但朗读用的是浏览器内置语音，**后台保活和通知栏只有装成 APK 才有**。

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

### 方式三：GitHub Actions（电脑上没有 Android 环境时）

把项目推到 GitHub，`.github/workflows/android.yml` 会自动构建，
在 Actions 页面下载 `readaloud-debug` 制品即可。

要出**正式签名包**，先在仓库 Settings → Secrets 里配置：

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

---

## 实现上的几个坑（已处理）

1. **TXT 编码**：中文书源大量是 GBK。先按 UTF-8 解码，出现超过 0.2% 替换符就回退 GBK，并处理 UTF-16 BOM。
2. **章节识别**：`第一章 / 第1章 / 楔子 / 序章 / Chapter 1` 等正则匹配，且要求标题前后有空行，避免正文误命中。单章超过 1.2 万字自动切分，防止渲染卡顿。
3. **EPUB 段落**：直接取 `body.textContent` 会把段落糊成一片，朗读失去节奏。改为按 block 元素遍历，保留段落边界。
4. **Android TTS 没有 pause**：只能句级暂停，恢复时从句首重读——这也是为什么朗读队列按「句」而不是按「段」组织。
5. **TTS 的 `onDone` 偶尔不回调**：按字数估算时长加了看门狗，超时自动推进，否则整本书会卡在某一句。
6. **Android 14 前台服务**：必须声明 `foregroundServiceType="mediaPlayback"` 并持有对应权限，否则启动即崩。
7. **WebView 被挂起**：切后台后 JS 停止执行，所以朗读队列放在原生 Service 里，JS 只负责投递和收进度。

---

## 下一步：账号与云端同步

当前 `src/lib/db.ts` 已经按「书籍 / 索引 / 进度」三张表分离，接云端时改动面很小：

1. 用云服务建三张表，`user_id` 做行级隔离；
2. 登录后拉取远端 `progress`，与本地按 `updatedAt` 取较新的一条合并；
3. 书籍正文（可能几十 MB）不入云，只同步元数据 + 进度，避免流量与存储成本；
4. 离线优先：本地写入先落地，联网后增量推送。

需要我接上时，说一声即可。

---

## 云端版本与当前进度

这份文档是「听书阁」项目的云端主版本，之后的改动都会更新到这里。代码本身在本地 `readaloud/` 目录——资料库存的是说明文档与可分享的页面，不放可运行的 App 源码。

- **已完成**：书架、TXT/EPUB 解析、四套主题阅读、离线与在线双引擎朗读、后台通知栏控制、阅读进度记忆。前端完整流程已逐屏跑通验证。
- **待验证**：原生 Java 部分（前台服务、通知栏、TTS 队列）还没有在真机上编译运行过。首次打包若报错，多半是 JDK 或 SDK 版本的小问题，把构建日志发出来即可定位。
- **待开发**：账号登录与云端同步，方案见上文「下一步」。

最后更新：2026-11-03
