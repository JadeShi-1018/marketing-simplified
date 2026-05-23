'use client';

import { useState, useCallback } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import type { NotificationItem } from '@/types/notifications';
import type { Message } from '@/types/chat';
import { useDrawerChat } from '@/hooks/useDrawerChat';
import { addReaction, setMessageReminder } from '@/lib/api/chatApi';
import { useChatStore } from '@/lib/chatStore';
import DrawerChatHeader from './DrawerChatHeader';
import DrawerChatMessages from './DrawerChatMessages';
import MessageInput from '@/components/chat/MessageInput';
import ReminderPickerSheet from '@/components/chat/ReminderPickerSheet';

interface DrawerChatViewProps {
  notification: NotificationItem;
  onClose: () => void;
}

/**
 * Chat-based drawer view for message notifications.
 * Renders a mini chat interface with recent messages and input.
 */
export default function DrawerChatView({
  notification,
  onClose,
}: DrawerChatViewProps) {
  // Extract chat info from notification metadata
  const chatId = notification.metadata?.chat_id as number | undefined;
  const messageId = notification.metadata?.message_id as number | undefined;
  const projectId = notification.metadata?.project_id as number | undefined;

  // Only highlight the message if this notification is still unread.
  // This ensures highlight/scroll only happens on the first view.
  const shouldHighlight = !notification.is_read;

  const {
    chat,
    messages,
    isLoading,
    isLoadingMessages,
    error,
    sendMessage,
    sendWithAttachments,
    isSending,
    highlightMessageId,
    currentUserId,
    hasMore,
    isLoadingMore,
    loadMoreMessages,
  } = useDrawerChat({
    chatId: chatId ?? null,
    highlightMessageId: shouldHighlight ? messageId : null,
    enabled: !!chatId,
  });

  // Selection mode state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<number[]>([]);

  // Quote reply state
  const [quoteMessage, setQuoteMessage] = useState<Message | null>(null);

  // Reminder state
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [reminderMessageId, setReminderMessageId] = useState<number | null>(null);

  // Selection mode handlers
  const handleEnterSelectMode = (initialMessageId?: number) => {
    setIsSelectMode(true);
    if (initialMessageId) {
      setSelectedMessageIds([initialMessageId]);
    }
  };

  const handleCancelSelectMode = () => {
    setIsSelectMode(false);
    setSelectedMessageIds([]);
  };

  const handleToggleSelect = (messageId: number) => {
    setSelectedMessageIds((prev) =>
      prev.includes(messageId)
        ? prev.filter((id) => id !== messageId)
        : [...prev, messageId]
    );
  };

  // Message action handlers
  const handleEmojiReaction = useCallback(async (messageId: number, emoji: string) => {
    if (!chatId) return;
    try {
      const result = await addReaction(messageId, emoji);
      // Update message in store with new reactions
      if (result.message) {
        const { updateMessage } = useChatStore.getState();
        updateMessage(messageId, { reactions: result.message.reactions });
      }
    } catch (err: any) {
      console.error('Failed to add reaction:', err);
      toast.error('Failed to add reaction');
    }
  }, [chatId]);

  // Handle clicking on existing reaction (toggle)
  const handleReactionClick = useCallback(async (
    messageId: number,
    emoji: string,
    isReactedByMe: boolean
  ) => {
    // Same logic as handleEmojiReaction - toggle behavior is handled by backend
    await handleEmojiReaction(messageId, emoji);
  }, [handleEmojiReaction]);

  const handleQuoteReply = (message: Message) => {
    setQuoteMessage(message);
  };

  const handleClearQuote = () => {
    setQuoteMessage(null);
  };

  const handleForward = (messageId: number) => {
    // TODO: Implement forward dialog
    toast('Forward feature coming soon!', { icon: '↪️' });
  };

  const handleBulkForward = () => {
    if (selectedMessageIds.length === 0) return;
    // TODO: Implement forward dialog
    toast(`Forward ${selectedMessageIds.length} messages - coming soon!`, { icon: '↪️' });
  };

  const handleRemind = (messageId: number) => {
    setReminderMessageId(messageId);
    setShowReminderPicker(true);
  };

  const handleConfirmReminder = async (time: Date) => {
    if (!reminderMessageId) return;

    try {
      await setMessageReminder(reminderMessageId, time);
      setShowReminderPicker(false);
      toast.success(`Reminder set for ${format(time, 'MMM dd HH:mm')}`, { icon: '🔔' });
    } catch (error) {
      console.error('Failed to set reminder:', error);
      toast.error('Failed to set reminder');
    }
  };

  const handleRevoke = (messageId: number) => {
    // TODO: Implement when backend API is available
    toast('Revoke feature coming soon!', { icon: '↩️' });
  };

  const handleDelete = (messageId: number) => {
    // TODO: Implement when backend API is available
    toast('Delete feature coming soon!', { icon: '🗑️' });
  };

  // Handle send message
  const handleSendMessage = async (content: string) => {
    const replyToId = quoteMessage?.id ?? null;
    await sendMessage(content, replyToId);
    // Clear quote after sending
    if (quoteMessage) {
      setQuoteMessage(null);
    }
  };

  // Handle send with attachments
  const handleSendWithAttachments = async (
    content: string,
    attachmentIds: number[]
  ) => {
    const replyToId = quoteMessage?.id ?? null;
    await sendWithAttachments(content, attachmentIds, replyToId);
    // Clear quote after sending
    if (quoteMessage) {
      setQuoteMessage(null);
    }
  };

  // Error state - no chat ID in notification
  if (!chatId) {
    return (
      <div className="flex flex-col h-full">
        <DrawerChatHeader
          chat={null}
          onClose={onClose}
          isLoading={false}
        />
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-gray-500">
          <AlertCircle className="w-12 h-12 text-gray-300 mb-3" />
          <p className="text-sm font-medium">Unable to load chat</p>
          <p className="text-xs text-gray-400 mt-1">
            Chat information is missing from this notification
          </p>
        </div>
      </div>
    );
  }

  // Error state - API error
  if (error && !isLoading) {
    return (
      <div className="flex flex-col h-full">
        <DrawerChatHeader
          chat={null}
          projectId={projectId}
          onClose={onClose}
          isLoading={false}
        />
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-gray-500">
          <AlertCircle className="w-12 h-12 text-red-300 mb-3" />
          <p className="text-sm font-medium text-red-600">Error loading chat</p>
          <p className="text-xs text-gray-400 mt-1 text-center">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full">
      {/* Header */}
      <DrawerChatHeader
        chat={chat}
        projectId={projectId}
        onClose={onClose}
        isLoading={isLoading}
        isSelectMode={isSelectMode}
        selectedCount={selectedMessageIds.length}
        onCancelSelect={handleCancelSelectMode}
        onBulkForward={handleBulkForward}
      />

      {/* Messages area */}
      <DrawerChatMessages
        messages={messages}
        currentUserId={currentUserId}
        highlightMessageId={highlightMessageId}
        isLoading={isLoadingMessages}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMoreMessages}
        isSelectMode={isSelectMode}
        selectedMessageIds={selectedMessageIds}
        onToggleSelect={handleToggleSelect}
        onEmojiReaction={handleEmojiReaction}
        onQuoteReply={handleQuoteReply}
        onForward={handleForward}
        onRemind={handleRemind}
        onRevoke={handleRevoke}
        onDelete={handleDelete}
        onEnterSelectMode={handleEnterSelectMode}
        onReactionClick={handleReactionClick}
      />

      {/* Quote reply preview */}
      {quoteMessage && (
        <div className="flex-shrink-0 flex items-start gap-2 px-3 py-2 bg-gray-50 border-t border-gray-200">
          <div className="flex-shrink-0 w-1 self-stretch bg-[#3CCED7] rounded" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-600 truncate">
              {quoteMessage.sender.username}
            </p>
            <p className="text-sm text-gray-500 truncate">
              {quoteMessage.content || '[Attachment]'}
            </p>
          </div>
          <button
            onClick={handleClearQuote}
            className="flex-shrink-0 p-1 hover:bg-gray-200 rounded transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-[#3CCED7]/25 bg-white">
        <MessageInput
          variant="drawer"
          onSend={handleSendMessage}
          onSendWithAttachments={handleSendWithAttachments}
          disabled={isSending || isLoading || isSelectMode}
        />
      </div>

      {/* Reminder Picker Sheet */}
      <ReminderPickerSheet
        open={showReminderPicker}
        onOpenChange={setShowReminderPicker}
        onConfirm={handleConfirmReminder}
      />
    </div>
  );
}
