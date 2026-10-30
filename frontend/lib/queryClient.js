/**
 * frontend/lib/queryClient.js
 *
 * Configures TanStack Query with standard retry and refetch policies.
 */

import { QueryClient } from '@tanstack/react-query';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10 * 1000, // 10 seconds default stale time
        retry: (failureCount, error) => {
          // Do not retry on 401 or 403 authorization failures
          if (error && (error.status === 401 || error.status === 403)) {
            return false;
          }
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
    },
  });
}

let browserQueryClient = null;

export function getQueryClient() {
  if (typeof window === 'undefined') {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

export default getQueryClient;
