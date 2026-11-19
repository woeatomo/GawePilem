'use client';

import { useEffect, useState, useTransition } from 'react';
import { MfaChallenge } from '@/components/mfa';
import { useToast } from '@/components/ui';
import { deletePlatformSecret, setPlatformSecret, type SecretActionResult } from '../actions';

export interface SecretRow {
  name: string; label: string; group: string; help: string;
  source: 'database' | 'env' | 'none'; hint: string | null; updatedAt: string | null; updatedBy: string | null;
}

const SOURCE: Record<SecretRow['source'], [string, string]> = {
  database: ['Tersimpan (terenkripsi)', 'good'],
  env: ['Dari env server', 'info'],
  none: ['Belum diisi', 'warn'],
};

export function SecretsPanel({ secrets, stepUpUntil }: { secrets: SecretRow[]; stepUpUntil: number }) {
  const [now, setNow] = useState(() => Date.now());
  const [needStepUp, setNeedStepUp] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [pending, start] = useTransition();
  const toast = useToast();
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  const fresh = stepUpUntil > now;
  const minutes = Math.max(0, Math.ceil((stepUpUntil - now) / 60_000));

  const handle = (r: SecretActionResult, ok: string) => {
    if (r.ok) {
      toast(ok);
      setEditing(null);
      setValue('');
    } else if (r.code === 'step_up') setNeedStepUp(true);
    else toast(r.message, 'err');
  };

  if (needStepUp || !fresh) {
    return (
      <MfaChallenge
        title="Verifikasi ulang 2FA"
        desc="Untuk mengubah secret, masukkan kode 2FA terbaru. Verifikasi berlaku 15 menit."
        onVerified={() => setNeedStepUp(false)}
      />
    );
  }

  const groups = [...new Set(secrets.map((s) => s.group))];
  return (
    <>
      <p className="note">Verifikasi 2FA aktif, sisa sekitar <b>{minutes} menit</b>. Perubahan berlaku di web segera dan di worker paling lambat 60 detik.</p>
      {groups.map((g) => (
        <section className="card" key={g}>
          <h2>{g}</h2>
          <table className="tarif">
            <thead>
              <tr><th>Secret</th><th>Status</th><th>Nilai</th><th>Diubah</th><th></th></tr>
            </thead>
            <tbody>
              {secrets.filter((s) => s.group === g).map((s) => {
                const [label, cls] = SOURCE[s.source];
                return (
                  <tr key={s.name}>
                    <td>
                      <b>{s.label}</b>
                      <div className="mono small faint">{s.name}</div>
                      <div className="small muted">{s.help}</div>
                    </td>
                    <td><span className={`pill ${cls}`}>{label}</span></td>
                    <td className="mono small" style={{ whiteSpace: 'nowrap' }}>{s.hint ?? '–'}</td>
                    <td className="small muted">{s.updatedAt ? `${new Date(s.updatedAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}${s.updatedBy ? ` · ${s.updatedBy}` : ''}` : '–'}</td>
                    <td style={{ minWidth: 280 }}>
                      {editing === s.name ? (
                        <div className="row">
                          <input
                            type="password"
                            autoComplete="off"
                            spellCheck={false}
                            aria-label={`Nilai baru ${s.name}`}
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            style={{ flex: 1, minWidth: 160 }}
                          />
                          <button className="btn sm primary" disabled={pending || value.trim().length < 8} onClick={() => start(async () => handle(await setPlatformSecret(s.name, value), `${s.label} disimpan`))}>Simpan</button>
                          <button className="btn sm ghost" onClick={() => { setEditing(null); setValue(''); }}>Batal</button>
                        </div>
                      ) : (
                        <div className="row">
                          <button className="btn sm" onClick={() => { setEditing(s.name); setValue(''); }}>{s.source === 'database' ? 'Ganti' : 'Isi'}</button>
                          {s.source === 'database' && (
                            <button className="btn sm ghost danger" disabled={pending} onClick={() => confirm(`Hapus ${s.name} dari database? Aplikasi akan memakai nilai env bila ada.`) && start(async () => handle(await deletePlatformSecret(s.name), `${s.label} dihapus`))}>
                              Hapus
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
      <p className="note">ENCRYPTION_KEY dan SUPABASE_SERVICE_ROLE_KEY sengaja tidak bisa diatur di sini: keduanya dibutuhkan untuk membuka secret ini, jadi tetap di env server.</p>
    </>
  );
}
