/**
 * Strategy interface and base classes for trading strategies
 */

import { EventEmitter } from 'events';
import type {
  Symbol,
  ArbitrageOpportunity,
  ArbitrageExecution,
  StrategyConfig
} from '@/types';
import type { ExchangeManager } from '@exchanges/ExchangeManager';
import { getMinTradeAmount } from '@/config/exchanges';
import { logger } from '@utils/logger';

/**
 * Base strategy interface that all trading strategies must implement
 */
export interface IStrategy extends EventEmitter {
  readonly name: string;
  readonly config: StrategyConfig;
  readonly isRunning: boolean;
  
  /**
   * Initialize the strategy
   */
  initialize(): Promise<void>;
  
  /**
   * Start monitoring for opportunities
   */
  start(): Promise<void>;
  
  /**
   * Stop monitoring
   */
  stop(): Promise<void>;
  
  /**
   * Get current status and statistics
   */
  getStatus(): StrategyStatus;
  
  /**
   * Update strategy configuration
   */
  updateConfig(config: Partial<StrategyConfig>): void;
}

/**
 * Strategy status information
 */
export interface StrategyStatus {
  name: string;
  isRunning: boolean;
  startTime?: number;
  uptime?: number;
  opportunitiesFound: number;
  tradesExecuted: number;
  successfulTrades: number;
  totalProfit: number;
  lastOpportunity?: ArbitrageOpportunity;
  lastExecution?: ArbitrageExecution;
  errors: string[];
}

/**
 * Strategy events
 */
export type StrategyEvent = 
  | 'opportunity_found'
  | 'execution_started'
  | 'execution_completed'
  | 'error'
  | 'status_update';

/**
 * Abstract base class for strategies
 */
export abstract class BaseStrategy extends EventEmitter implements IStrategy {
  protected _isRunning = false;
  protected _startTime?: number;
  protected _status: StrategyStatus;

  constructor(
    public readonly name: string,
    public config: StrategyConfig,
    protected exchangeManager: ExchangeManager
  ) {
    super();
    
    this._status = {
      name: this.name,
      isRunning: false,
      opportunitiesFound: 0,
      tradesExecuted: 0,
      successfulTrades: 0,
      totalProfit: 0,
      errors: [],
    };
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Initialize the strategy (default implementation)
   */
  async initialize(): Promise<void> {
    // Override in subclasses if needed
  }

  /**
   * Start the strategy
   */
  async start(): Promise<void> {
    if (this._isRunning) {
      throw new Error(`Strategy ${this.name} is already running`);
    }

    this._isRunning = true;
    this._startTime = Date.now();
    this._status.isRunning = true;
    this._status.startTime = this._startTime;

    await this.onStart();
    this.emit('status_update', this._status);
  }

  /**
   * Stop the strategy
   */
  async stop(): Promise<void> {
    if (!this._isRunning) {
      return;
    }

    this._isRunning = false;
    this._status.isRunning = false;

    await this.onStop();
    this.emit('status_update', this._status);
  }

  /**
   * Get current status
   */
  getStatus(): StrategyStatus {
    this._status.uptime = this._startTime ? Date.now() - this._startTime : 0;
    return { ...this._status };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<StrategyConfig>): void {
    this.config = { ...this.config, ...config };
    this.onConfigUpdate();
  }

  /**
   * Record an opportunity found
   */
  protected recordOpportunity(opportunity: ArbitrageOpportunity): void {
    this._status.opportunitiesFound++;
    this._status.lastOpportunity = opportunity;
    this.emit('opportunity_found', opportunity);
    this.emit('status_update', this._status);
  }

  /**
   * Record a trade execution
   */
  protected recordExecution(execution: ArbitrageExecution): void {
    this._status.tradesExecuted++;
    this._status.lastExecution = execution;

    if (execution.success && execution.actualProfit) {
      this._status.successfulTrades++;
      this._status.totalProfit += execution.actualProfit;
    }

    this.emit('execution_completed', execution);
    this.emit('status_update', this._status);
  }

  /**
   * Record an error
   */
  protected recordError(error: Error, context?: string): void {
    const errorMessage = context ? `${context}: ${error.message}` : error.message;
    this._status.errors.push(errorMessage);
    
    // Keep only last 10 errors
    if (this._status.errors.length > 10) {
      this._status.errors = this._status.errors.slice(-10);
    }

    this.emit('error', { error, context });
    this.emit('status_update', this._status);
  }

  /**
   * Check if a symbol is enabled for this strategy
   */
  protected isSymbolEnabled(symbol: Symbol): boolean {
    return this.config.symbols.includes(symbol);
  }

  /**
   * Check if the strategy should process this opportunity
   */
  protected shouldProcessOpportunity(opportunity: ArbitrageOpportunity): boolean {
    if (!this.isSymbolEnabled(opportunity.symbol)) {
      return false;
    }

    if (opportunity.profitPercent < this.config.minProfitPercent) {
      return false;
    }

    if (opportunity.amount > this.config.maxTradeAmount) {
      return false;
    }

    // Validate against minimum trade amount for the symbol
    const minTradeAmount = getMinTradeAmount(opportunity.symbol);
    if (opportunity.amount < minTradeAmount) {
      logger.debug('Opportunity skipped: amount below minimum trade amount', {
        symbol: opportunity.symbol,
        amount: opportunity.amount,
        minTradeAmount,
        buyExchange: opportunity.buyExchange,
        sellExchange: opportunity.sellExchange,
      });
      return false;
    }

    return true;
  }

  /**
   * Template method called when strategy starts
   */
  protected abstract onStart(): Promise<void>;

  /**
   * Template method called when strategy stops
   */
  protected abstract onStop(): Promise<void>;

  /**
   * Template method called when configuration is updated
   */
  protected onConfigUpdate(): void {
    // Override in subclasses if needed
  }
}

/**
 * Strategy factory for creating strategy instances
 */
export class StrategyFactory {
  private static strategies = new Map<string, StrategyConstructor>();

  /**
   * Register a strategy class
   */
  static register(name: string, strategyClass: StrategyConstructor): void {
    this.strategies.set(name, strategyClass);
  }

  /**
   * Create a strategy instance
   */
  static create(
    name: string,
    config: StrategyConfig,
    exchangeManager: ExchangeManager
  ): IStrategy {
    const StrategyClass = this.strategies.get(name);
    
    if (!StrategyClass) {
      throw new Error(`Unknown strategy: ${name}`);
    }

    return new StrategyClass(name, config, exchangeManager);
  }

  /**
   * Get list of available strategies
   */
  static getAvailableStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Check if a strategy is registered
   */
  static hasStrategy(name: string): boolean {
    return this.strategies.has(name);
  }
}

/**
 * Strategy constructor type
 */
export type StrategyConstructor = new (
  name: string,
  config: StrategyConfig,
  exchangeManager: ExchangeManager
) => IStrategy;