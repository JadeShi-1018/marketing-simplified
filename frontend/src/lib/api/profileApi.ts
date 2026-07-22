import api from '@/lib/api';

export type PersonalDataExportStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'expired';
export type PersonalDataExportFormat = 'json' | 'csv';

export interface PersonalDataExportRequest {
  id: string;
  status: PersonalDataExportStatus;
  export_format: PersonalDataExportFormat;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  expires_at: string | null;
  download_url: string | null;
  failure_reason: string;
  metadata: {
    included_sections?: string[];
    section_count?: number;
    generated_at?: string;
    [key: string]: unknown;
  };
}

export const profileApi = {
  listPersonalDataExports: async (): Promise<PersonalDataExportRequest[]> => {
    const response = await api.get('/api/core/privacy/export-requests/');
    return response.data;
  },

  requestPersonalDataExport: async (exportFormat: PersonalDataExportFormat): Promise<PersonalDataExportRequest> => {
    const response = await api.post('/api/core/privacy/export-requests/', {
      export_format: exportFormat,
    });
    return response.data;
  },

  getPersonalDataExport: async (id: string): Promise<PersonalDataExportRequest> => {
    const response = await api.get(`/api/core/privacy/export-requests/${id}/`);
    return response.data;
  },
};
