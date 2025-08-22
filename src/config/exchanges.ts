/**
 * Exchange-specific configuration and settings
 */

import type { ExchangeId, ExchangeConfig, TradingFees } from '@/types';

/**
 * Default trading fees for each exchange (taker fees)
 * These are fallback values; actual fees should be fetched from the exchange
 */
export const DEFAULT_TRADING_FEES: Record<ExchangeId, TradingFees> = {
  binance: {
    maker: 0.001, // 0.1%
    taker: 0.001, // 0.1%
    percentage: true,
  },
  kucoin: {
    maker: 0.001, // 0.1%
    taker: 0.001, // 0.1%
    percentage: true,
  },
  okx: {
    maker: 0.0008, // 0.08%
    taker: 0.001,  // 0.1%
    percentage: true,
  },
  bybit: {
    maker: 0.001, // 0.1%
    taker: 0.001, // 0.1%
    percentage: true,
  },
  kraken: {
    maker: 0.0016, // 0.16%
    taker: 0.0026, // 0.26%
    percentage: true,
  },
};

/**
 * Default rate limits for each exchange (requests per minute)
 */
export const DEFAULT_RATE_LIMITS: Record<ExchangeId, number> = {
  binance: 1200, // 20 requests per second
  kucoin: 1800,  // 30 requests per second
  okx: 600,      // 10 requests per second
  bybit: 600,    // 10 requests per second
  kraken: 300,   // 5 requests per second
};

/**
 * Default timeout values for each exchange (milliseconds)
 */
export const DEFAULT_TIMEOUTS: Record<ExchangeId, number> = {
  binance: 10000, // 10 seconds
  kucoin: 10000,  // 10 seconds
  okx: 15000,     // 15 seconds
  bybit: 10000,   // 10 seconds
  kraken: 15000,  // 15 seconds
};

/**
 * Testnet/sandbox URLs for exchanges that support them
 */
export const TESTNET_URLS: Partial<Record<ExchangeId, string>> = {
  binance: 'https://testnet.binance.vision',
  bybit: 'https://api-testnet.bybit.com',
  okx: 'https://www.okx.com', // OKX uses a flag instead of URL
};

/**
 * Minimum trade amounts for common symbols (in base currency)
 */
export const MIN_TRADE_AMOUNTS: Record<string, number> = {
  'BTC/USDT': 0.0001,   // 0.0001 BTC
  'ETH/USDT': 0.001,    // 0.001 ETH
  'XRP/USDT': 1,        // 1 XRP
  'ADA/USDT': 1,        // 1 ADA
  'SOL/USDT': 0.01,     // 0.01 SOL
  'MATIC/USDT': 1,      // 1 MATIC
  'DOT/USDT': 0.1,      // 0.1 DOT
  'AVAX/USDT': 0.01,    // 0.01 AVAX
};

/**
 * Creates exchange configuration from environment variables
 */
export function createExchangeConfig(
  exchangeId: ExchangeId,
  credentials: {
    apiKey: string;
    secret: string;
    password?: string;
  },
  options: {
    enabled?: boolean;
    sandbox?: boolean;
    rateLimit?: number;
    timeout?: number;
  } = {}
): ExchangeConfig {
  return {
    id: exchangeId,
    credentials: {
      ...credentials,
      sandbox: options.sandbox ?? false,
    },
    enabled: options.enabled ?? true,
    rateLimit: options.rateLimit ?? DEFAULT_RATE_LIMITS[exchangeId],
    timeout: options.timeout ?? DEFAULT_TIMEOUTS[exchangeId],
  };
}

/**
 * Validates exchange configuration
 */
export function validateExchangeConfig(config: ExchangeConfig): boolean {
  if (!config.id || !config.credentials) {
    return false;
  }

  if (!config.credentials.apiKey || !config.credentials.secret) {
    return false;
  }

  // Some exchanges require a password/passphrase
  return !(config.id === 'okx' && !config.credentials.password);


}

/**
 * Gets the trading fee for a specific exchange and symbol
 */
export function getTradingFee(
  exchangeId: ExchangeId,
  _symbol?: string,
  isMaker = false
): number {
  const fees = DEFAULT_TRADING_FEES[exchangeId];
  return isMaker ? fees.maker : fees.taker;
}

/**
 * Gets the minimum trade amount for a symbol
 */
export function getMinTradeAmount(symbol: string): number {
  return MIN_TRADE_AMOUNTS[symbol] ?? 0.001; // Default fallback
}