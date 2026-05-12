import { describe, it, expect } from 'vitest';
import {
  filterProfileForRole,
  validateUpdatePermissions,
  canDecryptPii,
  getWritableFields,
  type ProfileRole,
  type ProfileWithPii,
} from './field-access-control.js';

const mockProfile: ProfileWithPii = {
  travellerId: 'user-001',
  tenantId: 'tenant-001',
  employeeId: 'EMP-123',
  email: 'john.doe@example.com',
  fullName: 'John Doe',
  department: 'Engineering',
  costCentre: 'CC-100',
  seniorityLevel: 'Senior',
  region: 'UK',
  managerId: 'manager-001',
  preferences: {
    seatPreference: 'aisle',
    mealPreference: 'vegetarian',
  },
  loyaltyProgrammes: [
    {
      programmeId: 'lp-1',
      programmeName: 'BA Executive Club',
      membershipNumber: '12345678',
      tier: 'Gold',
    },
  ],
  passportDetails: '{"number":"AB123456","expiry":"2030-01-01","country":"GB"}',
  emergencyContact: '{"name":"Jane Doe","phone":"+44123456789"}',
  status: 'active',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-06-01T00:00:00Z',
};

describe('filterProfileForRole', () => {
  describe('Traveller role', () => {
    it('should return all fields for own profile', () => {
      const result = filterProfileForRole(mockProfile, 'Traveller', true);

      expect(result.travellerId).toBe('user-001');
      expect(result.email).toBe('john.doe@example.com');
      expect(result.preferences).toEqual(mockProfile.preferences);
      expect(result.loyaltyProgrammes).toEqual(mockProfile.loyaltyProgrammes);
      expect(result.passportDetails).toBe(mockProfile.passportDetails);
      expect(result.emergencyContact).toBe(mockProfile.emergencyContact);
    });

    it('should return only basic fields for other profiles', () => {
      const result = filterProfileForRole(mockProfile, 'Traveller', false);

      expect(result.travellerId).toBe('user-001');
      expect(result.fullName).toBe('John Doe');
      expect(result.department).toBe('Engineering');
      // Should NOT include PII or sensitive fields
      expect(result.email).toBeUndefined();
      expect(result.preferences).toBeUndefined();
      expect(result.loyaltyProgrammes).toBeUndefined();
      expect(result.passportDetails).toBeUndefined();
      expect(result.emergencyContact).toBeUndefined();
    });
  });

  describe('TMC_Agent role', () => {
    it('should return all fields for own profile', () => {
      const result = filterProfileForRole(mockProfile, 'TMC_Agent', true);

      expect(result.passportDetails).toBe(mockProfile.passportDetails);
      expect(result.emergencyContact).toBe(mockProfile.emergencyContact);
    });

    it('should return limited PII fields for other profiles', () => {
      const result = filterProfileForRole(mockProfile, 'TMC_Agent', false);

      expect(result.travellerId).toBe('user-001');
      expect(result.email).toBe('john.doe@example.com');
      expect(result.preferences).toEqual(mockProfile.preferences);
      expect(result.loyaltyProgrammes).toEqual(mockProfile.loyaltyProgrammes);
      // Should NOT include encrypted PII
      expect(result.passportDetails).toBeUndefined();
      expect(result.emergencyContact).toBeUndefined();
    });
  });

  describe('Travel_Arranger role', () => {
    it('should return limited PII for other profiles', () => {
      const result = filterProfileForRole(mockProfile, 'Travel_Arranger', false);

      expect(result.email).toBe('john.doe@example.com');
      expect(result.preferences).toEqual(mockProfile.preferences);
      expect(result.passportDetails).toBeUndefined();
      expect(result.emergencyContact).toBeUndefined();
    });
  });

  describe('Tenant_Administrator role', () => {
    it('should return all fields for other profiles', () => {
      const result = filterProfileForRole(mockProfile, 'Tenant_Administrator', false);

      expect(result.travellerId).toBe('user-001');
      expect(result.email).toBe('john.doe@example.com');
      expect(result.passportDetails).toBe(mockProfile.passportDetails);
      expect(result.emergencyContact).toBe(mockProfile.emergencyContact);
      expect(result.preferences).toEqual(mockProfile.preferences);
    });
  });

  describe('Finance_Viewer role', () => {
    it('should return only basic fields for other profiles', () => {
      const result = filterProfileForRole(mockProfile, 'Finance_Viewer', false);

      expect(result.travellerId).toBe('user-001');
      expect(result.fullName).toBe('John Doe');
      expect(result.department).toBe('Engineering');
      expect(result.costCentre).toBe('CC-100');
      expect(result.email).toBeUndefined();
      expect(result.preferences).toBeUndefined();
      expect(result.passportDetails).toBeUndefined();
    });
  });

  describe('Approver role', () => {
    it('should return basic fields for other profiles', () => {
      const result = filterProfileForRole(mockProfile, 'Approver', false);

      expect(result.fullName).toBe('John Doe');
      expect(result.department).toBe('Engineering');
      expect(result.email).toBeUndefined();
      expect(result.passportDetails).toBeUndefined();
    });
  });
});

