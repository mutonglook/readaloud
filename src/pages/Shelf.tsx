import { useEffect, useMemo, useRef, useState } from 'react';
import { useLibrary } from '../store/useLibrary';
import type { BookMeta, ShelfView } from '../types';
import { ACCEPT_ATTR, FORMAT_HINT, isSupported } from '../lib/formats';
import {
  IconBook,
  IconCheck,
  IconClose,
  IconGrid,
  IconPlus,
  IconRows,
  IconSearch,
  IconTrash,
} from '../components/Icons';

interface ShelfProps {
  onOpen: (bookId: string) => void;
  onToast: (msg: string) => void;
}

type FilterKey = 'all' | 'reading' | 'done';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'reading', label: '在读' },
  { key: 'done', label: '已读' },
];

/** 书名下的第二行，掌阅书架就是这一行灰字：未读显示作者，读过显示进度 */
function metaText(pct: number, author?: string) {
  if (pct >= 100) return '已读完';
  if (pct > 0) return `读至 ${pct}%`;
  return author && author.trim() ? author : '未读';
}

export function Shelf({ onOpen, onToast }: ShelfProps) {
  const { books, progress, loading, importing, error, refresh, importFile, remove, importSample } =
    useLibrary();
  const fileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [view, setView] = useState<ShelfView>('grid');
  // 管理模式：长按书封进入，多选删除
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (error) onToast(error);
  }, [error, onToast]);

  const pickFiles = () => fileRef.current?.click();

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files).filter((f) => isSupported(f.name));
    if (list.length === 0) {
      onToast(`请选择 ${FORMAT_HINT} 文件`);
      return;
    }
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

  const pctOf = (id: string) => progress[id]?.percent ?? 0;

  // 最近在读的一本
  const recent = useMemo(() => {
    const read = books
      .filter((b) => pctOf(b.id) > 0 && pctOf(b.id) < 100)
      .sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0));
    return read[0] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books, progress]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = books;
    if (q) {
      list = list.filter(
        (b) => b.title.toLowerCase().includes(q) || (b.author ?? '').toLowerCase().includes(q),
      );
    }
    if (filter === 'reading') list = list.filter((b) => pctOf(b.id) > 0 && pctOf(b.id) < 100);
    if (filter === 'done') list = list.filter((b) => pctOf(b.id) >= 100);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books, progress, query, filter]);

  const searching = query.trim().length > 0;

  /* ------------------------------ 管理模式 ------------------------------ */

  const startPress = (id: string) => {
    pressTimer.current = setTimeout(() => {
      setManaging(true);
      setSelected(new Set([id]));
      // 触发一次轻震动，手感对齐原生
      navigator.vibrate?.(12);
    }, 460);
  };

  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitManage = () => {
    setManaging(false);
    setSelected(new Set());
  };

  const handleOpen = (b: BookMeta) => {
    if (managing) {
      toggleSelect(b.id);
      return;
    }
    onOpen(b.id);
  };

  const selectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((b) => b.id)));
  };

  const removeSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`确定移除选中的 ${selected.size} 本书？\n本地阅读进度也会一并清除。`)) return;
    const ids = Array.from(selected);
    exitManage();
    for (const id of ids) await remove(id);
    onToast(`已移除 ${ids.length} 本`);
  };

  /* ------------------------------ 渲染 ------------------------------ */

  const cover = (b: BookMeta, cls: string) => (
    <div className={cls}>
      {b.cover ? <img src={b.cover} alt="" /> : <span>{b.title}</span>}
    </div>
  );

  return (
    <div className="sh">
      <header className="sh__top">
        {managing ? (
          <>
            <h1 className="sh__title">已选 {selected.size} 本</h1>
            <div className="sh__tools">
              <button className="sh__text-btn" onClick={exitManage}>
                完成
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="sh__title">书架</h1>
            <div className="sh__tools">
              <button
                className={`icon-btn${searchOpen ? ' on' : ''}`}
                onClick={() => {
                  setSearchOpen((v) => !v);
                  if (searchOpen) setQuery('');
                }}
                aria-label="搜索书架"
              >
                {searchOpen ? <IconClose size={19} /> : <IconSearch size={19} />}
              </button>
              <button className="icon-btn" onClick={pickFiles} aria-label="导入本地书籍">
                <IconPlus size={20} />
              </button>
            </div>
          </>
        )}
      </header>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT_ATTR}
        multiple
        hidden
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {searchOpen && !managing && (
        <div className="search">
          <span className="search__icon" aria-hidden="true">
            <IconSearch size={16} />
          </span>
          <input
            className="search__input"
            type="search"
            autoFocus
            placeholder="搜索书名或作者"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="搜索书架"
          />
          {searching && (
            <button className="search__clear" onClick={() => setQuery('')} aria-label="清空搜索">
              <IconClose size={12} />
            </button>
          )}
        </div>
      )}

      {books.length > 0 && !managing && (
        <div className="sh__bar">
          <div className="sh__tabs">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={`sh__tab${filter === f.key ? ' on' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            className="sh__view"
            onClick={() => setView(view === 'grid' ? 'list' : 'grid')}
            aria-label={view === 'grid' ? '切换为列表视图' : '切换为封面视图'}
          >
            {view === 'grid' ? <IconRows size={17} /> : <IconGrid size={17} />}
          </button>
        </div>
      )}

      {/* 继续阅读：掌阅书架顶部的续读横条 */}
      {recent && !searching && filter === 'all' && !managing && (
        <div className="recent" onClick={() => onOpen(recent.id)}>
          <div className="recent__cover">
            {recent.cover ? <img src={recent.cover} alt="" /> : <span>{recent.title}</span>}
          </div>
          <div className="recent__info">
            <div className="recent__label">继续阅读</div>
            <div className="recent__title">{recent.title}</div>
            <div className="recent__sub">
              {progress[recent.id]?.chapterIndex != null
                ? `第 ${(progress[recent.id]?.chapterIndex ?? 0) + 1} 章 · ${pctOf(recent.id)}%`
                : `共 ${recent.chapterCount} 章`}
            </div>
          </div>
          <span className="recent__go" aria-hidden="true">
            ›
          </span>
        </div>
      )}

      {books.length === 0 && !loading ? (
        <div className="empty">
          <div className="empty__art">
            <IconBook size={104} />
          </div>
          <div className="empty__title">书架还是空的</div>
          <p className="empty__desc">
            支持 {FORMAT_HINT}。导入后可以像翻书一样读，
            <br />
            也可以让它在后台一句句念给你听。
          </p>
          <button className="empty__cta" onClick={pickFiles}>
            导入第一本书
          </button>
          <button
            className="empty__link"
            onClick={async () => {
              const b = await importSample();
              onOpen(b.id);
            }}
          >
            手边没书？先读个示例
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <div className="empty__title">{searching ? '没有匹配的书' : '这里还没有书'}</div>
          <p className="empty__desc">
            {searching ? (
              <>
                换个关键词试试，
                <br />
                或者清空搜索看全部 {books.length} 本。
              </>
            ) : (
              <>当前分组下没有内容，切到「全部」看看。</>
            )}
          </p>
          <button
            className="empty__cta"
            onClick={() => {
              setQuery('');
              setFilter('all');
            }}
          >
            查看全部
          </button>
        </div>
      ) : view === 'grid' ? (
        <div className="grid">
          {filtered.map((b, i) => {
            const pct = pctOf(b.id);
            const on = selected.has(b.id);
            return (
              <div
                className={`bk${managing && on ? ' picked' : ''}`}
                key={b.id}
                style={{ animationDelay: `${Math.min(i * 22, 240)}ms` }}
                onClick={() => handleOpen(b)}
                onPointerDown={() => startPress(b.id)}
                onPointerUp={cancelPress}
                onPointerMove={cancelPress}
                onPointerCancel={cancelPress}
                onContextMenu={(e) => e.preventDefault()}
              >
                <div className="bk__cover">
                  {b.cover ? (
                    <img src={b.cover} alt="" />
                  ) : (
                    <div className="bk__cover-text">{b.title}</div>
                  )}
                  {pct > 0 && !managing && <div className="bk__badge">{pct}%</div>}
                  {managing && (
                    <div className={`bk__sel${on ? ' on' : ''}`}>
                      <IconCheck size={12} />
                    </div>
                  )}
                </div>
                <div className="bk__title">{b.title}</div>
                <div className="bk__meta">{metaText(pct, b.author)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="list">
          {filtered.map((b) => {
            const pct = pctOf(b.id);
            return (
              <div
                className="row"
                key={b.id}
                onClick={() => handleOpen(b)}
                onPointerDown={() => startPress(b.id)}
                onPointerUp={cancelPress}
                onPointerMove={cancelPress}
                onPointerCancel={cancelPress}
                onContextMenu={(e) => e.preventDefault()}
              >
                {cover(b, 'row__cover')}
                <div className="row__main">
                  <div className="row__title">{b.title}</div>
                  <div className="row__sub">
                    {b.author || '未知作者'} · 共 {b.chapterCount} 章
                  </div>
                  <div className="row__pct">
                    <i style={{ width: `${pct}%` }} />
                  </div>
                </div>
                {managing ? (
                  <div className={`row__sel${selected.has(b.id) ? ' on' : ''}`}>
                    <IconCheck size={12} />
                  </div>
                ) : (
                  <span className="row__meta">{pct > 0 ? `${pct}%` : '未读'}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {managing && (
        <div className="manage">
          <button onClick={selectAll}>
            {selected.size === filtered.length && filtered.length > 0 ? '取消全选' : '全选'}
          </button>
          <button className="danger" onClick={() => void removeSelected()} disabled={selected.size === 0}>
            <IconTrash size={15} /> 删除
          </button>
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
