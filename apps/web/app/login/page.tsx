import type { Metadata } from 'next';
import { Logo } from '@/components/logo';
import { AuthForm } from './form';

export const metadata: Metadata = { title: 'Masuk' };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="auth">
      <div className="card">
        <div className="row" style={{ gap: 12 }}>
          <Logo size={36} />
          <div>
            <h1 style={{ fontSize: 20 }}>Atomo Film Studio</h1>
            <p className="muted small">Kamu yang sutradara, AI kru-nya.</p>
          </div>
        </div>
        <AuthForm next={next ?? '/studio'} />
        <p className="small faint">
          Dengan masuk kamu menyetujui Ketentuan Layanan dan Kebijakan Privasi. Layanan untuk pengguna berusia 18 tahun ke atas.
        </p>
      </div>
    </div>
  );
}
