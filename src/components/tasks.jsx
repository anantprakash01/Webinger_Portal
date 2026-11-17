import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LuCalendar, LuCircleAlert, LuEye, LuFile, LuListChecks, LuLock, LuMessageSquare, LuShieldCheck } from 'react-icons/lu';
import { useAddComment, useSetChecklistItem, useTask, useUpdateTask } from '@/api/queries';
import { useAuth } from '@/auth/AuthContext';
import { Avatar, Badge, Button, Drawer, ErrorState, Segmented, Select, cx, dueLabel, daysFromToday } from './ui';
import { PriorityBadge, TASK_STATUSES, TaskBadge, VisibilityBadge, taskStatusLabel, timeAgo } from './status';

export const STATUS_OPTIONS = TASK_STATUSES.map((s) => ({ value: s, label: taskStatusLabel(s) }));

const isOverdue = (t) => t.status !== 'DONE' && daysFromToday(t.due) < 0;

/* ---------- small meta line shared by rows and cards ---------- */
function TaskMeta({ task, showAssignee }) {
  return (
    <div className="task-meta">
      <span className={cx('row', isOverdue(task) && 'text-danger')} style={{ gap: 4 }}>
        {isOverdue(task) ? <LuCircleAlert aria-hidden /> : <LuCalendar aria-hidden />}
        {task.status === 'DONE' ? 'Done' : dueLabel(task.due)}
      </span>
      {task.checklistTotal ? (
        <span className="row" style={{ gap: 4 }} title="Checklist">
          <LuListChecks aria-hidden />
          {task.checklistDone}/{task.checklistTotal}
        </span>
      ) : null}
      {task.commentCount ? (
        <span className="row" style={{ gap: 4 }} title="Comments">
          <LuMessageSquare aria-hidden />
          {task.commentCount}
        </span>
      ) : null}
      {showAssignee && <span>{task.assigneeName}</span>}
    </div>
  );
}

/* ---------- list row ---------- */
export function TaskRow({ task, onOpen, showProject = true, showAssignee }) {
  return (
    <li className="task-row">
      <button type="button" className="task-row__btn" onClick={() => onOpen(task.id)}>
        <div className="list__main">
          <div className="list__title">{task.title}</div>
          {showProject && (
            <div className="list__meta">
              {task.projectName} · {task.clientName}
            </div>
          )}
          <TaskMeta task={task} showAssignee={showAssignee} />
        </div>
        <div className="task-row__badges">
          {task.priority === 'HIGH' && <PriorityBadge priority="HIGH" />}
          <TaskBadge status={task.status} />
        </div>
      </button>
    </li>
  );
}

