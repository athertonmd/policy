'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { type AuthUser, getCurrentUser, signIn as authSignIn, signOut as authSignOut } from '@/lib/auth';
import { getUserCapabilities, type UICapability } from '@/lib/permissions';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  capabilities: UICapability[];
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  capabilities: [],
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [capabilities, setCapabilities] = useState<UICapability[]>([]);

  useEffect(() => {
    const currentUser = getCurrentUser();
    setUser(currentUser);
    setCapabilities(getUserCapabilities(currentUser));
    setIsLoading(false);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const authedUser = await authSignIn(email, password);
    setUser(authedUser);
    setCapabilities(getUserCapabilities(authedUser));
  }, []);

  const signOut = useCallback(async () => {
    await authSignOut();
    setUser(null);
    setCapabilities([]);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, capabilities, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
