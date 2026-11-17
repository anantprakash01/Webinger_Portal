import { Link } from 'react-router-dom';
import { LuCircleCheck, LuCircleDashed, LuCircleAlert } from 'react-icons/lu';
import { Avatar, Badge, EmptyState, ErrorState, PageHeader, Progress, cx, dueLabel, formatDate, formatDateLong } from './ui';
import { DeliverableBadge, VisibilityBadge, timeAgo } from './status';

/* ---------- Milestone timeline ---------- */
const MILESTONE_ICON = {
  DONE: <LuCircleCheck aria-hidden />,
  UPCOMING: <LuCircleDashed aria-hidden />,
  MISSED: <LuCircleAlert aria-hidden />,
};
const MILESTONE_TEXT = { DONE: 'Completed', UPCOMING: 'Upcoming', MISSED: 'Missed' };

export function MilestoneTimeline({ milestones }) {
  if (milestones.length === 0) return <EmptyState title="No milestones yet" />;
  const nextId = milestones.find((m) => m.status !== 'DONE')?.id;
  return (
    <ol className="timeline">
      {milestones.map((m) => (
        <li key={m.id} className={cx('timeline__item', `is-${m.status.toLowerCase()}`, m.id === nextId && 'is-next')}>
          <span className="timeline__dot">{MILESTONE_ICON[m.status]}</span>
          <div className="timeline__main">
            <div className="timeline__title">{m.title}</div>
            <div className="list__meta">
              <span className="sr-only">{MILESTONE_TEXT[m.status]}. </span>
              {m.status === 'DONE'
                ? `Completed ${formatDate(m.completedAt ?? m.due)}`
                : m.status === 'MISSED'
                  ? `Was due ${formatDate(m.due)} · ${dueLabel(m.due)}`
                  : dueLabel(m.due)}
            </div>
          </div>
          {m.id === nextId && <Badge tone={m.status === 'MISSED' ? 'danger' : 'info'}>Next</Badge>}
        </li>
      ))}
    </ol>
  );
}

/* ---------- Deliverables ---------- */
export function DeliverableList({ deliverables, milestones, staff, approvalsLink }) {
  if (deliverables.length === 0) return <EmptyState title="No deliverables yet" />;
  const msTitle = Object.fromEntries(milestones.map((m) => [m.id, m.title]));
  return (
    <ul className="list">
      {deliverables.map((d) => (
        <li key={d.id} className="list__item list__item--wrap">
          <div className="list__main">
            <div className="list__title">{d.title}</div>
            <div className="list__meta">
              {d.status === 'APPROVED' ? `Due ${formatDate(d.due)}` : dueLabel(d.due)}
              {d.milestoneId && msTitle[d.milestoneId] ? ` · ${msTitle[d.milestoneId]}` : ''}
              {d.revisionsUsed > 0 ? ` · revision ${d.revisionsUsed} of ${d.revisionsAllowed}` : ''}
            </div>
          </div>
          <DeliverableBadge status={d.status} staff={staff} />
          {!staff && d.status === 'CLIENT_APPROVAL' && approvalsLink && (
            <Link to={approvalsLink} className="btn btn--primary btn--sm">
              Review
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ---------- Team ---------- */
const PROJECT_ROLE = { OWNER: 'Project owner', BACKUP: 'Backup contact', MEMBER: null, CLIENT: 'Your team' };

export function TeamList({ team, staff }) {
  if (team.length === 0) return <EmptyState title="No team assigned yet" />;
  return (
    <ul className="list">
      {team.map((m) => (
        <li key={m.id} className="list__item">
          <Avatar name={m.name} size={32} />
          <div className="list__main">
            <div className="list__title">{m.name}</div>
            <div className="list__meta">{m.title}</div>
          </div>
          {m.projectRole === 'OWNER' && <Badge tone="info">{PROJECT_ROLE.OWNER}</Badge>}
          {m.projectRole === 'BACKUP' && <Badge>{PROJECT_ROLE.BACKUP}</Badge>}
          {m.projectRole === 'CLIENT' && <Badge>{staff ? 'Client' : PROJECT_ROLE.CLIENT}</Badge>}
        </li>
      ))}
    </ul>
  );
}

/* ---------- Activity feed ---------- */
export function ActivityFeed({ activity, staff, limit = 12 }) {
  if (activity.length === 0) return <EmptyState title="No activity yet" />;
  return (
    <ul className="feed">
      {activity.slice(0, limit).map((a) => (
        <li key={a.id} className="feed__item">
          <Avatar name={a.actor} size={28} />
          <div className="list__main">
            <div className="small">
              <strong>{a.actor}</strong> {lowerFirst(a.text)}
            </div>
            <div className="list__meta row" style={{ gap: 8 }}>
              <time dateTime={a.at}>{timeAgo(a.at)}</time>
              {staff && <VisibilityBadge visibility={a.visibility} />}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
const lowerFirst = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/* ---------- Header strip ---------- */
export function ProjectFacts({ project, extra }) {
  return (
    <div className="facts">
      <div className="facts__item facts__item--wide">
        <div className="facts__label">Progress</div>
        <div className="row">
          <Progress value={project.progress} label="Project progress" />
          <strong className="small">{project.progress}%</strong>
        </div>
      </div>
      <div className="facts__item">
        <div className="facts__label">Next milestone</div>
        <div className="facts__value">{project.nextMilestone ? project.nextMilestone.title : 'None'}</div>
        {project.nextMilestone && <div className="list__meta">{dueLabel(project.nextMilestone.due)}</div>}
      </div>
      <div className="facts__item">
        <div className="facts__label">Timeline</div>
        <div className="facts__value">{formatDateLong(project.startDate)}</div>
        {project.endDate && <div className="list__meta">to {formatDateLong(project.endDate)}</div>}
      </div>
      {extra}
    </div>
  );
}

/** 404 from the API: the record is missing or belongs to someone else. Both look the same on purpose. */
export function NotVisible({ what, backTo, backLabel }) {
  return (
    <div className="page">
      <PageHeader title={`${what} not found`} />
      <p className="muted">It may have been archived, or it isn’t shared with you.</p>
      <p>
        <Link to={backTo}>{backLabel}</Link>
      </p>
    </div>
  );
}

export const isNotFound = (err) => err && typeof err === 'object' && 'status' in err && err.status === 404;

export function LoadError({ error, onRetry }) {
  return (
    <div className="page">
      <ErrorState message={error?.message ?? 'Could not load this page.'} onRetry={onRetry} />
    </div>
  );
}
