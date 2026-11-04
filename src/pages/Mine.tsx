import { useMemo, useRef } from 'react';
import { useLibrary } from '../store/useLibrary';
import { useSettings } from '../store/useSettings';
import { ACCEPT_ATTR, FORMAT_HINT, isSupported } from '../lib/formats';
import {
  IconChevron,
  IconHeadphone,
  IconInfo,
  IconSettings,
  IconUpload,
  IconBookOpen,
  IconShelf,
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
    const list = Array.from(files).filter((f) => isSupported(f.name));
    if (list.length === 0) {
      onToast(`请选择 ${FORMAT_HINT} 文件`);
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
      {/* 头像区：掌阅「我的」顶部就是这一行，右侧齿轮进设置 */}
      <div className="me__head">
        <div className="me__avatar">读</div>
        <div className="me__id">
          <div className="me__name">本地读者</div>
          <div className="me__sub">
            {lastRead ? `最近在读《${lastRead.title}》` : '还没有开始第一本书'}
          </div>
        </div>
        <button className="icon-btn" onClick={onOpenSettings} aria-label="设置">
          <IconSettings size={20} />
        </button>
      </div>

      {/* 掌阅这里是 VIP 卡片，本地版换成阅读统计卡 */}
      <div className="me__card">
        <div className="me__card-head">
          <span className="me__card-title">我的阅读</span>
          <span className="me__card-tag">本地书库</span>
        </div>
        <div className="me__card-main">
          <span className="me__card-num">{stats.total}</span>
          <span className="me__card-unit">本藏书 · 读完 {stats.done} 本</span>
        </div>
        <div className="me__card-bar">
          <i
            style={{
              width: `${stats.total ? Math.round((stats.done / stats.total) * 100) : 0}%`,
            }}
          />
        </div>
        <button
          className="me__card-btn"
          onClick={() => (lastRead ? onOpenBook(lastRead.id) : onToast('书架还是空的，先导入一本书'))}
        >
          {lastRead ? '继续阅读' : '导入第一本书'}
        </button>
      </div>

      {/* 四宫格快捷入口 */}
      <div className="me__quad">
        <button className="me__quad-item" onClick={() => onToast(`书架共 ${stats.total} 本，去书架页签查看`)}>
          <span className="me__quad-ico" style={{ background: '#fff1ea', color: '#ff5a1f' }}>
            <IconShelf size={20} />
          </span>
          <b>我的书架</b>
          <span>{stats.total} 本</span>
        </button>
        <button
          className="me__quad-item"
          onClick={() => (lastRead ? onOpenBook(lastRead.id) : onToast('还没有在读的书'))}
        >
          <span className="me__quad-ico" style={{ background: '#eef3ff', color: '#4a72c9' }}>
            <IconBookOpen size={20} />
          </span>
          <b>在读</b>
          <span>{stats.reading} 本</span>
        </button>
        <button className="me__quad-item" onClick={onOpenSettings}>
          <span className="me__quad-ico" style={{ background: '#f0ecff', color: '#7a63c4' }}>
            <IconHeadphone size={20} />
          </span>
          <b>听书</b>
          <span>{tts.provider === 'native' ? '离线' : tts.provider === 'edge' ? 'Edge' : '在线'}</span>
        </button>
        <button className="me__quad-item" onClick={() => fileRef.current?.click()}>
          <span className="me__quad-ico" style={{ background: '#eaf6ee', color: '#3f8a5c' }}>
            <IconUpload size={20} />
          </span>
          <b>导入</b>
          <span>7 种格式</span>
        </button>
      </div>

      <div className="mlist">
        <button className="mrow" onClick={onOpenSettings}>
          <span className="mrow__label">阅读偏好</span>
          <span className="mrow__value">字号 · 背景 · 翻页</span>
          <IconChevron size={14} />
        </button>
        <button className="mrow" onClick={onOpenSettings}>
          <span className="mrow__label">听书与语音</span>
          <span className="mrow__value">{providerLabel}</span>
          <IconChevron size={14} />
        </button>
        <button className="mrow" onClick={() => fileRef.current?.click()}>
          <span className="mrow__label">导入本地书籍</span>
          <span className="mrow__value">TXT · EPUB · PDF …</span>
          <IconChevron size={14} />
        </button>
        <button className="mrow" onClick={() => onToast('书籍与阅读进度均保存在本机，不会上传')}>
          <span className="mrow__label">隐私说明</span>
          <span className="mrow__value">纯本地</span>
          <IconChevron size={14} />
        </button>
        <button className="mrow" onClick={() => onToast('听书阁 v1.4.0 · 本地离线阅读器')}>
          <span className="mrow__label">关于听书阁</span>
          <span className="mrow__value">v1.4.0</span>
          <IconChevron size={14} />
        </button>
      </div>

      <div className="me__ver">
        <IconInfo size={12} /> 书籍与进度均保存在本机，不上传
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT_ATTR}
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
