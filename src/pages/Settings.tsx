import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../store/useSettings';
import {
  ReadAloud,
  checkNativeStatus,
  fetchNativeVoices,
  initNativeTts,
  isNative,
  listTtsEngines,
  switchTtsEngine,
  setImmersive,
  type NativeStatus,
  type NativeVoice,
  type TtsEngineInfo,
} from '../lib/tts/native';
import { listWebVoices } from '../lib/tts/webSpeech';
import { speechController } from '../lib/tts/controller';
import {
  FONT_PACKS,
  SYSTEM_FONTS,
  cachedFontPacks,
  clearFontPack,
  deleteCustomFont,
  ensureCustomFont,
  ensureFontPack,
  importCustomFont,
  listCustomFonts,
} from '../lib/fonts';
import { pullShelf, syncNow, uploadAllBooks } from '../lib/sync';
import { testConnection, DavError, type DavConfig } from '../lib/sync/webdav';
import { useLibrary } from '../store/useLibrary';
import type { ThemeId } from '../types';
import { IconBack, IconCloud, IconHeadphone, IconPlus, IconTrash } from '../components/Icons';

interface SettingsProps {
  onBack: () => void;
  onToast: (msg: string) => void;
}

const THEMES: { id: ThemeId; label: string; bg: string; fg: string }[] = [
  { id: 'white', label: '白底', bg: '#ffffff', fg: '#262626' },
  { id: 'paper', label: '纸质', bg: '#f6f0e3', fg: '#36322a' },
  { id: 'eye', label: '护眼', bg: '#cde6cd', fg: '#26382a' },
  { id: 'parchment', label: '羊皮', bg: '#e9dcc3', fg: '#42331f' },
  { id: 'night', label: '夜间', bg: '#121211', fg: '#9d9890' },
];

/** 国产 ROM 上常见、能下载中文离线语音包的引擎，用于「一个都没有」时的引导 */
const ENGINE_SUGGESTIONS = [
  { name: '讯飞语音', pkg: 'com.iflytek.speechcloud', note: '离线中文音色最全，装完在系统里选它' },
  { name: '讯飞语记', pkg: 'com.iflytek.voicedemo', note: '讯飞的通用入口，含离线语音包' },
  { name: '百度语音', pkg: 'com.baidu.voicetts', note: '百度 TTS 引擎，音色偏播报' },
  { name: 'Google 文字转语音', pkg: 'com.google.android.tts', note: '需在引擎内下载中文离线包' },
];

