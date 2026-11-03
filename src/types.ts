/** 一本书解析后的统一结构：TXT 与 EPUB 都归一到 chapters[].paragraphs[] */
export interface Chapter {
  /** 章节稳定 id，用于进度定位 */
  id: string;
  title: string;
  paragraphs: string[];
}

export interface Book {
  id: string;
  title: string;
  author: string;
  format: 'txt' | 'epub';
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
  format: 'txt' | 'epub';
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

/** 阅读字体档位：预设走系统字体栈，custom 走用户导入的字体文件 */
export type FontId = 'serif' | 'sans' | 'round' | 'kai' | 'fangsong' | 'mono' | 'custom';

/** 翻页方式：平移 / 无动画 / 上下滚动 */
export type PageMode = 'slide' | 'none' | 'flow';

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

export type TtsProvider = 'native' | 'online' | 'edge';

export interface TtsSettings {
  provider: TtsProvider;
  /** 离线音色 id，空 = 系统默认 */
  nativeVoice: string;
  rate: number;
  pitch: number;
  /** 在线语音：OpenAI 兼容 /v1/audio/speech */
  onlineBaseUrl: string;
  onlineApiKey: string;
  onlineModel: string;
  onlineVoice: string;
  /** Edge 免费在线语音的音色 id */
  edgeVoice: string;
  /** 每段朗读间隔，毫秒 */
  gapMs: number;
}

/** 朗读位置：章节 + 段落 + 句 */
export interface SpeakPosition {
  chapterIndex: number;
  paragraphIndex: number;
  sentenceIndex: number;
}
