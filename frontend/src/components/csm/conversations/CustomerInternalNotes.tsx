'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Lock } from 'lucide-react';
import { CustomerInternalNoteAPI } from '@/lib/api/customerInternalNoteApi';
import type { CustomerInternalNote } from '@/types/customer';
import type { TiptapJSONContent } from '@/types/comment';
import { useAuthStore } from '@/lib/authStore';
import { InternalNoteEditor, InternalNoteContent } from './InternalNoteEditor';

interface Props {
  customerId: number;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function CustomerInternalNotes({ customerId }: Props) {
  const isAdmin = useAuthStore((s) => Boolean(s.user?.is_csm_admin));

  const [notes, setNotes] = useState<CustomerInternalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setNotes(await CustomerInternalNoteAPI.list(customerId));
    } catch {
      /* keep panel usable even if notes fail to load */
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const addNote = async (body: TiptapJSONContent) => {
    setBusy(true);
    try {
      const res = await CustomerInternalNoteAPI.create({ customer: customerId, body });
      setNotes((prev) => [res.data, ...prev]);
      setAdding(false);
    } catch {
      toast.error('Could not add note.');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (id: number, body: TiptapJSONContent) => {
    setBusy(true);
    try {
      const res = await CustomerInternalNoteAPI.update(id, { body });
      setNotes((prev) => prev.map((n) => (n.id === id ? res.data : n)));
      setEditingId(null);
    } catch {
      toast.error('Could not save note.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (note: CustomerInternalNote) => {
    setBusy(true);
    try {
      await CustomerInternalNoteAPI.destroy(note.id);
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
    } catch {
      toast.error('Could not delete note.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 py-3 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
          <Lock className="h-3 w-3" aria-hidden /> Internal Notes
        </p>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs text-[#3CCED7] hover:underline"
          >
            <Plus className="h-3 w-3" aria-hidden /> Add
          </button>
        )}
      </div>

      <p className="mb-2 text-[11px] text-gray-400">Never visible to the customer.</p>

      {adding && (
        <div className="mb-3">
          <InternalNoteEditor saving={busy} onSave={addNote} onCancel={() => setAdding(false)} />
        </div>
      )}

      {loading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-gray-400">No notes yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {notes.map((note) => (
            <div key={note.id} className="rounded-lg border border-gray-100 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 min-w-0">
                  {note.author_avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={note.author_avatar}
                      alt={note.author_name}
                      className="h-5 w-5 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-semibold text-gray-600">
                      {note.author_name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="text-xs font-medium text-gray-700 truncate">
                    {note.author_name}
                  </span>
                </span>
                <span
                  className="group relative shrink-0 cursor-help text-[11px] text-gray-400"
                  title={new Date(note.created_at).toLocaleString()}
                >
                  {timeAgo(note.created_at)}{note.is_edited ? ' · edited' : ''}
                  <span className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[10px] text-white shadow-lg group-hover:block">
                    {new Date(note.created_at).toLocaleString()}
                  </span>
                </span>
              </div>

              {editingId === note.id ? (
                <div className="mt-1">
                  <InternalNoteEditor
                    initialContent={note.body}
                    saving={busy}
                    onSave={(body) => saveEdit(note.id, body)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              ) : (
                <>
                  <div className="mt-1">
                    <InternalNoteContent body={note.body} />
                  </div>
                  {(note.is_author || isAdmin) && (
                    <div className="mt-1 flex items-center gap-2">
                      {note.is_author && (
                        <button
                          type="button"
                          onClick={() => setEditingId(note.id)}
                          className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-indigo-600"
                        >
                          <Pencil className="h-3 w-3" aria-hidden /> Edit
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => remove(note)}
                        disabled={busy}
                        className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden /> Delete
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
