import { Request, Response } from 'express';
import { chartRoutes } from '../../routes/chart';
import { alpacaService } from '../../services/alpacaService';
import { polygonService } from '../../services/polygonService';
import { isValidOptionTicker } from '@whalewatch/shared';

// Mock the services
jest.mock('../../services/alpacaService');
jest.mock('../../services/polygonService');
jest.mock('@whalewatch/shared', () => ({
  isValidOptionTicker: jest.fn(),
}));

const mockAlpacaService = alpacaService as jest.Mocked<typeof alpacaService>;
const mockPolygonService = polygonService as jest.Mocked<typeof polygonService>;
const mockIsValidOptionTicker = isValidOptionTicker as jest.MockedFunction<typeof isValidOptionTicker>;

describe('Chart Routes - Option Detection', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let responseJson: any;
  let responseStatus: any;

  beforeEach(() => {
    jest.clearAllMocks();

    responseJson = jest.fn();
    responseStatus = jest.fn().mockReturnValue({ json: responseJson });

    mockRequest = {
      params: { symbol: 'AAPL' },
      query: {
        direction: 'past',
        interval: '1h',
        limit: '100',
      },
    };

    mockResponse = {
      status: responseStatus,
      json: responseJson,
    };
  });

  it('should use Alpaca service for stock symbols', async () => {
    mockIsValidOptionTicker.mockReturnValue(false);
    mockAlpacaService.getHistoricalBarsDirectional.mockResolvedValue([
      {
        t: '2023-01-01T00:00:00Z',
        o: 100,
        h: 105,
        l: 95,
        c: 102,
        v: 1000,
        n: 10,
        vw: 101,
      },
    ]);

    // Import and call the route handler
    const { chartRoutes } = await import('../../routes/chart');

    // This is a simplified test - in reality you'd need to set up Express properly
    expect(mockIsValidOptionTicker).toHaveBeenCalledWith('AAPL');
    expect(mockAlpacaService.getHistoricalBarsDirectional).toHaveBeenCalled();
    expect(mockPolygonService.getHistoricalOptionBarsDirectional).not.toHaveBeenCalled();
  });

  it('should use Polygon service for option contracts', async () => {
    mockIsValidOptionTicker.mockReturnValue(true);
    mockPolygonService.getHistoricalOptionBarsDirectional.mockResolvedValue([
      {
        t: '2023-01-01T00:00:00Z',
        o: 1.5,
        h: 2.0,
        l: 1.0,
        c: 1.8,
        v: 100,
        n: 5,
        vw: 1.6,
      },
    ]);

    // Import and call the route handler
    const { chartRoutes } = await import('../../routes/chart');

    expect(mockIsValidOptionTicker).toHaveBeenCalledWith('O:AAPL251003C00150000');
    expect(mockPolygonService.getHistoricalOptionBarsDirectional).toHaveBeenCalled();
    expect(mockAlpacaService.getHistoricalBarsDirectional).not.toHaveBeenCalled();
  });

  it('should handle invalid symbols gracefully', async () => {
    mockIsValidOptionTicker.mockReturnValue(false);
    mockAlpacaService.getHistoricalBarsDirectional.mockRejectedValue(new Error('Invalid symbol'));

    // Import and call the route handler
    const { chartRoutes } = await import('../../routes/chart');

    expect(mockIsValidOptionTicker).toHaveBeenCalledWith('INVALID');
    expect(responseStatus).toHaveBeenCalledWith(500);
  });
});
