/**
 * SCIM 2.0 User Provisioning Handler
 *
 * Implements RFC 7644 SCIM 2.0 endpoints for user provisioning:
 * - POST /v1/tenants/{tenantId}/scim/Users — Create user
 * - GET /v1/tenants/{tenantId}/scim/Users/{userId} — Get user
 * - PUT /v1/tenants/{tenantId}/scim/Users/{userId} — Replace user
 * - PATCH /v1/tenants/{tenantId}/scim/Users/{userId} — Update user
 * - DELETE /v1/tenants/{tenantId}/scim/Users/{userId} — Deactivate user
 *
 * Requirements: 2.5, 26.1, 26.2
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminDisableUserCommand,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { withDatabase } from '../lib/database.js';
import {
  mapScimToProfile,
  mapScimPatchToProfile,
  mapProfileToScimResponse,
  createScimError,
  createScimListResponse,
  validateScimUserResource,
  validateScimPatchRequest,
  type ScimUserResource,
  type ScimPatchRequest,
  type MappedProfileFields,
  SCIM_ERROR_SCHEMA,
} from '../lib/scim-mapper.js';

const cognitoClient = new CognitoIdentityProviderClient({});
const eventBridgeClient = new EventBridgeClient({});

const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME ?? 'travel-policy-platform';
const SCIM_CONTENT_TYPE = 'application/scim+json';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TenantRecord {
  tenant_id: string;
  cognito_user_pool_id: string;
  schema_name: string;
  status: string;
}

interface ProfileRecord {
  traveller_id: string;
  tenant_id: string;
  employee_id: string;
  email: string;
  full_name: string;
  department: string | null;
  cost_centre: string | null;
  seniority_level: string | null;
  manager_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}


// ─── Main Handler ────────────────────────────────────────────────────────────

export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  const requestId = context.awsRequestId;
  const startTime = Date.now();

  try {
    const tenantId = event.pathParameters?.tenantId;
    if (!tenantId) {
      return scimErrorResponse(400, 'tenantId path parameter is required', 'invalidValue', requestId);
    }

    // Resolve tenant
    const tenant = await resolveTenant(tenantId);
    if (!tenant) {
      return scimErrorResponse(404, `Tenant ${tenantId} not found`, 'invalidValue', requestId);
    }
    if (tenant.status !== 'active') {
      return scimErrorResponse(403, `Tenant ${tenantId} is not active`, 'invalidValue', requestId);
    }

    const method = event.httpMethod.toUpperCase();
    const userId = event.pathParameters?.userId;

    let result: APIGatewayProxyResult;

    if (method === 'POST' && !userId) {
      result = await handleCreateUser(event, tenant, requestId);
    } else if (method === 'GET' && userId) {
      result = await handleGetUser(userId, tenant, requestId);
    } else if (method === 'GET' && !userId) {
      result = await handleListUsers(event, tenant, requestId);
    } else if (method === 'PUT' && userId) {
      result = await handleReplaceUser(event, userId, tenant, requestId);
    } else if (method === 'PATCH' && userId) {
      result = await handlePatchUser(event, userId, tenant, requestId);
    } else if (method === 'DELETE' && userId) {
      result = await handleDeactivateUser(userId, tenant, requestId);
    } else {
      result = scimErrorResponse(405, 'Method not allowed', 'invalidValue', requestId);
    }

    // Check 30-second SLA
    const elapsed = Date.now() - startTime;
    if (elapsed > 30000) {
      console.warn(`SCIM operation exceeded 30s SLA: ${elapsed}ms`, { tenantId, method, userId });
    }

    return result;
  } catch (error) {
    console.error('SCIM handler error:', error);
    return scimErrorResponse(
      500,
      error instanceof Error ? error.message : 'Internal server error',
      'invalidValue',
      requestId
    );
  }
}

// ─── POST /scim/Users — Create User ─────────────────────────────────────────

async function handleCreateUser(
  event: APIGatewayProxyEvent,
  tenant: TenantRecord,
  requestId: string
): Promise<APIGatewayProxyResult> {
  if (!event.body) {
    return scimErrorResponse(400, 'Request body is required', 'invalidValue', requestId);
  }

  let scimUser: ScimUserResource;
  try {
    scimUser = JSON.parse(event.body) as ScimUserResource;
  } catch {
    return scimErrorResponse(400, 'Request body must be valid JSON', 'invalidSyntax', requestId);
  }

  const validationError = validateScimUserResource(scimUser);
  if (validationError) {
    return scimErrorResponse(400, validationError, 'invalidValue', requestId);
  }

  // Map SCIM attributes to profile fields
  const profileFields = mapScimToProfile(scimUser);

  if (!profileFields.email) {
    return scimErrorResponse(400, 'Unable to determine email from SCIM resource', 'invalidValue', requestId);
  }

  // Check for existing user with same email
  const existingProfile = await findProfileByEmail(tenant, profileFields.email);
  if (existingProfile) {
    return scimErrorResponse(409, `User with email ${profileFields.email} already exists`, 'uniqueness', requestId);
  }

  // Create user in Cognito
  await createCognitoUser(tenant.cognito_user_pool_id, profileFields);

  // Create traveller profile in tenant schema
  const profile = await createProfile(tenant, profileFields);

  // Publish ProfileUpdated event
  await publishProfileEvent('ProfileCreated', tenant.tenant_id, profile.traveller_id, profileFields);

  // Build SCIM response
  const baseUrl = getBaseUrl(event);
  const scimResponse = mapProfileToScimResponse(
    {
      travellerId: profile.traveller_id,
      email: profile.email,
      fullName: profile.full_name,
      department: profile.department ?? undefined,
      costCentre: profile.cost_centre ?? undefined,
      seniorityLevel: profile.seniority_level ?? undefined,
      managerId: profile.manager_id ?? undefined,
      employeeId: profile.employee_id,
      status: profile.status,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
    },
    tenant.tenant_id,
    baseUrl
  );

  return {
    statusCode: 201,
    headers: {
      'Content-Type': SCIM_CONTENT_TYPE,
      'Location': scimResponse.meta.location,
    },
    body: JSON.stringify(scimResponse),
  };
}

// ─── GET /scim/Users/{userId} — Get User ─────────────────────────────────────

async function handleGetUser(
  userId: string,
  tenant: TenantRecord,
  requestId: string
): Promise<APIGatewayProxyResult> {
  const profile = await findProfileById(tenant, userId);
  if (!profile) {
    return scimErrorResponse(404, `User ${userId} not found`, 'invalidValue', requestId);
  }

  const scimResponse = mapProfileToScimResponse(
    {
      travellerId: profile.traveller_id,
      email: profile.email,
      fullName: profile.full_name,
      department: profile.department ?? undefined,
      costCentre: profile.cost_centre ?? undefined,
      seniorityLevel: profile.seniority_level ?? undefined,
      managerId: profile.manager_id ?? undefined,
      employeeId: profile.employee_id,
      status: profile.status,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
    },
    tenant.tenant_id,
    '' // baseUrl not available without event, use relative
  );

  return {
    statusCode: 200,
    headers: { 'Content-Type': SCIM_CONTENT_TYPE },
    body: JSON.stringify(scimResponse),
  };
}

// ─── GET /scim/Users — List Users ────────────────────────────────────────────

async function handleListUsers(
  event: APIGatewayProxyEvent,
  tenant: TenantRecord,
  requestId: string
): Promise<APIGatewayProxyResult> {
  const startIndex = parseInt(event.queryStringParameters?.startIndex ?? '1', 10);
  const count = Math.min(parseInt(event.queryStringParameters?.count ?? '100', 10), 100);
  const filter = event.queryStringParameters?.filter;

  const { profiles, totalCount } = await listProfiles(tenant, startIndex, count, filter);

  const baseUrl = getBaseUrl(event);
  const resources = profiles.map((p) =>
    mapProfileToScimResponse(
      {
        travellerId: p.traveller_id,
        email: p.email,
        fullName: p.full_name,
        department: p.department ?? undefined,
        costCentre: p.cost_centre ?? undefined,
        seniorityLevel: p.seniority_level ?? undefined,
        managerId: p.manager_id ?? undefined,
        employeeId: p.employee_id,
        status: p.status,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      },
      tenant.tenant_id,
      baseUrl
    )
  );

  const listResponse = createScimListResponse(resources, totalCount, startIndex, count);

  return {
    statusCode: 200,
    headers: { 'Content-Type': SCIM_CONTENT_TYPE },
    body: JSON.stringify(listResponse),
  };
}

// ─── PUT /scim/Users/{userId} — Replace User ─────────────────────────────────

async function handleReplaceUser(
  event: APIGatewayProxyEvent,
  userId: string,
  tenant: TenantRecord,
  requestId: string
): Promise<APIGatewayProxyResult> {
  if (!event.body) {
    return scimErrorResponse(400, 'Request body is required', 'invalidValue', requestId);
  }

  let scimUser: ScimUserResource;
  try {
    scimUser = JSON.parse(event.body) as ScimUserResource;
  } catch {
    return scimErrorResponse(400, 'Request body must be valid JSON', 'invalidSyntax', requestId);
  }

  const validationError = validateScimUserResource(scimUser);
  if (validationError) {
    return scimErrorResponse(400, validationError, 'invalidValue', requestId);
  }

  // Verify user exists
  const existingProfile = await findProfileById(tenant, userId);
  if (!existingProfile) {
    return scimErrorResponse(404, `User ${userId} not found`, 'invalidValue', requestId);
  }

  // Map SCIM attributes to profile fields
  const profileFields = mapScimToProfile(scimUser);

  // Update Cognito user
  await updateCognitoUser(tenant.cognito_user_pool_id, existingProfile.email, profileFields);

  // Update profile in tenant schema
  const updatedProfile = await updateProfile(tenant, userId, profileFields);

  // Publish ProfileUpdated event
  await publishProfileEvent('ProfileUpdated', tenant.tenant_id, userId, profileFields);

  const baseUrl = getBaseUrl(event);
  const scimResponse = mapProfileToScimResponse(
    {
      travellerId: updatedProfile.traveller_id,
      email: updatedProfile.email,
      fullName: updatedProfile.full_name,
      department: updatedProfile.department ?? undefined,
      costCentre: updatedProfile.cost_centre ?? undefined,
      seniorityLevel: updatedProfile.seniority_level ?? undefined,
      managerId: updatedProfile.manager_id ?? undefined,
      employeeId: updatedProfile.employee_id,
      status: updatedProfile.status,
      createdAt: updatedProfile.created_at,
      updatedAt: updatedProfile.updated_at,
    },
    tenant.tenant_id,
    baseUrl
  );

  return {
    statusCode: 200,
    headers: { 'Content-Type': SCIM_CONTENT_TYPE },
    body: JSON.stringify(scimResponse),
  };
}

// ─── PATCH /scim/Users/{userId} — Update User ────────────────────────────────

async function handlePatchUser(
  event: APIGatewayProxyEvent,
  userId: string,
  tenant: TenantRecord,
  requestId: string
): Promise<APIGatewayProxyResult> {
  if (!event.body) {
    return scimErrorResponse(400, 'Request body is required', 'invalidValue', requestId);
  }

  let patchRequest: ScimPatchRequest;
  try {
    patchRequest = JSON.parse(event.body) as ScimPatchRequest;
  } catch {
    return scimErrorResponse(400, 'Request body must be valid JSON', 'invalidSyntax', requestId);
  }

  const validationError = validateScimPatchRequest(patchRequest);
  if (validationError) {
    return scimErrorResponse(400, validationError, 'invalidValue', requestId);
  }

  // Verify user exists
  const existingProfile = await findProfileById(tenant, userId);
  if (!existingProfile) {
    return scimErrorResponse(404, `User ${userId} not found`, 'invalidValue', requestId);
  }

  // Map patch operations to profile fields
  const profileFields = mapScimPatchToProfile(patchRequest);

  // Update Cognito user if relevant fields changed
  if (profileFields.email || profileFields.fullName || profileFields.status) {
    await updateCognitoUser(tenant.cognito_user_pool_id, existingProfile.email, profileFields);
  }

  // Handle deactivation via active=false
  if (profileFields.status === 'inactive') {
    await disableCognitoUser(tenant.cognito_user_pool_id, existingProfile.email);
  }

  // Update profile in tenant schema
  const updatedProfile = await updateProfile(tenant, userId, profileFields);

  // Publish ProfileUpdated event
  await publishProfileEvent('ProfileUpdated', tenant.tenant_id, userId, profileFields);

  const baseUrl = getBaseUrl(event);
  const scimResponse = mapProfileToScimResponse(
    {
      travellerId: updatedProfile.traveller_id,
      email: updatedProfile.email,
      fullName: updatedProfile.full_name,
      department: updatedProfile.department ?? undefined,
      costCentre: updatedProfile.cost_centre ?? undefined,
      seniorityLevel: updatedProfile.seniority_level ?? undefined,
      managerId: updatedProfile.manager_id ?? undefined,
      employeeId: updatedProfile.employee_id,
      status: updatedProfile.status,
      createdAt: updatedProfile.created_at,
      updatedAt: updatedProfile.updated_at,
    },
    tenant.tenant_id,
    baseUrl
  );

  return {
    statusCode: 200,
    headers: { 'Content-Type': SCIM_CONTENT_TYPE },
    body: JSON.stringify(scimResponse),
  };
}

// ─── DELETE /scim/Users/{userId} — Deactivate User ───────────────────────────

async function handleDeactivateUser(
  userId: string,
  tenant: TenantRecord,
  requestId: string
): Promise<APIGatewayProxyResult> {
  // Verify user exists
  const existingProfile = await findProfileById(tenant, userId);
  if (!existingProfile) {
    return scimErrorResponse(404, `User ${userId} not found`, 'invalidValue', requestId);
  }

  // Disable user in Cognito
  await disableCognitoUser(tenant.cognito_user_pool_id, existingProfile.email);

  // Deactivate profile in tenant schema
  await updateProfile(tenant, userId, { status: 'inactive' });

  // Publish ProfileDeactivated event
  await publishProfileEvent('ProfileDeactivated', tenant.tenant_id, userId, { status: 'inactive' });

  return {
    statusCode: 204,
    headers: { 'Content-Type': SCIM_CONTENT_TYPE },
    body: '',
  };
}


// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Resolves a tenant record from the platform.tenants table.
 */
