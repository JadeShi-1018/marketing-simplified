'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { AtSign, BellOff, Bell, BellRing, Check, ChevronDown, ChevronRight, Clock, FolderOpen, Hash, Home, Info, LogOut, MessageSquare, MessagesSquare, Pencil, Plus, Search, Star, Trash2, User, Users, X } from 'lucide-react';
import { useCustomSections } from '@/hooks/useCustomSections';
import type { CustomSection } from '@/hooks/useCustomSections';
import type { Chat } from '@/types/chat';
import { useAuthStore } from '@/lib/authStore';
import { useChatStore } from '@/lib/chatStore';
import {
  leaveChat,
  listStarredChats,
  markChatAsRead,
  reorderStarredChats,
  starChat,
  unstarChat,
  updateNotificationSettings,
} from '@/lib/api/chatApi';
import { TEMP_MUTE_OPTIONS, formatMutedUntil, getTemporaryMuteUntil, isParticipantCurrentlyMuted } from '@/lib/chatMute';
import toast from 'react-hot-toast';
import type { MessagesNavView } from './NavRail';
import FilesSidebarView from './FilesSidebarView';
import ActivitySidebarView from './ActivitySidebarView';
import ProjectMembersSection from './ProjectMembersSection';
import type { ProjectMemberData } from '@/lib/api/projectApi';
import { Skeleton } from '@/components/ui/skeleton';
import SidebarChatRow from './SidebarChatRow';
import { MAX_CHANNEL_NAME_LENGTH, MAX_SIDEBAR_SECTION_NAME_LENGTH, limitName, normalizeLimitedName } from '@/lib/messages/nameLimits';

function normalizeChat(c: Chat): Chat {
  const raw = c.project_id ?? (c as { project?: number }).project;
  const project_id = Number(raw);
  return Number.isFinite(project_id) ? { ...c, project_id } : c;
}

/** Most recent activity timestamp for a chat — used for newest-first list ordering. */
function chatActivityTs(chat: Chat): number {
  const ts = chat.last_message?.created_at ?? chat.updated_at ?? chat.created_at;
  return ts ? new Date(ts).getTime() : 0;
}

interface HomeSidebarProps {
  view: MessagesNavView;
  onChangeView: (view: MessagesNavView) => void;
  selectedProjectId: number | null;
  chats: Chat[];
  currentChatId: number | null;
  onSelectChat: (chatId: number) => void;
  onCreateChat: () => void;
  onCreateChannel: () => void;
  isLoading: boolean;
  emptyState: React.ReactNode;
  roleByUserId?: Record<number, string>;
  projectMembers: ProjectMemberData[];
  isLoadingMembers: boolean;
  onStartDM: (userId: number) => void;
  isSearchActive?: boolean;
  onSearchInChat?: (chatId: number) => void;
  onOpenChannelDetails?: (chatId: number) => void;
}

