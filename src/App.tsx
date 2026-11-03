import { useCallback, useEffect, useRef, useState } from 'react';
import { Shelf } from './pages/Shelf';
import { Reader } from './pages/Reader';
import { Settings } from './pages/Settings';
import { useSettings } from './store/useSettings';
import { speechController } from './lib/tts/controller';
import { isNative, setImmersive } from './lib/tts/native';
import { App as CapApp } from '@capacitor/app';

type View = 'shelf' | 'reader' | 'settings';

export default function App() {
  const theme = useSettings((s) => s.reader.theme);
  const immersive = useSettings((s) => s.reader.immersive);
  const tts = useSettings((s) => s.tts);
  const [view, setView] = useState<View>('shelf');
  const [prevView, setPrevView] = useState<View>('shelf');
  const [activeBook, setActiveBook] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 主题挂在 documentElement 上，全局生效
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    const map: Record<string, string> = {
      paper: '#f6f1e7',
      eye: '#cfe6cf',
      parchment: '#e8d9bd',
      night: '#14140f',
    };
    if (meta) meta.setAttribute('content', map[theme] ?? '#f6f1e7');
  }, [theme]);

  useEffect(() => {
    speechController.applySettings(tts);
  }, [tts]);

  // 启动时恢复上次的全屏状态（设置页里切换时也会走这里）
  useEffect(() => {
    void setImmersive(immersive);
    if (immersive) document.documentElement.dataset.immersive = 'on';
    else delete document.documentElement.dataset.immersive;
  }, [immersive]);

  // 原生端：从后台回到前台时同步播放状态（通知栏可能改过播放/暂停）
  useEffect(() => {
    if (!isNative()) return;
    void speechController.warmup();
    const sub = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void speechController.syncFromNative();
    });
    return () => {
      void sub.then((h) => h.remove());
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const openBook = (id: string) => {
    setActiveBook(id);
    setView('reader');
  };

  const openSettings = () => {
    setPrevView(view);
    setView('settings');
  };

  const closeSettings = () => {
    setView(prevView === 'reader' && activeBook ? 'reader' : 'shelf');
  };

  // Android 返回键
  useEffect(() => {
    if (!isNative()) return;
    const sub = CapApp.addListener('backButton', () => {
      if (view === 'reader') setView('shelf');
      else if (view === 'settings') setView('shelf');
      else void CapApp.exitApp();
    });
    return () => {
      void sub.then((h) => h.remove());
    };
  }, [view]);

  return (
    <div className="app">
      {view === 'shelf' && (
        <Shelf onOpen={openBook} onOpenSettings={openSettings} onToast={showToast} />
      )}
      {view === 'reader' && activeBook && (
        <Reader
          bookId={activeBook}
          onBack={() => setView('shelf')}
          onOpenSettings={openSettings}
          onToast={showToast}
        />
      )}
      {view === 'settings' && <Settings onBack={closeSettings} onToast={showToast} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
