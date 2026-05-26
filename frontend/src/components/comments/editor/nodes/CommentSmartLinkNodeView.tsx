'use client';

import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { ExternalLink, Globe, Pencil, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import type { CommentSmartLinkAttrs } from '@/types/comment';
import { COMMENT_INLINE_CHIP_WRAPPER_CLASS } from '../../commentUtils';
import CommentLinkPopover from '../../link/CommentLinkPopover';
import {
  openCommentLink,
  resolveCommentSmartLink,
} from '../../link/commentLinkUtils';
import {
  COMMENT_INLINE_CHIP_ACTIVE_EVENT,
  announceActiveCommentInlineChip,
  clearCommentInlineChipSelection,
  selectCommentInlineChip,
  type CommentInlineChipActiveEventDetail,
} from './commentInlineChipSelection';

function getAttrs(props: ReactNodeViewProps): CommentSmartLinkAttrs {
  const attrs = props.node.attrs as Partial<CommentSmartLinkAttrs>;
  return {
    url: attrs.url ?? '',
    title: attrs.title ?? attrs.url ?? 'Link',
    description: attrs.description ?? null,
    siteName: attrs.siteName ?? null,
    favicon: attrs.favicon ?? null,
    image: attrs.image ?? null,
    status: attrs.status ?? 'fallback',
  };
}

export default function CommentSmartLinkNodeView(props: ReactNodeViewProps) {
  const chipId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const menuRef = useRef<HTMLSpanElement | null>(null);
  const attrs = getAttrs(props);
  const editable = props.editor.isEditable;

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
    setEditing(false);
  }, [chipId, selectChip, updateMenuPosition]);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setEditing(false);
    clearChipSelection();
  }, [clearChipSelection]);

  const toggleMenu = useCallback(() => {
    if (menuOpen) {
      closeMenu();
      return;
    }
    openMenu();
  }, [closeMenu, menuOpen, openMenu]);

  const replaceWithOrdinaryLink = (url: string) => {
    const position = typeof props.getPos === 'function' ? props.getPos() : null;
    if (typeof position !== 'number') return;

    const { state, view } = props.editor;
    const link = state.schema.marks.link?.create({
      href: url,
      target: '_blank',
      rel: 'noopener noreferrer nofollow',
    });
    const textNode = state.schema.text(url, link ? [link] : undefined);
    view.dispatch(
      state.tr
        .replaceWith(position, position + props.node.nodeSize, textNode)
        .scrollIntoView(),
    );
  };

  useEffect(() => {
    const handleActiveChip = (event: Event) => {
      const detail = (event as CustomEvent<CommentInlineChipActiveEventDetail>).detail;
      if (detail?.id === chipId) return;
      setMenuOpen(false);
      setEditing(false);
      clearChipSelection();
    };

    window.addEventListener(COMMENT_INLINE_CHIP_ACTIVE_EVENT, handleActiveChip);
    return () => window.removeEventListener(COMMENT_INLINE_CHIP_ACTIVE_EVENT, handleActiveChip);
  }, [chipId, clearChipSelection]);

  useEffect(() => {
    if (!menuOpen && !editing) return;

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && wrapperRef.current?.contains(target)) return;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      closeMenu();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      closeMenu();
    };

    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeMenu, editing, menuOpen]);

  useEffect(() => {
    if (!menuOpen && !editing) return;

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [editing, menuOpen, updateMenuPosition]);

  const editLink = async (url: string) => {
    setLoading(true);
    try {
      const preview = await resolveCommentSmartLink(url);
      if (preview) {
        props.updateAttributes(preview);
        closeMenu();
      } else {
        closeMenu();
        replaceWithOrdinaryLink(url);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <NodeViewWrapper
      as="span"
      data-type="smartLink"
      data-url={attrs.url}
      className={cn(
        COMMENT_INLINE_CHIP_WRAPPER_CLASS,
        'comment-smart-link',
        props.selected && 'comment-inline-chip-selected',
      )}
      contentEditable={false}
    >
      <span ref={wrapperRef} className="relative inline-flex max-w-full">
        <span
          role="button"
          tabIndex={0}
          className={cn(
            'inline-flex h-6 max-w-[360px] cursor-pointer items-center gap-1.5 rounded border border-gray-200 bg-white px-1.5 text-xs text-gray-700 outline-none transition hover:bg-gray-50',
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
          {attrs.favicon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={attrs.favicon} alt="" className="h-4 w-4 shrink-0 rounded-sm" />
          ) : (
            <Globe className="h-3.5 w-3.5 shrink-0 text-gray-500" />
          )}
          <span className="min-w-0 truncate font-medium">{attrs.title || attrs.url}</span>
        </span>

        {menuOpen && menuPosition
          ? createPortal(
              <span
                ref={menuRef}
                className="fixed z-[9999] min-w-48 rounded-md border border-gray-200 bg-white p-1 text-xs shadow-lg"
                style={{ top: menuPosition.top, left: menuPosition.left }}
              >
            <MenuAction
              icon={<ExternalLink className="h-3.5 w-3.5" />}
              label="Open link in a new tab"
              onClick={() => {
                openCommentLink(attrs.url);
                closeMenu();
              }}
            />
            {editable ? (
              <MenuAction
                icon={<Pencil className="h-3.5 w-3.5" />}
                label="Edit"
                onClick={() => {
                  setEditing(true);
                  setMenuOpen(false);
                }}
              />
            ) : null}
            {editable ? (
              <MenuAction
                danger
                icon={<Trash2 className="h-3.5 w-3.5" />}
                label="Delete"
                onClick={() => {
                  closeMenu();
                  props.deleteNode();
                }}
              />
            ) : null}
              </span>,
              document.body,
            )
          : null}

        {editing && menuPosition
          ? createPortal(
              <span
                ref={menuRef}
                className="fixed z-[9999] rounded-md border border-gray-200 bg-white p-3 shadow-lg"
                style={{ top: menuPosition.top, left: menuPosition.left }}
              >
            <CommentLinkPopover
              initialUrl={attrs.url}
              loading={loading}
              submitLabel="Save"
              onSubmit={(url) => void editLink(url)}
              onCancel={closeMenu}
            />
              </span>,
              document.body,
            )
          : null}
      </span>
    </NodeViewWrapper>
  );
}

function MenuAction({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition hover:bg-gray-100',
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
