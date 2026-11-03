import type { ReactNode } from 'react';
import { IconShelf, IconUser } from './Icons';

export type TabKey = 'shelf' | 'mine';

interface TabDef {
  key: TabKey;
  label: string;
  icon: ReactNode;
}

/** 掌阅 8.8.1 的底部通栏是「书架 / 书城 / 发现 / 我的」，这里只保留本地可用的两项 */
const TABS: TabDef[] = [
  { key: 'shelf', label: '书架', icon: <IconShelf /> },
  { key: 'mine', label: '我的', icon: <IconUser /> },
];

interface TabBarProps {
  active: TabKey;
  onChange: (key: TabKey) => void;
}

export function TabBar({ active, onChange }: TabBarProps) {
  return (
    <nav className="tabbar" role="tablist">
      {TABS.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          className={`tabbar__item${active === t.key ? ' active' : ''}`}
          onClick={() => onChange(t.key)}
        >
          <i>{t.icon}</i>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
