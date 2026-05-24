'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckSquare, Forward, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/authStore';
import { useMessageData } from '@/hooks/useMessageData';
import { useForwardMessages } from '@/hooks/useForwardMessages';
import { useChatStore } from '@/lib/chatStore';
import { editMessage, deleteMessage } from '@/lib/api/chatApi';
import type { Chat } from '@/types/chat';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ForwardMessagesDialog from './ForwardMessagesDialog';
import TypingIndicator from './TypingIndicator';

interface ChatWindowProps {
  chat: Chat;
  onBack: () => void;
  roleByUserId?: Record<number, string>;
  /**
   * When true, the back button hides on the md+ viewport. Use this for the
   * full-page Messages view where the sidebar is always visible on desktop.
   * Default false — preserves the floating-widget back behavior.
   */
  hideBackOnDesktop?: boolean;
}

export default function ChatWindow({ chat, onBack, roleByUserId, hideBackOnDesktop }: ChatWindowProps) {
  const searchParams = useSearchParams();
  // Use selector for stable reference
  const user = useAuthStore(state => state.user);
  const chatsByProject = useChatStore(state => state.chatsByProject);
  // Snapshot taken at click-time in setCurrentChat — immune to subsequent setChatsForProject resets
  const capturedUnreadCount = useChatStore(state => state.capturedUnreadCounts[chat.id] ?? 0);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<number[]>([]);
  const [isForwardDialogOpen, setIsForwardDialogOpen] = useState(false);
  const [showSwitchLoadingSkeleton, setShowSwitchLoadingSkeleton] = useState(false);
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<number | null>(null);
  const unreadCapturedForChatRef = useRef<number | null>(null);
  const { forward, isForwarding } = useForwardMessages();

  const {
    messages,
    isLoadingMessages,
    isLoadingMoreMessages,
    isSending,
    hasMore,
    send,
    sendWithAttachments,
    loadMoreMessages,
    markAllAsRead,
  } = useMessageData({ chatId: chat.id, autoFetch: true });
  
  // Track last message count to detect new messages
  const lastMessageCountRef = useRef<number>(0);
  const lastReadChatIdRef = useRef<number | null>(null);
  const markAsReadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const jumpInFlightRef = useRef(false);
  const previousChatIdRef = useRef<number | null>(null);

  const chatProjectId = useMemo(() => {
    const rawProjectId = (chat as any).project_id ?? (chat as any).project;
    const parsed = Number(rawProjectId);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [chat]);

  const availableTargetChats = useMemo(() => {
    if (!chatProjectId) return [];
    return (chatsByProject[chatProjectId] || []).filter((c) => c.id !== chat.id);
  }, [chatProjectId, chatsByProject, chat.id]);

  useEffect(() => {
    setIsSelectMode(false);
    setSelectedMessageIds([]);
    setIsForwardDialogOpen(false);
    setFirstUnreadMessageId(null);
    unreadCapturedForChatRef.current = null;
  }, [chat.id]);

  useEffect(() => {
    const previousChatId = previousChatIdRef.current;
    if (previousChatId !== null && previousChatId !== chat.id) {
      setShowSwitchLoadingSkeleton(true);
    }
    previousChatIdRef.current = chat.id;
  }, [chat.id]);

  useEffect(() => {
    if (!isLoadingMessages) {
      setShowSwitchLoadingSkeleton(false);
    }
  }, [isLoadingMessages]);

  useEffect(() => {
    // If URL includes a messageId, try to load history until it exists, then scroll + highlight it.
    const raw = searchParams.get('messageId');
    const targetMessageId = raw ? Number(raw) : NaN;
    if (!Number.isFinite(targetMessageId) || targetMessageId <= 0) return;
    if (jumpInFlightRef.current) return;

    jumpInFlightRef.current = true;
    const maxPages = 12; // safety cap: 12 * 50 = 600 messages
    let cancelled = false;

    (async () => {
      try {
        // Give initial fetch a moment to populate, then iteratively load older pages if needed.
        for (let i = 0; i < maxPages && !cancelled; i++) {
          const exists = useChatStore.getState().messages?.[chat.id]?.some((m) => m.id === targetMessageId);
          if (exists) break;
          if (!hasMore) break;
          // eslint-disable-next-line no-await-in-loop
          await loadMoreMessages();
        }

        if (cancelled) return;
        const exists = useChatStore.getState().messages?.[chat.id]?.some((m) => m.id === targetMessageId);
        if (!exists) return;

        window.dispatchEvent(
          new CustomEvent('mj:chat:jumpToMessage', { detail: { messageId: targetMessageId } })
        );
      } finally {
        jumpInFlightRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
      jumpInFlightRef.current = false;
    };
  }, [chat.id, searchParams, hasMore, loadMoreMessages]);
  
  // Mark messages as read when viewing - both on open AND when new messages arrive
  useEffect(() => {
    if (!chat.id || messages.length === 0) return;

    // Reset the per-chat counter when switching chats so the next compare
    // always sees a fresh open and fires markAllAsRead.
    if (lastReadChatIdRef.current !== chat.id) {
      lastMessageCountRef.current = 0;
      lastReadChatIdRef.current = chat.id;
    }

    // Get store actions
    const { updateChat, updateUnreadCount, fetchGlobalUnreadCount } = useChatStore.getState();

    // Always keep local unread count at 0 while viewing (optimistic update)
    updateChat(chat.id, { unread_count: 0 });
    updateUnreadCount(chat.id, 0);

    // Debounce the API call to avoid too many requests when messages stream in
    if (markAsReadTimeoutRef.current) {
      clearTimeout(markAsReadTimeoutRef.current);
    }

    // Only call API if this is initial load OR new messages arrived
    if (messages.length > lastMessageCountRef.current) {
      console.log('[ChatWindow] New messages detected, scheduling markAllAsRead:', {
        chatId: chat.id,
        previousCount: lastMessageCountRef.current,
        newCount: messages.length,
      });

      markAsReadTimeoutRef.current = setTimeout(() => {
        markAllAsRead().then(() => {
          console.log('[ChatWindow] markAllAsRead completed for chat:', chat.id);
          fetchGlobalUnreadCount();
          // Intentionally NOT clearing firstUnreadMessageId here — the divider
          // stays visible until the user closes and reopens the conversation.
        });
      }, 500); // Debounce 500ms
    }

    lastMessageCountRef.current = messages.length;
    
    // Cleanup timeout on unmount
    return () => {
      if (markAsReadTimeoutRef.current) {
        clearTimeout(markAsReadTimeoutRef.current);
      }
    };
  }, [chat.id, messages.length, markAllAsRead]);
  
  // When a fresh positive capturedUnreadCount arrives (e.g. setChatsForProject resolves
  // after a race, or account switch) and the divider is not currently showing, unlock
  // the capture ref so the effect below can re-run.  Must be defined BEFORE the
  // capture effect so it runs first within the same React commit.
  useEffect(() => {
    if (firstUnreadMessageId !== null) return; // Divider already visible — don't disturb it
    if (capturedUnreadCount > 0) {
      unreadCapturedForChatRef.current = null; // Unlock → let the capture effect fire
    }
  }, [chat.id, capturedUnreadCount, firstUnreadMessageId]);

  // Capture the first unread message once per chat open, before markAllAsRead fires.
  // Uses capturedUnreadCount (snapshotted at click-time in setCurrentChat, then
  // refreshed by setChatsForProject) rather than chat.unread_count.
  useEffect(() => {
    if (unreadCapturedForChatRef.current === chat.id) return;
    if (messages.length === 0) return;
    if (capturedUnreadCount > 0 && capturedUnreadCount <= messages.length) {
      const firstUnread = messages[messages.length - capturedUnreadCount];
      if (firstUnread) setFirstUnreadMessageId(firstUnread.id);
    }
    // Only lock the ref once we've seen real data (non-zero count, or confirmed 0
    // by having messages loaded — the unlock effect above will re-open it if needed).
    // Only lock once messages are actually loaded. If we locked on capturedUnreadCount > 0
    // alone (messages still empty), the effect would return early on the messages.length
    // guard above and then the ref would be locked before we could ever capture.
    if (messages.length > 0) {
      unreadCapturedForChatRef.current = chat.id;
    }
  }, [chat.id, capturedUnreadCount, messages]);

  const handleEditMessage = async (messageId: number, newContent: string) => {
    const { updateMessage } = useChatStore.getState();
    const original = messages.find((m) => m.id === messageId);
    updateMessage(messageId, { content: newContent, is_edited: true });
    try {
      const updated = await editMessage(messageId, newContent);
      updateMessage(messageId, { content: updated.content, is_edited: updated.is_edited ?? true });
    } catch {
      updateMessage(messageId, { content: original?.content ?? newContent, is_edited: original?.is_edited ?? false });
    }
  };

  const handleDeleteMessage = async (messageId: number) => {
    const { removeMessage } = useChatStore.getState();
    removeMessage(messageId);
    try {
      await deleteMessage(messageId);
    } catch {
      // rollback not implemented — message is already gone from UI
    }
  };

  const handleSendMessage = async (content: string) => {
    await send(content);
  };

  const handleSendWithAttachments = async (content: string, attachmentIds: number[]) => {
    await sendWithAttachments(content, attachmentIds);
  };

  const toggleSelectMode = () => {
    if (isSelectMode) {
      setIsSelectMode(false);
      setSelectedMessageIds([]);
      setIsForwardDialogOpen(false);
      return;
    }
    setIsSelectMode(true);
  };

  const handleToggleSelectMessage = (messageId: number) => {
    if (!isSelectMode) return;
    setSelectedMessageIds((prev) =>
      prev.includes(messageId)
        ? prev.filter((id) => id !== messageId)
        : [...prev, messageId]
    );
  };

  const handleOpenForwardDialog = () => {
    if (selectedMessageIds.length === 0 || isForwarding) return;
    setIsForwardDialogOpen(true);
  };

  const handleForwardSubmit = async (targetChatIds: number[], targetUserIds: number[]) => {
    if (!chatProjectId || selectedMessageIds.length === 0) return;

    const response = await forward({
      source_chat_id: chat.id,
      source_message_ids: selectedMessageIds,
      target_chat_ids: targetChatIds,
      target_user_ids: targetUserIds,
    });

    if (!response) return;

    setIsForwardDialogOpen(false);
    setSelectedMessageIds([]);
    setIsSelectMode(false);
  };

  // Get the other participant (not current user) for private chats
  const getOtherParticipant = () => {
    if (chat.type === 'group' || !chat.participants) return null;
    // Ensure numeric comparison to avoid type mismatch (user.id can be string | number | undefined)
    const currentUserId = user?.id ? Number(user.id) : null;
    if (currentUserId === null) return null;
    return chat.participants.find(p => p.user.id !== currentUserId);
  };

  const otherParticipant = getOtherParticipant();
  const otherParticipantRole =
    chat.type === 'private' && otherParticipant?.user?.id
      ? roleByUserId?.[otherParticipant.user.id]
      : undefined;
  const chatName = chat.type === 'group' 
    ? (chat.name || 'Group Chat')
    : (otherParticipant?.user?.username || 'Chat');

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Chat Header */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
        <button
          onClick={onBack}
          className={[
            'rounded p-1 transition-colors hover:bg-gray-100',
            hideBackOnDesktop ? 'md:hidden' : '',
          ].join(' ')}
          aria-label="Back to chat list"
          title="Back to chat list"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">
              {chatName}
            </h3>
            {chat.type === 'private' && otherParticipantRole && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded flex-shrink-0">
                {otherParticipantRole}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isSelectMode ? (
            <button
              onClick={toggleSelectMode}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 sm:px-2.5"
              aria-label="Select messages"
              title="Select messages"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span className="hidden min-[380px]:inline">Select</span>
            </button>
          ) : (
            <>
              <span className="hidden text-xs text-gray-600 min-[380px]:inline">
                {selectedMessageIds.length} selected
              </span>
              <button
                onClick={handleOpenForwardDialog}
                disabled={selectedMessageIds.length === 0 || isForwarding}
                className="inline-flex items-center gap-1 rounded-md bg-[#3CCED7] px-2 py-1.5 text-xs font-medium text-white hover:bg-[#2AB5BD] disabled:cursor-not-allowed disabled:opacity-50 sm:px-2.5"
                aria-label="Forward selected messages"
                title="Forward selected messages"
              >
                <Forward className="w-3.5 h-3.5" />
                <span className="hidden min-[380px]:inline">Forward</span>
              </button>
              <button
                onClick={toggleSelectMode}
                className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 sm:px-2.5"
                aria-label="Cancel message selection"
                title="Cancel message selection"
              >
                <X className="w-3.5 h-3.5" />
                <span className="hidden min-[380px]:inline">Cancel</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-hidden">
        <MessageList
          messages={messages}
          currentUserId={user?.id ? Number(user.id) : 0}
          onLoadMore={loadMoreMessages}
          hasMore={hasMore}
          isLoading={isLoadingMessages}
          isLoadingMoreMessages={isLoadingMoreMessages}
          showSwitchLoadingSkeleton={showSwitchLoadingSkeleton}
          roleByUserId={roleByUserId}
          isGroupChat={chat.type === 'group'}
          isSelectMode={isSelectMode}
          selectedMessageIds={selectedMessageIds}
          onToggleSelectMessage={handleToggleSelectMessage}
          firstUnreadMessageId={firstUnreadMessageId}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
        />
      </div>

      {/* Typing indicator */}
      <TypingIndicator chat={chat} currentUserId={user?.id ? Number(user.id) : null} />

      {/* Message Input */}
      <div className="flex-shrink-0">
        <MessageInput
          onSend={handleSendMessage}
          onSendWithAttachments={handleSendWithAttachments}
          disabled={isSending || isSelectMode || isForwarding}
          chatId={chat.id}
        />
      </div>

      <ForwardMessagesDialog
        isOpen={isForwardDialogOpen}
        onClose={() => setIsForwardDialogOpen(false)}
        projectId={chatProjectId ? String(chatProjectId) : ''}
        availableChats={availableTargetChats}
        currentUserId={user?.id ? Number(user.id) : 0}
        selectedMessageCount={selectedMessageIds.length}
        isForwarding={isForwarding}
        onSubmit={handleForwardSubmit}
      />
    </div>
  );
}
