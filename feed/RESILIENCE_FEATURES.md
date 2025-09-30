# Resilience and Monitoring Features

This document outlines the comprehensive resilience and self-monitoring capabilities added to the WhaleWatch feed service to ensure reliable operation during trading hours.

## Overview

The feed service has been enhanced with multiple layers of resilience to handle network failures, database issues, and other potential problems that could cause the service to stall or hang during trading hours.

## Key Features

### 1. WebSocket Resilience

#### Automatic Reconnection
- **Exponential Backoff**: Reconnection attempts use exponential backoff with a maximum delay of 30 seconds
- **Max Retry Attempts**: Configurable maximum reconnection attempts (default: 10)
- **Connection State Management**: Prevents multiple simultaneous connection attempts
- **Graceful Degradation**: Service continues to operate even during connection issues

#### Heartbeat Monitoring
- **Ping/Pong**: Regular heartbeat pings every 5 minutes to keep connection alive
- **Message Activity Tracking**: Monitors last message received timestamp
- **Stale Connection Detection**: Alerts if no messages received for 2+ minutes

#### Buffer Management
- **Smart Flushing**: Automatic buffer flushing every 5 seconds or when buffer reaches 100 items
- **Buffer Size Monitoring**: Alerts when buffer size exceeds 1000 items
- **Retry Logic**: Failed database operations retry with exponential backoff

### 2. Database Resilience

#### Connection Health Monitoring
- **Automatic Reconnection**: Database connection automatically reconnects on failure
- **Health Checks**: Regular health check queries every 60 seconds
- **Connection Pooling**: Maintains persistent connections with keep-alive

#### Retry Logic
- **Exponential Backoff**: Database operations retry with increasing delays
- **Retryable Error Detection**: Distinguishes between retryable and non-retryable errors
- **Circuit Breaker Pattern**: Prevents cascading failures by temporarily blocking operations

#### Query Optimization
- **Timeout Management**: Different timeouts for regular queries (30s) vs bulk inserts (60s)
- **Bulk Insert Optimization**: Efficient bulk inserts with proper error handling
- **Parameter Sanitization**: Safe parameter handling to prevent SQL injection

### 3. Circuit Breaker Pattern

#### Database Circuit Breaker
- **Failure Threshold**: Opens after 5 consecutive failures
- **Reset Timeout**: Attempts reset after 30 seconds
- **Half-Open State**: Tests connection before fully reopening
- **Metrics Tracking**: Monitors success/failure rates

#### WebSocket Circuit Breaker
- **Failure Threshold**: Opens after 3 consecutive failures
- **Reset Timeout**: Attempts reset after 60 seconds
- **Graceful Degradation**: Continues operation with reduced functionality

### 4. Health Monitoring System

#### Comprehensive Health Checks
- **WebSocket Status**: Connection state, message activity, buffer health
- **Database Status**: Connection state, query success rates, error counts
- **System Metrics**: Memory usage, CPU usage, uptime
- **Alert Generation**: Automatic alerts for unhealthy conditions

#### Health Endpoints
- **SIGUSR1 Signal**: Send SIGUSR1 to get current health status
- **Structured Logging**: JSON-formatted health reports every 5 minutes
- **Real-time Monitoring**: Continuous monitoring with configurable intervals

### 5. Error Recovery

#### Graceful Error Handling
- **Uncaught Exception Handling**: Graceful shutdown on unhandled exceptions
- **Unhandled Rejection Handling**: Proper handling of promise rejections
- **Resource Cleanup**: Ensures proper cleanup of resources on shutdown

#### Data Recovery
- **Buffer Persistence**: Failed database operations retry with data preservation
- **Transaction Safety**: Ensures data consistency during failures
- **Error Classification**: Distinguishes between recoverable and non-recoverable errors

### 6. Structured Logging

#### Service-Specific Loggers
- **WebSocket Logger**: Specialized logging for WebSocket events
- **Database Logger**: Database operation logging with performance metrics
- **Health Logger**: Health check and monitoring logs
- **System Logger**: General system events and alerts

#### Log Levels
- **ERROR**: Critical errors requiring immediate attention
- **WARN**: Warning conditions that may need investigation
- **INFO**: General information about service operation
- **DEBUG**: Detailed debugging information

