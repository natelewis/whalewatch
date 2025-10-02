import { isValidOptionTicker, parseOptionTicker } from '@whalewatch/shared';

describe('Option Ticker Validation', () => {
  it('should validate stock tickers', () => {
    expect(isValidOptionTicker('AAPL')).toBe(false);
    expect(isValidOptionTicker('TSLA')).toBe(false);
    expect(isValidOptionTicker('MSFT')).toBe(false);
  });

  it('should validate option tickers with O: prefix', () => {
    expect(isValidOptionTicker('O:AAPL251003C00150000')).toBe(true);
    expect(isValidOptionTicker('O:TSLA251003P00475000')).toBe(true);
    expect(isValidOptionTicker('O:MSFT251003C00200000')).toBe(true);
  });

  it('should validate option tickers without O: prefix', () => {
    expect(isValidOptionTicker('AAPL251003C00150000')).toBe(true);
    expect(isValidOptionTicker('TSLA251003P00475000')).toBe(true);
    expect(isValidOptionTicker('MSFT251003C00200000')).toBe(true);
  });

  it('should reject invalid option tickers', () => {
    expect(isValidOptionTicker('INVALID')).toBe(false);
    expect(isValidOptionTicker('AAPL251003X00150000')).toBe(false); // Invalid option type
    expect(isValidOptionTicker('AAPL25103C00150000')).toBe(false); // Invalid date format
    expect(isValidOptionTicker('')).toBe(false);
  });

  it('should parse option tickers correctly', () => {
    const parsed = parseOptionTicker('O:AAPL251003C00150000');
    expect(parsed).toEqual({
      underlyingTicker: 'AAPL',
      expirationDate: '2025-10-03',
      optionType: 'call',
      strikePrice: 150.0,
    });

    const parsedPut = parseOptionTicker('TSLA251003P00475000');
    expect(parsedPut).toEqual({
      underlyingTicker: 'TSLA',
      expirationDate: '2025-10-03',
      optionType: 'put',
      strikePrice: 475.0,
    });
  });

  it('should handle edge cases', () => {
    expect(parseOptionTicker('')).toBeNull();
    expect(parseOptionTicker('INVALID')).toBeNull();
    expect(parseOptionTicker('AAPL251003C00150000')).not.toBeNull();
  });
});
