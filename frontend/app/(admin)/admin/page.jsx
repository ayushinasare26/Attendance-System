'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminRootPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/dashboard');
  }, [router]);

  return (
    <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
      <div className="spinner-border text-primary" role="status">
        <span className="visually-hidden">Loading Admin Dashboard...</span>
      </div>
    </div>
  );
}
