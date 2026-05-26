'use client';

import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import {
  Download,
  Eye,
  Loader2,
  Trash2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import type { CommentMediaAttrs, CommentMediaKind } from '@/types/comment';
import CommentMediaPreviewOverlay from '../../media/CommentMediaPreviewOverlay';
import { downloadCommentMediaUrl } from '../../media/commentMediaActions';
import {
  CommentFileTypeIcon,
  getCommentFileBadge,
  isCommentMediaPreviewable,
} from '../../media/commentMediaFileTypes';
import { COMMENT_INLINE_CHIP_WRAPPER_CLASS } from '../../commentUtils';
import {
  COMMENT_INLINE_CHIP_ACTIVE_EVENT,
  announceActiveCommentInlineChip,
  clearCommentInlineChipSelection,
  selectCommentInlineChip,
  type CommentInlineChipActiveEventDetail,
} from './commentInlineChipSelection';

function getAttrs(props: ReactNodeViewProps): CommentMediaAttrs {
  const attrs = props.node.attrs as Partial<CommentMediaAttrs>;
  return {
    attachmentId: attrs.attachmentId ?? '',
    uploadId: attrs.uploadId,
    src: attrs.src ?? null,
    filename: attrs.filename ?? 'Untitled file',
    contentType: attrs.contentType ?? 'application/octet-stream',
    size: Number(attrs.size ?? 0),
    kind: (attrs.kind ?? 'file') as CommentMediaKind,
    status: attrs.status ?? 'uploaded',
  };
}

export default function CommentMediaNodeView(props: ReactNodeViewProps) {
  const chipId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const menuRef = useRef<HTMLSpanElement | null>(null);
  const attrs = getAttrs(props);
  const editable = props.editor.isEditable;
  const uploading = attrs.status === 'uploading';
  const hasUrl = Boolean(attrs.src);
  const previewable = isCommentMediaPreviewable(attrs);

  const updateMenuPosition = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPosition({
      top: rect.bottom + 6,
      left: rect.left,
    });
  }, []);

  const selectChip = useCallback(() => {
    selectCommentInlineChip({
      editor: props.editor,
      getPos: props.getPos,
    });
  }, [props.editor, props.getPos]);

  const clearChipSelection = useCallback(() => {
    clearCommentInlineChipSelection({
      editor: props.editor,
      getPos: props.getPos,
      node: props.node,
    });
  }, [props.editor, props.getPos, props.node]);

  const openMenu = useCallback(() => {
    announceActiveCommentInlineChip(chipId);
    selectChip();
    updateMenuPosition();
    setMenuOpen(true);
  }, [chipId, selectChip, updateMenuPosition]);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    clearChipSelection();
  }, [clearChipSelection]);

  const toggleMenu = useCallback(() => {
    if (menuOpen) {
      closeMenu();
      return;
    }
    openMenu();
  }, [closeMenu, menuOpen, openMenu]);

  useEffect(() => {
    const handleActiveChip = (event: Event) => {
      const detail = (event as CustomEvent<CommentInlineChipActiveEventDetail>).detail;
      if (detail?.id === chipId) return;
      setMenuOpen(false);
      clearChipSelection();
    };

    window.addEventListener(COMMENT_INLINE_CHIP_ACTIVE_EVENT, handleActiveChip);
    return () => window.removeEventListener(COMMENT_INLINE_CHIP_ACTIVE_EVENT, handleActiveChip);
  }, [chipId, clearChipSelection]);

  useEffect(() => {
    if (!menuOpen) return;

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && wrapperRef.current?.contains(target)) return;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      closeMenu();
    };

    document.addEventListener('mousedown', handleMouseDown, true);
    return () => document.removeEventListener('mousedown', handleMouseDown, true);
  }, [closeMenu, menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [menuOpen, updateMenuPosition]);

  const preview = () => {
    if (!attrs.src || !previewable) return;
    closeMenu();
    setPreviewOpen(true);
  };

  const download = () => {
    downloadCommentMediaUrl(attrs.src, attrs.filename);
    closeMenu();
  };

  const deleteMedia = () => {
    const onDeleteAttachment = props.extension.options.onDeleteAttachment;
    if (attrs.attachmentId && typeof onDeleteAttachment === 'function') {
      // The composer only deletes staged IDs; saved comment media is unbound on submit.
      onDeleteAttachment(attrs.attachmentId);
    }
    closeMenu();
    props.deleteNode();
  };

  return (
    <NodeViewWrapper
      as="span"
      data-type="commentMedia"
      data-attachment-id={attrs.attachmentId || undefined}
      data-kind={attrs.kind}
      className={cn(
        COMMENT_INLINE_CHIP_WRAPPER_CLASS,
        'comment-media-node',
        props.selected && 'comment-inline-chip-selected',
        attrs.kind === 'image' && 'comment-media-image',
        attrs.kind === 'video' && 'comment-media-video',
        attrs.kind === 'file' && 'comment-media-file',
      )}
      contentEditable={false}
      style={{ display: 'inline-flex' }}
    >
      <span ref={wrapperRef} className="relative inline-flex max-w-full align-top">
        <span
          role="button"
          tabIndex={0}
          className={cn(
            'm-0 inline-flex max-w-full cursor-pointer appearance-none rounded-md border-0 bg-transparent p-0 text-left outline-none transition',
            menuOpen && 'ring-1 ring-green-500',
          )}
          onClick={(event) => {
            event.stopPropagation();
            toggleMenu();
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            toggleMenu();
          }}
        >
          <MediaBody attrs={attrs} />
        </span>

        {menuOpen && menuPosition
          ? createPortal(
              <span
                ref={menuRef}
                className="fixed z-[9999] min-w-40 rounded-md border border-gray-200 bg-white p-1 text-xs shadow-lg"
                style={{ top: menuPosition.top, left: menuPosition.left }}
              >
                {previewable && (
                  <MediaAction
                    icon={<Eye className="h-3.5 w-3.5" />}
                    label="Preview"
                    disabled={!hasUrl || uploading}
                    onClick={preview}
                  />
                )}
                <MediaAction
                  icon={<Download className="h-3.5 w-3.5" />}
                  label="Download"
                  disabled={!hasUrl || uploading}
                  onClick={download}
                />
                {editable && (
                  <MediaAction
                    danger
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    label="Delete"
                    onClick={deleteMedia}
                  />
                )}
              </span>,
              document.body,
            )
          : null}
      </span>
      {previewOpen && attrs.src
        ? createPortal(
            <CommentMediaPreviewOverlay
              attachmentId={attrs.attachmentId}
              src={attrs.src}
              filename={attrs.filename}
              contentType={attrs.contentType}
              size={attrs.size}
              kind={attrs.kind}
              onClose={() => setPreviewOpen(false)}
              onDownload={() => downloadCommentMediaUrl(attrs.src, attrs.filename)}
            />,
            document.body,
          )
        : null}
    </NodeViewWrapper>
  );
}

