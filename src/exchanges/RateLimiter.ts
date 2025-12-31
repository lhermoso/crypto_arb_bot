/**
 * Custom rate limiter for WebSocket connections
 * CCXT Pro (WebSocket) does not honor rateLimit/enableRateLimit options,
 * so we implement our own rate limiting with token bucket algorithm
 */

import { EventEmitter } from 'events';
import { logger } from '@utils/logger';
import type { ExchangeId } from '@/types';

/**
 * Rate limiter configuration per exchange
 */
export interface RateLimiterConfig {
  /** Maximum requests per window (token bucket capacity) */
  maxRequests: number;
  /** Time window in milliseconds for rate limit */
  windowMs: number;
  /** Initial backoff delay in milliseconds */
  initialBackoffMs: number;
  /** Maximum backoff delay in milliseconds */
  maxBackoffMs: number;
  /** Backoff multiplier for exponential growth */
  backoffMultiplier: number;
}

/**
 * Request statistics for monitoring
 */
export interface RateLimiterStats {
  exchange: ExchangeId;
  totalRequests: number;
  requestsInWindow: number;
  rateLimitErrors: number;
  currentBackoffMs: number;
  isThrottled: boolean;
  lastRequestTime: number;
  windowStartTime: number;
}

/**
 * Default rate limiter configurations per exchange
 * Values are conservative to prevent IP bans
 */
export const DEFAULT_RATE_LIMITER_CONFIGS: Record<ExchangeId, RateLimiterConfig> = {
  binance: {
    maxRequests: 1200,     // 1200 per minute
    windowMs: 60000,       // 1 minute
    initialBackoffMs: 1000,
    maxBackoffMs: 60000,
    backoffMultiplier: 2,
  },
  kucoin: {
    maxRequests: 1800,     // 1800 per minute
    windowMs: 60000,
    initialBackoffMs: 1000,
    maxBackoffMs: 60000,
    backoffMultiplier: 2,
  },
  okx: {
    maxRequests: 600,      // 600 per minute (more conservative)
    windowMs: 60000,
    initialBackoffMs: 1000,
    maxBackoffMs: 60000,
    backoffMultiplier: 2,
  },
  bybit: {
    maxRequests: 600,      // 600 per minute
    windowMs: 60000,
    initialBackoffMs: 1000,
    maxBackoffMs: 60000,
    backoffMultiplier: 2,
  },
  kraken: {
    maxRequests: 300,      // 300 per minute (more restrictive)
    windowMs: 60000,
    initialBackoffMs: 2000,
    maxBackoffMs: 120000,
    backoffMultiplier: 2,
  },
};

/**
 * Token bucket state for an exchange
 */
interface TokenBucket {
  tokens: number;
  lastRefill: number;
  totalRequests: number;
  rateLimitErrors: number;
  currentBackoffMs: number;
  backoffUntil: number;
}

/**
 * WebSocket Rate Limiter
 * Implements token bucket algorithm with exponential backoff
 */
export class WebSocketRateLimiter extends EventEmitter {
  private buckets = new Map<ExchangeId, TokenBucket>();
  private configs = new Map<ExchangeId, RateLimiterConfig>();
  private statsLogInterval: NodeJS.Timeout | null = null;
  private readonly statsLogIntervalMs = 60000; // Log stats every minute

  constructor() {
    super();
  }

  /**
   * Initialize rate limiter for an exchange
   */
  initialize(exchangeId: ExchangeId, customConfig?: Partial<RateLimiterConfig>): void {
    const defaultConfig = DEFAULT_RATE_LIMITER_CONFIGS[exchangeId];
    const config: RateLimiterConfig = {
      ...defaultConfig,
      ...customConfig,
    };

    this.configs.set(exchangeId, config);

    this.buckets.set(exchangeId, {
      tokens: config.maxRequests,
      lastRefill: Date.now(),
      totalRequests: 0,
      rateLimitErrors: 0,
      currentBackoffMs: config.initialBackoffMs,
      backoffUntil: 0,
    });

    logger.debug(`Rate limiter initialized for ${exchangeId}`, {
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
    });
  }

  /**
   * Start periodic stats logging
   */
  startStatsLogging(): void {
    if (this.statsLogInterval) return;

    this.statsLogInterval = setInterval(() => {
      this.logAllStats();
    }, this.statsLogIntervalMs);

    logger.info('Rate limiter stats logging started');
  }

  /**
   * Stop periodic stats logging
   */
  stopStatsLogging(): void {
    if (this.statsLogInterval) {
      clearInterval(this.statsLogInterval);
      this.statsLogInterval = null;
      logger.info('Rate limiter stats logging stopped');
    }
  }

