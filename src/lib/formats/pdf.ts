import type { Chapter } from '../../types';
import { HEADING_RE } from '../txt';

/** 中英文混排时，上一行结尾和下一行开头都是字母，才补一个空格 */
function joinLine(prev: string, next: string): string {
  if (!prev) return next;
  if (/[A-Za-z0-9,;:]$/.test(prev) && /^[A-Za-z0-9]/.test(next)) return `${prev} ${next}`;
  return prev + next;
}

export async function parsePdf(
  buffer: ArrayBuffer,
  fallbackTitle: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ title: string; author?: string; chapters: Chapter[] }> {
  // pdfjs 体积不小，只有真的打开 PDF 时才加载，并单独把 worker 打成一个文件
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
  }).promise;

  const info = await doc
    .getMetadata()
    .then((m) => (m?.info ?? {}) as Record<string, unknown>)
    .catch(() => ({}) as Record<string, unknown>);

  // PDF 的 Title 经常是导出工具留下的垃圾值，这种就退回文件名
  const rawTitle = String(info.Title ?? '').trim();
  const uselessTitle = /^(about:blank|untitled|无标题|未命名|document\d*|microsoft (word|powerpoint).*|.*\.(docx?|pptx?|indd))$/i.test(
    rawTitle,
  );
  const title = rawTitle && !uselessTitle ? rawTitle : fallbackTitle;
  const author = String(info.Author ?? '').trim() || undefined;

  const chapters: Chapter[] = [];
  let current = { title: '正文', paragraphs: [] as string[] };
  let para = '';

  const flushPara = () => {
    const t = para.trim();
    if (t) current.paragraphs.push(t);
    para = '';
  };

  const closeChapter = () => {
    flushPara();
    const paragraphs = current.paragraphs.filter((p) => p.trim().length > 0);
    if (paragraphs.length > 0) {
      chapters.push({ id: `c${chapters.length}`, title: current.title, paragraphs });
    }
  };

  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();

      const lines: string[] = [];
      let buf = '';
      for (const raw of content.items as Array<Record<string, unknown>>) {
        const str = typeof raw.str === 'string' ? raw.str : '';
        buf += str;
        if (raw.hasEOL) {
          lines.push(buf.trim());
          buf = '';
        }
      }
      if (buf.trim()) lines.push(buf.trim());

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          flushPara();
          continue;
        }
        // 章节标题：短且符合「第 X 章」这类写法
        if (trimmed.length <= 40 && HEADING_RE.test(trimmed)) {
          closeChapter();
          current = { title: trimmed, paragraphs: [] };
          continue;
        }
        para = joinLine(para, trimmed);
        // 句末标点收尾就断段，避免整页挤成一大坨
        if (/[。！？…”』」]$/.test(para)) flushPara();
      }
      onProgress?.(p, doc.numPages);
    }
  } finally {
    // 释放 worker 里的页面缓存
    void doc.destroy().catch(() => undefined);
  }

  closeChapter();

  if (chapters.length === 0) {
    chapters.push({
      id: 'c0',
      title: '正文',
      paragraphs: ['这个 PDF 没有提取到文字，可能是扫描件（纯图片）。扫描件需要 OCR，本应用暂时做不到。'],
    });
  }

  return { title, author, chapters };
}
