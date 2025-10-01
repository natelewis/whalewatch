/**
 * Utility functions for parsing option ticker symbols
 * Handles formats like: O:TSLA251003P00475000
 */

export interface ParsedOptionTicker {
  underlyingTicker: string;
  expirationDate: string; // YYYY-MM-DD format
  optionType: 'call' | 'put';
  strikePrice: number;
}

/**
 * Parse an option ticker symbol to extract underlying ticker, expiration date, option type, and strike price
 *
 * Format: O:TSLA251003P00475000
 * - O: prefix
 * - TSLA: underlying ticker (variable length)
 * - 251003: expiration date (YYMMDD format)
 * - P: option type (C for call, P for put)
 * - 00475000: strike price (in cents, e.g., 475.00)
 *
 * @param ticker - The option ticker symbol to parse
 * @returns ParsedOptionTicker object or null if parsing fails
 */
export function parseOptionTicker(ticker: string): ParsedOptionTicker | null {
  try {
    if (!ticker || typeof ticker !== 'string') {
      return null;
    }

    // Remove the O: prefix if present
    const cleanTicker = ticker.startsWith('O:') ? ticker.substring(2) : ticker;

    // Pattern: [UNDERLYING][YYMMDD][C|P][STRIKE_IN_CENTS]
    // Example: TSLA251003P00475000
    const match = cleanTicker.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);

    if (!match) {
      console.warn(`Failed to parse option ticker: ${ticker}`);
      return null;
    }

    const [, underlyingTicker, dateStr, optionTypeChar, strikeStr] = match;

    // Parse expiration date (YYMMDD -> YYYY-MM-DD)
    const year = parseInt(`20${dateStr.substring(0, 2)}`);
    const month = parseInt(dateStr.substring(2, 4));
    const day = parseInt(dateStr.substring(4, 6));

    // Validate date - create UTC date to avoid timezone issues
    const expirationDate = new Date(Date.UTC(year, month - 1, day));
    if (
      expirationDate.getUTCFullYear() !== year ||
      expirationDate.getUTCMonth() !== month - 1 ||
      expirationDate.getUTCDate() !== day
    ) {
      console.warn(`Invalid date in ticker: ${ticker}`);
      return null;
    }

    const expirationDateStr = expirationDate.toISOString().split('T')[0]; // YYYY-MM-DD

    // Parse option type
    const optionType = optionTypeChar === 'C' ? 'call' : 'put';

    // Parse strike price (convert from thousandths to dollars)
    const strikePrice = parseInt(strikeStr) / 1000; // Convert from thousandths to dollars

    return {
      underlyingTicker,
      expirationDate: expirationDateStr,
      optionType,
      strikePrice,
    };
  } catch (error) {
    console.error(`Error parsing option ticker ${ticker}:`, error);
    return null;
  }
}

/**
 * Validate if a ticker follows the expected option ticker format
 * @param ticker - The ticker to validate
 * @returns boolean indicating if the ticker is valid
 */
export function isValidOptionTicker(ticker: string): boolean {
  return parseOptionTicker(ticker) !== null;
}
