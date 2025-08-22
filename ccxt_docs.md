========================
CODE SNIPPETS
========================
TITLE: CCXT Library Documentation Overview
DESCRIPTION: This section provides an overview of the CCXT library's documentation, covering installation, usage examples, manual, CCXT Pro features, contribution guidelines, supported exchanges, API specifications, FAQs, and changelogs.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: markdown
CODE:
```
# CCXT Documentation
  * [Install](https://docs.ccxt.com/#/Install "Install")
  * [Examples](https://docs.ccxt.com/#/Examples "Examples")
  * [Manual](https://docs.ccxt.com/#/README "Manual")
  * [CCXT Pro](https://docs.ccxt.com/#/ccxt.pro.manual "CCXT Pro")
  * [Contributing](https://docs.ccxt.com/#/CONTRIBUTING "Contributing")
  * [Supported Exchanges](https://docs.ccxt.com/#/Exchange-Markets "Supported Exchanges")
  * [Exchanges By Country](https://docs.ccxt.com/#/Exchange-Markets-By-Country "Exchanges By Country")
  * [API Spec By Method](https://docs.ccxt.com/#/baseSpec "API Spec By Method")
  * [FAQ](https://docs.ccxt.com/#/FAQ "FAQ")
  * [Changelog](https://docs.ccxt.com/#/CHANGELOG "Changelog")
  * [Awesome](https://docs.ccxt.com/#/Awesome "Awesome")
```

----------------------------------------

TITLE: Load Markets and Access Market Data
DESCRIPTION: Demonstrates how to load exchange markets, retrieve market structures by symbol or ID, and access currency information. Includes examples for getting market IDs and listing all symbols.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: javascript
CODE:
```
(async () => {

    console.log (await exchange.loadMarkets ())

    let btcusd1 = exchange.markets['BTC/USD']     // get market structure by symbol
    let btcusd2 = exchange.market ('BTC/USD')     // same result in a slightly different way

    let btcusdId = exchange.marketId ('BTC/USD')  // get market id by symbol

    let symbols = exchange.symbols                // get an array of symbols
    let symbols2 = Object.keys (exchange.markets) // same as previous line

    console.log (exchange.id, symbols)            // print all symbols

    let currencies = exchange.currencies          // a dictionary of currencies

    let bitfinex = new ccxt.bitfinex ()
    await bitfinex.loadMarkets ()

    bitfinex.markets['BTC/USD']                   // symbol → market (get market by symbol)
    bitfinex.markets_by_id['XRPBTC'][0]           // id → market (get market by id)

    bitfinex.markets['BTC/USD']['id']             // symbol → id (get id by symbol)
    bitfinex.markets_by_id['XRPBTC'][0]['symbol'] // id → symbol (get symbol by id)

}) ()
```

LANGUAGE: python
CODE:
```
print(exchange.load_markets())

etheur1 = exchange.markets['ETH/EUR']         # get market structure by symbol
etheur2 = exchange.market('ETH/EUR')          # same result in a slightly different way

etheurId = exchange.market_id('ETH/EUR')      # get market id by symbol

symbols = exchange.symbols                    # get a list of symbols
symbols2 = list(exchange.markets.keys())      # same as previous line

print(exchange.id, symbols)                   # print all symbols

currencies = exchange.currencies              # a dictionary of currencies

kraken = ccxt.kraken()
kraken.load_markets()

kraken.markets['BTC/USD']                     # symbol → market (get market by symbol)
kraken.markets_by_id['XXRPZUSD'][0]           # id → market (get market by id)

kraken.markets['BTC/USD']['id']               # symbol → id (get id by symbol)
kraken.markets_by_id['XXRPZUSD'][0]['symbol'] # id → symbol (get symbol by id)
```

LANGUAGE: php
CODE:
```
$var_dump($exchange->load_markets());

$dashcny1 = $exchange->markets['DASH/CNY'];        // get market structure by symbol
$dashcny2 = $exchange->market('DASH/CNY');         // same result in a slightly different way

$dashcnyId = $exchange->market_id('DASH/CNY');     // get market id by symbol

$symbols = $exchange->symbols;                     // get an array of symbols
$symbols2 = array_keys($exchange->markets);        // same as previous line

var_dump($exchange->id, $symbols);                 // print all symbols

$currencies = $exchange->currencies;               // an associative array of currencies

$okcoin = '\ccxt\okcoin';
$okcoin = new $okcoin();

$okcoin->load_markets();

$okcoin->markets['BTC/USD'];                    // symbol → market (get market by symbol)
$okcoin->markets_by_id['btc_usd'][0];              // id → market (get market by id)

$okcoin->markets['BTC/USD']['id'];              // symbol → id (get id by symbol)
$okcoin->markets_by_id['btc_usd'][0]['symbol']; // id → symbol (get symbol by id)
```

----------------------------------------

