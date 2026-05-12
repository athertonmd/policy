/**
 * Traveller Profile Service
 * Managing traveller profiles, preferences, loyalty programmes, and organisational attributes.
 */

export { handler as getProfileHandler } from './handlers/get-profile.js';
export { handler as updateProfileHandler } from './handlers/update-profile.js';
export { handler as syncFromSCIMHandler } from './handlers/sync-from-scim.js';
export { handler as bulkSyncHandler } from './handlers/bulk-sync.js';
export { handler as exportPersonalDataHandler } from './handlers/export-personal-data.js';
export { handler as erasePersonalDataHandler } from './handlers/erase-personal-data.js';
export {
  filterProfileForRole,
  validateUpdatePermissions,
  canDecryptPii,
  getWritableFields,
  type ProfileRole,
  type ProfileWithPii,
} from './lib/field-access-control.js';
export { encryptField, decryptField, encryptJsonField, decryptJsonField } from './lib/pii-encryption.js';
export { createDatabaseClient, withDatabase } from './lib/database.js';
