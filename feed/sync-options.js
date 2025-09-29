#!/usr/bin/env node

// Override environment variables for option syncing
process.env.POLYGON_SKIP_OPTION_TRADES = 'false';
process.env.POLYGON_SKIP_OPTION_QUOTES = 'false';
process.env.POLYGON_SKIP_OPTION_CONTRACTS = 'false';

// Import and run the backfill service
const { BackfillService } = require('./dist/services/backfill');

async function main() {
  console.log('🔄 Starting option trade syncing for AAPL...');

  const backfillService = new BackfillService();

  try {
    // Run backfill for AAPL which will include option contracts and trades
    await backfillService.backfillTicker('AAPL');
    console.log('✅ Option syncing completed successfully');
  } catch (error) {
    console.error('❌ Option syncing failed:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
