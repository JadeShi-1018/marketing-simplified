/** YYYY-MM-DD from API / HTML date inputs compare correctly as strings. */
export const START_MUST_BE_ON_OR_BEFORE_DUE =
  'Start date must be on or before due date.';

export function violatesStartBeforeDue(
  start: string | null | undefined,
  due: string | null | undefined,
): boolean {
  const s = start && String(start).trim() ? String(start).trim().slice(0, 10) : null;
  const d = due && String(due).trim() ? String(due).trim().slice(0, 10) : null;
  if (!s || !d) return false;
  return s > d;
}
