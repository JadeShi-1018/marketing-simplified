import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';

export const COMMENT_INLINE_CHIP_ACTIVE_EVENT = 'comment:inline-chip-active';

type NodeViewGetPos = (() => number | undefined) | boolean;

export type CommentInlineChipActiveEventDetail = {
  id: string;
};

export function announceActiveCommentInlineChip(id: string) {
  // Media and smart-link chips share this event so opening one menu clears the other.
  window.dispatchEvent(
    new CustomEvent<CommentInlineChipActiveEventDetail>(COMMENT_INLINE_CHIP_ACTIVE_EVENT, {
      detail: { id },
    }),
  );
}

export function selectCommentInlineChip({
  editor,
  getPos,
}: {
  editor: Editor;
  getPos: NodeViewGetPos;
}) {
  const position = getCommentInlineChipPosition(getPos);
  if (position === null) return;

  const { state, view } = editor;
  view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, position)));
}

export function clearCommentInlineChipSelection({
  editor,
  getPos,
  node,
}: {
  editor: Editor;
  getPos: NodeViewGetPos;
  node: ProseMirrorNode;
}) {
  const position = getCommentInlineChipPosition(getPos);
  if (position === null) return;

  const { state, view } = editor;
  const { selection } = state;
  if (selection.from !== position || selection.to !== position + node.nodeSize) return;

  const nextPosition = Math.min(position + node.nodeSize, state.doc.content.size);
  const nextSelection = TextSelection.near(state.doc.resolve(nextPosition), 1);
  view.dispatch(state.tr.setSelection(nextSelection));
}

function getCommentInlineChipPosition(getPos: NodeViewGetPos) {
  if (typeof getPos !== 'function') return null;
  const position = getPos();
  return typeof position === 'number' ? position : null;
}
