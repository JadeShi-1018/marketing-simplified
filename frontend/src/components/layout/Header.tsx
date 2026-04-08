// src/components/layout/Header.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Search, Bell, User, Check, Trash2, Settings } from 'lucide-react';
import Image from 'next/image';
import { useAuthStore } from '@/lib/authStore';
import { notificationsApi } from '@/lib/api/notificationsApi';
import { useNotificationStore } from '@/lib/notificationStore';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import type { NotificationItem } from '@/types/notifications';
import {
  buildNotificationsListHref,
  buildNotificationsPreferencesHref,
} from '@/lib/notificationsNavigation';
import { useNotificationDrawer } from '@/components/notifications/NotificationDrawerProvider';

interface HeaderProps {
  className?: string;
  onSearchChange?: (query: string) => void;
  searchPlaceholder?: string;
  user?: {
    name: string;
    email: string;
    avatar?: string;
    role?: string;
  };
  /** @deprecated Prefer live API when authenticated */
  notifications?: {
    count: number;
    items: Array<{
      id: string;
      title: string;
      message: string;
      time: string;
      read: boolean;
      type: 'info' | 'warning' | 'error' | 'success';
    }>;
  };
  onNotificationClick?: (id: string) => void;
  onUserMenuClick?: (action: 'profile' | 'settings' | 'logout') => void;
}

