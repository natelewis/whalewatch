import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import {
  AlpacaBarsResponse,
  AlpacaTradesResponse,
  AlpacaQuotesResponse,
  AlpacaBar,
  AlpacaTrade,
  AlpacaQuote,
} from '../types/alpaca';
import { getAlpacaRateLimiter } from '../utils/alpaca-rate-limiter';

export class AlpacaClient {
  private dataApi: AxiosInstance;
  private apiKey: string;
  private secretKey: string;
  private rateLimiter = getAlpacaRateLimiter();

  constructor() {
    this.apiKey = config.alpaca.apiKey;
    this.secretKey = config.alpaca.secretKey;

    if (!this.apiKey || !this.secretKey) {
      throw new Error(
        'Alpaca API credentials not configured. Please set ALPACA_API_KEY and ALPACA_SECRET_KEY environment variables.'
      );
    }

    this.dataApi = axios.create({
      baseURL: config.alpaca.dataUrl,
      timeout: 30000,
      headers: {
        'APCA-API-KEY-ID': this.apiKey,
        'APCA-API-SECRET-KEY': this.secretKey,
      },
    });
  }

  private logRequest(method: string, endpoint: string, params?: Record<string, unknown>): void {
    if (config.alpaca.logRequests) {
      const fullUrl = `${config.alpaca.dataUrl}${endpoint}`;
      let queryString = '';
      if (params && Object.keys(params).length > 0) {
        queryString = new URLSearchParams(
          Object.entries(params).reduce((acc, [key, value]) => {
            acc[key] = String(value);
            return acc;
          }, {} as Record<string, string>)
        ).toString();
      }
      console.log(`[ALPACA API] ${method} ${fullUrl}${queryString ? `?${queryString}` : ''}`);
    }
  }

  async getHistoricalBars(
    symbol: string,
    start: Date,
    end: Date,
    timeframe: '1Min' | '5Min' | '15Min' | '1Hour' | '1Day' = '1Min'
  ): Promise<AlpacaBar[]> {
    return this.rateLimiter.execute(async () => {
      try {
        const startStr = start.toISOString().split('T')[0];
        const endStr = end.toISOString().split('T')[0];
        const endpoint = `/v2/stocks/${symbol}/bars`;
        const requestParams = {
          start: startStr,
          end: endStr,
          timeframe,
          adjustment: 'raw',
          feed: 'iex',
          page_token: undefined as string | undefined,
        };

        this.logRequest('GET', endpoint, requestParams);

        const allBars: AlpacaBar[] = [];
        let nextPageToken: string | undefined;

        do {
          if (nextPageToken) {
            requestParams.page_token = nextPageToken;
          }

          const response = await this.dataApi.get<AlpacaBarsResponse>(endpoint, {
            params: requestParams,
          });

          // Check if response data and bars exist
          if (!response.data) {
            console.warn(`No response data received for ${symbol} on ${startStr}`);
            break;
          }

          if (!response.data.bars) {
            console.warn(`No bars data in response for ${symbol} on ${startStr}`);
            break;
          }

          // Handle both old format (bars[symbol]) and new format (bars array)
          const bars = Array.isArray(response.data.bars) ? response.data.bars : response.data.bars[symbol] || [];
          allBars.push(...bars);
          nextPageToken = response.data.next_page_token;

          // Small delay to respect rate limits
          if (nextPageToken) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } while (nextPageToken);

        return allBars;
      } catch (error) {
        console.error(`Error fetching historical bars for ${symbol}:`, error);

        // Log additional details for debugging
        if (error && typeof error === 'object' && 'response' in error) {
          const axiosError = error as { response?: { data?: unknown; status?: number; statusText?: string } };
          console.error(`API Response Status: ${axiosError.response?.status} ${axiosError.response?.statusText}`);
          console.error(`API Response Data:`, axiosError.response?.data);
        }

        throw error;
      }
    });
  }

