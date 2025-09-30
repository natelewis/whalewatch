#!/usr/bin/env tsx

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { createWriteStream, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import zlib from 'zlib';
import chalk from 'chalk';
import { Transform } from 'stream';

// Configuration
const DATA_DIR = path.join(process.cwd(), 'option-trades-data');
const BUCKET_NAME = 'flatfiles';
const S3_BASE_PATH = 'us_options_opra/trades_v1';

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
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
    transform(chunk: Buffer, encoding: string, callback: Function) {
      const lines = chunk.toString().split('\n');

      for (const line of lines) {
        if (line.trim() === '') continue;

        if (isFirstLine) {
          // Keep the header line
          headerLine = line + '\n';
          isFirstLine = false;
          this.push(headerLine);
          continue;
        }

        // Parse the CSV line
        const columns = line.split(',');
        if (columns.length < 7) continue; // Skip malformed lines

        try {
          const price = parseFloat(columns[4]); // price column
          const size = parseInt(columns[6]); // size column

          // Calculate trade value: price * 100 * size
          const tradeValue = price * 100 * size;

          // Only keep trades above the threshold
          if (tradeValue > threshold) {
            this.push(line + '\n');
          }
        } catch (error) {
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

    return files[0];
  } catch (error) {
    console.log("No existing files found, using today's date");
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Generate date range from start date to end date
 * @param startDate Start date in YYYY-MM-DD format
 * @param endDate End date in YYYY-MM-DD format
 * @returns Array of dates in YYYY-MM-DD format
 */
function generateDateRange(startDate: string, endDate: string): string[] {
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Determine direction based on which date is earlier
  if (start <= end) {
    // Forward direction
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split('T')[0]);
    }
  } else {
    // Backward direction
    for (let d = new Date(start); d >= end; d.setDate(d.getDate() - 1)) {
      dates.push(d.toISOString().split('T')[0]);
    }
  }

  return dates;
}

/**
 * Download and decompress a single file
 * @param date Date in YYYY-MM-DD format
 * @param s3Client S3 client instance
 * @param threshold Minimum trade value threshold
 * @returns Success status
 */
async function downloadAndDecompressFile(date: string, s3Client: S3Client, threshold: number): Promise<boolean> {
  const year = date.substring(0, 4);
  const month = date.substring(5, 7);

  const s3FilePath = `${S3_BASE_PATH}/${year}/${month}/${date}.csv.gz`;
  const localFileName = `${date}.csv.gz`;
  const decompressedFileName = `${date}.csv`;

  const localFilePath = path.join(DATA_DIR, localFileName);
  const decompressedFilePath = path.join(DATA_DIR, decompressedFileName);

  // Skip if decompressed file already exists
  if (existsSync(decompressedFilePath)) {
    console.log(`✅ ${decompressedFileName} already exists, skipping...`);
    return true;
  }

  try {
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
      return true;
    }

    console.log(chalk.cyan(`📦 Decompressing and filtering to ${decompressedFileName}...`));
    const gunzip = zlib.createGunzip();
    const filter = createTradeFilter(threshold);
    const destination = createWriteStream(decompressedFilePath);

    await pipeline(Body, gunzip, filter, destination);

    console.log(chalk.green(`✅ ${decompressedFileName} downloaded, filtered, and saved successfully!`));
    return true;
  } catch (error) {
    if (error.name === 'NoSuchKey') {
      console.log(`⚠️  File ${s3FilePath} not found, creating blank file...`);
      // Create a blank CSV file with just the header
      const blankContent = 'ticker,conditions,correction,exchange,price,sip_timestamp,size\n';
      writeFileSync(decompressedFilePath, blankContent);
      console.log(`✅ ${decompressedFileName} created as blank file`);
      return true;
    }
    console.error(`❌ Error downloading ${date}:`, error.message);
    return false;
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

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(endDate)) {
    console.error(chalk.red('❌ Error: Date must be in YYYY-MM-DD format'));
    process.exit(1);
  }

  // Get oldest file date
  const oldestDate = getOldestFileDate();
  console.log(chalk.cyan(`📅 Oldest existing file date: ${oldestDate}`));

  // Determine start date
  let startDate: string;
  const oldestDateObj = new Date(oldestDate);
  const endDateObj = new Date(endDate);

  if (oldestDateObj > endDateObj) {
    // If oldest file is newer than end date, start from day before oldest file
    const startDateObj = new Date(oldestDate);
    startDateObj.setDate(startDateObj.getDate() - 1);
    startDate = startDateObj.toISOString().split('T')[0];
    console.log(chalk.yellow(`📅 Oldest file (${oldestDate}) is newer than end date (${endDate})`));
    console.log(chalk.cyan(`📅 Downloading files from ${startDate} to ${endDate}`));
  } else {
    // If end date is newer than oldest file, start from day after oldest file
    const startDateObj = new Date(oldestDate);
    startDateObj.setDate(startDateObj.getDate() + 1);
    startDate = startDateObj.toISOString().split('T')[0];
    console.log(chalk.yellow(`📅 End date (${endDate}) is newer than oldest file (${oldestDate})`));
    console.log(chalk.cyan(`📅 Downloading files from ${startDate} to ${endDate}`));
  }

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

  // Download files for each date
  let successCount = 0;
  let errorCount = 0;

  for (const date of dates) {
    const success = await downloadAndDecompressFile(date, s3Client, threshold);
    if (success) {
      successCount++;
    } else {
      errorCount++;
    }

    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(chalk.green(`\n🎉 Backfill completed!`));
  console.log(chalk.green(`✅ Successfully processed: ${successCount} files`));
  console.log(chalk.red(`❌ Errors/Skipped: ${errorCount} files`));
  console.log(chalk.gray(`📁 Files saved to: ${DATA_DIR}`));
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
