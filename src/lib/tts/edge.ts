import type { SpeakRequest, SpeakResult, TtsEngine } from './engine';
import { TtsError } from './engine';

/**
 * 微软 Edge「大声朗读」免费语音。
 *
 * 无需 API Key，中文音色自然度明显好于多数系统 TTS。
 * 鉴权靠 Sec-MS-GEC：把当前时间换算成 Windows File Time、向下取整到 5 分钟，
 * 拼接固定客户端令牌后取 SHA-256（大写十六进制）。系统时间偏差过大会被 403。
 */

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WIN_EPOCH = 11644473600;
const CHROMIUM_VERSION = '130.0.2849.68';
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const CONNECT_TIMEOUT_MS = 15000;
const TOTAL_TIMEOUT_MS = 45000;

const WS_BASE =
  'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';

export interface EdgeVoice {
  id: string;
  name: string;
  desc: string;
}

export const EDGE_VOICES: EdgeVoice[] = [
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', desc: '女声 · 温暖自然' },
  { id: 'zh-CN-YunxiNeural', name: '云希', desc: '男声 · 年轻清朗' },
  { id: 'zh-CN-YunjianNeural', name: '云健', desc: '男声 · 浑厚有力' },
  { id: 'zh-CN-XiaoyiNeural', name: '晓伊', desc: '女声 · 甜美活泼' },
  { id: 'zh-CN-YunyangNeural', name: '云扬', desc: '男声 · 新闻播报' },
  { id: 'zh-CN-YunxiaNeural', name: '云夏', desc: '男声 · 少年感' },
  { id: 'zh-CN-XiaochenNeural', name: '晓辰', desc: '女声 · 亲和' },
  { id: 'zh-CN-liaoning-XiaobeiNeural', name: '晓北', desc: '女声 · 东北口音' },
  { id: 'zh-CN-shaanxi-XiaoniNeural', name: '晓妮', desc: '女声 · 陕西口音' },
  { id: 'zh-HK-HiuMaanNeural', name: '曉曼', desc: '粤语 · 女声' },
  { id: 'zh-TW-HsiaoChenNeural', name: '曉臻', desc: '台湾腔 · 女声' },
];

function uuid(): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function sha256HexUpper(input: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new TtsError('当前环境不支持 Edge 语音（缺少加密接口）', 'no-voice');
  }
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