async function resolveTenant(tenantId: string): Promise<TenantRecord | null> {
  return withDatabase(async (client) => {
    const result = await client.query<TenantRecord>(
      `SELECT tenant_id, cognito_user_pool_id, schema_name, status
       FROM platform.tenants
       WHERE tenant_id = $1`,
      [tenantId]
    );
    return result.rowCount > 0 ? result.rows[0] : null;
  });
}

/**
 * Finds a traveller profile by email within a tenant's schema.
 */
async function findProfileByEmail(
  tenant: TenantRecord,
  email: string
): Promise<ProfileRecord | null> {
  return withDatabase(async (client) => {
    await client.query(`SET search_path TO "${tenant.schema_name}", public`);
    const result = await client.query<ProfileRecord>(
      `SELECT traveller_id, tenant_id, employee_id, email, full_name,
              department, cost_centre, seniority_level, manager_id, status,
              created_at::text, updated_at::text
       FROM traveller_profiles
       WHERE email = $1`,
      [email]
    );
    return result.rowCount > 0 ? result.rows[0] : null;
  });
}

/**
 * Finds a traveller profile by ID within a tenant's schema.
 */
async function findProfileById(
  tenant: TenantRecord,
  travellerId: string
): Promise<ProfileRecord | null> {
  return withDatabase(async (client) => {
    await client.query(`SET search_path TO "${tenant.schema_name}", public`);
    const result = await client.query<ProfileRecord>(
      `SELECT traveller_id, tenant_id, employee_id, email, full_name,
              department, cost_centre, seniority_level, manager_id, status,
              created_at::text, updated_at::text
       FROM traveller_profiles
       WHERE traveller_id = $1`,
      [travellerId]
    );
    return result.rowCount > 0 ? result.rows[0] : null;
  });
}

