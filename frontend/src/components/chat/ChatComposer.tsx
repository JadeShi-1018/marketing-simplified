'use client';

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  type Ref,
} from 'react';
import {
  Send,
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
  Sparkles,
  UploadCloud,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
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
type VideoEffectMode = 'none' | 'blur' | 'background';
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
      : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
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
function participantsToUserSummaries(participants: ChatParticipant[]): CommentUserSummary[] {
  return participants.map((p) => ({
    id: p.user.id,
    username: p.user.username,
    email: p.user.email,
  }));
}

const toolbarButtonClassName = [
  'inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition',
  'hover:bg-gray-100 hover:text-gray-800',
  'disabled:cursor-not-allowed disabled:opacity-40',
  'data-[active=true]:bg-[#3CCED7]/15 data-[active=true]:text-[#168E96]',
].join(' ');

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
    <button
      type="button"
      aria-label={tooltip}
      title={tooltip}
      data-active={active}
      disabled={disabled}
      onClick={onClick}
      className={toolbarButtonClassName}
    >
      {children}
    </button>
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
}: {
  editor: Editor | null;
  disabled: boolean;
  onOpenLink: () => void;
}) {
  const inactive = disabled || !editor;

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
        shortcut="```"
        active={Boolean(editor?.isActive('codeBlock'))}
        disabled={inactive}
        onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
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
}: ChatComposerProps) {
  const [showFormattingToolbar, setShowFormattingToolbar] = useState(true);

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
  const [showVideoSettings, setShowVideoSettings] = useState(false);
  const [showVideoEffects, setShowVideoEffects] = useState(false);
  const [videoEffect, setVideoEffect] = useState<VideoEffectMode>('none');
  const [videoBackgroundImage, setVideoBackgroundImage] = useState<string | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const backgroundImageInputRef = useRef<HTMLInputElement>(null);
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
  const mentionableUsers = useMemo(
    () => participantsToUserSummaries(participants),
    [participants],
  );

  // ---- Tiptap extensions (memoised; re-created only when participants/placeholder change) ----
  const extensions = useMemo(
    () => createChatEditorExtensions({ placeholder, participants: mentionableUsers }),
    [placeholder, mentionableUsers],
  );

  // ---- Editor ----
  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: CHAT_EDITOR_CONTENT_CLASS },
      handleKeyDown: (_view, event) => {
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

  // ---- Revoke object-URL previews on unmount ----
  useEffect(() => {
    return () => {
      pendingAttachments.forEach((a) => {
        if (a.preview) URL.revokeObjectURL(a.preview);
      });
    };
  }, [pendingAttachments]);

  useEffect(() => {
    return () => {
      if (videoBackgroundImage) URL.revokeObjectURL(videoBackgroundImage);
    };
  }, [videoBackgroundImage]);

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

  const handleBackgroundImageSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image for the background');
      e.target.value = '';
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setVideoBackgroundImage(previewUrl);
    setVideoEffect('background');
    setShowVideoEffects(false);
    e.target.value = '';
  }, []);

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
        const type =
          recorder.mimeType ||
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
    } catch {
      stopMediaTracks();
      setRecordingMode(null);
      toast.error('Allow microphone access to record audio');
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
    } catch {
      cameraStreamRef.current = null;
      setIsCameraEnabled(false);
      updateVideoPreviewStream();
      toast.error('Allow camera access to preview video');
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
    } catch {
      micStreamRef.current = null;
      setIsMicEnabled(false);
      toast.error('Allow microphone access to include audio');
      return null;
    }
  }, [refreshMediaDevices, selectedAudioDeviceId]);

  const openVideoRecorder = useCallback(async () => {
    if (disabled) return;
    if (recordingMode && recordingMode !== 'video') return;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Video recording is not supported in this browser');
      return;
    }

    setIsVideoRecorderOpen(true);
    setShowVideoEffects(false);
    setShowVideoSettings(false);
    setIsScreenEnabled(false);
    setIsCameraEnabled(true);
    setIsMicEnabled(true);
    await refreshMediaDevices();
    void startCameraPreview();
    void startMicPreview();
  }, [disabled, recordingMode, refreshMediaDevices, startCameraPreview, startMicPreview]);

  const closeVideoRecorder = useCallback(() => {
    if (recordingMode === 'video') {
      stopRecording();
      return;
    }
    setIsVideoRecorderOpen(false);
    setShowVideoEffects(false);
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

    try {
      const stream = await mediaDevices.getDisplayMedia({ video: true, audio: false });
      screenStreamRef.current = stream;
      setIsScreenEnabled(true);
      setVideoPreviewStream(stream);
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (screenStreamRef.current === stream) {
            screenStreamRef.current = null;
            setIsScreenEnabled(false);
            setVideoPreviewStream(cameraStreamRef.current);
          }
        });
      });
    } catch {
      setIsScreenEnabled(false);
      toast.error('Screen sharing was cancelled');
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
                  <div className="flex min-w-[180px] items-center gap-2">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-gray-200">
                      {getFileIcon(att.file)}
                    </div>
                    <audio src={att.preview} controls preload="metadata" className="h-8 max-w-[180px]" />
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

          {/* Send button */}
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!canSend || disabled || Boolean(recordingMode)}
            className={`ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 ${
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

            <div className="flex min-h-0 flex-1 items-center justify-center px-5 py-8">
              <div
                className="relative aspect-video w-full max-w-3xl overflow-hidden rounded-xl bg-[#111317] bg-cover bg-center shadow-inner"
                style={
                  videoEffect === 'background' && videoBackgroundImage
                    ? { backgroundImage: `url(${videoBackgroundImage})` }
                    : undefined
                }
              >
                {videoPreviewStream ? (
                  <>
                    <video
                      ref={videoPreviewRef}
                      autoPlay
                      muted
                      playsInline
                      className={[
                        'h-full w-full object-cover',
                        videoEffect === 'blur' ? 'blur-[1.5px]' : '',
                        videoEffect === 'background' ? 'opacity-80' : '',
                      ].join(' ')}
                    />
                    {videoEffect === 'background' && (
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-[#3CCED7]/15 via-transparent to-[#A6E661]/20" />
                    )}
                  </>
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
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowVideoEffects((prev) => !prev)}
                      className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/20"
                      aria-label="Video effects"
                      title="Video effects"
                    >
                      <Sparkles className="h-5 w-5" />
                    </button>
                    {showVideoEffects && (
                      <div className="absolute bottom-full left-0 mb-2 w-60 overflow-hidden rounded-lg border border-gray-700 bg-[#24272D] py-1 text-sm shadow-xl">
                        <button
                          type="button"
                          onClick={() => {
                            setVideoEffect('none');
                            setShowVideoEffects(false);
                          }}
                          className="block w-full px-4 py-2 text-left hover:bg-white/10"
                        >
                          No effect
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setVideoEffect('blur');
                            setShowVideoEffects(false);
                          }}
                          className="block w-full px-4 py-2 text-left hover:bg-white/10"
                        >
                          Blur background
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            backgroundImageInputRef.current?.click();
                          }}
                          className="block w-full px-4 py-2 text-left hover:bg-white/10"
                        >
                          Upload background image
                        </button>
                      </div>
                    )}
                  </div>
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
              <input
                ref={backgroundImageInputRef}
                type="file"
                accept="image/*"
                onChange={handleBackgroundImageSelect}
                className="hidden"
              />
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
