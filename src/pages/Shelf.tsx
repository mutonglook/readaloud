import { useEffect, useRef, useState } from 'react';
import { useLibrary } from '../store/useLibrary';
import type { BookMeta } from '../types';
import { IconBook, IconPlus, IconSettings, IconTrash } from '../components/Icons';

interface ShelfProps {
  onOpen: (bookId: string) => void;
  onOpenSettings: () => void;
  onToast: (msg: string) => void;
}

export function Shelf({ onOpen, onOpenSettings, onToast }: ShelfProps) {
  const { books, progress, loading, importing, error, refresh, importFile, remove, importSample } = useLibrary();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (error) onToast(error);
  }, [error, onToast]);

  const pickFiles = () => fileRef.current?.click();

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files).filter((f) => /\.(txt|epub)$/i.test(f.name));
    if (list.length === 0) {
      onToast('请选择 .txt 或 .epub 文件');
      return;
    }

    // 单本导入后直接进阅读器，少一次点击
    if (list.length === 1) {
      const book = await importFile(list[0]);
      if (book) {
        onToast(`已导入《${book.title}》`);
        onOpen(book.id);
      }
      return;
    }

    let ok = 0;
    for (const f of list) {
      if (await importFile(f)) ok++;
    }
    if (ok > 0) onToast(`已导入 ${ok} 本书`);
  };

  const handleDelete = async (book: BookMeta) => {
    if (!window.confirm(`确定从书架移除《${book.title}》？\n本地阅读进度也会一并清除。`)) return;
    await remove(book.id);
    onToast('已移除');
  };

  const totalBooks = books.length;

  return (
    <div className="shelf">
      <header className="shelf__header">
        <div>
          <h1 className="shelf__title">听书阁</h1>
          <div className="shelf__subtitle">
            {loading ? '正在读取书架…' : totalBooks > 0 ? `${totalBooks} 本书 · 点开即可听` : '把书放进来，让眼睛休息一下'}
          </div>
        </div>
        <div className="shelf__actions">
          {totalBooks > 0 && (
            <button
              className="icon-btn"
              onClick={() => setEditing((v) => !v)}
              aria-label={editing ? '完成' : '管理书架'}
              style={{ fontSize: 12, width: 'auto', padding: '0 10px', color: editing ? 'var(--accent)' : undefined }}
            >
              {editing ? '完成' : '管理'}
            </button>
          )}
          <button className="icon-btn" onClick={onOpenSettings} aria-label="设置">
            <IconSettings />
          </button>
          <button className="icon-btn" onClick={pickFiles} aria-label="导入书籍">
            <IconPlus />
          </button>
        </div>
      </header>

      <input
        ref={fileRef}
        type="file"
        accept=".txt,.epub,text/plain,application/epub+zip"
        multiple
        hidden
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {books.length === 0 && !loading ? (
        <div className="empty">
          <div className="empty__art">
            <IconBook size={124} />
          </div>
          <div className="empty__title">书架还是空的</div>
          <p className="empty__desc">
            支持 TXT 与 EPUB。导入后可以像翻书一样读，
            <br />
            也可以让它在后台一句句念给你听。
          </p>
          <button className="empty__cta" onClick={pickFiles}>
            导入第一本书
          </button>
          <button
            style={{ marginTop: 14, fontSize: 13, color: 'var(--text-muted)', textDecoration: 'underline', textUnderlineOffset: 4 }}
            onClick={async () => {
              const b = await importSample();
              onOpen(b.id);
            }}
          >
            手边没书？先读个示例
          </button>
        </div>
      ) : (
        <div className="shelf__body">
          <div className="book-grid">
            {books.map((b, i) => {
              const p = progress[b.id];
              const pct = p ? p.percent : 0;
              return (
                <div
                  className="book-card"
                  key={b.id}
                  style={{ animationDelay: `${Math.min(i * 26, 260)}ms` }}
                  onClick={() => (editing ? undefined : onOpen(b.id))}
                >
                  <div className="book-cover">
                    {b.cover ? (
                      <img src={b.cover} alt="" />
                    ) : (
                      <div className="book-cover__text">{b.title}</div>
                    )}
                    {editing && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(b);
                        }}
                        style={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: 'rgba(180,60,40,.92)',
                          color: '#fff',
                          display: 'grid',
                          placeItems: 'center',
                          zIndex: 3,
                        }}
                        aria-label="删除"
                      >
                        <IconTrash size={15} />
                      </button>
                    )}
                  </div>
                  <div className="book-card__meta">
                    <div className="book-card__name">{b.title}</div>
                    <div className="book-card__author">
                      {b.author} · {b.chapterCount} 章
                    </div>
                    {pct > 0 && (
                      <div className="book-card__progress">
                        <i style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {importing && (
        <div className="importing">
          <div className="importing__box">
            <div className="spinner" />
            <div className="importing__text">正在解析《{importing}》…</div>
          </div>
        </div>
      )}
    </div>
  );
}
