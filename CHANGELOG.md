# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add file-based trade state persistence to prevent state loss on restart
- Recover in-progress trades from persistent storage on startup
- Detect and alert on orphaned trades (older than 24 hours)
- Clear logging of state recovery process during startup
- Add order cancellation during graceful shutdown to prevent orphaned orders on exchanges
- Add configurable shutdown behavior via `SHUTDOWN_BEHAVIOR` env var (cancel/wait/force)
- Add `cancelOrder`, `fetchOpenOrders`, and `cancelAllOrders` methods to ExchangeManager
- Add pending order tracking in SimpleArbitrage strategy
- Custom WebSocket rate limiter with token bucket algorithm for CCXT Pro connections
- Exponential backoff strategy when rate limit errors (429) are received from exchanges
- Rate limiter stats logging (requests per window, rate limit errors, throttle status)
- Per-exchange rate limit configuration support via environment variables
- Add unit test coverage for core utility modules (`calculations.ts` and `helpers.ts`)
- Add integration tests for `SimpleArbitrage` strategy with mocked exchange data
- Create `src/__tests__/` directory structure for organized test files
- Configure Jest coverage thresholds (90%+ for calculations.ts, 85%+ for helpers.ts)
- Add `@types/jest` dev dependency for TypeScript test support

### Fixed

- Fix CCXT Pro WebSocket bypassing rate limiting causing IP bans
- Enforce maxConcurrentTrades configuration limit to prevent unlimited concurrent trade execution
- Fix price validation tolerance being too loose causing systematic profit erosion by making tolerance configurable and adding profit-aware validation
- Add order book depth limits for all supported exchanges (Binance, OKX, Kraken) in ExchangeManager
- Automatically cap depth requests to exchange maximum with warning log when exceeded
- Validate trade amounts against minimum trade amount using `getMinTradeAmount()` during opportunity validation to prevent order rejections
- Reconnection logic now uses exponential backoff (5s, 10s, 20s, 40s...) with a maximum cap of 5 minutes to prevent request storms during extended outages
- Fetch trading fees from exchange API on startup instead of using hardcoded defaults
- Add periodic fee refresh (every 24 hours) to catch tier changes from trading volume
- Fall back to conservative default fees with warning if API fetch fails
- Prevent duplicate order fills from retry logic by implementing idempotency keys (clientOrderId) for order submissions
- Add timeout-aware order verification that checks for existing orders before marking submission as failed
- Remove retry wrapper from trade execution to prevent cascading multiple fills when combined with CCXT internal retries
- Fix stale balance data between validation and order execution by re-verifying balance immediately before order submission
- Add balance reservation system to lock/reserve funds during execution window and prevent concurrent use
- Fix race condition in activeTrades Set allowing duplicate trade execution by making check-and-add atomic
- Use exchange-provided timestamps for arbitrage opportunity age validation instead of local clock to prevent trading on stale data when clock skew exists
- Validate order book data freshness using exchange timestamps to prevent trading on stale prices
- Reject order book data older than configurable threshold (default 500ms) with warning logs
- Add order book staleness metrics tracking (total/stale updates, data age statistics)
- Fix race condition in concurrent order execution that could cause naked short positions by executing buy order before sell order
- Add partial fill threshold validation (default 95%) to reject trades with insufficient fill and prevent position mismatch
- Adjust sell order amount to match actual buy fill amount for partial fills above threshold

### Added

- Add configurable price tolerance settings: `SIMPLE_ARBITRAGE_PRICE_TOLERANCE`, `SIMPLE_ARBITRAGE_MAX_PROFIT_EROSION`, `SIMPLE_ARBITRAGE_DYNAMIC_TOLERANCE`
- Add profit-aware price validation that rejects trades when price variance would consume too much expected profit
- Add price variance tracking and statistics for monitoring actual vs expected profit variance
- Add clock skew monitoring between local and exchange time with warning logs when skew exceeds 3 seconds

### Changed

- Remove unused `_isBuy` parameter from `calculateWeightedAveragePrice` function in `src/utils/calculations.ts`
- Replace `console.warn` with Winston logger in config module for consistent logging
- Add deferred warning queue pattern to handle circular dependency between config and logger modules
- Improve type safety by replacing `any` types with proper type definitions
- Add `CurrencyBalance` interface for CCXT balance currency objects
- Add `SimpleArbitrageStatus` interface for strategy-specific status
- Replace `any[]` with `unknown[]` in generic function signatures (`debounce`, `throttle`)
- Use CCXT `ConstructorArgs` type for exchange initialization options
- Remove `@ts-ignore` comments with type-safe dynamic exchange access

### Security
- Fixed high severity vulnerability in glob 10.2.0-10.4.5 (command injection via `-c/--cmd`)
- Fixed moderate severity vulnerability in js-yaml (prototype pollution in merge)
