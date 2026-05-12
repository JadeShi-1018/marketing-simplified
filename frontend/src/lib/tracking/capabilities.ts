// Tier 1: Chrome 100+ / Edge 100+ / Safari 15+ / Firefox 116+
// Tier 2: older Safari/Firefox — keepalive not supported, Celery TIMEOUT fallback
// Tier 3: IE / old browsers — tracking not started at all
export const canKeepalive = (() => {
  try {
    return 'keepalive' in new Request('/', { method: 'POST', keepalive: true });
  } catch {
    return false;
  }
})();
