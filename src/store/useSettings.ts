import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ReaderSettings, TtsSettings } from '../types';

interface SettingsState {
  reader: ReaderSettings;
  tts: TtsSettings;
  setReader: (patch: Partial<ReaderSettings>) => void;
  setTts: (patch: Partial<TtsSettings>) => void;
  reset: () => void;
}

export const defaultReader: ReaderSettings = {
  theme: 'paper',
  fontSize: 18,
  lineHeight: 1.9,
  fontFamily: 'serif',
  padding: 22,
  autoScroll: true,
  immersive: false,
};

export const defaultTts: TtsSettings = {
  provider: 'native',
  nativeVoice: '',
  rate: 1,
  pitch: 1,
  onlineBaseUrl: 'https://api.openai.com/v1',
  onlineApiKey: '',
  onlineModel: 'tts-1',
  onlineVoice: 'alloy',
  edgeVoice: 'zh-CN-XiaoxiaoNeural',
  gapMs: 260,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      reader: defaultReader,
      tts: defaultTts,
      setReader: (patch) => set((s) => ({ reader: { ...s.reader, ...patch } })),
      setTts: (patch) => set((s) => ({ tts: { ...s.tts, ...patch } })),
      reset: () => set({ reader: defaultReader, tts: defaultTts }),
    }),
    {
      name: 'readaloud-settings',
      version: 2,
      // 老版本只有 serif/sans 两种字体，也没有沉浸式与 Edge 音色，
      // 升级时用默认值补齐缺失字段，避免读取出 undefined
      migrate: (persisted, version) => {
        const state = persisted as Partial<SettingsState> | undefined;
        if (!state || version >= 2) return state as SettingsState;
        return {
          ...state,
          reader: { ...defaultReader, ...(state.reader ?? {}) },
          tts: { ...defaultTts, ...(state.tts ?? {}) },
        } as SettingsState;
      },
    },
  ),
);
