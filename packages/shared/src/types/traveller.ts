/**
 * Traveller Profile types
 */

export interface TravellerProfile {
  travellerId: string;
  tenantId: string;
  employeeId: string;
  email: string;
  fullName: string;
  department?: string;
  costCentre?: string;
  seniorityLevel?: string;
  region?: string;
  managerId?: string;
  preferences: TravellerPreferences;
  loyaltyProgrammes: LoyaltyProgramme[];
  status: TravellerStatus;
  createdAt: string;
  updatedAt: string;
}

export type TravellerStatus = 'active' | 'inactive' | 'suspended';

export interface TravellerPreferences {
  seatPreference?: 'window' | 'aisle' | 'no_preference';
  mealPreference?: string;
  hotelChain?: string;
  carType?: string;
  specialRequirements?: string[];
}

export interface LoyaltyProgramme {
  programmeId: string;
  programmeName: string;
  membershipNumber: string;
  tier?: string;
}

export interface ProfileUpdate {
  fullName?: string;
  department?: string;
  costCentre?: string;
  seniorityLevel?: string;
  region?: string;
  managerId?: string;
  preferences?: Partial<TravellerPreferences>;
  loyaltyProgrammes?: LoyaltyProgramme[];
}

export interface SCIMEvent {
  eventType: 'create' | 'update' | 'delete';
  userId: string;
  attributes: Record<string, unknown>;
  timestamp: string;
}

export interface SyncResult {
  success: boolean;
  profileId?: string;
  action: 'created' | 'updated' | 'deactivated';
  errors?: string[];
}

export interface BulkSyncPayload {
  profiles: ProfileUpdate[];
  source: string;
  syncId: string;
}

export interface BulkSyncResult {
  syncId: string;
  totalProcessed: number;
  created: number;
  updated: number;
  failed: number;
  errors: BulkSyncError[];
}

export interface BulkSyncError {
  index: number;
  employeeId?: string;
  error: string;
}

export interface DataExport {
  exportId: string;
  travellerId: string;
  data: Record<string, unknown>;
  generatedAt: string;
  format: 'json';
}

export interface ErasureResult {
  success: boolean;
  travellerId: string;
  fieldsErased: string[];
  anonymisedRecords: number;
  completedAt: string;
}
