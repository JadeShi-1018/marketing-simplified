'use client';

import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { format, isSameDay } from 'date-fns';
import type { Message } from '@/types/chat';
import MessageItem from '@/components/chat/MessageItem';
import MessageActionsMenu from '@/components/chat/MessageActionsMenu';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2 } from 'lucide-react';

const SCROLL_THRESHOLD = 100; // Distance from bottom to consider "at bottom"
const LOAD_MORE_THRESHOLD = 50; // Distance from top to trigger load more

interface DrawerChatMessagesProps {
  messages: Message[];
  currentUserId: number;
  highlightMessageId: number | null;
  isLoading?: boolean;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  // Selection mode
  isSelectMode?: boolean;
  selectedMessageIds?: number[];
  onToggleSelect?: (messageId: number) => void;
  // Message actions
  onEmojiReaction?: (messageId: number, emoji: string) => void;
  onQuoteReply?: (message: Message) => void;
  onForward?: (messageId: number) => void;
  onRemind?: (messageId: number) => void;
  onRevoke?: (messageId: number) => void;
  onDelete?: (messageId: number) => void;
  onEnterSelectMode?: (messageId?: number) => void;
  // Reaction click (toggle reaction from reaction display)
  onReactionClick?: (messageId: number, emoji: string, isReactedByMe: boolean) => void;
}

/**
 * New Messages Divider - shown above the first unread message
 */
function NewMessagesDivider() {
  return (
    <div className="flex items-center gap-3 my-3 px-2">
      <div className="flex-1 h-px bg-gray-300" />
      <span className="text-xs font-medium text-gray-400 whitespace-nowrap">
        New Messages Below
      </span>
      <div className="flex-1 h-px bg-gray-300" />
    </div>
  );
}

// Loading skeleton for messages
function MessageListSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {/* Left-aligned message skeleton */}
      <div className="flex justify-start">
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-16 w-48 rounded-lg" />
        </div>
      </div>

      {/* Right-aligned message skeleton */}
      <div className="flex justify-end">
        <Skeleton className="h-12 w-40 rounded-lg" />
      </div>

      {/* Left-aligned message skeleton */}
      <div className="flex justify-start">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-20 w-52 rounded-lg" />
        </div>
      </div>

      {/* Right-aligned message skeleton */}
      <div className="flex justify-end">
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>
    </div>
  );
}

// Empty state
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8">
      <p className="text-sm">No messages yet</p>
      <p className="text-xs text-gray-400 mt-1">Start the conversation!</p>
    </div>
  );
}