TITLE: CCXT Pagination Examples
DESCRIPTION: Illustrates how to use pagination parameters with CCXT's `fetch_trades` and `fetch_ohlcv` methods. Examples cover dynamic/time-based pagination, deterministic pagination with a call limit, cursor-based pagination, and customizing entries per request.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: python
CODE:
```
trades = await binance.fetch_trades("BTC/USDT", params = {"paginate": True}) # dynamic/time-based
ohlc = await binance.fetch_ohlcv("BTC/USDT", params = {"paginate": True, "paginationCalls": 5}) # deterministic-pagination will perform 5 requests
trades = await binance.fetch_trades("BTC/USDT", since = 1664812416000, params = {"paginate": True, "paginationDirection": "forward"}) # dynamic/time-based pagination starting from 1664812416000
ledger = await bybit.fetch_ledger(params = {"paginate": True}) # bybit returns a cursor so the pagination will be cursor-based
funding_rates = await binance.fetch_funding_rate_history("BTC/USDT:USDT", params = {"paginate": True, "maxEntriesPerRequest": 50}) # customizes the number of entries per request
```

----------------------------------------

TITLE: Fetch Trades Example - PHP
DESCRIPTION: This PHP example iterates through all available market symbols and prints the public trades for each using the `fetch_trades` method. It includes a check to ensure the exchange supports the `fetchTrades` functionality.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: php
CODE:
```
if ($exchange->has['fetchTrades']) {
    foreach ($exchange->markets as $symbol => $market) {
        var_dump ($exchange->fetch_trades ($symbol));
    }
}
```

----------------------------------------

TITLE: Fetch Order Book Example (JavaScript)
DESCRIPTION: Demonstrates how to fetch order books for all available markets in a loop with a delay between requests to respect rate limits.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: javascript
CODE:
```
delay = 2000 // milliseconds = seconds * 1000
(async () => {
    for (symbol in exchange.markets) {
        console.log (await exchange.fetchOrderBook (symbol))
        await new Promise (resolve => setTimeout (resolve, delay)) // rate limit
    }
}) ()
```

----------------------------------------

TITLE: Fetch Trades Example - Python
DESCRIPTION: This Python example shows how to fetch and print recent trades for each symbol available in the exchange's markets. It requires that `loadMarkets` or `load_markets` has been called prior to iterating through symbols.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: python
CODE:
```
import time
if exchange.has['fetchTrades']:
    for symbol in exchange.markets:  # ensure you have called loadMarkets() or load_markets() method.
        print (symbol, exchange.fetch_trades (symbol))
```

----------------------------------------

TITLE: CCXT Exchange Instantiation Example
DESCRIPTION: Demonstrates how to instantiate a CCXT exchange object for a specific exchange, such as Binance. This is the first step to interacting with any exchange using the library.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: javascript
CODE:
```
const ccxt = require('ccxt');

async function createExchangeInstance() {
  const exchange = new ccxt.binance({
    apiKey: 'YOUR_API_KEY',
    secret: 'YOUR_SECRET',
  });
  console.log(exchange.id);
  return exchange;
}

createExchangeInstance();
```

LANGUAGE: python
CODE:
```
import ccxt

async def create_exchange_instance():
    exchange = ccxt.binance({
        'apiKey': 'YOUR_API_KEY',
        'secret': 'YOUR_SECRET',
    })
    print(exchange.id)
    return exchange

create_exchange_instance()
```

LANGUAGE: php
CODE:
```
<?php
require_once 'vendor/autoload.php';

use ccxt\binance;

$exchange = new binance([
    'apiKey' => 'YOUR_API_KEY',
    'secret' => 'YOUR_SECRET',
]);

echo $exchange->id;
?>

```

----------------------------------------

TITLE: Fetch Order Book Example (PHP)
DESCRIPTION: Illustrates fetching order books for all markets with a specified delay between requests to adhere to API rate limits.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: php
CODE:
```
$delay = 2000000; // microseconds = seconds * 1000000
foreach ($exchange->markets as $symbol => $market) {
    var_dump ($exchange->fetch_order_book ($symbol));
    usleep ($delay); // rate limit
}
```

----------------------------------------

TITLE: Deposit/Withdraw Fee Structure Example
DESCRIPTION: Provides an example of the detailed fee structure for deposits and withdrawals for a specific currency, including network-specific fees and percentage flags.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: APIDOC
CODE:
```
{
    'BTC': {
        'withdraw': { 'fee': 0.0005, 'percentage': false },
        'deposit': { 'fee': undefined, 'percentage': undefined },
        'networks': {
            'BTC': {
                'deposit': { 'fee': undefined, 'percentage': undefined },
                'withdraw': { 'fee': 0.0005, 'percentage': false }
            }
        },
        'info': { ... },
    },
    ...
}
```

----------------------------------------

TITLE: Fetch Order Book Example (Python)
DESCRIPTION: Shows how to fetch order books for all markets, including a time delay between each API call to manage rate limits.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: python
CODE:
```
import time
delay = 2 # seconds
for symbol in exchange.markets:
    print (exchange.fetch_order_book (symbol))
    time.sleep (delay) # rate limit
```

