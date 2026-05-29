'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckSquare, Forward, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/authStore';
import { useMessageData } from '@/hooks/useMessageData';
import { useForwardMessages } from '@/hooks/useForwardMessages';
import { useChatWebSocket, type ChatWsEvent } from '@/hooks/useChatWebSocket';
import { useChatStore } from '@/lib/chatStore';
import { editMessage, deleteMessage, addReaction, removeReaction } from '@/lib/api/chatApi';
import type { Chat, Message } from '@/types/chat';
import MessageList from './MessageList';
import ChatComposer from './ChatComposer';
import type { RichSendData } from './ChatComposer';
import ForwardMessagesDialog from './ForwardMessagesDialog';
import TypingIndicator from './TypingIndicator';
import ThreadPanel from './ThreadPanel';

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
  const currentUserId = user?.id ? Number(user.id) : null;
  const chatsByProject = useChatStore(state => state.chatsByProject);
  // Snapshot taken at click-time in setCurrentChat — immune to subsequent setChatsForProject resets
  const capturedUnreadCount = useChatStore(state => state.capturedUnreadCounts[chat.id] ?? 0);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<number[]>([]);
  const [isForwardDialogOpen, setIsForwardDialogOpen] = useState(false);
  const [showSwitchLoadingSkeleton, setShowSwitchLoadingSkeleton] = useState(false);
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [activeThreadMessage, setActiveThreadMessage] = useState<Message | null>(null);
  const unreadCapturedForChatRef = useRef<number | null>(null);
  const { forward, isForwarding } = useForwardMessages();

  const handleSocketChatMessage = useCallback((event: ChatWsEvent) => {
    if (!event.message) return;
    const rawChatId = event.message.chat_id ?? event.message.chat ?? event.chat_id;
    const messageChatId = typeof rawChatId === 'string' ? Number(rawChatId) : rawChatId;
    if (!messageChatId || Number.isNaN(messageChatId)) return;
    useChatStore.getState().addMessage(
      messageChatId,
      { ...event.message, chat_id: messageChatId },
      currentUserId ?? undefined
    );
  }, [currentUserId]);

  const handleSocketTypingIndicator = useCallback((event: ChatWsEvent) => {
    if (event.chat_id !== chat.id || !event.user_id || event.user_id === currentUserId) return;
    const { setTypingUser, clearTypingUser } = useChatStore.getState();
    if (event.is_typing) {
      setTypingUser(event.chat_id, event.user_id);
    } else {
      clearTypingUser(event.chat_id, event.user_id);
    }
  }, [chat.id, currentUserId]);

  const handleSocketMessageStatusUpdate = useCallback((event: ChatWsEvent) => {
    const messageId = Number(event.message_id);
    if (!Number.isFinite(messageId) || !event.message?.statuses) return;
    useChatStore.getState().updateMessage(messageId, {
      statuses: event.message.statuses,
    });
  }, []);

  const handleSocketReactionUpdate = useCallback((event: ChatWsEvent) => {
    const r = event.reaction;
    if (!r) return;
    useChatStore.getState().applyReactionUpdate(r.message_id, r.emoji, r.action, r.user, currentUserId);
  }, [currentUserId]);

  const { sendTypingStart, sendTypingStop } = useChatWebSocket(currentUserId, {
    onChatMessage: handleSocketChatMessage,
    onTypingIndicator: handleSocketTypingIndicator,
    onMessageStatusUpdate: handleSocketMessageStatusUpdate,
    onReactionUpdate: handleSocketReactionUpdate,
  });

  const {
    messages,
    isLoadingMessages,
    isLoadingMoreMessages,
    isSending,
    hasMore,
    sendRich,
    loadMoreMessages,
    removeMessage,
    markAllAsRead,
  } = useMessageData({ chatId: chat.id, autoFetch: true });
  
  // Track last message count to detect new messages
  const lastMessageCountRef = useRef<number>(0);
  const lastReadChatIdRef = useRef<number | null>(null);
  const markAsReadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const jumpLoadAttemptsRef = useRef(0);
  const jumpedToMessageRef = useRef<string | null>(null);
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
    setReplyingTo(null);
    setActiveThreadMessage(null);
    unreadCapturedForChatRef.current = null;
    jumpLoadAttemptsRef.current = 0;
    jumpedToMessageRef.current = null;
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

  const targetMessageId = useMemo(() => {
    const raw = searchParams.get('messageId');
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [searchParams]);

  useEffect(() => {
    jumpLoadAttemptsRef.current = 0;
    jumpedToMessageRef.current = null;
  }, [chat.id, targetMessageId]);

  useEffect(() => {
    // If URL includes a messageId, load older history one page at a time until
    // the message exists in the rendered list, then ask MessageList to focus it.
    if (!targetMessageId) return;

    const jumpKey = `${chat.id}:${targetMessageId}`;
    const hasTargetMessage = messages.some((message) => Number(message.id) === targetMessageId);

    if (hasTargetMessage) {
      if (jumpedToMessageRef.current === jumpKey) return;
      jumpedToMessageRef.current = jumpKey;

      const frame = window.requestAnimationFrame(() => {
        window.dispatchEvent(
          new CustomEvent('mj:chat:jumpToMessage', { detail: { messageId: targetMessageId } })
        );
      });
      return () => window.cancelAnimationFrame(frame);
    }

    if (isLoadingMessages || isLoadingMoreMessages || !hasMore) return;
    if (jumpLoadAttemptsRef.current >= 12) return; // safety cap: 12 * 50 = 600 older messages

    jumpLoadAttemptsRef.current += 1;
    void loadMoreMessages();
  }, [
    chat.id,
    hasMore,
    isLoadingMessages,
    isLoadingMoreMessages,
    loadMoreMessages,
    messages,
    targetMessageId,
  ]);
  
  // Mark messages as read when viewing - both on open AND when new messages arrive
  useEffect(() => {
    if (!chat.id || messages.length === 0) return;

    const isOpeningChat = lastReadChatIdRef.current !== chat.id;
    if (isOpeningChat) lastReadChatIdRef.current = chat.id;

    // Get store actions
    const { updateChat, updateUnreadCount, fetchGlobalUnreadCount } = useChatStore.getState();

    // Always keep local unread count at 0 while viewing (optimistic update)
    updateChat(chat.id, { unread_count: 0 });
    updateUnreadCount(chat.id, 0);

    // Debounce the API call to avoid too many requests when messages stream in
    if (markAsReadTimeoutRef.current) {
      clearTimeout(markAsReadTimeoutRef.current);
    }

    // Always call the backend on first open, even if the message list came from
    // cache and its count did not grow. After that, only call when new messages arrive.
    if (isOpeningChat || messages.length > lastMessageCountRef.current) {
      markAsReadTimeoutRef.current = setTimeout(() => {
        markAllAsRead().then(() => {
          // Refetch global unread count from backend to ensure accuracy
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
    updateMessage(messageId, { content: newContent, rich_body: null, mentioned_user_ids: [], is_edited: true });
    try {
      const updated = await editMessage(messageId, newContent, null, []);
      updateMessage(messageId, {
        content: updated.content,
        rich_body: updated.rich_body ?? null,
        mentioned_user_ids: updated.mentioned_user_ids ?? [],
        is_edited: updated.is_edited ?? true,
      });
    } catch {
      updateMessage(messageId, {
        content: original?.content ?? newContent,
        rich_body: original?.rich_body ?? null,
        mentioned_user_ids: original?.mentioned_user_ids ?? [],
        is_edited: original?.is_edited ?? false,
      });
    }
  };

  const handleDeleteMessage = async (messageId: number) => {
    // removeMessage clears from both localMessages (React state) and the Zustand store,
    // preventing the merge in useMessageData from resurrecting the deleted message.
    removeMessage(messageId);
    try {
      await deleteMessage(messageId);
    } catch {
      // rollback not implemented — message is already gone from UI
    }
  };

  const handleReactionAdd = useCallback(async (messageId: number, emoji: string) => {
    if (!currentUserId) return;
    const { applyReactionUpdate, updateMessage } = useChatStore.getState();
    const actor = { id: currentUserId, username: user?.username ?? '' };
    applyReactionUpdate(messageId, emoji, 'added', actor, currentUserId);
    try {
      const response = await addReaction(messageId, emoji);
      updateMessage(messageId, { reactions: response.message.reactions ?? [] });
    } catch {
      applyReactionUpdate(messageId, emoji, 'removed', actor, currentUserId);
    }
  }, [currentUserId, user]);

  const handleReactionRemove = useCallback(async (messageId: number, emoji: string) => {
    if (!currentUserId) return;
    const { applyReactionUpdate, updateMessage } = useChatStore.getState();
    const actor = { id: currentUserId, username: user?.username ?? '' };
    applyReactionUpdate(messageId, emoji, 'removed', actor, currentUserId);
    try {
      const response = await removeReaction(messageId, emoji);
      updateMessage(messageId, { reactions: response.message.reactions ?? [] });
    } catch {
      applyReactionUpdate(messageId, emoji, 'added', actor, currentUserId);
    }
  }, [currentUserId, user]);

  const handleQuoteReply = useCallback((message: Message) => {
    setReplyingTo(message);
  }, []);

  const handleForwardSingle = useCallback((messageId: number) => {
    setIsSelectMode(true);
    setSelectedMessageIds([messageId]);
    setIsForwardDialogOpen(true);
  }, []);

  const handleSendRich = async (data: RichSendData) => {
    await sendRich(
      data.content,
      data.rich_body,
      data.mention_ids,
      data.attachment_ids,
      data.reply_to_id,
    );
    setReplyingTo(null);
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
  const handleOpenThread = useCallback((message: Message) => {
    setActiveThreadMessage((prev) => (prev?.id === message.id ? null : message));
  }, []);

  const handleTypingStart = useCallback(() => {
    sendTypingStart(chat.id);
  }, [chat.id, sendTypingStart]);

  const handleTypingStop = useCallback(() => {
    sendTypingStop(chat.id);
  }, [chat.id, sendTypingStop]);


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

      {/* Main area: timeline + optional thread panel side-by-side */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Timeline column */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-hidden">
            <MessageList
              messages={messages}
              currentUserId={currentUserId ?? 0}
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
              onReactionAdd={handleReactionAdd}
              onReactionRemove={handleReactionRemove}
              onQuoteReply={handleQuoteReply}
              onForwardSingle={handleForwardSingle}
              onEnterSelectMode={toggleSelectMode}
              onOpenThread={handleOpenThread}
              activeThreadMessageId={activeThreadMessage?.id ?? null}
            />
          </div>

          {/* Typing indicator */}
          <TypingIndicator chat={chat} currentUserId={currentUserId} />

          {/* Message Composer */}
          <div className="flex-shrink-0">
            <ChatComposer
              onSendRich={handleSendRich}
              disabled={isSending || isSelectMode || isForwarding}
              chatId={chat.id}
              onTypingStart={handleTypingStart}
              onTypingStop={handleTypingStop}
              replyingTo={replyingTo}
              onClearReply={() => setReplyingTo(null)}
              participants={chat.participants}
            />
          </div>
        </div>

        {/* Thread panel */}
        {activeThreadMessage && (
          <div className="hidden w-80 shrink-0 md:flex md:flex-col xl:w-96">
            <ThreadPanel
              rootMessage={activeThreadMessage}
              participants={chat.participants}
              currentUserId={currentUserId ?? undefined}
              onClose={() => setActiveThreadMessage(null)}
              onForwardMessage={handleForwardSingle}
            />
          </div>
        )}
      </div>

      <ForwardMessagesDialog
        isOpen={isForwardDialogOpen}
        onClose={() => setIsForwardDialogOpen(false)}
        projectId={chatProjectId ? String(chatProjectId) : ''}
        availableChats={availableTargetChats}
        currentUserId={currentUserId ?? 0}
        selectedMessageCount={selectedMessageIds.length}
        isForwarding={isForwarding}
        onSubmit={handleForwardSubmit}
      />
    </div>
  );
}
