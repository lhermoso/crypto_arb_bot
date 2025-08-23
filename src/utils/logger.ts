/**
 * Winston-based logging system
 */

import winston from 'winston';
import { CONFIG } from '@/config';

const { createLogger, format, transports } = winston;
const { combine, timestamp, errors, json, printf, colorize } = format;

/**
 * Custom log format for console output
 */
const consoleFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  
  return msg;
});

/**
 * Create Winston logger instance
 */
export const logger = createLogger({
  level: CONFIG.general.logLevel,
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    json()
  ),
  transports: [
    // Console transport with colors
    new transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        consoleFormat
      ),
    }),
    
    // File transport for all logs
    new transports.File({
      filename: 'logs/app.log',
      format: combine(
        timestamp(),
        json()
      ),
    }),
    
    // Separate file for errors
    new transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: combine(
        timestamp(),
        json()
      ),
    }),
  ],
  
  // Handle uncaught exceptions and promise rejections
  exceptionHandlers: [
    new transports.File({ filename: 'logs/exceptions.log' }),
  ],
  
  rejectionHandlers: [
    new transports.File({ filename: 'logs/rejections.log' }),
  ],
});

/**
 * Create logs directory if it doesn't exist
 */
import { existsSync, mkdirSync } from 'fs';
if (!existsSync('logs')) {
  mkdirSync('logs');
}

/**
 * Performance logging utility
 */
export class PerformanceLogger {
  private startTimes = new Map<string, number>();
  private operationCounter = 0;

  /**
   * Generate a unique operation ID to handle concurrent operations
   */
  private generateOperationId(operation: string): string {
    return `${operation}-${++this.operationCounter}-${Date.now()}`;
  }

  /**
   * Start timing an operation
   */
  start(operation: string): string {
    const operationId = this.generateOperationId(operation);
    this.startTimes.set(operationId, Date.now());
    return operationId;
  }

  /**
   * End timing and log the duration
   */
  end(operationId: string, metadata?: Record<string, unknown>): number {
    const startTime = this.startTimes.get(operationId);
    if (!startTime) {
      // Extract the operation name from the ID for better error messages
      const operation = operationId.split('-')[0];
      logger.warn(`Performance timer for '${operation}' was not started`);
      return 0;
    }

    const duration = Date.now() - startTime;
    this.startTimes.delete(operationId);
    
    // Extract the operation name from the ID for logging
    const operation = operationId.split('-').slice(0, -2).join('-');

    logger.debug(`Performance: ${operation} completed in ${duration}ms`, {
      operation,
      duration,
      ...metadata,
    });

    return duration;
  }

  /**
   * Time an async operation
   */
  async time<T>(operation: string, fn: () => Promise<T>, metadata?: Record<string, unknown>): Promise<T> {
    const startTime = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      
      logger.debug(`Performance: ${operation} completed in ${duration}ms`, {
        operation,
        duration,
        ...metadata,
        success: true
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.debug(`Performance: ${operation} failed in ${duration}ms`, {
        operation,
        duration,
        ...metadata,
        success: false,
        error: (error as Error).message
      });
      
      throw error;
    }
  }
}

/**
 * Global performance logger instance
 */
export const performanceLogger = new PerformanceLogger();

/**
 * Trade-specific logging utilities
 */
export class TradeLogger {
  /**
   * Log an arbitrage opportunity
   */
  static logOpportunity(opportunity: {
    symbol: string;
    buyExchange: string;
    sellExchange: string;
    profitPercent: number;
    amount: number;
  }): void {
    logger.info('Arbitrage opportunity detected', {
      type: 'opportunity',
      symbol: opportunity.symbol,
      buyExchange: opportunity.buyExchange,
      sellExchange: opportunity.sellExchange,
      profitPercent: opportunity.profitPercent,
      amount: opportunity.amount,
      timestamp: Date.now(),
    });
  }

  /**
   * Log a trade execution
   */
  static logTradeExecution(execution: {
    symbol: string;
    exchanges: string[];
    success: boolean;
    profit?: number;
    error?: string;
  }): void {
    const level = execution.success ? 'info' : 'error';
    
    logger[level]('Trade execution completed', {
      type: 'trade_execution',
      symbol: execution.symbol,
      exchanges: execution.exchanges,
      success: execution.success,
      profit: execution.profit,
      error: execution.error,
      timestamp: Date.now(),
    });
  }

  /**
   * Log balance updates
   */
  static logBalanceUpdate(exchange: string, currency: string, balance: {
    free: number;
    used: number;
    total: number;
  }): void {
    logger.debug('Balance updated', {
      type: 'balance_update',
      exchange,
      currency,
      balance,
      timestamp: Date.now(),
    });
  }

  /**
   * Log exchange connection events
   */
  static logExchangeEvent(exchange: string, event: 'connected' | 'disconnected' | 'error', details?: unknown): void {
    const level = event === 'error' ? 'error' : 'info';
    
    logger[level](`Exchange ${event}`, {
      type: 'exchange_event',
      exchange,
      event,
      details,
      timestamp: Date.now(),
    });
  }
}

/**
 * Create a child logger with additional context
 */
export function createChildLogger(context: Record<string, unknown>): winston.Logger {
  return logger.child(context);
}

/**
 * Log levels for external use
 */
export const LogLevels = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
} as const;