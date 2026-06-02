// Type definitions for AI Agent feature

// ==================== Session Types ====================

export interface AgentSession {
  id: string;
  project_id?: number;
  created_by?: number;
  title?: string | null;
  status?: string;
  approval_required?: boolean;
  is_pinned?: boolean;
  last_read_at?: string | null;
  has_unread?: boolean;
  created_at: string;
  updated_at?: string;
  message_count?: number;
}

export interface AgentSessionDetail extends AgentSession {
  messages: AgentMessage[];
  follow_up_available?: boolean;
  follow_up_started?: boolean;
}

export interface UpdateSessionRequest {
  title?: string;
  approval_required?: boolean;
  status?: string;
  is_pinned?: boolean;
  /** ISO datetime string or null to clear (mark unread when assistant messages exist). */
  last_read_at?: string | null;
}

export interface CreateSessionRequest {
  project_id?: number;
  approval_required?: boolean;
}

// ==================== Message Types ====================

export type AgentMessageRole = 'user' | 'assistant';

export interface AgentMessage {
  id: string;
  session_id: number;
  role: AgentMessageRole;
  content: string;
  message_type?: string;
  created_at: string;
  data?: AgentMessageData | null;
}

export interface AgentMessageData {
  anomalies?: AnomalyItem[];
  decision_id?: number;
  task_ids?: number[];
  created_tasks?: Array<{ index: number; task_id: number; summary: string }>;
  board_id?: string;
  event_type?: string;
  status?: string;
  recommended_tasks?: RecommendedTask[];
  approval_id?: string;
  kind?: string;
  draft?: Record<string, unknown>;
  file_id?: string;
  workflow_run_id?: string;
  session_id?: string;
  filename?: string;
  original_filename?: string;
  row_count?: number;
  column_count?: number;
  step_order?: number;
  step_name?: string;
  total_steps?: number;
}

// ==================== SSE Stream Types ====================

export type SSEEventType =
  | 'text'
  | 'text_delta'
  | 'analysis'
  | 'confirmation_request'
  | 'approval_request'
  | 'follow_up_prompt'
  | 'decision_draft'
  | 'task_created'
  | 'miro_status'
  | 'file_uploaded'
  | 'calendar_invite'
  | 'calendar_updated'
  | 'step_progress'
  | 'column_mapping'
  | 'done'
  | 'error';

export interface SSEEvent {
  type: SSEEventType;
  content?: string;
  data?: AgentMessageData;
}

// ==================== Chat Request ====================

export type AgentAction =
  | 'analyze'
  | 'create_tasks'
  | 'generate_miro'
  | 'distribute_message'
  | 'start_follow_up'
  | 'cancel_follow_up'
  | 'confirm_columns'
  | 'resolve_external_approval';

export interface CalendarContextPayload {
  type: 'calendar' | 'event';
  eventId?: string;
  eventTitle?: string;
  calendarId?: string;
  startDatetime?: string;
  endDatetime?: string;
  description?: string;
  calendarIds?: string[];
  currentView?: string;
  currentDate?: string;
  userTimezone?: string;
}

export interface AgentChatRequest {
  message: string;
  spreadsheet_id?: number;
  csv_filename?: string;
  action?: AgentAction;
  calendar_context?: CalendarContextPayload;
  workflow_id?: string;
  // User-approved column mapping for confirm_columns action.
  // Format: {original_header: canonical_name or "unknown"}
  column_mapping?: Record<string, string>;
  approval_id?: string;
  approval_decision?: 'approve' | 'reject';
  approval_draft?: Record<string, unknown>;
}

// ==================== Analysis Types ====================

export type AnomalySeverity = 'critical' | 'warning' | 'info';

export interface AnomalyItem {
  metric: string;
  movement: string;
  severity: AnomalySeverity;
  current_value: number | string;
  previous_value: number | string;
  change_percent: number;
  campaign?: string | null;
  ad_set?: string | null;
  description: string;
}

// ==================== Spreadsheet Selector ====================

export interface AgentSpreadsheet {
  id: number;
  name: string;
  project_id: number;
  created_at: string;
  updated_at: string;
}

// ==================== UI State Types ====================

// ==================== Column Detection Types ====================

export interface ColumnDetectionData {
  schema_key: string | null
  schema_name: string
  source: 'rule' | 'llm' | 'none'
  confidence: number
  mappings: Record<string, string>
  categories: Record<string, string>
  unrecognized: string[]
  column_confidences: Record<string, number>
}

// ==================== Imported CSV File ====================

