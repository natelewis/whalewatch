// Data verification utilities for QuestDB testing
import { db } from '../../db/connection';

export interface VerificationOptions {
  maxRetries?: number;
  retryIntervalMs?: number;
  timeoutMs?: number;
}

const DEFAULT_OPTIONS: Required<VerificationOptions> = {
  maxRetries: 10,
  retryIntervalMs: 100,
  timeoutMs: 5000,
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
      const questResult = result as { dataset: unknown[][] };
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
    const questResult = result as { dataset: unknown[][] };
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
      const questResult = result as {
        columns: { name: string; type: string }[];
        dataset: unknown[][];
      };

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
      const questResult = result as { dataset: unknown[][] };
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
    const questResult = result as { dataset: unknown[][] };
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
      const questResult = result as { dataset: unknown[][] };
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
    const questResult = result as { dataset: unknown[][] };
    const actualCount = questResult.dataset && questResult.dataset.length > 0 ? Number(questResult.dataset[0][0]) : 0;

    throw new Error(
      `Expected ${expectedCount} records for ticker ${ticker} in ${tableName}, but found ${actualCount} after ${retryCount} attempts`
    );
  } catch (error) {
    throw new Error(`Failed to verify record count for ticker ${ticker} in ${tableName}: ${error}`);
  }
}
