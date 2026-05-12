/**
 * Authorisation Middleware
 *
 * Evaluates Cedar-style policies on each request to determine whether
 * a user is allowed to perform an action on a resource.
 *
 * The middleware:
 * 1. Extracts user identity and role from JWT claims (custom:role)
 * 2. Builds Cedar entities (User with role membership, Resource)
 * 3. Evaluates the policy against the action being performed
 * 4. Returns allow/deny with the decision reason
 * 5. Logs the decision to the audit trail (via EventBridge event)
 */

import type {
  AuthorisationRequest,
  AuthorisationResponse,
  AuthorisationConfig,
  CedarUser,
  CedarResource,
  Action,
  ResourceType,
  RolePermission,
  CustomRoleDefinition,
  AccessControlAuditEntry,
} from './types.js';
import { PREDEFINED_ROLE_POLICIES } from './cedar-policies.js';
import { isPredefinedRole } from './cedar-policies.js';
import { isValidAction, isValidResourceType } from './cedar-schema.js';
import type { JwtClaims } from '../middleware/tenant-context.js';

/**
 * Interface for the EventBridge client used to publish audit events.
 */
export interface EventBridgeClient {
  putEvents(params: {
    Entries: Array<{
      Source: string;
      DetailType: string;
      Detail: string;
      EventBusName?: string;
    }>;
  }): Promise<unknown>;
}

/**
 * Extracts the user's role from JWT claims.
 * Falls back to 'Traveller' if no role is specified.
 */
export function extractRoleFromClaims(claims: JwtClaims): string {
  const role = claims['custom:role'];
  if (!role || typeof role !== 'string') {
    return 'Traveller';
  }
  return role;
}

/**
 * Builds a CedarUser entity from JWT claims.
 */
export function buildCedarUser(claims: JwtClaims, tenantId: string): CedarUser {
  const role = extractRoleFromClaims(claims);
  const userId = (claims.sub as string) || 'unknown';

  return {
    id: userId,
    tenantId,
    roles: [role],
  };
}

/**
 * Builds a CedarResource entity from request parameters.
 */
export function buildCedarResource(
  resourceType: ResourceType,
  resourceId: string,
  tenantId: string,
  ownerId?: string
): CedarResource {
  return {
    type: resourceType,
    id: resourceId,
    tenantId,
    ownerId,
  };
}

/**
 * Resolves all permissions for a user based on their roles.
 * Combines predefined role permissions with any custom role permissions.
 */
export function resolvePermissions(
  roles: string[],
  customRoles?: CustomRoleDefinition[]
): RolePermission[] {
  const permissions: RolePermission[] = [];

  for (const role of roles) {
    if (isPredefinedRole(role)) {
      permissions.push(...PREDEFINED_ROLE_POLICIES[role].permissions);
    } else if (customRoles) {
      const customRole = customRoles.find((cr) => cr.roleName === role);
      if (customRole) {
        permissions.push(...customRole.permissions);
      }
    }
  }

  return permissions;
}

/**
 * Checks if a permission matches the requested action and resource.
 * Handles ownership constraints: 'own' requires the resource ownerId to match the user.
 */
export function permissionMatches(
  permission: RolePermission,
  action: Action,
  resource: CedarResource,
  userId: string
): boolean {
  if (permission.action !== action) {
    return false;
  }

  if (permission.resourceType !== resource.type) {
    return false;
  }

  if (permission.constraint === 'own') {
    // For 'own' constraint, the resource must be owned by the user
    return resource.ownerId === userId;
  }

  // 'any' constraint allows access to all resources of this type
  return true;
}

/**
 * Evaluates an authorisation request against the configured policies.
 *
 * This is the core policy evaluation function. It:
 * 1. Validates the request parameters
 * 2. Resolves the user's permissions from their roles
 * 3. Checks if any permission allows the requested action
 * 4. Enforces tenant isolation (user and resource must be in the same tenant)
 * 5. Returns the decision with reasons
 */
