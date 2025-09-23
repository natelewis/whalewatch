import dotenv from 'dotenv';

dotenv.config();

export interface Config {
  alpaca: {
    apiKey: string;
    secretKey: string;
    baseUrl: string;
    wsUrl: string;
    dataUrl: string;
    logRequests: boolean;
  };
  polygon: {
    apiKey: string;
    baseUrl: string;
    wsUrl: string;
    logRequests: boolean;
    skipOptionTrades: boolean;
    skipOptionQuotes: boolean;
    skipOptionContracts: boolean;
    optionContractsLimit: number;
    optionQuotesLimit: number;
  };
  questdb: {
    host: string;
    port: number;
    user: string;
    password: string;
  };
  app: {
    logLevel: string;
    maxRetries: number;
    retryDelayMs: number;
    backfillMaxDays: number;
  };
  tickers: string[];
}

const requiredEnvVars = ['POLYGON_API_KEY', 'ALPACA_API_KEY', 'ALPACA_SECRET_KEY'] as const;

function validateConfig(): void {
  const missing = requiredEnvVars.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate optionQuotesLimit
  const quotesLimit = parseInt(process.env.POLYGON_OPTION_QUOTES_LIMIT || '50000');
  if (quotesLimit < 1000 || quotesLimit > 50000) {
    throw new Error(`POLYGON_OPTION_QUOTES_LIMIT must be between 1000 and 50000, got: ${quotesLimit}`);
  }
}

export const config: Config = {
  alpaca: {
    apiKey: process.env.ALPACA_API_KEY!,
    secretKey: process.env.ALPACA_SECRET_KEY!,
    baseUrl: 'https://paper-api.alpaca.markets',
    wsUrl: 'wss://stream.data.alpaca.markets/v2/iex',
    dataUrl: 'https://data.alpaca.markets',
    logRequests: process.env.ALPACA_LOG_REQUESTS === 'true',
  },
  polygon: {
    apiKey: process.env.POLYGON_API_KEY!,
    baseUrl: 'https://api.polygon.io',
    wsUrl: 'wss://socket.polygon.io/stocks',
    logRequests: process.env.POLYGON_LOG_REQUESTS === 'true',
    skipOptionTrades: process.env.POLYGON_SKIP_OPTION_TRADES === 'true',
    skipOptionQuotes: process.env.POLYGON_SKIP_OPTION_QUOTES === 'true',
    skipOptionContracts: process.env.POLYGON_SKIP_OPTION_CONTACTS === 'true',
    optionContractsLimit: parseInt(process.env.POLYGON_OPTION_CONTRACTS_LIMIT || '1000'),
    optionQuotesLimit: parseInt(process.env.POLYGON_OPTION_QUOTES_LIMIT || '50000'),
  },
  questdb: {
    host: process.env.QUESTDB_HOST || '127.0.0.1',
    port: parseInt(process.env.QUESTDB_PORT || '9000'),
    user: process.env.QUESTDB_USER || 'admin',
    password: process.env.QUESTDB_PASSWORD || 'quest',
  },
  app: {
    logLevel: process.env.LOG_LEVEL || 'info',
    maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
    retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '1000'),
    backfillMaxDays: parseInt(process.env.BACKFILL_MAX_DAYS || '30'),
  },
  tickers: process.env.TICKERS
    ? process.env.TICKERS.split(',').map(t => t.trim())
    : [
        'AAPL',
        'MSFT',
        'GOOGL',
        'AMZN',
        'TSLA',
        'META',
        'NVDA',
        'NFLX',
        'AMD',
        'INTC',
        'SPY',
        'QQQ',
        'IWM',
        'VTI',
        'VOO',
        'ARKK',
        'TQQQ',
        'SQQQ',
        'UPRO',
        'SPXL',
      ],
};

// Validate configuration on import
validateConfig();
