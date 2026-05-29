import type {
  QuickStartBlueprint,
  QuickStartModuleKey,
} from '@/types/quickStart';

/** Draft item count for a module checkbox label (from current blueprint). */
export function getModuleDraftCount(
  key: QuickStartModuleKey,
  blueprint: QuickStartBlueprint,
  enabled: boolean
): number {
  if (!enabled) return 0;

  switch (key) {
    case 'tasks':
      return blueprint.tasks?.length ?? 0;
    case 'spreadsheet':
      return blueprint.spreadsheets?.length ?? 0;
    case 'calendar':
      return blueprint.calendar_events?.length ?? 0;
    case 'decisions':
      return blueprint.decisions?.length ?? 0;
    case 'miro':
      return (
        blueprint.miro_boards?.reduce(
          (sum, board) => sum + (board.sticky_notes?.length ?? 0),
          0
        ) ?? 0
      );
    default:
      return 0;
  }
}

export function moduleNeedsRegenerate(
  key: QuickStartModuleKey,
  blueprint: QuickStartBlueprint,
  enabling: boolean
): boolean {
  if (!enabling || (key !== 'decisions' && key !== 'miro')) return false;
  return getModuleDraftCount(key, blueprint, true) === 0;
}
