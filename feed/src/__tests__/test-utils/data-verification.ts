// Data verification utilities for QuestDB testing
import { db } from '../../db/connection';

export interface VerificationOptions {
  maxRetries?: number;
  retryIntervalMs?: number;
  timeoutMs?: number;
}

const DEFAULT_OPTIONS: Required<VerificationOptions> = {
  maxRetries: 10,
  retryIntervalMs: 50,
  timeoutMs: 2000,
};

/**
 * Polls the database until the expected number of records is found
 * This is more reliable than fixed delays for QuestDB partitioned tables
 */
export async function waitForRecordCount(
  tableName: string,
  expectedCount: number,
  options: VerificationOptions = {}
): Promise<void> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  let retryCount = 0;

  while (retryCount < opts.maxRetries) {
    // Check timeout
    if (Date.now() - startTime > opts.timeoutMs) {
      throw new Error(
        `Timeout waiting for ${expectedCount} records in ${tableName}. ` +
          `Last attempt found different count after ${opts.timeoutMs}ms`
      );
    }

    try {
      const result = await db.query(`SELECT COUNT(*) as count FROM ${tableName}`);
      const questResult = result ? (result as { dataset: unknown[][] }) : { dataset: [] };
      const actualCount = questResult.dataset && questResult.dataset.length > 0 ? Number(questResult.dataset[0][0]) : 0;

      if (actualCount === expectedCount) {
        return; // Success!
      }

      retryCount++;
      if (retryCount < opts.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, opts.retryIntervalMs));
      }
    } catch (error) {
      retryCount++;
      if (retryCount < opts.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, opts.retryIntervalMs));
      } else {
        throw new Error(`Failed to verify record count in ${tableName}: ${error}`);
      }
    }
  }

  // Final attempt to get the actual count for error message
  try {
    const result = await db.query(`SELECT COUNT(*) as count FROM ${tableName}`);
    const questResult = result ? (result as { dataset: unknown[][] }) : { dataset: [] };
    const actualCount = questResult.dataset && questResult.dataset.length > 0 ? Number(questResult.dataset[0][0]) : 0;

    throw new Error(
      `Expected ${expectedCount} records in ${tableName}, but found ${actualCount} after ${retryCount} attempts`
    );
  } catch (error) {
    throw new Error(`Failed to verify record count in ${tableName}: ${error}`);
  }
}

/**
 * Polls the database until a specific record is found with expected values
 * This verifies both existence and correctness of data
 */
export async function waitForRecordWithValues(
  tableName: string,
  whereClause: string,
  expectedValues: Record<string, unknown>,
  options: VerificationOptions = {}
): Promise<Record<string, unknown>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  let retryCount = 0;

  while (retryCount < opts.maxRetries) {
    // Check timeout
    if (Date.now() - startTime > opts.timeoutMs) {
      throw new Error(
        `Timeout waiting for record in ${tableName} with ${whereClause}. ` +
          `Expected values: ${JSON.stringify(expectedValues)}`
      );
    }

    try {
      const result = await db.query(`SELECT * FROM ${tableName} WHERE ${whereClause}`);
      const questResult = result
        ? (result as {
            columns: { name: string; type: string }[];
            dataset: unknown[][];
          })
        : { columns: [], dataset: [] };

      if (questResult.dataset && questResult.dataset.length > 0) {
        const record = questResult.dataset[0];
        const recordObj: Record<string, unknown> = {};

        questResult.columns.forEach((col, index) => {
          recordObj[col.name] = record[index];
        });

        // Check if all expected values match
        const allValuesMatch = Object.entries(expectedValues).every(([key, expectedValue]) => {
          const actualValue = recordObj[key];

          // Handle different data types
          if (expectedValue instanceof Date && actualValue instanceof Date) {
            return Math.abs(expectedValue.getTime() - actualValue.getTime()) < 1000; // Within 1 second
          }

          return actualValue === expectedValue;
        });

        if (allValuesMatch) {
          return recordObj; // Success!
        }
      }

      retryCount++;
      if (retryCount < opts.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, opts.retryIntervalMs));
      }
    } catch (error) {
      retryCount++;
      if (retryCount < opts.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, opts.retryIntervalMs));
      } else {
        throw new Error(`Failed to verify record in ${tableName}: ${error}`);
      }
    }
  }

  throw new Error(
    `Record not found in ${tableName} with ${whereClause} after ${retryCount} attempts. ` +
      `Expected values: ${JSON.stringify(expectedValues)}`
  );
}

