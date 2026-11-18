'use client';

import { useActionState, useState } from 'react';
import { signIn, signUp } from '@/app/actions';

export function AuthForm({ next }: { next: string }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [stateIn, actIn, pendingIn] = useActionState(signIn, null);
  const [stateUp, actUp, pendingUp] = useActionState(signUp, null);
  const state = mode === 'in' ? stateIn : stateUp;
  const pending = pendingIn || pendingUp;
  return (
    <form action={mode === 'in' ? actIn : actUp} className="stack-sm">
      <div className="seg" role="tablist" aria-label="Mode">
        <button type="button" className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')} role="tab" aria-selected={mode === 'in'}>Masuk</button>
        <button type="button" className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')} role="tab" aria-selected={mode === 'up'}>Daftar</button>
      </div>
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="lbl" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <label className="lbl" htmlFor="password">Kata sandi</label>
        <input id="password" name="password" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={8} required />
      </div>
      {state?.message && <p className={`note ${state.ok ? '' : 'crit'}`} role="alert">{state.message}</p>}
      <button className="btn primary" type="submit" disabled={pending} style={{ justifyContent: 'center' }}>
        {pending ? 'Memproses…' : mode === 'in' ? 'Masuk' : 'Buat akun'}
      </button>
    </form>
  );
}
