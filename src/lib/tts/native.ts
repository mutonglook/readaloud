import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export interface NativeVoice {
  id: string;
  name: string;
  lang: string;
}

/** 后台运行相关的系统状态，设置页用来说明为什么会被杀 */
export interface NativeStatus {
  sdk: number;
  notifications: boolean;
  batteryWhitelisted: boolean;
  ttsEngines: number;
  ttsReady: boolean;
  ttsFailed: boolean;
  voices: string;
  manufacturer: string;
}

export interface ReadAloudPlugin {
  /** 启动前台服务；音色列表稍后通过 voices 事件下发 */
  initialize(): Promise<{ available: boolean; engineCount?: number; voices?: string }>;
  /** 主动拉音色：服务比插件先初始化完时靠它补齐 */
  getVoices(): Promise<{ voices: string; ready: boolean; failed: boolean; engineCount: number }>;
  /** 试听一句，不进朗读队列 */
  preview(options: { text: string; rate: number; pitch: number; voice?: string }): Promise<void>;
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
  /** ColorOS 适配：系统状态 / 权限申请 / 各设置页跳转 */
  checkStatus(): Promise<NativeStatus>;
  requestNotificationPermission(): Promise<void>;
  requestBatteryWhitelist(): Promise<void>;
  openAppSettings(): Promise<void>;
  openTtsSettings(): Promise<void>;
  openAutoStart(): Promise<void>;

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

function parseVoices(json?: string): NativeVoice[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json) as NativeVoice[];
    return Array.isArray(arr) ? arr.filter((v) => v && v.id) : [];
  } catch {
    return [];
  }
}

export function getCachedVoices(): NativeVoice[] {
  return cachedVoices;
}

/** 绑定 voices 事件，后续系统换了引擎也能立刻反映到列表 */
async function bindVoiceListener() {
  if (bound || !isNative()) return;
  bound = true;
  await ReadAloud.addListener('voices', (d) => {
    const list = parseVoices(d.voices);
    if (list.length) cachedVoices = list;
  });
}

export async function initNativeTts(): Promise<{
  available: boolean;
  voices: NativeVoice[];
  engineCount: number;
}> {
  if (!isNative()) return { available: false, voices: [], engineCount: 0 };
  try {
    await bindVoiceListener();
    const res = await ReadAloud.initialize();
    const list = parseVoices(res.voices);
    if (list.length) cachedVoices = list;
    return { available: res.available, voices: cachedVoices, engineCount: res.engineCount ?? 0 };
  } catch (err) {
    console.warn('[native-tts] initialize failed', err);
    return { available: false, voices: [], engineCount: 0 };
  }
}

/** 主动拉一次音色（服务就绪后才会返回内容） */
export async function fetchNativeVoices(): Promise<{
  voices: NativeVoice[];
  ready: boolean;
  engineCount: number;
}> {
  if (!isNative()) return { voices: [], ready: false, engineCount: 0 };
  try {
    await bindVoiceListener();
    const res = await ReadAloud.getVoices();
    const list = parseVoices(res.voices);
    if (list.length) cachedVoices = list;
    return { voices: cachedVoices, ready: res.ready, engineCount: res.engineCount ?? 0 };
  } catch {
    return { voices: cachedVoices, ready: false, engineCount: 0 };
  }
}

export async function checkNativeStatus(): Promise<NativeStatus | null> {
  if (!isNative()) return null;
  try {
    return await ReadAloud.checkStatus();
  } catch {
    return null;
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
