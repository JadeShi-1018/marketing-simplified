export type ConversationStatus = 'active' | 'pending' | 'resolved' | 'closed';
export type ConversationChannel = 'web' | 'email' | 'whatsapp';
export type MessageSenderType = 'agent' | 'customer' | 'system';

export interface ConversationMessage {
  id: number;
  conversation: number;
  sender_type: MessageSenderType;
  sender_agent: number | null;
  sender_agent_name: string | null;
  sender_agent_email: string | null;
  content: string;
  rich_body: object | null;
  created_at: string;
}

export interface CustomerProfile {
  id: number;
  full_name: string;
  email: string;
  company: string;
  phone: string;
  organisation_id: number | null;
  organisation_name: string | null;
  region_name: string | null;
}

export interface LinkedTicket {
  id: number;
  title: string;
  status: string;
  priority: string;
}

export interface Ticket {
  id: number;
  queue: number | null;
  queue_name: string | null;
  title: string;
  description: string;
  status: string;
  status_display: string;
  priority: string;
  priority_display: string;
  assigned_to: number | null;
  assigned_to_name: string | null;
  customer_email: string;
  conversation: number | null;
  created_at: string;
}

export interface TicketSummary {
  id: number;
  title: string;
  status: string;
  status_display: string;
  assigned_to_name: string | null;
}

export interface Conversation {
  id: number;
  customer: number | null;
  customer_name: string | null;
  customer_email: string | null;
  queue: number | null;
  queue_name: string | null;
  queue_organisation_id: number | null;
  assigned_to: number | null;
  assigned_to_name: string | null;
  status: ConversationStatus;
  status_display: string;
  channel: ConversationChannel;
  channel_display: string;
  tags: string[];
  started_at: string;
  ended_at: string | null;
  elapsed_seconds: number;
  ticket: TicketSummary | null;
  created_at: string;
}

export interface ConversationDetail extends Conversation {
  messages: ConversationMessage[];
  customer_profile: CustomerProfile | null;
  linked_tickets: LinkedTicket[];
}

export interface SendMessagePayload {
  content: string;
  rich_body?: object | null;
}

export interface CreateTicketPayload {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  queue: number;
}

export interface UpdateConversationPayload {
  status?: ConversationStatus;
  queue?: number | null;
  assigned_to?: number | null;
  tags?: string[];
}

export interface QuickReplyTemplate {
  id: number;
  organisation: number;
  title: string;
  content: string;
  rich_body: object | null;
  tags: string[];
  is_active: boolean;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuickReplyTemplatePayload {
  organisation: number;
  title: string;
  content: string;
  rich_body?: object | null;
  tags?: string[];
  is_active?: boolean;
}

// WebSocket event types
export type CsmWsEvent =
  | { type: 'new_message'; message: ConversationMessage }
  | { type: 'new_conversation'; conversation: Conversation }
  | { type: 'conversation_updated'; conversation: Conversation }
  | { type: 'typing_indicator'; conversation_id: number; user_id: number; is_typing: boolean }
  | { type: 'joined'; conversation_id: number }
  | { type: 'error'; detail: string };
