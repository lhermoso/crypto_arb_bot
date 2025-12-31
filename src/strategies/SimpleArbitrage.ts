/**
 * Simple Arbitrage Strategy
 * 
 * This strategy monitors order books across multiple exchanges for a given symbol
 * and executes arbitrage trades when profitable opportunities are found.
 */

import type {
  Symbol,
  ArbitrageOpportunity,
  ArbitrageExecution,
  TradeOrder,
  StrategyConfig,
  MarketData
} from '@/types';
import { CONFIG } from '@/config';
import type { ExchangeManager } from '@exchanges/ExchangeManager';
import { BaseStrategy } from './IStrategy';
import {
  findArbitrageOpportunities,
  validateOpportunity,
  calculateRequiredBalance,
  isSlippageAcceptable
} from '@utils/calculations';
import { logger, TradeLogger, performanceLogger } from '@utils/logger';
import { sleep, withTimeout, retry } from '@utils/helpers';

/**
 * Price validation result with variance tracking
 */
interface PriceValidationResult {
  valid: boolean;
  currentBuyPrice?: number;
  currentSellPrice?: number;
  buyPriceVariance?: number;  // Percentage variance from expected
  sellPriceVariance?: number; // Percentage variance from expected
  totalVariance?: number;     // Combined variance impact on profit
  reason?: string;
}

/**
 * Simple Arbitrage Strategy Configuration
 */
interface SimpleArbitrageConfig extends StrategyConfig {
  params: {
    checkInterval: number;
    maxSlippage: number;
    orderTimeout: number;
    balanceReservePercent: number;
    maxOpportunityAge: number;
    priceValidationWindow: number;
    partialFillThreshold: number;
    priceTolerancePercent: number;         // Base price tolerance (default 0.1%)
    maxProfitErosionPercent: number;       // Max % of expected profit that can be eroded by price variance (default 20%)
    dynamicToleranceEnabled: boolean;      // Enable dynamic tolerance based on profit margin
  };
}

/**
 * Simple Arbitrage Strategy Implementation
 */
export class SimpleArbitrage extends BaseStrategy {
  private monitoringInterval?: NodeJS.Timeout;
  private activeTrades = new Set<string>();
  private lastMarketData = new Map<string, MarketData>();
  private profitVarianceHistory: Array<{
    timestamp: number;
    expectedProfit: number;
    priceVarianceImpact: number;
    symbol: string;
  }> = [];

  constructor(
    name: string,
    config: StrategyConfig,
    exchangeManager: ExchangeManager
  ) {
    super(name, config as SimpleArbitrageConfig, exchangeManager);

    // Set default parameters if not provided
    this.config.params = {
      checkInterval: 5000, // 5 seconds
      maxSlippage: 0.1, // 0.1%
      orderTimeout: 30000, // 30 seconds
      balanceReservePercent: 10, // 10% reserve
      maxOpportunityAge: 5000, // 5 seconds
      priceValidationWindow: 2000, // 2 seconds
      partialFillThreshold: 95, // 95% minimum fill required
      priceTolerancePercent: 0.1, // 0.1% base price tolerance
      maxProfitErosionPercent: 20, // Max 20% of expected profit can be eroded
      dynamicToleranceEnabled: true, // Enable profit-aware dynamic tolerance
      ...this.config.params,
    };

    logger.info(`SimpleArbitrage strategy initialized`, {
      symbols: this.config.symbols,
      exchanges: this.config.exchanges,
      minProfitPercent: this.config.minProfitPercent,
      params: this.config.params,
    });
  }

  /**
   * Start monitoring for arbitrage opportunities
   */
  protected async onStart(): Promise<void> {
    logger.info(`Starting SimpleArbitrage strategy for ${this.config.symbols.join(', ')}`);

    // Subscribe to order book updates for all symbols
    for (const symbol of this.config.symbols) {
      try {
        await this.exchangeManager.subscribeToOrderBook(symbol);
        logger.debug(`Subscribed to order book updates for ${symbol}`);
      } catch (error) {
        logger.error(`Failed to subscribe to order book for ${symbol}:`, error);
      }
    }

    // Start the monitoring loop
    this.startMonitoring();

    logger.info('SimpleArbitrage strategy started successfully');
  }

