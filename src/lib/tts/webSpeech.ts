import type { SpeakRequest, SpeakResult, TtsEngine } from './engine';
import { TtsError } from './engine';

/**
 * 浏览器 / WebView 内置语音（调试与降级用）。
 * Android WebView 支持 speechSynthesis，但页面切到后台会被系统挂起，
 * 正式听书请走原生插件。
 */
export class WebSpeechEngine implements TtsEngine {
  readonly kind = 'web' as const;
  private current: SpeechSynthesisUtterance | null = null;
  private resolver: ((r: SpeakResult) => void) | null = null;
  private watchdog: number | null = null;

  async prepare(): Promise<void> {
    if (!('speechSynthesis' in window)) {
      throw new TtsError('当前环境不支持语音朗读', 'no-voice');
    }
    // 部分 WebView 需要先触发一次 getVoices 才会加载音色列表
    window.speechSynthesis.getVoices();
  }

  speak(req: SpeakRequest): Promise<SpeakResult> {
    return new Promise<SpeakResult>((resolve) => {
      const synth = window.speechSynthesis;
      synth.cancel();

      const utter = new SpeechSynthesisUtterance(req.text);
      utter.lang = 'zh-CN';
      utter.rate = clamp(req.rate, 0.4, 2.2);
      utter.pitch = clamp(req.pitch, 0.5, 2);

      const voices = synth.getVoices();
      if (req.voice) {
        const hit = voices.find((v) => v.voiceURI === req.voice || v.name === req.voice);
        if (hit) utter.voice = hit;
      }
      if (!utter.voice) {
        const zh = voices.find((v) => v.lang?.toLowerCase().startsWith('zh'));
        if (zh) utter.voice = zh;
      }

      this.current = utter;
      this.resolver = resolve;

      const finish = (r: SpeakResult) => {
        if (this.resolver !== resolve) return;
        this.cleanup();
        resolve(r);
      };

      utter.onend = () => finish('done');
      utter.onerror = (e) => {
        // 'interrupted' / 'canceled' 是主动停止触发的，不算错误
        if (e.error === 'interrupted' || e.error === 'canceled') finish('cancelled');
        else finish('done');
      };

      // 保底：某些 WebView 的 onend 不触发，按字数估时长兜底
      const estimate = Math.max(2500, req.text.length * 260 + 1500);
      this.watchdog = window.setTimeout(() => finish('done'), estimate);

      synth.speak(utter);
    });
  }

  async stop(): Promise<void> {
    window.speechSynthesis.cancel();
    if (this.resolver) {
      const r = this.resolver;
      this.resolver = null;
      this.cleanup();
      r('cancelled');
    }
  }

  dispose(): void {
    void this.stop();
    this.current = null;
  }

  private cleanup() {
    if (this.watchdog !== null) {
      clearTimeout(this.watchdog);
      this.watchdog = null;
    }
    this.current = null;
    this.resolver = null;
  }
}

export function listWebVoices(): { id: string; name: string; lang: string }[] {
  if (!('speechSynthesis' in window)) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang?.toLowerCase().startsWith('zh') || v.lang?.toLowerCase().startsWith('en'))
    .map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang }));
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
