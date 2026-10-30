'use client';

import React from 'react';
import { useAuth } from '@/lib/authContext';

export default function FlashBanner({ customFlashes = [] }) {
  const { flashes, removeFlash } = useAuth();
  const allFlashes = [...flashes, ...customFlashes];

  if (!allFlashes.length) return null;

  return (
    <div className="flash-banners-wrapper mb-3">
      {allFlashes.map((f) => {
        const cat = f.category === 'error' ? 'danger' : f.category || 'info';
        return (
          <div
            key={f.id || f.message}
            className={`alert alert-${cat} alert-dismissible fade show rounded-3 shadow-sm py-2 px-3 small`}
            role="alert"
          >
            <i className="bi bi-info-circle me-1"></i> {f.message}
            <button
              type="button"
              className="btn-close"
              aria-label="Close"
              onClick={() => f.id && removeFlash(f.id)}
            ></button>
          </div>
        );
      })}
    </div>
  );
}