export default function DrawerChatMessages({
  messages,
  currentUserId,
  highlightMessageId,
  isLoading = false,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  isSelectMode = false,
  selectedMessageIds = [],
  onToggleSelect,
  onEmojiReaction,
  onQuoteReply,
  onForward,
  onRemind,
  onRevoke,
  onDelete,
  onEnterSelectMode,
  onReactionClick,
}: DrawerChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef(messages.length);
  // Track whether animation has played to prevent re-triggering
  const [hasAnimated, setHasAnimated] = useState(false);
  // Store the initial highlight message ID for the session
  // This ensures the divider stays visible even if highlightMessageId is later cleared by parent
  const sessionHighlightIdRef = useRef<number | null>(null);

  // Smart scroll: track if user is near bottom
  const [isNearBottom, setIsNearBottom] = useState(true);
  // Track which message is being hovered (for showing action bar)
  const [hoveredMessageId, setHoveredMessageId] = useState<number | null>(null);
  // Track if a menu (emoji picker or dropdown) is open - prevents hiding on mouse leave
  const isMenuOpenRef = useRef(false);
  // Track if mouse left while menu was open
  const pendingMouseLeaveRef = useRef(false);

  // Handle menu open/close state
  const handleMenuOpenChange = useCallback((isOpen: boolean) => {
    isMenuOpenRef.current = isOpen;
    // If menu just closed and mouse had left, clear the hover
    if (!isOpen && pendingMouseLeaveRef.current) {
      setHoveredMessageId(null);
      pendingMouseLeaveRef.current = false;
    }
  }, []);

  // Track scroll height before loading more to maintain position
  const prevScrollHeightRef = useRef(0);
  const wasLoadingMoreRef = useRef(false);
  // Track if initial scroll has been done (to prevent re-scrolling on load more)
  const hasInitiallyScrolledRef = useRef(false);

  // Lock in the highlightMessageId when it first becomes non-null
  // This ensures the divider persists even if highlightMessageId is cleared (e.g., when notification is marked as read)
  useEffect(() => {
    if (highlightMessageId !== null && sessionHighlightIdRef.current === null) {
      sessionHighlightIdRef.current = highlightMessageId;
    }
  }, [highlightMessageId]);

  // The persistent target message ID for this drawer session
  const sessionHighlightId = sessionHighlightIdRef.current ?? highlightMessageId;

  // Group messages by date
  const messageGroups = useMemo(() => {
    const groups: { date: string; messages: Message[] }[] = [];

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

  // Handle scroll events for smart scroll and load more
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;

    // Check if user is near bottom
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setIsNearBottom(distanceFromBottom < SCROLL_THRESHOLD);

    // Check if user scrolled to top - trigger load more
    if (scrollTop < LOAD_MORE_THRESHOLD && hasMore && !isLoadingMore) {
      onLoadMore?.();
    }
  }, [hasMore, isLoadingMore, onLoadMore]);

  // Attach scroll listener
  useEffect(() => {
    const container = scrollRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  // Preserve scroll position when loading older messages
  useEffect(() => {
    if (isLoadingMore && scrollRef.current) {
      // Store current scroll height before loading
      prevScrollHeightRef.current = scrollRef.current.scrollHeight;
      wasLoadingMoreRef.current = true;
    }
  }, [isLoadingMore]);

  // Restore scroll position after older messages are loaded
  useEffect(() => {
    if (!isLoadingMore && wasLoadingMoreRef.current && scrollRef.current && prevScrollHeightRef.current > 0) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        if (scrollRef.current && prevScrollHeightRef.current > 0) {
          const newScrollHeight = scrollRef.current.scrollHeight;
          const addedHeight = newScrollHeight - prevScrollHeightRef.current;
          if (addedHeight > 0) {
            scrollRef.current.scrollTop = addedHeight;
          }
          prevScrollHeightRef.current = 0;
          wasLoadingMoreRef.current = false;
        }
      });
    }
  }, [isLoadingMore, messages]);

  // Auto-scroll to bottom on new messages (only if user is near bottom)
  // Skip if we're loading older messages (wasLoadingMoreRef is true)
  useEffect(() => {
    if (messages.length > lastMessageCountRef.current && scrollRef.current) {
      // Only auto-scroll if user is near the bottom AND not loading older messages
      if (isNearBottom && !wasLoadingMoreRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
    lastMessageCountRef.current = messages.length;
  }, [messages.length, isNearBottom]);

  // Scroll to bottom on initial load only (not on load more)
  useEffect(() => {
    if (!isLoading && messages.length > 0 && scrollRef.current && !hasInitiallyScrolledRef.current) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        if (scrollRef.current && !hasInitiallyScrolledRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          hasInitiallyScrolledRef.current = true;
        }
      }, 100);
    }
  }, [isLoading, messages.length]);

  // Scroll to highlighted message and trigger animation
  useEffect(() => {
    if (!sessionHighlightId || hasAnimated) return;

    const el = document.getElementById(`drawer-message-${sessionHighlightId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Mark animation as played after it completes (1.8s)
      const timer = setTimeout(() => {
        setHasAnimated(true);
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [highlightMessageId, messages, hasAnimated]);

  // Reset animation state when highlightMessageId changes
  useEffect(() => {
    if (highlightMessageId) {
      setHasAnimated(false);
    }
  }, [highlightMessageId]);

  // Loading state
  if (isLoading) {
    return <MessageListSkeleton />;
  }

  // Empty state
  if (messages.length === 0) {
    return <EmptyState />;
  }

  // Divider stays visible for the entire drawer session using the locked-in session ID
  // Animation only plays once and fades out after 1.8s
  const shouldShowDivider = sessionHighlightId !== null;
  const shouldShowHighlightAnimation = sessionHighlightId !== null && !hasAnimated;

  return (
    <>
      {/* CSS Keyframes for highlight animation */}
      <style jsx>{`
        @keyframes messageHighlightFade {
          0% {
            background-color: transparent;
          }
          8.3% {
            /* 150ms / 1800ms = 8.3% - peak brightness */
            background-color: rgba(255, 235, 170, 0.35);
          }
          66.7% {
            /* 1200ms / 1800ms = 66.7% - hold peak, then start fade */
            background-color: rgba(255, 235, 170, 0.35);
          }
          100% {
            /* 1800ms - completely faded */
            background-color: transparent;
          }
        }
        .animate-message-highlight {
          animation: messageHighlightFade 1.8s ease-out forwards;
          border-radius: 0.5rem;
        }
      `}</style>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-4"
      >
        {/* Loading indicator for older messages */}
        {isLoadingMore && (
          <div className="flex justify-center py-2">
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          </div>
        )}

        {messageGroups.map((group) => (
          <div key={group.date}>
            {/* Date Header */}
            <div className="flex justify-center mb-3">
              <span className="bg-gray-100 text-gray-600 text-xs font-medium px-3 py-1 rounded-full">
                {formatDateHeader(group.date)}
              </span>
            </div>

            {/* Messages */}
            <div className="space-y-2">
              {group.messages.map((message, index) => {
                const prevMessage = index > 0 ? group.messages[index - 1] : null;
                const showSender =
                  !prevMessage || prevMessage.sender.id !== message.sender.id;
                const isTargetMessage = sessionHighlightId === message.id;
                // Divider persists for the drawer session
                const showDivider = isTargetMessage && shouldShowDivider;
                // Animation fades out after 1.8s
                const showHighlightAnimation = isTargetMessage && shouldShowHighlightAnimation;
                const isOwnMessage = message.sender.id === currentUserId;
                const isSelected = selectedMessageIds.includes(message.id);

                return (
                  <div key={message.id}>
                    {/* New Messages Divider - shown above the target message */}
                    {showDivider && <NewMessagesDivider />}

                    {/* Revoked message notice */}
                    {message.is_revoked ? (
                      <div
                        id={`drawer-message-${message.id}`}
                        className="text-center text-xs text-gray-400 my-2 py-1"
                      >
                        {isOwnMessage
                          ? 'You recalled a message'
                          : 'The other party recalled a message'}
                      </div>
                    ) : (
                      /* Message with hover detection */
                      <div
                        id={`drawer-message-${message.id}`}
                        className={`relative ${showHighlightAnimation ? 'animate-message-highlight' : ''}`}
                        onMouseEnter={() => {
                          setHoveredMessageId(message.id);
                          pendingMouseLeaveRef.current = false;
                        }}
                        onMouseLeave={() => {
                          // If menu is open, mark as pending and don't clear yet
                          if (isMenuOpenRef.current) {
                            pendingMouseLeaveRef.current = true;
                          } else {
                            setHoveredMessageId(null);
                          }
                        }}
                      >
                        <MessageItem
                          message={message}
                          isOwnMessage={isOwnMessage}
                          showSender={showSender}
                          isSelectMode={isSelectMode}
                          isSelected={isSelected}
                          onToggleSelect={onToggleSelect}
                          isHighlighted={false}
                          isHovered={hoveredMessageId === message.id}
                          onReactionClick={(emoji, isReactedByMe) =>
                            onReactionClick?.(message.id, emoji, isReactedByMe)
                          }
                          renderActions={() => (
                            <MessageActionsMenu
                              message={message}
                              isOwnMessage={isOwnMessage}
                              onEmojiReaction={(emoji) => onEmojiReaction?.(message.id, emoji)}
                              onQuoteReply={() => onQuoteReply?.(message)}
                              onForward={() => onForward?.(message.id)}
                              onRemind={() => onRemind?.(message.id)}
                              onMultiSelect={() => onEnterSelectMode?.(message.id)}
                              onRevoke={() => onRevoke?.(message.id)}
                              onDelete={() => onDelete?.(message.id)}
                              onMenuOpenChange={handleMenuOpenChange}
                            />
                          )}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
