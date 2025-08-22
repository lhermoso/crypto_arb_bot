/**
 * Main configuration loader and manager
 */

import * as dotenv from 'dotenv';
import type { 
  BotConfig, 
  ExchangeId, 
  ExchangeConfig, 
  StrategyConfig,
  LogLevel 
} from '@/types';
import { createExchangeConfig, validateExchangeConfig } from './exchanges';

// Load environment variables
dotenv.config();

/**
 * Environment variable helper with type safety
 */
class EnvLoader {
  static getString(key: string, defaultValue?: string): string {
    const value = process.env[key];
    if (!value && defaultValue === undefined) {
      throw new Error(`Environment variable ${key} is required`);
    }
    return value || defaultValue!;
  }

  static getNumber(key: string, defaultValue?: number): number {
    const value = process.env[key];
    if (!value) {
      if (defaultValue === undefined) {
        throw new Error(`Environment variable ${key} is required`);
      }
      return defaultValue;
    }
    const parsed = Number(value);
    if (isNaN(parsed)) {
      throw new Error(`Environment variable ${key} must be a valid number`);
    }
    return parsed;
  }

  static getBoolean(key: string, defaultValue?: boolean): boolean {
    const value = process.env[key];
    if (!value) {
      if (defaultValue === undefined) {
        throw new Error(`Environment variable ${key} is required`);
      }
      return defaultValue;
    }
    return value.toLowerCase() === 'true';
  }

  static getArray(key: string, delimiter = ',', defaultValue?: string[]): string[] {
    const value = process.env[key];
    if (!value) {
      if (defaultValue === undefined) {
        throw new Error(`Environment variable ${key} is required`);
      }
      return defaultValue;
    }
    return value.split(delimiter).map(item => item.trim()).filter(Boolean);
  }
}

/**
 * Loads exchange configurations from environment variables
 */
function loadExchangeConfigs(): ExchangeConfig[] {
  const enabledExchanges = EnvLoader.getArray('ENABLED_EXCHANGES', ',', ['binance', 'kucoin']);
  const isTestMode = EnvLoader.getBoolean('TEST_MODE', true);
  
  const configs: ExchangeConfig[] = [];

  for (const exchangeId of enabledExchanges as ExchangeId[]) {
    const upperExchangeId = exchangeId.toUpperCase();
    
    try {
      const apiKey = EnvLoader.getString(`${upperExchangeId}_API_KEY`);
      const secret = EnvLoader.getString(`${upperExchangeId}_SECRET`);
      const password = process.env[`${upperExchangeId}_PASSWORD`]; // Optional for most exchanges
      
      const config = createExchangeConfig(
        exchangeId,
        { 
          apiKey, 
          secret, 
          ...(password ? { password } : {})
        },
        { 
          enabled: true,
          sandbox: isTestMode,
          rateLimit: EnvLoader.getNumber(`${upperExchangeId}_RATE_LIMIT`, undefined),
          timeout: EnvLoader.getNumber(`${upperExchangeId}_TIMEOUT`, undefined),
        }
      );

      if (validateExchangeConfig(config)) {
        configs.push(config);
      } else {
        console.warn(`Invalid configuration for exchange ${exchangeId}, skipping...`);
      }
    } catch (error) {
      console.warn(`Failed to load configuration for exchange ${exchangeId}:`, error);
    }
  }

  if (configs.length === 0) {
    throw new Error('No valid exchange configurations found. Please check your environment variables.');
  }

  return configs;
}

/**
 * Loads strategy configurations
 */
function loadStrategyConfigs(): StrategyConfig[] {
  const enabledStrategies = EnvLoader.getArray('ENABLED_STRATEGIES', ',', ['simple-arbitrage']);
  const tradingSymbols = EnvLoader.getArray('TRADING_SYMBOLS', ',', ['XRP/USDT']);
  const enabledExchanges = EnvLoader.getArray('ENABLED_EXCHANGES', ',', ['binance', 'kucoin']);
  
  const configs: StrategyConfig[] = [];

  for (const strategyName of enabledStrategies) {
    const upperStrategyName = strategyName.toUpperCase().replace('-', '_');
    
    configs.push({
      name: strategyName,
      enabled: true,
      minProfitPercent: EnvLoader.getNumber(`${upperStrategyName}_MIN_PROFIT`, 0.5),
      maxTradeAmount: EnvLoader.getNumber(`${upperStrategyName}_MAX_TRADE_AMOUNT`, 100),
      symbols: tradingSymbols,
      exchanges: enabledExchanges as ExchangeId[],
      params: {
        // Strategy-specific parameters can be added here
        checkInterval: EnvLoader.getNumber(`${upperStrategyName}_CHECK_INTERVAL`, 5000),
        maxSlippage: EnvLoader.getNumber(`${upperStrategyName}_MAX_SLIPPAGE`, 0.1),
      },
    });
  }

  return configs;
}

/**
 * Creates the complete bot configuration
 */
function createBotConfig(): BotConfig {
  return {
    exchanges: loadExchangeConfigs(),
    strategies: loadStrategyConfigs(),
    general: {
      logLevel: EnvLoader.getString('LOG_LEVEL', 'info') as LogLevel,
      testMode: EnvLoader.getBoolean('TEST_MODE', true),
      maxConcurrentTrades: EnvLoader.getNumber('MAX_CONCURRENT_TRADES', 3),
      orderBookDepth: EnvLoader.getNumber('ORDER_BOOK_DEPTH', 10),
      updateInterval: EnvLoader.getNumber('UPDATE_INTERVAL', 1000),
    },
  };
}

/**
 * Global configuration instance
 */
export const CONFIG = createBotConfig();

/**
 * Configuration validation
 */
export function validateConfig(config: BotConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate exchanges
  if (!config.exchanges || config.exchanges.length === 0) {
    errors.push('At least one exchange configuration is required');
  }

  // Validate strategies
  if (!config.strategies || config.strategies.length === 0) {
    errors.push('At least one strategy configuration is required');
  }

  // Validate general config
  if (config.general.maxConcurrentTrades <= 0) {
    errors.push('maxConcurrentTrades must be greater than 0');
  }

  if (config.general.orderBookDepth <= 0) {
    errors.push('orderBookDepth must be greater than 0');
  }

  if (config.general.updateInterval <= 0) {
    errors.push('updateInterval must be greater than 0');
  }

  // Validate log level
  const validLogLevels: LogLevel[] = ['error', 'warn', 'info', 'debug'];
  if (!validLogLevels.includes(config.general.logLevel)) {
    errors.push(`logLevel must be one of: ${validLogLevels.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Gets configuration for a specific exchange
 */
export function getExchangeConfig(exchangeId: ExchangeId): ExchangeConfig | undefined {
  return CONFIG.exchanges.find(ex => ex.id === exchangeId);
}

/**
 * Gets configuration for a specific strategy
 */
export function getStrategyConfig(strategyName: string): StrategyConfig | undefined {
  return CONFIG.strategies.find(strategy => strategy.name === strategyName);
}

/**
 * Checks if the bot is running in test mode
 */
export function isTestMode(): boolean {
  return CONFIG.general.testMode;
}

/**
 * Gets the list of enabled exchanges
 */
export function getEnabledExchanges(): ExchangeId[] {
  return CONFIG.exchanges.filter(ex => ex.enabled).map(ex => ex.id);
}

/**
 * Gets the list of trading symbols
 */
export function getTradingSymbols(): string[] {
  const symbols = new Set<string>();
  CONFIG.strategies.forEach(strategy => {
    strategy.symbols.forEach(symbol => symbols.add(symbol));
  });
  return Array.from(symbols);
}