import type { Chapter } from '../../types';
import { decodeTextBuffer } from '../txt';

interface Block {
  kind: 'h' | 'p';
  text: string;
}

/** 把 HTML 拍平成「标题 / 段落」序列，递归处理嵌套容器 */
function flatten(el: Element, out: Block[]) {
  let buf = '';
  const flush = () => {
    const t = buf.replace(/\s+/g, ' ').trim();
    if (t) out.push({ kind: 'p', text: t });
    buf = '';
  };

  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 3) {
      buf += child.textContent ?? '';
      continue;
    }
    if (child.nodeType !== 1) continue;
    const node = child as Element;
    const tag = node.tagName.toLowerCase();

    if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'svg') continue;
    if (tag === 'br') {
      flush();
      continue;
    }
    if (/^h[1-4]$/.test(tag)) {
      flush();
      const t = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (t) out.push({ kind: 'h', text: t });
      continue;
    }
    if (tag === 'img') continue;

    // 其余元素当容器递归，前后各断一次段落
    flush();
    flatten(node, out);
    flush();
  }
  flush();
}

export function parseHtml(buffer: ArrayBuffer, fallbackTitle: string): {
  title: string;
  author?: string;
  chapters: Chapter[];
} {
  const raw = decodeTextBuffer(buffer);
  const doc = new DOMParser().parseFromString(raw, 'text/html');
  doc.querySelectorAll('script,style,noscript,iframe').forEach((n) => n.remove());

  const title = doc.querySelector('title')?.textContent?.trim() || fallbackTitle;
  const author =
    doc.querySelector('meta[name="author"]')?.getAttribute('content')?.trim() ||
    doc.querySelector('meta[name="DC.creator"]')?.getAttribute('content')?.trim() ||
    undefined;

  const root = doc.body ?? doc.documentElement;
  const blocks: Block[] = [];
  if (root) flatten(root, blocks);

  const chapters: Chapter[] = [];
  let current = { title: '正文', paragraphs: [] as string[] };

  const close = () => {
    const paragraphs = current.paragraphs.filter((p) => p.trim().length > 0);
    if (paragraphs.length > 0) {
      chapters.push({ id: `c${chapters.length}`, title: current.title, paragraphs });
    }
  };

  for (const b of blocks) {
    if (b.kind === 'h') {
      close();
      current = { title: b.text, paragraphs: [] };
    } else {
      current.paragraphs.push(b.text);
    }
  }
  close();

  if (chapters.length === 0) {
    chapters.push({ id: 'c0', title: '正文', paragraphs: ['这个 HTML 文件里没有可读的正文。'] });
  }

  return { title, author, chapters };
}
