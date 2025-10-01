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
      const alpacaTimeframe = this.mapTimeframe(timeframe);
      const timeframeMinutes = this.getTimeframeMinutes(alpacaTimeframe);
      const requiredMinutes = limit * timeframeMinutes;

      // Use the same improved buffer logic as getHistoricalBarsDirectional
      let bufferMultiplier: number;
      if (timeframeMinutes <= 1) {
        bufferMultiplier = 5;
      } else if (timeframeMinutes <= 60) {
        // For hourly data, use extremely large buffer to account for market hours and API limitations
        bufferMultiplier = 15;
      } else {
        bufferMultiplier = 2;
      }

      const bufferMinutes = Math.max(requiredMinutes * bufferMultiplier, this.getMinimumBufferMinutes(alpacaTimeframe));

      const startTime = new Date(endTime.getTime() - bufferMinutes * 60 * 1000);

      logger.debug(`getBars buffer calculation:`, {
        symbol,
        timeframe,
        alpacaTimeframe,
        limit,
        requiredMinutes,
        bufferMultiplier,
        bufferMinutes,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      });

      // Use delayed data endpoint for free tier compatibility
      const dataUrl = process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets';
      const response = await axios.get(`${dataUrl}/v2/stocks/${symbol}/bars`, {
        headers: this.headers,
        params: {
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          timeframe: alpacaTimeframe,
          limit: limit,
          feed: 'iex', // Use IEX feed for delayed data (free tier)
        },
      });

      const bars =
        response.data.bars?.map((bar: AlpacaBar) => ({
          t: bar.t,
          o: bar.o,
          h: bar.h,
          l: bar.l,
          c: bar.c,
          v: bar.v,
          n: bar.n,
          vw: bar.vw,
        })) || [];

      // Log if we didn't get enough bars
      if (bars.length < limit) {
        logger.warn(`Insufficient data for ${symbol}: got ${bars.length} of ${limit} requested bars`);
      }

      return bars;
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
   * Helper method to fetch bars in a specific direction with pagination support
   */
  private async fetchBarsInDirection(
    dataUrl: string,
    symbol: string,
    startTime: Date,
    timeframe: string,
    limit: number,
    direction: 'past' | 'future'
  ): Promise<AlpacaBar[]> {
    // Use pagination to get exactly the number of bars requested
    const allBars: AlpacaBar[] = [];
    let nextPageToken: string | undefined;
    let totalFetched = 0;
    const maxPages = 10; // Safety limit to prevent infinite loops

    // Set up initial parameters
    const baseParams: Record<string, string | number> = {
      timeframe: timeframe,
      feed: 'iex',
      limit: Math.min(limit, 10000), // Use reasonable page size
    };

    // Set sort order based on direction
    if (direction === 'past') {
      baseParams.sort = 'desc'; // Descending: newest first, then we'll reverse
    } else {
      baseParams.sort = 'asc'; // Ascending: oldest first, already chronological
    }

    if (direction === 'past') {
      // For past: query bars <= startTime
      baseParams.end = startTime.toISOString();
      // Use a much more generous start time to ensure we have enough data to paginate through
      const timeframeMinutes = this.getTimeframeMinutes(timeframe);
      let bufferDays: number;
      if (timeframeMinutes <= 1) {
        // For minute data: 30 days should be plenty
        bufferDays = 30;
      } else if (timeframeMinutes <= 60) {
        // For hourly data: 1 year should be plenty
        bufferDays = 365;
      } else if (timeframeMinutes <= 24 * 60) {
        // For daily data: need much more time - 600 bars = ~2.4 years of trading days
        // Use 3 years to be safe (accounts for weekends, holidays, market closures)
        bufferDays = 3 * 365;
      } else {
        // For weekly+ data: 5 years
        bufferDays = 5 * 365;
      }

      const startTimeForQuery = new Date(startTime.getTime() - bufferDays * 24 * 60 * 60 * 1000);
      baseParams.start = startTimeForQuery.toISOString();

      logger.debug(`Past query with pagination:`, {
        symbol,
        timeframe,
        limit,
        bufferDays,
        startTimeForQuery: startTimeForQuery.toISOString(),
        endTime: startTime.toISOString(),
      });
    } else {
      // For future: query bars >= startTime
      baseParams.start = startTime.toISOString();
      // Use a generous end time
      const timeframeMinutes = this.getTimeframeMinutes(timeframe);
      let bufferDays: number;
      if (timeframeMinutes <= 1) {
        bufferDays = 30;
      } else if (timeframeMinutes <= 60) {
        bufferDays = 365;
      } else if (timeframeMinutes <= 24 * 60) {
        // For daily data: 3 years forward
        bufferDays = 3 * 365;
      } else {
        bufferDays = 5 * 365;
      }

      const endTimeForQuery = new Date(startTime.getTime() + bufferDays * 24 * 60 * 60 * 1000);
      baseParams.end = endTimeForQuery.toISOString();

      logger.debug(`Future query with pagination:`, {
        symbol,
        timeframe,
        limit,
        bufferDays,
        startTime: startTime.toISOString(),
        endTimeForQuery: endTimeForQuery.toISOString(),
      });
    }

    // Fetch pages until we have enough data or no more pages
    for (let page = 0; page < maxPages; page++) {
      const params = { ...baseParams };
      if (nextPageToken) {
        params.page_token = nextPageToken;
      }

      logger.debug(`Fetching page ${page + 1} for ${symbol}`, {
        nextPageToken: nextPageToken ? 'present' : 'none',
        totalFetched,
        targetLimit: limit,
      });

      const response = await axios.get(`${dataUrl}/v2/stocks/${symbol}/bars`, {
        headers: this.headers,
        params,
      });

      const pageBars =
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

      allBars.push(...pageBars);
      totalFetched += pageBars.length;

      // Check for next page token
      nextPageToken = response.data.next_page_token;

      // If we have enough data or no more pages, break
      if (!nextPageToken || totalFetched >= limit * 2) {
        break;
      }
    }

    logger.debug(`Pagination complete for ${symbol}:`, {
      totalFetched,
      pages: Math.min(maxPages, totalFetched / (baseParams.limit as number)),
      hasNextPage: !!nextPageToken,
    });

    // Process the collected bars based on direction
    if (direction === 'past') {
      // For past data: API returns in descending order (newest first)
      // Filter to bars <= startTime and take the first N bars (most recent)
      const filteredBars = allBars.filter((bar: AlpacaBar) => new Date(bar.t) <= startTime);
      const recentNBars = filteredBars.slice(0, limit);

      if (recentNBars.length < limit) {
        logger.warn(
          `Insufficient past data for ${symbol}: got ${recentNBars.length} of ${limit} requested bars (fetched ${totalFetched} total)`
        );
      } else {
        logger.info(`Successfully fetched ${recentNBars.length} bars for ${symbol} using pagination`);
      }

      // Reverse to get chronological order (oldest to newest) for frontend
      return recentNBars.reverse();
    } else {
      // For future data: API returns in ascending order (oldest first)
      // Filter to bars >= startTime and take the first N bars
      const filteredBars = allBars.filter((bar: AlpacaBar) => new Date(bar.t) >= startTime);
      const firstNBars = filteredBars.slice(0, limit);

      if (firstNBars.length < limit) {
        logger.warn(
          `Insufficient future data for ${symbol}: got ${firstNBars.length} of ${limit} requested bars (fetched ${totalFetched} total)`
        );
      } else {
        logger.info(`Successfully fetched ${firstNBars.length} bars for ${symbol} using pagination`);
      }

      // Already in chronological order (oldest to newest)
      return firstNBars;
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

  /**
   * Get minimum buffer time in minutes based on timeframe
   * This ensures we always have enough historical data even for edge cases
   */
  private getMinimumBufferMinutes(timeframe: string): number {
    const timeframeMinutes = this.getTimeframeMinutes(timeframe);

    if (timeframeMinutes <= 1) {
      // For minute data, ensure at least 3 days of buffer (accounts for weekends)
      return 3 * 24 * 60; // 3 days
    } else if (timeframeMinutes <= 60) {
      // For hourly data, ensure at least 1 month of buffer
      // This accounts for market hours (~6.5 hours/day, 5 days/week)
      // 1 month = 30 days = ~195 trading hours, which should be more than sufficient
      // Plus additional buffer for API limitations and data availability
      return 30 * 24 * 60; // 1 month
    } else if (timeframeMinutes <= 24 * 60) {
      // For daily data, ensure at least 1 month of buffer
      return 30 * 24 * 60; // 1 month
    } else {
      // For weekly+ data, ensure at least 3 months of buffer
      return 90 * 24 * 60; // 3 months
    }
  }
}

export const alpacaService = new AlpacaService();
