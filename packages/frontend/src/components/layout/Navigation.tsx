'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Shield,
  CheckCircle,
  BarChart3,
  Users,
  Settings,
  Headphones,
  FileWarning,
} from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { getVisibleNavItems } from '@/lib/permissions';

const iconMap: Record<string, React.ReactNode> = {
  '/': <LayoutDashboard className="h-5 w-5" aria-hidden="true" />,
  '/policies': <Shield className="h-5 w-5" aria-hidden="true" />,
  '/approvals': <CheckCircle className="h-5 w-5" aria-hidden="true" />,
  '/tmc': <Headphones className="h-5 w-5" aria-hidden="true" />,
  '/reports': <BarChart3 className="h-5 w-5" aria-hidden="true" />,
  '/profiles': <Users className="h-5 w-5" aria-hidden="true" />,
  '/overrides': <FileWarning className="h-5 w-5" aria-hidden="true" />,
  '/settings': <Settings className="h-5 w-5" aria-hidden="true" />,
};

export function Navigation() {
  const pathname = usePathname();
  const { user } = useAuth();
  const navItems = getVisibleNavItems(user);

  return (
    <nav aria-label="Main navigation">
      <ul className="space-y-1" role="list">
        {navItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {iconMap[item.href]}
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
