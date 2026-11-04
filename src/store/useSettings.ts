import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ReaderSettings, SyncSettings, TtsSettings } from '../types';

interface SettingsState {
  reader: ReaderSettings;
  tts: TtsSettings;
  sync: SyncSettings;
  setReader: (patch: Partial<ReaderSettings>) => void;
  setTts: (patch: Partial<TtsSettings>) => void;
  setSync: (patch: Partial<SyncSettings>) => void;
  reset: () => void;
}

export const defaultReader: ReaderSettings = {
  theme: 'paper',
  fontSize: 18,
  lineHeight: 1.85,
  paragraphGap: 0.7,
  weight: 400,
  fontFamily: 'serif',
  padding: 22,
  pageMode: 'simulate',
  brightness: 1,
  autoScroll: true,
  immersive: false,
};

export const defaultTts: TtsSettings = {
  provider: 'native',
  nativeEngine: '',
  nativeVoice: '',
  rate: 1,
  pitch: 1,
  onlineBaseUrl: 'https://api.openai.com/v1',
  onlineApiKey: '',
  onlineModel: 'tts-1',
  onlineVoice: 'alloy',
  gapMs: 260,
};

export const defaultSync: SyncSettings = {
  provider: 'none',
  url: 'https://dav.jianguoyun.com/dav/',
  account: '',
  password: '',
  auto: false,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      reader: defaultReader,
      tts: defaultTts,
      sync: defaultSync,
      setReader: (patch) => set((s) => ({ reader: { ...s.reader, ...patch } })),
      setTts: (patch) => set((s) => ({ tts: { ...s.tts, ...patch } })),
      setSync: (patch) => set((s) => ({ sync: { ...s.sync, ...patch } })),
      reset: () => set({ reader: defaultReader, tts: defaultTts, sync: defaultSync }),
    }),
    {
      name: 'readaloud-settings',
      version: 4,
      // 逐版本补齐缺失字段，避免读出来是 undefined：
      // v1 只有 serif/sans，v2 加了沉浸式，v3 加了字体/翻页，v4 去掉了 Edge、加了云同步与字体包
      migrate: (persisted, version) => {
        const state = persisted as Partial<SettingsState> | undefined;
        if (!state) return undefined as unknown as SettingsState;
        // Edge 引擎已移除，老用户如果在用会自动回到离线朗读
        const tts = { ...defaultTts, ...(state.tts ?? {}) } as TtsSettings & { edgeVoice?: string };
        if ((tts.provider as string) === 'edge') tts.provider = 'native';
        delete tts.edgeVoice;
        return {
          ...state,
          reader: { ...defaultReader, ...(state.reader ?? {}) },
          tts,
          sync: { ...defaultSync, ...(state.sync ?? {}) },
        } as SettingsState;
      },
    },
  ),
);
