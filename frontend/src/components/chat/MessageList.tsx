'use client';

import { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { format, isSameDay } from 'date-fns';
import { ChevronDown } from 'lucide-react';
import type { Message, MessageListProps } from '@/types/chat';
import { Skeleton } from '@/components/ui/skeleton';
import MessageItem from './MessageItem';

// ─── Loading skeleton ──────────────────────────────────────────────────────────

const LOADING_GROUPS = [
  {
    align: 'left',
    lines: [
      ['w-28', 'w-24', 'w-20', 'w-32'],
      ['w-32', 'w-28', 'w-24'],
    ],
  },
  {
    align: 'right',
    lines: [
      ['w-20', 'w-36', 'w-24', 'w-16', 'w-28'],
      ['w-24', 'w-32', 'w-20'],
    ],
    media: true,
  },
  {
    align: 'left',
    lines: [
      ['w-24', 'w-20', 'w-28', 'w-16', 'w-24'],
      ['w-36', 'w-24', 'w-20', 'w-28'],
    ],
  },
  {
    align: 'right',
    lines: [
      ['w-16', 'w-24', 'w-20', 'w-32'],
      ['w-28', 'w-20', 'w-24'],
    ],
  },
];

function LoadingBrickRow({ widths, align = 'left' }: { widths: string[]; align?: 'left' | 'right' }) {
  return (
    <div className={`flex flex-wrap gap-2 ${align === 'right' ? 'justify-end' : ''}`}>
      {widths.map((width, index) => (
        <Skeleton key={`${width}-${index}`} className={`h-7 rounded-xl ${width}`} />
      ))}
    </div>
  );
}

function MessageListLoadingSkeleton({ compact = false }: { compact?: boolean }) {
  const groups = compact ? LOADING_GROUPS.slice(0, 1) : LOADING_GROUPS;
  return (
    <div className={compact ? 'space-y-3 pb-3' : 'flex-1 overflow-y-auto p-4 space-y-6'}>
      {groups.map((group, groupIndex) => (
        <div key={`message-loading-group-${groupIndex}`} className="space-y-3">
          {group.lines.map((line, lineIndex) => (
            <LoadingBrickRow
              key={`message-loading-line-${groupIndex}-${lineIndex}`}
              widths={line}
              align={group.align === 'left' || group.align === 'right' ? group.align : undefined}
            />
          ))}
          {group.media ? (
            <div className={`pt-1 ${group.align === 'right' ? 'flex justify-end' : ''}`}>
              <Skeleton className="h-40 w-40 rounded-2xl" />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

// ─── Flat item types ───────────────────────────────────────────────────────────

type FlatItem =
  | { type: 'date-header'; date: string }
  | { type: 'unread-divider' }
  | { type: 'message'; message: Message; showSender: boolean; senderRole?: string };

function formatDateHeader(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  if (isSameDay(date, today)) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Yesterday';
  return format(date, 'MMMM d, yyyy');
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MessageList({
  messages,
  currentUserId,
  onLoadMore,
  hasMore,
  isLoading,
  isLoadingMoreMessages = false,
  showSwitchLoadingSkeleton = false,
  roleByUserId,
  isGroupChat = false,
  isSelectMode = false,
  selectedMessageIds = [],
  onToggleSelectMessage,
  firstUnreadMessageId = null,
  onEditMessage,
  onDeleteMessage,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [highlightMessageId, setHighlightMessageId] = useState<number | null>(null);

  // Refs that survive re-renders without triggering effects
  const isLoadingMoreRef = useRef(false);
  const firstVisibleMsgIdRef = useRef<number | null>(null);
  const lastMessageIdRef = useRef<number | null>(null);
  const unreadScrollDoneRef = useRef(false);
  const scrollPendingRef = useRef<'bottom' | 'unread' | null>(null);
  const firstUnreadMessageIdRef = useRef(firstUnreadMessageId);
  firstUnreadMessageIdRef.current = firstUnreadMessageId;
  const previousCountRef = useRef(messages.length);

  // ── Group messages by date ───────────────────────────────────────────────────
  const messageGroups = useMemo(() => {
    const groups: { date: string; messages: Message[] }[] = [];
    messages.forEach((message) => {
      const dateStr = format(new Date(message.created_at), 'yyyy-MM-dd');
      const existing = groups.find((g) => g.date === dateStr);
      if (existing) existing.messages.push(message);
      else groups.push({ date: dateStr, messages: [message] });
    });
    return groups;
  }, [messages]);

  // ── Flatten into a single list for the virtualizer ──────────────────────────
  const flatItems = useMemo<FlatItem[]>(() => {
    const items: FlatItem[] = [];
    messageGroups.forEach((group) => {
      items.push({ type: 'date-header', date: group.date });
      group.messages.forEach((message, index) => {
        const prevMessage = index > 0 ? group.messages[index - 1] : null;
        const showSender = !prevMessage || prevMessage.sender.id !== message.sender.id;
        const senderRole = isGroupChat ? roleByUserId?.[message.sender.id] : undefined;
        if (firstUnreadMessageId === message.id) {
          items.push({ type: 'unread-divider' });
        }
        items.push({ type: 'message', message, showSender, senderRole });
      });
    });
    return items;
  }, [messageGroups, firstUnreadMessageId, isGroupChat, roleByUserId]);

  // ── Virtualizer ──────────────────────────────────────────────────────────────
  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const item = flatItems[index];
      if (!item) return 40;
      if (item.type === 'date-header') return 48;
      if (item.type === 'unread-divider') return 36;
      // Messages with sender header are taller than compact rows
      return item.showSender ? 64 : 36;
    },
    overscan: 20,
  });

  // Keep a stable ref so callbacks don't go stale
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;


  // ── Scroll helpers ───────────────────────────────────────────────────────────
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'instant') => {
    if (!scrollRef.current) return;
    // The virtual container sets height = getTotalSize(), so scrolling to
    // scrollHeight always lands at the very last item.
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
  }, []);

  const scrollToUnreadDivider = useCallback((): boolean => {
    const idx = flatItems.findIndex((item) => item.type === 'unread-divider');
    if (idx < 0) return false;
    virtualizerRef.current.scrollToIndex(idx, { behavior: 'instant', align: 'start' });
    unreadScrollDoneRef.current = true;
    return true;
  }, [flatItems]);

  // ── Jump-to-message event (cross-component) ──────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ messageId?: number }>;
      const messageId = ce.detail?.messageId;
      if (!messageId || !Number.isFinite(messageId)) return;
      const idx = flatItems.findIndex(
        (item) => item.type === 'message' && item.message.id === messageId,
      );
      if (idx >= 0) {
        virtualizerRef.current.scrollToIndex(idx, { behavior: 'smooth', align: 'center' });
      }
      setHighlightMessageId(messageId);
    };
    window.addEventListener('mj:chat:jumpToMessage', handler as EventListener);
    return () => window.removeEventListener('mj:chat:jumpToMessage', handler as EventListener);
  }, [flatItems]);

  // Clear highlight after 4 s
  useEffect(() => {
    if (!highlightMessageId) return;
    const t = window.setTimeout(() => setHighlightMessageId(null), 4000);
    return () => window.clearTimeout(t);
  }, [highlightMessageId]);

  // stickyBottomRef: when true, every size/content change scrolls to the real bottom.
  // This handles both the initial scroll AND post-measurement corrections in one place,
  // so we never land at the wrong position after the virtualizer re-measures items.
  const stickyBottomRef = useRef(true);

  // The virtualizer's total height — changes when items are first estimated AND again
  // after each measurement pass. We use this as a trigger so we always scroll to the
  // real DOM scrollHeight (not a stale estimate).
  const totalSize = virtualizer.getTotalSize();

  // ── Detect chat switch / initial load ───────────────────────────────────────
  useLayoutEffect(() => {
    if (messages.length === 0) return;
    const lastMessageId = messages[messages.length - 1]?.id;
    const isNewChat =
      lastMessageIdRef.current !== null &&
      lastMessageIdRef.current !== lastMessageId &&
      !isLoadingMoreRef.current;
    const isInitialLoad = lastMessageIdRef.current === null;

    if (isInitialLoad || isNewChat) {
      if (isNewChat) unreadScrollDoneRef.current = false;
      if (firstUnreadMessageIdRef.current) {
        // Has unread — will scroll to divider instead of bottom
        stickyBottomRef.current = false;
        scrollPendingRef.current = 'unread';
      } else {
        stickyBottomRef.current = true;
        scrollPendingRef.current = null;
      }
    }
    lastMessageIdRef.current = lastMessageId;
  }, [messages]);

  // ── Scroll to bottom (or unread divider) on every content/size change ────────
  // Fires when flatItems change (new messages) OR when totalSize changes (after
  // the virtualizer re-measures items). The stickyBottomRef flag ensures we only
  // auto-scroll during the initial load / chat switch window, not when the user
  // has scrolled up to read history.
  useLayoutEffect(() => {
    if (showSwitchLoadingSkeleton) return;
    if (flatItems.length === 0 || !scrollRef.current) return;

    // One-time scroll to the unread divider (higher priority than sticky bottom)
    if (scrollPendingRef.current === 'unread') {
      if (scrollToUnreadDivider()) {
        scrollPendingRef.current = null;
        return;
      }
    }

    if (stickyBottomRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'instant' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalSize, flatItems.length, showSwitchLoadingSkeleton]);

  // ── firstUnreadMessageId arrives after initial render ────────────────────────
  useLayoutEffect(() => {
    if (!firstUnreadMessageId) {
      unreadScrollDoneRef.current = false;
      return;
    }
    if (unreadScrollDoneRef.current) return;
    scrollToUnreadDivider();
  }, [firstUnreadMessageId, scrollToUnreadDivider]);

  // ── Restore scroll position after prepending older messages ──────────────────
  useEffect(() => {
    if (!isLoadingMoreRef.current) return;
    const targetId = firstVisibleMsgIdRef.current;
    firstVisibleMsgIdRef.current = null;
    isLoadingMoreRef.current = false;

    if (!targetId) return;
    const idx = flatItems.findIndex(
      (item) => item.type === 'message' && item.message.id === targetId,
    );
    if (idx >= 0) {
      virtualizerRef.current.scrollToIndex(idx, { behavior: 'instant', align: 'start' });
    }
  }, [flatItems]);

  // ── Auto-scroll to bottom on new incoming messages ───────────────────────────
  useEffect(() => {
    const isNewMessage = messages.length > previousCountRef.current;
    previousCountRef.current = messages.length;
    if (isNewMessage && isAtBottom && !isLoadingMoreRef.current) {
      stickyBottomRef.current = true;
    }
  }, [messages.length, isAtBottom]);

  // ── Load more (older messages) ───────────────────────────────────────────────
  const handleLoadMore = useCallback(() => {
    if (isLoadingMoreRef.current) return;
    // Remember the first visible message so we can restore scroll after prepend
    const virtualItems = virtualizerRef.current.getVirtualItems();
    for (const vItem of virtualItems) {
      const item = flatItems[vItem.index];
      if (item?.type === 'message') {
        firstVisibleMsgIdRef.current = item.message.id;
        break;
      }
    }
    isLoadingMoreRef.current = true;
    onLoadMore();
  }, [flatItems, onLoadMore]);

  // ── Scroll event ─────────────────────────────────────────────────────────────
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollHeight, scrollTop, clientHeight } = scrollRef.current;
    const distFromBottom = scrollHeight - scrollTop - clientHeight;
    const isBottom = distFromBottom < 50;
    setIsAtBottom(isBottom);
    if (!isBottom) stickyBottomRef.current = false;

    // Only trigger load-more when the user has actually scrolled up (not at
    // bottom). This prevents firing on initial mount when content is short
    // enough that scrollTop stays 0 and the container isn't overflowing.
    if (!isBottom && scrollTop < 100 && hasMore && !isLoading && !isLoadingMoreRef.current) {
      handleLoadMore();
    }
  }, [hasMore, isLoading, handleLoadMore]);

  const shouldShowFullSwitchSkeleton = showSwitchLoadingSkeleton && !isLoadingMoreMessages;
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="h-full flex flex-col">
      {shouldShowFullSwitchSkeleton ? (
        <MessageListLoadingSkeleton />
      ) : (
        <>
          {/* Loading indicator for older messages */}
          {isLoadingMoreMessages && hasMore && messages.length > 0 && (
            <div className="px-4 pt-3 flex-shrink-0">
              <MessageListLoadingSkeleton compact />
            </div>
          )}

          {/* Initial loading */}
          {messages.length === 0 && isLoading && !showSwitchLoadingSkeleton && (
            <MessageListLoadingSkeleton />
          )}

          {/* Empty state */}
          {messages.length === 0 && !isLoading && (
            <div className="flex items-center justify-center flex-1 text-gray-500 text-sm">
              <p>No messages yet. Start the conversation!</p>
            </div>
          )}

          {/* Virtual message list */}
          {messages.length > 0 && (
            <div className="relative flex-1 min-h-0">
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="h-full overflow-y-auto"
              >
                <div
                  style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}
                >
                  {virtualItems.map((virtualRow) => {
                    const item = flatItems[virtualRow.index];
                    if (!item) return null;
                    return (
                      <div
                        key={virtualRow.key}
                        data-index={virtualRow.index}
                        ref={virtualizer.measureElement}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        {item.type === 'date-header' && (
                          <div className="flex justify-center py-4">
                            <span className="bg-gray-100 text-gray-600 text-xs font-medium px-3 py-1 rounded-full">
                              {formatDateHeader(item.date)}
                            </span>
                          </div>
                        )}

                        {item.type === 'unread-divider' && (
                          <div
                            id="new-messages-divider"
                            className="my-3 px-3 sm:px-4 flex items-center gap-3"
                            aria-label="New messages"
                          >
                            <div className="h-px flex-1 bg-[#3CCED7]/40" />
                            <span className="shrink-0 rounded-full bg-[#3CCED7]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#3CCED7]">
                              New messages
                            </span>
                            <div className="h-px flex-1 bg-[#3CCED7]/40" />
                          </div>
                        )}

                        {item.type === 'message' && (
                          <MessageItem
                            message={item.message}
                            isOwnMessage={item.message.sender.id === currentUserId}
                            showSender={item.showSender}
                            isCompact={!item.showSender}
                            senderRole={item.senderRole}
                            isSelectMode={isSelectMode}
                            isSelected={selectedMessageIds.includes(item.message.id)}
                            onToggleSelect={onToggleSelectMessage}
                            isHighlighted={highlightMessageId === item.message.id}
                            onEdit={onEditMessage}
                            onDelete={onDeleteMessage}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Scroll-to-bottom button */}
              {!isAtBottom && (
                <button
                  onClick={() => scrollToBottom('smooth')}
                  className="absolute bottom-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md border border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-all"
                  aria-label="Scroll to bottom"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
