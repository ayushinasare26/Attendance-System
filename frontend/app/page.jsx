'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    async function checkAuthAndRedirect() {
      try {
        const res = await api.get('/');
        if (!isMounted) return;
        if (res && res.redirect) {
          router.replace(res.redirect);
        } else {
          router.replace('/employee/login');
        }
      } catch (err) {
        if (!isMounted) return;
        router.replace('/employee/login');
      }
    }
    checkAuthAndRedirect();
    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <div className="d-flex align-items-center justify-content-center min-vh-100 bg-light">
      <div className="text-center">
        <div className="spinner-border text-primary mb-3" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <div className="text-muted small fw-medium">Loading GeoFace Enterprise...</div>
      </div>
    </div>
  );
}
