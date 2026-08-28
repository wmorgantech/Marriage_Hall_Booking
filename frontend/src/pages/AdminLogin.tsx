import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setSessionUser, setToken } from '../api/client';

function friendlyError(msg: string): string {
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return 'Could not reach the API. Make sure the backend is running.';
  }
  return msg;
}

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) { setError('Enter a valid email address.'); return; }
    if (password.length === 0) { setError('Password is required.'); return; }

    setLoading(true);
    try {
      const { token, user } = await api.adminLogin(trimmed, password);
      if (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
        setToken(null);
        setSessionUser(null);
        setError('This console is restricted to platform administrators.');
        return;
      }
      setToken(token);
      setSessionUser(user);
      window.dispatchEvent(new Event('cnb:auth-changed'));
      nav('/admin');
    } catch (err: unknown) {
      setError(friendlyError((err as Error).message ?? 'Sign in failed'));
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(role: 'admin' | 'superadmin') {
    if (role === 'admin') { setEmail('admin@checknbook.com'); setPassword('admin123'); }
    else { setEmail('superadmin@checknbook.com'); setPassword('super123'); }
  }

  return (
    <div className="min-h-screen flex items-stretch bg-slate-950 text-slate-100">
      {/* Left panel — brand & message */}
      <aside className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center p-16">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle at 25% 30%, #d4af37 0, transparent 40%), radial-gradient(circle at 75% 70%, #610000 0, transparent 45%)',
          }}
        />
        <div className="relative z-10 max-w-md">
          <div className="flex items-center gap-3 mb-12">
            <span className="flex items-center justify-center h-12 w-12 rounded-lg bg-primary text-white font-serif font-bold text-xl shadow-lg ring-1 ring-gold/60">
              CB
            </span>
            <span className="text-3xl font-black italic font-serif tracking-tight text-white">
              Check<span className="text-gold">N</span>Book
            </span>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-gold mb-3">
            Operator Console
          </p>
          <h1 className="font-serif text-4xl font-bold leading-tight mb-6">
            Manage every hall, owner and booking on the platform.
          </h1>
          <p className="text-slate-300 leading-relaxed">
            Approve new listings, deactivate misuse, audit owner activity, and keep the catalogue
            healthy. This area is restricted to verified CheckNBook administrators.
          </p>

          <div className="mt-12 grid grid-cols-3 gap-4">
            {[
              { icon: 'verified', label: 'Listings' },
              { icon: 'storefront', label: 'Owners' },
              { icon: 'monitoring', label: 'Insights' },
            ].map((it) => (
              <div key={it.label} className="rounded-xl bg-white/5 backdrop-blur ring-1 ring-white/10 p-4">
                <span className="material-symbols-outlined text-gold text-[28px]">{it.icon}</span>
                <p className="mt-2 text-xs font-bold uppercase tracking-widest text-slate-300">{it.label}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Right — form */}
      <main className="flex-1 flex items-center justify-center p-6 md:p-12 bg-slate-50 text-on-surface">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <span className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary text-white font-serif font-bold text-lg">
              CB
            </span>
            <span className="text-2xl font-black italic font-serif tracking-tight text-primary">
              Check<span className="text-gold">N</span>Book
            </span>
          </div>

          <div className="bg-white rounded-2xl shadow-soft-lg border-t-4 border-primary p-8 md:p-10">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-secondary mb-2">
              Restricted access
            </p>
            <h2 className="font-serif text-2xl md:text-3xl text-primary font-bold mb-2">
              Sign in to admin console
            </h2>
            <p className="text-on-surface-variant text-sm mb-8">
              Enter your operator credentials to manage halls, owners and platform data.
            </p>

            <form onSubmit={onSubmit} className="space-y-5" noValidate>
              <div>
                <label
                  htmlFor="ad-email"
                  className="block text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-2"
                >
                  Username (email)
                </label>
                <div className="relative">
                  <span
                    className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none"
                    aria-hidden
                  >
                    alternate_email
                  </span>
                  <input
                    id="ad-email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@checknbook.com"
                    className="w-full border border-gold/40 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="ad-pass"
                  className="block text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-2"
                >
                  Password
                </label>
                <input
                  id="ad-pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full border border-gold/40 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
                />
              </div>

              {error && (
                <div className="px-4 py-3 bg-error-container text-on-error-container text-sm rounded-lg flex items-start gap-2">
                  <span className="material-symbols-outlined text-base mt-0.5">error</span>
                  <span className="flex-1">{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-white font-bold py-3.5 rounded-xl uppercase tracking-widest text-xs shadow-lg shadow-red-900/30 active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="spin" /> Signing in…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base">shield_lock</span>
                    Sign in to console
                  </>
                )}
              </button>
            </form>

            <p className="mt-8 text-center text-xs text-on-surface-variant">
              Not an admin?{' '}
              <Link to="/owner/login" className="text-primary font-bold hover:underline">
                Owner sign-in
              </Link>
              {' · '}
              <Link to="/" className="text-primary font-bold hover:underline">
                Back to site
              </Link>
            </p>
          </div>

          <div className="mt-6 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              Demo accounts — click to fill
            </p>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => fillDemo('admin')}
                className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-slate-800 text-slate-200 hover:bg-slate-700 ring-1 ring-white/10"
              >
                admin@checknbook.com
              </button>
              <button
                type="button"
                onClick={() => fillDemo('superadmin')}
                className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-gold/20 text-gold hover:bg-gold/30 ring-1 ring-gold/40"
              >
                superadmin@checknbook.com
              </button>
            </div>
            <p className="mt-2 text-[10px] text-slate-500">
              Passwords: <span className="font-bold">admin123</span> /{' '}
              <span className="font-bold">super123</span>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
