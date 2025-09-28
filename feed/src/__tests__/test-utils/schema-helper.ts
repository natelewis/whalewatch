import fs from 'fs';
import path from 'path';

/**
 * Helper function to generate test table creation statements from schema.sql
 * This ensures we only maintain the schema in one place
 */
export function generateTestTableSchemas(): { [tableName: string]: string } {
  const schemaPath = path.join(__dirname, '../../../src/db/schema.sql');
  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

  // Parse the schema.sql file to extract table definitions
  const tableSchemas: { [tableName: string]: string } = {};

  // Split by CREATE TABLE statements - handle multiline schemas properly
  const createTableRegex = /CREATE TABLE IF NOT EXISTS (\w+) \((.*?)\) TIMESTAMP\(([^)]+)\) PARTITION BY DAY;/gs;
  let match;

  while ((match = createTableRegex.exec(schemaContent)) !== null) {
    const tableName = match[1];
    let tableDefinition = match[2];

    // Clean up the table definition - remove extra whitespace and normalize
    tableDefinition = tableDefinition
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/,\s*/g, ',\n    ') // Format column definitions nicely
      .trim();

    // Generate test table name
    const testTableName = `test_${tableName}`;

    // Create the test table schema with proper formatting
    // Include proper QuestDB partitioning for test tables to ensure they work correctly
    // Use DROP + CREATE to ensure schema changes are applied
    const timestampColumn = match[3]; // The timestamp column from the original schema
    const testTableSchema = `DROP TABLE IF EXISTS ${testTableName};\nCREATE TABLE ${testTableName} (\n    ${tableDefinition}\n) TIMESTAMP(${timestampColumn}) PARTITION BY DAY`;

    tableSchemas[testTableName] = testTableSchema;
  }

  return tableSchemas;
}

/**
 * Get the schema for a specific test table
 */
export function getTestTableSchema(tableName: string): string {
  const schemas = generateTestTableSchemas();
  return schemas[tableName] || '';
}

/**
 * Get all test table schemas
 */
export function getAllTestTableSchemas(): { [tableName: string]: string } {
  return generateTestTableSchemas();
}

/**
 * Create a specific test table by name
 * Usage: await createTestTable('test_stock_aggregates')
 */
export async function createTestTable(tableName: string, db: any): Promise<void> {
  const schema = getTestTableSchema(tableName);
  if (!schema) {
    throw new Error(`No schema found for test table: ${tableName}`);
  }

  console.log(`Creating test table: ${tableName}`);
  await db.query(schema);
  console.log(`Created test table: ${tableName}`);
}
