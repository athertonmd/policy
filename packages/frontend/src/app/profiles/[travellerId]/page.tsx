'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Save, Lock, MapPin, Plane, Hotel } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/components/auth/AuthProvider';
import { hasCapability } from '@/lib/permissions';
import type { TravellerProfile } from '@/lib/api-client';

// Mock profile data
const MOCK_PROFILE: TravellerProfile = {
  id: 'u-001',
  email: 'james.smith@company.com',
  firstName: 'James',
  lastName: 'Smith',
  department: 'Engineering',
  costCentre: 'ENG-001',
  jobTitle: 'Senior Engineer',
  managerId: 'u-010',
  loyaltyProgrammes: [{ airline: 'BA Gold' }, { hotel: 'Marriott Bonvoy Gold' }],
  preferences: { seatPreference: 'Aisle', mealPreference: 'Standard' },
  location: { country: 'UK', city: 'London', latitude: 51.5074, longitude: -0.1278 },
  lastUpdated: '2024-03-01T10:00:00Z',
};

interface FieldConfig {
  label: string;
  value: string;
  editable: boolean;
  restricted?: boolean;
}

function ProfileDetailContent() {
  const router = useRouter();
  const params = useParams();
  const { user } = useAuth();
  const canEdit = hasCapability(user, 'edit_profiles');

  const [profile] = useState<TravellerProfile>(MOCK_PROFILE);
  const [seatPreference, setSeatPreference] = useState(profile.preferences.seatPreference || '');
  const [mealPreference, setMealPreference] = useState(profile.preferences.mealPreference || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    // In production, calls apiClient.updateProfile()
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSaving(false);
  };

  // Field-level access control: some fields are restricted based on role
  const fields: FieldConfig[] = [
    { label: 'Email', value: profile.email, editable: false },
    { label: 'Department', value: profile.department, editable: false },
    { label: 'Job Title', value: profile.jobTitle, editable: false },
    { label: 'Cost Centre', value: profile.costCentre, editable: false },
    { label: 'Manager', value: profile.managerId || 'Not assigned', editable: false },
    { label: 'Location', value: profile.location ? `${profile.location.city}, ${profile.location.country}` : 'Not set', editable: false },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/profiles')}
          className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
          type="button"
          aria-label="Back to profiles"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {profile.firstName} {profile.lastName}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {profile.jobTitle} · {profile.department}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn-primary"
            type="button"
          >
            <Save className="mr-1 h-4 w-4" aria-hidden="true" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Profile info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic info (read-only, HR-managed) */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Profile Information</h2>
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Lock className="h-3 w-3" aria-hidden="true" />
                HR-managed fields
              </span>
            </div>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {fields.map((field) => (
                <div key={field.label}>
                  <dt className="text-xs font-medium text-gray-500">{field.label}</dt>
                  <dd className="mt-1 text-sm text-gray-900 flex items-center gap-1">
                    {field.value}
                    {field.restricted && (
                      <Lock className="h-3 w-3 text-gray-400" aria-label="Restricted field" />
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Editable preferences */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Travel Preferences</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="seat-pref" className="block text-sm font-medium text-gray-700">
                  Seat Preference
                </label>
                <select
                  id="seat-pref"
                  value={seatPreference}
                  onChange={(e) => setSeatPreference(e.target.value)}
                  disabled={!canEdit}
                  className="input-field mt-1"
                >
                  <option value="">No preference</option>
                  <option value="Aisle">Aisle</option>
                  <option value="Window">Window</option>
                  <option value="Middle">Middle</option>
                </select>
              </div>
              <div>
                <label htmlFor="meal-pref" className="block text-sm font-medium text-gray-700">
                  Meal Preference
                </label>
                <select
                  id="meal-pref"
                  value={mealPreference}
                  onChange={(e) => setMealPreference(e.target.value)}
                  disabled={!canEdit}
                  className="input-field mt-1"
                >
                  <option value="">No preference</option>
                  <option value="Standard">Standard</option>
                  <option value="Vegetarian">Vegetarian</option>
                  <option value="Vegan">Vegan</option>
                  <option value="Halal">Halal</option>
                  <option value="Kosher">Kosher</option>
                  <option value="Gluten-free">Gluten-free</option>
                </select>
              </div>
            </div>
          </div>

          {/* Loyalty programmes */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Loyalty Programmes</h2>
            {profile.loyaltyProgrammes.length === 0 ? (
              <p className="text-sm text-gray-500">No loyalty programmes configured.</p>
            ) : (
              <div className="space-y-3">
                {profile.loyaltyProgrammes.map((programme, idx) => (
                  <div key={idx} className="flex items-center gap-3 rounded-md border border-gray-200 p-3">
                    {programme.airline && (
                      <>
                        <Plane className="h-5 w-5 text-brand-500" aria-hidden="true" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{programme.airline}</p>
                          <p className="text-xs text-gray-500">Airline loyalty programme</p>
                        </div>
                      </>
                    )}
                    {programme.hotel && (
                      <>
                        <Hotel className="h-5 w-5 text-purple-500" aria-hidden="true" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{programme.hotel}</p>
                          <p className="text-xs text-gray-500">Hotel loyalty programme</p>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Avatar and quick info */}
          <div className="card flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xl font-semibold" aria-hidden="true">
              {profile.firstName.charAt(0)}{profile.lastName.charAt(0)}
            </div>
            <h3 className="mt-3 text-lg font-semibold text-gray-900">
              {profile.firstName} {profile.lastName}
            </h3>
            <p className="text-sm text-gray-500">{profile.email}</p>
            <p className="mt-1 text-xs text-gray-400">
              Last updated: {new Date(profile.lastUpdated).toLocaleDateString()}
            </p>
          </div>

          {/* Location */}
          {profile.location && (
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Current Location</h3>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-brand-500" aria-hidden="true" />
                <span className="text-sm text-gray-700">
                  {profile.location.city}, {profile.location.country}
                </span>
              </div>
              <div className="mt-3 h-32 rounded-lg bg-gray-100 flex items-center justify-center border border-gray-200">
                <span className="text-xs text-gray-400">Map view</span>
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => router.push('/overrides')}
                className="btn-secondary w-full text-sm"
              >
                Request Override
              </button>
              <button
                type="button"
                className="btn-secondary w-full text-sm"
              >
                View Travel History
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProfileDetailPage() {
  return (
    <ProtectedRoute requiredCapability="view_profiles">
      <ProfileDetailContent />
    </ProtectedRoute>
  );
}