----------------------------------------

TITLE: Fetch Trades Example - TypeScript
DESCRIPTION: This TypeScript example demonstrates how to iterate through all symbols in an exchange's markets and print the recent trades for each symbol using the `fetchTrades` method. It includes a check for exchange support and a sleep function to manage rate limits.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: typescript
CODE:
```
if (exchange.has['fetchTrades']) {
    let sleep = (ms) => new Promise (resolve => setTimeout (resolve, ms));
    for (symbol in exchange.markets) {
        console.log (await exchange.fetchTrades (symbol))
    }
}
```

----------------------------------------

TITLE: CCXT Network Structure Example
DESCRIPTION: Provides an example of the network structure object used in CCXT, illustrating the various properties and their expected data types.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: javascript
CODE:
```
{
    'id':       'tron',
    'network':  'TRC20',
    'name':     'Tron Network',
    'active':    true,
    'fee':       0.123,
    'precision': 8,
    'deposit':   true,
    'withdraw':  true,
    'limits': {
        'amount': {
            'min': 0.01,
            'max': 1000
        },
        'withdraw': { ... },
        'deposit': {...}
    },
    'info': { ... }
}
```

LANGUAGE: python
CODE:
```
{
    'id':       'tron',
    'network':  'TRC20',
    'name':     'Tron Network',
    'active':    True,
    'fee':       0.123,
    'precision': 8,
    'deposit':   True,
    'withdraw':  True,
    'limits': {
        'amount': {
            'min': 0.01,
            'max': 1000
        },
        'withdraw': { ... },
        'deposit': {...}
    },
    'info': { ... }
}
```

----------------------------------------

TITLE: Fetch Deposits Example
DESCRIPTION: Demonstrates how to use the `fetch_deposits` method in CCXT to retrieve a list of deposits. It includes checks for exchange support and handles potential errors.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: python
CODE:
```
# fetch_deposits(code = None, since = None, limit = None, params = {})

if exchange.has['fetchDeposits']:
    deposits = exchange.fetch_deposits(code, since, limit, params)
else:
    raise Exception (exchange.id + ' does not have the fetch_deposits method')
```

----------------------------------------

TITLE: Fetch Deposits Example
DESCRIPTION: Demonstrates how to use the `fetchDeposits` method in CCXT to retrieve a list of deposits. It includes checks for exchange support and handles potential errors.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: javascript
CODE:
```
// fetchDeposits (code = undefined, since = undefined, limit = undefined, params = {})

if (exchange.has['fetchDeposits']) {
    const deposits = await exchange.fetchDeposits (code, since, limit, params);
} else {
    throw new Error (exchange.id + ' does not have the fetchDeposits method');
}
```

----------------------------------------

TITLE: PHP Pagination Example
DESCRIPTION: Shows how to implement pagenumber-based pagination for fetching trades in PHP. The script iterates, updating the 'start' parameter with the cursor from the response JSON until no trades are returned. Requires 'fetchMyTrades' capability.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: php
CODE:
```
if ($exchange->has['fetchMyTrades']) {
    $start = '0' // exchange-specific type and value
    $all_trades = array ();
    while (true) {
        $symbol = null; // change for your symbol
        $since = null;
        $limit = 20; // change for your limit
        $params = array (
            'start' => $start, // exchange-specific non-unified parameter name
        );
        $trades = $exchange->fetchMyTrades ($symbol, $since, $limit, $params);
        if (count($trades)) {
            // not thread-safu and exchange-specific !
            $last_json_response = $exchange->parse_json ($exchange->last_http_response);
            $start = $last_json_response['next'];
            $all_trades = array_merge ($all_trades, $trades);
        } else {
            break;
        }
    }
}
```

----------------------------------------

TITLE: Check CCXT Version
DESCRIPTION: Provides code examples to check the currently installed version of the CCXT library in JavaScript, Python, and PHP. This is a crucial step for troubleshooting.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: javascript
CODE:
```
console.log (ccxt.version)
```

LANGUAGE: python
CODE:
```
print('CCXT version:', ccxt.__version__)
```

LANGUAGE: php
CODE:
```
echo "CCXT v." . ccxtExchange::VERSION . "\n";
```

----------------------------------------

TITLE: Trading Fee Structure Example
DESCRIPTION: Demonstrates the structure of trading fees for different currency pairs, including maker and taker fees.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: python
CODE:
```
{
    'ETH/BTC': {
        'maker': 0.001,
        'taker': 0.002,
        'info': { ... },
        'symbol': 'ETH/BTC',
    },
    'LTC/BTC': {
        'maker': 0.001,
        'taker': 0.002,
        'info': { ... },
        'symbol': 'LTC/BTC',
    },
}
```

----------------------------------------

