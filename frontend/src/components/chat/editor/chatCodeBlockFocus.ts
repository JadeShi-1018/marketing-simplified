export type ChatCodeBlockFocusPlacement = 'start' | 'end';

export type ChatCodeBlockFocusDetail = {
  pos?: number;
  placement?: ChatCodeBlockFocusPlacement;
};

export type ChatCodeBlockActiveDetail = {
  active: boolean;
  pos?: number;
};

export const CHAT_CODE_BLOCK_FOCUS_EVENT = 'chat-code-block:focus';
export const CHAT_CODE_BLOCK_ACTIVE_EVENT = 'chat-code-block:active';

type ScrollSnapshot = {
  element: Window | HTMLElement;
  left: number;
  top: number;
};

function getScrollSnapshots(anchor: HTMLElement): ScrollSnapshot[] {
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

export function dispatchChatCodeBlockFocus(detail: ChatCodeBlockFocusDetail) {
  window.dispatchEvent(
    new CustomEvent<ChatCodeBlockFocusDetail>(CHAT_CODE_BLOCK_FOCUS_EVENT, { detail }),
  );
}

export function dispatchChatCodeBlockActive(detail: ChatCodeBlockActiveDetail) {
  window.dispatchEvent(
    new CustomEvent<ChatCodeBlockActiveDetail>(CHAT_CODE_BLOCK_ACTIVE_EVENT, { detail }),
  );
}
