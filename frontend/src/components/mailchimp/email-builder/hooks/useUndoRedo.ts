"use client";

import { useCallback, useRef, useState } from "react";

type StructuredClone = <T>(value: T) => T;

const getStructuredClone = (): StructuredClone | null => {
  const globalClone = (globalThis as { structuredClone?: StructuredClone })
    .structuredClone;
  if (typeof globalClone === "function") {
    return globalClone;
  }
  return null;
};

const cloneState = <T>(value: T): T => {
  const structuredClone = getStructuredClone();
  if (structuredClone) {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

interface UseUndoRedoOptions<T> {
  initialState: T;
  capacity?: number;
}

interface UndoRedoStack<T> {
  history: T[];
  future: T[];
}

export const useUndoRedo = <T,>({
  initialState,
  capacity = 50,
}: UseUndoRedoOptions<T>) => {
  const initialSnapshotRef = useRef<T>(cloneState(initialState));
  const [stack, setStack] = useState<UndoRedoStack<T>>(() => ({
    history: [cloneState(initialSnapshotRef.current)],
    future: [],
  }));
  const stackRef = useRef(stack);
  stackRef.current = stack;

  const saveSnapshot = useCallback(
    (state: T) => {
      setStack((prev) => {
        const lastSnapshot = prev.history[prev.history.length - 1];
        const serializedLast = JSON.stringify(lastSnapshot);
        const serializedNext = JSON.stringify(state);
        if (serializedLast === serializedNext) {
          return prev;
        }

        const nextHistory = [...prev.history, cloneState(state)];
        if (nextHistory.length > capacity) {
          nextHistory.shift();
        }
        const nextStack = { history: nextHistory, future: [] as T[] };
        stackRef.current = nextStack;
        return nextStack;
      });
    },
    [capacity]
  );

  const undo = useCallback((): T | null => {
    const prev = stackRef.current;
    if (prev.history.length <= 1) {
      return null;
    }
    const nextHistory = [...prev.history];
    const current = nextHistory.pop();
    if (!current) {
      return null;
    }
    const previous = nextHistory[nextHistory.length - 1];
    const snapshot = cloneState(previous);
    const nextStack = {
      history: nextHistory,
      future: [cloneState(current), ...prev.future],
    };
    stackRef.current = nextStack;
    setStack(nextStack);
    return snapshot;
  }, []);

  const redo = useCallback((): T | null => {
    const prev = stackRef.current;
    if (prev.future.length === 0) {
      return null;
    }
    const [next, ...restFuture] = prev.future;
    const snapshot = cloneState(next);
    const nextStack = {
      history: [...prev.history, cloneState(next)],
      future: restFuture,
    };
    stackRef.current = nextStack;
    setStack(nextStack);
    return snapshot;
  }, []);

  const reset = useCallback((state: T) => {
    const cloned = cloneState(state);
    initialSnapshotRef.current = cloned;
    const nextStack = {
      history: [cloned],
      future: [] as T[],
    };
    stackRef.current = nextStack;
    setStack(nextStack);
  }, []);

  const canUndo = stack.history.length > 1;
  const canRedo = stack.future.length > 0;

  return {
    saveSnapshot,
    undo,
    redo,
    reset,
    canUndo,
    canRedo,
  };
};