/**
 * Creates a new traveller profile in the tenant's schema.
 */
async function createProfile(
  tenant: TenantRecord,
  fields: MappedProfileFields
): Promise<ProfileRecord> {
  return withDatabase(async (client) => {
    await client.query(`SET search_path TO "${tenant.schema_name}", public`);
    const result = await client.query<ProfileRecord>(
      `INSERT INTO traveller_profiles
         (tenant_id, employee_id, email, full_name, department, cost_centre,
          seniority_level, manager_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING traveller_id, tenant_id, employee_id, email, full_name,
                 department, cost_centre, seniority_level, manager_id, status,
                 created_at::text, updated_at::text`,
      [
        tenant.tenant_id,
        fields.employeeId ?? null,
        fields.email,
        fields.fullName ?? '',
        fields.department ?? null,
        fields.costCentre ?? null,
        fields.seniorityLevel ?? null,
        fields.managerId ?? null,
        fields.status ?? 'active',
      ]
    );
    return result.rows[0];
  });
}

/**
 * Updates an existing traveller profile in the tenant's schema.
 */
async function updateProfile(
  tenant: TenantRecord,
  travellerId: string,
  fields: MappedProfileFields
): Promise<ProfileRecord> {
  return withDatabase(async (client) => {
    await client.query(`SET search_path TO "${tenant.schema_name}", public`);

    // Build dynamic SET clause from non-undefined fields
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (fields.email !== undefined) {
      setClauses.push(`email = $${paramIndex++}`);
      values.push(fields.email);
    }
    if (fields.fullName !== undefined) {
      setClauses.push(`full_name = $${paramIndex++}`);
      values.push(fields.fullName);
    }
    if (fields.department !== undefined) {
      setClauses.push(`department = $${paramIndex++}`);
      values.push(fields.department);
    }
    if (fields.costCentre !== undefined) {
      setClauses.push(`cost_centre = $${paramIndex++}`);
      values.push(fields.costCentre);
    }
    if (fields.seniorityLevel !== undefined) {
      setClauses.push(`seniority_level = $${paramIndex++}`);
      values.push(fields.seniorityLevel);
    }
    if (fields.managerId !== undefined) {
      setClauses.push(`manager_id = $${paramIndex++}`);
      values.push(fields.managerId);
    }
    if (fields.employeeId !== undefined) {
      setClauses.push(`employee_id = $${paramIndex++}`);
      values.push(fields.employeeId);
    }
    if (fields.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(fields.status);
    }

    // Always update updated_at
    setClauses.push(`updated_at = NOW()`);

    values.push(travellerId);

    const result = await client.query<ProfileRecord>(
      `UPDATE traveller_profiles
       SET ${setClauses.join(', ')}
       WHERE traveller_id = $${paramIndex}
       RETURNING traveller_id, tenant_id, employee_id, email, full_name,
                 department, cost_centre, seniority_level, manager_id, status,
                 created_at::text, updated_at::text`,
      values
    );

    if (result.rowCount === 0) {
      throw new Error(`Profile ${travellerId} not found for update`);
    }

    return result.rows[0];
  });
}