describe('canDecryptPii', () => {
  it('should allow Traveller to decrypt own PII', () => {
    expect(canDecryptPii('Traveller', true)).toBe(true);
  });

  it('should not allow Traveller to decrypt other PII', () => {
    expect(canDecryptPii('Traveller', false)).toBe(false);
  });

  it('should allow TMC_Agent to decrypt other PII (limited)', () => {
    expect(canDecryptPii('TMC_Agent', false)).toBe(true);
  });

  it('should allow Travel_Arranger to decrypt other PII (limited)', () => {
    expect(canDecryptPii('Travel_Arranger', false)).toBe(true);
  });

  it('should allow Tenant_Administrator to decrypt other PII', () => {
    expect(canDecryptPii('Tenant_Administrator', false)).toBe(true);
  });

  it('should not allow Finance_Viewer to decrypt other PII', () => {
    expect(canDecryptPii('Finance_Viewer', false)).toBe(false);
  });

  it('should not allow Approver to decrypt other PII', () => {
    expect(canDecryptPii('Approver', false)).toBe(false);
  });
});

describe('validateUpdatePermissions', () => {
  describe('Traveller role', () => {
    it('should allow updating preferences on own profile', () => {
      const result = validateUpdatePermissions(['preferences'], 'Traveller', true);
      expect(result.allowed).toBe(true);
      expect(result.deniedFields).toEqual([]);
    });

    it('should allow updating loyaltyProgrammes on own profile', () => {
      const result = validateUpdatePermissions(['loyaltyProgrammes'], 'Traveller', true);
      expect(result.allowed).toBe(true);
      expect(result.deniedFields).toEqual([]);
    });

    it('should deny updating department on own profile', () => {
      const result = validateUpdatePermissions(['department'], 'Traveller', true);
      expect(result.allowed).toBe(false);
      expect(result.deniedFields).toEqual(['department']);
    });

    it('should deny updating any field on other profiles', () => {
      const result = validateUpdatePermissions(['preferences'], 'Traveller', false);
      expect(result.allowed).toBe(false);
      expect(result.deniedFields).toEqual(['preferences']);
    });

    it('should partially deny mixed field updates', () => {
      const result = validateUpdatePermissions(
        ['preferences', 'department', 'loyaltyProgrammes'],
        'Traveller',
        true
      );
      expect(result.allowed).toBe(false);
      expect(result.deniedFields).toEqual(['department']);
    });
  });

  describe('Tenant_Administrator role', () => {
    it('should allow updating all standard fields on other profiles', () => {
      const result = validateUpdatePermissions(
        ['fullName', 'department', 'costCentre', 'preferences', 'loyaltyProgrammes'],
        'Tenant_Administrator',
        false
      );
      expect(result.allowed).toBe(true);
      expect(result.deniedFields).toEqual([]);
    });

    it('should allow updating organisational fields', () => {
      const result = validateUpdatePermissions(
        ['seniorityLevel', 'region', 'managerId'],
        'Tenant_Administrator',
        false
      );
      expect(result.allowed).toBe(true);
      expect(result.deniedFields).toEqual([]);
    });
  });

  describe('TMC_Agent role', () => {
    it('should allow updating preferences on other profiles', () => {
      const result = validateUpdatePermissions(['preferences'], 'TMC_Agent', false);
      expect(result.allowed).toBe(true);
      expect(result.deniedFields).toEqual([]);
    });

    it('should deny updating department on other profiles', () => {
      const result = validateUpdatePermissions(['department'], 'TMC_Agent', false);
      expect(result.allowed).toBe(false);
      expect(result.deniedFields).toEqual(['department']);
    });
  });

  describe('Finance_Viewer role', () => {
    it('should deny updating any field on other profiles', () => {
      const result = validateUpdatePermissions(
        ['preferences', 'department'],
        'Finance_Viewer',
        false
      );
      expect(result.allowed).toBe(false);
      expect(result.deniedFields).toEqual(['preferences', 'department']);
    });
  });
});

describe('getWritableFields', () => {
  it('should return preferences and loyaltyProgrammes for Traveller own profile', () => {
    const fields = getWritableFields('Traveller', true);
    expect(fields).toContain('preferences');
    expect(fields).toContain('loyaltyProgrammes');
    expect(fields).not.toContain('department');
  });

  it('should return empty array for Traveller other profile', () => {
    const fields = getWritableFields('Traveller', false);
    expect(fields).toEqual([]);
  });

  it('should return all standard fields for Tenant_Administrator', () => {
    const fields = getWritableFields('Tenant_Administrator', false);
    expect(fields).toContain('fullName');
    expect(fields).toContain('department');
    expect(fields).toContain('costCentre');
    expect(fields).toContain('preferences');
    expect(fields).toContain('loyaltyProgrammes');
  });

  it('should return preferences for TMC_Agent on other profiles', () => {
    const fields = getWritableFields('TMC_Agent', false);
    expect(fields).toContain('preferences');
    expect(fields).not.toContain('department');
  });
});
