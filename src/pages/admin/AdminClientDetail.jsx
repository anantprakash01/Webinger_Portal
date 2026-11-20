import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { LuArrowLeft, LuCircleAlert, LuCircleCheck, LuPencil, LuTriangleAlert, LuX } from 'react-icons/lu';
import { useAccountManagers, useClient, useClientMutation, useClientOnboarding, useOnboardingAction } from '@/api/queries';
import { AccessBadge, OnboardingProgress } from '@/components/onboarding';
import { useAuth } from '@/auth/AuthContext';
import { DemoEmail } from '@/components/auth';
import { Avatar, Badge, Button, Card, Drawer, EmptyState, ErrorState, Input, PageHeader, PageSkeleton, Progress, dueLabel, formatDateLong, formatINR } from '@/components/ui';
import { AccountStatusBadge, CLIENT_STATUS_OPTIONS, ClientStatusBadge, ContractStatusBadge, HealthBadge, HealthScore, timeAgo } from '@/components/status';
import { LoadError, NotVisible, isNotFound } from '@/components/projects';

const PROJECTS_SHOWN = 8;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const HISTORY_LABEL = {
  CREATED: 'Created',
  CONTRACT: 'Contract',
  PROJECT: 'Project',
  INVOICE: 'Invoice',
  APPROVAL: 'Approval',
  NOTE: 'Note',
  STATUS: 'Status',
  CHANGE: 'Change',
};
const LEVEL_TONE = { OK: 'ok', AMBER: 'warn', RED: 'danger' };
const LEVEL_TEXT = { OK: 'OK', AMBER: 'Amber', RED: 'Red' };

