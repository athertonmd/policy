'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { signIn } = useAuth();
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await signIn(email, password);
      router.push('/');
    } catch (err) {
      setError('Invalid username or password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen">
      {/* Full-screen background image — city skyline */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=2560&q=80')`,
        }}
        aria-hidden="true"
      />

      {/* Semi-transparent login panel on the left */}
      <div className="relative z-10 flex w-full max-w-md flex-col justify-center px-10 py-12 backdrop-blur-sm bg-slate-800/70">
        {/* Logo */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center">
            <svg
              viewBox="0 0 64 64"
              className="h-14 w-14 text-white"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M32 4L4 20v24l28 16 28-16V20L32 4zm0 4.5L54.5 21 32 33.5 9.5 21 32 8.5zM7 22.8l23 13.2v22L7 44.8v-22zm27 35.2V36l23-13.2v22L34 58z" />
            </svg>
          </div>
          <h1 className="text-2xl font-light tracking-wide text-white">
            Travel Policy Platform
          </h1>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          {error && (
            <div
              className="rounded-md bg-red-500/20 border border-red-400/30 p-3 text-sm text-red-200"
              role="alert"
              aria-live="polite"
            >
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300">
              Username *
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 block w-full border-0 border-b border-gray-400 bg-transparent px-0 py-2 text-white placeholder-gray-500 focus:border-white focus:ring-0 focus:outline-none transition-colors"
              placeholder=""
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300">
              Password *
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 block w-full border-0 border-b border-gray-400 bg-transparent px-0 py-2 text-white placeholder-gray-500 focus:border-white focus:ring-0 focus:outline-none transition-colors"
              placeholder=""
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !email || !password}
            className="mt-8 w-full rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold uppercase tracking-wider text-white shadow-lg transition-all hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-400">Forgot your password?</p>
            <button
              type="button"
              className="mt-1 text-sm font-semibold text-white underline underline-offset-2 hover:text-gray-300 transition-colors"
            >
              RESET PASSWORD
            </button>
          </div>

          <div className="mt-4 text-center">
            <button
              type="button"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Sign in with SSO →
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
