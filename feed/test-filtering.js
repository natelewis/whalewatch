#!/usr/bin/env node

// Override environment variables for option syncing with threshold
process.env.POLYGON_SKIP_OPTION_TRADES = 'false';
process.env.POLYGON_SKIP_OPTION_QUOTES = 'false';
process.env.POLYGON_SKIP_OPTION_CONTRACTS = 'false';
process.env.POLYGON_OPTION_TRADE_VALUE_THRESHOLD = '10000'; // $10,000 threshold

// Import required modules
const { OptionIngestionService } = require('./dist/services/option-ingestion');
const { db } = require('./dist/db/connection');

async function main() {
  console.log('🔄 Testing option trade filtering with $10,000 threshold...');

  try {
    // Connect to database
    await db.connect();
    console.log('✅ Connected to QuestDB');

    // Create option ingestion service
    const optionService = new OptionIngestionService();

    // Set date range - let's get recent option data
    const endDate = new Date();
    const startDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago

    console.log(`📅 Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
    console.log(`💰 Threshold: $${process.env.POLYGON_OPTION_TRADE_VALUE_THRESHOLD}`);

    // Process option contracts and trades
    await optionService.processOptionContractsBackfill('TSLA', startDate, endDate);

    console.log('✅ Option ingestion with filtering completed successfully');
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
