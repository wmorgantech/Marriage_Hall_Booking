import { useEffect, useState } from 'react';

type ToastKind = 'success' | 'error' | 'info';
export type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
  description?: string;
  durationMs: number;
};

type ToastInput = Omit<Toast, 'id' | 'durationMs'> & { durationMs?: number };

const EVENT = 'cnb:toast';
let nextId = 1;

export function showToast(input: ToastInput) {
  const detail: Toast = {
    id: nextId++,
    kind: input.kind,
    message: input.message,
    description: input.description,
    durationMs: input.durationMs ?? (input.kind === 'error' ? 6000 : 3500),
  };
  window.dispatchEvent(new CustomEvent<Toast>(EVENT, { detail }));
}

export function toastSuccess(message: string, description?: string) {
  showToast({ kind: 'success', message, description });
}
export function toastError(message: string, description?: string) {
  showToast({ kind: 'error', message, description });
}

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const t = (e as CustomEvent<Toast>).detail;
      setToasts((prev) => [...prev, t]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, t.durationMs);
    }
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }

  if (toasts.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Notifications"
      className="fixed top-4 right-4 z-[200] flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)] pointer-events-none"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const tone =
    toast.kind === 'success'
      ? { bg: 'bg-emerald-600', icon: 'check_circle', label: 'Success' }
      : toast.kind === 'error'
      ? { bg: 'bg-red-600', icon: 'error', label: 'Error' }
      : { bg: 'bg-slate-800', icon: 'info', label: 'Info' };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto rounded-xl shadow-2xl ring-1 ring-black/10 overflow-hidden ${tone.bg} text-white cnb-toast-in`}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <span className="material-symbols-outlined text-[22px] mt-0.5 shrink-0">{tone.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight">{toast.message}</p>
          {toast.description && (
            <p className="text-xs text-white/85 mt-0.5 leading-snug">{toast.description}</p>
          )}
        </div>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={onDismiss}
          className="shrink-0 p-1 rounded-full hover:bg-white/15 transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>
      <div
        className="h-1 bg-white/40"
        style={{ animation: `cnb-toast-progress ${toast.durationMs}ms linear forwards` }}
      />
    </div>
  );
}
