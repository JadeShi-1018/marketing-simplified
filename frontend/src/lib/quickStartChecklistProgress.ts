/** Infer which checklist step the user is viewing from the current route. */
export function inferQuickStartStepFromPathname(
  pathname: string,
  hash: string
): string | null {
  if (pathname.startsWith('/tasks')) return 'tasks';
  if (pathname.startsWith('/spreadsheets')) return 'spreadsheet';
  if (pathname.startsWith('/calendar')) return 'calendar';
  if (pathname.startsWith('/decisions')) return 'decisions';
  if (pathname.startsWith('/miro')) return 'miro';
  if (pathname === '/overview' && hash.replace(/^#/, '') === 'project-team') {
    return 'team';
  }
  return null;
}
