import {
  isoToDateInput,
  mergeDateIntoIso,
  patchBlueprintTasks,
} from '@/components/quick-start/patchPreviewBlueprint';
import type { QuickStartBlueprint } from '@/types/quickStart';
import { QUICK_START_BLUEPRINT_VERSION } from '@/types/quickStart';

const baseBlueprint = (): QuickStartBlueprint => ({
  version: QUICK_START_BLUEPRINT_VERSION,
  project: { name: 'Demo' },
  tasks: [
    {
      summary: 'Launch creative',
      due_date: '2026-06-01',
      type: 'asset',
      priority: 'HIGH',
    },
  ],
  spreadsheets: [],
  calendar_events: [],
  decisions: [],
  miro_boards: [],
});

describe('patchPreviewBlueprint', () => {
  it('updates task summary and dates', () => {
    const blueprint = baseBlueprint();
    const next = patchBlueprintTasks(blueprint, 0, {
      summary: 'Updated title',
      planned_start_date: '2026-05-15',
    });
    expect(next.tasks[0].summary).toBe('Updated title');
    expect(next.tasks[0].planned_start_date).toBe('2026-05-15');
    expect(next.tasks[0].due_date).toBe('2026-06-01');
  });

  it('merges date into ISO datetime', () => {
    expect(isoToDateInput('2026-05-20T14:00:00')).toBe('2026-05-20');
    expect(mergeDateIntoIso('2026-05-20T14:00:00', '2026-06-01')).toBe(
      '2026-06-01T14:00:00'
    );
  });
});
