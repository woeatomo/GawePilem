'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

const codeOk = (c: string) => /^\d{6}$/.test(c);

function CodeInput({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      placeholder="123456"
      className="mono"
      style={{ fontSize: 20, letterSpacing: '0.3em', maxWidth: 200 }}
    />
  );
}

/** Aktivasi 2FA TOTP (Google Authenticator, Authy, 1Password, dll.). */
export function MfaEnroll() {
  const router = useRouter();
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const db = supabaseBrowser();
    void (async () => {
      // Bersihkan faktor yang belum pernah diverifikasi supaya QR selalu baru.
      const { data: f } = await db.auth.mfa.listFactors();
      for (const x of f?.all ?? []) if (x.status === 'unverified') await db.auth.mfa.unenroll({ factorId: x.id });
      const { data, error } = await db.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Pilem Studio ${new Date().toISOString().slice(0, 10)}` });
      if (error || !data) return setErr(error?.message ?? 'Gagal memulai aktivasi 2FA');
      setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
  }, []);

  async function verify() {
    if (!enroll) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabaseBrowser().auth.mfa.challengeAndVerify({ factorId: enroll.id, code });
    setBusy(false);
    if (error) return setErr('Kode salah atau kedaluwarsa. Coba kode berikutnya.');
    router.refresh();
  }

  return (
    <section className="card" style={{ maxWidth: 560 }}>
      <h2>Aktifkan 2FA dulu</h2>
      <p className="muted small" style={{ margin: '6px 0 12px' }}>
        Halaman ini mengelola key asli platform. Pindai kode QR dengan aplikasi autentikator (Google Authenticator, Authy, 1Password), lalu masukkan kode 6 digit.
      </p>
      {enroll ? (
        <div className="stack-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enroll.qr} alt="Kode QR 2FA" width={180} height={180} style={{ background: '#fff', borderRadius: 8, padding: 8 }} />
          <p className="small muted">
            Tidak bisa memindai? Masukkan kode ini manual: <span className="mono" style={{ color: 'var(--text)', userSelect: 'all' }}>{enroll.secret}</span>
          </p>
          <label className="lbl" htmlFor="enroll-code">Kode 6 digit</label>
          <div className="row">
            <CodeInput id="enroll-code" value={code} onChange={setCode} />
            <button className="btn primary" disabled={busy || !codeOk(code)} onClick={verify}>{busy ? 'Memeriksa…' : 'Aktifkan'}</button>
          </div>
        </div>
      ) : (
        !err && <p className="muted">Menyiapkan…</p>
      )}
      {err && <p className="note crit" role="alert" style={{ marginTop: 10 }}>{err}</p>}
    </section>
  );
}

/** Verifikasi kode 2FA: untuk naik ke sesi aal2, atau step-up sebelum mengubah secret. */
export function MfaChallenge({ title, desc, onVerified }: { title: string; desc: string; onVerified?: () => void }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify() {
    setBusy(true);
    setErr(null);
    const db = supabaseBrowser();
    const { data: f } = await db.auth.mfa.listFactors();
    const factor = f?.totp.find((x) => x.status === 'verified');
    if (!factor) {
      setBusy(false);
      return setErr('Tidak ada 2FA aktif di akun ini.');
    }
    const { error } = await db.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    setBusy(false);
    if (error) return setErr('Kode salah atau kedaluwarsa.');
    setCode('');
    onVerified?.();
    router.refresh();
  }

  return (
    <section className="card" style={{ maxWidth: 560 }}>
      <h2>{title}</h2>
      <p className="muted small" style={{ margin: '6px 0 12px' }}>{desc}</p>
      <label className="lbl" htmlFor="mfa-code">Kode dari aplikasi autentikator</label>
      <div className="row">
        <CodeInput id="mfa-code" value={code} onChange={setCode} />
        <button className="btn primary" disabled={busy || !codeOk(code)} onClick={verify}>{busy ? 'Memeriksa…' : 'Verifikasi'}</button>
      </div>
      {err && <p className="note crit" role="alert" style={{ marginTop: 10 }}>{err}</p>}
    </section>
  );
}
