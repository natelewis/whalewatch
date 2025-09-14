import axios, { AxiosResponse } from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from the server directory
dotenv.config({ path: path.join(__dirname, '../../.env') });

export interface PolygonOptionsTrade {
  id: string;
  conditions: number[];
  exchange: number;
  price: number;
  size: number;
  timestamp: number;
  participant_timestamp: number;
  sip_timestamp: number;
  tape: number;
  contract_ticker?: string; // Add contract ticker to associate trade with contract
}

export interface PolygonOptionsContract {
  cfi: string;
  contract_type: string;
  exercise_style: string;
  expiration_date: string;
  primary_exchange: string;
  shares_per_contract: number;
  strike_price: number;
  ticker: string;
  underlying_ticker: string;
}

export interface PolygonOptionsTradesResponse {
  next_url?: string;
  request_id: string;
  results: PolygonOptionsTrade[];
  status: string;
}

export interface PolygonOptionsContractsResponse {
  next_url?: string;
  request_id: string;
  results: PolygonOptionsContract[];
  status: string;
}

export interface PolygonBar {
  t: number; // timestamp
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
  n?: number; // number of transactions
  vw?: number; // volume weighted average price
}

export interface PolygonBarsResponse {
  next_url?: string;
  request_id: string;
  results: PolygonBar[];
  status: string;
}

export class PolygonService {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = process.env.POLYGON_BASE_URL || 'https://api.polygon.io';
    this.apiKey = process.env.POLYGON_API_KEY || '';

