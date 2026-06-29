import api from '../api';
import type {
  SupportChannelListItem,
  SupportChannelDetail,
  CreateSupportChannelData,
  UpdateSupportChannelData,
  ReplaceChannelAssignmentsPayload,
  EmbedSnippetResponse,
  ExperienceGroupStub,
} from '@/types/supportChannel';

const BASE = '/api/csm';

function unwrap<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data;
  const paginated = data as { results?: T[] };
  return paginated?.results ?? [];
}

export const SupportChannelAPI = {
  list(projectId: number, opts?: { includeInactive?: boolean }) {
    const params: Record<string, string | number> = { project: projectId };
    if (opts?.includeInactive) params.include_inactive = '1';
    return api
      .get<SupportChannelListItem[] | { results: SupportChannelListItem[] }>(
        `${BASE}/support-channels/`,
        { params },
      )
      .then((res) => unwrap<SupportChannelListItem>(res.data));
  },

  create(projectId: number, data: CreateSupportChannelData) {
    return api.post<SupportChannelDetail>(`${BASE}/support-channels/`, data, {
      params: { project: projectId },
    });
  },

  retrieve(channelId: number) {
    return api.get<SupportChannelDetail>(`${BASE}/support-channels/${channelId}/`);
  },

  update(channelId: number, data: UpdateSupportChannelData) {
    return api.patch<SupportChannelDetail>(`${BASE}/support-channels/${channelId}/`, data);
  },

  deactivate(channelId: number) {
    return api.delete(`${BASE}/support-channels/${channelId}/`);
  },

  replaceExperienceGroups(channelId: number, payload: ReplaceChannelAssignmentsPayload) {
    return api.put<ExperienceGroupStub[]>(
      `${BASE}/support-channels/${channelId}/experience-groups/`,
      payload,
    );
  },

  getEmbedSnippet(channelId: number) {
    return api.get<EmbedSnippetResponse>(
      `${BASE}/support-channels/${channelId}/embed-snippet/`,
    );
  },
};
