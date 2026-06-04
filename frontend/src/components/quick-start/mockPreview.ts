import { QUICK_START_BLUEPRINT_VERSION } from '@/types/quickStart';
import type { QuickStartBlueprint } from '@/types/quickStart';
import type { QuickStartPreviewPayload } from './types';

function deriveTitle(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) return 'New Campaign Project';
  if (trimmed.length <= 64) return trimmed;
  return `${trimmed.slice(0, 61)}…`;
}

/** Mock preview payload for qs-5.1 shell (replaced by Preview API in qs-5.2). */
export function buildMockQuickStartPreview(
  prompt: string,
  supplement: string
): QuickStartPreviewPayload {
  const title = deriveTitle(prompt);
  const description = supplement.trim() || 'AI-generated campaign workspace';

  const tasks = [
    'Kickoff and stakeholder alignment',
    'Channel strategy and budget allocation',
    'Creative briefing and asset pipeline',
    'Launch QA and tracking validation',
    'Weekly performance review and optimization',
  ].map((summary) => ({ summary }));

  const outline = {
    project: { title, description },
    modules: {
      tasks: { enabled: true, count: tasks.length },
      spreadsheet: { enabled: true, count: 1 },
      calendar: { enabled: true, count: 2 },
      decisions: { enabled: true, count: 2 },
      miro: { enabled: true, count: 2 },
    },
    tasks,
    spreadsheets: [
      {
        name: 'Campaign Budget',
        sheet_name: 'Budget',
        column_names: ['Channel', 'Budget', 'Notes'],
        row_count: 4,
      },
    ],
    calendar_events: [
      { title: 'Campaign kickoff', start_date: '2026-04-01' },
      { title: 'Mid-flight review', start_date: '2026-04-15' },
    ],
  };

  const blueprint: QuickStartBlueprint = {
    version: QUICK_START_BLUEPRINT_VERSION,
    project: { name: title, description },
    tasks: tasks.map((task, index) => ({
      summary: task.summary,
      type: 'execution' as const,
      priority: 'MEDIUM' as const,
      due_date: `2026-04-${String(index + 1).padStart(2, '0')}`,
    })),
    spreadsheets: [
      {
        name: 'Campaign Budget',
        sheets: [
          {
            name: 'Budget',
            columns: [
              { name: 'Channel', position: 0 },
              { name: 'Budget', position: 1 },
              { name: 'Notes', position: 2 },
            ],
            rows: [
              ['Meta', '30000', 'Prospecting'],
              ['Google', '20000', 'Search'],
            ],
          },
        ],
      },
    ],
    calendar_events: [
      {
        title: 'Campaign kickoff',
        start_datetime: '2026-04-01T10:00:00Z',
        end_datetime: '2026-04-01T11:00:00Z',
        timezone: 'UTC',
        is_all_day: false,
      },
      {
        title: 'Mid-flight review',
        start_datetime: '2026-04-15T14:00:00Z',
        end_datetime: '2026-04-15T15:00:00Z',
        timezone: 'UTC',
        is_all_day: false,
      },
    ],
    decisions: [
      { title: 'Channel budget split', description: 'Meta vs Google allocation' },
      { title: 'Creative testing approach', description: 'Top variants for launch' },
    ],
    miro_boards: [
      {
        name: 'Campaign planning',
        sticky_notes: [
          { content: 'Goals and KPIs' },
          { content: 'Launch milestones' },
        ],
      },
    ],
  };

  return { outline, blueprint };
}
