"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowLeft, Loader2, Pencil, Trash2, X } from "lucide-react";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Modal from "@/components/ui/Modal";
import {
  deleteVariation,
  listVariations,
  updateVariation,
} from "@/lib/api/adCopyVariationApi";
import type {
  AdCopyVariation,
  AdCopyVariationCopy,
} from "@/types/adCopyVariation";

const SECTION_LABEL =
  "text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2";

const TEXTAREA_BASE =
  "mt-2 w-full resize-none bg-transparent text-[14px] text-gray-700 placeholder:text-gray-400 outline-none border-0 leading-5 py-1 focus:ring-0";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null) {
    const maybeAxios = err as {
      response?: { data?: { detail?: unknown; error?: unknown } };
      message?: unknown;
    };
    const detail = maybeAxios.response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    const apiError = maybeAxios.response?.data?.error;
    if (typeof apiError === "string" && apiError.trim()) return apiError;
    if (typeof maybeAxios.message === "string" && maybeAxios.message.trim()) {
      return maybeAxios.message;
    }
  }
  return fallback;
}

export default function VariationsListPage() {
  return (
    <ProtectedRoute>
      <DashboardLayout>
        <VariationsListContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}

function VariationsListContent() {
  const params = useParams<{ creativeId: string }>();
  const creativeId = Number(params?.creativeId);

  const [rows, setRows] = useState<AdCopyVariation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [pendingDelete, setPendingDelete] = useState<AdCopyVariation | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  useEffect(() => {
    if (!Number.isFinite(creativeId)) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    listVariations(creativeId, { limit: 50 })
      .then((res) => {
        if (active) setRows(res.results);
      })
      .catch((err) => {
        if (!active) return;
        toast.error(extractErrorMessage(err, "Failed to load variations."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [creativeId]);

  const handleUpdated = (updated: AdCopyVariation) => {
    setRows((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteVariation(pendingDelete.id);
      toast.success("Variation deleted");
      setRows((prev) => prev.filter((row) => row.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Failed to delete variation."));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-gray-50">
      <div className="mx-auto max-w-[1440px] px-6 py-4">
        <Link
          href={`/meta-ads/creatives/${creativeId}`}
          className="inline-flex items-center gap-1 text-[14px] text-gray-500 transition-colors hover:text-gray-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to creative
        </Link>
        <div className="mt-3">
          <h1 className="text-[24px] font-semibold text-gray-900">Variations</h1>
          <p className="mt-1 text-[14px] text-gray-500">
            All AI-generated copy for this creative.
          </p>
        </div>

        <div className="mt-5 space-y-5">
          {loading ? (
            <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
              <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
              <div className="mt-3 h-3 w-full animate-pulse rounded bg-gray-100" />
              <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-gray-100" />
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border-[0.5px] border-gray-200 bg-white p-5 text-center">
              <div className="text-[14px] text-gray-700">
                No variations saved yet.
              </div>
              <div className="mt-1 text-[12px] text-gray-500">
                Generate one from the Creatives tab → Generate variation → Save.
              </div>
            </div>
          ) : (
            rows.map((row) => (
              <VariationCard
                key={row.id}
                row={row}
                onUpdated={handleUpdated}
                onDeleteRequest={() => setPendingDelete(row)}
              />
            ))
          )}
        </div>
      </div>

      <DeleteConfirmModal
        open={pendingDelete !== null}
        deleting={deleting}
        onCancel={() => {
          if (!deleting) setPendingDelete(null);
        }}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}

interface VariationCardProps {
  row: AdCopyVariation;
  onUpdated: (updated: AdCopyVariation) => void;
  onDeleteRequest: () => void;
}

function VariationCard({ row, onUpdated, onDeleteRequest }: VariationCardProps) {
  const [editing, setEditing] = useState<boolean>(false);
  const [draft, setDraft] = useState<AdCopyVariationCopy>({
    hook: row.hook,
    headline: row.headline,
    description: row.description,
    cta: row.cta,
  });
  const [saving, setSaving] = useState<boolean>(false);

  const startEdit = () => {
    setDraft({
      hook: row.hook,
      headline: row.headline,
      description: row.description,
      cta: row.cta,
    });
    setEditing(true);
  };

  const cancelEdit = () => {
    if (saving) return;
    setEditing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateVariation(row.id, draft);
      onUpdated(updated);
      toast.success("Variation updated");
      setEditing(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Failed to update variation."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="rounded-xl border-[0.5px] border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-gray-500">
          {relativeTime(row.created_at)}
        </div>
        {!editing && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={startEdit}
              aria-label="Edit variation"
              title="Edit"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onDeleteRequest}
              aria-label="Delete variation"
              title="Delete"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-4">
        <Field
          label="Hook"
          editing={editing}
          value={editing ? draft.hook : row.hook}
          onChange={(v) => setDraft({ ...draft, hook: v })}
          rows={2}
        />
        <Field
          label="Headline"
          editing={editing}
          value={editing ? draft.headline : row.headline}
          onChange={(v) => setDraft({ ...draft, headline: v })}
          rows={2}
        />
        <Field
          label="Description"
          editing={editing}
          value={editing ? draft.description : row.description}
          onChange={(v) => setDraft({ ...draft, description: v })}
          rows={4}
        />
        <CtaField
          editing={editing}
          value={editing ? draft.cta : row.cta}
          onChange={(v) => setDraft({ ...draft, cta: v })}
        />
      </div>

      {editing && (
        <div className="mt-5 flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
          <button
            type="button"
            onClick={cancelEdit}
            disabled={saving}
            className="rounded-lg px-3 py-1.5 text-[14px] font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#3CCED7] to-[#A6E661] px-4 py-1.5 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </article>
  );
}

interface FieldProps {
  label: string;
  editing: boolean;
  value: string;
  onChange: (next: string) => void;
  rows: number;
}

function Field({ label, editing, value, onChange, rows }: FieldProps) {
  return (
    <div>
      <div className={SECTION_LABEL}>{label}</div>
      {editing ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className={TEXTAREA_BASE}
        />
      ) : (
        <div className="whitespace-pre-wrap text-[14px] text-gray-700">
          {value || "—"}
        </div>
      )}
    </div>
  );
}

interface CtaFieldProps {
  editing: boolean;
  value: string;
  onChange: (next: string) => void;
}

function CtaField({ editing, value, onChange }: CtaFieldProps) {
  return (
    <div>
      <div className={SECTION_LABEL}>CTA</div>
      {editing ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={1}
          className={TEXTAREA_BASE}
        />
      ) : value ? (
        <span className="inline-flex rounded bg-gray-100 px-2 py-0.5 font-mono text-[12px] text-gray-700">
          {value}
        </span>
      ) : (
        <span className="text-[14px] text-gray-400">—</span>
      )}
    </div>
  );
}

interface DeleteConfirmModalProps {
  open: boolean;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteConfirmModal({
  open,
  deleting,
  onCancel,
  onConfirm,
}: DeleteConfirmModalProps) {
  return (
    <Modal isOpen={open} onClose={onCancel}>
      <div className="w-[min(420px,calc(100vw-2rem))]">
        <div className="relative overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-gray-100">
          <div className="h-[3px] w-full bg-gradient-to-r from-[#3CCED7] to-[#A6E661]" />
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="absolute right-3 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-60 disabled:cursor-not-allowed"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="px-6 pt-5 pb-4">
            <h2 className="text-[15px] font-semibold text-gray-900">
              Delete variation?
            </h2>
            <p className="mt-2 text-[14px] text-gray-700">
              This action cannot be undone.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-6 py-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={deleting}
              className="rounded-lg px-3 py-1.5 text-[14px] font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-1.5 text-[14px] font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
