/** Routes where the post-create Quick Start checklist should not appear. */
export function shouldRenderQuickStartChecklist(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname.startsWith('/projects/quick-start')) return false;
  if (pathname === '/select-project') return false;
  return true;
}
