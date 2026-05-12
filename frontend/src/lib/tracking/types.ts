export type EventType =
  | 'TASK_OPEN'
  | 'FIRST_INTERACTION'
  | 'IDLE_START'
  | 'IDLE_END';

// metadata schemas (docstring-level contract, not runtime-enforced)
export interface TaskOpenMetadata {
  from_route?: string;
  referrer_event_id?: string;
}

export interface FirstInteractionMetadata {
  element?: string;
  action?: string;
}

export interface IdleStartMetadata {
  trigger?: string;
}

export interface IdleEndMetadata {
  idle_duration_seconds?: number;
}

export type EventMetadata =
  | TaskOpenMetadata
  | FirstInteractionMetadata
  | IdleStartMetadata
  | IdleEndMetadata
  | Record<string, unknown>;

export interface TrackingEventPayload {
  client_event_id: string;
  event_type: EventType;
  occurred_at: string; // ISO 8601
  content_type: string;
  object_id: number;
  project_id?: number | null;
  metadata?: EventMetadata;
}

export interface TrackingConfig {
  idle_seconds: number;
  heartbeat_seconds: number;
  session_timeout_seconds: number;
  event_flush_seconds: number;
}

export interface CreateSessionResponse {
  session_id: string;
}

export interface SendEventsResponse {
  accepted: number;
}

export interface EngagementData {
  task_id: number;
  open_count: number;
  first_interaction_at: string | null;
  last_open_at: string | null;
  total_active_seconds: number;
  idle_event_count: number;
}
