import type { Chapter } from '../../types';
import { decodeTextBuffer } from '../txt';

/** 去掉 Markdown 的行内标记，只留可读文字 */
function cleanInline(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // 图片
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // 链接
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1') // 行内代码
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
    .replace(/(^|[^_])_([^_\n]+)_/g, '$1$2')
    .replace(/<[^>]+>/g, '') // 内嵌 HTML
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseMarkdown(buffer: ArrayBuffer, fallbackTitle: string): {
  title: string;
  author?: string;
  chapters: Chapter[];
} {
  const text = decodeTextBuffer(buffer).replace(/\r\n?/g, '\n');
  const lines = text.split('\n');

  let title = fallbackTitle;
  let author: string | undefined;
  const chapters: Chapter[] = [];
  let current = { title: '正文', paragraphs: [] as string[] };
  let buf: string[] = [];
  // 代码块里的内容不当正文
  let inCode = false;

  const flush = () => {
    const t = cleanInline(buf.join(' '));
    if (t) current.paragraphs.push(t);
    buf = [];
  };

  const close = () => {
    flush();
    const paragraphs = current.paragraphs.filter((p) => p.trim().length > 0);
    if (paragraphs.length > 0) {
      chapters.push({ id: `c${chapters.length}`, title: current.title, paragraphs });
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (/^```/.test(line.trim())) {
      flush();
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;

    // 一级标题当书名（只在正文开始前生效）
    const h1 = /^#\s+(.*)$/.exec(line);
    if (h1) {
      const t = cleanInline(h1[1]);
      if (chapters.length === 0 && current.paragraphs.length === 0 && title === fallbackTitle) {
        title = t || title;
      } else {
        close();
        current = { title: t || '正文', paragraphs: [] };
      }
      continue;
    }

    const h = /^(#{2,4})\s+(.*)$/.exec(line);
    if (h) {
      close();
      current = { title: cleanInline(h[2]) || '正文', paragraphs: [] };
      continue;
    }

    // 引用、列表、分割线
    if (/^\s*>\s?/.test(line)) {
      buf.push(line.replace(/^\s*>\s?/, ''));
      continue;
    }
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      flush();
      buf.push(line.replace(/^\s*([-*+]|\d+\.)\s+/, ''));
      flush();
      continue;
    }
    if (/^\s*([-*_]\s*){3,}$/.test(line)) {
      flush();
      continue;
    }
    if (line.trim() === '') {
      flush();
      continue;
    }

    // 文首的「作者：xxx」
    const by = /^(?:作者|作\s*者|Author)[:：]\s*(.+)$/i.exec(line.trim());
    if (by && !author && chapters.length === 0) {
      author = cleanInline(by[1]);
      continue;
    }

    buf.push(line);
  }
  close();

  if (chapters.length === 0) {
    chapters.push({ id: 'c0', title: '正文', paragraphs: ['这个 Markdown 文件里没有可读的正文。'] });
  }

  return { title, author, chapters };
}
