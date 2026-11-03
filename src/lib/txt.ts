import type { Chapter } from '../types';
import { cleanTitle } from './splitter';

/** 章节标题正则：覆盖常见中文网文与出版物写法 */
const HEADING_RE =
  /^\s{0,6}(?:第\s*[0-9零一二三四五六七八九十百千万两]+\s*[章节回卷篇部集话]|序章|序言|楔子|引子|前言|后记|尾声|终章|番外|Chapter\s+\d+|CHAPTER\s+\d+)[^\n]{0,40}$/;

const MAX_CHAPTER_CHARS = 12000;

/**
 * 解码 TXT：先按 UTF-8 试，出现大量替换符则回退 GBK。
 * 中文老书源大量是 GBK，必须处理。
 */
export function decodeTextBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);

  // BOM 优先
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }

  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const bad = (utf8.match(/\uFFFD/g) || []).length;
  if (bad > 0 && bad / Math.max(utf8.length, 1) > 0.002) {
    try {
      return new TextDecoder('gbk').decode(bytes);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

export function parseTxt(raw: string, fallbackTitle: string): { title: string; chapters: Chapter[] } {
  const text = raw.replace(/\r\n?/g, '\n').trim();
  const lines = text.split('\n');

  // 抽出章节切点
  const marks: { line: number; title: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length > 0 && line.length <= 50 && HEADING_RE.test(line)) {
      // 标题前后需要有空行或位于开头，避免正文里误命中
      const prevBlank = i === 0 || lines[i - 1].trim() === '';
      if (prevBlank || marks.length === 0) marks.push({ line: i, title: cleanTitle(line) });
    }
  }

  const chapters: Chapter[] = [];

  if (marks.length === 0) {
    // 无章节标记：按段落数均分
    const paras = toParagraphs(lines);
    chapters.push(...sliceByCharCount(paras, '正文'));
  } else {
    // 第一个章节标记之前的内容作为“前言”
    if (marks[0].line > 0) {
      const head = toParagraphs(lines.slice(0, marks[0].line));
      if (head.join('').trim().length > 0) {
        chapters.push({ id: 'c0', title: '开篇', paragraphs: head });
      }
    }
    for (let m = 0; m < marks.length; m++) {
      const start = marks[m].line + 1;
      const end = m + 1 < marks.length ? marks[m + 1].line : lines.length;
      const body = toParagraphs(lines.slice(start, end));
      const pieces = sliceByCharCount(body, marks[m].title);
      pieces.forEach((p) => chapters.push(p));
    }
  }

  if (chapters.length === 0) {
    chapters.push({ id: 'c0', title: '正文', paragraphs: toParagraphs(lines) });
  }

  // 重新编号 id，保证唯一
  chapters.forEach((c, i) => (c.id = `c${i}`));

  const title = guessBookTitle(lines, fallbackTitle);
  return { title, chapters };
}

function toParagraphs(lines: string[]): string[] {
  const out: string[] = [];
  let buf = '';
  for (const raw of lines) {
    const line = raw.replace(/^[\s\u3000]+|[\s\u3000]+$/g, '');
    if (!line) {
      if (buf) {
        out.push(buf);
        buf = '';
      }
      continue;
    }
    // 以缩进开头视为新段落
    if (/^[\u3000]{2}/.test(raw) && buf) {
      out.push(buf);
      buf = line;
    } else {
      buf = buf ? buf + line : line;
    }
  }
  if (buf) out.push(buf);
  return out.filter((p) => p.trim().length > 0);
}

/** 单章过长时再切分，保证朗读和渲染都流畅 */
function sliceByCharCount(paras: string[], title: string): Chapter[] {
  const total = paras.reduce((n, p) => n + p.length, 0);
  if (total <= MAX_CHAPTER_CHARS) {
    return [{ id: '', title, paragraphs: paras }];
  }
  const chunks: Chapter[] = [];
  let cur: string[] = [];
  let size = 0;
  for (const p of paras) {
    cur.push(p);
    size += p.length;
    if (size >= MAX_CHAPTER_CHARS) {
      chunks.push({ id: '', title: chunks.length ? `${title}（续）` : title, paragraphs: cur });
      cur = [];
      size = 0;
    }
  }
  if (cur.length) chunks.push({ id: '', title: `${title}（续）`, paragraphs: cur });
  return chunks;
}

function guessBookTitle(lines: string[], fallback: string): string {
  for (const line of lines.slice(0, 8)) {
    const t = line.trim();
    if (t.length >= 2 && t.length <= 30 && !HEADING_RE.test(t)) return cleanTitle(t);
  }
  return fallback;
}
