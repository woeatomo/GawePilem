'use client';

import { useActionState } from 'react';
import { completeOnboarding } from '@/app/actions';

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const [state, act, pending] = useActionState(completeOnboarding, null);
  return (
    <form action={act} className="stack-sm">
      <div>
        <label className="lbl" htmlFor="name">Nama tampilan</label>
        <input id="name" name="name" type="text" defaultValue={defaultName} maxLength={60} />
      </div>
      <label className="row small" style={{ alignItems: 'flex-start' }}>
        <input type="checkbox" name="age" required />
        <span>Saya berusia 18 tahun atau lebih.</span>
      </label>
      <label className="row small" style={{ alignItems: 'flex-start' }}>
        <input type="checkbox" name="consent" required />
        <span>
          Saya menyetujui pemrosesan data pribadi sesuai UU PDP untuk menjalankan layanan, termasuk mengirim prompt ke provider AI yang saya pilih. Saya bisa meminta
          penghapusan akun dan data kapan saja.
        </span>
      </label>
      <p className="note">
        Saya hanya akan membuat karakter orisinal, tidak meniru wajah atau suara orang nyata tanpa izin, dan tidak memakai karakter berhak cipta. Konten yang
        dipublikasikan otomatis diberi label AI.
      </p>
      {state?.message && <p className="note crit" role="alert">{state.message}</p>}
      <button className="btn primary" type="submit" disabled={pending} style={{ justifyContent: 'center' }}>
        {pending ? 'Menyimpan…' : 'Setuju & lanjut'}
      </button>
    </form>
  );
}
