import { useEffect, useRef, useCallback, useState } from 'react';
import { ChartDimensions, CandlestickData } from '../types';
import { logger } from './logger';

export interface RefUpdateConfig {
  ref: React.MutableRefObject<any>;
  value: any;
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
export const useCleanup = (cleanupFn: () => void, deps: any[] = []) => {
  useEffect(() => {
    return cleanupFn;
  }, deps);
};

/**
 * Hook for debounced operations
 */
export const useDebouncedEffect = (effect: () => void, deps: any[], delay: number) => {
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
 * Hook for managing refs that track previous values
 */
export const usePreviousValue = <T>(value: T): T | undefined => {
  const ref = useRef<T>();

  useEffect(() => {
    ref.current = value;
  });

  return ref.current;
};

/**
 * Hook for managing refs that track state changes
 */
export const useStateChangeTracker = <T>(value: T, onChange?: (newValue: T, prevValue: T | undefined) => void) => {
  const prevValueRef = useRef<T>();

  useEffect(() => {
    if (prevValueRef.current !== value) {
      onChange?.(value, prevValueRef.current);
      prevValueRef.current = value;
    }
  }, [value, onChange]);

  return prevValueRef.current;
};

/**
 * Hook for managing multiple refs with a single effect
 */
export const useMultipleRefs = <T extends Record<string, any>>(
  initialValues: T
): [T, (updates: Partial<T>) => void] => {
  const refs = useRef<T>(initialValues);

  const updateRefs = useCallback((updates: Partial<T>) => {
    Object.assign(refs.current, updates);
  }, []);

  return [refs.current, updateRefs];
};

/**
 * Hook for managing effect dependencies with logging
 */
export const useLoggedEffect = (effect: () => void | (() => void), deps: any[], logMessage: string) => {
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
export const useConditionalEffect = (condition: boolean, effect: () => void | (() => void), deps: any[]) => {
  useEffect(() => {
    if (condition) {
      return effect();
    }
  }, [condition, ...deps]);
};

/**
 * Hook for managing effect with timeout
 */
export const useTimeoutEffect = (effect: () => void, deps: any[], timeout: number) => {
  useEffect(() => {
    const timer = setTimeout(effect, timeout);
    return () => clearTimeout(timer);
  }, deps);
};

/**
 * Hook for managing effect with interval
 */
export const useIntervalEffect = (effect: () => void, deps: any[], interval: number) => {
  useEffect(() => {
    const timer = setInterval(effect, interval);
    return () => clearInterval(timer);
  }, deps);
};

/**
 * Hook for managing effect with immediate execution
 */
export const useImmediateEffect = (effect: () => void | (() => void), deps: any[]) => {
  useEffect(() => {
    return effect();
  }, deps);
};

/**
 * Hook for managing effect with cleanup on unmount
 */
export const useCleanupOnUnmount = (cleanupFn: () => void) => {
  useEffect(() => {
    return cleanupFn;
  }, []);
};

/**
 * Hook for managing effect with dependency tracking
 */
export const useDependencyTracker = (deps: any[]) => {
  const prevDepsRef = useRef<any[]>();

  useEffect(() => {
    const changed = prevDepsRef.current ? deps.some((dep, index) => dep !== prevDepsRef.current![index]) : true;

    if (changed) {
      logger.chart.data('Dependencies changed:', {
        prev: prevDepsRef.current,
        current: deps,
      });
    }

    prevDepsRef.current = deps;
  });

  return prevDepsRef.current;
};
