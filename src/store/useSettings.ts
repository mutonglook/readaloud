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
    { name: 'readaloud-settings', version: 1 },
  ),
);
