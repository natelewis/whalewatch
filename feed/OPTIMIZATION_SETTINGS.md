# Option Quotes Backfilling Optimization Settings

This document outlines the environment variables and settings that can be configured to optimize option_quotes backfilling performance.

## Environment Variables

### Concurrency Settings
- `OPTION_CONCURRENCY_LIMIT` (default: 5): Number of option tickers to process in parallel
  - Higher values = faster processing but more memory usage
  - Recommended range: 3-10 depending on your system resources

### Batch Size Settings
- `OPTION_QUOTES_BATCH_SIZE` (default: 1000): Number of quotes to insert per database batch
  - Higher values = fewer database round trips but more memory usage
  - Recommended range: 500-2000

- `OPTION_QUOTES_CHUNK_SIZE` (default: 5000): Number of quotes to process in memory at once
  - Higher values = more memory usage but fewer API calls
  - Recommended range: 2000-10000

### Rate Limiting Settings
- `POLYGON_REQUESTS_PER_SECOND` (default: 5.0): Maximum requests per second to Polygon API
  - Higher values = faster data retrieval but may hit API limits
  - Recommended range: 3-10 depending on your API plan

- `POLYGON_REQUESTS_PER_MINUTE` (default: 300): Maximum requests per minute to Polygon API
  - Higher values = faster data retrieval but may hit API limits
  - Recommended range: 200-500 depending on your API plan

## Performance Recommendations

### For Maximum Speed (if you have sufficient resources):
```bash
export OPTION_CONCURRENCY_LIMIT=10
export OPTION_QUOTES_BATCH_SIZE=2000
export OPTION_QUOTES_CHUNK_SIZE=10000
export POLYGON_REQUESTS_PER_SECOND=8.0
export POLYGON_REQUESTS_PER_MINUTE=400
```

### For Conservative Resource Usage:
```bash
export OPTION_CONCURRENCY_LIMIT=3
export OPTION_QUOTES_BATCH_SIZE=500
export OPTION_QUOTES_CHUNK_SIZE=2000
export POLYGON_REQUESTS_PER_SECOND=3.0
export POLYGON_REQUESTS_PER_MINUTE=200
```

### For Balanced Performance:
```bash
export OPTION_CONCURRENCY_LIMIT=5
export OPTION_QUOTES_BATCH_SIZE=1000
export OPTION_QUOTES_CHUNK_SIZE=5000
export POLYGON_REQUESTS_PER_SECOND=5.0
export POLYGON_REQUESTS_PER_MINUTE=300
```

## Monitoring Performance

Watch for these indicators to tune your settings:

1. **Memory Usage**: If you see high memory usage, reduce `OPTION_QUOTES_CHUNK_SIZE`
2. **API Rate Limits**: If you get rate limit errors, reduce `POLYGON_REQUESTS_PER_SECOND`
3. **Database Performance**: If database inserts are slow, increase `OPTION_QUOTES_BATCH_SIZE`
4. **CPU Usage**: If CPU is maxed out, reduce `OPTION_CONCURRENCY_LIMIT`

## Expected Performance Improvements

With these optimizations, you should see:
- **3-5x faster** option quotes backfilling due to parallel processing
- **2-3x faster** database inserts due to larger batch sizes
- **Reduced memory usage** due to streaming/chunked processing
- **Better API utilization** due to optimized rate limiting

The exact improvement will depend on your specific data volume and system resources.
