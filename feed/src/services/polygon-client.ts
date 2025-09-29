import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import {
  PolygonOptionContract,
  PolygonOptionContractsResponse,
  PolygonOptionQuote,
  PolygonOptionQuotesResponse,
  PolygonTrade,
  PolygonTradesResponse,
} from '../types/polygon';
import { getPolygonRateLimiter } from '../utils/polygon-rate-limiter';

export class PolygonClient {
  private api: AxiosInstance;
  private apiKey: string;
  private rateLimiter = getPolygonRateLimiter();

  constructor() {
    this.apiKey = config.polygon.apiKey;
    this.api = axios.create({
      baseURL: config.polygon.baseUrl,
      timeout: 30000,
      params: {
        apikey: this.apiKey,
      },
    });
  }

  private logRequest(method: string, endpoint: string, params?: Record<string, unknown>): void {
    if (config.polygon.logRequests) {
      let fullUrl = `${config.polygon.baseUrl}${endpoint}`;

      if (params) {
        const queryParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            queryParams.append(key, String(value));
          }
        });
        queryParams.append('apikey', this.apiKey);

        const queryString = queryParams.toString();
        if (queryString) {
          fullUrl += `?${queryString}`;
        }
      } else {
        fullUrl += `?apikey=${this.apiKey}`;
      }

      console.log(`[POLYGON API] ${method} ${fullUrl}`);
    }
  }

  async getOptionContracts(underlyingTicker: string, asOf: Date): Promise<PolygonOptionContract[]> {
    return this.rateLimiter.execute(async () => {
      try {
        const allContracts: PolygonOptionContract[] = [];
        let nextUrl: string | undefined;

        // Initial request
        const params: Record<string, string> = {
          underlying_ticker: underlyingTicker,
          limit: config.polygon.optionContractsLimit.toString(),
          expired: 'false',
        };

        if (asOf) {
          params.as_of = asOf.toISOString().split('T')[0]; // Format as YYYY-MM-DD
        }

        const endpoint = '/v3/reference/options/contracts';
        this.logRequest('GET', endpoint, params);

        let response = await this.api.get<PolygonOptionContractsResponse>(endpoint, { params });

        // Add results from first page
        if (response.data.results) {
          allContracts.push(...response.data.results);
        }

        // Follow pagination
        nextUrl = response.data.next_url;
        while (nextUrl) {
          this.logRequest('GET', nextUrl);
          response = await this.api.get<PolygonOptionContractsResponse>(nextUrl);

          if (response.data.results) {
            allContracts.push(...response.data.results);
          }

          nextUrl = response.data.next_url;
        }

        console.log(`Fetched ${allContracts.length} option contracts for ${underlyingTicker}`);
        return allContracts;
      } catch (error) {
        console.error(`Error fetching option contracts for ${underlyingTicker}:`, error);
        throw error;
      }
    });
  }

  async getOptionTrades(ticker: string, from: Date, to: Date): Promise<PolygonTrade[]> {
    return this.rateLimiter.execute(async () => {
      try {
        const allTrades: PolygonTrade[] = [];
        let nextUrl: string | undefined;

        // Initial request
        const fromStr = from.toISOString();
        const toStr = to.toISOString();
        const endpoint = `/v3/trades/${ticker}`;
        const requestParams = {
          'timestamp.gte': fromStr,
          'timestamp.lte': toStr,
          order: 'asc',
          limit: config.polygon.optionTradesLimit || 50000,
        };

        this.logRequest('GET', endpoint, requestParams);

        let response = await this.api.get<PolygonTradesResponse>(endpoint, { params: requestParams });

        // Add results from first page
        if (response.data.results) {
          allTrades.push(...response.data.results);
        }

        // Follow pagination
        nextUrl = response.data.next_url;
        while (nextUrl) {
          this.logRequest('GET', nextUrl);
          response = await this.api.get<PolygonTradesResponse>(nextUrl);

          if (response.data.results) {
            allTrades.push(...response.data.results);
          }

          nextUrl = response.data.next_url;
        }

        console.log(`Fetched ${allTrades.length} option trades for ${ticker}`);
        return allTrades;
      } catch (error) {
        console.error(`Error fetching option trades for ${ticker}:`, error);
        throw error;
      }
    });
  }

  async getOptionQuotes(ticker: string, from: Date, to: Date): Promise<PolygonOptionQuote[]> {
    return this.rateLimiter.execute(async () => {
      try {
        const allQuotes: PolygonOptionQuote[] = [];
        let nextUrl: string | undefined;

        // Initial request
        const fromStr = from.toISOString();
        const toStr = to.toISOString();
        const endpoint = `/v3/quotes/${ticker}`;
        const requestParams = {
          'timestamp.gte': fromStr,
          'timestamp.lte': toStr,
          order: 'asc',
          limit: config.polygon.optionQuotesLimit,
        };

        this.logRequest('GET', endpoint, requestParams);

        let response = await this.api.get<PolygonOptionQuotesResponse>(endpoint, { params: requestParams });

        // Add results from first page
        if (response.data.results) {
          allQuotes.push(...response.data.results);
        }

        // Follow pagination
        nextUrl = response.data.next_url;
        while (nextUrl) {
          this.logRequest('GET', nextUrl);
          response = await this.api.get<PolygonOptionQuotesResponse>(nextUrl);

          if (response.data.results) {
            allQuotes.push(...response.data.results);
          }

          nextUrl = response.data.next_url;
        }

        return allQuotes;
      } catch (error) {
        console.error(`Error fetching option quotes for ${ticker}:`, error);
        throw error;
      }
    });
  }

  // Helper method to convert Polygon timestamp to Date
  static convertTimestamp(timestamp: number, isNanoseconds = false): Date {
    if (isNanoseconds) {
      return new Date(timestamp / 1000000);
    }
    return new Date(timestamp);
  }

  // Helper method to convert Date to Polygon timestamp
  static toPolygonTimestamp(date: Date, asNanoseconds = false): number {
    const ms = date.getTime();
    return asNanoseconds ? ms * 1000000 : ms;
  }
}