TITLE: CCXT Precision and Limits Example
DESCRIPTION: Demonstrates the relationship between market limits and precision for amount and price in CCXT. It shows examples of valid and invalid values based on these constraints.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: javascript
CODE:
```
market['limits']['amount']['min'] == 0.05 &&
market['precision']['amount'] == 0.0001 &&
market['precision']['price'] == 0.01
```

----------------------------------------

TITLE: Fetch Deposits Example
DESCRIPTION: Demonstrates how to use the `fetch_deposits` method in CCXT to retrieve a list of deposits. It includes checks for exchange support and handles potential errors.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: php
CODE:
```
// fetch_deposits ($code = null, $since = null, $limit = null, $params = {})

if ($exchange->has['fetchDeposits']) {
    $deposits = $exchange->fetch_deposits ($code, $since, $limit, $params);
} else {
    throw new Exception ($exchange->id . ' does not have the fetch_deposits method');
}
```

----------------------------------------

TITLE: Fetch Transactions Example
DESCRIPTION: Illustrates fetching transactions from an exchange. It includes a check for exchange support of the 'fetchTransactions' method and handles unsupported cases by throwing an error.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: javascript
CODE:
```
if (exchange.has['fetchTransactions']) {
    const transactions = await exchange.fetchTransactions (code, since, limit, params)
} else {
    throw new Error (exchange.id + ' does not have the fetchTransactions method')
}
```

LANGUAGE: python
CODE:
```
if exchange.has['fetchTransactions']:
    transactions = exchange.fetch_transactions(code, since, limit, params)
else:
    raise Exception (exchange.id + ' does not have the fetch_transactions method')
```

LANGUAGE: php
CODE:
```
if ($exchange->has['fetchTransactions']) {
    $transactions = $exchange->fetch_transactions ($code, $since, $limit, $params);
} else {
    throw new Exception ($exchange->id . ' does not have the fetch_transactions method');
}
```

----------------------------------------

TITLE: Currency Structure Example
DESCRIPTION: Illustrates the standard structure of currency data as returned by the CCXT library, including ID, code, name, status, fees, precision, limits, and network information.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: javascript
CODE:
```
{
    'id':       'btc',
    'code':     'BTC',
    'name':     'Bitcoin',
    'active':    true,
    'fee':       0.123,
    'precision': 8,
    'deposit':   true,
    'withdraw':  true,
    'limits': {
        'amount': {
            'min': 0.01,
            'max': 1000
        },
        'withdraw': { ... },
        'deposit': {...}
    },
    'networks': {...},
    'info': { ... }
}
```

LANGUAGE: python
CODE:
```
{
    'id':       'btc',
    'code':     'BTC',
    'name':     'Bitcoin',
    'active':    True,
    'fee':       0.123,
    'precision': 8,
    'deposit':   True,
    'withdraw':  True,
    'limits': {
        'amount': {
            'min': 0.01,
            'max': 1000
        },
        'withdraw': { ... },
        'deposit': {...}
    },
    'networks': {...},
    'info': { ... }
}
```

----------------------------------------

TITLE: Margin Structure Example
DESCRIPTION: Provides an example of the margin structure object returned by CCXT, detailing information like type, amount, total, code, symbol, and status.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: json
CODE:
```
{
    info: { ... },
    type: 'add', // 'add', 'reduce', 'set'
    amount: 1, // amount added, reduced, or set
    total: 2,  // total margin or undefined if not specified by the exchange
    code: 'USDT',
    symbol: 'XRP/USDT:USDT',
    status: 'ok'
}
```

----------------------------------------

TITLE: Fetch Withdrawals Example
DESCRIPTION: Demonstrates how to fetch withdrawals from an exchange. It checks if the exchange supports the 'fetchWithdrawals' method before attempting to call it. If not supported, it throws an error.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: javascript
CODE:
```
if (exchange.has['fetchWithdrawals']) {
    const withdrawals = await exchange.fetchWithdrawals (code, since, limit, params)
} else {
    throw new Error (exchange.id + ' does not have the fetchWithdrawals method')
}
```

LANGUAGE: python
CODE:
```
if exchange.has['fetchWithdrawals']:
    withdrawals = exchange.fetch_withdrawals(code, since, limit, params)
else:
    raise Exception (exchange.id + ' does not have the fetch_withdrawals method')
```

LANGUAGE: php
CODE:
```
if ($exchange->has['fetchWithdrawals']) {
    $withdrawals = $exchange->fetch_withdrawals ($code, $since, $limit, $params);
} else {
    throw new Exception ($exchange->id . ' does not have the fetch_withdrawals method');
}
```

----------------------------------------

TITLE: Create Spot Margin Order with Margin Mode
DESCRIPTION: Demonstrates how to create a spot margin order by specifying the `marginMode` parameter within the `params` object. Examples are provided for Javascript, Python, and PHP.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: javascript
CODE:
```
const params = {
    'marginMode': 'isolated', // or 'cross'
}
const order = await exchange.createOrder ('ETH/USDT', 'market', 'buy', 0.1, 1500, params)
```

