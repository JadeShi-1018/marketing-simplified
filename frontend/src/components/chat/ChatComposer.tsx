'use client';

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Send,
  Clock,
  ChevronDown,
  Smile,
  Plus,
  X,
  Check,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Code2,
  Quote,
  List,
  ListOrdered,
  ListChecks,
  Link2,
  MoreHorizontal,
  Undo2,
  Redo2,
  AtSign,
  Mic,
  Video,
  Square,
  Image as ImageIcon,
  FileText,
  Film,
  Loader2,
  CameraOff,
  HelpCircle,
  MicOff,
  Monitor,
  ScreenShare,
  Settings,
  UploadCloud,
  AlertTriangle,
  Play,
  Pause,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isAfter,
  isBefore,
  format as dateFnsFormat,
  parseISO,
} from 'date-fns';
import type { TiptapJSONContent } from '@/types/comment';
import type { Message, MessageAttachment, ChatParticipant } from '@/types/chat';
import {
  uploadAttachment,
  validateFile,
  getFileTypeFromMime,
  formatFileSize,
} from '@/lib/api/attachmentApi';
import {
  createChatEditorExtensions,
  insertChatCodeBlockAndFocus,
  CHAT_EDITOR_CONTENT_CLASS,
} from './editor/chatEditorExtensions';
import type { CommentUserSummary } from '@/types/comment';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RichSendData {
  content: string;
  rich_body: TiptapJSONContent;
  mention_ids: number[];
  attachment_ids?: number[];
  reply_to_id?: number | null;
}

export interface SlashCommand {
  /** Command name without the leading slash, e.g. "topic", "mute" */
  name: string;
  /** Short description shown in the command picker */
  description: string;
  /**
   * Called when the user selects this command.
   * `args` is everything after the command name (trimmed).
   * `clearEditor` clears + resets the editor so the command call site doesn't need to know about Tiptap.
   */
  onExecute: (args: string, clearEditor: () => void) => void;
}

interface PendingAttachment {
  /** Temporary client-side id */
  id: string;
  file: File;
  preview?: string;
  progress: number;
  uploading: boolean;
  uploaded?: MessageAttachment;
  error?: string;
}

export interface ChatComposerProps {
  /** Called with rich message data (content, rich_body, mention_ids, …). */
  onSendRich: (data: RichSendData) => void | Promise<void>;
  disabled?: boolean;
  /** Drawer-style input: brand gradient send button; no top border. */
  variant?: 'default' | 'drawer';
  /** Numeric chat id — used for localStorage draft key and typing events. */
  chatId?: number | null;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
  replyingTo?: Message | null;
  onClearReply?: () => void;
  /** Participants visible in the mention picker. Derive from `chat.participants`. */
  participants?: ChatParticipant[];
  placeholder?: string;
  /** When true, the formatting toolbar collapses to one row with a "more" overflow button. */
  compact?: boolean;
  /**
   * Called when the user picks a schedule-send time.
   * Receives the same rich message data as onSendRich plus the target Date.
   */
  onScheduleSend?: (data: RichSendData, scheduledAt: Date) => void | Promise<void>;
  /**
   * Number of pending scheduled messages in this channel.
   * When > 0, shown as a badge on the schedule button.
   */
  scheduledCount?: number;
  /**
   * Slash commands shown when the user types "/" at the start of a message.
   * If empty or omitted, slash-command detection is disabled.
   */
  slashCommands?: SlashCommand[];
}

// ---------------------------------------------------------------------------
// Emoji picker (dynamically imported — no SSR)
// ---------------------------------------------------------------------------

const EmojiPicker = dynamic(() => import('emoji-picker-react'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[400px] w-[350px] items-center justify-center rounded-lg border border-gray-200 bg-white">
      <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#3CCED7]" />
    </div>
  ),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DRAFT_KEY = (chatId: number) => `chat_draft_v1_${chatId}`;
type RecordingMode = 'audio' | 'video';
type MediaDevicesWithDisplayMedia = MediaDevices & {
  getDisplayMedia?: (constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>;
};

function getSupportedRecordingMimeType(mode: RecordingMode): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
    return undefined;
  }
  const candidates =
    mode === 'video'
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      : ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function getRecordingExtension(mimeType: string, mode: RecordingMode): string {
  const normalized = mimeType.split(';')[0];
  if (normalized.includes('mp4')) return 'mp4';
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('wav')) return 'wav';
  return mode === 'video' ? 'webm' : 'webm';
}

function stopStreamTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function getDeviceConstraint(deviceId: string): boolean | MediaTrackConstraints {
  return deviceId ? { deviceId: { exact: deviceId } } : true;
}

function AudioPreview({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); } else { void el.play(); }
  };
  return (
    <div className="flex items-center gap-1">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <button
        type="button"
        onClick={toggle}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 transition"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function hasLiveVideoTrack(stream: MediaStream | null) {
  return Boolean(stream?.getVideoTracks().some((track) => track.readyState === 'live'));
}

/** Traverse a Tiptap JSON doc and collect all @mention node ids. */
function extractMentionIds(doc: TiptapJSONContent | null | undefined): number[] {
  if (!doc) return [];
  const ids: number[] = [];
  function visit(node: TiptapJSONContent) {
    if (node.type === 'mention' && node.attrs?.id != null) {
      const id = Number(node.attrs.id);
      if (!Number.isNaN(id)) ids.push(id);
    }
    for (const child of (node.content as TiptapJSONContent[]) ?? []) {
      visit(child);
    }
  }
  visit(doc);
  return ids;
}

