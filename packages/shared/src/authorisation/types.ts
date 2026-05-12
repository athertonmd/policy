/**
 * TypeScript types for the Cedar authorisation layer.
 *
 * Defines entity types, actions, roles, and authorisation decision structures
 * used throughout the platform for role-based access control.
 */

/** All predefined roles available in the platform */
export type PredefinedRole =
  | 'Traveller'
  | 'Approver'
  | 'Travel_Arranger'
  | 'TMC_Agent'
  | 'Policy_Administrator'
  | 'Tenant_Administrator'
  | 'Finance_Viewer';

/** Actions that can be performed on resources */
export type Action =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'approve'
  | 'reject'
  | 'override'
  | 'export'
  | 'configure';

/** Resource types in the platform */
export type ResourceType =
  | 'Tenant'
  | 'Policy'
  | 'Workflow'
  | 'TravellerProfile'
  | 'Budget'
  | 'Report'
  | 'Integration'
  | 'Override'
  | 'AuditLog';

/** Represents a Cedar User entity */
export interface CedarUser {
  id: string;
  tenantId: string;
  roles: string[];
}

/** Represents a Cedar Resource entity */
export interface CedarResource {
  type: ResourceType;
  id: string;
  tenantId: string;
  /** Optional owner ID for ownership-based access control */
  ownerId?: string;
}

/** Represents an authorisation request to be evaluated */
export interface AuthorisationRequest {
  principal: CedarUser;
  action: Action;
  resource: CedarResource;
}

/** The result of an authorisation decision */
export type AuthorisationDecision = 'Allow' | 'Deny';

/** Full authorisation response including decision metadata */
export interface AuthorisationResponse {
  decision: AuthorisationDecision;
  /** Reasons explaining the decision */
  reasons: string[];
  /** The policies that contributed to the decision */
  matchedPolicies: string[];
}

/** Audit log entry for an access control decision */
export interface AccessControlAuditEntry {
  timestamp: string;
  tenantId: string;
  userId: string;
  action: Action;
  resourceType: ResourceType;
  resourceId: string;
  decision: AuthorisationDecision;
  reasons: string[];
  sourceIp?: string;
  correlationId?: string;
}

/** Custom role definition for tenant-specific roles */
export interface CustomRoleDefinition {
  roleName: string;
  tenantId: string;
  description: string;
  permissions: RolePermission[];
  createdAt: string;
  updatedAt: string;
}

/** A single permission entry for a role */
export interface RolePermission {
  action: Action;
  resourceType: ResourceType;
  /** Constraint: 'any' allows access to all resources of this type, 'own' restricts to owned resources */
  constraint: 'any' | 'own';
}

/** Configuration for the authorisation middleware */
export interface AuthorisationConfig {
  /** Whether to log all access control decisions */
  auditEnabled: boolean;
  /** EventBridge bus name for publishing audit events */
  eventBusName?: string;
  /** Custom roles loaded for the tenant */
  customRoles?: CustomRoleDefinition[];
}