/**
 * Lists traveller profiles with pagination and optional filter.
 */
async function listProfiles(
  tenant: TenantRecord,
  startIndex: number,
  count: number,
  filter?: string
): Promise<{ profiles: ProfileRecord[]; totalCount: number }> {
  return withDatabase(async (client) => {
    await client.query(`SET search_path TO "${tenant.schema_name}", public`);

    let whereClause = '';
    const params: unknown[] = [];

    // Support basic SCIM filter: userName eq "value"
    if (filter) {
      const match = filter.match(/^userName\s+eq\s+"([^"]+)"$/i);
      if (match) {
        whereClause = 'WHERE email = $1';
        params.push(match[1]);
      }
    }

    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM traveller_profiles ${whereClause}`,
      params
    );
    const totalCount = parseInt(countResult.rows[0].count, 10);

    const offset = Math.max(0, startIndex - 1); // SCIM startIndex is 1-based
    const dataParams = [...params, count, offset];
    const result = await client.query<ProfileRecord>(
      `SELECT traveller_id, tenant_id, employee_id, email, full_name,
              department, cost_centre, seniority_level, manager_id, status,
              created_at::text, updated_at::text
       FROM traveller_profiles ${whereClause}
       ORDER BY created_at ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams
    );

    return { profiles: result.rows, totalCount };
  });
}

