/**
 * Trade State Persistence
 *
 * Provides file-based persistence for trade state to prevent data loss on restart.
 * Handles saving, loading, and recovery of in-progress trades.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ArbitrageOpportunity, TradeResult, ExchangeId, Symbol } from '@/types';
import { logger } from '@utils/logger';

/**
 * Represents an active trade that is being persisted
 */
export interface PersistedTrade {
  tradeKey: string;
  opportunity: ArbitrageOpportunity;
  status: 'pending' | 'buy_executed' | 'completed' | 'failed';
  buyResult?: TradeResult;
  sellResult?: TradeResult;
  startedAt: number;
  updatedAt: number;
}

/**
 * State file structure
 */
interface PersistedState {
  version: number;
  lastUpdated: number;
  activeTrades: Record<string, PersistedTrade>;
}

const STATE_VERSION = 1;
const DEFAULT_STATE_FILE = 'data/trade-state.json';
const ORPHAN_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Trade State Persistence Manager
 */
export class TradeStatePersistence {
  private stateFilePath: string;
  private state: PersistedState;
  private saveDebounceTimer?: NodeJS.Timeout;

  constructor(stateFilePath?: string) {
    this.stateFilePath = stateFilePath || path.resolve(process.cwd(), DEFAULT_STATE_FILE);
    this.state = this.createEmptyState();
  }

  /**
   * Initialize the persistence manager - must be called before use
   */
  async initialize(): Promise<void> {
    await this.ensureDataDirectory();
    await this.loadState();
  }

  /**
   * Create an empty state object
   */
  private createEmptyState(): PersistedState {
    return {
      version: STATE_VERSION,
      lastUpdated: Date.now(),
      activeTrades: {},
    };
  }

