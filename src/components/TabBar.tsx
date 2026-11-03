import type { ReactNode } from 'react';
import { IconCompass, IconShelf, IconStore, IconUser } from './Icons';

export type TabKey = 'shelf' | 'store' | 'discover' | 'mine';

interface TabDef {
  key: TabKey;
  label: string;
  icon: ReactNode;
}

const TABS: TabDef[] = [
  { key: 'shelf', label: '书架', icon: <IconShelf /> },
  { key: 'store', label: '书城', icon: <IconStore /> },
  { key: 'discover', label: '发现', icon: <IconCompass /> },
  { key: 'mine', label: '我的', icon: <IconUser /> },
];

interface TabBarProps {
  active: TabKey;
  onChange: (key: TabKey) => void;
}

/** 底部四页签，对应掌阅的「读书 / 书城 / 发现 / 我的」 */
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
