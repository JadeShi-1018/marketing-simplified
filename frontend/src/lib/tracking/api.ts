import api from '../api';
import type {
  CreateSessionResponse,
  EngagementData,
  SendEventsResponse,
  TrackingConfig,
  TrackingEventPayload,
} from './types';

const BASE = '/api/tracking';

// Read JWT token from the same localStorage key the axios interceptor uses
function getAuthHeader(): string {
  try {
    const raw = localStorage.getItem('auth-storage');
    if (!raw) return '';
    const token = JSON.parse(raw)?.state?.token;
    return token ? `Bearer ${token}` : '';
  } catch {
    return '';
  }
}

export async function getConfig(): Promise<TrackingConfig> {
  const res = await api.get<TrackingConfig>(`${BASE}/config/`);
  return res.data;
}

export async function createSession(userAgent: string): Promise<CreateSessionResponse> {
  const res = await api.post<CreateSessionResponse>(`${BASE}/sessions/`, {}, {
    headers: { 'User-Agent': userAgent },
  });
  return res.data;
}

export async function heartbeat(sessionId: string, deltaSeconds: number): Promise<void> {
  await api.post(`${BASE}/sessions/${sessionId}/heartbeat/`, {
    active_delta_seconds: deltaSeconds,
  });
}

export async function endSession(
  sessionId: string,
  deltaSeconds: number,
  useKeepalive = false,
): Promise<void> {
  const body = JSON.stringify({
    active_delta_seconds: deltaSeconds,
    end_reason: 'CLOSED',
  });

  if (useKeepalive) {
    // beforeunload path: fetch keepalive can survive tab close, axios cannot
    await fetch(`${BASE}/sessions/${sessionId}/end/`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        Authorization: getAuthHeader(),
      },
      body,
    });
    return;
  }

  await api.post(`${BASE}/sessions/${sessionId}/end/`, JSON.parse(body));
}

export async function sendEvents(
  sessionId: string,
  events: TrackingEventPayload[],
): Promise<SendEventsResponse> {
  const res = await api.post<SendEventsResponse>(`${BASE}/events/`, {
    session_id: sessionId,
    events,
  });
  return res.data;
}

export async function getTaskEngagement(taskId: number): Promise<EngagementData> {
  const res = await api.get<EngagementData>(`${BASE}/tasks/${taskId}/engagement/`);
  return res.data;
}
