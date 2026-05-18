/**
 * Focus & behavioral signal tracking types.
 *
 * Field names mirror the Django serializers (snake_case) to avoid a translation
 * layer between client and server. See backend/behavioral_tracking/.
 */

export interface FocusSession {
  id: number;
  task: number;
  user: number;
  started_at: string;
  ended_at: string | null;
  is_active: boolean;
  total_focused_ms: number;
  total_keystrokes: number;
  total_backspaces: number;
  total_tab_switches: number;
  total_rapid_switches: number;
  total_mouse_hesitations: number;
  total_inactivity_pauses: number;
  total_repeated_navigations: number;
  total_abnormal_interruptions: number;
  created_at: string;
  updated_at: string;
}

export interface BehavioralSignalInput {
  window_started_at: string;
  window_ended_at: string;
  focused_ms: number;
  keystroke_count: number;
  backspace_count: number;
  tab_switch_count: number;
  rapid_switch_count: number;
  mouse_hesitation_count: number;
  inactivity_pause_count: number;
  repeated_navigation_count: number;
  abnormal_interruption_count: number;
}

export interface BehavioralSignal extends BehavioralSignalInput {
  id: number;
  session: number;
  recorded_at: string;
}

export interface CreateFocusSessionRequest {
  task: number;
}

export interface PaginatedFocusSessions {
  count: number;
  next: string | null;
  previous: string | null;
  results: FocusSession[];
}

export interface PaginatedSignals {
  count: number;
  next: string | null;
  previous: string | null;
  results: BehavioralSignal[];
}
