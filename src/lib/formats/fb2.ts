import type { Chapter } from '../../types';
import { decodeTextBuffer } from '../txt';

/** FB2 是 XML 电子书格式，俄罗斯来源的老书很多是它 */
export function parseFb2(buffer: ArrayBuffer, fallbackTitle: string): {
  title: string;
  author?: string;
  chapters: Chapter[];
} {
  const raw = decodeTextBuffer(buffer);
  const doc = new DOMParser().parseFromString(raw, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('FB2 文件解析失败，文件可能已损坏');
  }

  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  const titleInfo = doc.querySelector('description > title-info');
  const title = text(titleInfo?.querySelector('book-title') ?? null) || fallbackTitle;
  const firstName = text(titleInfo?.querySelector('author > first-name') ?? null);
  const lastName = text(titleInfo?.querySelector('author > last-name') ?? null);
  const author = `${firstName} ${lastName}`.trim() || undefined;

  const chapters: Chapter[] = [];

  const pushSection = (section: Element) => {
    const heading = text(section.querySelector(':scope > title'));
    const paragraphs: string[] = [];
    for (const p of Array.from(section.querySelectorAll(':scope > p'))) {
      const t = text(p);
      if (t) paragraphs.push(t);
    }
    // 子章节单独成章
    const children = Array.from(section.querySelectorAll(':scope > section'));
    if (paragraphs.length > 0) {
      chapters.push({
        id: `c${chapters.length}`,
        title: heading || `第 ${chapters.length + 1} 节`,
        paragraphs,
      });
    }
    children.forEach(pushSection);
  };

  const bodies = Array.from(doc.querySelectorAll('body'));
  for (const body of bodies) {
    const top = Array.from(body.querySelectorAll(':scope > section'));
    if (top.length > 0) {
      top.forEach(pushSection);
    } else {
      const paragraphs = Array.from(body.querySelectorAll('p'))
        .map((p) => text(p))
        .filter(Boolean);
      if (paragraphs.length > 0) {
        chapters.push({ id: `c${chapters.length}`, title: '正文', paragraphs });
      }
    }
  }

  if (chapters.length === 0) {
    chapters.push({ id: 'c0', title: '正文', paragraphs: ['这个 FB2 文件里没有可读的正文。'] });
  }

  return { title, author, chapters };
}
