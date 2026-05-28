'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { format } from 'date-fns';
import { Forward } from 'lucide-react';
import toast from 'react-hot-toast';
import type { MessageItemProps } from '@/types/chat';
import MessageStatus from './MessageStatus';
import AttachmentDisplay from './AttachmentDisplay';
import LinkPreview from './LinkPreview';
import TaskSharePreview from './TaskSharePreview';
import ReactionsDisplay from './ReactionsDisplay';
import MessageHoverActions from './MessageHoverActions';
import { extractUrls } from '@/lib/api/linkPreviewApi';
import ChatRichTextRenderer from './ChatRichTextRenderer';

const AGENT_BOT_EMAIL = 'agent-bot@system.local';
const AGENT_BOT_USERNAME = 'agent-bot';
const SELECT_MODE_CHECKBOX_SELECTED =
  'bg-gradient-to-br from-[#3CCED7] to-[#A6E661] border-transparent shadow-sm';

function isAgentBot(sender: { email?: string; username?: string }): boolean {
  return sender.email === AGENT_BOT_EMAIL || sender.username === AGENT_BOT_USERNAME;
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-red-500', 'bg-indigo-500',
];

function avatarColor(userId: number): string {
  return AVATAR_COLORS[userId % AVATAR_COLORS.length];
}

function formatTime(iso: string): string {
  try {
    return format(new Date(iso), 'h:mm a');
  } catch {
    return '';
  }
}

function extractTaskIds(content: string): number[] {
  return [...content.matchAll(/\/tasks\/(\d+)/g)]
    .map((m) => Number(m[1]))
    .filter((id) => !Number.isNaN(id));
}


function Avatar({
  src,
  username,
  userId,
  colorClass,
  initials,
}: {
  src?: string | null;
  username: string;
  userId: number;
  colorClass?: string;
  initials: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={username}
        title={username}
        className="h-8 w-8 rounded-full object-cover"
      />
    );
  }

  return (
    <div
      className={[
        'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white',
        colorClass ?? avatarColor(userId),
      ].join(' ')}
      title={username}
    >
      {initials}
    </div>
  );
}

