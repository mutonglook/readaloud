import { useState } from 'react';
import { IconComment, IconHeart } from '../components/Icons';

const TABS = ['推荐', '关注', '话题'] as const;

interface Post {
  name: string;
  initial: string;
  color: string;
  time: string;
  text: string;
  quote: string;
  book: string;
  likes: number;
  comments: number;
}

const POSTS: Post[] = [
  {
    name: '山月记',
    initial: '山',
    color: '#c86a4a',
    time: '12 分钟前',
    text: '重读《桃花源记》，忽然觉得「遂迷，不复得路」才是全文最狠的一句——不是找不到，是再也回不去。',
    quote: '既出，得其船，便扶向路，处处志之。及郡下，诣太守，说如此。太守即遣人随其往，寻向所志，遂迷，不复得路。',
    book: '《桃花源记》· 陶渊明',
    likes: 128,
    comments: 32,
  },
  {
    name: '青简',
    initial: '青',
    color: '#4a7a8c',
    time: '1 小时前',
    text: '通勤路上听了半章《岳阳楼记》，AI 语音念「先天下之忧而忧」的时候，地铁刚好出站，天光一下子亮起来。',
    quote: '嗟夫！予尝求古仁人之心，或异二者之为，何哉？不以物喜，不以己悲。',
    book: '《岳阳楼记》· 范仲淹',
    likes: 86,
    comments: 15,
  },
  {
    name: '半盏灯',
    initial: '灯',
    color: '#7a6a3c',
    time: '3 小时前',
    text: '推荐把字号调到 20、行距 1.9，纸黄背景，夜里读半小时眼睛不酸。这条算是我的私人配方。',
    quote: '醉翁之意不在酒，在乎山水之间也。山水之乐，得之心而寓之酒也。',
    book: '《醉翁亭记》· 欧阳修',
    likes: 214,
    comments: 47,
  },
];

export function Discover() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('推荐');
  const [liked, setLiked] = useState<Record<number, boolean>>({});

  return (
    <div className="dc">
      <div className="dc__head">
        <div className="chips">
          {TABS.map((t) => (
            <button key={t} className={`chip${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {POSTS.map((p, i) => {
        const on = liked[i];
        return (
          <article className="dc__post" key={p.name}>
            <div className="dc__u">
              <div className="dc__avatar" style={{ background: p.color }}>
                {p.initial}
              </div>
              <div>
                <div className="dc__uname">{p.name}</div>
                <div className="dc__time">{p.time}</div>
              </div>
            </div>
            <p className="dc__text">{p.text}</p>
            <div className="dc__quote">{p.quote}</div>
            <div className="dc__bname">{p.book}</div>
            <div className="dc__foot">
              <button
                className={on ? 'liked' : ''}
                onClick={() => setLiked((s) => ({ ...s, [i]: !s[i] }))}
              >
                <IconHeart size={15} /> {p.likes + (on ? 1 : 0)}
              </button>
              <span>
                <IconComment size={15} /> {p.comments}
              </span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
