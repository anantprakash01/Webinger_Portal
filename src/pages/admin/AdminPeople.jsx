import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';
import { useAttendanceWeek, useDecideLeave, useLeaveRequests, usePeople, useScorecard, useScorecards, useWorkload } from '@/api/queries';
import { useAuth } from '@/auth/AuthContext';
import { Avatar, Badge, Button, Card, Drawer, EmptyState, ErrorState, PageHeader, PageSkeleton, Segmented, Stat, dueLabel, formatDate } from '@/components/ui';
import { ROLE_LABEL } from '@/types';
import { percent } from '@/components/finance';
import { AttendanceBadge, AttendanceCell, LEAVE_TYPE, LeaveBadge, LoadBar, ScorecardView } from '@/components/people';
import { FormError } from './finance/forms';

const TABS = [
  { value: 'team', label: 'Team' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'leave', label: 'Leave' },
  { value: 'workload', label: 'Workload' },
  { value: 'scorecards', label: 'Scorecards' },
];
const Loading = () => <div className="skeleton" style={{ height: 320 }} />;
const shiftWeek = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
};
const dayHead = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });

export function AdminPeople() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'team';
  const person = params.get('person');
  const set = (k, v) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v) next.set(k, v);
      else next.delete(k);
      return next;
    });
  const pending = useLeaveRequests('PENDING');

  return (
    <div className="page">
      <PageHeader eyebrow="Departments, attendance, leave and performance" title="People" />
      <Segmented
        label="People sections"
        value={tab}
        onChange={(v) => setParams(v === 'team' ? {} : { tab: v })}
        options={TABS.map((t) => (t.value === 'leave' && pending.data?.length ? { ...t, label: `Leave (${pending.data.length})` } : t))}
      />
      {tab === 'team' && <TeamTab openPerson={(id) => set('person', id)} />}
      {tab === 'attendance' && <AttendanceTab week={params.get('week') ?? undefined} setWeek={(w) => set('week', w)} />}
      {tab === 'leave' && <LeaveTab openId={params.get('leave')} setOpen={(id) => set('leave', id)} />}
      {tab === 'workload' && <WorkloadTab week={params.get('week') ?? undefined} setWeek={(w) => set('week', w)} />}
      {tab === 'scorecards' && <ScorecardsTab openPerson={(id) => set('person', id)} />}

      <Drawer open={!!person} onClose={() => set('person', undefined)} title="Scorecard">
        {person && <PersonScorecard id={person} />}
      </Drawer>
    </div>
  );
}

function PersonScorecard({ id }) {
  const { data, error, isPending, refetch } = useScorecard(id);
  if (isPending) return <Loading />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  return (
    <div className="grid" style={{ gap: 12 }}>
      <div className="row">
        <Avatar name={data.name} />
        <div>
          <div className="list__title">{data.name}</div>
          <div className="list__meta">
            {data.title} · {data.department}
          </div>
        </div>
      </div>
      <ScorecardView card={data} />
    </div>
  );
}

/* ------------------------------------------------------------------ team */

