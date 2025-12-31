/**
 * Main configuration loader and manager
 */

import * as dotenv from 'dotenv';
import type {
  BotConfig,
  ExchangeId,
  ExchangeConfig,
  StrategyConfig,
  LogLevel,
  ShutdownBehavior
} from '@/types';
import { createExchangeConfig, validateExchangeConfig } from './exchanges';

// Load environment variables
dotenv.config();

/**
 * Deferred warnings queue for handling circular dependency with logger.
 * Warnings are queued during config initialization and flushed once logger is available.
 */
interface DeferredWarning {
  message: string;
  meta: Record<string, unknown> | undefined;
}
const deferredWarnings: DeferredWarning[] = [];
let loggerReady = false;
let loggerModule: typeof import('@utils/logger') | null = null;

/**
 * Log a warning, deferring it if logger isn't ready yet (during config initialization)
 */
function logWarning(message: string, meta?: Record<string, unknown>): void {
  if (loggerReady && loggerModule) {
    if (meta !== undefined) {
      loggerModule.logger.warn(message, meta);
    } else {
      loggerModule.logger.warn(message);
    }
  } else {
    deferredWarnings.push({ message, meta });
  }
}

/**
 * Flush any deferred warnings once logger is available.
 * Called after CONFIG is fully initialized.
 */
async function flushDeferredWarnings(): Promise<void> {
  try {
    loggerModule = await import('@utils/logger');
    loggerReady = true;
    for (const { message, meta } of deferredWarnings) {
      if (meta !== undefined) {
        loggerModule.logger.warn(message, meta);
      } else {
        loggerModule.logger.warn(message);
      }
    }
    deferredWarnings.length = 0;
  } catch {
    // If logger import fails, warnings remain in console only (already printed if needed)
  }
}

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
      
      const options: {
        enabled?: boolean;
        sandbox?: boolean;
        rateLimit?: number;
        timeout?: number;
      } = { 
        enabled: true,
        sandbox: isTestMode || (exchangeId === 'bybit' && process.env.BYBIT_TESTNET === 'true'),
      };

      if (process.env[`${upperExchangeId}_RATE_LIMIT`]) {
        options.rateLimit = EnvLoader.getNumber(`${upperExchangeId}_RATE_LIMIT`);
      }

      if (process.env[`${upperExchangeId}_TIMEOUT`]) {
        options.timeout = EnvLoader.getNumber(`${upperExchangeId}_TIMEOUT`);
      }

      const config = createExchangeConfig(
        exchangeId,
        { 
          apiKey, 
          secret, 
          ...(password ? { password } : {})
        },
        options
      );

      if (validateExchangeConfig(config)) {
        configs.push(config);
      } else {
        logWarning(`Invalid configuration for exchange ${exchangeId}, skipping...`);
      }
    } catch (error) {
      logWarning(`Failed to load configuration for exchange ${exchangeId}:`, { error });
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
        partialFillThreshold: EnvLoader.getNumber(`${upperStrategyName}_PARTIAL_FILL_THRESHOLD`, 95),
        priceTolerancePercent: EnvLoader.getNumber(`${upperStrategyName}_PRICE_TOLERANCE`, 0.1),
        maxProfitErosionPercent: EnvLoader.getNumber(`${upperStrategyName}_MAX_PROFIT_EROSION`, 20),
        dynamicToleranceEnabled: EnvLoader.getBoolean(`${upperStrategyName}_DYNAMIC_TOLERANCE`, true),
      },
    });
  }

  return configs;
}

/**
 * Validates and returns a shutdown behavior value
 */
function getShutdownBehavior(value: string): ShutdownBehavior {
  const validBehaviors: ShutdownBehavior[] = ['cancel', 'wait', 'force'];
  const normalizedValue = value.toLowerCase() as ShutdownBehavior;
  if (validBehaviors.includes(normalizedValue)) {
    return normalizedValue;
  }
  logWarning(`Invalid SHUTDOWN_BEHAVIOR "${value}", defaulting to "cancel"`, { value });
  return 'cancel';
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
      shutdownBehavior: getShutdownBehavior(EnvLoader.getString('SHUTDOWN_BEHAVIOR', 'cancel')),
    },
  };
}

/**
 * Global configuration instance
 */
export const CONFIG = createBotConfig();

// Flush any warnings that were deferred during config initialization
flushDeferredWarnings();

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

  // Validate shutdown behavior
  const validShutdownBehaviors: ShutdownBehavior[] = ['cancel', 'wait', 'force'];
  if (!validShutdownBehaviors.includes(config.general.shutdownBehavior)) {
    errors.push(`shutdownBehavior must be one of: ${validShutdownBehaviors.join(', ')}`);
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