export default function MessageItem({
  message,
  isOwnMessage,
  showSender = true,
  isCompact = false,
  senderRole,
  isSelectMode = false,
  isSelected = false,
  onToggleSelect,
  isHighlighted = false,
  onEdit,
  onDelete,
  isHovered: externalHovered = false,
  renderActions,
  onReactionClick,
  onReactionAdd,
  onReactionRemove,
  onQuoteReply,
  onForwardSingle,
  onEnterSelectMode,
}: MessageItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [localHovered, setLocalHovered] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuOpenRef = useRef(false);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isEditing) setEditContent(message.content);
  }, [message.content, isEditing]);

  useEffect(() => {
    if (isEditing) {
      editRef.current?.focus();
      const len = editRef.current?.value.length ?? 0;
      editRef.current?.setSelectionRange(len, len);
    }
  }, [isEditing]);

  const messageContent = message.content || '';
  const isForwarded = Boolean(message.is_forwarded && message.forwarded_from);
  const forwardedFrom = message.forwarded_from?.sender_display?.trim() || '';
  const hasContent = Boolean(messageContent.trim());
  const hasAttachments = Boolean(message.attachments?.length);
  const hasReplyTo = Boolean(message.reply_to?.id);
  const replyToContent = message.reply_to
    ? `${message.reply_to.sender.username}: ${message.reply_to.content || '[Attachment]'}`
    : '';
  const hasReactions = Boolean(message.reactions && message.reactions.length > 0);

  let hasUrls = false;
  try {
    hasUrls = hasContent && extractUrls(messageContent).length > 0;
  } catch {
    // ignore malformed content
  }

  const taskIds = extractTaskIds(messageContent);
  const taskPreviewId = taskIds[0];
  const showTaskPreview = Boolean(taskPreviewId);
  const showLinkPreview = hasUrls && !showTaskPreview;
  const bot = isAgentBot(message.sender);
  const time = formatTime(message.created_at);
  const initials = bot ? 'AI' : (message.sender.username[0] ?? '?').toUpperCase();
  const isHovering = localHovered || externalHovered;

  const handleMouseEnter = () => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    setLocalHovered(true);
  };

  const handleMouseLeave = () => {
    leaveTimerRef.current = setTimeout(() => {
      if (!menuOpenRef.current) setLocalHovered(false);
    }, 150);
  };

  const handleSaveEdit = () => {
    const trimmed = editContent.trim();
    if (trimmed && trimmed !== message.content) {
      onEdit?.(message.id, trimmed);
    }
    setIsEditing(false);
  };

  const handleEditKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === 'Escape') {
      setEditContent(message.content);
      setIsEditing(false);
    }
  };

  const handleCopyText = () => {
    if (!messageContent.trim()) {
      toast.error('No message text to copy');
      return;
    }
    navigator.clipboard
      .writeText(messageContent)
      .then(() => toast.success('Message text copied'))
      .catch(() => toast.error('Could not copy message text'));
  };

  const handleCopyLink = () => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const messageChatId = message.chat_id ?? message.chat;
    if (messageChatId) params.set('chatId', String(messageChatId));
    params.set('messageId', String(message.id));

    const messagesPath = window.location.pathname.includes('/messages')
      ? window.location.pathname
      : '/messages';
    const url = `${window.location.origin}${messagesPath}?${params.toString()}`;

    navigator.clipboard
      .writeText(url)
      .then(() => toast.success('Message link copied'))
      .catch(() => toast.error('Could not copy message link'));
  };

  const handlePlaceholderAction = (label: string) => {
    toast(`${label} is not ready yet`);
  };

  const handleToggleSelect = () => {
    if (isSelectMode) onToggleSelect?.(message.id);
  };

  const rowPadding = showSender && !isCompact ? 'mt-4 py-1' : 'py-1';
  const senderLabel = isOwnMessage ? 'You' : bot ? 'AI Agent' : message.sender.username;

  return (
    <div
      id={`message-${message.id}`}
      className={[
        rowPadding,
        'transition-colors',
        isHighlighted ? 'bg-amber-50/40 scroll-mt-24' : isHovering ? 'bg-gray-50 ring-1 ring-gray-200 rounded-md' : '',
        isSelectMode ? 'relative pl-8' : '',
      ].join(' ')}
    >
      {isSelectMode && (
        <button
          type="button"
          onClick={handleToggleSelect}
          className={`absolute left-0 top-2 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all ${
            isSelected ? SELECT_MODE_CHECKBOX_SELECTED : 'border-gray-300 bg-white'
          }`}
          aria-label={isSelected ? 'Deselect message' : 'Select message'}
        >
          {isSelected && (
            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
      )}

      <div
        className={[
          'relative flex gap-2 pl-3 pr-4',
          isHighlighted ? 'rounded-lg ring-2 ring-amber-200' : '',
          isSelectMode ? 'cursor-pointer' : '',
          'border-l-2 border-transparent',
        ].join(' ')}
        onClick={handleToggleSelect}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex w-8 shrink-0 items-end pb-0.5">
          {showSender ? (
            <Avatar
              src={bot ? null : message.sender.avatar}
              username={message.sender.username}
              userId={message.sender.id}
              colorClass={bot ? 'bg-violet-500' : undefined}
              initials={initials}
            />
          ) : (
            <div className="flex w-8 items-center justify-end">
              <span className={`whitespace-nowrap text-[10px] leading-none text-gray-400 transition-opacity ${isHovering ? 'opacity-100' : 'opacity-0'}`}>
                {time}
              </span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {showSender && (
            <div className="mb-0.5 flex items-baseline gap-1.5 px-0.5">
              <span className="text-sm font-semibold text-gray-900">{senderLabel}</span>
              {bot ? (
                <span className="rounded bg-violet-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-700">
                  AI
                </span>
              ) : senderRole ? (
                <span className="max-w-[120px] truncate rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                  {senderRole}
                </span>
              ) : null}
              <span className="text-[11px] text-gray-400">{time}</span>
              {isOwnMessage && <MessageStatus message={message} />}
            </div>
          )}

          {isForwarded && (
            <div className="mb-1 flex items-center gap-1 text-[11px] text-gray-500">
              <Forward className="h-3 w-3 shrink-0" />
              <span className="truncate">Forwarded from {forwardedFrom}</span>
            </div>
          )}

          {isEditing ? (
            <div className="flex flex-col gap-1">
              <textarea
                ref={editRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={handleEditKeyDown}
                rows={3}
                className="w-full resize-none rounded-lg border border-[#3CCED7] bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#3CCED7]/30"
              />
              <div className="flex items-center justify-end gap-1.5 text-xs">
                <span className="text-gray-400">Enter to save · Esc to cancel</span>
                <button
                  type="button"
                  onClick={() => { setEditContent(message.content); setIsEditing(false); }}
                  className="rounded px-2 py-0.5 text-gray-500 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="rounded bg-[#3CCED7] px-2 py-0.5 text-white hover:bg-[#33b8c0]"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              {hasContent && (
                message.rich_body ? (
                  <div className="[overflow-wrap:anywhere]">
                    <ChatRichTextRenderer body={message.rich_body} />
                    {message.is_edited && (
                      <span className="text-[10px] text-gray-400">(edited)</span>
                    )}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-sm text-gray-900 [overflow-wrap:anywhere]">
                    {messageContent}
                    {message.is_edited && (
                      <span className="ml-1 text-[10px] text-gray-400">(edited)</span>
                    )}
                  </p>
                )
              )}

              {showTaskPreview && taskPreviewId ? (
                <TaskSharePreview taskId={taskPreviewId} className="mt-2" />
              ) : null}

              {showLinkPreview && <LinkPreview content={messageContent} />}

              {hasAttachments && (
                <AttachmentDisplay attachments={message.attachments!} isOwnMessage={isOwnMessage} />
              )}

              {hasReplyTo && (
                <div className="mt-1 rounded border border-gray-200 bg-gray-50 px-2 py-1">
                  <span className="block max-w-[280px] truncate text-xs text-gray-500">
                    {replyToContent}
                  </span>
                </div>
              )}

              {hasReactions && (
                <ReactionsDisplay
                  reactions={message.reactions!}
                  onReactionClick={(emoji, isReactedByMe) => {
                    onReactionClick?.(emoji, isReactedByMe);
                    if (isReactedByMe) onReactionRemove?.(emoji);
                    else onReactionAdd?.(emoji);
                  }}
                  align="left"
                />
              )}
            </>
          )}
        </div>

        {isHovering && !isEditing && (
          renderActions ? (
            renderActions()
          ) : (
            <MessageHoverActions
              isOwnMessage={isOwnMessage}
              onEmojiReaction={(emoji) => {
                const existing = message.reactions?.find(r => r.emoji === emoji);
                if (existing?.reacted_by_me) {
                  onReactionRemove?.(emoji);
                } else {
                  onReactionAdd?.(emoji);
                }
              }}
              onQuoteReply={() => onQuoteReply?.()}
              onCopy={handleCopyText}
              onCopyLink={handleCopyLink}
              onEdit={isOwnMessage && onEdit ? () => setIsEditing(true) : undefined}
              onForward={() => onForwardSingle?.()}
              onPin={() => handlePlaceholderAction('Pin')}
              onSave={() => handlePlaceholderAction('Save')}
              onRemind={() => handlePlaceholderAction('Remind me')}
              onMultiSelect={() => onEnterSelectMode?.()}
              onDelete={isOwnMessage && onDelete ? () => onDelete(message.id) : undefined}
              onMenuOpenChange={(open) => {
                menuOpenRef.current = open;
                if (open) {
                  if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
                  setLocalHovered(true);
                } else {
                  // Menu closed — start a short grace period before hiding toolbar
                  leaveTimerRef.current = setTimeout(() => setLocalHovered(false), 200);
                }
              }}
            />
          )
        )}
      </div>
    </div>
  );
}
