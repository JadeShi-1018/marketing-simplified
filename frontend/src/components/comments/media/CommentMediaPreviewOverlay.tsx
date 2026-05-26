'use client';

/* eslint-disable @next/next/no-img-element */
import { Download, Loader2, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { CommentAPI } from '@/lib/api/commentApi';
import type {
  CommentAttachmentPreview,
  CommentAttachmentPreviewPage,
  CommentMediaKind,
} from '@/types/comment';
import { cn } from '@/lib/utils';
import { formatFileSize } from '../commentUtils';
import {
  CommentFileTypeIcon,
  getCommentFileBadge,
  getCommentMediaCategoryLabel,
} from './commentMediaFileTypes';

type CommentMediaPreviewOverlayProps = {
  attachmentId: string;
  src: string;
  filename: string;
  contentType: string;
  size: number;
  kind: CommentMediaKind;
  onClose: () => void;
  onDownload: () => void;
};

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;
const PREVIEW_POLL_INTERVAL_MS = 2000;
const PREVIEW_MAX_POLL_ATTEMPTS = 60;

export default function CommentMediaPreviewOverlay({
  attachmentId,
  src,
  filename,
  contentType,
  size,
  kind,
  onClose,
  onDownload,
}: CommentMediaPreviewOverlayProps) {
  const [scale, setScale] = useState(1);
  const [preview, setPreview] = useState<CommentAttachmentPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const file = { filename, contentType, kind };
  const badge = getCommentFileBadge(file);
  const categoryLabel = getCommentMediaCategoryLabel(file);
  const sizeLabel = formatFileSize(size);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: number | null = null;
    let hasLoadedPreview = false;
    let pollAttempts = 0;

    // Newly uploaded files may still be rendering after the comment is posted,
    // so the overlay follows backend status until a page set or terminal state is available.
    const loadPreview = async () => {
      if (!attachmentId) {
        setPreviewError('Preview metadata is unavailable.');
        setLoadingPreview(false);
        return;
      }

      if (!hasLoadedPreview) setLoadingPreview(true);
      setPreviewError(null);
      try {
        const data = await CommentAPI.getAttachmentPreview(attachmentId);
        if (cancelled) return;
        hasLoadedPreview = true;
        setPreview(data);
        if (data.status === 'pending' || data.status === 'processing') {
          if (pollAttempts >= PREVIEW_MAX_POLL_ATTEMPTS) {
            setPreviewError('Preview is still being generated. Try again later.');
            return;
          }
          pollAttempts += 1;
          pollTimer = window.setTimeout(loadPreview, PREVIEW_POLL_INTERVAL_MS);
        }
      } catch {
        if (cancelled) return;
        setPreviewError('Preview metadata could not be loaded.');
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    };

    loadPreview();

    return () => {
      cancelled = true;
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [attachmentId]);

  const zoomOut = () => setScale((value) => Math.max(MIN_SCALE, value - SCALE_STEP));
  const zoomIn = () => setScale((value) => Math.min(MAX_SCALE, value + SCALE_STEP));

  return (
    <div
      className="fixed inset-0 z-[10000] overflow-auto bg-black/90 text-white"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${filename}`}
      onClick={onClose}
    >
      <div className="fixed left-4 top-4 z-20 flex max-w-[calc(100vw-7rem)] items-start gap-3">
        <CommentFileTypeIcon badge={badge} size="lg" />
        <div className="min-w-0 pt-0.5">
          <div className="truncate text-sm font-semibold leading-5 text-white">{filename}</div>
          <div className="truncate text-xs leading-4 text-white/70">
            {categoryLabel} - {sizeLabel}
          </div>
        </div>
      </div>

      <div className="fixed right-4 top-4 z-20 flex items-center gap-2">
        <PreviewButton label="Download" onClick={onDownload}>
          <Download className="h-4 w-4" />
        </PreviewButton>
        <PreviewButton label="Close" onClick={onClose}>
          <X className="h-4 w-4" />
        </PreviewButton>
      </div>

      <div className="flex min-h-full min-w-full justify-center px-6 py-24 sm:px-16">
        <div
          className={cn(
            'origin-top transition-transform',
            isOriginalImagePreview(preview, kind) &&
              'max-h-[calc(100vh-8rem)] max-w-[calc(100vw-6rem)]',
            !isOriginalImagePreview(preview, kind) && 'w-full max-w-5xl',
          )}
          style={{ transform: `scale(${scale})` }}
          onClick={(event) => event.stopPropagation()}
        >
          <PreviewContent
            src={src}
            filename={filename}
            kind={kind}
            preview={preview}
            loading={loadingPreview}
            requestError={previewError}
          />
        </div>
      </div>

      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-10 h-[98px]"
        style={{ backgroundImage: 'linear-gradient(180deg, #101214, #0e162400)' }}
      />

      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-10 h-[98px]"
        style={{ backgroundImage: 'linear-gradient(0deg, #101214, #0e162400)' }}
      />

      <div
        className="fixed bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/10 px-2 py-1 text-white backdrop-blur"
        onClick={(event) => event.stopPropagation()}
      >
        <PreviewButton label="Zoom out" disabled={scale <= MIN_SCALE} onClick={zoomOut}>
          <ZoomOut className="h-4 w-4" />
        </PreviewButton>
        <span className="min-w-12 text-center text-xs font-medium">
          {Math.round(scale * 100)}%
        </span>
        <PreviewButton label="Zoom in" disabled={scale >= MAX_SCALE} onClick={zoomIn}>
          <ZoomIn className="h-4 w-4" />
        </PreviewButton>
        <PreviewButton label="Reset" disabled={scale === 1} onClick={() => setScale(1)}>
          <RotateCcw className="h-4 w-4" />
        </PreviewButton>
      </div>
    </div>
  );
}

function PreviewContent({
  src,
  filename,
  kind,
  preview,
  loading,
  requestError,
}: {
  src: string;
  filename: string;
  kind: CommentMediaKind;
  preview: CommentAttachmentPreview | null;
  loading: boolean;
  requestError: string | null;
}) {
  if (loading) {
    return (
      <PreviewStatePanel
        icon={<Loader2 className="h-5 w-5 animate-spin" />}
        title="Loading preview"
        detail="Fetching preview metadata."
      />
    );
  }

  if (requestError) {
    return <PreviewStatePanel title="Preview unavailable" detail={requestError} />;
  }

  if (!preview) {
    return <PreviewStatePanel title="Preview unavailable" detail="Preview metadata is unavailable." />;
  }

  if (preview.status === 'ready' && preview.preview_pages.length > 0) {
    return <GeneratedPreviewPages pages={preview.preview_pages} filename={filename} />;
  }

  if (preview.status === 'ready' && isImagePreview(preview, kind)) {
    const imageUrl = preview.original_file_url || src;
    return (
      <img
        src={imageUrl}
        alt={filename}
        className="max-h-[calc(100vh-8rem)] max-w-[calc(100vw-6rem)] object-contain"
      />
    );
  }

  if (preview.status === 'pending' || preview.status === 'processing') {
    return (
      <PreviewStatePanel
        title="Preview is being generated"
        detail="Try again shortly."
      />
    );
  }

  if (preview.status === 'failed') {
    return (
      <PreviewStatePanel
        title="Preview generation failed"
        detail={preview.error_message || 'The preview could not be generated.'}
      />
    );
  }

  if (preview.status === 'unsupported') {
    return <PreviewStatePanel title="Preview unsupported" detail="This file can be downloaded." />;
  }

  return <PreviewStatePanel title="Preview unavailable" detail="No generated preview pages are available." />;
}

function GeneratedPreviewPages({
  pages,
  filename,
}: {
  pages: CommentAttachmentPreviewPage[];
  filename: string;
}) {
  return (
    <div className="mx-auto flex w-full flex-col items-center gap-4 pb-12">
      {pages.map((page) => (
        <img
          key={`${page.page}-${page.image_url}`}
          src={page.image_url}
          alt={`${filename} page ${page.page}`}
          width={page.width}
          height={page.height}
          className="h-auto max-w-full rounded-sm bg-white shadow-2xl"
        />
      ))}
    </div>
  );
}

function PreviewStatePanel({
  icon,
  title,
  detail,
}: {
  icon?: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="mx-auto mt-[18vh] flex min-h-72 max-w-lg flex-col items-center justify-center rounded-md border border-white/15 bg-white/10 px-8 py-10 text-center shadow-2xl backdrop-blur">
      {icon ? <div className="mb-3 text-white">{icon}</div> : null}
      <div className="text-sm font-semibold text-white">{title}</div>
      <div className="mt-2 text-xs leading-5 text-white/70">{detail}</div>
    </div>
  );
}

function isOriginalImagePreview(
  preview: CommentAttachmentPreview | null,
  kind: CommentMediaKind,
): boolean {
  return Boolean(
    preview?.status === 'ready' &&
      preview.preview_pages.length === 0 &&
      isImagePreview(preview, kind),
  );
}

function isImagePreview(preview: CommentAttachmentPreview, kind: CommentMediaKind): boolean {
  return kind === 'image' || preview.kind === 'image' || preview.content_type.startsWith('image/');
}

function PreviewButton({
  label,
  disabled,
  children,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium text-white transition hover:bg-white/15 disabled:pointer-events-none disabled:opacity-40"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}
