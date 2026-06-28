import api from '../api';

export interface OrganizationData {
  id: number;
  name: string;
  slug: string;
  member_count?: number;
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
}

// List item returned by GET /api/core/organizations/
export interface OrgListItem {
  id: number;
  name: string;
  slug: string;
  desc?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  is_current: boolean;
  user_role: string | null;
  member_count: number;
}

export interface OrgListResponse {
  organizations: OrgListItem[];
  current_organization_id: number | null;
}

// Detail returned by GET /api/core/organizations/<id>/
export interface OrgSubscription {
  is_active: boolean;
  seat_count: number;
  start_date: string | null;
  end_date: string | null;
  cancel_at_period_end: boolean;
  plan: {
    name: string;
    desc: string | null;
    base_price_cents: number;
    included_seats: number;
    monthly_token_quota: number | null;
    currency: string;
  };
}

export interface OrgUsage {
  tokens_used: number;
  tokens_reserved: number;
  overage_tokens: number;
  updated_at: string | null;
}

export interface OrgDetail {
  id: number;
  name: string;
  slug: string;
  desc?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  is_current: boolean;
  user_role: string | null;
  member_count: number;
  subscription: OrgSubscription | null;
  usage: OrgUsage | null;
}

// Member returned by GET /api/core/organizations/<id>/members/
export interface OrgMember {
  id: number;
  user: {
    id: number;
    username: string;
    email: string;
    name: string;
  };
  role: string;
  joined_at: string;
}

export interface OrgMembersResponse {
  organization: { id: number; name: string; slug: string };
  members: OrgMember[];
  member_count: number;
}

export interface CreateOrganizationPayload {
  name: string;
}

export interface CreateOrganizationResponse {
  organization: OrganizationData;
  message?: string;
}

export interface ValidateSlugResponse {
  exists: boolean;
  organization: OrganizationData | null;
}

export interface JoinOrganizationPayload {
  slug: string;
}

export interface JoinOrganizationResponse {
  organization: OrganizationData;
  message?: string;
}

export const OrganizationAPI = {
  // Create a new organization
  createOrganization: (payload: CreateOrganizationPayload): Promise<CreateOrganizationResponse> => {
    return api
      .post<CreateOrganizationResponse>('/api/core/organizations/create/', payload)
      .then((response) => response.data);
  },

  // Validate if an organization slug exists
  validateSlug: (slug: string): Promise<ValidateSlugResponse> => {
    return api
      .get<ValidateSlugResponse>('/api/core/organizations/validate-slug/', {
        params: { slug },
      })
      .then((response) => response.data);
  },

  // Join an organization by slug
  joinOrganization: (payload: JoinOrganizationPayload): Promise<JoinOrganizationResponse> => {
    return api
      .post<JoinOrganizationResponse>('/api/core/organizations/join/', payload)
      .then((response) => response.data);
  },

  // Get all organizations the current user belongs to
  getUserOrganizations: (): Promise<OrgListResponse> => {
    return api
      .get<OrgListResponse>('/api/core/organizations/')
      .then((response) => response.data);
  },

  // Get detailed info for a single organization (incl. subscription + usage)
  getOrganizationDetail: (orgId: number): Promise<OrgDetail> => {
    return api
      .get<OrgDetail>(`/api/core/organizations/${orgId}/`)
      .then((response) => response.data);
  },

  // Get members list for an organization (admin only)
  getOrganizationMembers: (orgId: number): Promise<OrgMembersResponse> => {
    return api
      .get<OrgMembersResponse>(`/api/core/organizations/${orgId}/members/`)
      .then((response) => response.data);
  },

  // Create an org invitation and send notification (admin only)
  createOrgInvitation: (
    orgId: number,
    email: string,
    role: 'admin' | 'member' | 'viewer' = 'member'
  ): Promise<{ id: number; token: string; invitation_url: string }> => {
    return api
      .post(`/api/core/organizations/${orgId}/invitations/`, {
        email,
        role,
        max_uses: 1,
        expires_days: 7,
      })
      .then((response) => response.data);
  },
};
