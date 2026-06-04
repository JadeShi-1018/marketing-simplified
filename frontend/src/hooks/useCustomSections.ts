/**
 * useCustomSections — localStorage-backed custom sidebar sections.
 *
 * Each section is user-defined (named, collapsible, ordered list of chat IDs).
 * Scoped per project via the `projectId` key.
 */
import { useCallback, useEffect, useState } from 'react';
import { MAX_SIDEBAR_SECTION_NAME_LENGTH, normalizeLimitedName } from '@/lib/messages/nameLimits';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CustomSection {
  id: string;
  name: string;
  /** Ordered list of chat IDs explicitly added to this section. */
  chatIds: number[];
  collapsed: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function storageKey(projectId: number): string {
  return `ms_sidebar_custom_sections_v1_${projectId}`;
}

function load(projectId: number): CustomSection[] {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as CustomSection[];
  } catch {
    return [];
  }
}

function save(projectId: number, sections: CustomSection[]): void {
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(sections));
  } catch {
    /* quota exceeded — ignore */
  }
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCustomSections(projectId: number | null) {
  const [sections, setSections] = useState<CustomSection[]>([]);

  // Load from localStorage whenever the project changes
  useEffect(() => {
    if (projectId === null) {
      setSections([]);
      return;
    }
    setSections(load(projectId));
  }, [projectId]);

  // Persist whenever sections change
  const persist = useCallback(
    (next: CustomSection[]) => {
      setSections(next);
      if (projectId !== null) save(projectId, next);
    },
    [projectId]
  );

  const createSection = useCallback(
    (name = 'New section') => {
      const nextName = normalizeLimitedName(name, MAX_SIDEBAR_SECTION_NAME_LENGTH) || 'New section';
      const next: CustomSection = { id: uid(), name: nextName, chatIds: [], collapsed: false };
      persist([...sections, next]);
    },
    [sections, persist]
  );

  const deleteSection = useCallback(
    (id: string) => {
      persist(sections.filter((s) => s.id !== id));
    },
    [sections, persist]
  );

  const renameSection = useCallback(
    (id: string, name: string) => {
      const nextName = normalizeLimitedName(name, MAX_SIDEBAR_SECTION_NAME_LENGTH);
      if (!nextName) return;
      persist(sections.map((s) => (s.id === id ? { ...s, name: nextName } : s)));
    },
    [sections, persist]
  );

  const toggleCollapsed = useCallback(
    (id: string) => {
      persist(sections.map((s) => (s.id === id ? { ...s, collapsed: !s.collapsed } : s)));
    },
    [sections, persist]
  );

  const addChatToSection = useCallback(
    (sectionId: string, chatId: number) => {
      persist(
        sections.map((s) => {
          if (s.id !== sectionId) return s;
          if (s.chatIds.includes(chatId)) return s;
          return { ...s, chatIds: [...s.chatIds, chatId] };
        })
      );
    },
    [sections, persist]
  );

  const removeChatFromSection = useCallback(
    (sectionId: string, chatId: number) => {
      persist(
        sections.map((s) => {
          if (s.id !== sectionId) return s;
          return { ...s, chatIds: s.chatIds.filter((id) => id !== chatId) };
        })
      );
    },
    [sections, persist]
  );

  return {
    sections,
    createSection,
    deleteSection,
    renameSection,
    toggleCollapsed,
    addChatToSection,
    removeChatFromSection,
  };
}
