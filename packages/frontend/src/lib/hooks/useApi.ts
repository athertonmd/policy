'use client';

import { useState, useCallback } from 'react';

import { apiClient, type ApiError } from '@/lib/api-client';

interface UseApiState<T> {
  data: T | null;
  error: ApiError | null;
  isLoading: boolean;
}

/**
 * Hook for making API calls with loading and error state management.
 */
export function useApi<T>(
  apiCall: () => Promise<T>
): UseApiState<T> & { execute: () => Promise<T | null>; reset: () => void } {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    error: null,
    isLoading: false,
  });

  const execute = useCallback(async () => {
    setState({ data: null, error: null, isLoading: true });
    try {
      const data = await apiCall();
      setState({ data, error: null, isLoading: false });
      return data;
    } catch (err) {
      const apiError = err as ApiError;
      setState({ data: null, error: apiError, isLoading: false });
      return null;
    }
  }, [apiCall]);

  const reset = useCallback(() => {
    setState({ data: null, error: null, isLoading: false });
  }, []);

  return { ...state, execute, reset };
}

/**
 * Hook for polling an API endpoint at a regular interval.
 */
export function usePolling<T>(
  apiCall: () => Promise<T>,
  intervalMs: number = 30000
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const startPolling = useCallback(() => {
    setIsPolling(true);
    const interval = setInterval(() => {
      void (async () => {
        try {
          const result = await apiCall();
          setData(result);
          setError(null);
        } catch (err) {
          setError(err as ApiError);
        }
      })();
    }, intervalMs);

    return () => {
      clearInterval(interval);
      setIsPolling(false);
    };
  }, [apiCall, intervalMs]);

  return { data, error, isPolling, startPolling };
}

export { apiClient };
