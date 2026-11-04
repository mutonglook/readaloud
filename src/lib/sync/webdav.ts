import { ReadAloud, isNative } from '../tts/native';

/**
 * 极简 WebDAV 客户端。
 *
 * 为什么选 WebDAV：国内网盘里，坚果云原生支持 WebDAV（网页端就能生成应用密码），
 * 群晖 / Nextcloud / 阿里云盘（第三方 WebDAV 网关）也都支持。百度网盘、夸克的
 * 开放接口需要企业资质与应用审核，个人开发者拿不到，所以没有做。
 *
 * 请求默认走原生 HTTP（OkHttp），因为 WebView 里直连 WebDAV 会被 CORS 拦下，
 * 而 WebDAV 服务器的响应头不受我们控制。
 */

export class DavError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

interface RawResponse {
  status: number;
  headers: Record<string, string>;
  data: string;
}

function basicAuth(user: string, pass: string): string {
  const raw = `${user}:${pass}`;
  const bytes = new TextEncoder().encode(raw);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return `Basic ${btoa(bin)}`;
}

async function request(
  cfg: { url: string; account: string; password: string },
  opts: {
    url: string;
    method: string;
    body?: string;
    headers?: Record<string, string>;
  },
): Promise<RawResponse> {
  const headers: Record<string, string> = {
    Authorization: basicAuth(cfg.account, cfg.password),
    ...(opts.headers ?? {}),
  };

  if (isNative()) {
    try {
      const res = await ReadAloud.httpRequest({
        url: opts.url,
        method: opts.method,
        headers,
        data: opts.body,
        responseType: 'text',
      });
      return { status: res.status, headers: res.headers ?? {}, data: res.data ?? '' };
    } catch (err) {
      throw new DavError(`网络请求失败：${(err as Error).message}`);
    }
  }

  // 浏览器里（开发调试）走 fetch，需要目标服务器允许 CORS
  try {
    const res = await fetch(opts.url, {
      method: opts.method,
      headers,
      body: opts.body,
    });
    const text = await res.text();
    const h: Record<string, string> = {};
    res.headers.forEach((v, k) => (h[k.toLowerCase()] = v));
    return { status: res.status, headers: h, data: text };
  } catch (err) {
    throw new DavError(`网络请求失败：${(err as Error).message}`);
  }
}

const join = (base: string, path: string) =>
  `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;

export interface DavConfig {
  url: string;
  account: string;
  password: string;
}

/** 测试连接：PROPFIND 根目录，401 说明账号或应用密码不对 */
export async function testConnection(cfg: DavConfig): Promise<void> {
  if (!cfg.url.trim()) throw new DavError('请先填写 WebDAV 地址');
  if (!cfg.account || !cfg.password) throw new DavError('请填写账号与应用密码');

  const res = await request(cfg, {
    url: join(cfg.url, ''),
    method: 'PROPFIND',
    headers: { Depth: '0', 'Content-Type': 'application/xml' },
    body:
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>',
  });

  if (res.status === 401 || res.status === 403) {
    throw new DavError('账号或应用密码不对（坚果云要在网页端生成「应用密码」，不是登录密码）', res.status);
  }
  if (res.status >= 400) {
    throw new DavError(`服务器返回 ${res.status}，请检查地址是否为 WebDAV 根地址`, res.status);
  }
}

/** 建目录，已存在（405）视为成功 */
export async function ensureDir(cfg: DavConfig, path: string): Promise<void> {
  const res = await request(cfg, { url: join(cfg.url, path), method: 'MKCOL' });
  if (res.status >= 400 && res.status !== 405) {
    throw new DavError(`创建目录失败（${res.status}）`, res.status);
  }
}

export async function putText(cfg: DavConfig, path: string, text: string): Promise<void> {
  const res = await request(cfg, {
    url: join(cfg.url, path),
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: text,
  });
  if (res.status >= 400) throw new DavError(`上传失败（${res.status}）`, res.status);
}

/** 取文件；404 返回 null，由调用方决定怎么处理 */
export async function getText(cfg: DavConfig, path: string): Promise<string | null> {
  const res = await request(cfg, { url: join(cfg.url, path), method: 'GET' });
  if (res.status === 404) return null;
  if (res.status >= 400) throw new DavError(`下载失败（${res.status}）`, res.status);
  return res.data;
}

/** 列目录，返回文件名数组 */
export async function listDir(cfg: DavConfig, path: string): Promise<string[]> {
  const res = await request(cfg, {
    url: join(cfg.url, path),
    method: 'PROPFIND',
    headers: { Depth: '1', 'Content-Type': 'application/xml' },
    body:
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>',
  });
  if (res.status === 404) return [];
  if (res.status >= 400) throw new DavError(`读取目录失败（${res.status}）`, res.status);

  const names: string[] = [];
  const re = /<d:href>([^<]+)<\/d:href>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(res.data))) {
    const href = decodeURIComponent(m[1]);
    if (href.endsWith('/')) continue; // 目录
    names.push(href.slice(href.lastIndexOf('/') + 1));
  }
  return names;
}

export async function deleteFile(cfg: DavConfig, path: string): Promise<void> {
  await request(cfg, { url: join(cfg.url, path), method: 'DELETE' }).catch(() => undefined);
}
