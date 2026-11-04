import { create } from 'zustand';
import type { Book, BookMeta, ReadingProgress } from '../types';
import * as db from '../lib/db';
import { parseBookFile } from '../lib/formats';
import { buildSampleBook } from '../lib/sample';
import { useSettings } from './useSettings';
import { pushShelf } from '../lib/sync';

interface LibraryState {
  books: BookMeta[];
  progress: Record<string, ReadingProgress>;
  loading: boolean;
  importing: string | null;
  error: string | null;
  refresh: (silent?: boolean) => Promise<void>;
  importFile: (file: File) => Promise<Book | null>;
  importMany: (files: File[]) => Promise<number>;
  remove: (id: string) => Promise<void>;
  loadBook: (id: string) => Promise<Book | undefined>;
  saveReading: (p: ReadingProgress) => Promise<void>;
  importSample: () => Promise<Book>;
}

export const useLibrary = create<LibraryState>()((set, get) => ({
  books: [],
  progress: {},
  loading: false,
  importing: null,
  error: null,

  refresh: async (silent = false) => {
    // silent 用于数据变更后的静默刷新：不闪 loading，界面直接换数据
    if (!silent) set({ loading: true });
    const [books, list] = await Promise.all([db.listMeta(), db.listProgress()]);
    const progress: Record<string, ReadingProgress> = {};
    list.forEach((p) => (progress[p.bookId] = p));
    set({ books, progress, loading: false });
  },

  importFile: async (file) => {
    set({ importing: file.name, error: null });
    try {
      // 格式识别与解析统一交给 lib/formats，TXT / EPUB / HTML / MD / DOCX / FB2 / PDF 都走这里
      const parsed = await parseBookFile(file);
      const book: Book = {
        id: crypto.randomUUID(),
        title: parsed.title,
        author: parsed.author || '佚名',
        format: parsed.format,
        cover: parsed.cover,
        chapters: parsed.chapters,
        totalChars: parsed.chapters.reduce((n, c) => n + c.paragraphs.join('').length, 0),
        addedAt: Date.now(),
      };

      if (book.totalChars < 10) throw new Error('文件内容为空或无法识别');

      await db.saveBook(book);
      await get().refresh(true);
      set({ importing: null });
      return book;
    } catch (err) {
      set({ importing: null, error: (err as Error).message });
      return null;
    }
  },

  importMany: async (files) => {
    let ok = 0;
    for (const f of files) {
      const book = await get().importFile(f);
      if (book) ok++;
    }
    return ok;
  },

  remove: async (id) => {
    // 先从界面移除，再落库：点击后立刻消失，不等 IO
    set((s) => {
      const progress = { ...s.progress };
      delete progress[id];
      return { books: s.books.filter((b) => b.id !== id), progress };
    });
    await db.deleteBook(id);
    await get().refresh(true);
  },

  loadBook: async (id) => db.getBook(id),

  saveReading: async (p) => {
    await db.saveProgress(p);
    await db.touchMeta(p.bookId, { lastReadAt: Date.now() });
    set((s) => ({ progress: { ...s.progress, [p.bookId]: p } }));
    // 书架排序依赖 lastReadAt，节流刷新
    scheduleRefresh(get().refresh);
    scheduleAutoSync();
  },

  importSample: async () => {
    const book = buildSampleBook();
    await db.saveBook(book);
    await get().refresh(true);
    return book;
  },
}));

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRefresh(fn: () => Promise<void>) {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void fn();
  }, 800);
}

export const progressOf = (id: string, progress: Record<string, ReadingProgress>) => progress[id];

/* ------------------------ 后台自动云同步 ------------------------ */

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let lastAutoSync = 0;
const AUTO_SYNC_MIN_GAP = 3 * 60 * 1000;

/**
 * 进度变了就排一次上传，但最多 3 分钟一次。
 * 只传书单和进度（很小），失败静默——不能让网络问题打断阅读。
 */
function scheduleAutoSync() {
  const sync = useSettings.getState().sync;
  if (sync.provider !== 'webdav' || !sync.auto || !sync.url || !sync.account) return;
  if (syncTimer) return;
  syncTimer = setTimeout(() => {
    syncTimer = null;
    if (Date.now() - lastAutoSync < AUTO_SYNC_MIN_GAP) return;
    lastAutoSync = Date.now();
    const cur = useSettings.getState();
    void pushShelf(
      { url: cur.sync.url, account: cur.sync.account, password: cur.sync.password },
      cur.reader,
    )
      .then(() => useSettings.getState().setSync({ lastSyncAt: Date.now() }))
      .catch(() => undefined);
  }, 8000);
}