/* ---------- kanban board ---------- */
export function TaskBoard({ tasks, onOpen, onMove, showAssignee }) {
  const [over, setOver] = useState(null);
  return (
    <div className="board" role="region" aria-label="Task board">
      {TASK_STATUSES.map((status) => {
        const col = tasks.filter((t) => t.status === status);
        return (
          <section
            key={status}
            className={cx('board__col', over === status && 'is-over')}
            aria-label={`${taskStatusLabel(status)}, ${col.length} tasks`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(status);
            }}
            onDragLeave={() => setOver((s) => (s === status ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData('text/task-id');
              const t = tasks.find((x) => x.id === id);
              if (t && t.status !== status) onMove(t, status);
            }}
          >
            <header className="board__head">
              <span>{taskStatusLabel(status)}</span>
              <span className="board__count">{col.length}</span>
            </header>
            <div className="board__cards">
              {col.length === 0 && <div className="board__empty">Drop tasks here</div>}
              {col.map((t) => (
                <article
                  key={t.id}
                  className="board__card"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/task-id', t.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                >
                  <button type="button" className="board__open" onClick={() => onOpen(t.id)}>
                    <span className="board__title">{t.title}</span>
                    <span className="list__meta">{t.projectName} · {t.clientName}</span>
                  </button>
                  <TaskMeta task={t} showAssignee={showAssignee} />
                  <div className="row board__foot">
                    {t.priority === 'HIGH' && <PriorityBadge priority="HIGH" />}
                    <span className="spacer" />
                    {/* Drag and drop has no touch or keyboard support; this select is the accessible way to move. */}
                    <Select
                      label={`Move "${t.title}"`}
                      hideLabel
                      value={t.status}
                      options={STATUS_OPTIONS}
                      onChange={(s) => s && s !== t.status && onMove(t, s)}
                      className="select--mini"
                    />
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ---------- task drawer ---------- */

/**
 * Full task view. `canManage` (admin area) unlocks assignee and due-date edits;
 * the server enforces the same rule, so this only hides controls that would fail.
 */
export function TaskDrawer({ taskId, onClose, canManage, assignees = [], projectLink }) {
  const { data: task, error, isPending, refetch } = useTask(taskId);
  return (
    <Drawer open={!!taskId} onClose={onClose} title={task?.title ?? 'Task'}>
      {isPending ? (
        <div className="grid">
          <div className="skeleton" style={{ height: 24, width: '60%' }} />
          <div className="skeleton" style={{ height: 120 }} />
          <div className="skeleton" style={{ height: 200 }} />
        </div>
      ) : error ? (
        <ErrorState message={error.message} onRetry={refetch} />
      ) : (
        <TaskDetailBody task={task} canManage={canManage} assignees={assignees} projectLink={projectLink} />
      )}
    </Drawer>
  );
}

function TaskDetailBody({ task, canManage, assignees, projectLink }) {
  const { user } = useAuth();
  const update = useUpdateTask();
  const checklist = useSetChecklistItem();
  const mayEdit = canManage || task.assigneeId === user?.id || task.reviewerId === user?.id;
  const done = task.checklist.filter((c) => c.done).length;
  const err = update.error ?? checklist.error;

  const patch = (p) => update.mutate({ id: task.id, patch: p });

  // Make sure the current assignee is always selectable even if not in the passed list.
  const assigneeOptions = assignees.some((a) => a.id === task.assigneeId)
    ? assignees
    : [{ id: task.assigneeId, name: task.assigneeName }, ...assignees];

  return (
    <div className="task-detail">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <TaskBadge status={task.status} />
        <PriorityBadge priority={task.priority} />
        {task.clientFacing && <Badge tone="info">Client-facing</Badge>}
      </div>

      {err && (
        <div className="alert alert--error" role="alert">
          <LuCircleAlert aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            <strong>Not saved.</strong> {err.message}
          </span>
        </div>
      )}

      <dl className="kv">
        <dt>Project</dt>
        <dd>
          {projectLink ? <Link to={projectLink(task.projectId)}>{task.projectName}</Link> : task.projectName} · {task.clientName}
        </dd>

        <dt>
          <label htmlFor="task-status">Status</label>
        </dt>
        <dd>
          {mayEdit ? (
            <select id="task-status" className="inline-select" value={task.status} onChange={(e) => patch({ status: e.target.value })}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            taskStatusLabel(task.status)
          )}
        </dd>

        <dt>
          <label htmlFor="task-assignee">Assignee</label>
        </dt>
        <dd>
          {canManage ? (
            <select id="task-assignee" className="inline-select" value={task.assigneeId} onChange={(e) => patch({ assigneeId: e.target.value })}>
              {assigneeOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          ) : (
            task.assigneeName
          )}
        </dd>

        <dt>
          <label htmlFor="task-due">Due</label>
        </dt>
        <dd>
          {canManage ? (
            <input id="task-due" type="date" className="inline-select" value={task.due} onChange={(e) => e.target.value && patch({ due: e.target.value })} />
          ) : (
            <span className={cx(isOverdue(task) && 'text-danger')}>{dueLabel(task.due)}</span>
          )}
        </dd>

        {task.reviewerName && (
          <>
            <dt>Reviewer</dt>
            <dd className="row" style={{ gap: 6 }}>
              <LuShieldCheck aria-hidden /> {task.reviewerName}
            </dd>
          </>
        )}
      </dl>

      {task.clientFacing && (
        <p className="small muted note">
          <LuShieldCheck aria-hidden />
          <span>
            Client-facing work goes to {task.reviewerName ?? 'a reviewer'} first. Move it to <em>In review</em>; the reviewer sends it to the client.
          </span>
        </p>
      )}

      {task.description && (
        <section>
          <h3 className="section-title">Brief</h3>
          <p className="small pre">{task.description}</p>
        </section>
      )}

      <section>
        <h3 className="section-title">
          Checklist {task.checklist.length > 0 && <span className="muted">{done}/{task.checklist.length}</span>}
        </h3>
        {task.checklist.length === 0 ? (
          <p className="small muted">No checklist for this task.</p>
        ) : (
          <ul className="checklist">
            {task.checklist.map((c) => (
              <li key={c.id}>
                <label className={cx('checklist__item', c.done && 'is-done')}>
                  <input
                    type="checkbox"
                    checked={c.done}
                    disabled={!mayEdit}
                    onChange={(e) => checklist.mutate({ id: task.id, itemId: c.id, done: e.target.checked })}
                  />
                  <span>{c.text}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="section-title">Files</h3>
        {task.files.length === 0 ? (
          <p className="small muted">No files yet.</p>
        ) : (
          <ul className="list">
            {task.files.map((f) => (
              <li key={f.id} className="list__item">
                <LuFile aria-hidden />
                <div className="list__main">
                  <div className="list__title">{f.name}</div>
                  <div className="list__meta">
                    {formatSize(f.sizeKb)} · {f.uploadedBy} · {timeAgo(f.uploadedAt)}
                  </div>
                </div>
                <VisibilityBadge visibility={f.visibility} />
              </li>
            ))}
          </ul>
        )}
        <p className="list__meta" style={{ marginTop: 8 }}>
          Uploading and version history arrive with Files in week 4.
        </p>
      </section>

      <Comments task={task} />
    </div>
  );
}

function Comments({ task }) {
  const add = useAddComment();
  const [text, setText] = useState('');
  const [visibility, setVisibility] = useState('INTERNAL');
  const [touched, setTouched] = useState(false);
  const empty = text.trim() === '';

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (empty) return;
    add.mutate(
      { id: task.id, body: { text, visibility } },
      {
        onSuccess: () => {
          setText('');
          setTouched(false);
          // Always fall back to internal, so the next note is never shared by accident.
          setVisibility('INTERNAL');
        },
      },
    );
  };

  return (
    <section>
      <h3 className="section-title">Comments {task.comments.length > 0 && <span className="muted">{task.comments.length}</span>}</h3>
      {task.comments.length === 0 ? (
        <p className="small muted">No comments yet.</p>
      ) : (
        <ul className="comments">
          {task.comments.map((c) => (
            <li key={c.id} className={cx('comment', c.visibility === 'CLIENT' && 'comment--client')}>
              <Avatar name={c.author} size={28} />
              <div className="list__main">
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <strong className="small">{c.author}</strong>
                  <time className="list__meta" dateTime={c.at}>
                    {timeAgo(c.at)}
                  </time>
                  <VisibilityBadge visibility={c.visibility} />
                </div>
                <p className="small pre">{c.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form className="composer" onSubmit={submit} noValidate>
        <label htmlFor="comment-text" className="sr-only">
          Write a comment
        </label>
        <textarea
          id="comment-text"
          rows={3}
          value={text}
          maxLength={2000}
          placeholder={visibility === 'CLIENT' ? 'Write a note the client will see…' : 'Write an internal note…'}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={touched && empty ? true : undefined}
          aria-describedby={touched && empty ? 'comment-err' : undefined}
          className={cx('composer__input', visibility === 'CLIENT' && 'is-client')}
        />
        {touched && empty && (
          <span id="comment-err" className="field__error">
            <LuCircleAlert aria-hidden /> Write a comment first.
          </span>
        )}
        {add.error && (
          <span className="field__error" role="alert">
            <LuCircleAlert aria-hidden /> {add.error.message}
          </span>
        )}
        <div className="row composer__foot">
          <Segmented
            label="Who can see this comment"
            value={visibility}
            onChange={setVisibility}
            options={[
              { value: 'INTERNAL', label: 'Internal', icon: <LuLock aria-hidden /> },
              { value: 'CLIENT', label: 'Client can see', icon: <LuEye aria-hidden /> },
            ]}
          />
          <span className="spacer" />
          <Button type="submit" size="sm" loading={add.isPending}>
            Post
          </Button>
        </div>
        {visibility === 'CLIENT' && <p className="list__meta">{task.clientName} will see this comment.</p>}
      </form>
    </section>
  );
}

const formatSize = (kb) => (kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`);
