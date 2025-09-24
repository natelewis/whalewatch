import axios from 'axios';
import {
  AlpacaAccount,
  AlpacaPosition,
  AlpacaActivity,
  AlpacaBar,
  AlpacaOptionsTrade,
  CreateOrderRequest,
  CreateOrderResponse,
  ChartTimeframe,
} from '../types';
// Polygon service removed - now using QuestDB

export class AlpacaService {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor() {
    this.baseUrl = 'https://paper-api.alpaca.markets/v2';
    this.headers = {
      'APCA-API-KEY-ID': process.env.ALPACA_API_KEY || '',
      'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY || '',
      'Content-Type': 'application/json',
    };
  }

  async getAccount(): Promise<AlpacaAccount> {
    try {
      const response = await axios.get(`${this.baseUrl}/account`, {
        headers: this.headers,
      });
      return response.data as AlpacaAccount;
    } catch (error) {
      console.error('Error fetching account:', error);
      throw new Error('Failed to fetch account information');
    }
  }

  async getPositions(): Promise<AlpacaPosition[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/positions`, {
        headers: this.headers,
      });
      return response.data as AlpacaPosition[];
    } catch (error) {
      console.error('Error fetching positions:', error);
      throw new Error('Failed to fetch positions');
    }
  }

  async getActivities(startDate?: string, endDate?: string): Promise<AlpacaActivity[]> {
    try {
      const params: Record<string, string> = {};
      if (startDate) {
        params.start = startDate;
      }
      if (endDate) {
        params.end = endDate;
      }

      const response = await axios.get(`${this.baseUrl}/account/activities`, {
        headers: this.headers,
        params,
      });
      return response.data as AlpacaActivity[];
    } catch (error) {
      console.error('Error fetching activities:', error);
      throw new Error('Failed to fetch activities');
    }
  }

  async getBars(symbol: string, timeframe: ChartTimeframe, limit: number = 1000): Promise<AlpacaBar[]> {
    try {
      const endTime = new Date();
      let startTime: Date;

      // Calculate start time based on timeframe using milliseconds
      switch (timeframe) {
        case '1m':
          startTime = new Date(endTime.getTime() - limit * 60 * 1000);
          break;
        case '15m':
          startTime = new Date(endTime.getTime() - limit * 15 * 60 * 1000);
          break;
        case '1H':
          startTime = new Date(endTime.getTime() - limit * 60 * 60 * 1000);
          break;
        case '1D':
          startTime = new Date(endTime.getTime() - limit * 24 * 60 * 60 * 1000);
          break;
        case '1W':
          startTime = new Date(endTime.getTime() - limit * 7 * 24 * 60 * 60 * 1000);
          break;
        default:
          startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // Default to 1 day
      }

      // Use delayed data endpoint for free tier compatibility
      const dataUrl = process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets';
      const response = await axios.get(`${dataUrl}/v2/stocks/${symbol}/bars`, {
        headers: this.headers,
        params: {
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          timeframe: this.mapTimeframe(timeframe),
          limit: limit,
          feed: 'iex', // Use IEX feed for delayed data (free tier)
        },
      });

      return (
        response.data.bars?.map((bar: AlpacaBar) => ({
          t: bar.t,
          o: bar.o,
          h: bar.h,
          l: bar.l,
          c: bar.c,
          v: bar.v,
          n: bar.n,
          vw: bar.vw,
        })) || []
      );
    } catch (error: unknown) {
      console.error('Error fetching bars:', error);

      // Handle specific Alpaca API errors
      const isAxiosError = error && typeof error === 'object' && 'response' in error;
      const response = isAxiosError
        ? (
            error as {
              response?: { status?: number; data?: { message?: string } };
            }
          ).response
        : null;

      if (response?.status === 403) {
        if (response.data?.message?.includes('subscription does not permit')) {
          throw new Error(
            'API subscription does not support real-time data. Please upgrade your Alpaca account or use delayed data.'
          );
        }
        throw new Error('Access denied. Please check your API credentials.');
      }

      if (response?.status === 401) {
        throw new Error('Invalid API credentials. Please check your Alpaca API key and secret.');
      }

      if (response?.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }

      // Generic error handling
      const errorMessage = response?.data?.message || (error instanceof Error ? error.message : 'Unknown error');
      throw new Error(errorMessage || 'Failed to fetch chart data');
    }
  }

  async getOptionsTrades(_symbol: string, _hours: number = 1): Promise<AlpacaOptionsTrade[]> {
    // This method is now handled by QuestDB routes
    // Keeping for backward compatibility but should not be used
    console.warn('getOptionsTrades called on AlpacaService - use QuestDB routes instead');
    return [];
  }

  // Polygon conversion methods removed - now using QuestDB

  async createOrder(orderData: CreateOrderRequest): Promise<CreateOrderResponse> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/orders`,
        {
          symbol: orderData.symbol,
          qty: orderData.qty,
          side: orderData.side,
          type: orderData.type,
          time_in_force: orderData.time_in_force,
          limit_price: orderData.limit_price,
          stop_price: orderData.stop_price,
        },
        {
          headers: this.headers,
        }
      );

      return response.data as CreateOrderResponse;
    } catch (error) {
      console.error('Error creating order:', error);
      throw new Error('Failed to create order');
    }
  }

  private mapTimeframe(timeframe: ChartTimeframe): string {
    const mapping: Record<ChartTimeframe, string> = {
      '1m': '1Min',
      '15m': '15Min',
      '30m': '30Min',
      '1h': '1Hour',
      '1H': '1Hour',
      '1d': '1Day',
      '1D': '1Day',
      '1W': '1Week',
      '3M': '3Month',
      '6M': '6Month',
      '1Y': '1Year',
      ALL: '1Year',
    };
    return mapping[timeframe];
  }
}

export const alpacaService = new AlpacaService();
