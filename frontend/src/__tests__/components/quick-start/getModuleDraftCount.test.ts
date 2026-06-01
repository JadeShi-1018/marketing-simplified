import {
  getModuleDraftCount,
  moduleNeedsRegenerate,
} from '@/components/quick-start/getModuleDraftCount';
import type { QuickStartBlueprint } from '@/types/quickStart';
import { QUICK_START_BLUEPRINT_VERSION } from '@/types/quickStart';

const blueprint: QuickStartBlueprint = {
  version: QUICK_START_BLUEPRINT_VERSION,
  project: { name: 'Launch' },
  tasks: [{ summary: 'A' }],
  spreadsheets: [{ name: 'Budget', sheets: [] }],
  calendar_events: [{ title: 'Kickoff', start_datetime: '', end_datetime: '' }],
  decisions: [{ title: 'D1' }, { title: 'D2' }],
  miro_boards: [
    {
      name: 'Board',
      sticky_notes: [{ content: 'Note 1' }, { content: 'Note 2' }],
    },
  ],
};

describe('getModuleDraftCount', () => {
  it('returns zero when module is disabled', () => {
    expect(getModuleDraftCount('decisions', blueprint, false)).toBe(0);
  });

  it('counts miro sticky notes when enabled', () => {
    expect(getModuleDraftCount('miro', blueprint, true)).toBe(2);
  });

  it('flags regenerate when enabling empty optional module', () => {
    const empty = { ...blueprint, decisions: [], miro_boards: [] };
    expect(moduleNeedsRegenerate('decisions', empty, true)).toBe(true);
    expect(moduleNeedsRegenerate('tasks', empty, true)).toBe(false);
  });
});
