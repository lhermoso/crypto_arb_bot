/**
 * Exchange Manager - Handles CCXT Pro exchanges and WebSocket connections
 */

import * as ccxt from 'ccxt';
import { EventEmitter } from 'events';
import type { OrderBook, Ticker, Balances } from 'ccxt';
import type { 
  ExchangeId, 
  Symbol, 
  ExchangeConfig,
  MarketData,
  TradeOrder,
  TradeResult
} from '@/types';
import type { 
  ExchangeInstance, 
  ExtendedExchange,
  ConnectionStatus,
  OrderBookUpdate,
  ExchangeError,
  MarketSubscription,
} from './types';
import { logger } from '@utils/logger';

/**
 * ExchangeManager class handles multiple exchange connections and WebSocket streams
 */
export class ExchangeManager extends EventEmitter {
  private exchanges = new Map<ExchangeId, ExchangeInstance>();
  private subscriptions = new Map<string, MarketSubscription>();
  private reconnectIntervals = new Map<ExchangeId, NodeJS.Timeout>();
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 5000; // 5 seconds

  constructor(private configs: ExchangeConfig[]) {
    super();
    this.setMaxListeners(100); // Allow many listeners for market data
  }

  /**
   * Initialize all configured exchanges
   */
  async initialize(): Promise<void> {
    logger.info('Initializing exchange manager...');
    
    for (const config of this.configs) {
      if (config.enabled) {
        try {
          await this.initializeExchange(config);
        } catch (error) {
          logger.error(`Failed to initialize exchange ${config.id}:`, error);
        }
      }
    }

    logger.info(`Exchange manager initialized with ${this.exchanges.size} exchanges`);
  }

  /**
   * Initialize a single exchange
   */
  private async initializeExchange(config: ExchangeConfig): Promise<void> {
    try {
      logger.debug(`Initializing exchange: ${config.id}`);

      // Try to get CCXT Pro version first, fallback to regular CCXT
      let ExchangeClass: typeof ccxt.Exchange;
      let isProVersion = false;

      try {
        // @ts-ignore - CCXT Pro might not be typed
        ExchangeClass = ccxt.pro[config.id];
        isProVersion = true;
        logger.debug(`Using CCXT Pro for ${config.id}`);
      } catch {
        // @ts-ignore - Dynamic exchange loading
        ExchangeClass = ccxt[config.id];
        logger.debug(`Using regular CCXT for ${config.id} (Pro version not available)`);
      }

      if (!ExchangeClass) {
        throw new Error(`Exchange ${config.id} not found in CCXT`);
      }

      // Create exchange instance with configuration
      const exchangeOptions: any = {
        apiKey: config.credentials.apiKey,
        secret: config.credentials.secret,
        timeout: config.timeout,
        rateLimit: config.rateLimit,
        enableRateLimit: true,
        verbose: false,
      };

      // Add password for exchanges that require it (like OKX)
      if (config.credentials.password) {
        exchangeOptions.password = config.credentials.password;
      }

      const exchange = new ExchangeClass(exchangeOptions) as unknown as ExtendedExchange;

      // Configure sandbox mode using CCXT's standard method
      if (config.credentials.sandbox) {
        exchange.setSandboxMode(true);
      }

      // Load markets

      await exchange.loadMarkets();

      // Check capabilities
      const capabilities = {
        watchOrderBook: isProVersion && exchange.has?.['watchOrderBook'] === true,
        watchTicker: isProVersion && exchange.has?.['watchTicker'] === true,
        watchBalance: isProVersion && exchange.has?.['watchBalance'] === true,
        fetchBalance: exchange.has?.['fetchBalance'] === true,
        createOrder: exchange.has?.['createOrder'] === true,
        cancelOrder: exchange.has?.['cancelOrder'] === true,
      };

      const instance: ExchangeInstance = {
        id: config.id,
        exchange,
        status: 'connected',
        lastUpdate: Date.now(),
        errorCount: 0,
        capabilities,
      };

      this.exchanges.set(config.id, instance);
      
      logger.info(`Exchange ${config.id} initialized successfully`, {
        capabilities,
        markets: Object.keys(exchange.markets).length,
        isProVersion,
      });

      this.emit('exchangeConnected', instance);

    } catch (error) {
      logger.error(`Failed to initialize exchange ${config.id}:`, error);
      throw error;
    }
  }

  /**
   * Get exchange-compatible order book limit
   */
  private getExchangeCompatibleLimit(exchangeId: ExchangeId, requestedLimit: number): number | undefined {
    // KuCoin only accepts undefined, 5, 20, 50, or 100
    if (exchangeId.toLowerCase() === 'kucoin') {
      if (requestedLimit <= 5) return 5;
      if (requestedLimit <= 20) return 20;
      if (requestedLimit <= 50) return 50;
      return 100;
    }
    
    // Bybit only accepts 1, 50, 200, or 1000 for spot markets
    if (exchangeId.toLowerCase() === 'bybit') {
      if (requestedLimit <= 1) return 1;
      if (requestedLimit <= 50) return 50;
      if (requestedLimit <= 200) return 200;
      return 1000;
    }
    
    // For other exchanges, use the requested limit
    return requestedLimit;
  }

