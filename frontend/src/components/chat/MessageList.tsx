'use client';

import { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback } from 'react';
import { format, isSameDay } from 'date-fns';
import { ChevronDown } from 'lucide-react';
import type { MessageListProps } from '@/types/chat';
import { Skeleton } from '@/components/ui/skeleton';
import MessageItem from './MessageItem';

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

function LoadingBrickRow({
  widths,
  align = 'left',
}: {
  widths: string[];
  align?: 'left' | 'right';
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${align === 'right' ? 'justify-end' : ''}`}>
      {widths.map((width, index) => (
        <Skeleton
          key={`${width}-${index}`}
          className={`h-7 rounded-xl ${width}`}
        />
      ))}
    </div>
  );
}

function MessageListLoadingSkeleton({
  compact = false,
}: {
  compact?: boolean;
}) {
  const groups = compact ? LOADING_GROUPS.slice(0, 1) : LOADING_GROUPS;

  return (
    <div className={compact ? 'space-y-3 pb-3' : 'flex-1 overflow-y-auto p-4 space-y-6'}>
      {groups.map((group, groupIndex) => (
        <div
          key={`message-loading-group-${groupIndex}`}
          className="space-y-3"
        >
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
  const previousMessageCountRef = useRef(messages.length);
  const lastMessageIdRef = useRef<number | null>(null); // Track LAST message ID (newest) instead of first
  const isLoadingMoreRef = useRef(false); // Track if we're loading more (older) messages
  const scrollPositionBeforeLoadRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  // Always-current ref so useLayoutEffect closures read the latest firstUnreadMessageId
  // without needing it in the dependency array (avoids re-running the scroll effects
  // on every render where only the ref value changes).
  const firstUnreadMessageIdRef = useRef(firstUnreadMessageId);
  firstUnreadMessageIdRef.current = firstUnreadMessageId;
  // Prevent double-scrolling to the divider within one chat session
  const unreadScrollDoneRef = useRef(false);
  // When the scroll container is hidden by the switch skeleton, we queue the
  // intended scroll target here and execute it once the skeleton disappears.
  const scrollPendingRef = useRef<'bottom' | 'divider' | null>(null);

  useEffect(() => {
    // Listen for cross-component "jump to message" events.
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ messageId?: number }>;
      const messageId = ce.detail?.messageId;
      if (!messageId || !Number.isFinite(messageId)) return;
      setHighlightMessageId(messageId);
    };
    window.addEventListener('mj:chat:jumpToMessage', handler as EventListener);
    return () => window.removeEventListener('mj:chat:jumpToMessage', handler as EventListener);
  }, []);

  useEffect(() => {
    if (!highlightMessageId) return;
    const el = document.getElementById(`message-${highlightMessageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = window.setTimeout(() => setHighlightMessageId(null), 4000);
    return () => window.clearTimeout(t);
  }, [highlightMessageId, messages]);

  // Helper: scroll the container so the "New messages" divider sits just inside the top.
  // Returns true if the divider was found and scrolled to.
  const scrollToDivider = useCallback((): boolean => {
    const divider = document.getElementById('new-messages-divider');
    if (!divider || !scrollRef.current) return false;
    const container = scrollRef.current;
    const offset =
      divider.getBoundingClientRect().top - container.getBoundingClientRect().top;
    container.scrollTo({ top: container.scrollTop + offset - 16, behavior: 'instant' }); // 16px breathing room
    unreadScrollDoneRef.current = true;
    return true;
  }, []);

  // Effect 1 — Detect chat switch / initial load and record the intended scroll
  // target in a ref.  We intentionally do NOT scroll here because
  // setShowSwitchLoadingSkeleton(true) fires in the same effect flush: by the
  // time any setTimeout callback would run, the skeleton is already covering
  // the scroll container (scrollRef.current === null).  Execution is deferred
  // to Effect 2 which fires only when the container is actually in the DOM.
  useEffect(() => {
    if (messages.length === 0) return;

    const lastMessageId = messages[messages.length - 1]?.id;
    const isNewChat =
      lastMessageIdRef.current !== null &&
      lastMessageIdRef.current !== lastMessageId &&
      !isLoadingMoreRef.current;
    const isInitialLoad = lastMessageIdRef.current === null;

    if (isInitialLoad || isNewChat) {
      if (isNewChat) unreadScrollDoneRef.current = false;
      scrollPendingRef.current = firstUnreadMessageIdRef.current ? 'divider' : 'bottom';
    }

    lastMessageIdRef.current = lastMessageId;
  }, [messages]);

  // Effect 2 — Execute the pending scroll synchronously before the browser paints.
  // useLayoutEffect fires after React commits the DOM but before the frame is
  // drawn, so the user never sees the content at scrollTop=0.
  useLayoutEffect(() => {
    if (showSwitchLoadingSkeleton) return;
    if (!scrollPendingRef.current) return;
    if (!scrollRef.current || messages.length === 0) return;

    const target = scrollPendingRef.current;
    scrollPendingRef.current = null;

    if (target === 'divider' && scrollToDivider()) return;
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'instant' });
  }, [showSwitchLoadingSkeleton, messages, scrollToDivider]);

  // When firstUnreadMessageId arrives AFTER the initial message render (the
  // common race: messages load → bottom scroll fires → capture effect sets
  // firstUnreadMessageId → we override with divider scroll).
  // useLayoutEffect wins the race without any setTimeout because it fires
  // synchronously before paint on every render where firstUnreadMessageId changes.
  useLayoutEffect(() => {
    if (!firstUnreadMessageId) {
      // Divider cleared (chat closed / switched) — reset flag so next open works.
      unreadScrollDoneRef.current = false;
      return;
    }
    if (unreadScrollDoneRef.current) return; // Already scrolled this session
    scrollToDivider();
  }, [firstUnreadMessageId, scrollToDivider]);

  // Maintain scroll position after loading older messages
  useEffect(() => {
    if (isLoadingMoreRef.current && scrollPositionBeforeLoadRef.current && scrollRef.current) {
      const { scrollHeight: oldScrollHeight, scrollTop: oldScrollTop } = scrollPositionBeforeLoadRef.current;
      const newScrollHeight = scrollRef.current.scrollHeight;
      const heightDiff = newScrollHeight - oldScrollHeight;
      
      // Adjust scroll position to maintain the same view
      scrollRef.current.scrollTo({ top: oldScrollTop + heightDiff, behavior: 'instant' });
      
      // Reset refs
      scrollPositionBeforeLoadRef.current = null;
      isLoadingMoreRef.current = false;
    }
  }, [messages]);

  // Auto-scroll to bottom on NEW messages (if user is at bottom)
  useEffect(() => {
    const isNewMessage = messages.length > previousMessageCountRef.current;
    const wasLoadingMore = isLoadingMoreRef.current;
    previousMessageCountRef.current = messages.length;

    // Only auto-scroll for new messages at bottom, not when loading history
    if (isNewMessage && isAtBottom && scrollRef.current && !wasLoadingMore) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'instant' });
    }
  }, [messages.length, isAtBottom]);

  // Handle loading more (older) messages
  const handleLoadMore = useCallback(() => {
    if (scrollRef.current) {
      // Save current scroll position before loading
      scrollPositionBeforeLoadRef.current = {
        scrollHeight: scrollRef.current.scrollHeight,
        scrollTop: scrollRef.current.scrollTop,
      };
      isLoadingMoreRef.current = true;
    }
    onLoadMore();
  }, [onLoadMore]);

  // Check if user is at bottom
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const threshold = 50;
    const isBottom = target.scrollHeight - target.scrollTop - target.clientHeight < threshold;
    setIsAtBottom(isBottom);

    // Load more when scrolled to top
    if (target.scrollTop < 100 && hasMore && !isLoading && !isLoadingMoreRef.current) {
      handleLoadMore();
    }
  };

  // Group messages by date (memoized to prevent infinite loops)
  const messageGroups = useMemo(() => {
    const groups: { date: string; messages: typeof messages }[] = [];
    
    messages.forEach((message) => {
      const messageDate = new Date(message.created_at);
      const dateStr = format(messageDate, 'yyyy-MM-dd');
      
      const existingGroup = groups.find((g) => g.date === dateStr);
      if (existingGroup) {
        existingGroup.messages.push(message);
      } else {
        groups.push({ date: dateStr, messages: [message] });
      }
    });
    
    return groups;
  }, [messages]);

  // Format date header
  const formatDateHeader = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    
    if (isSameDay(date, today)) {
      return 'Today';
    }
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (isSameDay(date, yesterday)) {
      return 'Yesterday';
    }
    
    return format(date, 'MMMM d, yyyy');
  };

  const shouldShowFullSwitchSkeleton = showSwitchLoadingSkeleton && !isLoadingMoreMessages;

  return (
    <div className="h-full flex flex-col">
      {shouldShowFullSwitchSkeleton ? (
        <MessageListLoadingSkeleton />
      ) : (
        <>
      {/* Loading indicator at top */}
      {isLoadingMoreMessages && hasMore && messages.length > 0 && (
        <div className="px-4 pt-3">
          <MessageListLoadingSkeleton compact />
        </div>
      )}

      {/* Initial loading state */}
      {messages.length === 0 && isLoading && !showSwitchLoadingSkeleton && (
        <MessageListLoadingSkeleton />
      )}

      {/* Empty state */}
      {messages.length === 0 && !isLoading && (
        <div className="flex items-center justify-center flex-1 text-gray-500 text-sm">
          <p>No messages yet. Start the conversation!</p>
        </div>
      )}

      {/* Messages grouped by date */}
      {messages.length > 0 && (
        <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full space-y-4 overflow-y-auto p-3 sm:p-4"
        >
          {messageGroups.map((group) => (
            <div key={group.date}>
              {/* Date Header */}
              <div className="flex justify-center mb-4">
                <span className="bg-gray-100 text-gray-600 text-xs font-medium px-3 py-1 rounded-full">
                  {formatDateHeader(group.date)}
                </span>
              </div>

              {/* Messages */}
              <div>
                {group.messages.map((message, index) => {
                  const prevMessage = index > 0 ? group.messages[index - 1] : null;
                  const showSender = !prevMessage || prevMessage.sender.id !== message.sender.id;
                  const isCompact = !showSender;
                  const senderRole = isGroupChat ? roleByUserId?.[message.sender.id] : undefined;
                  const showUnreadDivider = firstUnreadMessageId === message.id;

                  return (
                    <div key={message.id}>
                      {showUnreadDivider && (
                        <div id="new-messages-divider" className="my-3 flex items-center gap-3" aria-label="New messages">
                          <div className="h-px flex-1 bg-[#3CCED7]/40" />
                          <span className="shrink-0 rounded-full bg-[#3CCED7]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#3CCED7]">
                            New messages
                          </span>
                          <div className="h-px flex-1 bg-[#3CCED7]/40" />
                        </div>
                      )}
                      <MessageItem
                        message={message}
                        isOwnMessage={message.sender.id === currentUserId}
                        showSender={showSender}
                        isCompact={isCompact}
                        senderRole={senderRole}
                        isSelectMode={isSelectMode}
                        isSelected={selectedMessageIds.includes(message.id)}
                        onToggleSelect={onToggleSelectMessage}
                        isHighlighted={highlightMessageId === message.id}
                        onEdit={onEditMessage}
                        onDelete={onDeleteMessage}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Scroll-to-bottom button */}
        {!isAtBottom && (
          <button
            onClick={() => {
              if (scrollRef.current) {
                scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
              }
            }}
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