    if (!this.apiKey) {
      console.warn('POLYGON_API_KEY not found in environment variables');
    }
  }

  /**
   * Get options trades for a specific underlying symbol
   * Note: This method first gets available contracts, then fetches trades for each contract
   * @param underlyingSymbol - The underlying stock symbol (e.g., 'AAPL')
   * @param hours - Number of hours to look back (default: 1)
   * @param limit - Maximum number of trades to return (default: 1000)
   */
  async getOptionsTrades(
    underlyingSymbol: string,
    hours: number = 1,
    limit: number = 1000
  ): Promise<PolygonOptionsTrade[]> {
    try {
      if (!this.apiKey) {
        throw new Error('Polygon API key not configured');
      }

      // First, get available options contracts for the symbol
      const contracts = await this.getOptionsContracts(underlyingSymbol, 200);

      if (!contracts || contracts.length === 0) {
        console.warn(`No options contracts found for ${underlyingSymbol}`);
        return [];
      }

      // Get trades for the most recent contracts (limit to first 50 to get more comprehensive data)
      const recentContracts = contracts.slice(0, 50);
      const allTrades: PolygonOptionsTrade[] = [];

      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);
      const dateStr = startTime.toISOString().split('T')[0]; // YYYY-MM-DD format

      for (const contract of recentContracts) {
        try {
          const trades = await this.getContractTrades(
            contract.ticker,
            dateStr,
            Math.min(200, limit)
          );
          // Add contract ticker to each trade for proper association
          const tradesWithContract = trades.map((trade) => ({
            ...trade,
            contract_ticker: contract.ticker,
          }));
          allTrades.push(...tradesWithContract);
        } catch (contractError: any) {
          if (contractError.response?.status === 403) {
            console.warn(
              `Access forbidden for contract ${contract.ticker} - subscription may not include options trades data`
            );
          } else {
            console.warn(
              `Failed to fetch trades for contract ${contract.ticker}:`,
              contractError.message
            );
          }
          // Continue with other contracts
        }
      }

      // Sort by timestamp and limit results
      const sortedTrades = allTrades.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);

      // Debug: Log first few trades to verify sorting
      if (sortedTrades.length > 0) {
        console.log('First 3 trades after sorting:');
        sortedTrades.slice(0, 3).forEach((trade, index) => {
          if (trade.timestamp && trade.timestamp > 0) {
            const date = new Date(trade.timestamp / 1000000);
            console.log(
              `${index + 1}. Trade ${trade.id}: ${date.toISOString()} (timestamp: ${
                trade.timestamp
              })`
            );
          } else {
            console.log(
              `${index + 1}. Trade ${trade.id}: Invalid timestamp (timestamp: ${trade.timestamp})`
            );
          }
        });
      }

      if (sortedTrades.length === 0) {
        console.warn(`No options trades found for ${underlyingSymbol}. This could be due to:`);
        console.warn('1. No trading activity in the specified time period');
        console.warn('2. API subscription does not include options trades data');
        console.warn('3. Symbol does not have active options trading');
        console.warn(
          '4. All contract requests returned 403 (forbidden) - check subscription level'
        );
      }

      return sortedTrades;
    } catch (error: any) {
      console.error('Error fetching options trades from Polygon:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url,
        params: error.config?.params,
      });

      if (error.response?.status === 401) {
        throw new Error('Invalid Polygon API key');
      }

      if (error.response?.status === 429) {
        throw new Error('Polygon API rate limit exceeded');
      }

      if (error.response?.status === 403) {
        throw new Error('Polygon API access forbidden - check subscription level');
      }

      if (error.response?.status === 400) {
        throw new Error(
          `Polygon API bad request: ${error.response?.data?.message || 'Invalid parameters'}`
        );
      }

      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new Error('Polygon API connection failed - check network connectivity');
      }

      throw new Error(`Failed to fetch options trades from Polygon: ${error.message}`);
    }
  }

  /**
   * Get options contracts for a specific underlying symbol
   * @param underlyingSymbol - The underlying stock symbol (e.g., 'AAPL')
   * @param limit - Maximum number of contracts to return (default: 1000)
   */
  async getOptionsContracts(
    underlyingSymbol: string,
    limit: number = 1000
  ): Promise<PolygonOptionsContract[]> {
    try {
      if (!this.apiKey) {
        throw new Error('Polygon API key not configured');
      }

      const response: AxiosResponse<PolygonOptionsContractsResponse> = await axios.get(
        `${this.baseUrl}/v3/reference/options/contracts`,
        {
          params: {
            underlying_ticker: underlyingSymbol.toUpperCase(),
            limit: 10, //Math.min(limit, 1), // Polygon's max limit for contracts
            apikey: this.apiKey,
            expired: false,
            // size: 100,
            // shares_per_contract: 100,
          },
        }
      );

      if (response.data.status !== 'OK' && response.data.status !== 'DELAYED') {
        throw new Error(`Polygon API error: ${response.data.status}`);
      }

      return response.data.results || [];
    } catch (error: any) {
      console.error('Error fetching options contracts from Polygon:', error);

      if (error.response?.status === 401) {
        throw new Error('Invalid Polygon API key');
      }

      if (error.response?.status === 429) {
        throw new Error('Polygon API rate limit exceeded');
      }

      if (error.response?.status === 403) {
        throw new Error('Polygon API access forbidden - check subscription level');
      }

      throw new Error('Failed to fetch options contracts from Polygon');
    }
  }

  /**
   * Get options trades for a specific contract
   * @param contractTicker - The options contract ticker (e.g., 'O:AAPL250117C00250000')
   * @param date - Date in YYYY-MM-DD format (default: today)
   * @param limit - Maximum number of trades to return (default: 1000)
   */
  async getContractTrades(
    contractTicker: string,
    date?: string,
    limit: number = 1000
  ): Promise<PolygonOptionsTrade[]> {
    try {
      if (!this.apiKey) {
        throw new Error('Polygon API key not configured');
      }

      const targetDate = date || new Date().toISOString().split('T')[0];

      const response: AxiosResponse<PolygonOptionsTradesResponse> = await axios.get(
        `${this.baseUrl}/v3/trades/${contractTicker}`,
        {
          params: {
            date: targetDate,
            limit: Math.min(limit, 50000),
            order: 'desc',
            sort: 'timestamp',
            apikey: this.apiKey,
          },
        }
      );

      if (response.data.status !== 'OK' && response.data.status !== 'DELAYED') {
        throw new Error(`Polygon API error: ${response.data.status}`);
      }

      return response.data.results || [];
    } catch (error: any) {
      console.error('Error fetching contract trades from Polygon:', error);

      if (error.response?.status === 401) {
        throw new Error('Invalid Polygon API key');
      }

      if (error.response?.status === 429) {
        throw new Error('Polygon API rate limit exceeded');
      }

      if (error.response?.status === 403) {
        throw new Error('Polygon API access forbidden - check subscription level');
      }

      throw new Error('Failed to fetch contract trades from Polygon');
    }
  }

  /**
   * Check if the API key is valid by making a simple request
   */
  async validateApiKey(): Promise<boolean> {
    try {
      if (!this.apiKey) {
        console.warn('No Polygon API key configured');
        return false;
      }

      // Make a simple request to check API key validity
      const response = await axios.get(`${this.baseUrl}/v3/reference/tickers`, {
        params: {
          market: 'stocks',
          limit: 1,
          apikey: this.apiKey,
        },
      });

      const isValid = response.data.status === 'OK';
      console.log(`Polygon API key validation: ${isValid ? 'SUCCESS' : 'FAILED'}`);
      return isValid;
    } catch (error: any) {
      console.error('Polygon API key validation failed:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      return false;
    }
  }

  /**
   * Get stock bars for a symbol
   * @param symbol - The stock symbol (e.g., 'AAPL')
   * @param timeframe - The timeframe (1m, 5m, 15m, 1h, 1d)
   * @param limit - Maximum number of bars to return (default: 1000)
   * @param from - Start date in YYYY-MM-DD format (default: 30 days ago)
   * @param to - End date in YYYY-MM-DD format (default: today)
   */
  async getBars(
    symbol: string,
    timeframe: string = '1d',
    limit: number = 1000,
    from?: string,
    to?: string
  ): Promise<PolygonBar[]> {
    // Map frontend timeframe values to Polygon API format
    const polygonTimeframe = this.mapTimeframeToPolygon(timeframe);
    try {
      if (!this.apiKey) {
        throw new Error('Polygon API key not configured');
      }

      const endDate = to || new Date().toISOString().split('T')[0];
      const startDate =
        from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const response: AxiosResponse<PolygonBarsResponse> = await axios.get(
        `${
          this.baseUrl
        }/v2/aggs/ticker/${symbol.toUpperCase()}/range/1/${polygonTimeframe}/${startDate}/${endDate}`,
        {
          params: {
            adjusted: true,
            sort: 'asc',
            limit: Math.min(limit, 50000),
            apikey: this.apiKey,
          },
        }
      );

      if (response.data.status !== 'OK' && response.data.status !== 'DELAYED') {
        throw new Error(`Polygon API error: ${response.data.status}`);
      }

      return response.data.results || [];
    } catch (error: any) {
      console.error('Error fetching bars from Polygon:', error);

      if (error.response?.status === 401) {
        throw new Error('Invalid Polygon API key');
      }

      if (error.response?.status === 429) {
        throw new Error('Polygon API rate limit exceeded');
      }

      if (error.response?.status === 403) {
        throw new Error('Polygon API access forbidden - check subscription level');
      }

      throw new Error('Failed to fetch bars from Polygon');
    }
  }

  /**
   * Map frontend timeframe values to Polygon API format
   */
  private mapTimeframeToPolygon(timeframe: string): string {
    const timeframeMap: Record<string, string> = {
      '1m': 'minute',
      '5m': 'minute',
      '15m': 'minute',
      '1H': 'hour',
      '4H': 'hour',
      '1D': 'day',
      '1W': 'week',
      '1d': 'day',
      '1w': 'week',
      '1h': 'hour',
    };

    return timeframeMap[timeframe] || 'day';
  }

  /**
   * Test the API connection and log detailed information
   */
  async testConnection(): Promise<void> {
    console.log('Testing Polygon API connection...');
    console.log(`API Key configured: ${!!this.apiKey}`);
    console.log(`Base URL: ${this.baseUrl}`);

    if (!this.apiKey) {
      console.error('❌ No API key configured. Please set POLYGON_API_KEY environment variable.');
      return;
    }

    try {
      const isValid = await this.validateApiKey();
      if (isValid) {
        console.log('✅ Polygon API key is valid');

        // Test options contracts access
        try {
          const contracts = await this.getOptionsContracts('AAPL', 1);
          console.log(`✅ Options contracts access: Found ${contracts.length} contracts for AAPL`);
        } catch (contractError: any) {
          if (contractError.response?.status === 403) {
            console.log(
              '❌ Options contracts access: FORBIDDEN - subscription may not include options data'
            );
          } else {
            console.log(`❌ Options contracts access: ${contractError.message}`);
          }
        }

        // Test options trades access
        try {
          const trades = await this.getOptionsTrades('AAPL', 1, 10);
          console.log(`✅ Options trades access: Found ${trades.length} trades for AAPL`);
        } catch (tradeError: any) {
          if (tradeError.response?.status === 403) {
            console.log(
              '❌ Options trades access: FORBIDDEN - subscription may not include options trades data'
            );
          } else {
            console.log(`❌ Options trades access: ${tradeError.message}`);
          }
        }
      } else {
        console.log('❌ Polygon API key is invalid or expired');
      }
    } catch (error) {
      console.error('❌ Failed to test Polygon API connection:', error);
    }
  }
}

export const polygonService = new PolygonService();
