# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

```bash
# Development
npm run dev              # Start with ts-node
npm run dev:watch        # Start with nodemon hot reload
LOG_LEVEL=debug npm run dev  # Enable debug logging

# Build & Production
npm run build            # Compile TypeScript (runs clean first)
npm start                # Run compiled code (uses tsconfig.runtime.json for path aliases)
npm run clean            # Remove dist/

# Code Quality
npm run lint             # Check for issues
npm run lint:fix         # Auto-fix issues

# Testing
npm test                 # Run all tests
npm test -- --testPathPattern="<pattern>"  # Run specific test file
npm test -- --watch      # Watch mode
```

**Node.js requirement:** >=18.0.0

**ESLint note:** Uses legacy `.eslintrc.js` with ESLint 9. The `ESLINT_USE_FLAT_CONFIG=false` flag is baked into the npm scripts.

## Project Architecture

**Cryptocurrency arbitrage bot** using TypeScript and CCXT with an event-driven, modular design.

### Data Flow
1. `CryptoArbitrageBot` (src/main.ts) initializes `ExchangeManager` and strategies
2. `ExchangeManager` connects to exchanges via CCXT Pro (WebSocket) or falls back to REST
3. Strategies subscribe to order book updates and emit opportunities
4. Trades execute sequentially (buy first, then sell) to avoid naked short positions
5. Trade state persists to `data/trade-state.json` for crash recovery

### Key Components
- **CryptoArbitrageBot** (src/main.ts): Orchestrates lifecycle, sets up event listeners, handles graceful shutdown
- **ExchangeManager** (src/exchanges/ExchangeManager.ts): CCXT wrapper with WebSocket subscriptions, reconnection logic, fee caching (24h TTL), balance reservation system, duplicate order prevention, and exchange-specific order book limits
- **BaseStrategy** (src/strategies/IStrategy.ts): Abstract class providing lifecycle management, opportunity recording, and status tracking
- **StrategyFactory** (src/strategies/IStrategy.ts): Registry pattern for creating strategy instances
- **RateLimiter** (src/exchanges/RateLimiter.ts): Token bucket per exchange with exponential backoff. Exists as a standalone module but is not wired into ExchangeManager — CCXT's built-in `enableRateLimit: true` handles REST rate limiting
- **TradeStatePersistence** (src/utils/TradeStatePersistence.ts): File-based persistence tracking trades through `pending` → `buy_executed` → `completed`/`failed`. Recovers active trades on startup; flags orphans (>24h old)

### Strategy Implementation
Strategies extend `BaseStrategy` and implement:
- `onStart()`: Subscribe to order books, start monitoring loop
- `onStop()`: Clean up intervals, wait for active trades
- `shouldProcessOpportunity()`: Validate symbol, profit threshold, trade amount

Current strategy: `SimpleArbitrage` — registered under both `'simple-arbitrage'` and `'simpleArbitrage'` aliases in `src/strategies/index.ts`.

### TypeScript Path Aliases
```typescript
import { CONFIG } from '@/config';        // src/config
import { ExchangeManager } from '@exchanges/ExchangeManager';  // src/exchanges
import { logger } from '@utils/logger';   // src/utils
import type { ArbitrageOpportunity } from '@/types';  // src/types
```

Path aliases resolve via `tsconfig.json` (baseUrl: `./src`) for dev and `tsconfig.runtime.json` (baseUrl: `./dist`) for production. Jest mirrors these in `moduleNameMapper` in `jest.config.js`.

### TypeScript Strictness
The compiler has `exactOptionalPropertyTypes: true` — you cannot assign `undefined` to optional properties; you must omit the key entirely. Also enforces `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`.

## Configuration

### Critical: Test Mode
`TEST_MODE=true` is the default and **must** be explicitly disabled for live trading. When enabled, exchanges use sandbox/testnet APIs.

