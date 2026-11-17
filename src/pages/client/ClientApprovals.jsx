import { Link, useSearchParams } from 'react-router-dom';
import { LuMessageSquare } from 'react-icons/lu';
import { useApprovals } from '@/api/queries';
import { useAuth } from '@/auth/AuthContext';
import { Card, EmptyState, ErrorState, PageHeader, PageSkeleton, Segmented } from '@/components/ui';
import { ApprovalStatusBadge, KindIcon, RevisionMeter } from '@/components/approvals';
import { timeAgo } from '@/components/status';

const TABS = [
  { value: 'PENDING', label: 'Waiting for you' },
  { value: 'CHANGES_REQUESTED', label: 'Changes requested' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'ALL', label: 'All' },
];

export function ClientApprovals() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('status') ?? 'PENDING';
  // One request for everything visible; tabs filter locally so counts are always right.
  const { data, error, isPending, refetch } = useApprovals();

  if (isPending) return <PageSkeleton />;
  if (error) return <div className="page"><ErrorState message={error.message} onRetry={refetch} /></div>;

  const count = (s) => data.filter((a) => a.status === s).length;
  const rows = tab === 'ALL' ? data : data.filter((a) => a.status === tab);
  const waiting = count('PENDING');

  return (
    <div className="page">
      <PageHeader eyebrow={user?.organisationName} title="Approvals" />
      <p className="muted small" style={{ marginTop: -12 }}>
        {waiting ? `${waiting} item${waiting === 1 ? '' : 's'} need${waiting === 1 ? 's' : ''} your decision. Work continues as soon as you approve or ask for changes.` : 'Nothing is waiting for you right now.'}
      </p>

      <div className="toolbar">
        <Segmented
          label="Show"
          value={tab}
          onChange={(v) => setParams(v === 'PENDING' ? {} : { status: v }, { replace: true })}
          options={TABS.map((t) => ({ ...t, label: t.value === 'ALL' ? t.label : `${t.label} (${count(t.value)})` }))}
        />
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState title={tab === 'PENDING' ? 'You are all caught up' : 'Nothing here yet'}>
            {tab === 'PENDING' ? 'We will notify you when something new is ready for review.' : null}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid--3">
          {rows.map((a) => (
            <Link key={a.id} to={`/client/approvals/${a.id}`} className="card approval-card">
              <div className="approval-card__thumb">
                <img src={a.thumbnailUrl} alt="" loading="lazy" />
                <span className="approval-card__kind">
                  <KindIcon kind={a.kind} /> v{a.versionNumber}
                </span>
              </div>
              <div className="approval-card__body">
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <div className="list__main">
                    <h2 className="approval-card__title">{a.title}</h2>
                    <div className="list__meta">
                      {a.projectName} · sent {timeAgo(a.submittedAt)}
                    </div>
                  </div>
                  <ApprovalStatusBadge status={a.status} />
                </div>
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <RevisionMeter used={a.revisionsUsed} allowed={a.revisionsAllowed} />
                  {a.commentCount > 0 && (
                    <span className="list__meta row" style={{ gap: 4 }}>
                      <LuMessageSquare aria-hidden /> {a.commentCount}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