/** Convert ChatParticipant[] to CommentUserSummary[] (the shape MentionPicker expects). */
/** Returns today's date as a local yyyy-MM-dd string (NOT UTC). */
function localDateString(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function participantsToUserSummaries(participants: ChatParticipant[]): CommentUserSummary[] {
  return participants.map((p) => ({
    id: p.user.id,
    username: p.user.username,
    email: p.user.email,
  }));
}

// ---------------------------------------------------------------------------
// MinimalDatePicker — opens upward, no external library
// ---------------------------------------------------------------------------

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function MinimalDatePicker({
  value,
  onChange,
  min,
}: {
  value: string;       // yyyy-MM-dd or ''
  onChange: (v: string) => void;
  min?: string;        // yyyy-MM-dd
}) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const initial = value ? parseISO(value) : today;
  const [view, setView] = useState<Date>(startOfMonth(initial));
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(view), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(view), { weekStartsOn: 0 }),
  });

  // Parse min as a LOCAL date string (yyyy-MM-dd), not UTC.
  const minDate = min ? new Date(`${min}T00:00:00`) : null;
  const selectedDate = value ? new Date(`${value}T00:00:00`) : null;

  // Disable days strictly before today (same day is allowed).
  const isDisabled = (d: Date) =>
    minDate ? isBefore(d, minDate) && !isSameDay(d, minDate) : false;

  return (
    <div ref={containerRef} className="relative flex-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full rounded-md border border-gray-200 px-2 py-1 text-left text-xs text-gray-700 outline-none hover:border-teal-400 focus:border-teal-400"
      >
        {selectedDate ? dateFnsFormat(selectedDate, 'MM/dd/yyyy') : <span className="text-gray-400">Pick date</span>}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-10 mb-1 w-56 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          {/* Month navigation */}
          <div className="mb-1.5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setView((v) => subMonths(v, 1))}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100 text-gray-600"
            >
              ‹
            </button>
            <span className="text-xs font-semibold text-gray-700">
              {dateFnsFormat(view, 'MMMM yyyy')}
            </span>
            <button
              type="button"
              onClick={() => setView((v) => addMonths(v, 1))}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100 text-gray-600"
            >
              ›
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="mb-0.5 grid grid-cols-7">
            {DAY_LABELS.map((d) => (
              <span key={d} className="text-center text-[10px] font-medium text-gray-400">
                {d}
              </span>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {days.map((d) => {
              const outside = !isSameMonth(d, view);
              const selected = selectedDate ? isSameDay(d, selectedDate) : false;
              const isToday = isSameDay(d, today);
              const disabled = isDisabled(d);
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(dateFnsFormat(d, 'yyyy-MM-dd'));
                    setOpen(false);
                  }}
                  className={[
                    'flex h-6 w-full items-center justify-center rounded text-[11px] transition-colors',
                    outside ? 'text-gray-300' : 'text-gray-700',
                    selected ? 'bg-teal-500 text-white font-semibold' : '',
                    !selected && isToday ? 'font-semibold text-teal-600' : '',
                    !selected && !disabled && !outside ? 'hover:bg-gray-100' : '',
                    disabled ? 'cursor-not-allowed opacity-30' : '',
                  ].join(' ')}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

const toolbarButtonClassName = [
  'inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition',
  'hover:bg-gray-100 hover:text-gray-800',
  'disabled:cursor-not-allowed disabled:opacity-40',
  'data-[active=true]:bg-[#3CCED7]/15 data-[active=true]:text-[#168E96]',
].join(' ');

function ToolbarTooltip({ label, children }: { label: string; children: ReactNode }) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  return (
    <span
      ref={triggerRef}
      className="inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open && typeof document !== 'undefined'
        ? createPortal(
            <span
              className="pointer-events-none fixed z-[10000] -translate-x-1/2 whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 shadow-sm"
              style={{ top: pos.top, left: pos.left }}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

function ToolbarButton({
  label,
  shortcut,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const tooltip = shortcut ? `${label} (${shortcut})` : label;
  return (
    <ToolbarTooltip label={tooltip}>
      <button
        type="button"
        aria-label={tooltip}
        data-active={active}
        disabled={disabled}
        onClick={onClick}
        className={toolbarButtonClassName}
      >
        {children}
      </button>
    </ToolbarTooltip>
  );
}

function ToolbarSeparator() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-gray-200" aria-hidden="true" />;
}

const composerActionButtonClassName = [
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 transition',
  'hover:bg-gray-100 hover:text-gray-800',
  'disabled:cursor-not-allowed disabled:opacity-40',
  'data-[active=true]:bg-[#3CCED7]/15 data-[active=true]:text-[#168E96]',
  'data-[recording=true]:bg-red-50 data-[recording=true]:text-red-600',
].join(' ');

function ComposerActionButton({
  label,
  buttonRef,
  active = false,
  recording = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  buttonRef?: Ref<HTMLButtonElement>;
  active?: boolean;
  recording?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      title={label}
      data-active={active}
      data-recording={recording}
      disabled={disabled}
      onClick={onClick}
      className={composerActionButtonClassName}
    >
      {children}
    </button>
  );
}

function ChatFormattingToolbar({
  editor,
  disabled,
  onOpenLink,
  compact = false,
}: {
  editor: Editor | null;
  disabled: boolean;
  onOpenLink: () => void;
  compact?: boolean;
}) {
  const inactive = disabled || !editor;
  const [showMore, setShowMore] = useState(false);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const [popupStyle, setPopupStyle] = useState<{ top: number; left: number } | null>(null);

  // Compute popup position relative to the ⋯ button whenever it opens
  useLayoutEffect(() => {
    if (!showMore || !moreBtnRef.current) return;
    const rect = moreBtnRef.current.getBoundingClientRect();
    setPopupStyle({ top: rect.top, left: rect.right });
  }, [showMore]);

  useEffect(() => {
    if (!showMore) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const btn = moreBtnRef.current;
      // Close if click is outside the button; the popup is a portal so we can't use a ref on it
      if (btn && !btn.contains(target)) {
        // Check if target is inside the portal popup (by data attribute)
        const insidePopup = (target as Element).closest?.('[data-more-popup]');
        if (!insidePopup) setShowMore(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMore]);

  if (compact) {
    return (
      <div className="flex items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-2 py-1">
        {/* Primary buttons */}
        <ToolbarButton label="Bold" shortcut="Cmd/Ctrl+B" active={Boolean(editor?.isActive('bold'))} disabled={inactive} onClick={() => editor?.chain().focus().toggleBold().run()}>
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Italic" shortcut="Cmd/Ctrl+I" active={Boolean(editor?.isActive('italic'))} disabled={inactive} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Underline" shortcut="Cmd/Ctrl+U" active={Boolean(editor?.isActive('underline'))} disabled={inactive} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
          <Underline className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Strikethrough" shortcut="Cmd/Ctrl+Shift+X" active={Boolean(editor?.isActive('strike'))} disabled={inactive} onClick={() => editor?.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Inline code" shortcut="Cmd/Ctrl+E" active={Boolean(editor?.isActive('code'))} disabled={inactive} onClick={() => editor?.chain().focus().toggleCode().run()}>
          <Code className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarSeparator />

        <ToolbarButton label="Bullet list" active={Boolean(editor?.isActive('bulletList'))} disabled={inactive} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Numbered list" active={Boolean(editor?.isActive('orderedList'))} disabled={inactive} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarSeparator />

        <ToolbarButton label="Link" shortcut="Cmd/Ctrl+K" active={Boolean(editor?.isActive('link'))} disabled={inactive} onClick={onOpenLink}>
          <Link2 className="h-3.5 w-3.5" />
        </ToolbarButton>

        {/* More button — portal popup escapes overflow-hidden */}
        <button
          ref={moreBtnRef}
          type="button"
          aria-label={showMore ? 'Show less' : 'More formatting'}
          title={showMore ? 'Show less' : 'More formatting'}
          onClick={() => setShowMore((v) => !v)}
          className={[toolbarButtonClassName, 'ml-auto', showMore ? 'bg-gray-100 text-gray-800' : ''].join(' ')}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>

        {showMore && popupStyle && typeof document !== 'undefined' && createPortal(
          <div
            data-more-popup
            className="fixed z-[9999] flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white px-1 py-0.5 shadow-md"
            style={{ top: popupStyle.top - 4, left: popupStyle.left, transform: 'translate(-100%, -100%)' }}
          >
            <ToolbarButton label="Checklist" active={Boolean(editor?.isActive('taskList'))} disabled={inactive} onClick={() => editor?.chain().focus().toggleTaskList().run()}>
              <ListChecks className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton label="Quote" active={Boolean(editor?.isActive('blockquote'))} disabled={inactive} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
              <Quote className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton label="Code block" active={Boolean(editor?.isActive('codeBlock'))} disabled={inactive} onClick={() => editor && insertChatCodeBlockAndFocus(editor)}>
              <Code2 className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarSeparator />
            <ToolbarButton label="Undo" shortcut="Cmd/Ctrl+Z" disabled={inactive || !editor?.can().chain().focus().undo().run()} onClick={() => editor?.chain().focus().undo().run()}>
              <Undo2 className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton label="Redo" shortcut="Cmd/Ctrl+Shift+Z" disabled={inactive || !editor?.can().chain().focus().redo().run()} onClick={() => editor?.chain().focus().redo().run()}>
              <Redo2 className="h-3.5 w-3.5" />
            </ToolbarButton>
          </div>,
          document.body,
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-2 py-1">
      <ToolbarButton
        label="Bold"
        shortcut="Cmd/Ctrl+B"
        active={Boolean(editor?.isActive('bold'))}
        disabled={inactive}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        <Bold className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        shortcut="Cmd/Ctrl+I"
        active={Boolean(editor?.isActive('italic'))}
        disabled={inactive}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Underline"
        shortcut="Cmd/Ctrl+U"
        active={Boolean(editor?.isActive('underline'))}
        disabled={inactive}
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
      >
        <Underline className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Strikethrough"
        shortcut="Cmd/Ctrl+Shift+X"
        active={Boolean(editor?.isActive('strike'))}
        disabled={inactive}
        onClick={() => editor?.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Inline code"
        shortcut="Cmd/Ctrl+E"
        active={Boolean(editor?.isActive('code'))}
        disabled={inactive}
        onClick={() => editor?.chain().focus().toggleCode().run()}
      >
        <Code className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarSeparator />

      <ToolbarButton
        label="Bullet list"
        shortcut="Cmd/Ctrl+Shift+8"
        active={Boolean(editor?.isActive('bulletList'))}
        disabled={inactive}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      >
        <List className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        shortcut="Cmd/Ctrl+Shift+7"
        active={Boolean(editor?.isActive('orderedList'))}
        disabled={inactive}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Checklist"
        shortcut="Cmd/Ctrl+Shift+9"
        active={Boolean(editor?.isActive('taskList'))}
        disabled={inactive}
        onClick={() => editor?.chain().focus().toggleTaskList().run()}
      >
        <ListChecks className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Quote"
        shortcut="Cmd/Ctrl+Shift+."
        active={Boolean(editor?.isActive('blockquote'))}
        disabled={inactive}
        onClick={() => editor?.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Code block"
        active={Boolean(editor?.isActive('codeBlock'))}
        disabled={inactive}
        onClick={() => editor && insertChatCodeBlockAndFocus(editor)}
      >
        <Code2 className="h-3.5 w-3.5" />
      </ToolbarButton>

      <ToolbarSeparator />

      <ToolbarButton
        label="Link"
        shortcut="Cmd/Ctrl+K"
        active={Boolean(editor?.isActive('link'))}
        disabled={inactive}
        onClick={onOpenLink}
      >
        <Link2 className="h-3.5 w-3.5" />
      </ToolbarButton>

      <span className="ml-auto flex items-center gap-0.5">
        <ToolbarButton
          label="Undo"
          shortcut="Cmd/Ctrl+Z"
          disabled={inactive || !editor?.can().chain().focus().undo().run()}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Redo"
          shortcut="Cmd/Ctrl+Shift+Z"
          disabled={inactive || !editor?.can().chain().focus().redo().run()}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <Redo2 className="h-3.5 w-3.5" />
        </ToolbarButton>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChatComposer({
  onSendRich,
  disabled = false,
  variant = 'default',
  chatId,
  onTypingStart,
  onTypingStop,
  replyingTo,
  onClearReply,
  participants = [],
  placeholder = 'Type a message…',
  compact = false,
  onScheduleSend,
  slashCommands = [],
  scheduledCount = 0,
}: ChatComposerProps) {
  const [showFormattingToolbar, setShowFormattingToolbar] = useState(true);

  // ---- schedule-send state ----
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [customScheduleDate, setCustomScheduleDate] = useState('');
  const [customScheduleTime, setCustomScheduleTime] = useState(() => {
    // Default to now + 15 min so today's date is always valid on first open.
    const t = new Date(Date.now() + 15 * 60 * 1000);
    return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  });
  const [schedulePickerPos, setSchedulePickerPos] = useState<{ bottom: number; right: number } | null>(null);
  const scheduleButtonRef = useRef<HTMLButtonElement>(null);
  const schedulePickerRef = useRef<HTMLDivElement>(null);

  // ---- slash command state ----
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const slashQueryRef = useRef<string | null>(null);

  // ---- attachment state ----
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // ---- reactive isEmpty (editor?.isEmpty reads a non-reactive property) ----
  const [isEditorEmpty, setIsEditorEmpty] = useState(true);

  // ---- emoji picker state ----
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);

  // ---- link editor state ----
  const [showLinkEditor, setShowLinkEditor] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const linkInputRef = useRef<HTMLInputElement>(null);

  // ---- drag & drop ----
  const [isDragOver, setIsDragOver] = useState(false);

  // ---- file input ----
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- audio/video recording ----
  const [recordingMode, setRecordingMode] = useState<RecordingMode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const [isVideoRecorderOpen, setIsVideoRecorderOpen] = useState(false);
  const [videoPreviewStream, setVideoPreviewStream] = useState<MediaStream | null>(null);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isScreenEnabled, setIsScreenEnabled] = useState(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState('');
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState('');
  const [permissionBanner, setPermissionBanner] = useState<string | null>(null);
  const [permissionBannerDevice, setPermissionBannerDevice] = useState<'camera' | 'mic' | 'screen' | null>(null);
  const [permissionBannerOsLink, setPermissionBannerOsLink] = useState<string | null>(null);
  const permissionRetryRef = useRef<(() => void) | null>(null);
  const [showVideoSettings, setShowVideoSettings] = useState(false);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  // ---- typing indicator ----
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- stable submit ref (avoids stale closures inside editorProps) ----
  const submitRef = useRef<() => void | Promise<void>>(() => {});
  const [, setToolbarVersion] = useState(0);

  // ---- participants as mention summaries ----
  // Keep the list in a ref so the Tiptap extensions closure always reads the
  // latest participants WITHOUT needing to recreate the extensions (and thus
  // the editor) every time the participant list changes. Recreating the editor
  // causes a brief height change in the composer which flips stickyBottomRef
  // in MessageList to false, breaking the scroll-to-bottom on chat open.
  const mentionableUsersRef = useRef<ReturnType<typeof participantsToUserSummaries>>([]);
  mentionableUsersRef.current = useMemo(
    () => participantsToUserSummaries(participants),
    [participants],
  );

  // ---- Tiptap extensions (memoised; re-created only when placeholder changes) ----
  const extensions = useMemo(
    () => createChatEditorExtensions({ placeholder, getMentionableUsers: (q) => {
      const all = mentionableUsersRef.current;
      if (!q) return all;
      const lower = q.toLowerCase();
      return all.filter(
        (p) =>
          (p.username && p.username.toLowerCase().includes(lower)) ||
          (p.email && p.email.toLowerCase().includes(lower)),
      );
    }}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placeholder], // intentionally omit mentionableUsersRef — read via ref, no recreation needed
  );

  // ---- Editor ----
  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: CHAT_EDITOR_CONTENT_CLASS },
      handleKeyDown: (_view, event) => {
        // Escape → dismiss slash-command picker if open
        if (event.key === 'Escape' && slashQueryRef.current !== null) {
          slashQueryRef.current = null;
          setSlashQuery(null);
          return true;
        }
        // Enter (without Shift) → send; Shift+Enter → new line (default Tiptap behaviour)
        if (event.key === 'Enter' && !event.shiftKey) {
          if (
            editor?.isActive('codeBlock') ||
            editor?.isActive('bulletList') ||
            editor?.isActive('orderedList') ||
            editor?.isActive('taskList')
          ) {
            return false;
          }
          event.preventDefault();
          submitRef.current();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      // Update reactive isEmpty state so canSend re-renders correctly.
      setIsEditorEmpty(ed.isEmpty);
      if (disabled) return;
      const isEmpty = ed.isEmpty;
      if (isEmpty) {
        stopTyping();
      } else {
        scheduleTypingStart();
      }
      // Persist draft to localStorage while the user types
      if (chatId) {
        try {
          localStorage.setItem(DRAFT_KEY(chatId), JSON.stringify(ed.getJSON()));
        } catch {
          // localStorage quota exceeded — silently ignore
        }
      }
      // Slash-command detection: single paragraph, text starts with '/', no spaces yet
      if (slashCommands.length > 0) {
        const text = ed.getText({ blockSeparator: '\n' }).trimEnd();
        const isSinglePara = ed.state.doc.childCount === 1;
        if (isSinglePara && text.startsWith('/') && !text.slice(1).includes(' ')) {
          const q = text.slice(1);
          slashQueryRef.current = q;
          setSlashQuery(q);
        } else {
          slashQueryRef.current = null;
          setSlashQuery(null);
        }
      }
    },
  });

  // Re-render toolbar active states as the cursor moves through formatted text.
  useEffect(() => {
    if (!editor) return;
    const refreshToolbar = () => setToolbarVersion((version) => version + 1);
    editor.on('selectionUpdate', refreshToolbar);
    editor.on('update', refreshToolbar);
    editor.on('transaction', refreshToolbar);
    return () => {
      editor.off('selectionUpdate', refreshToolbar);
      editor.off('update', refreshToolbar);
      editor.off('transaction', refreshToolbar);
    };
  }, [editor]);

  // ---- Load draft from localStorage on mount / chatId change ----
  useEffect(() => {
    if (!editor || !chatId) return;
    try {
      const saved = localStorage.getItem(DRAFT_KEY(chatId));
      if (saved) {
        const doc = JSON.parse(saved) as TiptapJSONContent;
        editor.commands.setContent(doc, { emitUpdate: false });
        setIsEditorEmpty(editor.isEmpty);
      } else {
        editor.commands.clearContent(false);
        setIsEditorEmpty(true);
      }
    } catch {
      // Corrupt draft — clear it
      if (chatId) localStorage.removeItem(DRAFT_KEY(chatId));
    }
  // We intentionally run this only when chatId changes (not on every editor reference change).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // ---- Disable / enable editor ----
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  // ---- Cleanup typing timers on unmount ----
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    };
  }, []);

  // ---- Emoji picker outside-click ----
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(event.target as Node) &&
        emojiButtonRef.current &&
        !emojiButtonRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (showLinkEditor) {
      linkInputRef.current?.focus();
    }
  }, [showLinkEditor]);

  // Keep a ref so the unmount cleanup can access the latest list without
  // the effect re-running (and revoking URLs) on every progress update.
  const pendingAttachmentsRef = useRef(pendingAttachments);
  useEffect(() => { pendingAttachmentsRef.current = pendingAttachments; }, [pendingAttachments]);
  useEffect(() => {
    return () => {
      pendingAttachmentsRef.current.forEach((a) => {
        if (a.preview) URL.revokeObjectURL(a.preview);
      });
    };
  }, []); // intentionally empty — only runs on unmount

  // ---------------------------------------------------------------------------
  // Typing indicators
  // ---------------------------------------------------------------------------

  const stopTyping = useCallback(() => {
    if (!onTypingStop) return;
    if (isTypingRef.current) {
      isTypingRef.current = false;
      onTypingStop();
    }
    if (typingTimeoutRef.current) { clearTimeout(typingTimeoutRef.current); typingTimeoutRef.current = null; }
    if (typingDebounceRef.current) { clearTimeout(typingDebounceRef.current); typingDebounceRef.current = null; }
  }, [onTypingStop]);

  const scheduleTypingStart = useCallback(() => {
    if (!onTypingStart) return;
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    typingDebounceRef.current = setTimeout(() => {
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        onTypingStart();
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => stopTyping(), 3000);
    }, 300);
  }, [onTypingStart, stopTyping]);

  // ---------------------------------------------------------------------------
  // Send
  // ---------------------------------------------------------------------------

  const handleSend = useCallback(async () => {
    if (!editor || disabled) return;

    const rich_body = editor.getJSON() as TiptapJSONContent;
    const content = editor.getText({ blockSeparator: '\n' }).trim();
    const uploadedAttachments = pendingAttachments.filter((a) => a.uploaded && !a.uploading && !a.error);

    if (!content && uploadedAttachments.length === 0) return;
    if (pendingAttachments.some((a) => a.uploading)) {
      toast.error('Please wait for uploads to complete');
      return;
    }
    if (pendingAttachments.some((a) => a.error)) {
      toast.error('Some files failed to upload. Remove them and try again.');
      return;
    }

    stopTyping();

    // Clear editor + attachments immediately for snappy UX
    editor.commands.clearContent(true);
    setIsEditorEmpty(true);
    setPendingAttachments([]);
    setShowEmojiPicker(false);
    setShowLinkEditor(false);

    // Clear draft
    if (chatId) {
      try { localStorage.removeItem(DRAFT_KEY(chatId)); } catch { /* ignore */ }
    }

    const mention_ids = extractMentionIds(rich_body);
    const attachment_ids = uploadedAttachments
      .map((a) => a.uploaded?.id)
      .filter((id): id is number => id !== undefined);
    const reply_to_id = replyingTo?.id ?? null;

    await onSendRich({ content, rich_body, mention_ids, attachment_ids, reply_to_id });

    onClearReply?.();
    // Refocus the editor
    editor.commands.focus();
  }, [
    editor,
    disabled,
    pendingAttachments,
    chatId,
    replyingTo,
    stopTyping,
    onSendRich,
    onClearReply,
  ]);

  // Keep submitRef always pointing at the current handleSend
  submitRef.current = handleSend;

  // ---- Schedule send ----
  const handleSchedule = useCallback(async (scheduledAt: Date) => {
    if (!editor || disabled || !onScheduleSend) return;

    const rich_body = editor.getJSON() as TiptapJSONContent;
    const content = editor.getText({ blockSeparator: '\n' }).trim();
    const uploadedAttachments = pendingAttachments.filter((a) => a.uploaded && !a.uploading && !a.error);

    if (!content && uploadedAttachments.length === 0) return;
    if (pendingAttachments.some((a) => a.uploading)) {
      toast.error('Please wait for uploads to complete');
      return;
    }
    if (pendingAttachments.some((a) => a.error)) {
      toast.error('Some files failed to upload. Remove them and try again.');
      return;
    }

    stopTyping();
    editor.commands.clearContent(true);
    setIsEditorEmpty(true);
    setPendingAttachments([]);
    setShowSchedulePicker(false);
    setCustomScheduleDate('');
    const resetT = new Date(Date.now() + 15 * 60 * 1000);
    setCustomScheduleTime(`${String(resetT.getHours()).padStart(2, '0')}:${String(resetT.getMinutes()).padStart(2, '0')}`);
    if (chatId) {
      try { localStorage.removeItem(DRAFT_KEY(chatId)); } catch { /* ignore */ }
    }

    const mention_ids = extractMentionIds(rich_body);
    const attachment_ids = uploadedAttachments
      .map((a) => a.uploaded?.id)
      .filter((id): id is number => id !== undefined);
    const reply_to_id = replyingTo?.id ?? null;

    await onScheduleSend({ content, rich_body, mention_ids, attachment_ids, reply_to_id }, scheduledAt);
    onClearReply?.();
    editor.commands.focus();
  }, [
    editor,
    disabled,
    pendingAttachments,
    chatId,
    replyingTo,
    stopTyping,
    onScheduleSend,
    onClearReply,
  ]);

  // Close schedule picker on outside click
  useEffect(() => {
    if (!showSchedulePicker) return;
    const handler = (e: MouseEvent) => {
      if (
        schedulePickerRef.current && !schedulePickerRef.current.contains(e.target as Node) &&
        scheduleButtonRef.current && !scheduleButtonRef.current.contains(e.target as Node)
      ) {
        setShowSchedulePicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSchedulePicker]);

  // ---------------------------------------------------------------------------
  // Slash commands
  // ---------------------------------------------------------------------------

  const filteredSlashCommands = useMemo(() => {
    if (slashQuery === null || slashCommands.length === 0) return [];
    const q = slashQuery.toLowerCase();
    return slashCommands.filter((c) => c.name.toLowerCase().startsWith(q));
  }, [slashQuery, slashCommands]);

  const executeSlashCommand = useCallback((cmd: SlashCommand) => {
    const args = slashQuery?.slice(cmd.name.length).trim() ?? '';
    slashQueryRef.current = null;
    setSlashQuery(null);
    const clearEditor = () => {
      editor?.commands.clearContent(true);
      setIsEditorEmpty(true);
    };
    cmd.onExecute(args, clearEditor);
  }, [slashQuery, editor]);

  // ---------------------------------------------------------------------------
  // Emoji
  // ---------------------------------------------------------------------------

  const handleEmojiClick = useCallback(
    (emojiData: { emoji: string }) => {
      editor?.chain().focus().insertContent(emojiData.emoji).run();
    },
    [editor],
  );

  const handleOpenLinkEditor = useCallback(() => {
    if (!editor || disabled) return;
    setLinkUrl(String(editor.getAttributes('link').href ?? ''));
    setShowLinkEditor(true);
  }, [disabled, editor]);

  const handleApplyLink = useCallback(() => {
    if (!editor) return;
    const url = linkUrl.trim();
    if (!url) {
      editor.chain().focus().unsetLink().run();
      setShowLinkEditor(false);
      return;
    }

    const { empty } = editor.state.selection;
    if (empty) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'text',
          text: url,
          marks: [{ type: 'link', attrs: { href: url } }],
        })
        .run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
    setShowLinkEditor(false);
  }, [editor, linkUrl]);

  // ---------------------------------------------------------------------------
  // Attachments
  // ---------------------------------------------------------------------------

  const uploadFiles = useCallback(async (files: File[]) => {
    const newAttachments: PendingAttachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const { isValid, error } = validateFile(file);
      if (!isValid) { toast.error(error || `Invalid file: ${file.name}`); continue; }
      const preview = (
        file.type.startsWith('image/') ||
        file.type.startsWith('video/') ||
        file.type.startsWith('audio/')
      )
        ? URL.createObjectURL(file)
        : undefined;
      newAttachments.push({ id: `tmp-${Date.now()}-${i}`, file, preview, progress: 0, uploading: true });
    }
    if (newAttachments.length === 0) return;
    setPendingAttachments((prev) => [...prev, ...newAttachments]);
    setIsUploading(true);
    for (const att of newAttachments) {
      try {
        const uploaded = await uploadAttachment(att.file, (progress) => {
          setPendingAttachments((prev) => prev.map((a) => a.id === att.id ? { ...a, progress } : a));
        });
        setPendingAttachments((prev) => prev.map((a) => a.id === att.id ? { ...a, uploading: false, uploaded } : a));
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Upload failed';
        setPendingAttachments((prev) => prev.map((a) => a.id === att.id ? { ...a, uploading: false, error: msg } : a));
        toast.error(`Failed to upload ${att.file.name}`);
      }
    }
    setIsUploading(false);
  }, []);

  const handleFileSelect = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    await uploadFiles(Array.from(e.target.files));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [uploadFiles]);

  const handleRemoveAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => {
      const att = prev.find((a) => a.id === id);
      if (att?.preview) URL.revokeObjectURL(att.preview);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (files.length > 0) {
      event.preventDefault();
      void uploadFiles(files);
    }
  }, [uploadFiles]);

  const stopMediaTracks = useCallback(() => {
    stopStreamTracks(mediaStreamRef.current);
    mediaStreamRef.current = null;
  }, []);

  const stopVideoPreviewStreams = useCallback(() => {
    stopStreamTracks(cameraStreamRef.current);
    stopStreamTracks(screenStreamRef.current);
    stopStreamTracks(micStreamRef.current);
    cameraStreamRef.current = null;
    screenStreamRef.current = null;
    micStreamRef.current = null;
    setVideoPreviewStream(null);
    setIsCameraEnabled(false);
    setIsScreenEnabled(false);
    setIsMicEnabled(false);
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  }, []);

  const refreshMediaDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const nextVideoDevices = devices.filter((device) => device.kind === 'videoinput');
      const nextAudioDevices = devices.filter((device) => device.kind === 'audioinput');
      setVideoDevices(nextVideoDevices);
      setAudioDevices(nextAudioDevices);
      setSelectedVideoDeviceId((current) => current || nextVideoDevices[0]?.deviceId || '');
      setSelectedAudioDeviceId((current) => current || nextAudioDevices[0]?.deviceId || '');
    } catch {
      // Device labels can fail before permission; recording still works without them.
    }
  }, []);

  const startRecordingFromStream = useCallback((mode: RecordingMode, stream: MediaStream) => {
    if (typeof MediaRecorder === 'undefined') {
      toast.error('Recording is not supported in this browser');
      return;
    }

    try {
      const mimeType = getSupportedRecordingMimeType(mode);
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaChunksRef.current = [];
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          mediaChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const chunks = mediaChunksRef.current;
        mediaChunksRef.current = [];
        stopMediaTracks();
        mediaRecorderRef.current = null;
        setRecordingMode(null);
        if (mode === 'video') {
          setIsVideoRecorderOpen(false);
          stopVideoPreviewStreams();
        }

        if (chunks.length === 0) return;
        // recorder.mimeType can be empty string in Safari even when a mimeType was set.
        // Fall back to the mimeType we used to create the recorder, then to a safe default.
        const type =
          recorder.mimeType ||
          mimeType ||
          (mode === 'video' ? 'video/webm' : 'audio/webm');
        const fileType = type.split(';')[0];
        const blob = new Blob(chunks, { type: fileType });
        const extension = getRecordingExtension(fileType, mode);
        const file = new File(
          [blob],
          `${mode}-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`,
          { type: fileType },
        );
        void uploadFiles([file]);
      };

      recorder.onerror = () => {
        toast.error(`Could not record ${mode}`);
        stopMediaTracks();
        mediaRecorderRef.current = null;
        setRecordingMode(null);
        if (mode === 'video') {
          stopVideoPreviewStreams();
        }
      };

      recorder.start();
      setRecordingMode(mode);
    } catch {
      stopMediaTracks();
      setRecordingMode(null);
      if (mode === 'video') {
        stopVideoPreviewStreams();
      }
      toast.error(`Could not start ${mode} recording`);
    }
  }, [stopMediaTracks, stopVideoPreviewStreams, uploadFiles]);

  const startAudioRecording = useCallback(async () => {
    if (disabled) return;
    if (recordingMode) {
      stopRecording();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Recording is not supported in this browser');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      startRecordingFromStream('audio', stream);
    } catch (err) {
      stopMediaTracks();
      setRecordingMode(null);
      const name = (err as DOMException)?.name;
      if (name === 'NotReadableError' || name === 'TrackStartError') {
        toast.error('Microphone is in use by another app', { id: 'mic-permission' });
      } else if (name === 'NotAllowedError') {
        setPermissionBanner('Microphone access is blocked. Safari may stop showing the prompt after repeated denies. Set localhost to Ask or Allow in Safari Settings > Websites > Microphone, then try again.');
        setPermissionBannerDevice('mic');
        setPermissionBannerOsLink(null);
        permissionRetryRef.current = () => { void startAudioRecording(); };
        toast.error('Allow microphone access to record audio', { id: 'mic-permission' });
      } else {
        toast.error('Could not access microphone', { id: 'mic-permission' });
      }
    }
  }, [disabled, recordingMode, startRecordingFromStream, stopMediaTracks, stopRecording]);

  const updateVideoPreviewStream = useCallback(() => {
    setVideoPreviewStream(screenStreamRef.current || cameraStreamRef.current);
  }, []);

  const startCameraPreview = useCallback(async (deviceId = selectedVideoDeviceId) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Camera preview is not supported in this browser');
      return null;
    }

    stopStreamTracks(cameraStreamRef.current);
    cameraStreamRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: getDeviceConstraint(deviceId),
        audio: false,
      });
      cameraStreamRef.current = stream;
      setIsCameraEnabled(true);
      setVideoPreviewStream(screenStreamRef.current || stream);
      setPermissionBanner(null);
      setPermissionBannerDevice(null);
      setPermissionBannerOsLink(null);
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (cameraStreamRef.current === stream) {
            cameraStreamRef.current = null;
            setIsCameraEnabled(false);
            setVideoPreviewStream(screenStreamRef.current);
          }
        });
      });
      void refreshMediaDevices();
      return stream;
    } catch (err) {
      cameraStreamRef.current = null;
      setIsCameraEnabled(false);
      updateVideoPreviewStream();
      const name = (err as DOMException)?.name;
      if (name === 'NotReadableError' || name === 'TrackStartError') {
        setPermissionBanner('Camera is in use by another app');
        setPermissionBannerDevice(null);
      } else if (name === 'NotAllowedError') {
        let siteGranted = false;
        try {
          const ps = await navigator.permissions?.query({ name: 'camera' as PermissionName });
          siteGranted = ps?.state === 'granted';
        } catch { /* Permissions API unavailable */ }
        if (siteGranted) {
          setPermissionBanner('Camera is blocked by macOS. Allow Safari in System Settings, then try again.');
          setPermissionBannerDevice('camera');
          setPermissionBannerOsLink('x-apple.systempreferences:com.apple.preference.security?Privacy_Camera');
          permissionRetryRef.current = () => { void startCameraPreview(deviceId); };
          toast.error('Allow camera access in macOS System Settings', { id: 'camera-permission' });
        } else {
          setPermissionBanner('Camera access is blocked. Safari may stop showing the prompt after repeated denies. Set localhost to Ask or Allow in Safari Settings > Websites > Camera, then try again.');
          setPermissionBannerDevice('camera');
          setPermissionBannerOsLink(null);
          permissionRetryRef.current = () => { void startCameraPreview(deviceId); };
          toast.error('Allow camera access for localhost, then try again', { id: 'camera-permission' });
        }
      } else {
        setPermissionBanner('Could not access camera');
        setPermissionBannerDevice(null);
      }
      return null;
    }
  }, [refreshMediaDevices, selectedVideoDeviceId, updateVideoPreviewStream]);

  const startMicPreview = useCallback(async (deviceId = selectedAudioDeviceId) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Microphone is not supported in this browser');
      return null;
    }

    stopStreamTracks(micStreamRef.current);
    micStreamRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: getDeviceConstraint(deviceId),
      });
      micStreamRef.current = stream;
      setIsMicEnabled(true);
      setPermissionBanner(null);
      setPermissionBannerDevice(null);
      setPermissionBannerOsLink(null);
      stream.getAudioTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (micStreamRef.current === stream) {
            micStreamRef.current = null;
            setIsMicEnabled(false);
          }
        });
      });
      void refreshMediaDevices();
      return stream;
    } catch (err) {
      micStreamRef.current = null;
      setIsMicEnabled(false);
      const name = (err as DOMException)?.name;
      if (name === 'NotReadableError' || name === 'TrackStartError') {
        setPermissionBanner('Microphone is in use by another app');
        setPermissionBannerDevice(null);
        setPermissionBannerOsLink(null);
      } else if (name === 'NotAllowedError') {
        let siteGranted = false;
        try {
          const ps = await navigator.permissions?.query({ name: 'microphone' as PermissionName });
          siteGranted = ps?.state === 'granted';
        } catch { /* Permissions API unavailable */ }
        if (siteGranted) {
          setPermissionBanner('Microphone is blocked by macOS. Allow Safari in System Settings, then try again.');
          setPermissionBannerDevice('mic');
          setPermissionBannerOsLink('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
          permissionRetryRef.current = () => { void startMicPreview(deviceId); };
          toast.error('Allow microphone access in macOS System Settings', { id: 'mic-permission' });
        } else {
          setPermissionBanner('Microphone access is blocked. Safari may stop showing the prompt after repeated denies. Set localhost to Ask or Allow in Safari Settings > Websites > Microphone, then try again.');
          setPermissionBannerDevice('mic');
          setPermissionBannerOsLink(null);
          permissionRetryRef.current = () => { void startMicPreview(deviceId); };
          toast.error('Allow microphone access for localhost, then try again', { id: 'mic-permission' });
        }
      } else {
        setPermissionBanner('Could not access microphone');
        setPermissionBannerDevice(null);
        setPermissionBannerOsLink(null);
      }
      return null;
    }
  }, [refreshMediaDevices, selectedAudioDeviceId]);

  const openVideoRecorder = useCallback(async () => {
    if (disabled) return;
    if (recordingMode && recordingMode !== 'video') return;

    setIsVideoRecorderOpen(true);
    setShowVideoSettings(false);
    setIsScreenEnabled(false);
    setIsCameraEnabled(false);
    setIsMicEnabled(false);
    setPermissionBanner(null);
    setPermissionBannerDevice(null);
    setPermissionBannerOsLink(null);
    await refreshMediaDevices();
    // Nothing auto-starts — user enables camera / mic / screen via the buttons.
  }, [disabled, recordingMode, refreshMediaDevices]);

  const closeVideoRecorder = useCallback(() => {
    if (recordingMode === 'video') {
      stopRecording();
      return;
    }
    setIsVideoRecorderOpen(false);
    setShowVideoSettings(false);
    stopVideoPreviewStreams();
  }, [recordingMode, stopRecording, stopVideoPreviewStreams]);

  const toggleCameraPreview = useCallback(async () => {
    if (isCameraEnabled) {
      stopStreamTracks(cameraStreamRef.current);
      cameraStreamRef.current = null;
      setIsCameraEnabled(false);
      setVideoPreviewStream(screenStreamRef.current);
      return;
    }
    await startCameraPreview();
  }, [isCameraEnabled, startCameraPreview]);

  const toggleMicPreview = useCallback(async () => {
    if (isMicEnabled) {
      stopStreamTracks(micStreamRef.current);
      micStreamRef.current = null;
      setIsMicEnabled(false);
      return;
    }
    await startMicPreview();
  }, [isMicEnabled, startMicPreview]);

  // Returns platform-appropriate banner text + optional OS settings deeplink.
  const getScreenPermissionInfo = (): { message: string; osLink: string | null } => {
    const ua = navigator.userAgent;
    if (/Mac OS X/.test(ua) && !/iPhone|iPad/.test(ua)) {
      return {
        message:
          'Screen recording is blocked. On macOS, enable it for your browser in System Settings → Privacy & Security → Screen Recording. In Safari, also check Settings → Websites → Screen Sharing.',
        osLink: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
      };
    }
    if (/Windows/.test(ua)) {
      return {
        message:
          'Screen recording is blocked. In Chrome or Edge, open site settings and allow screen capture. In Firefox, check site permissions. You can also check Windows Privacy & Security settings.',
        osLink: 'ms-settings:privacy',
      };
    }
    if (/Linux/.test(ua)) {
      return {
        message:
          "Screen recording is blocked. Check your browser's site permissions for screen capture and try again.",
        osLink: null,
      };
    }
    return {
      message: 'Screen recording is blocked. Check your browser or system settings and try again.',
      osLink: null,
    };
  };

  const toggleScreenShare = useCallback(async () => {
    const mediaDevices = navigator.mediaDevices as MediaDevicesWithDisplayMedia | undefined;
    if (isScreenEnabled) {
      stopStreamTracks(screenStreamRef.current);
      screenStreamRef.current = null;
      setIsScreenEnabled(false);
      setVideoPreviewStream(cameraStreamRef.current);
      return;
    }

    if (!mediaDevices?.getDisplayMedia) {
      toast.error('Screen sharing is not supported in this browser');
      return;
    }

    // Track elapsed time to distinguish two NotAllowedError variants:
    //   • User saw the picker and clicked Cancel → ~600ms+ elapsed
    //   • Browser/OS denied without ever showing the picker → ~0–50ms elapsed
    //     (Safari does this when the site has been auto-blocked, or when
    //     macOS Screen Recording is off for the browser.)
    const startedAt = performance.now();

    try {
      const stream = await mediaDevices.getDisplayMedia({ video: true, audio: false });
      screenStreamRef.current = stream;
      setIsScreenEnabled(true);
      setVideoPreviewStream(stream);
      setPermissionBanner(null);
      setPermissionBannerDevice(null);
      setPermissionBannerOsLink(null);
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (screenStreamRef.current === stream) {
            screenStreamRef.current = null;
            setIsScreenEnabled(false);
            setVideoPreviewStream(cameraStreamRef.current);
          }
        });
      });
    } catch (err) {
      setIsScreenEnabled(false);
      const name = (err as DOMException)?.name;
      const elapsedMs = performance.now() - startedAt;

      // AbortError is always "user dismissed" — nothing else throws it here.
      if (name === 'AbortError') return;

      if (name === 'NotAllowedError') {
        // If the rejection came back almost instantly, the picker was never
        // shown — surface a banner explaining what to check. If it took a
        // realistic amount of time, the user saw the picker and cancelled.
        if (elapsedMs < 250) {
          const { message: screenMsg, osLink: screenOsLink } = getScreenPermissionInfo();
          setPermissionBanner(screenMsg);
          setPermissionBannerDevice('screen');
          setPermissionBannerOsLink(screenOsLink);
          permissionRetryRef.current = () => { void toggleScreenShare(); };
          toast.error('Screen recording is blocked — see banner', {
            id: 'screen-permission',
          });
        }
        return;
      }
      toast.error('Screen sharing failed');
    }
  }, [isScreenEnabled]);

  const handleVideoDeviceChange = useCallback(async (deviceId: string) => {
    setSelectedVideoDeviceId(deviceId);
    if (isVideoRecorderOpen && isCameraEnabled) {
      await startCameraPreview(deviceId);
    }
  }, [isCameraEnabled, isVideoRecorderOpen, startCameraPreview]);

  const handleAudioDeviceChange = useCallback(async (deviceId: string) => {
    setSelectedAudioDeviceId(deviceId);
    if (isVideoRecorderOpen && isMicEnabled) {
      await startMicPreview(deviceId);
    }
  }, [isMicEnabled, isVideoRecorderOpen, startMicPreview]);

  const startVideoRecording = useCallback(() => {
    if (disabled) return;
    if (recordingMode === 'video') {
      stopRecording();
      return;
    }
    if (recordingMode === 'audio') return;

    const videoSource = screenStreamRef.current || cameraStreamRef.current;
    if (!videoSource || !hasLiveVideoTrack(videoSource)) {
      toast.error('Turn on your camera or share your screen before recording');
      return;
    }

    const tracks = [
      ...videoSource.getVideoTracks(),
      ...(isMicEnabled ? micStreamRef.current?.getAudioTracks() ?? [] : []),
    ];
    startRecordingFromStream('video', new MediaStream(tracks));
  }, [disabled, isMicEnabled, recordingMode, startRecordingFromStream, stopRecording]);

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        mediaChunksRef.current = [];
        recorder.stop();
      }
      stopMediaTracks();
      stopVideoPreviewStreams();
    };
  }, [stopMediaTracks, stopVideoPreviewStreams]);

  useEffect(() => {
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = videoPreviewStream;
    }
  }, [videoPreviewStream]);

  // Watch for the user granting camera/mic permission in browser settings while
  // the permission banner is visible, and auto-retry when they do.
  useEffect(() => {
    if (!permissionBannerDevice || !navigator.permissions?.query) return;
    // Safari doesn't expose `display-capture` through the Permissions API, and
    // macOS Screen Recording isn't surfaced here either — fall back to the
    // user's "Try again" button instead.
    if (permissionBannerDevice === 'screen') return;
    const permName = permissionBannerDevice === 'camera' ? 'camera' : 'microphone';
    let didCancel = false;
    let cleanup: (() => void) | null = null;
    navigator.permissions.query({ name: permName as PermissionName }).then((s) => {
      if (didCancel) return;
      const onChange = () => {
        if (s.state === 'granted') {
          setPermissionBanner(null);
          setPermissionBannerDevice(null);
          setPermissionBannerOsLink(null);
          permissionRetryRef.current?.();
        }
      };
      s.addEventListener('change', onChange);
      cleanup = () => s.removeEventListener('change', onChange);
    }).catch(() => { /* Permissions API not supported */ });
    return () => {
      didCancel = true;
      cleanup?.();
    };
  }, [permissionBannerDevice]);

  const handleInsertMentionTrigger = useCallback(() => {
    editor?.chain().focus().insertContent('@').run();
  }, [editor]);

  // ---- Drag & drop ----
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
  };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) void uploadFiles(files);
  };

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const hasUploadedAttachments = pendingAttachments.some((a) => a.uploaded && !a.uploading && !a.error);
  // isEditorEmpty is updated reactively in onUpdate so React re-renders when content changes.
  const canSend = (!isEditorEmpty || hasUploadedAttachments) && !pendingAttachments.some((a) => a.uploading);
  const canRecordVideo =
    recordingMode === 'video' ||
    hasLiveVideoTrack(screenStreamRef.current) ||
    hasLiveVideoTrack(cameraStreamRef.current);

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('audio/')) return <Mic className="h-4 w-4" />;
    const type = getFileTypeFromMime(file.type);
    if (type === 'image') return <ImageIcon className="h-4 w-4" />;
    if (type === 'video') return <Film className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className={[
        'relative bg-white px-3 py-2 transition-colors sm:px-4 sm:py-3',
        variant === 'drawer' ? '' : 'border-t border-gray-200',
        isDragOver ? 'bg-[#3CCED7]/5' : '',
      ].join(' ')}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      {/* Drag-over overlay */}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-[#3CCED7] bg-[#3CCED7]/5">
          <p className="text-sm font-medium text-[#3CCED7]">Drop files to attach</p>
        </div>
      )}

      {/* Slash command picker */}
      {filteredSlashCommands.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 z-50 mb-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg sm:left-4 sm:right-4">
          <div className="border-b border-gray-100 px-3 py-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Commands</p>
          </div>
          <ul>
            {filteredSlashCommands.map((cmd) => (
              <li key={cmd.name}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    // mousedown so we act before blur dismisses the editor
                    e.preventDefault();
                    executeSlashCommand(cmd);
                  }}
                  className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-gray-50"
                >
                  <span className="shrink-0 font-mono text-sm font-semibold text-teal-600">
                    /{cmd.name}
                  </span>
                  <span className="text-sm text-gray-500">{cmd.description}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Reply preview */}
      {replyingTo && (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-[#3CCED7]">
              Replying to {replyingTo.sender.username}
            </p>
            <p className="truncate text-xs text-gray-500">{replyingTo.content || '[Attachment]'}</p>
          </div>
          <button
            type="button"
            onClick={onClearReply}
            className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
            aria-label="Cancel reply"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm focus-within:border-[#3CCED7] focus-within:ring-2 focus-within:ring-[#3CCED7]/20">
        {showFormattingToolbar && (
          <ChatFormattingToolbar
            editor={editor}
            disabled={disabled}
            onOpenLink={handleOpenLinkEditor}
            compact={compact}
          />
        )}

        {showLinkEditor && (
          <form
            className="flex items-center gap-1.5 border-b border-gray-200 bg-white px-2 py-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              handleApplyLink();
            }}
          >
            <Link2 className="h-4 w-4 shrink-0 text-gray-400" />
            <input
              ref={linkInputRef}
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              placeholder="https://example.com"
              className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-sm outline-none focus:border-[#3CCED7] focus:ring-1 focus:ring-[#3CCED7]"
            />
            <button
              type="submit"
              aria-label="Apply link"
              title="Apply link"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#3CCED7] text-white transition hover:bg-[#2AB5BD]"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Close link editor"
              title="Close link editor"
              onClick={() => setShowLinkEditor(false)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </form>
        )}

        {/* Attachment previews */}
        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-gray-100 px-3 py-2">
            {pendingAttachments.map((att) => (
              <div
                key={att.id}
                className={`relative flex items-center gap-2 rounded-lg border px-3 py-2 ${
                  att.error ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'
                }`}
              >
                {att.preview && att.file.type.startsWith('image/') ? (
                  <img src={att.preview} alt={att.file.name} className="h-10 w-10 rounded object-cover" />
                ) : att.preview && att.file.type.startsWith('video/') ? (
                  <video
                    src={att.preview}
                    className="h-12 w-16 rounded bg-black object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                ) : att.preview && att.file.type.startsWith('audio/') ? (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-gray-200">
                    <AudioPreview src={att.preview} />
                  </div>
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-gray-200">
                    {getFileIcon(att.file)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="max-w-[120px] truncate text-sm font-medium text-gray-700">{att.file.name}</p>
                  <p className="text-xs text-gray-500">{formatFileSize(att.file.size)}</p>
                </div>
                {att.uploading && (
                  <div className="flex items-center gap-1">
                    <Loader2 className="h-4 w-4 animate-spin text-[#3CCED7]" />
                    <span className="text-xs text-[#3CCED7]">{att.progress}%</span>
                  </div>
                )}
                {att.error && <span className="text-xs text-red-600">Failed</span>}
                {att.uploaded && !att.uploading && <span className="text-xs text-green-600">✓</span>}
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(att.id)}
                  className="rounded-full p-1 transition-colors hover:bg-gray-200"
                  aria-label="Remove attachment"
                  title="Remove attachment"
                >
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Tiptap editor */}
        <div
          data-testid="chat-composer-input"
          className="min-w-0 overflow-y-auto px-3 py-2 text-sm"
          style={{ minHeight: '46px', maxHeight: '132px' }}
        >
          <EditorContent editor={editor} />
        </div>

        {/* Bottom action row */}
        <div className="flex items-center gap-1 border-t border-gray-100 px-2 py-1.5">
          <ComposerActionButton
            label="Add attachment"
            disabled={disabled || isUploading || Boolean(recordingMode)}
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus className="h-5 w-5" />
          </ComposerActionButton>
          <ComposerActionButton
            label={showFormattingToolbar ? 'Hide formatting' : 'Show formatting'}
            active={showFormattingToolbar}
            disabled={disabled}
            onClick={() => setShowFormattingToolbar((prev) => !prev)}
          >
            <span className="text-[15px] font-semibold leading-none">Aa</span>
          </ComposerActionButton>
          <ComposerActionButton
            label="Add emoji"
            buttonRef={emojiButtonRef}
            active={showEmojiPicker}
            disabled={disabled}
            onClick={() => setShowEmojiPicker((prev) => !prev)}
          >
            <Smile className="h-5 w-5" />
          </ComposerActionButton>
          <ComposerActionButton
            label="Mention someone"
            disabled={disabled}
            onClick={handleInsertMentionTrigger}
          >
            <AtSign className="h-5 w-5" />
          </ComposerActionButton>
          <ToolbarSeparator />
          <ComposerActionButton
            label={recordingMode === 'video' ? 'Stop video recording' : 'Record video'}
            recording={recordingMode === 'video'}
            disabled={disabled || (recordingMode !== null && recordingMode !== 'video')}
            onClick={() => {
              if (recordingMode === 'video') {
                stopRecording();
              } else {
                void openVideoRecorder();
              }
            }}
          >
            {recordingMode === 'video' ? <Square className="h-4 w-4 fill-current" /> : <Video className="h-5 w-5" />}
          </ComposerActionButton>
          <ComposerActionButton
            label={recordingMode === 'audio' ? 'Stop audio recording' : 'Record audio'}
            recording={recordingMode === 'audio'}
            disabled={disabled || (recordingMode !== null && recordingMode !== 'audio')}
            onClick={() => void startAudioRecording()}
          >
            {recordingMode === 'audio' ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-5 w-5" />}
          </ComposerActionButton>

          {recordingMode && (
            <span className="ml-1 hidden text-xs font-medium text-red-600 sm:inline">
              Recording {recordingMode}...
            </span>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Schedule-send + Send button group */}
          <div className="relative ml-auto flex shrink-0 items-center">
            {/* Schedule-send button (clock + caret) — only when onScheduleSend is wired */}
            {onScheduleSend && (
              <>
                <button
                  ref={scheduleButtonRef}
                  type="button"
                  onClick={() => {
                    setShowSchedulePicker((v) => {
                      if (!v && scheduleButtonRef.current) {
                        const rect = scheduleButtonRef.current.getBoundingClientRect();
                        setSchedulePickerPos({
                          bottom: window.innerHeight - rect.top + 8,
                          right: window.innerWidth - rect.right,
                        });
                      }
                      return !v;
                    });
                  }}
                  disabled={!canSend || disabled || Boolean(recordingMode)}
                  className="inline-flex h-8 items-center gap-0.5 rounded-l-lg border border-r-0 border-gray-300 bg-white px-1.5 text-gray-500 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Schedule send"
                  title="Schedule send"
                >
                  <span className="relative inline-flex items-center gap-0.5">
                    <Clock className="h-3.5 w-3.5" />
                    {scheduledCount > 0 && (
                      <span className="absolute -right-2 -top-2 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[9px] font-bold leading-none text-white">
                        {scheduledCount > 9 ? '9+' : scheduledCount}
                      </span>
                    )}
                  </span>
                  <ChevronDown className="h-3 w-3" />
                </button>

                {/* Schedule picker popover — fixed so parent overflow:hidden never clips it */}
                {showSchedulePicker && schedulePickerPos && typeof document !== 'undefined' && createPortal(
                  <div
                    ref={schedulePickerRef}
                    className="fixed z-[9999] w-56 rounded-xl border border-gray-200 bg-white p-2 shadow-lg"
                    style={{ bottom: schedulePickerPos.bottom, right: schedulePickerPos.right }}
                  >
                    <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      Schedule send
                    </p>
                    {[
                      { label: 'In 30 minutes', minutes: 30 },
                      { label: 'In 1 hour', minutes: 60 },
                      { label: 'In 4 hours', minutes: 240 },
                      { label: 'Tomorrow 9 AM', minutes: null },
                    ].map(({ label, minutes }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          let target: Date;
                          if (minutes !== null) {
                            target = new Date(Date.now() + minutes * 60 * 1000);
                          } else {
                            const t = new Date();
                            t.setDate(t.getDate() + 1);
                            t.setHours(9, 0, 0, 0);
                            target = t;
                          }
                          void handleSchedule(target);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Clock className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        {label}
                      </button>
                    ))}
                    <div className="my-1.5 border-t border-gray-100" />
                    <p className="mb-1 px-1 text-[11px] text-gray-400">Custom date & time</p>
                    <div className="flex flex-col gap-1.5 px-1">
                      {(() => {
                        const todayStr = localDateString();
                        const isToday = customScheduleDate === todayStr;
                        // Minimum selectable time when today is selected: now + 2 min buffer
                        const nowPlus2 = new Date(Date.now() + 2 * 60 * 1000);
                        const minTimeStr = `${String(nowPlus2.getHours()).padStart(2, '0')}:${String(nowPlus2.getMinutes()).padStart(2, '0')}`;

                        return (
                          <div className="flex gap-1.5">
                            <MinimalDatePicker
                              value={customScheduleDate}
                              onChange={(d) => {
                                setCustomScheduleDate(d);
                                // If user picks today and current time is already past the selected time, advance it.
                                if (d === todayStr && customScheduleTime <= minTimeStr) {
                                  setCustomScheduleTime(minTimeStr);
                                }
                              }}
                              min={todayStr}
                            />
                            <input
                              type="time"
                              value={customScheduleTime}
                              min={isToday ? minTimeStr : undefined}
                              onChange={(e) => setCustomScheduleTime(e.target.value)}
                              className="w-24 rounded-md border border-gray-200 px-2 py-1 text-xs outline-none focus:border-teal-400"
                            />
                          </div>
                        );
                      })()}
                      <button
                        type="button"
                        disabled={!customScheduleDate || !customScheduleTime}
                        onClick={() => {
                          if (!customScheduleDate || !customScheduleTime) return;
                          const scheduledAt = new Date(`${customScheduleDate}T${customScheduleTime}`);
                          if (scheduledAt <= new Date()) {
                            toast.error('Scheduled time must be in the future');
                            return;
                          }
                          void handleSchedule(scheduledAt);
                        }}
                        className="w-full rounded-md bg-teal-500 py-1 text-xs font-medium text-white hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Set
                      </button>
                    </div>
                  </div>,
                  document.body,
                )}
              </>
            )}

            {/* Send button */}
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!canSend || disabled || Boolean(recordingMode)}
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 ${
                onScheduleSend ? 'rounded-r-lg' : 'rounded-lg'
              } ${
                variant === 'drawer'
                  ? 'bg-gradient-to-r from-[#3CCED7] to-[#A6E661] shadow-sm'
                  : 'bg-[#3CCED7] hover:bg-[#2AB5BD] disabled:bg-gray-300 disabled:opacity-100'
              }`}
              aria-label="Send message"
              title="Send message (Enter)"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Emoji picker */}
      {showEmojiPicker && (
        <div ref={emojiPickerRef} className="absolute bottom-full left-3 z-50 mb-2">
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            width={350}
            height={400}
            searchPlaceHolder="Search emoji…"
            previewConfig={{ showPreview: false }}
          />
        </div>
      )}

      {isVideoRecorderOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-gray-700 bg-[#1B1D21] text-gray-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-700 px-5 py-4">
              <h2 className="text-xl font-semibold">Record video clip</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-full p-2 text-gray-300 transition hover:bg-white/10 hover:text-white"
                  aria-label="Video recording help"
                  title="Video recording help"
                >
                  <HelpCircle className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={closeVideoRecorder}
                  className="rounded-full p-2 text-gray-300 transition hover:bg-white/10 hover:text-white"
                  aria-label="Close video recorder"
                  title="Close video recorder"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {permissionBanner && (
              <div className="flex items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="flex-1">{permissionBanner}</span>
                {permissionBannerOsLink && (
                  <a
                    href={permissionBannerOsLink}
                    className="rounded px-2 py-0.5 text-xs font-semibold text-amber-200 underline hover:text-white"
                  >
                    Open System Settings
                  </a>
                )}
                {permissionBannerDevice && (
                  <button
                    type="button"
                    onClick={() => {
                      setPermissionBanner(null);
                      setPermissionBannerDevice(null);
                      setPermissionBannerOsLink(null);
                      permissionRetryRef.current?.();
                    }}
                    className="rounded px-2 py-0.5 text-xs font-semibold text-amber-200 underline hover:text-white"
                  >
                    Try again
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setPermissionBanner(null); setPermissionBannerDevice(null); setPermissionBannerOsLink(null); }}
                  className="rounded p-0.5 hover:bg-white/10"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="flex min-h-0 flex-1 items-center justify-center px-5 py-8">
              <div className="relative aspect-video w-full max-w-3xl overflow-hidden rounded-xl bg-[#111317] shadow-inner">
                {videoPreviewStream ? (
                  <video
                    ref={videoPreviewRef}
                    autoPlay
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-gray-400">
                    <CameraOff className="h-12 w-12" />
                    <div>
                      <p className="text-sm font-medium text-gray-200">No camera or screen preview</p>
                      <p className="text-xs">Turn on your camera or share your screen to record.</p>
                    </div>
                  </div>
                )}

                {recordingMode === 'video' && (
                  <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white shadow">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                    Recording
                  </div>
                )}

                <div className="absolute bottom-4 left-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void toggleCameraPreview()}
                    className={[
                      'flex h-11 w-11 items-center justify-center rounded-lg transition',
                      isCameraEnabled ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-500/90 text-white hover:bg-red-500',
                    ].join(' ')}
                    aria-label={isCameraEnabled ? 'Turn camera off' : 'Turn camera on'}
                    title={isCameraEnabled ? 'Turn camera off' : 'Turn camera on'}
                    disabled={recordingMode === 'video'}
                  >
                    {isCameraEnabled ? <Video className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleMicPreview()}
                    className={[
                      'flex h-11 w-11 items-center justify-center rounded-lg transition',
                      isMicEnabled ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-500/90 text-white hover:bg-red-500',
                    ].join(' ')}
                    aria-label={isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
                    title={isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
                    disabled={recordingMode === 'video'}
                  >
                    {isMicEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowVideoSettings((prev) => !prev)}
                    className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/20"
                    aria-label="Camera and audio settings"
                    title="Camera and audio settings"
                  >
                    <Settings className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>

            {showVideoSettings && (
              <div className="border-t border-gray-700 bg-[#17191D] px-5 py-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium text-gray-300">
                    Camera
                    <select
                      value={selectedVideoDeviceId}
                      onChange={(event) => void handleVideoDeviceChange(event.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-600 bg-[#24272D] px-3 py-2 text-sm text-white outline-none focus:border-[#3CCED7]"
                      disabled={recordingMode === 'video'}
                    >
                      {videoDevices.length === 0 ? (
                        <option value="">Default camera</option>
                      ) : (
                        videoDevices.map((device, index) => (
                          <option key={device.deviceId || index} value={device.deviceId}>
                            {device.label || `Camera ${index + 1}`}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-gray-300">
                    Microphone
                    <select
                      value={selectedAudioDeviceId}
                      onChange={(event) => void handleAudioDeviceChange(event.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-600 bg-[#24272D] px-3 py-2 text-sm text-white outline-none focus:border-[#3CCED7]"
                      disabled={recordingMode === 'video'}
                    >
                      {audioDevices.length === 0 ? (
                        <option value="">Default microphone</option>
                      ) : (
                        audioDevices.map((device, index) => (
                          <option key={device.deviceId || index} value={device.deviceId}>
                            {device.label || `Microphone ${index + 1}`}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 border-t border-gray-700 px-5 py-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-gray-300 transition hover:bg-white/10 hover:text-white"
              >
                <UploadCloud className="h-5 w-5" />
                Upload Video
              </button>
              <button
                type="button"
                onClick={() => void toggleScreenShare()}
                className={[
                  'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition',
                  isScreenEnabled ? 'bg-[#3CCED7]/20 text-[#8BE7ED]' : 'text-gray-300 hover:bg-white/10 hover:text-white',
                ].join(' ')}
                disabled={recordingMode === 'video'}
              >
                {isScreenEnabled ? <Monitor className="h-5 w-5" /> : <ScreenShare className="h-5 w-5" />}
                {isScreenEnabled ? 'Sharing Screen' : 'Share Screen'}
              </button>

              {!canRecordVideo && (
                <span className="text-xs text-gray-400">Turn on camera or share screen to record.</span>
              )}

              <button
                type="button"
                onClick={startVideoRecording}
                disabled={disabled || recordingMode === 'audio' || !canRecordVideo}
                className={[
                  'ml-auto inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition',
                  recordingMode === 'video'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-[#C81E55] hover:bg-[#B01849]',
                  'disabled:cursor-not-allowed disabled:bg-gray-600 disabled:text-gray-300',
                ].join(' ')}
              >
                {recordingMode === 'video' && <Square className="h-4 w-4 fill-current" />}
                {recordingMode === 'video' ? 'Stop' : 'Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