  async getHistoricalTrades(symbol: string, start: Date, end: Date): Promise<AlpacaTrade[]> {
    return this.rateLimiter.execute(async () => {
      try {
        const startStr = start.toISOString();
        const endStr = end.toISOString();
        const endpoint = `/v2/stocks/${symbol}/trades`;
        const requestParams = {
          start: startStr,
          end: endStr,
          feed: 'iex',
          page_token: undefined as string | undefined,
        };

        this.logRequest('GET', endpoint, requestParams);

        const allTrades: AlpacaTrade[] = [];
        let nextPageToken: string | undefined;

        do {
          if (nextPageToken) {
            requestParams.page_token = nextPageToken;
          }

          const response = await this.dataApi.get<AlpacaTradesResponse>(endpoint, {
            params: requestParams,
          });

          // Check if response data and trades exist
          if (!response.data) {
            console.warn(`No response data received for ${symbol} trades on ${startStr}`);
            break;
          }

          if (!response.data.trades) {
            console.warn(`No trades data in response for ${symbol} on ${startStr}`);
            break;
          }

          // Handle both old format (trades[symbol]) and new format (trades array)
          const trades = Array.isArray(response.data.trades)
            ? response.data.trades
            : response.data.trades[symbol] || [];
          allTrades.push(...trades);
          nextPageToken = response.data.next_page_token;

          // Small delay to respect rate limits
          if (nextPageToken) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } while (nextPageToken);

        return allTrades;
      } catch (error) {
        console.error(`Error fetching historical trades for ${symbol}:`, error);

        // Log additional details for debugging
        if (error && typeof error === 'object' && 'response' in error) {
          const axiosError = error as { response?: { data?: unknown; status?: number; statusText?: string } };
          console.error(`API Response Status: ${axiosError.response?.status} ${axiosError.response?.statusText}`);
          console.error(`API Response Data:`, axiosError.response?.data);
        }

        throw error;
      }
    });
  }

  async getHistoricalQuotes(symbol: string, start: Date, end: Date): Promise<AlpacaQuote[]> {
    return this.rateLimiter.execute(async () => {
      try {
        const startStr = start.toISOString();
        const endStr = end.toISOString();
        const endpoint = `/v2/stocks/${symbol}/quotes`;
        const requestParams = {
          start: startStr,
          end: endStr,
          feed: 'iex',
          page_token: undefined as string | undefined,
        };

        this.logRequest('GET', endpoint, requestParams);

        const allQuotes: AlpacaQuote[] = [];
        let nextPageToken: string | undefined;

        do {
          if (nextPageToken) {
            requestParams.page_token = nextPageToken;
          }

          const response = await this.dataApi.get<AlpacaQuotesResponse>(endpoint, {
            params: requestParams,
          });

          // Check if response data and quotes exist
          if (!response.data) {
            console.warn(`No response data received for ${symbol} quotes on ${startStr}`);
            break;
          }

          if (!response.data.quotes) {
            console.warn(`No quotes data in response for ${symbol} on ${startStr}`);
            break;
          }

          // Handle both old format (quotes[symbol]) and new format (quotes array)
          const quotes = Array.isArray(response.data.quotes)
            ? response.data.quotes
            : response.data.quotes[symbol] || [];
          allQuotes.push(...quotes);
          nextPageToken = response.data.next_page_token;

          // Small delay to respect rate limits
          if (nextPageToken) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } while (nextPageToken);

        return allQuotes;
      } catch (error) {
        console.error(`Error fetching historical quotes for ${symbol}:`, error);

        // Log additional details for debugging
        if (error && typeof error === 'object' && 'response' in error) {
          const axiosError = error as { response?: { data?: unknown; status?: number; statusText?: string } };
          console.error(`API Response Status: ${axiosError.response?.status} ${axiosError.response?.statusText}`);
          console.error(`API Response Data:`, axiosError.response?.data);
        }

        throw error;
      }
    });
  }

  async getLatestTrade(symbol: string): Promise<AlpacaTrade | null> {
    return this.rateLimiter.execute(async () => {
      try {
        const endpoint = `/v2/stocks/${symbol}/trades/latest`;
        const requestParams = {
          feed: 'iex',
        };

        this.logRequest('GET', endpoint, requestParams);

        const response = await this.dataApi.get<{ trade: AlpacaTrade }>(endpoint, {
          params: requestParams,
        });

        return response.data.trade || null;
      } catch (error) {
        console.error(`Error fetching latest trade for ${symbol}:`, error);
        return null;
      }
    });
  }

  async getLatestBar(symbol: string): Promise<AlpacaBar | null> {
    return this.rateLimiter.execute(async () => {
      try {
        const endpoint = `/v2/stocks/${symbol}/bars/latest`;
        const requestParams = {
          feed: 'iex',
        };

        this.logRequest('GET', endpoint, requestParams);

        const response = await this.dataApi.get<{ bar: AlpacaBar }>(endpoint, {
          params: requestParams,
        });

        return response.data.bar || null;
      } catch (error) {
        console.error(`Error fetching latest bar for ${symbol}:`, error);
        return null;
      }
    });
  }
}
