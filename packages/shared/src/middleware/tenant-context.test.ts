import { describe, it, expect } from 'vitest';
import {
  extractTenantIdFromClaims,
  extractClaimsFromEvent,
  resolveTenantContext,
  scopeConnectionToTenant,
  resetConnectionScope,
  withTenantContext,
  withScopedTenantConnection,
  TenantContextError,
} from './tenant-context.js';
import type { DatabaseClient, JwtClaims } from './tenant-context.js';

function createMockDb(
  rows: Record<string, unknown>[] = [],
  rowCount?: number
): DatabaseClient & { queries: Array<{ sql: string; params?: unknown[] }> } {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  return {
    queries,
    async query<T = Record<string, unknown>>(
      sql: string,
      params?: unknown[]
    ) {
      queries.push({ sql, params });
      return { rows: rows as T[], rowCount: rowCount ?? rows.length };
    },
    async end() {},
  };
}

describe('tenant-context middleware', () => {
  describe('extractTenantIdFromClaims', () => {
    it('should extract tenantId from valid claims', () => {
      const claims: JwtClaims = {
        sub: 'user-123',
        'custom:tenant_id': '550e8400-e29b-41d4-a716-446655440000',
      };
      const result = extractTenantIdFromClaims(claims);
      expect(result).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should throw TenantContextError when claim is missing', () => {
      const claims: JwtClaims = { sub: 'user-123' };
      expect(() => extractTenantIdFromClaims(claims)).toThrow(
        TenantContextError
      );
      expect(() => extractTenantIdFromClaims(claims)).toThrow(
        'Missing or invalid custom:tenant_id'
      );
    });

    it('should throw TenantContextError when claim is empty string', () => {
      const claims: JwtClaims = {
        sub: 'user-123',
        'custom:tenant_id': '',
      };
      expect(() => extractTenantIdFromClaims(claims)).toThrow(
        TenantContextError
      );
    });

    it('should throw with 401 status code', () => {
      const claims: JwtClaims = { sub: 'user-123' };
      try {
        extractTenantIdFromClaims(claims);
      } catch (e) {
        expect(e).toBeInstanceOf(TenantContextError);
        expect((e as TenantContextError).statusCode).toBe(401);
      }
    });
  });

  describe('extractClaimsFromEvent', () => {
    it('should extract claims from Cognito authorizer format', () => {
      const event = {
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-123',
              'custom:tenant_id': 'tenant-abc',
            },
          },
        },
      };
      const claims = extractClaimsFromEvent(event);
      expect(claims['custom:tenant_id']).toBe('tenant-abc');
    });

    it('should extract claims from HTTP API JWT authorizer format', () => {
      const event = {
        requestContext: {
          authorizer: {
            jwt: {
              claims: {
                sub: 'user-456',
                'custom:tenant_id': 'tenant-def',
              },
            },
          },
        },
      };
      const claims = extractClaimsFromEvent(event);
      expect(claims['custom:tenant_id']).toBe('tenant-def');
    });

    it('should throw when no authorizer context exists', () => {
      const event = { requestContext: {} };
      expect(() => extractClaimsFromEvent(event)).toThrow(
        TenantContextError
      );
      expect(() => extractClaimsFromEvent(event)).toThrow(
        'No authorizer context found'
      );
    });

    it('should throw when no requestContext exists', () => {
      const event = {};
      expect(() => extractClaimsFromEvent(event)).toThrow(
        TenantContextError
      );
    });
  });

  describe('resolveTenantContext', () => {
    it('should resolve a valid active tenant', async () => {
      const db = createMockDb([
        {
          tenant_id: '550e8400-e29b-41d4-a716-446655440000',
          schema_name: 'tenant_abc123def456',
          organisation_name: 'Acme Corp',
          status: 'active',
          plan: 'enterprise',
        },
      ]);

      const result = await resolveTenantContext(
        db,
        '550e8400-e29b-41d4-a716-446655440000'
      );

      expect(result.tenantId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(result.schemaName).toBe('tenant_abc123def456');
      expect(result.organisationName).toBe('Acme Corp');
      expect(result.status).toBe('active');
      expect(result.plan).toBe('enterprise');
    });

    it('should throw for invalid UUID format', async () => {
      const db = createMockDb();
      await expect(
        resolveTenantContext(db, 'not-a-uuid')
      ).rejects.toThrow(TenantContextError);
      await expect(
        resolveTenantContext(db, 'not-a-uuid')
      ).rejects.toThrow('Invalid tenant ID format');
    });

    it('should throw when tenant not found', async () => {
      const db = createMockDb([], 0);
      await expect(
        resolveTenantContext(db, '550e8400-e29b-41d4-a716-446655440000')
      ).rejects.toThrow('Tenant not found');
    });

    it('should throw when tenant is not active', async () => {
      const db = createMockDb([
        {
          tenant_id: '550e8400-e29b-41d4-a716-446655440000',
          schema_name: 'tenant_abc123def456',
          organisation_name: 'Acme Corp',
          status: 'suspended',
          plan: 'standard',
        },
      ]);

      await expect(
        resolveTenantContext(db, '550e8400-e29b-41d4-a716-446655440000')
      ).rejects.toThrow('Tenant is not active');
    });

    it('should throw with 403 for suspended tenant', async () => {
      const db = createMockDb([
        {
          tenant_id: '550e8400-e29b-41d4-a716-446655440000',
          schema_name: 'tenant_abc123def456',
          organisation_name: 'Acme Corp',
          status: 'decommissioned',
          plan: 'standard',
        },
      ]);

      try {
        await resolveTenantContext(
          db,
          '550e8400-e29b-41d4-a716-446655440000'
        );
      } catch (e) {
        expect(e).toBeInstanceOf(TenantContextError);
        expect((e as TenantContextError).statusCode).toBe(403);
      }
    });
  });

  describe('scopeConnectionToTenant', () => {
    it('should set search_path and session variable', async () => {
      const db = createMockDb();
      await scopeConnectionToTenant(db, 'tenant_abc123def456');

      expect(db.queries).toHaveLength(2);
      expect(db.queries[0].sql).toContain('SET search_path TO');
      expect(db.queries[0].sql).toContain('tenant_abc123def456');
      expect(db.queries[1].sql).toContain(
        'app.current_tenant_schema'
      );
      expect(db.queries[1].sql).toContain('tenant_abc123def456');
    });

    it('should reject invalid schema names', async () => {
      const db = createMockDb();
      await expect(
        scopeConnectionToTenant(db, 'invalid_schema')
      ).rejects.toThrow(TenantContextError);
    });

    it('should reject schema names with injection attempts', async () => {
      const db = createMockDb();
      await expect(
        scopeConnectionToTenant(db, "tenant_'; DROP TABLE")
      ).rejects.toThrow(TenantContextError);
    });
  });

  describe('resetConnectionScope', () => {
    it('should reset search_path to platform schema', async () => {
      const db = createMockDb();
      await resetConnectionScope(db);

      expect(db.queries).toHaveLength(2);
      expect(db.queries[0].sql).toContain('SET search_path TO platform');
      expect(db.queries[1].sql).toContain(
        "app.current_tenant_schema = ''"
      );
    });
  });

  describe('withTenantContext', () => {
    it('should resolve tenant and scope connection from event', async () => {
      const db = createMockDb([
        {
          tenant_id: '550e8400-e29b-41d4-a716-446655440000',
          schema_name: 'tenant_abc123def456',
          organisation_name: 'Acme Corp',
          status: 'active',
          plan: 'enterprise',
        },
      ]);

      const event = {
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-123',
              'custom:tenant_id': '550e8400-e29b-41d4-a716-446655440000',
            },
          },
        },
      };

      const result = await withTenantContext(event, db);

      expect(result.tenantContext.tenantId).toBe(
        '550e8400-e29b-41d4-a716-446655440000'
      );
      expect(result.tenantContext.schemaName).toBe('tenant_abc123def456');
      // Verify connection was scoped
      const scopeQuery = db.queries.find((q) =>
        q.sql.includes('SET search_path')
      );
      expect(scopeQuery).toBeDefined();
    });
  });

  describe('withScopedTenantConnection', () => {
    it('should scope connection and reset after function completes', async () => {
      const db = createMockDb();
      let wasScoped = false;

      await withScopedTenantConnection(
        db,
        'tenant_abc123def456',
        async (scopedDb) => {
          wasScoped = true;
          // Verify search_path was set before our function runs
          const setQueries = db.queries.filter((q) =>
            q.sql.includes('SET search_path')
          );
          expect(setQueries.length).toBeGreaterThan(0);
        }
      );

      expect(wasScoped).toBe(true);
      // Verify reset was called after
      const resetQuery = db.queries.find(
        (q) =>
          q.sql.includes('SET search_path TO platform')
      );
      expect(resetQuery).toBeDefined();
    });

    it('should reset connection even if function throws', async () => {
      const db = createMockDb();

      await expect(
        withScopedTenantConnection(
          db,
          'tenant_abc123def456',
          async () => {
            throw new Error('Something went wrong');
          }
        )
      ).rejects.toThrow('Something went wrong');

      // Verify reset was still called
      const resetQuery = db.queries.find(
        (q) =>
          q.sql.includes('SET search_path TO platform')
      );
      expect(resetQuery).toBeDefined();
    });
  });
});
