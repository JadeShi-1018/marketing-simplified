'use client';

import type { ReactNode } from 'react';
import {
  Bell,
  FolderOpen,
  Home,
  MessageSquare,
} from 'lucide-react';
import { useNotificationStore } from '@/lib/notificationStore';

export type MessagesNavView = 'home' | 'dms' | 'activity' | 'files';

interface NavRailProps {
  active: MessagesNavView;
  onChange: (view: MessagesNavView) => void;
}

export default function NavRail({ active, onChange }: NavRailProps) {
  const chatActivityCount = useNotificationStore((s) => s.chatActivityCount);

  const ITEMS: { id: MessagesNavView; label: string; icon: ReactNode; badge?: number }[] = [
    { id: 'home', label: 'Home', icon: <Home className="w-5 h-5" /> },
    { id: 'dms', label: 'DMs', icon: <MessageSquare className="w-5 h-5" /> },
    {
      id: 'activity',
      label: 'Activity',
      icon: <Bell className="w-5 h-5" />,
      badge: chatActivityCount,
    },
    { id: 'files', label: 'Files', icon: <FolderOpen className="w-5 h-5" /> },
  ];

  return (
    <nav
      className="w-14 sm:w-[4.5rem] h-full flex flex-col items-stretch gap-1 py-3 px-1.5 border-r border-gray-200 bg-gray-50/80"
      data-testid="messages-nav-rail"
      aria-label="Messages navigation"
    >
      {ITEMS.map((item) => {
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={[
              'relative flex flex-col items-center gap-0.5 rounded-lg py-2 px-1 text-[10px] font-medium transition-colors',
              isActive
                ? 'bg-white text-[#3CCED7] shadow-sm border border-[#3CCED7]/30'
                : 'text-gray-600 hover:bg-white/80 hover:text-gray-900 border border-transparent',
            ].join(' ')}
            aria-current={isActive ? 'page' : undefined}
            data-testid={`messages-nav-${item.id}`}
          >
            <span className={`relative ${isActive ? 'text-[#3CCED7]' : 'text-gray-500'}`}>
              {item.icon}
              {item.badge != null && item.badge > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[#3CCED7] px-1 text-[9px] font-bold text-white leading-none">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </span>
            <span className="leading-tight text-center">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
