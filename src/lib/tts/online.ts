import type { SpeakRequest, SpeakResult, TtsEngine } from './engine';
import { TtsError } from './engine';

export interface OnlineConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
}

/**
 * 在线 AI 语音：OpenAI 兼容的 /v1/audio/speech 接口。
 * 兼容 OpenAI、硅基流动、火山/智谱等提供同协议的网关。
 */
export class OnlineTtsEngine implements TtsEngine {
  readonly kind = 'online' as const;
  private audio: HTMLAudioElement | null = null;
  private currentUrl: string | null = null;
  private prefetched = new Map<string, Blob>();
  private abort: AbortController | null = null;

  constructor(private config: OnlineConfig) {}

  updateConfig(config: OnlineConfig) {
    this.config = config;
    this.prefetched.clear();
  }

  async prepare(): Promise<void> {
    if (!this.config.apiKey) throw new TtsError('请先在设置中填写在线语音的 API Key', 'auth');
    if (!this.config.baseUrl) throw new TtsError('请先在设置中填写在线语音接口地址', 'auth');
  }

  /** 预取下一句，减少句间停顿 */
  async prefetch(text: string): Promise<void> {
    const key = this.cacheKey(text);
    if (this.prefetched.has(key)) return;
    try {
      const blob = await this.fetchAudio(text);
      this.prefetched.set(key, blob);
      // 只留最近 4 条，避免占用内存
      if (this.prefetched.size > 4) {
        const first = this.prefetched.keys().next().value;
        if (first) this.prefetched.delete(first);
      }
    } catch {
      /* 预取失败不打断主流程 */
    }
  }

  async speak(req: SpeakRequest): Promise<SpeakResult> {
    const key = this.cacheKey(req.text);
    let blob = this.prefetched.get(key);
    if (!blob) blob = await this.fetchAudio(req.text, req.rate);
    else this.prefetched.delete(key);

    const url = URL.createObjectURL(blob);
    this.currentUrl = url;

    const audio = new Audio(url);
    this.audio = audio;

    return new Promise<SpeakResult>((resolve) => {
      let settled = false;
      const done = (r: SpeakResult) => {
        if (settled) return;
        settled = true;
        this.revoke();
        resolve(r);
      };

      audio.onended = () => done('done');
      audio.onerror = () => done('done');
      audio.onpause = () => {
        // 被 stop() 触发的暂停
        if (audio.currentTime === 0) done('cancelled');
      };

      audio
        .play()
        .then(() => {
          audio.playbackRate = 1; // 语速已在服务端控制，这里保持原速
        })
        .catch((err) => {
          done('done');
          console.warn('[online-tts] play failed', err);
        });
    });
  }

  async stop(): Promise<void> {
    this.abort?.abort();
    this.abort = null;
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
    this.revoke();
  }

  dispose(): void {
    void this.stop();
    this.prefetched.clear();
  }

  private revoke() {
    if (this.currentUrl) {
      URL.revokeObjectURL(this.currentUrl);
      this.currentUrl = null;
    }
  }

  private cacheKey(text: string) {
    return `${this.config.voice}|${this.config.model}|${text}`;
  }

  private endpoint(): string {
    const base = this.config.baseUrl.trim().replace(/\/+$/, '');
    if (/\/audio\/speech$/.test(base)) return base;
    if (/\/v1$/.test(base)) return `${base}/audio/speech`;
    return `${base}/v1/audio/speech`;
  }

  private async fetchAudio(text: string, rate = 1): Promise<Blob> {
    this.abort = new AbortController();
    let res: Response;
    try {
      res = await fetch(this.endpoint(), {
        method: 'POST',
        signal: this.abort.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model || 'tts-1',
          input: text,
          voice: this.config.voice || 'alloy',
          speed: Math.min(2, Math.max(0.5, rate)),
          response_format: 'mp3',
        }),
      });
    } catch (err) {
      throw new TtsError('在线语音请求失败，请检查网络', 'network');
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) {
        throw new TtsError('在线语音鉴权失败，请检查 API Key', 'auth');
      }
      throw new TtsError(`在线语音接口返回 ${res.status}：${detail.slice(0, 120)}`, 'network');
    }

    return await res.blob();
  }
}