  /**
   * Stop monitoring
   */
  protected async onStop(): Promise<void> {
    logger.info('Stopping SimpleArbitrage strategy...');

    // Stop monitoring
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined as any;
    }

    // Wait for active trades to complete
    if (this.activeTrades.size > 0) {
      logger.info(`Waiting for ${this.activeTrades.size} active trades to complete...`);
      
      let waitTime = 0;
      const maxWaitTime = 60000; // 60 seconds max wait
      
      while (this.activeTrades.size > 0 && waitTime < maxWaitTime) {
        await sleep(1000);
        waitTime += 1000;
      }

      if (this.activeTrades.size > 0) {
        logger.warn(`Strategy stopped with ${this.activeTrades.size} trades still active`);
      }
    }

    logger.info('SimpleArbitrage strategy stopped');
  }

  /**
   * Start the monitoring loop
   */
  private startMonitoring(): void {
    const config = this.config as SimpleArbitrageConfig;
    
    this.monitoringInterval = setInterval(async () => {
      if (!this.isRunning) {
        return;
      }

      try {
        await this.scanForOpportunities();
      } catch (error) {
        this.recordError(error as Error, 'monitoring');
      }
    }, config.params.checkInterval);
  }

  /**
   * Scan for arbitrage opportunities across all symbols
   */
  private async scanForOpportunities(): Promise<void> {
    const scanStart = Date.now();

    for (const symbol of this.config.symbols) {
      try {
        await this.scanSymbolForOpportunities(symbol);
      } catch (error) {
        logger.debug(`Error scanning ${symbol}:`, error);
      }
    }

    const scanDuration = Date.now() - scanStart;
    logger.debug(`Opportunity scan completed in ${scanDuration}ms`);
  }

  /**
   * Scan a specific symbol for arbitrage opportunities
   */
  private async scanSymbolForOpportunities(symbol: Symbol): Promise<void> {
    try {
      // Get market data from all exchanges
      const marketData = await performanceLogger.time(
        `getMarketData-${symbol}`,
        () => this.exchangeManager.getMarketData(symbol)
      );

      if (marketData.length < 2) {
        return; // Need at least 2 exchanges
      }

      // Store latest market data
      marketData.forEach(data => {
        this.lastMarketData.set(`${data.exchange}-${symbol}`, data);
      });

      // Find arbitrage opportunities
      const opportunities = findArbitrageOpportunities(
        marketData,
        this.config.minProfitPercent,
        this.config.maxTradeAmount
      );

      // Process each opportunity
      for (const opportunity of opportunities) {
        if (this.shouldProcessOpportunity(opportunity)) {
          this.recordOpportunity(opportunity);
          
          // Execute the trade if conditions are met
          if (await this.shouldExecuteTrade(opportunity)) {
            this.executeTrade(opportunity).catch(error => {
              this.recordError(error as Error, 'trade execution');
            });
          }
        }
      }

    } catch (error) {
      logger.debug(`Error scanning symbol ${symbol}:`, error);
    }
  }

  /**
   * Check if a trade should be executed
   */
  private async shouldExecuteTrade(opportunity: ArbitrageOpportunity): Promise<boolean> {
    const config = this.config as SimpleArbitrageConfig;

    // Check if max concurrent trades limit is reached
    const maxConcurrentTrades = CONFIG.general.maxConcurrentTrades;
    if (this.activeTrades.size >= maxConcurrentTrades) {
      logger.info('Max concurrent trades limit reached, skipping opportunity', {
        activeTrades: this.activeTrades.size,
        maxConcurrentTrades,
        symbol: opportunity.symbol,
        buyExchange: opportunity.buyExchange,
        sellExchange: opportunity.sellExchange,
        profitPercent: opportunity.profitPercent,
      });
      return false;
    }

    // Check if opportunity is still valid
    if (!validateOpportunity(opportunity, config.params.maxOpportunityAge)) {
      logger.debug('Opportunity is no longer valid', { opportunity });
      return false;
    }

    // Check if we're already trading this pair
    const tradeKey = `${opportunity.symbol}-${opportunity.buyExchange}-${opportunity.sellExchange}`;
    if (this.activeTrades.has(tradeKey)) {
      logger.debug('Trade already active for this opportunity', { tradeKey });
      return false;
    }

    // Check balances
    try {
      const hasRequiredBalance = await this.checkRequiredBalances(opportunity);
      if (!hasRequiredBalance) {
        logger.debug('Insufficient balance for trade', { opportunity });
        return false;
      }
    } catch (error) {
      logger.debug('Error checking balances:', error);
      return false;
    }

    // Validate prices are still good
    if (await this.validateCurrentPrices(opportunity)) {
      return true;
    }

    logger.debug('Price validation failed', { opportunity });
    return false;
  }

  /**
   * Validate that current prices still support the opportunity with profit-aware tolerance
   */
  private async validateCurrentPrices(opportunity: ArbitrageOpportunity): Promise<boolean> {
    const result = await this.validateCurrentPricesWithTracking(opportunity);
    return result.valid;
  }

  /**
   * Validate prices with detailed tracking of variance for analysis
   */
  private async validateCurrentPricesWithTracking(
    opportunity: ArbitrageOpportunity
  ): Promise<PriceValidationResult> {
    const config = this.config as SimpleArbitrageConfig;

    try {
      // Get fresh order books
      const [buyOrderBook, sellOrderBook] = await Promise.all([
        this.exchangeManager.getOrderBook(opportunity.buyExchange, opportunity.symbol),
        this.exchangeManager.getOrderBook(opportunity.sellExchange, opportunity.symbol),
      ]);

      // Check if best prices are still available
      const bestAsk = buyOrderBook.asks?.[0];
      const bestBid = sellOrderBook.bids?.[0];

      if (!bestAsk || !bestBid) {
        return { valid: false, reason: 'Order book data unavailable' };
      }

      const currentBuyPrice = bestAsk[0];
      const currentSellPrice = bestBid[0];

      if (!currentBuyPrice || !currentSellPrice) {
        return { valid: false, reason: 'Invalid price data' };
      }

      // Calculate price variances as percentages
      const buyPriceVariance = ((currentBuyPrice - opportunity.buyPrice) / opportunity.buyPrice) * 100;
      const sellPriceVariance = ((opportunity.sellPrice - currentSellPrice) / opportunity.sellPrice) * 100;

      // Calculate total variance impact on profit
      // Positive variance means prices moved against us (higher buy, lower sell)
      const totalVariance = buyPriceVariance + sellPriceVariance;

      // Get configurable tolerance
      const baseTolerance = config.params.priceTolerancePercent;

      // Check basic tolerance first
      if (buyPriceVariance > baseTolerance) {
        this.recordPriceVariance(opportunity, totalVariance);
        return {
          valid: false,
          currentBuyPrice,
          currentSellPrice,
          buyPriceVariance,
          sellPriceVariance,
          totalVariance,
          reason: `Buy price exceeded tolerance: ${buyPriceVariance.toFixed(4)}% > ${baseTolerance}%`,
        };
      }

      if (sellPriceVariance > baseTolerance) {
        this.recordPriceVariance(opportunity, totalVariance);
        return {
          valid: false,
          currentBuyPrice,
          currentSellPrice,
          buyPriceVariance,
          sellPriceVariance,
          totalVariance,
          reason: `Sell price exceeded tolerance: ${sellPriceVariance.toFixed(4)}% > ${baseTolerance}%`,
        };
      }

      // Dynamic profit-aware validation
      if (config.params.dynamicToleranceEnabled && totalVariance > 0) {
        // Calculate what percentage of expected profit would be eroded by price variance
        const profitErosionPercent = (totalVariance / opportunity.profitPercent) * 100;

        if (profitErosionPercent > config.params.maxProfitErosionPercent) {
          this.recordPriceVariance(opportunity, totalVariance);
          logger.debug('Price validation failed: profit erosion too high', {
            symbol: opportunity.symbol,
            expectedProfit: opportunity.profitPercent.toFixed(4),
            totalVariance: totalVariance.toFixed(4),
            profitErosionPercent: profitErosionPercent.toFixed(2),
            maxAllowed: config.params.maxProfitErosionPercent,
          });
          return {
            valid: false,
            currentBuyPrice,
            currentSellPrice,
            buyPriceVariance,
            sellPriceVariance,
            totalVariance,
            reason: `Profit erosion too high: ${profitErosionPercent.toFixed(2)}% > ${config.params.maxProfitErosionPercent}% max`,
          };
        }
      }

      // Record variance for tracking even on success
      this.recordPriceVariance(opportunity, totalVariance);

      // Check slippage
      if (!isSlippageAcceptable(buyOrderBook, opportunity.amount, 'buy', config.params.maxSlippage)) {
        return {
          valid: false,
          currentBuyPrice,
          currentSellPrice,
          buyPriceVariance,
          sellPriceVariance,
          totalVariance,
          reason: 'Buy slippage exceeds maximum',
        };
      }

      if (!isSlippageAcceptable(sellOrderBook, opportunity.amount, 'sell', config.params.maxSlippage)) {
        return {
          valid: false,
          currentBuyPrice,
          currentSellPrice,
          buyPriceVariance,
          sellPriceVariance,
          totalVariance,
          reason: 'Sell slippage exceeds maximum',
        };
      }

      return {
        valid: true,
        currentBuyPrice,
        currentSellPrice,
        buyPriceVariance,
        sellPriceVariance,
        totalVariance,
      };

    } catch (error) {
      logger.debug('Error validating current prices:', error);
      return { valid: false, reason: `Validation error: ${(error as Error).message}` };
    }
  }

  /**
   * Record price variance for analysis and monitoring
   */
  private recordPriceVariance(opportunity: ArbitrageOpportunity, totalVariance: number): void {
    const maxHistorySize = 100;

    this.profitVarianceHistory.push({
      timestamp: Date.now(),
      expectedProfit: opportunity.profitPercent,
      priceVarianceImpact: totalVariance,
      symbol: opportunity.symbol,
    });

    // Keep history bounded
    if (this.profitVarianceHistory.length > maxHistorySize) {
      this.profitVarianceHistory.shift();
    }
  }

  /**
   * Get profit variance statistics for monitoring
   */
  public getProfitVarianceStats(): {
    avgVariance: number;
    maxVariance: number;
    recentCount: number;
    avgProfitImpact: number;
  } {
    if (this.profitVarianceHistory.length === 0) {
      return { avgVariance: 0, maxVariance: 0, recentCount: 0, avgProfitImpact: 0 };
    }

    const variances = this.profitVarianceHistory.map(h => h.priceVarianceImpact);
    const avgVariance = variances.reduce((a, b) => a + b, 0) / variances.length;
    const maxVariance = Math.max(...variances);

    // Calculate average profit impact (variance as % of expected profit)
    const profitImpacts = this.profitVarianceHistory.map(
      h => (h.priceVarianceImpact / h.expectedProfit) * 100
    );
    const avgProfitImpact = profitImpacts.reduce((a, b) => a + b, 0) / profitImpacts.length;

    return {
      avgVariance,
      maxVariance,
      recentCount: this.profitVarianceHistory.length,
      avgProfitImpact,
    };
  }

  /**
   * Check if we have required balances for the trade
   */
  private async checkRequiredBalances(opportunity: ArbitrageOpportunity): Promise<boolean> {
    const config = this.config as SimpleArbitrageConfig;
    const requiredBalances = calculateRequiredBalance(opportunity);

    try {
      // Check buy exchange balance (need quote currency)
      const buyBalance = await this.exchangeManager.getBalance(opportunity.buyExchange);
      const quoteCurrency = opportunity.symbol.split('/')[1];
      const quoteCurrencyBalance = buyBalance[quoteCurrency] as any;
      const availableQuote = quoteCurrencyBalance?.free || 0;
      
      const reserveAmount = requiredBalances.buyExchangeBalance * (config.params.balanceReservePercent / 100);
      if (availableQuote < requiredBalances.buyExchangeBalance + reserveAmount) {
        return false;
      }

      // Check sell exchange balance (need base currency)
      const sellBalance = await this.exchangeManager.getBalance(opportunity.sellExchange);
      const baseCurrency = opportunity.symbol.split('/')[0];
      const baseCurrencyBalance = sellBalance[baseCurrency] as any;
      const availableBase = baseCurrencyBalance?.free || 0;

      return availableBase >= requiredBalances.sellExchangeBalance;



    } catch (error) {
      logger.debug('Error checking balances:', error);
      return false;
    }
  }

  /**
   * Execute an arbitrage trade
   */
  private async executeTrade(opportunity: ArbitrageOpportunity): Promise<void> {
    const config = this.config as SimpleArbitrageConfig;
    const tradeKey = `${opportunity.symbol}-${opportunity.buyExchange}-${opportunity.sellExchange}`;
    
    // Mark trade as active
    this.activeTrades.add(tradeKey);

    const execution: ArbitrageExecution = {
      opportunity,
      success: false,
      executionTime: Date.now(),
      errors: [],
    };

    try {
      logger.info('Executing arbitrage trade', {
        symbol: opportunity.symbol,
        buyExchange: opportunity.buyExchange,
        sellExchange: opportunity.sellExchange,
        amount: opportunity.amount,
        expectedProfit: opportunity.profitAmount,
      });

      TradeLogger.logOpportunity({
        symbol: opportunity.symbol,
        buyExchange: opportunity.buyExchange,
        sellExchange: opportunity.sellExchange,
        profitPercent: opportunity.profitPercent,
        amount: opportunity.amount,
      });

      this.emit('execution_started', execution);

      // Create trade orders
      const buyOrder: TradeOrder = {
        exchange: opportunity.buyExchange,
        symbol: opportunity.symbol,
        side: 'buy',
        amount: opportunity.amount,
        type: 'market',
      };

      const sellOrder: TradeOrder = {
        exchange: opportunity.sellExchange,
        symbol: opportunity.symbol,
        side: 'sell',
        amount: opportunity.amount,
        type: 'market',
      };

      // Execute buy order first to avoid naked short positions
      // If buy fails, we must NOT execute the sell order
      const buyResult = await withTimeout(
        retry(() => this.exchangeManager.executeTrade(buyOrder), 2),
        config.params.orderTimeout,
        'Buy order timeout'
      );

      execution.buyTrade = buyResult;

      if (!buyResult.success) {
        execution.success = false;
        execution.errors.push(`Buy order failed: ${buyResult.error}`);

        logger.error('Arbitrage trade failed - buy order unsuccessful, sell order not attempted', {
          symbol: opportunity.symbol,
          buyExchange: opportunity.buyExchange,
          error: buyResult.error,
        });

        TradeLogger.logTradeExecution({
          symbol: opportunity.symbol,
          exchanges: [opportunity.buyExchange, opportunity.sellExchange],
          success: false,
          error: `Buy order failed: ${buyResult.error}`,
        });

        return;
      }

      // Determine sell amount based on actual filled amount from buy order
      // This handles partial fills correctly
      const actualBuyAmount = buyResult.filled || opportunity.amount;
      const fillPercent = (actualBuyAmount / opportunity.amount) * 100;
      const isPartialFill = fillPercent < 100;
      const partialFillThreshold = config.params.partialFillThreshold;

      if (isPartialFill) {
        logger.warn('Buy order partially filled', {
          symbol: opportunity.symbol,
          requestedAmount: opportunity.amount,
          filledAmount: actualBuyAmount,
          fillPercent: fillPercent.toFixed(2),
          threshold: partialFillThreshold,
        });
      }

      // Reject if fill is below threshold
      if (fillPercent < partialFillThreshold) {
        execution.success = false;
        execution.errors.push(
          `Partial fill rejected: ${fillPercent.toFixed(2)}% filled (threshold: ${partialFillThreshold}%). ` +
          `Bought ${actualBuyAmount} of ${opportunity.amount} requested. Manual intervention may be required.`
        );

        logger.error('Arbitrage trade aborted - partial fill below threshold', {
          symbol: opportunity.symbol,
          buyExchange: opportunity.buyExchange,
          requestedAmount: opportunity.amount,
          filledAmount: actualBuyAmount,
          fillPercent: fillPercent.toFixed(2),
          threshold: partialFillThreshold,
        });

        TradeLogger.logTradeExecution({
          symbol: opportunity.symbol,
          exchanges: [opportunity.buyExchange, opportunity.sellExchange],
          success: false,
          error: `Partial fill rejected: ${fillPercent.toFixed(2)}% < ${partialFillThreshold}% threshold`,
        });

        return;
      }

      // Adjust sell amount to match actual filled amount
      if (isPartialFill) {
        sellOrder.amount = actualBuyAmount;
      }

      // Buy succeeded, now execute sell order
      const sellResult = await withTimeout(
        retry(() => this.exchangeManager.executeTrade(sellOrder), 2),
        config.params.orderTimeout,
        'Sell order timeout'
      );

      execution.sellTrade = sellResult;

      // Calculate actual profit
      if (sellResult.success) {
        const totalCost = buyResult.cost + buyResult.fee;
        const totalRevenue = sellResult.cost - sellResult.fee;
        execution.actualProfit = totalRevenue - totalCost;
        execution.success = true;

        logger.info('Arbitrage trade completed successfully', {
          symbol: opportunity.symbol,
          expectedProfit: opportunity.profitAmount,
          actualProfit: execution.actualProfit,
          buyPrice: buyResult.price,
          sellPrice: sellResult.price,
          requestedAmount: opportunity.amount,
          actualBuyAmount,
          actualSellAmount: sellResult.amount,
          partialFill: isPartialFill,
          fillPercent: fillPercent.toFixed(2),
        });

        TradeLogger.logTradeExecution({
          symbol: opportunity.symbol,
          exchanges: [opportunity.buyExchange, opportunity.sellExchange],
          success: true,
          profit: execution.actualProfit,
        });

      } else {
        execution.success = false;
        execution.errors.push(`Sell order failed after successful buy: ${sellResult.error}`);

        logger.error('Arbitrage trade partially failed - buy succeeded but sell failed', {
          symbol: opportunity.symbol,
          buyExchange: opportunity.buyExchange,
          sellExchange: opportunity.sellExchange,
          buyAmount: actualBuyAmount,
          sellError: sellResult.error,
        });

        TradeLogger.logTradeExecution({
          symbol: opportunity.symbol,
          exchanges: [opportunity.buyExchange, opportunity.sellExchange],
          success: false,
          error: `Sell order failed after successful buy: ${sellResult.error}`,
        });
      }

    } catch (error) {
      execution.success = false;
      execution.errors.push((error as Error).message);
      
      logger.error('Arbitrage trade execution error:', error);
      
      TradeLogger.logTradeExecution({
        symbol: opportunity.symbol,
        exchanges: [opportunity.buyExchange, opportunity.sellExchange],
        success: false,
        error: (error as Error).message,
      });

    } finally {
      // Mark trade as completed
      this.activeTrades.delete(tradeKey);
      execution.executionTime = Date.now() - execution.executionTime;
      
      // Record the execution
      this.recordExecution(execution);
    }
  }

  /**
   * Handle configuration updates
   */
  protected override onConfigUpdate(): void {
    logger.info('SimpleArbitrage configuration updated', {
      newConfig: this.config,
    });

    // Restart monitoring with new interval if it changed
    if (this.monitoringInterval && this.isRunning) {
      clearInterval(this.monitoringInterval);
      this.startMonitoring();
    }
  }

  /**
   * Get additional strategy-specific status
   */
  override getStatus(): any {
    const baseStatus = super.getStatus();

    return {
      ...baseStatus,
      activeTrades: this.activeTrades.size,
      marketDataAge: this.getMarketDataAge(),
      profitVarianceStats: this.getProfitVarianceStats(),
      config: this.config,
    };
  }

  /**
   * Get age of market data for debugging
   */
  private getMarketDataAge(): Record<string, number> {
    const ages: Record<string, number> = {};
    const now = Date.now();

    for (const [key, data] of this.lastMarketData) {
      ages[key] = now - data.timestamp;
    }

    return ages;
  }
}