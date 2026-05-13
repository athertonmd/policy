'use client';

import { useRouter } from 'next/navigation';
import { BarChart3, Leaf, CheckCircle, Wallet, Shield } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

const reportCards = [
  {
    title: 'Spend Reporting',
    description: 'Analyse travel spend by department, supplier, trip type, and time period',
    href: '/reports/spend',
    icon: <BarChart3 className="h-6 w-6 text-brand-600" aria-hidden="true" />,
    color: 'bg-brand-50',
  },
  {
    title: 'Carbon Reporting',
    description: 'Track carbon emissions against targets with offset tracking',
    href: '/reports/carbon',
    icon: <Leaf className="h-6 w-6 text-green-600" aria-hidden="true" />,
    color: 'bg-green-50',
  },
  {
    title: 'Approval Analytics',
    description: 'Monitor approval times, SLA compliance, and identify bottlenecks',
    href: '/reports/approvals',
    icon: <CheckCircle className="h-6 w-6 text-amber-600" aria-hidden="true" />,
    color: 'bg-amber-50',
  },
  {
    title: 'Budget Tracking',
    description: 'Track budget utilisation across departments and cost centres',
    href: '/reports/budgets',
    icon: <Wallet className="h-6 w-6 text-purple-600" aria-hidden="true" />,
    color: 'bg-purple-50',
  },
  {
    title: 'Compliance Monitoring',
    description: 'Monitor policy compliance rates with trend analysis and leakage detection',
    href: '/reports/compliance',
    icon: <Shield className="h-6 w-6 text-red-600" aria-hidden="true" />,
    color: 'bg-red-50',
  },
];

function ReportsContent() {
  const router = useRouter();

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">
          Comprehensive reporting across spend, carbon, approvals, budgets, and compliance
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reportCards.map((card) => (
          <button
            key={card.href}
            type="button"
            onClick={() => router.push(card.href)}
            className="card text-left hover:shadow-md transition-shadow"
          >
            <div className={`inline-flex rounded-lg p-3 ${card.color}`}>
              {card.icon}
            </div>
            <h2 className="mt-4 text-lg font-semibold text-gray-900">{card.title}</h2>
            <p className="mt-1 text-sm text-gray-500">{card.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <ProtectedRoute requiredCapability="view_reports">
      <ReportsContent />
    </ProtectedRoute>
  );
}
