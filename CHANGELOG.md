# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Enforce maxConcurrentTrades configuration limit to prevent unlimited concurrent trade execution
- Fix price validation tolerance being too loose causing systematic profit erosion by making tolerance configurable and adding profit-aware validation
- Add order book depth limits for all supported exchanges (Binance, OKX, Kraken) in ExchangeManager
- Automatically cap depth requests to exchange maximum with warning log when exceeded
- Fix race condition in concurrent order execution that could cause naked short positions by executing buy order before sell order
- Add partial fill threshold validation (default 95%) to reject trades with insufficient fill and prevent position mismatch
- Adjust sell order amount to match actual buy fill amount for partial fills above threshold

### Added

- Add configurable price tolerance settings: `SIMPLE_ARBITRAGE_PRICE_TOLERANCE`, `SIMPLE_ARBITRAGE_MAX_PROFIT_EROSION`, `SIMPLE_ARBITRAGE_DYNAMIC_TOLERANCE`
- Add profit-aware price validation that rejects trades when price variance would consume too much expected profit
- Add price variance tracking and statistics for monitoring actual vs expected profit variance

### Changed

- Remove unused `_isBuy` parameter from `calculateWeightedAveragePrice` function in `src/utils/calculations.ts`
- Replace `console.warn` with Winston logger in config module for consistent logging
- Add deferred warning queue pattern to handle circular dependency between config and logger modules

### Security
- Fixed high severity vulnerability in glob 10.2.0-10.4.5 (command injection via `-c/--cmd`)
- Fixed moderate severity vulnerability in js-yaml (prototype pollution in merge)
