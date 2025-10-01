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

-- Option trades
CREATE TABLE IF NOT EXISTS option_trades (
    ticker SYMBOL,
    underlying_ticker SYMBOL,
    timestamp TIMESTAMP,
    price DOUBLE,
    size DOUBLE,
    conditions STRING,
    exchange LONG
) TIMESTAMP(timestamp) PARTITION BY DAY;

