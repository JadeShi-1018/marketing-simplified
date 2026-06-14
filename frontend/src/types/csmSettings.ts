/** CSM-S01-08 — support project & work type admin types */

export interface CreateSupportProjectData {
  name: string;
  default_queue?: number | null;
}

export interface UpdateSupportProjectData {
  name?: string;
  default_queue?: number | null;
  is_archived?: boolean;
}

export interface CreateWorkTypeData {
  name: string;
  sort_order?: number;
}

export interface UpdateWorkTypeData {
  name?: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface WorkTypeReorderPayload {
  ids: number[];
}
