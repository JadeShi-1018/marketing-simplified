/**
 * The agent Miro deep-link is slug-only.
 *
 * `miro_board_created` events now carry `board_slug`; `agentMiroBoardHref` reads
 * it directly and must never put a board id/UUID in the URL (no fallback).
 */
import { agentMiroBoardHref } from '@/lib/agentMiroBoardHref';

describe('agentMiroBoardHref', () => {
  it('uses the board slug', () => {
    expect(agentMiroBoardHref({ board_slug: 'q2-launch-plan' })).toBe('/miro/q2-launch-plan');
  });

  it('is slug-only — never falls back to a board id/UUID', () => {
    // A board id is present in the payload but must NOT appear in the URL.
    expect(
      agentMiroBoardHref({ board_slug: 'q2-launch-plan', board_id: '3fa85f64-uuid' } as never),
    ).toBe('/miro/q2-launch-plan');
  });
});
