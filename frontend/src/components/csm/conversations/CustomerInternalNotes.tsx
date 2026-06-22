'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Lock } from 'lucide-react';
import { CustomerInternalNoteAPI, textToTiptap } from '@/lib/api/customerInternalNoteApi';
import type { CustomerInternalNote } from '@/types/customer';
import { useAuthStore } from '@/lib/authStore';

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
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
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

  const addNote = async () => {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    try {
      const res = await CustomerInternalNoteAPI.create({
        customer: customerId,
        body: textToTiptap(text),
      });
      setNotes((prev) => [res.data, ...prev]);
      setDraft('');
      setAdding(false);
    } catch {
      toast.error('Could not add note.');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (id: number) => {
    const text = editDraft.trim();
    if (!text) return;
    setBusy(true);
    try {
      const res = await CustomerInternalNoteAPI.update(id, { body: textToTiptap(text) });
      setNotes((prev) => prev.map((n) => (n.id === id ? res.data : n)));
      setEditingId(null);
    } catch {
      toast.error('Could not save note.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (note: CustomerInternalNote) => {
    if (!window.confirm('Delete this note? This is recorded in the audit log.')) return;
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
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add an internal note…"
            rows={3}
            className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-[#86E9A8] focus:outline-none focus:ring-2 focus:ring-[#86E9A8]/40"
          />
          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setAdding(false); setDraft(''); }}
              disabled={busy}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={addNote}
              disabled={busy || !draft.trim()}
              className="rounded-md bg-gradient-to-br from-[#3CCED7] to-[#A6E661] px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              Save
            </button>
          </div>
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
                <span className="text-xs font-medium text-gray-700 truncate">
                  {note.author_name}
                </span>
                <span
                  className="text-[11px] text-gray-400 shrink-0"
                  title={new Date(note.created_at).toLocaleString()}
                >
                  {timeAgo(note.created_at)}{note.is_edited ? ' · edited' : ''}
                </span>
              </div>

              {editingId === note.id ? (
                <div className="mt-1">
                  <textarea
                    autoFocus
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-gray-300 p-2 text-sm focus:border-[#86E9A8] focus:outline-none focus:ring-2 focus:ring-[#86E9A8]/40"
                  />
                  <div className="mt-1 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      disabled={busy}
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => saveEdit(note.id)}
                      disabled={busy || !editDraft.trim()}
                      className="rounded-md bg-gradient-to-br from-[#3CCED7] to-[#A6E661] px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{note.body_text}</p>
                  {(note.is_author || isAdmin) && (
                    <div className="mt-1 flex items-center gap-2">
                      {note.is_author && (
                        <button
                          type="button"
                          onClick={() => { setEditingId(note.id); setEditDraft(note.body_text); }}
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
