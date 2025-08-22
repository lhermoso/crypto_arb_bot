/**
 * Strategy exports and factory registration
 */

export { IStrategy, BaseStrategy, StrategyFactory, StrategyStatus } from './IStrategy';
export { SimpleArbitrage } from './SimpleArbitrage';

// Register all strategies with the factory
import { StrategyFactory } from './IStrategy';
import { SimpleArbitrage } from './SimpleArbitrage';

// Register strategies
StrategyFactory.register('simple-arbitrage', SimpleArbitrage);
StrategyFactory.register('simpleArbitrage', SimpleArbitrage); // Alternative name

// Export factory for convenience
export { StrategyFactory as Factory };