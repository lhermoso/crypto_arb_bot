/**
 * Tests for SimpleArbitrage strategy - Race condition prevention
 */

import { SimpleArbitrage } from '../strategies/SimpleArbitrage';
import type { ExchangeManager } from '../exchanges/ExchangeManager';
import type { ArbitrageOpportunity, StrategyConfig } from '../types';

// Mock the logger
jest.mock('../utils/logger', () => ({
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
    time: jest.fn((_name: string, fn: () => Promise<unknown>) => fn()),
  },
}));

// Mock the calculations utils
jest.mock('../utils/calculations', () => ({
  findArbitrageOpportunities: jest.fn(),
  validateOpportunity: jest.fn(() => true),
  calculateRequiredBalance: jest.fn(() => ({
    buyExchangeBalance: 100,
    sellExchangeBalance: 1,
  })),
  isSlippageAcceptable: jest.fn(() => true),
}));

// Mock the helpers
jest.mock('../utils/helpers', () => ({
  sleep: jest.fn(() => Promise.resolve()),
  withTimeout: jest.fn((promise: Promise<unknown>) => promise),
  retry: jest.fn((fn: () => Promise<unknown>) => fn()),
}));

describe('SimpleArbitrage - Race Condition Prevention', () => {
  let strategy: SimpleArbitrage;
  let mockExchangeManager: jest.Mocked<ExchangeManager>;
  let mockConfig: StrategyConfig;

  beforeEach(() => {
    // Create mock exchange manager
    mockExchangeManager = {
      subscribeToOrderBook: jest.fn().mockResolvedValue(undefined),
      getMarketData: jest.fn().mockResolvedValue([]),
      getOrderBook: jest.fn().mockResolvedValue({
        asks: [[100, 1]],
        bids: [[99, 1]],
      }),
      getBalance: jest.fn().mockResolvedValue({
        USDT: { free: 10000, used: 0, total: 10000 },
        BTC: { free: 10, used: 0, total: 10 },
      }),
      executeTrade: jest.fn().mockResolvedValue({
        success: true,
        orderId: 'test-order-1',
        filled: 1,
        price: 100,
        cost: 100,
        fee: 0.1,
        amount: 1,
      }),
    } as unknown as jest.Mocked<ExchangeManager>;

    mockConfig = {
      name: 'test-strategy',
      enabled: true,
      minProfitPercent: 0.1,
      maxTradeAmount: 1000,
      symbols: ['BTC/USDT'],
      exchanges: ['binance', 'kucoin'],
      params: {
        checkInterval: 5000,
        maxSlippage: 0.1,
        orderTimeout: 30000,
        balanceReservePercent: 10,
        maxOpportunityAge: 5000,
        priceValidationWindow: 2000,
        partialFillThreshold: 95,
      },
    };

    strategy = new SimpleArbitrage('test', mockConfig, mockExchangeManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('tryAcquireTradeLock', () => {
    it('should acquire lock for new trade key', () => {
      const opportunity: ArbitrageOpportunity = {
        symbol: 'BTC/USDT',
        buyExchange: 'binance',
        sellExchange: 'kucoin',
        buyPrice: 100,
        sellPrice: 101,
        amount: 1,
        profitPercent: 1,
        profitAmount: 1,
        timestamp: Date.now(),
        fees: { buyFee: 0.1, sellFee: 0.1, total: 0.2 },
      };

      // Access private method through any cast
      const result = (strategy as any).tryAcquireTradeLock(opportunity);

      expect(result).toBe('BTC/USDT-binance-kucoin');
    });

    it('should return null for duplicate trade attempt', () => {
      const opportunity: ArbitrageOpportunity = {
        symbol: 'BTC/USDT',
        buyExchange: 'binance',
        sellExchange: 'kucoin',
        buyPrice: 100,
        sellPrice: 101,
        amount: 1,
        profitPercent: 1,
        profitAmount: 1,
        timestamp: Date.now(),
        fees: { buyFee: 0.1, sellFee: 0.1, total: 0.2 },
      };

      // First acquisition should succeed
      const result1 = (strategy as any).tryAcquireTradeLock(opportunity);
      expect(result1).toBe('BTC/USDT-binance-kucoin');

      // Second acquisition should fail (duplicate blocked)
      const result2 = (strategy as any).tryAcquireTradeLock(opportunity);
      expect(result2).toBeNull();
    });

    it('should allow different trade keys simultaneously', () => {
      const opportunity1: ArbitrageOpportunity = {
        symbol: 'BTC/USDT',
        buyExchange: 'binance',
        sellExchange: 'kucoin',
        buyPrice: 100,
        sellPrice: 101,
        amount: 1,
        profitPercent: 1,
        profitAmount: 1,
        timestamp: Date.now(),
        fees: { buyFee: 0.1, sellFee: 0.1, total: 0.2 },
      };

      const opportunity2: ArbitrageOpportunity = {
        symbol: 'ETH/USDT',
        buyExchange: 'binance',
        sellExchange: 'kucoin',
        buyPrice: 2000,
        sellPrice: 2020,
        amount: 1,
        profitPercent: 1,
        profitAmount: 20,
        timestamp: Date.now(),
        fees: { buyFee: 0.1, sellFee: 0.1, total: 0.2 },
      };

      // Both should succeed (different symbols)
      const result1 = (strategy as any).tryAcquireTradeLock(opportunity1);
      const result2 = (strategy as any).tryAcquireTradeLock(opportunity2);

      expect(result1).toBe('BTC/USDT-binance-kucoin');
      expect(result2).toBe('ETH/USDT-binance-kucoin');
    });
  });

  describe('releaseTradeLock', () => {
    it('should release lock allowing new acquisition', () => {
      const opportunity: ArbitrageOpportunity = {
        symbol: 'BTC/USDT',
        buyExchange: 'binance',
        sellExchange: 'kucoin',
        buyPrice: 100,
        sellPrice: 101,
        amount: 1,
        profitPercent: 1,
        profitAmount: 1,
        timestamp: Date.now(),
        fees: { buyFee: 0.1, sellFee: 0.1, total: 0.2 },
      };

      // Acquire lock
      const tradeKey = (strategy as any).tryAcquireTradeLock(opportunity);
      expect(tradeKey).toBe('BTC/USDT-binance-kucoin');

      // Duplicate should fail
      expect((strategy as any).tryAcquireTradeLock(opportunity)).toBeNull();

      // Release lock
      (strategy as any).releaseTradeLock(tradeKey);

      // Should be able to acquire again
      const newKey = (strategy as any).tryAcquireTradeLock(opportunity);
      expect(newKey).toBe('BTC/USDT-binance-kucoin');
    });
  });

  describe('concurrent opportunity handling', () => {
    it('should prevent duplicate trade execution for concurrent opportunities', async () => {
      const opportunity: ArbitrageOpportunity = {
        symbol: 'BTC/USDT',
        buyExchange: 'binance',
        sellExchange: 'kucoin',
        buyPrice: 100,
        sellPrice: 101,
        amount: 1,
        profitPercent: 1,
        profitAmount: 1,
        timestamp: Date.now(),
        fees: { buyFee: 0.1, sellFee: 0.1, total: 0.2 },
      };

      // Simulate concurrent lock acquisitions
      const results: (string | null)[] = [];

      // This simulates the race condition scenario:
      // Multiple async operations trying to acquire the same lock
      for (let i = 0; i < 5; i++) {
        results.push((strategy as any).tryAcquireTradeLock(opportunity));
      }

      // Only the first should succeed
      const successfulLocks = results.filter((r) => r !== null);
      expect(successfulLocks.length).toBe(1);
      expect(successfulLocks[0]).toBe('BTC/USDT-binance-kucoin');

      // All others should be blocked
      const blockedAttempts = results.filter((r) => r === null);
      expect(blockedAttempts.length).toBe(4);
    });

    it('should atomically check and add trade key', () => {
      const opportunity: ArbitrageOpportunity = {
        symbol: 'BTC/USDT',
        buyExchange: 'binance',
        sellExchange: 'kucoin',
        buyPrice: 100,
        sellPrice: 101,
        amount: 1,
        profitPercent: 1,
        profitAmount: 1,
        timestamp: Date.now(),
        fees: { buyFee: 0.1, sellFee: 0.1, total: 0.2 },
      };

      // The tryAcquireTradeLock method combines has() and add() in a single
      // synchronous block, preventing race conditions between async operations
      const tradeKey = (strategy as any).tryAcquireTradeLock(opportunity);

      // Verify the key was added atomically
      expect(tradeKey).not.toBeNull();
      expect((strategy as any).activeTrades.has(tradeKey)).toBe(true);

      // Verify duplicate is blocked
      const duplicate = (strategy as any).tryAcquireTradeLock(opportunity);
      expect(duplicate).toBeNull();
    });
  });

  describe('shouldExecuteTrade lock management', () => {
    it('should release lock when balance check fails', async () => {
      // Mock balance check to fail
      mockExchangeManager.getBalance = jest.fn().mockResolvedValue({
        USDT: { free: 0, used: 0, total: 0 },
        BTC: { free: 0, used: 0, total: 0 },
      });

      const opportunity: ArbitrageOpportunity = {
        symbol: 'BTC/USDT',
        buyExchange: 'binance',
        sellExchange: 'kucoin',
        buyPrice: 100,
        sellPrice: 101,
        amount: 1,
        profitPercent: 1,
        profitAmount: 1,
        timestamp: Date.now(),
        fees: { buyFee: 0.1, sellFee: 0.1, total: 0.2 },
      };

      // Call shouldExecuteTrade - should acquire then release lock due to balance failure
      const result = await (strategy as any).shouldExecuteTrade(opportunity);

      expect(result).toBe(false);

      // Lock should be released, allowing new acquisition
      const newLock = (strategy as any).tryAcquireTradeLock(opportunity);
      expect(newLock).not.toBeNull();
    });

    it('should release lock when price validation fails', async () => {
      // Mock good balance
      mockExchangeManager.getBalance = jest.fn().mockResolvedValue({
        USDT: { free: 10000, used: 0, total: 10000 },
        BTC: { free: 10, used: 0, total: 10 },
      });

      // Mock price validation to fail
      mockExchangeManager.getOrderBook = jest.fn().mockResolvedValue({
        asks: [[200, 1]], // Price moved significantly
        bids: [[50, 1]],
      });

      const opportunity: ArbitrageOpportunity = {
        symbol: 'BTC/USDT',
        buyExchange: 'binance',
        sellExchange: 'kucoin',
        buyPrice: 100,
        sellPrice: 101,
        amount: 1,
        profitPercent: 1,
        profitAmount: 1,
        timestamp: Date.now(),
        fees: { buyFee: 0.1, sellFee: 0.1, total: 0.2 },
      };

      const result = await (strategy as any).shouldExecuteTrade(opportunity);

      expect(result).toBe(false);

      // Lock should be released
      const newLock = (strategy as any).tryAcquireTradeLock(opportunity);
      expect(newLock).not.toBeNull();
    });
  });
});