export function Settings({ onBack, onToast }: SettingsProps) {
  const { reader, tts, sync, setReader, setTts, setSync } = useSettings();
  const { refresh: refreshLibrary } = useLibrary();

  const [nativeVoices, setNativeVoices] = useState<NativeVoice[]>([]);
  const [engines, setEngines] = useState<TtsEngineInfo[]>([]);
  const [status, setStatus] = useState<NativeStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [customFonts, setCustomFonts] = useState<string[]>([]);
  const [fontFamilies, setFontFamilies] = useState<Record<string, string>>({});
  const [cachedPacks, setCachedPacks] = useState<string[]>([]);
  const [fontBusy, setFontBusy] = useState<string | null>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);

  // 云端同步
  const [syncing, setSyncing] = useState(false);
  const [testingDav, setTestingDav] = useState(false);
  const [remoteCount, setRemoteCount] = useState<number | null>(null);
  const [lastSummary, setLastSummary] = useState<string | null>(null);

  /* ------------------------------ 字体 ------------------------------ */

  useEffect(() => {
    void (async () => {
      const list = await listCustomFonts();
      setCustomFonts(list);
      const map: Record<string, string> = {};
      for (const name of list) {
        const family = await ensureCustomFont(name);
        if (family) map[name] = family;
      }
      setFontFamilies(map);
      setCachedPacks(await cachedFontPacks());
    })();
  }, []);

  const handleImportFont = async (file?: File) => {
    if (!file) return;
    try {
      const name = await importCustomFont(file);
      const family = await ensureCustomFont(name);
      setCustomFonts((l) => (l.includes(name) ? l : [...l, name]));
      if (family) setFontFamilies((m) => ({ ...m, [name]: family }));
      setReader({ fontFamily: 'custom', customFont: name, fontPack: undefined });
      onToast(`已导入字体「${name}」`);
    } catch (err) {
      onToast((err as Error).message);
    }
  };

  const handleDeleteFont = async (name: string) => {
    await deleteCustomFont(name);
    setCustomFonts((l) => l.filter((n) => n !== name));
    if (reader.customFont === name) setReader({ fontFamily: 'serif', customFont: undefined });
    onToast('已删除字体');
  };

  /** 选中一款开源字体：第一次要点下载，之后直接切 */
  const choosePack = async (id: string) => {
    const pack = FONT_PACKS.find((p) => p.id === id);
    if (!pack) return;
    if (cachedPacks.includes(id) || reader.fontPack === id) {
      setReader({ fontFamily: 'pack', fontPack: id, customFont: undefined });
      return;
    }
    setFontBusy(id);
    try {
      await ensureFontPack(pack);
      setCachedPacks((l) => (l.includes(id) ? l : [...l, id]));
      setReader({ fontFamily: 'pack', fontPack: id, customFont: undefined });
      onToast(`已启用「${pack.name}」`);
    } catch (err) {
      onToast((err as Error).message);
    } finally {
      setFontBusy(null);
    }
  };

  const dropPack = async (id: string) => {
    await clearFontPack(id);
    setCachedPacks((l) => l.filter((x) => x !== id));
    if (reader.fontPack === id) setReader({ fontFamily: 'serif', fontPack: undefined });
    onToast('已清除字体缓存');
  };

  /* ------------------------------ 语音 ------------------------------ */

  const loadVoices = async (tries = 0): Promise<void> => {
    const res = await fetchNativeVoices();
    if (res.voices.length) {
      setNativeVoices(res.voices);
      return;
    }
    if (tries < 4) window.setTimeout(() => void loadVoices(tries + 1), 700 * (tries + 1));
  };

  useEffect(() => {
    void (async () => {
      await initNativeTts();
      await loadVoices();
      setEngines(await listTtsEngines());
      const s = await checkNativeStatus();
      if (s) setStatus(s);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshStatus = async () => {
    const s = await checkNativeStatus();
    if (s) setStatus(s);
  };

  /** 系统设置页跳出去之后回来，状态可能已经变了，延时多读几次 */
  const afterSystemAction = () => {
    window.setTimeout(() => void refreshStatus(), 1200);
    window.setTimeout(() => void refreshStatus(), 3000);
    window.setTimeout(() => {
      void listTtsEngines().then(setEngines);
      void loadVoices();
    }, 2600);
  };

  const changeEngine = async (pkg: string) => {
    setTts({ nativeEngine: pkg, nativeVoice: '' });
    if (!isNative() || !pkg) return;
    const voices = await switchTtsEngine(pkg);
    setNativeVoices(voices);
    if (!voices.length) {
      onToast('这个引擎还没有音色，可能需要先下载中文语音包');
    }
  };

  const askNotification = async () => {
    await ReadAloud.requestNotificationPermission().catch(() => undefined);
    onToast('请在系统弹窗里允许通知，锁屏才看得到播放控制');
    afterSystemAction();
  };

  const askBattery = async () => {
    await ReadAloud.requestBatteryWhitelist().catch(() => undefined);
    afterSystemAction();
  };

  const askAutoStart = async () => {
    await ReadAloud.openAutoStart().catch(() => undefined);
    onToast('在「自启动管理」里允许听书阁，锁屏后才不会被清掉');
    afterSystemAction();
  };

  const openVoicePack = async () => {
    await ReadAloud.openVoicePack({ engine: tts.nativeEngine || undefined }).catch(() => undefined);
    onToast('在引擎页面里下载「中文离线语音包」，回来就能选到新音色');
    afterSystemAction();
  };

  const webVoices = listWebVoices();

  const testVoice = async () => {
    setTesting(true);
    try {
      await speechController.preview('这是一段试听，听听这个声音合不合你的耳朵。');
      onToast('试听完成');
    } catch (err) {
      onToast((err as Error).message);
    } finally {
      setTesting(false);
    }
  };

  /* ------------------------------ 云同步 ------------------------------ */

  const davCfg: DavConfig = { url: sync.url, account: sync.account, password: sync.password };

  const doTestDav = async () => {
    setTestingDav(true);
    try {
      await testConnection(davCfg);
      const bundle = await pullShelf(davCfg);
      setRemoteCount(bundle ? bundle.books.length : 0);
      onToast(bundle ? `连接成功，云端有 ${bundle.books.length} 本书的记录` : '连接成功，云端还没有数据');
    } catch (err) {
      onToast(err instanceof DavError ? err.message : (err as Error).message);
    } finally {
      setTestingDav(false);
    }
  };

  const doSync = async () => {
    setSyncing(true);
    try {
      const r = await syncNow(davCfg, reader);
      setSync({ lastSyncAt: r.at });
      await refreshLibrary(true);
      setRemoteCount(r.remoteBooks.length);
      setLastSummary(
        `补传 ${r.uploadedBooks} 本 · 下载 ${r.downloadedBooks} 本 · 更新进度 ${r.appliedProgress} 条`,
      );
      onToast('同步完成');
    } catch (err) {
      onToast(err instanceof DavError ? err.message : (err as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const doUploadAll = async () => {
    setSyncing(true);
    try {
      const n = await uploadAllBooks(davCfg, (done, total) => {
        setLastSummary(`上传中 ${done + 1}/${total}`);
      });
      onToast(`已上传 ${n} 本书`);
      setLastSummary(`已上传 ${n} 本`);
    } catch (err) {
      onToast(err instanceof DavError ? err.message : (err as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const lastSyncText = sync.lastSyncAt
    ? new Date(sync.lastSyncAt).toLocaleString('zh-CN', { hour12: false })
    : '尚未同步';

  return (
    <div className="settings">
      <div className="settings__header">
        <button className="icon-btn" onClick={onBack} aria-label="返回">
          <IconBack />
        </button>
        <span className="settings__title">设置</span>
      </div>

      <div className="settings__body">
        {/* ---------------- 阅读外观 ---------------- */}
        <section className="panel">
          <div className="panel__title">阅读外观</div>

          <div className="theme-row">
            {THEMES.map((t) => (
              <button
                key={t.id}
                className={`theme-dot${reader.theme === t.id ? ' active' : ''}`}
                onClick={() => setReader({ theme: t.id })}
              >
                <span className="theme-dot__swatch" style={{ background: t.bg, color: t.fg }}>
                  文
                </span>
                {t.label}
              </button>
            ))}
          </div>

          <div className="field">
            <div className="field__label">
              <span>字号</span>
              <span className="field__value">{reader.fontSize} px</span>
            </div>
            <input
              type="range"
              min={14}
              max={30}
              value={reader.fontSize}
              onChange={(e) => setReader({ fontSize: Number(e.target.value) })}
            />
          </div>

          <div className="field">
            <div className="field__label">
              <span>行距</span>
              <span className="field__value">{reader.lineHeight.toFixed(1)} 倍</span>
            </div>
            <input
              type="range"
              min={1.4}
              max={2.6}
              step={0.1}
              value={reader.lineHeight}
              onChange={(e) => setReader({ lineHeight: Number(e.target.value) })}
            />
          </div>

          <div className="field">
            <div className="field__label">
              <span>页边距</span>
              <span className="field__value">{reader.padding} px</span>
            </div>
            <input
              type="range"
              min={12}
              max={44}
              step={2}
              value={reader.padding}
              onChange={(e) => setReader({ padding: Number(e.target.value) })}
            />
          </div>

          <div className="switch-row">
            <span>朗读时自动滚动跟随</span>
            <button
              className={`switch${reader.autoScroll ? ' on' : ''}`}
              onClick={() => setReader({ autoScroll: !reader.autoScroll })}
              aria-label="自动跟随"
            >
              <i />
            </button>
          </div>

          <div className="switch-row">
            <span>
              沉浸式全屏
              <em className="switch-row__hint">隐藏状态栏与导航栏，正文顶到屏幕边缘</em>
            </span>
            <button
              className={`switch${reader.immersive ? ' on' : ''}`}
              onClick={() =>
                void setImmersive(!reader.immersive).then(() => setReader({ immersive: !reader.immersive }))
              }
              aria-label="沉浸式全屏"
            >
              <i />
            </button>
          </div>
        </section>

        {/* ---------------- 字体 ---------------- */}
        <section className="panel">
          <div className="panel__title">
            字体
            <span className="panel__sub">{SYSTEM_FONTS.length + FONT_PACKS.length} 种可选</span>
          </div>

          <div className="field">
            <div className="field__label">
              <span>系统字体</span>
              <span className="field__value">无需下载</span>
            </div>
            <div className="font-grid">
              {SYSTEM_FONTS.map((f) => (
                <button
                  key={f.id}
                  className={`font-chip${reader.fontFamily === f.id ? ' active' : ''}`}
                  onClick={() => setReader({ fontFamily: f.id, customFont: undefined, fontPack: undefined })}
                  title={f.desc}
                >
                  <span className="font-chip__sample" style={{ fontFamily: f.stack }}>
                    读书
                  </span>
                  <span className="font-chip__name">{f.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="field__label">
              <span>开源中文字体</span>
              <span className="field__value">点一下即下载</span>
            </div>
            <div className="font-grid">
              {FONT_PACKS.map((p) => {
                const active = reader.fontFamily === 'pack' && reader.fontPack === p.id;
                const busy = fontBusy === p.id;
                const cached = cachedPacks.includes(p.id);
                return (
                  <button
                    key={p.id}
                    className={`font-chip font-chip--pack${active ? ' active' : ''}`}
                    onClick={() => void choosePack(p.id)}
                    title={`${p.desc}\n授权：${p.license}`}
                  >
                    <span className="font-chip__sample" style={{ fontFamily: `"${p.family}", serif` }}>
                      读书
                    </span>
                    <span className="font-chip__name">{p.name}</span>
                    <span className={`font-chip__badge${cached ? ' ok' : ''}`}>
                      {busy ? '下载中' : cached ? '已缓存' : '下载'}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="field__hint">
              10 款都是 SIL OFL 或免费商用的开源字体，按需下载切片，只占阅读时用到的字。
              同一款字体用过一次后 CSS 会存在本机，换回它不用再联网。
              {reader.fontFamily === 'pack' && (
                <button
                  className="hint-link"
                  onClick={() => reader.fontPack && void dropPack(reader.fontPack)}
                >
                  清除当前字体缓存 ›
                </button>
              )}
            </div>
          </div>

          {customFonts.length > 0 && (
            <div className="field">
              <div className="field__label">
                <span>我导入的字体</span>
              </div>
              <div className="font-grid">
                {customFonts.map((name) => {
                  const active = reader.fontFamily === 'custom' && reader.customFont === name;
                  const family = fontFamilies[name];
                  return (
                    <button
                      key={name}
                      className={`font-chip${active ? ' active' : ''}`}
                      onClick={() => setReader({ fontFamily: 'custom', customFont: name, fontPack: undefined })}
                    >
                      <span
                        className="font-chip__sample"
                        style={family ? { fontFamily: `"${family}"` } : undefined}
                      >
                        读书
                      </span>
                      <span className="font-chip__name">{name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="font-actions">
            <button className="ghost-btn" onClick={() => fontInputRef.current?.click()}>
              <IconPlus size={15} />
              导入字体文件
            </button>
            {reader.fontFamily === 'custom' && reader.customFont && (
              <button className="ghost-btn" onClick={() => void handleDeleteFont(reader.customFont!)}>
                <IconTrash size={14} />
                删除
              </button>
            )}
          </div>

          <input
            ref={fontInputRef}
            type="file"
            accept=".ttf,.otf,.woff,.woff2"
            hidden
            onChange={(e) => {
              void handleImportFont(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </section>

        {/* ---------------- 语音朗读 ---------------- */}
        <section className="panel">
          <div className="panel__title">语音朗读</div>

          <div className="field">
            <div className="field__label">
              <span>朗读方式</span>
              {!isNative() && <span className="field__value">浏览器预览模式</span>}
            </div>
            <div className="segmented segmented--2">
              <button
                className={tts.provider === 'native' ? 'active' : ''}
                onClick={() => setTts({ provider: 'native' })}
              >
                离线朗读
              </button>
              <button
                className={tts.provider === 'online' ? 'active' : ''}
                onClick={() => setTts({ provider: 'online' })}
              >
                在线 AI
              </button>
            </div>
            <div className="field__hint">
              {tts.provider === 'native'
                ? '调用手机里的文字转语音引擎，完全离线、不花钱，锁屏后仍可朗读。装一个国内引擎（讯飞 / 百度）并下载中文语音包效果最好。'
                : '走 OpenAI 兼容的 /v1/audio/speech 接口，音色接近真人。需要联网并消耗你自己配置的额度。'}
            </div>
          </div>

          {tts.provider === 'native' && (
            <>
              <div className="field">
                <div className="field__label">
                  <span>语音引擎</span>
                  <span className="field__value">
                    {engines.length ? `${engines.length} 个已安装` : '未安装'}
                  </span>
                </div>
                <select
                  className="text-input"
                  value={tts.nativeEngine}
                  onChange={(e) => void changeEngine(e.target.value)}
                >
                  <option value="">系统默认引擎</option>
                  {engines.map((en) => (
                    <option key={en.pkg} value={en.pkg}>
                      {en.label}
                      {en.isDefault ? '（默认）' : ''}
                    </option>
                  ))}
                </select>

                <button className="ghost-btn" style={{ marginTop: 10 }} onClick={() => void openVoicePack()}>
                  <IconCloud size={15} />
                  下载 / 管理离线语音包
                </button>

                {engines.length === 0 && (
                  <div className="field__hint">
                    这台手机还没有装文字转语音引擎。装一个下面任意一款，再回来选：
                    <div className="engine-list">
                      {ENGINE_SUGGESTIONS.map((s) => (
                        <div className="engine-item" key={s.pkg}>
                          <div className="engine-item__main">
                            <b>{s.name}</b>
                            <span>{s.note}</span>
                          </div>
                          <button
                            className="engine-item__btn"
                            onClick={async () => {
                              await ReadAloud.openVoicePack({ engine: s.pkg }).catch(() => undefined);
                              onToast('若未安装会跳到系统设置，可在应用商店搜索安装');
                              afterSystemAction();
                            }}
                          >
                            获取
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="field">
                <div className="field__label">
                  <span>音色</span>
                  <span className="field__value">{nativeVoices.length} 个</span>
                </div>
                <select
                  className="text-input"
                  value={tts.nativeVoice}
                  onChange={(e) => setTts({ nativeVoice: e.target.value })}
                >
                  <option value="">系统默认</option>
                  {nativeVoices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                  {nativeVoices.length === 0 &&
                    webVoices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                </select>
                {nativeVoices.length === 0 && (
                  <div className="field__hint">
                    {status && status.ttsEngines === 0
                      ? '没有可用的引擎，所以读不出音色。先在上面「获取」一个国内引擎。'
                      : '正在读取音色…一直为空的话，多半是引擎缺中文离线语音包。'}
                    <button className="hint-link" onClick={() => void openVoicePack()}>
                      去下载中文语音包 ›
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="field">
            <div className="field__label">
              <span>语速</span>
              <span className="field__value">{tts.rate.toFixed(2)}×</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={tts.rate}
              onChange={(e) => setTts({ rate: Number(e.target.value) })}
            />
          </div>

          <div className="field">
            <div className="field__label">
              <span>音调</span>
              <span className="field__value">{tts.pitch.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.6}
              max={1.6}
              step={0.05}
              value={tts.pitch}
              onChange={(e) => setTts({ pitch: Number(e.target.value) })}
            />
          </div>

          <div className="field">
            <div className="field__label">
              <span>句间停顿</span>
              <span className="field__value">{tts.gapMs} ms</span>
            </div>
            <input
              type="range"
              min={0}
              max={1200}
              step={50}
              value={tts.gapMs}
              onChange={(e) => setTts({ gapMs: Number(e.target.value) })}
            />
          </div>

          {tts.provider === 'online' && (
            <>
              <div className="field">
                <div className="field__label">
                  <span>接口地址</span>
                </div>
                <input
                  className="text-input"
                  placeholder="https://api.openai.com/v1"
                  value={tts.onlineBaseUrl}
                  onChange={(e) => setTts({ onlineBaseUrl: e.target.value })}
                />
                <div className="field__hint">
                  兼容 OpenAI 的 /v1/audio/speech 协议，填到 /v1 即可。也可填硅基流动、火山等国内兼容网关。
                </div>
              </div>

              <div className="field">
                <div className="field__label">
                  <span>API Key</span>
                </div>
                <input
                  className="text-input"
                  type="password"
                  placeholder="sk-..."
                  value={tts.onlineApiKey}
                  onChange={(e) => setTts({ onlineApiKey: e.target.value })}
                />
                <div className="field__hint">只保存在本机，不会上传。请使用额度受限的 Key。</div>
              </div>

              <div className="field">
                <div className="field__label">
                  <span>模型</span>
                </div>
                <input
                  className="text-input"
                  placeholder="tts-1"
                  value={tts.onlineModel}
                  onChange={(e) => setTts({ onlineModel: e.target.value })}
                />
              </div>

              <div className="field">
                <div className="field__label">
                  <span>音色</span>
                </div>
                <input
                  className="text-input"
                  placeholder="alloy / nova / shimmer…"
                  value={tts.onlineVoice}
                  onChange={(e) => setTts({ onlineVoice: e.target.value })}
                />
              </div>
            </>
          )}

          <button
            className="danger-btn"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            onClick={() => void testVoice()}
            disabled={testing}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <IconHeadphone size={17} />
              {testing ? '试听中…' : '试听当前音色'}
            </span>
          </button>
        </section>

        {/* ---------------- 后台朗读守护 ---------------- */}
        {isNative() && (
          <section className="panel">
            <div className="panel__title">后台朗读守护</div>
            <p className="guard__desc">
              ColorOS 会冻结后台应用，锁屏几分钟就停。下面三项都放行，合上屏幕也能一直念。
            </p>
            <div className="guard">
              <div className="guard__row">
                <span className="guard__name">通知权限</span>
                <span className={`guard__state${status?.notifications ? ' ok' : ''}`}>
                  {status ? (status.notifications ? '已开启' : '未开启') : '检测中'}
                </span>
                <button className="guard__btn" onClick={() => void askNotification()}>
                  去开启
                </button>
              </div>
              <div className="guard__row">
                <span className="guard__name">忽略电池优化</span>
                <span className={`guard__state${status?.batteryWhitelisted ? ' ok' : ''}`}>
                  {status ? (status.batteryWhitelisted ? '已开启' : '未开启') : '检测中'}
                </span>
                <button className="guard__btn" onClick={() => void askBattery()}>
                  去设置
                </button>
              </div>
              <div className="guard__row">
                <span className="guard__name">自启动 / 后台运行</span>
                <span className="guard__state">需手动允许</span>
                <button className="guard__btn" onClick={() => void askAutoStart()}>
                  去设置
                </button>
              </div>
            </div>
            <div className="field__hint">
              另外在「设置 → 应用管理 → 听书阁 → 耗电管理」里选「允许后台活动」，锁屏后才不会断。
            </div>
          </section>
        )}

        {/* ---------------- 云同步 ---------------- */}
        <section className="panel">
          <div className="panel__title">
            云同步
            <span className="panel__sub">{lastSyncText}</span>
          </div>

          <div className="field">
            <div className="field__label">
              <span>同步方式</span>
            </div>
            <div className="segmented segmented--2">
              <button
                className={sync.provider === 'none' ? 'active' : ''}
                onClick={() => setSync({ provider: 'none' })}
              >
                关闭
              </button>
              <button
                className={sync.provider === 'webdav' ? 'active' : ''}
                onClick={() => setSync({ provider: 'webdav' })}
              >
                WebDAV 网盘
              </button>
            </div>
            <div className="field__hint">
              国内可用：<b>坚果云</b>（网页端「安全选项 → 添加应用密码」生成专用密码）、群晖、Nextcloud。
              百度网盘与夸克不开放个人 WebDAV，需要企业资质，所以没做。
            </div>
          </div>

          {sync.provider === 'webdav' && (
            <>
              <div className="field">
                <div className="field__label">
                  <span>服务器地址</span>
                </div>
                <input
                  className="text-input"
                  placeholder="https://dav.jianguoyun.com/dav/"
                  value={sync.url}
                  onChange={(e) => setSync({ url: e.target.value })}
                />
              </div>

              <div className="field">
                <div className="field__label">
                  <span>账号</span>
                </div>
                <input
                  className="text-input"
                  placeholder="坚果云登录邮箱"
                  value={sync.account}
                  onChange={(e) => setSync({ account: e.target.value })}
                />
              </div>

              <div className="field">
                <div className="field__label">
                  <span>应用密码</span>
                </div>
                <input
                  className="text-input"
                  type="password"
                  placeholder="不是登录密码，是应用密码"
                  value={sync.password}
                  onChange={(e) => setSync({ password: e.target.value })}
                />
                <div className="field__hint">
                  只保存在本机。数据放在网盘的 <code>readaloud/</code> 目录下：书单进度一个文件，每本书一个文件。
                </div>
              </div>

              <div className="sync-actions">
                <button className="ghost-btn" onClick={() => void doTestDav()} disabled={testingDav}>
                  {testingDav ? '连接中…' : '测试连接'}
                </button>
                <button className="ghost-btn" onClick={() => void doSync()} disabled={syncing}>
                  {syncing ? '同步中…' : '立即同步'}
                </button>
                <button className="ghost-btn" onClick={() => void doUploadAll()} disabled={syncing}>
                  上传全部书籍
                </button>
              </div>

              {(lastSummary || remoteCount !== null) && (
                <div className="sync-note">
                  {remoteCount !== null && <span>云端书库：{remoteCount} 本</span>}
                  {lastSummary && <span>{lastSummary}</span>}
                </div>
              )}

              <div className="switch-row">
                <span>
                  读完一章自动同步
                  <em className="switch-row__hint">只在有网时触发，失败不影响阅读</em>
                </span>
                <button
                  className={`switch${sync.auto ? ' on' : ''}`}
                  onClick={() => setSync({ auto: !sync.auto })}
                  aria-label="自动同步"
                >
                  <i />
                </button>
              </div>
            </>
          )}
        </section>

        {/* ---------------- 关于 ---------------- */}
        <section className="panel">
          <div className="panel__title">关于</div>
          <div className="stat-row">
            <span>版本</span>
            <span>1.5.0</span>
          </div>
          <div className="stat-row">
            <span>在线阅读</span>
            <span>7 种格式</span>
          </div>
          <div className="stat-row">
            <span>书籍与进度</span>
            <span>本机 · 可选云同步</span>
          </div>
          <div style={{ height: 10 }} />
        </section>
      </div>
    </div>
  );
}