  /**
   * Ensure the data directory exists
   */
  private async ensureDataDirectory(): Promise<void> {
    const dir = path.dirname(this.stateFilePath);
    try {
      await fs.promises.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory may already exist
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        logger.error('Failed to create data directory', { dir, error });
        throw error;
      }
    }
  }

  /**
   * Load state from file
   */
  private async loadState(): Promise<void> {
    try {
      const data = await fs.promises.readFile(this.stateFilePath, 'utf-8');
      const parsed = JSON.parse(data) as PersistedState;

      if (parsed.version !== STATE_VERSION) {
        logger.warn('State file version mismatch, starting fresh', {
          fileVersion: parsed.version,
          expectedVersion: STATE_VERSION,
        });
        this.state = this.createEmptyState();
        return;
      }

      this.state = parsed;
      logger.info('Trade state loaded from disk', {
        activeTrades: Object.keys(this.state.activeTrades).length,
        lastUpdated: new Date(this.state.lastUpdated).toISOString(),
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info('No existing state file found, starting fresh');
        this.state = this.createEmptyState();
      } else {
        logger.error('Failed to load state file', { error });
        this.state = this.createEmptyState();
      }
    }
  }

  /**
   * Force immediate save (for critical operations)
   */
  async forceSave(): Promise<void> {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = undefined as unknown as NodeJS.Timeout;
    }

    try {
      this.state.lastUpdated = Date.now();
      const data = JSON.stringify(this.state, null, 2);
      await fs.promises.writeFile(this.stateFilePath, data, 'utf-8');
      logger.debug('Trade state force-saved to disk');
    } catch (error) {
      logger.error('Failed to force-save state file', { error });
      throw error;
    }
  }

  /**
   * Generate a trade key from opportunity details
   */
  static generateTradeKey(
    symbol: Symbol,
    buyExchange: ExchangeId,
    sellExchange: ExchangeId
  ): string {
    return `${symbol}-${buyExchange}-${sellExchange}`;
  }

  /**
   * Record a new trade before execution begins
   */
  async recordTradeStart(opportunity: ArbitrageOpportunity): Promise<string> {
    const tradeKey = TradeStatePersistence.generateTradeKey(
      opportunity.symbol,
      opportunity.buyExchange,
      opportunity.sellExchange
    );

    const trade: PersistedTrade = {
      tradeKey,
      opportunity,
      status: 'pending',
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.state.activeTrades[tradeKey] = trade;
    await this.forceSave(); // Force save for critical state change

    logger.info('Trade start recorded', {
      tradeKey,
      symbol: opportunity.symbol,
      buyExchange: opportunity.buyExchange,
      sellExchange: opportunity.sellExchange,
    });

    return tradeKey;
  }

  /**
   * Update trade after buy order execution
   */
  async recordBuyExecuted(tradeKey: string, buyResult: TradeResult): Promise<void> {
    const trade = this.state.activeTrades[tradeKey];
    if (!trade) {
      logger.warn('Attempted to update non-existent trade', { tradeKey });
      return;
    }

    trade.status = 'buy_executed';
    trade.buyResult = buyResult;
    trade.updatedAt = Date.now();

    await this.forceSave(); // Force save - critical state

    logger.info('Buy execution recorded', {
      tradeKey,
      success: buyResult.success,
      filled: buyResult.filled,
    });
  }

  /**
   * Record trade completion (success or failure)
   */
  async recordTradeComplete(
    tradeKey: string,
    success: boolean,
    sellResult?: TradeResult
  ): Promise<void> {
    const trade = this.state.activeTrades[tradeKey];
    if (!trade) {
      logger.warn('Attempted to complete non-existent trade', { tradeKey });
      return;
    }

    trade.status = success ? 'completed' : 'failed';
    if (sellResult) {
      trade.sellResult = sellResult;
    }
    trade.updatedAt = Date.now();

    // Remove completed trades from active state
    delete this.state.activeTrades[tradeKey];
    await this.forceSave();

    logger.info('Trade completion recorded', {
      tradeKey,
      success,
      duration: trade.updatedAt - trade.startedAt,
    });
  }

  /**
   * Check if a trade is currently active
   */
  isTradeActive(tradeKey: string): boolean {
    return tradeKey in this.state.activeTrades;
  }

  /**
   * Get all active trade keys
   */
  getActiveTradeKeys(): Set<string> {
    return new Set(Object.keys(this.state.activeTrades));
  }

  /**
   * Get a specific active trade
   */
  getActiveTrade(tradeKey: string): PersistedTrade | undefined {
    return this.state.activeTrades[tradeKey];
  }

  /**
   * Get all active trades
   */
  getAllActiveTrades(): PersistedTrade[] {
    return Object.values(this.state.activeTrades);
  }

  /**
   * Detect and return orphaned trades (trades that have been pending too long)
   */
  detectOrphanedTrades(thresholdMs: number = ORPHAN_THRESHOLD_MS): PersistedTrade[] {
    const now = Date.now();
    const orphaned: PersistedTrade[] = [];

    for (const trade of Object.values(this.state.activeTrades)) {
      const age = now - trade.startedAt;
      if (age > thresholdMs) {
        orphaned.push(trade);
      }
    }

    return orphaned;
  }

  /**
   * Recover state on startup and report any issues
   */
  async recoverState(): Promise<{
    recoveredTrades: PersistedTrade[];
    orphanedTrades: PersistedTrade[];
  }> {
    const allTrades = this.getAllActiveTrades();
    const orphanedTrades = this.detectOrphanedTrades();
    const recoveredTrades = allTrades.filter(
      (trade) => !orphanedTrades.includes(trade)
    );

    if (allTrades.length > 0) {
      logger.info('State recovery summary', {
        totalTrades: allTrades.length,
        recoveredTrades: recoveredTrades.length,
        orphanedTrades: orphanedTrades.length,
      });
    }

    // Log details for each recovered trade
    for (const trade of recoveredTrades) {
      logger.info('Recovered in-progress trade', {
        tradeKey: trade.tradeKey,
        status: trade.status,
        symbol: trade.opportunity.symbol,
        buyExchange: trade.opportunity.buyExchange,
        sellExchange: trade.opportunity.sellExchange,
        startedAt: new Date(trade.startedAt).toISOString(),
        hasBuyResult: !!trade.buyResult,
      });
    }

    // Alert for orphaned trades
    for (const trade of orphanedTrades) {
      const ageHours = (Date.now() - trade.startedAt) / (1000 * 60 * 60);
      logger.warn('ORPHANED TRADE DETECTED - Manual intervention may be required', {
        tradeKey: trade.tradeKey,
        status: trade.status,
        symbol: trade.opportunity.symbol,
        buyExchange: trade.opportunity.buyExchange,
        sellExchange: trade.opportunity.sellExchange,
        startedAt: new Date(trade.startedAt).toISOString(),
        ageHours: ageHours.toFixed(2),
        hasBuyResult: !!trade.buyResult,
        buyFilled: trade.buyResult?.filled,
      });
    }

    return { recoveredTrades, orphanedTrades };
  }

  /**
   * Mark an orphaned trade as acknowledged (removes from active state)
   */
  async acknowledgeOrphanedTrade(tradeKey: string): Promise<void> {
    const trade = this.state.activeTrades[tradeKey];
    if (!trade) {
      logger.warn('Attempted to acknowledge non-existent trade', { tradeKey });
      return;
    }

    logger.info('Orphaned trade acknowledged and removed', {
      tradeKey,
      status: trade.status,
    });

    delete this.state.activeTrades[tradeKey];
    await this.forceSave();
  }

  /**
   * Clear all state (for testing or manual reset)
   */
  async clearState(): Promise<void> {
    this.state = this.createEmptyState();
    await this.forceSave();
    logger.info('Trade state cleared');
  }

  /**
   * Get state file path (for testing)
   */
  getStateFilePath(): string {
    return this.stateFilePath;
  }
}

// Export singleton instance for convenience
let defaultInstance: TradeStatePersistence | null = null;

export function getTradeStatePersistence(): TradeStatePersistence {
  if (!defaultInstance) {
    defaultInstance = new TradeStatePersistence();
  }
  return defaultInstance;
}

export function resetTradeStatePersistence(): void {
  defaultInstance = null;
}
