/**
 * Utility functions for formatting option contract names in a human-readable format
 */

import { parseOptionTicker, ParsedOptionTicker } from './optionTickerParser';

/**
 * Format a parsed option ticker into a human-readable contract name
 * @param parsed - The parsed option ticker data
 * @returns Human-readable contract name like "PL $12 Call 1/21/2028"
 */
export function formatOptionContractName(parsed: ParsedOptionTicker): string {
  const { underlyingTicker, expirationDate, optionType, strikePrice } = parsed;

  // Format the expiration date as M/D/YYYY
  const date = new Date(expirationDate);
  const formattedDate = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;

  // Capitalize the option type
  const capitalizedType = optionType.charAt(0).toUpperCase() + optionType.slice(1);

  // Format strike price with dollar sign
  const formattedStrike = `$${strikePrice}`;

  return `${underlyingTicker} ${formattedStrike} ${capitalizedType} ${formattedDate}`;
}

/**
 * Humanize an option contract ticker symbol into a readable format
 * @param ticker - The option ticker symbol (e.g., "O:PL251003C00012000")
 * @returns Human-readable contract name or the original ticker if parsing fails
 */
export function humanizeOptionContract(ticker: string): string {
  const parsed = parseOptionTicker(ticker);

  if (!parsed) {
    // If parsing fails, return the original ticker
    return ticker;
  }

  return formatOptionContractName(parsed);
}

/**
 * Check if a ticker is an option contract and return humanized version if so
 * @param ticker - The ticker symbol to check
 * @returns Humanized option contract name if it's an option, otherwise the original ticker
 */
export function getDisplayName(ticker: string): string {
  // Check if it's an option ticker (starts with O: or matches option pattern)
  if (ticker.startsWith('O:') || /^[A-Z]+\d{6}[CP]\d{8}$/.test(ticker)) {
    return humanizeOptionContract(ticker);
  }

  // Return original ticker for non-option symbols
  return ticker;
}
