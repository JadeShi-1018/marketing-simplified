/**
 * Query param used to remember where the user came from before opening the notification center.
 */
export const NOTIFICATIONS_FROM_PARAM = "from";

export function isNotificationsAreaPath(pathname: string): boolean {
  return pathname === "/notifications" || pathname.startsWith("/notifications/");
}

/**
 * Build the value stored in `from` from the current location (pathname + optional search).
 * Avoids pointing "back" at the notifications UI itself.
 */
export function buildFromReturnValue(pathname: string, search: string): string {
  const path = pathname || "/";
  const qs =
    search && search !== "?"
      ? search.startsWith("?")
        ? search
        : `?${search}`
      : "";
  const full = `${path}${qs}`;
  if (isNotificationsAreaPath(path)) {
    return "/";
  }
  return full || "/";
}

/**
 * Decode and validate `from` for safe same-origin navigation (open-redirect hardening).
 */
export function getSafeInternalReturnPath(raw: string | null | undefined): string | null {
  if (raw == null || raw === "") return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw.trim());
  } catch {
    return null;
  }
  if (!decoded.startsWith("/")) return null;
  if (decoded.startsWith("//")) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded)) return null;
  return decoded;
}

export function buildNotificationsListHref(fromPathname: string, search: string = ""): string {
  const from = buildFromReturnValue(fromPathname, search);
  const q = new URLSearchParams();
  q.set(NOTIFICATIONS_FROM_PARAM, from);
  return `/notifications?${q.toString()}`;
}

export function buildNotificationsPreferencesHref(fromPathname: string, search: string = ""): string {
  const from = buildFromReturnValue(fromPathname, search);
  const q = new URLSearchParams();
  q.set(NOTIFICATIONS_FROM_PARAM, from);
  return `/notifications/preferences?${q.toString()}`;
}

/** Append or preserve `from` when linking notifications list → preferences. */
export function buildPreferencesHrefFromNotificationsSearch(fromParam: string | null): string {
  if (fromParam) {
    const q = new URLSearchParams();
    q.set(NOTIFICATIONS_FROM_PARAM, fromParam);
    return `/notifications/preferences?${q.toString()}`;
  }
  return "/notifications/preferences";
}

/** Preferences → notifications list while keeping the original return target in `from`. */
export function buildNotificationsListHrefPreservingFrom(fromParam: string | null): string {
  if (!fromParam) {
    return "/notifications";
  }
  const q = new URLSearchParams();
  q.set(NOTIFICATIONS_FROM_PARAM, fromParam);
  return `/notifications?${q.toString()}`;
}
