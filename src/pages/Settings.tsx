import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../store/useSettings';
import { initNativeTts, isNative, setImmersive, type NativeVoice } from '../lib/tts/native';
import { listWebVoices } from '../lib/tts/webSpeech';
import { EDGE_VOICES } from '../lib/tts/edge';
import { speechController } from '../lib/tts/controller';
import {
  FONT_OPTIONS,
  deleteCustomFont,
  ensureCustomFont,
  importCustomFont,
  listCustomFonts,
} from '../lib/fonts';
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

export function Settings({ onBack, onToast }: SettingsProps) {
  const { reader, tts, setReader, setTts } = useSettings();
  const [nativeVoices, setNativeVoices] = useState<NativeVoice[]>([]);
  const [testing, setTesting] = useState(false);
  const [customFonts, setCustomFonts] = useState<string[]>([]);
  const [fontFamilies, setFontFamilies] = useState<Record<string, string>>({});
  const fontInputRef = useRef<HTMLInputElement>(null);

  // 载入用户导入过的字体并注册到 document.fonts
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
    })();
  }, []);

  const handleImportFont = async (file?: File) => {
    if (!file) return;
    try {
      const name = await importCustomFont(file);
      const family = await ensureCustomFont(name);
      setCustomFonts((l) => (l.includes(name) ? l : [...l, name]));
      if (family) setFontFamilies((m) => ({ ...m, [name]: family }));
      setReader({ fontFamily: 'custom', customFont: name });
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

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await initNativeTts();
      if (alive) setNativeVoices(res.voices ?? []);
    };
    void load();
    // 原生 TTS 引擎初始化是异步的，稍后再拉一次音色列表
    const timer = setTimeout(() => void load(), 1600);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

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

  return (
    <div className="settings">
      <div className="settings__header">
        <button className="icon-btn" onClick={onBack} aria-label="返回">
          <IconBack />
        </button>
        <span className="settings__title">设置</span>
      </div>

      <div className="settings__body">
        {/* 阅读外观 */}
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

          <div className="field">
            <div className="field__label">
              <span>字体</span>
              <span className="field__value">
                {reader.fontFamily === 'custom' ? reader.customFont : FONT_OPTIONS.find((f) => f.id === reader.fontFamily)?.label}
              </span>
            </div>

            <div className="font-grid">
              {FONT_OPTIONS.map((f) => (
                <button
                  key={f.id}
                  className={`font-chip${reader.fontFamily === f.id ? ' active' : ''}`}
                  onClick={() => setReader({ fontFamily: f.id, customFont: undefined })}
                  title={f.desc}
                >
                  <span className="font-chip__sample" style={{ fontFamily: f.stack }}>
                    读书
                  </span>
                  <span className="font-chip__name">{f.label}</span>
                </button>
              ))}
              {customFonts.map((name) => {
                const active = reader.fontFamily === 'custom' && reader.customFont === name;
                const family = fontFamilies[name];
                return (
                  <button
                    key={name}
                    className={`font-chip${active ? ' active' : ''}`}
                    onClick={() => setReader({ fontFamily: 'custom', customFont: name })}
                    title="导入的字体"
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

            <div className="field__hint">
              安卓设备通常只自带黑体与宋体，圆体 / 楷体 / 仿宋在部分手机上会自动回退成宋体。
              想要真实字形，导入手机上已有的 .ttf 字体文件即可，字体只存在本机。
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
              全屏显示
              <em className="switch-row__hint">隐藏状态栏与导航栏，阅读区域更大</em>
            </span>
            <button
              className={`switch${reader.immersive ? ' on' : ''}`}
              onClick={() => void setImmersive(!reader.immersive).then(() => setReader({ immersive: !reader.immersive }))}
              aria-label="全屏显示"
            >
              <i />
            </button>
          </div>
        </section>

        {/* 朗读引擎 */}
        <section className="panel">
          <div className="panel__title">语音朗读</div>

          <div className="field">
            <div className="field__label">
              <span>朗读引擎</span>
              {!isNative() && <span className="field__value">浏览器预览模式</span>}
            </div>
            <div className="segmented segmented--3">
              <button className={tts.provider === 'native' ? 'active' : ''} onClick={() => setTts({ provider: 'native' })}>
                离线朗读
              </button>
              <button className={tts.provider === 'edge' ? 'active' : ''} onClick={() => setTts({ provider: 'edge' })}>
                Edge 免费
              </button>
              <button className={tts.provider === 'online' ? 'active' : ''} onClick={() => setTts({ provider: 'online' })}>
                在线 AI
              </button>
            </div>
            <div className="field__hint">
              {tts.provider === 'native'
                ? '调用手机本地语音，无需联网、不花钱；装成 APK 后可锁屏后台朗读，通知栏能暂停和切句。'
                : tts.provider === 'edge'
                  ? '微软 Edge 朗读的免费音色，无需 API Key，音色比系统 TTS 自然。需要联网；离开前台后可能被系统挂起，长时间收听建议用离线朗读。'
                  : '音色更自然，接近真人。需要联网并消耗第三方接口额度；后台播放能力受系统限制，建议前台收听。'}
            </div>
          </div>

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

          {tts.provider === 'native' && (
            <div className="field">
              <div className="field__label">
                <span>音色</span>
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
              {(nativeVoices.length === 0 && webVoices.length === 0) && (
                <div className="field__hint">
                  没检测到可用音色。请到系统设置里安装「文字转语音」引擎（如讯飞语记、Google 语音服务）。
                </div>
              )}
            </div>
          )}

          {tts.provider === 'edge' && (
            <div className="field">
              <div className="field__label">
                <span>音色</span>
                <span className="field__value">{EDGE_VOICES.length} 个可选</span>
              </div>
              <div className="voice-grid">
                {EDGE_VOICES.map((v) => (
                  <button
                    key={v.id}
                    className={`voice-chip${tts.edgeVoice === v.id ? ' active' : ''}`}
                    onClick={() => setTts({ edgeVoice: v.id })}
                  >
                    <span className="voice-chip__name">{v.name}</span>
                    <span className="voice-chip__desc">{v.desc}</span>
                  </button>
                ))}
              </div>
              <div className="field__hint">
                全部免费、无需 Key。选好后点下方「试听当前音色」确认。若连不上，先检查手机时间是否准确，或改回离线朗读。
              </div>
            </div>
          )}

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
                <div className="field__hint">兼容 OpenAI 的 /v1/audio/speech 协议，填到 /v1 即可。也可填硅基流动、火山等兼容网关。</div>
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

        {/* 账号与同步 */}
        <section className="panel">
          <div className="panel__title">账号与同步</div>
          <div className="field">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-soft)', fontSize: 13 }}>
              <IconCloud />
              <span>云端同步尚未开启</span>
            </div>
            <div className="field__hint">
              书架和阅读进度目前保存在本机。开启账号同步后，换手机也能接着上次的位置听。
            </div>
          </div>
          <button
            className="danger-btn"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            onClick={() => onToast('云端同步需要先部署后端，详见项目 README')}
          >
            了解如何开启
          </button>
        </section>

        {/* 关于 */}
        <section className="panel">
          <div className="panel__title">关于</div>
          <div className="stat-row">
            <span>版本</span>
            <span>1.2.0</span>
          </div>
          <div className="stat-row">
            <span>书籍与进度</span>
            <span>仅存储在本机</span>
          </div>
          <div style={{ height: 10 }} />
        </section>
      </div>
    </div>
  );
}
