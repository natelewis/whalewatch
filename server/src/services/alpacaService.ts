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
          throw new Error('API subscription does not support real-time data. Please upgrade your Alpaca account or use delayed data.');
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
    try {
      const endTime = new Date();
      const startTime = new Date();
      startTime.setHours(endTime.getHours() - hours);

      // Note: Alpaca's paper trading API doesn't provide options trades data
      // This is a mock implementation for demonstration purposes
      // In production, you would integrate with a real options data provider
      // such as Polygon, IEX Cloud, or other financial data APIs
      
      return this.generateMockOptionsTrades(symbol, hours);
    } catch (error) {
      console.error('Error fetching options trades:', error);
      throw new Error('Failed to fetch options trades');
    }
  }

  private generateMockOptionsTrades(symbol: string, hours: number): AlpacaOptionsTrade[] {
    const trades: AlpacaOptionsTrade[] = [];
    const now = new Date();
    const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);

    // Generate 50-200 mock trades over the specified time period (more realistic for 24h)
    const numTrades = Math.floor(Math.random() * 151) + 50;

    // Track option prices by contract to calculate gains
    const optionPrices: {
      [key: string]: { openPrice: number; previousPrice: number; lastTradeTime: number };
    } = {};

    // Generate trades in chronological order for more realistic price movements
    const tradeTimes: Date[] = [];
    for (let i = 0; i < numTrades; i++) {
      const tradeTime = new Date(
        startTime.getTime() + Math.random() * (now.getTime() - startTime.getTime())
      );
      tradeTimes.push(tradeTime);
    }
    tradeTimes.sort((a, b) => a.getTime() - b.getTime());

    for (let i = 0; i < numTrades; i++) {
      const tradeTime = tradeTimes[i];
      const isCall = Math.random() > 0.5;
      const side = Math.random() > 0.5 ? 'buy' : 'sell';

      // Generate realistic strike prices around current stock price
      const basePrice = this.getBasePriceForSymbol(symbol);
      const strikePrice = Math.round(basePrice * (0.8 + Math.random() * 0.4) * 100) / 100;

      // Generate expiration dates (1-30 days from now)
      const expirationDate = new Date(
        now.getTime() + (Math.random() * 30 + 1) * 24 * 60 * 60 * 1000
      );

      // Create unique contract identifier
      const contractId = `${symbol}${expirationDate.toISOString().slice(2, 10).replace(/-/g, '')}${
        isCall ? 'C' : 'P'
      }${strikePrice.toString().replace('.', '')}`;

      // Generate realistic option prices with volatility
      const intrinsicValue = Math.max(0, basePrice - strikePrice);
      const timeValue = Math.random() * 5 + 0.5;
      const basePriceValue = Math.max(0.01, intrinsicValue + timeValue);

      // Add realistic price movement based on time and volatility
      const timeElapsed =
        (tradeTime.getTime() - startTime.getTime()) / (now.getTime() - startTime.getTime());
      const volatility = 0.3 + Math.random() * 0.4; // 30-70% volatility
      const priceMovement = (Math.random() - 0.5) * volatility * basePriceValue * timeElapsed;
      const price = Math.max(0.01, basePriceValue + priceMovement);

      // Generate realistic trade sizes (whale trades are typically large)
      // Create a distribution where 20% are whale trades (1000+ contracts), 30% are large (500-999), 50% are medium (100-499)
      const rand = Math.random();
      let size;
      if (rand < 0.2) {
        // Whale trades: 1000-5000 contracts
        size = Math.floor(Math.random() * 4000) + 1000;
      } else if (rand < 0.5) {
        // Large trades: 500-999 contracts
        size = Math.floor(Math.random() * 500) + 500;
      } else {
        // Medium trades: 100-499 contracts
        size = Math.floor(Math.random() * 400) + 100;
      }

      // Calculate price history and gains
      const roundedPrice = Math.round(price * 100) / 100;
      let openPrice = roundedPrice;
      let previousPrice = roundedPrice;
      let gainPercentage = 0;

      if (optionPrices[contractId]) {
        // This contract has been traded before
        openPrice = optionPrices[contractId].openPrice;
        previousPrice = optionPrices[contractId].previousPrice;

        // Calculate gain from previous trade price
        gainPercentage = ((roundedPrice - previousPrice) / previousPrice) * 100;

        // Update the previous price for next trade
        optionPrices[contractId].previousPrice = roundedPrice;
        optionPrices[contractId].lastTradeTime = tradeTime.getTime();
      } else {
        // First trade for this contract
        optionPrices[contractId] = {
          openPrice: roundedPrice,
          previousPrice: roundedPrice,
          lastTradeTime: tradeTime.getTime(),
        };

        // For first trade, generate a small random gain/loss to make it interesting
        const randomGain = (Math.random() - 0.5) * 20; // ±10% random gain
        gainPercentage = randomGain;
      }

      trades.push({
        id: `mock_${symbol}_${i}_${Date.now()}`,
        symbol: `${symbol}${expirationDate.toISOString().slice(2, 10).replace(/-/g, '')}${
          isCall ? 'C' : 'P'
        }${strikePrice.toString().replace('.', '')}`,
        timestamp: tradeTime.toISOString(),
        price: roundedPrice,
        size,
        side,
        conditions: ['regular'],
        exchange: 'OPRA',
        tape: 'C',
        contract: {
          symbol: `${symbol}${expirationDate.toISOString().slice(2, 10).replace(/-/g, '')}${
            isCall ? 'C' : 'P'
          }${strikePrice.toString().replace('.', '')}`,
          underlying_symbol: symbol,
          exercise_style: 'american',
          expiration_date: expirationDate.toISOString().split('T')[0],
          strike_price: strikePrice,
          option_type: isCall ? 'call' : 'put',
        },
        open_price: openPrice,
        previous_price: previousPrice,
        gain_percentage: Math.round(gainPercentage * 100) / 100, // Round to 2 decimal places
      });
    }

    // Sort by timestamp (most recent first) - reverse the chronological order
    return trades.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  private getBasePriceForSymbol(symbol: string): number {
    // Mock current stock prices for common symbols
    const prices: Record<string, number> = {
      'TSLA': 250.00,
      'AAPL': 180.00,
      'MSFT': 350.00,
      'GOOGL': 140.00,
      'AMZN': 150.00,
      'NVDA': 800.00,
      'META': 300.00,
      'NFLX': 400.00,
      'AMD': 120.00,
      'SPY': 450.00,
      'QQQ': 380.00,
      'IWM': 200.00
    };
    
    return prices[symbol] || 100.00; // Default price if symbol not found
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
