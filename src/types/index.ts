/**
 * Global type definitions for the crypto arbitrage bot
 */

import type { OrderBook, Ticker } from 'ccxt';

/**
 * Supported exchange identifiers
 */
export type ExchangeId = 'binance' | 'kucoin' | 'okx' | 'bybit' | 'kraken';

/**
 * Trading pair symbol (e.g., 'BTC/USDT')
 */
export type Symbol = string;

/**
 * API credentials for an exchange
 */
export interface ExchangeCredentials {
  apiKey: string;
  secret: string;
  password?: string;
  sandbox?: boolean;
}

/**
 * Exchange configuration including credentials and settings
 */
export interface ExchangeConfig {
  id: ExchangeId;
  credentials: ExchangeCredentials;
  enabled: boolean;
  rateLimit?: number;
  timeout?: number;
}

/**
 * Arbitrage opportunity between two exchanges
 */
export interface ArbitrageOpportunity {
  symbol: Symbol;
  buyExchange: ExchangeId;
  sellExchange: ExchangeId;
  buyPrice: number;
  sellPrice: number;
  amount: number;
  profitPercent: number;
  profitAmount: number;
  timestamp: number;
  fees: {
    buyFee: number;
    sellFee: number;
    total: number;
  };
}

/**
 * Trading order details
 */
export interface TradeOrder {
  exchange: ExchangeId;
  symbol: Symbol;
  side: 'buy' | 'sell';
  amount: number;
  price?: number;
  type: 'market' | 'limit';
  params?: Record<string, unknown>;
}

/**
 * Executed trade result
 */
export interface TradeResult {
  orderId: string;
  exchange: ExchangeId;
  symbol: Symbol;
  side: 'buy' | 'sell';
  amount: number;
  filled: number;
  price: number;
  cost: number;
  fee: number;
  timestamp: number;
  success: boolean;
  error?: string;
}

/**
 * Complete arbitrage execution result
 */
export interface ArbitrageExecution {
  opportunity: ArbitrageOpportunity;
  buyTrade?: TradeResult;
  sellTrade?: TradeResult;
  actualProfit?: number;
  success: boolean;
  executionTime: number;
  errors: string[];
}

/**
 * Balance information for an exchange
 */
export interface ExchangeBalance {
  exchange: ExchangeId;
  currency: string;
  free: number;
  used: number;
  total: number;
  timestamp: number;
}

/**
 * Market data for a symbol on an exchange
 */
export interface MarketData {
  exchange: ExchangeId;
  symbol: Symbol;
  orderBook: OrderBook;
  ticker?: Ticker;
  timestamp: number;
}

/**
 * Trading fees for an exchange
 */
export interface TradingFees {
  maker: number;
  taker: number;
  percentage: boolean;
}

/**
 * Strategy configuration
 */
export interface StrategyConfig {
  name: string;
  enabled: boolean;
  minProfitPercent: number;
  maxTradeAmount: number;
  symbols: Symbol[];
  exchanges: ExchangeId[];
  params?: Record<string, unknown>;
}

/**
 * Bot configuration
 */
export interface BotConfig {
  exchanges: ExchangeConfig[];
  strategies: StrategyConfig[];
  general: {
    logLevel: 'error' | 'warn' | 'info' | 'debug';
    testMode: boolean;
    maxConcurrentTrades: number;
    orderBookDepth: number;
    updateInterval: number;
  };
}

/**
 * Log levels
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * Event types for the bot
 */
export type BotEvent = 
  | 'opportunity_found'
  | 'trade_executed'
  | 'trade_failed'
  | 'balance_updated'
  | 'error_occurred'
  | 'bot_started'
  | 'bot_stopped';

/**
 * Event data structure
 */
export interface BotEventData {
  type: BotEvent;
  timestamp: number;
  data: unknown;
}