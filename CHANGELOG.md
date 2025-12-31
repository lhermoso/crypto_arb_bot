# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Fix race condition in concurrent order execution that could cause naked short positions by executing buy order before sell order
- Add partial fill threshold validation (default 95%) to reject trades with insufficient fill and prevent position mismatch
- Adjust sell order amount to match actual buy fill amount for partial fills above threshold

### Changed

- Remove unused `_isBuy` parameter from `calculateWeightedAveragePrice` function in `src/utils/calculations.ts`
- Replace `console.warn` with Winston logger in config module for consistent logging
- Add deferred warning queue pattern to handle circular dependency between config and logger modules

### Security
- Fixed high severity vulnerability in glob 10.2.0-10.4.5 (command injection via `-c/--cmd`)
- Fixed moderate severity vulnerability in js-yaml (prototype pollution in merge)
