/** Infer which checklist step the user is viewing from the current route. */
export function inferQuickStartStepFromPathname(
  pathname: string,
  hash: string
): string | null {
  if (pathname.includes('/tasks')) return 'tasks';
  if (pathname.includes('/spreadsheets')) return 'spreadsheet';
  if (pathname.startsWith('/calendar')) return 'calendar';
  if (pathname.includes('/decisions')) return 'decisions';
  if (pathname.startsWith('/miro')) return 'miro';
  if (pathname === '/overview' && hash.replace(/^#/, '') === 'project-team') {
    return 'team';
  }
  return null;
}