function TeamTab({ openPerson }) {
  const { data, error, isPending, refetch } = usePeople();
  if (isPending) return <PageSkeleton />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  const inToday = data.filter((p) => p.today.status === 'PRESENT' || p.today.status === 'WFH').length;
  const away = data.filter((p) => p.today.status === 'LEAVE').length;
  const depts = [...new Set(data.map((p) => p.department))];
  return (
    <>
      <div className="grid grid--stats">
        <Stat label="Team" value={data.length} hint={`${depts.length} departments`} />
        <Stat label="In today" value={inToday} hint={`${data.filter((p) => p.today.status === 'WFH').length} working from home`} />
        <Stat label="On leave today" value={away} hint={`${data.filter((p) => p.nextLeave && p.today.status !== 'LEAVE').length} more in the next 2 weeks`} />
        <Stat label="Overdue tasks" value={data.reduce((n, p) => n + p.overdueTasks, 0)} hint="Across the team" accent={data.some((p) => p.overdueTasks > 0)} />
      </div>
      {depts.map((dept) => (
        <Card key={dept} title={dept} flush>
          <div className="card__body">
            <table className="table table--rows">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Today</th>
                  <th>This week</th>
                  <th>Tasks</th>
                  <th>Leave</th>
                </tr>
              </thead>
              <tbody>
                {data
                  .filter((p) => p.department === dept)
                  .map((p) => (
                    <tr key={p.id}>
                      <td data-label="Person" className="td--title">
                        <div className="row">
                          <Avatar name={p.name} size={32} />
                          <div>
                            <button type="button" className="row-link link-btn" onClick={() => openPerson(p.id)}>
                              {p.name}
                            </button>
                            <div className="list__meta">
                              {p.title} · {ROLE_LABEL[p.role]}
                              {p.status === 'INVITED' && ' · invite pending'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td data-label="Today">
                        <AttendanceBadge day={p.today} />
                        {p.today.checkIn && <div className="list__meta">in {p.today.checkIn}</div>}
                      </td>
                      <td data-label="This week">
                        {p.capacityHours ? <LoadBar load={p.plannedHours / p.capacityHours} label={`${p.plannedHours} of ${p.capacityHours} hours planned`} /> : '—'}
                        <div className="list__meta">{p.loggedHours} h logged</div>
                      </td>
                      <td data-label="Tasks">
                        {p.openTasks} open
                        {p.overdueTasks > 0 && <div className="list__meta text-danger">{p.overdueTasks} overdue</div>}
                      </td>
                      <td data-label="Leave">{p.nextLeave ? `${formatDate(p.nextLeave.from)}–${formatDate(p.nextLeave.to)}` : '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </>
  );
}

/* ------------------------------------------------------------ attendance */

function WeekPicker({ weekStart, setWeek }) {
  return (
    <div className="row week-picker">
      <Button variant="secondary" size="sm" icon aria-label="Previous week" onClick={() => setWeek(shiftWeek(weekStart, -1))}>
        <LuChevronLeft />
      </Button>
      <span className="small">Week of {formatDate(weekStart)}</span>
      <Button variant="secondary" size="sm" icon aria-label="Next week" onClick={() => setWeek(shiftWeek(weekStart, 1))}>
        <LuChevronRight />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setWeek(undefined)}>
        This week
      </Button>
    </div>
  );
}

function AttendanceTab({ week, setWeek }) {
  const { data, error, isPending, refetch } = useAttendanceWeek(week);
  if (isPending) return <Loading />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  return (
    <>
      <WeekPicker weekStart={data.weekStart} setWeek={setWeek} />
      <Card flush>
        <div className="card__body table-scroll">
          <table className="grid-table att-table">
            <thead>
              <tr>
                <th>Person</th>
                {data.days.map((d) => (
                  <th key={d} className="num">
                    {dayHead(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.people.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                    <div className="list__meta">{p.department}</div>
                  </td>
                  {p.days.map((d) => (
                    <td key={d.date} className="num">
                      <AttendanceCell day={d} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="list__meta">P in office · H working from home · L approved leave · A absent (no check-in, no leave) · Hol holiday · – weekly off. Hover a cell for times.</p>
    </>
  );
}

/* ----------------------------------------------------------------- leave */

function LeaveTab({ openId, setOpen }) {
  const { data, error, isPending, refetch } = useLeaveRequests();
  if (isPending) return <Loading />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  const pending = data.filter((l) => l.status === 'PENDING');
  const rest = data.filter((l) => l.status !== 'PENDING');
  const open = data.find((l) => l.id === openId);
  return (
    <>
      <Card title={`Waiting for a decision (${pending.length})`}>
        {pending.length === 0 ? (
          <EmptyState title="Nothing to approve" />
        ) : (
          <ul className="list">
            {pending.map((l) => (
              <li key={l.id} className="list__item list__item--wrap">
                <div className="list__main">
                  <div className="list__title">
                    {l.userName} · {LEAVE_TYPE[l.type]} leave, {l.days} day{l.days === 1 ? '' : 's'}
                  </div>
                  <div className="list__meta">
                    {formatDate(l.from)}
                    {l.to !== l.from ? ` to ${formatDate(l.to)}` : ''} · {l.reason}
                    {l.affectedTasks?.length ? ` · ${l.affectedTasks.length} task${l.affectedTasks.length === 1 ? '' : 's'} due while away` : ''}
                  </div>
                </div>
                <Button size="sm" onClick={() => setOpen(l.id)}>
                  Review
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Decided" flush>
        <div className="card__body">
          <table className="table table--rows">
            <thead>
              <tr>
                <th>Person</th>
                <th>Dates</th>
                <th>Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rest.map((l) => (
                <tr key={l.id}>
                  <td data-label="Person" className="td--title">
                    {l.userName}
                    <div className="list__meta">{l.reason}</div>
                  </td>
                  <td data-label="Dates">
                    {formatDate(l.from)}
                    {l.to !== l.from ? `–${formatDate(l.to)}` : ''} · {l.days} d
                  </td>
                  <td data-label="Type">{LEAVE_TYPE[l.type]}</td>
                  <td data-label="Status">
                    <LeaveBadge status={l.status} />
                    {l.decidedBy && <div className="list__meta">by {l.decidedBy}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Drawer open={!!open} onClose={() => setOpen(undefined)} title="Leave request">
        {open && <LeaveDecision key={open.id} request={open} onDone={() => setOpen(undefined)} />}
      </Drawer>
    </>
  );
}

function LeaveDecision({ request: l, onDone }) {
  const { user } = useAuth();
  const decide = useDecideLeave();
  const people = usePeople();
  const [handover, setHandover] = useState(() => Object.fromEntries((l.affectedTasks ?? []).map((t) => [t.id, t.suggested?.id ?? ''])));
  const [note, setNote] = useState('');
  const [declining, setDeclining] = useState(false);
  const own = l.userId === user?.id;
  const colleagues = (people.data ?? []).filter((p) => p.id !== l.userId && p.status === 'ACTIVE');

  const approve = () => {
    const reassign = Object.fromEntries(Object.entries(handover).filter(([, v]) => v));
    decide.mutate({ id: l.id, body: { decision: 'APPROVE', note: note.trim() || undefined, reassign } }, { onSuccess: onDone });
  };
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div>
        <div className="list__title">{l.userName}</div>
        <div className="small muted">
          {LEAVE_TYPE[l.type]} leave · {formatDate(l.from)}
          {l.to !== l.from ? ` to ${formatDate(l.to)}` : ''} · {l.days} working day{l.days === 1 ? '' : 's'}
        </div>
        <p className="small">“{l.reason}”</p>
      </div>
      <FormError error={decide.error} />
      {own && <p className="note small">This is your own request. Another approver has to decide it.</p>}

      <section className="grid" style={{ gap: 8 }}>
        <h3 className="section-title">Work due while away</h3>
        {!l.affectedTasks?.length ? (
          <p className="small muted">No open tasks fall due during this leave.</p>
        ) : (
          <ul className="list">
            {l.affectedTasks.map((t) => (
              <li key={t.id} className="list__item list__item--wrap">
                <div className="list__main">
                  <div className="list__title small">{t.title}</div>
                  <div className="list__meta">
                    {t.projectName} · {dueLabel(t.due)}
                  </div>
                </div>
                <label className="sr-only" htmlFor={`ho-${t.id}`}>
                  Hand over {t.title} to
                </label>
                <select id={`ho-${t.id}`} className="field__input" style={{ width: 'auto' }} value={handover[t.id]} onChange={(e) => setHandover({ ...handover, [t.id]: e.target.value })}>
                  <option value="">Keep with {l.userName.split(' ')[0]}</option>
                  {colleagues.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {t.suggested?.id === c.id ? ' (suggested)' : ''}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
        {l.affectedTasks?.length > 0 && <p className="list__meta">Suggestions: same department first, then whoever has the lightest week and is not away that day.</p>}
      </section>

      <label className="field">
        <span className="field__label">{declining ? 'Why not? Suggest other dates if you can' : 'Note (optional)'}</span>
        <textarea className="field__input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {!declining ? (
          <>
            <Button loading={decide.isPending} disabled={own} onClick={approve}>
              Approve{Object.values(handover).some(Boolean) ? ' and hand over' : ''}
            </Button>
            <Button variant="secondary" disabled={own} onClick={() => setDeclining(true)}>
              Decline
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              loading={decide.isPending}
              disabled={note.trim().length < 3}
              onClick={() => decide.mutate({ id: l.id, body: { decision: 'DECLINE', note: note.trim() } }, { onSuccess: onDone })}
            >
              Decline request
            </Button>
            <Button variant="ghost" onClick={() => setDeclining(false)}>
              Back
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- workload */

function WorkloadTab({ week, setWeek }) {
  const { data, error, isPending, refetch } = useWorkload(week);
  const [open, setOpen] = useState(null);
  if (isPending) return <Loading />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  const over = data.rows.filter((r) => r.load > 1.1).length;
  return (
    <>
      <WeekPicker weekStart={data.weekStart} setWeek={setWeek} />
      {over > 0 && (
        <div className="alert alert--warn">
          {over} {over === 1 ? 'person is' : 'people are'} planned above 110% this week. Move work or deadlines before it slips.
        </div>
      )}
      <Card flush>
        <div className="card__body">
          <table className="table table--rows">
            <thead>
              <tr>
                <th>Person</th>
                <th>Planned vs available</th>
                <th>Hours</th>
                <th>Timesheet</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td data-label="Person" className="td--title">
                    <button type="button" className="row-link link-btn" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                      {r.name}
                    </button>
                    <div className="list__meta">{r.department}</div>
                    {open === r.id && (
                      <ul className="list workload-tasks">
                        {r.tasks.length === 0 && <li className="list__meta">No open tasks due this week.</li>}
                        {r.tasks.map((t) => (
                          <li key={t.id} className="list__meta">
                            {t.title} · {t.projectName} · {dueLabel(t.due)} · {t.hours} h
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td data-label="Planned vs available">
                    <LoadBar load={r.load} label={`${r.plannedHours} of ${r.capacityHours - r.leaveHours} hours planned`} />
                  </td>
                  <td data-label="Hours">
                    {r.plannedHours} planned / {r.capacityHours - r.leaveHours} available
                    <div className="list__meta">
                      {r.loggedHours} logged{r.leaveHours ? ` · ${r.leaveHours} h on leave` : ''}
                    </div>
                  </td>
                  <td data-label="Timesheet">{r.timesheet === 'SUBMITTED' ? <Badge tone="ok">Submitted</Badge> : <Badge>Open</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="list__meta">
        Planned = open tasks due this week (overdue ones included), estimated 6 / 4 / 2 hours for high / medium / low priority until tasks carry their own estimate. Work waiting
        on the client is left out. Available = working days × 8 hours minus approved leave.
      </p>
    </>
  );
}

/* ------------------------------------------------------------ scorecards */

function ScorecardsTab({ openPerson }) {
  const { data, error, isPending, refetch } = useScorecards();
  if (isPending) return <Loading />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  return (
    <>
      <Card flush>
        <div className="card__body">
          <table className="table table--rows">
            <thead>
              <tr>
                <th>Person</th>
                <th className="num">On time</th>
                <th className="num">First-pass quality</th>
                <th className="num">Utilisation</th>
                <th className="num">Client rating</th>
                <th className="num">First reply</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.userId}>
                  <td data-label="Person" className="td--title">
                    <button type="button" className="row-link link-btn" onClick={() => openPerson(c.userId)}>
                      {c.name}
                    </button>
                    <div className="list__meta">{c.department}</div>
                  </td>
                  <td data-label="On time" className="num">{percent(c.onTimeRate)}</td>
                  <td data-label="First-pass quality" className="num">{percent(c.firstPassQuality)}</td>
                  <td data-label="Utilisation" className="num">{percent(c.utilisation)}</td>
                  <td data-label="Client rating" className="num">{c.clientRating?.toFixed(1) ?? '—'}</td>
                  <td data-label="First reply" className="num">{c.responseMinutes !== undefined ? `${c.responseMinutes} min` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="list__meta">
        Last 30 days. Each person sees only their own scorecard, under My performance in the team portal. Open a name for the six-month trend and notes.
      </p>
    </>
  );
}
