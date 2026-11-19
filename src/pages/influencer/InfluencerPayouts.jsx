import { Link } from 'react-router-dom';
import { useMyPayouts } from '@/api/queries';
import { Card, EmptyState, ErrorState, PageHeader, PageSkeleton, Stat, formatDate, formatINR } from '@/components/ui';
import { PayoutBadge } from '@/components/creators';

export function InfluencerPayouts() {
  const { data, error, isPending, refetch } = useMyPayouts();
  if (isPending) return <PageSkeleton />;
  if (error) return <div className="page"><ErrorState message={error.message} onRetry={refetch} /></div>;
  return (
    <div className="page">
      <PageHeader eyebrow="Requested automatically when your post is live with proof" title="Payouts" />
      <div className="grid grid--stats">
        <Stat label="On the way" value={formatINR(data.pending)} hint="After TDS" />
        <Stat label="Paid this year" value={formatINR(data.paidThisYear)} hint="After TDS" />
        <Stat label="TDS this year" value={formatINR(data.tdsThisYear)} hint="Claim it from Form 26AS" />
        <Stat label="Paid to" value={data.payoutMethod?.masked ?? 'Not set'} hint={<Link to="/influencer/profile?step=payout">Change</Link>} />
      </div>
      <Card title="Statement" flush>
        <div className="card__body">
          {data.payouts.length === 0 ? (
            <EmptyState title="No payouts yet" />
          ) : (
            <table className="table table--rows">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th className="num">Fee</th>
                  <th className="num">TDS</th>
                  <th className="num">You get</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.payouts.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Campaign" className="td--title">
                      {p.brand}: {p.campaignTitle}
                      <div className="list__meta">
                        Requested {formatDate(p.requestedAt.slice(0, 10))}
                        {p.paidAt ? ` · paid ${formatDate(p.paidAt.slice(0, 10))} · ${p.reference}` : ''}
                      </div>
                    </td>
                    <td data-label="Fee" className="num">{formatINR(p.gross)}</td>
                    <td data-label="TDS" className="num">
                      {formatINR(p.tds)} <span className="muted">({p.tdsRate}%)</span>
                    </td>
                    <td data-label="You get" className="num">
                      <strong>{formatINR(p.net)}</strong>
                    </td>
                    <td data-label="Status">
                      <PayoutBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
      <p className="list__meta">Payouts are approved by Webinger after the post is checked, usually within 7 working days. Larger payouts need the owner's approval.</p>
    </div>
  );
}
