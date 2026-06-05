export const OVERVIEW_MAIN_SCROLL_MARGIN_TOP = 96;
export const OVERVIEW_PENDING_SECTION_KEY = 'overview-pending-section';

const OVERVIEW_SCROLL_MAX_ATTEMPTS = 20;

/**
 * Scroll the Overview main panel to a section without hijacking window/sidebar scroll.
 */
export function scrollOverviewMainToSection(
  sectionId: string,
  behavior: ScrollBehavior = 'smooth'
): boolean {
  if (typeof document === 'undefined') return false;

  const main = document.querySelector('main.dashboard-scrollbar');
  const target = document.getElementById(sectionId);
  if (!(main instanceof HTMLElement) || !target) return false;

  const mainRect = main.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const nextTop =
    main.scrollTop +
    (targetRect.top - mainRect.top) -
    OVERVIEW_MAIN_SCROLL_MARGIN_TOP;

  main.scrollTo({ top: Math.max(0, nextTop), behavior });
  return true;
}

export function queueOverviewSectionScroll(sectionId: string): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(OVERVIEW_PENDING_SECTION_KEY, sectionId);
}

export function resolveOverviewSectionId(): string | null {
  if (typeof window === 'undefined') return null;
  const hashId = window.location.hash.replace(/^#/, '').trim();
  if (hashId) return hashId;
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(OVERVIEW_PENDING_SECTION_KEY);
}

export function clearOverviewPendingSectionScroll(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(OVERVIEW_PENDING_SECTION_KEY);
}

/**
 * Retry scroll until the section exists (e.g. after client navigation + data load).
 */
export function scrollOverviewMainToSectionWithRetry(
  sectionId: string,
  behavior: ScrollBehavior = 'smooth'
): void {
  if (typeof window === 'undefined') return;

  const attempt = (tryCount: number) => {
    if (scrollOverviewMainToSection(sectionId, behavior)) {
      clearOverviewPendingSectionScroll();
      return;
    }
    if (tryCount >= OVERVIEW_SCROLL_MAX_ATTEMPTS) {
      return;
    }
    window.setTimeout(() => attempt(tryCount + 1), Math.min(50 * (tryCount + 1), 200));
  };

  window.requestAnimationFrame(() => attempt(0));
}