LANGUAGE: python
CODE:
```
params = {
    'marginMode': 'isolated', # or 'cross'
}
order = exchange.create_order ('ETH/USDT', 'market', 'buy', 0.1, 1500, params)
```

LANGUAGE: php
CODE:
```
$params = {
    'marginMode': 'isolated', // or 'cross'
}
$order = $exchange->create_order ('ETH/USDT', 'market', 'buy', 0.1, 1500, $params);
```

----------------------------------------

TITLE: Fee Structure Example
DESCRIPTION: Illustrates the structure of trading fee information that can be obtained from an exchange, including taker/maker fees, percentage flag, tier-based status, and detailed tiers.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: APIDOC
CODE:
```
{
    'taker': 0.002,   // taker fee rate, 0.002 = 0.2%
    'maker': 0.0016,  // maker fee rate, 0.0016 = 0.16%
    'percentage': true, // whether the taker and maker fee rate is a multiplier or a fixed flat amount
    'tierBased': false, // whether the fee depends on your trading tier (your trading volume)

    'tiers': {
        'taker': [
            [0, 0.0026], // tupple (trade volume in USD, taker fee) ordered by increasing volume
            [50000, 0.0024],
            ...
        ],
        'maker': [
            [0, 0.0016], // tupple (trade volume in USD, maker fee) ordered by increasing volume
            [50000, 0.0014],
            ...
        ],
    },
}
```

----------------------------------------

TITLE: Transaction Fee Structure Example
DESCRIPTION: Illustrates the structure of transaction fees, differentiating between withdrawal and deposit fees for various currencies.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: python
CODE:
```
{
    'withdraw': {
        'BTC': 0.00001,
        'ETH': 0.001,
        'LTC': 0.0003,
    },
    'deposit': {
        'BTC': 0,
    },
    'info': { ... },
}
```

----------------------------------------

TITLE: Python Pagination Example
DESCRIPTION: Illustrates fetching orders using pagenumber-based pagination in Python. The loop continues by updating the cursor from response headers until an empty list of orders is received. Requires 'fetchOrders' capability.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: python
CODE:
```
if exchange.has['fetchOrders']:
    cursor = 0  # exchange-specific type and value
    all_orders = []
    while True:
        symbol = None  # change for your symbol
        since = None
        limit = 20  # change for your limit
        params = {
            'cursor': cursor,  # exchange-specific non-unified parameter name
        }
        orders = await exchange.fetch_orders(symbol, since, limit, params)
        if len(orders):
            # not thread-safu and exchange-specific !
            cursor = exchange.last_response_headers['CB-AFTER']
            all_orders += orders
        else:
            break
```

----------------------------------------

TITLE: Borrow Interest Structure Example
DESCRIPTION: Defines the structure for borrow interest records, including details like currency, interest amount, rate, borrowed amount, margin mode, and timestamps.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: python
CODE:
```
{
    info: { ... }                           // Unparsed exchange response
    symbol: 'BTC/USDT',                    // The market that the interest was accrued in
    currency: 'USDT',                       // The currency of the interest
    interest: 0.00004842,                   // The amount of interest that was charged
    interestRate: 0.0002,                   // The borrow interest rate
    amountBorrowed: 5.81,                   // The amount of currency that was borrowed
    marginMode: 'cross',                    // The margin mode of the borrowed amount
    timestamp: 1648699200000,               // The timestamp that the interest was charged
    datetime: '2022-03-31T04:00:00.000Z',   // The datetime that the interest was charged
}
```

----------------------------------------

TITLE: Fetch Order Book with Limit (Python)
DESCRIPTION: Fetches an order book for a given symbol with a specified limit. This example retrieves up to ten bid-asks on each side of the order book stack for BTC/USD on CEX.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: python
CODE:
```
import ccxt
# return up to ten bidasks on each side of the order book stack
limit = 10
ccxt.cex().fetch_order_book('BTC/USD', limit)
```

----------------------------------------

TITLE: Fetch Order Book with Limit (PHP)
DESCRIPTION: Fetches an order book for a given symbol with a specified limit. This example retrieves up to twenty orders on each side of the order book stack for BTC/USD on Kraken.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: php
CODE:
```
// instantiate the exchange by id
$exchange = '\ccxt\kraken';
$exchange = new $exchange ();
// up to ten orders on each side, for example
$limit = 20;
var_dump ($exchange->fetch_order_book ('BTC/USD', $limit));
```

----------------------------------------

