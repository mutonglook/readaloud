/** 一本书解析后的统一结构：TXT 与 EPUB 都归一到 chapters[].paragraphs[] */
export interface Chapter {
  /** 章节稳定 id，用于进度定位 */
  id: string;
  title: string;
  paragraphs: string[];
}

/** 支持的电子书格式：纯文本系与 EPUB/PDF */
export type BookFormat = 'txt' | 'epub' | 'html' | 'md' | 'docx' | 'fb2' | 'pdf';

export interface Book {
  id: string;
  title: string;
  author: string;
  format: BookFormat;
  /** 封面 dataURL，可缺省 */
  cover?: string;
  chapters: Chapter[];
  totalChars: number;
  addedAt: number;
}

/** 书架列表用的轻量索引，不加载正文 */
export interface BookMeta {
  id: string;
  title: string;
  author: string;
  format: BookFormat;
  cover?: string;
  chapterCount: number;
  totalChars: number;
  addedAt: number;
  lastReadAt?: number;
}

export interface ReadingProgress {
  bookId: string;
  chapterIndex: number;
  paragraphIndex: number;
  /** 章内百分比，用于快速跳转定位 */
  percent: number;
  updatedAt: number;
}

export type ThemeId = 'white' | 'paper' | 'eye' | 'parchment' | 'night';

/**
 * 阅读字体：
 * - serif / sans / kai / fangsong 走系统字体栈
 * - pack 走内置的 10 款开源字体包（按需下载）
 * - custom 走用户自己导入的字体文件
 */
export type FontId = 'serif' | 'sans' | 'kai' | 'fangsong' | 'pack' | 'custom';

/**
 * 翻页方式：
 * - slide    平移（整页横向滑动）
 * - cover    覆盖（新页从右侧压过来，旧页不动）
 * - simulate 仿真（旧页绕左侧书脊做 3D 翻转，露出新页）
 * - none     无动画
 * - flow     上下滚动
 */
export type PageMode = 'slide' | 'cover' | 'simulate' | 'none' | 'flow';

export interface ReaderSettings {
  theme: ThemeId;
  fontSize: number;
  lineHeight: number;
  /** 段间距，单位 em */
  paragraphGap: number;
  /** 字重 */
  weight: number;
  fontFamily: FontId;
  /** fontFamily === 'custom' 时使用的字体名 */
  customFont?: string;
  /** fontFamily === 'pack' 时使用的开源字体包 id */
  fontPack?: string;
  /** 左右页边距，单位 px */
  padding: number;
  /** 翻页方式 */
  pageMode: PageMode;
  /** 屏幕亮度 0.4 ~ 1 */
  brightness: number;
  /** 朗读高亮跟随滚动 */
  autoScroll: boolean;
  /** 沉浸式全屏：隐藏状态栏与导航栏 */
  immersive: boolean;
}

/** 书架视图：网格 / 列表 */
export type ShelfView = 'grid' | 'list';

export type TtsProvider = 'native' | 'online';

export interface TtsSettings {
  provider: TtsProvider;
  /** 指定系统语音引擎包名，空 = 系统当前默认引擎 */
  nativeEngine: string;
  /** 离线音色 id，空 = 系统默认 */
  nativeVoice: string;
  rate: number;
  pitch: number;
  /** 在线语音：OpenAI 兼容 /v1/audio/speech */
  onlineBaseUrl: string;
  onlineApiKey: string;
  onlineModel: string;
  onlineVoice: string;
  /** 每段朗读间隔，毫秒 */
  gapMs: number;
}

/** 云同步：目前只做 WebDAV 协议（坚果云 / 群晖 / Nextcloud 都支持） */
export interface SyncSettings {
  /** none = 关闭 */
  provider: 'none' | 'webdav';
  /** WebDAV 根地址，如 https://dav.jianguoyun.com/dav/ */
  url: string;
  account: string;
  password: string;
  /** 是否在每次读完一章后自动上传 */
  auto: boolean;
  /** 上次同步时间 */
  lastSyncAt?: number;
}

/** 朗读位置：章节 + 段落 + 句 */
export interface SpeakPosition {
  chapterIndex: number;
  paragraphIndex: number;
  sentenceIndex: number;
}
