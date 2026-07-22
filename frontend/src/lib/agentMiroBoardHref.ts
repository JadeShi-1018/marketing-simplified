/**
 * Build the in-app URL for a Miro board referenced by an agent SSE event.
 *
 * Slug-only: the agent emits `board_slug` on
 * `miro_board_created` events, and the URL reads it directly. There is
 * deliberately NO UUID fallback — the slug is the sole public identifier
 * end-to-end (database → backend → frontend), so a board id never appears in a
 * URL.
 */
export function agentMiroBoardHref(
  data?: { board_slug?: string | null } | null,
): string {
  return `/miro/${data?.board_slug}`;
}
