'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Toast = { id: number; text: string; kind: 'ok' | 'err' | 'info' };
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = ++seq.current;
    setItems((x) => [...x, { id, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'err' ? 7000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'ok' ? '' : t.kind}`} role={t.kind === 'err' ? 'alert' : 'status'}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Modal({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('button.primary, button, input')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={label} ref={ref}>
        {children}
      </div>
    </div>
  );
}

export const fmt = (n: number) => new Intl.NumberFormat('id-ID').format(Math.round(n));
export const fmt1 = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(n);
export const rupiah = (n: number) => `Rp${fmt(n)}`;

export function timecode(sec: number, fps = 24): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = Math.floor(sec % 60), f = Math.floor((sec % 1) * fps);
  return `${p(h)}:${p(m)}:${p(s)}:${p(f)}`;
}
