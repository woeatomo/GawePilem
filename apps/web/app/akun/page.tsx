import type { Metadata } from 'next';
import { AccountPage, loadAccount } from '@/lib/account';
import { DeleteAccount } from './delete';

export const metadata: Metadata = { title: 'Akun & privasi' };

export default async function Akun() {
  const data = await loadAccount();
  const p = data.session.profile;
  const d = (x: string | null) => (x ? new Date(x).toLocaleDateString('id-ID', { dateStyle: 'medium' }) : '–');
  return (
    <AccountPage data={data} active="akun" title="Akun & privasi">
      <header className="vhead">
        <div>
          <p className="eyebrow">AKUN</p>
          <h1>Akun & privasi</h1>
          <p className="lede">Kamu berhak mengakses, mengunduh, dan menghapus data pribadi kamu sesuai UU Pelindungan Data Pribadi.</p>
        </div>
      </header>
      <div className="grid2">
        <section className="card">
          <h2>Profil</h2>
          <table className="tarif">
            <tbody>
              <tr><td className="muted">Email</td><td>{data.session.email}</td></tr>
              <tr><td className="muted">Nama</td><td>{p.display_name ?? '–'}</td></tr>
              <tr><td className="muted">Paket</td><td style={{ textTransform: 'capitalize' }}>{p.plan}</td></tr>
              <tr><td className="muted">Persetujuan data</td><td>{d(p.data_consent_at)}</td></tr>
              <tr><td className="muted">Terdaftar</td><td>{d(p.created_at)}</td></tr>
            </tbody>
          </table>
        </section>
        <section className="card">
          <h2>Unduh data saya</h2>
          <p className="muted small" style={{ marginBottom: 12 }}>File JSON berisi profil, project, karakter, naskah, shot, riwayat kredit, pesanan top-up, job AI, dan publikasi. API key dan token tidak ikut diekspor.</p>
          <a className="btn" href="/api/account/export">Unduh data (JSON)</a>
        </section>
      </div>
      <DeleteAccount email={data.session.email} />
    </AccountPage>
  );
}
