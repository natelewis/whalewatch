import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import chalk from 'chalk';
import { WebSocketService } from '../services/web-socket';
import { config } from '../config';

function startWebSocket() {
  console.log(chalk.blue('Starting WebSocket for real-time option trades...'));
  const wsService = new WebSocketService();
  const wsUrl = `wss://socket.polygon.io/options`;
  wsService.connect(wsUrl);

  wsService.subscribe(config.tickers);

  process.on('SIGINT', () => {
    console.log(chalk.yellow('\nShutting down WebSocket...'));
    wsService.close();
    process.exit(0);
  });
}

async function main() {
  startWebSocket();
}

main().catch(error => {
  console.error(chalk.red('Unhandled error in ingestion service:'), error);
  process.exit(1);
});
