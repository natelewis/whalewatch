import dotenv from 'dotenv';

dotenv.config();

export interface Config {
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
    optionTradesLimit: number;
    optionTradeValueThreshold: number;
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
  };
}

const requiredEnvVars = ['POLYGON_API_KEY'] as const;

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

  // Validate optionTradesLimit
  const tradesLimit = parseInt(process.env.POLYGON_OPTION_TRADES_LIMIT || '50000');
  if (tradesLimit < 1000 || tradesLimit > 50000) {
    throw new Error(`POLYGON_OPTION_TRADES_LIMIT must be between 1000 and 50000, got: ${tradesLimit}`);
  }
}

export const config: Config = {
  polygon: {
    apiKey: process.env.POLYGON_API_KEY!,
    baseUrl: 'https://api.polygon.io',
    wsUrl: 'wss://socket.polygon.io/stocks',
    logRequests: process.env.POLYGON_LOG_REQUESTS === 'true',
    skipOptionTrades: process.env.POLYGON_SKIP_OPTION_TRADES === 'true',
    skipOptionQuotes: process.env.POLYGON_SKIP_OPTION_QUOTES === 'true',
    skipOptionContracts: process.env.POLYGON_SKIP_OPTION_CONTRACTS === 'true',
    optionContractsLimit: parseInt(process.env.POLYGON_OPTION_CONTRACTS_LIMIT || '50000'),
    optionQuotesLimit: parseInt(process.env.POLYGON_OPTION_QUOTES_LIMIT || '50000'),
    optionTradesLimit: parseInt(process.env.POLYGON_OPTION_TRADES_LIMIT || '50000'),
    optionTradeValueThreshold: parseInt(process.env.POLYGON_OPTION_TRADE_VALUE_THRESHOLD || '10000', 10),
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
  },
};

// Validate configuration on import
validateConfig();
