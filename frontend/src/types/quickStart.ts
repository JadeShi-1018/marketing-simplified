/** Quick Start — AI-guided new project creation (blueprint v1). */

export const QUICK_START_BLUEPRINT_VERSION = 1;

export type QuickStartModuleKey =
  | 'tasks'
  | 'spreadsheet'
  | 'calendar'
  | 'decisions'
  | 'miro';

export interface QuickStartSelectedModules {
  tasks: boolean;
  spreadsheet: boolean;
  calendar: boolean;
  decisions: boolean;
  miro: boolean;
}

export const DEFAULT_QUICK_START_SELECTED_MODULES: QuickStartSelectedModules = {
  tasks: true,
  spreadsheet: true,
  calendar: true,
  decisions: true,
  miro: true,
};

export type QuickStartPreviewStep = 1 | 2;

export interface QuickStartPreviewRequest {
  step: QuickStartPreviewStep;
  prompt: string;
  supplement?: string | null;
  chips?: Record<string, unknown>;
  selected_modules?: Partial<QuickStartSelectedModules>;
  locale?: string | null;
}

export interface QuickStartPreviewResponse {
  step: QuickStartPreviewStep;
  outline: QuickStartOutline | null;
  blueprint: QuickStartBlueprint | null;
}

export interface QuickStartOutlineProject {
  title: string;
  description: string;
}

export interface QuickStartOutlineModuleMeta {
  enabled: boolean;
  count: number;
}

export interface QuickStartOutlineTaskItem {
  summary: string;
}

export interface QuickStartOutlineSpreadsheetItem {
  name: string;
  sheet_name: string;
  column_names: string[];
  row_count: number;
}

export interface QuickStartOutlineCalendarEventItem {
  title: string;
  start_date: string;
}

export interface QuickStartOutlineDecisionItem {
  title: string;
}

export interface QuickStartOutlineMiroBoardItem {
  name: string;
  sticky_notes?: string[];
}

export interface QuickStartOutline {
  project: QuickStartOutlineProject;
  modules: Partial<Record<QuickStartModuleKey, QuickStartOutlineModuleMeta>>;
  tasks: QuickStartOutlineTaskItem[];
  spreadsheets: QuickStartOutlineSpreadsheetItem[];
  calendar_events: QuickStartOutlineCalendarEventItem[];
  decisions?: QuickStartOutlineDecisionItem[];
  miro_boards?: QuickStartOutlineMiroBoardItem[];
}

export interface QuickStartBlueprintProject {
  name: string;
  description?: string;
  objectives?: string[];
  project_type?: string[];
  advertising_platforms?: string[];
}

export type QuickStartTaskType =
  | 'budget'
  | 'asset'
  | 'retrospective'
  | 'report'
  | 'execution'
  | 'scaling'
  | 'alert'
  | 'experiment'
  | 'optimization'
  | 'communication'
  | 'platform_policy_update';

export type QuickStartTaskPriority =
  | 'HIGHEST'
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'LOWEST';

export interface QuickStartBlueprintTask {
  summary: string;
  description?: string;
  type?: QuickStartTaskType;
  priority?: QuickStartTaskPriority;
  due_date?: string;
  planned_start_date?: string;
}

export interface QuickStartBlueprintColumn {
  name: string;
  position: number;
}

export interface QuickStartBlueprintSheet {
  name: string;
  columns: QuickStartBlueprintColumn[];
  rows: string[][];
}

export interface QuickStartBlueprintSpreadsheet {
  name: string;
  sheets: QuickStartBlueprintSheet[];
}

export interface QuickStartBlueprintCalendarEvent {
  title: string;
  description?: string;
  start_datetime: string;
  end_datetime: string;
  timezone?: string;
  is_all_day?: boolean;
}

export interface QuickStartBlueprint {
  version: typeof QUICK_START_BLUEPRINT_VERSION;
  project: QuickStartBlueprintProject;
  tasks: QuickStartBlueprintTask[];
  spreadsheets: QuickStartBlueprintSpreadsheet[];
  calendar_events: QuickStartBlueprintCalendarEvent[];
  decisions: QuickStartBlueprintDecision[];
  miro_boards: QuickStartBlueprintMiroBoard[];
}

export interface QuickStartBlueprintDecision {
  title: string;
  description?: string;
}

export interface QuickStartBlueprintMiroStickyNote {
  content: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface QuickStartBlueprintMiroBoard {
  name: string;
  sticky_notes: QuickStartBlueprintMiroStickyNote[];
}

export interface QuickStartConfirmRequest {
  blueprint: QuickStartBlueprint;
  project_title?: string | null;
  selected_modules?: Partial<QuickStartSelectedModules>;
}

export interface QuickStartConfirmProject {
  id: number;
  slug?: string;
  name: string;
  is_active: boolean;
}

export interface QuickStartConfirmCreated {
  task_ids: number[];
  spreadsheet_ids: number[];
  // Slug-only resource URLs: backend maps created ids to slugs (order-preserving).
  spreadsheet_slugs: (string | null)[];
  calendar_event_ids: string[];
  decision_ids: number[];
  miro_board_ids: string[];
  miro_board_slugs: (string | null)[];
}

export interface QuickStartConfirmSummary {
  tasks: number;
  spreadsheets: number;
  calendar_events: number;
  decisions: number;
  miro_boards: number;
}

export interface QuickStartConfirmResponse {
  project: QuickStartConfirmProject;
  created: QuickStartConfirmCreated;
  summary: QuickStartConfirmSummary;
}

export type QuickStartApiErrorCode =
  | 'validation_failed'
  | 'configuration_error'
  | 'llm_generation_failed'
  | 'rate_limited'
  | 'malformed_output'
  | 'network_error';

export interface QuickStartApiErrorBody {
  error: QuickStartApiErrorCode;
  detail: string;
  /** Seconds to wait before retrying (e.g. after rate limit). */
  retry_after_seconds?: number;
}
