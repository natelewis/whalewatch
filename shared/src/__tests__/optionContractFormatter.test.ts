import { describe, it, expect } from 'vitest';
import { getDisplayName, humanizeOptionContract, formatOptionContractName } from '@whalewatch/shared';

describe('Option Contract Formatter', () => {
  describe('formatOptionContractName', () => {
    it('should format a parsed option ticker correctly', () => {
      const parsed = {
        underlyingTicker: 'PL',
        expirationDate: '2025-01-21',
        optionType: 'call' as const,
        strikePrice: 12,
      };

      const result = formatOptionContractName(parsed);
      expect(result).toBe('PL $12 Call 1/21/2025');
    });

    it('should format a put option correctly', () => {
      const parsed = {
        underlyingTicker: 'AAPL',
        expirationDate: '2025-03-15',
        optionType: 'put' as const,
        strikePrice: 150,
      };

      const result = formatOptionContractName(parsed);
      expect(result).toBe('AAPL $150 Put 3/15/2025');
    });
  });

  describe('humanizeOptionContract', () => {
    it('should humanize a valid option ticker', () => {
      const ticker = 'O:PL251003C00012000';
      const result = humanizeOptionContract(ticker);
      expect(result).toBe('PL $12 Call 1/21/2025');
    });

    it('should return original ticker if parsing fails', () => {
      const ticker = 'INVALID_TICKER';
      const result = humanizeOptionContract(ticker);
      expect(result).toBe('INVALID_TICKER');
    });
  });

  describe('getDisplayName', () => {
    it('should return humanized name for option tickers', () => {
      const optionTicker = 'O:PL251003C00012000';
      const result = getDisplayName(optionTicker);
      expect(result).toBe('PL $12 Call 1/21/2025');
    });

    it('should return original ticker for non-option symbols', () => {
      const stockTicker = 'AAPL';
      const result = getDisplayName(stockTicker);
      expect(result).toBe('AAPL');
    });

    it('should handle option tickers without O: prefix', () => {
      const optionTicker = 'PL251003C00012000';
      const result = getDisplayName(optionTicker);
      expect(result).toBe('PL $12 Call 1/21/2025');
    });
  });
});
