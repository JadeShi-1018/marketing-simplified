import { buildQuickStartChecklistItems } from '@/components/quick-start/buildQuickStartChecklistItems';
import type { QuickStartPostCreateGuide } from '@/lib/quickStartPostCreate';

const baseGuide: QuickStartPostCreateGuide = {
  projectId: 7,
  projectName: 'Campaign',
  summary: {
    tasks: 5,
    spreadsheets: 1,
    calendar_events: 2,
    decisions: 2,
    miro_boards: 1,
  },
  miroBoardId: 'board-uuid',
  enabledModules: {
    tasks: true,
    spreadsheet: true,
    calendar: true,
    decisions: false,
    miro: false,
  },
  spreadsheetId: 'april-budget',
  createdAt: Date.now(),
};

describe('buildQuickStartChecklistItems', () => {
  it('includes enabled modules and always includes team invite', () => {
    const guide = {
      ...baseGuide,
      enabledModules: {
        ...baseGuide.enabledModules,
        decisions: true,
        miro: true,
      },
    };
    const items = buildQuickStartChecklistItems(guide);
    expect(items.map((i) => i.id)).toEqual([
      'tasks',
      'spreadsheet',
      'calendar',
      'decisions',
      'miro',
      'team',
    ]);
    expect(items.find((i) => i.id === 'spreadsheet')?.href).toBe(
      '/spreadsheets/april-budget'
    );
    expect(items.find((i) => i.id === 'miro')?.href).toBe('/miro/board-uuid');
  });

  it('omits modules with zero counts', () => {
    const items = buildQuickStartChecklistItems({
      ...baseGuide,
      summary: {
        tasks: 0,
        spreadsheets: 0,
        calendar_events: 0,
        decisions: 0,
        miro_boards: 0,
      },
      enabledModules: {
        tasks: true,
        spreadsheet: true,
        calendar: true,
        decisions: false,
        miro: false,
      },
    });
    expect(items.map((i) => i.id)).toEqual(['team']);
  });
});
