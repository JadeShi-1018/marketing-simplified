'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { FileX2, Film, Forward, ImageOff, MicOff } from 'lucide-react';
import toast from 'react-hot-toast';
import type { MessageItemProps, MissingForwardedAttachment } from '@/types/chat';
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

function MissingForwardedAttachmentCard({ item }: { item: MissingForwardedAttachment }) {
  const isAudioLike = item.kind === 'audio' || item.kind === 'unknown';
  const Icon =
    item.kind === 'image'
      ? ImageOff
      : item.kind === 'video'
        ? Film
        : isAudioLike
          ? MicOff
          : FileX2;

  return (
    <div className="mt-2 w-full min-w-0 max-w-[300px] rounded-xl border border-dashed border-gray-300 bg-gray-50 px-3 py-2">
      <div className="flex items-center gap-2">
        {/* Greyed-out icon circle matching compact player size */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200">
          <Icon className="h-3.5 w-3.5 text-gray-400" />
        </div>

        {/* Centre column */}
        <div className="min-w-0 flex-1">
          {isAudioLike ? (
            /* Ghost waveform matching compact player layout */
            <div className="flex h-8 items-center gap-[2px] opacity-40">
              {Array.from({ length: 40 }).map((_, index) => (
                <span
                  key={`missing-wave-${item.id}-${index}`}
                  className="w-[2px] shrink-0 rounded-full bg-gray-400"
                  style={{ height: `${18 + Math.abs(Math.sin(index * 0.65)) * 62}%` }}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-8 items-center">
              <p className="truncate text-sm font-medium text-gray-500">
                {item.original_filename || 'File'}
              </p>
            </div>
          )}
          <p className="mt-0.5 text-[11px] text-gray-400">Deleted</p>
        </div>
      </div>
    </div>
  );
}

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
  onOpenThread,
  isThreadActive = false,
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
  const missingForwardedAttachments = message.missing_forwarded_attachments ?? [];
  const hasReplyTo = Boolean(message.reply_to?.id);
  const replyToAttachment = message.reply_to?.attachments?.[0] ?? null;
  const replyToContent = message.reply_to
    ? message.reply_to.content || null
    : null;
  const hasReactions = Boolean(message.reactions && message.reactions.length > 0);
  const hasThreadReplies = (message.thread_reply_count ?? 0) > 0;

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
        isHighlighted
          ? 'bg-amber-50/40 scroll-mt-24'
          : isThreadActive
            ? 'bg-teal-50/40'
            : isHovering
              ? 'bg-gray-50 ring-1 ring-gray-200 rounded-md'
              : '',
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
          isHighlighted ? 'bg-cyan-50' : '',
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
                <AttachmentDisplay
                  attachments={message.attachments!}
                  isOwnMessage={isOwnMessage}
                />
              )}

              {missingForwardedAttachments.length > 0 && (
                <div className="mt-2 flex w-full min-w-0 max-w-full flex-col gap-2">
                  {missingForwardedAttachments.map((item) => (
                    <MissingForwardedAttachmentCard key={item.id} item={item} />
                  ))}
                </div>
              )}

              {hasReplyTo && (
                <button
                  type="button"
                  onClick={() => {
                    const id = message.reply_to?.id;
                    if (!id) return;
                    window.dispatchEvent(
                      new CustomEvent('mj:chat:jumpToMessage', {
                        detail: { messageId: id, requestId: `reply:${id}:${Date.now()}` },
                      })
                    );
                  }}
                  className="mt-1 w-full max-w-[320px] rounded border border-gray-200 bg-gray-50 px-2 py-1 text-left hover:bg-gray-100 transition-colors"
                >
                  <span className="block text-[11px] font-medium text-teal-600 truncate">
                    {message.reply_to?.sender.username}
                  </span>
                  {replyToAttachment ? (
                    <span className="flex items-center gap-1 text-xs text-gray-500 truncate mt-0.5">
                      {replyToAttachment.file_type === 'image' ? (
                        <span>🖼</span>
                      ) : replyToAttachment.file_type === 'video' ? (
                        <span>🎬</span>
                      ) : replyToAttachment.mime_type?.startsWith('audio/') ||
                        replyToAttachment.original_filename?.match(/\.(webm|mp3|ogg|m4a|wav)$/i) ? (
                        <span>🎙</span>
                      ) : (
                        <span>📄</span>
                      )}
                      <span className="truncate">
                        {replyToContent || replyToAttachment.original_filename || 'Attachment'}
                      </span>
                    </span>
                  ) : (
                    <span className="block text-xs text-gray-500 truncate mt-0.5">
                      {replyToContent || '[Attachment]'}
                    </span>
                  )}
                </button>
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

              {hasThreadReplies && (
                <button
                  type="button"
                  onClick={() => onOpenThread?.()}
                  className={[
                    'mt-1.5 flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-colors hover:border-teal-300 hover:bg-teal-50',
                    isThreadActive
                      ? 'border-teal-300 bg-teal-50'
                      : 'border-gray-200 bg-white',
                  ].join(' ')}
                >
                  {/* Participant avatar stack */}
                  {message.thread_participants && message.thread_participants.length > 0 && (
                    <span className="flex -space-x-1">
                      {message.thread_participants.slice(0, 4).map((p) => (
                        p.avatar ? (
                          <img
                            key={p.id}
                            src={p.avatar}
                            alt={p.username}
                            title={p.username}
                            className="h-4 w-4 rounded-full border border-white object-cover"
                          />
                        ) : (
                          <span
                            key={p.id}
                            title={p.username}
                            className={`flex h-4 w-4 items-center justify-center rounded-full border border-white text-[8px] font-semibold text-white ${avatarColor(p.id)}`}
                          >
                            {(p.username[0] ?? '?').toUpperCase()}
                          </span>
                        )
                      ))}
                    </span>
                  )}

                  <span className="font-semibold text-teal-600">
                    {message.thread_reply_count}{' '}
                    {message.thread_reply_count === 1 ? 'reply' : 'replies'}
                  </span>

                  {message.thread_last_reply_at && (
                    <span className="text-gray-400">
                      · Last reply{' '}
                      {formatDistanceToNow(new Date(message.thread_last_reply_at), { addSuffix: true })}
                    </span>
                  )}

                  {message.has_unread_thread_replies && (
                    <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-teal-500" />
                  )}
                </button>
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
              onReplyInThread={onOpenThread}
              onQuoteReply={onQuoteReply ? () => onQuoteReply() : undefined}
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
