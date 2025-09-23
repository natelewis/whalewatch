# Catch-up Behavior Tests

This document explains the catch-up behavior of the `make ingest` command and provides tests to verify this functionality.

## Question: Does `make ingest` catch up from the last run?

**Answer: YES** - The `make ingest` command does catch up and fill gaps from the last time it was run correctly.

## How It Works

When you run `make ingest`, the system:

1. **Reads sync state** from the `sync_state` table to find the `last_aggregate_timestamp` for each ticker
2. **Calculates the gap** between the last sync time and the current time
3. **Fetches missing data** from the Polygon API for the gap period
4. **Fills the database** with minute-by-minute aggregates for the missing period
5. **Updates sync state** with new timestamps
6. **Starts WebSocket streaming** for real-time data

## Key Code Locations

- `DataIngestionService.startIngestion()` - calls `catchUpData()`
- `DataIngestionService.catchUpData()` - loops through tickers
- `DataIngestionService.catchUpTickerData()` - fills gaps for individual tickers
- `sync_state` table - tracks `last_aggregate_timestamp` for each ticker

## Test Files

### 1. Demo Script (`test-catchup-demo.ts`)
A simple demonstration of the catch-up behavior without database dependencies.

```bash
npm run test:catchup-demo
```

**What it shows:**
- Scenario setup (backfill 3 days ago, then run ingest now)
- Initial sync state
- Catch-up logic explanation
- Expected result after catch-up

### 2. Unit Tests (`test-catchup-unit.ts`)
Unit tests that verify the core catch-up logic without requiring database connections.

```bash
npm run test:catchup-unit
```

**What it tests:**
- Catch-up time calculation
- Sync state initialization
- Gap detection logic
- Data delay handling

### 3. Integration Test (`test-catchup-behavior.ts`)
Full integration test that requires database connection and tests the complete flow.

```bash
npm run test:catchup-behavior
```

**What it tests:**
- Complete catch-up flow with real database
- Data count verification
- Sync state updates
- WebSocket continuation

## Example Scenario

1. **Day 1**: You run `make backfill` - system fills data up to Day 1
2. **Day 2-4**: System is stopped (3-day gap)
3. **Day 4**: You run `make ingest`
4. **Result**: System catches up from Day 1 to Day 4, then continues with WebSocket

## Configuration

The catch-up behavior respects these configuration settings:

- `POLYGON_MIN_DATA_DELAY_MINUTES` - Minimum delay for data availability
- `TICKERS` - List of tickers to process
- `BACKFILL_MAX_DAYS` - Maximum days to backfill

## Database Schema

The `sync_state` table tracks the catch-up state:

```sql
CREATE TABLE IF NOT EXISTS sync_state (
    ticker SYMBOL,
    last_trade_timestamp TIMESTAMP,
    last_aggregate_timestamp TIMESTAMP,
    last_sync TIMESTAMP,
    is_streaming BOOLEAN
) TIMESTAMP(last_sync) PARTITION BY DAY;
```

## Running the Tests

```bash
# Run all catch-up tests
npm run test:catchup-demo
npm run test:catchup-unit
npm run test:catchup-behavior

# Or run individually
npx tsx test-catchup-demo.ts
npx tsx test-catchup-unit.ts
npx tsx test-catchup-behavior.ts
```

## Expected Results

All tests should pass, confirming that:

✅ The ingestion service catches up from the last run  
✅ Missing data between last sync and current time is filled  
✅ Sync states are properly tracked and updated  
✅ WebSocket streaming continues after catch-up  

## Troubleshooting

If tests fail:

1. **Database connection issues**: Ensure QuestDB is running and accessible
2. **API key issues**: Ensure `POLYGON_API_KEY` is set in environment
3. **Configuration issues**: Check that all required environment variables are set

## Conclusion

The `make ingest` command is designed to be resilient and will automatically catch up on missing data when restarted after a gap. This ensures data continuity and prevents data loss during system downtime.

