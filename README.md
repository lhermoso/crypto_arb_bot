# 🚀 Crypto Arbitrage Bot

A professional-grade TypeScript cryptocurrency arbitrage trading bot built with CCXT. This bot monitors order books across multiple exchanges for arbitrage opportunities and executes trades automatically.

## ⚠️ Important Disclaimer

**This software is for educational purposes only. Cryptocurrency trading involves substantial risk of loss. Use at your own risk. Always start with testnet/sandbox environments and small amounts.**

## 🌟 Features

- **Multi-Exchange Support**: Binance, KuCoin, OKX, Bybit, Kraken
- **Real-time Monitoring**: WebSocket order book streams via CCXT Pro
- **Smart Arbitrage Detection**: Cross-exchange price difference analysis
- **Risk Management**: Slippage protection, balance validation, position limits
- **Robust Architecture**: TypeScript, modular design, comprehensive error handling
- **Extensive Logging**: Winston-based structured logging
- **Test Mode**: Safe testing with sandbox/testnet APIs
- **Scalable Design**: Easy to add new strategies and exchanges

## 📁 Project Structure

```
crypto-arb-bot/
├── src/
│   ├── config/          # Configuration management
│   ├── exchanges/       # Exchange manager and types
│   ├── strategies/      # Trading strategies
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Utility functions
│   └── main.ts          # Application entry point
├── logs/                # Log files (created automatically)
├── .env.example         # Environment variables template
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
└── README.md           # This file
```

## 🛠 Installation

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn
- Exchange API keys (testnet recommended for initial testing)

### Setup

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/lhermoso/crypto_arb_bot.git
   cd crypto-arb-bot
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and settings
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

## ⚙️ Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

#### Essential Settings
```bash
# SAFETY FIRST - Always start with test mode!
TEST_MODE=true

# Exchanges to use
ENABLED_EXCHANGES=binance,kucoin

# Trading pairs
TRADING_SYMBOLS=XRP/USDT,BTC/USDT

# API Credentials (use testnet initially)
BINANCE_API_KEY=your_key
BINANCE_SECRET=your_secret
KUCOIN_API_KEY=your_key
KUCOIN_SECRET=your_secret
KUCOIN_PASSWORD=your_passphrase
```

#### Strategy Configuration
```bash
# Simple arbitrage settings
SIMPLE_ARBITRAGE_MIN_PROFIT=0.5    # Minimum 0.5% profit
SIMPLE_ARBITRAGE_MAX_TRADE_AMOUNT=100  # Max $100 per trade
SIMPLE_ARBITRAGE_CHECK_INTERVAL=5000   # Check every 5 seconds
```

### Exchange Setup

