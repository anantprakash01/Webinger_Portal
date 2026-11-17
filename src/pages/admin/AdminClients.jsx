import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LuCircleAlert, LuPlus, LuX } from 'react-icons/lu';
import { useAccountManagers, useClientMutation, useClients } from '@/api/queries';
import { useAuth } from '@/auth/AuthContext';
import { Badge, Button, Card, Drawer, EmptyState, ErrorState, Input, PageHeader, PageSkeleton, SearchInput, Select, Stat, dueLabel, formatINR } from '@/components/ui';
import { CLIENT_STATUS_OPTIONS, ClientStatusBadge, HEALTH_OPTIONS, HealthScore } from '@/components/status';

const FILTER_KEYS = ['q', 'status', 'health', 'accountManagerId'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function AdminClients() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const query = {
    q: params.get('q') ?? undefined,
    status: params.get('status') ?? undefined,
    health: params.get('health') ?? undefined,
    accountManagerId: params.get('accountManagerId') ?? undefined,
  };
  const adding = params.get('new') === '1';

  const set = (key, value, replace = true) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, String(value));
        else next.delete(key);
        return next;
      },
      { replace },
    );

  const [text, setText] = useState(query.q ?? '');
  useEffect(() => {
    const id = setTimeout(() => {
      if ((query.q ?? '') !== text.trim()) set('q', text.trim() || undefined);
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const { data, error, isPending, isFetching, refetch } = useClients(query);
  // Totals come from the unfiltered list, so the cards don't jump while filtering.
  const all = useClients({});

  if (isPending || all.isPending) return <PageSkeleton />;
  if ((error && !data) || all.error) return <div className="page"><ErrorState message={(error ?? all.error).message} onRetry={() => (refetch(), all.refetch())} /></div>;

  const live = all.data.filter((c) => c.status === 'ACTIVE' || c.status === 'ONBOARDING');
  const managers = [...new Map(all.data.map((c) => [c.accountManager.id, c.accountManager.name]))]
    .map(([id, name]) => ({ value: id, label: name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const filtered = FILTER_KEYS.some((k) => params.get(k));
  const isSuper = user?.role === 'SUPER_ADMIN';

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${live.length} live client${live.length === 1 ? '' : 's'}`}
        title="Clients"
        actions={
          isSuper && (
            <Button onClick={() => set('new', '1', false)}>
              <LuPlus aria-hidden /> Add client
            </Button>
          )
        }
      />

      <div className="grid grid--stats">
        <Stat label="Live clients" value={live.length} hint={`${all.data.length - live.length} paused or ended`} />
        <Stat label="Monthly retainers" value={formatINR(live.reduce((s, c) => s + c.monthlyRetainer, 0))} hint="Running contracts, before GST" />
        <Stat label="Outstanding" value={formatINR(all.data.reduce((s, c) => s + c.outstanding, 0))} hint="Unpaid invoices" />
        <Stat
          label="At risk"
          value={live.filter((c) => c.health === 'RED').length}
          hint={`${live.filter((c) => c.health === 'AMBER').length} need attention`}
          accent={live.some((c) => c.health === 'RED')}
        />
      </div>

      <div className="toolbar">
        <SearchInput label="Search clients" value={text} onChange={setText} placeholder="Search client, industry, city, manager" />
        <Select label="Status" hideLabel value={query.status} onChange={(v) => set('status', v)} allLabel="Any status" options={CLIENT_STATUS_OPTIONS} />
        <Select label="Health" hideLabel value={query.health} onChange={(v) => set('health', v)} allLabel="Any health" options={HEALTH_OPTIONS} />
        <Select label="Account manager" hideLabel value={query.accountManagerId} onChange={(v) => set('accountManagerId', v)} allLabel="All managers" options={managers} />
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setText('');
              setParams({}, { replace: true });
            }}
          >
            <LuX aria-hidden /> Clear
          </Button>
        )}
      </div>

      <Card flush>
        <div className="card__body" aria-busy={isFetching || undefined} style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity .15s' }}>
          {data.length === 0 ? (
            <EmptyState title={filtered ? 'No clients match these filters' : 'No clients yet'}>
              {filtered ? 'Try a different search or clear the filters.' : 'Clients appear here when a deal is won or a Super Admin adds one.'}
            </EmptyState>
          ) : (
            <table className="table table--rows">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Account manager</th>
                  <th>Projects</th>
                  <th>Services</th>
                  <th>Retainer / month</th>
                  <th>Outstanding</th>
                  <th>Renewal</th>
                  <th>Health</th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Client" className="td--title">
                      <Link to={`/admin/clients/${c.id}`} className="row-link">
                        {c.name}
                      </Link>
                      <div className="list__meta">
                        {c.industry} · {c.city}
                        {c.status !== 'ACTIVE' && (
                          <>
                            {' '}
                            · <ClientStatusBadge status={c.status} />
                          </>
                        )}
                      </div>
                    </td>
                    <td data-label="Account manager">{c.accountManager.name}</td>
                    <td data-label="Projects">
                      {c.activeProjects} active
                      <div className="list__meta">{c.totalProjects} in total</div>
                    </td>
                    <td data-label="Services">
                      <div className="badge-row">
                        {c.services.length === 0 ? <span className="list__meta">None running</span> : c.services.map((s) => <Badge key={s}>{s}</Badge>)}
                      </div>
                    </td>
                    <td data-label="Retainer / month">{c.monthlyRetainer ? formatINR(c.monthlyRetainer) : '—'}</td>
                    <td data-label="Outstanding" className={c.outstanding ? 'text-danger' : undefined}>
                      {c.outstanding ? formatINR(c.outstanding) : '—'}
                    </td>
                    <td data-label="Renewal">{c.renewalDue ? dueLabel(c.renewalDue) : '—'}</td>
                    <td data-label="Health">
                      <HealthScore health={c.health} score={c.healthScore} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <p className="list__meta">
        Health follows one rule: amber when a task is overdue or an approval waits more than 5 days; red when a milestone is missed, an invoice is 15+ days late or satisfaction is 2 or lower. The score ranks clients within a colour.
      </p>

      {isSuper && (
        <Drawer open={adding} onClose={() => set('new', undefined)} title="Add client">
          {adding && <NewClientForm />}
        </Drawer>
      )}
    </div>
  );
}

function NewClientForm() {
  const navigate = useNavigate();
  const managers = useAccountManagers();
  const save = useClientMutation();
  const [form, setForm] = useState({
    name: '',
    legalName: '',
    industry: '',
    city: '',
    gstin: '',
    website: '',
    accountManagerId: 'u-mgr',
    ownerName: '',
    ownerEmail: '',
    ownerTitle: '',
  });
  const [errors, setErrors] = useState({});
  const field = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }), error: errors[k] });
  const options = useMemo(() => managers.data ?? [], [managers.data]);

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    if (form.name.trim().length < 2) next.name = 'Enter the company name.';
    if (!form.industry.trim()) next.industry = 'Enter the industry.';
    if (!form.city.trim()) next.city = 'Enter the city.';
    if (form.gstin.trim() && !GSTIN_RE.test(form.gstin.trim().toUpperCase())) next.gstin = '15 characters, like 27AAECT4821K1Z3.';
    if (form.ownerName.trim().length < 2) next.ownerName = 'Enter their full name.';
    if (!EMAIL_RE.test(form.ownerEmail.trim())) next.ownerEmail = 'Enter a valid email address.';
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate(
      {
        kind: 'create',
        body: {
          name: form.name.trim(),
          legalName: form.legalName.trim() || form.name.trim(),
          industry: form.industry.trim(),
          city: form.city.trim(),
          gstin: form.gstin.trim().toUpperCase() || undefined,
          website: form.website.trim() || undefined,
          accountManagerId: form.accountManagerId,
          owner: { name: form.ownerName.trim(), email: form.ownerEmail.trim(), title: form.ownerTitle.trim() || undefined },
        },
      },
      { onSuccess: (c) => navigate(`/admin/clients/${c.id}?created=1`) },
    );
  };

  if (managers.isPending) return <div className="skeleton" style={{ height: 420 }} />;
  if (managers.error) return <ErrorState message={managers.error.message} onRetry={managers.refetch} />;

  return (
    <form onSubmit={submit} noValidate className="grid" style={{ gap: 16 }}>
      {save.error && (
        <div className="alert alert--error" role="alert">
          <LuCircleAlert aria-hidden style={{ marginTop: 2, flexShrink: 0 }} /> <span>{save.error.message}</span>
        </div>
      )}
      <h3 className="section-title">Company</h3>
      <Input label="Company name" {...field('name')} autoComplete="off" />
      <Input label="Legal name (for invoices)" {...field('legalName')} placeholder="Same as company name if empty" autoComplete="off" />
      <div className="grid grid--pair">
        <Input label="Industry" {...field('industry')} />
        <Input label="City" {...field('city')} />
      </div>
      <div className="grid grid--pair">
        <Input label="GSTIN (optional)" {...field('gstin')} autoCapitalize="characters" />
        <Input label="Website (optional)" {...field('website')} inputMode="url" />
      </div>
      <label className="field">
        <span className="field__label">Account manager</span>
        <select className="field__input" value={form.accountManagerId} onChange={(e) => setForm({ ...form, accountManagerId: e.target.value })}>
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.title ? ` · ${m.title}` : ''}
            </option>
          ))}
        </select>
      </label>

      <h3 className="section-title">Main contact (Client Owner)</h3>
      <Input label="Full name" {...field('ownerName')} autoComplete="off" />
      <Input label="Email" type="email" inputMode="email" {...field('ownerEmail')} autoComplete="off" />
      <Input label="Job title (optional)" {...field('ownerTitle')} />
      <p className="note small">
        <LuCircleAlert aria-hidden />
        <span>They get an invite link to set their own password (valid 7 days). They can then invite their team.</span>
      </p>
      <Button type="submit" loading={save.isPending}>
        Add client and send invite
      </Button>
    </form>
  );
}
