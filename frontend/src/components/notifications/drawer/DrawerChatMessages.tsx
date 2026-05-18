'use client';

import { useEffect, useRef, useMemo, useState } from 'react';
import { format, isSameDay } from 'date-fns';
import type { Message } from '@/types/chat';
import MessageItem from '@/components/chat/MessageItem';
import { Skeleton } from '@/components/ui/skeleton';

interface DrawerChatMessagesProps {
  messages: Message[];
  currentUserId: number;
  highlightMessageId: number | null;
  isLoading?: boolean;
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
}: DrawerChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef(messages.length);
  // Track whether animation has played to prevent re-triggering
  const [hasAnimated, setHasAnimated] = useState(false);

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

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > lastMessageCountRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    lastMessageCountRef.current = messages.length;
  }, [messages.length]);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (!isLoading && messages.length > 0 && scrollRef.current) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [isLoading, messages.length]);

  // Scroll to highlighted message and trigger animation
  useEffect(() => {
    if (!highlightMessageId || hasAnimated) return;

    const el = document.getElementById(`drawer-message-${highlightMessageId}`);
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

  // Divider stays visible for the entire drawer session (as long as highlightMessageId is set)
  // Animation only plays once and fades out after 1.8s
  const shouldShowDivider = highlightMessageId !== null;
  const shouldShowHighlightAnimation = highlightMessageId !== null && !hasAnimated;

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
        className="flex-1 overflow-y-auto p-3 space-y-4"
      >
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
                const isTargetMessage = highlightMessageId === message.id;
                // Divider persists for the drawer session
                const showDivider = isTargetMessage && shouldShowDivider;
                // Animation fades out after 1.8s
                const showHighlightAnimation = isTargetMessage && shouldShowHighlightAnimation;

                return (
                  <div key={message.id}>
                    {/* New Messages Divider - shown above the target message */}
                    {showDivider && <NewMessagesDivider />}

                    {/* Message with optional highlight animation */}
                    <div
                      id={`drawer-message-${message.id}`}
                      className={showHighlightAnimation ? 'animate-message-highlight' : ''}
                    >
                      <MessageItem
                        message={message}
                        isOwnMessage={message.sender.id === currentUserId}
                        showSender={showSender}
                        isSelectMode={false}
                        isSelected={false}
                        isHighlighted={false}
                      />
                    </div>
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
