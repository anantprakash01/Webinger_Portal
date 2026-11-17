import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LuCircleAlert, LuColumns3, LuList, LuX } from 'react-icons/lu';
import { useTasks, useUpdateTask } from '@/api/queries';
import { useAuth } from '@/auth/AuthContext';
import { Button, Card, EmptyState, ErrorState, PageHeader, PageSkeleton, SearchInput, Segmented, Select, daysFromToday } from '@/components/ui';
import { TaskBoard, TaskDrawer, TaskRow } from '@/components/tasks';

const GROUPS = [
  { key: 'overdue', title: 'Overdue', test: (t) => t.status !== 'DONE' && daysFromToday(t.due) < 0 },
  { key: 'today', title: 'Today', test: (t) => t.status !== 'DONE' && daysFromToday(t.due) === 0 },
  { key: 'week', title: 'Next 7 days', test: (t) => t.status !== 'DONE' && daysFromToday(t.due) > 0 && daysFromToday(t.due) <= 7 },
  { key: 'later', title: 'Later', test: (t) => t.status !== 'DONE' && daysFromToday(t.due) > 7 },
  { key: 'done', title: 'Done', test: (t) => t.status === 'DONE' },
];

export function EmployeeTasks() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'board' ? 'board' : 'list';
  const scope = params.get('scope') === 'review' ? 'review' : 'mine';
  const project = params.get('project') ?? undefined;
  const priority = params.get('priority') ?? undefined;
  const openId = params.get('task');
  const [q, setQ] = useState('');
  const [showDone, setShowDone] = useState(false);

  const setParam = useCallback(
    (key, value) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: key !== 'task' },
      ),
    [setParams],
  );

  // One request returns everything the employee is assigned to or reviews; filters run locally.
  const { data, error, isPending, refetch } = useTasks({});
  const update = useUpdateTask();

  const scoped = useMemo(
    () => (data ?? []).filter((t) => (scope === 'mine' ? t.assigneeId === user?.id : t.assigneeId !== user?.id)),
    [data, scope, user?.id],
  );
  const projects = useMemo(() => {
    const m = new Map(scoped.map((t) => [t.projectId, `${t.projectName} · ${t.clientName}`]));
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [scoped]);
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return scoped.filter(
      (t) =>
        (!project || t.projectId === project) &&
        (!priority || t.priority === priority) &&
        (!needle || `${t.title} ${t.projectName} ${t.clientName}`.toLowerCase().includes(needle)),
    );
  }, [scoped, project, priority, q]);

  const onOpen = (id) => setParam('task', id);
  const onClose = useCallback(() => setParam('task', undefined), [setParam]);
  const onMove = (task, status) => update.mutate({ id: task.id, patch: { status } });

  if (isPending) return <PageSkeleton />;
  if (error) return <div className="page"><ErrorState message={error.message} onRetry={refetch} /></div>;

  const reviewCount = (data ?? []).filter((t) => t.assigneeId !== user?.id && t.status === 'IN_REVIEW').length;
  const openCount = visible.filter((t) => t.status !== 'DONE').length;
  const filtered = !!(project || priority || q);

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${openCount} open`}
        title="Tasks"
        actions={
          <Segmented
            label="View"
            value={view}
            onChange={(v) => setParam('view', v === 'board' ? 'board' : undefined)}
            options={[
              { value: 'list', label: 'List', icon: <LuList aria-hidden /> },
              { value: 'board', label: 'Board', icon: <LuColumns3 aria-hidden /> },
            ]}
          />
        }
      />

      <div className="toolbar">
        <Segmented
          label="Whose tasks"
          value={scope}
          onChange={(v) => setParam('scope', v === 'review' ? 'review' : undefined)}
          options={[
            { value: 'mine', label: 'Assigned to me' },
            { value: 'review', label: `I review${reviewCount ? ` (${reviewCount})` : ''}` },
          ]}
        />
        <SearchInput label="Search tasks" value={q} onChange={setQ} placeholder="Search tasks" />
        <Select label="Project" hideLabel value={project} onChange={(v) => setParam('project', v)} allLabel="All projects" options={projects} />
        <Select
          label="Priority"
          hideLabel
          value={priority}
          onChange={(v) => setParam('priority', v)}
          allLabel="Any priority"
          options={[
            { value: 'HIGH', label: 'High' },
            { value: 'MEDIUM', label: 'Medium' },
            { value: 'LOW', label: 'Low' },
          ]}
        />
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ('');
              setParams((prev) => {
                const next = new URLSearchParams(prev);
                next.delete('project');
                next.delete('priority');
                return next;
              });
            }}
          >
            <LuX aria-hidden /> Clear
          </Button>
        )}
      </div>

      {update.error && (
        <div className="alert alert--error" role="alert">
          <LuCircleAlert aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
          <span style={{ flex: 1 }}>
            <strong>Move undone.</strong> {update.error.message}
          </span>
          <Button variant="ghost" size="sm" icon aria-label="Dismiss" onClick={() => update.reset()}>
            <LuX />
          </Button>
        </div>
      )}

      {visible.length === 0 ? (
        <Card>
          <EmptyState title={filtered ? 'No tasks match these filters' : scope === 'review' ? 'Nothing to review' : 'No tasks assigned to you'}>
            {filtered ? 'Try clearing the filters.' : 'New work will appear here as soon as it is assigned.'}
          </EmptyState>
        </Card>
      ) : view === 'board' ? (
        <TaskBoard tasks={visible} onOpen={onOpen} onMove={onMove} showAssignee={scope === 'review'} />
      ) : (
        <div className="grid">
          {GROUPS.map((g) => {
            const rows = visible.filter(g.test);
            if (rows.length === 0) return null;
            const hidden = g.key === 'done' && !showDone;
            return (
              <Card
                key={g.key}
                title={`${g.title} · ${rows.length}`}
                className={g.key === 'overdue' ? 'card--alert' : undefined}
                action={
                  g.key === 'done' ? (
                    <Button variant="ghost" size="sm" onClick={() => setShowDone((s) => !s)} aria-expanded={showDone}>
                      {showDone ? 'Hide' : 'Show'}
                    </Button>
                  ) : undefined
                }
              >
                {!hidden && (
                  <ul className="task-list">
                    {rows.map((t) => (
                      <TaskRow key={t.id} task={t} onOpen={onOpen} showAssignee={scope === 'review'} />
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <TaskDrawer taskId={openId} onClose={onClose} />
    </div>
  );
}
