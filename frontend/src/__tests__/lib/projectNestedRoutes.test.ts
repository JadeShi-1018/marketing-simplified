import {
  activeProjectKey,
  flatAppPath,
  isNestedProjectNavActive,
  nestedProjectPath,
  nestedProjectPathFromProject,
  optionalNestedProjectPath,
  pathnameMatchesProjectResource,
} from '@/lib/projectNestedRoutes';

describe('projectNestedRoutes', () => {
  it('builds flat default paths', () => {
    expect(flatAppPath('/campaigns')).toBe('/campaigns');
    expect(flatAppPath('/tasks/new?type=asset')).toBe('/tasks/new?type=asset');
  });

  it('nestedProjectPath returns flat paths for navigation (flat default)', () => {
    expect(nestedProjectPath('acme', '/campaigns')).toBe('/campaigns');
    expect(nestedProjectPath(null, '/tasks')).toBe('/tasks');
    expect(nestedProjectPathFromProject(null, '/decisions')).toBe('/decisions');
  });

  it('optionalNestedProjectPath builds nested deep links when needed', () => {
    expect(optionalNestedProjectPath('acme', '/campaigns')).toBe('/projects/acme/campaigns');
    expect(optionalNestedProjectPath('acme', '/tasks/new?type=asset')).toBe(
      '/projects/acme/tasks/new?type=asset',
    );
    expect(optionalNestedProjectPath(null, '/tasks')).toBe('/tasks');
  });

  it('prefers slug over numeric id from project object', () => {
    expect(activeProjectKey({ slug: 'acme', id: 1 })).toBe('acme');
    expect(nestedProjectPathFromProject({ slug: 'acme', id: 1 }, '/meetings')).toBe('/meetings');
  });

  it('matches nested and legacy flat resource paths', () => {
    expect(pathnameMatchesProjectResource('/projects/acme/tasks', '/tasks')).toBe(true);
    expect(pathnameMatchesProjectResource('/tasks', '/tasks')).toBe(true);
    expect(pathnameMatchesProjectResource('/projects/acme/campaigns/foo', '/campaigns')).toBe(
      true,
    );
  });

  it('highlights sidebar nav for flat and nested URLs', () => {
    expect(isNestedProjectNavActive('/projects/acme/tasks', '/tasks', '/tasks')).toBe(true);
    expect(
      isNestedProjectNavActive('/projects/acme/campaigns/x', '/campaigns', '/campaigns'),
    ).toBe(true);
  });
});
