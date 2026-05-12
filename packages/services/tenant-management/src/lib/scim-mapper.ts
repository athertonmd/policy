/**
 * SCIM 2.0 Attribute Mapper
 *
 * Maps SCIM 2.0 user resource attributes (RFC 7643/7644) to internal
 * traveller profile fields. Handles the enterprise user extension schema
 * for organisational attributes like department, cost centre, and manager.
 *
 * Requirements: 2.5, 26.1, 26.2
 */

// ─── SCIM Types ──────────────────────────────────────────────────────────────

export interface ScimName {
  formatted?: string;
  familyName?: string;
  givenName?: string;
  middleName?: string;
  honorificPrefix?: string;
  honorificSuffix?: string;
}

export interface ScimEmail {
  value: string;
  type?: string;
  primary?: boolean;
}

export interface ScimUserResource {
  schemas: string[];
  id?: string;
  externalId?: string;
  userName: string;
  name?: ScimName;
  displayName?: string;
  emails?: ScimEmail[];
  title?: string;
  active?: boolean;
  'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'?: ScimEnterpriseExtension;
}

export interface ScimEnterpriseExtension {
  employeeNumber?: string;
  department?: string;
  costCenter?: string;
  division?: string;
  manager?: {
    value?: string;
    $ref?: string;
    displayName?: string;
  };
}

export interface ScimPatchOperation {
  op: 'add' | 'replace' | 'remove';
  path?: string;
  value?: unknown;
}

export interface ScimPatchRequest {
  schemas: string[];
  Operations: ScimPatchOperation[];
}

// ─── Internal Profile Types ──────────────────────────────────────────────────

export interface MappedProfileFields {
  email?: string;
  fullName?: string;
  department?: string;
  costCentre?: string;
  seniorityLevel?: string;
  managerId?: string;
  employeeId?: string;
  status?: 'active' | 'inactive';
}

// ─── SCIM Response Types ─────────────────────────────────────────────────────

export interface ScimUserResponse {
  schemas: string[];
  id: string;
  externalId?: string;
  userName: string;
  name?: ScimName;
  displayName?: string;
  emails?: ScimEmail[];
  title?: string;
  active: boolean;
  'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'?: ScimEnterpriseExtension;
  meta: {
    resourceType: string;
    created: string;
    lastModified: string;
    location: string;
  };
}

export interface ScimErrorResponse {
  schemas: string[];
  status: string;
  scimType?: string;
  detail: string;
}

