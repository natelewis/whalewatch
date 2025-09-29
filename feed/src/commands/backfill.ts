#!/usr/bin/env tsx

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { BackfillService } from '../services/backfill';
import chalk from 'chalk';

function parseDate(dateStr: string): Date {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}. Please use YYYY-MM-DD format.`);
  }
  return date;
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
  } else if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${seconds}s`;
  }
}

function showUsage() {
  console.log(chalk.blue('Usage:'));
  console.log('  npm run backfill                    # Backfill all tickers from last sync');
  console.log('  npm run backfill <ticker>           # Backfill specific ticker from last sync');
  console.log('  npm run backfill <ticker> <date>    # Backfill specific ticker TO specific date');
  console.log('  npm run backfill <date>             # Backfill all tickers TO specific date');
  console.log('');
  console.log(chalk.blue('Date format: YYYY-MM-DD (e.g., 2025-09-01)'));
  console.log('');
  console.log(chalk.blue('Examples:'));
  console.log('  npm run backfill AAPL 2025-09-01        # Backfill AAPL TO 2025-09-01');
  console.log('  npm run backfill 2025-09-01             # Backfill all tickers TO 2025-09-01');
  console.log('');
  console.log(
    chalk.yellow(
      'Note: All dates are treated as "TO" dates - backfill will ensure data exists through the specified date.'
    )
  );
  console.log(chalk.yellow('The system will automatically determine the starting point based on existing data.'));
}

async function main() {
  const args = process.argv.slice(2);

  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    showUsage();
    return;
  }

  let ticker: string | undefined;
  let date: Date | undefined;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (!ticker && !date) {
      // First argument could be ticker or date
      if (arg.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // It's a date
        date = parseDate(arg);
      } else {
        // It's a ticker
        ticker = arg;
      }
    } else if (!date) {
      // Second argument should be date
      date = parseDate(arg);
    }
  }

  console.log(chalk.blue('Starting data backfill...'));

  if (ticker && date) {
    console.log(
      chalk.yellow(`Backfilling data for ${ticker} TO ${date.toISOString().split('T')[0]} (from oldest available data)`)
    );
  } else if (ticker) {
    console.log(chalk.yellow(`Backfilling data for specific ticker: ${ticker}`));
  } else if (date) {
    console.log(
      chalk.yellow(
        `Backfilling data for all tickers TO ${
          date.toISOString().split('T')[0]
        } (ensuring all tickers have data through this date)`
      )
    );
  } else {
    console.log(chalk.yellow('Backfilling data for all configured tickers'));
  }

  const backfillService = new BackfillService();
  const startTime = Date.now();

  try {
    if (ticker && date) {
      await backfillService.backfillTickerToDate(ticker, date);
    } else if (ticker) {
      await backfillService.backfillTicker(ticker);
    } else if (date) {
      await backfillService.backfillAllToDate(date);
    } else {
      await backfillService.backfillAll();
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    const durationFormatted = formatDuration(duration);

    console.log(chalk.green('Backfill completed successfully'));
    console.log(chalk.blue(`Total execution time: ${durationFormatted}`));
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    const durationFormatted = formatDuration(duration);

    console.error(chalk.red('Backfill failed:'), error);
    console.log(chalk.blue(`Execution time before failure: ${durationFormatted}`));
    process.exit(1);
  }
}

main().catch(error => {
  console.error(chalk.red('Unhandled error:'), error);
  process.exit(1);
});
