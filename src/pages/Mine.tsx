import { useMemo, useRef } from 'react';
import { useLibrary } from '../store/useLibrary';
import { useSettings } from '../store/useSettings';
import {
  IconBookOpen,
  IconChevron,
  IconHeadphone,
  IconInfo,
  IconSettings,
  IconUpload,
} from '../components/Icons';

interface MineProps {
  onOpenSettings: () => void;
  onOpenBook: (id: string) => void;
  onToast: (msg: string) => void;
}

export function Mine({ onOpenSettings, onOpenBook, onToast }: MineProps) {
  const { books, progress, importFile, refresh } = useLibrary();
  const tts = useSettings((s) => s.tts);
  const fileRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const reading = books.filter((b) => {
      const p = progress[b.id]?.percent ?? 0;
      return p > 0 && p < 100;
    }).length;
    const done = books.filter((b) => (progress[b.id]?.percent ?? 0) >= 100).length;
    return { total: books.length, reading, done };
  }, [books, progress]);

  const lastRead = useMemo(() => {
    return books
      .filter((b) => progress[b.id])
      .sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0))[0];
  }, [books, progress]);

  const providerLabel =
    tts.provider === 'native' ? '离线系统语音' : tts.provider === 'edge' ? 'Edge 免费语音' : '在线 AI 语音';

  const handleImport = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files).filter((f) => /\.(txt|epub)$/i.test(f.name));
    if (list.length === 0) {
      onToast('请选择 .txt 或 .epub 文件');
      return;
    }
    let ok = 0;
    for (const f of list) {
      if (await importFile(f)) ok++;
    }
    await refresh(true);
    if (ok > 0) onToast(`已导入 ${ok} 本书`);
  };

  return (
    <div className="me">
      <div className="me__head">
        <div className="me__avatar">读</div>
        <div>
          <div className="me__name">本地读者</div>
          <div className="me__sub">
            {lastRead ? `最近在读《${lastRead.title}》` : '还没有开始第一本书'}
          </div>
        </div>
      </div>

      <div className="me__stats">
        <div className="me__stat">
          <b>{stats.total}</b>
          <span>藏书</span>
        </div>
        <div className="me__stat">
          <b>{stats.reading}</b>
          <span>在读</span>
        </div>
        <div className="me__stat">
          <b>{stats.done}</b>
          <span>读完</span>
        </div>
      </div>

      <div className="mlist">
        <button className="mrow" onClick={onOpenSettings}>
          <span className="mrow__ico" style={{ background: '#ff7a3d' }}>
            <IconSettings size={16} />
          </span>
          <span className="mrow__label">阅读设置</span>
          <span className="mrow__value">字号 · 背景 · 翻页</span>
          <IconChevron size={14} />
        </button>
        <button className="mrow" onClick={onOpenSettings}>
          <span className="mrow__ico" style={{ background: '#8a6fc4' }}>
            <IconHeadphone size={16} />
          </span>
          <span className="mrow__label">听书设置</span>
          <span className="mrow__value">{providerLabel}</span>
          <IconChevron size={14} />
        </button>
        <button className="mrow" onClick={() => fileRef.current?.click()}>
          <span className="mrow__ico" style={{ background: '#4fa06a' }}>
            <IconUpload size={16} />
          </span>
          <span className="mrow__label">导入本地书籍</span>
          <span className="mrow__value">TXT / EPUB</span>
          <IconChevron size={14} />
        </button>
        {lastRead && (
          <button className="mrow" onClick={() => onOpenBook(lastRead.id)}>
            <span className="mrow__ico" style={{ background: '#5a86c9' }}>
              <IconBookOpen size={16} />
            </span>
            <span className="mrow__label">继续阅读</span>
            <span className="mrow__value">{lastRead.title}</span>
            <IconChevron size={14} />
          </button>
        )}
        <button className="mrow" onClick={() => onToast('听书阁 v1.2.0 · 本地离线阅读器')}>
          <span className="mrow__ico" style={{ background: '#7e8a96' }}>
            <IconInfo size={16} />
          </span>
          <span className="mrow__label">关于</span>
          <span className="mrow__value">v1.2.0</span>
          <IconChevron size={14} />
        </button>
      </div>

      <div className="me__ver">书籍与进度均保存在本机，不上传</div>

      <input
        ref={fileRef}
        type="file"
        accept=".txt,.epub,text/plain,application/epub+zip"
        multiple
        hidden
        onChange={(e) => {
          void handleImport(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
