/**
 * Utility functions for arbitrage calculations and profit analysis
 */

import type { OrderBook } from 'ccxt';
import type { ArbitrageOpportunity, ExchangeId, Symbol } from '@/types';
import { getTradingFee as getDefaultTradingFee } from '@config/exchanges';
import { logger } from '@utils/logger';

/**
 * Fee getter function type - allows injecting custom fee retrieval
 */
export type FeeGetter = (exchangeId: ExchangeId, symbol: string, isMaker: boolean) => number;

/**
 * Clock skew threshold in milliseconds before logging a warning
 */
const CLOCK_SKEW_WARNING_THRESHOLD_MS = 3000; // 3 seconds

/**
 * Calculate the spread between bid and ask prices
 */
export function calculateSpread(bid: number, ask: number): number {
  if (bid <= 0 || ask <= 0) {
    return 0;
  }
  return ((bid - ask) / ask) * 100;
}

/**
 * Calculate potential profit percentage after fees
 */
export function calculateProfitPercent(
  buyPrice: number,
  sellPrice: number,
  buyFee: number,
  sellFee: number
): number {
  if (buyPrice <= 0 || sellPrice <= 0) {
    return 0;
  }

  // Calculate fees for profit calculation
  const grossProfit = sellPrice - buyPrice;
  const netProfit = grossProfit - (buyPrice * buyFee) - (sellPrice * sellFee);
  
  return (netProfit / buyPrice) * 100;
}

/**
 * Calculate absolute profit amount after fees
 */
export function calculateProfitAmount(
  amount: number,
  buyPrice: number,
  sellPrice: number,
  buyFee: number,
  sellFee: number
): number {
  if (amount <= 0 || buyPrice <= 0 || sellPrice <= 0) {
    return 0;
  }

  const buyCost = amount * buyPrice;
  const sellRevenue = amount * sellPrice;
  const totalFees = (buyCost * buyFee) + (sellRevenue * sellFee);
  
  return sellRevenue - buyCost - totalFees;
}

/**
 * Monitor clock skew between local and exchange time
 * Logs a warning if skew exceeds threshold
 */
export function monitorClockSkew(
  exchangeTimestamp: number | undefined,
  exchangeId: ExchangeId
): void {
  if (!exchangeTimestamp) {
    return;
  }

  const localTime = Date.now();
  const skew = Math.abs(localTime - exchangeTimestamp);

  if (skew > CLOCK_SKEW_WARNING_THRESHOLD_MS) {
    logger.warn('Clock skew detected between local and exchange time', {
      exchange: exchangeId,
      localTime,
      exchangeTime: exchangeTimestamp,
      skewMs: skew,
      direction: localTime > exchangeTimestamp ? 'local ahead' : 'local behind',
    });
  }
}

/**
 * Get the exchange timestamp from an order book, with fallback to local time
 * Also monitors clock skew if exchange timestamp is available
 */
export function getExchangeTimestamp(
  orderBook: OrderBook,
  exchangeId: ExchangeId
): number {
  const exchangeTimestamp = orderBook.timestamp;

  if (exchangeTimestamp) {
    monitorClockSkew(exchangeTimestamp, exchangeId);
    return exchangeTimestamp;
  }

  // Fallback to local time if exchange doesn't provide timestamp
  return Date.now();
}

/**
 * Find arbitrage opportunities between order books
 * @param marketData - Array of market data from different exchanges
 * @param minProfitPercent - Minimum profit percentage to consider an opportunity
 * @param maxAmount - Maximum trade amount
 * @param feeGetter - Optional function to get trading fees (defaults to static config fees)
 */