export function evaluate(
  request: AuthorisationRequest,
  config?: AuthorisationConfig
): AuthorisationResponse {
  const { principal, action, resource } = request;

  // Validate action
  if (!isValidAction(action)) {
    return {
      decision: 'Deny',
      reasons: [`Invalid action: ${action}`],
      matchedPolicies: [],
    };
  }

  // Validate resource type
  if (!isValidResourceType(resource.type)) {
    return {
      decision: 'Deny',
      reasons: [`Invalid resource type: ${resource.type}`],
      matchedPolicies: [],
    };
  }

  // Enforce tenant isolation: user must belong to the same tenant as the resource
  if (principal.tenantId !== resource.tenantId) {
    return {
      decision: 'Deny',
      reasons: ['Cross-tenant access denied'],
      matchedPolicies: ['tenant-isolation'],
    };
  }

  // Resolve all permissions for the user's roles
  const permissions = resolvePermissions(principal.roles, config?.customRoles);

  // Check if any permission allows the action
  const matchedPermissions: string[] = [];
  for (const permission of permissions) {
    if (permissionMatches(permission, action, resource, principal.id)) {
      matchedPermissions.push(
        `${permission.action}:${permission.resourceType}:${permission.constraint}`
      );
    }
  }

  if (matchedPermissions.length > 0) {
    return {
      decision: 'Allow',
      reasons: [`Permitted by role: ${principal.roles.join(', ')}`],
      matchedPolicies: matchedPermissions,
    };
  }

  return {
    decision: 'Deny',
    reasons: [
      `No permission found for action '${action}' on resource type '${resource.type}' for roles: ${principal.roles.join(', ')}`,
    ],
    matchedPolicies: [],
  };
}

/**
 * Creates an audit entry for an access control decision.
 */
export function createAuditEntry(
  request: AuthorisationRequest,
  response: AuthorisationResponse,
  sourceIp?: string,
  correlationId?: string
): AccessControlAuditEntry {
  return {
    timestamp: new Date().toISOString(),
    tenantId: request.principal.tenantId,
    userId: request.principal.id,
    action: request.action,
    resourceType: request.resource.type,
    resourceId: request.resource.id,
    decision: response.decision,
    reasons: response.reasons,
    sourceIp,
    correlationId,
  };
}

/**
 * Publishes an access control audit event to EventBridge.
 */
export async function publishAuditEvent(
  eventBridge: EventBridgeClient,
  auditEntry: AccessControlAuditEntry,
  eventBusName: string
): Promise<void> {
  await eventBridge.putEvents({
    Entries: [
      {
        Source: 'travel-policy-platform.authorisation',
        DetailType: 'AccessControlDecision',
        Detail: JSON.stringify(auditEntry),
        EventBusName: eventBusName,
      },
    ],
  });
}

/**
 * Full authorisation middleware that evaluates a request and optionally logs the decision.
 *
 * Usage in a Lambda handler:
 * ```typescript
 * import { authorise } from '@travel-policy/shared/authorisation';
 *
 * const response = await authorise(
 *   { principal: user, action: 'read', resource },
 *   { auditEnabled: true, eventBusName: 'travel-policy-platform' },
 *   eventBridgeClient,
 *   sourceIp,
 *   correlationId
 * );
 *
 * if (response.decision === 'Deny') {
 *   return { statusCode: 403, body: JSON.stringify({ error: 'Access denied' }) };
 * }
 * ```
 */
export async function authorise(
  request: AuthorisationRequest,
  config: AuthorisationConfig,
  eventBridge?: EventBridgeClient,
  sourceIp?: string,
  correlationId?: string
): Promise<AuthorisationResponse> {
  const response = evaluate(request, config);

  // Log the decision to the audit trail if enabled
  if (config.auditEnabled && eventBridge && config.eventBusName) {
    const auditEntry = createAuditEntry(request, response, sourceIp, correlationId);
    // Fire-and-forget: don't block the response on audit logging
    publishAuditEvent(eventBridge, auditEntry, config.eventBusName).catch(() => {
      // Audit logging failure should not block authorisation decisions
    });
  }

  return response;
}

/**
 * Convenience function to authorise a request from an API Gateway event.
 * Extracts user identity from JWT claims and builds the authorisation request.
 */
export function authoriseFromClaims(
  claims: JwtClaims,
  tenantId: string,
  action: Action,
  resourceType: ResourceType,
  resourceId: string,
  resourceOwnerId?: string,
  config?: AuthorisationConfig
): AuthorisationResponse {
  const user = buildCedarUser(claims, tenantId);
  const resource = buildCedarResource(resourceType, resourceId, tenantId, resourceOwnerId);

  return evaluate({ principal: user, action, resource }, config);
}
