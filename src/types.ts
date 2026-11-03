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

export type ThemeId = 'paper' | 'eye' | 'parchment' | 'night';

export interface ReaderSettings {
  theme: ThemeId;
  fontSize: number;
  lineHeight: number;
  fontFamily: 'serif' | 'sans';
  /** 左右页边距，单位 px */
  padding: number;
  /** 朗读高亮跟随滚动 */
  autoScroll: boolean;
}

export type TtsProvider = 'native' | 'online';

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
  /** 每段朗读间隔，毫秒 */
  gapMs: number;
}

/** 朗读位置：章节 + 段落 + 句 */
export interface SpeakPosition {
  chapterIndex: number;
  paragraphIndex: number;
  sentenceIndex: number;
}
