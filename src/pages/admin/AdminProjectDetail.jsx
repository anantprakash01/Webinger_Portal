import { useCallback, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { LuArrowLeft, LuCircleAlert, LuColumns3, LuList, LuX } from 'react-icons/lu';
import { useProject, useUpdateTask } from '@/api/queries';
import { Button, Card, EmptyState, PageHeader, PageSkeleton, Segmented, Select } from '@/components/ui';
import { HealthBadge, ProjectStatusBadge } from '@/components/status';
import { ActivityFeed, DeliverableList, LoadError, MilestoneTimeline, NotVisible, ProjectFacts, TeamList, isNotFound } from '@/components/projects';
import { STATUS_OPTIONS, TaskBoard, TaskDrawer, TaskRow } from '@/components/tasks';

export function AdminProjectDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const openId = params.get('task');
  const [view, setView] = useState('list');
  const [status, setStatus] = useState();
  const { data: p, error, isPending, refetch } = useProject(id);
  const update = useUpdateTask();

  const setTask = useCallback(
    (taskId) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        if (taskId) next.set('task', taskId);
        else next.delete('task');
        return next;
      }),
    [setParams],
  );
  const closeTask = useCallback(() => setTask(undefined), [setTask]);

  const assignees = useMemo(
    () => (p?.team ?? []).filter((m) => m.projectRole !== 'CLIENT').map((m) => ({ id: m.id, name: m.name })),
    [p?.team],
  );

  if (isPending) return <PageSkeleton />;
  if (isNotFound(error)) return <NotVisible what="Project" backTo="/admin/projects" backLabel="Back to all projects" />;
  if (error) return <LoadError error={error} onRetry={refetch} />;

  const tasks = (p.tasks ?? []).filter((t) => !status || t.status === status);
  const budgetPct = p.budgetHours ? Math.round(((p.hoursUsed ?? 0) / p.budgetHours) * 100) : 0;

  return (
    <div className="page">
      <Link to="/admin/projects" className="back-link">
        <LuArrowLeft aria-hidden /> All projects
      </Link>
      <PageHeader
        eyebrow={`${p.clientName} · ${p.service}`}
        title={p.name}
        actions={
          <>
            <ProjectStatusBadge status={p.status} />
            <HealthBadge health={p.health} />
          </>
        }
      />

      <ProjectFacts
        project={p}
        extra={
          <>
            {p.budgetHours !== undefined && (
              <div className="facts__item">
                <div className="facts__label">Hours used</div>
                <div className={`facts__value${budgetPct >= 80 ? ' text-danger' : ''}`}>
                  {p.hoursUsed} / {p.budgetHours} h
                </div>
                <div className="list__meta">{budgetPct}% of budget{budgetPct >= 80 ? ' · owner alerted' : ''}</div>
              </div>
            )}
            <div className="facts__item">
              <div className="facts__label">Tasks</div>
              <div className="facts__value">{p.openTasks} open</div>
              <div className={`list__meta${p.overdueTasks ? ' text-danger' : ''}`}>{p.overdueTasks} overdue</div>
            </div>
          </>
        }
      />

      <Card
        title={`Internal tasks · ${p.tasks?.length ?? 0}`}
        action={
          <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {view === 'list' && (
              <Select label="Filter by status" hideLabel value={status} onChange={setStatus} allLabel="All statuses" options={STATUS_OPTIONS} />
            )}
            <Segmented
              label="Task view"
              value={view}
              onChange={setView}
              options={[
                { value: 'list', label: 'List', icon: <LuList aria-hidden /> },
                { value: 'board', label: 'Board', icon: <LuColumns3 aria-hidden /> },
              ]}
            />
          </div>
        }
      >
        <p className="list__meta" style={{ marginBottom: 12 }}>
          The client never sees these tasks, only milestones and deliverables.
        </p>
        {update.error && (
          <div className="alert alert--error" role="alert" style={{ marginBottom: 12 }}>
            <LuCircleAlert aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ flex: 1 }}>{update.error.message}</span>
            <Button variant="ghost" size="sm" icon aria-label="Dismiss" onClick={() => update.reset()}>
              <LuX />
            </Button>
          </div>
        )}
        {(p.tasks ?? []).length === 0 ? (
          <EmptyState title="No tasks on this project yet" />
        ) : view === 'board' ? (
          <TaskBoard tasks={p.tasks ?? []} onOpen={setTask} onMove={(t, s) => update.mutate({ id: t.id, patch: { status: s } })} showAssignee />
        ) : tasks.length === 0 ? (
          <EmptyState title="No tasks with this status" />
        ) : (
          <ul className="task-list">
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} onOpen={setTask} showProject={false} showAssignee />
            ))}
          </ul>
        )}
      </Card>

      <div className="grid grid--2">
        <Card title="Milestones">
          <MilestoneTimeline milestones={p.milestones} />
        </Card>
        <Card title="Deliverables">
          <DeliverableList deliverables={p.deliverables} milestones={p.milestones} staff />
        </Card>
        <Card title="Team">
          <TeamList team={p.team} staff />
        </Card>
        <Card title="Activity">
          <ActivityFeed activity={p.activity} staff />
        </Card>
      </div>

      <Card title="Scope">
        <p className="small">{p.scope}</p>
      </Card>

      <TaskDrawer taskId={openId} onClose={closeTask} canManage assignees={assignees} />
    </div>
  );
}
