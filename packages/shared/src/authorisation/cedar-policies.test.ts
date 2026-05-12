import { describe, it, expect } from 'vitest';
import {
  PREDEFINED_ROLE_POLICIES,
  PREDEFINED_ROLES,
  isPredefinedRole,
  getPredefinedRolePermissions,
} from './cedar-policies.js';

describe('cedar-policies', () => {
  describe('PREDEFINED_ROLES', () => {
    it('should define all 7 predefined roles', () => {
      expect(PREDEFINED_ROLES).toHaveLength(7);
      expect(PREDEFINED_ROLES).toContain('Traveller');
      expect(PREDEFINED_ROLES).toContain('Approver');
      expect(PREDEFINED_ROLES).toContain('Travel_Arranger');
      expect(PREDEFINED_ROLES).toContain('TMC_Agent');
      expect(PREDEFINED_ROLES).toContain('Policy_Administrator');
      expect(PREDEFINED_ROLES).toContain('Tenant_Administrator');
      expect(PREDEFINED_ROLES).toContain('Finance_Viewer');
    });
  });

  describe('isPredefinedRole', () => {
    it('should return true for predefined roles', () => {
      expect(isPredefinedRole('Traveller')).toBe(true);
      expect(isPredefinedRole('Tenant_Administrator')).toBe(true);
    });

    it('should return false for non-predefined roles', () => {
      expect(isPredefinedRole('Custom_Role')).toBe(false);
      expect(isPredefinedRole('')).toBe(false);
    });
  });

  describe('getPredefinedRolePermissions', () => {
    it('should return permissions for a predefined role', () => {
      const permissions = getPredefinedRolePermissions('Traveller');
      expect(permissions).toBeDefined();
      expect(permissions!.length).toBeGreaterThan(0);
    });

    it('should return undefined for non-predefined role', () => {
      const permissions = getPredefinedRolePermissions('Unknown_Role');
      expect(permissions).toBeUndefined();
    });
  });

  describe('Traveller role', () => {
    const policy = PREDEFINED_ROLE_POLICIES.Traveller;

    it('should allow reading own profile', () => {
      expect(policy.permissions).toContainEqual({
        action: 'read',
        resourceType: 'TravellerProfile',
        constraint: 'own',
      });
    });

    it('should allow reading policies', () => {
      expect(policy.permissions).toContainEqual({
        action: 'read',
        resourceType: 'Policy',
        constraint: 'any',
      });
    });

    it('should allow creating own workflows (trip requests)', () => {
      expect(policy.permissions).toContainEqual({
        action: 'create',
        resourceType: 'Workflow',
        constraint: 'own',
      });
    });

    it('should not have delete permissions', () => {
      const deletePerms = policy.permissions.filter((p) => p.action === 'delete');
      expect(deletePerms).toHaveLength(0);
    });
  });

  describe('Approver role', () => {
    const policy = PREDEFINED_ROLE_POLICIES.Approver;

    it('should include Traveller permissions (read own profile)', () => {
      expect(policy.permissions).toContainEqual({
        action: 'read',
        resourceType: 'TravellerProfile',
        constraint: 'own',
      });
    });

    it('should allow approving workflows', () => {
      expect(policy.permissions).toContainEqual({
        action: 'approve',
        resourceType: 'Workflow',
        constraint: 'any',
      });
    });

    it('should allow rejecting workflows', () => {
      expect(policy.permissions).toContainEqual({
        action: 'reject',
        resourceType: 'Workflow',
        constraint: 'any',
      });
    });
  });

  describe('Travel_Arranger role', () => {
    const policy = PREDEFINED_ROLE_POLICIES.Travel_Arranger;

    it('should allow creating workflows for any user', () => {
      expect(policy.permissions).toContainEqual({
        action: 'create',
        resourceType: 'Workflow',
        constraint: 'any',
      });
    });

    it('should allow reading any traveller profile', () => {
      expect(policy.permissions).toContainEqual({
        action: 'read',
        resourceType: 'TravellerProfile',
        constraint: 'any',
      });
    });
  });

  describe('TMC_Agent role', () => {
    const policy = PREDEFINED_ROLE_POLICIES.TMC_Agent;

    it('should allow reading profiles', () => {
      expect(policy.permissions).toContainEqual({
        action: 'read',
        resourceType: 'TravellerProfile',
        constraint: 'any',
      });
    });

    it('should allow reading and updating workflows', () => {
      expect(policy.permissions).toContainEqual({
        action: 'read',
        resourceType: 'Workflow',
        constraint: 'any',
      });
      expect(policy.permissions).toContainEqual({
        action: 'update',
        resourceType: 'Workflow',
        constraint: 'any',
      });
    });

    it('should allow creating overrides', () => {
      expect(policy.permissions).toContainEqual({
        action: 'create',
        resourceType: 'Override',
        constraint: 'any',
      });
    });
  });

  describe('Policy_Administrator role', () => {
    const policy = PREDEFINED_ROLE_POLICIES.Policy_Administrator;

    it('should allow full CRUD on policies', () => {
      const policyPerms = policy.permissions.filter(
        (p) => p.resourceType === 'Policy'
      );
      const actions = policyPerms.map((p) => p.action);
      expect(actions).toContain('create');
      expect(actions).toContain('read');
      expect(actions).toContain('update');
      expect(actions).toContain('delete');
      expect(actions).toContain('configure');
    });

    it('should allow reading reports', () => {
      expect(policy.permissions).toContainEqual({
        action: 'read',
        resourceType: 'Report',
        constraint: 'any',
      });
    });
  });

  describe('Tenant_Administrator role', () => {
    const policy = PREDEFINED_ROLE_POLICIES.Tenant_Administrator;

    it('should have the most permissions of any role', () => {
      const otherRoles = PREDEFINED_ROLES.filter((r) => r !== 'Tenant_Administrator');
      for (const role of otherRoles) {
        expect(policy.permissions.length).toBeGreaterThan(
          PREDEFINED_ROLE_POLICIES[role].permissions.length
        );
      }
    });

    it('should have permissions for all resource types', () => {
      const resourceTypes = new Set(policy.permissions.map((p) => p.resourceType));
      expect(resourceTypes.size).toBeGreaterThanOrEqual(8);
    });
  });

  describe('Finance_Viewer role', () => {
    const policy = PREDEFINED_ROLE_POLICIES.Finance_Viewer;

    it('should allow reading reports', () => {
      expect(policy.permissions).toContainEqual({
        action: 'read',
        resourceType: 'Report',
        constraint: 'any',
      });
    });

    it('should allow exporting reports', () => {
      expect(policy.permissions).toContainEqual({
        action: 'export',
        resourceType: 'Report',
        constraint: 'any',
      });
    });

    it('should allow reading budgets', () => {
      expect(policy.permissions).toContainEqual({
        action: 'read',
        resourceType: 'Budget',
        constraint: 'any',
      });
    });

    it('should only have read and export permissions', () => {
      const actions = new Set(policy.permissions.map((p) => p.action));
      expect(actions.size).toBe(2);
      expect(actions.has('read')).toBe(true);
      expect(actions.has('export')).toBe(true);
    });
  });
});
