'use client';

import { useState } from 'react';
import { Menu, X, Bell, LogOut } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { Navigation } from './Navigation';

export function Header() {
  const { user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6">
        {/* Mobile menu button */}
        <button
          type="button"
          className="lg:hidden -m-2.5 p-2.5 text-gray-700"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? (
            <X className="h-6 w-6" aria-hidden="true" />
          ) : (
            <Menu className="h-6 w-6" aria-hidden="true" />
          )}
        </button>

        {/* Page title area */}
        <div className="flex-1 lg:ml-0" />

        {/* Right side actions */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="relative rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="View notifications"
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
          </button>

          {user && (
            <button
              type="button"
              onClick={signOut}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile navigation */}
      {mobileMenuOpen && (
        <div className="border-t border-gray-200 bg-white p-4 lg:hidden">
          <Navigation />
        </div>
      )}
    </header>
  );
}
