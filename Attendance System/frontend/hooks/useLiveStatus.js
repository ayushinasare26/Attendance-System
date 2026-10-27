'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

export function useLiveStatus(isFlexible, initialData = null) {
  const [data, setData] = useState(initialData);

  const fetchStatus = useCallback(async () => {
    if (!isFlexible) return;
    try {
      // Try mirrored endpoint
      const res = await api.get('/employee/api/employee/live-status');
      if (res && res.success && res.is_flexible && res.data) {
        setData(res.data);
      }
    } catch (e) {
      // Silent error during background poll
    }
  }, [isFlexible]);

  useEffect(() => {
    if (!isFlexible) return;
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, [isFlexible, fetchStatus]);

  return { data, setData, refreshStatus: fetchStatus };
}

export default useLiveStatus;
