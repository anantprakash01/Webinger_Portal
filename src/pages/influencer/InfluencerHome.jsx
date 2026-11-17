import { LuBadgeCheck } from 'react-icons/lu';
import { useDashboard } from '@/api/queries';
import { useAuth } from '@/auth/AuthContext';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, PageSkeleton, Progress, Stat, dueLabel, formatINR } from '@/components/ui';

export function InfluencerHome() {
  const { user } = useAuth();
  const { data, error, isPending: loading, refetch: reload } = useDashboard('influencer');

  if (loading && !data) return <PageSkeleton />;
  if (error || !data) return <div className="page"><ErrorState message={error?.message ?? 'No data'} onRetry={reload} /></div>;

  return (
    <div className="page">
      <PageHeader
        eyebrow={user?.title}
        title={`Hi ${user?.name.split(' ')[0]}`}
        actions={
          data.verification === 'VERIFIED' ? (
            <Badge tone="ok"><LuBadgeCheck aria-hidden /> Verified creator</Badge>
          ) : (
            <Badge tone="warn">Verification {data.verification.toLowerCase()}</Badge>
          )
        }
      />

      <div className="grid grid--stats">
        <Stat label="New invites" value={data.invites.length} accent={data.invites.length > 0} />
        <Stat label="Active campaigns" value={data.active.length} />
        <Stat label="Payout pending" value={formatINR(data.payouts.pending)} />
        <Stat label="Paid this year" value={formatINR(data.payouts.paidThisYear)} />
      </div>

      <div className="grid grid--2">
        <Card title="Campaign invites">
          {data.invites.length === 0 ? (
            <EmptyState title="No invites right now">A complete profile gets more invites.</EmptyState>
          ) : (
            <ul className="list">
              {data.invites.map((i) => (
                <li key={i.id} className="list__item" style={{ flexWrap: 'wrap' }}>
                  <div className="list__main">
                    <div className="list__title">{i.brand} · {i.campaign}</div>
                    <div className="list__meta">{i.deliverable} · {formatINR(i.fee)} · reply {dueLabel(i.respondBy).toLowerCase()}</div>
                  </div>
                  <div className="row">
                    <Button size="sm" variant="secondary">Counter</Button>
                    <Button size="sm">Accept</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Active campaigns">
          <ul className="list">
            {data.active.map((c) => (
              <li key={c.id} className="list__item">
                <div className="list__main">
                  <div className="list__title">{c.brand} · {c.campaign}</div>
                  <div className="list__meta">{c.step} · {dueLabel(c.due)}</div>
                </div>
                <Button size="sm" variant="secondary">Upload</Button>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Profile strength">
          <div className="row small" style={{ marginBottom: 6 }}>
            <span className="muted">Complete</span>
            <span className="spacer" />
            <strong>{data.profileCompleteness}%</strong>
          </div>
          <Progress value={data.profileCompleteness} label="Profile completeness" />
          <p className="small muted" style={{ marginTop: 12 }}>
            Add audience location screenshots to reach 100%. Brands see verified, complete profiles first.
          </p>
        </Card>
      </div>
    </div>
  );
}
