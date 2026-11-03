export type SpeakResult = 'done' | 'cancelled';

export interface SpeakRequest {
  text: string;
  rate: number;
  pitch: number;
  /** 音色标识，引擎自行解释 */
  voice?: string;
}

export interface TtsEngine {
  readonly kind: 'web' | 'online' | 'native' | 'edge';
  /** 预加载资源（在线引擎预热、原生引擎检查可用性） */
  prepare(): Promise<void>;
  /** 朗读一句，结束时 resolve */
  speak(req: SpeakRequest): Promise<SpeakResult>;
  /** 立刻停止当前朗读，正在 pending 的 speak 应 resolve('cancelled') */
  stop(): Promise<void>;
  dispose(): void;
}

export class TtsError extends Error {
  constructor(
    message: string,
    public readonly code: 'no-voice' | 'network' | 'auth' | 'unknown' = 'unknown',
  ) {
    super(message);
    this.name = 'TtsError';
  }
}
