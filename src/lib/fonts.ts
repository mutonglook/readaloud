import { openDB, type IDBPDatabase } from 'idb';
import type { FontId } from '../types';

/**
 * 字体系统分三层：
 *  1. 系统字体（SYSTEM_FONTS）—— 直接用 CSS font-family，不下载任何东西
 *  2. 开源字体包（FONT_PACKS）—— 10 款开源中文字体，按需从 CDN 拉取
 *     unicode-range 切片，只有当前页面用到的字块才会下载，CSS 缓存在 IndexedDB
 *  3. 用户导入（custom）—— 本地 .ttf/.otf 文件，存 IndexedDB
 *
 * 字体包走 cn-fontsource 系列（wc-ex/cn-fontsource），每款都是 SIL OFL 或免费商用，
 * 已按 unicode-range 切片，单包体积只有几 MB，不会把安装包撑大。
 */

export interface FontOption {
  id: FontId;
  label: string;
  desc: string;
  /** 实际生效的 CSS font-family */
  stack: string;
}

/** 系统字体：安卓自带，不需要联网 */
export const SYSTEM_FONTS: FontOption[] = [
  {
    id: 'serif',
    label: '宋体',
    desc: '系统衬线',
    stack: '"Noto Serif CJK SC","Noto Serif SC","Source Han Serif SC",Songti SC,SimSun,serif',
  },
  {
    id: 'sans',
    label: '黑体',
    desc: '系统无衬线',
    stack: '"Noto Sans CJK SC","Noto Sans SC","OPPO Sans","Source Han Sans SC",Roboto,sans-serif',
  },
  {
    id: 'kai',
    label: '楷体',
    desc: '系统楷书',
    stack: 'KaiTi,"Kaiti SC",STKaiti,"Noto Serif CJK SC",serif',
  },
  {
    id: 'fangsong',
    label: '仿宋',
    desc: '系统仿宋',
    stack: 'FangSong,STFangsong,"Noto Serif CJK SC",serif',
  },
];

/** 兼容旧引用 */
export const FONT_OPTIONS = SYSTEM_FONTS;
export const PRESET_FONTS = SYSTEM_FONTS;

export interface FontPack {
  id: string;
  /** 展示名 */
  name: string;
  desc: string;
  /** 字体自身的 style 名，注入 CSS 后用它取用 */
  family: string;
  /** npm 包名（cn-fontsource 系列） */
  pkg: string;
  /** 作者 / 授权 */
  license: string;
  /** 切片数量，用来估算首次加载的流量 */
  chunks: number;
  /** 排序/展示用的一句话风格说明 */
  style: 'song' | 'hei' | 'kai' | 'round' | 'hand' | 'display';
}

/**
 * 10 款开源可商用中文字体，全部来自 cn-fontsource（按 unicode-range 切片）。
 * 选型以「适合长时间阅读正文」为准：宋体 3 款、黑体 3 款、楷体 2 款、圆体 1 款、手写 1 款。
 */
