export interface Customer {
  id: number;
  email: string;
  full_name: string;
  company: string;
  phone: string;
  experience_group: number | null;
  experience_group_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  region: number | null;
  organisation: number | null;
}

export interface CreateCustomerData {
  email: string;
  full_name: string;
  company?: string;
  phone?: string;
  experience_group?: number | null;
  region?: number | null;
  organisation?: number | null;
}

export interface UpdateCustomerData {
  email?: string;
  full_name?: string;
  company?: string;
  phone?: string;
  experience_group?: number | null;
  is_active?: boolean;
  region?: number | null;
  organisation?: number | null;
}
