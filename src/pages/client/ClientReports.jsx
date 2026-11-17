import { useSearchParams } from 'react-router-dom';
import { LuPrinter, LuSparkles } from 'react-icons/lu';
import { useMyReport } from '@/api/queries';
import { Button, Card, EmptyState, PageHeader, PageSkeleton, Select, formatDateLong } from '@/components/ui';
import { LoadError, NotVisible, isNotFound } from '@/components/projects';
import { monthLabel } from '@/components/finance';
import { MetricTile } from '@/components/reports';

export function ClientReports() {
  const [params, setParams] = useSearchParams();
  const month = params.get('month') ?? undefined;
  const { data: r, error, isPending, isFetching, refetch } = useMyReport(month);

  if (isPending) return <PageSkeleton />;
  if (isNotFound(error)) return <NotVisible what="Report" backTo="/client/reports" backLabel="Latest report" />;
  if (error) return <LoadError error={error} onRetry={refetch} />;

  if (!r.month) {
    return (
      <div className="page">
        <PageHeader title="Reports" />
        <Card>
          <EmptyState title="Your first monthly report is on its way">Reports are published in the first week of each month for the month before.</EmptyState>
        </Card>
      </div>
    );
  }

  return (
    <div className="page report" style={{ opacity: isFetching ? 0.7 : 1 }}>
      <PageHeader
        eyebrow={`${r.clientName} · monthly results`}
        title={monthLabel(r.month)}
        actions={
          <span className="row no-print">
            <Select
              label="Month"
              hideLabel
              value={r.month}
              onChange={(v) => setParams(v && v !== r.months[0] ? { month: v } : {})}
              options={r.months.map((m) => ({ value: m, label: monthLabel(m) }))}
            />
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <LuPrinter aria-hidden /> Print / PDF
            </Button>
          </span>
        }
      />

      <Card>
        <p className="report__summary">{r.summary}</p>
        <p className="small muted">
          Published {r.publishedAt ? formatDateLong(r.publishedAt.slice(0, 10)) : ''} by {r.publishedBy}. Changes compare with the month before.
        </p>
      </Card>

      {r.sections.length === 0 ? (
        <Card>
          <EmptyState title="No results to show for your projects">Ask your company owner if you need access to more services.</EmptyState>
        </Card>
      ) : (
        r.sections.map((s) => (
          <Card key={s.service} title={s.service}>
            {s.highlight && (
              <p className="report__highlight">
                <LuSparkles aria-hidden /> {s.highlight}
              </p>
            )}
            <div className="metrics">
              {s.metrics.map((m) => (
                <MetricTile key={m.key} metric={m} />
              ))}
            </div>
          </Card>
        ))
      )}
      <p className="list__meta">Numbers are entered by your Webinger team from your ad, social and analytics accounts. Live connections arrive in a later phase.</p>
    </div>
  );
}
