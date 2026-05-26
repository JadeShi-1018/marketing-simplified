'use client';

import { getMarkRange } from '@tiptap/core';
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';
import { ExternalLink, Pencil, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { isCommentInlineChipNodeType } from '../commentUtils';
import CommentLinkPopover from './CommentLinkPopover';
import {
  isCommentLinkTextUrlLike,
  openCommentLink,
  normalizeCommentLinkUrl,
  resolveCommentSmartLink,
} from './commentLinkUtils';

const SELECTED_LINK_CLASS = 'comment-link-selected';

function nodeEndsWithWhitespace(node: { isText?: boolean; text?: string | null } | null) {
  return Boolean(node?.isText && /\s$/.test(node.text ?? ''));
}

function nodeStartsWithWhitespace(node: { isText?: boolean; text?: string | null } | null) {
  return Boolean(node?.isText && /^\s/.test(node.text ?? ''));
}

function shouldInsertLeadingInlineChipSpace(editor: Editor, from: number) {
  const nodeBefore = editor.state.doc.resolve(from).nodeBefore;
  if (!nodeBefore) return false;
  if (nodeBefore.isText) return !nodeEndsWithWhitespace(nodeBefore);
  return isCommentInlineChipNodeType(nodeBefore.type.name);
}

function shouldInsertTrailingInlineChipSpace(editor: Editor, to: number) {
  const nodeAfter = editor.state.doc.resolve(to).nodeAfter;
  if (!nodeAfter) return true;
  if (nodeAfter.isText) return !nodeStartsWithWhitespace(nodeAfter);
  return isCommentInlineChipNodeType(nodeAfter.type.name);
}

type LinkRange = {
  from: number;
  to: number;
};

type LinkMenuState = {
  href: string;
  top: number;
  left: number;
  range: LinkRange | null;
};

export default function CommentLinkInteractionLayer({ editor }: { editor: Editor | null }) {
  const [menu, setMenu] = useState<LinkMenuState | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const selectedAnchorRef = useRef<HTMLAnchorElement | null>(null);
  const editable = Boolean(editor?.isEditable);

  const clearSelection = useCallback(() => {
    selectedAnchorRef.current?.classList.remove(SELECTED_LINK_CLASS);
    selectedAnchorRef.current = null;
    setMenu(null);
    setEditing(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!editor) return;
    const root = editor.view.dom;

    const getAnchorFromEvent = (event: MouseEvent) => {
      const target = event.target;
      const element =
        target instanceof Element
          ? target
          : target instanceof Node
            ? target.parentElement
            : null;
      const anchor = element?.closest('a[href]');
      if (!anchor || !root.contains(anchor) || !(anchor instanceof HTMLAnchorElement)) {
        return null;
      }
      return anchor;
    };

    const getLinkRange = (anchor: HTMLAnchorElement): LinkRange | null => {
      const linkType = editor.state.schema.marks.link;
      if (!linkType) return null;
      const href = anchor.getAttribute('href');
      if (!href) return null;

      const candidateNodes = [anchor.firstChild, anchor].filter(Boolean) as Node[];
      const positions = candidateNodes.flatMap((node) => {
        try {
          const basePosition = editor.view.posAtDOM(node, 0);
          return [basePosition, basePosition + 1];
        } catch {
          return [];
        }
      });

      for (const position of positions) {
        if (position < 0 || position > editor.state.doc.content.size) continue;
        const range = getMarkRange(
          editor.state.doc.resolve(position),
          linkType,
          { href },
        );
        if (range) return range;
      }

      return null;
    };

    const preventAnchorActivation = (event: MouseEvent) => {
      const anchor = getAnchorFromEvent(event);
      if (!anchor) return null;

      // Native anchor activation can bypass React/ProseMirror, so comments own
      // link clicks and expose navigation only through the action menu.
      event.preventDefault();
      event.stopPropagation();
      return anchor;
    };

    const handleAnchorMouseDown = (event: MouseEvent) => {
      preventAnchorActivation(event);
    };

    const handleAuxClick = (event: MouseEvent) => {
      preventAnchorActivation(event);
    };

    const handleClick = (event: MouseEvent) => {
      const anchor = preventAnchorActivation(event);
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href) return;

      selectedAnchorRef.current?.classList.remove(SELECTED_LINK_CLASS);
      selectedAnchorRef.current = anchor;
      anchor.classList.add(SELECTED_LINK_CLASS);

      const rect = anchor.getBoundingClientRect();
      setMenu({
        href,
        top: rect.bottom + 6,
        left: rect.left,
        range: getLinkRange(anchor),
      });
      setEditing(false);
    };

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-comment-link-menu="true"]')) return;
      if (target.closest('a[href]')) return;
      clearSelection();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      clearSelection();
    };

    root.addEventListener('mousedown', handleAnchorMouseDown, true);
    root.addEventListener('click', handleClick, true);
    root.addEventListener('auxclick', handleAuxClick, true);
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      selectedAnchorRef.current?.classList.remove(SELECTED_LINK_CLASS);
      root.removeEventListener('mousedown', handleAnchorMouseDown, true);
      root.removeEventListener('click', handleClick, true);
      root.removeEventListener('auxclick', handleAuxClick, true);
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [clearSelection, editor]);

  if (!editor || !menu) return null;

  const updateLink = async (url: string) => {
    const normalized = normalizeCommentLinkUrl(url);
    if (!normalized) return;

    setLoading(true);
    try {
      const smartLinkAttrs = await resolveCommentSmartLink(normalized);
      const smartLinkType = editor.state.schema.nodes.smartLink;

      if (menu.range && smartLinkAttrs && smartLinkType) {
        // A resolved preview changes the inline mark into an atomic smartLink node.
        const replacement: ProseMirrorNode[] = [];
        if (shouldInsertLeadingInlineChipSpace(editor, menu.range.from)) {
          replacement.push(editor.state.schema.text(' '));
        }
        replacement.push(smartLinkType.create(smartLinkAttrs));
        if (shouldInsertTrailingInlineChipSpace(editor, menu.range.to)) {
          replacement.push(editor.state.schema.text(' '));
        }

        editor.view.dispatch(
          editor.state.tr
            .replaceWith(
              menu.range.from,
              menu.range.to,
              Fragment.fromArray(replacement),
            )
            .scrollIntoView(),
        );
        clearSelection();
        return;
      }

      const linkType = editor.state.schema.marks.link;
      if (!linkType) {
        clearSelection();
        return;
      }

      if (!menu.range) {
        editor
          .chain()
          .focus()
          .extendMarkRange('link')
          .setLink({
            href: normalized,
            target: '_blank',
            rel: 'noopener noreferrer nofollow',
          })
          .run();
        clearSelection();
        return;
      }

      const currentText = editor.state.doc.textBetween(
        menu.range.from,
        menu.range.to,
        '',
        '',
      );
      const currentTextUrl = normalizeCommentLinkUrl(currentText);
      const currentHrefUrl = normalizeCommentLinkUrl(menu.href);
      const shouldReplaceText =
        isCommentLinkTextUrlLike(currentText) ||
        (Boolean(currentTextUrl) && currentTextUrl === currentHrefUrl);
      const nextMark = linkType.create({
        href: normalized,
        target: '_blank',
        rel: 'noopener noreferrer nofollow',
      });

      // URL labels represent the destination, so editing the href should keep
      // the visible URL in sync. Custom labels keep their text and only retarget.
      if (shouldReplaceText) {
        editor.view.dispatch(
          editor.state.tr
            .replaceWith(
              menu.range.from,
              menu.range.to,
              editor.state.schema.text(normalized, [nextMark]),
            )
            .scrollIntoView(),
        );
      } else {
        editor.view.dispatch(
          editor.state.tr
            .removeMark(menu.range.from, menu.range.to, linkType)
            .addMark(menu.range.from, menu.range.to, nextMark)
          .scrollIntoView(),
        );
      }
      clearSelection();
    } finally {
      setLoading(false);
    }
  };

  const deleteLink = () => {
    const linkType = editor.state.schema.marks.link;
    if (menu.range && linkType) {
      const currentText = editor.state.doc.textBetween(
        menu.range.from,
        menu.range.to,
        '',
        '',
      );
      const currentTextUrl = normalizeCommentLinkUrl(currentText);
      const currentHrefUrl = normalizeCommentLinkUrl(menu.href);
      const isFallbackUrlText =
        isCommentLinkTextUrlLike(currentText) ||
        (Boolean(currentTextUrl) && currentTextUrl === currentHrefUrl);

      // Fallback URL links are just the destination rendered as text, so Delete
      // removes that text. Custom labels keep their content and lose only mark.
      if (isFallbackUrlText) {
        editor.view.dispatch(
          editor.state.tr.delete(menu.range.from, menu.range.to).scrollIntoView(),
        );
      } else {
        editor.view.dispatch(
          editor.state.tr
            .removeMark(menu.range.from, menu.range.to, linkType)
            .scrollIntoView(),
        );
      }
    } else {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    }

    clearSelection();
  };

  return (
    <div
      data-comment-link-menu="true"
      className="fixed z-[9999]"
      style={{ top: menu.top, left: menu.left }}
    >
      {editing ? (
        <div className="rounded-md border border-gray-200 bg-white p-3 shadow-lg">
          <CommentLinkPopover
            initialUrl={menu.href}
            loading={loading}
            submitLabel="Save"
            onSubmit={(url) => void updateLink(url)}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <div className="min-w-52 rounded-md border border-gray-200 bg-white p-1 text-xs shadow-lg">
          {editable ? (
            <MenuAction
              icon={<Pencil className="h-3.5 w-3.5" />}
              label="Edit"
              onClick={() => setEditing(true)}
            />
          ) : null}
          <MenuAction
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            label="Open link in a new tab"
            onClick={() => openCommentLink(menu.href)}
          />
          {editable ? (
            <MenuAction
              danger
              icon={<Trash2 className="h-3.5 w-3.5" />}
              label="Delete"
              onClick={deleteLink}
            />
          ) : null}
        </div>
      )}
    </div>
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
