import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LuCircleCheck, LuPlus, LuSend, LuTrash2 } from 'react-icons/lu';
import { useCreatorAction, useMyInfluencerProfile } from '@/api/queries';
import { Button, Card, ErrorState, Input, PageHeader, PageSkeleton, Progress, Segmented, cx } from '@/components/ui';
import { FilePick, NICHES, PLATFORM_LABEL, PLATFORM_OPTIONS, VerificationBadge } from '@/components/creators';
import { FormError } from '@/pages/admin/finance/forms';

const STEPS = [
  { value: 'about', label: '1. About you' },
  { value: 'platforms', label: '2. Platforms' },
  { value: 'rates', label: '3. Rates' },
  { value: 'payout', label: '4. Payout and proof' },
];

export function InfluencerProfile() {
  const [params, setParams] = useSearchParams();
  const step = STEPS.some((s) => s.value === params.get('step')) ? params.get('step') : 'about';
  const { data: p, error, isPending, refetch } = useMyInfluencerProfile();
  const action = useCreatorAction();
  const [saved, setSaved] = useState(false);
  const go = (s) => setParams({ step: s });

  if (isPending) return <PageSkeleton />;
  if (error) return <div className="page"><ErrorState message={error.message} onRetry={refetch} /></div>;
  const save = (body, next) =>
    action.mutate({ kind: 'profile', body }, { onSuccess: () => (setSaved(true), setTimeout(() => setSaved(false), 2500), next && go(next)) });

  return (
    <div className="page">
      <PageHeader eyebrow="Brands see this after Webinger verifies it" title="My profile" actions={<VerificationBadge status={p.verification} />} />
      {params.get('welcome') === '1' && p.verification === 'DRAFT' && (
        <div className="alert alert--ok" role="status">
          <LuCircleCheck aria-hidden style={{ flexShrink: 0, marginTop: 2 }} /> <span>Email confirmed. Fill in the four steps, then send your profile for verification.</span>
        </div>
      )}
      {p.verification === 'REJECTED' && <div className="alert alert--warn">Webinger asked for changes: {p.rejectReason}</div>}
      {p.verification === 'PENDING' && <div className="alert alert--info">Your profile is with the Webinger team for review. You will get an email when it is verified.</div>}

      <Card>
        <div className="row bar-row" style={{ marginBottom: 8 }}>
          <Progress value={p.completeness} label="Profile complete" />
          <span className="small">{p.completeness}% complete</span>
        </div>
        {p.missing.length > 0 ? (
          <p className="small muted">Still needed: {p.missing.join(' · ')}</p>
        ) : (
          (p.verification === 'DRAFT' || p.verification === 'REJECTED') && (
            <Button loading={action.isPending} onClick={() => action.mutate({ kind: 'submit' })}>
              <LuSend aria-hidden /> Send for verification
            </Button>
          )
        )}
      </Card>

      <Segmented label="Profile steps" value={step} onChange={go} options={STEPS} />
      <FormError error={action.error} />
      {saved && (
        <div className="alert alert--ok" role="status">
          <LuCircleCheck aria-hidden /> <span>Saved</span>
        </div>
      )}

      <Card>
        {step === 'about' && <AboutStep p={p} busy={action.isPending} onSave={(b) => save(b, 'platforms')} />}
        {step === 'platforms' && <PlatformsStep p={p} busy={action.isPending} onSave={(b) => save(b, 'rates')} />}
        {step === 'rates' && <RatesStep p={p} busy={action.isPending} onSave={(b) => save(b, 'payout')} />}
        {step === 'payout' && <PayoutStep p={p} busy={action.isPending} onSave={(b) => save(b)} />}
      </Card>
    </div>
  );
}

function AboutStep({ p, busy, onSave }) {
  const [f, setF] = useState({ name: p.name, bio: p.bio, city: p.city, languages: p.languages.join(', '), niches: p.niches, consentToShare: p.consentToShare });
  const toggle = (n) => setF({ ...f, niches: f.niches.includes(n) ? f.niches.filter((x) => x !== n) : [...f.niches, n].slice(0, 4) });
  return (
    <form
      className="grid"
      style={{ gap: 16 }}
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...f, languages: f.languages.split(',').map((x) => x.trim()).filter(Boolean) });
      }}
    >
      <div className="grid grid--pair">
        <Input label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input label="City" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
      </div>
      <label className="field">
        <span className="field__label">Bio (what you post, who follows you)</span>
        <textarea className="field__input" rows={3} maxLength={500} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
      </label>
      <Input label="Languages you post in (comma separated)" value={f.languages} onChange={(e) => setF({ ...f, languages: e.target.value })} />
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field__label">Niches (up to 4)</legend>
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 6 }}>
          {NICHES.map((n) => (
            <button key={n} type="button" className={cx('chip', f.niches.includes(n) && 'chip--on')} aria-pressed={f.niches.includes(n)} onClick={() => toggle(n)}>
              {n}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="check">
        <input type="checkbox" checked={f.consentToShare} onChange={(e) => setF({ ...f, consentToShare: e.target.checked })} />
        <span className="small">Show my profile to brands (they never see my email, phone or full handle).</span>
      </label>
      <Button type="submit" loading={busy}>
        Save and continue
      </Button>
    </form>
  );
}

function PlatformsStep({ p, busy, onSave }) {
  const [rows, setRows] = useState(p.platforms.map((x) => ({ ...x, followers: String(x.followers), engagementRate: String(x.engagementRate) })));
  const set = (i, k, v) => setRows(rows.map((r, n) => (n === i ? { ...r, [k]: v } : r)));
  const free = PLATFORM_OPTIONS.filter((o) => !rows.some((r) => r.platform === o.value));
  return (
    <form
      className="grid"
      style={{ gap: 16 }}
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ platforms: rows.map((r) => ({ platform: r.platform, handle: r.handle, followers: Number(r.followers), engagementRate: Number(r.engagementRate) })) });
      }}
    >
      {p.verification === 'VERIFIED' && <p className="note small">Changing handles or numbers sends your profile back for a quick re-check; brands won't see it until then.</p>}
      {rows.map((r, i) => (
        <div key={r.platform} className="platform-row">
          <strong>{PLATFORM_LABEL[r.platform]}</strong>
          <Input label="Handle" value={r.handle} onChange={(e) => set(i, 'handle', e.target.value)} />
          <Input label="Followers" inputMode="numeric" value={r.followers} onChange={(e) => set(i, 'followers', e.target.value)} />
          <Input label="Engagement %" inputMode="decimal" value={r.engagementRate} onChange={(e) => set(i, 'engagementRate', e.target.value)} />
          <Button type="button" variant="ghost" icon aria-label={`Remove ${PLATFORM_LABEL[r.platform]}`} disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, n) => n !== i))}>
            <LuTrash2 />
          </Button>
        </div>
      ))}
      {free.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {free.map((o) => (
            <Button key={o.value} type="button" variant="secondary" size="sm" onClick={() => setRows([...rows, { platform: o.value, handle: '', followers: '', engagementRate: '' }])}>
              <LuPlus aria-hidden /> {o.label}
            </Button>
          ))}
        </div>
      )}
      <p className="small muted">Engagement = average likes + comments per post ÷ followers × 100. We check it against your insights.</p>
      <Button type="submit" loading={busy}>
        Save and continue
      </Button>
    </form>
  );
}

