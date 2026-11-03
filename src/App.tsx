import { useCallback, useEffect, useRef, useState } from 'react';
import { Shelf } from './pages/Shelf';
import { Store } from './pages/Store';
import { Discover } from './pages/Discover';
import { Mine } from './pages/Mine';
import { Reader } from './pages/Reader';
import { Settings } from './pages/Settings';
import { TabBar, type TabKey } from './components/TabBar';
import { useSettings } from './store/useSettings';
import { speechController } from './lib/tts/controller';
import { isNative, setImmersive } from './lib/tts/native';
import { App as CapApp } from '@capacitor/app';

export default function App() {
  const immersive = useSettings((s) => s.reader.immersive);
  const tts = useSettings((s) => s.tts);
  const [tab, setTab] = useState<TabKey>('shelf');
  const [readerId, setReaderId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    speechController.applySettings(tts);
  }, [tts]);

  // 启动时恢复上次的全屏状态
  useEffect(() => {
    void setImmersive(immersive);
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
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const switchTab = (next: TabKey) => {
    setTab(next);
    mainRef.current?.scrollTo({ top: 0 });
  };

  const openBook = (id: string) => setReaderId(id);

  // Android 返回键：先关覆盖层，再回书架页签，最后退出
  useEffect(() => {
    if (!isNative()) return;
    const sub = CapApp.addListener('backButton', () => {
      if (settingsOpen) setSettingsOpen(false);
      else if (readerId) setReaderId(null);
      else if (tab !== 'shelf') setTab('shelf');
      else void CapApp.exitApp();
    });
    return () => {
      void sub.then((h) => h.remove());
    };
  }, [readerId, settingsOpen, tab]);

  return (
    <div className="app">
      <div className="app__main" ref={mainRef} key={tab}>
        {tab === 'shelf' && <Shelf onOpen={openBook} onToast={showToast} />}
        {tab === 'store' && <Store onToast={showToast} />}
        {tab === 'discover' && <Discover />}
        {tab === 'mine' && (
          <Mine onOpenSettings={() => setSettingsOpen(true)} onOpenBook={openBook} onToast={showToast} />
        )}
      </div>

      <TabBar active={tab} onChange={switchTab} />

      {readerId && (
        <Reader
          bookId={readerId}
          onBack={() => setReaderId(null)}
          onOpenSettings={() => setSettingsOpen(true)}
          onToast={showToast}
        />
      )}

      {settingsOpen && <Settings onBack={() => setSettingsOpen(false)} onToast={showToast} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
