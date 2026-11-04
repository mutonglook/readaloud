import type { Book, SpeakPosition, TtsSettings } from '../../types';
import type { SpeakResult, TtsEngine } from './engine';
import { WebSpeechEngine } from './webSpeech';
import { OnlineTtsEngine } from './online';
import { ReadAloud, isNative } from './native';
import { buildChapterQueue, positionToIndex, type Utterance } from './queue';

export interface PlayerState {
  bookId: string | null;
  playing: boolean;
  preparing: boolean;
  chapterIndex: number;
  paragraphIndex: number;
  sentenceIndex: number;
  currentText: string;
  chapterTitle: string;
  /** 当前模式：原生后台朗读 / 在线 AI 语音 / 浏览器内置 */
  mode: 'native' | 'online' | 'web';
  error: string | null;
}

type Listener = (state: PlayerState) => void;
type SentenceListener = (u: Utterance) => void;
type ChapterEndListener = (chapterIndex: number) => void;

const initialState: PlayerState = {
  bookId: null,
  playing: false,
  preparing: false,
  chapterIndex: 0,
  paragraphIndex: 0,
  sentenceIndex: 0,
  currentText: '',
  chapterTitle: '',
  mode: 'web',
  error: null,
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class SpeechController {
  private state: PlayerState = { ...initialState };
  private listeners = new Set<Listener>();
  private sentenceListeners = new Set<SentenceListener>();
  private chapterEndListeners = new Set<ChapterEndListener>();

  private book: Book | null = null;
  private queue: Utterance[] = [];
  private index = 0;

  private webEngine = new WebSpeechEngine();
  private onlineEngine: OnlineTtsEngine | null = null;
  private settings: TtsSettings | null = null;

  /** 递增令牌：每次 stop/pause/seek 都让旧循环作废 */
  private token = 0;

  private nativeReady = false;
  private nativeBound = false;
  /** 在线语音连不上时临时改用离线朗读，用户改设置后自动解除 */
  private forceNative = false;

  getState(): PlayerState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  onSentence(fn: SentenceListener): () => void {
    this.sentenceListeners.add(fn);
    return () => this.sentenceListeners.delete(fn);
  }

  onChapterEnd(fn: ChapterEndListener): () => void {
    this.chapterEndListeners.add(fn);
    return () => this.chapterEndListeners.delete(fn);
  }

  private emit(patch: Partial<PlayerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn(this.state));
  }

  private emitSentence(u: Utterance) {
    this.sentenceListeners.forEach((fn) => fn(u));
  }

  // ---------------- 引擎与设置 ----------------

  applySettings(settings: TtsSettings) {
    this.settings = settings;
    this.forceNative = false;
    this.onlineEngine?.updateConfig({
      baseUrl: settings.onlineBaseUrl,
      apiKey: settings.onlineApiKey,
      model: settings.onlineModel,
      voice: settings.onlineVoice,
    });
    this.emit({ mode: this.pickMode() });
  }

  private pickMode(): PlayerState['mode'] {
    const provider = this.settings?.provider ?? 'native';
    if (this.forceNative && this.nativeReady) return 'native';
    if (provider === 'online') return 'online';
    return isNative() && this.nativeReady ? 'native' : 'web';
  }

  async warmup(): Promise<void> {
    if (!this.onlineEngine) {
      this.onlineEngine = new OnlineTtsEngine({
        baseUrl: this.settings?.onlineBaseUrl ?? '',
        apiKey: this.settings?.onlineApiKey ?? '',
        model: this.settings?.onlineModel ?? 'tts-1',
        voice: this.settings?.onlineVoice ?? 'alloy',
      });
    }

    // 原生引擎可能晚于首帧就绪（首次调用时返回 false），这里允许重试一次
    if (isNative() && !this.nativeReady) {
      try {
        const res = await ReadAloud.initialize();
        this.nativeReady = res.available;
        if (this.nativeReady) await this.bindNativeEvents();
      } catch {
        this.nativeReady = false;
      }
    }
    this.emit({ mode: this.pickMode() });
  }

  private async bindNativeEvents() {
    if (this.nativeBound) return;
    this.nativeBound = true;

    await ReadAloud.addListener('progress', (d) => {
      const u = this.queue[d.index];
      if (!u) return;
      this.index = d.index;
      this.emit({
        paragraphIndex: u.paragraphIndex,
        sentenceIndex: u.sentenceIndex,
        currentText: u.text,
      });
      this.emitSentence(u);
    });

    await ReadAloud.addListener('state', (d) => {
      this.playing = d.playing; // eslint-disable-line
      this.emit({ playing: d.playing });
    });

    await ReadAloud.addListener('finished', () => {
      void this.advanceChapterFromNative();
    });

    await ReadAloud.addListener('error', (d) => {
      this.emit({ error: d.message, playing: false });
    });
  }

  private playing = false;

  // ---------------- 播放控制 ----------------

  async start(book: Book, pos: SpeakPosition) {
    this.book = book;
    this.token++;
    await this.warmup();
    await this.loadChapter(pos.chapterIndex, pos);

    if (this.state.mode === 'native') {
      await this.playNative();
    } else {
      this.playing = true;
      this.emit({ playing: true });
      void this.loop(this.token);
    }
  }

  /** 仅定位不播放（切换书籍、点章节） */
  async locate(book: Book, pos: SpeakPosition) {
    this.book = book;
    this.token++;
    await this.haltEngines();
    await this.loadChapter(pos.chapterIndex, pos);
    this.emit({ playing: false });
  }

  async play() {
    if (!this.book || this.playing) return;
    if (this.state.mode === 'native') {
      await this.playNative();
      return;
    }
    this.playing = true;
    this.emit({ playing: true, error: null });
    this.token++;
    void this.loop(this.token);
  }

  private async playNative() {
    try {
      if (!this.settings) return;
      this.token++;
      await ReadAloud.play({
        rate: this.settings.rate,
        pitch: this.settings.pitch,
        voice: this.settings.nativeVoice || undefined,
        engine: this.settings.nativeEngine || undefined,
      });
      this.playing = true;
      this.emit({ playing: true, error: null });
    } catch (err) {
      this.emit({ error: (err as Error).message, playing: false });
    }
  }

  async pause() {
    this.token++;
    this.playing = false;
    if (this.state.mode === 'native') {
      await ReadAloud.pause().catch(() => undefined);
    } else {
      await this.haltEngines();
    }
    this.emit({ playing: false });
  }

  async toggle() {
    if (this.playing) await this.pause();
    else await this.play();
  }

  async stop() {
    this.token++;
    this.playing = false;
    await this.haltEngines();
    if (this.state.mode === 'native') await ReadAloud.stop().catch(() => undefined);
    this.emit({ playing: false, currentText: '' });
  }

  private async haltEngines() {
    await this.webEngine.stop().catch(() => undefined);
    await this.onlineEngine?.stop().catch(() => undefined);
  }

  async nextSentence() {
    if (this.state.mode === 'native') {
      await ReadAloud.next().catch(() => undefined);
      const s = await ReadAloud.getState().catch(() => null);
      if (s) this.index = s.index;
      return;
    }
    this.token++;
    const wasPlaying = this.playing;
    await this.haltEngines();
    this.index = Math.min(this.index + 1, this.queue.length - 1);
    this.publishIndex();
    if (wasPlaying) await this.play();
  }

  async prevSentence() {
    if (this.state.mode === 'native') {
      await ReadAloud.prev().catch(() => undefined);
      const s = await ReadAloud.getState().catch(() => null);
      if (s) this.index = s.index;
      return;
    }
    this.token++;
    const wasPlaying = this.playing;
    await this.haltEngines();
    this.index = Math.max(this.index - 1, 0);
    this.publishIndex();
    if (wasPlaying) await this.play();
  }

  async nextChapter() {
    if (!this.book) return;
    const next = this.state.chapterIndex + 1;
    if (next >= this.book.chapters.length) return;
    await this.jumpToChapter(next, 0);
  }

  async prevChapter() {
    if (!this.book) return;
    const prev = this.state.chapterIndex - 1;
    if (prev < 0) return;
    await this.jumpToChapter(prev, 0);
  }

  async jumpToChapter(chapterIndex: number, paragraphIndex = 0) {
    if (!this.book) return;
    const wasPlaying = this.playing;
    this.token++;
    await this.haltEngines();
    await this.loadChapter(chapterIndex, { chapterIndex, paragraphIndex, sentenceIndex: 0 });
    if (wasPlaying) await this.play();
  }

  // ---------------- 内部 ----------------

  private async loadChapter(chapterIndex: number, pos: SpeakPosition) {
    if (!this.book) return;
    this.emit({ preparing: true });
    this.queue = buildChapterQueue(this.book, chapterIndex);
    this.index = positionToIndex(this.queue, pos);
    const title = this.book.chapters[chapterIndex]?.title ?? '';
    this.emit({
      bookId: this.book.id,
      chapterIndex,
      paragraphIndex: pos.paragraphIndex,
      sentenceIndex: pos.sentenceIndex,
      chapterTitle: title,
      currentText: this.queue[this.index]?.text ?? '',
      preparing: false,
    });

    if (this.state.mode === 'native' && this.queue.length) {
      await ReadAloud.loadQueue({
        queue: this.queue.map((u) => u.text),
        startIndex: this.index,
        title: this.book.title,
        subtitle: title,
      }).catch((err) => this.emit({ error: (err as Error).message }));
    }
  }

  private publishIndex() {
    const u = this.queue[this.index];
    if (!u) return;
    this.emit({
      paragraphIndex: u.paragraphIndex,
      sentenceIndex: u.sentenceIndex,
      currentText: u.text,
    });
    this.emitSentence(u);
  }

  private async loop(token: number) {
    while (this.playing && token === this.token) {
      const u = this.queue[this.index];
      if (!u) {
        const advanced = await this.advanceChapterFromJs(token);
        if (!advanced) {
          this.playing = false;
          this.emit({ playing: false, currentText: '' });
        }
        return;
      }

      this.emitSentence(u);
      this.emit({ currentText: u.text, paragraphIndex: u.paragraphIndex, sentenceIndex: u.sentenceIndex });

      const engine = this.pickEngine();
      if (!engine) {
        this.playing = false;
        this.emit({ playing: false, error: '没有可用的语音引擎' });
        return;
      }

      // 在线模式预取下一句，减少停顿
      if (engine.kind === 'online' && this.queue[this.index + 1]) {
        void (engine as OnlineTtsEngine).prefetch(this.queue[this.index + 1].text);
      }

      let result: SpeakResult = 'done';
      try {
        result = await engine.speak({
          text: u.text,
          rate: this.settings?.rate ?? 1,
          pitch: this.settings?.pitch ?? 1,
          voice: this.currentVoice(),
        });
      } catch (err) {
        const message = (err as Error).message || '语音朗读失败';
        const provider = this.settings?.provider;
        // 在线语音连不上时自动退回离线朗读：用户要的是「能听」，不是一句报错
        if (provider === 'online' && isNative() && this.nativeReady && this.book) {
          this.forceNative = true;
          this.emit({ mode: 'native' });
          try {
            await ReadAloud.loadQueue({
              queue: this.queue.map((x) => x.text),
              startIndex: this.index,
              title: this.book.title,
              subtitle: this.state.chapterTitle,
            });
            await this.playNative();
            this.emit({ error: `${message}，已自动改用离线朗读` });
          } catch (e) {
            this.playing = false;
            this.emit({ playing: false, error: (e as Error).message || message });
          }
          return;
        }
        this.playing = false;
        this.emit({ playing: false, error: message });
        return;
      }

      if (token !== this.token || !this.playing || result === 'cancelled') return;

      this.index++;
      if (this.index >= this.queue.length) {
        await this.advanceChapterFromJs(token);
        return;
      }
      if (this.settings?.gapMs) await sleep(this.settings.gapMs);
    }
  }

  /** 当前引擎该用哪个音色 */
  private currentVoice(): string | undefined {
    const s = this.settings;
    if (!s) return undefined;
    if (s.provider === 'online') return s.onlineVoice;
    return s.nativeVoice || undefined;
  }

  private pickEngine(): TtsEngine | null {
    const provider = this.settings?.provider;
    if (!this.forceNative) {
      if (provider === 'online') return this.onlineEngine;
    }
    return this.webEngine;
  }

  /** 一章读完，自动接下一章 */
  private async advanceChapterFromJs(token: number): Promise<boolean> {
    if (!this.book) return false;
    const next = this.state.chapterIndex + 1;
    this.chapterEndListeners.forEach((fn) => fn(this.state.chapterIndex));
    if (next >= this.book.chapters.length) return false;

    this.queue = buildChapterQueue(this.book, next);
    this.index = 0;
    const title = this.book.chapters[next].title;
    this.emit({ chapterIndex: next, chapterTitle: title, paragraphIndex: 0, sentenceIndex: 0 });
    if (this.playing && token === this.token) {
      if (this.settings?.gapMs) await sleep(Math.max(600, this.settings.gapMs));
    }
    return true;
  }

  /** 设置页试听：用当前引擎念一小段，不进入播放队列 */
  async preview(text: string): Promise<void> {
    await this.warmup();
    const s = this.settings;

    if (s?.provider === 'online' && this.onlineEngine) {
      await this.onlineEngine.prepare();
      await this.onlineEngine.speak({
        text,
        rate: s.rate,
        pitch: s.pitch,
        voice: s.onlineVoice,
      });
      return;
    }

    // 离线朗读：原生壳里必须交给系统 TTS 服务念。
    // WebView 没有 speechSynthesis，之前这一步落在 Web Speech 上，必然报「当前环境不支持语音朗读」。
    if (isNative() && this.nativeReady) {
      await ReadAloud.preview({
        text,
        rate: s?.rate ?? 1,
        pitch: s?.pitch ?? 1,
        voice: s?.nativeVoice || undefined,
        engine: s?.nativeEngine || undefined,
      });
      return;
    }

    await this.webEngine.prepare();
    await this.webEngine.speak({
      text,
      rate: s?.rate ?? 1,
      pitch: s?.pitch ?? 1,
      voice: s?.nativeVoice || undefined,
    });
  }

  /** 从后台返回时，把原生服务的真实状态同步回 UI */
  async syncFromNative(): Promise<void> {
    if (this.state.mode !== 'native') return;
    const s = await ReadAloud.getState().catch(() => null);
    if (!s) return;
    this.playing = s.playing;
    this.index = s.index;
    this.emit({ playing: s.playing });
    this.publishIndex();
  }

  private async advanceChapterFromNative() {
    if (!this.book) return;
    const next = this.state.chapterIndex + 1;
    this.chapterEndListeners.forEach((fn) => fn(this.state.chapterIndex));
    if (next >= this.book.chapters.length) {
      this.playing = false;
      this.emit({ playing: false });
      return;
    }
    await this.loadChapter(next, { chapterIndex: next, paragraphIndex: 0, sentenceIndex: 0 });
    await this.playNative();
  }
}

export const speechController = new SpeechController();