export const FONT_PACKS: FontPack[] = [
  {
    id: 'sh-serif',
    name: '思源宋体',
    desc: '最正统的正文宋体，笔画均匀、长时间读不累',
    family: 'Source Han Serif SC VF',
    pkg: 'cn-fontsource-source-han-serif-sc-vf',
    license: 'SIL OFL 1.1',
    chunks: 1270,
    style: 'song',
  },
  {
    id: 'sh-sans',
    name: '思源黑体',
    desc: '清晰利落，小字号也能看清，适合手机屏',
    family: 'Source Han Sans SC VF',
    pkg: 'cn-fontsource-source-han-sans-sc-vf',
    license: 'SIL OFL 1.1',
    chunks: 1270,
    style: 'hei',
  },
  {
    id: 'wenkai',
    name: '霞鹜文楷',
    desc: '楷体骨架带一点书写味，读起来最像纸质书',
    family: 'LXGW WenKai Screen',
    pkg: 'cn-fontsource-lxgw-wen-kai-screen',
    license: 'SIL OFL 1.1',
    chunks: 379,
    style: 'kai',
  },
  {
    id: 'zhisong',
    name: '霞鹜新致宋',
    desc: '比思源宋体更瘦挺的宋体，行气干净',
    family: 'LXGW Neo ZhiSong CHS',
    pkg: 'cn-fontsource-lxgw-neo-zhi-song-chs-regular-lxgw-neo-zhi-song',
    license: 'SIL OFL 1.1',
    chunks: 111,
    style: 'song',
  },
  {
    id: 'xihei',
    name: '霞鹜新晰黑',
    desc: '基于 IPAex 黑体改的陆标字形，笔画干净',
    family: 'LXGW Neo XiHei',
    pkg: 'cn-fontsource-lxgw-neo-xi-hei-regular',
    license: 'SIL OFL 1.1',
    chunks: 199,
    style: 'hei',
  },
  {
    id: 'maru',
    name: '975 圆体',
    desc: '圆润没有尖角，轻松读物、睡前阅读',
    family: '975Maru SC',
    pkg: 'cn-fontsource-975-maru-sc-regular',
    license: 'SIL OFL 1.1',
    chunks: 609,
    style: 'round',
  },
  {
    id: 'yozai',
    name: '悠哉字体',
    desc: '手写感强，适合散文、日记、随笔',
    family: 'Yozai',
    pkg: 'cn-fontsource-yozai-regular',
    license: 'SIL OFL 1.1',
    chunks: 258,
    style: 'hand',
  },
  {
    id: 'xiaolai',
    name: '小赖字体',
    desc: '濑户字体简中改良，圆头笔触，活泼',
    family: 'Xiaolai SC',
    pkg: 'cn-fontsource-xiaolai-sc-regular',
    license: '免费商用',
    chunks: 619,
    style: 'round',
  },
  {
    id: 'smiley',
    name: '得意黑',
    desc: '斜体窄长，标题党福音，正文略挑',
    family: 'Smiley Sans Oblique',
    pkg: 'cn-fontsource-smiley-sans-oblique-regular',
    license: 'SIL OFL 1.1',
    chunks: 80,
    style: 'display',
  },
  {
    id: 'jixiang',
    name: '欣意吉祥宋',
    desc: '偏圆润古风的宋体，适合古籍、诗词',
    family: 'Fontquan-XinYiJiXiangSong',
    pkg: 'cn-fontsource-fontquan-xin-yi-ji-xiang-song-regular',
    license: '免费商用',
    chunks: 70,
    style: 'song',
  },
];

/**
 * CDN 镜像。国内优先 fastly / gcore，jsDelivr 主站偶尔被墙，unpkg 兜底。
 * 测速结果会被记住，下次直接用最快的那个。
 */
export const FONT_MIRRORS = [
  'https://fastly.jsdelivr.net/npm/',
  'https://gcore.jsdelivr.net/npm/',
  'https://cdn.jsdelivr.net/npm/',
  'https://unpkg.com/',
];

const MIRROR_KEY = 'ra-font-mirror';

// ---------------- IndexedDB ----------------

const FONT_DB = 'readaloud-fonts';
const STORE_FILES = 'files';
const STORE_PACKS = 'packs';
const MAX_FONT_BYTES = 24 * 1024 * 1024;

let fontDb: Promise<IDBPDatabase> | null = null;

function openFontDB() {
  if (!fontDb) {
    fontDb = openDB(FONT_DB, 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_FILES)) db.createObjectStore(STORE_FILES);
        if (!db.objectStoreNames.contains(STORE_PACKS)) db.createObjectStore(STORE_PACKS);
      },
    });
  }
  return fontDb;
}

// ---------------- 开源字体包 ----------------

/** 已经注入到文档里的字体包，避免重复插 style */
const injected = new Set<string>();

function packStyleId(id: string) {
  return `ra-pack-${id}`;
}

