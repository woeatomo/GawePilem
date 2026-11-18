'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CATEGORY_META, TIER_LABEL, TIERS, VIDEO_RESOLUTION, type Category, type Tier } from '@atomo/credits';
import { useToast } from '@/components/ui';
import { useStudio, type ClientSetting } from '@/components/studio-context';

export function ProviderForm(p: {
  category: Category;
  current: ClientSetting;
  providers: { id: string; name: string }[];
  models: { id: string; label: string; provider: string }[];
  platformReady: Record<string, boolean>;
}) {
  const { rates } = useStudio();
  const [provider, setProvider] = useState(p.current.provider);
  const [model, setModel] = useState(p.current.model);
  const [mode, setMode] = useState(p.current.mode);
  const [tier, setTier] = useState<Tier>(p.current.tier);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const models = p.models.filter((m) => m.provider === provider);
  const dirty = provider !== p.current.provider || model !== p.current.model || mode !== p.current.mode || tier !== p.current.tier || key !== '';

  async function save(extra: { removeKey?: boolean } = {}) {
    setBusy(true);
    const res = await fetch('/api/provider', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category: p.category, provider, model, mode: extra.removeKey ? 'saldo' : mode, tier, ...(key ? { apiKey: key } : {}), ...extra }),
    });
    setBusy(false);
    const j = (await res.json().catch(() => ({}))) as { error?: { message: string } };
    if (!res.ok) return toast(j.error?.message ?? 'Gagal menyimpan', 'err');
    setKey('');
    if (extra.removeKey) setMode('saldo');
    toast(`${CATEGORY_META[p.category].label} disimpan`);
    router.refresh();
  }

  return (
    <section className="card prov">
      <div className="card-h">
        <h2>{CATEGORY_META[p.category].label}</h2>
        <div className="seg" role="group" aria-label="Mode tagihan">
          <button className={mode === 'saldo' ? 'on' : ''} onClick={() => setMode('saldo')}>Saldo</button>
          <button className={mode === 'byok' ? 'on' : ''} onClick={() => setMode('byok')}>BYOK</button>
        </div>
      </div>
      <div className="row2">
        <div>
          <label className="lbl" htmlFor={`prov-${p.category}`}>Provider</label>
          <select id={`prov-${p.category}`} value={provider} onChange={(e) => { setProvider(e.target.value); setModel(p.models.find((m) => m.provider === e.target.value)?.id ?? ''); }}>
            {p.providers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl" htmlFor={`model-${p.category}`}>Model</label>
          <select id={`model-${p.category}`} value={model} onChange={(e) => setModel(e.target.value)}>
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label className="lbl">Tier (tarif per {CATEGORY_META[p.category].unit})</label>
        <div className="seg" role="group" aria-label="Tier">
          {TIERS.map((t) => (
            <button key={t} className={tier === t ? 'on' : ''} onClick={() => setTier(t)}>
              {TIER_LABEL[t]} · <span className="mono">{rates[p.category][t]}</span>{p.category === 'video' ? ` · ${VIDEO_RESOLUTION[t]}` : ''}
            </button>
          ))}
        </div>
      </div>
      {mode === 'byok' && (
        <div style={{ marginTop: 10 }}>
          <label className="lbl" htmlFor={`key-${p.category}`}>API key {p.current.keyHint ? `(tersimpan: ${p.current.keyHint})` : ''}</label>
          <input id={`key-${p.category}`} type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={p.current.keyHint ? 'Kosongkan untuk tetap memakai key lama' : 'Tempel API key'} />
        </div>
      )}
      {mode === 'saldo' && !p.platformReady[provider] && <p className="small" style={{ color: 'var(--warn)', marginTop: 8 }}>Key platform untuk {provider} belum dikonfigurasi di server.</p>}
      <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
        {p.current.keyHint && <button className="btn sm ghost danger" disabled={busy} onClick={() => save({ removeKey: true })}>Hapus key</button>}
        <button className="btn sm primary" disabled={!dirty || busy || (mode === 'byok' && !key && !p.current.keyHint)} onClick={() => save()}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
      </div>
    </section>
  );
}
