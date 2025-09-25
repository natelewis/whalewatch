/**
 * Production-safe logging utility for server
 * Only logs in development environment
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

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
      console.error('[Server Error]', args[0]);
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

  server: {
    startup: (...args: unknown[]) => {
      if (isDevelopment) {
        console.log('🚀', ...args);
      }
    },
    auth: (...args: unknown[]) => {
      if (isDevelopment) {
        console.log('🔐', ...args);
      }
    },
    api: (...args: unknown[]) => {
      if (isDevelopment) {
        console.log('🌐', ...args);
      }
    },
    websocket: (...args: unknown[]) => {
      if (isDevelopment) {
        console.log('🔌', ...args);
      }
    },
    database: (...args: unknown[]) => {
      if (isDevelopment) {
        console.log('🗄️', ...args);
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
    cleanup: (...args: unknown[]) => {
      if (isDevelopment) {
        console.log('🧹', ...args);
      }
    },
  },
};
