import api from '../api';

export interface LinearStatus {
  connected: boolean;
}

export interface LinearTeam {
  id: string;
  name: string;
  key?: string;
}

export interface LinearIssueListItem {
  id: string;
  identifier?: string;
  title?: string;
}

export interface LinearImportResult {
  created: Array<{ issue_id: string; task_id: number }>;
  skipped: Array<{ issue_id: string; reason: string }>;
  errors: Array<{ issue_id: string; reason: unknown }>;
}

export interface LinearPushTaskResult {
  action: 'created' | 'updated';
  linear_issue_id: string;
  task_id: number;
}

export const linearApi = {
  getStatus: async (): Promise<LinearStatus> => {
    const response = await api.get('/api/v1/linear/status/');
    return response.data;
  },

  connect: async (): Promise<{ auth_url: string }> => {
    const response = await api.get('/api/v1/linear/connect/');
    return response.data;
  },

  disconnect: async (): Promise<void> => {
    await api.delete('/api/v1/linear/disconnect/');
  },

  listTeams: async (): Promise<{ teams: LinearTeam[] }> => {
    const response = await api.get('/api/v1/linear/teams/');
    return response.data;
  },

  listTeamIssues: async (teamId: string): Promise<{ issues: LinearIssueListItem[] }> => {
    const response = await api.get('/api/v1/linear/issues/', {
      params: { team_id: teamId },
    });
    return response.data;
  },

  importIssues: async (body: {
    project_id: number;
    team_id: string;
    issue_ids: string[];
  }): Promise<LinearImportResult> => {
    const response = await api.post('/api/v1/linear/import-issues/', body);
    return response.data;
  },

  pushTask: async (body: { task_id: number; team_id?: string }): Promise<LinearPushTaskResult> => {
    const payload: { task_id: number; team_id?: string } = { task_id: body.task_id };
    if (body.team_id) {
      payload.team_id = body.team_id;
    }
    const response = await api.post('/api/v1/linear/push-task/', payload);
    return response.data;
  },
};
