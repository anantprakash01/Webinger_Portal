import { useState } from 'react';
import { LuCircleAlert, LuCircleCheck, LuUserPlus } from 'react-icons/lu';
import { useClientTeam, useInviteRep, useUpdateRep } from '@/api/queries';
import { useAuth } from '@/auth/AuthContext';
import { Avatar, Badge, Button, Card, Drawer, ErrorState, Input, PageHeader, PageSkeleton } from '@/components/ui';
import { AccountStatusBadge } from '@/components/status';
import { timeAgo } from '@/components/status';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ClientTeam() {
  const { user } = useAuth();
  const { data, error, isPending, refetch } = useClientTeam();
  const update = useUpdateRep();
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [flash, setFlash] = useState(null);

  if (isPending) return <PageSkeleton />;
  if (error) return <div className="page"><ErrorState message={error.message} onRetry={refetch} /></div>;

  const projectName = Object.fromEntries(data.projects.map((p) => [p.id, p.name]));
  const reps = data.members.filter((m) => m.role === 'CLIENT_REP');

  return (
    <div className="page">
      <PageHeader
        eyebrow={user?.organisationName}
        title="My team"
        actions={
          <Button size="sm" onClick={() => setInviting(true)}>
            <LuUserPlus aria-hidden /> Invite someone
          </Button>
        }
      />
      <p className="muted small" style={{ marginTop: -12 }}>
        Add colleagues who work with Webinger. They only see the projects you choose, and billing only if you allow it. Webinger approves each new person before they get an invite.
      </p>

      {flash && (
        <div className="alert alert--ok" role="status">
          <LuCircleCheck aria-hidden style={{ marginTop: 2, flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{flash}</span>
          <Button variant="ghost" size="sm" onClick={() => setFlash(null)}>
            Dismiss
          </Button>
        </div>
      )}
      {update.error && (
        <div className="alert alert--error" role="alert">
          <LuCircleAlert aria-hidden style={{ marginTop: 2, flexShrink: 0 }} /> <span>{update.error.message}</span>
        </div>
      )}

      <Card flush>
        <div className="card__body">
          <table className="table table--rows">
            <thead>
              <tr>
                <th>Person</th>
                <th>Status</th>
                <th>Projects</th>
                <th>Billing</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => {
                const isOwner = m.role === 'CLIENT_OWNER';
                const removed = m.status === 'SUSPENDED';
                return (
                  <tr key={m.id} style={removed ? { opacity: 0.6 } : undefined}>
                    <td data-label="Person" className="td--title">
                      <div className="row">
                        <Avatar name={m.name} size={32} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>
                            {m.name} {m.id === user?.id && <span className="muted">(you)</span>}
                          </div>
                          <div className="list__meta">{m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Status">
                      {isOwner ? <Badge tone="info">Account owner</Badge> : <AccountStatusBadge status={m.status} clientView />}
                      <div className="list__meta">
                        {m.lastLoginAt ? `Last seen ${timeAgo(m.lastLoginAt)}` : m.invitedAt ? `Invited ${timeAgo(m.invitedAt)}` : ''}
                      </div>
                    </td>
                    <td data-label="Projects">
                      {isOwner ? (
                        <span className="small">All projects</span>
                      ) : (
                        <span className="small">{m.projectIds.map((id) => projectName[id]).filter(Boolean).join(', ') || 'None'}</span>
                      )}
                    </td>
                    <td data-label="Billing">
                      {isOwner ? (
                        <span className="small">Yes</span>
                      ) : (
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={m.canSeeBilling}
                            disabled={removed || update.isPending}
                            onChange={(e) => update.mutate({ id: m.id, patch: { canSeeBilling: e.target.checked } })}
                          />
                          <span className="switch__track" aria-hidden />
                          <span className="small">{m.canSeeBilling ? 'Can see' : 'Hidden'}</span>
                          <span className="sr-only"> billing for {m.name}</span>
                        </label>
                      )}
                    </td>
                    <td data-label="Actions" style={{ textAlign: 'right' }}>
                      {!isOwner &&
                        (confirmRemove === m.id ? (
                          <span className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <span className="small">Remove {m.name.split(' ')[0]}’s access?</span>
                            <Button
                              size="sm"
                              onClick={() =>
                                update.mutate(
                                  { id: m.id, patch: { suspended: true } },
                                  { onSuccess: () => { setConfirmRemove(null); setFlash(`${m.name} can no longer sign in.`); } },
                                )
                              }
                            >
                              Remove
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(null)}>
                              Cancel
                            </Button>
                          </span>
                        ) : removed ? (
                          <Button size="sm" variant="secondary" onClick={() => update.mutate({ id: m.id, patch: { suspended: false } })}>
                            Restore access
                          </Button>
                        ) : (
                          <span className="row" style={{ justifyContent: 'flex-end' }}>
                            <Button size="sm" variant="secondary" onClick={() => setEditing(m)}>
                              Projects
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(m.id)}>
                              Remove
                            </Button>
                          </span>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {reps.length === 0 && <p className="small muted" style={{ marginTop: 12 }}>You haven’t added anyone yet.</p>}
        </div>
      </Card>

      <Drawer open={inviting} onClose={() => setInviting(false)} title="Invite a colleague">
        {inviting && (
          <InviteForm
            projects={data.projects}
            onDone={(name) => {
              setInviting(false);
              setFlash(`${name} is waiting for Webinger’s approval. They will get an email invite once approved.`);
            }}
          />
        )}
      </Drawer>

      <Drawer open={!!editing} onClose={() => setEditing(null)} title={editing ? `Projects for ${editing.name}` : ''}>
        {editing && (
          <EditProjects
            member={editing}
            projects={data.projects}
            onDone={() => {
              setFlash(`Updated ${editing.name}’s projects.`);
              setEditing(null);
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

function ProjectChecks({ projects, value, onChange, error }) {
  return (
    <fieldset className="checks" aria-describedby={error ? 'proj-err' : undefined}>
      <legend className="field__label">Projects they can see</legend>
      {projects.map((p) => (
        <label key={p.id} className="checklist__item">
          <input
            type="checkbox"
            checked={value.includes(p.id)}
            onChange={(e) => onChange(e.target.checked ? [...value, p.id] : value.filter((x) => x !== p.id))}
          />
          <span>{p.name}</span>
        </label>
      ))}
      {error && (
        <span id="proj-err" className="field__error">
          <LuCircleAlert aria-hidden /> {error}
        </span>
      )}
    </fieldset>
  );
}

function InviteForm({ projects, onDone }) {
  const invite = useInviteRep();
  const [form, setForm] = useState({ name: '', email: '', title: '', projectIds: [], canSeeBilling: false });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    if (form.name.trim().length < 2) next.name = 'Enter their full name.';
    if (!EMAIL_RE.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (form.projectIds.length === 0) next.projectIds = 'Choose at least one project.';
    setErrors(next);
    if (Object.keys(next).length) return;
    invite.mutate(form, { onSuccess: (m) => onDone(m.name) });
  };

  return (
    <form onSubmit={submit} noValidate className="grid" style={{ gap: 16 }}>
      {invite.error && (
        <div className="alert alert--error" role="alert">
          <LuCircleAlert aria-hidden style={{ marginTop: 2, flexShrink: 0 }} /> <span>{invite.error.message}</span>
        </div>
      )}
      <Input label="Full name" value={form.name} onChange={set('name')} error={errors.name} autoComplete="off" />
      <Input label="Work email" type="email" inputMode="email" value={form.email} onChange={set('email')} error={errors.email} autoComplete="off" />
      <Input label="Job title (optional)" value={form.title} onChange={set('title')} />
      <ProjectChecks projects={projects} value={form.projectIds} onChange={(projectIds) => setForm({ ...form, projectIds })} error={errors.projectIds} />
      <label className="checklist__item">
        <input type="checkbox" checked={form.canSeeBilling} onChange={(e) => setForm({ ...form, canSeeBilling: e.target.checked })} />
        <span>
          Can see invoices and payments
          <span className="list__meta" style={{ display: 'block' }}>
            Leave off unless they handle payments.
          </span>
        </span>
      </label>
      <Button type="submit" loading={invite.isPending}>
        Send for approval
      </Button>
    </form>
  );
}

function EditProjects({ member, projects, onDone }) {
  const update = useUpdateRep();
  const [ids, setIds] = useState(member.projectIds);
  const [error, setError] = useState(null);
  const save = (e) => {
    e.preventDefault();
    if (ids.length === 0) {
      setError('Keep at least one project, or remove their access instead.');
      return;
    }
    setError(null);
    update.mutate({ id: member.id, patch: { projectIds: ids } }, { onSuccess: onDone });
  };
  return (
    <form onSubmit={save} noValidate className="grid" style={{ gap: 16 }}>
      {update.error && (
        <div className="alert alert--error" role="alert">
          <LuCircleAlert aria-hidden style={{ marginTop: 2, flexShrink: 0 }} /> <span>{update.error.message}</span>
        </div>
      )}
      <ProjectChecks projects={projects} value={ids} onChange={setIds} error={error} />
      <p className="list__meta">The change applies straight away.</p>
      <Button type="submit" loading={update.isPending}>
        Save
      </Button>
    </form>
  );
}
