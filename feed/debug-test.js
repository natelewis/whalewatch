// Simple debug test to check database connection and table creation
const { setupTestEnvironment, cleanupTestEnvironment } = require('./dist/__tests__/test-utils/database.js');
const { UpsertService } = require('./dist/utils/upsert.js');
const { db } = require('./dist/db/connection.js');

async function debugTest() {
  try {
    console.log('Setting up test environment...');
    await setupTestEnvironment();
    console.log('Test environment setup complete');

    // Test simple query
    console.log('Testing database connection...');
    const result = await db.query('SELECT 1 as test');
    console.log('Database query result:', result);

    // Test table creation
    console.log('Checking if test_option_contracts table exists...');
    const tableCheck = await db.query("SELECT table_name FROM tables() WHERE table_name = 'test_option_contracts'");
    console.log('Table check result:', tableCheck);

    // Test inserting a simple contract
    console.log('Testing contract insertion...');
    const testContract = {
      ticker: 'O:TEST240315C00150000',
      contract_type: 'call',
      exercise_style: 'american',
      expiration_date: new Date('2024-03-15'),
      shares_per_contract: 100,
      strike_price: 150.0,
      underlying_ticker: 'TEST',
    };

    await UpsertService.batchUpsertOptionContracts([testContract]);
    console.log('Contract insertion completed');

    // Check if contract was inserted
    console.log('Checking if contract was inserted...');
    const contractCheck = await db.query("SELECT * FROM test_option_contracts WHERE underlying_ticker = 'TEST'");
    console.log('Contract check result:', contractCheck);

    console.log('Cleaning up...');
    await cleanupTestEnvironment();
    console.log('Debug test completed successfully');
  } catch (error) {
    console.error('Debug test failed:', error);
    process.exit(1);
  }
}

debugTest();
