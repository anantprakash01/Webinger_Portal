import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LuArrowRight } from 'react-icons/lu';
import { useProjects } from '@/api/queries';
import { useAuth } from '@/auth/AuthContext';
import { Card, EmptyState, ErrorState, PageHeader, PageSkeleton, Pagination, Progress, SearchInput, Segmented, dueLabel } from '@/components/ui';
import { HealthBadge, ProjectStatusBadge } from '@/components/status';

const PAGE_SIZE = 12;

export function ClientProjects() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'ACTIVE';
  const q = params.get('q') ?? undefined;
  const page = Number(params.get('page') ?? 0) || 0;

  const set = (key, value) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, String(value));
        else next.delete(key);
        if (key !== 'page') next.delete('page');
        return next;
      },
      { replace: true },
    );

  const [text, setText] = useState(q ?? '');
  useEffect(() => {
    const id = setTimeout(() => (q ?? '') !== text.trim() && set('q', text.trim() || undefined), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const { data, error, isPending, isFetching, refetch } = useProjects({
    status: status === 'ALL' ? undefined : status,
    q,
    page,
    size: PAGE_SIZE,
  });

  if (isPending) return <PageSkeleton />;
  if (error && !data) return <div className="page"><ErrorState message={error.message} onRetry={refetch} /></div>;

  const isRep = user?.role === 'CLIENT_REP';

  return (
    <div className="page">
      <PageHeader eyebrow={user?.organisationName} title="Projects" />

      <div className="toolbar">
        <Segmented
          label="Project status"
          value={status}
          onChange={(v) => set('status', v === 'ACTIVE' ? undefined : v)}
          options={[
            { value: 'ACTIVE', label: 'Active' },
            { value: 'ON_HOLD', label: 'On hold' },
            { value: 'COMPLETED', label: 'Completed' },
            { value: 'ALL', label: 'All' },
          ]}
        />
        {/* Search only earns its place when there is something to search. */}
        {(data.totalItems > 6 || q) && <SearchInput label="Search projects" value={text} onChange={setText} placeholder="Search projects" />}
      </div>

      {data.items.length === 0 ? (
        <Card>
          <EmptyState title={q ? 'No projects match your search' : status === 'ACTIVE' ? 'No active projects' : 'Nothing here'}>
            {isRep && !q ? 'You only see projects you have been added to. Ask your company admin if one is missing.' : null}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid--3" style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity .15s' }}>
          {data.items.map((p) => (
            <Link key={p.id} to={`/client/projects/${p.id}`} className="card project-card">
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div className="list__main">
                  <div className="list__meta">{p.service}</div>
                  <h2 className="project-card__title">{p.name}</h2>
                </div>
                {p.status === 'ACTIVE' ? <HealthBadge health={p.health} /> : <ProjectStatusBadge status={p.status} />}
              </div>
              <div className="row">
                <Progress value={p.progress} label={`${p.name} progress`} />
                <strong className="small">{p.progress}%</strong>
              </div>
              <div className="small">
                {p.nextMilestone ? (
                  <>
                    <span className="muted">Next: </span>
                    {p.nextMilestone.title} · {dueLabel(p.nextMilestone.due)}
                  </>
                ) : (
                  <span className="muted">All milestones complete</span>
                )}
              </div>
              <div className="row list__meta">
                Led by {p.owner}
                <span className="spacer" />
                <LuArrowRight aria-hidden />
              </div>
            </Link>
          ))}
        </div>
      )}

      <Pagination page={data.page} totalPages={data.totalPages} totalItems={data.totalItems} size={data.size} onPage={(n) => set('page', n || undefined)} />
    </div>
  );
}