  /**
   * Subscribe to order book updates for a symbol on all exchanges
   */
  async subscribeToOrderBook(symbol: Symbol, limit = 10): Promise<void> {
    logger.debug(`Subscribing to order book updates for ${symbol}`);

    for (const [exchangeId, instance] of this.exchanges) {
      if (instance.capabilities.watchOrderBook) {
        const subscriptionKey = `${exchangeId}-${symbol}-orderBook`;
        
        try {
          // Adjust limit for KuCoin compatibility
          const adjustedLimit = this.getExchangeCompatibleLimit(exchangeId, limit);
          
          // Start watching order book
          this.startWatchingOrderBook(instance, symbol, adjustedLimit);
          
          this.subscriptions.set(subscriptionKey, {
            exchange: exchangeId,
            symbol,
            type: 'orderBook',
            active: true,
            lastUpdate: Date.now(),
          });

          logger.debug(`Subscribed to order book for ${symbol} on ${exchangeId}`);
        } catch (error) {
          logger.error(`Failed to subscribe to order book for ${symbol} on ${exchangeId}:`, error);
        }
      }
    }
  }

  /**
   * Start watching order book for a specific exchange and symbol
   */
  private async startWatchingOrderBook(
    instance: ExchangeInstance, 
    symbol: Symbol, 
    limit: number | undefined
  ): Promise<void> {
    const watchOrderBook = async (): Promise<void> => {
      try {
        if (!instance.exchange.watchOrderBook) {
          throw new Error('watchOrderBook not available');
        }

        const orderBook = await instance.exchange.watchOrderBook(symbol, limit);
        
        const update: OrderBookUpdate = {
          exchange: instance.id,
          symbol,
          orderBook,
          timestamp: Date.now(),
        };

        instance.lastUpdate = Date.now();
        instance.status = 'connected';
        instance.errorCount = 0;

        this.emit('orderBookUpdate', update);

        // Continue watching (recursive for WebSocket streams)
        setImmediate(() => watchOrderBook());

      } catch (error) {
        this.handleExchangeError(instance, error as Error, 'watchOrderBook');
        
        // Retry after delay if not too many errors
        if (instance.errorCount < this.maxReconnectAttempts) {
          setTimeout(() => watchOrderBook(), this.reconnectDelay);
        }
      }
    };

    // Start watching
    watchOrderBook();
  }

  /**
   * Get current order book for a symbol from a specific exchange
   */
  async getOrderBook(exchangeId: ExchangeId, symbol: Symbol, limit = 10): Promise<OrderBook> {
    const instance = this.exchanges.get(exchangeId);
    if (!instance) {
      throw new Error(`Exchange ${exchangeId} not found`);
    }

    try {
      // Adjust limit for exchange compatibility
      const adjustedLimit = this.getExchangeCompatibleLimit(exchangeId, limit);
      
      // Use WebSocket data if available, otherwise fetch
      if (instance.capabilities.watchOrderBook && instance.exchange.watchOrderBook) {
        return await instance.exchange.watchOrderBook(symbol, adjustedLimit);
      } else {
        return await instance.exchange.fetchOrderBook(symbol, adjustedLimit);
      }
    } catch (error) {
      this.handleExchangeError(instance, error as Error, 'getOrderBook');
      throw error;
    }
  }

  /**
   * Get ticker for a symbol from a specific exchange
   */
  async getTicker(exchangeId: ExchangeId, symbol: Symbol): Promise<Ticker> {
    const instance = this.exchanges.get(exchangeId);
    if (!instance) {
      throw new Error(`Exchange ${exchangeId} not found`);
    }

    try {
      return await instance.exchange.fetchTicker(symbol);
    } catch (error) {
      this.handleExchangeError(instance, error as Error, 'getTicker');
      throw error;
    }
  }

  /**
   * Get balance from a specific exchange
   */
  async getBalance(exchangeId: ExchangeId): Promise<Balances> {
    const instance = this.exchanges.get(exchangeId);
    if (!instance) {
      throw new Error(`Exchange ${exchangeId} not found`);
    }

    if (!instance.capabilities.fetchBalance) {
      throw new Error(`Exchange ${exchangeId} does not support balance fetching`);
    }

    try {
      return await instance.exchange.fetchBalance();
    } catch (error) {
      this.handleExchangeError(instance, error as Error, 'getBalance');
      throw error;
    }
  }

