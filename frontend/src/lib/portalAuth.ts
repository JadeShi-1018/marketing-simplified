import api from '@/lib/api';

const STORAGE_KEY = 'portal-auth';

interface PortalAuthState {
  token: string;
  refresh: string;
  user: { id: number; email: string; [key: string]: unknown };
  isAuthenticated: boolean;
}

function getStoredState(): PortalAuthState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.state ?? null;
  } catch {
    return null;
  }
}

function saveState(state: PortalAuthState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ state }));
}

function isExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    // Give a 30s buffer to avoid edge cases
    return Date.now() / 1000 > payload.exp - 30;
  } catch {
    return true;
  }
}

/**
 * Restore portal auth on page load. Returns the valid access token or null.
 * Automatically refreshes the access token if expired using the stored refresh token.
 * Call this at the start of every portal page's useEffect before making API calls.
 */
export async function initPortalAuth(): Promise<string | null> {
  const state = getStoredState();
  if (!state?.token) return null;

  let token = state.token;

  if (isExpired(token)) {
    if (!state.refresh) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    try {
      const res = await api.post<{ access: string }>('/api/token/refresh/', {
        refresh: state.refresh,
      });
      token = res.data.access;
      saveState({ ...state, token });
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  return token;
}

export function clearPortalAuth() {
  localStorage.removeItem(STORAGE_KEY);
  delete api.defaults.headers.common['Authorization'];
}

export function getPortalUser() {
  return getStoredState()?.user ?? null;
}
