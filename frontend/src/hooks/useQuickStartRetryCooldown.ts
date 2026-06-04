'use client';

import { useCallback, useEffect, useState } from 'react';

export function useQuickStartRetryCooldown() {
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const startCooldown = useCallback((seconds: number) => {
    const until = Date.now() + seconds * 1000;
    setCooldownUntil(until);
    setSecondsLeft(seconds);
  }, []);

  const clearCooldown = useCallback(() => {
    setCooldownUntil(null);
    setSecondsLeft(0);
  }, []);

  useEffect(() => {
    if (!cooldownUntil) return;

    const tick = () => {
      const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        clearCooldown();
        return;
      }
      setSecondsLeft(remaining);
    };

    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [cooldownUntil, clearCooldown]);

  const isCoolingDown = secondsLeft > 0;

  return { isCoolingDown, secondsLeft, startCooldown, clearCooldown };
}