export function findArbitrageOpportunities(
  marketData: Array<{
    exchange: ExchangeId;
    symbol: Symbol;
    orderBook: OrderBook;
  }>,
  minProfitPercent = 0.5,
  maxAmount = 1000,
  feeGetter?: FeeGetter
): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];

  if (marketData.length < 2) {
    return opportunities;
  }

  // Use provided fee getter or fall back to default
  const getFee = feeGetter ?? getDefaultTradingFee;

  // Compare each exchange pair
  for (let i = 0; i < marketData.length; i++) {
    for (let j = i + 1; j < marketData.length; j++) {
      const market1 = marketData[i];
      const market2 = marketData[j];

      if (market1.symbol !== market2.symbol) {
        continue;
      }

      // Check both directions: market1 buy -> market2 sell, and vice versa
      const opp1 = calculateArbitrageOpportunity(
        market1.exchange,
        market2.exchange,
        market1.symbol,
        market1.orderBook,
        market2.orderBook,
        minProfitPercent,
        maxAmount,
        getFee
      );

      const opp2 = calculateArbitrageOpportunity(
        market2.exchange,
        market1.exchange,
        market2.symbol,
        market2.orderBook,
        market1.orderBook,
        minProfitPercent,
        maxAmount,
        getFee
      );

      if (opp1) opportunities.push(opp1);
      if (opp2) opportunities.push(opp2);
    }
  }

  // Sort by profit percentage (descending)
  return opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
}

/**
 * Calculate arbitrage opportunity between two specific exchanges
 */
function calculateArbitrageOpportunity(
  buyExchange: ExchangeId,
  sellExchange: ExchangeId,
  symbol: Symbol,
  buyOrderBook: OrderBook,
  sellOrderBook: OrderBook,
  minProfitPercent: number,
  maxAmount: number,
  getFee: FeeGetter
): ArbitrageOpportunity | null {

  // Get best prices
  const bestAsk = getBestAsk(buyOrderBook);
  const bestBid = getBestBid(sellOrderBook);

  if (!bestAsk || !bestBid || bestAsk.price >= bestBid.price) {
    return null;
  }

  // Calculate fees using the provided fee getter (fetched from exchange or default)
  const buyFee = getFee(buyExchange, symbol, false); // taker fee
  const sellFee = getFee(sellExchange, symbol, false); // taker fee

  // Calculate maximum tradeable amount
  const maxTradeableAmount = Math.min(
    bestAsk.amount,
    bestBid.amount,
    maxAmount
  );

  if (maxTradeableAmount <= 0) {
    return null;
  }

  // Calculate profit
  const profitPercent = calculateProfitPercent(
    bestAsk.price,
    bestBid.price,
    buyFee,
    sellFee
  );

  if (profitPercent < minProfitPercent) {
    return null;
  }

  const profitAmount = calculateProfitAmount(
    maxTradeableAmount,
    bestAsk.price,
    bestBid.price,
    buyFee,
    sellFee
  );

  // Use the oldest exchange timestamp from both order books
  // This ensures we use the most conservative (oldest) data for opportunity age
  const buyTimestamp = getExchangeTimestamp(buyOrderBook, buyExchange);
  const sellTimestamp = getExchangeTimestamp(sellOrderBook, sellExchange);
  const timestamp = Math.min(buyTimestamp, sellTimestamp);

  return {
    symbol,
    buyExchange,
    sellExchange,
    buyPrice: bestAsk.price,
    sellPrice: bestBid.price,
    amount: maxTradeableAmount,
    profitPercent,
    profitAmount,
    timestamp,
    fees: {
      buyFee,
      sellFee,
      total: buyFee + sellFee,
    },
  };
}

/**
 * Get best ask (lowest sell price) from order book
 */
export function getBestAsk(orderBook: OrderBook): { price: number; amount: number } | null {
  if (!orderBook.asks || orderBook.asks.length === 0) {
    return null;
  }

  const [price, amount] = orderBook.asks[0];
  return { price: price || 0, amount: amount || 0 };
}

/**
 * Get best bid (highest buy price) from order book
 */
export function getBestBid(orderBook: OrderBook): { price: number; amount: number } | null {
  if (!orderBook.bids || orderBook.bids.length === 0) {
    return null;
  }

  const [price, amount] = orderBook.bids[0];
  return { price: price || 0, amount: amount || 0 };
}

/**
 * Calculate order book spread (difference between best bid and ask)
 */
