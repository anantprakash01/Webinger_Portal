import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LuCircleCheck, LuShieldAlert } from 'react-icons/lu';
import { useMyOnboarding, useOnboardingAction } from '@/api/queries';
import { Button, Card, ErrorState, Input, PageHeader, PageSkeleton, formatDateLong } from '@/components/ui';
import { AccessBadge, OnboardingProgress, QUESTIONS } from '@/components/onboarding';
import { FormError } from '@/pages/admin/finance/forms';

const isoDay = (n = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Next office day from tomorrow (Mon–Sat, per Settings); the server also skips holidays. */
const nextWorkday = () => {
  const d = new Date();
  do d.setDate(d.getDate() + 1);
  while (d.getDay() === 0);
  return d.toISOString().slice(0, 10);
};

/** Getting started: brand questionnaire, access handover (never passwords), brand files, kick-off call. */
export function ClientOnboarding() {
  const { data: o, error, isPending, refetch } = useMyOnboarding();
  const action = useOnboardingAction();
  if (isPending) return <PageSkeleton />;
  if (error) return <div className="page"><ErrorState message={error.message} onRetry={refetch} /></div>;
  return (
    <div className="page">
      <PageHeader eyebrow="Four steps so your team can start" title="Getting started" />
      {o.progress === 100 && (
        <div className="alert alert--ok" role="status">
          <LuCircleCheck aria-hidden style={{ flexShrink: 0, marginTop: 2 }} /> <span>All set. Thank you!</span>
        </div>
      )}
      <Card>
        <OnboardingProgress o={o} />
      </Card>
      <FormError error={action.error} />
      <Questionnaire key={JSON.stringify(o.questionnaire)} o={o} action={action} />
      <Card title="2. Access for your accounts">
        <p className="note small note--warn">
          <LuShieldAlert aria-hidden />
          <span>Never send us a password. Add Webinger as a partner or user from your own account, then note the account ID here.</span>
        </p>
        <ul className="list">
          {o.access.map((a) => (
            <AccessRow key={a.platform + a.status} a={a} action={action} />
          ))}
        </ul>
      </Card>
      <Card title="3. Brand files">
        {o.brandAssetsUploaded ? (
          <p className="small">Your logo and brand files are in the vault.</p>
        ) : (
          <p className="small">
            Share your logo, fonts and brand guide with your account manager in <Link to="/client/messages">Messages</Link>. They will add them to your{' '}
            <Link to="/client/files">brand vault</Link>.
          </p>
        )}
      </Card>
      <Kickoff o={o} action={action} />
    </div>
  );
}

function Questionnaire({ o, action }) {
  const [f, setF] = useState(o.questionnaire);
  const [saved, setSaved] = useState(false);
  return (
    <Card title="1. About your brand">
      <form
        className="grid"
        style={{ gap: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          action.mutate({ kind: 'update', patch: { questionnaire: f } }, { onSuccess: () => (setSaved(true), setTimeout(() => setSaved(false), 2500)) });
        }}
      >
        {QUESTIONS.map(([k, label]) => (
          <label key={k} className="field">
            <span className="field__label">{label}</span>
            <textarea className="field__input" rows={2} maxLength={1000} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </label>
        ))}
        <div className="row">
          <Button type="submit" loading={action.isPending}>
            Save answers
          </Button>
          {saved && <span className="small" role="status">Saved</span>}
        </div>
      </form>
    </Card>
  );
}

function AccessRow({ a, action }) {
  const [ref, setRef] = useState(a.accountRef ?? '');
  const [open, setOpen] = useState(false);
  return (
    <li className="list__item list__item--wrap">
      <div className="list__main">
        <div className="list__title small">{a.label}</div>
        <div className="list__meta">{a.how}</div>
        {a.accountRef && <div className="list__meta">Account: {a.accountRef}</div>}
      </div>
      <AccessBadge status={a.status} />
      {a.status !== 'VERIFIED' &&
        (open ? (
          <form
            className="row"
            style={{ flexWrap: 'wrap' }}
            onSubmit={(e) => {
              e.preventDefault();
              action.mutate({ kind: 'update', patch: { access: { platform: a.platform, status: 'GRANTED', accountRef: ref } } });
            }}
          >
            <Input label="Account ID (not a password)" value={ref} onChange={(e) => setRef(e.target.value)} />
            <Button type="submit" size="sm" loading={action.isPending}>
              Mark as granted
            </Button>
          </form>
        ) : (
          <div className="row">
            <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
              I've given access
            </Button>
            {a.status !== 'NOT_NEEDED' && (
              <Button size="sm" variant="ghost" onClick={() => action.mutate({ kind: 'update', patch: { access: { platform: a.platform, status: 'NOT_NEEDED' } } })}>
                Not needed
              </Button>
            )}
          </div>
        ))}
    </li>
  );
}

function Kickoff({ o, action }) {
  const [f, setF] = useState({ date: nextWorkday(), time: '11:00' });
  return (
    <Card title="4. Kick-off call">
      {o.kickoff ? (
        <p className="small">
          Booked for {formatDateLong(o.kickoff.date)} at {o.kickoff.time} by {o.kickoff.bookedBy}.
        </p>
      ) : (
        <form
          className="grid"
          style={{ gap: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            action.mutate({ kind: 'update', patch: { kickoff: f } });
          }}
        >
          <div className="grid grid--pair">
            <Input label="Date" type="date" min={isoDay(1)} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            <label className="field">
              <span className="field__label">Time (IST)</span>
              <select className="field__input" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })}>
                {['10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <Button type="submit" loading={action.isPending}>
            Book the call
          </Button>
        </form>
      )}
    </Card>
  );
}
