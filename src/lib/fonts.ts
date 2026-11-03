import { openDB, type IDBPDatabase } from 'idb';
import type { FontId } from '../types';

export interface FontOption {
  id: FontId;
  label: string;
  desc: string;
  /** 实际生效的 CSS font-family */
  stack: string;
}

/**
 * 预设字体。全部走系统字体栈——Android WebView 可直接用到的中文字体只有
 * 黑体与宋体两族，圆体/楷体/仿宋在部分 ROM 上会回退，这是设备字体库的限制，
 * 不是样式没生效。需要真正的其他字形请用「导入字体文件」。
 */
export const FONT_OPTIONS: FontOption[] = [
  {
    id: 'serif',
    label: '宋体',
    desc: '衬线 · 适合长篇',
    stack: '"Noto Serif CJK SC","Noto Serif SC","Source Han Serif SC","Songti SC",SimSun,"Noto Fallback CJK",serif',
  },
  {
    id: 'sans',
    label: '黑体',
    desc: '无衬线 · 清晰',
    stack: '"Noto Sans CJK SC","Source Han Sans SC","PingFang SC","Microsoft YaHei",Roboto,sans-serif',
  },
  {
    id: 'round',
    label: '圆体',
    desc: '圆润 · 柔和',
    stack: '"Yuanti SC","Hiragino Sans GB","Noto Sans CJK SC","PingFang SC",sans-serif',
  },
  {
    id: 'kai',
    label: '楷体',
    desc: '手写 · 雅致',
    stack: '"Kaiti SC",KaiTi,STKaiti,"Noto Serif CJK SC","Songti SC",serif',
  },
  {
    id: 'fangsong',
    label: '仿宋',
    desc: '挺拔 · 公文感',
    stack: 'FangSong,STFangsong,"Noto Serif CJK SC","Songti SC",serif',
  },
  {
    id: 'mono',
    label: '等宽',
    desc: '对齐 · 诗句排版',
    stack: '"Noto Sans Mono CJK SC",Menlo,Consolas,"Courier New",monospace',
  },
];

export const PRESET_FONTS = FONT_OPTIONS;

// ---------------- 自定义字体（导入本地字体文件） ----------------

const FONT_DB = 'readaloud-fonts';
const FONT_STORE = 'files';
const MAX_FONT_BYTES = 24 * 1024 * 1024;

let fontDb: Promise<IDBPDatabase> | null = null;

function openFontDB() {
  if (!fontDb) {
    fontDb = openDB(FONT_DB, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(FONT_STORE)) db.createObjectStore(FONT_STORE);
      },
    });
  }
  return fontDb;
}

/** 已注册到 document.fonts 的字体，避免重复 load */
const registered = new Set<string>();

const familyName = (name: string) => `ra-custom-${name}`;

export async function listCustomFonts(): Promise<string[]> {
  const db = await openFontDB();
  return (await db.getAllKeys(FONT_STORE)) as string[];
}

export async function importCustomFont(file: File): Promise<string> {
  if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) {
    throw new Error('请选择 .ttf / .otf / .woff 字体文件');
  }
  if (file.size > MAX_FONT_BYTES) {
    throw new Error('字体文件超过 24 MB，请换一个');
  }
  const name = file.name.replace(/\.[^.]+$/, '');
  const buffer = await file.arrayBuffer();

  // 先试着注册一次，确认这个文件真的能被解析，再落库
  const probe = `ra-probe-${Date.now()}`;
  const face = new FontFace(probe, buffer.slice(0));
  await face.load();
  document.fonts.add(face);

  const db = await openFontDB();
  await db.put(FONT_STORE, buffer, name);
  registered.add(familyName(name));
  return name;
}

export async function deleteCustomFont(name: string): Promise<void> {
  const db = await openFontDB();
  await db.delete(FONT_STORE, name);
  registered.delete(familyName(name));
}

/** 把字体从 IndexedDB 取出并注册，返回可用的 font-family */
export async function ensureCustomFont(name: string): Promise<string | null> {
  const family = familyName(name);
  if (registered.has(family)) return family;
  try {
    const db = await openFontDB();
    const data = (await db.get(FONT_STORE, name)) as ArrayBuffer | undefined;
    if (!data) return null;
    const face = new FontFace(family, data);
    await face.load();
    document.fonts.add(face);
    registered.add(family);
    return family;
  } catch {
    return null;
  }
}

/**
 * 解析最终用于渲染的 CSS font-family。
 * custom 字体解析失败时回退到宋体，保证正文不会变成默认无衬线。
 */
export async function resolveFontStack(
  id: FontId,
  customName?: string,
): Promise<string> {
  if (id === 'custom' && customName) {
    const family = await ensureCustomFont(customName);
    if (family) return `"${family}", ${FONT_OPTIONS[0].stack}`;
  }
  const hit = FONT_OPTIONS.find((f) => f.id === id);
  return hit?.stack ?? FONT_OPTIONS[0].stack;
}
