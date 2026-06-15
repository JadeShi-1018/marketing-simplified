/**
 * Meeting artifact links (SMP-484 #4) — canonical types and navigation targets.
 */

export type MeetingArtifactResourceIndex = {
  decisions: { id: number; slug?: string | null; title?: string | null; status?: string; projectSeq?: number | null }[];
  tasks: { id?: number; slug?: string | null; summary?: string; status?: string }[];
  spreadsheets: { id: number; slug?: string | null; name?: string }[];
};

export const MEETING_ARTIFACT_KINDS = ['decision', 'task', 'spreadsheet'] as const;
export type MeetingArtifactKind = (typeof MEETING_ARTIFACT_KINDS)[number];

export function normalizeMeetingArtifactType(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isKnownMeetingArtifactKind(t: string): t is MeetingArtifactKind {
  return (MEETING_ARTIFACT_KINDS as readonly string[]).includes(normalizeMeetingArtifactType(t));
}

/**
 * In-app href for supported artifact types; unknown types return null (non-breaking).
 * Resource URLs are slug-only, so the target's slug is resolved from the loaded
 * resource index. Returns null when the slug is not yet available (avoids emitting
 * a numeric URL that the slug-only backend would 404).
 */
export function meetingArtifactHref(
  projectId: number | string,
  artifactType: string,
  artifactId: number,
  index: MeetingArtifactResourceIndex,
): string | null {
  const t = normalizeMeetingArtifactType(artifactType);
  if (!Number.isFinite(artifactId) || artifactId < 1) return null;

  const list =
    t === 'decision' ? index.decisions
    : t === 'task' ? index.tasks
    : t === 'spreadsheet' ? index.spreadsheets
    : null;
  if (!list) return null;

  const slug = list.find((x) => x.id === artifactId)?.slug;
  if (!slug) return null;

  if (t === 'decision') {
    return `/decisions/${slug}?project_id=${projectId}`;
  }
  if (t === 'task') {
    return `/tasks/${slug}`;
  }
  if (t === 'spreadsheet') {
    return `/projects/${projectId}/spreadsheets/${slug}`;
  }
  return null;
}

export function meetingArtifactDisplayLabel(
  artifactType: string,
  artifactId: number,
  index: MeetingArtifactResourceIndex,
): string {
  const t = normalizeMeetingArtifactType(artifactType);
  if (t === 'decision') {
    const d = index.decisions.find((x) => x.id === artifactId);
    return d?.title?.trim() ? `Decision: ${d.title.trim()}` : `Decision #${artifactId}`;
  }
  if (t === 'task') {
    const task = index.tasks.find((x) => x.id === artifactId);
    const s = task?.summary?.trim();
    return s ? `Task: ${s.slice(0, 100)}${s.length > 100 ? '…' : ''}` : `Task #${artifactId}`;
  }
  if (t === 'spreadsheet') {
    const s = index.spreadsheets.find((x) => x.id === artifactId);
    return s?.name?.trim() ? `Spreadsheet: ${s.name.trim()}` : `Spreadsheet #${artifactId}`;
  }
  return `${artifactType.trim() || 'Artifact'} #${artifactId}`;
}
