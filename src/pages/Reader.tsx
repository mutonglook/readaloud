import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Book, SpeakPosition } from '../types';
import { useLibrary } from '../store/useLibrary';
import { useSettings } from '../store/useSettings';
import { splitSentences } from '../lib/splitter';
import { speechController } from '../lib/tts/controller';
import { usePlayerState } from '../hooks/usePlayerState';
import {
  IconBack,
  IconList,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconType,
} from '../components/Icons';

interface ReaderProps {
  bookId: string;
  onBack: () => void;
  onOpenSettings: () => void;
  onToast: (msg: string) => void;
}

export function Reader({ bookId, onBack, onOpenSettings, onToast }: ReaderProps) {
  const { loadBook, saveReading, progress } = useLibrary();
  const { reader, setReader, tts } = useSettings();
  const player = usePlayerState();

  const [book, setBook] = useState<Book | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [tocOpen, setTocOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeSpanRef = useRef<HTMLSpanElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 初始化：载入书籍并恢复到上次阅读位置
  useEffect(() => {
    let alive = true;
    void (async () => {
      const b = await loadBook(bookId);
      if (!alive || !b) return;
      setBook(b);
      const p = progress[bookId];
      const startChapter = p ? Math.min(p.chapterIndex, b.chapters.length - 1) : 0;
      setChapterIndex(startChapter);
      speechController.applySettings(tts);
      await speechController.locate(b, {
        chapterIndex: startChapter,
        paragraphIndex: p?.paragraphIndex ?? 0,
        sentenceIndex: 0,
      });
      // 恢复滚动位置到下段
      requestAnimationFrame(() => {
        if (p?.paragraphIndex) {
          const el = scrollRef.current?.querySelector<HTMLElement>(`[data-p="${p.paragraphIndex}"]`);
          el?.scrollIntoView({ block: 'center' });
        }
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

  // 段落 → 句子切分，只在换章时重算
  const sentences = useMemo(() => {
    if (!chapter) return [];
    return chapter.paragraphs.map((p) => splitSentences(p));
  }, [chapter]);

  const isSpeakingHere = player.playing || player.preparing;
  const activePara = player.chapterIndex === chapterIndex ? player.paragraphIndex : -1;
  const activeSentence = player.chapterIndex === chapterIndex ? player.sentenceIndex : -1;

  // 朗读推进时，把高亮句滚进视野
  useEffect(() => {
    if (!reader.autoScroll) return;
    const el = activeSpanRef.current;
    const scroller = scrollRef.current;
    if (!el || !scroller) return;
    const rect = el.getBoundingClientRect();
    const box = scroller.getBoundingClientRect();
    const outside = rect.top < box.top + 140 || rect.bottom > box.bottom - 180;
    if (outside) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activePara, activeSentence, reader.autoScroll]);

  // 朗读换章时同步视图
  useEffect(() => {
    if (player.chapterIndex !== chapterIndex && player.bookId === bookId && isSpeakingHere) {
      setChapterIndex(player.chapterIndex);
      scrollRef.current?.scrollTo({ top: 0 });
    }
  }, [player.chapterIndex, player.bookId, bookId, isSpeakingHere, chapterIndex]);

  const persist = useCallback(
    (ci: number, pi: number) => {
      if (!book) return;
      const total = book.chapters.length;
      const paraCount = book.chapters[ci]?.paragraphs.length ?? 1;
      const percent = Math.min(100, Math.round(((ci + Math.min(pi / paraCount, 1)) / total) * 100));
      void saveReading({
        bookId,
        chapterIndex: ci,
        paragraphIndex: pi,
        percent,
        updatedAt: Date.now(),
      });
    },
    [book, bookId, saveReading],
  );

  // 滚动时记录阅读位置（节流）
  const handleScroll = () => {
    if (!scrollRef.current || !book) return;
    if (saveTimer.current) return;
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const scroller = scrollRef.current;
      if (!scroller) return;
      const anchor = scroller.getBoundingClientRect().top + 150;
      const paras = scroller.querySelectorAll<HTMLElement>('[data-p]');
      let pi = 0;
      for (const el of Array.from(paras)) {
        if (el.getBoundingClientRect().top <= anchor) pi = Number(el.dataset.p ?? 0);
        else break;
      }
      persist(chapterIndex, pi);
    }, 1200);
  };

  const jumpChapter = async (idx: number) => {
    if (!book || idx < 0 || idx >= book.chapters.length) return;
    setChapterIndex(idx);
    setTocOpen(false);
    scrollRef.current?.scrollTo({ top: 0 });
    persist(idx, 0);
    if (player.playing) {
      await speechController.jumpToChapter(idx, 0);
    } else {
      await speechController.locate(book, { chapterIndex: idx, paragraphIndex: 0, sentenceIndex: 0 });
    }
  };

  const startSpeak = async (pos?: SpeakPosition) => {
    if (!book) return;
    const target: SpeakPosition = pos ?? {
      chapterIndex,
      paragraphIndex: Math.max(0, player.chapterIndex === chapterIndex ? player.paragraphIndex : 0),
      sentenceIndex: player.chapterIndex === chapterIndex ? player.sentenceIndex : 0,
    };
    try {
      await speechController.start(book, target);
    } catch (err) {
      onToast((err as Error).message);
    }
  };

  const handleSentenceTap = (pi: number, si: number) => {
    if (player.chapterIndex === chapterIndex && player.paragraphIndex === pi && player.sentenceIndex === si) {
      void speechController.toggle();
      return;
    }
    void startSpeak({ chapterIndex, paragraphIndex: pi, sentenceIndex: si });
  };

  const handleBack = async () => {
    await speechController.pause();
    persist(chapterIndex, Math.max(0, activePara > 0 ? activePara : 0));
    onBack();
  };

  if (!book || !chapter) {
    return (
      <div className="reader">
        <div className="reader__scroll" style={{ display: 'grid', placeItems: 'center' }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  const chapterPct = Math.round(((chapterIndex + (activePara > 0 ? activePara / chapter.paragraphs.length : 0)) / book.chapters.length) * 100);

  return (
    <div className="reader">
      <div className="reader__topbar">
        <button className="icon-btn" onClick={handleBack} aria-label="返回书架">
          <IconBack />
        </button>
        <div className="reader__chapter-name">{book.title}</div>
        <button className="icon-btn" onClick={() => setTocOpen(true)} aria-label="目录">
          <IconList />
        </button>
      </div>

      <div
        ref={scrollRef}
        className="reader__scroll"
        onScroll={handleScroll}
        style={{
          ['--reader-font-size' as string]: `${reader.fontSize}px`,
          ['--reader-line-height' as string]: String(reader.lineHeight),
          ['--reader-padding' as string]: `${reader.padding}px`,
          ['--reader-font' as string]: reader.fontFamily === 'serif' ? 'var(--font-serif)' : 'var(--font-sans)',
        }}
      >
        <div className="reader__inner">
          <h2 className="chapter-title">{chapter.title}</h2>
          <div className="reader__text">
            {chapter.paragraphs.map((_, pi) => (
              <p key={pi} data-p={pi}>
                {sentences[pi]?.map((s, si) => {
                  const active = pi === activePara && si === activeSentence;
                  return (
                    <span
                      key={si}
                      ref={active ? activeSpanRef : undefined}
                      className={`sentence${active ? ' active current' : ''}`}
                      onClick={() => handleSentenceTap(pi, si)}
                    >
                      {s}
                    </span>
                  );
                })}
              </p>
            ))}
          </div>
          <div className="reader__end">
            {chapterIndex + 1 >= book.chapters.length ? '— 全书完 —' : '— 本章完 —'}
          </div>
        </div>
      </div>

      {/* 朗读悬浮条 */}
      {isSpeakingHere && player.bookId === bookId && (
        <div className="player-bar">
          <div className="player-bar__head">
            <span className="player-bar__badge">
              {player.mode === 'native' ? '后台朗读' : player.mode === 'online' ? 'AI 语音' : '系统语音'}
            </span>
            <span className="player-bar__text">{player.currentText || '准备中…'}</span>
          </div>
          <div className="player-bar__controls">
            <button className="icon-btn" onClick={() => void speechController.prevSentence()} aria-label="上一句">
              <IconPrev />
            </button>
            <button
              className="icon-btn primary"
              onClick={() => void speechController.toggle()}
              aria-label={player.playing ? '暂停' : '继续'}
            >
              {player.playing ? <IconPause size={24} /> : <IconPlay size={24} />}
            </button>
            <button className="icon-btn" onClick={() => void speechController.nextSentence()} aria-label="下一句">
              <IconNext />
            </button>
          </div>
          <div className="player-bar__progress">
            <i style={{ width: `${chapterPct}%` }} />
          </div>
          {player.error && <div className="player-bar__error">⚠︎ {player.error}</div>}
        </div>
      )}

      {/* 底部工具条 */}
      <div className="reader__bottom">
        <button className="icon-btn" onClick={() => jumpChapter(chapterIndex - 1)} disabled={chapterIndex === 0} aria-label="上一章">
          <IconPrev size={18} />
        </button>
        <div className="reader__slider-wrap">
          <span>{chapterIndex + 1}</span>
          <input
            type="range"
            min={1}
            max={book.chapters.length}
            value={chapterIndex + 1}
            onChange={(e) => jumpChapter(Number(e.target.value) - 1)}
          />
          <span>{book.chapters.length}</span>
        </div>
        <button
          className="icon-btn"
          onClick={() => jumpChapter(chapterIndex + 1)}
          disabled={chapterIndex + 1 >= book.chapters.length}
          aria-label="下一章"
        >
          <IconNext size={18} />
        </button>
        <button className="icon-btn" onClick={() => setTypeOpen(true)} aria-label="排版">
          <IconType />
        </button>
        <button
          className="icon-btn primary"
          style={{ width: 44, height: 44 }}
          onClick={() => (isSpeakingHere && player.bookId === bookId ? void speechController.toggle() : void startSpeak())}
          aria-label={isSpeakingHere && player.playing ? '暂停朗读' : '开始朗读'}
        >
          {isSpeakingHere && player.playing ? <IconPause size={20} /> : <IconPlay size={20} />}
        </button>
      </div>

      {/* 目录抽屉 */}
      {tocOpen && (
        <>
          <div className="scrim" onClick={() => setTocOpen(false)} />
          <div className="drawer">
            <div className="drawer__grip" />
            <div className="drawer__head">
              <span className="drawer__title">目录</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{book.chapters.length} 章</span>
            </div>
            <div className="drawer__body">
              {book.chapters.map((c, i) => (
                <button
                  key={c.id}
                  className={`toc-item${i === chapterIndex ? ' active' : ''}`}
                  onClick={() => jumpChapter(i)}
                >
                  <span className="toc-item__idx">{i + 1}</span>
                  <span>{c.title}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* 排版抽屉 */}
      {typeOpen && (
        <>
          <div className="scrim" onClick={() => setTypeOpen(false)} />
          <div className="drawer">
            <div className="drawer__grip" />
            <div className="drawer__head">
              <span className="drawer__title">阅读排版</span>
              <button style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 600 }} onClick={onOpenSettings}>
                更多设置
              </button>
            </div>
            <div className="drawer__body" style={{ padding: '16px 20px 8px' }}>
              <div className="theme-row">
                {(
                  [
                    { id: 'paper', label: '纸质', bg: '#f6f1e7', fg: '#33302b' },
                    { id: 'eye', label: '护眼', bg: '#cfe6cf', fg: '#26382a' },
                    { id: 'parchment', label: '羊皮', bg: '#e8d9bd', fg: '#453322' },
                    { id: 'night', label: '夜间', bg: '#14140f', fg: '#b9b4a8' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    className={`theme-dot${reader.theme === t.id ? ' active' : ''}`}
                    onClick={() => setReader({ theme: t.id })}
                  >
                    <span className="theme-dot__swatch" style={{ background: t.bg, color: t.fg }}>
                      文
                    </span>
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="field">
                <div className="field__label">
                  <span>字号</span>
                  <span className="field__value">{reader.fontSize}px</span>
                </div>
                <input
                  type="range"
                  min={14}
                  max={30}
                  step={1}
                  value={reader.fontSize}
                  onChange={(e) => setReader({ fontSize: Number(e.target.value) })}
                />
              </div>

              <div className="field">
                <div className="field__label">
                  <span>行距</span>
                  <span className="field__value">{reader.lineHeight.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={1.4}
                  max={2.6}
                  step={0.1}
                  value={reader.lineHeight}
                  onChange={(e) => setReader({ lineHeight: Number(e.target.value) })}
                />
              </div>

              <div className="field">
                <div className="field__label">
                  <span>页边距</span>
                  <span className="field__value">{reader.padding}px</span>
                </div>
                <input
                  type="range"
                  min={12}
                  max={44}
                  step={2}
                  value={reader.padding}
                  onChange={(e) => setReader({ padding: Number(e.target.value) })}
                />
              </div>

              <div className="segmented" style={{ marginBottom: 20 }}>
                <button className={reader.fontFamily === 'serif' ? 'active' : ''} onClick={() => setReader({ fontFamily: 'serif' })}>
                  宋体
                </button>
                <button className={reader.fontFamily === 'sans' ? 'active' : ''} onClick={() => setReader({ fontFamily: 'sans' })}>
                  黑体
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
