import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runMigrations, getMigrationStatus } from './migration-runner.js';
import type { DatabaseClient } from './database.js';
import type { Migration } from './migration-runner.js';

function createMockDb(): DatabaseClient & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    async query<T = Record<string, unknown>>(
      sql: string,
      params?: unknown[]
    ) {
      queries.push(sql.trim());
      // Return empty rows by default for migration tracking queries
      if (sql.includes('_schema_migrations') && sql.includes('SELECT')) {
        return { rows: [] as T[], rowCount: 0 };
      }
      return { rows: [] as T[], rowCount: 0 };
    },
    async end() {},
  };
}

describe('migration-runner', () => {
  describe('runMigrations', () => {
    it('should reject invalid schema names', async () => {
      const db = createMockDb();
      await expect(
        runMigrations(db, 'invalid_schema', [])
      ).rejects.toThrow('Invalid schema name');
    });

    it('should reject schema names with SQL injection attempts', async () => {
      const db = createMockDb();
      await expect(
        runMigrations(db, 'tenant_"; DROP TABLE --', [])
      ).rejects.toThrow('Invalid schema name');
    });

    it('should create migration tracking table', async () => {
      const db = createMockDb();
      await runMigrations(db, 'tenant_abc123def456', []);

      expect(db.queries[0]).toContain('_schema_migrations');
      expect(db.queries[0]).toContain('CREATE TABLE IF NOT EXISTS');
    });

    it('should apply migrations in version order', async () => {
      const db = createMockDb();
      const executionOrder: number[] = [];

      const migrations: Migration[] = [
        {
          version: 3,
          name: 'third',
          up: async () => { executionOrder.push(3); },
        },
        {
          version: 1,
          name: 'first',
          up: async () => { executionOrder.push(1); },
        },
        {
          version: 2,
          name: 'second',
          up: async () => { executionOrder.push(2); },
        },
      ];

      const result = await runMigrations(db, 'tenant_abc123def456', migrations);

      expect(executionOrder).toEqual([1, 2, 3]);
      expect(result.applied).toHaveLength(3);
      expect(result.errors).toHaveLength(0);
      expect(result.skipped).toBe(0);
    });

    it('should skip already-applied migrations', async () => {
      const queries: string[] = [];
      const db: DatabaseClient = {
        async query<T = Record<string, unknown>>(
          sql: string,
          params?: unknown[]
        ) {
          queries.push(sql.trim());
          // Return version 1 as already applied
          if (sql.includes('_schema_migrations') && sql.includes('SELECT')) {
            return {
              rows: [{ version: 1 }] as T[],
              rowCount: 1,
            };
          }
          return { rows: [] as T[], rowCount: 0 };
        },
        async end() {},
      };

      const executionOrder: number[] = [];
      const migrations: Migration[] = [
        {
          version: 1,
          name: 'first',
          up: async () => { executionOrder.push(1); },
        },
        {
          version: 2,
          name: 'second',
          up: async () => { executionOrder.push(2); },
        },
      ];

      const result = await runMigrations(db, 'tenant_abc123def456', migrations);

      expect(executionOrder).toEqual([2]);
      expect(result.applied).toHaveLength(1);
      expect(result.applied[0].version).toBe(2);
      expect(result.skipped).toBe(1);
    });

    it('should stop on first error and report it', async () => {
      const db = createMockDb();
      const executionOrder: number[] = [];

      const migrations: Migration[] = [
        {
          version: 1,
          name: 'first',
          up: async () => { executionOrder.push(1); },
        },
        {
          version: 2,
          name: 'failing',
          up: async () => {
            throw new Error('Table already exists');
          },
        },
        {
          version: 3,
          name: 'third',
          up: async () => { executionOrder.push(3); },
        },
      ];

      const result = await runMigrations(db, 'tenant_abc123def456', migrations);

      expect(executionOrder).toEqual([1]);
      expect(result.applied).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].version).toBe(2);
      expect(result.errors[0].error).toBe('Table already exists');
    });

    it('should record each applied migration in the tracking table', async () => {
      const db = createMockDb();

      const migrations: Migration[] = [
        {
          version: 1,
          name: 'create-tables',
          up: async () => {},
        },
      ];

      await runMigrations(db, 'tenant_abc123def456', migrations);

      const insertQuery = db.queries.find(
        (q) => q.includes('INSERT INTO') && q.includes('_schema_migrations')
      );
      expect(insertQuery).toBeDefined();
    });

    it('should return empty result when no migrations provided', async () => {
      const db = createMockDb();
      const result = await runMigrations(db, 'tenant_abc123def456', []);

      expect(result.applied).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.skipped).toBe(0);
    });
  });
});