function Section({
  title,
  icon,
  headerExtra,
  children,
  headerRowClassName,
}: {
  title: string;
  icon: React.ReactNode;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  headerRowClassName?: string;
}) {
  return (
    <div className="mt-3">
      <div
        className={[
          'px-3 flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase tracking-wide',
          headerRowClassName ?? '',
        ].join(' ')}
      >
        <span className="text-gray-500">{icon}</span>
        <span className="min-w-0 flex-1 truncate" title={title}>{title}</span>
        {headerExtra}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function SidebarRowsSkeleton({
  rows = 4,
  withHeading = false,
  variant = 'chat',
}: {
  rows?: number;
  withHeading?: boolean;
  variant?: 'chat' | 'member';
}) {
  const isMember = variant === 'member';
  return (
    <div className="px-3 py-2">
      {withHeading ? <Skeleton className="mb-3 h-3 w-24" /> : null}
      <div className="space-y-0.5">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={`messages-sidebar-skeleton-${index}`}
            className="flex min-h-[36px] items-center gap-2 rounded-md px-3 py-1.5"
            data-testid="messages-sidebar-skeleton-row"
            data-skeleton-variant={variant}
          >
            <Skeleton className={isMember ? 'h-6 w-6 rounded-full' : 'h-4 w-4 rounded'} />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SearchEmptyIcon() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-400">
      <Search className="h-4 w-4" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// ChatContextMenu
// ---------------------------------------------------------------------------

interface ContextMenuState {
  chat: Chat;
  x: number;
  y: number;
}

interface ChatContextMenuProps {
  menu: ContextMenuState;
  currentUserId: number | null;
  onClose: () => void;
  onMarkAsRead: (chatId: number) => void;
  onNotificationChange: (chat: Chat, level: 'all' | 'mentions' | 'muted', mutedUntil?: string | null) => void;
  onLeave: (chatId: number) => void;
  onOpenChannelDetails: (chatId: number) => void;
  onSearchInChat: (chatId: number) => void;
}

function ChatContextMenu({ menu, currentUserId, onClose, onMarkAsRead, onNotificationChange, onLeave, onOpenChannelDetails, onSearchInChat }: ChatContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { chat, x, y } = menu;

  const myParticipant = (chat.participants ?? []).find((p) => p.user.id === currentUserId);
  const isMuted = isParticipantCurrentlyMuted(myParticipant);
  const isTemporarilyMuted = Boolean(isMuted && myParticipant?.muted_until);
  const notifLevel = myParticipant?.notification_level ?? 'all';
  const activeLevel: 'all' | 'mentions' | 'muted' = isMuted ? 'muted' : notifLevel === 'mentions' ? 'mentions' : 'all';
  const isGroup = chat.type === 'group';
  const hasUnread = (chat.unread_count ?? 0) > 0;

  // Adjust position so menu stays inside viewport
  const [pos, setPos] = useState({ x, y });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      x: x + rect.width > window.innerWidth ? x - rect.width : x,
      y: y + rect.height > window.innerHeight ? y - rect.height : y,
    });
  }, [x, y]);

  // Close on outside click or Escape
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const item = (icon: React.ReactNode, label: string, onClick: () => void, danger = false) => (
    <button
      type="button"
      onClick={() => { onClick(); onClose(); }}
      className={[
        'flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-sm transition-colors',
        danger
          ? 'text-red-600 hover:bg-red-50'
          : 'text-gray-700 hover:bg-gray-100',
      ].join(' ')}
    >
      <span className="h-4 w-4 shrink-0">{icon}</span>
      {label}
    </button>
  );

  return createPortal(
    <div
      ref={ref}
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[200] min-w-[180px] rounded-xl border border-gray-200 bg-white py-1.5 shadow-xl"
      onContextMenu={(e) => e.preventDefault()}
    >
      {hasUnread && item(<BellRing className="h-4 w-4" />, 'Mark as read', () => onMarkAsRead(chat.id))}
      {item(<Info className="h-4 w-4" />, isGroup ? 'Channel details' : 'Conversation details', () => onOpenChannelDetails(chat.id))}
      {item(<Search className="h-4 w-4" />, isGroup ? 'Search in channel' : 'Search in conversation', () => onSearchInChat(chat.id))}
      <div className="my-1 border-t border-gray-100" />
      <p className="px-3 pb-1 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">Notify you about…</p>
      {(['all', 'mentions', 'muted'] as const).map((level) => {
        const active = activeLevel === level;
        const icon = level === 'all' ? <Bell className="h-4 w-4" /> : level === 'mentions' ? <AtSign className="h-4 w-4" /> : <BellOff className="h-4 w-4" />;
        const label = level === 'all' ? 'All new posts' : level === 'mentions' ? 'Just mentions' : 'Mute and hide';
        return (
          <button
            key={level}
            type="button"
            onClick={() => { onNotificationChange(chat, level); onClose(); }}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100"
          >
            <span className="h-4 w-4 shrink-0 text-gray-400">{icon}</span>
            <span className="flex-1">{label}</span>
            {active && <Check className="h-3.5 w-3.5 shrink-0 text-[#3CCED7]" />}
          </button>
        );
      })}
      <div className="my-1 border-t border-gray-100" />
      <p className="px-3 pb-1 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">Temporarily mute</p>
      {TEMP_MUTE_OPTIONS.map((option) => {
        const mutedUntil = getTemporaryMuteUntil(option.id).toISOString();
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => { onNotificationChange(chat, 'muted', mutedUntil); onClose(); }}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100"
          >
            <Clock className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="flex-1">{option.label}</span>
          </button>
        );
      })}
      {isTemporarilyMuted && myParticipant?.muted_until && (
        <p className="px-3 py-1 text-xs text-gray-400">
          Muted until {formatMutedUntil(myParticipant.muted_until)}
        </p>
      )}
      {isGroup && (
        <>
          <div className="my-1 border-t border-gray-100" />
          {item(<LogOut className="h-4 w-4" />, 'Leave channel', () => onLeave(chat.id), true)}
        </>
      )}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// CustomSectionBlock — a user-created collapsible section
// ---------------------------------------------------------------------------