const Header: React.FC<HeaderProps> = ({
  className = '',
  onSearchChange,
  searchPlaceholder = 'Search for anything...',
  user = {
    name: 'Admin',
    email: 'admin@company.com',
    role: 'System Administrator',
  },
  notifications: notificationsProp,
  onNotificationClick,
  onUserMenuClick,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const notificationsListHref = buildNotificationsListHref(
    pathname,
    searchParams.toString()
  );
  const notificationsPreferencesHref = buildNotificationsPreferencesHref(
    pathname,
    searchParams.toString()
  );
  const token = useAuthStore((s) => s.token);
  const isAuthenticated = Boolean(token);
  const { openDrawer } = useNotificationDrawer();
  const {
    unreadCount: globalUnreadCount,
    lastRefresh,
    setUnreadCount: setGlobalUnreadCount,
    triggerRefresh,
  } = useNotificationStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [panelItems, setPanelItems] = useState<NotificationItem[]>([]);
  const [panelTotal, setPanelTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [panelLoading, setPanelLoading] = useState(false);

  const notificationRef = useRef<HTMLDivElement>(null);

  const loadNotificationsPanel = useCallback(async () => {
    if (!isAuthenticated) return;
    setPanelLoading(true);
    try {
      const { data } = await notificationsApi.list({ page_size: 20 });
      setPanelItems(data.results);
      setPanelTotal(data.count);
      setUnreadCount(data.unread_count);
      // Sync to global store
      setGlobalUnreadCount(data.unread_count);
    } catch {
      setPanelItems([]);
      setPanelTotal(0);
      setUnreadCount(0);
    } finally {
      setPanelLoading(false);
    }
  }, [isAuthenticated, setGlobalUnreadCount]);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadNotificationsPanel();
  }, [isAuthenticated, loadNotificationsPanel]);

  // Re-fetch when notifications page triggers a refresh
  useEffect(() => {
    if (!isAuthenticated) return;
    loadNotificationsPanel();
  }, [lastRefresh, isAuthenticated, loadNotificationsPanel]);

  useEffect(() => {
    if (showNotifications && isAuthenticated) {
      loadNotificationsPanel();
    }
  }, [showNotifications, isAuthenticated, loadNotificationsPanel]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value;
    setSearchQuery(query);
    onSearchChange?.(query);
  };

  const handleMarkAllRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) return;
    try {
      await notificationsApi.markRead({ mark_all: true });
      await loadNotificationsPanel();
      triggerRefresh();
    } catch {
      /* ignore */
    }
  };

  const handleClearPanel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated || panelItems.length === 0) return;
    try {
      await notificationsApi.clear({
        scope: 'ids',
        ids: panelItems.map((n) => n.id),
      });
      await loadNotificationsPanel();
      triggerRefresh();
    } catch {
      /* ignore */
    }
  };

  const handleNotificationRowClick = (item: NotificationItem) => {
    onNotificationClick?.(item.id);
    setShowNotifications(false);
    openDrawer(item);
  };

  const useLegacyPanel = Boolean(notificationsProp) && !isAuthenticated;
  const legacyItems = notificationsProp?.items ?? [];
  const legacyUnread = useLegacyPanel
    ? legacyItems.filter((item) => !item.read).length
    : 0;
  // Use global store for immediate updates, fallback to local state
  const badgeCount = isAuthenticated
    ? (globalUnreadCount > 0 ? globalUnreadCount : unreadCount)
    : legacyUnread;

  return (
    <header className={`bg-white border-b border-gray-200 ${className}`}>
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Image
              src="/homepage_logo_square.jpeg"
              alt="Marketing Simplified Logo"
              width={278}
              height={69}
              className="h-16 w-auto"
              priority
            />
            <h1 className="text-3xl font-bold">
              <span className="text-blue-800">Marketing</span>
              <span className="text-gray-900"> Simplified</span>
            </h1>
          </div>

          <div className="flex-1 max-w-lg mx-8">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={handleSearchChange}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative" ref={notificationRef}>
              <button
                type="button"
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full transition-colors duration-200"
                aria-label="Notifications"
              >
                <Bell className="h-6 w-6" />
                {badgeCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-h-[1.25rem] min-w-[1.25rem] px-1 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50 flex flex-col max-h-[min(28rem,80vh)]">
                  <div className="p-4 border-b border-gray-100 shrink-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                          title="Mark all as read"
                          onClick={handleMarkAllRead}
                          disabled={!isAuthenticated || panelLoading}
                        >
                          <Check className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                          title="Clear panel"
                          onClick={handleClearPanel}
                          disabled={!isAuthenticated || panelLoading || panelItems.length === 0}
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                        <Link
                          href={notificationsPreferencesHref}
                          className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                          title="Notification preferences"
                          onClick={() => setShowNotifications(false)}
                        >
                          <Settings className="h-5 w-5" />
                        </Link>
                      </div>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {useLegacyPanel
                        ? `${notificationsProp?.count ?? 0} total`
                        : `${panelTotal} total · ${unreadCount} unread`}
                    </p>
                  </div>

                  <div className="overflow-y-auto flex-1 px-2 pb-2">
                    {useLegacyPanel ? (
                      <div className="space-y-2 pt-2">
                        {legacyItems.map((item) => (
                          <div
                            key={item.id}
                            role="button"
                            tabIndex={0}
                            className={`p-3 rounded-lg border cursor-pointer transition-colors hover:bg-gray-50 ${
                              item.read ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200'
                            }`}
                            onClick={() => {
                              onNotificationClick?.(item.id);
                              setShowNotifications(false);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                onNotificationClick?.(item.id);
                                setShowNotifications(false);
                              }
                            }}
                          >
                            <div className="flex items-start gap-3">
                              {!item.read && (
                                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm ${!item.read ? 'font-semibold text-gray-900' : 'text-gray-800'}`}>
                                  {item.title}
                                </p>
                                <p className="text-sm text-gray-600 mt-0.5">{item.message}</p>
                                <p className="text-xs text-gray-400 mt-1">{item.time}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : panelLoading ? (
                      <p className="text-center py-8 text-gray-500 text-sm">Loading…</p>
                    ) : panelItems.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <Bell className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                        <p className="text-sm">No notifications</p>
                      </div>
                    ) : (
                      <div className="space-y-2 pt-2">
                        {panelItems.map((item) => (
                          <div
                            key={item.id}
                            role="button"
                            tabIndex={0}
                            className={`p-3 rounded-lg border cursor-pointer transition-colors hover:bg-gray-50 ${
                              item.is_read ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200'
                            }`}
                            onClick={() => handleNotificationRowClick(item)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') handleNotificationRowClick(item);
                            }}
                          >
                            <div className="flex items-start gap-3">
                              {!item.is_read && (
                                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-hidden />
                              )}
                              <div className="flex-1 min-w-0">
                                <p
                                  className={`text-sm ${
                                    !item.is_read ? 'font-semibold text-gray-900' : 'text-gray-800'
                                  }`}
                                >
                                  {item.title}
                                </p>
                                {item.body ? (
                                  <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">{item.body}</p>
                                ) : null}
                                <p className="text-xs text-gray-400 mt-1">
                                  {formatRelativeTime(item.created_at)}
                                </p>
                                <button
                                  type="button"
                                  className="text-xs text-blue-600 hover:underline mt-1"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleNotificationRowClick(item);
                                  }}
                                >
                                  View full notification
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-gray-100 p-3 text-center shrink-0">
                    <Link
                      href={notificationsListHref}
                      className="text-sm font-medium text-blue-600 hover:text-blue-800"
                      onClick={() => setShowNotifications(false)}
                    >
                      View all notifications
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <div>
              <button
                onClick={() => onUserMenuClick?.('profile')}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
                aria-label="Go to profile"
              >
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-700">{user.name}</div>
                  {user.role && <div className="text-xs text-gray-500">{user.role}</div>}
                </div>
                <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center overflow-hidden">
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                    <User className="h-5 w-5 text-gray-600" />
                  )}
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
