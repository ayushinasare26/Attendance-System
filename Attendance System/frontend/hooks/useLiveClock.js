'use client';

import { useState, useEffect } from 'react';

/**
 * useLiveClock - Live 1-second real-time clock with hydration mismatch protection.
 */
export function useLiveClock() {
  const [timeStr, setTimeStr] = useState('--:--:--');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const update = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return { timeStr: mounted ? timeStr : '--:--:--', mounted };
}

export default useLiveClock;
