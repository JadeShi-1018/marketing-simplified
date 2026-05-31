'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Image,
  Loader2,
  Music,
  Pin,
  Plus,
  Search,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import type { Chat, ChatParticipant } from '@/types/chat';
import { addParticipant, cancelScheduledMessage, createScheduledMessage, listPins, listChatFiles, listScheduledMessages, removeParticipant, unpinMessage, updateChatDetails, updateNotificationSettings } from '@/lib/api/chatApi';
import type { PinnedMessageRow, ChatFileRow, ScheduledMessageRow } from '@/lib/api/chatApi';
import { ProjectAPI } from '@/lib/api/projectApi';
import type { ProjectMemberData } from '@/lib/api/projectApi';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns today's date as 'YYYY-MM-DD' in local time (not UTC). */
function localDateString(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Avatar helper ─────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-red-500', 'bg-indigo-500',
];

function getAvatarColor(userId: number) {
  return AVATAR_COLORS[userId % AVATAR_COLORS.length];
}

function Avatar({ user, size = 'md' }: {
  user: { id: number; username?: string; email?: string; avatar?: string | null };
  size?: 'sm' | 'md' | 'lg';
}) {
  const initials = (user.username || user.email || '?')[0].toUpperCase();
  const cls = size === 'sm' ? 'h-6 w-6 text-[10px]' : size === 'lg' ? 'h-10 w-10 text-base' : 'h-8 w-8 text-xs';
  if (user.avatar) {
    return <img src={user.avatar} alt={initials} className={`${cls} rounded-full object-cover shrink-0`} />;
  }
  return (
    <div className={`${cls} flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${getAvatarColor(user.id)}`}>
      {initials}
    </div>
  );
}

// ── Inline-editable field ─────────────────────────────────────────────────────

interface EditableFieldProps {
  label: string;
  hint?: string;
  value: string;
  placeholder: string;
  multiline?: boolean;
  onSave: (value: string) => Promise<void>;
}

