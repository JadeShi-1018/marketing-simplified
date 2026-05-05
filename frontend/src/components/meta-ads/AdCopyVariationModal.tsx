"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Loader2, X } from "lucide-react";

import Modal from "@/components/ui/Modal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  generateVariation,
  listVariations,
  saveVariation,
} from "@/lib/api/adCopyVariationApi";
import type {
  AdCopyVariation,
  AdCopyVariationCopy,
  AdCopyVariationSourceMode,
} from "@/types/adCopyVariation";

export interface AdCopyVariationModalCreative {
  id: number;
  title: string;
  body: string;
  call_to_action_type: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  selectedCreatives: AdCopyVariationModalCreative[];
}

const EMPTY_COPY: AdCopyVariationCopy = {
  hook: "",
  headline: "",
  description: "",
  cta: "",
};

const EXTERNAL_URL_TOOLTIP =
  "Pending Gemini grounding probe — see prompt_04";

const TEXTAREA_BASE =
  "mt-2 w-full resize-none bg-transparent text-[14px] text-gray-700 placeholder:text-gray-400 outline-none border-0 leading-5 py-1 focus:ring-0";

const TAB_TRIGGER_BASE =
  "px-1 pb-2 rounded-none bg-transparent text-[14px] font-medium text-gray-700 border-b-2 border-transparent shadow-none transition hover:text-gray-900 focus-visible:outline-none data-[state=active]:bg-transparent data-[state=active]:text-gray-900 data-[state=active]:border-[#3CCED7] data-[state=active]:shadow-none data-[disabled]:text-gray-300 data-[disabled]:cursor-not-allowed disabled:opacity-100";

const SECTION_LABEL =
  "text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2";

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

