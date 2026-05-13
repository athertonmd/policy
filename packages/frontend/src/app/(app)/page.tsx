'use client';

import { BarChart3, CheckCircle, Shield, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

function DashboardCard({
  title,
  value,
  subtitle,
  icon,
  color,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
          <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
        </div>
        <div className={`rounded-full p-3 ${color}`} aria-hidden="true">
          {icon}
        </div>
      </div>
    </div>
  );
}

function DashboardContent() {
  const { user } = useAuth();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.name || 'User'}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Here&apos;s an overview of your travel policy platform.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          title="Pending Approvals"
          value="12"
          subtitle="3 due today"
          icon={<CheckCircle className="h-6 w-6 text-amber-600" />}
          color="bg-amber-50"
        />
        <DashboardCard
          title="Active Policies"
          value="24"
          subtitle="2 updated this week"
          icon={<Shield className="h-6 w-6 text-brand-600" />}
          color="bg-brand-50"
        />
        <DashboardCard
          title="Compliance Rate"
          value="94.2%"
          subtitle="+1.3% from last month"
          icon={<BarChart3 className="h-6 w-6 text-green-600" />}
          color="bg-green-50"
        />
        <DashboardCard
          title="Policy Violations"
          value="8"
          subtitle="This week"
          icon={<AlertTriangle className="h-6 w-6 text-red-600" />}
          color="bg-red-50"
        />
      </div>

      {/* Recent activity */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
        <div className="mt-4 card">
          <ul className="divide-y divide-gray-200" role="list">
            {[
              { action: 'Approval submitted', detail: 'London → New York flight for J. Smith', time: '2 min ago' },
              { action: 'Policy updated', detail: 'International travel cap increased to £5,000', time: '1 hour ago' },
              { action: 'Override approved', detail: 'Business class for client meeting - M. Johnson', time: '3 hours ago' },
              { action: 'Budget alert', detail: 'Engineering dept at 82% of quarterly budget', time: '5 hours ago' },
            ].map((item, idx) => (
              <li key={idx} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.action}</p>
                  <p className="text-sm text-gray-500">{item.detail}</p>
                </div>
                <span className="text-xs text-gray-400">{item.time}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
