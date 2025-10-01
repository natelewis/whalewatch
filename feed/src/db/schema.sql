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

