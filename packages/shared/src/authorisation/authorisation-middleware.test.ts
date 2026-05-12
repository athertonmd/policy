import { describe, it, expect, vi } from 'vitest';
import {
  extractRoleFromClaims,
  buildCedarUser,
  buildCedarResource,
  resolvePermissions,
  permissionMatches,
  evaluate,
  createAuditEntry,
  publishAuditEvent,
  authorise,
  authoriseFromClaims,
} from './authorisation-middleware.js';
import type { EventBridgeClient } from './authorisation-middleware.js';
import type {
  AuthorisationRequest,
  CedarResource,
  CedarUser,
  CustomRoleDefinition,
  RolePermission,
} from './types.js';
import type { JwtClaims } from '../middleware/tenant-context.js';

describe('authorisation-middleware', () => {
  const tenantId = '550e8400-e29b-41d4-a716-446655440000';

  describe('extractRoleFromClaims', () => {
    it('should extract role from custom:role claim', () => {
      const claims: JwtClaims = {
        sub: 'user-1',
        'custom:role': 'Approver',
      };
      expect(extractRoleFromClaims(claims)).toBe('Approver');
    });

    it('should default to Traveller when no role claim is present', () => {
      const claims: JwtClaims = { sub: 'user-1' };
      expect(extractRoleFromClaims(claims)).toBe('Traveller');
    });

    it('should default to Traveller when role claim is empty', () => {
      const claims: JwtClaims = { sub: 'user-1', 'custom:role': '' };
      expect(extractRoleFromClaims(claims)).toBe('Traveller');
    });
  });

  describe('buildCedarUser', () => {
    it('should build a user entity from claims', () => {
      const claims: JwtClaims = {
        sub: 'user-123',
        'custom:role': 'Policy_Administrator',
      };
      const user = buildCedarUser(claims, tenantId);
      expect(user).toEqual({
        id: 'user-123',
        tenantId,
        roles: ['Policy_Administrator'],
      });
    });

    it('should use "unknown" when sub is missing', () => {
      const claims: JwtClaims = { 'custom:role': 'Traveller' };
      const user = buildCedarUser(claims, tenantId);
      expect(user.id).toBe('unknown');
    });
  });

  describe('buildCedarResource', () => {
    it('should build a resource entity', () => {
      const resource = buildCedarResource('Policy', 'policy-1', tenantId, 'user-1');
      expect(resource).toEqual({
        type: 'Policy',
        id: 'policy-1',
        tenantId,
        ownerId: 'user-1',
      });
    });

    it('should build a resource without ownerId', () => {
      const resource = buildCedarResource('Report', 'report-1', tenantId);
      expect(resource).toEqual({
        type: 'Report',
        id: 'report-1',
        tenantId,
        ownerId: undefined,
      });
    });
  });

  describe('resolvePermissions', () => {
    it('should resolve permissions for a predefined role', () => {
      const permissions = resolvePermissions(['Traveller']);
      expect(permissions.length).toBeGreaterThan(0);
      expect(permissions).toContainEqual({
        action: 'read',
        resourceType: 'Policy',
        constraint: 'any',
      });
    });

    it('should resolve permissions for multiple roles', () => {
      const permissions = resolvePermissions(['Traveller', 'Finance_Viewer']);
      const hasReportRead = permissions.some(
        (p) => p.action === 'read' && p.resourceType === 'Report'
      );
      expect(hasReportRead).toBe(true);
    });

    it('should resolve custom role permissions', () => {
      const customRoles: CustomRoleDefinition[] = [
        {
          roleName: 'Custom_Viewer',
          tenantId,
          description: 'Custom read-only role',
          permissions: [
            { action: 'read', resourceType: 'Budget', constraint: 'any' },
          ],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];
      const permissions = resolvePermissions(['Custom_Viewer'], customRoles);
      expect(permissions).toEqual([
        { action: 'read', resourceType: 'Budget', constraint: 'any' },
      ]);
    });

    it('should return empty array for unknown role without custom roles', () => {
      const permissions = resolvePermissions(['NonExistentRole']);
      expect(permissions).toEqual([]);
    });
  });

  describe('permissionMatches', () => {
    const resource: CedarResource = {
      type: 'Policy',
      id: 'policy-1',
      tenantId,
      ownerId: 'user-1',
    };

    it('should match when action and resource type match with any constraint', () => {
      const permission: RolePermission = {
        action: 'read',
        resourceType: 'Policy',
        constraint: 'any',
      };
      expect(permissionMatches(permission, 'read', resource, 'user-2')).toBe(true);
    });

    it('should match own constraint when user is the owner', () => {
      const permission: RolePermission = {
        action: 'read',
        resourceType: 'Policy',
        constraint: 'own',
      };
      expect(permissionMatches(permission, 'read', resource, 'user-1')).toBe(true);
    });

    it('should not match own constraint when user is not the owner', () => {
      const permission: RolePermission = {
        action: 'read',
        resourceType: 'Policy',
        constraint: 'own',
      };
      expect(permissionMatches(permission, 'read', resource, 'user-2')).toBe(false);
    });

    it('should not match when action differs', () => {
      const permission: RolePermission = {
        action: 'create',
        resourceType: 'Policy',
        constraint: 'any',
      };
      expect(permissionMatches(permission, 'read', resource, 'user-1')).toBe(false);
    });

    it('should not match when resource type differs', () => {
      const permission: RolePermission = {
        action: 'read',
        resourceType: 'Report',
        constraint: 'any',
      };
      expect(permissionMatches(permission, 'read', resource, 'user-1')).toBe(false);
    });
  });

  describe('evaluate', () => {
    it('should allow Traveller to read their own profile', () => {
      const request: AuthorisationRequest = {
        principal: { id: 'user-1', tenantId, roles: ['Traveller'] },
        action: 'read',
        resource: { type: 'TravellerProfile', id: 'profile-1', tenantId, ownerId: 'user-1' },
      };
      const result = evaluate(request);
      expect(result.decision).toBe('Allow');
    });

    it('should deny Traveller reading another users profile', () => {
      const request: AuthorisationRequest = {
        principal: { id: 'user-1', tenantId, roles: ['Traveller'] },
        action: 'read',
        resource: { type: 'TravellerProfile', id: 'profile-2', tenantId, ownerId: 'user-2' },
      };
      const result = evaluate(request);
      expect(result.decision).toBe('Deny');
    });

    it('should allow Traveller to read policies', () => {
      const request: AuthorisationRequest = {
        principal: { id: 'user-1', tenantId, roles: ['Traveller'] },
        action: 'read',
        resource: { type: 'Policy', id: 'policy-1', tenantId },
      };
      const result = evaluate(request);
      expect(result.decision).toBe('Allow');
    });

    it('should deny Traveller from deleting policies', () => {
      const request: AuthorisationRequest = {
        principal: { id: 'user-1', tenantId, roles: ['Traveller'] },
        action: 'delete',
        resource: { type: 'Policy', id: 'policy-1', tenantId },
      };
      const result = evaluate(request);
      expect(result.decision).toBe('Deny');
    });

    it('should allow Approver to approve workflows', () => {
      const request: AuthorisationRequest = {
        principal: { id: 'user-1', tenantId, roles: ['Approver'] },
        action: 'approve',
        resource: { type: 'Workflow', id: 'wf-1', tenantId },
      };
      const result = evaluate(request);
      expect(result.decision).toBe('Allow');
    });

    it('should allow Approver to reject workflows', () => {
      const request: AuthorisationRequest = {
        principal: { id: 'user-1', tenantId, roles: ['Approver'] },
        action: 'reject',
        resource: { type: 'Workflow', id: 'wf-1', tenantId },
      };
      const result = evaluate(request);
      expect(result.decision).toBe('Allow');
    });

    it('should allow Travel_Arranger to create workflows for others', () => {
      const request: AuthorisationRequest = {
        principal: { id: 'user-1', tenantId, roles: ['Travel_Arranger'] },
        action: 'create',
        resource: { type: 'Workflow', id: 'wf-1', tenantId, ownerId: 'user-2' },
      };
      const result = evaluate(request);
      expect(result.decision).toBe('Allow');
    });

    it('should allow TMC_Agent to create overrides', () => {
      const request: AuthorisationRequest = {
        principal: { id: 'user-1', tenantId, roles: ['TMC_Agent'] },
        action: 'create',
        resource: { type: 'Override', id: 'override-1', tenantId },
      };
      const result = evaluate(request);
      expect(result.decision).toBe('Allow');
    });

    it('should allow Policy_Administrator to CRUD policies', () => {
      const actions = ['create', 'read', 'update', 'delete'] as const;
      for (const action of actions) {
        const request: AuthorisationRequest = {
          principal: { id: 'user-1', tenantId, roles: ['Policy_Administrator'] },
          action,
          resource: { type: 'Policy', id: 'policy-1', tenantId },
        };
        const result = evaluate(request);
        expect(result.decision).toBe('Allow');
      }
    });

    it('should allow Tenant_Administrator full access', () => {
      const request: AuthorisationRequest = {
        principal: { id: 'user-1', tenantId, roles: ['Tenant_Administrator'] },
        action: 'delete',
        resource: { type: 'Integration', id: 'int-1', tenantId },
      };
      const result = evaluate(request);
      expect(result.decision).toBe('Allow');
    });

    it('should allow Finance_Viewer to read and export reports', () => {
      const readRequest: AuthorisationRequest = {
        principal: { id: 'user-1', tenantId, roles: ['Finance_Viewer'] },
        action: 'read',
        resource: { type: 'Report', id: 'report-1', tenantId },
      };
      expect(evaluate(readRequest).decision).toBe('Allow');

      const exportRequest: AuthorisationRequest = {
        principal: { id: 'user-1', tenantId, roles: ['Finance_Viewer'] },
        action: 'export',
        resource: { type: 'Report', id: 'report-1', tenantId },
      };
      expect(evaluate(exportRequest).decision).toBe('Allow');
    });

    it('should deny Finance_Viewer from creating policies', () => {
      const request: AuthorisationRequest = {
        principal: { id: 'user-1', tenantId, roles: ['Finance_Viewer'] },
        action: 'create',
        resource: { type: 'Policy', id: 'policy-1', tenantId },
      };
      const result = evaluate(request);
      expect(result.decision).toBe('Deny');
    });

    it('should deny cross-tenant access', () => {
      const otherTenantId = '660e8400-e29b-41d4-a716-446655440000';
      const request: AuthorisationRequest = {
        principal: { id: 'user-1', tenantId, roles: ['Tenant_Administrator'] },
        action: 'read',
        resource: { type: 'Policy', id: 'policy-1', tenantId: otherTenantId },
      };
      const result = evaluate(request);
      expect(result.decision).toBe('Deny');
      expect(result.reasons).toContain('Cross-tenant access denied');
    });

    it('should deny for invalid action', () => {
      const request: AuthorisationRequest = {
        principal: { id: 'user-1', tenantId, roles: ['Traveller'] },
        action: 'invalid_action' as any,
        resource: { type: 'Policy', id: 'policy-1', tenantId },
      };
      const result = evaluate(request);
      expect(result.decision).toBe('Deny');
      expect(result.reasons[0]).toContain('Invalid action');
    });

    it('should deny for invalid resource type', () => {
      const request: AuthorisationRequest = {
        principal: { id: 'user-1', tenantId, roles: ['Traveller'] },
        action: 'read',
        resource: { type: 'InvalidResource' as any, id: 'res-1', tenantId },
      };
      const result = evaluate(request);
      expect(result.decision).toBe('Deny');
      expect(result.reasons[0]).toContain('Invalid resource type');
    });

    it('should support custom roles', () => {
      const customRoles: CustomRoleDefinition[] = [
        {
          roleName: 'Budget_Manager',
          tenantId,
          description: 'Can manage budgets',
          permissions: [
            { action: 'create', resourceType: 'Budget', constraint: 'any' },
            { action: 'read', resourceType: 'Budget', constraint: 'any' },
            { action: 'update', resourceType: 'Budget', constraint: 'any' },
          ],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const request: AuthorisationRequest = {
        principal: { id: 'user-1', tenantId, roles: ['Budget_Manager'] },
        action: 'create',
        resource: { type: 'Budget', id: 'budget-1', tenantId },
      };
      const result = evaluate(request, { auditEnabled: false, customRoles });
      expect(result.decision).toBe('Allow');
    });
  });

  describe('createAuditEntry', () => {
    it('should create a complete audit entry', () => {
      const request: AuthorisationRequest = {
        principal: { id: 'user-1', tenantId, roles: ['Traveller'] },
        action: 'read',
        resource: { type: 'Policy', id: 'policy-1', tenantId },
      };
      const response = { decision: 'Allow' as const, reasons: ['Permitted'], matchedPolicies: [] };

      const entry = createAuditEntry(request, response, '192.168.1.1', 'corr-123');

      expect(entry.tenantId).toBe(tenantId);
      expect(entry.userId).toBe('user-1');
      expect(entry.action).toBe('read');
      expect(entry.resourceType).toBe('Policy');
      expect(entry.resourceId).toBe('policy-1');
      expect(entry.decision).toBe('Allow');
      expect(entry.sourceIp).toBe('192.168.1.1');
      expect(entry.correlationId).toBe('corr-123');
      expect(entry.timestamp).toBeDefined();
    });
  });

  describe('publishAuditEvent', () => {
    it('should publish event to EventBridge', async () => {
      const mockEventBridge: EventBridgeClient = {
        putEvents: vi.fn().mockResolvedValue({}),
      };

      const auditEntry = {
        timestamp: '2024-01-01T00:00:00Z',
        tenantId,
        userId: 'user-1',
        action: 'read' as const,
        resourceType: 'Policy' as const,
        resourceId: 'policy-1',
        decision: 'Allow' as const,
        reasons: ['Permitted'],
      };

      await publishAuditEvent(mockEventBridge, auditEntry, 'test-bus');

      expect(mockEventBridge.putEvents).toHaveBeenCalledWith({
        Entries: [
          {
            Source: 'travel-policy-platform.authorisation',
            DetailType: 'AccessControlDecision',
            Detail: JSON.stringify(auditEntry),
            EventBusName: 'test-bus',
          },
        ],
      });
    });
  });

  describe('authorise', () => {
    it('should evaluate and return decision', async () => {
      const request: AuthorisationRequest = {
        principal: { id: 'user-1', tenantId, roles: ['Traveller'] },
        action: 'read',
        resource: { type: 'Policy', id: 'policy-1', tenantId },
      };

      const result = await authorise(request, { auditEnabled: false });
      expect(result.decision).toBe('Allow');
    });

    it('should publish audit event when enabled', async () => {
      const mockEventBridge: EventBridgeClient = {
        putEvents: vi.fn().mockResolvedValue({}),
      };

      const request: AuthorisationRequest = {
        principal: { id: 'user-1', tenantId, roles: ['Traveller'] },
        action: 'read',
        resource: { type: 'Policy', id: 'policy-1', tenantId },
      };

      await authorise(
        request,
        { auditEnabled: true, eventBusName: 'test-bus' },
        mockEventBridge,
        '10.0.0.1',
        'corr-456'
      );

      expect(mockEventBridge.putEvents).toHaveBeenCalled();
    });

    it('should not fail if audit publishing fails', async () => {
      const mockEventBridge: EventBridgeClient = {
        putEvents: vi.fn().mockRejectedValue(new Error('EventBridge error')),
      };

      const request: AuthorisationRequest = {
        principal: { id: 'user-1', tenantId, roles: ['Traveller'] },
        action: 'read',
        resource: { type: 'Policy', id: 'policy-1', tenantId },
      };

      const result = await authorise(
        request,
        { auditEnabled: true, eventBusName: 'test-bus' },
        mockEventBridge
      );

      // Should still return the decision even if audit fails
      expect(result.decision).toBe('Allow');
    });
  });

  describe('authoriseFromClaims', () => {
    it('should authorise from JWT claims', () => {
      const claims: JwtClaims = {
        sub: 'user-1',
        'custom:role': 'Policy_Administrator',
      };

      const result = authoriseFromClaims(
        claims,
        tenantId,
        'read',
        'Policy',
        'policy-1'
      );

      expect(result.decision).toBe('Allow');
    });

    it('should deny when role lacks permission', () => {
      const claims: JwtClaims = {
        sub: 'user-1',
        'custom:role': 'Finance_Viewer',
      };

      const result = authoriseFromClaims(
        claims,
        tenantId,
        'delete',
        'Policy',
        'policy-1'
      );

      expect(result.decision).toBe('Deny');
    });
  });
});
