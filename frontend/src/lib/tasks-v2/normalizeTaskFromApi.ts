import type { TaskData, TaskTag } from '@/types/task';

function coerceTags(raw: unknown): TaskTag[] {
  if (raw == null) return [];
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown;
      return coerceTags(p);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];

  const out: TaskTag[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    const colorRaw = typeof o.color === 'string' ? o.color.trim() : '';
    if (!name || !colorRaw) continue;
    out.push({ name, color: colorRaw.toUpperCase() });
  }
  return out;
}

/**
 * Normalize GET / PATCH task JSON so UI always sees tags[] and project_id when possible.
 */
export function normalizeTaskFromApi(raw: unknown): TaskData {
  const row = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  let tags = coerceTags(row.tags);
  const legacyLabels = row.labels;
  if ((!tags || tags.length === 0) && Array.isArray(legacyLabels)) {
    tags = coerceTags(legacyLabels);
  }

  const base = raw as unknown as TaskData;
  const project = row.project as { id?: number; name?: string } | undefined;
  const topPid = typeof row.project_id === 'number' ? row.project_id : undefined;
  const project_id = topPid ?? project?.id ?? base.project_id;

  return {
    ...base,
    ...(project_id !== undefined ? { project_id } : {}),
    tags,
  };
}
