// Chat API client
import api from '../api';
import type {
  Chat,
  ChatStarRow,
  Message,
  CreateChatRequest,
  CreateChatResponse,
  SendMessageRequest,
  SendMessageResponse,
  ForwardBatchRequest,
  ForwardBatchResponse,
  GetChatsParams,
  GetMessagesParams,
  PaginatedResponse,
  SearchMessagesParams,
  SearchMessagesResponse,
} from '@/types/chat';
import type { TiptapJSONContent } from '@/types/comment';

// ==================== Chat Endpoints ====================

/**
 * Get all chats for the current user, optionally filtered by project
 */
export const getChats = async (params?: GetChatsParams): Promise<PaginatedResponse<Chat>> => {
  const response = await api.get('/api/chat/chats/', { params });
  return response.data;
};

/**
 * Get a specific chat by ID
 */
export const getChat = async (chatId: number): Promise<Chat> => {
  const response = await api.get(`/api/chat/chats/${chatId}/`);
  return response.data;
};

/**
 * Create a new chat (private or group)
 */
export const createChat = async (data: CreateChatRequest): Promise<CreateChatResponse> => {
  // Transform project_id to project (backend expects 'project' field)
  const payload = {
    type: data.type,
    project: data.project_id, // Backend expects 'project' not 'project_id'
    participant_ids: data.participant_ids,
    ...(data.name && { name: data.name }), // Only include name if provided
  };
  
  const response = await api.post('/api/chat/chats/', payload);
  return response.data;
};

/**
 * Delete a chat
 */
export const deleteChat = async (chatId: number): Promise<void> => {
  await api.delete(`/api/chat/chats/${chatId}/`);
};

// ==================== Starred chats ====================

export const listStarredChats = async (projectId: number): Promise<ChatStarRow[]> => {
  const response = await api.get('/api/chat/starred/', { params: { project_id: projectId } });
  return response.data;
};

export const starChat = async (chatId: number): Promise<ChatStarRow> => {
  const response = await api.post('/api/chat/starred/', { chat_id: chatId });
  return response.data;
};

export const unstarChat = async (chatId: number): Promise<void> => {
  await api.delete(`/api/chat/starred/${chatId}/`);
};

export const reorderStarredChats = async (
  projectId: number,
  chatIds: number[]
): Promise<void> => {
  await api.post('/api/chat/starred/reorder/', {
    project_id: projectId,
    chat_ids: chatIds,
  });
};

/**
 * Add a participant to a group chat
 */
export const addParticipant = async (chatId: number, userId: number): Promise<Chat> => {
  const response = await api.post(`/api/chat/chats/${chatId}/add_participant/`, {
    user_id: userId,
  });
  return response.data;
};

/**
 * Remove a participant from a group chat
 */
export const removeParticipant = async (chatId: number, userId: number): Promise<Chat> => {
  const response = await api.post(`/api/chat/chats/${chatId}/remove_participant/`, {
    user_id: userId,
  });
  return response.data;
};

// ==================== Message Endpoints ====================

/**
 * Get messages for a specific chat with cursor-based pagination
 */
export const getMessages = async (params: GetMessagesParams): Promise<{
  results: Message[];
  next_cursor: string | null;
  prev_cursor: string | null;
  page_size: number;
}> => {
  // Transform params to match backend API (page_size instead of limit)
  const queryParams: Record<string, any> = {
    chat_id: params.chat_id,
  };
  
  if (params.limit) {
    queryParams.page_size = params.limit;
  }
  if (params.before) {
    queryParams.before = params.before;
  }
  if (params.after) {
    queryParams.after = params.after;
  }
  
  const response = await api.get('/api/chat/messages/', { params: queryParams });
  return response.data;
};

/**
 * Get a specific message by ID
 */
export const getMessage = async (messageId: number): Promise<Message> => {
  const response = await api.get(`/api/chat/messages/${messageId}/`);
  return response.data;
};