### Environment Variables
See `.env.example` for full list. Key variables:
- `ENABLED_EXCHANGES`: Comma-separated (binance, kucoin, okx, bybit, kraken)
- `TRADING_SYMBOLS`: Trading pairs (e.g., XRP/USDT,BTC/USDT)
- `SIMPLE_ARBITRAGE_MIN_PROFIT`: Minimum profit % to trigger trade
- `SIMPLE_ARBITRAGE_MAX_TRADE_AMOUNT`: Position size limit
- `LOG_LEVEL`: error, warn, info, debug
- `ORDER_BOOK_STALENESS_THRESHOLD_MS`: Order book age threshold (default 500ms)

### Exchange Credentials
Pattern: `{EXCHANGE}_API_KEY`, `{EXCHANGE}_SECRET`, `{EXCHANGE}_PASSWORD` (if required, e.g., KuCoin)

### Exchange Constants
`src/config/exchanges.ts` defines per-exchange defaults: `DEFAULT_TRADING_FEES`, `DEFAULT_RATE_LIMITS`, `DEFAULT_TIMEOUTS`, `TESTNET_URLS`, `MIN_TRADE_AMOUNTS` (per symbol). These are the fallback when exchange API calls fail.

## Testing

Tests live in `src/__tests__/`. The test setup (`src/__tests__/setup.ts`) sets `NODE_ENV=test`, `TEST_MODE=true`, `LOG_LEVEL=error`, and suppresses all console output.

Jest enforces per-file coverage thresholds:
- `src/utils/calculations.ts`: 90% branches/lines/statements, 100% functions
- `src/utils/helpers.ts`: 85% branches, 90% lines/statements, 100% functions

## Logging

Winston-based with outputs:
- Console: Colored, human-readable
- `logs/app.log`: All logs (JSON)
- `logs/error.log`: Errors only
- `logs/exceptions.log`: Uncaught exceptions
- `logs/rejections.log`: Unhandled promise rejections

Specialized loggers:
- `logger`: General application logging
- `TradeLogger`: Trade execution events (static methods)
- `performanceLogger`: Operation timing with `performanceLogger.time(name, asyncFn)`
- `createChildLogger(name)`: Scoped child loggers

## Adding New Strategies

1. Create class extending `BaseStrategy` in `src/strategies/`
2. Implement `onStart()` and `onStop()` methods
3. Register with `StrategyFactory.register('name', StrategyClass)` in `src/strategies/index.ts`
4. Add environment config in `src/config/index.ts`

## Adding New Exchanges

1. Verify CCXT support and check if Pro (WebSocket) version exists
2. Add exchange ID to `ExchangeId` type in `src/types/index.ts`
3. Update `getExchangeCompatibleLimit()` in ExchangeManager if exchange has non-standard order book limits. Existing limits: KuCoin `[5,20,50,100]`, Bybit `[1,50,200,1000]`, Binance `[5,10,20,50,100,500,1000,5000]`, OKX `[1,5,40,100,400]`, Kraken `[10,25,100,500,1000]`
4. Add default fees, rate limits, and testnet URLs to `src/config/exchanges.ts`
5. Add credentials pattern to `.env.example`

## Important Patterns

### Concurrency Safety
- **Trade locking**: `tryAcquireTradeLock()` uses synchronous `Set.has()` + `Set.add()` (Node.js single-threaded guarantee) to prevent concurrent trades on the same symbol/exchange pair
- **Balance reservation**: `ExchangeManager.reserveBalance()` / `releaseReservation()` with 60s auto-cleanup prevents double-spending across concurrent trades
- **Duplicate order prevention**: `clientOrderId` + `recentOrders` Map (60s TTL) detects retried orders that already submitted

### Error Handling
All async operations use try/catch with `logger.error()`. Strategies track last 10 errors in status.

### Event Emission
Components emit typed events (`opportunity_found`, `execution_completed`, `exchangeError`) for loose coupling. Use `this.emit()` for strategy events.

### Graceful Shutdown
SIGINT/SIGTERM handlers stop strategies, wait for active trades (configurable: `cancel`/`wait`/`force`), then close exchange connections.

### Config Circular Dependency
`src/config/index.ts` uses a `deferredWarnings` queue to avoid the circular `config → logger → config` dependency. Warnings are flushed asynchronously after the logger module loads.