function RatesStep({ p, busy, onSave }) {
  const [f, setF] = useState({ reel: String(p.rates.reel || ''), story: String(p.rates.story || ''), post: String(p.rates.post || ''), availability: p.availability });
  return (
    <form
      className="grid"
      style={{ gap: 16 }}
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ rates: { reel: Number(f.reel), story: Number(f.story), post: Number(f.post) }, availability: f.availability });
      }}
    >
      <div className="grid grid--3">
        <Input label="Reel (₹)" inputMode="numeric" value={f.reel} onChange={(e) => setF({ ...f, reel: e.target.value })} />
        <Input label="Story (₹)" inputMode="numeric" value={f.story} onChange={(e) => setF({ ...f, story: e.target.value })} />
        <Input label="Post (₹)" inputMode="numeric" value={f.post} onChange={(e) => setF({ ...f, post: e.target.value })} />
      </div>
      <label className="field">
        <span className="field__label">Availability</span>
        <select className="field__input" value={f.availability} onChange={(e) => setF({ ...f, availability: e.target.value })}>
          <option value="AVAILABLE">Taking new work</option>
          <option value="BUSY">Busy (slower replies)</option>
          <option value="PAUSED">Paused (hidden from brands)</option>
        </select>
      </label>
      <p className="small muted">Your rates are never shown to brands as-is; Webinger quotes a package price that includes its fee.</p>
      <Button type="submit" loading={busy}>
        Save and continue
      </Button>
    </form>
  );
}

function PayoutStep({ p, busy, onSave }) {
  const [kind, setKind] = useState(p.payoutMethod?.kind ?? 'UPI');
  const [f, setF] = useState({ upi: '', account: '', ifsc: '', pan: '', insightsFile: p.insightsFile ?? '' });
  useEffect(() => setF((x) => ({ ...x, insightsFile: p.insightsFile ?? x.insightsFile })), [p.insightsFile]);
  return (
    <form
      className="grid"
      style={{ gap: 16 }}
      onSubmit={(e) => {
        e.preventDefault();
        const body = {};
        if (f.insightsFile && f.insightsFile !== p.insightsFile) body.insightsFile = f.insightsFile;
        if (kind === 'UPI' && f.upi) body.payout = { kind, upi: f.upi.trim() };
        if (kind === 'BANK' && f.account) body.payout = { kind, account: f.account.trim(), ifsc: f.ifsc.trim() };
        if (f.pan) body.pan = f.pan.trim();
        onSave(body);
      }}
    >
      <FilePick label="Audience insights screenshot (last 30 days)" accept=".png,.jpg,.jpeg,.pdf" value={f.insightsFile} onChange={(v) => setF({ ...f, insightsFile: v })} />
      <h3 className="section-title">Where we pay you</h3>
      {p.payoutMethod && <p className="small">On file: {p.payoutMethod.masked}. Enter new details only to change them.</p>}
      <Segmented
        label="Payout method"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'UPI', label: 'UPI' },
          { value: 'BANK', label: 'Bank account' },
        ]}
      />
      {kind === 'UPI' ? (
        <Input label="UPI ID" value={f.upi} onChange={(e) => setF({ ...f, upi: e.target.value })} placeholder="name@bank" autoComplete="off" />
      ) : (
        <div className="grid grid--pair">
          <Input label="Account number" inputMode="numeric" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })} autoComplete="off" />
          <Input label="IFSC" value={f.ifsc} onChange={(e) => setF({ ...f, ifsc: e.target.value })} autoComplete="off" />
        </div>
      )}
      <Input label={p.panMasked ? `PAN (on file: ${p.panMasked})` : 'PAN'} value={f.pan} onChange={(e) => setF({ ...f, pan: e.target.value })} autoComplete="off" />
      <p className="small muted">Stored encrypted and shown masked. TDS is deducted from payouts and appears in your Form 26AS.</p>
      <Button type="submit" loading={busy}>
        Save
      </Button>
    </form>
  );
}