export interface ImportedCSVFile {
  id: string;
  filename: string;
  original_filename: string;
  row_count: number;
  column_count: number;
  file_size: number;
  created_at: string;
}

// ==================== Analysis Result Types ====================

export interface AnalysisResult {
  anomalies: AnomalyItem[];
  recommended_tasks?: RecommendedTask[];
}

export interface RecommendedTask {
  type: string;
  summary: string;
  description?: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

// ==================== Workflow Step State ====================

export interface WorkflowStepState {
  analysisComplete: boolean;
  tasksCreated: boolean;
}

// ==================== Workflow Types ====================

export type WorkflowStepType =
  | 'analyze_data'
  | 'call_dify'
  | 'call_llm'
  /** @deprecated No longer created from the UI; legacy workflows may still list this step. */
  | 'create_decision'
  | 'create_tasks'
  | 'custom_api'
  | 'await_confirmation'
  | 'detect_columns'
  | 'normalize_data'
  | 'generate_criteria'
  | 'generate_miro_snapshot'
  | 'create_miro_board'
  // Flow control — rendered on canvas; no runtime execution yet
  | 'if_else'
  | 'merge'
  | 'loop';

export interface AgentWorkflowStep {
  id: string;
  name: string;
  step_type: WorkflowStepType;
  order: number;
  config: Record<string, unknown>;
  description?: string;
  created_at?: string;
}

export interface AgentWorkflowDefinition {
  id: string;
  name: string;
  description: string;
  is_default: boolean;
  is_system: boolean;
  status: 'active' | 'draft' | 'archived';
  step_count?: number;
  /** Ordered list of step_type strings for each active step (list endpoint only). */
  step_types?: WorkflowStepType[];
  steps?: AgentWorkflowStep[];
  created_at: string;
  updated_at?: string;
}

export type StepExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'awaiting';

export interface AgentStepExecution {
  id: string;
  step_order: number;
  step_name: string;
  status: StepExecutionStatus;
  input_data?: Record<string, unknown>;
  output_data?: Record<string, unknown>;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
}

export interface AgentWorkflowRun {
  id: string;
  session: string;
  workflow_definition?: string;
  status: string;
  current_step_order?: number;
  analysis_result?: Record<string, unknown>;
  created_tasks?: unknown[];
  error_message?: string;
  step_executions?: AgentStepExecution[];
  created_at: string;
  updated_at: string;
}

// ==================== Template & Binding Types ====================

export type TemplateCategory = 'review' | 'optimization' | 'analysis' | 'reporting' | 'other';
export type TemplateShareScope = 'private' | 'organization' | 'public';
export type TriggerMode = 'file_upload' | 'analyze_action' | 'message_keyword';

export interface AgentWorkflowTemplate {
  id: string;
  name: string;
  description?: string;
  category: TemplateCategory;
  share_scope: TemplateShareScope;
  workflow_definition?: string;
  workflow_name?: string;
  workflow_step_count?: number;
  /** Ordered list of step_type strings for each active step in the template's workflow. */
  workflow_step_types?: WorkflowStepType[];
  created_by: string;
  organization?: string;
  applied_project_count?: number;
  created_at: string;
  updated_at?: string;
}

export interface CreateTemplateRequest {
  source_workflow_id: string;
  name: string;
  description?: string;
  category: TemplateCategory;
  share_scope: TemplateShareScope;
}

export interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  category?: TemplateCategory;
  share_scope?: TemplateShareScope;
}

export interface AgentProjectWorkflowBinding {
  id: string;
  project: string;
  project_name?: string;
  template: string;
  template_detail?: AgentWorkflowTemplate;
  trigger_mode: TriggerMode;
  trigger_keywords?: string[];
  priority: number;
  is_default: boolean;
  is_active: boolean;
  applied_by?: string;
  applied_by_name?: string;
  applied_at: string;
  created_at: string;
  updated_at?: string;
}

export interface CreateBindingRequest {
  template_id: string;
  trigger_mode: TriggerMode;
  trigger_keywords?: string[];
  priority?: number;
  is_default?: boolean;
}

export interface UpdateBindingRequest {
  trigger_mode?: TriggerMode;
  trigger_keywords?: string[];
  priority?: number;
  is_default?: boolean;
  is_active?: boolean;
}

export interface LightweightBinding {
  id: string;
  template_name: string;
  template_category: TemplateCategory;
  trigger_mode: TriggerMode;
  trigger_keywords?: string[];
  is_default: boolean;
}
