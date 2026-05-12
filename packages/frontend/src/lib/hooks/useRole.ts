'use client';

import { useMemo } from 'react';

import { useAuth } from '@/components/auth/AuthProvider';
import { hasCapability, hasAnyCapability, type UICapability, type PredefinedRole } from '@/lib/permissions';

/**
 * Hook for role-based UI rendering.
 * Provides helpers to check capabilities and conditionally render UI elements.
 */
export function useRole() {
  const { user, capabilities } = useAuth();

  const helpers = useMemo(() => ({
    /**
     * Check if the current user has a specific capability.
     */
    can: (capability: UICapability): boolean => {
      return hasCapability(user, capability);
    },

    /**
     * Check if the current user has any of the specified capabilities.
     */
    canAny: (caps: UICapability[]): boolean => {
      return hasAnyCapability(user, caps);
    },

    /**
     * Check if the current user has a specific role.
     */
    hasRole: (role: PredefinedRole): boolean => {
      return user?.roles.includes(role) ?? false;
    },

    /**
     * Get all capabilities for the current user.
     */
    capabilities,

    /**
     * Check if the user is an administrator (Tenant or Policy admin).
     */
    isAdmin: user?.roles.some((r) =>
      ['Tenant_Administrator', 'Policy_Administrator'].includes(r)
    ) ?? false,

    /**
     * Check if the user is a TMC agent.
     */
    isTmcAgent: user?.roles.includes('TMC_Agent') ?? false,

    /**
     * The current user's roles.
     */
    roles: user?.roles ?? [],

    /**
     * The current user's tenant ID.
     */
    tenantId: user?.tenantId ?? null,
  }), [user, capabilities]);

  return helpers;
}
