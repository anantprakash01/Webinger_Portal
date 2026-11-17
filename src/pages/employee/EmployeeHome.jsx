import { Link } from 'react-router-dom';
import { LuArrowRight } from 'react-icons/lu';
import { useDashboard } from '@/api/queries';
import { useAuth } from '@/auth/AuthContext';
import { TaskBadge, timeAgo } from '@/components/status';
import { Avatar, Badge, Card, EmptyState, ErrorState, PageHeader, PageSkeleton, Progress, Stat, daysFromToday, dueLabel, formatDate } from '@/components/ui';

function TaskList({ tasks, empty }) {
  if (tasks.length === 0) return <EmptyState title={empty} />;
  return (
    <ul className="list">
      {tasks.map((t) => {
        const late = daysFromToday(t.due) < 0;
        return (
          <li key={t.id} className="list__item">
            <div className="list__main">
              <Link to={`/employee/tasks?task=${t.id}`} className="list__title row-link">
                {t.priority === 'HIGH' && <Badge tone="danger">High</Badge>} {t.title}
              </Link>
              <div className="list__meta">
                {t.clientName} · {t.projectName} ·{' '}
                <span style={{ color: late ? 'var(--danger)' : undefined, fontWeight: late ? 600 : undefined }}>{dueLabel(t.due)}</span>
              </div>
            </div>
            <TaskBadge status={t.status} />
          </li>
        );
      })}
    </ul>
  );
}

export function EmployeeHome() {
  const { user } = useAuth();
  const { data, error, isPending: loading, refetch: reload } = useDashboard('employee');

  if (loading && !data) return <PageSkeleton />;
  if (error || !data) return <div className="page"><ErrorState message={error?.message ?? 'No data'} onRetry={reload} /></div>;

  const s = data.scorecard;
  const unread = data.messages.filter((m) => m.unread).length;

  return (
    <div className="page">
      <PageHeader eyebrow={user?.title} title="My day" />

      <div className="grid grid--stats">
        <Stat label="Due today" value={data.today.length} accent={data.today.some((t) => daysFromToday(t.due) < 0)} hint="Including overdue" />
        <Stat label="This week" value={data.thisWeek.length} />
        <Stat label="To review" value={data.reviewQueue.length} />
        <Stat label="Unread messages" value={unread} />
      </div>

      <div className="grid grid--2">
        <Card title="Today" action={<Link to="/employee/tasks" className="small row">All tasks <LuArrowRight aria-hidden /></Link>}>
          <TaskList tasks={data.today} empty="Nothing due today" />
        </Card>
        <Card title="Later this week">
          <TaskList tasks={data.thisWeek} empty="Nothing else due this week" />
        </Card>
        <Card title="Waiting for your review" action={<Link to="/employee/review" className="small row">Open queue <LuArrowRight aria-hidden /></Link>}>
          <TaskList tasks={data.reviewQueue} empty="Review queue is empty" />
        </Card>
        <Card title="Client messages" action={<Link to="/employee/messages" className="small row">Open chat <LuArrowRight aria-hidden /></Link>}>
          {data.messages.length === 0 ? (
            <EmptyState title="No new messages" />
          ) : (
            <ul className="list">
              {data.messages.map((m) => (
                <li key={m.id} className="list__item">
                  <Avatar name={m.from} size={32} />
                  <div className="list__main">
                    <div className="list__title">{m.from} {m.unread && <Badge tone="info">New</Badge>}</div>
                    <div className="list__meta" style={{ whiteSpace: 'normal' }}>{m.text}</div>
                    <div className="list__meta">{m.projectName} · {timeAgo(m.at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="My scorecard · last 30 days" action={<Link to="/employee/performance" className="small row">Details <LuArrowRight aria-hidden /></Link>}>
          <div style={{ display: 'grid', gap: 14 }}>
            <Meter label="On-time delivery" value={s.onTimeRate} />
            <Meter label="Passed review first time" value={s.firstPassQuality} />
            <Meter label={`Hours logged this week (${s.hoursLogged} of ${s.hoursCapacity})`} value={(s.hoursLogged / s.hoursCapacity) * 100} />
            <div className="row small">
              <span className="muted">Average client rating</span>
              <span className="spacer" />
              <strong>{s.clientRating.toFixed(1)} / 5</strong>
            </div>
          </div>
        </Card>
        <Card title="Announcements">
          <ul className="list">
            {data.announcements.map((a) => (
              <li key={a.id} className="list__item">
                <div className="list__main">
                  <div className="list__title" style={{ whiteSpace: 'normal' }}>{a.title}</div>
                  <div className="list__meta">{formatDate(a.at)}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Meter({ label, value }) {
  return (
    <div>
      <div className="row small" style={{ marginBottom: 4 }}>
        <span className="muted">{label}</span>
        <span className="spacer" />
        <strong>{Math.round(value)}%</strong>
      </div>
      <Progress value={value} label={label} />
    </div>
  );
}
