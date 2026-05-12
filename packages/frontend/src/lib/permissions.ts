/**
 * Role-based UI helpers for Cedar permission-based rendering.
 * Maps Cedar roles to UI capabilities.
 */

import type { AuthUser } from './auth';

export type PredefinedRole =
  | 'Traveller'
  | 'Approver'
  | 'Travel_Arranger'
  | 'TMC_Agent'
  | 'Policy_Administrator'
  | 'Tenant_Administrator'
  | 'Finance_Viewer';

export type UICapability =
  | 'view_policies'
  | 'edit_policies'
  | 'simulate_policies'
  | 'view_approvals'
  | 'action_approvals'
  | 'view_tmc_dashboard'
  | 'view_reports'
  | 'export_reports'
  | 'view_profiles'
  | 'edit_profiles'
  | 'manage_overrides'
  | 'view_settings'
  | 'manage_tenants'
  | 'view_budgets'
  | 'manage_budgets'
  | 'view_compliance';

/** Maps roles to their UI capabilities */
const ROLE_CAPABILITIES: Record<PredefinedRole, UICapability[]> = {
  Traveller: [
    'view_approvals',
    'view_profiles',
    'edit_profiles',
    'manage_overrides',
  ],
  Approver: [
    'view_approvals',
    'action_approvals',
    'view_profiles',
    'view_reports',
  ],
  Travel_Arranger: [
    'view_policies',
    'view_approvals',
    'view_profiles',
    'edit_profiles',
    'manage_overrides',
  ],
  TMC_Agent: [
    'view_policies',
    'view_approvals',
    'action_approvals',
    'view_tmc_dashboard',
    'view_profiles',
    'view_reports',
  ],
  Policy_Administrator: [
    'view_policies',
    'edit_policies',
    'simulate_policies',
    'view_approvals',
    'action_approvals',
    'view_reports',
    'export_reports',
    'view_profiles',
    'view_settings',
    'view_budgets',
    'manage_budgets',
    'view_compliance',
  ],
  Tenant_Administrator: [
    'view_policies',
    'edit_policies',
    'simulate_policies',
    'view_approvals',
    'action_approvals',
    'view_tmc_dashboard',
    'view_reports',
    'export_reports',
    'view_profiles',
    'edit_profiles',
    'manage_overrides',
    'view_settings',
    'manage_tenants',
    'view_budgets',
    'manage_budgets',
    'view_compliance',
  ],
  Finance_Viewer: [
    'view_reports',
    'export_reports',
    'view_budgets',
    'view_compliance',
  ],
};

/**
 * Check if a user has a specific UI capability.
 */
export function hasCapability(user: AuthUser | null, capability: UICapability): boolean {
  if (!user) return false;
  return user.roles.some((role) => {
    const capabilities = ROLE_CAPABILITIES[role as PredefinedRole];
    return capabilities?.includes(capability) ?? false;
  });
}

/**
 * Check if a user has any of the specified capabilities.
 */
export function hasAnyCapability(user: AuthUser | null, capabilities: UICapability[]): boolean {
  return capabilities.some((cap) => hasCapability(user, cap));
}

/**
 * Get all capabilities for a user based on their roles.
 */
export function getUserCapabilities(user: AuthUser | null): UICapability[] {
  if (!user) return [];
  const capabilities = new Set<UICapability>();
  for (const role of user.roles) {
    const roleCaps = ROLE_CAPABILITIES[role as PredefinedRole];
    if (roleCaps) {
      roleCaps.forEach((cap) => capabilities.add(cap));
    }
  }
  return Array.from(capabilities);
}

/**
 * Get navigation items visible to the user based on their roles.
 */
export function getVisibleNavItems(user: AuthUser | null) {
  return [
    { href: '/', label: 'Dashboard', capability: null },
    { href: '/policies', label: 'Policies', capability: 'view_policies' as UICapability },
    { href: '/approvals', label: 'Approvals', capability: 'view_approvals' as UICapability },
    { href: '/tmc', label: 'TMC Operations', capability: 'view_tmc_dashboard' as UICapability },
    { href: '/reports', label: 'Reports', capability: 'view_reports' as UICapability },
    { href: '/profiles', label: 'Profiles', capability: 'view_profiles' as UICapability },
    { href: '/overrides', label: 'Overrides', capability: 'manage_overrides' as UICapability },
    { href: '/settings', label: 'Settings', capability: 'view_settings' as UICapability },
  ].filter((item) => item.capability === null || hasCapability(user, item.capability));
}
