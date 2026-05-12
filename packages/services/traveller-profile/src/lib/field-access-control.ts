/**
 * Field-Level Access Control for Traveller Profiles
 *
 * Defines which fields each role can read/write, and provides
 * filtering and validation functions based on Cedar-style policies.
 */

import type { TravellerProfile, ProfileUpdate } from '@travel-policy/shared';

/**
 * Roles that interact with traveller profiles.
 */
export type ProfileRole =
  | 'Traveller'
  | 'Travel_Arranger'
  | 'TMC_Agent'
  | 'Approver'
  | 'Policy_Administrator'
  | 'Tenant_Administrator'
  | 'Finance_Viewer';

/**
 * Fields that are considered PII and require encryption.
 */
export const PII_FIELDS: ReadonlyArray<keyof TravellerProfile> = [
  'email',
];

/**
 * Extended PII fields stored in a separate encrypted column.
 * These are not part of the base TravellerProfile type but stored as encrypted JSON.
 */
export const ENCRYPTED_PII_FIELD_NAMES = [
  'passportDetails',
  'emergencyContact',
] as const;

export type EncryptedPiiFieldName = (typeof ENCRYPTED_PII_FIELD_NAMES)[number];

/**
 * Profile with encrypted PII fields included.
 */
export interface ProfileWithPii extends TravellerProfile {
  passportDetails?: string;
  emergencyContact?: string;
}

/**
 * Defines readable fields per role.
 * 'all' means all fields including decrypted PII.
 * Otherwise, lists specific field groups.
 */
type FieldAccess = 'all' | 'basic' | 'limited_pii' | 'no_pii';

interface RoleReadAccess {
  ownProfile: FieldAccess;
  otherProfile: FieldAccess;
}

const READ_ACCESS: Record<ProfileRole, RoleReadAccess> = {
  Traveller: {
    ownProfile: 'all',
    otherProfile: 'no_pii',
  },
  Travel_Arranger: {
    ownProfile: 'all',
    otherProfile: 'limited_pii',
  },
  TMC_Agent: {
    ownProfile: 'all',
    otherProfile: 'limited_pii',
  },
  Approver: {
    ownProfile: 'all',
    otherProfile: 'basic',
  },
  Policy_Administrator: {
    ownProfile: 'all',
    otherProfile: 'basic',
  },
  Tenant_Administrator: {
    ownProfile: 'all',
    otherProfile: 'all',
  },
  Finance_Viewer: {
    ownProfile: 'all',
    otherProfile: 'basic',
  },
};

/**
 * Basic fields visible to most roles.
 */
const BASIC_FIELDS: ReadonlyArray<keyof ProfileWithPii> = [
  'travellerId',
  'tenantId',
  'employeeId',
  'fullName',
  'department',
  'costCentre',
  'seniorityLevel',
  'region',
  'managerId',
  'status',
  'createdAt',
  'updatedAt',
];

/**
 * Fields visible with limited PII access (Travel Arrangers, TMC Agents).
 */
const LIMITED_PII_FIELDS: ReadonlyArray<keyof ProfileWithPii> = [
  ...BASIC_FIELDS,
  'email',
  'preferences',
  'loyaltyProgrammes',
];

/**
 * All fields including encrypted PII.
 */
const ALL_FIELDS: ReadonlyArray<keyof ProfileWithPii> = [
  ...LIMITED_PII_FIELDS,
  'passportDetails',
  'emergencyContact',
];

/**
 * Writable fields per role.
 */
interface RoleWriteAccess {
  ownProfile: ReadonlyArray<keyof ProfileUpdate>;
  otherProfile: ReadonlyArray<keyof ProfileUpdate>;
}

