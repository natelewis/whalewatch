import axios from 'axios';
import { AlpacaBar, ChartTimeframe } from '../types';
import { logger } from '../utils/logger';
import { parseOptionTicker } from '@whalewatch/shared';

export interface PolygonBar {
  t: number; // timestamp (Unix millisecond timestamp)
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
  n?: number; // number of transactions
  vw?: number; // volume weighted average price
}

export interface PolygonAggregatesResponse {
  ticker: string;
  adjusted: boolean;
  queryCount: number;
  request_id: string;
  resultsCount: number;
  status: string;
  results?: PolygonBar[];
}

export class PolygonService {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = 'https://api.polygon.io';
    this.apiKey = process.env.POLYGON_API_KEY || '';

    if (!this.apiKey) {
      logger.server.warning('POLYGON_API_KEY not found in environment variables');
    }
  }

  /**
   * Get the latest option bar for real-time updates
   * Mirrors alpacaService.getLatestStockBar but for options
   */
  async getLatestOptionBar(symbol: string): Promise<AlpacaBar | null> {
    try {
      // Validate option ticker format
      const parsedTicker = parseOptionTicker(symbol);
      if (!parsedTicker) {
        throw new Error(`Invalid option ticker format: ${symbol}`);
      }

      // Get the latest bar using the aggregates endpoint with a very recent time range
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago

      const fromDate = oneHourAgo.toISOString().split('T')[0];
      const toDate = now.toISOString().split('T')[0];

      const params = {
        from: fromDate,
        to: toDate,
        adjusted: 'true',
        sort: 'desc',
        limit: 1, // Only get the latest bar
        apikey: this.apiKey,
      };

      const url = `${this.baseUrl}/v2/aggs/ticker/${symbol}/range/1/minute/${fromDate}/${toDate}`;

      const response = await axios.get<PolygonAggregatesResponse>(url, { params });

      if (response.data.results && response.data.results.length > 0) {
        const latestBar = response.data.results[0]; // First result is the latest due to sort=desc

        const bar: AlpacaBar = {
          t: new Date(latestBar.t).toISOString(), // Convert milliseconds to ISO string
          o: latestBar.o,
          h: latestBar.h,
          l: latestBar.l,
          c: latestBar.c,
          v: latestBar.v,
          n: latestBar.n || 0,
          vw: latestBar.vw || latestBar.c,
        };

        return bar;
      }

      return null;
    } catch (error: unknown) {
      logger.server.error(`Error fetching latest option bar for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get option bars for a specific options contract
   * Mirrors the functionality of alpacaService.getBars but for options
   */
  async getOptionBars(symbol: string, timeframe: ChartTimeframe, limit: number = 1000): Promise<AlpacaBar[]> {
    try {
      // Validate option ticker format
      const parsedTicker = parseOptionTicker(symbol);
      if (!parsedTicker) {
        throw new Error(`Invalid option ticker format: ${symbol}`);
      }

      // Check if expiration date is reasonable
      const expirationDate = new Date(parsedTicker.expirationDate);
      const now = new Date();
      const daysToExpiration = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysToExpiration < 0) {
        logger.warn(`Option ${symbol} has already expired (${daysToExpiration} days ago)`);
      } else if (daysToExpiration > 365) {
        logger.warn(`Option ${symbol} expires in ${daysToExpiration} days - data may be limited`);
      }

      const endTime = new Date();
      const polygonTimeframe = this.mapTimeframe(timeframe);
      const timeframeMinutes = this.getTimeframeMinutes(polygonTimeframe);
      const requiredMinutes = limit * timeframeMinutes;

      // Use similar buffer logic as alpacaService
      let bufferMultiplier: number;
      if (timeframeMinutes <= 1) {
        bufferMultiplier = 5;
      } else if (timeframeMinutes <= 60) {
        bufferMultiplier = 15;
      } else {
        bufferMultiplier = 2;
      }

      const bufferMinutes = Math.max(
        requiredMinutes * bufferMultiplier,
        this.getMinimumBufferMinutes(polygonTimeframe)
      );
      const startTime = new Date(endTime.getTime() - bufferMinutes * 60 * 1000);

      logger.debug(`getOptionBars buffer calculation:`, {
        symbol,
        timeframe,
        polygonTimeframe,
        limit,
        requiredMinutes,
        bufferMultiplier,
        bufferMinutes,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      });

      const response = await this.fetchOptionBars(symbol, startTime, endTime, polygonTimeframe, limit);

      const bars =
        response.results?.map((bar: PolygonBar) => ({
          t: bar.t.toString(), // Convert to string to match AlpacaBar format
          o: bar.o,
          h: bar.h,
          l: bar.l,
          c: bar.c,
          v: bar.v,
          n: bar.n || 0,
          vw: bar.vw || bar.c,
        })) || [];

      // Log if we didn't get enough bars
      if (bars.length < limit) {
        logger.warn(`Insufficient option data for ${symbol}: got ${bars.length} of ${limit} requested bars`);
      }

      return bars;
    } catch (error: unknown) {
      logger.server.error('Error fetching option bars:', error);

      // Handle specific Polygon API errors
      const isAxiosError = error && typeof error === 'object' && 'response' in error;
      const response = isAxiosError
        ? (
            error as {
              response?: { status?: number; data?: { message?: string } };
            }
          ).response
        : null;

      if (response?.status === 401) {
        throw new Error('Invalid Polygon API key. Please check your API credentials.');
      }

      if (response?.status === 403) {
        throw new Error('Access denied. Please check your Polygon API subscription.');
      }

      if (response?.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }

      // Generic error handling
      const errorMessage = response?.data?.message || (error instanceof Error ? error.message : 'Unknown error');
      throw new Error(errorMessage || 'Failed to fetch option chart data');
    }
  }

  /**
   * Get historical option bars with directional limit-based fetching
   * Mirrors alpacaService.getHistoricalBarsDirectional but for options
   */
  async getHistoricalOptionBarsDirectional(
    symbol: string,
    startTime: Date,
    timeframe: string,
    limit: number,
    direction: 'past' | 'future' | 'centered'
  ): Promise<AlpacaBar[]> {
    try {
      // Validate option ticker format
      const parsedTicker = parseOptionTicker(symbol);
      if (!parsedTicker) {
        throw new Error(`Invalid option ticker format: ${symbol}`);
      }

      // Check if expiration date is reasonable
      const expirationDate = new Date(parsedTicker.expirationDate);
      const now = new Date();
      const daysToExpiration = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysToExpiration < 0) {
        logger.warn(`Option ${symbol} has already expired (${daysToExpiration} days ago)`);
      } else if (daysToExpiration > 365) {
        logger.warn(`Option ${symbol} expires in ${daysToExpiration} days - data may be limited`);
      }

      if (direction === 'centered') {
        // For centered, make two API calls - one for past and one for future
        const pastBars = await this.fetchOptionBarsInDirection(symbol, startTime, timeframe, limit, 'past');
        const futureBars = await this.fetchOptionBarsInDirection(symbol, startTime, timeframe, limit, 'future');
        return [...pastBars, ...futureBars];
      } else {
        return await this.fetchOptionBarsInDirection(symbol, startTime, timeframe, limit, direction);
      }
    } catch (error: unknown) {
      logger.server.error('Error fetching historical option bars from Polygon:', error);

      // Handle specific Polygon API errors
      const isAxiosError = error && typeof error === 'object' && 'response' in error;
      const response = isAxiosError
        ? (
            error as {
              response?: { status?: number; data?: { message?: string } };
            }
          ).response
        : null;

      if (response?.status === 401) {
        throw new Error('Invalid Polygon API key. Please check your API credentials.');
      }

      if (response?.status === 403) {
        throw new Error('Access denied. Please check your Polygon API subscription.');
      }

      if (response?.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }

      // Generic error handling
      const errorMessage = response?.data?.message || (error instanceof Error ? error.message : 'Unknown error');
      throw new Error(errorMessage || 'Failed to fetch historical option bars');
    }
  }

  /**
   * Fetch option bars using Polygon's aggregates API
   */
  private async fetchOptionBars(
    symbol: string,
    startTime: Date,
    endTime: Date,
    timeframe: string,
    limit: number
  ): Promise<PolygonAggregatesResponse> {
    const multiplier = this.getMultiplier(timeframe);
    const timespan = this.getTimespan(timeframe);

    const params = {
      from: startTime.toISOString().split('T')[0], // YYYY-MM-DD format
      to: endTime.toISOString().split('T')[0], // YYYY-MM-DD format
      adjusted: 'true',
      sort: 'asc',
      limit: Math.min(limit, 50000), // Polygon's max limit
      apikey: this.apiKey,
    };

    const url = `${this.baseUrl}/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${params.from}/${params.to}`;

    logger.debug(`Fetching option bars from Polygon:`, {
      symbol,
      url,
      params,
    });

    const response = await axios.get<PolygonAggregatesResponse>(url, { params });
    return response.data;
  }

  /**
   * Helper method to fetch option bars in a specific direction
   */
  private async fetchOptionBarsInDirection(
    symbol: string,
    startTime: Date,
    timeframe: string,
    limit: number,
    direction: 'past' | 'future'
  ): Promise<AlpacaBar[]> {
    const multiplier = this.getMultiplier(timeframe);
    const timespan = this.getTimespan(timeframe);

    // Set up time range based on direction
    let fromDate: Date;
    let toDate: Date;

    if (direction === 'past') {
      // For past data: query bars <= startTime
      toDate = startTime;
      // Use generous buffer for past data
      const timeframeMinutes = this.getTimeframeMinutes(timeframe);
      let bufferDays: number;
      if (timeframeMinutes <= 1) {
        bufferDays = 30;
      } else if (timeframeMinutes <= 60) {
        bufferDays = 365;
      } else if (timeframeMinutes <= 24 * 60) {
        bufferDays = 3 * 365;
      } else {
        bufferDays = 5 * 365;
      }
      fromDate = new Date(startTime.getTime() - bufferDays * 24 * 60 * 60 * 1000);
    } else {
      // For future data: query bars >= startTime
      fromDate = startTime;
      // Use generous buffer for future data
      const timeframeMinutes = this.getTimeframeMinutes(timeframe);
      let bufferDays: number;
      if (timeframeMinutes <= 1) {
        bufferDays = 30;
      } else if (timeframeMinutes <= 60) {
        bufferDays = 365;
      } else if (timeframeMinutes <= 24 * 60) {
        bufferDays = 3 * 365;
      } else {
        bufferDays = 5 * 365;
      }
      toDate = new Date(startTime.getTime() + bufferDays * 24 * 60 * 60 * 1000);
    }

    const params = {
      from: fromDate.toISOString().split('T')[0],
      to: toDate.toISOString().split('T')[0],
      adjusted: 'true',
      sort: direction === 'past' ? 'desc' : 'asc',
      limit: Math.min(limit, 50000),
      apikey: this.apiKey,
    };

    const url = `${this.baseUrl}/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${params.from}/${params.to}`;

    const response = await axios.get<PolygonAggregatesResponse>(url, { params });

    const bars =
      response.data.results?.map((bar: PolygonBar) => ({
        t: new Date(bar.t).toISOString(), // Convert milliseconds to ISO string
        o: bar.o,
        h: bar.h,
        l: bar.l,
        c: bar.c,
        v: bar.v,
        n: bar.n || 0,
        vw: bar.vw || bar.c,
      })) || [];

    // Filter and limit based on direction
    if (direction === 'past') {
      // Filter to bars <= startTime and take the most recent N bars
      const filteredBars = bars.filter((bar: AlpacaBar) => new Date(bar.t) <= startTime);
      const recentNBars = filteredBars.slice(0, limit);
      return recentNBars.reverse(); // Reverse to get chronological order
    } else {
      // Filter to bars >= startTime and take the first N bars
      const filteredBars = bars.filter((bar: AlpacaBar) => new Date(bar.t) >= startTime);
      return filteredBars.slice(0, limit);
    }
  }

  /**
   * Map our timeframe format to Polygon's multiplier and timespan format
   */
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

  /**
   * Get multiplier for Polygon API (always 1 for our use case)
   */
  private getMultiplier(_timeframe: string): number {
    return 1;
  }

  /**
   * Get timespan for Polygon API
   */
  private getTimespan(timeframe: string): string {
    const mapping: Record<string, string> = {
      '1Min': 'minute',
      '15Min': 'minute',
      '30Min': 'minute',
      '1Hour': 'hour',
      '1Day': 'day',
      '1Week': 'week',
      '3Month': 'month',
      '6Month': 'month',
      '1Year': 'year',
    };
    return mapping[timeframe] || 'hour';
  }

  /**
   * Get timeframe in minutes
   */
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
    return mapping[timeframe] || 60;
  }

  /**
   * Get minimum buffer time in minutes based on timeframe
   */
  private getMinimumBufferMinutes(timeframe: string): number {
    const timeframeMinutes = this.getTimeframeMinutes(timeframe);

    if (timeframeMinutes <= 1) {
      return 3 * 24 * 60; // 3 days
    } else if (timeframeMinutes <= 60) {
      return 30 * 24 * 60; // 1 month
    } else if (timeframeMinutes <= 24 * 60) {
      return 30 * 24 * 60; // 1 month
    } else {
      return 90 * 24 * 60; // 3 months
    }
  }
}

export const polygonService = new PolygonService();
