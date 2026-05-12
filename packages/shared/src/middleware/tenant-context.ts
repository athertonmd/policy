/**
 * Tenant Context Middleware
 *
 * Resolves tenantId from JWT tokens (custom:tenant_id claim),
 * validates the tenant exists in platform.tenants, and scopes
 * database connections to the tenant's schema via search_path
 * and the app.current_tenant_schema session variable (for RLS).
 *
 * This module is designed to be imported by any service that needs
 * tenant-scoped database access.
 */

export interface TenantContext {
  tenantId: string;
  schemaName: string;
  organisationName: string;
  status: string;
  plan: string;
}

export interface DatabaseClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; rowCount: number }>;
  end(): Promise<void>;
}

export interface JwtClaims {
  sub?: string;
  'custom:tenant_id'?: string;
  'custom:role'?: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * Error thrown when tenant context cannot be resolved.
 */
export class TenantContextError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 403) {
    super(message);
    this.name = 'TenantContextError';
    this.statusCode = statusCode;
  }
}

/**
 * Extracts the tenantId from JWT claims.
 * Expects the custom:tenant_id claim to be present.
 */
export function extractTenantIdFromClaims(claims: JwtClaims): string {
  const tenantId = claims['custom:tenant_id'];
  if (!tenantId || typeof tenantId !== 'string') {
    throw new TenantContextError(
      'Missing or invalid custom:tenant_id claim in JWT token',
      401
    );
  }
  return tenantId;
}

/**
 * Extracts JWT claims from an API Gateway event's request context.
 * Supports both Cognito authorizer and JWT authorizer formats.
 */
export function extractClaimsFromEvent(event: {
  requestContext?: {
    authorizer?: {
      claims?: JwtClaims;
      jwt?: { claims?: JwtClaims };
    };
  };
}): JwtClaims {
  const authorizer = event.requestContext?.authorizer;
  if (!authorizer) {
    throw new TenantContextError(
      'No authorizer context found in request',
      401
    );
  }

  // Cognito User Pool authorizer format
  if (authorizer.claims) {
    return authorizer.claims;
  }

  // HTTP API JWT authorizer format
  if (authorizer.jwt?.claims) {
    return authorizer.jwt.claims;
  }

  throw new TenantContextError(
    'No JWT claims found in authorizer context',
    401
  );
}

/**
 * Resolves the tenant context by looking up the tenant in platform.tenants.
 * Validates that the tenant exists and is in an active state.
 *
 * @param db - Database client connected to the platform database
 * @param tenantId - The tenant ID extracted from the JWT
 * @returns The resolved tenant context
 */
export async function resolveTenantContext(
  db: DatabaseClient,
  tenantId: string
): Promise<TenantContext> {
  // Validate tenantId format (UUID)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenantId)) {
    throw new TenantContextError(
      `Invalid tenant ID format: ${tenantId}`,
      400
    );
  }

  const result = await db.query<{
    tenant_id: string;
    schema_name: string;
    organisation_name: string;
    status: string;
    plan: string;
  }>(
    `SELECT tenant_id, schema_name, organisation_name, status, plan
     FROM platform.tenants
     WHERE tenant_id = $1`,
    [tenantId]
  );

  if (result.rowCount === 0) {
    throw new TenantContextError(
      `Tenant not found: ${tenantId}`,
      404
    );
  }

  const tenant = result.rows[0];

  if (tenant.status !== 'active') {
    throw new TenantContextError(
      `Tenant is not active (status: ${tenant.status}). Access denied.`,
      403
    );
  }

  return {
    tenantId: tenant.tenant_id,
    schemaName: tenant.schema_name,
    organisationName: tenant.organisation_name,
    status: tenant.status,
    plan: tenant.plan,
  };
}

/**
 * Scopes a database connection to a specific tenant schema.
 * Sets the search_path and the app.current_tenant_schema session variable
 * used by row-level security policies.
 *
 * @param db - Database client to scope
 * @param schemaName - The tenant's schema name
 */
export async function scopeConnectionToTenant(
  db: DatabaseClient,
  schemaName: string
): Promise<void> {
  // Validate schema name to prevent SQL injection
  if (!/^tenant_[a-z0-9]{12}$/.test(schemaName)) {
    throw new TenantContextError(
      `Invalid schema name format: ${schemaName}`,
      500
    );
  }

  // Set search_path to the tenant schema (with public for extensions)
  await db.query(`SET search_path TO "${schemaName}", public`);

  // Set the session variable used by RLS policies
  await db.query(`SET app.current_tenant_schema = '${schemaName}'`);
}

/**
 * Resets the database connection scope back to the platform schema.
 * Should be called after tenant-scoped operations complete.
 *
 * @param db - Database client to reset
 */
export async function resetConnectionScope(
  db: DatabaseClient
): Promise<void> {
  await db.query(`SET search_path TO platform, public`);
  await db.query(`SET app.current_tenant_schema = ''`);
}

/**
 * Full tenant context middleware that extracts tenant from JWT,
 * validates it, and scopes the database connection.
 *
 * Usage in a Lambda handler:
 * ```typescript
 * import { withTenantContext } from '@travel-policy/shared/middleware/tenant-context';
 *
 * export const handler = async (event: APIGatewayProxyEvent) => {
 *   const { tenantContext, db } = await withTenantContext(event, platformDb);
 *   // db is now scoped to the tenant's schema
 *   const result = await db.query('SELECT * FROM traveller_profiles');
 *   // ...
 * };
 * ```
 *
 * @param event - API Gateway event with JWT authorizer
 * @param db - Database client connected to the platform database
 * @returns Object containing the resolved tenant context and scoped DB client
 */
export async function withTenantContext(
  event: {
    requestContext?: {
      authorizer?: {
        claims?: JwtClaims;
        jwt?: { claims?: JwtClaims };
      };
    };
  },
  db: DatabaseClient
): Promise<{ tenantContext: TenantContext; db: DatabaseClient }> {
  // Extract claims from the event
  const claims = extractClaimsFromEvent(event);

  // Extract tenantId from claims
  const tenantId = extractTenantIdFromClaims(claims);

  // Resolve and validate tenant
  const tenantContext = await resolveTenantContext(db, tenantId);

  // Scope the connection to the tenant's schema
  await scopeConnectionToTenant(db, tenantContext.schemaName);

  return { tenantContext, db };
}

/**
 * Creates a tenant-scoped database client wrapper that automatically
 * resets the connection scope when done.
 *
 * Usage:
 * ```typescript
 * await withScopedTenantConnection(db, schemaName, async (scopedDb) => {
 *   const profiles = await scopedDb.query('SELECT * FROM traveller_profiles');
 *   // ...
 * });
 * // Connection scope is automatically reset
 * ```
 */
export async function withScopedTenantConnection<T>(
  db: DatabaseClient,
  schemaName: string,
  fn: (db: DatabaseClient) => Promise<T>
): Promise<T> {
  await scopeConnectionToTenant(db, schemaName);
  try {
    return await fn(db);
  } finally {
    await resetConnectionScope(db);
  }
}
