# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Development Workflow
```bash
# Start development server with hot reload
npm run dev

# Start with nodemon watching for changes
npm run dev:watch

# Build the project
npm run build

# Run in production
npm start

# Clean build artifacts
npm run clean
```

### Code Quality
```bash
# Lint TypeScript files
npm run lint

# Fix linting issues automatically
npm run lint:fix

# Run tests
npm test
```

### Environment Setup
```bash
# Copy environment template and configure
cp .env.example .env
# Edit .env with your API keys and settings
```

## Project Architecture

### Core Architecture Pattern
This is a **cryptocurrency arbitrage trading bot** built with TypeScript and CCXT. The architecture follows a **modular, event-driven design** with clear separation of concerns:

- **Main Orchestrator** (`src/main.ts`): Coordinates the entire application lifecycle
- **Exchange Manager** (`src/exchanges/`): Handles CCXT integration and WebSocket connections
- **Strategy System** (`src/strategies/`): Pluggable trading algorithms with base interface
- **Configuration Management** (`src/config/`): Environment-based settings with validation
- **Utilities** (`src/utils/`): Shared functions for calculations, logging, and helpers

### Key Design Patterns
1. **Strategy Pattern**: All trading strategies implement `IStrategy` interface
2. **Factory Pattern**: `StrategyFactory` creates strategy instances
3. **Event-Driven**: Extensive use of EventEmitter for loose coupling
4. **Dependency Injection**: Components receive dependencies via constructor

### Module Organization
```
src/
├── config/           # Environment configuration and validation
├── exchanges/        # CCXT integration, WebSocket management
├── strategies/       # Trading algorithms (Simple Arbitrage, etc.)
├── types/           # TypeScript interfaces and type definitions
├── utils/           # Shared utilities (calculations, logging, helpers)
└── main.ts          # Application entry point and orchestration
```

## TypeScript Configuration

### Path Mapping
The project uses TypeScript path aliases for clean imports:
- `@/*` → `src/*`
- `@config/*` → `src/config/*`
- `@exchanges/*` → `src/exchanges/*`
- `@strategies/*` → `src/strategies/*`
- `@utils/*` → `src/utils/*`
- `@types/*` → `src/types/*`

### Strict Configuration
TypeScript is configured with strict settings including:
- `strict: true`
- `noImplicitAny: true`
- `strictNullChecks: true`
- `noImplicitReturns: true`
- `noUnusedLocals: true`

## Key Technologies & Dependencies

### Runtime Dependencies
- **ccxt**: Cryptocurrency exchange API integration (supports both regular and Pro WebSocket versions)
- **winston**: Structured logging with multiple transports
- **dotenv**: Environment variable management

### Development Dependencies
- **TypeScript**: Primary language with strict configuration
- **ESLint**: Code linting with TypeScript rules
- **Jest**: Testing framework with TypeScript support
- **ts-node**: Development runtime
- **nodemon**: Hot reload for development

## Testing Strategy
- **Jest** configuration with TypeScript support
- Module name mapping matches TypeScript paths
- Test files: `**/*.test.ts` and `**/*.spec.ts`
- Setup file: `src/__tests__/setup.ts`
- Coverage collection configured for all source files

## Environment Configuration

### Safety-First Approach
- `TEST_MODE=true` by default (CRITICAL for safety)
- Comprehensive `.env.example` with detailed comments
- Multiple exchange support with testnet/sandbox options

### Key Environment Variables
- `TEST_MODE`: Safety switch for live trading
- `ENABLED_EXCHANGES`: Comma-separated list of exchanges
- `TRADING_SYMBOLS`: Trading pairs to monitor
- Exchange-specific API credentials
- Strategy parameters (profit thresholds, trade amounts, etc.)

## Logging System

### Multi-Level Logging
- **winston** with structured JSON logging
- Console output with colors for development
- File logging for production
- Separate log categories: app.log, error.log, exceptions.log

### Specialized Loggers
- `TradeLogger`: Trade execution and opportunities
- `performanceLogger`: Timing and performance metrics
- Standard logger for general application events

## Critical Development Guidelines

### Safety Requirements
1. **ALWAYS start with `TEST_MODE=true`**
2. **Use testnet/sandbox APIs initially**
3. **Never commit API keys or .env files**
4. **Start with small trade amounts**

### Code Patterns
1. **Error Handling**: Extensive try/catch with proper logging
2. **Async/Await**: Consistent async patterns throughout
3. **Type Safety**: Strong typing with interfaces for all data structures
4. **Event Emission**: Components emit events for monitoring and debugging

### Testing Requirements
- When adding new exchanges: Test in sandbox mode first
- When modifying strategies: Validate with paper trading
- When changing risk parameters: Review impact on position sizing
- Always run `npm run lint` before committing

## Exchange Integration

### CCXT Integration Pattern
- Attempts CCXT Pro (WebSocket) first, falls back to regular CCXT
- Capability detection for each exchange
- Automatic reconnection handling
- Rate limiting and error management

### Supported Exchanges
- Binance (with testnet support)
- KuCoin (with sandbox support)
- OKX, Bybit, Kraken (configurable)

## Strategy Development

### Base Strategy Pattern
All strategies extend `BaseStrategy` which provides:
- Common lifecycle management
- Event emission
- Error tracking
- Status reporting
- Configuration updates

### Simple Arbitrage Implementation
Current implementation monitors cross-exchange price differences:
- Real-time order book monitoring
- Profit calculation after fees
- Balance validation before execution
- Slippage protection
- Concurrent trade execution

## Performance Considerations

### Latency Optimization
- WebSocket connections via CCXT Pro
- Concurrent API calls with Promise.all()
- Efficient order book management
- Performance timing instrumentation

### Memory Management
- Proper cleanup in shutdown handlers
- EventEmitter listener limits
- Market data caching with age limits

## Security & Risk Management

### API Security
- Environment-based credential management
- Sandbox mode support
- Rate limiting configuration
- Permission validation

### Trading Risk Controls
- Position size limits
- Balance reserves
- Slippage protection
- Circuit breakers for errors
- Opportunity age validation

This architecture prioritizes safety, modularity, and extensibility while maintaining high performance for real-time arbitrage trading.