#!/usr/bin/env node

// Override environment variables for option syncing
process.env.POLYGON_SKIP_OPTION_TRADES = 'false';
process.env.POLYGON_SKIP_OPTION_QUOTES = 'false';
process.env.POLYGON_SKIP_OPTION_CONTRACTS = 'false';

// Import required modules
const { OptionIngestionService } = require('./dist/services/option-ingestion');
const { db } = require('./dist/db/connection');

async function main() {
  console.log('🔄 Starting direct option ingestion for TSLA...');

  try {
    // Connect to database
    await db.connect();
    console.log('✅ Connected to QuestDB');

    // Create option ingestion service
    const optionService = new OptionIngestionService();

    // Set date range - let's get recent option data
    const endDate = new Date();
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

    console.log(`📅 Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

    // Process option contracts and trades
    await optionService.processOptionContractsBackfill('TSLA', startDate, endDate);

    console.log('✅ Option ingestion completed successfully');
  } catch (error) {
    console.error('❌ Option ingestion failed:', error);
    process.exit(1);
  } finally {
    await db.disconnect();
    console.log('🔌 Disconnected from QuestDB');
  }
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
