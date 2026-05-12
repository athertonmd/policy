import { describe, it, expect } from 'vitest';
import {
  mapScimToProfile,
  mapScimPatchToProfile,
  mapProfileToScimResponse,
  createScimError,
  createScimListResponse,
  validateScimUserResource,
  validateScimPatchRequest,
  SCIM_CORE_SCHEMA,
  SCIM_ENTERPRISE_SCHEMA,
  SCIM_PATCH_SCHEMA,
  SCIM_LIST_SCHEMA,
  SCIM_ERROR_SCHEMA,
  type ScimUserResource,
  type ScimPatchRequest,
} from './scim-mapper.js';

describe('scim-mapper', () => {
  describe('mapScimToProfile', () => {
    it('should map userName to email when no emails array is provided', () => {
      const scimUser: ScimUserResource = {
        schemas: [SCIM_CORE_SCHEMA],
        userName: 'john.doe@example.com',
      };

      const result = mapScimToProfile(scimUser);

      expect(result.email).toBe('john.doe@example.com');
    });

    it('should prefer primary email from emails array over userName', () => {
      const scimUser: ScimUserResource = {
        schemas: [SCIM_CORE_SCHEMA],
        userName: 'jdoe',
        emails: [
          { value: 'personal@example.com', type: 'home' },
          { value: 'work@company.com', type: 'work', primary: true },
        ],
      };

      const result = mapScimToProfile(scimUser);

      expect(result.email).toBe('work@company.com');
    });

    it('should fall back to work email when no primary is set', () => {
      const scimUser: ScimUserResource = {
        schemas: [SCIM_CORE_SCHEMA],
        userName: 'jdoe',
        emails: [
          { value: 'personal@example.com', type: 'home' },
          { value: 'work@company.com', type: 'work' },
        ],
      };

      const result = mapScimToProfile(scimUser);

      expect(result.email).toBe('work@company.com');
    });

    it('should map name.givenName + name.familyName to fullName', () => {
      const scimUser: ScimUserResource = {
        schemas: [SCIM_CORE_SCHEMA],
        userName: 'john.doe@example.com',
        name: {
          givenName: 'John',
          familyName: 'Doe',
        },
      };

      const result = mapScimToProfile(scimUser);

      expect(result.fullName).toBe('John Doe');
    });

    it('should use formatted name when givenName/familyName are missing', () => {
      const scimUser: ScimUserResource = {
        schemas: [SCIM_CORE_SCHEMA],
        userName: 'john.doe@example.com',
        name: {
          formatted: 'Dr. John Doe III',
        },
      };

      const result = mapScimToProfile(scimUser);

      expect(result.fullName).toBe('Dr. John Doe III');
    });

    it('should fall back to displayName when name object is absent', () => {
      const scimUser: ScimUserResource = {
        schemas: [SCIM_CORE_SCHEMA],
        userName: 'john.doe@example.com',
        displayName: 'John Doe',
      };

      const result = mapScimToProfile(scimUser);

      expect(result.fullName).toBe('John Doe');
    });

    it('should map externalId to employeeId', () => {
      const scimUser: ScimUserResource = {
        schemas: [SCIM_CORE_SCHEMA],
        userName: 'john.doe@example.com',
        externalId: 'EMP-12345',
      };

      const result = mapScimToProfile(scimUser);

      expect(result.employeeId).toBe('EMP-12345');
    });

    it('should map title to seniorityLevel', () => {
      const scimUser: ScimUserResource = {
        schemas: [SCIM_CORE_SCHEMA],
        userName: 'john.doe@example.com',
        title: 'Senior Director',
      };

      const result = mapScimToProfile(scimUser);

      expect(result.seniorityLevel).toBe('Senior Director');
    });

    it('should map active=true to status active', () => {
      const scimUser: ScimUserResource = {
        schemas: [SCIM_CORE_SCHEMA],
        userName: 'john.doe@example.com',
        active: true,
      };

      const result = mapScimToProfile(scimUser);

      expect(result.status).toBe('active');
    });

    it('should map active=false to status inactive', () => {
      const scimUser: ScimUserResource = {
        schemas: [SCIM_CORE_SCHEMA],
        userName: 'john.doe@example.com',
        active: false,
      };

      const result = mapScimToProfile(scimUser);

      expect(result.status).toBe('inactive');
    });

    it('should map enterprise extension department', () => {
      const scimUser: ScimUserResource = {
        schemas: [SCIM_CORE_SCHEMA, SCIM_ENTERPRISE_SCHEMA],
        userName: 'john.doe@example.com',
        'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User': {
          department: 'Engineering',
        },
      };

      const result = mapScimToProfile(scimUser);

      expect(result.department).toBe('Engineering');
    });

    it('should map enterprise extension costCenter to costCentre', () => {
      const scimUser: ScimUserResource = {
        schemas: [SCIM_CORE_SCHEMA, SCIM_ENTERPRISE_SCHEMA],
        userName: 'john.doe@example.com',
        'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User': {
          costCenter: 'CC-4500',
        },
      };

      const result = mapScimToProfile(scimUser);

      expect(result.costCentre).toBe('CC-4500');
    });

    it('should map enterprise extension manager.value to managerId', () => {
      const scimUser: ScimUserResource = {
        schemas: [SCIM_CORE_SCHEMA, SCIM_ENTERPRISE_SCHEMA],
        userName: 'john.doe@example.com',
        'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User': {
          manager: {
            value: 'mgr-001',
            displayName: 'Jane Smith',
          },
        },
      };

      const result = mapScimToProfile(scimUser);

      expect(result.managerId).toBe('mgr-001');
    });

    it('should use employeeNumber as employeeId fallback when externalId is absent', () => {
      const scimUser: ScimUserResource = {
        schemas: [SCIM_CORE_SCHEMA, SCIM_ENTERPRISE_SCHEMA],
        userName: 'john.doe@example.com',
        'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User': {
          employeeNumber: 'EN-9999',
        },
      };

      const result = mapScimToProfile(scimUser);

      expect(result.employeeId).toBe('EN-9999');
    });

    it('should prefer externalId over employeeNumber for employeeId', () => {
      const scimUser: ScimUserResource = {
        schemas: [SCIM_CORE_SCHEMA, SCIM_ENTERPRISE_SCHEMA],
        userName: 'john.doe@example.com',
        externalId: 'EXT-001',
        'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User': {
          employeeNumber: 'EN-9999',
        },
      };

      const result = mapScimToProfile(scimUser);

      expect(result.employeeId).toBe('EXT-001');
    });

    it('should map a complete SCIM user with all fields', () => {
      const scimUser: ScimUserResource = {
        schemas: [SCIM_CORE_SCHEMA, SCIM_ENTERPRISE_SCHEMA],
        userName: 'john.doe@acme.com',
        externalId: 'EMP-100',
        name: { givenName: 'John', familyName: 'Doe' },
        emails: [{ value: 'john.doe@acme.com', type: 'work', primary: true }],
        title: 'VP Engineering',
        active: true,
        'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User': {
          department: 'Engineering',
          costCenter: 'CC-ENG-01',
          manager: { value: 'mgr-jane' },
        },
      };

      const result = mapScimToProfile(scimUser);

      expect(result).toEqual({
        email: 'john.doe@acme.com',
        fullName: 'John Doe',
        employeeId: 'EMP-100',
        seniorityLevel: 'VP Engineering',
        status: 'active',
        department: 'Engineering',
        costCentre: 'CC-ENG-01',
        managerId: 'mgr-jane',
      });
    });
  });

  describe('mapScimPatchToProfile', () => {
    it('should handle replace operation on active field', () => {
      const patchRequest: ScimPatchRequest = {
        schemas: [SCIM_PATCH_SCHEMA],
        Operations: [
          { op: 'replace', path: 'active', value: false },
        ],
      };

      const result = mapScimPatchToProfile(patchRequest);

      expect(result.status).toBe('inactive');
    });

    it('should handle replace operation on title', () => {
      const patchRequest: ScimPatchRequest = {
        schemas: [SCIM_PATCH_SCHEMA],
        Operations: [
          { op: 'replace', path: 'title', value: 'Director' },
        ],
      };

      const result = mapScimPatchToProfile(patchRequest);

      expect(result.seniorityLevel).toBe('Director');
    });

    it('should handle replace operation on displayName', () => {
      const patchRequest: ScimPatchRequest = {
        schemas: [SCIM_PATCH_SCHEMA],
        Operations: [
          { op: 'replace', path: 'displayName', value: 'Jane Smith' },
        ],
      };

      const result = mapScimPatchToProfile(patchRequest);

      expect(result.fullName).toBe('Jane Smith');
    });

    it('should handle replace operation on enterprise department', () => {
      const patchRequest: ScimPatchRequest = {
        schemas: [SCIM_PATCH_SCHEMA],
        Operations: [
          {
            op: 'replace',
            path: 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:department',
            value: 'Sales',
          },
        ],
      };

      const result = mapScimPatchToProfile(patchRequest);

      expect(result.department).toBe('Sales');
    });

    it('should handle replace operation on enterprise costCenter', () => {
      const patchRequest: ScimPatchRequest = {
        schemas: [SCIM_PATCH_SCHEMA],
        Operations: [
          {
            op: 'replace',
            path: 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:costCenter',
            value: 'CC-SALES',
          },
        ],
      };

      const result = mapScimPatchToProfile(patchRequest);

      expect(result.costCentre).toBe('CC-SALES');
    });

    it('should handle replace operation on enterprise manager', () => {
      const patchRequest: ScimPatchRequest = {
        schemas: [SCIM_PATCH_SCHEMA],
        Operations: [
          {
            op: 'replace',
            path: 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:manager',
            value: { value: 'new-mgr-id' },
          },
        ],
      };

      const result = mapScimPatchToProfile(patchRequest);

      expect(result.managerId).toBe('new-mgr-id');
    });

    it('should handle remove operation on title', () => {
      const patchRequest: ScimPatchRequest = {
        schemas: [SCIM_PATCH_SCHEMA],
        Operations: [
          { op: 'remove', path: 'title' },
        ],
      };

      const result = mapScimPatchToProfile(patchRequest);

      expect(result.seniorityLevel).toBeUndefined();
    });

    it('should handle multiple operations in a single patch', () => {
      const patchRequest: ScimPatchRequest = {
        schemas: [SCIM_PATCH_SCHEMA],
        Operations: [
          { op: 'replace', path: 'title', value: 'CTO' },
          { op: 'replace', path: 'active', value: true },
          {
            op: 'replace',
            path: 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:department',
            value: 'Executive',
          },
        ],
      };

      const result = mapScimPatchToProfile(patchRequest);

      expect(result.seniorityLevel).toBe('CTO');
      expect(result.status).toBe('active');
      expect(result.department).toBe('Executive');
    });

    it('should handle add operation without path (partial user resource)', () => {
      const patchRequest: ScimPatchRequest = {
        schemas: [SCIM_PATCH_SCHEMA],
        Operations: [
          {
            op: 'add',
            value: {
              schemas: [SCIM_CORE_SCHEMA],
              userName: 'updated@example.com',
              title: 'Manager',
            },
          },
        ],
      };

      const result = mapScimPatchToProfile(patchRequest);

      expect(result.email).toBe('updated@example.com');
      expect(result.seniorityLevel).toBe('Manager');
    });
  });

  describe('mapProfileToScimResponse', () => {
    const baseProfile = {
      travellerId: 'trav-001',
      email: 'john.doe@acme.com',
      fullName: 'John Doe',
      employeeId: 'EMP-100',
      status: 'active',
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-03-20T14:30:00Z',
    };

    it('should produce a valid SCIM user response with core fields', () => {
      const result = mapProfileToScimResponse(
        baseProfile,
        'tenant-abc',
        'https://api.example.com'
      );

      expect(result.schemas).toContain(SCIM_CORE_SCHEMA);
      expect(result.id).toBe('trav-001');
      expect(result.userName).toBe('john.doe@acme.com');
      expect(result.active).toBe(true);
      expect(result.displayName).toBe('John Doe');
      expect(result.name?.givenName).toBe('John');
      expect(result.name?.familyName).toBe('Doe');
      expect(result.name?.formatted).toBe('John Doe');
      expect(result.emails).toEqual([
        { value: 'john.doe@acme.com', type: 'work', primary: true },
      ]);
    });

    it('should include meta with resource type and location', () => {
      const result = mapProfileToScimResponse(
        baseProfile,
        'tenant-abc',
        'https://api.example.com'
      );

      expect(result.meta.resourceType).toBe('User');
      expect(result.meta.created).toBe('2024-01-15T10:00:00Z');
      expect(result.meta.lastModified).toBe('2024-03-20T14:30:00Z');
      expect(result.meta.location).toBe(
        'https://api.example.com/v1/tenants/tenant-abc/scim/Users/trav-001'
      );
    });

    it('should include enterprise extension when enterprise fields are present', () => {
      const profileWithEnterprise = {
        ...baseProfile,
        department: 'Engineering',
        costCentre: 'CC-ENG',
        managerId: 'mgr-001',
      };

      const result = mapProfileToScimResponse(
        profileWithEnterprise,
        'tenant-abc',
        'https://api.example.com'
      );

      expect(result.schemas).toContain(SCIM_ENTERPRISE_SCHEMA);
      const ext = result['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'];
      expect(ext?.department).toBe('Engineering');
      expect(ext?.costCenter).toBe('CC-ENG');
      expect(ext?.manager?.value).toBe('mgr-001');
      expect(ext?.employeeNumber).toBe('EMP-100');
    });

    it('should set active=false for inactive status', () => {
      const inactiveProfile = { ...baseProfile, status: 'inactive' };

      const result = mapProfileToScimResponse(
        inactiveProfile,
        'tenant-abc',
        'https://api.example.com'
      );

      expect(result.active).toBe(false);
    });

    it('should set externalId from employeeId', () => {
      const result = mapProfileToScimResponse(
        baseProfile,
        'tenant-abc',
        'https://api.example.com'
      );

      expect(result.externalId).toBe('EMP-100');
    });

    it('should handle single-word names', () => {
      const singleNameProfile = { ...baseProfile, fullName: 'Madonna' };

      const result = mapProfileToScimResponse(
        singleNameProfile,
        'tenant-abc',
        'https://api.example.com'
      );

      expect(result.name?.givenName).toBe('Madonna');
      expect(result.name?.familyName).toBeUndefined();
      expect(result.name?.formatted).toBe('Madonna');
    });
  });

  describe('createScimError', () => {
    it('should create a valid SCIM error response', () => {
      const error = createScimError(400, 'Invalid request', 'invalidValue');

      expect(error.schemas).toEqual([SCIM_ERROR_SCHEMA]);
      expect(error.status).toBe('400');
      expect(error.detail).toBe('Invalid request');
      expect(error.scimType).toBe('invalidValue');
    });

    it('should omit scimType when not provided', () => {
      const error = createScimError(500, 'Internal error');

      expect(error.schemas).toEqual([SCIM_ERROR_SCHEMA]);
      expect(error.status).toBe('500');
      expect(error.detail).toBe('Internal error');
      expect(error.scimType).toBeUndefined();
    });
  });

  describe('createScimListResponse', () => {
    it('should create a valid SCIM list response', () => {
      const resources = [
        mapProfileToScimResponse(
          {
            travellerId: 'trav-001',
            email: 'user@example.com',
            fullName: 'Test User',
            employeeId: 'EMP-1',
            status: 'active',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
          'tenant-1',
          'https://api.example.com'
        ),
      ];

      const result = createScimListResponse(resources, 50, 1, 10);

      expect(result.schemas).toEqual([SCIM_LIST_SCHEMA]);
      expect(result.totalResults).toBe(50);
      expect(result.startIndex).toBe(1);
      expect(result.itemsPerPage).toBe(10);
      expect(result.Resources).toHaveLength(1);
    });
  });

  describe('validateScimUserResource', () => {
    it('should return null for a valid SCIM user resource', () => {
      const user = {
        schemas: [SCIM_CORE_SCHEMA],
        userName: 'john.doe@example.com',
      };

      expect(validateScimUserResource(user)).toBeNull();
    });

    it('should reject null input', () => {
      expect(validateScimUserResource(null)).toBe('Request body must be a JSON object');
    });

    it('should reject missing schemas array', () => {
      const user = { userName: 'test@example.com' };

      expect(validateScimUserResource(user)).toBe(
        'schemas array is required and must contain at least one schema URI'
      );
    });

    it('should reject empty schemas array', () => {
      const user = { schemas: [], userName: 'test@example.com' };

      expect(validateScimUserResource(user)).toBe(
        'schemas array is required and must contain at least one schema URI'
      );
    });

    it('should reject schemas without core user schema', () => {
      const user = {
        schemas: [SCIM_ENTERPRISE_SCHEMA],
        userName: 'test@example.com',
      };

      expect(validateScimUserResource(user)).toBe(
        `schemas must include ${SCIM_CORE_SCHEMA}`
      );
    });

    it('should reject missing userName', () => {
      const user = { schemas: [SCIM_CORE_SCHEMA] };

      expect(validateScimUserResource(user)).toBe(
        'userName is required and must be a string'
      );
    });

    it('should reject non-string userName', () => {
      const user = { schemas: [SCIM_CORE_SCHEMA], userName: 123 };

      expect(validateScimUserResource(user)).toBe(
        'userName is required and must be a string'
      );
    });
  });

  describe('validateScimPatchRequest', () => {
    it('should return null for a valid patch request', () => {
      const request = {
        schemas: [SCIM_PATCH_SCHEMA],
        Operations: [{ op: 'replace', path: 'active', value: false }],
      };

      expect(validateScimPatchRequest(request)).toBeNull();
    });

    it('should reject null input', () => {
      expect(validateScimPatchRequest(null)).toBe('Request body must be a JSON object');
    });

    it('should reject missing PatchOp schema', () => {
      const request = {
        schemas: [SCIM_CORE_SCHEMA],
        Operations: [{ op: 'replace', path: 'active', value: false }],
      };

      expect(validateScimPatchRequest(request)).toBe(
        `schemas must include ${SCIM_PATCH_SCHEMA}`
      );
    });

    it('should reject empty Operations array', () => {
      const request = {
        schemas: [SCIM_PATCH_SCHEMA],
        Operations: [],
      };

      expect(validateScimPatchRequest(request)).toBe(
        'Operations array is required and must contain at least one operation'
      );
    });

    it('should reject invalid operation type', () => {
      const request = {
        schemas: [SCIM_PATCH_SCHEMA],
        Operations: [{ op: 'invalid', path: 'active', value: false }],
      };

      expect(validateScimPatchRequest(request)).toBe(
        'Invalid operation: invalid. Must be one of: add, replace, remove'
      );
    });

    it('should allow remove operation without value', () => {
      const request = {
        schemas: [SCIM_PATCH_SCHEMA],
        Operations: [{ op: 'remove', path: 'title' }],
      };

      expect(validateScimPatchRequest(request)).toBeNull();
    });
  });
});
