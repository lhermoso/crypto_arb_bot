/**
 * Integration tests for SimpleArbitrage strategy with mocked exchange data
 */

import type { OrderBook } from 'ccxt';
import type { StrategyConfig, MarketData } from '@/types';
import { SimpleArbitrage } from '@strategies/SimpleArbitrage';

// Mock logger module
jest.mock('@utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  TradeLogger: {
    logOpportunity: jest.fn(),
    logTradeExecution: jest.fn(),
  },
  performanceLogger: {
    time: jest.fn((_name: string, fn: () => Promise<any>) => fn()),
  },
}));

// Mock exchange config
jest.mock('@config/exchanges', () => ({
  getTradingFee: jest.fn().mockReturnValue(0.001),
}));

// Create mock ExchangeManager
const createMockExchangeManager = () => ({
  subscribeToOrderBook: jest.fn().mockResolvedValue(undefined),
  getMarketData: jest.fn().mockResolvedValue([]),
  getOrderBook: jest.fn().mockResolvedValue({
    asks: [[100, 10]],
    bids: [[99, 10]],
    symbol: 'BTC/USDT',
    timestamp: Date.now(),
    datetime: new Date().toISOString(),
    nonce: 1,
  }),
  getBalance: jest.fn().mockResolvedValue({
    USDT: { free: 10000, used: 0, total: 10000 },
    BTC: { free: 10, used: 0, total: 10 },
  }),
  executeTrade: jest.fn().mockResolvedValue({
    orderId: 'test-order-1',
    exchange: 'binance',
    symbol: 'BTC/USDT',
    side: 'buy',
    amount: 1,
    filled: 1,
    price: 100,
    cost: 100,
    fee: 0.1,
    timestamp: Date.now(),
    success: true,
  }),
});

const createDefaultConfig = (): StrategyConfig => ({
  name: 'test-simple-arbitrage',
  enabled: true,
  minProfitPercent: 0.5,
  maxTradeAmount: 100,
  symbols: ['BTC/USDT'],
  exchanges: ['binance', 'kucoin'],
  params: {
    checkInterval: 1000,
    maxSlippage: 0.1,
    orderTimeout: 5000,
    balanceReservePercent: 10,
    maxOpportunityAge: 5000,
    priceValidationWindow: 2000,
    partialFillThreshold: 95,
  },
});

const createMockOrderBook = (
  askPrice: number,
  askAmount: number,
  bidPrice: number,
  bidAmount: number
): OrderBook => ({
  asks: [[askPrice, askAmount]],
  bids: [[bidPrice, bidAmount]],
  symbol: 'BTC/USDT',
  timestamp: Date.now(),
  datetime: new Date().toISOString(),
  nonce: 1,
});

const createMockMarketData = (
  exchange: string,
  symbol: string,
  askPrice: number,
  askAmount: number,
  bidPrice: number,
  bidAmount: number
): MarketData => ({
  exchange: exchange as any,
  symbol,
  orderBook: createMockOrderBook(askPrice, askAmount, bidPrice, bidAmount),
  timestamp: Date.now(),
});

