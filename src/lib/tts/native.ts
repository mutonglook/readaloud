import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export interface NativeVoice {
  id: string;
  name: string;
  lang: string;
}

export interface ReadAloudPlugin {
  /** 启动前台服务；音色列表稍后通过 voices 事件下发 */
  initialize(): Promise<{ available: boolean }>;
  /** 投递本章朗读队列并定位到起始句 */
  loadQueue(options: { queue: string[]; startIndex: number; title: string; subtitle: string }): Promise<void>;
  append(options: { queue: string[] }): Promise<void>;
  play(options: { rate: number; pitch: number; voice?: string }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  stop(): Promise<void>;
  seek(options: { index: number }): Promise<void>;
  getState(): Promise<{ playing: boolean; index: number; size: number }>;
  /** 沉浸式全屏：隐藏 / 显示状态栏与导航栏 */
  setImmersive(options: { enabled: boolean }): Promise<void>;

  addListener(event: 'progress', cb: (d: { index: number; text: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'state', cb: (d: { playing: boolean; index: number }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'finished', cb: () => void): Promise<PluginListenerHandle>;
  addListener(event: 'voices', cb: (d: { voices: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'error', cb: (d: { message: string }) => void): Promise<PluginListenerHandle>;
}

export const ReadAloud = registerPlugin<ReadAloudPlugin>('ReadAloud');

/** 是否跑在原生壳里（决定能不能用后台朗读） */
export const isNative = () => Capacitor.isNativePlatform();

let cachedVoices: NativeVoice[] = [];
let bound = false;

export function getCachedVoices(): NativeVoice[] {
  return cachedVoices;
}

export async function initNativeTts(): Promise<{ available: boolean; voices: NativeVoice[] }> {  if (!isNative()) return { available: false, voices: [] };
  try {
    if (!bound) {
      bound = true;
      await ReadAloud.addListener('voices', (d) => {
        try {
          cachedVoices = JSON.parse(d.voices);
        } catch {
          /* 忽略解析失败 */
        }
      });
    }
    const res = await ReadAloud.initialize();
    return { available: res.available, voices: cachedVoices };
  } catch (err) {
    console.warn('[native-tts] initialize failed', err);
    return { available: false, voices: [] };
  }
}

/**
 * 切换沉浸式全屏。
 * 原生壳走 WindowInsetsController 隐藏系统栏；浏览器里降级为 Fullscreen API。
 */
export async function setImmersive(enabled: boolean): Promise<void> {
  if (isNative()) {
    await ReadAloud.setImmersive({ enabled });
    return;
  }
  try {
    if (enabled) {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch (err) {
    console.warn('[immersive] browser fullscreen failed', err);
  }
}
