import { logger } from './logger';

/**
 * Utility for logging errors with context
 */
export const logError = (error: Error | string, context: string, additionalInfo?: Record<string, unknown>) => {
  const errorMessage = error instanceof Error ? error.message : error;

  logger.error(`Error in ${context}:`, {
    message: errorMessage,
    stack: error instanceof Error ? error.stack : undefined,
    ...additionalInfo,
  });
};
