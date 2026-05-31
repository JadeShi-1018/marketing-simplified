export type CommentCodeBlockFocusPlacement = 'start' | 'end';

export type CommentCodeBlockFocusDetail = {
  pos?: number;
  placement?: CommentCodeBlockFocusPlacement;
};

export type CommentCodeBlockActiveDetail = {
  active: boolean;
  pos?: number;
};

export const COMMENT_CODE_BLOCK_FOCUS_EVENT = 'comment-code-block:focus';
export const COMMENT_CODE_BLOCK_ACTIVE_EVENT = 'comment-code-block:active';

type ScrollSnapshot = {
  element: Window | HTMLElement;
  left: number;
  top: number;
};

function getScrollSnapshots(anchor: HTMLElement): ScrollSnapshot[] {
  // Preserve nested scroll containers when focus changes inside CodeMirror.
  const snapshots: ScrollSnapshot[] = [
    { element: window, left: window.scrollX, top: window.scrollY },
  ];

  let current = anchor.parentElement;
  while (current) {
    const canScroll =
      current.scrollHeight > current.clientHeight || current.scrollWidth > current.clientWidth;
    if (canScroll) {
      snapshots.push({ element: current, left: current.scrollLeft, top: current.scrollTop });
    }
    current = current.parentElement;
  }

  return snapshots;
}

function restoreScroll(snapshots: ScrollSnapshot[]) {
  snapshots.forEach((snapshot) => {
    const { element } = snapshot;
    if (element instanceof Window) {
      window.scrollTo(snapshot.left, snapshot.top);
    } else {
      element.scrollLeft = snapshot.left;
      element.scrollTop = snapshot.top;
    }
  });
}

export function withPreservedScroll<T>(anchor: HTMLElement, action: () => T): T {
  const snapshots = getScrollSnapshots(anchor);
  const result = action();
  // ProseMirror/CodeMirror focus can trigger scroll in later frames, so restore
  // nested containers immediately and after layout settles.
  restoreScroll(snapshots);
  window.requestAnimationFrame(() => {
    restoreScroll(snapshots);
    window.requestAnimationFrame(() => restoreScroll(snapshots));
  });
  return result;
}

export function focusElementPreventScroll(element: HTMLElement) {
  withPreservedScroll(element, () => {
    element.focus({ preventScroll: true });
  });
}

export function dispatchCommentCodeBlockFocus(detail: CommentCodeBlockFocusDetail) {
  window.dispatchEvent(
    new CustomEvent<CommentCodeBlockFocusDetail>(COMMENT_CODE_BLOCK_FOCUS_EVENT, { detail }),
  );
}

export function dispatchCommentCodeBlockActive(detail: CommentCodeBlockActiveDetail) {
  window.dispatchEvent(
    new CustomEvent<CommentCodeBlockActiveDetail>(COMMENT_CODE_BLOCK_ACTIVE_EVENT, {
      detail,
    }),
  );
}
