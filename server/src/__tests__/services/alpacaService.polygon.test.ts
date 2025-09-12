import { alpacaService } from '../../services/alpacaService';
import { PolygonService } from '../../services/polygonService';
import { PolygonOptionsTrade, PolygonOptionsContract } from '../../types';

// Mock the polygon service
jest.mock('../../services/polygonService');

describe('AlpacaService - Polygon Integration', () => {
  let mockPolygonService: jest.Mocked<PolygonService>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a mock instance
    mockPolygonService = {
      getOptionsTrades: jest.fn(),
      getOptionsContracts: jest.fn(),
      getContractTrades: jest.fn(),
      validateApiKey: jest.fn(),
    } as any;

    // Mock the polygonService export
    (PolygonService as any).mockImplementation(() => mockPolygonService);
  });

  describe('getOptionsTrades with Polygon', () => {
    const mockPolygonTrades: PolygonOptionsTrade[] = [
      {
        id: 'polygon-trade-1',
        conditions: [1, 2],
        exchange: 1,
        price: 2.50,
        size: 100,
        timestamp: 1640995200000000000, // 2022-01-01T00:00:00Z in nanoseconds
        participant_timestamp: 1640995200000000000,
        sip_timestamp: 1640995200000000000,
        tape: 1,
      },
      {
        id: 'polygon-trade-2',
        conditions: [1],
        exchange: 2,
        price: 1.75,
        size: 200,
        timestamp: 1640995260000000000, // 2022-01-01T00:01:00Z in nanoseconds
        participant_timestamp: 1640995260000000000,
        sip_timestamp: 1640995260000000000,
        tape: 2,
      },
    ];

    const mockContracts: PolygonOptionsContract[] = [
      {
        cfi: 'OC',
        contract_type: 'call',
        exercise_style: 'american',
        expiration_date: '2025-01-17',
        primary_exchange: 'CBOE',
        shares_per_contract: 100,
        strike_price: 250.0,
        ticker: 'O:AAPL250117C00250000',
        underlying_ticker: 'AAPL',
      },
      {
        cfi: 'OP',
        contract_type: 'put',
        exercise_style: 'american',
        expiration_date: '2025-01-17',
        primary_exchange: 'CBOE',
        shares_per_contract: 100,
        strike_price: 200.0,
        ticker: 'O:AAPL250117P00200000',
        underlying_ticker: 'AAPL',
      },
    ];

    it('should successfully fetch and convert Polygon trades', async () => {
      mockPolygonService.getOptionsTrades.mockResolvedValueOnce(mockPolygonTrades);
      mockPolygonService.getOptionsContracts.mockResolvedValueOnce(mockContracts);

      const result = await alpacaService.getOptionsTrades('AAPL', 1);

      expect(mockPolygonService.getOptionsTrades).toHaveBeenCalledWith('AAPL', 1, 1000);
      expect(mockPolygonService.getOptionsContracts).toHaveBeenCalledWith('AAPL', 1000);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'polygon-trade-1',
        price: 2.50,
        size: 100,
        timestamp: '2022-01-01T00:00:00.000Z',
        exchange: 'CBOE',
        tape: 'A',
        contract: {
          underlying_symbol: 'AAPL',
          exercise_style: 'american',
        },
      });
    });

    it('should throw error when Polygon API fails', async () => {
      mockPolygonService.getOptionsTrades.mockRejectedValueOnce(
        new Error('Polygon API error')
      );

      await expect(alpacaService.getOptionsTrades('AAPL', 1)).rejects.toThrow('Polygon API error');
      expect(mockPolygonService.getOptionsTrades).toHaveBeenCalledWith('AAPL', 1, 1000);
    });

    it('should handle empty Polygon results', async () => {
      mockPolygonService.getOptionsTrades.mockResolvedValueOnce([]);
      mockPolygonService.getOptionsContracts.mockResolvedValueOnce([]);

      const result = await alpacaService.getOptionsTrades('AAPL', 1);

      expect(result).toHaveLength(0);
    });

    it('should throw error when contracts API fails', async () => {
      mockPolygonService.getOptionsTrades.mockResolvedValueOnce(mockPolygonTrades);
      mockPolygonService.getOptionsContracts.mockRejectedValueOnce(
        new Error('Contracts API error')
      );

      await expect(alpacaService.getOptionsTrades('AAPL', 1)).rejects.toThrow('Contracts API error');
    });

    it('should convert timestamps correctly', async () => {
      mockPolygonService.getOptionsTrades.mockResolvedValueOnce(mockPolygonTrades);
      mockPolygonService.getOptionsContracts.mockResolvedValueOnce(mockContracts);

      const result = await alpacaService.getOptionsTrades('AAPL', 1);

      expect(result[0].timestamp).toBe('2022-01-01T00:00:00.000Z');
      expect(result[1].timestamp).toBe('2022-01-01T00:01:00.000Z');
    });

    it('should map exchange codes correctly', async () => {
      const tradesWithDifferentExchanges: PolygonOptionsTrade[] = [
        {
          id: 'trade-1',
          conditions: [1],
          exchange: 1, // CBOE
          price: 2.50,
          size: 100,
          timestamp: 1640995200000000000,
          participant_timestamp: 1640995200000000000,
          sip_timestamp: 1640995200000000000,
          tape: 1,
        },
        {
          id: 'trade-2',
          conditions: [1],
          exchange: 11, // NASDAQ
          price: 1.75,
          size: 200,
          timestamp: 1640995260000000000,
          participant_timestamp: 1640995260000000000,
          sip_timestamp: 1640995260000000000,
          tape: 1,
        },
        {
          id: 'trade-3',
          conditions: [1],
          exchange: 999, // Unknown
          price: 3.00,
          size: 50,
          timestamp: 1640995320000000000,
          participant_timestamp: 1640995320000000000,
          sip_timestamp: 1640995320000000000,
          tape: 1,
        },
      ];

      mockPolygonService.getOptionsTrades.mockResolvedValueOnce(tradesWithDifferentExchanges);
      mockPolygonService.getOptionsContracts.mockResolvedValueOnce(mockContracts);

      const result = await alpacaService.getOptionsTrades('AAPL', 1);

      expect(result[0].exchange).toBe('CBOE');
      expect(result[1].exchange).toBe('NASDAQ');
      expect(result[2].exchange).toBe('UNKNOWN');
    });

    it('should map tape codes correctly', async () => {
      const tradesWithDifferentTapes: PolygonOptionsTrade[] = [
        {
          id: 'trade-1',
          conditions: [1],
          exchange: 1,
          price: 2.50,
          size: 100,
          timestamp: 1640995200000000000,
          participant_timestamp: 1640995200000000000,
          sip_timestamp: 1640995200000000000,
          tape: 1, // A
        },
        {
          id: 'trade-2',
          conditions: [1],
          exchange: 1,
          price: 1.75,
          size: 200,
          timestamp: 1640995260000000000,
          participant_timestamp: 1640995260000000000,
          sip_timestamp: 1640995260000000000,
          tape: 2, // B
        },
        {
          id: 'trade-3',
          conditions: [1],
          exchange: 1,
          price: 3.00,
          size: 50,
          timestamp: 1640995320000000000,
          participant_timestamp: 1640995320000000000,
          sip_timestamp: 1640995320000000000,
          tape: 3, // C
        },
      ];

      mockPolygonService.getOptionsTrades.mockResolvedValueOnce(tradesWithDifferentTapes);
      mockPolygonService.getOptionsContracts.mockResolvedValueOnce(mockContracts);

      const result = await alpacaService.getOptionsTrades('AAPL', 1);

      expect(result[0].tape).toBe('A');
      expect(result[1].tape).toBe('B');
      expect(result[2].tape).toBe('C');
    });
  });
});
