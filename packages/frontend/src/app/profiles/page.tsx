'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, MapPin } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import type { TravellerProfile } from '@/lib/api-client';

const MOCK_PROFILES: TravellerProfile[] = [
  {
    id: 'u-001',
    email: 'james.smith@company.com',
    firstName: 'James',
    lastName: 'Smith',
    department: 'Engineering',
    costCentre: 'ENG-001',
    jobTitle: 'Senior Engineer',
    managerId: 'u-010',
    loyaltyProgrammes: [{ airline: 'BA Gold' }],
    preferences: { seatPreference: 'Aisle', mealPreference: 'Standard' },
    location: { country: 'UK', city: 'London', latitude: 51.5074, longitude: -0.1278 },
    lastUpdated: '2024-03-01T10:00:00Z',
  },
  {
    id: 'u-002',
    email: 'sarah.johnson@company.com',
    firstName: 'Sarah',
    lastName: 'Johnson',
    department: 'Sales',
    costCentre: 'SAL-001',
    jobTitle: 'Account Director',
    managerId: 'u-011',
    loyaltyProgrammes: [{ airline: 'AA Platinum' }, { hotel: 'Marriott Gold' }],
    preferences: { seatPreference: 'Window', mealPreference: 'Vegetarian' },
    location: { country: 'UK', city: 'Manchester', latitude: 53.4808, longitude: -2.2426 },
    lastUpdated: '2024-02-28T14:00:00Z',
  },
  {
    id: 'u-003',
    email: 'michael.brown@company.com',
    firstName: 'Michael',
    lastName: 'Brown',
    department: 'Executive',
    costCentre: 'EXE-001',
    jobTitle: 'VP Engineering',
    managerId: 'u-020',
    loyaltyProgrammes: [{ airline: 'BA Gold' }, { hotel: 'Hilton Diamond' }],
    preferences: { seatPreference: 'Aisle', mealPreference: 'Standard' },
    location: { country: 'UK', city: 'London', latitude: 51.5074, longitude: -0.1278 },
    lastUpdated: '2024-03-05T09:00:00Z',
  },
  {
    id: 'u-004',
    email: 'emily.davis@company.com',
    firstName: 'Emily',
    lastName: 'Davis',
    department: 'Marketing',
    costCentre: 'MKT-001',
    jobTitle: 'Marketing Manager',
    managerId: 'u-012',
    loyaltyProgrammes: [],
    preferences: { seatPreference: 'Window' },
    location: { country: 'UK', city: 'Edinburgh', latitude: 55.9533, longitude: -3.1883 },
    lastUpdated: '2024-02-20T16:00:00Z',
  },
  {
    id: 'u-005',
    email: 'david.kim@company.com',
    firstName: 'David',
    lastName: 'Kim',
    department: 'Finance',
    costCentre: 'FIN-001',
    jobTitle: 'Financial Analyst',
    managerId: 'u-013',
    loyaltyProgrammes: [{ airline: 'LH Senator' }],
    preferences: { seatPreference: 'Aisle', mealPreference: 'Halal' },
    location: { country: 'Germany', city: 'Frankfurt', latitude: 50.1109, longitude: 8.6821 },
    lastUpdated: '2024-03-02T11:00:00Z',
  },
];

function ProfilesContent() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');

  const filteredProfiles = MOCK_PROFILES.filter((profile) => {
    const fullName = `${profile.firstName} ${profile.lastName}`.toLowerCase();
    const matchesSearch =
      fullName.includes(searchQuery.toLowerCase()) ||
      profile.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      profile.department.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDepartment = departmentFilter === 'all' || profile.department.toLowerCase() === departmentFilter;
    return matchesSearch && matchesDepartment;
  });

  const columns: Column<TravellerProfile>[] = [
    {
      key: 'name',
      header: 'Traveller',
      render: (item) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-medium" aria-hidden="true">
            {item.firstName.charAt(0)}{item.lastName.charAt(0)}
          </div>
          <div>
            <p className="font-medium text-gray-900">{item.firstName} {item.lastName}</p>
            <p className="text-xs text-gray-500">{item.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'department',
      header: 'Department',
      render: (item) => (
        <div>
          <p className="text-gray-900">{item.department}</p>
          <p className="text-xs text-gray-500">{item.jobTitle}</p>
        </div>
      ),
    },
    {
      key: 'location',
      header: 'Location',
      render: (item) => (
        <span className="flex items-center gap-1 text-gray-600">
          <MapPin className="h-3 w-3 text-gray-400" aria-hidden="true" />
          {item.location ? `${item.location.city}, ${item.location.country}` : 'Not set'}
        </span>
      ),
    },
    {
      key: 'costCentre',
      header: 'Cost Centre',
      render: (item) => <span className="text-gray-600">{item.costCentre}</span>,
    },
    {
      key: 'lastUpdated',
      header: 'Last Updated',
      render: (item) => (
        <span className="text-gray-500">
          {new Date(item.lastUpdated).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Traveller Profiles</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage traveller profiles, preferences, and locations
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            type="search"
            placeholder="Search by name, email, or department..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-9"
            aria-label="Search travellers"
          />
        </div>
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="input-field w-full sm:w-48"
          aria-label="Filter by department"
        >
          <option value="all">All Departments</option>
          <option value="engineering">Engineering</option>
          <option value="sales">Sales</option>
          <option value="marketing">Marketing</option>
          <option value="executive">Executive</option>
          <option value="finance">Finance</option>
        </select>
      </div>

      {/* Table */}
      <div className="mt-6">
        {filteredProfiles.length === 0 ? (
          <EmptyState
            title="No profiles found"
            description="No traveller profiles match your search criteria."
          />
        ) : (
          <DataTable
            columns={columns}
            data={filteredProfiles}
            keyExtractor={(item) => item.id}
            onRowClick={(item) => router.push(`/profiles/${item.id}`)}
          />
        )}
      </div>

      {/* Location map placeholder */}
      <div className="mt-6 card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Traveller Locations (Duty of Care)</h2>
        <div className="h-64 rounded-lg bg-gray-100 flex items-center justify-center border border-gray-200">
          <div className="text-center">
            <MapPin className="mx-auto h-8 w-8 text-gray-400" aria-hidden="true" />
            <p className="mt-2 text-sm text-gray-500">Interactive map showing current traveller locations</p>
            <p className="text-xs text-gray-400 mt-1">
              {MOCK_PROFILES.filter((p) => p.location).length} travellers with known locations
            </p>
          </div>
        </div>
        {/* Location list */}
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {MOCK_PROFILES.filter((p) => p.location).map((profile) => (
            <div key={profile.id} className="flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2">
              <MapPin className="h-3 w-3 text-brand-500" aria-hidden="true" />
              <span className="text-xs text-gray-700">
                {profile.firstName} {profile.lastName} — {profile.location!.city}, {profile.location!.country}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ProfilesPage() {
  return (
    <ProtectedRoute requiredCapability="view_profiles">
      <ProfilesContent />
    </ProtectedRoute>
  );
}
