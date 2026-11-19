import { useMyPerformance } from '@/api/queries';
import { ErrorState, PageHeader, PageSkeleton } from '@/components/ui';
import { ScorecardView } from '@/components/people';

/** Only your own numbers (managers see the team under People). */
export function EmployeePerformance() {
  const { data, error, isPending, refetch } = useMyPerformance();
  if (isPending) return <PageSkeleton />;
  if (error) return <div className="page"><ErrorState message={error.message} onRetry={refetch} /></div>;
  return (
    <div className="page">
      <PageHeader eyebrow="Last 30 days · only you and your managers see this" title="My performance" />
      <ScorecardView card={data} />
    </div>
  );
}
