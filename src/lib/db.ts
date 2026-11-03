import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Book, BookMeta, ReadingProgress } from '../types';

interface ReaderDB extends DBSchema {
  books: { key: string; value: Book };
  meta: { key: string; value: BookMeta };
  progress: { key: string; value: ReadingProgress };
}

const DB_NAME = 'readaloud-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ReaderDB>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<ReaderDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('books')) database.createObjectStore('books', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta', { keyPath: 'id' });
        if (!database.objectStoreNames.contains('progress')) database.createObjectStore('progress', { keyPath: 'bookId' });
      },
    });
  }
  return dbPromise;
}

export async function saveBook(book: Book): Promise<BookMeta> {
  const database = await db();
  const tx = database.transaction(['books', 'meta'], 'readwrite');
  await tx.objectStore('books').put(book);
  const meta: BookMeta = {
    id: book.id,
    title: book.title,
    author: book.author,
    format: book.format,
    cover: book.cover,
    chapterCount: book.chapters.length,
    totalChars: book.totalChars,
    addedAt: book.addedAt,
  };
  await tx.objectStore('meta').put(meta);
  await tx.done;
  return meta;
}

export async function getBook(id: string): Promise<Book | undefined> {
  return (await db()).get('books', id);
}

export async function listMeta(): Promise<BookMeta[]> {
  const all = await (await db()).getAll('meta');
  return all.sort((a, b) => (b.lastReadAt ?? b.addedAt) - (a.lastReadAt ?? a.addedAt));
}

export async function deleteBook(id: string): Promise<void> {
  const database = await db();
  const tx = database.transaction(['books', 'meta', 'progress'], 'readwrite');
  await tx.objectStore('books').delete(id);
  await tx.objectStore('meta').delete(id);
  await tx.objectStore('progress').delete(id);
  await tx.done;
}

export async function touchMeta(id: string, patch: Partial<BookMeta>): Promise<void> {
  const database = await db();
  const tx = database.transaction('meta', 'readwrite');
  const cur = await tx.store.get(id);
  if (cur) await tx.store.put({ ...cur, ...patch });
  await tx.done;
}

export async function saveProgress(progress: ReadingProgress): Promise<void> {
  await (await db()).put('progress', progress);
}

export async function getProgress(bookId: string): Promise<ReadingProgress | undefined> {
  return (await db()).get('progress', bookId);
}

export async function listProgress(): Promise<ReadingProgress[]> {
  return (await db()).getAll('progress');
}

export async function putProgressBatch(items: ReadingProgress[]): Promise<void> {
  const database = await db();
  const tx = database.transaction('progress', 'readwrite');
  for (const item of items) await tx.store.put(item);
  await tx.done;
}

/** 统计占用空间，用于设置页展示 */
export async function estimateStorage(): Promise<{ usage: number; quota: number }> {
  if (!navigator.storage?.estimate) return { usage: 0, quota: 0 };
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota };
}
