import api from '../api';
import { RetentionPolicy } from '@/types/retentionPolicy';

const BASE = '/api/core/admin/retention-policies';

export const RetentionPolicyAPI = {
  list: () => api.get<RetentionPolicy[]>(`${BASE}/`),
};
