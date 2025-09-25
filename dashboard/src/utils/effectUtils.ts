import { useEffect, useRef, useCallback, useState } from 'react';
import { logger } from './logger';

export interface RefUpdateConfig<T = unknown> {
  ref: React.MutableRefObject<T>;
  value: T;
  logMessage?: string;
}

/**
 * Hook for updating multiple refs in a single effect
 */
export const useRefUpdates = (configs: RefUpdateConfig[]) => {
  useEffect(() => {
    configs.forEach(({ ref, value, logMessage }) => {
      ref.current = value;
      if (logMessage) {
        logger.chart.data(logMessage, { value });
      }
    });
  }, [configs.map(c => c.value).join(',')]);
};

/**
 * Hook for managing cleanup functions
 */
export const useCleanup = (cleanupFn: () => void, deps: unknown[] = []) => {
  useEffect(() => {
    return cleanupFn;
  }, deps);
};

/**
 * Hook for debounced operations
 */
export const useDebouncedEffect = (effect: () => void, deps: unknown[], delay: number) => {
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(effect, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, deps);
};

/**
 * Hook for managing loading states
 */
export const useLoadingState = (initialState: boolean = false) => {
  const loadingRef = useRef(initialState);
  const [isLoading, setIsLoading] = useState(initialState);

  const setLoading = useCallback((loading: boolean) => {
    loadingRef.current = loading;
    setIsLoading(loading);
  }, []);

  const getLoading = useCallback(() => loadingRef.current, []);

  return { isLoading, setLoading, getLoading };
};

/**
 * Hook for managing effect dependencies with logging
 */
export const useLoggedEffect = (effect: () => void | (() => void), deps: unknown[], logMessage: string) => {
  useEffect(() => {
    logger.chart.data(`${logMessage} effect triggered:`, {
      deps: deps.map((dep, index) => ({ index, value: dep })),
    });

    const cleanup = effect();

    return cleanup;
  }, deps);
};

/**
 * Hook for managing conditional effects
 */
export const useConditionalEffect = (condition: boolean, effect: () => void | (() => void), deps: unknown[]) => {
  useEffect(() => {
    if (condition) {
      return effect();
    }
  }, [condition, ...deps]);
};
