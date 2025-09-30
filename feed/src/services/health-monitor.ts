import { WebSocketService } from './polygon-websocket-client';
import { QuestDBConnection } from '../db/connection';

interface SystemHealth {
  timestamp: Date;
  websocket: {
    connected: boolean;
    lastMessageReceived: Date | null;
    bufferSize: number;
    totalTradesProcessed: number;
    totalErrors: number;
    uptime: number;
    reconnectAttempts: number;
  };
  database: {
    connected: boolean;
    lastSuccessfulQuery: Date | null;
    totalQueries: number;
    totalErrors: number;
    connectionAttempts: number;
    uptime: number;
  };
  system: {
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
  };
  alerts: string[];
}

export class HealthMonitor {
  private wsService: WebSocketService | null = null;
  private dbConnection: QuestDBConnection | null = null;
  private startTime = Date.now();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private alertThresholds = {
    maxBufferSize: 1000,
    maxErrorsPerMinute: 10,
    maxReconnectAttempts: 5,
    maxDatabaseErrors: 5,
    maxMemoryUsageMB: 500,
    maxNoMessageMinutes: 5,
  };

  constructor() {
    this.startTime = Date.now();
  }

  setServices(wsService: WebSocketService, dbConnection: QuestDBConnection): void {
    this.wsService = wsService;
    this.dbConnection = dbConnection;
  }

  startMonitoring(intervalMs = 60000): void {
    if (this.monitoringInterval) {
      console.log('Health monitoring already started');
      return;
    }

    console.log(`Starting health monitoring with ${intervalMs}ms interval`);

    this.monitoringInterval = setInterval(() => {
      this.performHealthCheck();
    }, intervalMs);

    // Perform initial health check
    this.performHealthCheck();
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('Health monitoring stopped');
    }
  }

  private async performHealthCheck(): Promise<void> {
    try {
      const healthStatus = await this.getSystemHealth();
      const alerts = this.generateAlerts(healthStatus);

      if (alerts.length > 0) {
        console.warn('Health Check Alerts:', alerts);
      }

      // Log comprehensive health status every 5 minutes
      const now = Date.now();
      if (Math.floor((now - this.startTime) / 300000) % 1 === 0) {
        console.log('=== SYSTEM HEALTH REPORT ===');
        console.log(JSON.stringify(healthStatus, null, 2));
        console.log('============================');
      }
    } catch (error) {
      console.error('Error performing health check:', error);
    }
  }

  public async getSystemHealth(): Promise<SystemHealth> {
    const wsHealth = this.wsService?.getHealthStatus() || {
      websocketConnected: false,
      lastMessageReceived: null,
      bufferSize: 0,
      totalTradesProcessed: 0,
      totalErrors: 0,
      uptime: 0,
      reconnectAttempts: 0,
    };

    const dbHealth = this.dbConnection?.getHealthStatus() || {
      isConnected: false,
      lastSuccessfulQuery: null,
      totalQueries: 0,
      totalErrors: 0,
      connectionAttempts: 0,
      uptime: 0,
    };

    const systemUptime = Date.now() - this.startTime;
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      timestamp: new Date(),
      websocket: {
        connected: wsHealth.websocketConnected,
        lastMessageReceived: wsHealth.lastMessageReceived,
        bufferSize: wsHealth.bufferSize,
        totalTradesProcessed: wsHealth.totalTradesProcessed,
        totalErrors: wsHealth.totalErrors,
        uptime: wsHealth.uptime,
        reconnectAttempts: wsHealth.reconnectAttempts,
      },
      database: {
        connected: dbHealth.isConnected,
        lastSuccessfulQuery: dbHealth.lastSuccessfulQuery,
        totalQueries: dbHealth.totalQueries,
        totalErrors: dbHealth.totalErrors,
        connectionAttempts: dbHealth.connectionAttempts,
        uptime: dbHealth.uptime,
      },
      system: {
        uptime: systemUptime,
        memoryUsage,
        cpuUsage,
      },
      alerts: [],
    };
  }

  private generateAlerts(health: SystemHealth): string[] {
    const alerts: string[] = [];

    // WebSocket alerts
    if (!health.websocket.connected) {
      alerts.push('WebSocket is not connected');
    }

    if (health.websocket.bufferSize > this.alertThresholds.maxBufferSize) {
      alerts.push(`WebSocket buffer size is high: ${health.websocket.bufferSize}`);
    }

    if (health.websocket.reconnectAttempts > this.alertThresholds.maxReconnectAttempts) {
      alerts.push(`WebSocket has exceeded max reconnection attempts: ${health.websocket.reconnectAttempts}`);
    }

    if (health.websocket.lastMessageReceived) {
      const minutesSinceLastMessage = (Date.now() - health.websocket.lastMessageReceived.getTime()) / 60000;
      if (minutesSinceLastMessage > this.alertThresholds.maxNoMessageMinutes) {
        alerts.push(`No WebSocket messages received for ${minutesSinceLastMessage.toFixed(1)} minutes`);
      }
    }

    // Database alerts
    if (!health.database.connected) {
      alerts.push('Database is not connected');
    }

    if (health.database.totalErrors > this.alertThresholds.maxDatabaseErrors) {
      alerts.push(`Database has ${health.database.totalErrors} errors`);
    }

    // System alerts
    const memoryUsageMB = health.system.memoryUsage.heapUsed / 1024 / 1024;
    if (memoryUsageMB > this.alertThresholds.maxMemoryUsageMB) {
      alerts.push(`High memory usage: ${memoryUsageMB.toFixed(2)}MB`);
    }

    return alerts;
  }

  public getHealthSummary(): string {
    const health = this.getSystemHealth();
    return `
System Health Summary:
- WebSocket: ${health.websocket.connected ? 'Connected' : 'Disconnected'}
- Database: ${health.database.connected ? 'Connected' : 'Disconnected'}
- Buffer Size: ${health.websocket.bufferSize}
- Trades Processed: ${health.websocket.totalTradesProcessed}
- Total Errors: ${health.websocket.totalErrors + health.database.totalErrors}
- Uptime: ${Math.floor(health.system.uptime / 1000)}s
- Memory Usage: ${(health.system.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB
    `.trim();
  }

  public isHealthy(): boolean {
    const health = this.getSystemHealth();
    return (
      health.websocket.connected &&
      health.database.connected &&
      health.websocket.bufferSize < this.alertThresholds.maxBufferSize &&
      health.websocket.reconnectAttempts < this.alertThresholds.maxReconnectAttempts
    );
  }
}

export const healthMonitor = new HealthMonitor();