#### Structured Data
- **JSON Format**: All logs in structured JSON format for easy parsing
- **Contextual Information**: Includes service name, timestamps, and relevant data
- **Performance Metrics**: Includes duration, counts, and other performance data

## Configuration

### Environment Variables

```bash
# WebSocket Configuration
POLYGON_API_KEY=your_api_key
POLYGON_OPTION_TRADE_VALUE_THRESHOLD=10000

# Database Configuration
QUESTDB_HOST=127.0.0.1
QUESTDB_PORT=9000
QUESTDB_USER=admin
QUESTDB_PASSWORD=quest

# Resilience Configuration
MAX_RETRIES=3
RETRY_DELAY_MS=1000
LOG_LEVEL=info
```

### Monitoring Intervals

- **Health Check**: Every 60 seconds
- **WebSocket Heartbeat**: Every 5 minutes
- **Buffer Flush**: Every 5 seconds
- **Health Report**: Every 5 minutes

## Usage

### Starting the Service

```bash
npm run ingest-options
```

### Health Monitoring

```bash
# Get current health status
kill -SIGUSR1 <process_id>

# Monitor logs for health reports
tail -f logs/app.log | grep "HEALTH REPORT"
```

### Graceful Shutdown

```bash
# Send SIGINT for graceful shutdown
kill -SIGINT <process_id>
```

## Monitoring and Alerting

### Key Metrics to Monitor

1. **WebSocket Connection Status**
   - Connection state (connected/disconnected)
   - Last message received timestamp
   - Reconnection attempt count

2. **Database Health**
   - Connection state
   - Query success rate
   - Error count
   - Response times

3. **System Resources**
   - Memory usage
   - CPU usage
   - Buffer sizes

4. **Business Metrics**
   - Trades processed per minute
   - Data ingestion rate
   - Error rates

### Alert Conditions

- WebSocket disconnected for > 2 minutes
- Database connection lost
- Buffer size > 1000 items
- Memory usage > 500MB
- Error rate > 10 errors/minute
- No messages received for > 5 minutes

## Troubleshooting

### Common Issues

1. **WebSocket Connection Issues**
   - Check network connectivity
   - Verify API key validity
   - Monitor reconnection attempts

2. **Database Connection Issues**
   - Check QuestDB service status
   - Verify connection parameters
   - Monitor circuit breaker state

3. **High Memory Usage**
   - Check buffer sizes
   - Monitor data processing rates
   - Review error logs

### Recovery Procedures

1. **Service Restart**
   - Graceful shutdown with SIGINT
   - Wait for buffer flush completion
   - Restart service

2. **Database Recovery**
   - Check QuestDB logs
   - Verify table schemas
   - Monitor connection health

3. **Network Issues**
   - Check network connectivity
   - Verify firewall settings
   - Monitor reconnection attempts

## Performance Considerations

### Optimization Features

- **Batch Processing**: Efficient bulk database operations
- **Connection Pooling**: Persistent database connections
- **Buffer Management**: Smart buffer sizing and flushing
- **Circuit Breakers**: Prevent resource exhaustion
- **Exponential Backoff**: Reduce system load during failures

### Resource Usage

- **Memory**: Optimized buffer management
- **CPU**: Efficient processing with minimal overhead
- **Network**: Connection reuse and keep-alive
- **Database**: Batch operations and connection pooling

## Future Enhancements

### Planned Features

1. **Metrics Export**: Prometheus/Grafana integration
2. **Distributed Tracing**: Request tracing across services
3. **Auto-scaling**: Dynamic resource allocation
4. **Multi-region**: Cross-region failover
5. **Advanced Alerting**: Email/Slack notifications

### Monitoring Integration

- **Prometheus**: Metrics collection
- **Grafana**: Visualization and dashboards
- **AlertManager**: Alert routing and management
- **Jaeger**: Distributed tracing
- **ELK Stack**: Log aggregation and analysis

## Conclusion

The enhanced resilience features provide comprehensive protection against common failure scenarios while maintaining high performance and data integrity. The self-monitoring capabilities ensure that issues are detected and resolved quickly, minimizing downtime during critical trading hours.

For additional support or questions about these features, please refer to the service logs or contact the development team.
