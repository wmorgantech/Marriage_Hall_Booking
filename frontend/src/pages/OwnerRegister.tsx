import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setSessionUser, setToken } from '../api/client';
import { useT } from '../i18n';

const COUNTRY_CODE = '+91';

function friendlyError(msg: string): string {
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return 'Could not reach the server. Please check your connection and try again.';
  }
  if (/internal server error|^request failed: 5\d\d/i.test(msg)) {
    return "We couldn't send the WhatsApp code right now. Please try again in a moment.";
  }
  return msg;
}

type Step = 'form' | 'otp';

export default function OwnerRegister() {
  const { t } = useT();
  const [step, setStep] = useState<Step>('form');
  const [hallName, setHallName] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const nav = useNavigate();

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  function validate(): boolean {
    if (hallName.trim().length < 2) {
      setError('Please enter your hall name.');
      return false;
    }
    if (name.trim().length < 2) {
      setError('Please enter the owner / contact person name.');
      return false;
    }
    if (phone.length !== 10) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return false;
    }
    return true;
  }

  async function sendOtp() {
    if (!validate()) return;
    setError(null);
    setLoading(true);
    try {
      await api.requestOtp(`${COUNTRY_CODE}${phone}`);
      setOtp('');
      setStep('otp');
      setResendIn(30);
    } catch (err: unknown) {
      setError(friendlyError((err as Error).message ?? 'Could not send OTP'));
    } finally {
      setLoading(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (otp.length !== 4) {
      setError('Enter the 4-digit OTP sent to your WhatsApp.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { token, user } = await api.registerOtp({
        name: name.trim(),
        phone: `${COUNTRY_CODE}${phone}`,
        email: email.trim() || undefined,
        otp,
        hallName: hallName.trim(),
      });
      setToken(token);
      setSessionUser(user);
      window.dispatchEvent(new Event('cnb:auth-changed'));
      nav('/owner/dashboard');
    } catch (err: unknown) {
      setError(friendlyError((err as Error).message ?? 'Registration failed'));
    } finally {
      setLoading(false);
    }
  }

  const labelCls = 'block text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-2';
  const fieldCls =
    'w-full border border-gold/40 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white';

  return (
    <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center px-4 py-12 bg-surface-container-low">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-soft-lg border-t-4 border-gold p-8 md:p-10">
        <div className="text-center mb-8">
          <h1 className="font-serif text-2xl md:text-3xl text-primary font-bold mb-2">
            {t('reg_title')}
          </h1>
          <p className="text-on-surface-variant text-sm font-serif italic">
            {t('reg_subtitle')}
          </p>
        </div>

        {step === 'form' ? (
          <div className="space-y-5">
            <div>
              <label htmlFor="r-hall" className={labelCls}>
                {t('reg_hall_name')} <span className="text-error">*</span>
              </label>
              <input
                id="r-hall"
                className={fieldCls}
                value={hallName}
                onChange={(e) => setHallName(e.target.value)}
                placeholder="e.g. Sree Function Palace"
                required
                autoComplete="organization"
              />
              <p className="text-[11px] text-on-surface-variant mt-1">
                {t('reg_hall_hint')}
              </p>
            </div>

            <div>
              <label htmlFor="r-name" className={labelCls}>
                {t('reg_owner_name')} <span className="text-error">*</span>
              </label>
              <input
                id="r-name"
                className={fieldCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Kumar Iyer"
                required
                autoComplete="name"
              />
            </div>

            <div>
              <label htmlFor="r-phone" className={labelCls}>
                {t('phone_number_label')} <span className="text-error">*</span>
              </label>
              <div className="flex items-stretch border border-gold/40 rounded-lg overflow-hidden bg-white focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary">
                <span className="px-3 flex items-center bg-surface-container/60 text-sm font-bold text-on-surface-variant border-r border-gold/40">
                  {COUNTRY_CODE}
                </span>
                <input
                  id="r-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="98765 43210"
                  className="flex-1 px-3 py-2.5 text-sm tracking-wider focus:outline-none"
                  required
                />
              </div>
              <p className="text-[11px] text-on-surface-variant mt-1">
                We'll send a one-time password on WhatsApp to verify this number.
              </p>
            </div>

            <div>
              <label htmlFor="r-email" className={labelCls}>
                {t('email_label')} <span className="text-on-surface-variant lowercase tracking-normal font-normal">{t('optional')}</span>
              </label>
              <input
                id="r-email"
                className={fieldCls}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            {error && (
              <div className="px-4 py-3 bg-error-container text-on-error-container text-sm rounded-lg flex items-start gap-2">
                <span className="material-symbols-outlined text-base mt-0.5">error</span>
                <span className="flex-1">
                  {error}
                  {/already registered/i.test(error) && (
                    <>
                      {' '}
                      <Link to="/owner/login" className="font-bold underline">
                        Sign in
                      </Link>
                    </>
                  )}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={sendOtp}
              disabled={loading}
              className="w-full bg-primary text-white font-bold py-4 rounded-xl tracking-widest text-xs shadow-lg shadow-red-900/20 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending OTP…' : 'Send OTP & Verify'}
            </button>
          </div>
        ) : (
          <form onSubmit={onVerify} className="space-y-5" noValidate>
            <p className="text-sm text-on-surface-variant">
              We've sent a 4-digit OTP on WhatsApp to{' '}
              <span className="font-bold text-primary">{COUNTRY_CODE} {phone}</span>.{' '}
              <button
                type="button"
                onClick={() => { setStep('form'); setOtp(''); setError(null); }}
                className="text-secondary font-bold hover:underline"
              >
                Change
              </button>
            </p>

            <div>
              <label htmlFor="r-otp" className={labelCls}>
                Enter OTP <span className="text-error">*</span>
              </label>
              <input
                id="r-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={4}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="• • • •"
                className="w-full border border-gold/40 rounded-lg px-3 py-3 text-center text-2xl font-bold tracking-[0.6em] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              <p className="mt-2 text-xs text-on-surface-variant text-center">
                The code is valid for 10 minutes.
              </p>
            </div>

            {error && (
              <div className="px-4 py-3 bg-error-container text-on-error-container text-sm rounded-lg flex items-start gap-2">
                <span className="material-symbols-outlined text-base mt-0.5">error</span>
                <span className="flex-1">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || otp.length !== 4}
              className="w-full bg-primary text-white font-bold py-4 rounded-xl tracking-widest text-xs shadow-lg shadow-red-900/20 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? t('creating_account') : t('create_account_btn')}
            </button>

            <div className="text-center text-xs text-on-surface-variant">
              Didn't get it?{' '}
              {resendIn > 0 ? (
                <span>Resend in {resendIn}s</span>
              ) : (
                <button
                  type="button"
                  onClick={sendOtp}
                  disabled={loading}
                  className="text-primary font-bold hover:underline"
                >
                  Resend OTP
                </button>
              )}
            </div>
          </form>
        )}

        <p className="text-center text-sm text-on-surface-variant mt-6">
          {t('already_account')}{' '}
          <Link to="/owner/login" className="text-primary font-bold hover:underline">
            {t('sign_in_link')}
          </Link>
        </p>
      </div>
    </div>
  );
}