interface CustomSectionBlockProps {
  section: CustomSection;
  availableChats: import('@/types/chat').Chat[];
  currentChatId: number | null;
  currentUserId: number | null;
  onSelectChat: (chatId: number) => void;
  onToggleCollapsed: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onAddChat: (chatId: number) => void;
  onRemoveChat: (chatId: number) => void;
  onContextMenu: (chat: Chat) => (e: React.MouseEvent<HTMLElement>) => void;
  starredIdSet: Set<number>;
  onStarToggle: (chatId: number) => void;
}

function CustomSectionBlock({
  section,
  availableChats,
  currentChatId,
  currentUserId,
  onSelectChat,
  onToggleCollapsed,
  onRename,
  onDelete,
  onAddChat,
  onRemoveChat,
  onContextMenu,
  starredIdSet,
  onStarToggle,
}: CustomSectionBlockProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(section.name);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  // Resolve chats in this section that still exist in the live chat list
  const sectionChats = useMemo(
    () => section.chatIds.map((id) => availableChats.find((c) => c.id === id)).filter(Boolean) as import('@/types/chat').Chat[],
    [section.chatIds, availableChats]
  );

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (
        pickerRef.current && !pickerRef.current.contains(e.target as Node) &&
        addButtonRef.current && !addButtonRef.current.contains(e.target as Node)
      ) {
        setShowPicker(false);
        setPickerQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  const commitRename = () => {
    const trimmed = normalizeLimitedName(editValue, MAX_SIDEBAR_SECTION_NAME_LENGTH);
    if (trimmed) onRename(trimmed);
    setIsEditing(false);
  };

  const pickerChats = useMemo(() => {
    const q = pickerQuery.toLowerCase();
    return availableChats.filter((c) =>
      (c.name ?? '').toLowerCase().includes(q)
    );
  }, [availableChats, pickerQuery]);

  return (
    <div className="custom-section mt-3">
      {/* Section header */}
      <div className="group flex items-center gap-1 px-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-700"
          aria-label={section.collapsed ? 'Expand section' : 'Collapse section'}
        >
          {section.collapsed
            ? <ChevronRight className="h-3.5 w-3.5" />
            : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {isEditing ? (
          <input
            ref={nameInputRef}
            value={editValue}
            onChange={(e) => setEditValue(limitName(e.target.value, MAX_SIDEBAR_SECTION_NAME_LENGTH))}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setEditValue(limitName(section.name, MAX_SIDEBAR_SECTION_NAME_LENGTH)); setIsEditing(false); } }}
            maxLength={MAX_SIDEBAR_SECTION_NAME_LENGTH}
            className="flex-1 min-w-0 text-xs font-semibold uppercase tracking-wide text-gray-700 outline-none border-b border-teal-400 bg-transparent"
            autoFocus
          />
        ) : (
          <span className="flex-1 min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-gray-600" title={section.name}>
            {limitName(section.name, MAX_SIDEBAR_SECTION_NAME_LENGTH)}
          </span>
        )}

        {/* Edit name */}
        <button
          type="button"
          onClick={() => { setEditValue(limitName(section.name, MAX_SIDEBAR_SECTION_NAME_LENGTH)); setIsEditing(true); setTimeout(() => nameInputRef.current?.select(), 0); }}
          className="shrink-0 rounded p-0.5 text-gray-400 opacity-0 transition hover:text-gray-700 group-hover:opacity-100 [.custom-section:hover_&]:opacity-100"
          aria-label="Rename section"
          title="Rename section"
        >
          <Pencil className="h-3 w-3" />
        </button>

        {/* Add channel */}
        <div className="relative shrink-0">
          <button
            ref={addButtonRef}
            type="button"
            onClick={() => {
              const rect = addButtonRef.current?.getBoundingClientRect();
              if (rect) setPickerPos({ top: rect.bottom + 4, left: rect.left });
              setShowPicker((v) => !v);
              setPickerQuery('');
            }}
            className="rounded p-0.5 text-gray-400 hover:text-gray-700"
            aria-label="Add channel to section"
            title="Add channel"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>

          {showPicker && createPortal(
            <div
              ref={pickerRef}
              style={{ top: pickerPos.top, left: pickerPos.left }}
              className="fixed z-[200] w-52 rounded-xl border border-gray-200 bg-white p-2 shadow-lg"
            >
              <input
                type="text"
                placeholder="Search channels…"
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                className="mb-1.5 w-full rounded-md border border-gray-200 px-2 py-1 text-xs outline-none focus:border-teal-400"
                autoFocus
              />
              <ul className="task-tab-scrollbar max-h-48 overflow-y-auto">
                {pickerChats.length === 0 ? (
                  <li className="px-2 py-3 text-center text-xs text-gray-400">No channels found</li>
                ) : pickerChats.map((c) => {
                  const inSection = section.chatIds.includes(c.id);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (inSection) onRemoveChat(c.id);
                          else onAddChat(c.id);
                        }}
                        className={[
                          'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs',
                          inSection ? 'bg-teal-50 text-teal-700' : 'text-gray-700 hover:bg-gray-50',
                        ].join(' ')}
                      >
                        <Hash className="h-3 w-3 shrink-0" />
                        <span className="flex-1 truncate">{c.name || 'untitled'}</span>
                        {inSection && <X className="h-3 w-3 shrink-0" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>,
            document.body
          )}
        </div>

        {/* Delete section */}
        {confirmingDelete ? (
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { onDelete(); setConfirmingDelete(false); }}
              className="rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-red-600"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded px-1.5 py-0.5 text-[10px] text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </span>
        ) : (
          <div className="group/del relative shrink-0">
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="rounded p-0.5 text-gray-400 hover:text-red-500"
              aria-label="Delete section"
            >
              <Trash2 className="h-3 w-3" />
            </button>
            <div className="pointer-events-none absolute bottom-full right-0 mb-1.5 hidden group-hover/del:block z-50">
              <div className="whitespace-nowrap rounded-md bg-white px-2 py-1 text-[11px] text-gray-700 shadow-md ring-1 ring-gray-200">
                Delete section
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Channel rows */}
      {!section.collapsed && (
        <div className="mt-1 mx-1 space-y-0.5">
          {(() => {
            const visibleSectionChats = sectionChats.filter((c) => !starredIdSet.has(c.id));
            return visibleSectionChats.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">
                No channels yet — click <Plus className="inline h-3 w-3" /> to add some.
              </p>
            ) : visibleSectionChats.map((chat) => (
              <SidebarChatRow
                key={chat.id}
                chat={chat}
                isActive={chat.id === currentChatId}
                displayName={chat.name || 'untitled'}
                currentUserId={currentUserId}
                onClick={() => onSelectChat(chat.id)}
                showStarToggle
                isStarred={starredIdSet.has(chat.id)}
                onStarToggle={() => onStarToggle(chat.id)}
                onContextMenu={onContextMenu(chat)}
              />
            ));
          })()}
        </div>
      )}
    </div>
  );
}