TITLE: Create Trailing Order (PHP)
DESCRIPTION: Illustrates creating a trailing order in PHP. This example sets the symbol, type, side, amount, and uses the `$params` array to define trailing order specifics like `trailingPercent`, `trailingAmount`, `trailingTriggerPrice`, and `reduceOnly`.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: php
CODE:
```
$symbol = 'BTC/USDT:USDT';
$type = 'market';
$side = 'sell';
$amount = 1.0;
$price = null;
$params = {
    'trailingPercent': 1.0, // percentage away from the current market price 1.0 is equal to 1%
    // 'trailingAmount': 100.0, // quote amount away from the current market price
    // 'trailingTriggerPrice': 44500.0, // the price to trigger activating a trailing stop order
    // 'reduceOnly': true, // set to true if you want to close a position, set to false if you want to open a new position
}
$order = $exchange->create_order ($symbol, $type, $side, $amount, $price, $params);
```

----------------------------------------

TITLE: CCXT Withdrawal with Network Specification
DESCRIPTION: Demonstrates how to specify withdrawal networks using the `params` argument, providing examples for Javascript, Python, and PHP.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: javascript
CODE:
```
withdraw (code, amount, address, { tag, network: 'ETH' })
```

LANGUAGE: python
CODE:
```
withdraw(code, amount, address, { 'tag': tag, 'network': 'ETH' })
```

LANGUAGE: php
CODE:
```
withdraw ($code, $amount, $address, array( 'tag' => tag, 'network' -> 'ETH' ))
```

----------------------------------------

TITLE: Custom Order Parameters (Python)
DESCRIPTION: Demonstrates adding custom order parameters in Python using CCXT. This example shows how to include an exchange-specific flag ('trading_agreement': 'agree') for a market buy order.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: python
CODE:
```
# add a custom order flag
kraken.create_market_buy_order('BTC/USD', 1, {'trading_agreement': 'agree'})
```

----------------------------------------

TITLE: PrecisionMode TICK_SIZE Example
DESCRIPTION: Demonstrates formatting with `precisionMode = ccxt.TICK_SIZE`, where precision is defined by the tick size.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: javascript
CODE:
```
// case B
exchange.precisionMode = ccxt.TICK_SIZE
market = exchange.market (symbol)
market['precision']['amount'] === 0.00000001 // up to 0.00000001 precision
exchange.amountToPrecision (symbol, 0.123456789) === 0.12345678
exchange.amountToPrecision (symbol, 0.0000000000123456789) === 0.00000000 === 0.0
```

----------------------------------------

TITLE: PrecisionMode DECIMAL_PLACES Example
DESCRIPTION: Demonstrates formatting with `precisionMode = ccxt.DECIMAL_PLACES`, where precision is defined by the number of decimal places.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: javascript
CODE:
```
// case A
exchange.precisionMode = ccxt.DECIMAL_PLACES
market = exchange.market (symbol)
market['precision']['amount'] === 8 // up to 8 decimals after the dot
exchange.amountToPrecision (symbol, 0.123456789) === 0.12345678
exchange.amountToPrecision (symbol, 0.0000000000123456789) === 0.0000000 === 0.0
```

----------------------------------------

TITLE: JavaScript Pagination Example
DESCRIPTION: Demonstrates fetching trades using pagenumber-based pagination in JavaScript. It iteratively fetches trades, updating the page cursor with each request until no more trades are returned. Requires 'fetchTrades' capability.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: javascript
CODE:
```
if (exchange.has['fetchTrades']) {
    let page = 0  // exchange-specific type and value
    let allTrades = []
    while (true) {
        const symbol = undefined // change for your symbol
        const since = undefined
        const limit = 20 // change for your limit
        const params = {
            'page': page, // exchange-specific non-unified parameter name
        }
        const trades = await exchange.fetchTrades (symbol, since, limit, params)
        if (trades.length) {
            // not thread-safu and exchange-specific !
            last_json_response = exchange.parseJson (exchange.last_http_response)
            page = last_json_response['cursor']
            allTrades.push (trades)
        } else {
            break
        }
    }
}
```

----------------------------------------

TITLE: Create Stop Loss Order - PHP
DESCRIPTION: Provides a PHP example for creating stop loss orders using CCXT. The `stopLossPrice` is configured in the parameters to manage risk.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: php
CODE:
```
// for a stop loss order
$params = {
    'stopLossPrice': 55.45, // your stop loss price
}

$order = $exchange->create_order ($symbol, $type, $side, $amount, $price, $params);
```

----------------------------------------

TITLE: CCXT Deposit ID Structure Example
DESCRIPTION: Illustrates the structure of the deposit ID information returned by CCXT methods like fetchDepositMethodId and fetchDepositMethodIds.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: javascript
CODE:
```
{
    'info': {},
    'id': '75ab52ff-f25t',
    'currency': 'USD',
    'verified': true,
    'tag': 'from credit card'
}
```

----------------------------------------

TITLE: Suppressed Error Example for setMarginMode
DESCRIPTION: Shows an example of a suppressed error response from an exchange API when attempting to set a margin mode that is already active. CCXT handles this by returning the suppressed error object.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: json
CODE:
```
{ code: -4046, msg: 'No need to change margin type.' }
```

----------------------------------------

