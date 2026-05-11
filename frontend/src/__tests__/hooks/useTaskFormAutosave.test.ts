import { renderHook, act } from '@testing-library/react';
import { useTaskFormAutosave } from '@/hooks/useTaskFormAutosave';
import { TaskAPI } from '@/lib/api/taskApi';

jest.mock('@/lib/api/taskApi', () => ({
  TaskAPI: {
    getAutosave: jest.fn(),
    putAutosave: jest.fn(),
    deleteAutosave: jest.fn(),
  },
}));

const mockPut = TaskAPI.putAutosave as jest.Mock;
const mockDelete = TaskAPI.deleteAutosave as jest.Mock;

const TYPE = 'budget';
const QUEUE_KEY = `task-form-autosave:${TYPE}`;

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  mockPut.mockResolvedValue({});
  mockDelete.mockResolvedValue(undefined);
  // Default: online
  Object.defineProperty(navigator, 'onLine', { writable: true, value: true });
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('useTaskFormAutosave', () => {
  it('starts with isSaving=false and lastSavedAt=null', () => {
    const { result } = renderHook(() => useTaskFormAutosave(TYPE));
    expect(result.current.isSaving).toBe(false);
    expect(result.current.lastSavedAt).toBeNull();
  });

  it('debounces saves and calls putAutosave after 2000 ms', async () => {
    const { result } = renderHook(() => useTaskFormAutosave(TYPE));
    const payload = { title: 'draft' };

    act(() => result.current.save(payload));
    expect(mockPut).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockPut).toHaveBeenCalledWith(TYPE, payload);
    expect(result.current.lastSavedAt).not.toBeNull();
  });

  it('resets the debounce timer on rapid save calls', async () => {
    const { result } = renderHook(() => useTaskFormAutosave(TYPE));

    act(() => result.current.save({ v: 1 }));
    act(() => {
      jest.advanceTimersByTime(1000);
      result.current.save({ v: 2 });
    });

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockPut).toHaveBeenCalledWith(TYPE, { v: 2 });
  });

  it('saveNow flushes staged payload immediately without waiting', async () => {
    const { result } = renderHook(() => useTaskFormAutosave(TYPE));
    const payload = { immediate: true };

    act(() => result.current.save(payload));

    await act(async () => {
      await result.current.saveNow();
    });

    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockPut).toHaveBeenCalledWith(TYPE, payload);
    expect(result.current.lastSavedAt).not.toBeNull();
  });

  it('saveNow does nothing when no payload has been staged', async () => {
    const { result } = renderHook(() => useTaskFormAutosave(TYPE));
    await act(async () => {
      await result.current.saveNow();
    });
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('clear cancels pending debounce and calls deleteAutosave', async () => {
    const { result } = renderHook(() => useTaskFormAutosave(TYPE));

    act(() => result.current.save({ x: 1 }));

    await act(async () => {
      await result.current.clear();
    });

    // Advance timer: no save should fire after clear.
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(mockPut).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith(TYPE);
  });

  it('suspend stops the debounced save from firing', async () => {
    const { result } = renderHook(() => useTaskFormAutosave(TYPE));

    act(() => {
      result.current.suspend();
      result.current.save({ x: 1 });
    });

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(mockPut).not.toHaveBeenCalled();
  });

  it('resume allows saves again after suspend', async () => {
    const { result } = renderHook(() => useTaskFormAutosave(TYPE));

    act(() => result.current.suspend());
    act(() => result.current.resume());
    act(() => result.current.save({ resumed: true }));

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(mockPut).toHaveBeenCalledWith(TYPE, { resumed: true });
  });

  it('pushes to localStorage queue when offline and save fails', async () => {
    Object.defineProperty(navigator, 'onLine', { writable: true, value: false });
    mockPut.mockRejectedValueOnce(new Error('Network Error'));

    const { result } = renderHook(() => useTaskFormAutosave(TYPE));
    const payload = { offline: true };

    act(() => result.current.save(payload));

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
    expect(queue).toContainEqual(payload);
  });

  it('flushes the offline queue when the online event fires', async () => {
    // Seed queue manually.
    localStorage.setItem(QUEUE_KEY, JSON.stringify([{ queued: true }]));

    renderHook(() => useTaskFormAutosave(TYPE));

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    expect(mockPut).toHaveBeenCalledWith(TYPE, { queued: true });
    expect(localStorage.getItem(QUEUE_KEY)).toBeNull();
  });

  it('re-queues if flush fails while coming back online', async () => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify([{ queued: true }]));
    mockPut.mockRejectedValueOnce(new Error('Still failing'));

    renderHook(() => useTaskFormAutosave(TYPE));

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    const remaining = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
    expect(remaining).toContainEqual({ queued: true });
  });
});