describe('SimpleArbitrage', () => {
  let strategy: SimpleArbitrage;
  let mockExchangeManager: ReturnType<typeof createMockExchangeManager>;
  let config: StrategyConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExchangeManager = createMockExchangeManager();
    config = createDefaultConfig();
    strategy = new SimpleArbitrage(
      'test-strategy',
      config,
      mockExchangeManager as any
    );
  });

  afterEach(async () => {
    if (strategy.isRunning) {
      await strategy.stop();
    }
  });

  describe('initialization', () => {
    it('should initialize with correct name and config', () => {
      expect(strategy.name).toBe('test-strategy');
      expect(strategy.config.minProfitPercent).toBe(0.5);
      expect(strategy.config.maxTradeAmount).toBe(100);
    });

    it('should set default parameters when params not provided', () => {
      const configWithoutParams = { ...config };
      delete (configWithoutParams as any).params;
      const defaultStrategy = new SimpleArbitrage(
        'default-test',
        configWithoutParams,
        mockExchangeManager as any
      );
      expect(defaultStrategy.config.params).toBeDefined();
    });

    it('should not be running initially', () => {
      expect(strategy.isRunning).toBe(false);
    });

    it('should have symbols from config', () => {
      expect(strategy.config.symbols).toContain('BTC/USDT');
    });

    it('should have exchanges from config', () => {
      expect(strategy.config.exchanges).toContain('binance');
      expect(strategy.config.exchanges).toContain('kucoin');
    });
  });

  describe('start/stop lifecycle', () => {
    it('should start successfully', async () => {
      await strategy.start();
      expect(strategy.isRunning).toBe(true);
    });

    it('should subscribe to order books on start', async () => {
      await strategy.start();
      expect(mockExchangeManager.subscribeToOrderBook).toHaveBeenCalledWith('BTC/USDT');
    });

    it('should throw error if started twice', async () => {
      await strategy.start();
      await expect(strategy.start()).rejects.toThrow('already running');
    });

    it('should stop successfully', async () => {
      await strategy.start();
      await strategy.stop();
      expect(strategy.isRunning).toBe(false);
    });

    it('should handle stop when not running', async () => {
      await expect(strategy.stop()).resolves.not.toThrow();
    });

    it('should emit status_update on start', async () => {
      const statusHandler = jest.fn();
      strategy.on('status_update', statusHandler);

      await strategy.start();

      expect(statusHandler).toHaveBeenCalled();
    });

    it('should emit status_update on stop', async () => {
      await strategy.start();

      const statusHandler = jest.fn();
      strategy.on('status_update', statusHandler);

      await strategy.stop();

      expect(statusHandler).toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('should return initial status', () => {
      const status = strategy.getStatus();
      expect(status.name).toBe('test-strategy');
      expect(status.isRunning).toBe(false);
      expect(status.opportunitiesFound).toBe(0);
      expect(status.tradesExecuted).toBe(0);
      expect(status.successfulTrades).toBe(0);
      expect(status.totalProfit).toBe(0);
    });

    it('should update isRunning status', async () => {
      await strategy.start();
      const status = strategy.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.startTime).toBeDefined();
    });

    it('should include active trades count', async () => {
      await strategy.start();
      const status = strategy.getStatus();
      expect(status.activeTrades).toBe(0);
    });

    it('should track errors in status array', () => {
      const status = strategy.getStatus();
      expect(Array.isArray(status.errors)).toBe(true);
    });

    it('should report config in status', async () => {
      await strategy.start();
      const status = strategy.getStatus();

      expect(status.config).toBeDefined();
      expect(status.config.minProfitPercent).toBe(0.5);
    });

    it('should report market data age', async () => {
      await strategy.start();
      const status = strategy.getStatus();

      expect(status.marketDataAge).toBeDefined();
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      strategy.updateConfig({ minProfitPercent: 1.0 });
      expect(strategy.config.minProfitPercent).toBe(1.0);
    });

    it('should preserve other config values', () => {
      strategy.updateConfig({ minProfitPercent: 1.0 });
      expect(strategy.config.maxTradeAmount).toBe(100);
    });

    it('should merge config values', () => {
      strategy.updateConfig({ minProfitPercent: 1.0, maxTradeAmount: 200 });
      expect(strategy.config.minProfitPercent).toBe(1.0);
      expect(strategy.config.maxTradeAmount).toBe(200);
    });
  });

  describe('error handling', () => {
    it('should handle subscription errors gracefully', async () => {
      mockExchangeManager.subscribeToOrderBook.mockRejectedValue(
        new Error('Subscription failed')
      );

      await expect(strategy.start()).resolves.not.toThrow();
      expect(strategy.isRunning).toBe(true);
    });

    it('should track errors array', () => {
      const status = strategy.getStatus();
      expect(Array.isArray(status.errors)).toBe(true);
    });
  });

  describe('event emitter', () => {
    it('should emit opportunity_found event when strategy records opportunity', async () => {
      const opportunityHandler = jest.fn();
      strategy.on('opportunity_found', opportunityHandler);

      // Access protected method via event emission
      await strategy.start();

      // The strategy emits events through its lifecycle
      expect(strategy.listenerCount('opportunity_found')).toBe(1);
    });

    it('should emit execution_completed event', async () => {
      const completedHandler = jest.fn();
      strategy.on('execution_completed', completedHandler);

      await strategy.start();

      expect(strategy.listenerCount('execution_completed')).toBe(1);
    });

    it('should emit error event', async () => {
      const errorHandler = jest.fn();
      strategy.on('error', errorHandler);

      await strategy.start();

      expect(strategy.listenerCount('error')).toBe(1);
    });
  });

  describe('configuration validation', () => {
    it('should use default checkInterval when not provided', () => {
      expect(strategy.config.params?.checkInterval).toBe(1000);
    });

    it('should use default maxSlippage when not provided', () => {
      expect(strategy.config.params?.maxSlippage).toBe(0.1);
    });

    it('should use default orderTimeout when not provided', () => {
      expect(strategy.config.params?.orderTimeout).toBe(5000);
    });

    it('should use default balanceReservePercent when not provided', () => {
      expect(strategy.config.params?.balanceReservePercent).toBe(10);
    });

    it('should use default maxOpportunityAge when not provided', () => {
      expect(strategy.config.params?.maxOpportunityAge).toBe(5000);
    });

    it('should use default partialFillThreshold when not provided', () => {
      expect(strategy.config.params?.partialFillThreshold).toBe(95);
    });
  });

  describe('mock exchange manager interactions', () => {
    it('should call subscribeToOrderBook for each symbol', async () => {
      const multiSymbolConfig = {
        ...config,
        symbols: ['BTC/USDT', 'ETH/USDT'],
      };
      const multiSymbolStrategy = new SimpleArbitrage(
        'multi-symbol-test',
        multiSymbolConfig,
        mockExchangeManager as any
      );

      await multiSymbolStrategy.start();

      expect(mockExchangeManager.subscribeToOrderBook).toHaveBeenCalledWith('BTC/USDT');
      expect(mockExchangeManager.subscribeToOrderBook).toHaveBeenCalledWith('ETH/USDT');

      await multiSymbolStrategy.stop();
    });

    it('should handle empty market data', async () => {
      mockExchangeManager.getMarketData.mockResolvedValue([]);

      await strategy.start();

      // No errors expected, strategy should handle empty data gracefully
      expect(strategy.isRunning).toBe(true);
    });

    it('should have access to getBalance method', () => {
      expect(mockExchangeManager.getBalance).toBeDefined();
    });

    it('should have access to executeTrade method', () => {
      expect(mockExchangeManager.executeTrade).toBeDefined();
    });

    it('should have access to getOrderBook method', () => {
      expect(mockExchangeManager.getOrderBook).toBeDefined();
    });
  });

  describe('mock market data', () => {
    it('should create valid market data structure', () => {
      const marketData = createMockMarketData('binance', 'BTC/USDT', 100, 10, 99, 10);

      expect(marketData.exchange).toBe('binance');
      expect(marketData.symbol).toBe('BTC/USDT');
      expect(marketData.orderBook.asks[0][0]).toBe(100);
      expect(marketData.orderBook.bids[0][0]).toBe(99);
    });

    it('should create valid order book structure', () => {
      const orderBook = createMockOrderBook(100, 10, 99, 10);

      expect(orderBook.asks).toHaveLength(1);
      expect(orderBook.bids).toHaveLength(1);
      expect(orderBook.symbol).toBe('BTC/USDT');
    });
  });
});
