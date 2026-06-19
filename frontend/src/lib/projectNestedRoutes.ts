/**
 * SMP-539 — flat routes are the default (`/tasks`, `/campaigns`, …).
 * Nested `/projects/<key>/…` routes remain valid when opened directly; project
 * context comes from the Zustand store, not the URL.
 */

export type ProjectKeySource = {
  slug?: string | null;
  id?: number | string | null;
};

export const SELECT_PROJECT_PATH = '/select-project';

/** Resources with both flat (`/<resource>`) and nested (`/projects/<key>/<resource>`) list routes. */
export const NESTED_PROJECT_RESOURCE_PREFIXES = [
  '/campaigns',
  '/tasks',
  '/decisions',
  '/spreadsheets',
  '/meetings',
  '/timeline',
] as const;

export function activeProjectKey(
  project?: ProjectKeySource | null,
): string | null {
  if (!project) return null;
  if (project.slug) return String(project.slug);
  if (project.id != null && project.id !== '') return String(project.id);
  return null;
}

/** Default front-end path — flat `/<resource>…` (project from store, not URL). */
export function flatAppPath(suffix: string): string {
  return suffix.startsWith('/') ? suffix : `/${suffix}`;
}

/**
 * Nested deep link `/projects/<key><suffix>`. Only for preserving an existing nested
 * URL context — default navigation must use {@link flatAppPath}.
 */
export function optionalNestedProjectPath(
  projectKey: string | number | null | undefined,
  suffix: string,
): string {
  const normalized = flatAppPath(suffix);
  if (projectKey == null || projectKey === '') {
    return normalized;
  }
  return `/projects/${projectKey}${normalized}`;
}

/** @deprecated Prefer {@link flatAppPath} — returns flat paths for app navigation. */
export function nestedProjectPath(
  _projectKey: string | number | null | undefined,
  suffix: string,
): string {
  return flatAppPath(suffix);
}

export function nestedProjectPathFromProject(
  _project: ProjectKeySource | null | undefined,
  suffix: string,
): string {
  return flatAppPath(suffix);
}

/** Alias for {@link flatAppPath}. */
export function defaultAppPath(suffix: string): string {
  return flatAppPath(suffix);
}

/** True when pathname is under `/projects/:id<resource>` or legacy flat `/<resource>`. */
export function pathnameMatchesProjectResource(
  pathname: string,
  resourcePrefix: string,
): boolean {
  const prefix = resourcePrefix.startsWith('/')
    ? resourcePrefix
    : `/${resourcePrefix}`;
  if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
    return true;
  }
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^/projects/[^/]+${escaped}(/|$)`).test(pathname);
}

export function isNestedProjectNavActive(
  pathname: string,
  flatHref: string,
  resolvedHref: string,
): boolean {
  if (pathname === resolvedHref || pathname.startsWith(`${resolvedHref}/`)) {
    return true;
  }
  if (
    NESTED_PROJECT_RESOURCE_PREFIXES.some((p) => flatHref === p) &&
    pathnameMatchesProjectResource(pathname, flatHref)
  ) {
    return true;
  }
  return pathname === flatHref || pathname.startsWith(`${flatHref}/`);
}
