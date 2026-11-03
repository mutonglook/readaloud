import { useEffect, useState } from 'react';
import {
  IconChevron,
  IconClock,
  IconFire,
  IconGift,
  IconLayers,
  IconRank,
  IconSearch,
  IconSound,
  IconSparkle,
  IconCheck,
} from '../components/Icons';

interface StoreProps {
  onToast: (msg: string) => void;
}

const CHANNELS = ['推荐', '出版', '男生', '女生', '漫画', '听书'];

const BANNERS = [
  {
    kicker: '今日限免 · 仅 24 小时',
    title: '浮生六记',
    desc: '沈复笔下的烟火人间，一键加入书架永久保留',
    from: '#4a5b7a',
    to: '#1f2733',
  },
  {
    kicker: '新书首发',
    title: '世说新语',
    desc: '一千五百年前的名士清谈，碎片时间读一则正好',
    from: '#8c5a3c',
    to: '#4a2c1c',
  },
  {
    kicker: '主编推荐',
    title: '唐诗三百首',
    desc: '配注释与朗读音频，通勤路上听两首',
    from: '#4b6b5a',
    to: '#25362c',
  },
];

const CATS = [
  { label: '免费', icon: <IconGift size={21} />, color: '#ff7a3d' },
  { label: '限时', icon: <IconClock size={21} />, color: '#f0a33c' },
  { label: '榜单', icon: <IconRank size={21} />, color: '#e2603f' },
  { label: '完本', icon: <IconCheck size={16} />, color: '#4fa06a' },
  { label: '新书', icon: <IconSparkle size={21} />, color: '#5a86c9' },
  { label: '有声', icon: <IconSound size={21} />, color: '#8a6fc4' },
  { label: '漫画', icon: <IconLayers size={21} />, color: '#d2638a' },
  { label: '分类', icon: <IconFire size={21} />, color: '#7e8a96' },
];

const RANK_TABS = ['热读榜', '新书榜', '好评榜'];

const RANKS: Record<string, { name: string; desc: string; tag: string }[]> = {
  热读榜: [
    { name: '红楼梦', desc: '曹雪芹 · 古典 · 120 回', tag: '经典' },
    { name: '三国演义', desc: '罗贯中 · 历史 · 120 回', tag: '热读' },
    { name: '西游记', desc: '吴承恩 · 神魔 · 100 回', tag: '免费' },
    { name: '水浒传', desc: '施耐庵 · 侠义 · 120 回', tag: '经典' },
    { name: '聊斋志异', desc: '蒲松龄 · 志怪 · 491 篇', tag: '好评' },
  ],
  新书榜: [
    { name: '镜花缘', desc: '李汝珍 · 奇幻 · 100 回', tag: '新版' },
    { name: '老残游记', desc: '刘鹗 · 游记 · 20 回', tag: '新版' },
    { name: '儒林外史', desc: '吴敬梓 · 讽刺 · 56 回', tag: '精校' },
    { name: '阅微草堂笔记', desc: '纪昀 · 笔记 · 24 卷', tag: '新版' },
    { name: '东京梦华录', desc: '孟元老 · 史料 · 10 卷', tag: '精校' },
  ],
  好评榜: [
    { name: '史记', desc: '司马迁 · 纪传 · 130 篇', tag: '9.8' },
    { name: '世说新语', desc: '刘义庆 · 笔记 · 36 门', tag: '9.7' },
    { name: '浮生六记', desc: '沈复 · 自传 · 6 卷', tag: '9.6' },
    { name: '唐诗三百首', desc: '蘅塘退士 · 诗集 · 313 首', tag: '9.6' },
    { name: '古文观止', desc: '吴楚材 · 选本 · 222 篇', tag: '9.5' },
  ],
};

const RECS = [
  { name: '古文观止', by: '吴楚材 编', from: '#6a5b7a', to: '#2f2637' },
  { name: '人间词话', by: '王国维', from: '#3f5a6b', to: '#1e2c34' },
  { name: '菜根谭', by: '洪应明', from: '#5d6b3f', to: '#2c341c' },
  { name: '小窗幽记', by: '陈继儒', from: '#7a5b4a', to: '#38251c' },
  { name: '幽梦影', by: '张潮', from: '#4f5b7a', to: '#232a38' },
];

export function Store({ onToast }: StoreProps) {
  const [channel, setChannel] = useState('推荐');
  const [slide, setSlide] = useState(0);
  const [rankTab, setRankTab] = useState('热读榜');

  // 焦点图自动轮播
  useEffect(() => {
    const t = setInterval(() => setSlide((v) => (v + 1) % BANNERS.length), 4200);
    return () => clearInterval(t);
  }, []);

  const demo = () => onToast('书城为界面示例，书架里的书才是本地内容');

  return (
    <div className="st">
      <div className="st__head">
        <div className="search st__search" onClick={demo}>
          <span className="search__icon">
            <IconSearch size={17} />
          </span>
          <input className="search__input" placeholder="搜书名 / 作者 / 分类" readOnly />
        </div>
        <div className="st__tabs">
          {CHANNELS.map((c) => (
            <button
              key={c}
              className={`st__tab${channel === c ? ' active' : ''}`}
              onClick={() => setChannel(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="banner" onClick={demo}>
        {BANNERS.map((b, i) => (
          <div
            key={b.title}
            className={`banner__slide${i === slide ? ' on' : ''}`}
            style={{ background: `linear-gradient(135deg, ${b.from}, ${b.to})` }}
          >
            <div className="banner__kicker">{b.kicker}</div>
            <div className="banner__title">{b.title}</div>
            <div className="banner__desc">{b.desc}</div>
          </div>
        ))}
        <div className="banner__dots">
          {BANNERS.map((b, i) => (
            <i key={b.title} className={i === slide ? 'on' : ''} />
          ))}
        </div>
      </div>

      <div className="cats">
        {CATS.map((c) => (
          <button key={c.label} className="cat" onClick={demo}>
            <span className="cat__ico" style={{ background: c.color }}>
              {c.icon}
            </span>
            {c.label}
          </button>
        ))}
      </div>

      <div className="sec">
        <div className="sec__head">
          <span className="sec__title">榜单</span>
          <button className="sec__more" onClick={demo}>
            完整榜单 <IconChevron size={13} />
          </button>
        </div>
        <div className="rank__tabs">
          {RANK_TABS.map((t) => (
            <button
              key={t}
              className={`rank__tab${rankTab === t ? ' on' : ''}`}
              onClick={() => setRankTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        {RANKS[rankTab].map((r, i) => (
          <div className="rank__item" key={r.name} onClick={demo}>
            <span className={`rank__no${i < 3 ? ' top' : ''}`}>{i + 1}</span>
            <div className="rank__body">
              <div className="rank__name">{r.name}</div>
              <div className="rank__desc">{r.desc}</div>
            </div>
            <span className="rank__tag">{r.tag}</span>
          </div>
        ))}
      </div>

      <div className="sec">
        <div className="sec__head">
          <span className="sec__title">主编推荐</span>
          <button className="sec__more" onClick={demo}>
            换一批 <IconChevron size={13} />
          </button>
        </div>
        <div className="hscroll">
          {RECS.map((r) => (
            <div className="rec" key={r.name} onClick={demo}>
              <div className="rec__cover">
                <span style={{ background: `linear-gradient(150deg, ${r.from}, ${r.to})` }}>
                  {r.name}
                </span>
              </div>
              <div className="rec__name">{r.name}</div>
              <div className="rec__by">{r.by}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
