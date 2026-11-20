import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LuCircleCheck, LuPlus, LuTrash2 } from 'react-icons/lu';
import { api } from '@/api/client';
import { useAccountManagers, useClients, useServiceAction, useServices } from '@/api/queries';
import { useAuth } from '@/auth/AuthContext';
import { Badge, Button, Card, Drawer, ErrorState, Input, PageHeader, PageSkeleton, formatDate, formatINR } from '@/components/ui';
import { FormError } from './finance/forms';

const DEPARTMENTS = ['Operations', 'Social media', 'SEO', 'Design', 'Performance ads', 'Content'];
const isoDay = (n = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Service catalogue: price, timeline and the task template that turns into a project in one click (rule 3). */
export function AdminServices() {
  const { user } = useAuth();
  const isSuper = user?.role === 'SUPER_ADMIN';
  const [params, setParams] = useSearchParams();
  const { data, error, isPending, refetch } = useServices();
  const [created, setCreated] = useState(null);
  if (isPending) return <PageSkeleton />;
  if (error) return <div className="page"><ErrorState message={error.message} onRetry={refetch} /></div>;
  const edit = params.get('edit');
  const start = params.get('start');
  const editing = data.find((s) => s.id === edit);
  const starting = data.find((s) => s.id === start);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Templates are the engine of automation"
        title="Services and templates"
        actions={
          isSuper && (
            <Button onClick={() => setParams({ edit: 'new' })}>
              <LuPlus aria-hidden /> New service
            </Button>
          )
        }
      />
      {created && (
        <div className="alert alert--ok" role="status">
          <LuCircleCheck aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Project created with its tasks assigned. <Link to={`/admin/projects/${created.projectId}`}>Open the project</Link>
            {created.gaps.length ? `. Nobody free in ${created.gaps.join(', ')}: those tasks sit with the manager for now.` : '.'}
          </span>
        </div>
      )}
      <div className="service-grid">
        {data.map((s) => (
          <Card key={s.id} title={s.name} action={s.active ? <Badge tone="ok">Active</Badge> : <Badge>Inactive</Badge>}>
            <div className="grid" style={{ gap: 8 }}>
              <p className="small">{s.description}</p>
              <div className="small">
                <strong>{formatINR(s.price)}</strong>
                {s.billing === 'MONTHLY' ? ' a month' : ' one-off'} · {s.timelineWeeks} weeks · {s.revisions} revisions
              </div>
              <ol className="template-tasks small">
                {s.tasks.map((t) => (
                  <li key={t.id}>
                    {t.title} <span className="muted">· {t.department}, day {t.startDay}–{t.startDay + t.durationDays}</span>
                    {t.clientFacing && <span className="muted"> · client sees</span>}
                  </li>
                ))}
              </ol>
              <div className="small muted">{s.projectsCreated} projects created from this template</div>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <Button size="sm" disabled={!s.active} onClick={() => (setCreated(null), setParams({ start: s.id }))}>
                  Create project
                </Button>
                {isSuper && (
                  <Button size="sm" variant="secondary" onClick={() => setParams({ edit: s.id })}>
                    Edit
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
      <Drawer open={!!edit} onClose={() => setParams({})} title={editing ? `Edit ${editing.name}` : 'New service'}>
        {edit && <ServiceForm key={edit} service={editing} onDone={() => setParams({})} />}
      </Drawer>
      <Drawer open={!!starting} onClose={() => setParams({})} title={starting ? `New project: ${starting.name}` : ''}>
        {starting && <StartForm key={starting.id} service={starting} onDone={(r) => (setCreated(r), setParams({}))} />}
      </Drawer>
    </div>
  );
}

function StartForm({ service, onDone }) {
  const clients = useClients({});
  const staff = useAccountManagers();
  const action = useServiceAction();
  const [f, setF] = useState({ clientId: '', name: '', startDate: isoDay(1), ownerId: 'u-mgr' });
  const [preview, setPreview] = useState(null);
  const [pError, setPError] = useState(null);
  const set = (k) => (e) => (setF({ ...f, [k]: e.target.value }), setPreview(null));
  const live = (clients.data ?? []).filter((c) => c.status !== 'ENDED');
  const look = async () => {
    setPError(null);
    try {
      setPreview(await api.services.preview(service.id, f));
    } catch (e) {
      setPError(e);
    }
  };
  return (
    <form
      className="grid"
      style={{ gap: 14 }}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        action.mutate({ kind: 'project', id: service.id, body: f }, { onSuccess: onDone });
      }}
    >
      <FormError error={action.error ?? pError} />
      <label className="field">
        <span className="field__label">Client</span>
        <select className="field__input" value={f.clientId} onChange={set('clientId')}>
          <option value="">Choose a client</option>
          {live.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <Input label="Project name (optional)" value={f.name} onChange={set('name')} placeholder={`${service.name}: client name`} />
      <div className="grid grid--pair">
        <Input label="Start date" type="date" value={f.startDate} onChange={set('startDate')} />
        <label className="field">
          <span className="field__label">Project owner</span>
          <select className="field__input" value={f.ownerId} onChange={set('ownerId')}>
            {(staff.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Button type="button" variant="secondary" disabled={!f.clientId} onClick={look}>
        Preview tasks and people
      </Button>
      {preview && (
        <Card title="Plan">
          {preview.gaps.length > 0 && <p className="note small">Nobody available in {preview.gaps.join(', ')}. The manager gets those tasks for now.</p>}
          <ul className="list">
            {preview.tasks.map((t, i) => (
              <li key={i} className="list__item">
                <div className="list__main">
                  <div className="list__title small">{t.title}</div>
                  <div className="list__meta">
                    {t.assignee.name} ({t.department}) · due {formatDate(t.due)}
                    {t.clientFacing ? ' · reviewed before the client sees it' : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Button type="submit" loading={action.isPending} disabled={!f.clientId}>
        Create project and assign tasks
      </Button>
      <p className="small muted">People are picked from each task's department by current workload, skipping anyone on leave that day.</p>
    </form>
  );
}

function ServiceForm({ service, onDone }) {
  const action = useServiceAction();
  const [f, setF] = useState(
    service
      ? { ...service, price: String(service.price), timelineWeeks: String(service.timelineWeeks), revisions: String(service.revisions) }
      : { name: '', service: '', description: '', price: '', billing: 'MONTHLY', timelineWeeks: '4', revisions: '3', active: true, tasks: [] },
  );
  const [rows, setRows] = useState(service ? service.tasks.map((t) => ({ ...t, startDay: String(t.startDay), durationDays: String(t.durationDays) })) : [{ title: '', department: 'Social media', startDay: '0', durationDays: '3', priority: 'MEDIUM', clientFacing: false }]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setRow = (i, k, v) => setRows(rows.map((r, n) => (n === i ? { ...r, [k]: v } : r)));
  return (
    <form
      className="grid"
      style={{ gap: 14 }}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const body = {
          name: f.name,
          service: f.service || f.name,
          description: f.description,
          price: Number(f.price),
          billing: f.billing,
          timelineWeeks: Number(f.timelineWeeks),
          revisions: Number(f.revisions),
          active: !!f.active,
          tasks: rows.map((r) => ({ title: r.title, department: r.department, startDay: Number(r.startDay), durationDays: Number(r.durationDays), priority: r.priority, clientFacing: !!r.clientFacing })),
        };
        action.mutate(service ? { kind: 'update', id: service.id, body } : { kind: 'create', body }, { onSuccess: onDone });
      }}
    >
      <FormError error={action.error} />
      <div className="grid grid--pair">
        <Input label="Name" value={f.name} onChange={set('name')} />
        <Input label="Service type (as on projects)" value={f.service} onChange={set('service')} placeholder="Social media" />
      </div>
      <label className="field">
        <span className="field__label">What the client gets</span>
        <textarea className="field__input" rows={2} value={f.description} onChange={set('description')} />
      </label>
      <div className="grid grid--pair">
        <Input label="Price (₹, before GST)" inputMode="numeric" value={f.price} onChange={set('price')} />
        <label className="field">
          <span className="field__label">Billing</span>
          <select className="field__input" value={f.billing} onChange={set('billing')}>
            <option value="MONTHLY">Monthly</option>
            <option value="ONE_OFF">One-off</option>
          </select>
        </label>
      </div>
      <div className="grid grid--pair">
        <Input label="Timeline (weeks)" inputMode="numeric" value={f.timelineWeeks} onChange={set('timelineWeeks')} />
        <Input label="Revisions per deliverable" inputMode="numeric" value={f.revisions} onChange={set('revisions')} />
      </div>
      <label className="check">
        <input type="checkbox" checked={!!f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
        <span className="small">Active (can start projects)</span>
      </label>
      <h3 className="section-title">Task template</h3>
      {rows.map((r, i) => (
        <div key={i} className="card-form grid" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8 }}>
            <input className="field__input" aria-label={`Task ${i + 1} title`} placeholder="Task title" value={r.title} onChange={(e) => setRow(i, 'title', e.target.value)} />
            <Button type="button" variant="ghost" icon aria-label={`Remove task ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, n) => n !== i))}>
              <LuTrash2 />
            </Button>
          </div>
          <div className="grid grid--pair">
            <label className="field">
              <span className="field__label">Department</span>
              <select className="field__input" value={r.department} onChange={(e) => setRow(i, 'department', e.target.value)}>
                {DEPARTMENTS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Priority</span>
              <select className="field__input" value={r.priority} onChange={(e) => setRow(i, 'priority', e.target.value)}>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </label>
          </div>
          <div className="grid grid--pair">
            <Input label="Starts on working day" inputMode="numeric" value={r.startDay} onChange={(e) => setRow(i, 'startDay', e.target.value)} />
            <Input label="Takes (working days)" inputMode="numeric" value={r.durationDays} onChange={(e) => setRow(i, 'durationDays', e.target.value)} />
          </div>
          <label className="check">
            <input type="checkbox" checked={!!r.clientFacing} onChange={(e) => setRow(i, 'clientFacing', e.target.checked)} />
            <span className="small">Client sees this work (goes through internal review)</span>
          </label>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" disabled={rows.length >= 30} onClick={() => setRows([...rows, { title: '', department: 'Social media', startDay: '0', durationDays: '3', priority: 'MEDIUM', clientFacing: false }])}>
        <LuPlus aria-hidden /> Add task
      </Button>
      <Button type="submit" loading={action.isPending}>
        Save service
      </Button>
    </form>
  );
}
