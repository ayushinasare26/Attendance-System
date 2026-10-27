'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ManagerRootPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/manager/dashboard');
  }, [router]);

  return (
    <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
      <div className="spinner-border text-warning" role="status">
        <span className="visually-hidden">Loading Manager Dashboard...</span>
      </div>
    </div>
  );
}
