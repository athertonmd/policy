import { describe, it, expect } from 'vitest';
import {
  CEDAR_SCHEMA,
  RESOURCE_TYPES,
  ACTIONS,
  isValidAction,
  isValidResourceType,
} from './cedar-schema.js';

describe('cedar-schema', () => {
  describe('CEDAR_SCHEMA', () => {
    it('should define User entity type with memberOfTypes Role', () => {
      const userType = CEDAR_SCHEMA.TravelPolicy.entityTypes.User;
      expect(userType.memberOfTypes).toContain('Role');
    });

    it('should define Role entity type', () => {
      const roleType = CEDAR_SCHEMA.TravelPolicy.entityTypes.Role;
      expect(roleType.shape.attributes.tenantId).toBeDefined();
    });

    it('should define TenantResource entity type', () => {
      const resourceType = CEDAR_SCHEMA.TravelPolicy.entityTypes.TenantResource;
      expect(resourceType.shape.attributes.tenantId.required).toBe(true);
      expect(resourceType.shape.attributes.ownerId.required).toBe(false);
    });

    it('should define all 9 actions', () => {
      const actions = Object.keys(CEDAR_SCHEMA.TravelPolicy.actions);
      expect(actions).toHaveLength(9);
      expect(actions).toContain('create');
      expect(actions).toContain('read');
      expect(actions).toContain('update');
      expect(actions).toContain('delete');
      expect(actions).toContain('approve');
      expect(actions).toContain('reject');
      expect(actions).toContain('override');
      expect(actions).toContain('export');
      expect(actions).toContain('configure');
    });

    it('should apply all actions to User principal and TenantResource', () => {
      for (const action of Object.values(CEDAR_SCHEMA.TravelPolicy.actions)) {
        expect(action.appliesTo.principalTypes).toContain('User');
        expect(action.appliesTo.resourceTypes).toContain('TenantResource');
      }
    });
  });

  describe('RESOURCE_TYPES', () => {
    it('should contain all 9 resource types', () => {
      expect(RESOURCE_TYPES).toHaveLength(9);
      expect(RESOURCE_TYPES).toContain('Tenant');
      expect(RESOURCE_TYPES).toContain('Policy');
      expect(RESOURCE_TYPES).toContain('Workflow');
      expect(RESOURCE_TYPES).toContain('TravellerProfile');
      expect(RESOURCE_TYPES).toContain('Budget');
      expect(RESOURCE_TYPES).toContain('Report');
      expect(RESOURCE_TYPES).toContain('Integration');
      expect(RESOURCE_TYPES).toContain('Override');
      expect(RESOURCE_TYPES).toContain('AuditLog');
    });
  });

  describe('ACTIONS', () => {
    it('should contain all 9 actions', () => {
      expect(ACTIONS).toHaveLength(9);
    });
  });

  describe('isValidAction', () => {
    it('should return true for valid actions', () => {
      expect(isValidAction('create')).toBe(true);
      expect(isValidAction('read')).toBe(true);
      expect(isValidAction('approve')).toBe(true);
    });

    it('should return false for invalid actions', () => {
      expect(isValidAction('invalid')).toBe(false);
      expect(isValidAction('')).toBe(false);
    });
  });

  describe('isValidResourceType', () => {
    it('should return true for valid resource types', () => {
      expect(isValidResourceType('Policy')).toBe(true);
      expect(isValidResourceType('Workflow')).toBe(true);
      expect(isValidResourceType('AuditLog')).toBe(true);
    });

    it('should return false for invalid resource types', () => {
      expect(isValidResourceType('Invalid')).toBe(false);
      expect(isValidResourceType('')).toBe(false);
    });
  });
});