export default function HomeSidebar({
  view,
  onChangeView,
  selectedProjectId,
  chats,
  currentChatId,
  onSelectChat,
  onCreateChat,
  onCreateChannel,
  isLoading,
  emptyState,
  roleByUserId,
  projectMembers,
  isLoadingMembers,
  onStartDM,
  isSearchActive = false,
  onSearchInChat,
  onOpenChannelDetails,
}: HomeSidebarProps) {
  const currentUserId = useAuthStore((s) => (s.user?.id ? Number(s.user.id) : null));

  // ---- custom sidebar sections ----
  const {
    sections: customSections,
    createSection,
    deleteSection,
    renameSection,
    toggleCollapsed,
    addChatToSection,
    removeChatFromSection,
  } = useCustomSections(selectedProjectId);

  const [starredOrder, setStarredOrder] = useState<number[]>([]);
  const [starLoading, setStarLoading] = useState(false);
  const [hasLoadedStarred, setHasLoadedStarred] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const openContextMenu = useCallback((chat: Chat) => (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    setContextMenu({ chat, x: e.clientX, y: e.clientY });
  }, []);

  const handleMarkAsRead = useCallback(async (chatId: number) => {
    try {
      await markChatAsRead(chatId);
      useChatStore.getState().updateChat(chatId, { unread_count: 0, mention_unread_count: 0 });
    } catch {
      toast.error('Could not mark as read');
    }
  }, []);

  const handleNotificationChange = useCallback(async (chat: Chat, level: 'all' | 'mentions' | 'muted', mutedUntil: string | null = null) => {
    try {
      const isMuted = level === 'muted';
      const liveChat = chats.find((c) => c.id === chat.id) ?? chat;
      const existingParticipant = (liveChat.participants ?? []).find((p) => p.user.id === currentUserId);
      const fallbackLevel = existingParticipant?.notification_level === 'mentions' ? 'mentions' : 'all';
      const notifLevel = isMuted ? (mutedUntil ? fallbackLevel : 'none') : level;
      await updateNotificationSettings(chat.id, {
        is_muted: isMuted,
        muted_until: isMuted ? mutedUntil : null,
        notification_level: notifLevel as 'all' | 'mentions' | 'none',
      });

      // Update local store immediately so the UI reflects the change without a refresh
      const updatedParticipants = (liveChat.participants ?? []).map((p) =>
        p.user.id === currentUserId
          ? { ...p, is_muted: isMuted, muted_until: isMuted ? mutedUntil : null, notification_level: notifLevel as 'all' | 'mentions' | 'none' }
          : p
      );
      useChatStore.getState().updateChat(chat.id, { participants: updatedParticipants });

      toast.success(
        isMuted
          ? mutedUntil
            ? `Muted until ${formatMutedUntil(mutedUntil)}`
            : 'Notifications muted'
          : level === 'all'
            ? 'Notifying for all new posts'
            : 'Notifying for mentions only'
      );
    } catch {
      toast.error('Could not update notification settings');
    }
  }, [chats, currentUserId]);

  const handleLeave = useCallback(async (chatId: number) => {
    try {
      await leaveChat(chatId);
      const liveChat = chats.find((c) => c.id === chatId);
      toast.success(`You left ${liveChat?.name ? `#${liveChat.name}` : 'the channel'}`);
      useChatStore.getState().removeChat(chatId);
    } catch {
      toast.error('Could not leave the channel');
    }
  }, [chats]);

  const { groupChats, privateChats } = useMemo(() => {
    const group: Chat[] = [];
    const priv: Chat[] = [];
    for (const chat of chats) {
      if (chat.type === 'group') group.push(chat);
      else priv.push(chat);
    }
    // Sort each list newest-first so the most recently active chat floats to the top.
    group.sort((a, b) => chatActivityTs(b) - chatActivityTs(a));
    priv.sort((a, b) => chatActivityTs(b) - chatActivityTs(a));
    return { groupChats: group, privateChats: priv };
  }, [chats]);

  // User IDs that already have a DM thread — used to deduplicate the project members list
  const dmUserIds = useMemo(() => {
    const ids = new Set<number>();
    for (const chat of privateChats) {
      for (const p of chat.participants ?? []) {
        if (p.user?.id && p.user.id !== currentUserId) {
          ids.add(p.user.id);
        }
      }
    }
    return ids;
  }, [privateChats, currentUserId]);

  const getPrivateChatDisplayName = useCallback(
    (chat: Chat) => {
      if (chat.type !== 'private') return limitName(chat.name || 'Group chat', MAX_CHANNEL_NAME_LENGTH);
      if (!currentUserId) return chat.name || 'Direct message';

      const other = chat.participants?.find((p) => p.user.id !== currentUserId);
      const otherUser = other?.user;
      const isBot =
        otherUser?.email === 'agent-bot@system.local' || otherUser?.username === 'agent-bot';
      if (isBot) return 'AI Agent';
      return otherUser?.username || chat.name || 'Direct message';
    },
    [currentUserId]
  );

  const isChatAgentBot = useCallback(
    (chat: Chat): boolean => {
      if (chat.type !== 'private' || !currentUserId) return false;
      const other = chat.participants?.find((p) => p.user.id !== currentUserId);
      const otherUser = other?.user;
      return (
        otherUser?.email === 'agent-bot@system.local' || otherUser?.username === 'agent-bot'
      );
    },
    [currentUserId]
  );

  const rowDisplayName = useCallback(
    (chat: Chat): string =>
      chat.type === 'private' ? getPrivateChatDisplayName(chat) : limitName(chat.name || 'untitled', MAX_CHANNEL_NAME_LENGTH),
    [getPrivateChatDisplayName]
  );

  const starredIdSet = useMemo(() => new Set(starredOrder), [starredOrder]);

  const mergeChat = useCallback(
    (c: Chat): Chat => {
      const norm = normalizeChat(c);
      const live = chats.find((x) => x.id === norm.id);
      return live ?? norm;
    },
    [chats]
  );

  const loadStarred = useCallback(async () => {
    if (!selectedProjectId) {
      setStarredOrder([]);
      setHasLoadedStarred(false);
      return;
    }
    try {
      setStarLoading(true);
      const rows = await listStarredChats(selectedProjectId);
      setStarredOrder(rows.map((r) => r.chat.id));
      setHasLoadedStarred(true);
    } catch {
      toast.error('Could not load starred chats');
      setStarredOrder([]);
      setHasLoadedStarred(true);
    } finally {
      setStarLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (view === 'home' && selectedProjectId) {
      void loadStarred();
    }
  }, [loadStarred, selectedProjectId, view]);

  useEffect(() => {
    setStarredOrder([]);
    setHasLoadedStarred(false);
  }, [selectedProjectId]);

  const starredChatsOrdered = useMemo(() => {
    return starredOrder
      .map((id) => {
        const fromList = chats.find((c) => c.id === id);
        return fromList ?? null;
      })
      .filter((c): c is Chat => c !== null);
  }, [starredOrder, chats]);

  const toggleStar = async (chatId: number) => {
    if (!selectedProjectId) return;
    try {
      if (starredIdSet.has(chatId)) {
        await unstarChat(chatId);
        setStarredOrder((prev) => prev.filter((id) => id !== chatId));
      } else {
        await starChat(chatId);
        setStarredOrder((prev) => [...prev, chatId]);
      }
    } catch {
      toast.error('Could not update starred');
    }
  };

  const handleDragStart = (chatId: number) => (e: DragEvent<HTMLElement>) => {
    setDraggingId(chatId);
    e.dataTransfer.setData('text/plain', String(chatId));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOn = (targetChatId: number) => async (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/plain');
    const draggedId = Number(raw);
    setDraggingId(null);
    if (!selectedProjectId || !Number.isFinite(draggedId)) return;
    const order = [...starredOrder];
    const from = order.indexOf(draggedId);
    const to = order.indexOf(targetChatId);
    if (to < 0) return;

    if (from < 0) {
      if (order.includes(draggedId)) return;
      try {
        await starChat(draggedId);
        const next = [...order];
        next.splice(to, 0, draggedId);
        setStarredOrder(next);
        await reorderStarredChats(selectedProjectId, next);
      } catch {
        toast.error('Could not add to starred');
        void loadStarred();
      }
      return;
    }

    if (draggedId === targetChatId) return;
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, draggedId);
    setStarredOrder(next);
    try {
      await reorderStarredChats(selectedProjectId, next);
    } catch {
      toast.error('Could not reorder starred');
      void loadStarred();
    }
  };

  const handleDropOnStarredEmpty = async (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/plain');
    const draggedId = Number(raw);
    if (!selectedProjectId || !Number.isFinite(draggedId)) return;
    if (starredOrder.includes(draggedId)) return;
    try {
      await starChat(draggedId);
      setStarredOrder([draggedId]);
    } catch {
      toast.error('Could not add to starred');
    }
  };

  const listDragStart = (chatId: number) => (e: DragEvent<HTMLElement>) => {
    e.dataTransfer.setData('text/plain', String(chatId));
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const renderPlaceholder = (title: string, subtitle: string) => (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-sm text-gray-500">
      <p className="font-medium text-gray-700">{title}</p>
      <p className="mt-1">{subtitle}</p>
    </div>
  );

  const mainListContent = () => {
    const showHome = view === 'home';
    const showDmsOnly = view === 'dms';

    if (!selectedProjectId) {
      return <div className="p-4 text-sm text-gray-500">{emptyState}</div>;
    }
    if (isLoading) {
      if (view === 'activity' || view === 'files') {
        return <SidebarRowsSkeleton rows={2} withHeading />;
      }

      return (
        <div className="pb-2">
          {showHome && (
            <Section title="Starred" icon={<Star className="w-3.5 h-3.5" />}>
              <SidebarRowsSkeleton rows={1} />
            </Section>
          )}

          {showHome && (
            <Section title="Channels" icon={<Hash className="w-3.5 h-3.5" />}>
              <SidebarRowsSkeleton rows={1} />
            </Section>
          )}

          {(showHome || showDmsOnly) && (
            <Section title="Direct messages" icon={<Users className="w-3.5 h-3.5" />}>
              <SidebarRowsSkeleton rows={1} />
            </Section>
          )}

          {(showHome || showDmsOnly) && selectedProjectId && (
            <Section title="Project members" icon={<User className="w-3.5 h-3.5" />}>
              <SidebarRowsSkeleton rows={1} variant="member" />
            </Section>
          )}
        </div>
      );
    }

    if (view === 'activity') {
      return <ActivitySidebarView />;
    }
    if (view === 'files') {
      return <FilesSidebarView selectedProjectId={selectedProjectId} />;
    }

    if ((showHome || showDmsOnly) && isSearchActive && chats.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center px-5 py-10 text-center text-sm text-gray-500">
          <SearchEmptyIcon />
          <p className="mt-3 font-medium text-gray-700">No matching conversations</p>
          <p className="mt-1 text-xs text-gray-500">Try another channel, DM, participant, or recent message.</p>
        </div>
      );
    }

    return (
      <div className="pb-2">
        {showHome && (
          <Section
            title="Starred"
            icon={<Star className="w-3.5 h-3.5" />}
            headerExtra={
              starLoading ? (
                <span className="text-[10px] font-normal normal-case text-gray-400">…</span>
              ) : null
            }
          >
            {starLoading && !hasLoadedStarred ? (
              <SidebarRowsSkeleton rows={1} />
            ) : starredChatsOrdered.length === 0 && hasLoadedStarred ? (
              <div
                className="px-3 py-6 text-sm text-gray-500 border border-dashed border-gray-200 rounded-lg mx-1 min-h-[4rem] flex items-center justify-center text-center"
                onDragOver={handleDragOver}
                onDrop={handleDropOnStarredEmpty}
              >
                Drag important channels or DMs here from the lists below.
              </div>
            ) : (
              <div className="space-y-0.5 mx-1 border border-dashed border-gray-200 rounded-lg p-1">
                {starredChatsOrdered.map((chat) => (
                  <SidebarChatRow
                    key={chat.id}
                    chat={chat}
                    isActive={chat.id === currentChatId}
                    displayName={rowDisplayName(chat)}
                    isBot={isChatAgentBot(chat)}
                    currentUserId={currentUserId}
                    onClick={() => onSelectChat(chat.id)}
                    showStarToggle
                    isStarred
                    onStarToggle={() => void toggleStar(chat.id)}
                    draggable
                    onDragStart={handleDragStart(chat.id)}
                    onDragOver={handleDragOver}
                    onDrop={handleDropOn(chat.id)}
                    isDragging={draggingId === chat.id}
                    onContextMenu={openContextMenu(chat)}
                  />
                ))}
              </div>
            )}
          </Section>
        )}

        {/* ── Custom sections (home view only) ── */}
        {showHome && selectedProjectId && customSections.map((section) => (
          <CustomSectionBlock
            key={section.id}
            section={section}
            availableChats={groupChats}
            currentChatId={currentChatId}
            currentUserId={currentUserId}
            onSelectChat={onSelectChat}
            onToggleCollapsed={() => toggleCollapsed(section.id)}
            onRename={(name) => renameSection(section.id, name)}
            onDelete={() => deleteSection(section.id)}
            onAddChat={(chatId) => addChatToSection(section.id, chatId)}
            onRemoveChat={(chatId) => removeChatFromSection(section.id, chatId)}
            onContextMenu={openContextMenu}
            starredIdSet={starredIdSet}
            onStarToggle={(chatId) => void toggleStar(chatId)}
          />
        ))}

        {/* Add section button — sits between sections and Channels */}
        {showHome && selectedProjectId && (
          <div className="mt-2 px-3">
            <button
              type="button"
              onClick={() => createSection()}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
              data-testid="messages-add-section"
            >
              <Plus className="h-3 w-3" />
              Add section
            </button>
          </div>
        )}

        {showHome && (
          <div className="mt-3">
            <div className="px-3 flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">
              <span className="text-gray-500">
                <Hash className="w-3.5 h-3.5" />
              </span>
              <span className="flex-1 min-w-0">Channels</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateChannel();
                }}
                className="p-1 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-colors"
                title="Add channel"
                aria-label="Add channel"
                data-testid="messages-add-channel"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-2 mx-1">
              {(() => {
                // Starred channels only appear in the Starred section
                const sectionedIds = new Set(customSections.flatMap((s) => s.chatIds));
                const visibleChannels = groupChats.filter((c) => !starredIdSet.has(c.id) && !sectionedIds.has(c.id));
                return visibleChannels.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-gray-500">
                  <Hash className="mx-auto mb-1 h-5 w-5 text-gray-300" />
                  <p className="mb-2">{isSearchActive ? 'No matching channels' : 'No channels yet'}</p>
                  {!isSearchActive && (
                    <button
                      type="button"
                      onClick={onCreateChannel}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                      data-testid="messages-empty-create-channel"
                    >
                      <Plus className="h-3 w-3" />
                      Create channel
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {visibleChannels.map((chat) => (
                    <SidebarChatRow
                      key={chat.id}
                      chat={chat}
                      isActive={chat.id === currentChatId}
                      displayName={rowDisplayName(chat)}
                      currentUserId={currentUserId}
                      onClick={() => onSelectChat(chat.id)}
                      showStarToggle
                      isStarred={starredIdSet.has(chat.id)}
                      onStarToggle={() => void toggleStar(chat.id)}
                      draggable={!starredIdSet.has(chat.id)}
                      onDragStart={listDragStart(chat.id)}
                      onContextMenu={openContextMenu(chat)}
                    />
                  ))}
                </div>
              );})()}
            </div>
          </div>
        )}

        {(showHome || showDmsOnly) && (
          <Section
            title="Direct messages"
            icon={<Users className="w-3.5 h-3.5" />}
            headerExtra={
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateChat();
                }}
                disabled={!selectedProjectId}
                className="p-1 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                title="New chat"
                aria-label="New chat"
                data-testid="messages-new-chat"
              >
                <Plus className="w-4 h-4" />
              </button>
            }
          >
            {(() => {
              // In home view, starred DMs live only in the Starred section
              const visibleDMs = showHome
                ? privateChats.filter((c) => !starredIdSet.has(c.id))
                : privateChats;
              return visibleDMs.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-gray-500">
                <MessagesSquare className="mx-auto mb-1 h-5 w-5 text-gray-300" />
                <p className="mb-2 text-xs">{isSearchActive ? 'No matching direct messages' : 'No direct messages yet'}</p>
                {!isSearchActive && (
                  <button
                    type="button"
                    onClick={onCreateChat}
                    disabled={!selectedProjectId}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid="messages-empty-new-chat"
                  >
                    <Plus className="h-3 w-3" />
                    New chat
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-0.5 mx-1">
                {visibleDMs.map((chat) => (
                  <SidebarChatRow
                    key={chat.id}
                    chat={chat}
                    isActive={chat.id === currentChatId}
                    displayName={rowDisplayName(chat)}
                    isBot={isChatAgentBot(chat)}
                    currentUserId={currentUserId}
                    onClick={() => onSelectChat(chat.id)}
                    showStarToggle={showHome}
                    isStarred={starredIdSet.has(chat.id)}
                    onStarToggle={showHome ? () => void toggleStar(chat.id) : undefined}
                    draggable={showHome && !starredIdSet.has(chat.id)}
                    onDragStart={showHome ? listDragStart(chat.id) : undefined}
                    onContextMenu={openContextMenu(chat)}
                  />
                ))}
              </div>
            );})()}
          </Section>
        )}

        {(showHome || showDmsOnly) && selectedProjectId && (
          <Section
            title="Project members"
            icon={<User className="w-3.5 h-3.5" />}
          >
            <ProjectMembersSection
              members={projectMembers}
              isLoading={isLoadingMembers}
              currentUserId={currentUserId}
              dmUserIds={dmUserIds}
              onStartDM={onStartDM}
            />
          </Section>
        )}
      </div>
    );
  };

  const tabItems: { id: MessagesNavView; label: string; icon: React.ReactNode; testid: string }[] = [
    { id: 'home', label: 'Home', icon: <Home className="w-3.5 h-3.5" />, testid: 'messages-nav-home' },
    { id: 'dms', label: 'DMs', icon: <MessageSquare className="w-3.5 h-3.5" />, testid: 'messages-nav-dms' },
    { id: 'activity', label: 'Activity', icon: <Bell className="w-3.5 h-3.5" />, testid: 'messages-nav-activity' },
    { id: 'files', label: 'Files', icon: <FolderOpen className="w-3.5 h-3.5" />, testid: 'messages-nav-files' },
  ];

  return (
    <div
      className="h-full w-full flex flex-col bg-white"
      data-testid="messages-home-sidebar"
      aria-label="Chats"
    >
      <div
        className="flex items-stretch border-b border-gray-200 px-1"
        data-testid="messages-nav-rail"
      >
        {tabItems.map((tab) => {
          const isActive = view === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangeView(tab.id)}
              className={[
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2',
                isActive
                  ? 'text-[#3CCED7] border-[#3CCED7]'
                  : 'text-gray-500 border-transparent hover:text-gray-900',
              ].join(' ')}
              aria-current={isActive ? 'page' : undefined}
              data-testid={tab.testid}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="task-tab-scrollbar flex-1 overflow-y-auto">{mainListContent()}</div>

      {contextMenu && (
        <ChatContextMenu
          menu={contextMenu}
          currentUserId={currentUserId}
          onClose={() => setContextMenu(null)}
          onMarkAsRead={(chatId) => void handleMarkAsRead(chatId)}
          onNotificationChange={(chat, level, mutedUntil) => void handleNotificationChange(chat, level, mutedUntil)}
          onLeave={(chatId) => void handleLeave(chatId)}
          onOpenChannelDetails={(chatId) => { setContextMenu(null); onOpenChannelDetails?.(chatId); }}
          onSearchInChat={(chatId) => { setContextMenu(null); onSearchInChat?.(chatId); }}
        />
      )}
    </div>
  );
}
