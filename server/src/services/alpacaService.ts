import axios from 'axios';
import {
  AlpacaAccount,
  AlpacaPosition,
  AlpacaActivity,
  AlpacaBar,
  CreateOrderRequest,
  CreateOrderResponse,
  ChartTimeframe,
} from '../types';
import { logger } from '../utils/logger';
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
      logger.server.error('Error fetching account:', error);
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
      logger.server.error('Error fetching positions:', error);
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
      logger.server.error('Error fetching activities:', error);
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
      logger.server.error('Error fetching bars:', error);

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

  /**
   * Get the latest stock bar for real-time updates
   * This is the proper method for real-time chart data polling
   */
  async getLatestStockBar(symbol: string): Promise<AlpacaBar | null> {
    try {
      const dataUrl = process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets';
      const response = await axios.get(`${dataUrl}/v2/stocks/${symbol}/bars/latest`, {
        headers: this.headers,
        params: {
          feed: 'iex', // Use IEX feed for delayed data (free tier)
        },
      });

      if (response.data.bar) {
        const bar = response.data.bar;
        return {
          t: bar.t,
          o: bar.o,
          h: bar.h,
          l: bar.l,
          c: bar.c,
          v: bar.v,
          n: bar.n || 0,
          vw: bar.vw || bar.c,
        };
      }

      return null;
    } catch (error: unknown) {
      logger.server.error(`Error fetching latest bar for ${symbol}:`, error);

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

      // For latest bar endpoint, return null instead of throwing for missing data
      if (response?.status === 404) {
        logger.server.warning(`No latest bar data available for ${symbol}`);
        return null;
      }

      // Generic error handling
      const errorMessage = response?.data?.message || (error instanceof Error ? error.message : 'Unknown error');
      logger.server.error(`Failed to fetch latest bar for ${symbol}: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Get historical bars with directional limit-based fetching (like database queries)
   * This ensures we get exactly the number of bars requested in the specified direction
   *
   * @param symbol - Stock symbol
   * @param startTime - Reference timestamp
   * @param timeframe - Alpaca timeframe (1Min, 15Min, 1Hour, 1Day)
   * @param limit - Number of bars to fetch
   * @param direction - 'past' (before startTime), 'future' (after startTime), or 'centered' (both)
   */
  async getHistoricalBarsDirectional(
    symbol: string,
    startTime: Date,
    timeframe: string,
    limit: number,
    direction: 'past' | 'future' | 'centered'
  ): Promise<AlpacaBar[]> {
    try {
      const dataUrl = process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets';

      if (direction === 'centered') {
        // For centered, make two API calls - one for past and one for future
        // Get 'limit' bars in EACH direction (not split)

        // Fetch past data (limit bars before startTime)
        const pastBars = await this.fetchBarsInDirection(dataUrl, symbol, startTime, timeframe, limit, 'past');

        // Fetch future data (limit bars after startTime)
        const futureBars = await this.fetchBarsInDirection(dataUrl, symbol, startTime, timeframe, limit, 'future');

        // Combine and return in chronological order
        return [...pastBars, ...futureBars];
      } else {
        // For past or future, single API call
        return await this.fetchBarsInDirection(dataUrl, symbol, startTime, timeframe, limit, direction);
      }
    } catch (error: unknown) {
      logger.server.error('Error fetching historical bars from Alpaca:', error);

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
      throw new Error(errorMessage || 'Failed to fetch historical bars');
    }
  }

  /**
   * Helper method to fetch bars in a specific direction
   */
  private async fetchBarsInDirection(
    dataUrl: string,
    symbol: string,
    startTime: Date,
    timeframe: string,
    limit: number,
    direction: 'past' | 'future'
  ): Promise<AlpacaBar[]> {
    const params: Record<string, string | number> = {
      timeframe: timeframe,
      feed: 'iex',
      limit: limit,
    };

    if (direction === 'past') {
      // For past: query bars <= startTime, let Alpaca return the last N bars
      params.end = startTime.toISOString();
      // Set a reasonable start time - go back enough to ensure we get the requested number of bars
      // For 1m bars with limit 600, we need about 10 hours of data
      const timeframeMinutes = this.getTimeframeMinutes(timeframe);
      const requiredMinutes = limit * timeframeMinutes;
      const bufferMinutes = Math.max(requiredMinutes * 1.5, 24 * 60); // 1.5x buffer, at least 1 day

      const startTimeForQuery = new Date(startTime.getTime() - bufferMinutes * 60 * 1000);
      params.start = startTimeForQuery.toISOString();
    } else {
      // For future: query bars >= startTime, let Alpaca return the first N bars
      params.start = startTime.toISOString();
      // Set a reasonable end time - go forward enough to ensure we get the requested number of bars
      const timeframeMinutes = this.getTimeframeMinutes(timeframe);
      const requiredMinutes = limit * timeframeMinutes;
      const bufferMinutes = Math.max(requiredMinutes * 1.5, 24 * 60); // 1.5x buffer, at least 1 day

      const endTimeForQuery = new Date(startTime.getTime() + bufferMinutes * 60 * 1000);
      params.end = endTimeForQuery.toISOString();
    }

    // log url where params are in query format
    const stringParams: Record<string, string> = {};
    Object.entries(params).forEach(([key, value]) => {
      stringParams[key] = String(value);
    });
    console.log(`${dataUrl}/v2/stocks/${symbol}/bars`, new URLSearchParams(stringParams).toString());
    const response = await axios.get(`${dataUrl}/v2/stocks/${symbol}/bars`, {
      headers: this.headers,
      params,
    });

    const bars =
      response.data.bars?.map((bar: AlpacaBar) => ({
        t: bar.t,
        o: bar.o,
        h: bar.h,
        l: bar.l,
        c: bar.c,
        v: bar.v,
        n: bar.n || 0,
        vw: bar.vw || bar.c,
      })) || [];

    if (direction === 'past') {
      // Filter to bars <= startTime and take the last N bars, then reverse for chronological order
      const filteredBars = bars.filter((bar: AlpacaBar) => new Date(bar.t) <= startTime);
      const lastNBars = filteredBars.slice(-limit);
      return lastNBars.reverse(); // Reverse to get chronological order (left to right)
    } else {
      // For future direction, filter to bars >= startTime and take the first N bars
      const filteredBars = bars.filter((bar: AlpacaBar) => new Date(bar.t) >= startTime);
      return filteredBars.slice(0, limit); // Already in chronological order
    }
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

  private getTimeframeMinutes(timeframe: string): number {
    const mapping: Record<string, number> = {
      '1Min': 1,
      '15Min': 15,
      '30Min': 30,
      '1Hour': 60,
      '1Day': 24 * 60,
      '1Week': 7 * 24 * 60,
      '3Month': 90 * 24 * 60,
      '6Month': 180 * 24 * 60,
      '1Year': 365 * 24 * 60,
    };

    return mapping[timeframe] || 60; // Default to 1 hour
  }
}

export const alpacaService = new AlpacaService();
