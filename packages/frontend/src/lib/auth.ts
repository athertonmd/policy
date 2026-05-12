/**
 * Cognito authentication helpers.
 * Wraps AWS Amplify Auth for the Travel Policy Platform.
 */

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
  identityPoolId?: string;
  region: string;
  domain: string;
}

const AUTH_CONFIG: AuthConfig = {
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '',
  userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '',
  identityPoolId: process.env.NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID,
  region: process.env.NEXT_PUBLIC_AWS_REGION || 'eu-west-1',
  domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN || '',
};

/**
 * Sign in with email and password.
 */
export async function signIn(email: string, password: string): Promise<AuthUser> {
  // In production, this calls Amplify Auth.signIn
  // For now, returns a mock user for development
  const mockUser: AuthUser = {
    id: 'user-001',
    email,
    name: email.split('@')[0],
    tenantId: 'tenant-001',
    roles: ['Policy_Administrator'],
    accessToken: 'mock-token',
  };
  if (typeof window !== 'undefined') {
    localStorage.setItem('auth_user', JSON.stringify(mockUser));
  }
  return mockUser;
}

/**
 * Sign out the current user.
 */
export async function signOut(): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('auth_user');
  }
}

/**
 * Get the currently authenticated user, or null if not signed in.
 */
export function getCurrentUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem('auth_user');
  if (!stored) return null;
  try {
    return JSON.parse(stored) as AuthUser;
  } catch {
    return null;
  }
}

/**
 * Get the current access token for API calls.
 */
export function getAccessToken(): string | null {
  const user = getCurrentUser();
  return user?.accessToken ?? null;
}

export { AUTH_CONFIG };