/**
 * Creates a user in the Cognito user pool.
 */
async function createCognitoUser(
  userPoolId: string,
  fields: MappedProfileFields
): Promise<void> {
  await cognitoClient.send(
    new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: fields.email,
      UserAttributes: [
        { Name: 'email', Value: fields.email },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'name', Value: fields.fullName ?? '' },
      ],
      MessageAction: 'SUPPRESS', // Don't send welcome email for SCIM-provisioned users
    })
  );
}

/**
 * Updates a user's attributes in the Cognito user pool.
 */
async function updateCognitoUser(
  userPoolId: string,
  username: string,
  fields: MappedProfileFields
): Promise<void> {
  const attributes: { Name: string; Value: string }[] = [];

  if (fields.email) {
    attributes.push({ Name: 'email', Value: fields.email });
  }
  if (fields.fullName) {
    attributes.push({ Name: 'name', Value: fields.fullName });
  }

  if (attributes.length === 0) return;

  await cognitoClient.send(
    new AdminUpdateUserAttributesCommand({
      UserPoolId: userPoolId,
      Username: username,
      UserAttributes: attributes,
    })
  );
}

/**
 * Disables a user in the Cognito user pool.
 */
async function disableCognitoUser(
  userPoolId: string,
  username: string
): Promise<void> {
  await cognitoClient.send(
    new AdminDisableUserCommand({
      UserPoolId: userPoolId,
      Username: username,
    })
  );
}

