'use client';

import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { format } from 'date-fns';
import { Copy, Edit2, Forward, Trash2 } from 'lucide-react';
import type { MessageItemProps } from '@/types/chat';
import MessageStatus from './MessageStatus';
import AttachmentDisplay from './AttachmentDisplay';
import LinkPreview from './LinkPreview';
import TaskSharePreview from './TaskSharePreview';
import { extractUrls } from '@/lib/api/linkPreviewApi';

const AGENT_BOT_EMAIL = 'agent-bot@system.local';
const AGENT_BOT_USERNAME = 'agent-bot';

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

const TOOLBAR_BASE =
  'flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white shadow-md px-1 py-0.5 z-10';

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
}: MessageItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isHovered, setIsHovered] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  // Hide toolbar with a short delay so the cursor can travel from the message
  // to the floating toolbar without it disappearing mid-move.
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    leaveTimerRef.current = setTimeout(() => setIsHovered(false), 150);
  };

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

  let hasUrls = false;
  try {
    hasUrls = hasContent && extractUrls(messageContent).length > 0;
  } catch {
    // ignore
  }

  const taskIds = extractTaskIds(messageContent);
  const taskPreviewId = taskIds[0];
  const showTaskPreview = Boolean(taskPreviewId);
  const showLinkPreview = hasUrls && !showTaskPreview;
  const bot = isAgentBot(message.sender);
  const time = formatTime(message.created_at);

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

  const handleCopy = () => {
    navigator.clipboard.writeText(messageContent).catch(() => {});
  };

  const handleToggleSelect = () => {
    if (isSelectMode) onToggleSelect?.(message.id);
  };

  // Avatar rows keep a real gap (mt-4) above so groups stay separated; only small
  // vertical padding is used for the hover highlight. Consecutive rows have no
  // margin so the ring highlight looks continuous across a group.
  const rowPadding = showSender ? 'mt-4 py-1' : 'py-1';

  // ── Own messages (left-aligned, same style as others) ────────────────────────
  if (isOwnMessage) {
    return (
      <div
        id={`message-${message.id}`}
        className={[
          rowPadding,
          'transition-colors',
          isHighlighted ? 'bg-amber-50/40 scroll-mt-24' : isHovered ? 'bg-gray-50 ring-1 ring-gray-200 rounded-md' : '',
          isSelectMode ? 'relative pl-8' : '',
        ].join(' ')}
      >
        {isSelectMode && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={handleToggleSelect}
            className="absolute left-0 top-2 h-4 w-4 rounded border-gray-300 text-[#3CCED7]"
          />
        )}

        <div
          className={[
            'flex gap-2 pl-3 pr-4 relative',
            isHighlighted ? 'rounded-lg ring-2 ring-amber-200' : '',
            isSelectMode ? 'cursor-pointer' : '',
          ].join(' ')}
          onClick={handleToggleSelect}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Avatar column */}
          <div className="w-8 shrink-0 flex items-end pb-0.5">
            {showSender ? (
              <Avatar
                src={message.sender.avatar}
                username={message.sender.username}
                userId={message.sender.id}
                initials={(message.sender.username[0] ?? 'Y').toUpperCase()}
              />
            ) : (
              <div className="w-8" />
            )}
          </div>

          {/* Content column */}
          <div className="min-w-0 flex-1">
            {showSender && (
              <div className="mb-0.5 flex items-baseline gap-1.5 px-0.5">
                <span className="text-sm font-semibold text-gray-900">You</span>
                <span className="text-[11px] text-gray-400">{time}</span>
                {message.is_edited && (
                  <span className="text-[9px] text-gray-400">edited</span>
                )}
                <MessageStatus message={message} />
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
                  className="w-full rounded-lg border border-[#3CCED7] bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#3CCED7]/30 resize-none"
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
                  <p className="text-sm whitespace-pre-wrap text-gray-900 [overflow-wrap:anywhere]">{messageContent}</p>
                )}
                {showTaskPreview && taskPreviewId ? (
                  <TaskSharePreview taskId={taskPreviewId} className="mt-2" />
                ) : null}
                {showLinkPreview && <LinkPreview content={messageContent} />}
                {hasAttachments && (
                  <AttachmentDisplay attachments={message.attachments!} isOwnMessage />
                )}
              </>
            )}
          </div>

          {/* Toolbar — Slack-style, anchored to right edge of row */}
          {isHovered && !isEditing && (
            <div className={`absolute right-2 -top-5 ${TOOLBAR_BASE}`}>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                title="Edit message"
                aria-label="Edit message"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </button>
              {hasContent && (
                <button
                  type="button"
                  onClick={handleCopy}
                  className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                  title="Copy text"
                  aria-label="Copy text"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onDelete?.(message.id)}
                className="rounded p-1 text-gray-500 hover:bg-red-50 hover:text-red-600"
                title="Delete message"
                aria-label="Delete message"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Other users' messages (left-aligned with avatar) ───────────────────────
  const initials = bot ? 'AI' : (message.sender.username[0] ?? '?').toUpperCase();

  return (
    <div
      id={`message-${message.id}`}
      className={[
        rowPadding,
        'transition-colors',
        isHighlighted ? 'bg-amber-50/40 scroll-mt-24' : isHovered ? 'bg-gray-50 ring-1 ring-gray-200 rounded-md' : '',
        isSelectMode ? 'relative pl-8' : '',
      ].join(' ')}
    >
      {isSelectMode && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={handleToggleSelect}
          className="absolute left-0 top-2 h-4 w-4 rounded border-gray-300 text-[#3CCED7]"
        />
      )}

      <div
        className={[
          'flex gap-2 pl-3 pr-4 relative',
          isHighlighted ? 'rounded-lg ring-2 ring-amber-200' : '',
          isSelectMode ? 'cursor-pointer' : '',
        ].join(' ')}
        onClick={handleToggleSelect}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Avatar column */}
        <div className="w-8 shrink-0 flex items-end pb-0.5">
          {showSender ? (
            <Avatar
              src={bot ? null : message.sender.avatar}
              username={message.sender.username}
              userId={message.sender.id}
              colorClass={bot ? 'bg-violet-500' : undefined}
              initials={initials}
            />
          ) : (
            <div className="w-8" />
          )}
        </div>

        {/* Content column */}
        <div className="min-w-0 flex-1">
          {showSender && (
            <div className="mb-0.5 flex items-baseline gap-1.5 px-0.5">
              <span className="text-sm font-semibold text-gray-900">
                {bot ? 'AI Agent' : message.sender.username}
              </span>
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
            </div>
          )}

          {isForwarded && (
            <div className="mb-1 flex items-center gap-1 text-[11px] text-gray-500">
              <Forward className="h-3 w-3 shrink-0" />
              <span className="truncate">Forwarded from {forwardedFrom}</span>
            </div>
          )}

          {hasContent && (
            <p className="text-sm whitespace-pre-wrap text-gray-900 [overflow-wrap:anywhere]">{messageContent}</p>
          )}
          {showTaskPreview && taskPreviewId ? (
            <TaskSharePreview taskId={taskPreviewId} className="mt-2" />
          ) : null}
          {showLinkPreview && <LinkPreview content={messageContent} />}
          {hasAttachments && (
            <AttachmentDisplay attachments={message.attachments!} isOwnMessage={false} />
          )}
        </div>

        {/* Toolbar — Slack-style, anchored to right edge of row */}
        {isHovered && hasContent && (
          <div className={`absolute right-2 -top-5 ${TOOLBAR_BASE}`}>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              title="Copy text"
              aria-label="Copy text"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