function MediaBody({ attrs }: { attrs: CommentMediaAttrs }) {
  if (attrs.status === 'uploading') {
    return (
      <span className="inline-flex h-6 max-w-[360px] items-center gap-1.5 rounded border border-dashed border-gray-300 bg-gray-50 px-1.5 text-xs text-gray-600">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        <span className="min-w-0 truncate font-medium">Uploading {attrs.filename}</span>
      </span>
    );
  }

  if (attrs.kind === 'video' && attrs.src) {
    return (
      <video
        controls
        src={attrs.src}
        className="h-40 w-72 max-w-full rounded-md border border-gray-200 bg-gray-950 object-contain"
      />
    );
  }

  const badge = getCommentFileBadge(attrs);

  return (
    <span className="inline-flex h-6 max-w-[360px] items-center gap-1.5 rounded border border-gray-200 bg-gray-50 px-1.5 text-xs text-gray-700 transition hover:bg-gray-100">
      <CommentFileTypeIcon badge={badge} />
      <span className="min-w-0 truncate font-medium text-gray-700">{attrs.filename}</span>
    </span>
  );
}

function MediaAction({
  icon,
  label,
  danger,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition hover:bg-gray-100 disabled:pointer-events-none disabled:opacity-40',
        danger ? 'text-rose-600 hover:bg-rose-50' : 'text-gray-700',
      )}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
