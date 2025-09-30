// Database table schemas and types
import { ContractType } from '@whalewatch/shared';

export interface StockAggregate {
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number;
  transaction_count: number;
}

export interface OptionContract {
  contract_type: ContractType;
  exercise_style: 'american' | 'european';
  expiration_date: Date; // TIMESTAMP for QuestDB partitioning
  shares_per_contract: number;
  strike_price: number;
  ticker: string;
  underlying_ticker: string;
}

export interface OptionContractIndex {
  underlying_ticker: string;
  as_of: Date; // The date we synced option contracts for
}

export interface OptionTrade {
  ticker: string;
  underlying_ticker: string;
  timestamp: Date;
  price: number;
  size: number;
  conditions: string;
  exchange: number;
}

export interface OptionQuote {
  ticker: string;
  underlying_ticker: string;
  timestamp: Date;
  bid_price: number;
  bid_size: number;
  ask_price: number;
  ask_size: number;
  bid_exchange: number;
  ask_exchange: number;
  sequence_number: number;
}

export interface TickerConfig {
  ticker: string;
  type: 'stock' | 'option';
}
