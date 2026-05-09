import { useCallback, useEffect, useRef, useState } from 'react';
import { TaskAPI } from '@/lib/api/taskApi';

type Payload = Record<string, unknown>;

const DEBOUNCE_MS = 2000;
const localKey = (type: string) => `task-form-autosave:${type}`;

function readQueue(type: string): Payload[] {
  try {
    return JSON.parse(localStorage.getItem(localKey(type)) ?? '[]');
  } catch {
    return [];
  }
}

function pushToQueue(type: string, payload: Payload) {
  const q = readQueue(type);
  q.push(payload);
  localStorage.setItem(localKey(type), JSON.stringify(q));
}

function clearQueue(type: string) {
  localStorage.removeItem(localKey(type));
}

export interface UseTaskFormAutosaveReturn {
  isSaving: boolean;
  lastSavedAt: Date | null;
  /** Stage a payload and reset the 2 s debounce timer. */
  save: (payload: Payload) => void;
  /** Cancel the pending debounce and flush the staged payload immediately. */
  saveNow: () => Promise<void>;
  /** Cancel pending save, delete server-side draft and clear local queue. */
  clear: () => Promise<void>;
  /** Pause autosave (e.g. while loading a new draft). */
  suspend: () => void;
  /** Resume autosave after a suspend(). */
  resume: () => void;
}

export function useTaskFormAutosave(type: string): UseTaskFormAutosaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suspendAutoSaveRef = useRef(false);
  const pendingPayloadRef = useRef<Payload | null>(null);

  const flush = useCallback(
    async (payload: Payload) => {
      setIsSaving(true);
      try {
        await TaskAPI.putAutosave(type, payload);
        setLastSavedAt(new Date());
      } catch {
        if (!navigator.onLine) {
          pushToQueue(type, payload);
        }
      } finally {
        setIsSaving(false);
      }
    },
    [type],
  );

  const save = useCallback(
    (payload: Payload) => {
      pendingPayloadRef.current = payload;
      if (suspendAutoSaveRef.current) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        if (!suspendAutoSaveRef.current && pendingPayloadRef.current) {
          flush(pendingPayloadRef.current);
        }
      }, DEBOUNCE_MS);
    },
    [flush],
  );

  const saveNow = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (!pendingPayloadRef.current) return;
    await flush(pendingPayloadRef.current);
  }, [flush]);

  const clear = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    pendingPayloadRef.current = null;
    clearQueue(type);
    await TaskAPI.deleteAutosave(type);
  }, [type]);

  const suspend = useCallback(() => {
    suspendAutoSaveRef.current = true;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
  }, []);

  const resume = useCallback(() => {
    suspendAutoSaveRef.current = false;
  }, []);

  // Flush the offline queue when the connection is restored.
  useEffect(() => {
    const onOnline = async () => {
      const queue = readQueue(type);
      if (!queue.length) return;
      clearQueue(type);
      for (const payload of queue) {
        try {
          await TaskAPI.putAutosave(type, payload);
          setLastSavedAt(new Date());
        } catch {
          pushToQueue(type, payload);
          break;
        }
      }
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [type]);

  // Cancel any in-flight debounce on unmount.
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  return { isSaving, lastSavedAt, save, saveNow, clear, suspend, resume };
}
