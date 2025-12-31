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
  TradeResult,
  TradingFees
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
import { DEFAULT_TRADING_FEES } from '@config/exchanges';
import { generateClientOrderId } from '@utils/helpers';

/**
 * Cached trading fees for an exchange
 */
interface CachedFees {
  fees: Record<string, TradingFees>;
  lastUpdated: number;
}

/**
 * Represents a reserved balance amount for a pending trade
 */
interface BalanceReservation {
  exchange: ExchangeId;
  currency: string;
  amount: number;
  tradeKey: string;
  timestamp: number;
}

/**
 * ExchangeManager class handles multiple exchange connections and WebSocket streams
 */
export class ExchangeManager extends EventEmitter {
  private exchanges = new Map<ExchangeId, ExchangeInstance>();
  private subscriptions = new Map<string, MarketSubscription>();
  private reconnectTimeouts = new Map<ExchangeId, NodeJS.Timeout>();
  private reconnectAttempts = new Map<ExchangeId, number>();
  private readonly maxReconnectAttempts = 5;
  private readonly initialReconnectDelay = 5000; // 5 seconds
  private readonly maxReconnectDelay = 300000; // 5 minutes

  // Fee caching
  private tradingFees = new Map<ExchangeId, CachedFees>();
  private feeRefreshInterval: NodeJS.Timeout | undefined;
  private readonly feeRefreshIntervalMs = 24 * 60 * 60 * 1000; // 24 hours
  private readonly feeCacheMaxAge = 24 * 60 * 60 * 1000; // 24 hours

  // Track recent orders by clientOrderId to prevent duplicate submissions
  private recentOrders = new Map<string, { orderId: string; timestamp: number; exchange: ExchangeId }>();
  private readonly recentOrderTTL = 60000; // 60 seconds TTL for recent order tracking

  // Balance reservation system
  private balanceReservations = new Map<string, BalanceReservation>();
  private readonly reservationTimeout = 60000; // 60 seconds - auto-release stale reservations

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

    // Fetch trading fees for all exchanges on startup
    await this.fetchAllTradingFees();

    // Start periodic fee refresh
    this.startFeeRefreshInterval();
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
   * Order book depth limits for each supported exchange
   * Maps exchange ID to array of valid limits (sorted ascending) and maximum limit
   */
  private static readonly ORDER_BOOK_LIMITS: Record<string, { validLimits: number[]; maxLimit: number }> = {
    // KuCoin: only accepts 5, 20, 50, or 100
    kucoin: { validLimits: [5, 20, 50, 100], maxLimit: 100 },
    // Bybit: only accepts 1, 50, 200, or 1000 for spot markets
    bybit: { validLimits: [1, 50, 200, 1000], maxLimit: 1000 },
    // Binance: accepts 5, 10, 20, 50, 100, 500, 1000, 5000
    binance: { validLimits: [5, 10, 20, 50, 100, 500, 1000, 5000], maxLimit: 5000 },
    // OKX: accepts 1-400 for REST, 1, 5, 40, 100, 400 for WebSocket
    okx: { validLimits: [1, 5, 40, 100, 400], maxLimit: 400 },
    // Kraken: accepts 1-500 for REST, 10, 25, 100, 500, 1000 for WebSocket
    kraken: { validLimits: [10, 25, 100, 500, 1000], maxLimit: 1000 },
  };

