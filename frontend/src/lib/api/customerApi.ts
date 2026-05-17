import api from '../api';
import { Customer, CreateCustomerData, UpdateCustomerData } from '@/types/customer';

const BASE = '/api/customers';

type PaginatedCustomers = {
  count: number;
  next: string | null;
  previous: string | null;
  results: Customer[];
};

export const CustomerAPI = {
  list: (params?: { experience_group?: number; is_active?: boolean }) =>
    api.get<PaginatedCustomers | Customer[]>(`${BASE}/`, { params }),

  retrieve: (id: number) =>
    api.get<Customer>(`${BASE}/${id}/`),

  create: (data: CreateCustomerData) =>
    api.post<Customer>(`${BASE}/`, data),

  update: (id: number, data: UpdateCustomerData) =>
    api.patch<Customer>(`${BASE}/${id}/`, data),

  destroy: (id: number) =>
    api.delete(`${BASE}/${id}/`),
};