TITLE: Fetch ETH/BTC Ticker on OKX (PHP Async)
DESCRIPTION: Shows how to fetch ticker data for ETH/BTC on the OKX exchange using the asynchronous version of the CCXT library in PHP. This example requires ReactPHP and specific composer dependencies.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: php
CODE:
```
<?php
include 'vendor/autoload.php';

use function React\Async\await;

$okx = new \ccxt\async\okx();
while (true) {
    $result = await($okx->fetch_ticker('ETH/BTC'));
    var_dump($result);
}
```

----------------------------------------

TITLE: Generic Exchange Structure Example
DESCRIPTION: Illustrates the typical properties and their expected values for a generic exchange object within the CCXT library. This structure is fundamental for understanding how exchanges are represented and configured.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: javascript
CODE:
```
{
    'id':   'exchange',                   // lowercase string exchange id
    'name': 'Exchange',                   // human-readable string
    'countries': [ 'US', 'CN', 'EU' ],   // array of ISO country codes
    'urls': {
        'api': 'https://api.example.com/data',  // string or dictionary of base API URLs
        'www': 'https://www.example.com'        // string website URL
        'doc': 'https://docs.example.com/api',  // string URL or array of URLs
    },
    'version':         'v1',             // string ending with digits
    'api':             { ... },          // dictionary of api endpoints
    'has': {                             // exchange capabilities
        'CORS': false,
        'cancelOrder': true,
        'createDepositAddress': false,
        'createOrder': true,
        'fetchBalance': true,
        'fetchCanceledOrders': false,
        'fetchClosedOrder': false,
        'fetchClosedOrders': false,
        'fetchCurrencies': false,
        'fetchDepositAddress': false,
        'fetchMarkets': true,
        'fetchMyTrades': false,
        'fetchOHLCV': false,
        'fetchOpenOrder': false,
        'fetchOpenOrders': false,
        'fetchOrder': false,
        'fetchOrderBook': true,
        'fetchOrders': false,
        'fetchStatus': 'emulated',
        'fetchTicker': true,
        'fetchTickers': false,
        'fetchBidsAsks': false,
        'fetchTrades': true,
        'withdraw': false,
    },
    'timeframes': {                      // empty if the exchange.has['fetchOHLCV'] !== true
        '1m': '1minute',
        '1h': '1hour',
        '1d': '1day',
        '1M': '1month',
        '1y': '1year',
    },
    'timeout':           10000,          // number in milliseconds
    'rateLimit':         2000,           // number in milliseconds
    'userAgent':        'ccxt/1.1.1 ...' // string, HTTP User-Agent header
    'verbose':           false,          // boolean, output error details
    'markets':          { ... }          // dictionary of markets/pairs by symbol
    'symbols':          [ ... ]          // sorted list of string symbols (traded pairs)
    'currencies':       { ... }          // dictionary of currencies by currency code
    'markets_by_id':    { ... },         // dictionary of array of dictionaries (markets) by id
    'currencies_by_id': { ... },         // dictionary of dictionaries (markets) by id
    'apiKey':   '92560ffae9b8a0421...',  // string public apiKey (ASCII, hex, Base64, ...)
    'secret':   '9aHjPmW+EtRRKN/Oi...'   // string private secret key
    'password': '6kszf4aci8r',           // string password
    'uid':      '123456',                // string user id
    'options':          { ... },         // exchange-specific options
    // ... other properties here ...
}
```

LANGUAGE: python
CODE:
```
{
    'id':   'exchange',                   # lowercase string exchange id
    'name': 'Exchange',                   # human-readable string
    'countries': [ 'US', 'CN', 'EU' ],   # array of ISO country codes
    'urls': {
        'api': 'https://api.example.com/data',  # string or dictionary of base API URLs
        'www': 'https://www.example.com'        # string website URL
        'doc': 'https://docs.example.com/api',  # string URL or array of URLs
    },
    'version':         'v1',             # string ending with digits
    'api':             { ... },          # dictionary of api endpoints
    'has': {                             # exchange capabilities
        'CORS': False,
        'cancelOrder': True,
        'createDepositAddress': False,
        'createOrder': True,
        'fetchBalance': True,
        'fetchCanceledOrders': False,
        'fetchClosedOrder': False,
        'fetchClosedOrders': False,
        'fetchCurrencies': False,
        'fetchDepositAddress': False,
        'fetchMarkets': True,
        'fetchMyTrades': False,
        'fetchOHLCV': False,
        'fetchOpenOrder': False,
        'fetchOpenOrders': False,
        'fetchOrder': False,
        'fetchOrderBook': True,
        'fetchOrders': False,
        'fetchStatus': 'emulated',
        'fetchTicker': True,
        'fetchTickers': False,
        'fetchBidsAsks': False,
        'fetchTrades': True,
        'withdraw': False,
    },
    'timeframes': {                      # empty if the exchange.has['fetchOHLCV'] !== true
        '1m': '1minute',
        '1h': '1hour',
        '1d': '1day',
        '1M': '1month',
        '1y': '1year',
    },
    'timeout':           10000,          # number in milliseconds
    'rateLimit':         2000,           # number in milliseconds
    'userAgent':        'ccxt/1.1.1 ...' # string, HTTP User-Agent header
    'verbose':           False,          # boolean, output error details
    'markets':          { ... }          # dictionary of markets/pairs by symbol
    'symbols':          [ ... ]          # sorted list of string symbols (traded pairs)
    'currencies':       { ... }          # dictionary of currencies by currency code
    'markets_by_id':    { ... },         # dictionary of array of dictionaries (markets) by id
    'currencies_by_id': { ... },         # dictionary of dictionaries (markets) by id
    'apiKey':   '92560ffae9b8a0421...',  # string public apiKey (ASCII, hex, Base64, ...)
    'secret':   '9aHjPmW+EtRRKN/Oi...'   # string private secret key
    'password': '6kszf4aci8r',           # string password
    'uid':      '123456',                # string user id
    'options':          { ... },         # exchange-specific options
    # ... other properties here ...
}
```

