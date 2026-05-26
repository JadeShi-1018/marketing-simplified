import type { TaskData, TaskTag } from '@/types/task';

const DEFAULT_TASK_LABEL_COLOR = '#6B7280';

function coerceTags(raw: unknown): TaskTag[] {
  if (raw == null) return [];
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown;
      return coerceTags(p);
    } catch {
      return coerceTags(raw.split(','));
    }
  }
  if (!Array.isArray(raw)) return [];

  const out: TaskTag[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const source =
      typeof item === 'string'
        ? { name: item, color: DEFAULT_TASK_LABEL_COLOR }
        : item && typeof item === 'object'
        ? (item as Record<string, unknown>)
        : null;
    if (!source) continue;
    const name = typeof source.name === 'string' ? source.name.trim().replace(/^#+/, '') : '';
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const colorRaw = typeof source.color === 'string' && source.color.trim()
      ? source.color.trim()
      : DEFAULT_TASK_LABEL_COLOR;
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
