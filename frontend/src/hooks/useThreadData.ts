'use client';

/**
 * useThreadData
 * ─────────────
 * Loads and manages thread replies for a single root message.
 *
 * Usage
 * ─────
 * Mount once per open thread panel. Pass the root message's ID.
 * The hook fetches replies on mount, marks the thread as read, and exposes
 * a sendReply function that wraps the rich-message create flow.
 */

import { useCallback, useEffect, useState } from 'react';
import { useChatStore } from '@/lib/chatStore';
import { getThreadReplies, markThreadAsRead, sendMessage } from '@/lib/api/chatApi';
import type { Message } from '@/types/chat';
import type { TiptapJSONContent } from '@/types/comment';

interface UseThreadDataReturn {
  replies: Message[];
  isLoading: boolean;
  isSending: boolean;
  sendReply: (params: {
    content: string;
    richBody: TiptapJSONContent;
    mentionIds?: number[];
    attachmentIds?: number[];
  }) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useThreadData(
  rootMessage: Message | null,
): UseThreadDataReturn {
  const rootId = rootMessage?.id ?? null;
  const chatId = rootMessage ? (rootMessage.chat_id ?? (rootMessage.chat as unknown as number)) : null;

  const threadReplies = useChatStore((s) => s.threadReplies);
  const { setThreadReplies, addThreadReply, updateMessage } = useChatStore.getState();

  const replies = rootId != null ? (threadReplies[rootId] ?? []) : [];
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const load = useCallback(async () => {
    if (rootId == null) return;
    setIsLoading(true);
    try {
      const { results } = await getThreadReplies(rootId);
      setThreadReplies(rootId, results);
      // Mark thread as read after loading
      await markThreadAsRead(rootId).catch(() => {/* non-critical */});
      // Update the root message's unread flag in the main message list
      updateMessage(rootId, { has_unread_thread_replies: false });
    } catch {
      // silently fail — replies stay empty
    } finally {
      setIsLoading(false);
    }
  }, [rootId]);

  // Fetch on mount / whenever rootId changes
  useEffect(() => {
    load();
  }, [load]);

  const sendReply = useCallback(
    async ({ content, richBody, mentionIds = [], attachmentIds = [] }: {
      content: string;
      richBody: TiptapJSONContent;
      mentionIds?: number[];
      attachmentIds?: number[];
    }) => {
      if (rootId == null || chatId == null) return;
      setIsSending(true);
      try {
        const newReply = await sendMessage({
          chat_id: chatId,
          content,
          rich_body: richBody,
          mention_ids: mentionIds,
          attachment_ids: attachmentIds,
          parent_message_id: rootId,
        });
        // Pull fresh state so reply count is always accurate
        const { addThreadReply: add, updateMessage: upd, threadReplies: tr } = useChatStore.getState();
        add(rootId, newReply);
        upd(rootId, {
          thread_reply_count: (tr[rootId]?.length ?? 0) + 1,
          thread_last_reply_at: newReply.created_at,
        });
      } finally {
        setIsSending(false);
      }
    },
    [rootId, chatId],
  );

  return { replies, isLoading, isSending, sendReply, refresh: load };
}
