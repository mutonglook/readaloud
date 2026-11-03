import { create } from 'zustand';
import type { Book, BookMeta, ReadingProgress } from '../types';
import * as db from '../lib/db';
import { decodeTextBuffer, parseTxt } from '../lib/txt';
import { parseEpub } from '../lib/epub';
import { buildSampleBook } from '../lib/sample';

interface LibraryState {
  books: BookMeta[];
  progress: Record<string, ReadingProgress>;
  loading: boolean;
  importing: string | null;
  error: string | null;
  refresh: () => Promise<void>;
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

  refresh: async () => {
    set({ loading: true });
    const [books, list] = await Promise.all([db.listMeta(), db.listProgress()]);
    const progress: Record<string, ReadingProgress> = {};
    list.forEach((p) => (progress[p.bookId] = p));
    set({ books, progress, loading: false });
  },

  importFile: async (file) => {
    const name = file.name.replace(/\.[^.]+$/, '');
    const ext = file.name.split('.').pop()?.toLowerCase();
    set({ importing: file.name, error: null });
    try {
      const buffer = await file.arrayBuffer();
      let book: Book;

      if (ext === 'epub') {
        const parsed = await parseEpub(buffer);
        book = {
          id: crypto.randomUUID(),
          title: parsed.title || name,
          author: parsed.author,
          format: 'epub',
          cover: parsed.cover,
          chapters: parsed.chapters,
          totalChars: parsed.chapters.reduce((n, c) => n + c.paragraphs.join('').length, 0),
          addedAt: Date.now(),
        };
      } else if (ext === 'txt') {
        const text = decodeTextBuffer(buffer);
        const parsed = parseTxt(text, name);
        book = {
          id: crypto.randomUUID(),
          title: parsed.title || name,
          author: '佚名',
          format: 'txt',
          chapters: parsed.chapters,
          totalChars: parsed.chapters.reduce((n, c) => n + c.paragraphs.join('').length, 0),
          addedAt: Date.now(),
        };
      } else {
        throw new Error('只支持 .txt 和 .epub 格式');
      }

      if (book.totalChars < 10) throw new Error('文件内容为空或无法识别');

      await db.saveBook(book);
      await get().refresh();
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
    await db.deleteBook(id);
    await get().refresh();
  },

  loadBook: async (id) => db.getBook(id),

  saveReading: async (p) => {
    await db.saveProgress(p);
    await db.touchMeta(p.bookId, { lastReadAt: Date.now() });
    set((s) => ({ progress: { ...s.progress, [p.bookId]: p } }));
    // 书架排序依赖 lastReadAt，节流刷新
    scheduleRefresh(get().refresh);
  },

  importSample: async () => {
    const book = buildSampleBook();
    await db.saveBook(book);
    await get().refresh();
    return book;
  },
}));

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRefresh(fn: () => Promise<void>) {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void fn();
  }, 4000);
}

export const progressOf = (id: string, progress: Record<string, ReadingProgress>) => progress[id];