  /**
   * Log stats for all exchanges
   */
  private logAllStats(): void {
    for (const exchangeId of this.buckets.keys()) {
      const stats = this.getStats(exchangeId);
      if (stats) {
        logger.info(`Rate limiter stats for ${exchangeId}`, {
          totalRequests: stats.totalRequests,
          requestsInWindow: stats.requestsInWindow,
          rateLimitErrors: stats.rateLimitErrors,
          isThrottled: stats.isThrottled,
          currentBackoffMs: stats.currentBackoffMs,
        });
      }
    }
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refillTokens(exchangeId: ExchangeId): void {
    const bucket = this.buckets.get(exchangeId);
    const config = this.configs.get(exchangeId);

    if (!bucket || !config) return;

    const now = Date.now();
    const elapsed = now - bucket.lastRefill;

    // Calculate tokens to add based on elapsed time
    const tokensToAdd = Math.floor((elapsed / config.windowMs) * config.maxRequests);

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(config.maxRequests, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }
  }

  /**
   * Check if a request can be made (non-blocking check)
   */
  canMakeRequest(exchangeId: ExchangeId): boolean {
    const bucket = this.buckets.get(exchangeId);
    if (!bucket) {
      logger.warn(`Rate limiter not initialized for ${exchangeId}`);
      return true; // Allow if not configured
    }

    // Check if in backoff period
    if (Date.now() < bucket.backoffUntil) {
      return false;
    }

    this.refillTokens(exchangeId);
    return bucket.tokens > 0;
  }

  /**
   * Wait until a request can be made (blocking)
   */
  async waitForPermit(exchangeId: ExchangeId): Promise<void> {
    const bucket = this.buckets.get(exchangeId);
    const config = this.configs.get(exchangeId);

    if (!bucket || !config) {
      logger.warn(`Rate limiter not initialized for ${exchangeId}`);
      return;
    }

    // Wait for backoff to expire
    const now = Date.now();
    if (now < bucket.backoffUntil) {
      const waitTime = bucket.backoffUntil - now;
      logger.debug(`Rate limiter: waiting ${waitTime}ms for backoff on ${exchangeId}`);
      await this.sleep(waitTime);
    }

    // Wait for token availability
    while (!this.canMakeRequest(exchangeId)) {
      const waitTime = Math.min(100, config.windowMs / config.maxRequests);
      await this.sleep(waitTime);
    }
  }

  /**
   * Record a request (consume a token)
   */
  recordRequest(exchangeId: ExchangeId): void {
    const bucket = this.buckets.get(exchangeId);
    if (!bucket) return;

    this.refillTokens(exchangeId);

    if (bucket.tokens > 0) {
      bucket.tokens--;
    }

    bucket.totalRequests++;

    // Emit event for monitoring
    this.emit('request', {
      exchange: exchangeId,
      remainingTokens: bucket.tokens,
      totalRequests: bucket.totalRequests,
    });
  }

  /**
   * Record a rate limit error and trigger backoff
   */
  recordRateLimitError(exchangeId: ExchangeId): void {
    const bucket = this.buckets.get(exchangeId);
    const config = this.configs.get(exchangeId);

    if (!bucket || !config) return;

    bucket.rateLimitErrors++;

    // Apply exponential backoff
    bucket.backoffUntil = Date.now() + bucket.currentBackoffMs;

    logger.warn(`Rate limit error on ${exchangeId}, backing off for ${bucket.currentBackoffMs}ms`, {
      rateLimitErrors: bucket.rateLimitErrors,
      backoffMs: bucket.currentBackoffMs,
    });

    // Increase backoff for next error
    bucket.currentBackoffMs = Math.min(
      config.maxBackoffMs,
      bucket.currentBackoffMs * config.backoffMultiplier
    );

    // Emit event for monitoring
    this.emit('rateLimitError', {
      exchange: exchangeId,
      backoffMs: bucket.currentBackoffMs,
      rateLimitErrors: bucket.rateLimitErrors,
    });
  }

  /**
   * Reset backoff after successful requests
   */
  resetBackoff(exchangeId: ExchangeId): void {
    const bucket = this.buckets.get(exchangeId);
    const config = this.configs.get(exchangeId);

    if (!bucket || !config) return;

    bucket.currentBackoffMs = config.initialBackoffMs;
    bucket.backoffUntil = 0;
  }

  /**
   * Get current stats for an exchange
   */
  getStats(exchangeId: ExchangeId): RateLimiterStats | null {
    const bucket = this.buckets.get(exchangeId);
    const config = this.configs.get(exchangeId);

    if (!bucket || !config) return null;

    this.refillTokens(exchangeId);

    return {
      exchange: exchangeId,
      totalRequests: bucket.totalRequests,
      requestsInWindow: config.maxRequests - bucket.tokens,
      rateLimitErrors: bucket.rateLimitErrors,
      currentBackoffMs: bucket.currentBackoffMs,
      isThrottled: Date.now() < bucket.backoffUntil || bucket.tokens <= 0,
      lastRequestTime: bucket.lastRefill,
      windowStartTime: bucket.lastRefill,
    };
  }

  /**
   * Get stats for all exchanges
   */
  getAllStats(): RateLimiterStats[] {
    const stats: RateLimiterStats[] = [];
    for (const exchangeId of this.buckets.keys()) {
      const exchangeStats = this.getStats(exchangeId);
      if (exchangeStats) {
        stats.push(exchangeStats);
      }
    }
    return stats;
  }

  /**
   * Check if exchange is rate limited (429 error detection)
   */
  isRateLimitError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('429') ||
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('request rate') ||
      message.includes('exceeded') ||
      message.includes('throttl')
    );
  }

  /**
   * Cleanup resources
   */
  shutdown(): void {
    this.stopStatsLogging();
    this.buckets.clear();
    this.configs.clear();
    this.removeAllListeners();
    logger.info('Rate limiter shutdown complete');
  }

  /**
   * Helper sleep function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Singleton rate limiter instance
 */
export const rateLimiter = new WebSocketRateLimiter();
