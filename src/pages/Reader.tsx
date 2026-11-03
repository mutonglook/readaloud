import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Book, PageMode, SpeakPosition, ThemeId } from '../types';
import { useLibrary } from '../store/useLibrary';
import { useSettings } from '../store/useSettings';
import { splitSentences } from '../lib/splitter';
import { speechController } from '../lib/tts/controller';
import { setImmersive } from '../lib/tts/native';
import { FONT_OPTIONS, resolveFontStack } from '../lib/fonts';
import { usePlayerState } from '../hooks/usePlayerState';
import {
  IconBack,
  IconCollapse,
  IconExpand,
  IconHeadphone,
  IconList,
  IconMoon,
  IconMore,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconSun,
  IconType,
} from '../components/Icons';

interface ReaderProps {
  bookId: string;
  onBack: () => void;
  onOpenSettings: () => void;
  onToast: (msg: string) => void;
}

const THEMES: { id: ThemeId; label: string; bg: string; fg: string }[] = [
  { id: 'white', label: '白', bg: '#ffffff', fg: '#262626' },
  { id: 'paper', label: '纸', bg: '#f6f0e3', fg: '#36322a' },
  { id: 'eye', label: '绿', bg: '#cde6cd', fg: '#26382a' },
  { id: 'parchment', label: '黄', bg: '#e9dcc3', fg: '#42331f' },
  { id: 'night', label: '夜', bg: '#121211', fg: '#9d9890' },
];

const PAGE_MODES: { id: PageMode; label: string }[] = [
  { id: 'slide', label: '平移' },
  { id: 'none', label: '无动画' },
  { id: 'flow', label: '上下滚动' },
];

