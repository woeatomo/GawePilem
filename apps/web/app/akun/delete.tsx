'use client';

import { useActionState, useState } from 'react';
import { deleteAccount } from '@/app/actions';

export function DeleteAccount({ email }: { email: string }) {
  const [state, act, pending] = useActionState(deleteAccount, null);
  const [typed, setTyped] = useState('');
  return (
    <section className="card" style={{ borderColor: 'rgba(229,72,77,.4)' }}>
      <h2>Hapus akun</h2>
      <p className="muted small">
        Semua project, karakter, naskah, media, akun sosial yang terhubung, dan API key akan dihapus permanen. Sisa saldo kredit hangus dan tidak bisa dikembalikan.
        Catatan transaksi kredit disimpan tanpa identitas untuk kewajiban pencatatan keuangan.
      </p>
      <form action={act} className="stack-sm" style={{ marginTop: 12, maxWidth: 420 }}>
        <label className="lbl" htmlFor="confirm">Ketik <b>{email}</b> untuk konfirmasi</label>
        <input id="confirm" name="confirm" type="email" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
        {state?.message && <p className="note crit" role="alert">{state.message}</p>}
        <button className="btn danger" type="submit" disabled={pending || typed.trim().toLowerCase() !== email.toLowerCase()}>
          {pending ? 'Menghapus…' : 'Hapus akun permanen'}
        </button>
      </form>
    </section>
  );
}