export interface ScimListResponse {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: ScimUserResponse[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const SCIM_CORE_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
export const SCIM_ENTERPRISE_SCHEMA = 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User';
export const SCIM_PATCH_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';
export const SCIM_LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
export const SCIM_ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error';

// ─── Mapper Functions ────────────────────────────────────────────────────────

/**
 * Maps a SCIM user resource to internal traveller profile fields.
 * Extracts relevant attributes from both core and enterprise extension schemas.
 */
export function mapScimToProfile(scimUser: ScimUserResource): MappedProfileFields {
  const profile: MappedProfileFields = {};

  // Map email: prefer primary email from emails array, fall back to userName
  const primaryEmail = getPrimaryEmail(scimUser.emails);
  profile.email = primaryEmail ?? scimUser.userName;

  // Map full name from name.givenName + name.familyName
  if (scimUser.name) {
    const parts: string[] = [];
    if (scimUser.name.givenName) parts.push(scimUser.name.givenName);
    if (scimUser.name.familyName) parts.push(scimUser.name.familyName);
    if (parts.length > 0) {
      profile.fullName = parts.join(' ');
    } else if (scimUser.name.formatted) {
      profile.fullName = scimUser.name.formatted;
    }
  }

  // Fall back to displayName if name fields are not available
  if (!profile.fullName && scimUser.displayName) {
    profile.fullName = scimUser.displayName;
  }

  // Map title to seniority level
  if (scimUser.title) {
    profile.seniorityLevel = scimUser.title;
  }

  // Map active status
  if (scimUser.active !== undefined) {
    profile.status = scimUser.active ? 'active' : 'inactive';
  }

  // Map externalId to employee ID
  if (scimUser.externalId) {
    profile.employeeId = scimUser.externalId;
  }

  // Map enterprise extension attributes
  const enterprise = scimUser['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'];
  if (enterprise) {
    if (enterprise.department) {
      profile.department = enterprise.department;
    }
    if (enterprise.costCenter) {
      profile.costCentre = enterprise.costCenter;
    }
    if (enterprise.manager?.value) {
      profile.managerId = enterprise.manager.value;
    }
    // employeeNumber can also serve as employee ID if externalId is not set
    if (!profile.employeeId && enterprise.employeeNumber) {
      profile.employeeId = enterprise.employeeNumber;
    }
  }

  return profile;
}

/**
 * Maps a SCIM PATCH operation to partial profile field updates.
 * Supports add, replace, and remove operations on individual attributes.
 */
export function mapScimPatchToProfile(patchRequest: ScimPatchRequest): MappedProfileFields {
  const profile: MappedProfileFields = {};

  for (const operation of patchRequest.Operations) {
    if (operation.op === 'remove') {
      // For remove operations, set the field to undefined (will be handled as null in DB)
      applyRemoveOperation(profile, operation.path);
      continue;
    }

    // For add and replace operations
    if (operation.path) {
      applyPathOperation(profile, operation.path, operation.value);
    } else if (typeof operation.value === 'object' && operation.value !== null) {
      // No path means the value is a partial user resource
      const partialUser = operation.value as Partial<ScimUserResource>;
      const mapped = mapScimToProfile(partialUser as ScimUserResource);
      Object.assign(profile, mapped);
    }
  }

  return profile;
}

/**
 * Converts internal profile fields to a SCIM user response.
 */
export function mapProfileToScimResponse(
  profile: {
    travellerId: string;
    email: string;
    fullName: string;
    department?: string;
    costCentre?: string;
    seniorityLevel?: string;
    managerId?: string;
    employeeId?: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  },
  tenantId: string,
  baseUrl: string
): ScimUserResponse {
  const nameParts = profile.fullName.split(' ');
  const givenName = nameParts[0] ?? '';
  const familyName = nameParts.slice(1).join(' ') || undefined;

  const response: ScimUserResponse = {
    schemas: [SCIM_CORE_SCHEMA, SCIM_ENTERPRISE_SCHEMA],
    id: profile.travellerId,
    externalId: profile.employeeId,
    userName: profile.email,
    name: {
      givenName,
      familyName,
      formatted: profile.fullName,
    },
    displayName: profile.fullName,
    emails: [
      {
        value: profile.email,
        type: 'work',
        primary: true,
      },
    ],
    title: profile.seniorityLevel,
    active: profile.status === 'active',
    meta: {
      resourceType: 'User',
      created: profile.createdAt,
      lastModified: profile.updatedAt,
      location: `${baseUrl}/v1/tenants/${tenantId}/scim/Users/${profile.travellerId}`,
    },
  };

  // Add enterprise extension if any enterprise fields are present
  if (profile.department || profile.costCentre || profile.managerId || profile.employeeId) {
    response['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'] = {};
    const ext = response['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User']!;

    if (profile.department) ext.department = profile.department;
    if (profile.costCentre) ext.costCenter = profile.costCentre;
    if (profile.managerId) {
      ext.manager = { value: profile.managerId };
    }
    if (profile.employeeId) ext.employeeNumber = profile.employeeId;
  }

  return response;
}

/**
 * Creates a SCIM error response object.
 */
export function createScimError(status: number, detail: string, scimType?: string): ScimErrorResponse {
  return {
    schemas: [SCIM_ERROR_SCHEMA],
    status: String(status),
    ...(scimType && { scimType }),
    detail,
  };
}

/**
 * Creates a SCIM list response.
 */
export function createScimListResponse(
  resources: ScimUserResponse[],
  totalResults: number,
  startIndex: number,
  itemsPerPage: number
): ScimListResponse {
  return {
    schemas: [SCIM_LIST_SCHEMA],
    totalResults,
    startIndex,
    itemsPerPage,
    Resources: resources,
  };
}

/**
 * Validates that a SCIM user resource has the required fields.
 * Returns an error message if validation fails, or null if valid.
 */
export function validateScimUserResource(user: unknown): string | null {
  if (!user || typeof user !== 'object') {
    return 'Request body must be a JSON object';
  }

  const resource = user as Record<string, unknown>;

  // Check schemas array
  if (!Array.isArray(resource.schemas) || resource.schemas.length === 0) {
    return 'schemas array is required and must contain at least one schema URI';
  }

  if (!resource.schemas.includes(SCIM_CORE_SCHEMA)) {
    return `schemas must include ${SCIM_CORE_SCHEMA}`;
  }

  // Check userName
  if (!resource.userName || typeof resource.userName !== 'string') {
    return 'userName is required and must be a string';
  }

  return null;
}

/**
 * Validates a SCIM PATCH request.
 */
export function validateScimPatchRequest(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return 'Request body must be a JSON object';
  }

  const request = body as Record<string, unknown>;

  if (!Array.isArray(request.schemas) || !request.schemas.includes(SCIM_PATCH_SCHEMA)) {
    return `schemas must include ${SCIM_PATCH_SCHEMA}`;
  }

  if (!Array.isArray(request.Operations) || request.Operations.length === 0) {
    return 'Operations array is required and must contain at least one operation';
  }

  for (const op of request.Operations as ScimPatchOperation[]) {
    if (!['add', 'replace', 'remove'].includes(op.op)) {
      return `Invalid operation: ${op.op}. Must be one of: add, replace, remove`;
    }
    if (op.op !== 'remove' && op.value === undefined && !op.path) {
      return `Operation "${op.op}" requires either a value or a path`;
    }
  }

  return null;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function getPrimaryEmail(emails?: ScimEmail[]): string | undefined {
  if (!emails || emails.length === 0) return undefined;

  // Find explicitly primary email
  const primary = emails.find((e) => e.primary === true);
  if (primary) return primary.value;

  // Find work email
  const work = emails.find((e) => e.type === 'work');
  if (work) return work.value;

  // Fall back to first email
  return emails[0]?.value;
}

function applyRemoveOperation(profile: MappedProfileFields, path?: string): void {
  if (!path) return;

  const normalizedPath = path.toLowerCase();
  if (normalizedPath === 'title') {
    profile.seniorityLevel = undefined;
  } else if (normalizedPath.includes('department')) {
    profile.department = undefined;
  } else if (normalizedPath.includes('costcenter')) {
    profile.costCentre = undefined;
  } else if (normalizedPath.includes('manager')) {
    profile.managerId = undefined;
  }
}

function applyPathOperation(profile: MappedProfileFields, path: string, value: unknown): void {
  const normalizedPath = path.toLowerCase();

  if (normalizedPath === 'username' || normalizedPath === 'emails') {
    if (typeof value === 'string') {
      profile.email = value;
    } else if (Array.isArray(value)) {
      const primary = getPrimaryEmail(value as ScimEmail[]);
      if (primary) profile.email = primary;
    }
  } else if (normalizedPath === 'name.givenname' || normalizedPath === 'name.familyname') {
    // Partial name updates need to be handled at the handler level
    // since we need the existing name to construct the full name
    if (normalizedPath === 'name.givenname' && typeof value === 'string') {
      profile.fullName = value; // Will be combined with existing family name in handler
    }
  } else if (normalizedPath === 'displayname') {
    if (typeof value === 'string') profile.fullName = value;
  } else if (normalizedPath === 'title') {
    if (typeof value === 'string') profile.seniorityLevel = value;
  } else if (normalizedPath === 'active') {
    if (typeof value === 'boolean') profile.status = value ? 'active' : 'inactive';
  } else if (normalizedPath === 'externalid') {
    if (typeof value === 'string') profile.employeeId = value;
  } else if (
    normalizedPath.includes('enterprise') && normalizedPath.includes('department')
  ) {
    if (typeof value === 'string') profile.department = value;
  } else if (
    normalizedPath.includes('enterprise') && normalizedPath.includes('costcenter')
  ) {
    if (typeof value === 'string') profile.costCentre = value;
  } else if (
    normalizedPath.includes('enterprise') && normalizedPath.includes('manager')
  ) {
    if (typeof value === 'object' && value !== null && 'value' in value) {
      profile.managerId = (value as { value: string }).value;
    } else if (typeof value === 'string') {
      profile.managerId = value;
    }
  }
}