/**
 * Polls the database until a specific symbol has the expected number of records
 * Useful for testing upsert behavior
 */
export async function waitForSymbolRecordCount(
  tableName: string,
  symbol: string,
  expectedCount: number,
  options: VerificationOptions = {}
): Promise<void> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  let retryCount = 0;

  while (retryCount < opts.maxRetries) {
    // Check timeout
    if (Date.now() - startTime > opts.timeoutMs) {
      throw new Error(`Timeout waiting for ${expectedCount} records for symbol ${symbol} in ${tableName}`);
    }

    try {
      const result = await db.query(`SELECT COUNT(*) as count FROM ${tableName} WHERE symbol = '${symbol}'`);
      const questResult = result ? (result as { dataset: unknown[][] }) : { dataset: [] };
      const actualCount = questResult.dataset && questResult.dataset.length > 0 ? Number(questResult.dataset[0][0]) : 0;

      if (actualCount === expectedCount) {
        return; // Success!
      }

      retryCount++;
      if (retryCount < opts.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, opts.retryIntervalMs));
      }
    } catch (error) {
      retryCount++;
      if (retryCount < opts.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, opts.retryIntervalMs));
      } else {
        throw new Error(`Failed to verify record count for symbol ${symbol} in ${tableName}: ${error}`);
      }
    }
  }

  // Final attempt to get the actual count for error message
  try {
    const result = await db.query(`SELECT COUNT(*) as count FROM ${tableName} WHERE symbol = '${symbol}'`);
    const questResult = result ? (result as { dataset: unknown[][] }) : { dataset: [] };
    const actualCount = questResult.dataset && questResult.dataset.length > 0 ? Number(questResult.dataset[0][0]) : 0;

    throw new Error(
      `Expected ${expectedCount} records for symbol ${symbol} in ${tableName}, but found ${actualCount} after ${retryCount} attempts`
    );
  } catch (error) {
    throw new Error(`Failed to verify record count for symbol ${symbol} in ${tableName}: ${error}`);
  }
}

/**
 * Polls the database until a specific ticker has the expected number of records
 * Useful for testing option-related upserts
 */
export async function waitForTickerRecordCount(
  tableName: string,
  ticker: string,
  expectedCount: number,
  options: VerificationOptions = {}
): Promise<void> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  let retryCount = 0;

  while (retryCount < opts.maxRetries) {
    // Check timeout
    if (Date.now() - startTime > opts.timeoutMs) {
      throw new Error(`Timeout waiting for ${expectedCount} records for ticker ${ticker} in ${tableName}`);
    }

    try {
      const result = await db.query(`SELECT COUNT(*) as count FROM ${tableName} WHERE ticker = '${ticker}'`);
      const questResult = result ? (result as { dataset: unknown[][] }) : { dataset: [] };
      const actualCount = questResult.dataset && questResult.dataset.length > 0 ? Number(questResult.dataset[0][0]) : 0;

      if (actualCount === expectedCount) {
        return; // Success!
      }

      retryCount++;
      if (retryCount < opts.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, opts.retryIntervalMs));
      }
    } catch (error) {
      retryCount++;
      if (retryCount < opts.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, opts.retryIntervalMs));
      } else {
        throw new Error(`Failed to verify record count for ticker ${ticker} in ${tableName}: ${error}`);
      }
    }
  }

  // Final attempt to get the actual count for error message
  try {
    const result = await db.query(`SELECT COUNT(*) as count FROM ${tableName} WHERE ticker = '${ticker}'`);
    const questResult = result ? (result as { dataset: unknown[][] }) : { dataset: [] };
    const actualCount = questResult.dataset && questResult.dataset.length > 0 ? Number(questResult.dataset[0][0]) : 0;

    throw new Error(
      `Expected ${expectedCount} records for ticker ${ticker} in ${tableName}, but found ${actualCount} after ${retryCount} attempts`
    );
  } catch (error) {
    throw new Error(`Failed to verify record count for ticker ${ticker} in ${tableName}: ${error}`);
  }
}

