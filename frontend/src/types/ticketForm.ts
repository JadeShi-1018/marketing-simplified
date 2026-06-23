export type FieldType =
  | 'system_summary'
  | 'system_description'
  | 'system_project'
  | 'system_work_type'
  | 'short_text'
  | 'paragraph'
  | 'timestamp'
  | 'dropdown'
  | 'date'
  | 'number'
  | 'labels'
  | 'checkbox'
  | 'people'
  | 'url'
  | 'file';

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldConfig {
  allow_multiple?: boolean;
  min?: number | null;
  max?: number | null;
  integer_only?: boolean;
  max_length?: number;
}

export interface TicketFormField {
  id?: number;
  field_key: string;
  label: string;
  field_type: FieldType;
  is_required: boolean;
  sort_order: number;
  options?: FieldOption[];
  field_config?: FieldConfig;
  help_text?: string;
  max_files?: number;
  max_file_size_mb?: number;
}

export interface TicketFormListItem {
  id: number;
  slug: string;
  project: number;
  name: string;
  description: string;
  is_default: boolean;
  is_active: boolean;
  assignment_count: number;
  created_at: string;
  updated_at: string;
}

export interface TicketFormDetail extends Omit<TicketFormListItem, 'assignment_count'> {
  fields: TicketFormField[];
}

export interface CreateTicketFormData {
  name: string;
  description?: string;
}

export interface UpdateTicketFormData {
  name?: string;
  description?: string;
  is_active?: boolean;
}

export interface BulkFieldsPayload {
  fields: TicketFormField[];
}

export interface TicketFormAssignment {
  id: number;
  form: number;
  experience_group: number | null;
  experience_group_name?: string | null;
  support_project: number | null;
  support_project_name?: string | null;
  created_at: string;
}

export interface ReplaceAssignmentsPayload {
  experience_group_ids: number[];
  support_project_ids: number[];
}

export interface SupportProjectStub {
  id: number;
  name: string;
  is_archived: boolean;
  default_queue: number | null;
  default_queue_name?: string | null;
}

export interface CsmWorkTypeStub {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface ProjectMemberStub {
  id: number;
  name: string;
  email?: string;
}

/** Builder-only: local row before save */
export interface BuilderFieldRow extends TicketFormField {
  clientId: string;
  isSystem: boolean;
}

export interface FormOptionsHint {
  support_projects: { id: number; name: string }[];
  work_types: { id: number; name: string }[];
  project_members: ProjectMemberStub[];
}

export interface RequestFormResponse {
  form_id: number;
  form_name: string;
  form_description?: string;
  experience_group_id: number;
  fields: TicketFormField[];
  options: FormOptionsHint;
}

export interface SubmitRequestResult {
  ticket_id: number;
  submission_id: number;
}

/** Answers keyed by field_key */
export type FormAnswers = Record<string, string | string[] | number | number[]>;
