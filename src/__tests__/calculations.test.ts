/**
 * Unit tests for calculations.ts utility functions
 */

import type { OrderBook } from 'ccxt';
import type { ArbitrageOpportunity, ExchangeId, Symbol } from '@/types';
import {
  calculateSpread,
  calculateProfitPercent,
  calculateProfitAmount,
  findArbitrageOpportunities,
  getBestAsk,
  getBestBid,
  getOrderBookSpread,
  calculateWeightedAveragePrice,
  estimateSlippage,
  isSlippageAcceptable,
  calculateRequiredBalance,
  validateOpportunity,
} from '@utils/calculations';

// Mock the exchange config module
jest.mock('@config/exchanges', () => ({
  getTradingFee: jest.fn().mockReturnValue(0.001), // 0.1% fee
}));

describe('calculations.ts', () => {
  describe('calculateSpread', () => {
    it('should calculate positive spread correctly', () => {
      const spread = calculateSpread(100, 99);
      expect(spread).toBeCloseTo(1.0101, 4);
    });

    it('should calculate negative spread correctly', () => {
      const spread = calculateSpread(99, 100);
      expect(spread).toBeCloseTo(-1.0, 4);
    });

    it('should return 0 for equal prices', () => {
      const spread = calculateSpread(100, 100);
      expect(spread).toBe(0);
    });

    it('should return 0 when bid is zero', () => {
      expect(calculateSpread(0, 100)).toBe(0);
    });

    it('should return 0 when ask is zero', () => {
      expect(calculateSpread(100, 0)).toBe(0);
    });

    it('should return 0 when both are zero', () => {
      expect(calculateSpread(0, 0)).toBe(0);
    });

    it('should return 0 for negative bid', () => {
      expect(calculateSpread(-10, 100)).toBe(0);
    });

    it('should return 0 for negative ask', () => {
      expect(calculateSpread(100, -10)).toBe(0);
    });
  });

  describe('calculateProfitPercent', () => {
    it('should calculate profit percentage with fees', () => {
      const profit = calculateProfitPercent(100, 102, 0.001, 0.001);
      // grossProfit = 2, netProfit = 2 - 0.1 - 0.102 = 1.798
      // profitPercent = 1.798 / 100 * 100 = 1.798%
      expect(profit).toBeCloseTo(1.798, 3);
    });

    it('should return negative profit when sell price is lower', () => {
      const profit = calculateProfitPercent(100, 98, 0.001, 0.001);
      expect(profit).toBeLessThan(0);
    });

    it('should return 0 for zero buy price', () => {
      expect(calculateProfitPercent(0, 100, 0.001, 0.001)).toBe(0);
    });

    it('should return 0 for zero sell price', () => {
      expect(calculateProfitPercent(100, 0, 0.001, 0.001)).toBe(0);
    });

    it('should return 0 when both prices are zero', () => {
      expect(calculateProfitPercent(0, 0, 0.001, 0.001)).toBe(0);
    });

    it('should handle zero fees', () => {
      const profit = calculateProfitPercent(100, 105, 0, 0);
      expect(profit).toBe(5);
    });

    it('should handle high fees that eliminate profit', () => {
      const profit = calculateProfitPercent(100, 102, 0.05, 0.05);
      expect(profit).toBeLessThan(0);
    });
  });

  describe('calculateProfitAmount', () => {
    it('should calculate profit amount correctly', () => {
      const profit = calculateProfitAmount(10, 100, 102, 0.001, 0.001);
      // buyCost = 1000, sellRevenue = 1020, totalFees = 1 + 1.02 = 2.02
      // profit = 1020 - 1000 - 2.02 = 17.98
      expect(profit).toBeCloseTo(17.98, 2);
    });

    it('should return negative profit when losing money', () => {
      const profit = calculateProfitAmount(10, 100, 98, 0.001, 0.001);
      expect(profit).toBeLessThan(0);
    });

    it('should return 0 for zero amount', () => {
      expect(calculateProfitAmount(0, 100, 102, 0.001, 0.001)).toBe(0);
    });

    it('should return 0 for zero buy price', () => {
      expect(calculateProfitAmount(10, 0, 102, 0.001, 0.001)).toBe(0);
    });

    it('should return 0 for zero sell price', () => {
      expect(calculateProfitAmount(10, 100, 0, 0.001, 0.001)).toBe(0);
    });

    it('should return 0 for negative amount', () => {
      expect(calculateProfitAmount(-10, 100, 102, 0.001, 0.001)).toBe(0);
    });
  });

  describe('getBestAsk', () => {
    it('should return best ask from order book', () => {
      const orderBook: OrderBook = {
        asks: [[100.5, 10], [101, 20], [102, 30]],
        bids: [[99.5, 10]],
        symbol: 'BTC/USDT',
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
        nonce: 1,
      };
      const result = getBestAsk(orderBook);
      expect(result).toEqual({ price: 100.5, amount: 10 });
    });

    it('should return null for empty asks', () => {
      const orderBook: OrderBook = {
        asks: [],
        bids: [[99.5, 10]],
        symbol: 'BTC/USDT',
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
        nonce: 1,
      };
      expect(getBestAsk(orderBook)).toBeNull();
    });

    it('should return null for undefined asks', () => {
      const orderBook = {
        bids: [[99.5, 10]],
        symbol: 'BTC/USDT',
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
        nonce: 1,
      } as OrderBook;
      expect(getBestAsk(orderBook)).toBeNull();
    });

    it('should handle price or amount being 0', () => {
      const orderBook: OrderBook = {
        asks: [[0, 0]],
        bids: [],
        symbol: 'BTC/USDT',
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
        nonce: 1,
      };
      const result = getBestAsk(orderBook);
      expect(result).toEqual({ price: 0, amount: 0 });
    });
  });

  describe('getBestBid', () => {
    it('should return best bid from order book', () => {
      const orderBook: OrderBook = {
        asks: [[100.5, 10]],
        bids: [[99.5, 10], [99, 20], [98, 30]],
        symbol: 'BTC/USDT',
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
        nonce: 1,
      };
      const result = getBestBid(orderBook);
      expect(result).toEqual({ price: 99.5, amount: 10 });
    });

    it('should return null for empty bids', () => {
      const orderBook: OrderBook = {
        asks: [[100.5, 10]],
        bids: [],
        symbol: 'BTC/USDT',
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
        nonce: 1,
      };
      expect(getBestBid(orderBook)).toBeNull();
    });

    it('should return null for undefined bids', () => {
      const orderBook = {
        asks: [[100.5, 10]],
        symbol: 'BTC/USDT',
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
        nonce: 1,
      } as OrderBook;
      expect(getBestBid(orderBook)).toBeNull();
    });
  });

  describe('getOrderBookSpread', () => {
    it('should calculate order book spread correctly', () => {
      const orderBook: OrderBook = {
        asks: [[100, 10]],
        bids: [[99, 10]],
        symbol: 'BTC/USDT',
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
        nonce: 1,
      };
      const spread = getOrderBookSpread(orderBook);
      expect(spread).toBeCloseTo(-1.0, 4);
    });

    it('should return 0 when no bids', () => {
      const orderBook: OrderBook = {
        asks: [[100, 10]],
        bids: [],
        symbol: 'BTC/USDT',
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
        nonce: 1,
      };
      expect(getOrderBookSpread(orderBook)).toBe(0);
    });

    it('should return 0 when no asks', () => {
      const orderBook: OrderBook = {
        asks: [],
        bids: [[99, 10]],
        symbol: 'BTC/USDT',
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
        nonce: 1,
      };
      expect(getOrderBookSpread(orderBook)).toBe(0);
    });
  });

  describe('calculateWeightedAveragePrice', () => {
    it('should calculate weighted average for single order', () => {
      const orders: [number, number][] = [[100, 10]];
      const result = calculateWeightedAveragePrice(orders, 5);
      expect(result).toEqual({
        averagePrice: 100,
        totalAmount: 5,
        totalCost: 500,
      });
    });

    it('should calculate weighted average across multiple orders', () => {
      const orders: [number, number][] = [[100, 5], [101, 5], [102, 5]];
      const result = calculateWeightedAveragePrice(orders, 10);
      // First 5 at 100 = 500, second 5 at 101 = 505
      // Average = 1005 / 10 = 100.5
      expect(result).toEqual({
        averagePrice: 100.5,
        totalAmount: 10,
        totalCost: 1005,
      });
    });

    it('should handle partial fill of last order', () => {
      const orders: [number, number][] = [[100, 10], [101, 10]];
      const result = calculateWeightedAveragePrice(orders, 15);
      // First 10 at 100 = 1000, next 5 at 101 = 505
      // Average = 1505 / 15 = 100.33...
      expect(result?.averagePrice).toBeCloseTo(100.333, 2);
      expect(result?.totalAmount).toBe(15);
      expect(result?.totalCost).toBe(1505);
    });

    it('should return null for empty orders', () => {
      expect(calculateWeightedAveragePrice([], 10)).toBeNull();
    });

    it('should return null for zero target amount', () => {
      const orders: [number, number][] = [[100, 10]];
      expect(calculateWeightedAveragePrice(orders, 0)).toBeNull();
    });

    it('should return null for negative target amount', () => {
      const orders: [number, number][] = [[100, 10]];
      expect(calculateWeightedAveragePrice(orders, -5)).toBeNull();
    });

    it('should handle target amount exceeding available liquidity', () => {
      const orders: [number, number][] = [[100, 5], [101, 5]];
      const result = calculateWeightedAveragePrice(orders, 20);
      expect(result?.totalAmount).toBe(10);
      expect(result?.averagePrice).toBeCloseTo(100.5, 2);
    });
  });

  describe('estimateSlippage', () => {
    it('should return 0 slippage when order fits in first level', () => {
      const orderBook: OrderBook = {
        asks: [[100, 100]],
        bids: [[99, 100]],
        symbol: 'BTC/USDT',
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
        nonce: 1,
      };
      const slippage = estimateSlippage(orderBook, 10, 'buy');
      expect(slippage).toBe(0);
    });

    it('should calculate slippage for buy orders', () => {
      const orderBook: OrderBook = {
        asks: [[100, 10], [101, 10], [102, 10]],
        bids: [[99, 10]],
        symbol: 'BTC/USDT',
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
        nonce: 1,
      };
      const slippage = estimateSlippage(orderBook, 20, 'buy');
      // Average price = (100*10 + 101*10) / 20 = 100.5
      // Slippage = |100.5 - 100| / 100 * 100 = 0.5%
      expect(slippage).toBeCloseTo(0.5, 2);
    });

    it('should calculate slippage for sell orders', () => {
      const orderBook: OrderBook = {
        asks: [[100, 10]],
        bids: [[99, 10], [98, 10], [97, 10]],
        symbol: 'BTC/USDT',
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
        nonce: 1,
      };
      const slippage = estimateSlippage(orderBook, 20, 'sell');
      // Average price = (99*10 + 98*10) / 20 = 98.5
      // Slippage = |98.5 - 99| / 99 * 100 = 0.505%
      expect(slippage).toBeCloseTo(0.505, 2);
    });

    it('should return 100% slippage for empty order book', () => {
      const orderBook: OrderBook = {
        asks: [],
        bids: [],
        symbol: 'BTC/USDT',
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
        nonce: 1,
      };
      expect(estimateSlippage(orderBook, 10, 'buy')).toBe(100);
      expect(estimateSlippage(orderBook, 10, 'sell')).toBe(100);
    });
  });

  describe('isSlippageAcceptable', () => {
    const createOrderBook = (asks: [number, number][], bids: [number, number][]): OrderBook => ({
      asks,
      bids,
      symbol: 'BTC/USDT',
      timestamp: Date.now(),
      datetime: new Date().toISOString(),
      nonce: 1,
    });

    it('should return true when slippage is within limit', () => {
      const orderBook = createOrderBook([[100, 100]], [[99, 100]]);
      expect(isSlippageAcceptable(orderBook, 10, 'buy', 0.1)).toBe(true);
    });

    it('should return false when slippage exceeds limit', () => {
      const orderBook = createOrderBook([[100, 5], [110, 5]], [[99, 10]]);
      expect(isSlippageAcceptable(orderBook, 10, 'buy', 0.1)).toBe(false);
    });

    it('should use default max slippage of 0.1%', () => {
      const orderBook = createOrderBook([[100, 100]], [[99, 100]]);
      expect(isSlippageAcceptable(orderBook, 10, 'buy')).toBe(true);
    });
  });

  describe('calculateRequiredBalance', () => {
    it('should calculate required balances for arbitrage', () => {
      const opportunity: ArbitrageOpportunity = {
        symbol: 'BTC/USDT',
        buyExchange: 'binance' as ExchangeId,
        sellExchange: 'kucoin' as ExchangeId,
        buyPrice: 100,
        sellPrice: 102,
        amount: 10,
        profitPercent: 1.8,
        profitAmount: 18,
        timestamp: Date.now(),
        fees: {
          buyFee: 0.001,
          sellFee: 0.001,
          total: 0.002,
        },
      };

      const result = calculateRequiredBalance(opportunity);

      // buyExchangeBalance = 10 * 100 * 1.001 = 1001
      expect(result.buyExchangeBalance).toBeCloseTo(1001, 2);
      // sellExchangeBalance = 10 (base currency)
      expect(result.sellExchangeBalance).toBe(10);
    });
  });

  describe('validateOpportunity', () => {
    const createOpportunity = (overrides: Partial<ArbitrageOpportunity> = {}): ArbitrageOpportunity => ({
      symbol: 'BTC/USDT',
      buyExchange: 'binance' as ExchangeId,
      sellExchange: 'kucoin' as ExchangeId,
      buyPrice: 100,
      sellPrice: 102,
      amount: 10,
      profitPercent: 1.8,
      profitAmount: 18,
      timestamp: Date.now(),
      fees: {
        buyFee: 0.001,
        sellFee: 0.001,
        total: 0.002,
      },
      ...overrides,
    });

    it('should return true for valid opportunity', () => {
      const opportunity = createOpportunity();
      expect(validateOpportunity(opportunity)).toBe(true);
    });

    it('should return false for expired opportunity', () => {
      const opportunity = createOpportunity({ timestamp: Date.now() - 10000 });
      expect(validateOpportunity(opportunity, 5000)).toBe(false);
    });

    it('should return false for zero profit', () => {
      const opportunity = createOpportunity({ profitPercent: 0 });
      expect(validateOpportunity(opportunity)).toBe(false);
    });

    it('should return false for negative profit', () => {
      const opportunity = createOpportunity({ profitPercent: -1 });
      expect(validateOpportunity(opportunity)).toBe(false);
    });

    it('should return false for zero amount', () => {
      const opportunity = createOpportunity({ amount: 0 });
      expect(validateOpportunity(opportunity)).toBe(false);
    });

    it('should return false for negative amount', () => {
      const opportunity = createOpportunity({ amount: -10 });
      expect(validateOpportunity(opportunity)).toBe(false);
    });

    it('should return false for zero buy price', () => {
      const opportunity = createOpportunity({ buyPrice: 0 });
      expect(validateOpportunity(opportunity)).toBe(false);
    });

    it('should return false for zero sell price', () => {
      const opportunity = createOpportunity({ sellPrice: 0 });
      expect(validateOpportunity(opportunity)).toBe(false);
    });

    it('should return false for negative buy price', () => {
      const opportunity = createOpportunity({ buyPrice: -100 });
      expect(validateOpportunity(opportunity)).toBe(false);
    });

    it('should use default max age of 5000ms', () => {
      const opportunity = createOpportunity({ timestamp: Date.now() - 4000 });
      expect(validateOpportunity(opportunity)).toBe(true);

      const expiredOpportunity = createOpportunity({ timestamp: Date.now() - 6000 });
      expect(validateOpportunity(expiredOpportunity)).toBe(false);
    });
  });

  describe('findArbitrageOpportunities', () => {
    const createMarketData = (
      exchange: ExchangeId,
      symbol: Symbol,
      askPrice: number,
      askAmount: number,
      bidPrice: number,
      bidAmount: number
    ) => ({
      exchange,
      symbol,
      orderBook: {
        asks: [[askPrice, askAmount]] as [number, number][],
        bids: [[bidPrice, bidAmount]] as [number, number][],
        symbol,
        timestamp: Date.now(),
        datetime: new Date().toISOString(),
        nonce: 1,
      } as OrderBook,
    });

    it('should return empty array with less than 2 exchanges', () => {
      const marketData = [createMarketData('binance', 'BTC/USDT', 100, 10, 99, 10)];
      const opportunities = findArbitrageOpportunities(marketData);
      expect(opportunities).toEqual([]);
    });

    it('should find arbitrage opportunity between exchanges', () => {
      // Buy on binance at 100, sell on kucoin at 103
      const marketData = [
        createMarketData('binance', 'BTC/USDT', 100, 10, 99, 10),
        createMarketData('kucoin', 'BTC/USDT', 104, 10, 103, 10),
      ];

      const opportunities = findArbitrageOpportunities(marketData, 0.5, 1000);
      expect(opportunities.length).toBeGreaterThan(0);
      expect(opportunities[0].buyExchange).toBe('binance');
      expect(opportunities[0].sellExchange).toBe('kucoin');
      expect(opportunities[0].profitPercent).toBeGreaterThan(0);
    });

    it('should not find opportunity when prices do not allow profit', () => {
      // Same prices on both exchanges
      const marketData = [
        createMarketData('binance', 'BTC/USDT', 100, 10, 99, 10),
        createMarketData('kucoin', 'BTC/USDT', 100, 10, 99, 10),
      ];

      const opportunities = findArbitrageOpportunities(marketData, 0.5, 1000);
      expect(opportunities.length).toBe(0);
    });

    it('should filter by minimum profit percent', () => {
      const marketData = [
        createMarketData('binance', 'BTC/USDT', 100, 10, 99, 10),
        createMarketData('kucoin', 'BTC/USDT', 101.5, 10, 100.5, 10),
      ];

      // High minimum should filter out the opportunity
      const opportunities = findArbitrageOpportunities(marketData, 5, 1000);
      expect(opportunities.length).toBe(0);
    });

    it('should limit trade amount', () => {
      const marketData = [
        createMarketData('binance', 'BTC/USDT', 100, 100, 99, 100),
        createMarketData('kucoin', 'BTC/USDT', 104, 100, 103, 100),
      ];

      const opportunities = findArbitrageOpportunities(marketData, 0.1, 50);
      if (opportunities.length > 0) {
        expect(opportunities[0].amount).toBeLessThanOrEqual(50);
      }
    });

    it('should sort opportunities by profit descending', () => {
      const marketData = [
        createMarketData('binance', 'BTC/USDT', 100, 10, 99, 10),
        createMarketData('kucoin', 'BTC/USDT', 104, 10, 103, 10),
        createMarketData('okx', 'BTC/USDT', 106, 10, 105, 10),
      ];

      const opportunities = findArbitrageOpportunities(marketData, 0.1, 1000);

      if (opportunities.length >= 2) {
        for (let i = 1; i < opportunities.length; i++) {
          expect(opportunities[i - 1].profitPercent).toBeGreaterThanOrEqual(
            opportunities[i].profitPercent
          );
        }
      }
    });

    it('should skip different symbols', () => {
      const marketData = [
        createMarketData('binance', 'BTC/USDT', 100, 10, 99, 10),
        createMarketData('kucoin', 'ETH/USDT', 104, 10, 103, 10),
      ];

      const opportunities = findArbitrageOpportunities(marketData, 0.1, 1000);
      expect(opportunities.length).toBe(0);
    });
  });
});
