-- QuestDB table schemas for trade data ingestion

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