function EditableField({ label, hint, value, placeholder, multiline = false, onSave }: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Sync when parent updates
  useEffect(() => { setDraft(value); }, [value]);

  const startEdit = () => {
    setDraft(value);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSave = async () => {
    if (draft === value) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(draft); } finally { setSaving(false); setEditing(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setEditing(false); setDraft(value); }
    if (e.key === 'Enter' && !multiline) { void handleSave(); }
  };

  return (
    <div className="group">
      <div className="mb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      </div>
      {editing ? (
        <div className="space-y-1.5">
          {multiline ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              className="w-full resize-none rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-800 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
            />
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-800 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
            />
          )}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded bg-[#3CCED7] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#33b8c0] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setDraft(value); }}
              className="rounded px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={startEdit} className="w-full text-left">
          {value ? (
            <p className="text-sm text-gray-700 [overflow-wrap:anywhere]">{value}</p>
          ) : (
            <>
              {hint
                ? <p className="text-[11px] text-gray-400 leading-snug">{hint}</p>
                : <p className="text-xs text-gray-400 italic">{placeholder}</p>}
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ── Add member popover ────────────────────────────────────────────────────────

interface AddMemberPickerProps {
  chatId: number;
  projectId: number;
  existingUserIds: Set<number>;
  currentUserId: number;
  onAdded: (participant: ChatParticipant) => void;
  onClose: () => void;
}

function AddMemberPicker({ chatId, projectId, existingUserIds, onAdded, onClose }: AddMemberPickerProps) {
  const [query, setQuery] = useState('');
  const [members, setMembers] = useState<ProjectMemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ProjectAPI.getProjectMembers(projectId)
      .then((all) => setMembers(all.filter((m) => m.is_active && !existingUserIds.has(m.user.id))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId, existingUserIds]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const filtered = members.filter((m) => {
    const q = query.toLowerCase();
    return (m.user.username || '').toLowerCase().includes(q) || (m.user.email || '').toLowerCase().includes(q);
  });

  const handleAdd = async (member: ProjectMemberData) => {
    setAdding(member.user.id);
    try {
      const participant = await addParticipant(chatId, member.user.id);
      // Backend returns a ChatParticipant; normalise chat_id if needed
      onAdded({ ...participant, chat_id: chatId });
      onClose();
    } catch {
      /* silently ignore */
    } finally {
      setAdding(null);
    }
  };

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-gray-200 bg-white shadow-lg"
    >
      <div className="p-2">
        <div className="flex items-center gap-1.5 rounded border border-gray-300 px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search members…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 text-sm outline-none"
            autoFocus
          />
        </div>
      </div>
      <div className="task-tab-scrollbar max-h-48 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-3 text-center text-xs text-gray-400">No members to add</p>
        ) : (
          filtered.map((m) => (
            <button
              key={m.user.id}
              type="button"
              onClick={() => void handleAdd(m)}
              disabled={adding === m.user.id}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-50"
            >
              <Avatar user={m.user} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">
                  {m.user.username || m.user.email}
                </p>
              </div>
              {adding === m.user.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ── Collapsible section ───────────────────────────────────────────────────────

function Section({ title, icon, defaultOpen = true, onOpen, children }: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  onOpen?: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-100">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) onOpen?.();
        }}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-gray-50"
      >
        <span className="text-gray-500">{icon}</span>
        <span className="flex-1 text-sm font-semibold text-gray-700">{title}</span>
        {open
          ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
      </button>
      {open && <div className="task-tab-scrollbar max-h-64 overflow-y-auto px-4 pb-4">{children}</div>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface ChannelDetailsDrawerProps {
  chat: Chat;
  currentUserId: number;
  onClose: () => void;
  onChatUpdated: (updated: Chat) => void;
  /**
   * Called when user clicks a pinned message so the timeline can jump to it.
   * `parentMessageId` is set when the pinned message is a thread reply — the
   * caller should open the thread for the parent and highlight the reply.
   */
  onJumpToMessage?: (messageId: number, parentMessageId?: number | null) => void;
  /** A newly-created scheduled message to push into the drawer list immediately. */
  lastScheduledMsg?: ScheduledMessageRow | null;
  /** Called when a new participant is successfully added, so callers can update their mention list. */
  onParticipantAdded?: (p: ChatParticipant) => void;
}

export default function ChannelDetailsDrawer({
  chat,
  currentUserId,
  onClose,
  onChatUpdated,
  onJumpToMessage,
  lastScheduledMsg,
  onParticipantAdded,
}: ChannelDetailsDrawerProps) {
  const isGroup = chat.type === 'group';
  const [participants, setParticipants] = useState<ChatParticipant[]>(
    (chat.participants ?? []).filter((p: ChatParticipant) => p.user)
  );
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [pins, setPins] = useState<PinnedMessageRow[]>([]);
  const [pinsLoaded, setPinsLoaded] = useState(false);
  const [unpinningId, setUnpinningId] = useState<number | null>(null);
  const [files, setFiles] = useState<ChatFileRow[]>([]);
  const [filesTotal, setFilesTotal] = useState(0);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [scheduled, setScheduled] = useState<ScheduledMessageRow[]>([]);
  const [scheduledLoaded, setScheduledLoaded] = useState(false);
  const [cancellingScheduledId, setCancellingScheduledId] = useState<number | null>(null);
  const [reschedulingId, setReschedulingId] = useState<number | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleSaving, setRescheduleSaving] = useState(false);

  // Notification / mute state — derived from current user's participant record
  const myParticipant = participants.find((p) => p.user.id === currentUserId);
  const [isMuted, setIsMuted] = useState(myParticipant?.is_muted ?? false);
  const [notifLevel, setNotifLevel] = useState<'all' | 'mentions'>(
    (myParticipant?.notification_level === 'mentions' ? 'mentions' : 'all')
  );
  const [savingNotif, setSavingNotif] = useState(false);

  // Keep participants in sync when chat prop changes
  useEffect(() => {
    setParticipants((chat.participants ?? []).filter((p: ChatParticipant) => p.user));
  }, [chat.participants]);

  // When a new scheduled message is created via the composer, append it to the
  // local list immediately — no need to refetch.
  useEffect(() => {
    if (!lastScheduledMsg) return;
    setScheduled((prev) => {
      if (prev.some((m) => m.id === lastScheduledMsg.id)) return prev;
      return [...prev, lastScheduledMsg].sort(
        (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      );
    });
    // Mark as loaded so the section won't overwrite the list on first open
    setScheduledLoaded(true);
  }, [lastScheduledMsg]);

  const existingUserIds = new Set(participants.map((p) => p.user.id));

  const projectId: number = (() => {
    const raw = (chat as any).project_id ?? (chat as any).project;
    return Number(raw) || 0;
  })();

  const handleSaveName = useCallback(async (value: string) => {
    const updated = await updateChatDetails(chat.id, { name: value });
    onChatUpdated(updated);
  }, [chat.id, onChatUpdated]);

  const handleSaveTopic = useCallback(async (value: string) => {
    const updated = await updateChatDetails(chat.id, { topic: value });
    onChatUpdated(updated);
  }, [chat.id, onChatUpdated]);

  const handleSaveDescription = useCallback(async (value: string) => {
    const updated = await updateChatDetails(chat.id, { description: value });
    onChatUpdated(updated);
  }, [chat.id, onChatUpdated]);

  const handleParticipantAdded = useCallback((p: ChatParticipant) => {
    const nextParticipants = participants.some((participant) => participant.user.id === p.user.id)
      ? participants
      : [...participants, p];
    setParticipants(nextParticipants);
    onChatUpdated({ ...chat, participants: nextParticipants });
    onParticipantAdded?.(p);
  }, [chat, onChatUpdated, onParticipantAdded, participants]);

  const handleRemove = async (participant: ChatParticipant) => {
    setRemovingId(participant.user.id);
    try {
      await removeParticipant(chat.id, participant.user.id);
      const nextParticipants = participants.filter((p) => p.user.id !== participant.user.id);
      setParticipants(nextParticipants);
      onChatUpdated({ ...chat, participants: nextParticipants });
    } catch {
      /* silently ignore */
    } finally {
      setRemovingId(null);
    }
  };

  const handleMuteToggle = async () => {
    const next = !isMuted;
    setIsMuted(next);
    setSavingNotif(true);
    try { await updateNotificationSettings(chat.id, { is_muted: next }); } catch { setIsMuted(!next); } finally { setSavingNotif(false); }
  };

  const handleNotifLevel = async (level: 'all' | 'mentions') => {
    setNotifLevel(level);
    setSavingNotif(true);
    try { await updateNotificationSettings(chat.id, { notification_level: level }); } catch { setNotifLevel(notifLevel); } finally { setSavingNotif(false); }
  };

  const loadPins = useCallback(() => {
    if (pinsLoaded) return;
    setPinsLoaded(true);
    listPins(chat.id).then(setPins).catch(() => {});
  }, [chat.id, pinsLoaded]);

  const loadFiles = useCallback(() => {
    if (filesLoaded) return;
    setFilesLoaded(true);
    setFilesLoading(true);
    listChatFiles(chat.id)
      .then(({ results, total }) => { setFiles(results); setFilesTotal(total); })
      .catch(() => {})
      .finally(() => setFilesLoading(false));
  }, [chat.id, filesLoaded]);

  const loadScheduled = useCallback(() => {
    if (scheduledLoaded) return;
    setScheduledLoaded(true);
    listScheduledMessages(chat.id).then(setScheduled).catch(() => {});
  }, [chat.id, scheduledLoaded]);

  const handleUnpin = async (pin: PinnedMessageRow) => {
    setUnpinningId(pin.id);
    try {
      await unpinMessage(chat.id, pin.message.id);
      setPins((prev) => prev.filter((p) => p.id !== pin.id));
    } catch {
      /* silently ignore */
    } finally {
      setUnpinningId(null);
    }
  };

  const handleCancelScheduled = async (msg: ScheduledMessageRow) => {
    setCancellingScheduledId(msg.id);
    try {
      await cancelScheduledMessage(msg.id);
      setScheduled((prev) => prev.filter((m) => m.id !== msg.id));
    } catch {
      /* silently ignore */
    } finally {
      setCancellingScheduledId(null);
    }
  };

  const openReschedule = (msg: ScheduledMessageRow) => {
    // Pre-fill with the existing scheduled time, but clamp to at least now+15min
    // so the form never opens with a time already in the past.
    const existing = new Date(msg.scheduled_at);
    const floor = new Date(Date.now() + 15 * 60 * 1000);
    const target = existing > floor ? existing : floor;
    const date = localDateString(target);
    const time = `${String(target.getHours()).padStart(2, '0')}:${String(target.getMinutes()).padStart(2, '0')}`;
    setRescheduleDate(date);
    setRescheduleTime(time);
    setReschedulingId(msg.id);
  };

  const confirmReschedule = async (msg: ScheduledMessageRow) => {
    if (!rescheduleDate || !rescheduleTime) return;
    const scheduledAt = new Date(`${rescheduleDate}T${rescheduleTime}:00`);
    if (scheduledAt <= new Date()) {
      toast.error('Scheduled time must be in the future');
      return;
    }
    setRescheduleSaving(true);
    try {
      // Cancel old, create new with same content + new time
      await cancelScheduledMessage(msg.id);
      const newMsg = await createScheduledMessage({
        chat_id: msg.chat,
        content: msg.content,
        rich_body: msg.rich_body ?? undefined,
        attachment_ids: msg.attachment_ids,
        mention_ids: msg.mention_ids,
        reply_to_id: msg.reply_to ?? null,
        scheduled_at: scheduledAt.toISOString(),
      });
      setScheduled((prev) => prev.filter((m) => m.id !== msg.id).concat(newMsg));
      setReschedulingId(null);
    } catch {
      /* silently ignore */
    } finally {
      setRescheduleSaving(false);
    }
  };

  const pendingScheduled = scheduled.filter((m) => m.status === 'pending' || m.status === 'sending');

  return (
    <div className="flex h-full w-full flex-col border-l border-gray-200 bg-white">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
        <span className="text-sm font-semibold text-gray-800">{isGroup ? 'Channel details' : 'Direct message'}</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close channel details"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="task-tab-scrollbar flex-1 overflow-y-auto">

        {/* About — group channels only */}
        {isGroup && (
          <div className="border-b border-gray-100 px-4 py-4 space-y-4">
            <EditableField
              label="Channel name"
              value={chat.name ?? ''}
              placeholder="Add a name…"
              onSave={handleSaveName}
            />
            <EditableField
              label="Topic"
              hint={'What is this channel focused on right now? Update it as things change — e.g. "Q2 launch · deadline Jun 15" or "Blocked on design handoff".'}
              value={chat.topic ?? ''}
              placeholder="e.g. Q2 campaign launch · deadline Jun 15"
              onSave={handleSaveTopic}
            />
            <EditableField
              label="Description"
              hint="A permanent note on what this channel is for and who should join. New members read this once."
              value={chat.description ?? ''}
              placeholder="e.g. All paid social work for APAC. Tag @media-buyer for urgent requests."
              multiline
              onSave={handleSaveDescription}
            />
          </div>
        )}

        {/* Members (group) / Profile card (DM) */}
        {isGroup ? (
          <Section
            title={`Members · ${participants.length}`}
            icon={<Users className="h-4 w-4" />}
          >
            <div className="relative mb-3">
              <button
                type="button"
                onClick={() => setShowAddPicker((v) => !v)}
                className="flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-500 hover:border-teal-400 hover:text-teal-600"
              >
                <Plus className="h-3.5 w-3.5" />
                Add member
              </button>
              {showAddPicker && (
                <AddMemberPicker
                  chatId={chat.id}
                  projectId={projectId}
                  existingUserIds={existingUserIds}
                  currentUserId={currentUserId}
                  onAdded={handleParticipantAdded}
                  onClose={() => setShowAddPicker(false)}
                />
              )}
            </div>

            <ul className="space-y-1">
              {participants.map((p: ChatParticipant) => (
                <li key={p.id} className="group flex items-center gap-2.5 rounded-md px-1 py-1.5 hover:bg-gray-50">
                  <Avatar user={p.user} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">
                      {p.user.username || p.user.email}
                    </p>
                    {p.user.username && p.user.email && (
                      <p className="truncate text-xs text-gray-400">{p.user.email}</p>
                    )}
                  </div>
                  {p.user.id !== currentUserId && currentUserId === chat.created_by_id && (
                    <button
                      type="button"
                      onClick={() => void handleRemove(p)}
                      disabled={removingId === p.user.id}
                      className="hidden shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500 group-hover:block disabled:opacity-50"
                      aria-label={`Remove ${p.user.username || p.user.email}`}
                    >
                      {removingId === p.user.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        ) : (
          /* DM: profile card(s) for the other person(s) */
          <div className="border-b border-gray-100 px-4 py-5">
            {participants
              .filter((p) => p.user.id !== currentUserId)
              .map((p) => (
                <div key={p.id} className="flex flex-col items-center gap-3 text-center">
                  <Avatar user={p.user} size="lg" />
                  <div>
                    <p className="text-base font-semibold text-gray-800">
                      {p.user.username || p.user.email}
                    </p>
                    {p.user.username && p.user.email && (
                      <p className="mt-0.5 text-sm text-gray-400">{p.user.email}</p>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Files */}
        <Section
          title={`Files${filesTotal > 0 ? ` · ${filesTotal}` : ''}`}
          icon={<FileText className="h-4 w-4" />}
          defaultOpen={false}
          onOpen={loadFiles}
        >
          {filesLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-gray-300" />
            </div>
          ) : files.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No files shared in this channel yet.</p>
          ) : (
            <ul className="space-y-1">
              {files.map((file) => {
                const icon = file.file_type === 'image' ? <Image className="h-4 w-4 shrink-0 text-blue-400" />
                  : file.file_type === 'video' ? <Video className="h-4 w-4 shrink-0 text-purple-400" />
                  : file.file_type === 'audio' ? <Music className="h-4 w-4 shrink-0 text-green-400" />
                  : <FileText className="h-4 w-4 shrink-0 text-gray-400" />;
                const sizeKb = file.file_size ? Math.round(file.file_size / 1024) : null;
                return (
                  <li key={file.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50">
                    {icon}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-gray-700">{file.original_filename}</p>
                      <p className="text-[11px] text-gray-400">
                        {file.uploader?.username || file.uploader?.email}
                        {sizeKb !== null && <> · {sizeKb} KB</>}
                      </p>
                    </div>
                    <a
                      href={file.file_url}
                      download={file.original_filename}
                      target="_blank"
                      rel="noreferrer"
                      className="hidden shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 group-hover:block"
                      aria-label="Download"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {/* Pinned messages */}
        <Section
          title={`Pinned messages${pins.length > 0 ? ` · ${pins.length}` : ''}`}
          icon={<Pin className="h-4 w-4" />}
          defaultOpen={false}
          onOpen={loadPins}
        >
          {pins.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No pinned messages yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {pins.map((pin) => (
                <li key={pin.id} className="group flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                  {/* Left accent bar */}
                  <div className="w-0.5 self-stretch rounded-full bg-teal-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    {/* One-line preview: sender · snippet */}
                    {onJumpToMessage ? (
                      <button
                        type="button"
                        onClick={() => onJumpToMessage(pin.message.id, pin.message.parent_message_id ?? null)}
                        className="block w-full text-left"
                      >
                        <span className="text-[11px] font-semibold text-gray-600">
                          {pin.message.sender?.username || pin.message.sender?.email || 'Unknown'}
                        </span>
                        <span className="mx-1 text-[11px] text-gray-300">·</span>
                        <span className="text-[11px] text-gray-500 line-clamp-1 [overflow-wrap:anywhere]">
                          {pin.message.content || '(attachment)'}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-teal-600 group-hover:underline">
                          Jump to message →
                        </span>
                      </button>
                    ) : (
                      <>
                        <span className="text-[11px] font-semibold text-gray-600">
                          {pin.message.sender?.username || pin.message.sender?.email || 'Unknown'}
                        </span>
                        <p className="text-[11px] text-gray-500 line-clamp-1">{pin.message.content || '(attachment)'}</p>
                      </>
                    )}
                    {/* Pinned label */}
                    <span className="mt-0.5 flex items-center gap-1 text-[10px] text-teal-600">
                      <Pin className="h-2.5 w-2.5 shrink-0" />
                      Pinned to channel · visible to all members
                    </span>
                    {/* Pinned-by context */}
                    {pin.pinned_by && (
                      <p className="text-[10px] text-gray-400">
                        by {pin.pinned_by.username || pin.pinned_by.email}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleUnpin(pin)}
                    disabled={unpinningId === pin.id}
                    className="hidden shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500 group-hover:block disabled:opacity-50"
                    aria-label="Unpin"
                  >
                    {unpinningId === pin.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <X className="h-3.5 w-3.5" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Scheduled messages */}
        <Section
          title={`Scheduled${pendingScheduled.length > 0 ? ` · ${pendingScheduled.length}` : ''}`}
          icon={<Clock className="h-4 w-4" />}
          defaultOpen={false}
          onOpen={loadScheduled}
        >
          {pendingScheduled.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No scheduled messages pending.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {pendingScheduled.map((msg) => {
                const scheduledDate = new Date(msg.scheduled_at);
                const preview = msg.content?.trim() || '(no text)';
                const isRescheduling = reschedulingId === msg.id;
                const todayStr = localDateString();
                const minTime = rescheduleDate === todayStr
                  ? (() => { const n = new Date(Date.now() + 2 * 60 * 1000); return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`; })()
                  : undefined;
                return (
                  <li key={msg.id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-start gap-2">
                      <div className="w-0.5 self-stretch rounded-full bg-amber-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                          <Clock className="h-2.5 w-2.5 shrink-0" />
                          {format(scheduledDate, 'MMM d, yyyy · h:mm a')}
                        </p>
                        <p className="mt-0.5 text-[12px] text-gray-600 line-clamp-2 [overflow-wrap:anywhere]">
                          {preview}
                        </p>
                      </div>
                      {!isRescheduling && (
                        <div className="flex shrink-0 flex-col gap-1 mt-0.5">
                          <button
                            type="button"
                            onClick={() => openReschedule(msg)}
                            disabled={cancellingScheduledId === msg.id}
                            className="rounded px-2 py-0.5 text-[11px] font-medium text-teal-600 hover:bg-teal-50 disabled:opacity-50"
                          >
                            Reschedule
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleCancelScheduled(msg)}
                            disabled={cancellingScheduledId === msg.id}
                            className="rounded px-2 py-0.5 text-[11px] font-medium text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                            aria-label="Cancel scheduled message"
                          >
                            {cancellingScheduledId === msg.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : 'Cancel'}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Inline reschedule form */}
                    {isRescheduling && (
                      <div className="mt-2 ml-2.5 space-y-1.5">
                        <div className="flex gap-1.5">
                          <input
                            type="date"
                            value={rescheduleDate}
                            min={todayStr}
                            onChange={(e) => setRescheduleDate(e.target.value)}
                            className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
                          />
                          <input
                            type="time"
                            value={rescheduleTime}
                            min={minTime}
                            onChange={(e) => setRescheduleTime(e.target.value)}
                            className="w-24 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
                          />
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => void confirmReschedule(msg)}
                            disabled={rescheduleSaving || !rescheduleDate || !rescheduleTime}
                            className="flex items-center gap-1 rounded bg-teal-500 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-teal-600 disabled:opacity-50"
                          >
                            {rescheduleSaving
                              ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
                              : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setReschedulingId(null)}
                            disabled={rescheduleSaving}
                            className="rounded px-2.5 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {/* Notification settings */}
        <Section title="Notifications" icon={<Bell className="h-4 w-4" />} defaultOpen={false}>
          <div className="space-y-3">
            {/* Mute toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Mute channel</p>
                <p className="text-xs text-gray-400">Silence all notifications</p>
              </div>
              <button
                type="button"
                onClick={() => void handleMuteToggle()}
                disabled={savingNotif}
                className={[
                  'relative h-5 w-9 rounded-full transition-colors disabled:opacity-50',
                  isMuted ? 'bg-[#3CCED7]' : 'bg-gray-300',
                ].join(' ')}
                role="switch"
                aria-checked={isMuted}
              >
                <span className={[
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                  isMuted ? 'translate-x-4' : 'translate-x-0.5',
                ].join(' ')} />
              </button>
            </div>

            {/* Notification level — only shown when not muted */}
            {!isMuted && (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Notify me about</p>
                <div className="space-y-1">
                  {(['all', 'mentions'] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => void handleNotifLevel(level)}
                      disabled={savingNotif}
                      className={[
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm disabled:opacity-50',
                        notifLevel === level ? 'bg-teal-50 font-medium text-teal-700' : 'text-gray-600 hover:bg-gray-50',
                      ].join(' ')}
                    >
                      <span className={`h-3.5 w-3.5 rounded-full border-2 ${notifLevel === level ? 'border-teal-500 bg-teal-500' : 'border-gray-300'}`} />
                      {level === 'all' ? 'All messages' : 'Mentions only'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}
