"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowLeft, Loader2, Pencil, Trash2, X } from "lucide-react";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Modal from "@/components/ui/Modal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  bulkSaveVariations,
  deleteVariation,
  generateVariation,
  saveVariation,
  updateVariation,
} from "@/lib/api/adCopyVariationApi";
import { facebookApi, type MetaCreativeDetail } from "@/lib/api/facebookApi";
import type {
  AdCopyVariationCopy,
  AdCopyVariationSourceMode,
  SaveVariationRequest,
} from "@/types/adCopyVariation";

const SECTION_LABEL =
  "text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2";

const TEXTAREA_BASE =
  "mt-2 w-full resize-none bg-transparent text-[14px] text-gray-700 placeholder:text-gray-400 outline-none border-0 leading-5 py-1 focus:ring-0";

const TAB_TRIGGER_BASE =
  "px-1 pb-2 rounded-none bg-transparent text-[14px] font-medium text-gray-700 border-b-2 border-transparent shadow-none transition hover:text-gray-900 focus-visible:outline-none data-[state=active]:bg-transparent data-[state=active]:text-gray-900 data-[state=active]:border-[#3CCED7] data-[state=active]:shadow-none disabled:opacity-100";

const COUNT_PILL_PRESETS = [5, 10, 20] as const;
const MAX_COUNT = 50;

const EMPTY_COPY: AdCopyVariationCopy = {
  hook: "",
  headline: "",
  description: "",
  cta: "",
};

