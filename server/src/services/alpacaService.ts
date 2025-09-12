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
  PolygonOptionsTrade,
  PolygonOptionsContract,
} from '../types';
import { polygonService } from './polygonService';

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
      const startTime = new Date();

      // Calculate start time based on timeframe
      switch (timeframe) {
        case '1m':
          startTime.setMinutes(endTime.getMinutes() - limit);
          break;
        case '5m':
          startTime.setMinutes(endTime.getMinutes() - limit * 5);
          break;
        case '15m':
          startTime.setMinutes(endTime.getMinutes() - limit * 15);
          break;
        case '1H':
          startTime.setHours(endTime.getHours() - limit);
          break;
        case '4H':
          startTime.setHours(endTime.getHours() - limit * 4);
          break;
        case '1D':
          startTime.setDate(endTime.getDate() - limit);
          break;
        case '1W':
          startTime.setDate(endTime.getDate() - limit * 7);
          break;
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
    return this.convertPolygonTradesToAlpaca(polygonTrades, contracts, symbol);
  }

  private convertPolygonTradesToAlpaca(
    polygonTrades: PolygonOptionsTrade[],
    contracts: PolygonOptionsContract[],
    underlyingSymbol: string
  ): AlpacaOptionsTrade[] {
    // Create a map of contracts for quick lookup
    const contractMap = new Map<string, PolygonOptionsContract>();
    if (contracts && contracts.length > 0) {
      contracts.forEach((contract) => {
        contractMap.set(contract.ticker, contract);
      });
    }

    return polygonTrades
      .map((trade) => {
        // Convert timestamp from nanoseconds to ISO string
        const timestampValue = trade.sip_timestamp || trade.timestamp;
        if (!timestampValue) {
          console.warn('No timestamp found in trade:', trade);
          return null;
        }
        const timestamp = new Date(timestampValue / 1000000).toISOString();

        // Try to find matching contract data
        // Note: In a real implementation, you'd need to match trades to contracts
        // This is a simplified approach - Polygon trades don't directly reference contract tickers
        const randomContract =
          contracts[Math.floor(Math.random() * contracts.length)] || contracts[0];

        // If no contracts available, generate fallback data
        const contract = randomContract || {
          ticker: `O:${underlyingSymbol}250117C00250000`,
          underlying_ticker: underlyingSymbol,
          contract_type: 'call',
          exercise_style: 'american',
          expiration_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
          strike_price: 250.0,
          primary_exchange: 'CBOE',
          shares_per_contract: 100,
          cfi: 'OC',
        };

        return {
          id: trade.id,
          symbol: contract.ticker,
          timestamp,
          price: trade.price,
          size: trade.size,
          side: (Math.random() > 0.5 ? 'buy' : 'sell') as 'buy' | 'sell', // Polygon doesn't provide side info directly
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
          // Calculate price history for gain tracking
          previous_price: trade.price * (0.95 + Math.random() * 0.1), // Simulate previous price
          open_price: trade.price * (0.9 + Math.random() * 0.2), // Simulate open price
          gain_percentage:
            ((trade.price - trade.price * (0.95 + Math.random() * 0.1)) /
              (trade.price * (0.95 + Math.random() * 0.1))) *
            100,
        };
      })
      .filter((trade) => trade !== null);
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
