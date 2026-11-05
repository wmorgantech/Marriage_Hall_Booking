import { useEffect, useRef, useState } from 'react';
import {
  api,
  storeAuthResponse,
  type SessionUser,
} from '../api/client';
import { useT } from '../i18n';

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess?: (user: SessionUser) => void;
  hallName?: string;
};

type Step = 'phone' | 'otp';

const COUNTRY_CODE = '+91';

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `${COUNTRY_CODE}${digits}`;
  if (digits.length > 10 && raw.trim().startsWith('+')) return `+${digits}`;
  return null;
}

export default function OtpAuthModal({ open, onClose, onSuccess, hallName }: Props) {
  const { t, en } = useT();
  const [step, setStep] = useState<Step>('phone');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const phoneRef = useRef<HTMLInputElement>(null);
  const otpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setStep('phone');
      setName('');
      setPhone('');
      setOtp('');
      setError(null);
      setBusy(false);
      setResendIn(0);
    } else {
      setTimeout(() => phoneRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (step === 'otp') setTimeout(() => otpRef.current?.focus(), 50);
  }, [step]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function sendOtp() {
    setError(null);
    const e164 = normalizePhone(phone);
    if (!e164) {
      setError('Enter a valid 10-digit mobile number');
      return;
    }
    setBusy(true);
    try {
      await api.requestOtp(e164);
      setOtp('');
      setStep('otp');
      setResendIn(30);
    } catch (err) {
      // The API masks provider failures (WhatsApp unreachable etc.) as a generic server error.
      const msg = (err as Error).message;
      setError(/internal server error|^request failed: 5\d\d/i.test(msg) ? en('otp_send_failed') : msg);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    setError(null);
    const e164 = normalizePhone(phone);
    if (!e164) {
      setError('Phone number is invalid');
      return;
    }
    if (otp.length !== 4) {
      setError('Enter the 4-digit OTP');
      return;
    }
    setBusy(true);
    try {
      const res = await api.verifyOtp(e164, otp, name.trim() || undefined);
      storeAuthResponse(res);
      window.dispatchEvent(new Event('cnb:auth-changed'));
      onSuccess?.(res.user);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="otp-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
      />
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl ring-1 ring-gold/20 overflow-hidden"
        style={{ animation: 'cnb-fade-in 160ms ease-out' }}
      >
        <div className="bg-gradient-to-r from-primary to-primary-container px-6 py-5 flex items-center gap-3">
          <span className="material-symbols-outlined text-white text-2xl">verified_user</span>
          <div className="flex-1 min-w-0">
            <h2 id="otp-modal-title" className="font-serif font-bold text-white text-lg">
              {step === 'phone' ? t('otp_quick_verify') : t('otp_enter_otp')}
            </h2>
            <p className="text-white/80 text-xs mt-0.5 truncate">
              {hallName
                ? t('otp_verify_for', { vars: { name: hallName } })
                : t('otp_verify_default')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {step === 'phone' && (
            <>
              <div>
                <label
                  htmlFor="otp-name"
                  className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2"
                >
                  {t('otp_your_name')}
                </label>
                <input
                  id="otp-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={en('otp_your_name')}
                  className="w-full border border-gold/40 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  autoComplete="name"
                />
              </div>

              <div>
                <label
                  htmlFor="otp-phone"
                  className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2"
                >
                  {t('otp_mobile')}
                </label>
                <div className="flex items-stretch border border-gold/40 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary">
                  <span className="px-3 flex items-center bg-surface-container/60 text-sm font-bold text-on-surface-variant border-r border-gold/40">
                    {COUNTRY_CODE}
                  </span>
                  <input
                    id="otp-phone"
                    ref={phoneRef}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !busy) sendOtp(); }}
                    placeholder="XXXXX XXXXX"
                    className="flex-1 px-3 py-2.5 text-sm tracking-wider focus:outline-none"
                  />
                </div>
                <p className="text-[11px] text-on-surface-variant mt-2">
                  {t('otp_send_hint')}
                </p>
              </div>

              {error && (
                <p className="text-sm text-error bg-error-container/40 px-3 py-2 rounded-lg">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={sendOtp}
                disabled={busy || phone.length < 10}
                className="w-full bg-primary text-white py-3 rounded-xl font-bold tracking-widest text-xs shadow-md shadow-primary/20 hover:bg-primary-container active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {busy ? t('otp_sending') : t('otp_send_btn')}
              </button>
            </>
          )}

          {step === 'otp' && (
            <>
              <p className="text-sm text-on-surface-variant">
                {t('otp_sent_to')}{' '}
                <span className="font-bold text-primary">
                  {COUNTRY_CODE} {phone.replace(/(\d{5})(\d{5})/, '$1 $2')}
                </span>
                .{' '}
                <button
                  type="button"
                  onClick={() => setStep('phone')}
                  className="text-secondary font-bold hover:underline"
                >
                  {t('otp_change')}
                </button>
              </p>

              <div>
                <label
                  htmlFor="otp-code"
                  className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2"
                >
                  {t('otp_label')}
                </label>
                <input
                  id="otp-code"
                  ref={otpRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={4}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !busy) verifyOtp(); }}
                  placeholder="• • • •"
                  className="w-full border border-gold/40 rounded-lg px-3 py-3 text-center text-2xl font-bold tracking-[0.6em] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                <p className="mt-2 text-xs text-on-surface-variant text-center">{t('otp_expiry_note')}</p>
              </div>

              {error && (
                <p className="text-sm text-error bg-error-container/40 px-3 py-2 rounded-lg">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={verifyOtp}
                disabled={busy || otp.length !== 4}
                className="w-full bg-primary text-white py-3 rounded-xl font-bold tracking-widest text-xs shadow-md shadow-primary/20 hover:bg-primary-container active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {busy ? t('otp_verifying') : t('otp_verify_btn')}
              </button>

              <div className="text-center text-xs text-on-surface-variant">
                {t('otp_didnt_get')}{' '}
                {resendIn > 0 ? (
                  <span>{t('otp_resend_in', { vars: { n: resendIn } })}</span>
                ) : (
                  <button
                    type="button"
                    onClick={sendOtp}
                    disabled={busy}
                    className="text-primary font-bold hover:underline"
                  >
                    {t('otp_resend')}
                  </button>
                )}
              </div>
            </>
          )}

          <p className="text-[10px] text-center text-on-surface-variant pt-2 border-t border-gold/10">
            {t('otp_consent')}
          </p>
        </div>
      </div>
    </div>
  );
}
