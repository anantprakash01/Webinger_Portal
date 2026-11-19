import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LuChevronLeft, LuChevronRight, LuPlay, LuPlus, LuSquare, LuTrash2 } from 'react-icons/lu';
import { useMeAction, useMyTimesheet } from '@/api/queries';
import { Badge, Button, Card, Drawer, EmptyState, ErrorState, Input, PageHeader, PageSkeleton, Progress, cx, formatDate } from '@/components/ui';
import { hm } from '@/components/people';
import { FormError } from '@/pages/admin/finance/forms';

const shiftWeek = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
};
const todayIso = () => new Date().toISOString().slice(0, 10);
const dayHead = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });

/** Ticks once a second while a timer runs; the server holds the real start time. */
function useElapsed(startedAt) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  if (!startedAt) return '';
  const s = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function EmployeeTimesheet() {
  const [params, setParams] = useSearchParams();
  const week = params.get('week') ?? undefined;
  const adding = params.get('add') === '1';
  const { data, error, isPending, isFetching, refetch } = useMyTimesheet(week);
  const action = useMeAction();
  const [timer, setTimer] = useState({ projectId: '', taskId: '', note: '' });
  const elapsed = useElapsed(data?.running?.startedAt);

  const grid = useMemo(() => {
    if (!data) return [];
    const byProject = new Map();
    for (const e of data.entries) {
      const row = byProject.get(e.projectId) ?? { id: e.projectId, name: e.projectName, client: e.clientName, days: {} };
      row.days[e.date] = (row.days[e.date] ?? 0) + e.minutes;
      byProject.set(e.projectId, row);
    }
    return [...byProject.values()];
  }, [data]);

  if (isPending) return <PageSkeleton />;
  if (error) return <div className="page"><ErrorState message={error.message} onRetry={refetch} /></div>;
  const locked = data.status === 'SUBMITTED';
  const isCurrent = data.days.includes(todayIso());
  const pickProject = data.projects.find((p) => p.id === timer.projectId);
  const setWeek = (w) => setParams(w ? { week: w } : {});

  return (
    <div className="page" style={{ opacity: isFetching ? 0.8 : 1 }}>
      <PageHeader
        eyebrow={locked ? 'Submitted' : 'Log the hours you work on client projects'}
        title="Timesheet"
        actions={
          !locked && (
            <Button variant="secondary" onClick={() => setParams({ ...(week ? { week } : {}), add: '1' })}>
              <LuPlus aria-hidden /> Add time
            </Button>
          )
        }
      />
      <FormError error={action.error} />

      <Card className="timer-card">
        {data.running ? (
          <div className="timer">
            <div>
              <div className="timer__clock" aria-live="off">
                {elapsed}
              </div>
              <div className="small">
                {data.running.projectName}
                {data.running.taskTitle ? ` · ${data.running.taskTitle}` : ''}
              </div>
            </div>
            <Button loading={action.isPending} onClick={() => action.mutate({ kind: 'stopTimer' })}>
              <LuSquare aria-hidden /> Stop and log
            </Button>
          </div>
        ) : (
          <form
            className="timer timer--start"
            onSubmit={(e) => {
              e.preventDefault();
              action.mutate({ kind: 'startTimer', body: { projectId: timer.projectId, taskId: timer.taskId || undefined, note: timer.note || undefined } });
            }}
          >
            <label className="field">
              <span className="field__label">Project</span>
              <select className="field__input" value={timer.projectId} onChange={(e) => setTimer({ ...timer, projectId: e.target.value, taskId: '' })}>
                <option value="">Choose a project</option>
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.clientName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Task (optional)</span>
              <select className="field__input" value={timer.taskId} disabled={!pickProject?.tasks.length} onChange={(e) => setTimer({ ...timer, taskId: e.target.value })}>
                <option value="">No specific task</option>
                {(pickProject?.tasks ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={!timer.projectId || locked} loading={action.isPending}>
              <LuPlay aria-hidden /> Start timer
            </Button>
          </form>
        )}
      </Card>

      <div className="row week-picker" style={{ flexWrap: 'wrap' }}>
        <Button variant="secondary" size="sm" icon aria-label="Previous week" onClick={() => setWeek(shiftWeek(data.weekStart, -1))}>
          <LuChevronLeft />
        </Button>
        <span className="small">Week of {formatDate(data.weekStart)}</span>
        <Button variant="secondary" size="sm" icon aria-label="Next week" disabled={isCurrent} onClick={() => setWeek(shiftWeek(data.weekStart, 1))}>
          <LuChevronRight />
        </Button>
        {!isCurrent && (
          <Button variant="ghost" size="sm" onClick={() => setWeek(undefined)}>
            This week
          </Button>
        )}
        <span className="spacer" />
        {locked ? <Badge tone="ok">Submitted</Badge> : <Badge>Open</Badge>}
      </div>

      <div className="grid grid--stats">
        <div className="card stat">
          <div className="stat__label">Logged this week</div>
          <div className="stat__value">{hm(data.totals.minutes)}</div>
          <Progress value={(data.totals.minutes / Math.max(1, data.totals.capacityMinutes)) * 100} label="Logged against working hours" />
          <div className="stat__hint">of {hm(data.totals.capacityMinutes)} working time</div>
        </div>
        <div className="card stat">
          <div className="stat__label">Billable</div>
          <div className="stat__value">{hm(data.totals.billableMinutes)}</div>
          <div className="stat__hint">Client project work</div>
        </div>
      </div>

      <Card title="Week by project" flush>
        <div className="card__body table-scroll">
          {grid.length === 0 ? (
            <EmptyState title="Nothing logged this week">Start the timer when you begin a task, or add time you forgot.</EmptyState>
          ) : (
            <table className="grid-table ts-grid">
              <thead>
                <tr>
                  <th>Project</th>
                  {data.days.map((d) => (
                    <th key={d} className={cx('num', d === todayIso() && 'ts-grid__today')}>
                      {dayHead(d)}
                    </th>
                  ))}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {grid.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                      <div className="list__meta">{r.client}</div>
                    </td>
                    {data.days.map((d) => (
                      <td key={d} className={cx('num', d === todayIso() && 'ts-grid__today')}>
                        {r.days[d] ? hm(r.days[d]) : ''}
                      </td>
                    ))}
                    <td className="num">
                      <strong>{hm(Object.values(r.days).reduce((a, b) => a + b, 0))}</strong>
                    </td>
                  </tr>
                ))}
                <tr className="ts-grid__total">
                  <td>Total</td>
                  {data.days.map((d) => {
                    const m = data.entries.filter((e) => e.date === d).reduce((n, e) => n + e.minutes, 0);
                    return (
                      <td key={d} className="num">
                        {m ? hm(m) : ''}
                      </td>
                    );
                  })}
                  <td className="num">{hm(data.totals.minutes)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {data.entries.length > 0 && (
        <Card title="Entries">
          <ul className="list">
            {[...data.entries].reverse().map((e) => (
              <li key={e.id} className="list__item">
                <div className="list__main">
                  <div className="list__title small">
                    {hm(e.minutes)} · {e.projectName}
                  </div>
                  <div className="list__meta">
                    {formatDate(e.date)}
                    {e.taskTitle ? ` · ${e.taskTitle}` : ''}
                    {e.note ? ` · ${e.note}` : ''}
                  </div>
                </div>
                {!locked && (
                  <Button variant="ghost" size="sm" icon aria-label={`Delete ${hm(e.minutes)} on ${e.projectName}`} onClick={() => action.mutate({ kind: 'deleteTime', id: e.id })}>
                    <LuTrash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!locked && data.entries.length > 0 && (
        <div className="row">
          <Button variant="secondary" loading={action.isPending} disabled={!!data.running} onClick={() => action.mutate({ kind: 'submitWeek', weekStart: data.weekStart })}>
            Submit week
          </Button>
          <span className="small muted">{data.running ? 'Stop the timer first.' : 'Locks the week. Your manager can reopen it.'}</span>
        </div>
      )}

      <Drawer open={adding} onClose={() => setParams(week ? { week } : {})} title="Add time">
        {adding && <AddTimeForm sheet={data} onSaved={() => setParams(week ? { week } : {})} />}
      </Drawer>
    </div>
  );
}

function AddTimeForm({ sheet, onSaved }) {
  const action = useMeAction();
  const today = todayIso();
  const [f, setF] = useState({ date: sheet.days.includes(today) ? today : sheet.days[0], projectId: '', taskId: '', hours: '1', minutes: '0', note: '' });
  const [err, setErr] = useState(null);
  const project = sheet.projects.find((p) => p.id === f.projectId);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    const minutes = Number(f.hours || 0) * 60 + Number(f.minutes || 0);
    if (!f.projectId) return setErr('Choose a project.');
    if (!(minutes >= 5)) return setErr('Enter at least 5 minutes.');
    setErr(null);
    action.mutate({ kind: 'addTime', body: { date: f.date, projectId: f.projectId, taskId: f.taskId || undefined, minutes, note: f.note.trim() || undefined } }, { onSuccess: onSaved });
  };
  return (
    <form onSubmit={submit} noValidate className="grid" style={{ gap: 16 }}>
      <FormError error={action.error ?? err} />
      <label className="field">
        <span className="field__label">Day</span>
        <select className="field__input" value={f.date} onChange={set('date')}>
          {sheet.days
            .filter((d) => d <= today)
            .map((d) => (
              <option key={d} value={d}>
                {dayHead(d)}
              </option>
            ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Project</span>
        <select className="field__input" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value, taskId: '' })}>
          <option value="">Choose a project</option>
          {sheet.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.clientName}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Task (optional)</span>
        <select className="field__input" value={f.taskId} disabled={!project?.tasks.length} onChange={set('taskId')}>
          <option value="">No specific task</option>
          {(project?.tasks ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid--pair">
        <Input label="Hours" inputMode="numeric" value={f.hours} onChange={set('hours')} />
        <Input label="Minutes" inputMode="numeric" value={f.minutes} onChange={set('minutes')} />
      </div>
      <Input label="What did you do? (optional)" value={f.note} onChange={set('note')} />
      <Button type="submit" loading={action.isPending}>
        Save
      </Button>
    </form>
  );
}
