import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import chalk from 'chalk';
import { WebSocketService } from '../services/polygon-websocket-client';
import { db } from '../db/connection';
import { healthMonitor } from '../services/health-monitor';

function startWebSocket() {
  console.log(chalk.blue('Starting WebSocket for real-time option trades...'));
  const wsService = new WebSocketService();
  const wsUrl = `wss://socket.polygon.io/options`;

  // Set up health monitoring
  healthMonitor.setServices(wsService, db);
  healthMonitor.startMonitoring(60000); // Check every minute

  wsService.connect(wsUrl);
  wsService.subscribe();

  // Add health status endpoint
  process.on('SIGUSR1', async () => {
    console.log(chalk.cyan('\n=== HEALTH STATUS ==='));
    console.log(await healthMonitor.getHealthSummary());
    console.log(chalk.cyan('===================\n'));
  });

  // Add graceful shutdown
  process.on('SIGINT', async () => {
    console.log(chalk.yellow('\nShutting down WebSocket service...'));

    // Stop health monitoring first
    healthMonitor.stopMonitoring();

    // Close WebSocket
    wsService.close();

    // Disconnect from database
    console.log(chalk.yellow('Disconnecting from database...'));
    await db.disconnect();

    console.log(chalk.green('Shutdown complete'));
    process.exit(0);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', error => {
    console.error(chalk.red('Uncaught Exception:'), error);
    console.log(chalk.yellow('Attempting graceful shutdown...'));

    healthMonitor.stopMonitoring();
    wsService.close();
    db.disconnect().finally(() => {
      process.exit(1);
    });
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error(chalk.red('Unhandled Rejection at:'), promise, chalk.red('reason:'), reason);
  });
}

async function main() {
  try {
    console.log(chalk.blue('Connecting to database...'));
    await db.connect();
    console.log(chalk.green('Database connected successfully'));

    console.log(chalk.blue('Executing database schema...'));
    await db.executeSchema();
    console.log(chalk.green('Database schema executed successfully'));

    startWebSocket();
  } catch (error) {
    console.error(chalk.red('Failed to connect to database:'), error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error(chalk.red('Unhandled error in ingestion service:'), error);
  process.exit(1);
});
