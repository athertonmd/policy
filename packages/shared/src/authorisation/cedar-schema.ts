/**
 * Cedar Policy Schema Definition
 *
 * Defines the entity types, actions, and resource hierarchy used by the
 * Cedar authorisation engine for the Travel Policy Platform.
 *
 * Entity types:
 * - User: A platform user with role memberships
 * - Role: A role that grants permissions (predefined or custom)
 * - TenantResource: Base resource type with subtypes for each resource category
 *
 * Actions:
 * - create, read, update, delete, approve, reject, override, export, configure
 */

import type { ResourceType, Action } from './types.js';

/**
 * Cedar schema in JSON format.
 * This schema defines the entity types and actions for the Cedar policy engine.
 */
export const CEDAR_SCHEMA = {
  'TravelPolicy': {
    entityTypes: {
      User: {
        shape: {
          type: 'Record' as const,
          attributes: {
            tenantId: { type: 'String' as const, required: true },
            email: { type: 'String' as const, required: false },
          },
        },
        memberOfTypes: ['Role'],
      },
      Role: {
        shape: {
          type: 'Record' as const,
          attributes: {
            tenantId: { type: 'String' as const, required: true },
          },
        },
      },
      TenantResource: {
        shape: {
          type: 'Record' as const,
          attributes: {
            tenantId: { type: 'String' as const, required: true },
            ownerId: { type: 'String' as const, required: false },
          },
        },
      },
    },
    actions: {
      create: {
        appliesTo: {
          principalTypes: ['User'],
          resourceTypes: ['TenantResource'],
        },
      },
      read: {
        appliesTo: {
          principalTypes: ['User'],
          resourceTypes: ['TenantResource'],
        },
      },
      update: {
        appliesTo: {
          principalTypes: ['User'],
          resourceTypes: ['TenantResource'],
        },
      },
      delete: {
        appliesTo: {
          principalTypes: ['User'],
          resourceTypes: ['TenantResource'],
        },
      },
      approve: {
        appliesTo: {
          principalTypes: ['User'],
          resourceTypes: ['TenantResource'],
        },
      },
      reject: {
        appliesTo: {
          principalTypes: ['User'],
          resourceTypes: ['TenantResource'],
        },
      },
      override: {
        appliesTo: {
          principalTypes: ['User'],
          resourceTypes: ['TenantResource'],
        },
      },
      export: {
        appliesTo: {
          principalTypes: ['User'],
          resourceTypes: ['TenantResource'],
        },
      },
      configure: {
        appliesTo: {
          principalTypes: ['User'],
          resourceTypes: ['TenantResource'],
        },
      },
    },
  },
} as const;

/** All valid resource types in the Cedar schema */
export const RESOURCE_TYPES: readonly ResourceType[] = [
  'Tenant',
  'Policy',
  'Workflow',
  'TravellerProfile',
  'Budget',
  'Report',
  'Integration',
  'Override',
  'AuditLog',
] as const;

/** All valid actions in the Cedar schema */
export const ACTIONS: readonly Action[] = [
  'create',
  'read',
  'update',
  'delete',
  'approve',
  'reject',
  'override',
  'export',
  'configure',
] as const;

/**
 * Validates that a given action string is a valid Cedar action.
 */
export function isValidAction(action: string): action is Action {
  return (ACTIONS as readonly string[]).includes(action);
}

/**
 * Validates that a given resource type string is a valid Cedar resource type.
 */
export function isValidResourceType(resourceType: string): resourceType is ResourceType {
  return (RESOURCE_TYPES as readonly string[]).includes(resourceType);
}