export function Reader({ bookId, onBack, onOpenSettings, onToast }: ReaderProps) {
  const { loadBook, saveReading, progress } = useLibrary();
  const { reader, setReader, tts } = useSettings();
  const player = usePlayerState();

  const [book, setBook] = useState<Book | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [barsOpen, setBarsOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [tocAsc, setTocAsc] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [listenOpen, setListenOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [fontStack, setFontStack] = useState(FONT_OPTIONS[0].stack);
  const [restored, setRestored] = useState(false);

  const streamRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const typeBlockRef = useRef<HTMLDivElement>(null);
  const activeSpanRef = useRef<HTMLSpanElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTheme = useRef<ThemeId>(reader.theme === 'night' ? 'paper' : reader.theme);

  const flow = reader.pageMode === 'flow';

  /* ---------------------------- 字体注册 ---------------------------- */
  useEffect(() => {
    let alive = true;
    void resolveFontStack(reader.fontFamily, reader.customFont).then((stack) => {
      if (alive) setFontStack(stack);
    });
    return () => {
      alive = false;
    };
  }, [reader.fontFamily, reader.customFont]);

  /* ---------------------------- 载入书籍 ---------------------------- */
  useEffect(() => {
    let alive = true;
    void (async () => {
      const b = await loadBook(bookId);
      if (!alive || !b) return;
      setBook(b);
      const p = progress[bookId];
      setChapterIndex(p ? Math.min(p.chapterIndex, b.chapters.length - 1) : 0);
      speechController.applySettings(tts);
      await speechController.locate(b, {
        chapterIndex: p?.chapterIndex ?? 0,
        paragraphIndex: p?.paragraphIndex ?? 0,
        sentenceIndex: 0,
      });
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  useEffect(() => {
    speechController.applySettings(tts);
  }, [tts]);

  const chapter = book?.chapters[chapterIndex];

  const sentences = useMemo(() => {
    if (!chapter) return [];
    return chapter.paragraphs.map((p) => splitSentences(p));
  }, [chapter]);

  /* ---------------------------- 分页测量 ---------------------------- */
  const measure = useCallback(() => {
    const el = streamRef.current;
    if (!el) return 1;
    if (flow) {
      setPages(1);
      return 1;
    }
    const w = window.innerWidth;
    // 多栏流里每栏恰好一屏宽，左内边距为 pad，故总宽 = 页数 × W - pad
    const n = Math.max(1, Math.round((el.scrollWidth + reader.padding) / w));
    setPages(n);
    return n;
  }, [flow, reader.padding]);

  // 章节 / 排版参数变化后重新分页，并尽量把当前段落所在页显示出来
  useEffect(() => {
    if (!chapter) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const n = measure();
        setPage((p) => {
          if (restored) return Math.min(p, n - 1);
          // 首次进入：定位到上次读到的段落所在页
          const pi = progress[bookId]?.paragraphIndex ?? 0;
          if (!pi || flow) return 0;
          const el = streamRef.current?.querySelector<HTMLElement>(`[data-p="${pi}"]`);
          const st = streamRef.current;
          if (!el || !st) return 0;
          const left = el.getBoundingClientRect().left - st.getBoundingClientRect().left;
          return Math.max(0, Math.min(n - 1, Math.floor(left / window.innerWidth)));
        });
        if (!restored) setRestored(true);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chapter,
    reader.fontSize,
    reader.lineHeight,
    reader.padding,
    reader.paragraphGap,
    reader.weight,
    reader.pageMode,
    fontStack,
  ]);

  // 视口变化（旋转 / 键盘）重排
  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measure]);

  /* ---------------------------- 进度保存 ---------------------------- */
  const currentParagraph = useCallback(() => {
    const st = streamRef.current;
    if (!st) return 0;
    const w = window.innerWidth;
    const stLeft = st.getBoundingClientRect().left;
    const paras = Array.from(st.querySelectorAll<HTMLElement>('[data-p]'));
    if (flow) {
      const anchor = st.getBoundingClientRect().top + 120;
      let pi = 0;
      for (const el of paras) {
        if (el.getBoundingClientRect().top <= anchor) pi = Number(el.dataset.p ?? 0);
        else break;
      }
      return pi;
    }
    let pi = 0;
    for (const el of paras) {
      const pageOf = Math.floor((el.getBoundingClientRect().left - stLeft) / w);
      if (pageOf <= page) pi = Number(el.dataset.p ?? 0);
      else break;
    }
    return pi;
  }, [page, flow]);

  const persist = useCallback(
    (ci: number, pi: number) => {
      if (!book) return;
      const total = book.chapters.length;
      const paraCount = book.chapters[ci]?.paragraphs.length ?? 1;
      const percent = Math.min(100, Math.round(((ci + Math.min(pi / paraCount, 1)) / total) * 100));
      void saveReading({ bookId, chapterIndex: ci, paragraphIndex: pi, percent, updatedAt: Date.now() });
    },
    [book, bookId, saveReading],
  );

  useEffect(() => {
    if (!book || !restored) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      persist(chapterIndex, currentParagraph());
    }, 900);
  }, [page, chapterIndex, book, restored, persist, currentParagraph]);

  /* ---------------------------- 翻页 ---------------------------- */
  const showHint = (msg: string) => {
    setHint(msg);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 1400);
  };

  const jumpChapter = useCallback(
    async (idx: number) => {
      if (!book || idx < 0 || idx >= book.chapters.length) return;
      setChapterIndex(idx);
      setRestored(true);
      setPage(0);
      setTocOpen(false);
      persist(idx, 0);
      if (player.playing) await speechController.jumpToChapter(idx, 0);
      else await speechController.locate(book, { chapterIndex: idx, paragraphIndex: 0, sentenceIndex: 0 });
    },
    [book, player.playing, persist],
  );

  const nextPage = useCallback(() => {
    if (flow) return;
    if (page < pages - 1) {
      setPage((p) => p + 1);
      return;
    }
    if (book && chapterIndex + 1 < book.chapters.length) void jumpChapter(chapterIndex + 1);
    else showHint('已经是最后一页');
  }, [flow, page, pages, book, chapterIndex, jumpChapter]);

  const prevPage = useCallback(() => {
    if (flow) return;
    if (page > 0) {
      setPage((p) => p - 1);
      return;
    }
    if (chapterIndex > 0) void jumpChapter(chapterIndex - 1);
    else showHint('已经是第一页');
  }, [flow, page, chapterIndex, jumpChapter]);

  /* ---------------------------- 点击分区 ---------------------------- */
  const onStageClick = (e: React.MouseEvent) => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    if (barsOpen) {
      setBarsOpen(false);
      return;
    }
    if (tocOpen || sheetOpen || listenOpen) return;
    const w = window.innerWidth;
    const x = e.clientX;
    if (!flow && x < w * 0.3) {
      prevPage();
      return;
    }
    if (!flow && x > w * 0.7) {
      nextPage();
      return;
    }
    setBarsOpen(true);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchStart.current;
    touchStart.current = null;
    if (!s || flow) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      swiped.current = true;
      if (dx < 0) nextPage();
      else prevPage();
      setTimeout(() => (swiped.current = false), 320);
    }
  };

  /* ---------------------------- 朗读 ---------------------------- */
  const startSpeak = async (pos?: SpeakPosition) => {
    if (!book) return;
    const target: SpeakPosition = pos ?? {
      chapterIndex,
      paragraphIndex: Math.max(0, player.chapterIndex === chapterIndex ? player.paragraphIndex : 0),
      sentenceIndex: player.chapterIndex === chapterIndex ? player.sentenceIndex : 0,
    };
    try {
      await speechController.start(book, target);
      setListenOpen(true);
    } catch (err) {
      onToast((err as Error).message);
    }
  };

  const isSpeakingHere = (player.playing || player.preparing) && player.bookId === bookId;
  const activePara = player.chapterIndex === chapterIndex ? player.paragraphIndex : -1;
  const activeSentence = player.chapterIndex === chapterIndex ? player.sentenceIndex : -1;

  // 朗读推进 → 翻到对应页
  useEffect(() => {
    if (flow || !isSpeakingHere) return;
    const el = activeSpanRef.current;
    const st = streamRef.current;
    if (!el || !st) return;
    const left = el.getBoundingClientRect().left - st.getBoundingClientRect().left;
    const target = Math.floor(left / window.innerWidth);
    if (target >= 0 && target < pages && target !== page) setPage(target);
  }, [activePara, activeSentence, isSpeakingHere, flow, pages, page]);

  // 朗读换章同步视图
  useEffect(() => {
    if (player.chapterIndex !== chapterIndex && player.bookId === bookId && isSpeakingHere) {
      setChapterIndex(player.chapterIndex);
      setPage(0);
    }
  }, [player.chapterIndex, player.bookId, bookId, isSpeakingHere, chapterIndex]);

  /* ---------------------------- 句子交互 ---------------------------- */
  const handleSentenceTap = (pi: number) => {
    if (!isSpeakingHere) return;
    void speechController.jumpToChapter(chapterIndex, pi);
  };

  const startLongPress = (pi: number, si: number) => {
    longPress.current = setTimeout(() => {
      longPress.current = null;
      navigator.vibrate?.(10);
      void startSpeak({ chapterIndex, paragraphIndex: pi, sentenceIndex: si });
    }, 480);
  };

  const cancelLongPress = () => {
    if (longPress.current) {
      clearTimeout(longPress.current);
      longPress.current = null;
    }
  };

  /* ---------------------------- 夜间 / 全屏 ---------------------------- */
  const toggleNight = () => {
    if (reader.theme === 'night') setReader({ theme: lastTheme.current });
    else {
      lastTheme.current = reader.theme;
      setReader({ theme: 'night' });
    }
  };

  const toggleImmersive = () => {
    const next = !reader.immersive;
    void setImmersive(next).then(() => setReader({ immersive: next }));
  };

  const handleBack = async () => {
    await speechController.pause();
    persist(chapterIndex, currentParagraph());
    onBack();
  };

  const openSheet = (from: 'type' | 'all') => {
    setSheetOpen(true);
    if (from === 'type') {
      requestAnimationFrame(() => {
        typeBlockRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    }
  };

  if (!book || !chapter) {
    return (
      <div className="rd" data-theme={reader.theme}>
        <div className="rd__stage" style={{ display: 'grid', placeItems: 'center' }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  const chapterPct = Math.round(
    ((chapterIndex + (pages > 1 ? page / pages : 0)) / book.chapters.length) * 100,
  );
  const dim = (1 - reader.brightness) * 0.72;
  const tocList = tocAsc ? book.chapters.map((c, i) => ({ c, i })) : book.chapters.map((c, i) => ({ c, i })).reverse();

  return (
    <div
      className={`rd${barsOpen ? ' bars-open' : ''}`}
      data-theme={reader.theme}
      style={
        {
          '--fs': `${reader.fontSize}px`,
          '--lh': String(reader.lineHeight),
          '--pad': `${reader.padding}px`,
          '--rd-font': fontStack,
          '--fw': String(reader.weight),
          '--pgap': `${reader.paragraphGap}em`,
          '--pg': page,
          '--dim': String(dim),
          '--turn': reader.pageMode === 'slide' ? '300ms' : '0ms',
        } as React.CSSProperties
      }
    >
      <div
        ref={stageRef}
        className="rd__stage"
        onClick={onStageClick}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          ref={streamRef}
          className={`rd__stream${reader.pageMode === 'none' ? ' rd__stream--none' : ''}${
            flow ? ' rd__stream--flow' : ''
          }`}
          onScroll={() => {
            if (flow) currentParagraph();
          }}
        >
          <h2 className="rd__h">{chapter.title}</h2>
          <div className="rd__text">
            {chapter.paragraphs.map((_, pi) => (
              <p key={pi} data-p={pi}>
                {sentences[pi]?.map((s, si) => {
                  // 只有真正在朗读时才高亮，否则一进书第一句就是亮的不合理
                  const active = isSpeakingHere && pi === activePara && si === activeSentence;
                  return (
                    <span
                      key={si}
                      ref={active ? activeSpanRef : undefined}
                      className={`sentence${active ? ' current' : ''}`}
                      onPointerDown={() => startLongPress(pi, si)}
                      onPointerUp={cancelLongPress}
                      onPointerMove={cancelLongPress}
                      onPointerCancel={cancelLongPress}
                      onClick={(e) => {
                        if (isSpeakingHere) {
                          e.stopPropagation();
                          handleSentenceTap(pi);
                        }
                      }}
                    >
                      {s}
                    </span>
                  );
                })}
              </p>
            ))}
          </div>
          <div className="rd__end">
            {chapterIndex + 1 >= book.chapters.length ? '— 全书完 —' : '— 本章完 —'}
          </div>
        </div>

        {/* 页脚：章节 + 页码 */}
        {!flow && (
          <div className="rd__foot">
            <span>{chapter.title}</span>
            <span>
              {page + 1}/{pages} · {chapterPct}%
            </span>
          </div>
        )}

        {hint && <div className="rd__hint">{hint}</div>}
        <div className="rd__dim" />
      </div>

      {/* 顶栏 */}
      <div className="rd__top">
        <button className="icon-btn" onClick={handleBack} aria-label="返回书架">
          <IconBack />
        </button>
        <div className="rd__bname">{book.title}</div>
        <button className="icon-btn" onClick={() => openSheet('all')} aria-label="更多">
          <IconMore />
        </button>
      </div>

      {/* 底栏 */}
      <div className="rd__bottom">
        <div className="rd__prog-top">
          <span>
            第 {chapterIndex + 1} 章 · {chapter.title}
          </span>
          <span>
            {flow ? `${chapterPct}%` : `${page + 1}/${pages} · ${chapterPct}%`}
          </span>
        </div>
        <div className="rd__prog">
          <button
            className="icon-btn"
            style={{ width: 30, height: 30 }}
            onClick={() => void jumpChapter(chapterIndex - 1)}
            disabled={chapterIndex === 0}
            aria-label="上一章"
          >
            <IconPrev size={15} />
          </button>
          <input
            type="range"
            min={1}
            max={book.chapters.length}
            value={chapterIndex + 1}
            onChange={(e) => void jumpChapter(Number(e.target.value) - 1)}
            aria-label="章节进度"
          />
          <button
            className="icon-btn"
            style={{ width: 30, height: 30 }}
            onClick={() => void jumpChapter(chapterIndex + 1)}
            disabled={chapterIndex + 1 >= book.chapters.length}
            aria-label="下一章"
          >
            <IconNext size={15} />
          </button>
        </div>

        <div className="rd__tools">
          <button className="rd__tool" onClick={() => setTocOpen(true)}>
            <IconList size={20} />
            目录
          </button>
          <button className={`rd__tool${reader.theme === 'night' ? ' on' : ''}`} onClick={toggleNight}>
            {reader.theme === 'night' ? <IconSun size={20} /> : <IconMoon size={20} />}
            夜间
          </button>
          <button className="rd__tool" onClick={() => openSheet('type')}>
            <IconType size={20} />
            字体
          </button>
          <button
            className={`rd__tool${isSpeakingHere ? ' on' : ''}`}
            onClick={() => {
              if (isSpeakingHere) setListenOpen(true);
              else void startSpeak();
            }}
          >
            <IconHeadphone size={20} />
            听书
          </button>
          <button className="rd__tool" onClick={() => openSheet('all')}>
            <IconMore size={20} />
            设置
          </button>
        </div>
      </div>

      {/* 阅读设置面板 */}
      {sheetOpen && (
        <>
          <div className="scrim" onClick={() => setSheetOpen(false)} />
          <div className="pset">
            <div className="pset__grip" />
            <div className="pset__row" style={{ borderBottom: 0, minHeight: 30 }}>
              <span style={{ fontSize: 12.5, color: 'var(--rd-sub)' }}>阅读设置</span>
              <button style={{ fontSize: 12.5, color: 'var(--rd-accent)' }} onClick={onOpenSettings}>
                更多设置 ›
              </button>
            </div>

            <div className="pset__row">
              <span className="pset__lab">背景</span>
              <div className="swatches">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    className={`swatch${reader.theme === t.id ? ' on' : ''}`}
                    style={{ background: t.bg, color: t.fg }}
                    onClick={() => setReader({ theme: t.id })}
                    aria-label={t.label}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pset__row">
              <span className="pset__lab">亮度</span>
              <input
                style={{ flex: 1, marginLeft: 16 }}
                type="range"
                min={0.4}
                max={1}
                step={0.02}
                value={reader.brightness}
                onChange={(e) => setReader({ brightness: Number(e.target.value) })}
              />
            </div>

            <div ref={typeBlockRef} className="pset__row">
              <span className="pset__lab">字号</span>
              <div className="stepper">
                <button
                  onClick={() => setReader({ fontSize: Math.max(14, reader.fontSize - 1) })}
                  disabled={reader.fontSize <= 14}
                >
                  A-
                </button>
                <span>{reader.fontSize}</span>
                <button
                  onClick={() => setReader({ fontSize: Math.min(30, reader.fontSize + 1) })}
                  disabled={reader.fontSize >= 30}
                >
                  A+
                </button>
              </div>
            </div>

            <div className="pset__row">
              <span className="pset__lab">行距</span>
              <input
                style={{ flex: 1, marginLeft: 16 }}
                type="range"
                min={1.3}
                max={2.6}
                step={0.05}
                value={reader.lineHeight}
                onChange={(e) => setReader({ lineHeight: Number(e.target.value) })}
              />
              <span className="pset__val">{reader.lineHeight.toFixed(2)}</span>
            </div>

            <div className="pset__row">
              <span className="pset__lab">段距</span>
              <input
                style={{ flex: 1, marginLeft: 16 }}
                type="range"
                min={0}
                max={1.6}
                step={0.05}
                value={reader.paragraphGap}
                onChange={(e) => setReader({ paragraphGap: Number(e.target.value) })}
              />
              <span className="pset__val">{reader.paragraphGap.toFixed(2)}</span>
            </div>

            <div className="pset__row">
              <span className="pset__lab">页边距</span>
              <input
                style={{ flex: 1, marginLeft: 16 }}
                type="range"
                min={12}
                max={40}
                step={1}
                value={reader.padding}
                onChange={(e) => setReader({ padding: Number(e.target.value) })}
              />
              <span className="pset__val">{reader.padding}</span>
            </div>

            <div className="pset__row">
              <span className="pset__lab">字重</span>
              <div className="segmented" style={{ width: 190 }}>
                {[
                  { v: 400, l: '常规' },
                  { v: 500, l: '中等' },
                  { v: 600, l: '加粗' },
                ].map((w) => (
                  <button
                    key={w.v}
                    className={reader.weight === w.v ? 'active' : ''}
                    onClick={() => setReader({ weight: w.v })}
                  >
                    {w.l}
                  </button>
                ))}
              </div>
            </div>

            <div className="pset__row">
              <span className="pset__lab">字体</span>
              <div className="segmented" style={{ flex: 1, marginLeft: 12 }}>
                {FONT_OPTIONS.slice(0, 4).map((f) => (
                  <button
                    key={f.id}
                    className={reader.fontFamily === f.id ? 'active' : ''}
                    onClick={() => setReader({ fontFamily: f.id, customFont: undefined })}
                    style={{ fontFamily: f.stack }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pset__row">
              <span className="pset__lab">翻页</span>
              <div className="segmented" style={{ width: 220 }}>
                {PAGE_MODES.map((m) => (
                  <button
                    key={m.id}
                    className={reader.pageMode === m.id ? 'active' : ''}
                    onClick={() => setReader({ pageMode: m.id })}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pset__row">
              <span className="pset__lab">全屏显示</span>
              <button
                className={`switch${reader.immersive ? ' on' : ''}`}
                onClick={toggleImmersive}
                aria-label="全屏显示"
              >
                <i />
              </button>
            </div>

            <button
              className="ghost-btn"
              style={{ marginTop: 10 }}
              onClick={() => {
                setSheetOpen(false);
                onOpenSettings();
              }}
            >
              {reader.immersive ? <IconCollapse size={15} /> : <IconExpand size={15} />}
              听书与语音引擎设置
            </button>
          </div>
        </>
      )}

      {/* 目录 */}
      {tocOpen && (
        <>
          <div className="scrim" onClick={() => setTocOpen(false)} />
          <div className="toc">
            <div className="toc__head">
              <span className="toc__title">目录</span>
              <span style={{ fontSize: 12, color: 'var(--rd-sub)' }}>共 {book.chapters.length} 章</span>
            </div>
            <div className="toc__tabs">
              <button className="toc__tab on">目录</button>
              <button className="toc__tab" onClick={() => setTocAsc((v) => !v)}>
                {tocAsc ? '正序' : '倒序'}
              </button>
            </div>
            <div className="toc__body">
              {tocList.map(({ c, i }) => (
                <button
                  key={c.id}
                  className={`toc__item${i === chapterIndex ? ' active' : ''}`}
                  onClick={() => void jumpChapter(i)}
                >
                  <span className="toc__idx">{i + 1}</span>
                  <span>{c.title}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* 听书面板 */}
      {listenOpen && (
        <>
          <div className="scrim" onClick={() => setListenOpen(false)} />
          <div className="listen">
            <div className="listen__badge">
              <IconHeadphone size={12} />
              {player.mode === 'native'
                ? '离线朗读 · 可后台'
                : player.mode === 'edge'
                  ? 'Edge 免费语音'
                  : player.mode === 'online'
                    ? '在线 AI 语音'
                    : '系统语音'}
            </div>
            <div className="listen__text">{player.currentText || '准备中…'}</div>
            <div className="listen__ctrls">
              <button
                className="listen__btn"
                onClick={() => void speechController.prevSentence()}
                aria-label="上一句"
              >
                <IconPrev size={20} />
              </button>
              <button
                className="listen__btn main"
                onClick={() => void speechController.toggle()}
                aria-label={player.playing ? '暂停' : '继续'}
              >
                {player.playing ? <IconPause size={24} /> : <IconPlay size={24} />}
              </button>
              <button
                className="listen__btn"
                onClick={() => void speechController.nextSentence()}
                aria-label="下一句"
              >
                <IconNext size={20} />
              </button>
            </div>
            <div className="listen__bar">
              <i style={{ width: `${chapterPct}%` }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
              <button style={{ fontSize: 12.5, color: 'var(--rd-sub)' }} onClick={() => setListenOpen(false)}>
                收起，继续看
              </button>
              <button style={{ fontSize: 12.5, color: 'var(--rd-accent)' }} onClick={onOpenSettings}>
                音色与语速 ›
              </button>
            </div>
            {player.error && <div className="listen__err">⚠︎ {player.error}</div>}
          </div>
        </>
      )}
    </div>
  );
}
