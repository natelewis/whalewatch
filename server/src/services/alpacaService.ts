import Alpaca from '@alpacahq/alpaca-trade-api';
import {
  AlpacaAccount,
  AlpacaPosition,
  AlpacaActivity,
  AlpacaBar,
  AlpacaOptionsTrade,
  CreateOrderRequest,
  CreateOrderResponse,
  ChartTimeframe
} from '../types';

export class AlpacaService {
  private alpaca: Alpaca;

  constructor() {
    this.alpaca = new Alpaca({
      key: process.env.ALPACA_API_KEY || '',
      secret: process.env.ALPACA_SECRET_KEY || '',
      paper: process.env.ALPACA_BASE_URL?.includes('paper') || true,
      baseUrl: process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets',
      dataBaseUrl: process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets'
    });
  }

  async getAccount(): Promise<AlpacaAccount> {
    try {
      const account = await this.alpaca.getAccount();
      return account as AlpacaAccount;
    } catch (error) {
      console.error('Error fetching account:', error);
      throw new Error('Failed to fetch account information');
    }
  }

  async getPositions(): Promise<AlpacaPosition[]> {
    try {
      const positions = await this.alpaca.getPositions();
      return positions as AlpacaPosition[];
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

      const activities = await this.alpaca.getActivities(params);
      return activities as AlpacaActivity[];
    } catch (error) {
      console.error('Error fetching activities:', error);
      throw new Error('Failed to fetch activities');
    }
  }

  async getBars(symbol: string, timeframe: ChartTimeframe, limit: number = 1000): Promise<AlpacaBar[]> {
    try {
      const endTime = new Date();
      const startTime = new Date();
      
      // Calculate start time based on timeframe
      switch (timeframe) {
        case '1m':
          startTime.setMinutes(endTime.getMinutes() - limit);
          break;
        case '5m':
          startTime.setMinutes(endTime.getMinutes() - (limit * 5));
          break;
        case '15m':
          startTime.setMinutes(endTime.getMinutes() - (limit * 15));
          break;
        case '1H':
          startTime.setHours(endTime.getHours() - limit);
          break;
        case '4H':
          startTime.setHours(endTime.getHours() - (limit * 4));
          break;
        case '1D':
          startTime.setDate(endTime.getDate() - limit);
          break;
        case '1W':
          startTime.setDate(endTime.getDate() - (limit * 7));
          break;
      }

      const bars = await this.alpaca.getBarsV2(symbol, {
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        timeframe: this.mapTimeframe(timeframe),
        limit: limit
      });

      return bars[symbol]?.map(bar => ({
        t: bar.Timestamp,
        o: bar.OpenPrice,
        h: bar.HighPrice,
        l: bar.LowPrice,
        c: bar.ClosePrice,
        v: bar.Volume,
        n: bar.TradeCount,
        vw: bar.VWAP
      })) || [];
    } catch (error) {
      console.error('Error fetching bars:', error);
      throw new Error('Failed to fetch chart data');
    }
  }

  async getOptionsTrades(symbol: string, hours: number = 1): Promise<AlpacaOptionsTrade[]> {
    try {
      const endTime = new Date();
      const startTime = new Date();
      startTime.setHours(endTime.getHours() - hours);

      // Note: This is a simplified implementation
      // In practice, you'd need to use Alpaca's options data API
      // For now, we'll return mock data structure
      return [];
    } catch (error) {
      console.error('Error fetching options trades:', error);
      throw new Error('Failed to fetch options trades');
    }
  }

  async createOrder(orderData: CreateOrderRequest): Promise<CreateOrderResponse> {
    try {
      const order = await this.alpaca.createOrder({
        symbol: orderData.symbol,
        qty: orderData.qty,
        side: orderData.side,
        type: orderData.type,
        time_in_force: orderData.time_in_force,
        limit_price: orderData.limit_price,
        stop_price: orderData.stop_price
      });

      return order as CreateOrderResponse;
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
      '1W': '1Week'
    };
    return mapping[timeframe];
  }
}

export const alpacaService = new AlpacaService();
