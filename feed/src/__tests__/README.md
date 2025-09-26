# Feed Service Testing

This directory contains the test suite for the WhaleWatch feed service.

## Test Setup

The test framework is configured to:

1. **Use test table prefixes**: All database tables are prefixed with `test_` when running tests
2. **Truncate test tables**: Before each test, all test tables are truncated to ensure clean state
3. **Mock external dependencies**: Polygon API and other external services are mocked
4. **Provide test utilities**: Helper functions for database operations and test data generation

## Running Tests

### Run all tests
```bash
make test-feed
```

### Run tests in watch mode
```bash
cd feed && npm run test:watch
```

### Run tests with coverage
```bash
cd feed && npm run test:coverage
```

### Run specific test file
```bash
cd feed && npm test -- --testPathPattern=option-ingestion
```

## Test Structure

```
__tests__/
├── setup.ts                    # Jest setup file
├── test-utils/
│   ├── database.ts             # Database test utilities
│   └── config.ts               # Test configuration and data generators
├── services/
│   ├── option-ingestion.test.ts
│   └── polygon-client.test.ts
└── db/
    └── connection.test.ts
```

## Test Utilities

### Database Utilities (`test-utils/database.ts`)

- `createTestTables()`: Create all test tables
- `dropTestTables()`: Drop all test tables
- `truncateTestTables()`: Truncate all test tables
- `insertTestData()`: Insert test data into a table
- `getTestTableData()`: Retrieve data from a test table
- `getTestTableRowCount()`: Get row count for a test table

### Configuration Utilities (`test-utils/config.ts`)

- `getTableName()`: Get table name with test prefix
- `testDataGenerators`: Generate test data for different entity types

## Test Tables

The following test tables are created and managed:

- `test_stock_trades`
- `test_stock_aggregates`
- `test_option_contracts`
- `test_option_trades`
- `test_option_quotes`
- `test_sync_state`

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

### Mocking External Dependencies

```typescript
// Mock the service
jest.mock('../../services/polygon-client');
const MockedPolygonClient = PolygonClient as jest.MockedClass<typeof PolygonClient>;

// In your test
const mockPolygonClient = new MockedPolygonClient() as jest.Mocked<PolygonClient>;
mockPolygonClient.getOptionContracts.mockResolvedValue(mockData);
```

### Using Test Data Generators

```typescript
import { testDataGenerators } from '../test-utils/config';

const testContract = testDataGenerators.generateOptionContract({
  ticker: 'AAPL240315C00150000',
  underlying_ticker: 'AAPL'
});
```

## Environment Variables

Tests use the same environment variables as the main application, but with test table prefixes automatically applied.

## Coverage Requirements

The test suite is configured with 80% coverage thresholds for:
- Branches
- Functions
- Lines
- Statements

## Best Practices

1. **Always use test utilities**: Use the provided database utilities instead of direct database calls
2. **Clean up after tests**: The setup automatically truncates tables, but clean up any specific test data
3. **Mock external dependencies**: Don't make real API calls during tests
4. **Use descriptive test names**: Make it clear what each test is verifying
5. **Test both success and error cases**: Ensure error handling is properly tested
6. **Use test data generators**: Use the provided generators for consistent test data