  /**
   * Get exchange-compatible order book limit
   * Rounds up to nearest valid limit for the exchange and logs a warning if capped
   */
  private getExchangeCompatibleLimit(exchangeId: ExchangeId, requestedLimit: number): number | undefined {
    const exchangeLimits = ExchangeManager.ORDER_BOOK_LIMITS[exchangeId.toLowerCase()];

    // For exchanges without defined limits, use the requested limit
    if (!exchangeLimits) {
      return requestedLimit;
    }

    const { validLimits, maxLimit } = exchangeLimits;

    // Log warning if requested depth exceeds exchange maximum
    if (requestedLimit > maxLimit) {
      logger.warn(`Requested order book depth ${requestedLimit} exceeds ${exchangeId} maximum of ${maxLimit}, capping to ${maxLimit}`);
      return maxLimit;
    }

    // Find the smallest valid limit that satisfies the request
    for (const limit of validLimits) {
      if (requestedLimit <= limit) {
        return limit;
      }
    }

    // Fallback to max limit if no suitable limit found
    return maxLimit;
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

        // Preserve exchange-provided timestamp, fallback to local time only if unavailable
        const exchangeTimestamp = orderBook.timestamp || Date.now();

        const update: OrderBookUpdate = {
          exchange: instance.id,
          symbol,
          orderBook,
          timestamp: exchangeTimestamp,
        };

        instance.lastUpdate = exchangeTimestamp;
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
   * Get available balance for a currency, accounting for reservations
   */
  getAvailableBalance(
    balances: Balances,
    exchangeId: ExchangeId,
    currency: string
  ): number {
    // Clean up stale reservations first
    this.cleanupStaleReservations();

    const currencyBalance = balances[currency] as { free?: number } | undefined;
    const freeBalance = currencyBalance?.free || 0;

    // Calculate total reserved amount for this exchange/currency
    let reservedAmount = 0;
    for (const reservation of this.balanceReservations.values()) {
      if (reservation.exchange === exchangeId && reservation.currency === currency) {
        reservedAmount += reservation.amount;
      }
    }

    return Math.max(0, freeBalance - reservedAmount);
  }

  /**
   * Reserve balance for a pending trade to prevent concurrent use
   */
  reserveBalance(
    tradeKey: string,
    exchangeId: ExchangeId,
    currency: string,
    amount: number
  ): void {
    const reservationKey = `${tradeKey}-${exchangeId}-${currency}`;

    this.balanceReservations.set(reservationKey, {
      exchange: exchangeId,
      currency,
      amount,
      tradeKey,
      timestamp: Date.now(),
    });

    logger.debug('Balance reserved', {
      tradeKey,
      exchange: exchangeId,
      currency,
      amount,
      reservationKey,
    });
  }

  /**
   * Release reserved balance after trade completion or failure
   */
  releaseReservation(tradeKey: string): void {
    const keysToRemove: string[] = [];

    for (const [key, reservation] of this.balanceReservations) {
      if (reservation.tradeKey === tradeKey) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      this.balanceReservations.delete(key);
    }

    if (keysToRemove.length > 0) {
      logger.debug('Balance reservations released', {
        tradeKey,
        releasedCount: keysToRemove.length,
      });
    }
  }

  /**
   * Clean up stale reservations that have exceeded the timeout
   */
  private cleanupStaleReservations(): void {
    const now = Date.now();
    const keysToRemove: string[] = [];

    for (const [key, reservation] of this.balanceReservations) {
      if (now - reservation.timestamp > this.reservationTimeout) {
        keysToRemove.push(key);
        logger.warn('Releasing stale balance reservation', {
          tradeKey: reservation.tradeKey,
          exchange: reservation.exchange,
          currency: reservation.currency,
          amount: reservation.amount,
          ageMs: now - reservation.timestamp,
        });
      }
    }

    for (const key of keysToRemove) {
      this.balanceReservations.delete(key);
    }
  }

  /**
   * Execute a trade order on a specific exchange with idempotency support
   *
   * Uses clientOrderId to prevent duplicate order submissions. If an order
   * with the same clientOrderId already exists, returns the existing order result.
   */
  async executeTrade(order: TradeOrder): Promise<TradeResult> {
    const instance = this.exchanges.get(order.exchange);
    if (!instance) {
      throw new Error(`Exchange ${order.exchange} not found`);
    }

    if (!instance.capabilities.createOrder) {
      throw new Error(`Exchange ${order.exchange} does not support order creation`);
    }

    // Generate or use provided clientOrderId for idempotency
    const clientOrderId = (order.params?.clientOrderId as string) || generateClientOrderId();

    // Clean up stale entries from recentOrders
    this.cleanupRecentOrders();

    // Check if this order was already submitted (prevents duplicate fills on retry)
    const existingOrder = this.recentOrders.get(clientOrderId);
    if (existingOrder) {
      logger.warn(`Order with clientOrderId ${clientOrderId} already submitted, checking status`, {
        existingOrderId: existingOrder.orderId,
        exchange: existingOrder.exchange,
      });

      // Try to fetch the existing order status
      try {
        const orderStatus = await this.fetchOrder(order.exchange, existingOrder.orderId, order.symbol);
        if (orderStatus) {
          logger.info(`Found existing order ${existingOrder.orderId}, returning cached result`);
          return orderStatus;
        }
      } catch (fetchError) {
        logger.debug(`Failed to fetch existing order ${existingOrder.orderId}:`, fetchError);
      }
    }

    try {
      logger.info(`Executing ${order.side} order on ${order.exchange}`, {
        symbol: order.symbol,
        amount: order.amount,
        price: order.price,
        type: order.type,
        clientOrderId,
      });

      // Merge clientOrderId into params for exchanges that support it
      const orderParams = {
        ...order.params,
        clientOrderId,
      };

      const result = await instance.exchange.createOrder(
        order.symbol,
        order.type,
        order.side,
        order.amount,
        order.price,
        orderParams
      );

      const tradeResult: TradeResult = {
        orderId: result.id,
        exchange: order.exchange,
        symbol: order.symbol,
        side: order.side,
        amount: result.filled || order.amount,
        filled: result.filled || order.amount,
        price: result.average || order.price || 0,
        cost: result.cost || 0,
        fee: result.fee?.cost || 0,
        timestamp: result.timestamp || Date.now(),
        success: true,
      };

      // Track successful order to prevent duplicate submissions on retry
      this.recentOrders.set(clientOrderId, {
        orderId: result.id,
        timestamp: Date.now(),
        exchange: order.exchange,
      });

      logger.info(`Trade executed successfully on ${order.exchange}`, tradeResult);
      return tradeResult;

    } catch (error) {
      // On timeout errors, the order might have been placed - check before returning failure
      const errorMessage = (error as Error).message.toLowerCase();
      const isTimeoutError = errorMessage.includes('timeout') ||
                            errorMessage.includes('timedout') ||
                            errorMessage.includes('etimedout');

      if (isTimeoutError) {
        logger.warn(`Timeout during order submission on ${order.exchange}, checking for existing order`, {
          clientOrderId,
          symbol: order.symbol,
        });

        // Wait briefly for exchange to process, then check for the order
        await new Promise(resolve => setTimeout(resolve, 2000));

        const existingOrderResult = await this.findRecentOrderByParams(
          order.exchange,
          order.symbol,
          order.side,
          order.amount
        );

        if (existingOrderResult) {
          logger.info(`Found order placed despite timeout on ${order.exchange}`, existingOrderResult);
          // Track to prevent duplicates on further retries
          this.recentOrders.set(clientOrderId, {
            orderId: existingOrderResult.orderId,
            timestamp: Date.now(),
            exchange: order.exchange,
          });
          return existingOrderResult;
        }
      }

      const tradeResult: TradeResult = {
        orderId: '',
        exchange: order.exchange,
        symbol: order.symbol,
        side: order.side,
        amount: order.amount,
        filled: 0,
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
   * Fetch a specific order by ID
   */
  private async fetchOrder(exchangeId: ExchangeId, orderId: string, symbol: Symbol): Promise<TradeResult | null> {
    const instance = this.exchanges.get(exchangeId);
    if (!instance) {
      return null;
    }

    try {
      const order = await instance.exchange.fetchOrder(orderId, symbol);
      if (order) {
        return {
          orderId: order.id,
          exchange: exchangeId,
          symbol: symbol,
          side: order.side as 'buy' | 'sell',
          amount: order.amount || 0,
          filled: order.filled || 0,
          price: order.average || order.price || 0,
          cost: order.cost || 0,
          fee: order.fee?.cost || 0,
          timestamp: order.timestamp || Date.now(),
          success: order.status === 'closed' || order.status === 'open' || (order.filled !== undefined && order.filled > 0),
        };
      }
    } catch (error) {
      logger.debug(`Failed to fetch order ${orderId} on ${exchangeId}:`, error);
    }
    return null;
  }

  /**
   * Find a recent order matching the given parameters
   * Used to detect if an order was placed despite a timeout
   */
  private async findRecentOrderByParams(
    exchangeId: ExchangeId,
    symbol: Symbol,
    side: 'buy' | 'sell',
    amount: number
  ): Promise<TradeResult | null> {
    const instance = this.exchanges.get(exchangeId);
    if (!instance) {
      return null;
    }

    try {
      // Fetch recent orders (last 10) and look for a match
      const orders = await instance.exchange.fetchOrders(symbol, undefined, 10);
      const recentThreshold = Date.now() - 30000; // Orders within last 30 seconds

      for (const order of orders) {
        const orderTimestamp = order.timestamp || 0;
        if (orderTimestamp < recentThreshold) {
          continue;
        }

        // Match by side and approximate amount (within 1% tolerance)
        if (order.side === side) {
          const amountDiff = Math.abs((order.amount || 0) - amount) / amount;
          if (amountDiff < 0.01) {
            logger.info(`Found matching recent order on ${exchangeId}`, {
              orderId: order.id,
              symbol,
              side,
              amount: order.amount,
            });

            return {
              orderId: order.id,
              exchange: exchangeId,
              symbol: symbol,
              side: side,
              amount: order.amount || amount,
              filled: order.filled || 0,
              price: order.average || order.price || 0,
              cost: order.cost || 0,
              fee: order.fee?.cost || 0,
              timestamp: order.timestamp || Date.now(),
              success: order.status === 'closed' || order.status === 'open' || (order.filled !== undefined && order.filled > 0),
            };
          }
        }
      }
    } catch (error) {
      logger.debug(`Failed to fetch recent orders on ${exchangeId}:`, error);
    }

    return null;
  }

  /**
   * Clean up stale entries from recentOrders map
   */
  private cleanupRecentOrders(): void {
    const now = Date.now();
    for (const [clientOrderId, orderInfo] of this.recentOrders) {
      if (now - orderInfo.timestamp > this.recentOrderTTL) {
        this.recentOrders.delete(clientOrderId);
      }
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

        // Use exchange-provided timestamp from order book, fallback to local time
        const exchangeTimestamp = orderBook.timestamp || Date.now();

        const marketDataItem: MarketData = {
          exchange: exchangeId,
          symbol,
          orderBook,
          timestamp: exchangeTimestamp,
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
   * Calculate exponential backoff delay
   */
  private calculateBackoffDelay(attemptCount: number): number {
    // Exponential backoff: initialDelay * 2^(attempt - 1)
    const delay = this.initialReconnectDelay * Math.pow(2, attemptCount - 1);
    return Math.min(delay, this.maxReconnectDelay);
  }

  /**
   * Start reconnection process for an exchange with exponential backoff
   */
  private startReconnection(instance: ExchangeInstance): void {
    if (this.reconnectTimeouts.has(instance.id)) {
      return; // Already reconnecting
    }

    logger.warn(`Starting reconnection for exchange ${instance.id}`);
    instance.status = 'reconnecting';

    // Initialize attempt counter if not exists
    if (!this.reconnectAttempts.has(instance.id)) {
      this.reconnectAttempts.set(instance.id, 0);
    }

    this.scheduleReconnect(instance);
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(instance: ExchangeInstance): void {
    const currentAttempt = (this.reconnectAttempts.get(instance.id) || 0) + 1;
    this.reconnectAttempts.set(instance.id, currentAttempt);

    const delay = this.calculateBackoffDelay(currentAttempt);

    logger.info(`Scheduling reconnection attempt ${currentAttempt} for ${instance.id} in ${delay / 1000}s`);

    const reconnectTimeout = setTimeout(async () => {
      try {
        logger.info(`Reconnection attempt ${currentAttempt} for exchange ${instance.id}`);

        // Try to reload markets to test connection
        await instance.exchange.loadMarkets(true);

        instance.status = 'connected';
        instance.errorCount = 0;
        instance.lastUpdate = Date.now();

        logger.info(`Successfully reconnected to exchange ${instance.id} after ${currentAttempt} attempt(s)`);
        this.emit('exchangeConnected', instance);

        // Reset reconnection state on success
        this.reconnectTimeouts.delete(instance.id);
        this.reconnectAttempts.delete(instance.id);

      } catch (error) {
        logger.warn(`Reconnection attempt ${currentAttempt} failed for ${instance.id}:`, error);

        // Clear current timeout and schedule next attempt
        this.reconnectTimeouts.delete(instance.id);
        this.scheduleReconnect(instance);
      }
    }, delay);

    this.reconnectTimeouts.set(instance.id, reconnectTimeout);
  }

  /**
   * Cleanup and close all connections
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down exchange manager...');

    // Clear fee refresh interval
    if (this.feeRefreshInterval) {
      clearInterval(this.feeRefreshInterval);
      this.feeRefreshInterval = undefined;
    }

    // Clear all reconnection timeouts
    for (const timeout of this.reconnectTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.reconnectTimeouts.clear();
    this.reconnectAttempts.clear();

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
    this.tradingFees.clear();
    this.removeAllListeners();

    logger.info('Exchange manager shutdown complete');
  }

  /**
   * Fetch trading fees for all exchanges
   */
  private async fetchAllTradingFees(): Promise<void> {
    logger.info('Fetching trading fees from all exchanges...');

    const fetchPromises = Array.from(this.exchanges.keys()).map(async (exchangeId) => {
      try {
        await this.fetchTradingFeesForExchange(exchangeId);
      } catch {
        // Error already logged in fetchTradingFeesForExchange
      }
    });

    await Promise.all(fetchPromises);

    logger.info('Trading fees fetch complete', {
      exchangesWithFees: Array.from(this.tradingFees.keys()),
    });
  }

  /**
   * Fetch trading fees for a specific exchange
   */
  private async fetchTradingFeesForExchange(exchangeId: ExchangeId): Promise<void> {
    const instance = this.exchanges.get(exchangeId);
    if (!instance) {
      return;
    }

    try {
      // Check if the exchange supports fetchTradingFees
      if (!instance.exchange.has['fetchTradingFees']) {
        logger.warn(`Exchange ${exchangeId} does not support fetchTradingFees, using default fees`, {
          defaultFees: DEFAULT_TRADING_FEES[exchangeId],
        });
        this.setDefaultFees(exchangeId);
        return;
      }

      logger.debug(`Fetching trading fees from ${exchangeId}...`);
      const feesResponse = await instance.exchange.fetchTradingFees();

      // Parse and cache the fees
      const parsedFees: Record<string, TradingFees> = {};

      for (const [symbol, feeData] of Object.entries(feesResponse)) {
        if (feeData && typeof feeData === 'object') {
          const fee = feeData as { maker?: number; taker?: number; percentage?: boolean };
          parsedFees[symbol] = {
            maker: fee.maker ?? DEFAULT_TRADING_FEES[exchangeId].maker,
            taker: fee.taker ?? DEFAULT_TRADING_FEES[exchangeId].taker,
            percentage: fee.percentage ?? true,
          };
        }
      }

      // Store the fetched fees
      this.tradingFees.set(exchangeId, {
        fees: parsedFees,
        lastUpdated: Date.now(),
      });

      // Log a sample of fees for verification
      const sampleSymbols = Object.keys(parsedFees).slice(0, 3);
      const sampleFees = sampleSymbols.reduce((acc, symbol) => {
        acc[symbol] = parsedFees[symbol];
        return acc;
      }, {} as Record<string, TradingFees>);

      logger.info(`Trading fees fetched for ${exchangeId}`, {
        symbolCount: Object.keys(parsedFees).length,
        sampleFees,
      });

    } catch (error) {
      logger.warn(`Failed to fetch trading fees from ${exchangeId}, using conservative defaults`, {
        error: (error as Error).message,
        defaultFees: DEFAULT_TRADING_FEES[exchangeId],
      });
      this.setDefaultFees(exchangeId);
    }
  }

  /**
   * Set default fees for an exchange (used as fallback)
   */
  private setDefaultFees(exchangeId: ExchangeId): void {
    const defaultFee = DEFAULT_TRADING_FEES[exchangeId];
    this.tradingFees.set(exchangeId, {
      fees: {
        '*': defaultFee, // Wildcard for all symbols
      },
      lastUpdated: Date.now(),
    });
  }

  /**
   * Start periodic fee refresh interval
   */
  private startFeeRefreshInterval(): void {
    this.feeRefreshInterval = setInterval(async () => {
      logger.info('Refreshing trading fees (periodic update)...');
      await this.fetchAllTradingFees();
    }, this.feeRefreshIntervalMs);

    logger.debug('Fee refresh interval started', {
      intervalHours: this.feeRefreshIntervalMs / (60 * 60 * 1000),
    });
  }

  /**
   * Get trading fee for a specific exchange and symbol
   * Returns the actual fee if available, or conservative default otherwise
   */
  getTradingFee(exchangeId: ExchangeId, symbol: string, isMaker = false): number {
    const cachedFees = this.tradingFees.get(exchangeId);

    // Check if cache is expired
    if (!cachedFees || (Date.now() - cachedFees.lastUpdated > this.feeCacheMaxAge)) {
      // Return conservative default if cache is missing or expired
      const defaultFees = DEFAULT_TRADING_FEES[exchangeId];
      return isMaker ? defaultFees.maker : defaultFees.taker;
    }

    // Look for symbol-specific fee
    const symbolFee = cachedFees.fees[symbol];
    if (symbolFee) {
      return isMaker ? symbolFee.maker : symbolFee.taker;
    }

    // Look for wildcard fee (used when we couldn't fetch specific fees)
    const wildcardFee = cachedFees.fees['*'];
    if (wildcardFee) {
      return isMaker ? wildcardFee.maker : wildcardFee.taker;
    }

    // Fallback to default
    const defaultFees = DEFAULT_TRADING_FEES[exchangeId];
    return isMaker ? defaultFees.maker : defaultFees.taker;
  }

  /**
   * Get all cached fees for an exchange (for debugging/monitoring)
   */
  getCachedFees(exchangeId: ExchangeId): CachedFees | undefined {
    return this.tradingFees.get(exchangeId);
  }

  /**
   * Force refresh trading fees for an exchange
   */
  async refreshTradingFees(exchangeId: ExchangeId): Promise<void> {
    await this.fetchTradingFeesForExchange(exchangeId);
  }
}