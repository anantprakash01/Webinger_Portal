import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LuCircleAlert, LuCircleCheck, LuShieldCheck, LuShieldOff, LuUserPlus } from 'react-icons/lu';
import { useAdminAction, useAdminUsers, useInviteUser, useLoginHistory, useOrganisations, useSaveSettings, useSettings } from '@/api/queries';
import { useAuth } from '@/auth/AuthContext';
import { DemoEmail } from '@/components/auth';
import { Avatar, Badge, Button, Card, Drawer, EmptyState, ErrorState, Input, PageHeader, PageSkeleton, SearchInput, Segmented, Select, formatINR } from '@/components/ui';
import { ACCOUNT_STATUS_OPTIONS, AccountStatusBadge, timeAgo } from '@/components/status';
import { ROLE_LABEL } from '@/types';

const TABS = [
  { value: 'users', label: 'Users' },
  { value: 'logins', label: 'Login history' },
  { value: 'business', label: 'Business settings' },
];
const ROLE_OPTIONS = Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }));

export function AdminSettings() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'users';
  const setTab = (v, extra = {}) => setParams(v === 'users' ? extra : { tab: v, ...extra }, { replace: true });

  return (
    <div className="page">
      <PageHeader eyebrow="Super Admin" title="Users & settings" />
      <div className="toolbar">
        <Segmented label="Section" value={tab} onChange={(v) => setTab(v)} options={TABS} />
      </div>
      {tab === 'users' && <UsersTab onHistory={(userId) => setTab('logins', { user: userId })} />}
      {tab === 'logins' && <LoginsTab userId={params.get('user') ?? undefined} onUser={(u) => setTab('logins', u ? { user: u } : {})} />}
      {tab === 'business' && <BusinessTab />}
    </div>
  );
}

/* ------------------------------------------------------------------ users */

const ACTION_TEXT = {
  approve: (u) => `${u.name} is approved. An invite email was sent.`,
  suspend: (u) => `${u.name} is suspended and was signed out everywhere.`,
  reactivate: (u) => `${u.name} can sign in again.`,
  resetPassword: (u) => (u.status === 'INVITED' ? `A new invite was sent to ${u.email}.` : `A password reset link was sent to ${u.email}.`),
  forceLogout: (u) => `${u.name} was signed out on every device.`,
};

