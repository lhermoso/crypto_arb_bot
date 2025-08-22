/**
 * Exchange-specific type definitions
 */

import type { Exchange, OrderBook, Ticker, Balance } from 'ccxt';
import type { ExchangeId, Symbol, ExchangeBalance } from '@/types';

/**
 * Extended Exchange interface with additional methods
 */
export interface ExtendedExchange extends Omit<Exchange, 'watchOrderBook' | 'watchBalance' | 'watchTicker'> {
  watchOrderBook?: (symbol: string, limit?: number, params?: object) => Promise<OrderBook>;
  watchTicker?: (symbol: string, params?: object) => Promise<Ticker>;
  watchBalance?: (params?: object) => Promise<Balance>;
}

/**
 * Exchange connection status
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';

/**
 * Exchange instance with metadata
 */
export interface ExchangeInstance {
  id: ExchangeId;
  exchange: ExtendedExchange;
  status: ConnectionStatus;
  lastUpdate: number;
  errorCount: number;
  capabilities: {
    watchOrderBook: boolean;
    watchTicker: boolean;
    watchBalance: boolean;
    fetchBalance: boolean;
    createOrder: boolean;
    cancelOrder: boolean;
  };
}

/**
 * Order book update event
 */
export interface OrderBookUpdate {
  exchange: ExchangeId;
  symbol: Symbol;
  orderBook: OrderBook;
  timestamp: number;
}

/**
 * Ticker update event
 */
export interface TickerUpdate {
  exchange: ExchangeId;
  symbol: Symbol;
  ticker: Ticker;
  timestamp: number;
}

/**
 * Balance update event
 */
export interface BalanceUpdate {
  exchange: ExchangeId;
  balances: Record<string, ExchangeBalance>;
  timestamp: number;
}

/**
 * Exchange error event
 */
export interface ExchangeError {
  exchange: ExchangeId;
  error: Error;
  timestamp: number;
  context?: string;
}

/**
 * Market data subscription
 */
export interface MarketSubscription {
  exchange: ExchangeId;
  symbol: Symbol;
  type: 'orderBook' | 'ticker';
  active: boolean;
  lastUpdate: number;
}

/**
 * Exchange manager events
 */
export type ExchangeManagerEvent = 
  | 'orderBookUpdate'
  | 'tickerUpdate'
  | 'balanceUpdate'
  | 'exchangeError'
  | 'exchangeConnected'
  | 'exchangeDisconnected';

/**
 * Event data for the exchange manager
 */
export interface ExchangeManagerEventData {
  type: ExchangeManagerEvent;
  timestamp: number;
  data: OrderBookUpdate | TickerUpdate | BalanceUpdate | ExchangeError | ExchangeInstance;
}