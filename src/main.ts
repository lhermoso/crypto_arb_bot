/**
 * Main application entry point
 * 
 * This file orchestrates the entire crypto arbitrage bot, initializing
 * exchanges, strategies, and handling the main application lifecycle.
 */

import { EventEmitter } from 'events';
import { CONFIG, validateConfig, isTestMode } from '@/config';
import { ExchangeManager } from '@exchanges/ExchangeManager';
import { StrategyFactory, IStrategy, StrategyStatus } from '@/strategies';
import { logger, TradeLogger } from '@utils/logger';
import type { BotConfig } from '@/types';

/**
 * Main Bot class that coordinates all components
 */
class CryptoArbitrageBot extends EventEmitter {
  private exchangeManager?: ExchangeManager;
  private strategies: IStrategy[] = [];
  private isRunning = false;
  private startTime?: number;

  constructor(private config: BotConfig) {
    super();
    this.setMaxListeners(50); // Allow many listeners for events
  }

  /**
   * Initialize the bot
   */
  async initialize(): Promise<void> {
    logger.info('Initializing crypto arbitrage bot...');

    // Validate configuration
    const validation = validateConfig(this.config);
    if (!validation.valid) {
      throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
    }

    if (isTestMode()) {
      logger.warn('🧪 Running in TEST MODE - No real trades will be executed');
    }

    // Initialize exchange manager
    this.exchangeManager = new ExchangeManager(this.config.exchanges);
    await this.exchangeManager.initialize();

    // Set up exchange event listeners
    this.setupExchangeEventListeners();

    // Initialize strategies
    await this.initializeStrategies();

    logger.info('Bot initialization complete', {
      exchanges: this.exchangeManager.getAvailableExchanges(),
      strategies: this.strategies.map(s => s.name),
      testMode: isTestMode(),
    });
  }

  /**
   * Start the bot
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Bot is already running');
    }

    if (!this.exchangeManager) {
      throw new Error('Bot not initialized. Call initialize() first.');
    }

    logger.info('Starting crypto arbitrage bot...');
    this.isRunning = true;
    this.startTime = Date.now();

    // Start all strategies
    for (const strategy of this.strategies) {
      try {
        if (strategy.config.enabled) {
          await strategy.start();
          logger.info(`Strategy ${strategy.name} started successfully`);
        } else {
          logger.info(`Strategy ${strategy.name} is disabled, skipping`);
        }
      } catch (error) {
        logger.error(`Failed to start strategy ${strategy.name}:`, error);
      }
    }

    // Set up periodic status logging
    this.setupStatusLogging();

    // Set up graceful shutdown handlers
    this.setupShutdownHandlers();

    logger.info('🚀 Crypto arbitrage bot started successfully!');
    this.emit('bot_started', { timestamp: Date.now() });
  }

  /**
   * Stop the bot
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping crypto arbitrage bot...');
    this.isRunning = false;

    // Stop all strategies
    const stopPromises = this.strategies.map(async (strategy) => {
      try {
        await strategy.stop();
        logger.info(`Strategy ${strategy.name} stopped`);
      } catch (error) {
        logger.error(`Error stopping strategy ${strategy.name}:`, error);
      }
    });

    await Promise.all(stopPromises);

    // Shutdown exchange manager
    if (this.exchangeManager) {
      await this.exchangeManager.shutdown();
    }

    logger.info('🛑 Crypto arbitrage bot stopped');
    this.emit('bot_stopped', { timestamp: Date.now() });
  }

  /**
   * Get bot status
   */
  getStatus(): {
    isRunning: boolean;
    uptime?: number;
    exchanges: string[];
    strategies: Array<{
      name: string;
      isRunning: boolean;
      status: StrategyStatus;
    }>;
  } {
    const result: {
      isRunning: boolean;
      uptime?: number;
      exchanges: string[];
      strategies: Array<{
        name: string;
        isRunning: boolean;
        status: StrategyStatus;
      }>;
    } = {
      isRunning: this.isRunning,
      exchanges: this.exchangeManager?.getAvailableExchanges() || [],
      strategies: this.strategies.map(strategy => ({
        name: strategy.name,
        isRunning: strategy.isRunning,
        status: strategy.getStatus(),
      })),
    };

    if (this.startTime) {
      result.uptime = Date.now() - this.startTime;
    }

    return result;
  }