interface CardState {
  key: string;
  batch_id: string;
  source_mode: AdCopyVariationSourceMode;
  source_ref: string;
  creative_id: number | null;
  copy: AdCopyVariationCopy;
  draft: AdCopyVariationCopy;
  saved: boolean;
  savedId: number | null;
  selected: boolean;
  editing: boolean;
  saving: boolean;
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

function makeKey(batchId: string, index: number): string {
  return `${batchId || "single"}-${index}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function VariationsStudioPage() {
  return (
    <ProtectedRoute>
      <DashboardLayout>
        <VariationsStudioContent />
      </DashboardLayout>
    </ProtectedRoute>
  );
}

function VariationsStudioContent() {
  const searchParams = useSearchParams();
  const initialCreativeIdParam = searchParams.get("creative");
  const initialCreativeId = initialCreativeIdParam
    ? Number(initialCreativeIdParam)
    : null;
  const initialMode: AdCopyVariationSourceMode =
    initialCreativeId && Number.isFinite(initialCreativeId) ? "existing" : "custom";

  const [mode, setMode] = useState<AdCopyVariationSourceMode>(initialMode);
  const [creativeMeta, setCreativeMeta] = useState<MetaCreativeDetail | null>(null);
  const [creativeMetaLoading, setCreativeMetaLoading] = useState<boolean>(false);
  const [customBase, setCustomBase] = useState<AdCopyVariationCopy>(EMPTY_COPY);
  const [externalUrl, setExternalUrl] = useState<string>("");
  const [instruction, setInstruction] = useState<string>("");
  const [count, setCount] = useState<number>(10);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [lastBatchSummary, setLastBatchSummary] = useState<{
    requested: number;
    succeeded: number;
    failed: number;
  } | null>(null);
  const [cards, setCards] = useState<CardState[]>([]);
  const [bulkSaving, setBulkSaving] = useState<boolean>(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState<boolean>(false);

  useEffect(() => {
    if (!initialCreativeId || !Number.isFinite(initialCreativeId)) return;
    let active = true;
    setCreativeMetaLoading(true);
    facebookApi
      .getMetaCreativeDetail(initialCreativeId, 28)
      .then((detail) => {
        if (active) setCreativeMeta(detail);
      })
      .catch((err) => {
        if (!active) return;
        toast.error(extractErrorMessage(err, "Failed to load creative."));
      })
      .finally(() => {
        if (active) setCreativeMetaLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialCreativeId]);

  const sourceHook = creativeMeta
    ? (creativeMeta.body || "").split("\n", 1)[0]
    : "";

  const externalUrlValid = /^https?:\/\//.test(externalUrl.trim());

  const sourceInputValid =
    (mode === "existing" && !!creativeMeta) ||
    mode === "custom" ||
    (mode === "external_url" && externalUrlValid);

  const generateLabel = isGenerating
    ? `Generating ${count} variations…`
    : `Generate ${count} variation${count === 1 ? "" : "s"}`;

  const moreLabel = isGenerating
    ? `Generating ${count} more…`
    : `Generate ${count} more`;

  const selectedUnsavedCards = cards.filter((c) => c.selected && !c.saved);
  const unsavedCardCount = cards.filter((c) => !c.saved).length;

  const handleCountInput = (value: string) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    const clamped = Math.max(1, Math.min(MAX_COUNT, Math.floor(n)));
    setCount(clamped);
  };

  const buildSourcePayload = () => {
    if (mode === "existing") {
      return {
        creative_id: creativeMeta?.id,
        creative_meta: creativeMeta,
      };
    }
    if (mode === "external_url") {
      return { url: externalUrl.trim() };
    }
    return { base_copy: customBase };
  };

  const runGenerate = async (append: boolean) => {
    if (!sourceInputValid) {
      toast.error("Source input is incomplete.");
      return;
    }
    setIsGenerating(true);
    try {
      const payload = buildSourcePayload();
      const res = await generateVariation({
        source_mode: mode,
        count,
        instruction,
        creative_id: payload.creative_id,
        base_copy: mode === "custom" ? customBase : undefined,
        url: mode === "external_url" ? externalUrl.trim() : undefined,
      });
      setLastBatchSummary({
        requested: res.count_requested,
        succeeded: res.count_succeeded,
        failed: res.count_failed,
      });
      const newCards: CardState[] = res.results.map((copy, i) => ({
        key: makeKey(res.batch_id, i),
        batch_id: res.batch_id,
        source_mode: mode,
        source_ref: mode === "external_url" ? externalUrl.trim() : "",
        creative_id: mode === "existing" ? creativeMeta?.id ?? null : null,
        copy,
        draft: copy,
        saved: false,
        savedId: null,
        selected: false,
        editing: false,
        saving: false,
      }));
      setCards((prev) => (append ? [...prev, ...newCards] : newCards));
    } catch (err) {
      toast.error(extractErrorMessage(err, "Failed to generate variations."));
    } finally {
      setIsGenerating(false);
    }
  };

  const updateCard = (key: string, patch: Partial<CardState>) => {
    setCards((prev) =>
      prev.map((c) => (c.key === key ? { ...c, ...patch } : c))
    );
  };

  const startEdit = (key: string) => {
    setCards((prev) =>
      prev.map((c) =>
        c.key === key ? { ...c, editing: true, draft: c.copy } : c
      )
    );
  };

  const cancelEdit = (key: string) => {
    setCards((prev) =>
      prev.map((c) => (c.key === key ? { ...c, editing: false, draft: c.copy } : c))
    );
  };

  const saveCard = async (key: string) => {
    const card = cards.find((c) => c.key === key);
    if (!card) return;
    updateCard(key, { saving: true });
    try {
      if (card.saved && card.savedId) {
        const updated = await updateVariation(card.savedId, card.draft);
        setCards((prev) =>
          prev.map((c) =>
            c.key === key
              ? {
                  ...c,
                  copy: { ...card.draft },
                  draft: { ...card.draft },
                  editing: false,
                  saving: false,
                  savedId: updated.id,
                }
              : c
          )
        );
        toast.success("Variation updated");
      } else {
        const payload: SaveVariationRequest = {
          source_mode: card.source_mode,
          creative: card.source_mode === "existing" ? card.creative_id : null,
          source_ref: card.source_ref || undefined,
          batch_id: card.batch_id || undefined,
          hook: card.draft.hook,
          headline: card.draft.headline,
          description: card.draft.description,
          cta: card.draft.cta,
          instruction,
        };
        const saved = await saveVariation(payload);
        setCards((prev) =>
          prev.map((c) =>
            c.key === key
              ? {
                  ...c,
                  copy: { ...card.draft },
                  draft: { ...card.draft },
                  saved: true,
                  savedId: saved.id,
                  editing: false,
                  saving: false,
                  selected: false,
                }
              : c
          )
        );
        toast.success("Variation saved");
      }
    } catch (err) {
      updateCard(key, { saving: false });
      toast.error(extractErrorMessage(err, "Failed to save variation."));
    }
  };

  const deleteCard = async (key: string) => {
    const card = cards.find((c) => c.key === key);
    if (!card) return;
    if (card.saved && card.savedId) {
      try {
        await deleteVariation(card.savedId);
        toast.success("Variation deleted");
      } catch (err) {
        toast.error(extractErrorMessage(err, "Failed to delete variation."));
        return;
      }
    }
    setCards((prev) => prev.filter((c) => c.key !== key));
  };

  const toggleSelected = (key: string) => {
    setCards((prev) =>
      prev.map((c) => (c.key === key ? { ...c, selected: !c.selected } : c))
    );
  };

  const handleBulkSave = async () => {
    if (selectedUnsavedCards.length === 0) return;
    setBulkSaving(true);
    const payloads: SaveVariationRequest[] = selectedUnsavedCards.map((c) => ({
      source_mode: c.source_mode,
      creative: c.source_mode === "existing" ? c.creative_id : null,
      source_ref: c.source_ref || undefined,
      batch_id: c.batch_id || undefined,
      hook: c.draft.hook,
      headline: c.draft.headline,
      description: c.draft.description,
      cta: c.draft.cta,
      instruction,
    }));
    try {
      const result = await bulkSaveVariations(payloads);
      const okCount = result.saved.length;
      const failCount = result.failedIndices.length;
      // Map back saved ids onto the cards in order
      const successfulOriginalKeys = selectedUnsavedCards
        .filter((_, idx) => !result.failedIndices.includes(idx))
        .map((c) => c.key);
      setCards((prev) =>
        prev.map((c) => {
          const orderIdx = successfulOriginalKeys.indexOf(c.key);
          if (orderIdx === -1) return c;
          const savedRow = result.saved[orderIdx];
          return savedRow
            ? {
                ...c,
                saved: true,
                savedId: savedRow.id,
                selected: false,
                copy: { ...c.draft },
              }
            : c;
        })
      );
      if (failCount === 0) {
        toast.success(`Saved ${okCount} variations`);
      } else {
        toast.error(`Saved ${okCount} of ${okCount + failCount}; ${failCount} failed`);
      }
    } finally {
      setBulkSaving(false);
    }
  };

  const handleClearAll = () => {
    if (unsavedCardCount > 0) {
      setClearConfirmOpen(true);
      return;
    }
    setCards([]);
    setLastBatchSummary(null);
  };

  const confirmClear = () => {
    setCards([]);
    setLastBatchSummary(null);
    setClearConfirmOpen(false);
  };

  return (
    <div className="bg-gray-50">
      <div className="mx-auto max-w-[1440px] px-6 py-4 space-y-5">
        {initialCreativeId !== null && Number.isFinite(initialCreativeId) && (
          <Link
            href="/meta-ads?tab=creatives"
            className="inline-flex items-center gap-1 text-[14px] text-gray-500 transition-colors hover:text-gray-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to creatives
          </Link>
        )}
        <header>
          <h1 className="text-[24px] font-semibold text-gray-900">
            Variations Studio
          </h1>
          <p className="mt-1 text-[14px] text-gray-500">
            Generate AI ad copy variations in batches of 1 to 50.
          </p>
        </header>

        <section className="rounded-xl border-[0.5px] border-gray-200 bg-white p-5">
          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value as AdCopyVariationSourceMode)}
          >
            <TabsList className="h-auto w-full justify-start gap-4 rounded-none bg-transparent p-0 border-b border-gray-200">
              <TabsTrigger value="existing" className={TAB_TRIGGER_BASE}>
                Existing creative
              </TabsTrigger>
              <TabsTrigger value="custom" className={TAB_TRIGGER_BASE}>
                Custom content
              </TabsTrigger>
              <TabsTrigger value="external_url" className={TAB_TRIGGER_BASE}>
                External URL
              </TabsTrigger>
            </TabsList>

            <TabsContent value="existing" className="pt-4 mt-0">
              {creativeMetaLoading ? (
                <div className="text-[12px] text-gray-500">Loading creative…</div>
              ) : creativeMeta ? (
                <div>
                  <div className={SECTION_LABEL}>Source preview</div>
                  <dl className="space-y-1.5 text-[14px] leading-5">
                    <div className="grid grid-cols-[88px_1fr] gap-2">
                      <dt className="text-gray-500">Hook</dt>
                      <dd className="text-gray-900">{sourceHook || "—"}</dd>
                    </div>
                    <div className="grid grid-cols-[88px_1fr] gap-2">
                      <dt className="text-gray-500">Headline</dt>
                      <dd className="text-gray-900">{creativeMeta.title || "—"}</dd>
                    </div>
                    <div className="grid grid-cols-[88px_1fr] gap-2">
                      <dt className="text-gray-500">Description</dt>
                      <dd className="whitespace-pre-wrap text-gray-900">
                        {creativeMeta.body || "—"}
                      </dd>
                    </div>
                    <div className="grid grid-cols-[88px_1fr] gap-2">
                      <dt className="text-gray-500">CTA</dt>
                      <dd className="text-gray-900">
                        {creativeMeta.call_to_action_type || "—"}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                  Select a creative on the Meta Ads → Creatives tab and click
                  &ldquo;Generate variations&rdquo; to deep-link here. Or pick
                  Custom content / External URL above.
                </p>
              )}
            </TabsContent>

            <TabsContent value="custom" className="pt-4 mt-0">
              <div className={SECTION_LABEL}>Custom base copy</div>
              <div className="space-y-3">
                <div className="grid grid-cols-[88px_1fr] items-start gap-2">
                  <span className="pt-1 text-[14px] text-gray-500">Hook</span>
                  <textarea
                    value={customBase.hook}
                    onChange={(e) =>
                      setCustomBase({ ...customBase, hook: e.target.value })
                    }
                    placeholder="First line that catches the eye"
                    rows={2}
                    className={TEXTAREA_BASE}
                  />
                </div>
                <div className="grid grid-cols-[88px_1fr] items-start gap-2">
                  <span className="pt-1 text-[14px] text-gray-500">Headline</span>
                  <textarea
                    value={customBase.headline}
                    onChange={(e) =>
                      setCustomBase({ ...customBase, headline: e.target.value })
                    }
                    placeholder="Short hero headline"
                    rows={2}
                    className={TEXTAREA_BASE}
                  />
                </div>
                <div className="grid grid-cols-[88px_1fr] items-start gap-2">
                  <span className="pt-1 text-[14px] text-gray-500">
                    Description
                  </span>
                  <textarea
                    value={customBase.description}
                    onChange={(e) =>
                      setCustomBase({ ...customBase, description: e.target.value })
                    }
                    placeholder="Body copy"
                    rows={4}
                    className={TEXTAREA_BASE}
                  />
                </div>
                <div className="grid grid-cols-[88px_1fr] items-start gap-2">
                  <span className="pt-1 text-[14px] text-gray-500">CTA</span>
                  <textarea
                    value={customBase.cta}
                    onChange={(e) =>
                      setCustomBase({ ...customBase, cta: e.target.value })
                    }
                    placeholder="e.g. SHOP_NOW"
                    rows={1}
                    className={TEXTAREA_BASE}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="external_url" className="pt-4 mt-0">
              <div className={SECTION_LABEL}>Ad URL</div>
              <input
                type="url"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://www.facebook.com/ads/library/?id=..."
                className="w-full bg-transparent text-[14px] text-gray-700 placeholder:text-gray-400 outline-none border-0 border-b border-gray-200 focus:border-[#3CCED7] transition py-1"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Paste a public Meta Ad Library URL. The page is fetched via a
                managed headless browser, then ad copy is extracted and rewritten.
              </p>
            </TabsContent>
          </Tabs>
        </section>

        <section className="rounded-xl border-[0.5px] border-gray-200 bg-white p-5">
          <div className={SECTION_LABEL}>
            Instruction
            <span className="ml-1.5 text-gray-300 normal-case tracking-normal font-normal">
              optional
            </span>
          </div>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Focus the rewrite, e.g. 'rewrite only the Hook' or 'make it more urgent'"
            rows={3}
            className={TEXTAREA_BASE}
          />
        </section>

        <section className="rounded-xl border-[0.5px] border-gray-200 bg-white p-5">
          <div className={SECTION_LABEL}>How many variations</div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-1.5">
              {COUNT_PILL_PRESETS.map((preset) => {
                const active = count === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCount(preset)}
                    className={
                      active
                        ? "px-3 py-1 rounded-full text-[12px] font-medium border border-transparent shadow-sm bg-gradient-to-br from-[#3CCED7] to-[#A6E661] text-white"
                        : "px-3 py-1 rounded-full text-[12px] font-medium border border-transparent bg-gray-100 text-gray-700 hover:border-[#3CCED7]/40 hover:bg-white transition"
                    }
                  >
                    {preset}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-gray-400">or</span>
              <input
                type="number"
                min={1}
                max={MAX_COUNT}
                step={1}
                value={count}
                onChange={(e) => handleCountInput(e.target.value)}
                aria-label="Custom count"
                className="h-8 w-20 bg-transparent text-[14px] text-gray-900 placeholder:text-gray-300 outline-none border-0 border-b border-gray-200 focus:border-[#3CCED7] transition py-1 text-center"
              />
              <span className="text-[11px] text-gray-400">1-50</span>
            </div>
            <button
              type="button"
              onClick={() => runGenerate(false)}
              disabled={!sourceInputValid || isGenerating}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#3CCED7] to-[#A6E661] px-4 py-1.5 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {generateLabel}
            </button>
          </div>
        </section>

        {(isGenerating && cards.length === 0) && (
          <section className="rounded-xl border-[0.5px] border-gray-200 bg-white p-8 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-[#3CCED7]" />
            <p className="mt-2 text-[14px] text-gray-700">
              Generating {count} variations…
            </p>
            <p className="mt-1 text-[11px] text-gray-400">
              This typically takes 5-15 seconds depending on count.
            </p>
          </section>
        )}

        {lastBatchSummary && lastBatchSummary.failed > 0 && (
          <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-[13px] text-yellow-800">
            {lastBatchSummary.succeeded} of {lastBatchSummary.requested}
            {" succeeded. "}
            {lastBatchSummary.failed} failed. Click &ldquo;Generate{" "}
            {count} more&rdquo; to retry.
          </div>
        )}

        {cards.length > 0 && (
          <section className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => (
              <ResultCard
                key={card.key}
                card={card}
                onToggleSelect={() => toggleSelected(card.key)}
                onStartEdit={() => startEdit(card.key)}
                onCancelEdit={() => cancelEdit(card.key)}
                onChangeDraft={(draft) => updateCard(card.key, { draft })}
                onSave={() => saveCard(card.key)}
                onDelete={() => deleteCard(card.key)}
              />
            ))}
          </section>
        )}

        {cards.length > 0 && (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-[0.5px] border-gray-200 bg-white p-5">
            <div className="text-[12px] text-gray-500">
              {cards.length} card{cards.length === 1 ? "" : "s"} ·{" "}
              {cards.filter((c) => c.saved).length} saved ·{" "}
              {selectedUnsavedCards.length} selected
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleClearAll}
                className="rounded-lg px-3 py-1.5 text-[14px] font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => runGenerate(true)}
                disabled={!sourceInputValid || isGenerating}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[14px] font-medium text-gray-700 ring-1 ring-gray-200 transition hover:ring-gray-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGenerating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {moreLabel}
              </button>
              <button
                type="button"
                onClick={handleBulkSave}
                disabled={selectedUnsavedCards.length === 0 || bulkSaving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#3CCED7] to-[#A6E661] px-4 py-1.5 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {bulkSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {bulkSaving
                  ? "Saving…"
                  : `Save selected (${selectedUnsavedCards.length})`}
              </button>
            </div>
          </section>
        )}
      </div>

      <ClearConfirmModal
        open={clearConfirmOpen}
        unsavedCount={unsavedCardCount}
        onCancel={() => setClearConfirmOpen(false)}
        onConfirm={confirmClear}
      />
    </div>
  );
}

interface ResultCardProps {
  card: CardState;
  onToggleSelect: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onChangeDraft: (draft: AdCopyVariationCopy) => void;
  onSave: () => void;
  onDelete: () => void;
}

function ResultCard({
  card,
  onToggleSelect,
  onStartEdit,
  onCancelEdit,
  onChangeDraft,
  onSave,
  onDelete,
}: ResultCardProps) {
  const sourceBadgeLabel = useMemo(() => {
    switch (card.source_mode) {
      case "existing":
        return "Existing";
      case "custom":
        return "Custom";
      case "external_url":
        return "External URL";
    }
  }, [card.source_mode]);

  const display = card.copy;
  const draft = card.draft;

  return (
    <article
      className={
        card.saved
          ? "rounded-xl border-[0.5px] border-emerald-200 bg-emerald-50/30 p-5"
          : "rounded-xl border-[0.5px] border-gray-200 bg-white p-5"
      }
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <input
          type="checkbox"
          aria-label="Select variation for bulk save"
          checked={card.selected}
          disabled={card.saved}
          onChange={onToggleSelect}
          className="h-4 w-4 rounded accent-[#3CCED7] focus:outline-none focus:ring-2 focus:ring-[#3CCED7]/30 disabled:opacity-40"
        />
        <div className="flex items-center gap-1">
          {card.saved && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              Saved
            </span>
          )}
          {!card.editing && (
            <button
              type="button"
              onClick={onStartEdit}
              aria-label="Edit variation"
              title="Edit"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete variation"
            title="Delete"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <CardField
          label="Hook"
          editing={card.editing}
          value={card.editing ? draft.hook : display.hook}
          onChange={(v) => onChangeDraft({ ...draft, hook: v })}
          rows={2}
        />
        <CardField
          label="Headline"
          editing={card.editing}
          value={card.editing ? draft.headline : display.headline}
          onChange={(v) => onChangeDraft({ ...draft, headline: v })}
          rows={2}
        />
        <CardField
          label="Description"
          editing={card.editing}
          value={card.editing ? draft.description : display.description}
          onChange={(v) => onChangeDraft({ ...draft, description: v })}
          rows={3}
        />
        <CtaCardField
          editing={card.editing}
          value={card.editing ? draft.cta : display.cta}
          onChange={(v) => onChangeDraft({ ...draft, cta: v })}
        />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10px] text-gray-400">{sourceBadgeLabel}</span>
        {card.editing && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={card.saving}
              className="rounded-lg px-3 py-1 text-[13px] font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={card.saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#3CCED7] to-[#A6E661] px-3 py-1 text-[13px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {card.saving && <Loader2 className="h-3 w-3 animate-spin" />}
              {card.saving ? "Saving…" : card.saved ? "Update" : "Save"}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

interface CardFieldProps {
  label: string;
  editing: boolean;
  value: string;
  onChange: (next: string) => void;
  rows: number;
}

function CardField({ label, editing, value, onChange, rows }: CardFieldProps) {
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

interface CtaCardFieldProps {
  editing: boolean;
  value: string;
  onChange: (next: string) => void;
}

function CtaCardField({ editing, value, onChange }: CtaCardFieldProps) {
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

interface ClearConfirmModalProps {
  open: boolean;
  unsavedCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}

function ClearConfirmModal({
  open,
  unsavedCount,
  onCancel,
  onConfirm,
}: ClearConfirmModalProps) {
  return (
    <Modal isOpen={open} onClose={onCancel}>
      <div className="w-[min(420px,calc(100vw-2rem))]">
        <div className="relative overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-gray-100">
          <div className="h-[3px] w-full bg-gradient-to-r from-[#3CCED7] to-[#A6E661]" />
          <button
            type="button"
            onClick={onCancel}
            className="absolute right-3 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="px-6 pt-5 pb-4">
            <h2 className="text-[15px] font-semibold text-gray-900">
              Clear all variations?
            </h2>
            <p className="mt-2 text-[14px] text-gray-700">
              {unsavedCount} unsaved variation{unsavedCount === 1 ? "" : "s"} will
              be lost. Saved variations remain in the database.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-6 py-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-3 py-1.5 text-[14px] font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-1.5 text-[14px] font-semibold text-white transition hover:bg-red-700"
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
