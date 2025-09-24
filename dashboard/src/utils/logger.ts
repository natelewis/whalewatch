/**
 * Production-safe logging utility
 * Only logs in development environment
 */

const isDevelopment = import.meta.env.DEV;

export const logger = {
  /**
   * Log info messages (only in development)
   */
  info: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  /**
   * Log warning messages (only in development)
   */
  warn: (...args: unknown[]) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },

  /**
   * Log error messages (always logged, but with context)
   */
  error: (...args: unknown[]) => {
    if (isDevelopment) {
      console.error(...args);
    } else {
      // In production, you might want to send errors to a logging service
      // For now, we'll still log errors but without the full context
      console.error('[Chart Error]', args[0]);
    }
  },

  /**
   * Log debug messages (only in development)
   */
  debug: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log('[DEBUG]', ...args);
    }
  },

  /**
   * Log performance timing (only in development)
   */
  time: (label: string) => {
    if (isDevelopment) {
      console.time(label);
    }
  },

  /**
   * End performance timing (only in development)
   */
  timeEnd: (label: string) => {
    if (isDevelopment) {
      console.timeEnd(label);
    }
  },

  /**
   * Log chart-specific messages with emoji prefixes (only in development)
   */
  chart: {
    data: (...args: unknown[]) => {
      if (isDevelopment) {
        console.log('📊', ...args);
      }
    },
    render: (...args: unknown[]) => {
      if (isDevelopment) {
        console.log('🎨', ...args);
      }
    },
    websocket: (...args: unknown[]) => {
      if (isDevelopment) {
        console.log('🌐', ...args);
      }
    },
    viewport: (...args: unknown[]) => {
      if (isDevelopment) {
        console.log('🔍', ...args);
      }
    },
    performance: (...args: unknown[]) => {
      if (isDevelopment) {
        console.log('⏱️', ...args);
      }
    },
    success: (...args: unknown[]) => {
      if (isDevelopment) {
        console.log('✅', ...args);
      }
    },
    warning: (...args: unknown[]) => {
      if (isDevelopment) {
        console.log('⚠️', ...args);
      }
    },
    error: (...args: unknown[]) => {
      if (isDevelopment) {
        console.log('❌', ...args);
      }
    },
    loading: (...args: unknown[]) => {
      if (isDevelopment) {
        console.log('🔄', ...args);
      }
    },
    skip: (...args: unknown[]) => {
      if (isDevelopment) {
        console.log('⏸️', ...args);
      }
    },
    cleanup: (...args: unknown[]) => {
      if (isDevelopment) {
        console.log('🧹', ...args);
      }
    },
    fix: (...args: unknown[]) => {
      if (isDevelopment) {
        console.log('🔧', ...args);
      }
    },
    target: (...args: unknown[]) => {
      if (isDevelopment) {
        console.log('🎯', ...args);
      }
    },
  },
};