  /**
   * Initialize all configured strategies
   */
  private async initializeStrategies(): Promise<void> {
    logger.info('Initializing strategies...');

    for (const strategyConfig of this.config.strategies) {
      try {
        logger.debug(`Creating strategy: ${strategyConfig.name}`);

        const strategy = StrategyFactory.create(
          strategyConfig.name,
          strategyConfig,
          this.exchangeManager!
        );

        // Set up strategy event listeners
        this.setupStrategyEventListeners(strategy);

        // Initialize the strategy
        await strategy.initialize();

        this.strategies.push(strategy);
        logger.info(`Strategy ${strategyConfig.name} initialized`);

      } catch (error) {
        logger.error(`Failed to initialize strategy ${strategyConfig.name}:`, error);
      }
    }

    if (this.strategies.length === 0) {
      throw new Error('No strategies were successfully initialized');
    }

    logger.info(`${this.strategies.length} strategies initialized`);
  }

  /**
   * Set up event listeners for exchange manager
   */
  private setupExchangeEventListeners(): void {
    if (!this.exchangeManager) return;

    this.exchangeManager.on('orderBookUpdate', (update) => {
      logger.debug('Order book update received', {
        exchange: update.exchange,
        symbol: update.symbol,
        timestamp: update.timestamp,
      });
    });

    this.exchangeManager.on('exchangeError', (error) => {
      logger.error('Exchange error:', error);
      TradeLogger.logExchangeEvent(error.exchange, 'error', error.error.message);
    });

    this.exchangeManager.on('exchangeConnected', (instance) => {
      logger.info(`Exchange ${instance.id} connected`);
      TradeLogger.logExchangeEvent(instance.id, 'connected', instance.capabilities);
    });

    this.exchangeManager.on('exchangeDisconnected', (instance) => {
      logger.warn(`Exchange ${instance.id} disconnected`);
      TradeLogger.logExchangeEvent(instance.id, 'disconnected');
    });
  }

  /**
   * Set up event listeners for a strategy
   */
  private setupStrategyEventListeners(strategy: IStrategy): void {
    strategy.on('opportunity_found', (opportunity) => {
      logger.debug('Arbitrage opportunity found', {
        strategy: strategy.name,
        symbol: opportunity.symbol,
        profit: opportunity.profitPercent,
        exchanges: [opportunity.buyExchange, opportunity.sellExchange],
      });
    });

    strategy.on('execution_started', (execution) => {
      logger.info('Trade execution started', {
        strategy: strategy.name,
        symbol: execution.opportunity.symbol,
        exchanges: [execution.opportunity.buyExchange, execution.opportunity.sellExchange],
      });
    });

    strategy.on('execution_completed', (execution) => {
      const level = execution.success ? 'info' : 'error';
      logger[level]('Trade execution completed', {
        strategy: strategy.name,
        success: execution.success,
        profit: execution.actualProfit,
        errors: execution.errors,
      });
    });

    strategy.on('error', (error) => {
      logger.error(`Strategy ${strategy.name} error:`, error);
    });

    strategy.on('status_update', (status) => {
      logger.debug(`Strategy ${strategy.name} status update`, status);
    });
  }

  /**
   * Set up periodic status logging
   */
  private setupStatusLogging(): void {
    const logStatus = (): void => {
      if (!this.isRunning) return;

      const status = this.getStatus();
      logger.info('Bot status update', {
        uptime: status.uptime,
        exchanges: status.exchanges.length,
        strategies: status.strategies.map(s => ({
          name: s.name,
          running: s.isRunning,
          opportunities: s.status.opportunitiesFound,
          trades: s.status.tradesExecuted,
          profit: s.status.totalProfit,
        })),
      });
    };

    // Log status every 5 minutes
    const statusInterval = setInterval(logStatus, 5 * 60 * 1000);

    // Clean up on stop
    this.once('bot_stopped', () => {
      clearInterval(statusInterval);
    });
  }

  /**
   * Set up graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      shutdown('uncaughtException').catch(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection').catch(() => process.exit(1));
    });
  }
}

/**
 * Main application function
 */
async function main(): Promise<void> {
  try {
    logger.info('🚀 Starting Crypto Arbitrage Bot...');
    logger.info('Configuration loaded', {
      exchanges: CONFIG.exchanges.map(ex => ex.id),
      strategies: CONFIG.strategies.map(s => s.name),
      testMode: isTestMode(),
    });

    // Create and initialize bot
    const bot = new CryptoArbitrageBot(CONFIG);
    await bot.initialize();

    // Start the bot
    await bot.start();

    // Keep the process alive
    await new Promise(() => {}); // Run forever

  } catch (error) {
    logger.error('Fatal error:', error);
    process.exit(1);
  }
}

// Start the application if this file is run directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to start application:', error);
    process.exit(1);
  });
}

export { CryptoArbitrageBot };