export default function AdCopyVariationModal({
  open,
  onClose,
  selectedCreatives,
}: Props) {
  const initialMode: AdCopyVariationSourceMode =
    selectedCreatives.length === 1 ? "existing" : "custom";
  const [mode, setMode] = useState<AdCopyVariationSourceMode>(initialMode);
  const [instruction, setInstruction] = useState<string>("");
  const [customBase, setCustomBase] = useState<AdCopyVariationCopy>(EMPTY_COPY);
  const [result, setResult] = useState<AdCopyVariationCopy | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [recentVariations, setRecentVariations] = useState<AdCopyVariation[]>([]);
  const [recentTotal, setRecentTotal] = useState<number>(0);

  const firstFieldRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode(selectedCreatives.length === 1 ? "existing" : "custom");
    setInstruction("");
    setCustomBase(EMPTY_COPY);
    setResult(null);
    setIsGenerating(false);
    setIsSaving(false);
    const frame = requestAnimationFrame(() => firstFieldRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, selectedCreatives.length]);

  const sourceCreative =
    selectedCreatives.length === 1 ? selectedCreatives[0] : null;

  useEffect(() => {
    if (!open || mode !== "existing" || !sourceCreative) {
      setRecentVariations([]);
      setRecentTotal(0);
      return;
    }
    let active = true;
    listVariations(sourceCreative.id, { limit: 3 })
      .then((res) => {
        if (!active) return;
        setRecentVariations(res.results);
        setRecentTotal(res.total);
      })
      .catch((err) => {
        if (!active) return;
        setRecentVariations([]);
        setRecentTotal(0);
        // Secondary surface; do not toast — log only so primary generate UX stays clean.
        console.warn("listVariations failed", err);
      });
    return () => {
      active = false;
    };
  }, [open, mode, sourceCreative?.id]);
  const sourceHook = sourceCreative
    ? (sourceCreative.body || "").split("\n", 1)[0]
    : "";

  const handleGenerateExisting = async () => {
    if (!sourceCreative) return;
    setIsGenerating(true);
    try {
      const copy = await generateVariation({
        source_mode: "existing",
        creative_id: sourceCreative.id,
        instruction,
      });
      setResult(copy);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Failed to generate variation."));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateCustom = async () => {
    setIsGenerating(true);
    try {
      const copy = await generateVariation({
        source_mode: "custom",
        base_copy: customBase,
        instruction,
      });
      setResult(copy);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Failed to generate variation."));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    setIsSaving(true);
    try {
      await saveVariation({
        source_mode: mode,
        creative:
          mode === "existing" && sourceCreative ? sourceCreative.id : null,
        hook: result.hook,
        headline: result.headline,
        description: result.description,
        cta: result.cta,
        instruction,
      });
      toast.success("Variation saved");
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Failed to save variation."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    setResult(null);
  };

  const handleGenerate = () => {
    if (mode === "existing") {
      void handleGenerateExisting();
    } else if (mode === "custom") {
      void handleGenerateCustom();
    }
  };

  const generateDisabled =
    isGenerating ||
    mode === "external_url" ||
    (mode === "existing" && !sourceCreative);

  return (
    <Modal isOpen={open} onClose={onClose} disableBackdropClose>
      <div className="w-[min(640px,calc(100vw-2rem))]">
        <div className="relative rounded-xl bg-white shadow-2xl ring-1 ring-gray-100 overflow-hidden">
          <div className="h-[3px] w-full bg-gradient-to-r from-[#3CCED7] to-[#A6E661]" />

          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating || isSaving}
            className="absolute right-3 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="px-6 pt-5 pb-1">
            <h2 className="text-[15px] font-semibold text-gray-900">
              Generate ad copy variation
            </h2>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Use an existing creative as template, paste your own copy, or
              (coming soon) extract from a public Meta ad URL.
            </p>
          </div>

          <Tabs
            value={mode}
            onValueChange={(value) =>
              setMode(value as AdCopyVariationSourceMode)
            }
          >
            <TabsList className="h-auto w-full justify-start gap-4 rounded-none bg-transparent p-0 px-6 pt-3 border-b border-gray-200">
              <TabsTrigger value="existing" className={TAB_TRIGGER_BASE}>
                Existing creative
              </TabsTrigger>
              <TabsTrigger value="custom" className={TAB_TRIGGER_BASE}>
                Custom content
              </TabsTrigger>
              <TabsTrigger
                value="external_url"
                disabled
                title={EXTERNAL_URL_TOOLTIP}
                aria-disabled="true"
                className={TAB_TRIGGER_BASE}
              >
                External URL
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="existing"
              className="px-6 pt-4 pb-5 space-y-5 mt-0"
            >
              {sourceCreative && (
                <div>
                  <div className={SECTION_LABEL}>Recent variations</div>
                  {recentVariations.length === 0 ? (
                    <p className="text-[12px] text-gray-500">
                      No variations saved for this creative yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {recentVariations.map((rv) => {
                        const hookText = (rv.hook || "").trim() || "(no hook)";
                        const truncated =
                          hookText.length > 60
                            ? `${hookText.slice(0, 60)}…`
                            : hookText;
                        return (
                          <li
                            key={rv.id}
                            className="flex items-start justify-between gap-3 py-2 hover:bg-gray-50 transition-colors px-2 -mx-2 rounded-md"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-[14px] text-gray-700 truncate">
                                {truncated}
                              </div>
                              <div className="mt-0.5 text-[11px] text-gray-400">
                                {relativeTime(rv.created_at)}
                              </div>
                            </div>
                            <Link
                              href={`/meta-ads/creatives/${sourceCreative.id}/variations`}
                              className="shrink-0 text-[12px] text-[#3CCED7] hover:underline"
                            >
                              Edit
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {recentTotal > 3 && (
                    <Link
                      href={`/meta-ads/creatives/${sourceCreative.id}/variations`}
                      className="mt-2 inline-block text-[12px] text-gray-500 hover:text-gray-900"
                    >
                      View all ({recentTotal}) →
                    </Link>
                  )}
                </div>
              )}
              {sourceCreative ? (
                <div>
                  <div className={SECTION_LABEL}>Source preview</div>
                  <dl className="space-y-1.5 text-[14px] leading-5">
                    <div className="grid grid-cols-[88px_1fr] gap-2">
                      <dt className="text-gray-500">Hook</dt>
                      <dd className="text-gray-900">{sourceHook || "—"}</dd>
                    </div>
                    <div className="grid grid-cols-[88px_1fr] gap-2">
                      <dt className="text-gray-500">Headline</dt>
                      <dd className="text-gray-900">
                        {sourceCreative.title || "—"}
                      </dd>
                    </div>
                    <div className="grid grid-cols-[88px_1fr] gap-2">
                      <dt className="text-gray-500">Description</dt>
                      <dd className="whitespace-pre-wrap text-gray-900">
                        {sourceCreative.body || "—"}
                      </dd>
                    </div>
                    <div className="grid grid-cols-[88px_1fr] gap-2">
                      <dt className="text-gray-500">CTA</dt>
                      <dd className="text-gray-900">
                        {sourceCreative.call_to_action_type || "—"}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                  Select exactly 1 creative on the Creatives tab to use this
                  mode.
                </div>
              )}
              <div>
                <div className={SECTION_LABEL}>
                  Instruction
                  <span className="ml-1.5 text-gray-300 normal-case tracking-normal font-normal">
                    optional
                  </span>
                </div>
                <textarea
                  ref={mode === "existing" ? firstFieldRef : undefined}
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="Focus the rewrite, e.g. 'rewrite only the Hook'"
                  rows={3}
                  className={TEXTAREA_BASE}
                />
              </div>
            </TabsContent>

            <TabsContent
              value="custom"
              className="px-6 pt-4 pb-5 space-y-5 mt-0"
            >
              <div>
                <div className={SECTION_LABEL}>Custom base copy</div>
                <div className="space-y-3">
                  <div className="grid grid-cols-[88px_1fr] items-start gap-2">
                    <span className="pt-1 text-[14px] text-gray-500">
                      Hook
                    </span>
                    <textarea
                      ref={mode === "custom" ? firstFieldRef : undefined}
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
                    <span className="pt-1 text-[14px] text-gray-500">
                      Headline
                    </span>
                    <textarea
                      value={customBase.headline}
                      onChange={(e) =>
                        setCustomBase({
                          ...customBase,
                          headline: e.target.value,
                        })
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
                        setCustomBase({
                          ...customBase,
                          description: e.target.value,
                        })
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
              </div>
              <div>
                <div className={SECTION_LABEL}>
                  Instruction
                  <span className="ml-1.5 text-gray-300 normal-case tracking-normal font-normal">
                    optional
                  </span>
                </div>
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="Focus the rewrite, e.g. 'make it punchier'"
                  rows={3}
                  className={TEXTAREA_BASE}
                />
              </div>
            </TabsContent>

            <TabsContent
              value="external_url"
              className="px-6 pt-4 pb-5 mt-0"
            >
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] text-gray-600">
                External URL mode is disabled until the Gemini URL grounding
                probe completes.
              </div>
            </TabsContent>
          </Tabs>

          {result && (
            <div className="px-6 pt-2 pb-5 space-y-5 border-t border-gray-100">
              <div>
                <div className={SECTION_LABEL}>
                  Generated copy
                  <span className="ml-1.5 text-gray-300 normal-case tracking-normal font-normal">
                    review before saving
                  </span>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-[88px_1fr] items-start gap-2">
                    <span className="pt-1 text-[14px] text-gray-500">
                      Hook
                    </span>
                    <textarea
                      value={result.hook}
                      onChange={(e) =>
                        setResult({ ...result, hook: e.target.value })
                      }
                      rows={2}
                      className={TEXTAREA_BASE}
                    />
                  </div>
                  <div className="grid grid-cols-[88px_1fr] items-start gap-2">
                    <span className="pt-1 text-[14px] text-gray-500">
                      Headline
                    </span>
                    <textarea
                      value={result.headline}
                      onChange={(e) =>
                        setResult({ ...result, headline: e.target.value })
                      }
                      rows={2}
                      className={TEXTAREA_BASE}
                    />
                  </div>
                  <div className="grid grid-cols-[88px_1fr] items-start gap-2">
                    <span className="pt-1 text-[14px] text-gray-500">
                      Description
                    </span>
                    <textarea
                      value={result.description}
                      onChange={(e) =>
                        setResult({ ...result, description: e.target.value })
                      }
                      rows={4}
                      className={TEXTAREA_BASE}
                    />
                  </div>
                  <div className="grid grid-cols-[88px_1fr] items-start gap-2">
                    <span className="pt-1 text-[14px] text-gray-500">CTA</span>
                    <textarea
                      value={result.cta}
                      onChange={(e) =>
                        setResult({ ...result, cta: e.target.value })
                      }
                      rows={1}
                      className={TEXTAREA_BASE}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="px-6 py-3 bg-gray-50 flex justify-end items-center gap-2 border-t border-gray-100">
            {result ? (
              <>
                <button
                  type="button"
                  onClick={handleDiscard}
                  disabled={isSaving}
                  className="px-3 py-1.5 rounded-lg text-[14px] font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition disabled:opacity-60"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[14px] font-semibold text-white bg-gradient-to-br from-[#3CCED7] to-[#A6E661] hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition shadow-sm"
                >
                  {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {isSaving ? "Saving…" : "Save"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isGenerating}
                  className="px-3 py-1.5 rounded-lg text-[14px] font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generateDisabled}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[14px] font-semibold text-white bg-gradient-to-br from-[#3CCED7] to-[#A6E661] hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition shadow-sm"
                >
                  {isGenerating && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  {isGenerating ? "Generating…" : "Generate"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
