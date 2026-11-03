import JSZip from 'jszip';
import type { Chapter } from '../types';
import { cleanTitle } from './splitter';

interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties: string;
}

interface ParsedEpub {
  title: string;
  author: string;
  cover?: string;
  chapters: Chapter[];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 相对于基准目录解析相对路径（处理 ../ 与 URL 编码） */
function resolvePath(base: string, href: string): string {
  const cleanHref = decodeURIComponent(href.split('#')[0]);
  if (/^[a-z]+:\/\//i.test(cleanHref)) return cleanHref;
  const stack = base ? base.split('/') : [];
  for (const seg of cleanHref.split('/')) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') stack.pop();
    else stack.push(seg);
  }
  return stack.join('/');
}

const dirOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

export async function parseEpub(buf: ArrayBuffer): Promise<ParsedEpub> {
  const zip = await JSZip.loadAsync(buf);

  // 1. container.xml 找到 OPF
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) throw new Error('不是有效的 EPUB：缺少 META-INF/container.xml');
  const containerXml = new DOMParser().parseFromString(await containerFile.async('text'), 'application/xml');
  const rootPath = containerXml.querySelector('rootfile')?.getAttribute('full-path');
  if (!rootPath) throw new Error('不是有效的 EPUB：找不到 OPF 文件');

  const opfFile = zip.file(rootPath);
  if (!opfFile) throw new Error(`EPUB 结构异常：缺少 ${rootPath}`);
  const opfText = await opfFile.async('text');
  const opf = new DOMParser().parseFromString(opfText, 'application/xml');
  const opfDir = dirOf(rootPath);

  // 2. 元数据
  const title = textOf(opf, 'dc\\:title') || textOf(opf, 'title') || '未命名书籍';
  const author = textOf(opf, 'dc\\:creator') || textOf(opf, 'creator') || '佚名';

  // 3. manifest
  const manifest = new Map<string, ManifestItem>();
  let coverHref = '';
  opf.querySelectorAll('manifest > item').forEach((el) => {
    const item: ManifestItem = {
      id: el.getAttribute('id') || '',
      href: el.getAttribute('href') || '',
      mediaType: el.getAttribute('media-type') || '',
      properties: el.getAttribute('properties') || '',
    };
    if (!item.id) return;
    manifest.set(item.id, item);
    if (item.properties.includes('cover-image')) coverHref = item.href;
  });

  // EPUB2 的封面写在 meta[name=cover]
  if (!coverHref) {
    const coverId = opf.querySelector('metadata > meta[name="cover"]')?.getAttribute('content');
    if (coverId && manifest.has(coverId)) coverHref = manifest.get(coverId)!.href;
  }

  // 4. 目录标题映射（EPUB3 nav 优先，其次 NCX）
  const tocTitles = await readToc(zip, opf, manifest, opfDir);

  // 5. spine 顺序
  const spineIds: string[] = [];
  opf.querySelectorAll('spine > itemref').forEach((el) => {
    const idref = el.getAttribute('idref');
    if (idref && manifest.has(idref)) spineIds.push(idref);
  });
  if (spineIds.length === 0) {
    // spine 缺失时退化为按 manifest 顺序取 html
    for (const [id, item] of manifest) {
      if (/x?html/.test(item.mediaType)) spineIds.push(id);
    }
  }

  // 6. 逐章抽取正文
  const chapters: Chapter[] = [];
  let index = 0;
  for (const id of spineIds) {
    const item = manifest.get(id)!;
    const path = resolvePath(opfDir, item.href);
    const file = zip.file(path);
    if (!file) continue;

    const html = await file.async('text');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, nav, svg').forEach((n) => n.remove());

    const paragraphs = extractParagraphs(doc);
    const charCount = paragraphs.join('').length;
    // 跳过封面页、版权页这类几乎没有正文的页面
    if (charCount < 30) continue;

    const heading = firstHeading(doc);
    const chapterTitle =
      tocTitles.get(item.href.split('#')[0]) ||
      tocTitles.get(path) ||
      (heading ? cleanTitle(heading) : '') ||
      `第 ${index + 1} 节`;

    chapters.push({ id: `c${index}`, title: chapterTitle, paragraphs });
    index++;
  }

  if (chapters.length === 0) throw new Error('EPUB 中没有解析到正文内容');

  // 7. 封面
  let cover: string | undefined;
  if (coverHref) {
    const coverPath = resolvePath(opfDir, coverHref);
    const file = zip.file(coverPath);
    if (file) {
      const base64 = await file.async('base64');
      const ext = (coverPath.split('.').pop() || 'jpeg').toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      cover = `data:${mime};base64,${base64}`;
    }
  }

  return { title: title.trim(), author: author.trim(), cover, chapters };
}

function textOf(doc: Document, selector: string): string {
  return doc.querySelector(selector)?.textContent?.trim() || '';
}

function firstHeading(doc: Document): string {
  const el = doc.querySelector('h1, h2, h3, title');
  return el?.textContent?.trim() || '';
}

/**
 * 抽段落：优先 block 级元素，保留段落边界。
 * 直接把 body.textContent 拼起来会丢掉换行，朗读会糊成一片。
 */
function extractParagraphs(doc: Document): string[] {
  const body = doc.body;
  if (!body) return [];
  const out: string[] = [];
  const blockTags = new Set(['P', 'DIV', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'TD', 'SECTION', 'ARTICLE']);

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) out.push(t);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (el.tagName === 'BR') return;

    if (blockTags.has(el.tagName)) {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) {
        out.push(t);
        // 已整体收集，不再递归子节点
        return;
      }
    }
    el.childNodes.forEach(walk);
  };

  body.childNodes.forEach(walk);
  // 合并过短的碎片段（常见于逐行 span 排版）
  const merged: string[] = [];
  for (const p of out) {
    if (merged.length && (p.length < 12 || merged[merged.length - 1].length < 12)) {
      merged[merged.length - 1] += p;
    } else {
      merged.push(p);
    }
  }
  return merged.filter((p) => p.trim().length > 0);
}

async function readToc(
  zip: JSZip,
  opf: Document,
  manifest: Map<string, ManifestItem>,
  opfDir: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  // EPUB3: nav 文档
  const navItem = [...manifest.values()].find((i) => i.properties.includes('nav'));
  if (navItem) {
    const file = zip.file(resolvePath(opfDir, navItem.href));
    if (file) {
      const doc = new DOMParser().parseFromString(await file.async('text'), 'text/html');
      doc.querySelectorAll('nav[epub\\:type="toc"] a, nav a').forEach((a) => {
        const href = a.getAttribute('href') || '';
        const label = a.textContent?.trim() || '';
        if (href && label) map.set(href.split('#')[0], cleanTitle(label));
      });
    }
  }

  if (map.size > 0) return map;

  // EPUB2: NCX
  const ncxId = opf.querySelector('spine')?.getAttribute('toc');
  const ncxItem = ncxId ? manifest.get(ncxId) : [...manifest.values()].find((i) => i.mediaType.includes('dtbncx'));
  if (!ncxItem) return map;

  const ncxFile = zip.file(resolvePath(opfDir, ncxItem.href));
  if (!ncxFile) return map;

  const ncx = new DOMParser().parseFromString(await ncxFile.async('text'), 'application/xml');
  ncx.querySelectorAll('navPoint').forEach((point) => {
    const label = point.querySelector('navLabel > text')?.textContent?.trim() || '';
    const src = point.querySelector('content')?.getAttribute('src') || '';
    if (label && src) map.set(src.split('#')[0], cleanTitle(label));
  });

  return map;
}

export { escapeRe };
