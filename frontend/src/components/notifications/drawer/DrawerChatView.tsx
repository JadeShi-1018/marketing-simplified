'use client';

import { AlertCircle } from 'lucide-react';
import type { NotificationItem } from '@/types/notifications';
import { useDrawerChat } from '@/hooks/useDrawerChat';
import DrawerChatHeader from './DrawerChatHeader';
import DrawerChatMessages from './DrawerChatMessages';
import MessageInput from '@/components/chat/MessageInput';

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

  // Handle send message
  const handleSendMessage = async (content: string) => {
    await sendMessage(content);
  };

  // Handle send with attachments
  const handleSendWithAttachments = async (
    content: string,
    attachmentIds: number[]
  ) => {
    await sendWithAttachments(content, attachmentIds);
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <DrawerChatHeader
        chat={chat}
        projectId={projectId}
        onClose={onClose}
        isLoading={isLoading}
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
      />

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-[#3CCED7]/25 bg-white">
        <MessageInput
          variant="drawer"
          onSend={handleSendMessage}
          onSendWithAttachments={handleSendWithAttachments}
          disabled={isSending || isLoading}
        />
      </div>
    </div>
  );
}