----------------------------------------

TITLE: PrecisionMode SIGNIFICANT_DIGITS Example
DESCRIPTION: Demonstrates formatting with `precisionMode = ccxt.SIGNIFICANT_DIGITS`, where precision is defined by the number of significant non-zero digits.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: javascript
CODE:
```
// case C
exchange.precisionMode = ccxt.SIGNIFICANT_DIGITS
market = exchange.market (symbol)
market['precision']['amount'] === 8 // up to 8 significant non-zero digits
exchange.amountToPrecision (symbol, 0.0000000000123456789) === 0.000000000012345678
exchange.amountToPrecision (symbol, 123.4567890123456789) === 123.45678
```

----------------------------------------

TITLE: Fetch Personal Trades - PHP
DESCRIPTION: Illustrates how to use the `fetch_my_trades` method in PHP to access personal trade data. The example includes checking for exchange support and passing relevant arguments.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: php
CODE:
```
if ($exchange->has['fetchMyTrades']) {
    $trades = $exchange->fetch_my_trades($symbol, $since, $limit, $params);
}
```

----------------------------------------

TITLE: Get Supported Exchanges List
DESCRIPTION: Retrieves a list of all supported exchange IDs programmatically. This is useful for dynamically selecting or iterating through exchanges.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: javascript
CODE:
```
const ccxt = require ('ccxt')
console.log (ccxt.exchanges)
```

LANGUAGE: python
CODE:
```
import ccxt
print (ccxt.exchanges)
```

LANGUAGE: php
CODE:
```
include 'ccxt.php';
var_dump (ccxtExchange::$exchanges);
```

----------------------------------------

TITLE: Fetch Order Book with Params (PHP)
DESCRIPTION: Illustrates fetching an order book in PHP, utilizing an array for exchange-specific parameter overrides. This allows for detailed control over the API request, similar to the Python example.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: php
CODE:
```
$params = array (
    'foo' => 'bar',       // exchange-specific overrides in unified queries
    'Hello' => 'World!',  // see their docs for more details on parameter names
}

// overrides go into the last argument to the unified call ↓ HERE
$result = $exchange->fetch_order_book ($symbol, $length, $params);
```

----------------------------------------

TITLE: Fetch Order Book with Limit and Extra Params (JavaScript)
DESCRIPTION: Fetches an order book for a given symbol with a specified limit and includes exchange-specific extra parameters. The example demonstrates fetching a grouped order book for BTC/USD on Bitfinex.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: javascript
CODE:
```
const ccxt = require ('ccxt')
const exchange = new ccxt.bitfinex ()
const limit = 5
const orders = await exchange.fetchOrderBook ('BTC/USD', limit, {
    // this parameter is exchange-specific, all extra params have unique names per exchange
    'group': 1, // 1 = orders are grouped by price, 0 = orders are separate
})
```

----------------------------------------

TITLE: Create Market Orders (CCXT)
DESCRIPTION: Demonstrates various ways to create market sell and buy orders using CCXT, supporting camelCase and underscore notations, as well as general order creation methods.

SOURCE: https://docs.ccxt.com/index

LANGUAGE: javascript
CODE:
```
exchange.createMarketSellOrder (symbol, amount, params)
exchange.createMarketBuyOrder (symbol, amount, params)
```

LANGUAGE: javascript
CODE:
```
exchange.create_market_sell_order (symbol, amount, params)
exchange.create_market_buy_order (symbol, amount, params)
```

LANGUAGE: javascript
CODE:
```
exchange.createMarketOrder (symbol, side, amount, params)
exchange.create_market_order (symbol, side, amount, params)
```

LANGUAGE: javascript
CODE:
```
exchange.createOrder (symbol, 'market', side, amount, ...)
exchange.create_order (symbol, 'market', side, amount, ...)
```