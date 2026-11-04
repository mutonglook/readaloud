import JSZip from 'jszip';
import type { Chapter } from '../../types';

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

function stripTags(s: string): string {
  return decodeXml(s.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/** 从 core.xml 里取书名与作者 */
function readCore(xml: string | undefined): { title?: string; author?: string } {
  if (!xml) return {};
  const pick = (tag: string) => {
    const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(xml);
    return m ? decodeXml(m[1]).trim() : undefined;
  };
  return { title: pick('dc:title'), author: pick('dc:creator') };
}

export async function parseDocx(buffer: ArrayBuffer, fallbackTitle: string): Promise<{
  title: string;
  author?: string;
  chapters: Chapter[];
}> {
  const zip = await JSZip.loadAsync(buffer);
  const docEntry = zip.file('word/document.xml');
  if (!docEntry) throw new Error('这不是有效的 Word 文档（缺少 document.xml）');

  const xml = await docEntry.async('string');
  const core = readCore(await zip.file('docProps/core.xml')?.async('string'));

  const paraRe = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  const paragraphs = xml.match(paraRe) ?? [];

  const chapters: Chapter[] = [];
  let current = { title: '正文', paragraphs: [] as string[] };

  const close = () => {
    const ps = current.paragraphs.filter((p) => p.trim().length > 0);
    if (ps.length > 0) chapters.push({ id: `c${chapters.length}`, title: current.title, paragraphs: ps });
  };

  for (const p of paragraphs) {
    const styleMatch = /<w:pStyle[^>]*w:val="([^"]+)"/.exec(p);
    const outlineMatch = /<w:outlineLvl[^>]*w:val="(\d+)"/.exec(p);
    const style = (styleMatch?.[1] ?? '').toLowerCase();

    // 正文内容：制表符当空格，换行当分隔
    const text = decodeXml(
      p
        .replace(/<w:tab[^>]*\/>/g, ' ')
        .replace(/<w:br[^>]*\/>/g, '\n')
        .replace(/<[^>]+>/g, ''),
    )
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim();

    if (!text) continue;

    const isHeading =
      /heading|标题|title/.test(style) || (outlineMatch != null && Number(outlineMatch[1]) <= 2);

    if (isHeading && text.length <= 60) {
      close();
      current = { title: text, paragraphs: [] };
      continue;
    }

    // 段落内部有换行说明是软回车，拆成多段
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (t) current.paragraphs.push(t);
    }
  }
  close();

  if (chapters.length === 0) {
    chapters.push({ id: 'c0', title: '正文', paragraphs: ['这个 Word 文档里没有可读的文字，可能是纯图片。'] });
  }

  return { title: core.title || fallbackTitle, author: core.author, chapters };
}

export { stripTags };
