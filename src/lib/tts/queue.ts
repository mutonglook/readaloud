import type { Book, SpeakPosition } from '../../types';
import { splitSentences } from '../splitter';

/** 朗读队列中的一条：可唯一定位到某句 */
export interface Utterance extends SpeakPosition {
  text: string;
}

/** 把一章拆成句子队列 */
export function buildChapterQueue(book: Book, chapterIndex: number): Utterance[] {
  const chapter = book.chapters[chapterIndex];
  if (!chapter) return [];
  const list: Utterance[] = [];
  chapter.paragraphs.forEach((para, paragraphIndex) => {
    splitSentences(para).forEach((text, sentenceIndex) => {
      list.push({ chapterIndex, paragraphIndex, sentenceIndex, text });
    });
  });
  return list;
}

export function positionToIndex(queue: Utterance[], pos: SpeakPosition): number {
  const idx = queue.findIndex(
    (u) =>
      u.chapterIndex === pos.chapterIndex &&
      u.paragraphIndex === pos.paragraphIndex &&
      u.sentenceIndex === pos.sentenceIndex,
  );
  return idx < 0 ? 0 : idx;
}

export function samePosition(a: SpeakPosition | null, b: SpeakPosition | null): boolean {
  if (!a || !b) return false;
  return (
    a.chapterIndex === b.chapterIndex && a.paragraphIndex === b.paragraphIndex && a.sentenceIndex === b.sentenceIndex
  );
}

/** 章节进度百分比，用于书架卡片与跳转 */
export function chapterPercent(chapterIndex: number, paragraphIndex: number, totalParagraphs: number, totalChapters: number): number {
  if (totalChapters <= 0) return 0;
  const inChapter = totalParagraphs > 0 ? Math.min(paragraphIndex / totalParagraphs, 1) : 0;
  return Math.min(100, Math.round(((chapterIndex + inChapter) / totalChapters) * 100));
}