function absoluteCss(css: string, base: string) {
  // font.css 里用的是相对路径（url('L1_4e00_192.woff2')），
  // 直接注入会按当前页面地址解析，所以必须补成绝对 CDN 地址
  return css.replace(/url\((['"]?)([^)'"]+)\1\)/g, (_m, _q, u: string) => {
    if (/^(https?:|data:|blob:)/.test(u)) return `url(${u})`;
    return `url(${base}${u.replace(/^\.\//, '')})`;
  });
}

async function fetchCss(pack: FontPack): Promise<{ css: string; base: string }> {
  const cachedMirror = localStorage.getItem(MIRROR_KEY);
  const order = cachedMirror
    ? [cachedMirror, ...FONT_MIRRORS.filter((m) => m !== cachedMirror)]
    : FONT_MIRRORS;

  let lastErr: unknown = null;
  for (const mirror of order) {
    const base = `${mirror}${pack.pkg}/`;
    try {
      const res = await fetch(`${base}font.css`, { cache: 'force-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const css = await res.text();
      if (!css.includes('@font-face')) throw new Error('返回内容不是字体样式');
      localStorage.setItem(MIRROR_KEY, mirror);
      return { css, base };
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `字体下载失败（${(lastErr as Error)?.message ?? '网络不可用'}）。请检查网络后重试，或改用系统字体。`,
  );
}

/**
 * 让某个字体包可用，返回可直接写进 font-family 的族名。
 * CSS 会缓存到 IndexedDB，之后离线也能用（woff2 分片由浏览器 HTTP 缓存）。
 */
export async function ensureFontPack(pack: FontPack): Promise<string> {
  const styleId = packStyleId(pack.id);
  if (injected.has(pack.id) && document.getElementById(styleId)) return pack.family;

  const db = await openFontDB();
  let css = (await db.get(STORE_PACKS, pack.id)) as string | undefined;
  let base = localStorage.getItem(MIRROR_KEY) ?? FONT_MIRRORS[0];

  if (!css) {
    const got = await fetchCss(pack);
    css = got.css;
    base = got.base;
    await db.put(STORE_PACKS, css, pack.id);
  }

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = absoluteCss(css, base);
  document.head.appendChild(style);
  injected.add(pack.id);

  try {
    // 先把常用字抓下来，避免正文出现「先宋体后变楷体」的跳变
    await document.fonts.load(`16px "${pack.family}"`, '的一是在不了有和人这中大为上个国我以要他时来用们');
  } catch {
    /* 加载失败不影响后续按需加载 */
  }
  return pack.family;
}

/** 清掉某个字体包的本地缓存 */
export async function clearFontPack(id: string): Promise<void> {
  const db = await openFontDB();
  await db.delete(STORE_PACKS, id);
  document.getElementById(packStyleId(id))?.remove();
  injected.delete(id);
}

/** 缓存过的字体包 id 列表 */
export async function cachedFontPacks(): Promise<string[]> {
  const db = await openFontDB();
  return (await db.getAllKeys(STORE_PACKS)) as string[];
}

// ---------------- 自定义字体（导入本地字体文件） ----------------

const registered = new Set<string>();

const familyName = (name: string) => `ra-custom-${name}`;

export async function listCustomFonts(): Promise<string[]> {
  const db = await openFontDB();
  return (await db.getAllKeys(STORE_FILES)) as string[];
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

  // 先注册一次确认文件真能解析，再落库
  const probe = `ra-probe-${Date.now()}`;
  const face = new FontFace(probe, buffer.slice(0));
  await face.load();
  document.fonts.add(face);

  const db = await openFontDB();
  await db.put(STORE_FILES, buffer, name);
  registered.add(familyName(name));
  return name;
}

export async function deleteCustomFont(name: string): Promise<void> {
  const db = await openFontDB();
  await db.delete(STORE_FILES, name);
  registered.delete(familyName(name));
}

export async function ensureCustomFont(name: string): Promise<string | null> {
  const family = familyName(name);
  if (registered.has(family)) return family;
  try {
    const db = await openFontDB();
    const data = (await db.get(STORE_FILES, name)) as ArrayBuffer | undefined;
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

// ---------------- 解析最终 font-family ----------------

export const fallbackStack = SYSTEM_FONTS[0].stack;

/**
 * 把设置里的字体选择解析成 CSS font-family。
 * 字体包解析失败时回退宋体，保证正文永远不会变成默认无衬线。
 */
export async function resolveFontStack(
  id: string,
  customName?: string,
  packId?: string,
): Promise<string> {
  if (id === 'custom' && customName) {
    const family = await ensureCustomFont(customName);
    if (family) return `"${family}", ${fallbackStack}`;
  }
  if (id === 'pack' && packId) {
    const pack = FONT_PACKS.find((p) => p.id === packId);
    if (pack) {
      try {
        const family = await ensureFontPack(pack);
        return `"${family}", ${fallbackStack}`;
      } catch {
        return fallbackStack;
      }
    }
  }
  const hit = SYSTEM_FONTS.find((f) => f.id === id);
  return hit?.stack ?? fallbackStack;
}
