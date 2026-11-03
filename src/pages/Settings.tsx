import { useEffect, useState } from 'react';
import { useSettings } from '../store/useSettings';
import { initNativeTts, isNative, type NativeVoice } from '../lib/tts/native';
import { listWebVoices } from '../lib/tts/webSpeech';
import { speechController } from '../lib/tts/controller';
import type { ThemeId } from '../types';
import { IconBack, IconCloud, IconHeadphone } from '../components/Icons';

interface SettingsProps {
  onBack: () => void;
  onToast: (msg: string) => void;
}

const THEMES: { id: ThemeId; label: string; bg: string; fg: string }[] = [
  { id: 'paper', label: '纸质', bg: '#f6f1e7', fg: '#33302b' },
  { id: 'eye', label: '护眼', bg: '#cfe6cf', fg: '#26382a' },
  { id: 'parchment', label: '羊皮', bg: '#e8d9bd', fg: '#453322' },
  { id: 'night', label: '夜间', bg: '#14140f', fg: '#b9b4a8' },
];

export function Settings({ onBack, onToast }: SettingsProps) {
  const { reader, tts, setReader, setTts } = useSettings();
  const [nativeVoices, setNativeVoices] = useState<NativeVoice[]>([]);
  const [testing, setTesting] = useState(false);

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
            </div>
            <div className="segmented">
              <button className={reader.fontFamily === 'serif' ? 'active' : ''} onClick={() => setReader({ fontFamily: 'serif' })}>
                宋体 · 适合长读
              </button>
              <button className={reader.fontFamily === 'sans' ? 'active' : ''} onClick={() => setReader({ fontFamily: 'sans' })}>
                黑体 · 更清晰
              </button>
            </div>
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
        </section>

        {/* 朗读引擎 */}
        <section className="panel">
          <div className="panel__title">语音朗读</div>

          <div className="field">
            <div className="field__label">
              <span>朗读引擎</span>
              {!isNative() && <span className="field__value">浏览器预览模式</span>}
            </div>
            <div className="segmented">
              <button className={tts.provider === 'native' ? 'active' : ''} onClick={() => setTts({ provider: 'native' })}>
                离线朗读
              </button>
              <button className={tts.provider === 'online' ? 'active' : ''} onClick={() => setTts({ provider: 'online' })}>
                在线 AI 语音
              </button>
            </div>
            <div className="field__hint">
              {tts.provider === 'native'
                ? '调用手机本地语音，无需联网、不花钱；装成 APK 后可锁屏后台朗读，通知栏能暂停和切句。'
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
            <span>1.0.0</span>
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
