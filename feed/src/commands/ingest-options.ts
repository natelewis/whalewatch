import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import chalk from 'chalk';
import { WebSocketService } from '../services/polygon-websocket-client';
import { config } from '../config';
import { db } from '../db/connection';

function startWebSocket() {
  console.log(chalk.blue('Starting WebSocket for real-time option trades...'));
  const wsService = new WebSocketService();
  const wsUrl = `wss://socket.polygon.io/options`;
  wsService.connect(wsUrl);

  wsService.subscribe(config.tickers);

  process.on('SIGINT', async () => {
    console.log(chalk.yellow('\nShutting down WebSocket...'));
    wsService.close();
    console.log(chalk.yellow('Disconnecting from database...'));
    await db.disconnect();
    process.exit(0);
  });
}

async function main() {
  try {
    console.log(chalk.blue('Connecting to database...'));
    await db.connect();
    console.log(chalk.green('Database connected successfully'));

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
