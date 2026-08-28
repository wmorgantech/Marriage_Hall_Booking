import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setSessionUser, setToken } from '../api/client';
import { useT } from '../i18n';

export default function OwnerLogin() {
  const { t } = useT();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const { token, user } = await api.login(phone.trim(), password);
      setToken(token);
      setSessionUser(user);
      window.dispatchEvent(new Event('cnb:auth-changed'));
      nav(user.role === 'ADMIN' ? '/admin' : '/owner/dashboard');
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center px-4 py-12 bg-surface-container-low">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-soft-lg border-t-4 border-gold p-8 md:p-10">
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl text-primary font-bold mb-2">{t('owner_welcome_back')}</h1>
          <p className="text-on-surface-variant text-sm font-serif italic">
            {t('owner_signin_sub')}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label htmlFor="phone" className="block text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">
              {t('phone_number_label')}
            </label>
            <input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              autoComplete="tel"
              required
              className="w-full border-b-2 border-gold/40 bg-transparent py-2 focus:ring-0 focus:border-primary text-base"
            />
            <p className="text-[11px] text-on-surface-variant mt-1">{t('cc_hint')}</p>
          </div>

          <div>
            <label htmlFor="password" className="block text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">
              {t('password_label')}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full border-b-2 border-gold/40 bg-transparent py-2 focus:ring-0 focus:border-primary text-base"
            />
          </div>

          {error && (
            <div className="px-4 py-3 bg-error-container text-on-error-container text-sm rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white font-bold py-4 rounded-xl tracking-widest text-xs shadow-lg shadow-red-900/20 active:scale-95 transition-all disabled:opacity-60"
          >
            {loading ? t('signing_in') : t('sign_in_btn')}
          </button>
        </form>

        <p className="text-center text-sm text-on-surface-variant mt-6">
          {t('new_owner')}{' '}
          <Link to="/owner/register" className="text-primary font-bold hover:underline">
            {t('create_account')}
          </Link>
        </p>
      </div>
    </div>
  );
}