/**
 * Generic function to wait for any query to return the expected number of records
 * This is the most flexible approach for QuestDB eventual consistency
 */
export async function waitForQueryResultCount(
  query: string,
  expectedCount: number,
  options: VerificationOptions = {}
): Promise<void> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  let retryCount = 0;

  while (retryCount < opts.maxRetries) {
    // Check timeout
    if (Date.now() - startTime > opts.timeoutMs) {
      throw new Error(
        `Timeout waiting for ${expectedCount} records from query: ${query}. ` +
          `Last attempt found different count after ${opts.timeoutMs}ms`
      );
    }

    try {
      const result = await db.query(query);
      const questResult = result ? (result as { dataset: unknown[][] }) : { dataset: [] };
      const actualCount = questResult.dataset ? questResult.dataset.length : 0;

      if (actualCount === expectedCount) {
        return; // Success!
      }

      retryCount++;
      if (retryCount < opts.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, opts.retryIntervalMs));
      }
    } catch (error) {
      retryCount++;
      if (retryCount < opts.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, opts.retryIntervalMs));
      } else {
        throw new Error(`Failed to verify query result count: ${error}`);
      }
    }
  }

  // Final attempt to get the actual count for error message
  try {
    const result = await db.query(query);
    const questResult = result ? (result as { dataset: unknown[][] }) : { dataset: [] };
    const actualCount = questResult.dataset ? questResult.dataset.length : 0;

    throw new Error(
      `Expected ${expectedCount} records from query, but found ${actualCount} after ${retryCount} attempts. Query: ${query}`
    );
  } catch (error) {
    throw new Error(`Failed to verify query result count: ${error}`);
  }
}

/**
 * Generic function to wait for any query to return at least one record
 * Useful for verifying data exists after insertions
 */
export async function waitForQueryResultExists(query: string, options: VerificationOptions = {}): Promise<unknown[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  let retryCount = 0;

  while (retryCount < opts.maxRetries) {
    // Check timeout
    if (Date.now() - startTime > opts.timeoutMs) {
      throw new Error(
        `Timeout waiting for query to return results: ${query}. ` + `No results found after ${opts.timeoutMs}ms`
      );
    }

    try {
      const result = await db.query(query);
      const questResult = result ? (result as { dataset: unknown[][] }) : { dataset: [] };

      if (questResult.dataset && questResult.dataset.length > 0) {
        return questResult.dataset; // Success!
      }

      retryCount++;
      if (retryCount < opts.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, opts.retryIntervalMs));
      }
    } catch (error) {
      retryCount++;
      if (retryCount < opts.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, opts.retryIntervalMs));
      } else {
        throw new Error(`Failed to verify query result exists: ${error}`);
      }
    }
  }

  throw new Error(`Query returned no results after ${retryCount} attempts. Query: ${query}`);
}

/**
 * Generic function to wait for a specific field value in a query result
 * Useful for verifying specific data after updates
 */
export async function waitForQueryFieldValue(
  query: string,
  fieldName: string,
  expectedValue: unknown,
  options: VerificationOptions = {}
): Promise<Record<string, unknown>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  let retryCount = 0;

  while (retryCount < opts.maxRetries) {
    // Check timeout
    if (Date.now() - startTime > opts.timeoutMs) {
      throw new Error(`Timeout waiting for field ${fieldName} to equal ${expectedValue} in query: ${query}`);
    }

    try {
      const result = await db.query(query);
      const questResult = result
        ? (result as {
            columns: { name: string; type: string }[];
            dataset: unknown[][];
          })
        : { columns: [], dataset: [] };

      if (questResult.dataset && questResult.dataset.length > 0) {
        const record = questResult.dataset[0];
        const recordObj: Record<string, unknown> = {};

        questResult.columns.forEach((col, index) => {
          recordObj[col.name] = record[index];
        });

        const actualValue = recordObj[fieldName];

        // Handle different data types
        let valuesMatch = false;
        if (expectedValue instanceof Date && actualValue instanceof Date) {
          valuesMatch = Math.abs(expectedValue.getTime() - actualValue.getTime()) < 1000; // Within 1 second
        } else {
          valuesMatch = actualValue === expectedValue;
        }

        if (valuesMatch) {
          return recordObj; // Success!
        }
      }

      retryCount++;
      if (retryCount < opts.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, opts.retryIntervalMs));
      }
    } catch (error) {
      retryCount++;
      if (retryCount < opts.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, opts.retryIntervalMs));
      } else {
        throw new Error(`Failed to verify field value: ${error}`);
      }
    }
  }

  throw new Error(`Field ${fieldName} did not equal ${expectedValue} after ${retryCount} attempts. Query: ${query}`);
}

