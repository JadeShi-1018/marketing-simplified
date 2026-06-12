export interface PortalUser {
  id: number;
  email: string;
  full_name: string;
}

export interface PortalAuthResponse {
  access: string;
  refresh: string;
  user: PortalUser;
}

export interface PortalMessage {
  id: number;
  sender_type: 'agent' | 'customer' | 'system';
  sender_name: string | null;
  content: string;
  rich_body: object | null;
  created_at: string;
}

export interface PortalConversation {
  id: number;
  status: string;
  status_display: string;
  channel: string;
  subject: string;
  tags: string[];
  started_at: string;
  created_at: string;
  last_message: {
    content: string;
    sender_type: string;
    created_at: string;
  } | null;
  unread_count: number;
}

export interface PortalConversationDetail extends PortalConversation {
  messages: PortalMessage[];
}

export interface StartConversationPayload {
  subject: string;
  message: string;
}
