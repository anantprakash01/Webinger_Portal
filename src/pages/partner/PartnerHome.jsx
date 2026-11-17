import { useDashboard } from '@/api/queries';
import { useAuth } from '@/auth/AuthContext';
import { InvoiceBadge } from '@/components/status';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, PageSkeleton, dueLabel, formatINR } from '@/components/ui';

const BRIEF = {
  NEW: ['info', 'New'],
  IN_PROGRESS: ['warn', 'In progress'],
  SUBMITTED: ['neutral', 'Submitted'],
  APPROVED: ['ok', 'Approved'],
};

export function PartnerHome() {
  const { user } = useAuth();
  const { data, error, isPending: loading, refetch: reload } = useDashboard('partner');

  if (loading && !data) return <PageSkeleton />;
  if (error || !data) return <div className="page"><ErrorState message={error?.message ?? 'No data'} onRetry={reload} /></div>;

  return (
    <div className="page">
      <PageHeader eyebrow={user?.title} title={user?.organisationName ?? 'Partner'} actions={<Button size="sm">Submit invoice</Button>} />
      <div className="grid grid--2">
        <Card title="Briefs shared with you">
          {data.briefs.length === 0 ? (
            <EmptyState title="No briefs yet" />
          ) : (
            <ul className="list">
              {data.briefs.map((b) => (
                <li key={b.id} className="list__item">
                  <div className="list__main">
                    <div className="list__title">{b.title}</div>
                    <div className="list__meta">{b.projectName} · {dueLabel(b.due)}</div>
                  </div>
                  <Badge tone={BRIEF[b.status][0]}>{BRIEF[b.status][1]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Your invoices">
          <ul className="list">
            {data.invoices.map((i) => (
              <li key={i.id} className="list__item">
                <div className="list__main">
                  <div className="list__title">{i.number}</div>
                  <div className="list__meta">{formatINR(i.amount)}</div>
                </div>
                <InvoiceBadge status={i.status} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
