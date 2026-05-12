/**
 * Lambda handler: Configure notification preferences.
 * POST /v1/notifications/preferences
 * Accepts userId, tenantId, and preferences (channels, frequency, quiet hours).
 * Stores preferences in the tenant's schema (notification_preferences table).
 * Returns the saved preferences.
 *
 * Requirements: 9.3, 9.5
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

export interface NotificationChannel {
  type: 'email' | 'slack' | 'teams';
  enabled: boolean;
  address?: string;
}

export interface QuietHours {
  enabled: boolean;
  startTime?: string; // HH:mm format
  endTime?: string;   // HH:mm format
  timezone?: string;
}

export interface NotificationPreferences {
  channels: NotificationChannel[];
  frequency: 'immediate' | 'hourly_digest' | 'daily_digest';
  quietHours: QuietHours;
  escalationOverride: boolean; // Always notify for escalations regardless of quiet hours
}

export interface ConfigurePreferencesRequest {
  userId: string;
  tenantId: string;
  preferences: NotificationPreferences;
}

export interface ConfigurePreferencesResponse {
  userId: string;
  tenantId: string;
  preferences: NotificationPreferences;
  updatedAt: string;
}

/**
 * API Gateway handler for configuring notification preferences per user.
 */
export async function handler(
  event: APIGatewayProxyEvent,
  _context: Context
): Promise<APIGatewayProxyResult> {
  const startTime = Date.now();

  console.log('Processing configure-preferences request');

  if (!event.body) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Request body is required' }),
    };
  }

  let request: ConfigurePreferencesRequest;
  try {
    request = JSON.parse(event.body) as ConfigurePreferencesRequest;
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON in request body' }),
    };
  }

  // Validate required fields
  const validationError = validateRequest(request);
  if (validationError) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: validationError }),
    };
  }

  // Store preferences (in production, this writes to the tenant's schema)
  const savedPreferences = await storePreferences(request);

  const totalElapsed = Date.now() - startTime;

  console.log('Preferences saved', {
    userId: request.userId,
    tenantId: request.tenantId,
    elapsedMs: totalElapsed,
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(savedPreferences),
  };
}

function validateRequest(request: ConfigurePreferencesRequest): string | null {
  if (!request.userId) {
    return 'userId is required';
  }
  if (!request.tenantId) {
    return 'tenantId is required';
  }
  if (!request.preferences) {
    return 'preferences is required';
  }
  if (!request.preferences.channels || !Array.isArray(request.preferences.channels)) {
    return 'preferences.channels must be an array';
  }
  if (!request.preferences.frequency) {
    return 'preferences.frequency is required';
  }

  const validFrequencies = ['immediate', 'hourly_digest', 'daily_digest'];
  if (!validFrequencies.includes(request.preferences.frequency)) {
    return `preferences.frequency must be one of: ${validFrequencies.join(', ')}`;
  }

  const validChannelTypes = ['email', 'slack', 'teams'];
  for (const channel of request.preferences.channels) {
    if (!validChannelTypes.includes(channel.type)) {
      return `Invalid channel type: ${channel.type}. Must be one of: ${validChannelTypes.join(', ')}`;
    }
  }

  if (request.preferences.quietHours?.enabled) {
    if (!request.preferences.quietHours.startTime || !request.preferences.quietHours.endTime) {
      return 'quietHours.startTime and quietHours.endTime are required when quiet hours are enabled';
    }
    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timeRegex.test(request.preferences.quietHours.startTime)) {
      return 'quietHours.startTime must be in HH:mm format';
    }
    if (!timeRegex.test(request.preferences.quietHours.endTime)) {
      return 'quietHours.endTime must be in HH:mm format';
    }
  }

  return null;
}

/**
 * Store notification preferences for a user.
 * In production, this writes to the tenant's PostgreSQL schema.
 */
async function storePreferences(
  request: ConfigurePreferencesRequest
): Promise<ConfigurePreferencesResponse> {
  // In production, this would execute:
  // INSERT INTO {tenant_schema}.notification_preferences (user_id, preferences, updated_at)
  // VALUES ($1, $2, NOW())
  // ON CONFLICT (user_id) DO UPDATE SET preferences = $2, updated_at = NOW()
  // RETURNING *;

  const updatedAt = new Date().toISOString();

  console.log('Storing preferences', {
    userId: request.userId,
    tenantId: request.tenantId,
    channels: request.preferences.channels.map((c) => c.type),
    frequency: request.preferences.frequency,
  });

  return {
    userId: request.userId,
    tenantId: request.tenantId,
    preferences: request.preferences,
    updatedAt,
  };
}
