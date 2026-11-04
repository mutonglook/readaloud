import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export interface NativeVoice {
  id: string;
  name: string;
  lang: string;
}

/** 系统里装的文字转语音引擎（讯飞、百度、OPPO、Google…） */
export interface TtsEngineInfo {
  pkg: string;
  label: string;
  /** 是否系统当前默认引擎 */
  isDefault: boolean;
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
  /** 当前使用的引擎包名 */
  engine: string;
}

/** SAF 选出来的文件：内容以 base64 传回，避免 JS 侧拿不到 content:// */
export interface PickedFile {
  name: string;
  size: number;
  data: string;
}

export interface HttpResult {
  status: number;
  headers: Record<string, string>;
  /** 文本内容（responseType 为 text 时） */
  data: string;
  /** base64 内容（responseType 为 base64 时） */
  dataBase64?: string;
}

export interface ReadAloudPlugin {
  /** 启动前台服务；音色列表稍后通过 voices 事件下发 */
  initialize(): Promise<{ available: boolean; engineCount?: number; voices?: string }>;
  /** 主动拉音色：服务比插件先初始化完时靠它补齐 */
  getVoices(): Promise<{ voices: string; ready: boolean; failed: boolean; engineCount: number }>;
  /** 试听一句，不进朗读队列 */
  preview(options: {
    text: string;
    rate: number;
    pitch: number;
    voice?: string;
    engine?: string;
  }): Promise<void>;
  /** 投递本章朗读队列并定位到起始句 */
  loadQueue(options: { queue: string[]; startIndex: number; title: string; subtitle: string }): Promise<void>;
  append(options: { queue: string[] }): Promise<void>;
  play(options: { rate: number; pitch: number; voice?: string; engine?: string }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  stop(): Promise<void>;
  seek(options: { index: number }): Promise<void>;
  getState(): Promise<{ playing: boolean; index: number; size: number }>;

  /** 沉浸式 / 状态栏图标颜色 */
  setImmersive(options: { enabled: boolean }): Promise<void>;
  setSystemBars(options: { immersive?: boolean; darkIcons?: boolean }): Promise<void>;

  /** ColorOS 适配：系统状态 / 权限申请 / 各设置页跳转 */
  checkStatus(): Promise<NativeStatus>;
  requestNotificationPermission(): Promise<void>;
  requestBatteryWhitelist(): Promise<void>;
  openAppSettings(): Promise<void>;
  openTtsSettings(): Promise<void>;
  openAutoStart(): Promise<void>;

  /** 语音引擎枚举与切换（国内离线语音包靠这个） */
  getEngines(): Promise<{ engines: string; current: string }>;
  setEngine(options: { pkg: string }): Promise<{ voices: string; current: string }>;
  /** 打开某个引擎自己的设置页（下载中文离线语音包） */
  openVoicePack(options: { engine?: string }): Promise<void>;

  /** 通用 HTTP：WebDAV 同步用，绕过 WebView 的 CORS 限制 */
  httpRequest(options: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    data?: string;
    dataBase64?: string;
    responseType?: 'text' | 'base64';
  }): Promise<HttpResult>;

  /** 调系统文件管理器（SAF）选书 */
  pickBooks(options: { multiple?: boolean; mimes?: string[] }): Promise<{ files: string; cancelled?: boolean }>;

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
let cachedEngines: TtsEngineInfo[] = [];
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

function parseEngines(json?: string): TtsEngineInfo[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json) as TtsEngineInfo[];
    return Array.isArray(arr) ? arr.filter((e) => e && e.pkg) : [];
  } catch {
    return [];
  }
}

export function getCachedVoices(): NativeVoice[] {
  return cachedVoices;
}

export function getCachedEngines(): TtsEngineInfo[] {
  return cachedEngines;
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

/** 枚举系统里所有 TTS 引擎，例如「讯飞语音」「百度语音」 */
export async function listTtsEngines(): Promise<TtsEngineInfo[]> {
  if (!isNative()) return [];
  try {
    const res = await ReadAloud.getEngines();
    cachedEngines = parseEngines(res.engines);
    return cachedEngines;
  } catch {
    return cachedEngines;
  }
}

/**
 * 切换语音引擎。切完要重新读音色——不同引擎的音色列表完全不同，
 * 旧的 nativeVoice 在新引擎里是不存在的，所以顺手清空。
 */
export async function switchTtsEngine(pkg: string): Promise<NativeVoice[]> {
  if (!isNative()) return [];
  try {
    const res = await ReadAloud.setEngine({ pkg });
    cachedVoices = parseVoices(res.voices);
    return cachedVoices;
  } catch {
    return cachedVoices;
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
 * 切换沉浸式全屏 / 状态栏图标明暗。
 * 原生壳走 WindowInsetsController；浏览器里降级为 Fullscreen API。
 */
export async function setImmersive(enabled: boolean): Promise<void> {
  if (isNative()) {
    await ReadAloud.setSystemBars({ immersive: enabled }).catch(() => undefined);
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

/** 只切状态栏图标明暗：浅色页要深色图标，夜间页要浅色图标 */
export async function setDarkStatusIcons(dark: boolean): Promise<void> {
  if (!isNative()) return;
  await ReadAloud.setSystemBars({ darkIcons: dark }).catch(() => undefined);
}

/** 调系统文件管理器选书（ColorOS 上就是「文件管理」那个界面） */
export async function pickBookFiles(multiple = true): Promise<File[] | null> {
  // 非原生环境返回 null，调用方回退到 <input type=file>
  if (!isNative()) return null;
  const res = await ReadAloud.pickBooks({
    multiple,
    mimes: [
      'text/plain',
      'application/epub+zip',
      'text/html',
      'text/markdown',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/xml',
      'text/xml',
      'application/pdf',
      'application/octet-stream',
    ],
  });
  // 用户取消：返回空数组，区别于「不是原生环境」
  if (res.cancelled) return [];
  const list = JSON.parse(res.files || '[]') as PickedFile[];
  return list.map((f) => {
    const bin = atob(f.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], f.name);
  });
}
