#!/usr/bin/env tsx

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { createWriteStream, readdirSync, existsSync, mkdirSync, writeFileSync, createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import zlib from 'zlib';
import chalk from 'chalk';
import { Transform } from 'stream';
import { createInterface } from 'readline';
import { InsertIfNotExistsService } from '../utils/insert-if-not-exists';
import { OptionTrade } from '../types/database';
import { db } from '../db/connection';

// Configuration
const DATA_DIR = path.join(process.cwd(), 'option-trades-data');
const BUCKET_NAME = 'flatfiles';
const S3_BASE_PATH = 'us_options_opra/trades_v1';

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Extract underlying ticker from option ticker symbol
 * @param optionTicker Option ticker in format O:AAPL240315C00150000
 * @returns Underlying ticker or null if extraction fails
 */
function extractUnderlyingTicker(optionTicker: string): string | null {
  try {
    // Option ticker format: O:AAPL260116C00700000
    // Extract the underlying ticker after "O:" and before the date/expiration part
    const match = optionTicker.match(/^O:([A-Z]+)/);
    if (match && match[1]) {
      return match[1];
    }

    // Fallback: if it doesn't start with "O:", try to extract from the beginning
    // This handles cases where the format might be different
    const fallbackMatch = optionTicker.match(/^([A-Z]+)/);
    if (fallbackMatch && fallbackMatch[1]) {
      return fallbackMatch[1];
    }

    return null;
  } catch (error) {
    console.error('Error extracting underlying ticker from option ticker:', error);
    return null;
  }
}

/**
 * Convert nanosecond timestamp to Date
 * @param timestamp Nanosecond timestamp
 * @returns Date object
 */
function convertTimestamp(timestamp: number): Date {
  return new Date(timestamp / 1000000);
}

/**
 * Parse a CSV line into an OptionTrade object
 * @param line CSV line
 * @returns OptionTrade object or null if parsing fails
 */
function parseCsvLine(line: string): OptionTrade | null {
  try {
    const columns = line.split(',');
    if (columns.length < 7) {
      return null; // Skip malformed lines
    }

    const ticker = columns[0].trim();
    const conditions = columns[1].trim();
    const exchange = parseInt(columns[3].trim());
    const price = parseFloat(columns[4].trim());
    const sipTimestamp = parseInt(columns[5].trim());
    const size = parseInt(columns[6].trim());

    // Validate required fields
    if (!ticker || isNaN(price) || isNaN(sipTimestamp) || isNaN(size) || isNaN(exchange)) {
      return null;
    }

    // Extract underlying ticker
    const underlyingTicker = extractUnderlyingTicker(ticker);
    if (!underlyingTicker) {
      return null;
    }

    // Convert timestamp
    const timestamp = convertTimestamp(sipTimestamp);

    return {
      ticker,
      underlying_ticker: underlyingTicker,
      timestamp,
      price,
      size,
      conditions: conditions || '[]',
      exchange,
    };
  } catch (_error) {
    return null;
  }
}

/**
 * Process a CSV file and insert all trades to the database (if they don't already exist)
 * @param filePath Path to the CSV file
 * @returns Number of trades processed
 */
async function insertCsvTradesIfNotExists(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const trades: OptionTrade[] = [];
    let lineCount = 0;

    const fileStream = createReadStream(filePath);
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity, // Handle Windows line endings
    });

    rl.on('line', line => {
      lineCount++;

      // Skip header line
      if (lineCount === 1) {
        return;
      }

      // Skip empty lines
      if (line.trim() === '') {
        return;
      }

      const trade = parseCsvLine(line);
      if (trade) {
        trades.push(trade);
      }
    });

    rl.on('close', async () => {
      try {
        if (trades.length === 0) {
          console.log(chalk.gray(`  No valid trades found in ${path.basename(filePath)}`));
          resolve(0);
          return;
        }

        console.log(chalk.cyan(`  📊 Inserting ${trades.length} trades to database...`));

        // Process each trade individually (check if exists, insert if not)
        await InsertIfNotExistsService.processOptionTradesIfNotExists(trades);

        console.log(chalk.green(`  ✅ Successfully processed ${trades.length} trades`));
        resolve(trades.length);
      } catch (error) {
        console.error(chalk.red(`  ❌ Error inserting trades from ${path.basename(filePath)}:`), error);
        reject(error);
      }
    });

    rl.on('error', error => {
      console.error(chalk.red(`  ❌ Error reading file ${filePath}:`), error);
      reject(error);
    });
  });
}

/**
 * Create a transform stream that filters trades based on value threshold
 * @param threshold Minimum trade value threshold
 * @returns Transform stream
 */
