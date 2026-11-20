import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LuDownload, LuPlus } from 'react-icons/lu';
import { useAdminBriefs, useAdminPartnerInvoices, useClients, usePrAction, usePrHub, useProjects } from '@/api/queries';
import { useAuth } from '@/auth/AuthContext';
import { Badge, Button, Card, Drawer, EmptyState, ErrorState, Input, PageHeader, PageSkeleton, Segmented, Stat, cx, dueLabel, formatDate, formatINR } from '@/components/ui';
import { BriefBadge, PITCH_STATUS_OPTIONS, PartnerInvoiceBadge, PitchBadge, followersShort } from '@/components/creators';
import { downloadText } from '@/components/finance';
import { FormError } from './finance/forms';

const TABS = [
  { value: 'contacts', label: 'Media contacts' },
  { value: 'pitches', label: 'Pitches' },
  { value: 'coverage', label: 'Coverage' },
  { value: 'vendors', label: 'Vendors and briefs' },
];
const isoDay = (n = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Internal PR and data hub (CLAUDE.md 4.4). */
export function AdminPr() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'contacts';
  const adding = params.get('new');
  const { data, error, isPending, refetch } = usePrHub();
  const action = usePrAction();
  if (isPending) return <PageSkeleton />;
  if (error) return <div className="page"><ErrorState message={error.message} onRetry={refetch} /></div>;
  const open = (kind) => setParams({ ...(tab !== 'contacts' ? { tab } : {}), new: kind });
  const close = () => setParams(tab !== 'contacts' ? { tab } : {});

  return (
    <div className="page">
      <PageHeader
        eyebrow="Media contacts, pitches, coverage and vendors"
        title="PR hub"
        actions={
          <>
            {tab === 'contacts' && user?.role === 'SUPER_ADMIN' && (
              <Button variant="secondary" loading={action.isPending} onClick={() => action.mutate({ kind: 'export' }, { onSuccess: (f) => downloadText(f.fileName, f.content) })}>
                <LuDownload aria-hidden /> Export
              </Button>
            )}
            {tab === 'contacts' && (
              <Button onClick={() => open('contact')}>
                <LuPlus aria-hidden /> Add contact
              </Button>
            )}
            {tab === 'pitches' && (
              <Button onClick={() => open('pitch')}>
                <LuPlus aria-hidden /> New pitch
              </Button>
            )}
            {tab === 'coverage' && (
              <Button onClick={() => open('coverage')}>
                <LuPlus aria-hidden /> Log coverage
              </Button>
            )}
            {tab === 'vendors' && (
              <Button onClick={() => open('brief')}>
                <LuPlus aria-hidden /> Share a brief
              </Button>
            )}
          </>
        }
      />
      <Segmented label="PR hub sections" value={tab} onChange={(v) => setParams(v === 'contacts' ? {} : { tab: v })} options={TABS} />
      <FormError error={action.error} />

      {tab === 'contacts' && (
        <Card flush>
          <div className="card__body">
            <table className="table table--rows">
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Beat</th>
                  <th>Last contacted</th>
                  <th>Checks</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.contacts.map((c) => (
                  <tr key={c.id} className={cx(c.doNotContact && 'is-muted')}>
                    <td data-label="Contact" className="td--title">
                      {c.name}
                      <div className="list__meta">
                        {c.outlet} · {c.city} · {c.language}
                      </div>
                      <div className="list__meta">{c.email}</div>
                    </td>
                    <td data-label="Beat">{c.beat}</td>
                    <td data-label="Last contacted">
                      {c.lastContacted ? formatDate(c.lastContacted) : '—'}
                      <div className="list__meta">Owner {c.ownerName}</div>
                    </td>
                    <td data-label="Checks">
                      <div className="badge-row">
                        {c.doNotContact && <Badge tone="danger">Do not contact</Badge>}
                        {!c.consent && <Badge tone="warn">No consent</Badge>}
                        {c.stale && <Badge tone="warn">Verify (6 months)</Badge>}
                        {!c.doNotContact && c.consent && !c.stale && <Badge tone="ok">OK</Badge>}
                      </div>
                    </td>
                    <td data-label="">
                      {c.stale && !c.doNotContact && (
                        <Button size="sm" variant="secondary" onClick={() => action.mutate({ kind: 'updateContact', id: c.id, patch: { verified: true } })}>
                          Mark verified
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {tab === 'contacts' && <p className="list__meta">Every contact has an owner and a last-verified date; after six months it must be re-checked before pitching. Consent is recorded per contact (DPDP Act). Export is Super Admin only and logged.</p>}

      {tab === 'pitches' && (
        <Card flush>
          <div className="card__body">
            {data.pitches.length === 0 ? (
              <EmptyState title="No pitches" />
            ) : (
              <table className="table table--rows">
                <thead>
                  <tr>
                    <th>Story</th>
                    <th>Sent to</th>
                    <th>Follow up</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pitches.map((p) => (
                    <tr key={p.id}>
                      <td data-label="Story" className="td--title">
                        {p.title}
                        <div className="list__meta">
                          {p.clientName} · {p.ownerName}
                        </div>
                      </td>
                      <td data-label="Sent to">{p.recipients.map((r) => `${r.name} (${r.outlet})`).join(', ')}</td>
                      <td data-label="Follow up">{p.followUp && (p.status === 'SENT' || p.status === 'FOLLOW_UP') ? dueLabel(p.followUp) : '—'}</td>
                      <td data-label="Status">
                        <select
                          className="field__input select--inline"
                          aria-label={`Status of ${p.title}`}
                          value={p.status}
                          onChange={(e) => action.mutate({ kind: 'pitchStatus', id: p.id, status: e.target.value })}
                        >
                          {PITCH_STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      )}

      {tab === 'coverage' && (
        <>
          <div className="grid grid--stats">
            <Stat label="Articles" value={data.coverage.length} hint="All clients" />
            <Stat label="Combined reach" value={followersShort(data.coverage.reduce((n, c) => n + c.reach, 0))} hint="Outlet estimates" />
          </div>
          <Card>
            <ul className="list">
              {data.coverage.map((c) => (
                <li key={c.id} className="list__item">
                  <div className="list__main">
                    <a className="list__title" href={c.url} target="_blank" rel="noreferrer">
                      {c.headline}
                    </a>
                    <div className="list__meta">
                      {c.outlet} · {c.clientName} · {formatDate(c.date)} · reach {followersShort(c.reach)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {tab === 'vendors' && <VendorsTab vendors={data.vendors} />}

      <Drawer open={!!adding} onClose={close} title={{ contact: 'Add media contact', pitch: 'New pitch', coverage: 'Log coverage', brief: 'Share a brief with a partner' }[adding] ?? ''}>
        {adding === 'contact' && <ContactForm onDone={close} />}
        {adding === 'pitch' && <PitchForm contacts={data.contacts} onDone={close} />}
        {adding === 'coverage' && <CoverageForm pitches={data.pitches} onDone={close} />}
        {adding === 'brief' && <BriefForm onDone={close} />}
      </Drawer>
    </div>
  );
}

function VendorsTab({ vendors }) {
  const { user } = useAuth();
  const briefs = useAdminBriefs();
  const invoices = useAdminPartnerInvoices();
  const action = usePrAction();
  const [ref, setRef] = useState({});
  const [fb, setFb] = useState({});
  const isSuper = user?.role === 'SUPER_ADMIN';
  return (
    <>
      <Card title="Vendors and freelancers" flush>
        <div className="card__body">
          <table className="table table--rows">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Rates</th>
                <th className="num">Rating</th>
                <th>Documents</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id}>
                  <td data-label="Vendor" className="td--title">
                    {v.name}
                    <div className="list__meta">
                      {v.service} · {v.city}
                      {v.hasLogin ? ' · portal login' : ''}
                    </div>
                  </td>
                  <td data-label="Rates">{v.rateNote}</td>
                  <td data-label="Rating" className="num">
                    {v.rating ?? '—'}
                    <div className="list__meta">{v.jobsDone} jobs</div>
                  </td>
                  <td data-label="Documents">{v.documents.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <FormError error={action.error} />
      <Card title="Briefs shared with partners">
        {briefs.isPending ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : (
          <ul className="list">
            {(briefs.data ?? []).map((b) => (
              <li key={b.id} className="list__item list__item--wrap">
                <div className="list__main">
                  <div className="list__title small">
                    {b.title} · {b.partnerName}
                  </div>
                  <div className="list__meta">
                    {b.clientName} · {b.projectName} · {formatINR(b.fee)} · {dueLabel(b.due)}
                    {b.submissions[0] ? ` · submitted ${b.submissions[0].files.join(', ')}` : ''}
                  </div>
                </div>
                <BriefBadge status={b.status} />
                {b.status === 'SUBMITTED' && (
                  <div className="row" style={{ flexWrap: 'wrap' }}>
                    <input className="field__input" style={{ width: 200 }} aria-label={`Feedback on ${b.title}`} placeholder="Feedback" value={fb[b.id] ?? ''} onChange={(e) => setFb({ ...fb, [b.id]: e.target.value })} />
                    <Button size="sm" onClick={() => action.mutate({ kind: 'reviewBrief', id: b.id, decision: 'APPROVE', feedback: fb[b.id] })}>
                      Approve
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => action.mutate({ kind: 'reviewBrief', id: b.id, decision: 'CHANGES', feedback: fb[b.id] })}>
                      Changes
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Partner invoices">
        {invoices.isPending ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : !invoices.data?.length ? (
          <EmptyState title="No partner invoices" />
        ) : (
          <ul className="list">
            {invoices.data.map((i) => (
              <li key={i.id} className="list__item list__item--wrap">
                <div className="list__main">
                  <div className="list__title small">
                    {i.number} · {i.partnerName} · {formatINR(i.total)}
                  </div>
                  <div className="list__meta">
                    {i.briefTitle} · {formatINR(i.amount)} + GST {formatINR(i.gst)}
                  </div>
                </div>
                <PartnerInvoiceBadge status={i.status} />
                {isSuper && i.status === 'SUBMITTED' && (
                  <div className="row">
                    <Button size="sm" onClick={() => action.mutate({ kind: 'invoice', id: i.id, decision: 'APPROVE' })}>
                      Approve
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => action.mutate({ kind: 'invoice', id: i.id, decision: 'REJECT', note: 'Please re-issue with our GSTIN.' })}>
                      Reject
                    </Button>
                  </div>
                )}
                {isSuper && i.status === 'APPROVED' && (
                  <div className="row">
                    <input className="field__input" style={{ width: 130 }} aria-label={`Payment reference for ${i.number}`} placeholder="UTR" value={ref[i.id] ?? ''} onChange={(e) => setRef({ ...ref, [i.id]: e.target.value })} />
                    <Button size="sm" onClick={() => action.mutate({ kind: 'invoice', id: i.id, decision: 'PAID', note: ref[i.id] })}>
                      Mark paid
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="list__meta" style={{ marginTop: 8 }}>
          Super Admins approve and pay partner invoices; a paid invoice is added to Finance → Expenses on the brief's project.
        </p>
      </Card>
    </>
  );
}

function ContactForm({ onDone }) {
  const action = usePrAction();
  const [f, setF] = useState({ name: '', outlet: '', beat: '', city: '', language: 'English', email: '', phone: '', consent: true });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="grid" style={{ gap: 14 }} noValidate onSubmit={(e) => (e.preventDefault(), action.mutate({ kind: 'contact', body: f }, { onSuccess: onDone }))}>
      <FormError error={action.error} />
      <div className="grid grid--pair">
        <Input label="Name" value={f.name} onChange={set('name')} />
        <Input label="Outlet" value={f.outlet} onChange={set('outlet')} />
      </div>
      <div className="grid grid--3">
        <Input label="Beat" value={f.beat} onChange={set('beat')} />
        <Input label="City" value={f.city} onChange={set('city')} />
        <Input label="Language" value={f.language} onChange={set('language')} />
      </div>
      <div className="grid grid--pair">
        <Input label="Email" type="email" value={f.email} onChange={set('email')} />
        <Input label="Phone (optional)" value={f.phone} onChange={set('phone')} />
      </div>
      <label className="check">
        <input type="checkbox" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
        <span className="small">They agreed to receive press releases from Webinger.</span>
      </label>
      <Button type="submit" loading={action.isPending}>
        Add contact
      </Button>
    </form>
  );
}

function PitchForm({ contacts, onDone }) {
  const clients = useClients({});
  const action = usePrAction();
  const [f, setF] = useState({ title: '', clientId: '', recipientIds: [] });
  const usable = contacts.filter((c) => !c.doNotContact);
  const toggle = (id) => setF({ ...f, recipientIds: f.recipientIds.includes(id) ? f.recipientIds.filter((x) => x !== id) : [...f.recipientIds, id] });
  return (
    <form className="grid" style={{ gap: 14 }} noValidate onSubmit={(e) => (e.preventDefault(), action.mutate({ kind: 'pitch', body: f }, { onSuccess: onDone }))}>
      <FormError error={action.error} />
      <Input label="Story headline" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <label className="field">
        <span className="field__label">Client</span>
        <select className="field__input" value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}>
          <option value="">Choose a client</option>
          {(clients.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field__label">Journalists</legend>
        {usable.map((c) => (
          <label key={c.id} className="check">
            <input type="checkbox" checked={f.recipientIds.includes(c.id)} onChange={() => toggle(c.id)} />
            <span className="small">
              {c.name} · {c.outlet} · {c.beat}
              {c.stale ? ' · needs re-verifying' : ''}
              {!c.consent ? ' · no consent' : ''}
            </span>
          </label>
        ))}
      </fieldset>
      <Button type="submit" loading={action.isPending}>
        Save draft pitch
      </Button>
    </form>
  );
}

function CoverageForm({ pitches, onDone }) {
  const clients = useClients({});
  const action = usePrAction();
  const [f, setF] = useState({ clientId: '', outlet: '', headline: '', url: '', date: isoDay(0), reach: '', pitchId: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="grid"
      style={{ gap: 14 }}
      noValidate
      onSubmit={(e) => (e.preventDefault(), action.mutate({ kind: 'coverage', body: { ...f, reach: Number(f.reach), pitchId: f.pitchId || undefined } }, { onSuccess: onDone }))}
    >
      <FormError error={action.error} />
      <label className="field">
        <span className="field__label">Client</span>
        <select className="field__input" value={f.clientId} onChange={set('clientId')}>
          <option value="">Choose a client</option>
          {(clients.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <Input label="Outlet" value={f.outlet} onChange={set('outlet')} />
      <Input label="Headline" value={f.headline} onChange={set('headline')} />
      <Input label="Link" inputMode="url" value={f.url} onChange={set('url')} placeholder="https://" />
      <div className="grid grid--pair">
        <Input label="Published" type="date" max={isoDay(0)} value={f.date} onChange={set('date')} />
        <Input label="Estimated reach" inputMode="numeric" value={f.reach} onChange={set('reach')} />
      </div>
      <label className="field">
        <span className="field__label">From pitch (optional)</span>
        <select className="field__input" value={f.pitchId} onChange={set('pitchId')}>
          <option value="">None</option>
          {pitches
            .filter((p) => p.clientId === f.clientId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
        </select>
      </label>
      <Button type="submit" loading={action.isPending}>
        Log coverage
      </Button>
    </form>
  );
}

function BriefForm({ onDone }) {
  const projects = useProjects({ size: 100 });
  const action = usePrAction();
  const [f, setF] = useState({ partnerId: 'org-vendor-lensworks', projectId: '', title: '', description: '', due: isoDay(10), fee: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="grid" style={{ gap: 14 }} noValidate onSubmit={(e) => (e.preventDefault(), action.mutate({ kind: 'brief', body: { ...f, fee: Number(f.fee) } }, { onSuccess: onDone }))}>
      <FormError error={action.error} />
      <label className="field">
        <span className="field__label">Partner</span>
        <select className="field__input" value={f.partnerId} onChange={set('partnerId')}>
          <option value="org-vendor-lensworks">Lensworks Studio</option>
        </select>
      </label>
      <label className="field">
        <span className="field__label">Project</span>
        <select className="field__input" value={f.projectId} onChange={set('projectId')}>
          <option value="">Choose a project</option>
          {(projects.data?.items ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.clientName}: {p.name}
            </option>
          ))}
        </select>
      </label>
      <Input label="Title" value={f.title} onChange={set('title')} />
      <label className="field">
        <span className="field__label">What they need to do</span>
        <textarea className="field__input" rows={3} value={f.description} onChange={set('description')} />
      </label>
      <div className="grid grid--pair">
        <Input label="Due" type="date" value={f.due} onChange={set('due')} />
        <Input label="Agreed fee (₹, before GST)" inputMode="numeric" value={f.fee} onChange={set('fee')} />
      </div>
      <p className="small muted">The partner sees the client and project name, this brief, the due date and the fee. Nothing else from the project.</p>
      <Button type="submit" loading={action.isPending}>
        Share brief
      </Button>
    </form>
  );
}