export function AdminClientDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const { data: c, error, isPending, refetch } = useClient(id);
  const editing = params.get('edit') === '1';
  const created = params.get('created') === '1';

  const setParam = (k, v) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v) next.set(k, v);
      else next.delete(k);
      return next;
    });

  if (isPending) return <PageSkeleton />;
  if (isNotFound(error)) return <NotVisible what="Client" backTo="/admin/clients" backLabel="Back to all clients" />;
  if (error) return <LoadError error={error} onRetry={refetch} />;

  const owner = c.contacts.find((p) => p.role === 'CLIENT_OWNER');
  const isSuper = user?.role === 'SUPER_ADMIN';

  return (
    <div className="page">
      <Link to="/admin/clients" className="back-link">
        <LuArrowLeft aria-hidden /> All clients
      </Link>
      <PageHeader
        eyebrow={`${c.industry} · ${c.city}`}
        title={c.name}
        actions={
          <>
            <ClientStatusBadge status={c.status} />
            <HealthBadge health={c.health} />
            <Button variant="secondary" size="sm" onClick={() => setParam('edit', '1')}>
              <LuPencil aria-hidden /> Edit
            </Button>
          </>
        }
      />

      {created && (
        <div className="alert alert--ok" role="status">
          <LuCircleCheck aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
          <div className="grid" style={{ gap: 8, flex: 1 }}>
            <span>
              Client added. {owner ? `${owner.name} has been sent an invite to set their password.` : ''} Add a contract and a project when the quote is accepted.
            </span>
            {owner && <DemoEmail to={owner.email} />}
          </div>
          <Button variant="ghost" size="sm" icon aria-label="Dismiss" onClick={() => setParam('created', undefined)}>
            <LuX />
          </Button>
        </div>
      )}

      <div className="facts">
        <div className="facts__item">
          <div className="facts__label">Account manager</div>
          <div className="facts__value">{c.accountManager.name}</div>
          <div className="list__meta">Backup: {c.backupManager?.name ?? 'none'}</div>
        </div>
        <div className="facts__item">
          <div className="facts__label">Client since</div>
          <div className="facts__value">{formatDateLong(c.clientSince)}</div>
          <div className="list__meta">{c.activeProjects} active of {c.totalProjects} projects</div>
        </div>
        <div className="facts__item">
          <div className="facts__label">Retainer / month</div>
          <div className="facts__value">{c.monthlyRetainer ? formatINR(c.monthlyRetainer) : '—'}</div>
          <div className="list__meta">{c.renewalDue ? `Renewal ${dueLabel(c.renewalDue).toLowerCase()}` : 'No running contract'}</div>
        </div>
        <div className="facts__item">
          <div className="facts__label">Outstanding</div>
          <div className={`facts__value${c.outstanding ? ' text-danger' : ''}`}>{c.outstanding ? formatINR(c.outstanding) : 'Nothing due'}</div>
          {c.lifetimeValue !== undefined && <div className="list__meta">Paid to date: {formatINR(c.lifetimeValue)}</div>}
        </div>
        <div className="facts__item">
          <div className="facts__label">Satisfaction</div>
          <div className="facts__value">{c.satisfaction !== undefined ? `${c.satisfaction.toFixed(1)} / 5` : 'No ratings yet'}</div>
          <div className="list__meta">{c.approvalDays !== undefined ? `Approves in ${c.approvalDays} days on average` : 'No approvals yet'}</div>
        </div>
      </div>

      <div className="grid grid--2">
        <Card title="Health" action={<HealthScore health={c.health} score={c.healthScore} />}>
          <div className="row bar-row" style={{ marginBottom: 12 }}>
            <Progress value={c.healthScore} label="Health score" />
            <span className="small">{c.healthScore}/100</span>
          </div>
          <ul className="list health-factors">
            {c.healthFactors.map((f) => (
              <li key={f.key} className="list__item">
                <span className={`health-factors__icon health-factors__icon--${f.level.toLowerCase()}`} aria-hidden>
                  {f.level === 'OK' ? <LuCircleCheck /> : <LuTriangleAlert />}
                </span>
                <div className="list__main">
                  <div className="list__title">{f.label}</div>
                  <div className="list__meta">{f.detail}</div>
                </div>
                <div className="health-factors__right">
                  <Badge tone={LEVEL_TONE[f.level]}>{LEVEL_TEXT[f.level]}</Badge>
                  {f.penalty > 0 && <span className="list__meta">−{f.penalty}</span>}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <OnboardingCard clientId={c.id} />

        <Card title="Profile">
          <dl className="kv">
            <dt>Legal name</dt>
            <dd>{c.legalName}</dd>
            <dt>GSTIN</dt>
            <dd>{c.gstin ?? <span className="muted">Not added (needed for GST invoices)</span>}</dd>
            <dt>Website</dt>
            <dd>{c.website ?? '—'}</dd>
            <dt>Address</dt>
            <dd>{c.address || <span className="muted">Not added</span>}</dd>
            <dt>Services</dt>
            <dd>
              <div className="badge-row">{c.services.length ? c.services.map((s) => <Badge key={s}>{s}</Badge>) : <span className="muted">None running</span>}</div>
            </dd>
          </dl>
        </Card>
      </div>

      <Card
        title={`Projects · ${c.totalProjects}`}
        action={
          c.totalProjects > 0 && (
            <Link to={`/admin/projects?clientId=${c.id}`} className="small">
              Open in Projects
            </Link>
          )
        }
      >
        {c.projects.length === 0 ? (
          <EmptyState title="No projects yet">A project is created when the client accepts a quote.</EmptyState>
        ) : (
          <>
            <ul className="list">
              {c.projects.slice(0, PROJECTS_SHOWN).map((p) => (
                <li key={p.id} className="list__item list__item--wrap">
                  <div className="list__main">
                    <Link to={`/admin/projects/${p.id}`} className="list__title row-link">
                      {p.name}
                    </Link>
                    <div className="list__meta">
                      {p.service} · {p.owner}
                      {p.nextMilestone ? ` · next: ${p.nextMilestone.title}, ${dueLabel(p.nextMilestone.due).toLowerCase()}` : ''}
                    </div>
                  </div>
                  <div className="row bar-row bar-row--fixed">
                    <Progress value={p.progress} label={`${p.name} progress`} />
                    <span className="small">{p.progress}%</span>
                  </div>
                  <HealthBadge health={p.health} />
                </li>
              ))}
            </ul>
            {c.projects.length > PROJECTS_SHOWN && (
              <p className="list__meta" style={{ marginTop: 12 }}>
                Showing the {PROJECTS_SHOWN} most at risk of {c.projects.length}.{' '}
                <Link to={`/admin/projects?clientId=${c.id}`}>See all in Projects</Link>
              </p>
            )}
          </>
        )}
      </Card>

      <div className="grid grid--2">
        <Card
          title={`Contacts · ${c.contacts.length}`}
          action={
            isSuper && (
              <Link to="/admin/settings" className="small">
                Manage logins
              </Link>
            )
          }
        >
          {c.contacts.length === 0 ? (
            <EmptyState title="No contacts">Invite the client owner from Users & settings.</EmptyState>
          ) : (
            <ul className="list">
              {c.contacts.map((p) => (
                <li key={p.id} className="list__item list__item--wrap">
                  <Avatar name={p.name} size={32} />
                  <div className="list__main">
                    <div className="list__title">
                      {p.name} {p.role === 'CLIENT_OWNER' && <Badge tone="info">Owner</Badge>}
                    </div>
                    <div className="list__meta">
                      {p.title ? `${p.title} · ` : ''}
                      {p.email}
                    </div>
                    <div className="list__meta">
                      {p.lastLoginAt ? `Last signed in ${timeAgo(p.lastLoginAt)}` : 'Never signed in'}
                      {p.canSeeBilling ? ' · sees billing' : ''}
                    </div>
                  </div>
                  <AccountStatusBadge status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Contracts">
          {c.contracts.length === 0 ? (
            <EmptyState title="No contracts yet">Contracts are added when a quote is accepted (Finance, Week 5).</EmptyState>
          ) : (
            <ul className="list">
              {c.contracts.map((k) => (
                <li key={k.id} className="list__item list__item--wrap">
                  <div className="list__main">
                    <div className="list__title">{k.title}</div>
                    <div className="list__meta">
                      {k.kind === 'RETAINER' ? `${formatINR(k.value)} a month` : `${formatINR(k.value)} fixed`} · {formatDateLong(k.startDate)} to {formatDateLong(k.endDate)}
                    </div>
                    <div className="list__meta">{k.revisionsPerDeliverable} revision rounds per deliverable</div>
                  </div>
                  <ContractStatusBadge status={k.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="History">
        <NoteComposer id={c.id} />
        <ul className="feed" style={{ marginTop: 16 }}>
          {c.history.map((h) => (
            <li key={h.id} className="feed__item">
              <Avatar name={h.actor} size={28} />
              <div className="list__main">
                <div className="small">
                  <strong>{h.actor}</strong> {h.kind === 'NOTE' ? <span className="client-note">{h.text}</span> : h.text}
                </div>
                <div className="list__meta row" style={{ gap: 8 }}>
                  <time dateTime={h.at}>{timeAgo(h.at)}</time>
                  <Badge tone={h.kind === 'NOTE' ? 'warn' : 'neutral'}>{HISTORY_LABEL[h.kind]}</Badge>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Drawer open={editing} onClose={() => setParam('edit', undefined)} title={`Edit ${c.name}`}>
        {editing && <EditClientForm client={c} isSuper={isSuper} onDone={() => setParam('edit', undefined)} />}
      </Drawer>
    </div>
  );
}

function NoteComposer({ id }) {
  const save = useClientMutation();
  const [text, setText] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (text.trim().length < 2) return;
    save.mutate({ kind: 'note', id, text: text.trim() }, { onSuccess: () => setText('') });
  };
  return (
    <form onSubmit={submit} className="composer">
      <label className="sr-only" htmlFor="client-note">
        Add an internal note
      </label>
      <textarea
        id="client-note"
        className="composer__input"
        rows={2}
        maxLength={2000}
        placeholder="Add a note: call summary, upsell idea, risk… (staff only)"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="row composer__foot" style={{ justifyContent: 'space-between' }}>
        {save.error ? (
          <span className="field__error" role="alert">
            <LuCircleAlert aria-hidden /> {save.error.message}
          </span>
        ) : (
          <span className="list__meta">The client never sees this record.</span>
        )}
        <Button type="submit" size="sm" loading={save.isPending} disabled={text.trim().length < 2}>
          Add note
        </Button>
      </div>
    </form>
  );
}

function EditClientForm({ client, isSuper, onDone }) {
  const managers = useAccountManagers();
  const save = useClientMutation();
  const [form, setForm] = useState({
    industry: client.industry,
    city: client.city,
    gstin: client.gstin ?? '',
    website: client.website ?? '',
    address: client.address ?? '',
    accountManagerId: client.accountManager.id,
    backupManagerId: client.backupManager?.id ?? '',
    status: client.status,
  });
  const [errors, setErrors] = useState({});
  const field = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }), error: errors[k] });

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    if (!form.industry.trim()) next.industry = 'Enter the industry.';
    if (!form.city.trim()) next.city = 'Enter the city.';
    if (form.gstin.trim() && !GSTIN_RE.test(form.gstin.trim().toUpperCase())) next.gstin = '15 characters, like 27AAECT4821K1Z3.';
    if (form.backupManagerId && form.backupManagerId === form.accountManagerId) next.backupManagerId = 'Choose someone other than the account manager.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const patch = {
      industry: form.industry.trim(),
      city: form.city.trim(),
      gstin: form.gstin.trim().toUpperCase(),
      website: form.website.trim(),
      address: form.address.trim(),
      accountManagerId: form.accountManagerId,
      backupManagerId: form.backupManagerId,
    };
    // Only send status when it changed: managers may edit the rest but not the status.
    if (form.status !== client.status) patch.status = form.status;
    save.mutate({ kind: 'update', id: client.id, patch }, { onSuccess: onDone });
  };

  if (managers.isPending) return <div className="skeleton" style={{ height: 420 }} />;
  if (managers.error) return <ErrorState message={managers.error.message} onRetry={managers.refetch} />;

  const people = managers.data;
  return (
    <form onSubmit={submit} noValidate className="grid" style={{ gap: 16 }}>
      {save.error && (
        <div className="alert alert--error" role="alert">
          <LuCircleAlert aria-hidden style={{ marginTop: 2, flexShrink: 0 }} /> <span>{save.error.message}</span>
        </div>
      )}
      <div className="grid grid--pair">
        <Input label="Industry" {...field('industry')} />
        <Input label="City" {...field('city')} />
      </div>
      <Input label="GSTIN" {...field('gstin')} autoCapitalize="characters" />
      <Input label="Website" {...field('website')} inputMode="url" />
      <Input label="Address" {...field('address')} />
      <label className="field">
        <span className="field__label">Account manager</span>
        <select className="field__input" value={form.accountManagerId} onChange={(e) => setForm({ ...form, accountManagerId: e.target.value })}>
          {people.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Backup</span>
        <select
          className="field__input"
          value={form.backupManagerId}
          onChange={(e) => setForm({ ...form, backupManagerId: e.target.value })}
          aria-invalid={errors.backupManagerId ? true : undefined}
        >
          <option value="">No backup</option>
          {people.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {errors.backupManagerId && (
          <span className="field__error">
            <LuCircleAlert aria-hidden /> {errors.backupManagerId}
          </span>
        )}
      </label>
      <label className="field">
        <span className="field__label">Status</span>
        <select className="field__input" value={form.status} disabled={!isSuper} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          {CLIENT_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {!isSuper && <span className="list__meta">Only a Super Admin can pause, end or reactivate a client.</span>}
      </label>
      {isSuper && form.status !== client.status && (form.status === 'PAUSED' || form.status === 'ENDED') && (
        <p className="alert alert--warn small">
          <LuTriangleAlert aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            {form.status === 'PAUSED' ? 'Pausing' : 'Ending'} a client is logged in their history. Tell the account manager and the client before you save.
          </span>
        </p>
      )}
      <Button type="submit" loading={save.isPending}>
        Save changes
      </Button>
    </form>
  );
}

/** Week 8: the client's getting-started checklist; staff confirm the access handover works. */
function OnboardingCard({ clientId }) {
  const { data: o, error, isPending, refetch } = useClientOnboarding(clientId);
  const action = useOnboardingAction();
  if (isPending) return <div className="skeleton" style={{ height: 200 }} />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  return (
    <Card title="Onboarding" action={o.completedAt ? <Badge tone="ok">Complete</Badge> : <span className="small muted">{o.progress}%</span>}>
      <OnboardingProgress o={o} />
      <ul className="list" style={{ marginTop: 8 }}>
        {o.access.map((a) => (
          <li key={a.platform} className="list__item list__item--wrap">
            <div className="list__main">
              <div className="list__title small">{a.label}</div>
              {a.accountRef && <div className="list__meta">{a.accountRef}{a.verifiedBy ? ` · checked by ${a.verifiedBy}` : ''}</div>}
            </div>
            <AccessBadge status={a.status} />
            {a.status === 'GRANTED' && (
              <Button size="sm" variant="secondary" loading={action.isPending} onClick={() => action.mutate({ kind: 'verify', clientId, platform: a.platform })}>
                Confirm it works
              </Button>
            )}
          </li>
        ))}
      </ul>
      {o.kickoff && <p className="small muted">Kick-off: {formatDateLong(o.kickoff.date)} at {o.kickoff.time}</p>}
    </Card>
  );
}