function createTradeFilter(threshold: number): Transform {
  let isFirstLine = true;
  let headerLine = '';

  return new Transform({
    objectMode: false,
    transform(chunk: Buffer, _encoding: string, callback: (error?: Error | null) => void) {
      const lines = chunk.toString().split('\n');

      for (const line of lines) {
        if (line.trim() === '') {
          continue;
        }

        if (isFirstLine) {
          // Keep the header line
          headerLine = `${line}\n`;
          isFirstLine = false;
          this.push(headerLine);
          continue;
        }

        // Parse the CSV line
        const columns = line.split(',');
        if (columns.length < 7) {
          continue;
        } // Skip malformed lines

        try {
          const price = parseFloat(columns[4]); // price column
          const size = parseInt(columns[6]); // size column

          // Calculate trade value: price * 100 * size
          const tradeValue = price * 100 * size;

          // Only keep trades above the threshold
          if (tradeValue > threshold) {
            this.push(`${line}\n`);
          }
        } catch (_error) {
          // Skip lines that can't be parsed
          continue;
        }
      }

      callback();
    },
  });
}

/**
 * Get the oldest file date from the data directory
 * @returns Date in YYYY-MM-DD format, or today's date if no files exist
 */
function getOldestFileDate(): string {
  try {
    const files = readdirSync(DATA_DIR)
      .filter(file => file.endsWith('.csv'))
      .map(file => {
        const match = file.match(/(\d{4}-\d{2}-\d{2})\.csv$/);
        return match ? match[1] : null;
      })
      .filter(date => date !== null)
      .sort();

    if (files.length === 0) {
      // No files exist, use today's date
      return new Date().toISOString().split('T')[0];
    }

    return files[0]; // Get the first (oldest) file
  } catch (_error) {
    console.log("No existing files found, using today's date");
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Generate date range from start date backwards to end date
 * @param startDate Start date in YYYY-MM-DD format (newer date)
 * @param endDate End date in YYYY-MM-DD format (older date)
 * @returns Array of dates in YYYY-MM-DD format (newest to oldest)
 */
function generateDateRange(startDate: string, endDate: string): string[] {
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Always go backwards from start to end
  for (let d = new Date(start); d >= end; d.setDate(d.getDate() - 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }

  return dates;
}

/**
 * Download and decompress a single file, then insert the data to the database
 * @param date Date in YYYY-MM-DD format
 * @param s3Client S3 client instance
 * @param threshold Minimum trade value threshold
 * @returns Object with success status and number of trades inserted
 */
async function downloadAndInsertFile(
  date: string,
  s3Client: S3Client,
  threshold: number
): Promise<{ success: boolean; tradesInserted: number }> {
  const year = date.substring(0, 4);
  const month = date.substring(5, 7);

  const s3FilePath = `${S3_BASE_PATH}/${year}/${month}/${date}.csv.gz`;
  const decompressedFileName = `${date}.csv`;
  const decompressedFilePath = path.join(DATA_DIR, decompressedFileName);

  try {
    // Check if file already exists locally - if it does, skip processing entirely
    if (existsSync(decompressedFilePath)) {
      console.log(`⏭️  ${decompressedFileName} already exists locally, skipping...`);
      return { success: true, tradesInserted: 0 };
    }

    console.log(`📥 Downloading ${s3FilePath}...`);

    const getObjectCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3FilePath,
    });

    const { Body } = await s3Client.send(getObjectCommand);

    if (!Body) {
      console.log(`⚠️  File ${s3FilePath} not found, creating blank file...`);
      // Create a blank CSV file with just the header
      const blankContent = 'ticker,conditions,correction,exchange,price,sip_timestamp,size\n';
      writeFileSync(decompressedFilePath, blankContent);
      console.log(`✅ ${decompressedFileName} created as blank file`);
      return { success: true, tradesInserted: 0 };
    }

    console.log(chalk.cyan(`📦 Decompressing and filtering to ${decompressedFileName}...`));
    const gunzip = zlib.createGunzip();
    const filter = createTradeFilter(threshold);
    const destination = createWriteStream(decompressedFilePath);

    await pipeline(Body as NodeJS.ReadableStream, gunzip, filter, destination);

    console.log(chalk.green(`✅ ${decompressedFileName} downloaded and filtered successfully!`));

    // Now insert the data to the database
    const tradesInserted = await insertCsvTradesIfNotExists(decompressedFilePath);

    return { success: true, tradesInserted };
  } catch (error) {
    if (error instanceof Error && error.name === 'NoSuchKey') {
      console.log(`⚠️  File ${s3FilePath} not found, creating blank file...`);
      // Create a blank CSV file with just the header
      const blankContent = 'ticker,conditions,correction,exchange,price,sip_timestamp,size\n';
      writeFileSync(decompressedFilePath, blankContent);
      console.log(`✅ ${decompressedFileName} created as blank file`);
      return { success: true, tradesInserted: 0 };
    }
    console.error(`❌ Error downloading ${date}:`, error instanceof Error ? error.message : String(error));
    return { success: false, tradesInserted: 0 };
  }
}

/**
 * Main function to backfill option trades data
 * @param endDate End date in YYYY-MM-DD format
 */
async function backfillOptionTrades(endDate: string): Promise<void> {
  // Validate credentials
  const accessKey = process.env.POLYGON_ACCESS_KEY;
  const secretKey = process.env.POLYGON_SECRET_KEY;
  const threshold = parseInt(process.env.POLYGON_OPTION_TRADE_VALUE_THRESHOLD || '10000', 10);

  if (!accessKey || !secretKey) {
    console.error(chalk.red('❌ Error: Please set POLYGON_ACCESS_KEY and POLYGON_SECRET_KEY environment variables.'));
    process.exit(1);
  }

  console.log(chalk.blue(`🚀 Starting option trades backfill to ${endDate}...`));
  console.log(chalk.gray(`📁 Data directory: ${DATA_DIR}`));
  console.log(chalk.yellow(`💰 Trade value threshold: $${threshold.toLocaleString()}`));

  // Connect to database
  try {
    console.log(chalk.cyan('🔌 Connecting to QuestDB...'));
    await db.connect();
    console.log(chalk.green('✅ Connected to QuestDB'));
  } catch (error) {
    console.error(chalk.red('❌ Failed to connect to QuestDB:'), error);
    process.exit(1);
  }

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(endDate)) {
    console.error(chalk.red('❌ Error: Date must be in YYYY-MM-DD format'));
    process.exit(1);
  }

  // Get oldest file date
  const oldestDate = getOldestFileDate();
  console.log(chalk.cyan(`📅 Oldest existing file date: ${oldestDate}`));

  // Determine start date - go backwards from oldest file to target date
  const oldestDateObj = new Date(oldestDate);
  const endDateObj = new Date(endDate);

  if (oldestDateObj <= endDateObj) {
    // If oldest file is older than or equal to target date, we're done
    console.log(
      chalk.green(
        `✅ Oldest file (${oldestDate}) is older than or equal to target date (${endDate}) - nothing to backfill`
      )
    );
    console.log(chalk.gray('🔌 Disconnecting from QuestDB...'));
    await db.disconnect();
    return;
  }

  // Start from day before oldest file and go backwards to target date
  const startDateObj = new Date(oldestDate);
  startDateObj.setDate(startDateObj.getDate() - 1);
  const startDate = startDateObj.toISOString().split('T')[0];

  console.log(chalk.yellow(`📅 Oldest file (${oldestDate}) is newer than target date (${endDate})`));
  console.log(chalk.cyan(`📅 Backfilling files from ${startDate} backwards to ${endDate}`));

  // Generate date range
  const dates = generateDateRange(startDate, endDate);
  console.log(chalk.blue(`📊 Will process ${dates.length} dates`));

  // Initialize S3 client
  const s3Client = new S3Client({
    endpoint: 'https://files.polygon.io',
    region: 'us-east-1',
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
    forcePathStyle: true, // Required for S3-compatible endpoints
  });

  // Download and insert files for each date
  let successCount = 0;
  let errorCount = 0;
  let totalTradesInserted = 0;

  for (const date of dates) {
    console.log(chalk.blue(`\n📅 Processing ${date}...`));
    const result = await downloadAndInsertFile(date, s3Client, threshold);

    if (result.success) {
      successCount++;
      totalTradesInserted += result.tradesInserted;
      console.log(chalk.green(`✅ ${date} completed - ${result.tradesInserted} trades inserted`));
    } else {
      errorCount++;
      console.log(chalk.red(`❌ ${date} failed`));
    }

    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(chalk.green(`\n🎉 Backfill completed!`));
  console.log(chalk.green(`✅ Successfully processed: ${successCount} files`));
  console.log(chalk.red(`❌ Errors/Skipped: ${errorCount} files`));
  console.log(chalk.blue(`📊 Total trades inserted: ${totalTradesInserted.toLocaleString()}`));
  console.log(chalk.gray(`📁 Files saved to: ${DATA_DIR}`));

  // Disconnect from database
  try {
    await db.disconnect();
    console.log(chalk.gray('🔌 Disconnected from QuestDB'));
  } catch (error) {
    console.warn(chalk.yellow('⚠️  Warning: Error disconnecting from QuestDB:'), error);
  }
}

// Main execution
const endDate = process.argv[2];

if (!endDate) {
  console.error(chalk.red('❌ Error: Please provide an end date in YYYY-MM-DD format'));
  console.error(chalk.gray('Usage: npm run backfill-option-trades 2025-09-29'));
  process.exit(1);
}

backfillOptionTrades(endDate).catch(error => {
  console.error(chalk.red('❌ Fatal error:'), error);
  process.exit(1);
});
