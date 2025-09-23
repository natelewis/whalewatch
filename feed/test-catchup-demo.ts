#!/usr/bin/env tsx

/**
 * Demo script to show how the catch-up behavior works
 * 
 * This script demonstrates the key concepts without requiring a full database setup
 */

import chalk from 'chalk';

interface SyncState {
  ticker: string;
  last_aggregate_timestamp?: Date;
  last_sync: Date;
  is_streaming: boolean;
}

class CatchupDemo {
  private ticker = 'AAPL';
  private now = new Date();
  private threeDaysAgo = new Date(this.now.getTime() - 3 * 24 * 60 * 60 * 1000);

  async runDemo(): Promise<void> {
    console.log(chalk.blue('🎬 Catch-up Behavior Demo'));
    console.log(chalk.blue('='.repeat(50)));
    
    // Scenario setup
    this.printScenario();
    
    // Step 1: Initial backfill state
    this.printInitialState();
    
    // Step 2: Simulate catch-up logic
    this.printCatchupLogic();
    
    // Step 3: Show the result
    this.printResult();
    
    // Step 4: Explain the behavior
    this.printExplanation();
  }

  private printScenario(): void {
    console.log(chalk.yellow('\n📋 Scenario:'));
    console.log(chalk.gray('1. You ran backfill 3 days ago'));
    console.log(chalk.gray('2. System was stopped'));
    console.log(chalk.gray('3. You run "make ingest" now'));
    console.log(chalk.gray('4. System should catch up from 3 days ago to now'));
    console.log(chalk.gray('5. Then continue with WebSocket streaming'));
  }

  private printInitialState(): void {
    console.log(chalk.blue('\n🔍 Initial State (3 days ago):'));
    
    const syncState: SyncState = {
      ticker: this.ticker,
      last_aggregate_timestamp: this.threeDaysAgo,
      last_sync: this.threeDaysAgo,
      is_streaming: false
    };
    
    console.log(chalk.gray(`  Ticker: ${syncState.ticker}`));
    console.log(chalk.gray(`  Last aggregate: ${syncState.last_aggregate_timestamp?.toISOString()}`));
    console.log(chalk.gray(`  Last sync: ${syncState.last_sync.toISOString()}`));
    console.log(chalk.gray(`  Is streaming: ${syncState.is_streaming}`));
  }

  private printCatchupLogic(): void {
    console.log(chalk.blue('\n⚙️  Catch-up Logic (from DataIngestionService):'));
    
    // Simulate the catchUpTickerData method logic
    const lastSync = this.threeDaysAgo;
    const now = this.now;
    const minDelayMinutes = 0; // No delay for demo
    const endTime = minDelayMinutes > 0 ? new Date(now.getTime() - minDelayMinutes * 60 * 1000) : now;
    
    console.log(chalk.gray(`  1. Get last sync time: ${lastSync.toISOString()}`));
    console.log(chalk.gray(`  2. Calculate end time: ${endTime.toISOString()}`));
    console.log(chalk.gray(`  3. Time gap: ${this.formatDuration(endTime.getTime() - lastSync.getTime())}`));
    console.log(chalk.gray(`  4. Fetch historical data from Polygon API`));
    console.log(chalk.gray(`  5. Insert missing aggregates into database`));
    console.log(chalk.gray(`  6. Update sync state with new timestamp`));
    console.log(chalk.gray(`  7. Start WebSocket streaming for real-time data`));
  }

  private printResult(): void {
    console.log(chalk.blue('\n✅ Result After Catch-up:'));
    
    const updatedSyncState: SyncState = {
      ticker: this.ticker,
      last_aggregate_timestamp: this.now, // Updated to now
      last_sync: this.now, // Updated to now
      is_streaming: true // Now streaming
    };
    
    console.log(chalk.gray(`  Ticker: ${updatedSyncState.ticker}`));
    console.log(chalk.gray(`  Last aggregate: ${updatedSyncState.last_aggregate_timestamp?.toISOString()}`));
    console.log(chalk.gray(`  Last sync: ${updatedSyncState.last_sync.toISOString()}`));
    console.log(chalk.gray(`  Is streaming: ${updatedSyncState.is_streaming}`));
    
    const dataFilled = this.formatDuration(this.now.getTime() - this.threeDaysAgo.getTime());
    console.log(chalk.green(`  📊 Data filled: ${dataFilled} of missing data`));
  }

  private printExplanation(): void {
    console.log(chalk.blue('\n💡 Explanation:'));
    console.log(chalk.green('✅ YES - "make ingest" DOES catch up from the last run'));
    console.log(chalk.gray('  • It reads the sync_state table to find last_aggregate_timestamp'));
    console.log(chalk.gray('  • It calculates the gap from last sync to now'));
    console.log(chalk.gray('  • It fetches missing historical data from Polygon API'));
    console.log(chalk.gray('  • It fills the gap with minute-by-minute aggregates'));
    console.log(chalk.gray('  • It updates the sync state with new timestamps'));
    console.log(chalk.gray('  • It starts WebSocket streaming for real-time data'));
    
    console.log(chalk.blue('\n🔧 Key Code Locations:'));
    console.log(chalk.gray('  • DataIngestionService.startIngestion() - calls catchUpData()'));
    console.log(chalk.gray('  • DataIngestionService.catchUpData() - loops through tickers'));
    console.log(chalk.gray('  • DataIngestionService.catchUpTickerData() - fills gaps'));
    console.log(chalk.gray('  • sync_state table - tracks last_aggregate_timestamp'));
    
    console.log(chalk.blue('\n🧪 Testing:'));
    console.log(chalk.gray('  • Run: npx tsx test-catchup-unit.ts (unit tests)'));
    console.log(chalk.gray('  • Run: npx tsx test-catchup-behavior.ts (integration test)'));
    console.log(chalk.gray('  • Run: npx tsx test-catchup-demo.ts (this demo)'));
  }

  private formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

// Run the demo
async function main() {
  const demo = new CatchupDemo();
  await demo.runDemo();
}

// Only run if this file is executed directly
if (require.main === module) {
  main();
}

export { CatchupDemo };