/**
 * Publishes a profile event to EventBridge.
 */
async function publishProfileEvent(
  eventType: string,
  tenantId: string,
  travellerId: string,
  fields: MappedProfileFields
): Promise<void> {
  await eventBridgeClient.send(
    new PutEventsCommand({
      Entries: [
        {
          EventBusName: EVENT_BUS_NAME,
          Source: 'travel-policy-platform.tenant-management',
          DetailType: eventType,
          Detail: JSON.stringify({
            tenantId,
            travellerId,
            changes: fields,
            timestamp: new Date().toISOString(),
          }),
        },
      ],
    })
  );
}

/**
 * Constructs a SCIM-compliant error response.
 */
function scimErrorResponse(
  status: number,
  detail: string,
  scimType: string,
  _requestId: string
): APIGatewayProxyResult {
  const error = createScimError(status, detail, scimType);
  return {
    statusCode: status,
    headers: { 'Content-Type': SCIM_CONTENT_TYPE },
    body: JSON.stringify(error),
  };
}

/**
 * Extracts the base URL from the API Gateway event for constructing SCIM resource locations.
 */
function getBaseUrl(event: APIGatewayProxyEvent): string {
  const proto = event.headers?.['X-Forwarded-Proto'] ?? 'https';
  const host = event.headers?.['Host'] ?? event.headers?.['host'] ?? '';
  const stage = event.requestContext?.stage ?? '';
  if (!host) return '';
  return stage ? `${proto}://${host}/${stage}` : `${proto}://${host}`;
}
