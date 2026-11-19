import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LuCircleCheck, LuPlus, LuTrophy, LuX } from 'react-icons/lu';
import { useAccountManagers, useLead, useLeadAction, usePipeline } from '@/api/queries';
import { useAuth } from '@/auth/AuthContext';
import { Badge, Button, Drawer, EmptyState, ErrorState, Input, PageHeader, PageSkeleton, SearchInput, Select, Stat, cx, dueLabel, formatDate, formatINR } from '@/components/ui';
import { timeAgo } from '@/components/status';
import { compactINR, percent } from '@/components/finance';
import { ACTIVITY_LABEL, LEAD_SERVICES, OPEN_STAGES, SOURCE_LABEL, SOURCE_OPTIONS, STAGES, STAGE_LABEL, StageBadge } from '@/components/people';
import { FormError } from './finance/forms';

const isoDay = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};
const money = (l) => `${compactINR(l.value)}${l.valueKind === 'MONTHLY' ? '/mo' : ''}`;

export function AdminPipeline() {
  const { user } = useAuth();
  const isSuper = user?.role === 'SUPER_ADMIN';
  const [params, setParams] = useSearchParams();
  const q = { q: params.get('q') ?? undefined, ownerId: params.get('ownerId') ?? undefined, source: params.get('source') ?? undefined };
  const leadId = params.get('lead');
  const adding = params.get('new') === '1';
  const [text, setText] = useState(q.q ?? '');
  const [over, setOver] = useState(null);
  const [notice, setNotice] = useState(null);
  const { data, error, isPending, isFetching, refetch } = usePipeline(q);
  const action = useLeadAction();

  const set = (k, v, replace = true) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (v) next.set(k, v);
        else next.delete(k);
        return next;
      },
      { replace },
    );
  const openLead = (id, extra) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('lead', id);
      next.delete('step');
      if (extra) next.set('step', extra);
      return next;
    });

  useEffect(() => {
    const id = setTimeout(() => (q.q ?? '') !== text.trim() && set('q', text.trim() || undefined), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  if (isPending) return <PageSkeleton />;
  if (error && !data) return <div className="page"><ErrorState message={error.message} onRetry={refetch} /></div>;
  const s = data.summary;

  /** Won and lost need more than a move: a reason, or the client-and-project form. */
  const move = (lead, stage) => {
    setNotice(null);
    if (stage === lead.stage) return;
    if (stage === 'WON') {
      if (isSuper) openLead(lead.id, 'won');
      else setNotice('Only a Super Admin can mark a deal as won, because it creates the client login. Move it to Negotiation and ask Rohan or Isha.');
      return;
    }
    if (stage === 'LOST') return openLead(lead.id, 'lost');
    action.mutate({ kind: 'update', id: lead.id, patch: { stage } }, { onError: (e) => setNotice(e.message) });
  };

  const filtered = q.q || q.ownerId || q.source;
  return (
    <div className="page">
      <PageHeader
        eyebrow={`${s.stages.filter((x) => OPEN_STAGES.includes(x.stage)).reduce((n, x) => n + x.count, 0)} open deals`}
        title="Sales pipeline"
        actions={
          <Button onClick={() => set('new', '1', false)}>
            <LuPlus aria-hidden /> Add lead
          </Button>
        }
      />
      <div className="grid grid--stats">
        <Stat label="Open pipeline" value={formatINR(s.openValue)} hint={`Weighted ${formatINR(s.weightedValue)}`} />
        <Stat label="Won this month" value={formatINR(s.wonThisMonth.value)} hint={`${s.wonThisMonth.count} deal${s.wonThisMonth.count === 1 ? '' : 's'}`} />
        <Stat label="Win rate" value={percent(s.winRate)} hint="Won ÷ closed, last 6 months" />
        <Stat label="Follow-ups due" value={s.followUpsDue} hint={`${s.unassigned} lead${s.unassigned === 1 ? '' : 's'} without an owner`} accent={s.followUpsDue > 0} />
      </div>

      <div className="toolbar">
        <SearchInput label="Search leads" value={text} onChange={setText} placeholder="Company, contact, city or service" />
        <Select
          label="Owner"
          hideLabel
          value={q.ownerId}
          onChange={(v) => set('ownerId', v)}
          allLabel="All owners"
          options={[...data.sellers.map((x) => ({ value: x.id, label: x.name })), { value: 'none', label: 'No owner yet' }]}
        />
        <Select label="Source" hideLabel value={q.source} onChange={(v) => set('source', v)} allLabel="All sources" options={SOURCE_OPTIONS} />
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => (setText(''), setParams({}, { replace: true }))}>
            <LuX aria-hidden /> Clear
          </Button>
        )}
      </div>

      {notice && (
        <div className="alert alert--error" role="alert">
          <span style={{ flex: 1 }}>{notice}</span>
          <Button variant="ghost" size="sm" icon aria-label="Dismiss" onClick={() => setNotice(null)}>
            <LuX />
          </Button>
        </div>
      )}

      <div className="board board--6" role="region" aria-label="Pipeline board" style={{ opacity: isFetching ? 0.75 : 1 }}>
        {STAGES.map((stage) => {
          const col = data.leads.filter((l) => l.stage === stage);
          const total = col.reduce((n, l) => n + l.value, 0);
          return (
            <section
              key={stage}
              className={cx('board__col', over === stage && 'is-over')}
              aria-label={`${STAGE_LABEL[stage]}, ${col.length} leads`}
              onDragOver={(e) => (e.preventDefault(), setOver(stage))}
              onDragLeave={() => setOver((x) => (x === stage ? null : x))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const l = data.leads.find((x) => x.id === e.dataTransfer.getData('text/lead-id'));
                if (l) move(l, stage);
              }}
            >
              <header className="board__head">
                <span>{STAGE_LABEL[stage]}</span>
                <span className="board__count">{col.length}</span>
              </header>
              <div className="small muted" style={{ padding: '0 4px 6px' }}>
                {compactINR(total)}
              </div>
              <div className="board__cards">
                {col.length === 0 && <div className="board__empty">{stage === 'WON' || stage === 'LOST' ? 'Last 90 days' : 'Drop leads here'}</div>}
                {col.map((l) => (
                  <article
                    key={l.id}
                    className={cx('board__card', l.followUpDue && 'board__card--due')}
                    draggable={l.stage !== 'WON'}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/lead-id', l.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                  >
                    <button type="button" className="board__open" onClick={() => openLead(l.id)}>
                      <span className="board__title">{l.company}</span>
                      <span className="list__meta">
                        {l.contactName}
                        {l.city ? ` · ${l.city}` : ''}
                      </span>
                    </button>
                    <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                      <strong className="small">{money(l)}</strong>
                      <span className="small muted">· {l.services.slice(0, 2).join(', ')}</span>
                    </div>
                    {l.stage === 'LOST' ? (
                      <span className="small muted">{l.lostReason}</span>
                    ) : l.stage === 'WON' ? (
                      l.clientId && (
                        <Link className="small" to={`/admin/clients/${l.clientId}`}>
                          Open client
                        </Link>
                      )
                    ) : (
                      <span className={cx('small', l.followUpDue ? 'text-danger' : 'muted')}>
                        {l.nextFollowUp ? `Follow up ${dueLabel(l.nextFollowUp).replace('Due ', '').replace(' overdue', ' late').toLowerCase()}` : 'No follow-up set'}
                      </span>
                    )}
                    <div className="row board__foot">
                      <span className="small muted lead-owner">{l.owner ? l.owner.name : <Badge tone="warn">No owner</Badge>}</span>
                      <span className="spacer" />
                      {l.stage !== 'WON' && (
                        <Select
                          label={`Move ${l.company}`}
                          hideLabel
                          value={l.stage}
                          options={STAGES.map((x) => ({ value: x, label: STAGE_LABEL[x] }))}
                          onChange={(v) => v && move(l, v)}
                          className="select--mini"
                        />
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <p className="list__meta">
        Follow-ups follow the day 1, 3 and 7 rhythm. A won deal creates the client (with their login invite) and the first project in one step; only a Super Admin can do it.
      </p>

      <Drawer
        open={!!leadId}
        onClose={() =>
          setParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete('lead');
            next.delete('step');
            return next;
          })
        }
        title="Lead"
      >
        {leadId && <LeadPanel key={leadId} id={leadId} step={params.get('step')} sellers={data.sellers} isSuper={isSuper} setStep={(v) => set('step', v)} />}
      </Drawer>
      <Drawer open={adding} onClose={() => set('new', undefined)} title="Add lead">
        {adding && <NewLeadForm sellers={data.sellers} defaultOwner={user?.id} onSaved={(l) => setParams({ lead: l.id })} />}
      </Drawer>
    </div>
  );
}

/* ------------------------------------------------------------- lead panel */

function LeadPanel({ id, step, sellers, isSuper, setStep }) {
  const { data: l, error, isPending, refetch } = useLead(id);
  const action = useLeadAction();
  const [activity, setActivity] = useState({ kind: 'CALL', text: '', nextFollowUp: '' });
  const [lostReason, setLostReason] = useState('');

  if (isPending) return <div className="skeleton" style={{ height: 420 }} />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  const open = OPEN_STAGES.includes(l.stage);
  const patch = (p) => action.mutate({ kind: 'update', id: l.id, patch: p });

  if (step === 'won' && open && isSuper) return <ConvertForm lead={l} onDone={() => setStep(undefined)} />;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div>
        <h3 className="lead-title">{l.company}</h3>
        <div className="small muted">
          {l.contactName} · {l.email}
          {l.phone ? ` · ${l.phone}` : ''}
        </div>
        <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
          <StageBadge stage={l.stage} />
          <Badge>{SOURCE_LABEL[l.source]}</Badge>
          <span className="small">
            <strong>{formatINR(l.value)}</strong>
            {l.valueKind === 'MONTHLY' ? ' a month' : ' one-off'}
          </span>
        </div>
      </div>
      <FormError error={action.error} />

      {l.stage === 'WON' && (
        <div className="alert alert--ok">
          <LuCircleCheck aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Won. <Link to={`/admin/clients/${l.clientId}`}>Open the client</Link>
            {l.projectId && (
              <>
                {' '}
                or <Link to={`/admin/projects/${l.projectId}`}>the first project</Link>
              </>
            )}
            .
          </span>
        </div>
      )}
      {l.stage === 'LOST' && <div className="alert alert--warn">Lost: {l.lostReason}</div>}

      {step === 'lost' && open ? (
        <form
          className="grid card-form"
          style={{ gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            action.mutate({ kind: 'update', id: l.id, patch: { stage: 'LOST', lostReason } }, { onSuccess: () => setStep(undefined) });
          }}
        >
          <label className="field">
            <span className="field__label">Why was it lost?</span>
            <input className="field__input" value={lostReason} autoFocus placeholder="Price, timing, chose another agency, no reply…" onChange={(e) => setLostReason(e.target.value)} />
          </label>
          <div className="row">
            <Button type="submit" size="sm" variant="secondary" loading={action.isPending} disabled={lostReason.trim().length < 3}>
              Mark as lost
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setStep(undefined)}>
              Back
            </Button>
          </div>
        </form>
      ) : (
        l.stage !== 'WON' && (
          <div className="grid grid--pair">
            <label className="field">
              <span className="field__label">Stage</span>
              <select
                className="field__input"
                value={l.stage}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'LOST') setStep('lost');
                  else patch({ stage: v });
                }}
              >
                {STAGES.filter((s) => s !== 'WON').map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Owner</span>
              <select className="field__input" value={l.owner?.id ?? ''} onChange={(e) => patch({ ownerId: e.target.value })}>
                <option value="">No owner</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {open && (
              <Input
                label="Next follow-up"
                type="date"
                min={isoDay(0)}
                value={l.nextFollowUp ?? ''}
                onChange={(e) => patch({ nextFollowUp: e.target.value })}
                error={l.followUpDue ? 'Due now' : undefined}
              />
            )}
          </div>
        )
      )}

      {open && step !== 'lost' && (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {isSuper ? (
            <Button onClick={() => setStep('won')}>
              <LuTrophy aria-hidden /> Mark as won
            </Button>
          ) : (
            <span className="small muted">A Super Admin marks deals as won (it creates the client login).</span>
          )}
        </div>
      )}

      {l.notes && <p className="note small">{l.notes}</p>}

      {l.stage !== 'WON' && (
        <form
          className="grid card-form"
          style={{ gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            action.mutate(
              { kind: 'activity', id: l.id, body: { kind: activity.kind, text: activity.text, nextFollowUp: activity.nextFollowUp || undefined } },
              { onSuccess: () => setActivity({ kind: activity.kind, text: '', nextFollowUp: '' }) },
            );
          }}
        >
          <h3 className="section-title">Log activity</h3>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {['CALL', 'EMAIL', 'MEETING', 'NOTE'].map((k) => (
              <button key={k} type="button" className={cx('chip', activity.kind === k && 'chip--on')} aria-pressed={activity.kind === k} onClick={() => setActivity({ ...activity, kind: k })}>
                {ACTIVITY_LABEL[k]}
              </button>
            ))}
          </div>
          <textarea className="field__input" rows={2} aria-label="What happened" placeholder="What happened, what was agreed" value={activity.text} onChange={(e) => setActivity({ ...activity, text: e.target.value })} />
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <label className="row small">
              Next follow-up
              <input type="date" className="field__input" style={{ width: 'auto' }} min={isoDay(0)} value={activity.nextFollowUp} onChange={(e) => setActivity({ ...activity, nextFollowUp: e.target.value })} />
            </label>
            <Button type="submit" size="sm" loading={action.isPending} disabled={activity.text.trim().length < 2}>
              Save
            </Button>
          </div>
        </form>
      )}

      <section>
        <h3 className="section-title">History</h3>
        <ul className="list">
          {l.activities.map((a) => (
            <li key={a.id} className="list__item">
              <div className="list__main">
                <div className="list__title small">{a.text}</div>
                <div className="list__meta">
                  {ACTIVITY_LABEL[a.kind]} · {a.actor} · {timeAgo(a.at)}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <p className="list__meta">Added {formatDate(l.createdAt.slice(0, 10))}</p>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------- convert form */

function ConvertForm({ lead, onDone }) {
  const staff = useAccountManagers();
  const action = useLeadAction();
  const [f, setF] = useState({
    legalName: lead.company,
    industry: '',
    city: lead.city ?? '',
    gstin: '',
    accountManagerId: 'u-mgr',
    ownerTitle: '',
    projectName: `${lead.services[0]} for ${lead.company}`,
    service: lead.services[0],
    projectOwnerId: 'u-mgr',
    budgetHours: '60',
    startDate: isoDay(3),
  });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  if (staff.isPending) return <div className="skeleton" style={{ height: 420 }} />;
  if (staff.error) return <ErrorState message={staff.error.message} onRetry={staff.refetch} />;

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    if (!f.industry.trim()) next.industry = 'Enter the industry.';
    if (!f.city.trim()) next.city = 'Enter the city.';
    if (f.projectName.trim().length < 3) next.projectName = 'Name the first project.';
    if (!(Number(f.budgetHours) >= 1)) next.budgetHours = 'Hours budgeted for the project.';
    setErrors(next);
    if (Object.keys(next).length) return;
    action.mutate(
      {
        kind: 'convert',
        id: lead.id,
        body: {
          legalName: f.legalName.trim(),
          industry: f.industry.trim(),
          city: f.city.trim(),
          gstin: f.gstin.trim().toUpperCase() || undefined,
          accountManagerId: f.accountManagerId,
          ownerTitle: f.ownerTitle.trim() || undefined,
          project: { name: f.projectName.trim(), service: f.service, ownerId: f.projectOwnerId, budgetHours: Number(f.budgetHours), startDate: f.startDate },
        },
      },
      { onSuccess: onDone },
    );
  };
  const people = staff.data;
  return (
    <form onSubmit={submit} noValidate className="grid" style={{ gap: 16 }}>
      <p className="small">
        Marking <strong>{lead.company}</strong> as won creates the client, invites <strong>{lead.contactName}</strong> ({lead.email}) as Client Owner and starts the first
        project.
      </p>
      <FormError error={action.error} />
      <h3 className="section-title">Client</h3>
      <Input label="Legal name (for invoices)" value={f.legalName} onChange={set('legalName')} />
      <div className="grid grid--pair">
        <Input label="Industry" value={f.industry} onChange={set('industry')} error={errors.industry} />
        <Input label="City" value={f.city} onChange={set('city')} error={errors.city} />
      </div>
      <div className="grid grid--pair">
        <Input label="GSTIN (optional)" value={f.gstin} onChange={set('gstin')} />
        <Input label={`${lead.contactName}'s job title`} value={f.ownerTitle} onChange={set('ownerTitle')} />
      </div>
      <label className="field">
        <span className="field__label">Account manager</span>
        <select className="field__input" value={f.accountManagerId} onChange={set('accountManagerId')}>
          {people.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <h3 className="section-title">First project</h3>
      <Input label="Project name" value={f.projectName} onChange={set('projectName')} error={errors.projectName} />
      <div className="grid grid--pair">
        <label className="field">
          <span className="field__label">Service</span>
          <select className="field__input" value={f.service} onChange={set('service')}>
            {LEAD_SERVICES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Project owner</span>
          <select className="field__input" value={f.projectOwnerId} onChange={set('projectOwnerId')}>
            {people.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid--pair">
        <Input label="Budget hours" inputMode="numeric" value={f.budgetHours} onChange={set('budgetHours')} error={errors.budgetHours} />
        <Input label="Start date" type="date" value={f.startDate} onChange={set('startDate')} />
      </div>
      <div className="row">
        <Button type="submit" loading={action.isPending}>
          <LuTrophy aria-hidden /> Create client and project
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Back
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------- new lead */

function NewLeadForm({ sellers, defaultOwner, onSaved }) {
  const action = useLeadAction();
  const [f, setF] = useState({
    company: '',
    contactName: '',
    email: '',
    phone: '',
    city: '',
    source: 'REFERRAL',
    services: [],
    value: '',
    valueKind: 'MONTHLY',
    ownerId: sellers.some((s) => s.id === defaultOwner) ? defaultOwner : '',
    notes: '',
  });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggle = (s) => setF({ ...f, services: f.services.includes(s) ? f.services.filter((x) => x !== s) : [...f.services, s] });

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    if (f.company.trim().length < 2) next.company = 'Enter the company name.';
    if (f.contactName.trim().length < 2) next.contactName = 'Who is the contact?';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) next.email = 'Enter a valid email address.';
    if (!f.services.length) next.services = 'Choose at least one service.';
    if (!(Number(f.value) >= 0) || f.value === '') next.value = 'Your best estimate, before GST.';
    setErrors(next);
    if (Object.keys(next).length) return;
    action.mutate(
      {
        kind: 'create',
        body: {
          company: f.company.trim(),
          contactName: f.contactName.trim(),
          email: f.email.trim(),
          phone: f.phone.trim() || undefined,
          city: f.city.trim() || undefined,
          source: f.source,
          services: f.services,
          value: Number(f.value),
          valueKind: f.valueKind,
          ownerId: f.ownerId || undefined,
          notes: f.notes.trim() || undefined,
        },
      },
      { onSuccess: onSaved },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="grid" style={{ gap: 16 }}>
      <FormError error={action.error} />
      <Input label="Company" value={f.company} onChange={set('company')} error={errors.company} />
      <div className="grid grid--pair">
        <Input label="Contact person" value={f.contactName} onChange={set('contactName')} error={errors.contactName} />
        <Input label="City" value={f.city} onChange={set('city')} />
      </div>
      <div className="grid grid--pair">
        <Input label="Email" type="email" inputMode="email" value={f.email} onChange={set('email')} error={errors.email} />
        <Input label="Phone (optional)" inputMode="tel" value={f.phone} onChange={set('phone')} />
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field__label">Services they want</legend>
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 6 }}>
          {LEAD_SERVICES.map((s) => (
            <button key={s} type="button" className={cx('chip', f.services.includes(s) && 'chip--on')} aria-pressed={f.services.includes(s)} onClick={() => toggle(s)}>
              {s}
            </button>
          ))}
        </div>
        {errors.services && <span className="field__error">{errors.services}</span>}
      </fieldset>
      <div className="grid grid--pair">
        <Input label="Estimated value (₹, before GST)" inputMode="numeric" value={f.value} onChange={set('value')} error={errors.value} />
        <label className="field">
          <span className="field__label">Billing</span>
          <select className="field__input" value={f.valueKind} onChange={set('valueKind')}>
            <option value="MONTHLY">Monthly retainer</option>
            <option value="ONE_OFF">One-off project</option>
          </select>
        </label>
      </div>
      <div className="grid grid--pair">
        <label className="field">
          <span className="field__label">Source</span>
          <select className="field__input" value={f.source} onChange={set('source')}>
            {SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Owner</span>
          <select className="field__input" value={f.ownerId} onChange={set('ownerId')}>
            <option value="">No owner yet</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field__label">Notes (optional)</span>
        <textarea className="field__input" rows={2} value={f.notes} onChange={set('notes')} />
      </label>
      <Button type="submit" loading={action.isPending}>
        Add lead
      </Button>
    </form>
  );
}
