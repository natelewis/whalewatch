// Alpaca API Types
import { AlpacaBar as SharedAlpacaBar } from '@whalewatch/shared';

export interface AlpacaTrade {
  t: string; // timestamp in nanoseconds
  x: string; // exchange
  p: number; // price
  s: number; // size
  c: string[]; // conditions
  i: number; // trade ID
  z: string; // tape
}

export interface AlpacaQuote {
  t: string; // timestamp in nanoseconds
  ax: string; // ask exchange
  ap: number; // ask price
  as: number; // ask size
  bx: string; // bid exchange
  bp: number; // bid price
  bs: number; // bid size
  c: string[]; // conditions
  z: string; // tape
}

// Feed-specific AlpacaBar that extends shared version with required fields
export interface AlpacaBar extends Omit<SharedAlpacaBar, 'n' | 'vw'> {
  n: number; // trade count (required in feed API responses)
  vw: number; // volume weighted average price (required in feed API responses)
}

export interface AlpacaBarsResponse {
  bars: AlpacaBar[] | { [symbol: string]: AlpacaBar[] };
  next_page_token?: string;
  symbol?: string;
}

export interface AlpacaTradesResponse {
  trades: AlpacaTrade[] | { [symbol: string]: AlpacaTrade[] };
  next_page_token?: string;
  symbol?: string;
}

export interface AlpacaQuotesResponse {
  quotes: AlpacaQuote[] | { [symbol: string]: AlpacaQuote[] };
  next_page_token?: string;
  symbol?: string;
}

// WebSocket message types
export interface AlpacaWebSocketMessage {
  stream: string;
  data: AlpacaTrade | AlpacaQuote | AlpacaBar;
}

export interface AlpacaWebSocketSubscription {
  action: 'subscribe' | 'unsubscribe';
  trades?: string[];
  quotes?: string[];
  bars?: string[];
}
