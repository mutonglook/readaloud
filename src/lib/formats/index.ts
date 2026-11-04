import type { BookFormat, Chapter } from '../../types';
import { decodeTextBuffer, parseTxt } from '../txt';
import { parseEpub } from '../epub';
import { parseHtml } from './html';
import { parseMarkdown } from './markdown';
import { parseDocx } from './docx';
import { parseFb2 } from './fb2';
import { parsePdf } from './pdf';

export interface ParsedBook {
  title: string;
  author?: string;
  cover?: string;
  format: BookFormat;
  chapters: Chapter[];
}

/** 支持的扩展名 → 内部格式名 */
const EXT_MAP: Record<string, BookFormat> = {
  txt: 'txt',
  text: 'txt',
  epub: 'epub',
  html: 'html',
  htm: 'html',
  xhtml: 'html',
  md: 'md',
  markdown: 'md',
  docx: 'docx',
  fb2: 'fb2',
  pdf: 'pdf',
};

export const SUPPORTED_EXTS = Object.keys(EXT_MAP);

/** 文件选择器的 accept，WebView 与系统文件管理器都认这个 */
export const ACCEPT_ATTR = [
  '.txt',
  '.text',
  '.epub',
  '.html',
  '.htm',
  '.xhtml',
  '.md',
  '.markdown',
  '.docx',
  '.fb2',
  '.pdf',
  'text/plain',
  'application/epub+zip',
  'text/html',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
].join(',');

/** 界面上展示的格式说明 */
export const FORMAT_HINT = 'TXT / EPUB / HTML / MD / DOCX / FB2 / PDF';

export function detectFormat(fileName: string): BookFormat | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MAP[ext] ?? null;
}

export function isSupported(fileName: string): boolean {
  return detectFormat(fileName) !== null;
}

export async function parseBookFile(
  file: File,
  onProgress?: (done: number, total: number, label?: string) => void,
): Promise<ParsedBook> {
  const format = detectFormat(file.name);
  if (!format) {
    throw new Error(`不支持这种格式：${file.name.split('.').pop() || '未知'}。目前能打开 ${FORMAT_HINT}`);
  }

  const name = file.name.replace(/\.[^.]+$/, '');
  const buffer = await file.arrayBuffer();

  switch (format) {
    case 'epub': {
      const parsed = await parseEpub(buffer);
      return {
        title: parsed.title || name,
        author: parsed.author,
        cover: parsed.cover,
        format,
        chapters: parsed.chapters,
      };
    }
    case 'html': {
      const parsed = parseHtml(buffer, name);
      return { ...parsed, format, chapters: parsed.chapters };
    }
    case 'md': {
      const parsed = parseMarkdown(buffer, name);
      return { ...parsed, format, chapters: parsed.chapters };
    }
    case 'docx': {
      const parsed = await parseDocx(buffer, name);
      return { ...parsed, format, chapters: parsed.chapters };
    }
    case 'fb2': {
      const parsed = parseFb2(buffer, name);
      return { ...parsed, format, chapters: parsed.chapters };
    }
    case 'pdf': {
      const parsed = await parsePdf(buffer, name, (done, total) =>
        onProgress?.(done, total, `正在提取第 ${done}/${total} 页`),
      );
      return { ...parsed, format, chapters: parsed.chapters };
    }
    case 'txt':
    default: {
      const text = decodeTextBuffer(buffer);
      const parsed = parseTxt(text, name);
      return { title: parsed.title || name, author: '佚名', format: 'txt', chapters: parsed.chapters };
    }
  }
}
