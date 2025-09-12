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
import {
  polygonService,
  PolygonOptionsTrade,
  PolygonOptionsContract,
  PolygonBar,
} from './polygonService';

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
      const params: any = {};
      if (startDate) params.start = startDate;
      if (endDate) params.end = endDate;

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

  async getBars(
    symbol: string,
    timeframe: ChartTimeframe,
    limit: number = 1000
  ): Promise<AlpacaBar[]> {
    try {
      const endTime = new Date();
      let startTime: Date;

      // Calculate start time based on timeframe using milliseconds
      switch (timeframe) {
        case '1m':
          startTime = new Date(endTime.getTime() - limit * 60 * 1000);
          break;
        case '5m':
          startTime = new Date(endTime.getTime() - limit * 5 * 60 * 1000);
          break;
        case '15m':
          startTime = new Date(endTime.getTime() - limit * 15 * 60 * 1000);
          break;
        case '1H':
          startTime = new Date(endTime.getTime() - limit * 60 * 60 * 1000);
          break;
        case '4H':
          startTime = new Date(endTime.getTime() - limit * 4 * 60 * 60 * 1000);
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
        response.data.bars?.map((bar: any) => ({
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
    } catch (error: any) {
      console.error('Error fetching bars:', error);

      // Handle specific Alpaca API errors
      if (error.response?.status === 403) {
        if (error.response.data?.message?.includes('subscription does not permit')) {
          throw new Error(
            'API subscription does not support real-time data. Please upgrade your Alpaca account or use delayed data.'
          );
        }
        throw new Error('Access denied. Please check your API credentials.');
      }

      if (error.response?.status === 401) {
        throw new Error('Invalid API credentials. Please check your Alpaca API key and secret.');
      }

      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }

      throw new Error('Failed to fetch chart data');
    }
  }

  async getOptionsTrades(symbol: string, hours: number = 1): Promise<AlpacaOptionsTrade[]> {
    // Use Polygon API for real options trades data
    const polygonTrades = await polygonService.getOptionsTrades(symbol, hours, 1000);

    // Get contract information for accurate option details
    const contracts = await polygonService.getOptionsContracts(symbol, 1000);

    // Convert Polygon trades to Alpaca format for consistency
    return this.convertPolygonTradesToAlpaca(polygonTrades, contracts);
  }

  convertPolygonBarsToAlpaca(polygonBars: PolygonBar[]): AlpacaBar[] {
    return polygonBars.map((bar) => ({
      t: bar.t.toString(),
      o: bar.o,
      h: bar.h,
      l: bar.l,
      c: bar.c,
      v: bar.v,
      ...(bar.n !== undefined && { n: bar.n }),
      ...(bar.vw !== undefined && { vw: bar.vw }),
    }));
  }

  convertPolygonTradesToAlpaca(
    polygonTrades: PolygonOptionsTrade[],
    contracts: PolygonOptionsContract[]
  ): AlpacaOptionsTrade[] {
    // Create a map of contracts for quick lookup
    const contractMap = new Map<string, PolygonOptionsContract>();
    if (contracts && contracts.length > 0) {
      contracts.forEach((contract) => {
        contractMap.set(contract.ticker, contract);
      });
    }

    const alpacaTrades = polygonTrades
      .map((trade) => {
        // Convert timestamp from nanoseconds to ISO string
        const timestampValue = trade.sip_timestamp || trade.timestamp;
        if (!timestampValue || timestampValue <= 0) {
          console.warn('Invalid timestamp found in trade:', trade);
          return null;
        }

        // Validate timestamp before conversion
        const timestampMs = timestampValue / 1000000;
        if (isNaN(timestampMs) || timestampMs <= 0) {
          console.warn('Invalid timestamp conversion for trade:', trade);
          return null;
        }

        const timestamp = new Date(timestampMs).toISOString();

        // Find matching contract data using the contract ticker
        const contractTicker = trade.contract_ticker;
        let contract: PolygonOptionsContract | null = null;

        if (contractTicker) {
          contract = contracts.find((c) => c.ticker === contractTicker) || null;
        }

        // Fallback to first contract if no specific contract found (shouldn't happen with new approach)
        if (!contract && contracts.length > 0) {
          console.warn(
            `No contract found for trade ${trade.id} with ticker ${contractTicker}, using first available contract`
          );
          contract = contracts[0];
        }

        // FAIL FAST: If no contracts available, we cannot process this trade safely
        if (!contract) {
          throw new Error(
            `No contract data available for trade ${trade.id} - cannot determine strike price, expiration, or option type. This trade will be rejected.`
          );
        }

        // Validate contract data
        if (!contract.strike_price || contract.strike_price <= 0) {
          throw new Error(
            `Invalid contract strike price: ${contract.strike_price} for trade ${trade.id}`
          );
        }
        if (!contract.expiration_date) {
          throw new Error(`Missing contract expiration date for trade ${trade.id}`);
        }
        if (!contract.contract_type || !['call', 'put'].includes(contract.contract_type)) {
          throw new Error(`Invalid contract type: ${contract.contract_type} for trade ${trade.id}`);
        }

        const alpacaTrade: AlpacaOptionsTrade = {
          id: trade.id,
          symbol: contract.ticker,
          timestamp,
          price: trade.price,
          size: trade.size,
          side: 'unknown', // Polygon doesn't provide side info directly
          conditions: trade.conditions.map((c) => c.toString()),
          exchange: this.mapExchangeCode(trade.exchange),
          tape: this.mapTapeCode(trade.tape),
          contract: {
            symbol: contract.ticker,
            underlying_symbol: contract.underlying_ticker,
            exercise_style: contract.exercise_style,
            expiration_date: contract.expiration_date,
            strike_price: contract.strike_price,
            option_type: (contract.contract_type === 'call' ? 'call' : 'put') as 'call' | 'put',
          },
          // No mock price history - only use real data
        };

        return alpacaTrade;
      })
      .filter((trade) => trade !== null);

    // Debug: Log first few converted trades to verify sorting
    if (alpacaTrades.length > 0) {
      console.log('First 3 converted trades:');
      alpacaTrades.slice(0, 3).forEach((trade: AlpacaOptionsTrade, index: number) => {
        console.log(
          `${index + 1}. Trade ${trade.id}: ${trade.timestamp} (strike: $${
            trade.contract.strike_price
          })`
        );
      });
    }

    return alpacaTrades;
  }

  private mapExchangeCode(exchangeCode: number): string {
    // Map Polygon exchange codes to readable names
    const exchangeMap: Record<number, string> = {
      1: 'CBOE',
      2: 'AMEX',
      3: 'PHLX',
      4: 'ISE',
      5: 'BOX',
      6: 'BATS',
      7: 'C2',
      8: 'EDGX',
      9: 'EDGA',
      10: 'ARCA',
      11: 'NASDAQ',
      12: 'NYSE',
    };
    return exchangeMap[exchangeCode] || 'UNKNOWN';
  }

  private mapTapeCode(tapeCode: number): string {
    // Map Polygon tape codes to readable names
    const tapeMap: Record<number, string> = {
      1: 'A',
      2: 'B',
      3: 'C',
    };
    return tapeMap[tapeCode] || 'UNKNOWN';
  }

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
      '5m': '5Min',
      '15m': '15Min',
      '1H': '1Hour',
      '4H': '4Hour',
      '1D': '1Day',
      '1W': '1Week',
    };
    return mapping[timeframe];
  }
}

export const alpacaService = new AlpacaService();
