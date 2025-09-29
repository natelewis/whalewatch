import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import chalk from 'chalk';
import { OptionIngestionService } from '../services/option-ingestion';
import { config } from '../config';
import { db } from '../db/connection';

async function catchUpTrades() {
  console.log(chalk.blue('Catching up on missed option trades...'));
  const optionIngestionService = new OptionIngestionService();

  await db.connect();
  for (const ticker of config.tickers) {
    try {
      const latestTrade = await optionIngestionService.getLatestTradeForUnderlying(ticker);
      const now = new Date();

      if (latestTrade) {
        if (now > latestTrade) {
          console.log(`Catching up ${ticker} from ${latestTrade.toISOString()} to ${now.toISOString()}`);
          await optionIngestionService.backfillOptionTrades(ticker, latestTrade);
        } else {
          console.log(`${ticker} is already up to date.`);
        }
      } else {
        console.log(`No existing trades for ${ticker}, skipping catch-up. Run backfill to get historical data.`);
      }
    } catch (error) {
      console.error(chalk.red(`Error catching up trades for ${ticker}:`), error);
    }
  }
  await db.disconnect();
}

async function main() {
  await catchUpTrades();
}

main().catch(error => {
  console.error(chalk.red('Unhandled error in catch-up service:'), error);
  process.exit(1);
});
