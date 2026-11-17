import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LuX } from 'react-icons/lu';
import { useProjects } from '@/api/queries';
import { Button, Card, EmptyState, ErrorState, PageHeader, PageSkeleton, Pagination, Progress, SearchInput, Select, dueLabel } from '@/components/ui';
import { HEALTH_OPTIONS, HealthBadge, PROJECT_STATUS_OPTIONS, ProjectStatusBadge } from '@/components/status';

const FILTER_KEYS = ['q', 'status', 'health', 'service', 'ownerId', 'clientId'];
const PAGE_SIZE = 15;

export function AdminProjects() {
  const [params, setParams] = useSearchParams();
  const query = {
    q: params.get('q') ?? undefined,
    status: params.get('status') ?? undefined,
    health: params.get('health') ?? undefined,
    service: params.get('service') ?? undefined,
    ownerId: params.get('ownerId') ?? undefined,
    clientId: params.get('clientId') ?? undefined,
    page: Number(params.get('page') ?? 0) || 0,
    size: PAGE_SIZE,
  };

  const set = (key, value) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, String(value));
        else next.delete(key);
        if (key !== 'page') next.delete('page'); // any filter change goes back to page 1
        return next;
      },
      { replace: true },
    );

  // Search box types freely; the URL (and so the request) updates after a short pause.
  const [text, setText] = useState(query.q ?? '');
  useEffect(() => {
    const id = setTimeout(() => {
      if ((query.q ?? '') !== text.trim()) set('q', text.trim() || undefined);
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const { data, error, isPending, isFetching, refetch } = useProjects(query);

  if (isPending) return <PageSkeleton />;
  if (error && !data) return <div className="page"><ErrorState message={error.message} onRetry={refetch} /></div>;

  const { items, facets } = data;
  const filtered = FILTER_KEYS.some((k) => params.get(k));

  return (
    <div className="page">
      <PageHeader eyebrow={`${data.totalItems} project${data.totalItems === 1 ? '' : 's'}`} title="Projects" />

      <div className="toolbar">
        <SearchInput label="Search projects" value={text} onChange={setText} placeholder="Search project, client, owner" />
        <Select label="Status" hideLabel value={query.status} onChange={(v) => set('status', v)} allLabel="Any status" options={PROJECT_STATUS_OPTIONS} />
        <Select label="Health" hideLabel value={query.health} onChange={(v) => set('health', v)} allLabel="Any health" options={HEALTH_OPTIONS} />
        <Select
          label="Service"
          hideLabel
          value={query.service}
          onChange={(v) => set('service', v)}
          allLabel="All services"
          options={facets.services.map((s) => ({ value: s, label: s }))}
        />
        <Select
          label="Owner"
          hideLabel
          value={query.ownerId}
          onChange={(v) => set('ownerId', v)}
          allLabel="All owners"
          options={facets.owners.map((o) => ({ value: o.id, label: o.name }))}
        />
        <Select
          label="Client"
          hideLabel
          value={query.clientId}
          onChange={(v) => set('clientId', v)}
          allLabel="All clients"
          options={facets.clients.map((c) => ({ value: c.id, label: c.name }))}
        />
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setText('');
              setParams({}, { replace: true });
            }}
          >
            <LuX aria-hidden /> Clear
          </Button>
        )}
      </div>

      <Card flush>
        <div className="card__body" aria-busy={isFetching || undefined} style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity .15s' }}>
          {items.length === 0 ? (
            <EmptyState title={filtered ? 'No projects match these filters' : 'No projects yet'}>
              {filtered ? 'Try a different search or clear the filters.' : 'Projects appear here once a quote is accepted.'}
            </EmptyState>
          ) : (
            <table className="table table--rows">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Service</th>
                  <th>Owner</th>
                  <th style={{ width: 150 }}>Progress</th>
                  <th>Next milestone</th>
                  <th>Tasks</th>
                  <th>Health</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Project" className="td--title">
                      <Link to={`/admin/projects/${p.id}`} className="row-link">
                        {p.name}
                      </Link>
                      <div className="list__meta">
                        {p.clientName}
                        {p.status !== 'ACTIVE' && (
                          <>
                            {' '}
                            · <ProjectStatusBadge status={p.status} />
                          </>
                        )}
                      </div>
                    </td>
                    <td data-label="Service">{p.service}</td>
                    <td data-label="Owner">{p.owner}</td>
                    <td data-label="Progress">
                      <div className="row">
                        <Progress value={p.progress} label={`${p.name} progress`} />
                        <span className="small">{p.progress}%</span>
                      </div>
                    </td>
                    <td data-label="Next milestone">
                      {p.nextMilestone ? (
                        <>
                          <div className="small">{p.nextMilestone.title}</div>
                          <div className="list__meta">{dueLabel(p.nextMilestone.due)}</div>
                        </>
                      ) : (
                        <span className="muted">None</span>
                      )}
                    </td>
                    <td data-label="Tasks">
                      {p.openTasks ?? 0} open
                      {p.overdueTasks ? <div className="list__meta text-danger">{p.overdueTasks} overdue</div> : null}
                    </td>
                    <td data-label="Health">
                      <HealthBadge health={p.health} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <Pagination page={data.page} totalPages={data.totalPages} totalItems={data.totalItems} size={data.size} onPage={(p) => set('page', p || undefined)} />
    </div>
  );
}
