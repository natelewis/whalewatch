import { parseCsvLine, extractUnderlyingTicker } from '../../commands/upsert-csv-trades';

describe('CSV Trades Upsert', () => {
  describe('extractUnderlyingTicker', () => {
    it('should extract underlying ticker from O: prefixed option tickers', () => {
      expect(extractUnderlyingTicker('O:AAPL240315C00150000')).toBe('AAPL');
      expect(extractUnderlyingTicker('O:GOOGL240315C00150000')).toBe('GOOGL');
      expect(extractUnderlyingTicker('O:TSLA240315P00150000')).toBe('TSLA');
    });

    it('should extract underlying ticker from non-O: prefixed option tickers', () => {
      expect(extractUnderlyingTicker('AAPL240315C00150000')).toBe('AAPL');
      expect(extractUnderlyingTicker('GOOGL240315C00150000')).toBe('GOOGL');
      expect(extractUnderlyingTicker('TSLA240315P00150000')).toBe('TSLA');
    });

    it('should return null for invalid tickers', () => {
      expect(extractUnderlyingTicker('')).toBeNull();
      expect(extractUnderlyingTicker('123456789')).toBeNull();
      expect(extractUnderlyingTicker('!@#$%')).toBeNull();
    });

    it('should handle edge cases', () => {
      expect(extractUnderlyingTicker('O:A')).toBe('A');
      expect(extractUnderlyingTicker('O:ZZZZZ240315C00150000')).toBe('ZZZZZ');
      expect(extractUnderlyingTicker('O:SPY240315C00150000')).toBe('SPY');
    });
  });

  describe('parseCsvLine', () => {
    it('should parse a valid CSV line correctly', () => {
      const line = 'O:AAPL240315C00150000,232,0,308,76.37,1758910424786000000,20';
      const result = parseCsvLine(line);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        ticker: 'O:AAPL240315C00150000',
        underlying_ticker: 'AAPL',
        timestamp: new Date(1758910424785), // Converted from nanoseconds (slight precision difference)
        price: 76.37,
        size: 20,
        conditions: '232',
        exchange: 308,
      });
    });

    it('should handle different option ticker formats', () => {
      const line = 'AAPL240315C00150000,232,0,308,76.37,1758910424786000000,20';
      const result = parseCsvLine(line);

      expect(result).not.toBeNull();
      expect(result?.ticker).toBe('AAPL240315C00150000');
      expect(result?.underlying_ticker).toBe('AAPL');
    });

    it('should return null for malformed lines', () => {
      expect(parseCsvLine('')).toBeNull();
      expect(parseCsvLine('invalid,line')).toBeNull();
      expect(parseCsvLine('O:AAPL240315C00150000,232,0')).toBeNull(); // Missing columns
    });

    it('should return null for lines with invalid numeric values', () => {
      expect(parseCsvLine('O:AAPL240315C00150000,232,0,invalid,76.37,1758910424786000000,20')).toBeNull();
      expect(parseCsvLine('O:AAPL240315C00150000,232,0,308,invalid,1758910424786000000,20')).toBeNull();
      expect(parseCsvLine('O:AAPL240315C00150000,232,0,308,76.37,invalid,20')).toBeNull();
      expect(parseCsvLine('O:AAPL240315C00150000,232,0,308,76.37,1758910424786000000,invalid')).toBeNull();
    });

    it('should return null for tickers that cannot extract underlying ticker', () => {
      const line = '123456789,232,0,308,76.37,1758910424786000000,20';
      const result = parseCsvLine(line);
      expect(result).toBeNull();
    });

    it('should handle empty conditions', () => {
      const line = 'O:AAPL240315C00150000,,0,308,76.37,1758910424786000000,20';
      const result = parseCsvLine(line);

      expect(result).not.toBeNull();
      expect(result?.conditions).toBe('[]');
    });

    it('should handle whitespace in CSV columns', () => {
      const line = ' O:AAPL240315C00150000 , 232 , 0 , 308 , 76.37 , 1758910424786000000 , 20 ';
      const result = parseCsvLine(line);

      expect(result).not.toBeNull();
      expect(result?.ticker).toBe('O:AAPL240315C00150000');
      expect(result?.conditions).toBe('232');
      expect(result?.exchange).toBe(308);
      expect(result?.price).toBe(76.37);
      expect(result?.size).toBe(20);
    });
  });

  describe('timestamp conversion', () => {
    it('should convert nanosecond timestamps correctly', () => {
      const line = 'O:AAPL240315C00150000,232,0,308,76.37,1758910424786000000,20';
      const result = parseCsvLine(line);

      expect(result).not.toBeNull();
      expect(result?.timestamp).toEqual(new Date(1758910424785));
    });

    it('should handle zero timestamps', () => {
      const line = 'O:AAPL240315C00150000,232,0,308,76.37,0,20';
      const result = parseCsvLine(line);

      expect(result).not.toBeNull();
      expect(result?.timestamp).toEqual(new Date(0));
    });
  });

  describe('real-world data examples', () => {
    it('should parse actual CSV data from the sample file', () => {
      const sampleLines = [
        'O:AAL260116C00012000,234,0,300,0.96,1758908438213000000,1500',
        'O:AAL260116P00011000,234,0,300,0.87,1758908438213000000,1500',
        'O:AAL260320P00009000,229,0,300,0.42,1758903424260000000,3900',
        'O:AAPL250926C00180000,232,0,308,76.37,1758910424786000000,20',
        'O:AAPL250926C00195000,232,0,308,60.45,1758901116548000000,20',
      ];

      sampleLines.forEach(line => {
        const result = parseCsvLine(line);
        expect(result).not.toBeNull();
        expect(result?.ticker).toBeTruthy();
        expect(result?.underlying_ticker).toBeTruthy();
        expect(result?.price).toBeGreaterThan(0);
        expect(result?.size).toBeGreaterThan(0);
        expect(result?.exchange).toBeGreaterThanOrEqual(0);
        expect(result?.timestamp).toBeInstanceOf(Date);
      });
    });
  });
});
