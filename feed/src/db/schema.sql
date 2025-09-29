-- QuestDB table schemas for trade data ingestion

-- Stock trades (individual trade records)
CREATE TABLE IF NOT EXISTS stock_trades (
    symbol SYMBOL,
    timestamp TIMESTAMP,
    price DOUBLE,
    size DOUBLE,
    conditions STRING,
    exchange LONG,
    tape LONG,
    trade_id STRING
) TIMESTAMP(timestamp) PARTITION BY DAY;

-- Stock aggregates (1-minute bars)
CREATE TABLE IF NOT EXISTS stock_aggregates (
    symbol SYMBOL,
    timestamp TIMESTAMP,
    open DOUBLE,
    high DOUBLE,
    low DOUBLE,
    close DOUBLE,
    volume DOUBLE,
    vwap DOUBLE,
    transaction_count LONG
) TIMESTAMP(timestamp) PARTITION BY DAY;

-- Option contracts
CREATE TABLE IF NOT EXISTS option_contracts (
    ticker STRING,
    contract_type STRING,
    exercise_style STRING,
    expiration_date TIMESTAMP,
    shares_per_contract LONG,
    strike_price DOUBLE,
    underlying_ticker SYMBOL
) TIMESTAMP(expiration_date) PARTITION BY DAY;

-- Option contract index - tracks which days we have synced option contracts
CREATE TABLE IF NOT EXISTS option_contract_index (
    underlying_ticker SYMBOL,
    as_of TIMESTAMP
) TIMESTAMP(as_of) PARTITION BY DAY;

-- Option trades
CREATE TABLE IF NOT EXISTS option_trades (
    ticker SYMBOL,
    underlying_ticker SYMBOL,
    timestamp TIMESTAMP,
    price DOUBLE,
    size DOUBLE,
    conditions STRING,
    exchange LONG,
    tape LONG,
    sequence_number LONG
) TIMESTAMP(timestamp) PARTITION BY DAY;

-- Option quotes
CREATE TABLE IF NOT EXISTS option_quotes (
    ticker SYMBOL,
    underlying_ticker SYMBOL,
    timestamp TIMESTAMP,
    bid_price DOUBLE,
    bid_size DOUBLE,
    ask_price DOUBLE,
    ask_size DOUBLE,
    bid_exchange LONG,
    ask_exchange LONG,
    sequence_number LONG
) TIMESTAMP(timestamp) PARTITION BY DAY;
