interface LogLevel {
  ERROR: 'error';
  WARN: 'warn';
  INFO: 'info';
  DEBUG: 'debug';
}

interface LogEntry {
  timestamp: string;
  level: keyof LogLevel;
  message: string;
  service: string;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string | undefined;
  };
}

export class Logger {
  private serviceName: string;
  private logLevel: keyof LogLevel = 'INFO';

  constructor(serviceName: string, logLevel: keyof LogLevel = 'INFO') {
    this.serviceName = serviceName;
    this.logLevel = logLevel;
  }

  private shouldLog(level: keyof LogLevel): boolean {
    const levels: Record<keyof LogLevel, number> = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3,
    };

    return levels[level] <= levels[this.logLevel];
  }

  private formatLog(level: keyof LogLevel, message: string, data?: Record<string, unknown>, error?: Error): LogEntry {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.serviceName,
    };

    if (data) {
      logEntry.data = data;
    }

    if (error) {
      logEntry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack || undefined,
      };
    }

    return logEntry;
  }

  private output(level: keyof LogLevel, message: string, data?: Record<string, unknown>, error?: Error): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const logEntry = this.formatLog(level, message, data, error);

    // Use different console methods based on level
    switch (level) {
      case 'ERROR':
        console.error(JSON.stringify(logEntry));
        break;
      case 'WARN':
        console.warn(JSON.stringify(logEntry));
        break;
      case 'INFO':
        console.log(JSON.stringify(logEntry));
        break;
      case 'DEBUG':
        console.debug(JSON.stringify(logEntry));
        break;
    }
  }

  error(message: string, data?: Record<string, unknown>, error?: Error): void {
    this.output('ERROR', message, data, error);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.output('WARN', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.output('INFO', message, data);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.output('DEBUG', message, data);
  }

  // Specialized logging methods for common scenarios
  websocketEvent(event: string, data?: Record<string, unknown>): void {
    this.info(`WebSocket ${event}`, { event, ...data });
  }

  databaseOperation(operation: string, query?: string, duration?: number, error?: Error): void {
    const data: Record<string, unknown> = { operation };
    if (query) {
      data.query = query;
    }
    if (duration) {
      data.duration = duration;
    }

    if (error) {
      this.error(`Database ${operation} failed`, data, error);
    } else {
      this.info(`Database ${operation} completed`, data);
    }
  }

  tradeProcessed(ticker: string, price: number, size: number, value: number): void {
    this.info('Trade processed', {
      ticker,
      price,
      size,
      value,
      tradeValue: price * 100 * size,
    });
  }

  healthCheck(component: string, status: 'healthy' | 'unhealthy', details?: Record<string, unknown>): void {
    const data = { component, status, ...details };
    if (status === 'healthy') {
      this.info('Health check passed', data);
    } else {
      this.warn('Health check failed', data);
    }
  }

  performanceMetric(metric: string, value: number, unit: string = 'ms'): void {
    this.info('Performance metric', { metric, value, unit });
  }

  alert(alertType: string, message: string, severity: 'low' | 'medium' | 'high' | 'critical'): void {
    this.warn(`ALERT [${severity.toUpperCase()}] ${alertType}`, {
      alertType,
      message,
      severity,
    });
  }
}

// Create logger instances for different services
export const websocketLogger = new Logger('websocket', 'INFO');
export const databaseLogger = new Logger('database', 'INFO');
export const healthLogger = new Logger('health', 'INFO');
export const systemLogger = new Logger('system', 'INFO');

// Utility function to create a logger for a specific service
export function createLogger(serviceName: string, logLevel: keyof LogLevel = 'INFO'): Logger {
  return new Logger(serviceName, logLevel);
}
