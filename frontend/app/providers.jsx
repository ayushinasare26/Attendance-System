'use client';

import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/lib/authContext';

export function Providers({ children }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default Providers;
