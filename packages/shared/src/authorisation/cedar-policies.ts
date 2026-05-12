/**
 * Predefined Cedar Role Policies
 *
 * Defines the permissions for each predefined role in the platform.
 * These policies are evaluated by the authorisation middleware to determine
 * whether a user is allowed to perform an action on a resource.
 *
 * Role hierarchy:
 * - Traveller: Basic access to own profile and policies
 * - Approver: Traveller + approve/reject workflows
 * - Travel_Arranger: Traveller + manage trip requests for others
 * - TMC_Agent: Read profiles, manage workflows, create overrides
 * - Policy_Administrator: Full policy management, simulations, reports
 * - Tenant_Administrator: Full access within the tenant
 * - Finance_Viewer: Read-only access to reports and budgets
 */

import type { PredefinedRole, RolePermission, Action, ResourceType } from './types.js';

/** Permission definition for a predefined role */
export interface PredefinedRolePolicy {
  roleName: PredefinedRole;
  description: string;
  permissions: RolePermission[];
}

/**
 * Predefined role policies.
 * Each role has a set of permissions that define what actions can be performed
 * on which resource types, with optional ownership constraints.
 */
export const PREDEFINED_ROLE_POLICIES: Record<PredefinedRole, PredefinedRolePolicy> = {
  Traveller: {
    roleName: 'Traveller',
    description: 'Basic traveller with access to own profile and policies',
    permissions: [
      { action: 'read', resourceType: 'TravellerProfile', constraint: 'own' },
      { action: 'update', resourceType: 'TravellerProfile', constraint: 'own' },
      { action: 'read', resourceType: 'Policy', constraint: 'any' },
      { action: 'create', resourceType: 'Workflow', constraint: 'own' },
      { action: 'read', resourceType: 'Workflow', constraint: 'own' },
    ],
  },

  Approver: {
    roleName: 'Approver',
    description: 'Traveller permissions plus approve/reject workflows',
    permissions: [
      // Traveller permissions
      { action: 'read', resourceType: 'TravellerProfile', constraint: 'own' },
      { action: 'update', resourceType: 'TravellerProfile', constraint: 'own' },
      { action: 'read', resourceType: 'Policy', constraint: 'any' },
      { action: 'create', resourceType: 'Workflow', constraint: 'own' },
      { action: 'read', resourceType: 'Workflow', constraint: 'own' },
      // Approver-specific permissions
      { action: 'read', resourceType: 'Workflow', constraint: 'any' },
      { action: 'approve', resourceType: 'Workflow', constraint: 'any' },
      { action: 'reject', resourceType: 'Workflow', constraint: 'any' },
    ],
  },

  Travel_Arranger: {
    roleName: 'Travel_Arranger',
    description: 'Traveller permissions plus manage trip requests for others',
    permissions: [
      // Traveller permissions
      { action: 'read', resourceType: 'TravellerProfile', constraint: 'own' },
      { action: 'update', resourceType: 'TravellerProfile', constraint: 'own' },
      { action: 'read', resourceType: 'Policy', constraint: 'any' },
      { action: 'create', resourceType: 'Workflow', constraint: 'own' },
      { action: 'read', resourceType: 'Workflow', constraint: 'own' },
      // Travel Arranger-specific permissions
      { action: 'create', resourceType: 'Workflow', constraint: 'any' },
      { action: 'read', resourceType: 'Workflow', constraint: 'any' },
      { action: 'read', resourceType: 'TravellerProfile', constraint: 'any' },
    ],
  },

  TMC_Agent: {
    roleName: 'TMC_Agent',
    description: 'TMC agent with access to profiles, workflows, and overrides',
    permissions: [
      { action: 'read', resourceType: 'TravellerProfile', constraint: 'any' },
      { action: 'read', resourceType: 'Workflow', constraint: 'any' },
      { action: 'update', resourceType: 'Workflow', constraint: 'any' },
      { action: 'create', resourceType: 'Override', constraint: 'any' },
      { action: 'read', resourceType: 'Override', constraint: 'any' },
    ],
  },

  Policy_Administrator: {
    roleName: 'Policy_Administrator',
    description: 'Full policy management, simulations, and report access',
    permissions: [
      { action: 'create', resourceType: 'Policy', constraint: 'any' },
      { action: 'read', resourceType: 'Policy', constraint: 'any' },
      { action: 'update', resourceType: 'Policy', constraint: 'any' },
      { action: 'delete', resourceType: 'Policy', constraint: 'any' },
      { action: 'configure', resourceType: 'Policy', constraint: 'any' },
      { action: 'read', resourceType: 'Report', constraint: 'any' },
      { action: 'read', resourceType: 'Workflow', constraint: 'any' },
    ],
  },

  Tenant_Administrator: {
    roleName: 'Tenant_Administrator',
    description: 'Full access to all resources within the tenant',
    permissions: [
      { action: 'create', resourceType: 'Tenant', constraint: 'any' },
      { action: 'read', resourceType: 'Tenant', constraint: 'any' },
      { action: 'update', resourceType: 'Tenant', constraint: 'any' },
      { action: 'delete', resourceType: 'Tenant', constraint: 'any' },
      { action: 'configure', resourceType: 'Tenant', constraint: 'any' },
      { action: 'create', resourceType: 'Policy', constraint: 'any' },
      { action: 'read', resourceType: 'Policy', constraint: 'any' },
      { action: 'update', resourceType: 'Policy', constraint: 'any' },
      { action: 'delete', resourceType: 'Policy', constraint: 'any' },
      { action: 'configure', resourceType: 'Policy', constraint: 'any' },
      { action: 'create', resourceType: 'Workflow', constraint: 'any' },
      { action: 'read', resourceType: 'Workflow', constraint: 'any' },
      { action: 'update', resourceType: 'Workflow', constraint: 'any' },
      { action: 'delete', resourceType: 'Workflow', constraint: 'any' },
      { action: 'approve', resourceType: 'Workflow', constraint: 'any' },
      { action: 'reject', resourceType: 'Workflow', constraint: 'any' },
      { action: 'create', resourceType: 'TravellerProfile', constraint: 'any' },
      { action: 'read', resourceType: 'TravellerProfile', constraint: 'any' },
      { action: 'update', resourceType: 'TravellerProfile', constraint: 'any' },
      { action: 'delete', resourceType: 'TravellerProfile', constraint: 'any' },
      { action: 'create', resourceType: 'Budget', constraint: 'any' },
      { action: 'read', resourceType: 'Budget', constraint: 'any' },
      { action: 'update', resourceType: 'Budget', constraint: 'any' },
      { action: 'delete', resourceType: 'Budget', constraint: 'any' },
      { action: 'read', resourceType: 'Report', constraint: 'any' },
      { action: 'export', resourceType: 'Report', constraint: 'any' },
      { action: 'create', resourceType: 'Integration', constraint: 'any' },
      { action: 'read', resourceType: 'Integration', constraint: 'any' },
      { action: 'update', resourceType: 'Integration', constraint: 'any' },
      { action: 'delete', resourceType: 'Integration', constraint: 'any' },
      { action: 'configure', resourceType: 'Integration', constraint: 'any' },
      { action: 'create', resourceType: 'Override', constraint: 'any' },
      { action: 'read', resourceType: 'Override', constraint: 'any' },
      { action: 'update', resourceType: 'Override', constraint: 'any' },
      { action: 'override', resourceType: 'Override', constraint: 'any' },
      { action: 'read', resourceType: 'AuditLog', constraint: 'any' },
      { action: 'export', resourceType: 'AuditLog', constraint: 'any' },
    ],
  },

  Finance_Viewer: {
    roleName: 'Finance_Viewer',
    description: 'Read-only access to reports, budgets, and data export',
    permissions: [
      { action: 'read', resourceType: 'Report', constraint: 'any' },
      { action: 'export', resourceType: 'Report', constraint: 'any' },
      { action: 'read', resourceType: 'Budget', constraint: 'any' },
      { action: 'export', resourceType: 'Budget', constraint: 'any' },
    ],
  },
};

/**
 * All predefined role names.
 */
export const PREDEFINED_ROLES: readonly PredefinedRole[] = [
  'Traveller',
  'Approver',
  'Travel_Arranger',
  'TMC_Agent',
  'Policy_Administrator',
  'Tenant_Administrator',
  'Finance_Viewer',
] as const;

/**
 * Checks if a role name is a predefined role.
 */
export function isPredefinedRole(role: string): role is PredefinedRole {
  return (PREDEFINED_ROLES as readonly string[]).includes(role);
}

/**
 * Gets the permissions for a predefined role.
 * Returns undefined if the role is not a predefined role.
 */
export function getPredefinedRolePermissions(role: string): RolePermission[] | undefined {
  if (!isPredefinedRole(role)) {
    return undefined;
  }
  return PREDEFINED_ROLE_POLICIES[role].permissions;
}
