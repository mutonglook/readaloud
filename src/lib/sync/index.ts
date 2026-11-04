import type { Book, BookMeta, ReadingProgress, ReaderSettings } from '../../types';
import * as db from '../db';
import { DavConfig, ensureDir, getText, listDir, putText } from './webdav';

/**
 * 云同步的数据模型：
 *   readaloud/shelf.json      —— 书单 + 阅读进度 + 阅读设置（很小，每次都传）
 *   readaloud/books/<id>.json —— 单本书的正文（大，按需上传/下载）
 *
 * 拆开的原因：只同步进度时不该重传整本书；而书籍正文动辄几 MB，
 * 一次全传会让「同步一下」变成几分钟的事。
 */

const ROOT = 'readaloud';
const BOOKS_DIR = `${ROOT}/books`;
const SHELF = `${ROOT}/shelf.json`;

export interface SyncBundle {
  v: 1;
  exportedAt: number;
  books: BookMeta[];
  progress: ReadingProgress[];
  reader?: Partial<ReaderSettings>;
}

export interface SyncSummary {
  uploadedBooks: number;
  remoteBooks: string[];
  appliedProgress: number;
  downloadedBooks: number;
  at: number;
}

export async function pushShelf(cfg: DavConfig, reader?: ReaderSettings): Promise<SyncBundle> {
  const [books, progress] = await Promise.all([db.listMeta(), db.listProgress()]);
  const bundle: SyncBundle = {
    v: 1,
    exportedAt: Date.now(),
    books,
    progress,
    reader: reader
      ? {
          theme: reader.theme,
          fontSize: reader.fontSize,
          lineHeight: reader.lineHeight,
          paragraphGap: reader.paragraphGap,
          weight: reader.weight,
          fontFamily: reader.fontFamily,
          fontPack: reader.fontPack,
          padding: reader.padding,
          pageMode: reader.pageMode,
        }
      : undefined,
  };
  await ensureDir(cfg, ROOT);
  await putText(cfg, SHELF, JSON.stringify(bundle));
  return bundle;
}

export async function pullShelf(cfg: DavConfig): Promise<SyncBundle | null> {
  const text = await getText(cfg, SHELF);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as SyncBundle;
    if (!parsed || parsed.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 上传单本书的正文 */
export async function uploadBook(cfg: DavConfig, bookId: string): Promise<void> {
  const book = await db.getBook(bookId);
  if (!book) throw new Error('本地找不到这本书');
  await ensureDir(cfg, BOOKS_DIR);
  await putText(cfg, `${BOOKS_DIR}/${bookId}.json`, JSON.stringify(book));
}

export async function downloadBook(cfg: DavConfig, bookId: string): Promise<Book | null> {
  const text = await getText(cfg, `${BOOKS_DIR}/${bookId}.json`);
  if (!text) return null;
  const book = JSON.parse(text) as Book;
  if (!book?.id || !Array.isArray(book.chapters)) return null;
  await db.saveBook(book);
  return book;
}

export async function listCloudBooks(cfg: DavConfig): Promise<string[]> {
  const names = await listDir(cfg, BOOKS_DIR);
  return names.filter((n) => n.endsWith('.json')).map((n) => n.replace(/\.json$/, ''));
}

/**
 * 一键同步：
 *  1. 上传本地书单 + 进度
 *  2. 拉回云端书单，进度按 updatedAt 取新的（不会用旧进度覆盖新进度）
 *  3. 云端有、本地没有的书：下载正文补回来
 */
export async function syncNow(
  cfg: DavConfig,
  reader: ReaderSettings | undefined,
  onStep?: (msg: string) => void,
): Promise<SyncSummary> {
  onStep?.('上传书单与进度…');
  const localProgress = await db.listProgress();
  const localMeta = await db.listMeta();
  await pushShelf(cfg, reader);

  onStep?.('读取云端书单…');
  const remote = await pullShelf(cfg);

  let appliedProgress = 0;
  if (remote) {
    const byId = new Map(localProgress.map((p) => [p.bookId, p]));
    const merge: ReadingProgress[] = [];
    for (const rp of remote.progress) {
      const lp = byId.get(rp.bookId);
      // 只有云端更新才采纳，避免把刚读的进度冲掉
      if (!lp || (rp.updatedAt ?? 0) > (lp.updatedAt ?? 0)) {
        merge.push(rp);
        appliedProgress++;
      }
    }
    if (merge.length) await db.putProgressBatch(merge);
  }

  onStep?.('比对云端书籍…');
  const cloudIds = new Set(await listCloudBooks(cfg));
  const localIds = new Set(localMeta.map((m) => m.id));
  const missing = [...cloudIds].filter((id) => !localIds.has(id));

  // 本地有、云端没有的，顺手补传，这样一台设备传过之后另一台就能拿到
  let uploaded = 0;
  for (const m of localMeta) {
    if (!cloudIds.has(m.id)) {
      try {
        await uploadBook(cfg, m.id);
        uploaded++;
      } catch {
        /* 单本失败不阻断整体同步 */
      }
    }
  }

  let downloaded = 0;
  for (const id of missing) {
    try {
      if (await downloadBook(cfg, id)) downloaded++;
    } catch {
      /* 同上 */
    }
  }

  return {
    uploadedBooks: uploaded,
    remoteBooks: [...cloudIds],
    appliedProgress,
    downloadedBooks: downloaded,
    at: Date.now(),
  };
}

/** 把本地所有书一次性传到云端（首次使用时的初始化） */
export async function uploadAllBooks(
  cfg: DavConfig,
  onProgress?: (done: number, total: number, title: string) => void,
): Promise<number> {
  const metas = await db.listMeta();
  let done = 0;
  for (const m of metas) {
    onProgress?.(done, metas.length, m.title);
    try {
      await uploadBook(cfg, m.id);
      done++;
    } catch {
      /* 跳过失败的书 */
    }
  }
  return done;
}
