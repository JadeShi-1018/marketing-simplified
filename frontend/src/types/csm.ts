export type TierType = 'T1' | 'T2' | 'T3' | 'T4';

export const TIER_LABELS: Record<TierType, string> = {
  T1: 'T1 Frontline',
  T2: 'T2 Technical Support',
  T3: 'T3 Escalations',
  T4: 'T4 VIP',
};

export const TIER_COLORS: Record<TierType, string> = {
  T1: 'bg-blue-100 text-blue-800',
  T2: 'bg-yellow-100 text-yellow-800',
  T3: 'bg-orange-100 text-orange-800',
  T4: 'bg-purple-100 text-purple-800',
};

export interface Queue {
  id: number;
  project: number;
  name: string;
  description: string;
  tier: TierType;
  tier_display: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

export interface CreateQueueData {
  project: number;
  name: string;
  description?: string;
  tier: TierType;
  display_order?: number;
}

export interface UpdateQueueData {
  name?: string;
  description?: string;
  tier?: TierType;
  display_order?: number;
  is_active?: boolean;
}

export interface QueueAgent {
  id: number;
  queue: number;
  user: number;
  user_email: string;
  user_name: string;
  assigned_by: number | null;
  created_at: string;
}

export interface QueueTeam {
  id: number;
  queue: number;
  team: number;
  team_name: string;
  created_at: string;
}

export interface QueueTicketCounts {
  todo: number;
  in_progress: number;
}

export interface CSMInvitation {
  id: number;
  email: string;
  project: number;
  team: number | null;
  invited_by: number | null;
  token: string;
  expires_at: string;
  accepted: boolean;
  accepted_at: string | null;
  is_expired: boolean;
  created_at: string;
}

export interface CreateInvitationData {
  email: string;
  project: number;
  team?: number | null;
}