function UsersTab({ onHistory }) {
  const { user: me } = useAuth();
  const [q, setQ] = useState('');
  const [role, setRole] = useState();
  const [status, setStatus] = useState();
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);
  const { data, error, isPending, isFetching, refetch } = useAdminUsers({ q: debounced || undefined, role, status });
  const all = useAdminUsers({});
  const action = useAdminAction();
  const [confirm, setConfirm] = useState(null); // { id, action }
  const [flash, setFlash] = useState(null); // { text, email }
  const [inviting, setInviting] = useState(false);

  if (isPending) return <PageSkeleton />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  const pending = (all.data ?? []).filter((u) => u.status === 'PENDING_APPROVAL');
  const run = (u, act) =>
    action.mutate(
      { action: act, id: u.id },
      {
        onSuccess: () => {
          setConfirm(null);
          setFlash({ text: ACTION_TEXT[act](u), email: act === 'approve' || act === 'resetPassword' ? u.email : null });
        },
      },
    );

  return (
    <>
      {flash && (
        <div className="alert alert--ok" role="status">
          <LuCircleCheck aria-hidden style={{ marginTop: 2, flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'grid', gap: 8 }}>
            <span>{flash.text}</span>
            {flash.email && <DemoEmail to={flash.email} refreshKey={flash.text} />}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setFlash(null)}>
            Dismiss
          </Button>
        </div>
      )}
      {action.error && (
        <div className="alert alert--error" role="alert">
          <LuCircleAlert aria-hidden style={{ marginTop: 2, flexShrink: 0 }} /> <span>{action.error.message}</span>
        </div>
      )}

      {pending.length > 0 && (
        <Card title={`Waiting for your approval · ${pending.length}`} className="card--warn">
          <ul className="list">
            {pending.map((u) => (
              <li key={u.id} className="list__item list__item--wrap">
                <Avatar name={u.name} size={32} />
                <div className="list__main">
                  <div className="list__title">
                    {u.name} · {u.organisationName}
                  </div>
                  <div className="list__meta">
                    {ROLE_LABEL[u.role]} · {u.email} · asked by {u.invitedBy ?? 'unknown'} {timeAgo(u.createdAt)}
                  </div>
                </div>
                <Button size="sm" onClick={() => run(u, 'approve')} loading={action.isPending && action.variables?.id === u.id}>
                  Approve and send invite
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="toolbar">
        <SearchInput label="Search users" value={q} onChange={setQ} placeholder="Search name, email, company" />
        <Select label="Role" hideLabel value={role} onChange={setRole} allLabel="All roles" options={ROLE_OPTIONS} />
        <Select label="Status" hideLabel value={status} onChange={setStatus} allLabel="Any status" options={ACCOUNT_STATUS_OPTIONS} />
        <span className="spacer" />
        <Button size="sm" onClick={() => setInviting(true)}>
          <LuUserPlus aria-hidden /> Invite user
        </Button>
      </div>

      <Card flush>
        <div className="card__body" style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity .15s' }}>
          {data.length === 0 ? (
            <EmptyState title="No users match" />
          ) : (
            <table className="table table--rows">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Two-step</th>
                  <th>Last sign-in</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((u) => {
                  const self = u.id === me?.id;
                  const asking = confirm?.id === u.id;
                  const busy = action.isPending && action.variables?.id === u.id;
                  return (
                    <tr key={u.id}>
                      <td data-label="User" className="td--title">
                        <div className="row">
                          <Avatar name={u.name} size={32} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600 }}>
                              {u.name} {self && <span className="muted">(you)</span>}
                            </div>
                            <div className="list__meta">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td data-label="Role">
                        <div className="small">{ROLE_LABEL[u.role]}</div>
                        <div className="list__meta">{u.organisationName}</div>
                      </td>
                      <td data-label="Status">
                        <AccountStatusBadge status={u.status} />
                      </td>
                      <td data-label="Two-step">
                        {u.mfaEnabled ? (
                          <span className="row small" style={{ gap: 4, color: 'var(--ok)' }}>
                            <LuShieldCheck aria-hidden /> On
                          </span>
                        ) : (
                          <span className="row small muted" style={{ gap: 4 }}>
                            <LuShieldOff aria-hidden /> Off
                          </span>
                        )}
                      </td>
                      <td data-label="Last sign-in" className="small">
                        {u.lastLoginAt ? timeAgo(u.lastLoginAt) : <span className="muted">Never</span>}
                      </td>
                      <td data-label="Actions" style={{ textAlign: 'right' }}>
                        {asking ? (
                          <span className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <span className="small">{confirm.action === 'suspend' ? `Suspend ${u.name.split(' ')[0]}?` : 'Sign out on all devices?'}</span>
                            <Button size="sm" onClick={() => run(u, confirm.action)} loading={busy}>
                              Confirm
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                              Cancel
                            </Button>
                          </span>
                        ) : (
                          <span className="row user-actions" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            {u.status === 'PENDING_APPROVAL' && (
                              <Button size="sm" onClick={() => run(u, 'approve')} loading={busy}>
                                Approve
                              </Button>
                            )}
                            {u.status === 'INVITED' && (
                              <Button size="sm" variant="secondary" onClick={() => run(u, 'resetPassword')} loading={busy}>
                                Resend invite
                              </Button>
                            )}
                            {u.status === 'ACTIVE' && (
                              <>
                                <Button size="sm" variant="secondary" onClick={() => run(u, 'resetPassword')} disabled={busy}>
                                  Reset password
                                </Button>
                                {!self && (
                                  <>
                                    <Button size="sm" variant="ghost" onClick={() => setConfirm({ id: u.id, action: 'forceLogout' })}>
                                      Sign out
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => setConfirm({ id: u.id, action: 'suspend' })}>
                                      Suspend
                                    </Button>
                                  </>
                                )}
                              </>
                            )}
                            {u.status === 'SUSPENDED' && (
                              <Button size="sm" variant="secondary" onClick={() => run(u, 'reactivate')} loading={busy}>
                                Reactivate
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => onHistory(u.id)}>
                              History
                            </Button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
      <p className="list__meta">Admins never see or set passwords. Reset sends the person a one-time link; they choose their own.</p>

      <Drawer open={inviting} onClose={() => setInviting(false)} title="Invite a user">
        {inviting && (
          <InviteUserForm
            onDone={(u) => {
              setInviting(false);
              setFlash({ text: `Invite sent to ${u.name} (${u.email}). The link works for 7 days.`, email: u.email });
            }}
          />
        )}
      </Drawer>
    </>
  );
}

const KIND_FOR_ROLE = {
  SUPER_ADMIN: 'AGENCY',
  MANAGER: 'AGENCY',
  EMPLOYEE: 'AGENCY',
  CLIENT_OWNER: 'CLIENT',
  CLIENT_REP: 'CLIENT',
  INFLUENCER: 'INFLUENCER',
  PARTNER: 'PARTNER',
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function InviteUserForm({ onDone }) {
  const orgs = useOrganisations();
  const invite = useInviteUser();
  const [form, setForm] = useState({ name: '', email: '', role: 'EMPLOYEE', organisationId: 'org-webinger', title: '' });
  const [errors, setErrors] = useState({});
  const choices = useMemo(() => (orgs.data ?? []).filter((o) => o.kind === KIND_FOR_ROLE[form.role]), [orgs.data, form.role]);

  // Changing the role resets the organisation to the first one that fits it.
  const setRole = (role) => {
    const first = (orgs.data ?? []).find((o) => o.kind === KIND_FOR_ROLE[role]);
    setForm({ ...form, role, organisationId: first?.id ?? '' });
  };

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    if (form.name.trim().length < 2) next.name = 'Enter their full name.';
    if (!EMAIL_RE.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (!form.organisationId) next.organisationId = 'Choose an organisation.';
    setErrors(next);
    if (Object.keys(next).length) return;
    invite.mutate(form, { onSuccess: onDone });
  };

  if (orgs.isPending) return <div className="skeleton" style={{ height: 300 }} />;
  if (orgs.error) return <ErrorState message={orgs.error.message} onRetry={orgs.refetch} />;

  return (
    <form onSubmit={submit} noValidate className="grid" style={{ gap: 16 }}>
      {invite.error && (
        <div className="alert alert--error" role="alert">
          <LuCircleAlert aria-hidden style={{ marginTop: 2, flexShrink: 0 }} /> <span>{invite.error.message}</span>
        </div>
      )}
      <Input label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} autoComplete="off" />
      <Input label="Email" type="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} autoComplete="off" />
      <label className="field">
        <span className="field__label">Role</span>
        <select className="field__input" value={form.role} onChange={(e) => setRole(e.target.value)}>
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Organisation</span>
        <select className="field__input" value={form.organisationId} onChange={(e) => setForm({ ...form, organisationId: e.target.value })} aria-invalid={errors.organisationId ? true : undefined}>
          {choices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        {errors.organisationId && (
          <span className="field__error">
            <LuCircleAlert aria-hidden /> {errors.organisationId}
          </span>
        )}
      </label>
      <Input label="Job title (optional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      {(form.role === 'SUPER_ADMIN' || form.role === 'MANAGER') && (
        <p className="note small">
          <LuShieldCheck aria-hidden />
          <span>Two-step sign-in is switched on for this role and cannot be turned off.</span>
        </p>
      )}
      <Button type="submit" loading={invite.isPending}>
        Send invite
      </Button>
      <p className="list__meta">They get an email link to set their own password. You never see it.</p>
    </form>
  );
}

/* ----------------------------------------------------------- login history */

const RESULT = {
  SUCCESS: ['ok', 'Signed in'],
  FAILED: ['danger', 'Wrong password'],
  MFA_FAILED: ['warn', 'Wrong code'],
  LOCKED: ['danger', 'Locked out'],
};

function LoginsTab({ userId, onUser }) {
  const users = useAdminUsers({});
  const { data, error, isPending, refetch } = useLoginHistory(userId);
  if (isPending) return <PageSkeleton />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  return (
    <>
      <div className="toolbar">
        <Select
          label="Person"
          hideLabel
          value={userId}
          onChange={onUser}
          allLabel="Everyone"
          options={(users.data ?? []).map((u) => ({ value: u.id, label: `${u.name} · ${u.organisationName}` }))}
        />
        <span className="list__meta">Latest 100 sign-in attempts. Failed attempts on unknown emails are listed too.</span>
      </div>
      <Card flush>
        <div className="card__body">
          {data.length === 0 ? (
            <EmptyState title="No sign-in attempts yet" />
          ) : (
            <table className="table table--rows">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Person</th>
                  <th>Result</th>
                  <th>Device</th>
                  <th>IP address</th>
                </tr>
              </thead>
              <tbody>
                {data.map((e) => (
                  <tr key={e.id}>
                    <td data-label="When" className="small">
                      <time dateTime={e.at} title={new Date(e.at).toLocaleString('en-IN')}>
                        {timeAgo(e.at)}
                      </time>
                    </td>
                    <td data-label="Person">
                      <div className="small" style={{ fontWeight: 600 }}>
                        {e.userName}
                      </div>
                      <div className="list__meta">{e.email}</div>
                    </td>
                    <td data-label="Result">
                      <Badge tone={RESULT[e.result][0]}>{RESULT[e.result][1]}</Badge>
                    </td>
                    <td data-label="Device" className="small">
                      {e.device}
                    </td>
                    <td data-label="IP address" className="small" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {e.ip}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </>
  );
}

/* --------------------------------------------------------- business settings */

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function validate(s) {
  const e = {};
  if (s.businessHours.days.length === 0) e.days = 'Choose at least one working day.';
  if (!s.businessHours.open || !s.businessHours.close) e.hours = 'Set opening and closing times.';
  else if (s.businessHours.close <= s.businessHours.open) e.hours = 'Closing time must be after opening time.';
  const intIn = (n, lo, hi) => Number.isFinite(n) && n >= lo && n <= hi;
  if (!intIn(s.responseTimes.firstReplyHours, 1, 72)) e.firstReply = 'Between 1 and 72 hours.';
  if (!intIn(s.responseTimes.ticketResolutionHours, 1, 720)) e.resolution = 'Between 1 and 720 hours.';
  else if (s.responseTimes.ticketResolutionHours < s.responseTimes.firstReplyHours) e.resolution = 'Cannot be shorter than first reply.';
  if (!intIn(s.approvalLimits.managerDiscountPercent, 0, 50)) e.discount = 'Between 0 and 50%.';
  if (!(s.approvalLimits.managerSpendLimit >= 0)) e.spend = 'Cannot be negative.';
  if (!(s.approvalLimits.deputyPayoutLimit >= 0)) e.payout = 'Cannot be negative.';
  if (!intIn(s.defaultRevisions, 1, 10)) e.revisions = 'Between 1 and 10.';
  if (!intIn(s.reminderAfterDays, 1, 14)) e.reminder = 'Between 1 and 14 days.';
  return e;
}

function BusinessTab() {
  const { data, error, isPending, refetch } = useSettings();
  if (isPending) return <PageSkeleton />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  return <SettingsForm initial={data} />;
}

function NumberField({ label, hint, value, onChange, error, prefix, suffix, step = 1 }) {
  return (
    <div className="field">
      <Input
        label={label}
        type="number"
        inputMode="numeric"
        step={step}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
        error={error}
      />
      {(hint || prefix || suffix) && !error && (
        <span className="list__meta">
          {hint}
          {prefix && Number.isFinite(value) ? ` ${prefix}` : ''}
          {suffix ?? ''}
        </span>
      )}
    </div>
  );
}

function SettingsForm({ initial }) {
  const save = useSaveSettings();
  const [s, setS] = useState(initial);
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  const patch = (section, key, value) => {
    setSaved(false);
    setS((prev) => ({ ...prev, [section]: section === 'defaultRevisions' || section === 'reminderAfterDays' ? value : { ...prev[section], [key]: value } }));
  };
  const toggleDay = (d) =>
    patch('businessHours', 'days', s.businessHours.days.includes(d) ? s.businessHours.days.filter((x) => x !== d) : [...s.businessHours.days, d].sort());

  const submit = (e) => {
    e.preventDefault();
    const next = validate(s);
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate(s, {
      onSuccess: (stored) => {
        setS(stored);
        setSaved(true);
      },
    });
  };

  return (
    <form onSubmit={submit} noValidate className="grid">
      {save.error && (
        <div className="alert alert--error" role="alert">
          <LuCircleAlert aria-hidden style={{ marginTop: 2, flexShrink: 0 }} /> <span>{save.error.message}</span>
        </div>
      )}
      <div className="grid grid--2">
        <Card title="Business hours">
          <div className="grid" style={{ gap: 16 }}>
            <fieldset className="checks" aria-describedby={errors.days ? 'days-err' : undefined}>
              <legend className="field__label">Working days</legend>
              <div className="day-picks">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <label key={d} className={`day-pick${s.businessHours.days.includes(d) ? ' is-on' : ''}`}>
                    <input type="checkbox" checked={s.businessHours.days.includes(d)} onChange={() => toggleDay(d)} />
                    {DAYS[d]}
                  </label>
                ))}
              </div>
              {errors.days && (
                <span id="days-err" className="field__error">
                  <LuCircleAlert aria-hidden /> {errors.days}
                </span>
              )}
            </fieldset>
            <div className="grid grid--pair">
              <Input label="Opens" type="time" value={s.businessHours.open} onChange={(e) => patch('businessHours', 'open', e.target.value)} />
              <Input label="Closes" type="time" value={s.businessHours.close} onChange={(e) => patch('businessHours', 'close', e.target.value)} error={errors.hours} />
            </div>
            <p className="list__meta">Time zone: India Standard Time ({s.businessHours.timezone}). Shown to clients in chat and used for response-time clocks.</p>
          </div>
        </Card>

        <Card title="Response times">
          <div className="grid" style={{ gap: 16 }}>
            <NumberField label="First reply to a client message (hours)" value={s.responseTimes.firstReplyHours} onChange={(v) => patch('responseTimes', 'firstReplyHours', v)} error={errors.firstReply} hint="Business hours only. After this the backup, then the manager, is alerted." />
            <NumberField label="Ticket resolution (hours)" value={s.responseTimes.ticketResolutionHours} onChange={(v) => patch('responseTimes', 'ticketResolutionHours', v)} error={errors.resolution} />
          </div>
        </Card>

        <Card title="Approval limits">
          <div className="grid" style={{ gap: 16 }}>
            <NumberField label="Manager can give a discount up to (%)" value={s.approvalLimits.managerDiscountPercent} onChange={(v) => patch('approvalLimits', 'managerDiscountPercent', v)} error={errors.discount} />
            <NumberField
              label="Manager can approve spend up to (₹)"
              value={s.approvalLimits.managerSpendLimit}
              onChange={(v) => patch('approvalLimits', 'managerSpendLimit', v)}
              error={errors.spend}
              step={1000}
              hint={Number.isFinite(s.approvalLimits.managerSpendLimit) ? formatINR(s.approvalLimits.managerSpendLimit) : ''}
            />
            <NumberField
              label="Deputy can approve payouts up to (₹)"
              value={s.approvalLimits.deputyPayoutLimit}
              onChange={(v) => patch('approvalLimits', 'deputyPayoutLimit', v)}
              error={errors.payout}
              step={1000}
              hint={Number.isFinite(s.approvalLimits.deputyPayoutLimit) ? `${formatINR(s.approvalLimits.deputyPayoutLimit)}. Anything above comes to a Super Admin.` : ''}
            />
          </div>
        </Card>

        <Card title="Client approvals">
          <div className="grid" style={{ gap: 16 }}>
            <NumberField label="Revision rounds included per deliverable" value={s.defaultRevisions} onChange={(v) => patch('defaultRevisions', null, v)} error={errors.revisions} hint="Default for new deliverables. Contracts can override it." />
            <NumberField label="Remind the client after (days)" value={s.reminderAfterDays} onChange={(v) => patch('reminderAfterDays', null, v)} error={errors.reminder} hint="Pending for 5 days turns the project amber." />
          </div>
        </Card>
      </div>

      <div className="save-bar">
        {saved && !dirty ? (
          <span className="row small" style={{ color: 'var(--ok)' }}>
            <LuCircleCheck aria-hidden /> Saved
          </span>
        ) : (
          <span className="small muted">{dirty ? 'You have unsaved changes.' : 'No changes.'}</span>
        )}
        <span className="spacer" />
        <Button
          type="button"
          variant="ghost"
          disabled={!dirty || save.isPending}
          onClick={() => {
            setS(initial);
            setErrors({});
          }}
        >
          Discard
        </Button>
        <Button type="submit" disabled={!dirty} loading={save.isPending}>
          Save settings
        </Button>
      </div>
    </form>
  );
}
