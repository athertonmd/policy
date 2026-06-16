export interface WidgetConfig {
  policyApiMode: 'mock' | 'api' | 'auto';
  policyApiUrl: string;
  tenantId: string;
}

export function getConfig(): WidgetConfig {
  return {
    policyApiMode: (import.meta.env.VITE_POLICY_API_MODE || 'mock') as WidgetConfig['policyApiMode'],
    policyApiUrl: import.meta.env.VITE_POLICY_API_URL || '',
    tenantId: import.meta.env.VITE_TENANT_ID || 'tenant-001',
  };
}
