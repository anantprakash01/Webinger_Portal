import { Link } from 'react-router-dom';
import { LuArrowRight, LuTriangleAlert } from 'react-icons/lu';
import { useDashboard } from '@/api/queries';
import { useAuth } from '@/auth/AuthContext';
import { HealthBadge, InvoiceBadge } from '@/components/status';
import { Button, Card, EmptyState, ErrorState, PageHeader, PageSkeleton, Progress, Stat, dueLabel, formatINR } from '@/components/ui';

export function AdminHome() {
  const { user } = useAuth();
  const { data, error, isPending: loading, refetch: reload } = useDashboard('admin');

  if (loading && !data) return <PageSkeleton />;
  if (error || !data) return <div className="page"><ErrorState message={error?.message ?? 'No data'} onRetry={reload} /></div>;

  const totalProjects = data.healthMix.GREEN + data.healthMix.AMBER + data.healthMix.RED;
  const isOwner = user?.role === 'SUPER_ADMIN';

  return (
    <div className="page">
      <PageHeader
        eyebrow={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`Good ${greeting()}, ${user?.name.split(' ')[0]}`}
        actions={<Button variant="secondary" size="sm">Download report</Button>}
      />

      <div className="grid grid--stats">
        {isOwner && <Stat label="Revenue this month" value={formatINR(data.revenueThisMonth)} hint="Paid invoices" />}
        {isOwner && <Stat label="Monthly recurring" value={formatINR(data.recurringRevenue)} hint="Active retainers" />}
        <Stat label="Outstanding" value={formatINR(data.outstanding)} hint={`${data.overdueInvoices.length} invoices overdue`} accent={data.overdueInvoices.length > 0} />
        <Stat label="Overdue tasks" value={data.overdueTasks} hint="Across all teams" accent={data.overdueTasks > 0} />
        <Stat label="Active clients" value={data.activeClients} />
        <Stat label="Client satisfaction" value={`${data.satisfaction.toFixed(1)} / 5`} hint="Last 30 days" />
      </div>

      <div className="grid grid--2">
        <Card title="Waiting on you" action={<span className="muted small">{data.waitingOnYou.length} items</span>}>
          {data.waitingOnYou.length === 0 ? (
            <EmptyState title="Nothing needs you right now" />
          ) : (
            <ul className="list">
              {data.waitingOnYou.map((w) => (
                <li key={w.id} className="list__item">
                  <LuTriangleAlert aria-hidden color="var(--warn)" />
                  <div className="list__main">
                    <div className="list__title" style={{ whiteSpace: 'normal' }}>{w.text}</div>
                  </div>
                  <Button size="sm" variant="secondary">Review</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Project health"
          action={<Link to="/admin/projects" className="small row">All projects <LuArrowRight aria-hidden /></Link>}
        >
          <div className="row small" style={{ gap: 16, marginBottom: 12 }}>
            <span><strong>{data.healthMix.GREEN}</strong> on track</span>
            <span><strong>{data.healthMix.AMBER}</strong> need attention</span>
            <span><strong>{data.healthMix.RED}</strong> at risk</span>
            <span className="muted">of {totalProjects}</span>
          </div>
          <ul className="list">
            {data.projectsAtRisk.map((p) => (
              <li key={p.id} className="list__item">
                <div className="list__main">
                  <div className="list__title">{p.name} · {p.clientName}</div>
                  <div className="list__meta">
                    {p.nextMilestone ? `${p.nextMilestone.title}: ${dueLabel(p.nextMilestone.due)}` : 'No milestone set'} · {p.owner}
                  </div>
                </div>
                <HealthBadge health={p.health} />
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Team load this week">
          <ul className="list">
            {data.teamLoad.map((t) => {
              const pct = (t.assignedHours / t.capacityHours) * 100;
              return (
                <li key={t.name} className="list__item" style={{ display: 'grid', gap: 6 }}>
                  <div className="row">
                    <span className="list__title">{t.name}</span>
                    <span className="list__meta">{t.department}</span>
                    <span className="spacer" />
                    <span className="small" style={{ fontWeight: 600, color: pct > 100 ? 'var(--danger)' : undefined }}>
                      {t.assignedHours} / {t.capacityHours} h
                    </span>
                  </div>
                  <Progress value={pct} label={`${t.name} load`} />
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Overdue invoices">
          {data.overdueInvoices.length === 0 ? (
            <EmptyState title="No overdue invoices" />
          ) : (
            <table className="table">
              <thead>
                <tr><th>Client</th><th>Invoice</th><th>Amount</th><th>Status</th></tr>
              </thead>
              <tbody>
                {data.overdueInvoices.map((i) => (
                  <tr key={i.id}>
                    <td data-label="Client"><strong>{i.clientName}</strong></td>
                    <td data-label="Invoice">{i.number}<div className="list__meta">{dueLabel(i.due)}</div></td>
                    <td data-label="Amount">{formatINR(i.amount)}</td>
                    <td data-label="Status"><InvoiceBadge status={i.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Sales pipeline">
          <ul className="list">
            {data.pipeline.map((s) => (
              <li key={s.stage} className="list__item">
                <div className="list__main">
                  <div className="list__title">{s.stage}</div>
                  <div className="list__meta">{s.count} deals</div>
                </div>
                <strong className="small">{formatINR(s.value)}</strong>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}
