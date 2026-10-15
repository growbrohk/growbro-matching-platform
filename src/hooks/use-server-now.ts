import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Current time aligned to the database clock.
 *
 * The offset is measured once: server time minus the midpoint of the request,
 * so a slow response does not shift the clock by the full round trip.
 * After that, the adjusted time ticks every second. If the server time cannot
 * be read, the device clock is used (offset 0).
 */
export function useServerNow(): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const offsetRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const requestStart = Date.now();

    supabase.rpc('get_server_time').then(({ data, error }) => {
      if (cancelled || error || data == null) {
        if (error) {
          console.error('[useServerNow] Failed to read server time:', error);
        }
        return;
      }
      const serverMs = new Date(data).getTime();
      if (Number.isNaN(serverMs)) return;
      const requestEnd = Date.now();
      offsetRef.current = serverMs - (requestStart + requestEnd) / 2;
      setNowMs(Date.now() + offsetRef.current);
    });

    const id = window.setInterval(() => {
      setNowMs(Date.now() + offsetRef.current);
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return nowMs;
}
