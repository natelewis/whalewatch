# Feed Service Testing

## Overview

The feed service now has a comprehensive testing framework set up following the same patterns as the server tests. The testing infrastructure includes:

- **Test table prefixing**: All database tables are prefixed with `test_` when running tests
- **Automatic table truncation**: Test tables are truncated before each test to ensure clean state
- **Mocked external dependencies**: Polygon API and other external services are mocked
- **Test utilities**: Helper functions for database operations and test data generation

## Running Tests

### Run all working tests
```bash
make test-feed
```

### Run specific test files
```bash
cd feed && npm test -- --testPathPattern="(logger|config).test.ts"
```

### Run tests in watch mode
```bash
cd feed && npm run test:watch
```

### Run tests with coverage
```bash
cd feed && npm run test:coverage
```

## Test Structure

```
src/__tests__/
├── setup.ts                    # Jest setup file (runs before each test)
├── test-utils/
│   ├── database.ts             # Database test utilities
│   ├── config.ts               # Test configuration and data generators
│   └── config.test.ts          # Tests for test utilities
├── services/
│   ├── option-ingestion.test.ts
│   └── polygon-client.test.ts
├── db/
│   └── connection.test.ts
└── utils/
    └── logger.test.ts
```

## Test Tables

The following test tables are created and managed:

- `test_stock_trades`
- `test_stock_aggregates`
- `test_option_contracts`
- `test_option_trades`
- `test_option_quotes`
- `test_sync_state`

## Current Status

✅ **Working Tests:**
- Logger utility tests (8 tests)
- Test configuration utilities (11 tests)

⚠️ **Tests with Issues:**
- Service tests (polygon-client, option-ingestion) - ES module import issues
- Database connection tests - Mocking issues

## Test Utilities

### Database Utilities (`test-utils/database.ts`)

- `createTestTables()`: Create all test tables
- `dropTestTables()`: Drop all test tables
- `truncateTestTables()`: Truncate all test tables
- `insertTestData()`: Insert test data into a table
- `getTestTableData()`: Retrieve data from a test table
- `getTestTableRowCount()`: Get row count for a test table

### Configuration Utilities (`test-utils/config.ts`)

- `getTestTableName()`: Get table name with test prefix
- `testDataGenerators`: Generate test data for different entity types

## Writing Tests

### Example Test Structure

```typescript
import { setupTestEnvironment, cleanupTestEnvironment } from '../test-utils/database';
import { testDataGenerators } from '../test-utils/config';

describe('MyService', () => {
  beforeAll(async () => {
    await setupTestEnvironment();
  });

  afterAll(async () => {
    await cleanupTestEnvironment();
  });

  it('should do something', async () => {
    // Test implementation
  });
});
```

### Using Test Data Generators

```typescript
import { testDataGenerators } from '../test-utils/config';

const testContract = testDataGenerators.generateOptionContract({
  ticker: 'AAPL240315C00150000',
  underlying_ticker: 'AAPL'
});
```

## Known Issues

1. **ES Module Dependencies**: Some tests fail due to ES module imports in dependencies like `p-limit`
2. **Mocking Complex Services**: Some service tests need better mocking strategies
3. **Database Connection Mocking**: The database connection tests need proper axios mocking

## Next Steps

1. Fix ES module import issues in Jest configuration
2. Improve service test mocking strategies
3. Add more comprehensive test coverage
4. Set up CI/CD integration for automated testing

## Environment Variables

Tests use the same environment variables as the main application, but with test table prefixes automatically applied.

## Coverage

The test suite is configured with 0% coverage thresholds initially to allow the framework to be established. Coverage thresholds can be increased as more tests are added.