export function getOrderBookSpread(orderBook: OrderBook): number {
  const bestBid = getBestBid(orderBook);
  const bestAsk = getBestAsk(orderBook);

  if (!bestBid || !bestAsk) {
    return 0;
  }

  return calculateSpread(bestBid.price, bestAsk.price);
}

/**
 * Calculate weighted average price for a given amount
 */
export function calculateWeightedAveragePrice(
  orders: [number, number][],
  targetAmount: number
): { averagePrice: number; totalAmount: number; totalCost: number } | null {
  
  if (!orders || orders.length === 0 || targetAmount <= 0) {
    return null;
  }

  let remainingAmount = targetAmount;
  let totalCost = 0;
  let totalAmount = 0;

  for (const [price, amount] of orders) {
    if (remainingAmount <= 0) break;

    const tradeAmount = Math.min(remainingAmount, amount);
    totalAmount += tradeAmount;
    totalCost += tradeAmount * price;
    remainingAmount -= tradeAmount;
  }

  if (totalAmount === 0) {
    return null;
  }

  return {
    averagePrice: totalCost / totalAmount,
    totalAmount,
    totalCost,
  };
}

/**
 * Estimate slippage for a trade
 */
export function estimateSlippage(
  orderBook: OrderBook,
  amount: number,
  side: 'buy' | 'sell'
): number {
  const orders = side === 'buy' ? orderBook.asks : orderBook.bids;
  
  if (!orders || orders.length === 0) {
    return 100; // 100% slippage if no orders
  }

  const bestPrice = orders[0][0];
  const weightedAverage = calculateWeightedAveragePrice(orders as [number, number][], amount);

  if (!weightedAverage) {
    return 100;
  }

  const bestPriceValue = bestPrice || 0;
  return Math.abs((weightedAverage.averagePrice - bestPriceValue) / bestPriceValue) * 100;
}

/**
 * Check if an amount is within acceptable slippage limits
 */
export function isSlippageAcceptable(
  orderBook: OrderBook,
  amount: number,
  side: 'buy' | 'sell',
  maxSlippagePercent = 0.1
): boolean {
  const slippage = estimateSlippage(orderBook, amount, side);
  return slippage <= maxSlippagePercent;
}

/**
 * Calculate required balance for an arbitrage trade
 */
export function calculateRequiredBalance(
  opportunity: ArbitrageOpportunity
): { buyExchangeBalance: number; sellExchangeBalance: number } {
  
  const buyAmount = opportunity.amount;
  const sellAmount = opportunity.amount;
  
  const buyExchangeBalance = buyAmount * opportunity.buyPrice * (1 + opportunity.fees.buyFee);
  const sellExchangeBalance = sellAmount;

  return {
    buyExchangeBalance,
    sellExchangeBalance,
  };
}

/**
 * Validate if an arbitrage opportunity is still valid
 * Uses exchange-provided timestamps for accurate age calculation
 *
 * @param opportunity - The arbitrage opportunity to validate
 * @param maxAge - Maximum age in milliseconds (default 5000ms)
 * @param referenceTimestamp - Optional reference timestamp for age calculation.
 *                             If provided, uses this instead of Date.now().
 *                             Useful when validating against exchange time.
 */
export function validateOpportunity(
  opportunity: ArbitrageOpportunity,
  maxAge = 5000, // 5 seconds
  referenceTimestamp?: number
): boolean {
  // Use provided reference timestamp or fall back to local time
  // The opportunity.timestamp is already exchange-based from order book data
  const now = referenceTimestamp ?? Date.now();
  const age = now - opportunity.timestamp;

  if (age > maxAge) {
    return false;
  }

  // Guard against future timestamps (could indicate severe clock skew)
  if (age < 0) {
    logger.warn('Opportunity timestamp is in the future, possible clock skew', {
      opportunityTimestamp: opportunity.timestamp,
      currentTime: now,
      symbol: opportunity.symbol,
    });
    return false;
  }

  if (opportunity.profitPercent <= 0) {
    return false;
  }

  if (opportunity.amount <= 0) {
    return false;
  }

  return !(opportunity.buyPrice <= 0 || opportunity.sellPrice <= 0);
}