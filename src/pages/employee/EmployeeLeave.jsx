import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LuHouse, LuLogIn, LuLogOut, LuPlus } from 'react-icons/lu';
import { useMeAction, useMyAttendance, useMyLeave } from '@/api/queries';
import { Button, Card, Drawer, EmptyState, ErrorState, Input, PageHeader, PageSkeleton, formatDate } from '@/components/ui';
import { AttendanceBadge, AttendanceCell, LEAVE_TYPE, LEAVE_TYPE_OPTIONS, LeaveBadge } from '@/components/people';
import { FormError } from '@/pages/admin/finance/forms';

const todayIso = () => new Date().toISOString().slice(0, 10);

export function EmployeeLeave() {
  const [params, setParams] = useSearchParams();
  const att = useMyAttendance();
  const leave = useMyLeave();
  const action = useMeAction();
  const applying = params.get('apply') === '1';

  if (att.isPending || leave.isPending) return <PageSkeleton />;
  if (att.error || leave.error) return <div className="page"><ErrorState message={(att.error ?? leave.error).message} onRetry={() => (att.refetch(), leave.refetch())} /></div>;
  const t = att.data.today;
  const canCheckIn = t.status === 'UPCOMING' || t.status === 'ABSENT';

  return (
    <div className="page">
      <PageHeader
        eyebrow="Check in, see your days, ask for time off"
        title="Attendance and leave"
        actions={
          <Button onClick={() => setParams({ apply: '1' })}>
            <LuPlus aria-hidden /> Apply for leave
          </Button>
        }
      />
      <FormError error={action.error} />

      <Card title="Today">
        <div className="row checkin" style={{ flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div>
            <AttendanceBadge day={t} />
            <div className="small muted" style={{ marginTop: 4 }}>
              {t.checkIn ? `Checked in at ${t.checkIn}${t.checkOut ? `, out at ${t.checkOut}` : ''}` : canCheckIn ? 'You have not checked in yet.' : ''}
            </div>
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {canCheckIn && (
              <>
                <Button loading={action.isPending} onClick={() => action.mutate({ kind: 'checkIn', mode: 'OFFICE' })}>
                  <LuLogIn aria-hidden /> Check in at office
                </Button>
                <Button variant="secondary" loading={action.isPending} onClick={() => action.mutate({ kind: 'checkIn', mode: 'WFH' })}>
                  <LuHouse aria-hidden /> Working from home
                </Button>
              </>
            )}
            {t.checkIn && !t.checkOut && (
              <Button variant="secondary" loading={action.isPending} onClick={() => action.mutate({ kind: 'checkOut' })}>
                <LuLogOut aria-hidden /> Check out
              </Button>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid--stats">
        {leave.data.balances
          .filter((b) => b.type !== 'UNPAID')
          .map((b) => (
            <div key={b.type} className="card stat">
              <div className="stat__label">{LEAVE_TYPE[b.type]} leave</div>
              <div className="stat__value">{b.left}</div>
              <div className="stat__hint">
                left of {b.allowance} · {b.used} used{b.pending ? ` · ${b.pending} waiting` : ''}
              </div>
            </div>
          ))}
      </div>

      <div className="grid grid--2">
        <Card title="My requests">
          {leave.data.requests.length === 0 ? (
            <EmptyState title="No leave requests yet" />
          ) : (
            <ul className="list">
              {leave.data.requests.map((r) => (
                <li key={r.id} className="list__item list__item--wrap">
                  <div className="list__main">
                    <div className="list__title small">
                      {LEAVE_TYPE[r.type]} · {formatDate(r.from)}
                      {r.to !== r.from ? ` to ${formatDate(r.to)}` : ''} · {r.days} day{r.days === 1 ? '' : 's'}
                    </div>
                    <div className="list__meta">
                      {r.reason}
                      {r.note ? ` · ${r.decidedBy}: “${r.note}”` : ''}
                    </div>
                  </div>
                  <LeaveBadge status={r.status} />
                  {(r.status === 'PENDING' || (r.status === 'APPROVED' && r.from > todayIso())) && (
                    <Button variant="ghost" size="sm" onClick={() => action.mutate({ kind: 'cancelLeave', id: r.id })}>
                      Cancel
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Coming holidays">
          <ul className="list">
            {leave.data.holidays.map((h) => (
              <li key={h.date} className="list__item">
                <div className="list__main">
                  <div className="list__title small">{h.name}</div>
                </div>
                <span className="small">{formatDate(h.date)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="This month" action={<span className="small muted">{att.data.summary.present} in office · {att.data.summary.wfh} from home · {att.data.summary.leave} leave · {att.data.summary.absent} absent</span>}>
        <div className="att-month">
          {att.data.month.map((d) => (
            <div key={d.date} className="att-month__day">
              <span className="small muted">{new Date(`${d.date}T00:00:00Z`).getUTCDate()}</span>
              <AttendanceCell day={d} />
            </div>
          ))}
        </div>
      </Card>

      <Drawer open={applying} onClose={() => setParams({})} title="Apply for leave">
        {applying && <LeaveForm onSaved={() => setParams({})} />}
      </Drawer>
    </div>
  );
}

function LeaveForm({ onSaved }) {
  const action = useMeAction();
  const [f, setF] = useState({ type: 'CASUAL', from: '', to: '', reason: '' });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value, ...(k === 'from' && (!f.to || f.to < e.target.value) ? { to: e.target.value } : {}) });
  const submit = (e) => {
    e.preventDefault();
    const next = {};
    if (!f.from) next.from = 'Choose the first day.';
    if (!f.to || f.to < f.from) next.to = 'The last day is on or after the first.';
    if (f.reason.trim().length < 3) next.reason = 'Add a short reason.';
    setErrors(next);
    if (Object.keys(next).length) return;
    action.mutate({ kind: 'requestLeave', body: { type: f.type, from: f.from, to: f.to, reason: f.reason.trim() } }, { onSuccess: onSaved });
  };
  return (
    <form onSubmit={submit} noValidate className="grid" style={{ gap: 16 }}>
      <FormError error={action.error} />
      <label className="field">
        <span className="field__label">Type</span>
        <select className="field__input" value={f.type} onChange={set('type')}>
          {LEAVE_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid--pair">
        <Input label="First day" type="date" value={f.from} onChange={set('from')} error={errors.from} />
        <Input label="Last day" type="date" value={f.to} min={f.from} onChange={set('to')} error={errors.to} />
      </div>
      <Input label="Reason" value={f.reason} onChange={set('reason')} error={errors.reason} />
      <p className="small muted">Weekly offs and holidays are not counted. Sick leave can be recorded up to 7 days late. Your manager sees which of your tasks fall due while you are away and can hand them over.</p>
      <Button type="submit" loading={action.isPending}>
        Send request
      </Button>
    </form>
  );
}