/**
 * Send a new message
 */
export const sendMessage = async (data: SendMessageRequest): Promise<SendMessageResponse> => {
  // Transform chat_id to chat (backend expects 'chat' field)
  const payload: Record<string, any> = {
    chat: data.chat_id, // Backend expects 'chat' not 'chat_id'
    content: data.content,
  };

  // Include attachment_ids if present
  if (data.attachment_ids && data.attachment_ids.length > 0) {
    payload.attachment_ids = data.attachment_ids;
  }

  // Include reply_to_id if present (quote reply)
  if (data.reply_to_id) {
    payload.reply_to_id = data.reply_to_id;
  }

  // Include rich_body if present
  if (data.rich_body != null) {
    payload.rich_body = data.rich_body;
  }

  // Include mention_ids if present
  if (data.mention_ids && data.mention_ids.length > 0) {
    payload.mention_ids = data.mention_ids;
  }

  // Include parent_message_id if this is a thread reply
  if (data.parent_message_id) {
    payload.parent_message_id = data.parent_message_id;
  }

  const response = await api.post('/api/chat/messages/', payload);
  return response.data;
};

// ── Thread API ────────────────────────────────────────────────────────────────

export const getThreadReplies = async (rootMessageId: number): Promise<{ results: Message[] }> => {
  const response = await api.get(`/api/chat/messages/${rootMessageId}/thread_replies/`);
  return response.data;
};

export const markThreadAsRead = async (rootMessageId: number): Promise<void> => {
  await api.post(`/api/chat/messages/${rootMessageId}/mark_thread_as_read/`);
};

export const editMessage = async (
  messageId: number,
  content: string,
  richBody?: TiptapJSONContent | null,
  mentionIds?: number[]
): Promise<Message> => {
  const payload: Record<string, any> = { content };
  if (richBody !== undefined) {
    payload.rich_body = richBody;
  }
  if (mentionIds !== undefined) {
    payload.mention_ids = mentionIds;
  }
  const response = await api.patch(`/api/chat/messages/${messageId}/`, payload);
  return response.data;
};

/**
 * Mark a message as read
 */
export const markMessageAsRead = async (messageId: number): Promise<Message> => {
  const response = await api.post(`/api/chat/messages/${messageId}/mark_as_read/`);
  return response.data;
};

/**
 * Mark all messages in a chat as read (via backend endpoint)
 */
export const markChatAsRead = async (chatId: number): Promise<void> => {
  await api.post(`/api/chat/chats/${chatId}/mark_as_read/`);
};

/**
 * Forward multiple messages to multiple chats/users
 */
export const forwardMessagesBatch = async (
  data: ForwardBatchRequest
): Promise<ForwardBatchResponse> => {
  const payload = {
    source_chat_id: data.source_chat_id,
    source_message_ids: data.source_message_ids,
    target_chat_ids: data.target_chat_ids || [],
    target_user_ids: data.target_user_ids || [],
  };

  const response = await api.post('/api/chat/messages/forward_batch/', payload);
  return response.data;
};

// ==================== Helper Functions ====================

/**
 * Check if a private chat already exists between two users
 */
export const findPrivateChat = async (
  projectId: number,
  otherUserId: number
): Promise<Chat | null> => {
  try {
    const response = await getChats({
      project_id: projectId,
      type: 'private',
      limit: 100,
    });
    
    // Find chat with the specific user
    const existingChat = response.results.find(chat => {
      return chat.participants.some(p => p.user.id === otherUserId);
    });
    
    return existingChat || null;
  } catch (error) {
    console.error('Error finding private chat:', error);
    return null;
  }
};

/**
 * Get unread message count
 * @param chatId - Optional. If provided, returns unread count for specific chat.
 *                 If not provided, returns total unread count across ALL chats/projects.
 */
