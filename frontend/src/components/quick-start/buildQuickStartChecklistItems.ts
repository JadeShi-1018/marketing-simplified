import type { LucideIcon } from 'lucide-react';
import { Calendar, CheckSquare, GitBranch, Layout, Table2, Users } from 'lucide-react';
import type { QuickStartPostCreateGuide } from '@/lib/quickStartPostCreate';

export type QuickStartChecklistItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

export function buildQuickStartChecklistItems(
  guide: QuickStartPostCreateGuide
): QuickStartChecklistItem[] {
  const { projectId, summary, enabledModules, spreadsheetId, miroBoardId } = guide;
  const items: QuickStartChecklistItem[] = [];

  if (enabledModules.tasks && summary.tasks > 0) {
    items.push({
      id: 'tasks',
      label: `Review ${summary.tasks} generated task${summary.tasks === 1 ? '' : 's'}`,
      href: '/tasks',
      icon: CheckSquare,
    });
  }

  if (enabledModules.spreadsheet && summary.spreadsheets > 0) {
    const href =
      spreadsheetId != null
        ? `/spreadsheets/${spreadsheetId}?project_id=${projectId}`
        : `/spreadsheets?project_id=${projectId}`;
    items.push({
      id: 'spreadsheet',
      label: `Open campaign spreadsheet${summary.spreadsheets > 1 ? 's' : ''}`,
      href,
      icon: Table2,
    });
  }

  if (enabledModules.calendar && summary.calendar_events > 0) {
    items.push({
      id: 'calendar',
      label: `Check ${summary.calendar_events} calendar event${
        summary.calendar_events === 1 ? '' : 's'
      }`,
      href: '/calendar',
      icon: Calendar,
    });
  }

  if (enabledModules.decisions && summary.decisions > 0) {
    items.push({
      id: 'decisions',
      label: `Review ${summary.decisions} draft decision${summary.decisions === 1 ? '' : 's'}`,
      href: '/decisions',
      icon: GitBranch,
    });
  }

  if (enabledModules.miro && summary.miro_boards > 0) {
    const href =
      miroBoardId != null ? `/miro/${miroBoardId}` : `/miro?project_id=${projectId}`;
    items.push({
      id: 'miro',
      label: `Open planning board${summary.miro_boards > 1 ? 's' : ''}`,
      href,
      icon: Layout,
    });
  }

  items.push({
    id: 'team',
    label: 'Invite teammates to this project',
    href: '/overview#project-team',
    icon: Users,
  });

  return items;
}