const WRITE_ACCESS: Record<ProfileRole, RoleWriteAccess> = {
  Traveller: {
    ownProfile: ['preferences', 'loyaltyProgrammes'],
    otherProfile: [],
  },
  Travel_Arranger: {
    ownProfile: ['preferences', 'loyaltyProgrammes'],
    otherProfile: ['preferences'],
  },
  TMC_Agent: {
    ownProfile: ['preferences', 'loyaltyProgrammes'],
    otherProfile: ['preferences'],
  },
  Approver: {
    ownProfile: ['preferences', 'loyaltyProgrammes'],
    otherProfile: [],
  },
  Policy_Administrator: {
    ownProfile: ['preferences', 'loyaltyProgrammes'],
    otherProfile: [],
  },
  Tenant_Administrator: {
    ownProfile: [
      'fullName',
      'department',
      'costCentre',
      'seniorityLevel',
      'region',
      'managerId',
      'preferences',
      'loyaltyProgrammes',
    ],
    otherProfile: [
      'fullName',
      'department',
      'costCentre',
      'seniorityLevel',
      'region',
      'managerId',
      'preferences',
      'loyaltyProgrammes',
    ],
  },
  Finance_Viewer: {
    ownProfile: ['preferences', 'loyaltyProgrammes'],
    otherProfile: [],
  },
};

/**
 * Determines which fields are readable for a given access level.
 */
function getReadableFields(access: FieldAccess): ReadonlyArray<keyof ProfileWithPii> {
  switch (access) {
    case 'all':
      return ALL_FIELDS;
    case 'limited_pii':
      return LIMITED_PII_FIELDS;
    case 'basic':
      return BASIC_FIELDS;
    case 'no_pii':
      return BASIC_FIELDS;
  }
}

/**
 * Filters a profile to only include fields the requesting role is allowed to see.
 *
 * @param profile - The full profile (potentially with decrypted PII)
 * @param role - The role of the requesting user
 * @param isOwnProfile - Whether the requesting user owns this profile
 * @returns A filtered profile with only authorized fields
 */
export function filterProfileForRole(
  profile: ProfileWithPii,
  role: ProfileRole,
  isOwnProfile: boolean
): Partial<ProfileWithPii> {
  const roleAccess = READ_ACCESS[role];
  if (!roleAccess) {
    return { travellerId: profile.travellerId, tenantId: profile.tenantId };
  }

  const accessLevel = isOwnProfile ? roleAccess.ownProfile : roleAccess.otherProfile;
  const allowedFields = getReadableFields(accessLevel);

  const filtered: Partial<ProfileWithPii> = {};
  for (const field of allowedFields) {
    if (field in profile && profile[field] !== undefined) {
      (filtered as Record<string, unknown>)[field] = profile[field];
    }
  }

  return filtered;
}

/**
 * Checks whether the requesting user can decrypt PII fields.
 */
export function canDecryptPii(role: ProfileRole, isOwnProfile: boolean): boolean {
  const roleAccess = READ_ACCESS[role];
  if (!roleAccess) return false;

  const accessLevel = isOwnProfile ? roleAccess.ownProfile : roleAccess.otherProfile;
  return accessLevel === 'all' || accessLevel === 'limited_pii';
}

/**
 * Validates whether the user is allowed to update the specified fields.
 *
 * @param fields - The fields being updated (keys of the update payload)
 * @param role - The role of the requesting user
 * @param isOwnProfile - Whether the requesting user owns this profile
 * @returns An object with `allowed` boolean and `deniedFields` listing unauthorized fields
 */
export function validateUpdatePermissions(
  fields: string[],
  role: ProfileRole,
  isOwnProfile: boolean
): { allowed: boolean; deniedFields: string[] } {
  const roleWriteAccess = WRITE_ACCESS[role];
  if (!roleWriteAccess) {
    return { allowed: false, deniedFields: fields };
  }

  const allowedFields = isOwnProfile
    ? roleWriteAccess.ownProfile
    : roleWriteAccess.otherProfile;

  const deniedFields = fields.filter(
    (field) => !allowedFields.includes(field as keyof ProfileUpdate)
  );

  return {
    allowed: deniedFields.length === 0,
    deniedFields,
  };
}

/**
 * Returns the list of writable fields for a given role and ownership context.
 */
export function getWritableFields(
  role: ProfileRole,
  isOwnProfile: boolean
): ReadonlyArray<keyof ProfileUpdate> {
  const roleWriteAccess = WRITE_ACCESS[role];
  if (!roleWriteAccess) return [];
  return isOwnProfile ? roleWriteAccess.ownProfile : roleWriteAccess.otherProfile;
}