/**
 * Convenience function for waiting for records with specific WHERE conditions
 * Combines the flexibility of custom queries with common patterns
 */
export async function waitForRecordsWithCondition(
  tableName: string,
  whereClause: string,
  expectedCount: number,
  options: VerificationOptions = {}
): Promise<void> {
  const query = `SELECT * FROM ${tableName} WHERE ${whereClause}`;
  await waitForQueryResultCount(query, expectedCount, options);
}

/**
 * Convenience function for waiting for a single record with specific WHERE conditions
 * Returns the record data when found
 */
export async function waitForSingleRecordWithCondition(
  tableName: string,
  whereClause: string,
  options: VerificationOptions = {}
): Promise<Record<string, unknown>> {
  const query = `SELECT * FROM ${tableName} WHERE ${whereClause}`;
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  let retryCount = 0;

  while (retryCount < opts.maxRetries) {
    // Check timeout
    if (Date.now() - startTime > opts.timeoutMs) {
      throw new Error(
        `Timeout waiting for query to return results: ${query}. ` + `No results found after ${opts.timeoutMs}ms`
      );
    }

    try {
      const result = await db.query(query);
      const questResult = result
        ? (result as { columns: { name: string; type: string }[]; dataset: unknown[][] })
        : { columns: [], dataset: [] };

      if (questResult.dataset && questResult.dataset.length > 0) {
        // Convert the first result to an object using the data we just retrieved
        const recordObj: Record<string, unknown> = {};
        questResult.columns.forEach((col, index) => {
          recordObj[col.name] = questResult.dataset[0][index];
        });
        return recordObj; // Success!
      }

      retryCount++;
      if (retryCount < opts.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, opts.retryIntervalMs));
      }
    } catch (error) {
      retryCount++;
      if (retryCount < opts.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, opts.retryIntervalMs));
      } else {
        throw new Error(`Failed to verify query result exists: ${error}`);
      }
    }
  }

  throw new Error(`No records found in ${tableName} with condition: ${whereClause}`);
}

/**
 * Polls the database until a test table exists in the tables() system table
 * This is more reliable than fixed delays for QuestDB table creation
 */
export async function waitForTestTableExists(tableName: string, options: VerificationOptions = {}): Promise<void> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  let retryCount = 0;

  while (retryCount < opts.maxRetries) {
    // Check timeout
    if (Date.now() - startTime > opts.timeoutMs) {
      throw new Error(
        `Timeout waiting for table ${tableName} to exist. ` +
          `Table not found in tables() system table after ${opts.timeoutMs}ms`
      );
    }

    try {
      const result = await db.query(`SELECT table_name FROM tables() WHERE table_name = '${tableName}'`);
      const questResult = result ? (result as { dataset: unknown[][] }) : { dataset: [] };

      if (questResult.dataset && questResult.dataset.length > 0) {
        return; // Success! Table exists
      }

      retryCount++;
      if (retryCount < opts.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, opts.retryIntervalMs));
      }
    } catch (error) {
      retryCount++;
      if (retryCount < opts.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, opts.retryIntervalMs));
      } else {
        throw error;
      }
    }
  }

  throw new Error(`Failed to find table ${tableName} in tables() system table after ${opts.maxRetries} attempts`);
}
