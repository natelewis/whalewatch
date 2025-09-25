// ============================================================================
// TYPES VALIDATION TESTS
// ============================================================================

import fs from 'fs';
import path from 'path';

describe('Types Directory Coverage', () => {
  describe('Type Definition Files', () => {
    it('should have index.ts file with type definitions', () => {
      const indexPath = path.join(__dirname, '../../types/index.ts');
      expect(fs.existsSync(indexPath)).toBe(true);

      const content = fs.readFileSync(indexPath, 'utf8');
      expect(content).toContain('export');
      expect(content).toContain('interface');
    });

    it('should have questdb.ts file as re-export', () => {
      const questdbPath = path.join(__dirname, '../../types/questdb.ts');
      expect(fs.existsSync(questdbPath)).toBe(true);

      const content = fs.readFileSync(questdbPath, 'utf8');
      expect(content).toContain('export * from');
      expect(content).toContain('./index');
    });
  });

  describe('Type Structure Validation', () => {
    it('should define QuestDB data types', () => {
      const indexPath = path.join(__dirname, '../../types/index.ts');
      const content = fs.readFileSync(indexPath, 'utf8');

      // Check for QuestDB types
      expect(content).toContain('QuestDBStockTrade');
      expect(content).toContain('QuestDBStockAggregate');
      expect(content).toContain('QuestDBOptionContract');
      expect(content).toContain('QuestDBOptionTrade');
      expect(content).toContain('QuestDBOptionQuote');
      expect(content).toContain('QuestDBSyncState');
      expect(content).toContain('QuestDBQueryParams');
      expect(content).toContain('QuestDBResponse');
      expect(content).toContain('QuestDBWebSocketMessage');
      expect(content).toContain('QuestDBSubscription');
      expect(content).toContain('QuestDBConfig');
      expect(content).toContain('QuestDBError');
    });

    it('should define Express types', () => {
      const indexPath = path.join(__dirname, '../../types/index.ts');
      const content = fs.readFileSync(indexPath, 'utf8');

      // Check for Express types
      expect(content).toContain('AuthenticatedRequest');
      expect(content).toContain('declare global');
      expect(content).toContain('namespace Express');
    });

    it('should define WebSocket types', () => {
      const indexPath = path.join(__dirname, '../../types/index.ts');
      const content = fs.readFileSync(indexPath, 'utf8');

      // Check for WebSocket types
      expect(content).toContain('AuthenticatedWebSocket');
    });

    it('should define Chart types', () => {
      const indexPath = path.join(__dirname, '../../types/index.ts');
      const content = fs.readFileSync(indexPath, 'utf8');

      // Check for Chart types
      expect(content).toContain('AGGREGATION_INTERVALS');
      expect(content).toContain('AggregationInterval');
      expect(content).toContain('ChartQueryParams');
    });
  });

  describe('Type Export Validation', () => {
    it('should export all required types', () => {
      const indexPath = path.join(__dirname, '../../types/index.ts');
      const content = fs.readFileSync(indexPath, 'utf8');

      // Check for export statements
      const exportMatches = content.match(/export\s+(interface|const|type)/g);
      expect(exportMatches).toBeDefined();
      expect(exportMatches!.length).toBeGreaterThan(0);

      // Check for specific exports
      expect(content).toMatch(/export\s+interface\s+QuestDBStockTrade/);
      expect(content).toMatch(/export\s+interface\s+AuthenticatedRequest/);
      expect(content).toMatch(/export\s+const\s+AGGREGATION_INTERVALS/);
    });

    it('should have proper TypeScript syntax', () => {
      const indexPath = path.join(__dirname, '../../types/index.ts');
      const content = fs.readFileSync(indexPath, 'utf8');

      // Basic syntax checks
      expect(content).not.toContain('syntax error');
      expect(content).toMatch(/interface\s+\w+\s*{/);
      expect(content).toMatch(/export\s+/);

      // Check for proper interface definitions
      const interfaceCount = (content.match(/interface\s+\w+/g) || []).length;
      expect(interfaceCount).toBeGreaterThan(5);
    });
  });

  describe('Aggregation Intervals', () => {
    it('should define all required intervals', () => {
      const indexPath = path.join(__dirname, '../../types/index.ts');
      const content = fs.readFileSync(indexPath, 'utf8');

      // Check for specific interval definitions
      expect(content).toContain("'1m': 1");
      expect(content).toContain("'15m': 15");
      expect(content).toContain("'30m': 30");
      expect(content).toContain("'1h': 60");
      expect(content).toContain("'2h': 120");
      expect(content).toContain("'4h': 240");
      expect(content).toContain("'1d': 1440");
    });

    it('should use const assertion for intervals', () => {
      const indexPath = path.join(__dirname, '../../types/index.ts');
      const content = fs.readFileSync(indexPath, 'utf8');

      // Check for const assertion
      expect(content).toContain('as const');
    });
  });

  describe('Type Documentation', () => {
    it('should have comments explaining type purposes', () => {
      const indexPath = path.join(__dirname, '../../types/index.ts');
      const content = fs.readFileSync(indexPath, 'utf8');

      // Check for section comments
      expect(content).toContain('// ============================================================================');
      expect(content).toContain('EXPRESS TYPES');
      expect(content).toContain('QUESTDB TYPES');
      expect(content).toContain('WEBSOCKET SERVER TYPES');
      expect(content).toContain('CHART ROUTE TYPES');
    });

    it('should have inline comments for complex types', () => {
      const indexPath = path.join(__dirname, '../../types/index.ts');
      const content = fs.readFileSync(indexPath, 'utf8');

      // Check for inline comments
      expect(content).toContain('// ISO timestamp');
      expect(content).toContain('// Direction to load data');
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain questdb.ts for backward compatibility', () => {
      const questdbPath = path.join(__dirname, '../../types/questdb.ts');
      const content = fs.readFileSync(questdbPath, 'utf8');

      expect(content).toContain('backward compatibility');
      expect(content).toContain('deprecated');
      expect(content).toContain("export * from './index'");
    });

    it('should note deprecation in questdb.ts', () => {
      const questdbPath = path.join(__dirname, '../../types/questdb.ts');
      const content = fs.readFileSync(questdbPath, 'utf8');

      expect(content).toContain('consolidated into server/src/types/index.ts');
      expect(content).toContain('deprecated');
    });
  });
});