export const getUnreadCount = async (chatId?: number): Promise<number> => {
  try {
    const params = chatId ? { chat_id: chatId } : {};
    const response = await api.get('/api/chat/messages/unread_count/', { params });
    return response.data.unread_count || 0;
  } catch (error) {
    console.error('Error getting unread count:', error);
    return 0;
  }
};

// ==================== Reaction Endpoints ====================

/**
 * Add or toggle a reaction on a message
 * If the user already has this reaction, it will be removed (toggle behavior)
 */
export const addReaction = async (
  messageId: number,
  emoji: string
): Promise<{ status: 'added' | 'removed'; message: Message }> => {
  const response = await api.post(`/api/chat/messages/${messageId}/react/`, {
    emoji,
  });
  return response.data;
};

/**
 * Remove a specific reaction from a message
 */
export const removeReaction = async (
  messageId: number,
  emoji: string
): Promise<{ status: 'removed'; message: Message }> => {
  const response = await api.delete(
    `/api/chat/messages/${messageId}/react/${encodeURIComponent(emoji)}/`
  );
  return response.data;
};

// ==================== Reminder Endpoints ====================

/**
 * Set or update a reminder for a message
 */
export const setMessageReminder = async (
  messageId: number,
  remindAt: Date,
  note?: string
): Promise<{ status: 'created' | 'updated'; reminder: { id: number; remind_at: string; note: string } }> => {
  const response = await api.post(`/api/chat/messages/${messageId}/remind/`, {
    remind_at: remindAt.toISOString(),
    note: note || '',
  });
  return response.data;
};

/**
 * Cancel a reminder for a message
 */
export const cancelMessageReminder = async (
  messageId: number
): Promise<{ status: 'cancelled' }> => {
  const response = await api.delete(`/api/chat/messages/${messageId}/cancel_remind/`);
  return response.data;
};

// ==================== Revoke/Delete Endpoints ====================

/**
 * Revoke a message (within 2 minutes of sending)
 * The message will be marked as revoked and show a notice to all users
 */
export const revokeMessage = async (
  messageId: number
): Promise<{ status: 'revoked'; message: Message }> => {
  const response = await api.post(`/api/chat/messages/${messageId}/revoke/`);
  return response.data;
};

/**
 * Delete a message (hard delete from database)
 * The message will be completely removed
 */
export const deleteMessage = async (
  messageId: number
): Promise<{ status: 'deleted' }> => {
  const response = await api.delete(`/api/chat/messages/${messageId}/`);
  return response.data;
};

/**
 * Hide a message for the current user only (personal hide, does not affect others).
 * POST /api/chat/messages/{messageId}/hide/
 */
export const hideMessage = async (
  messageId: number
): Promise<{ status: 'hidden'; message: Message }> => {
  const response = await api.post(`/api/chat/messages/${messageId}/hide/`);
  return response.data;
};

/**
 * Forward multiple messages to multiple chats/users in batch.
 * POST /api/chat/messages/forward_batch/
 */
export const forwardBatch = async (
  data: ForwardBatchRequest
): Promise<ForwardBatchResponse> => {
  const response = await api.post('/api/chat/messages/forward_batch/', data);
  return response.data;
};

// Export all functions as a single API object (optional alternative style)
const chatApi = {
  getChats,
  getChat,
  createChat,
  deleteChat,
  listStarredChats,
  starChat,
  unstarChat,
  reorderStarredChats,
  addParticipant,
  removeParticipant,
  getMessages,
  getMessage,
  sendMessage,
  forwardMessagesBatch,
  markMessageAsRead,
  markChatAsRead,
  findPrivateChat,
  getUnreadCount,
  addReaction,
  removeReaction,
  setMessageReminder,
  cancelMessageReminder,
  revokeMessage,
  deleteMessage,
};

export default chatApi;

// ==================== Search ====================

export const searchMessages = async (params: SearchMessagesParams): Promise<SearchMessagesResponse> => {
  const response = await api.get('/api/chat/search/', { params });
  return response.data;
};
