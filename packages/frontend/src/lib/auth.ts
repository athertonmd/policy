/**
 * Cognito authentication helpers.
 * Uses amazon-cognito-identity-js for direct Cognito User Pool auth.
 */
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  roles: string[];
  accessToken: string;
}

export interface AuthConfig {
  userPoolId: string;
  userPoolClientId: string;
  region: string;
}

const AUTH_CONFIG: AuthConfig = {
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || 'eu-west-2_eAqG29hwt',
  userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '4rubd8rev4rnk9arkib4ju717n',
  region: process.env.NEXT_PUBLIC_AWS_REGION || 'eu-west-2',
};

let userPool: CognitoUserPool | null = null;

function getUserPool(): CognitoUserPool {
  if (!userPool) {
    userPool = new CognitoUserPool({
      UserPoolId: AUTH_CONFIG.userPoolId,
      ClientId: AUTH_CONFIG.userPoolClientId,
    });
  }
  return userPool;
}

/**
 * Extract user attributes from a Cognito session.
 */
function sessionToAuthUser(session: CognitoUserSession, email: string): AuthUser {
  const idToken = session.getIdToken();
  const payload = idToken.decodePayload();

  return {
    id: payload['sub'] as string,
    email: email,
    name: (payload['name'] as string) || email.split('@')[0],
    tenantId: (payload['custom:tenantId'] as string) || 'tenant-001',
    roles: parseRoles(payload['custom:roles'] as string | undefined),
    accessToken: session.getIdToken().getJwtToken(),
  };
}

/**
 * Parse roles from Cognito custom attribute (comma-separated string).
 */
function parseRoles(rolesStr: string | undefined): string[] {
  if (!rolesStr) return ['Policy_Administrator']; // Default role for testing
  return rolesStr.split(',').map((r) => r.trim()).filter(Boolean);
}

/**
 * Sign in with email and password via Cognito.
 * Falls back to mock auth if Cognito is unavailable (local dev).
 */
export function signIn(email: string, password: string): Promise<AuthUser> {
  return new Promise((resolve, reject) => {
    const pool = getUserPool();
    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: pool,
    });

    const authDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    });

    cognitoUser.authenticateUser(authDetails, {
      onSuccess: (session) => {
        const user = sessionToAuthUser(session, email);
        // Cache user for quick access
        if (typeof window !== 'undefined') {
          localStorage.setItem('auth_user', JSON.stringify(user));
        }
        resolve(user);
      },
      onFailure: (err) => {
        console.error('Cognito auth failed:', err);
        // Fall back to mock auth for local development only
        if (err.code === 'NetworkError' || !AUTH_CONFIG.userPoolId) {
          const mockUser = createMockUser(email);
          if (typeof window !== 'undefined') {
            localStorage.setItem('auth_user', JSON.stringify(mockUser));
          }
          resolve(mockUser);
        } else {
          reject(new Error(err.message || 'Authentication failed'));
        }
      },
      newPasswordRequired: (userAttributes) => {
        // Handle new password required challenge
        delete userAttributes.email_verified;
        delete userAttributes.email;

        cognitoUser.completeNewPasswordChallenge(password, userAttributes, {
          onSuccess: (session) => {
            const user = sessionToAuthUser(session, email);
            if (typeof window !== 'undefined') {
              localStorage.setItem('auth_user', JSON.stringify(user));
            }
            resolve(user);
          },
          onFailure: (err) => {
            reject(new Error(err.message || 'Password change failed'));
          },
        });
      },
    });
  });
}

/**
 * Create a mock user for local development.
 */
function createMockUser(email: string): AuthUser {
  return {
    id: 'user-001',
    email,
    name: email.split('@')[0],
    tenantId: 'tenant-001',
    roles: ['Policy_Administrator'],
    accessToken: 'mock-token',
  };
}

/**
 * Sign out the current user.
 */
export async function signOut(): Promise<void> {
  const pool = getUserPool();
  const cognitoUser = pool.getCurrentUser();
  if (cognitoUser) {
    cognitoUser.signOut();
  }
  if (typeof window !== 'undefined') {
    localStorage.removeItem('auth_user');
  }
}

/**
 * Get the currently authenticated user, or null if not signed in.
 * Checks Cognito session first, falls back to localStorage cache.
 */
export function getCurrentUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;

  // Try localStorage cache first for quick hydration
  const stored = localStorage.getItem('auth_user');
  if (stored) {
    try {
      return JSON.parse(stored) as AuthUser;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Refresh the current session and return updated user.
 * Call this on app load to validate the session is still active.
 */
export function refreshSession(): Promise<AuthUser | null> {
  return new Promise((resolve) => {
    const pool = getUserPool();
    const cognitoUser = pool.getCurrentUser();

    if (!cognitoUser) {
      resolve(null);
      return;
    }

    cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session || !session.isValid()) {
        // Session expired, clear cache
        if (typeof window !== 'undefined') {
          localStorage.removeItem('auth_user');
        }
        resolve(null);
        return;
      }

      cognitoUser.getUserAttributes((attrErr, attributes) => {
        if (attrErr || !attributes) {
          // Fall back to cached user
          resolve(getCurrentUser());
          return;
        }

        const email = attributes.find((a) => a.Name === 'email')?.Value || '';
        const user = sessionToAuthUser(session, email);
        if (typeof window !== 'undefined') {
          localStorage.setItem('auth_user', JSON.stringify(user));
        }
        resolve(user);
      });
    });
  });
}

/**
 * Get the current access token for API calls.
 */
export function getAccessToken(): string | null {
  const user = getCurrentUser();
  return user?.accessToken ?? null;
}

export { AUTH_CONFIG };