#### Binance
1. Create account at [Binance](https://www.binance.com)
2. For testing: Use [Binance Testnet](https://testnet.binance.vision/)
3. Generate API keys with trading permissions
4. Add keys to `.env` file

#### KuCoin
1. Create account at [KuCoin](https://www.kucoin.com)
2. For testing: Use [KuCoin Sandbox](https://sandbox.kucoin.com/)
3. Generate API keys with trading permissions
4. **Important**: KuCoin requires a passphrase

#### Other Exchanges
See `.env.example` for configuration examples for OKX, Bybit, and Kraken.

## 🚀 Usage

### Development Mode
```bash
# Start with hot reload
npm run dev

# Or watch mode
npm run dev:watch
```

### Production Mode
```bash
# Build and start
npm run build
npm start
```

### Testing
```bash
# Run tests (when implemented)
npm test

# Lint code
npm run lint
```

## 📊 Strategy Overview

### Simple Arbitrage Strategy

The bot implements a simple cross-exchange arbitrage strategy:

1. **Market Data Collection**: Continuously monitors order books across exchanges
2. **Opportunity Detection**: Identifies price differences above the minimum profit threshold
3. **Validation**: Checks balances, slippage, and price validity
4. **Execution**: Simultaneously places buy order on low-price exchange and sell order on high-price exchange
5. **Monitoring**: Tracks execution results and calculates actual profit

#### Key Parameters

- **Minimum Profit**: Percentage profit required after fees
- **Maximum Trade Amount**: Position size limit per trade
- **Slippage Tolerance**: Maximum acceptable slippage
- **Balance Reserve**: Percentage of balance to keep unused

## 🔧 Advanced Configuration

### Adding New Exchanges

1. Ensure the exchange is supported by CCXT
2. Add exchange configuration to `config/exchanges.ts`
3. Update environment variables
4. Test thoroughly in sandbox mode

### Creating New Strategies

1. Implement the `IStrategy` interface
2. Extend `BaseStrategy` for common functionality
3. Register with `StrategyFactory`
4. Configure in environment variables

### Monitoring and Logging

The bot provides comprehensive logging:

- **Console**: Real-time colored output
- **Files**: Structured JSON logs in `logs/` directory
- **Performance**: Execution timing and metrics
- **Trading**: Detailed trade execution logs

## 📈 Performance Considerations

### Latency Optimization
- Use WebSocket connections (CCXT Pro)
- Host close to exchange servers
- Optimize network configuration

### Risk Management
- Start with small amounts
- Monitor for unusual market conditions
- Set appropriate balance reserves
- Use stop-loss mechanisms

### Monitoring
- Watch log files for errors
- Monitor trade success rates
- Track actual vs expected profits
- Set up alerting for issues

## 🛡️ Security Best Practices

### API Key Security
- Never commit `.env` files
- Use testnet keys for development
- Restrict API key permissions
- Rotate keys regularly

### Trading Limits
- Set conservative position sizes
- Maintain balance reserves
- Monitor exchange rate limits
- Use separate trading accounts

## 🐛 Troubleshooting

### Common Issues

#### Connection Problems
```bash
# Check exchange status
curl -s https://api.binance.com/api/v3/ping

# Verify API keys
# Check logs for authentication errors
```

#### Trading Failures
- Verify sufficient balances
- Check trading permissions
- Validate symbol formats
- Review minimum trade amounts

#### Performance Issues
- Monitor CPU and memory usage
- Check network latency
- Review log files for bottlenecks
- Consider reducing check intervals

### Debug Mode
```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev
```

## 📝 Logging

### Log Levels
- **ERROR**: Critical errors requiring attention
- **WARN**: Warning conditions
- **INFO**: General information (default)
- **DEBUG**: Detailed debugging information

### Log Files
- `logs/app.log`: All application logs
- `logs/error.log`: Error-level logs only
- `logs/exceptions.log`: Uncaught exceptions
- `logs/rejections.log`: Unhandled promise rejections

## 🔄 Development

### Code Structure

The codebase follows clean architecture principles:

- **Types**: Central type definitions
- **Config**: Environment-based configuration
- **Exchanges**: CCXT integration and WebSocket handling
- **Strategies**: Pluggable trading algorithms
- **Utils**: Shared utilities and helpers

### Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

### Testing

```bash
# Unit tests
npm test

# Integration tests (requires test environment)
npm run test:integration

# Coverage report
npm run test:coverage
```

## 📊 Monitoring Dashboard

The bot can be extended with monitoring capabilities:

- Prometheus metrics endpoint
- Health check endpoint
- Real-time profit tracking
- Alert integration (Discord, Slack, Email)

## 🔮 Future Enhancements

### Planned Features
- [ ] Triangular arbitrage strategy
- [ ] Statistical arbitrage
- [ ] Machine learning price prediction
- [ ] Web-based dashboard
- [ ] Database integration
- [ ] Backtesting framework
- [ ] Portfolio rebalancing

### Integration Options
- [ ] Telegram bot notifications
- [ ] REST API for external control
- [ ] GraphQL interface
- [ ] Docker containerization
- [ ] Kubernetes deployment

## 📜 License

MIT License - see LICENSE file for details.

## ⚠️ Risk Warning

**Cryptocurrency trading involves substantial risk of loss and is not suitable for all investors. The use of this software is at your own risk. The authors and contributors are not responsible for any financial losses incurred through the use of this software.**

### Important Notes:
1. **Start with testnet/sandbox environments**
2. **Use small amounts initially**
3. **Understand exchange fees and limits**
4. **Monitor your bot continuously**
5. **Be aware of market volatility**
6. **Consider tax implications**
7. **Keep your API keys secure**

## 📞 Support

For issues and questions:
1. Check the troubleshooting section
2. Review log files for error details
3. Open an issue on GitHub
4. Consult CCXT documentation for exchange-specific issues

---

**Happy Trading! 🎯**

*Remember: The best strategy is often the one that loses money the slowest. Trade responsibly!*