async function secMsGec(): Promise<string> {
  // 与官方实现保持一致：先取整到 5 分钟窗口，再换算成 100 纳秒刻度
  let ticks = Date.now() / 1000 + WIN_EPOCH;
  ticks -= ticks % 300;
  const str = `${(ticks * 1e7).toFixed(0)}${TRUSTED_CLIENT_TOKEN}`;
  return sha256HexUpper(str);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export class EdgeTtsEngine implements TtsEngine {
  readonly kind = 'edge' as const;

  private voice = EDGE_VOICES[0].id;
  private audio: HTMLAudioElement | null = null;
  private currentUrl: string | null = null;
  private ws: WebSocket | null = null;
  private audioResolve: ((r: SpeakResult) => void) | null = null;

  updateConfig(cfg: { voice?: string }) {
    if (cfg.voice) this.voice = cfg.voice;
  }

  async prepare(): Promise<void> {
    if (typeof WebSocket === 'undefined') {
      throw new TtsError('当前环境不支持 Edge 语音', 'no-voice');
    }
    if (!globalThis.crypto?.subtle) {
      throw new TtsError('当前环境不支持 Edge 语音（需要在 https 或 localhost 下运行）', 'no-voice');
    }
  }

  async speak(req: SpeakRequest): Promise<SpeakResult> {
    await this.stop();
    const blob = await this.synthesize(req);
    const url = URL.createObjectURL(blob);
    this.currentUrl = url;

    const audio = new Audio(url);
    this.audio = audio;

    return new Promise<SpeakResult>((resolve) => {
      let settled = false;
      const done = (r: SpeakResult) => {
        if (settled) return;
        settled = true;
        this.audioResolve = null;
        this.revoke();
        resolve(r);
      };
      this.audioResolve = done;

      audio.onended = () => done('done');
      audio.onerror = () => done('done');
      audio.play().catch((err) => {
        console.warn('[edge-tts] play failed', err);
        done('done');
      });
    });
  }

  async stop(): Promise<void> {
    this.closeWs();
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
    const r = this.audioResolve;
    this.audioResolve = null;
    this.revoke();
    r?.('cancelled');
  }

  dispose(): void {
    void this.stop();
  }

  private revoke() {
    if (this.currentUrl) {
      URL.revokeObjectURL(this.currentUrl);
      this.currentUrl = null;
    }
  }

  private closeWs() {
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close();
      } catch {
        /* 忽略关闭异常 */
      }
      this.ws = null;
    }
  }

  /** 连上 Edge 朗读服务，按句拉取 MP3 数据 */
  private synthesize(req: SpeakRequest): Promise<Blob> {
    return new Promise<Blob>((resolve, reject) => {
      let settled = false;
      const chunks: Uint8Array[] = [];
      let totalTimer: ReturnType<typeof setTimeout> | null = null;
      let connectTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (totalTimer) clearTimeout(totalTimer);
        if (connectTimer) clearTimeout(connectTimer);
        this.closeWs();
      };
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };
      const succeed = () => {
        if (settled) return;
        settled = true;
        cleanup();
        if (chunks.length === 0) {
          reject(new TtsError('Edge 语音没有返回音频，请稍后重试或换用其他引擎', 'network'));
          return;
        }
        resolve(new Blob(chunks as BlobPart[], { type: 'audio/mpeg' }));
      };

      void (async () => {
        try {
          const token = await secMsGec();
          if (settled) return;

          const url =
            `${WS_BASE}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
            `&Sec-MS-GEC=${token}` +
            `&Sec-MS-GEC-Version=1-${CHROMIUM_VERSION}` +
            `&ConnectionId=${uuid()}`;

          const ws = new WebSocket(url);
          this.ws = ws;
          ws.binaryType = 'arraybuffer';

          connectTimer = setTimeout(() => {
            fail(new TtsError('Edge 语音连接超时，请检查网络后重试', 'network'));
          }, CONNECT_TIMEOUT_MS);

          totalTimer = setTimeout(() => {
            fail(new TtsError('Edge 语音响应超时，请稍后重试', 'network'));
          }, TOTAL_TIMEOUT_MS);

          ws.onopen = () => {
            if (connectTimer) clearTimeout(connectTimer);
            const stamp = new Date().toString();
            ws.send(
              `X-Timestamp:${stamp}\r\n` +
                'Content-Type:application/json; charset=utf-8\r\n' +
                'Path:speech.config\r\n\r\n' +
                JSON.stringify({
                  context: {
                    synthesis: {
                      audio: {
                        metadataoptions: {
                          sentenceBoundaryEnabled: 'false',
                          wordBoundaryEnabled: 'false',
                        },
                        outputFormat: OUTPUT_FORMAT,
                      },
                    },
                  },
                }),
            );

            const ratePct = Math.round((clamp(req.rate, 0.5, 2) - 1) * 100);
            const pitchHz = Math.round((clamp(req.pitch, 0.5, 2) - 1) * 50);
            const voice = req.voice && req.voice.includes('Neural') ? req.voice : this.voice;

            const ssml =
              `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>` +
              `<voice name='${voice}'>` +
              `<prosody pitch='${pitchHz >= 0 ? '+' : ''}${pitchHz}Hz' ` +
              `rate='${ratePct >= 0 ? '+' : ''}${ratePct}%' volume='+0%'>` +
              `${escapeXml(req.text)}</prosody></voice></speak>`;

            ws.send(
              `X-RequestId:${uuid().replace(/-/g, '')}\r\n` +
                'Content-Type:application/ssml+xml\r\n' +
                `X-Timestamp:${stamp}\r\n` +
                'Path:ssml\r\n\r\n' +
                ssml,
            );
          };

          ws.onmessage = (ev: MessageEvent) => {
            if (typeof ev.data === 'string') {
              if (ev.data.includes('Path:turn.end')) succeed();
              return;
            }
            const buf = ev.data as ArrayBuffer;
            if (!(buf instanceof ArrayBuffer) || buf.byteLength < 2) return;
            // 二进制帧：前 2 字节是大端序的头部长度，头部之后才是音频
            const headerLen = new DataView(buf).getUint16(0);
            const header = new TextDecoder().decode(new Uint8Array(buf, 2, headerLen));
            if (header.includes('Path:audio')) {
              chunks.push(new Uint8Array(buf, 2 + headerLen));
            }
          };

          ws.onerror = () => {
            fail(new TtsError('Edge 语音连接失败，请检查网络', 'network'));
          };

          ws.onclose = (ev) => {
            if (!settled) {
              const hint =
                ev.code === 1006 || ev.code === 1008 || ev.code === 403
                  ? 'Edge 语音拒绝连接（可能是系统时间不准或接口有变）'
                  : `Edge 语音连接中断（code ${ev.code}）`;
              fail(new TtsError(hint, 'network'));
            }
          };
        } catch (err) {
          fail(err as Error);
        }
      })();
    });
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
