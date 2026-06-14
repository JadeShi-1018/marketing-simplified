import api from '../api';
import type {
  TicketFormListItem,
  TicketFormDetail,
  CreateTicketFormData,
  UpdateTicketFormData,
  BulkFieldsPayload,
  TicketFormAssignment,
  ReplaceAssignmentsPayload,
  SupportProjectStub,
  CsmWorkTypeStub,
} from '@/types/ticketForm';
import type {
  CreateSupportProjectData,
  UpdateSupportProjectData,
  CreateWorkTypeData,
  UpdateWorkTypeData,
  WorkTypeReorderPayload,
} from '@/types/csmSettings';

const BASE = '/api/csm';

function unwrap<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data;
  const paginated = data as { results?: T[] };
  return paginated?.results ?? [];
}

export const TicketFormAPI = {
  list(projectId: number) {
    return api.get<TicketFormListItem[] | { results: TicketFormListItem[] }>(
      `${BASE}/ticket-forms/`,
      { params: { project: projectId } },
    ).then((res) => unwrap<TicketFormListItem>(res.data));
  },

  create(projectId: number, data: CreateTicketFormData) {
    return api.post<TicketFormDetail>(`${BASE}/ticket-forms/`, data, {
      params: { project: projectId },
    });
  },

  retrieve(formId: number) {
    return api.get<TicketFormDetail>(`${BASE}/ticket-forms/${formId}/`);
  },

  update(formId: number, data: UpdateTicketFormData) {
    return api.patch<TicketFormDetail>(`${BASE}/ticket-forms/${formId}/`, data);
  },

  delete(formId: number) {
    return api.delete(`${BASE}/ticket-forms/${formId}/`);
  },

  bulkFields(formId: number, payload: BulkFieldsPayload) {
    return api.put<TicketFormDetail>(`${BASE}/ticket-forms/${formId}/fields/`, payload);
  },

  setDefault(formId: number) {
    return api.post<TicketFormDetail>(`${BASE}/ticket-forms/${formId}/set-default/`);
  },

  listAssignments(formId: number) {
    return api.get<TicketFormAssignment[]>(`${BASE}/ticket-forms/${formId}/assignments/`);
  },

  replaceAssignments(formId: number, payload: ReplaceAssignmentsPayload) {
    return api.put<TicketFormAssignment[]>(
      `${BASE}/ticket-forms/${formId}/assignments/`,
      payload,
    );
  },

  listSupportProjects(projectId: number, opts?: { includeArchived?: boolean }) {
    const params: Record<string, string | number> = { project: projectId };
    if (opts?.includeArchived) params.include_archived = '1';
    return api.get<SupportProjectStub[] | { results: SupportProjectStub[] }>(
      `${BASE}/support-projects/`,
      { params },
    ).then((res) => unwrap<SupportProjectStub>(res.data));
  },

  createSupportProject(projectId: number, data: CreateSupportProjectData) {
    return api.post<SupportProjectStub>(`${BASE}/support-projects/`, data, {
      params: { project: projectId },
    });
  },

  updateSupportProject(id: number, data: UpdateSupportProjectData) {
    return api.patch<SupportProjectStub>(`${BASE}/support-projects/${id}/`, data);
  },

  archiveSupportProject(id: number) {
    return api.delete<SupportProjectStub>(`${BASE}/support-projects/${id}/`);
  },

  listWorkTypes(projectId: number, opts?: { includeInactive?: boolean }) {
    const params: Record<string, string | number> = { project: projectId };
    if (opts?.includeInactive) params.include_inactive = '1';
    return api.get<CsmWorkTypeStub[] | { results: CsmWorkTypeStub[] }>(
      `${BASE}/work-types/`,
      { params },
    ).then((res) => unwrap<CsmWorkTypeStub>(res.data));
  },

  createWorkType(projectId: number, data: CreateWorkTypeData) {
    return api.post<CsmWorkTypeStub>(`${BASE}/work-types/`, data, {
      params: { project: projectId },
    });
  },

  updateWorkType(id: number, data: UpdateWorkTypeData) {
    return api.patch<CsmWorkTypeStub>(`${BASE}/work-types/${id}/`, data);
  },

  deactivateWorkType(id: number) {
    return api.delete<CsmWorkTypeStub>(`${BASE}/work-types/${id}/`);
  },

  reorderWorkTypes(projectId: number, ids: number[]) {
    const payload: WorkTypeReorderPayload = { ids };
    return api.put<CsmWorkTypeStub[]>(`${BASE}/work-types/reorder/`, payload, {
      params: { project: projectId },
    });
  },
};