  /**
   * Execute a trade order on a specific exchange
   */
  async executeTrade(order: TradeOrder): Promise<TradeResult> {
    const instance = this.exchanges.get(order.exchange);
    if (!instance) {
      throw new Error(`Exchange ${order.exchange} not found`);
    }

    if (!instance.capabilities.createOrder) {
      throw new Error(`Exchange ${order.exchange} does not support order creation`);
    }

    try {
      logger.info(`Executing ${order.side} order on ${order.exchange}`, {
        symbol: order.symbol,
        amount: order.amount,
        price: order.price,
        type: order.type,
      });

      const result = await instance.exchange.createOrder(
        order.symbol,
        order.type,
        order.side,
        order.amount,
        order.price,
        order.params
      );

      const tradeResult: TradeResult = {
        orderId: result.id,
        exchange: order.exchange,
        symbol: order.symbol,
        side: order.side,
        amount: result.filled || order.amount,
        price: result.average || order.price || 0,
        cost: result.cost || 0,
        fee: result.fee?.cost || 0,
        timestamp: result.timestamp || Date.now(),
        success: true,
      };

      logger.info(`Trade executed successfully on ${order.exchange}`, tradeResult);
      return tradeResult;

    } catch (error) {
      const tradeResult: TradeResult = {
        orderId: '',
        exchange: order.exchange,
        symbol: order.symbol,
        side: order.side,
        amount: order.amount,
        price: order.price || 0,
        cost: 0,
        fee: 0,
        timestamp: Date.now(),
        success: false,
        error: (error as Error).message,
      };

      this.handleExchangeError(instance, error as Error, 'executeTrade');
      logger.error(`Trade execution failed on ${order.exchange}:`, error);
      
      return tradeResult;
    }
  }

  /**
   * Get market data for a symbol from all exchanges
   */
  async getMarketData(symbol: Symbol): Promise<MarketData[]> {
    const marketData: MarketData[] = [];

    for (const [exchangeId] of this.exchanges) {
      try {
        const [orderBook, ticker] = await Promise.all([
          this.getOrderBook(exchangeId, symbol),
          this.getTicker(exchangeId, symbol).catch(() => undefined), // Ticker is optional
        ]);

        const marketDataItem: MarketData = {
          exchange: exchangeId,
          symbol,
          orderBook,
          timestamp: Date.now(),
        };

        if (ticker) {
          marketDataItem.ticker = ticker;
        }

        marketData.push(marketDataItem);

      } catch (error) {
        logger.warn(`Failed to get market data for ${symbol} from ${exchangeId}:`, error);
      }
    }

    return marketData;
  }

  /**
   * Check if an exchange supports a specific symbol
   */
  hasSymbol(exchangeId: ExchangeId, symbol: Symbol): boolean {
    const instance = this.exchanges.get(exchangeId);
    return instance?.exchange.markets?.[symbol] !== undefined;
  }

  /**
   * Get list of available exchanges
   */
  getAvailableExchanges(): ExchangeId[] {
    return Array.from(this.exchanges.keys());
  }

  /**
   * Get exchange instance status
   */
  getExchangeStatus(exchangeId: ExchangeId): ConnectionStatus | undefined {
    return this.exchanges.get(exchangeId)?.status;
  }

  /**
   * Handle exchange errors and manage reconnection
   */
  private handleExchangeError(instance: ExchangeInstance, error: Error, context: string): void {
    instance.errorCount++;
    instance.status = 'error';

    const exchangeError: ExchangeError = {
      exchange: instance.id,
      error,
      timestamp: Date.now(),
      context,
    };

    logger.error(`Exchange error on ${instance.id} (${context}):`, error);
    this.emit('exchangeError', exchangeError);

    // Start reconnection process if too many errors
    if (instance.errorCount >= this.maxReconnectAttempts) {
      this.startReconnection(instance);
    }
  }

  /**
   * Start reconnection process for an exchange
   */
  private startReconnection(instance: ExchangeInstance): void {
    if (this.reconnectIntervals.has(instance.id)) {
      return; // Already reconnecting
    }

    logger.warn(`Starting reconnection for exchange ${instance.id}`);
    instance.status = 'reconnecting';

    const reconnectInterval = setInterval(async () => {
      try {
        // Try to reload markets to test connection
        await instance.exchange.loadMarkets(true);
        
        instance.status = 'connected';
        instance.errorCount = 0;
        instance.lastUpdate = Date.now();

        logger.info(`Successfully reconnected to exchange ${instance.id}`);
        this.emit('exchangeConnected', instance);

        // Clear reconnection interval
        clearInterval(reconnectInterval);
        this.reconnectIntervals.delete(instance.id);

      } catch (error) {
        logger.warn(`Reconnection attempt failed for ${instance.id}:`, error);
      }
    }, this.reconnectDelay);

    this.reconnectIntervals.set(instance.id, reconnectInterval);
  }

  /**
   * Cleanup and close all connections
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down exchange manager...');

    // Clear all intervals
    for (const interval of this.reconnectIntervals.values()) {
      clearInterval(interval);
    }
    this.reconnectIntervals.clear();

    // Close all exchange connections
    for (const [exchangeId, instance] of this.exchanges) {
      try {
        if (instance.exchange.close) {
          await instance.exchange.close();
        }
        instance.status = 'disconnected';
        this.emit('exchangeDisconnected', instance);
      } catch (error) {
        logger.warn(`Error closing exchange ${exchangeId}:`, error);
      }
    }

    this.exchanges.clear();
    this.subscriptions.clear();
    this.removeAllListeners();

    logger.info('Exchange manager shutdown complete');
  }
}