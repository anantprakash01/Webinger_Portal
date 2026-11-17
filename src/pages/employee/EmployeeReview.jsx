import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LuArrowLeft, LuCircleAlert, LuCircleCheck, LuFile, LuRotateCcw, LuShieldCheck } from 'react-icons/lu';
import { useReviewTask, useTask, useTasks } from '@/api/queries';
import { useAuth } from '@/auth/AuthContext';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, PageHeader, PageSkeleton, cx, dueLabel, daysFromToday } from '@/components/ui';
import { PriorityBadge, VisibilityBadge, timeAgo } from '@/components/status';

export function EmployeeReview() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const selected = params.get('task');
  const [flash, setFlash] = useState(null);
  const { data, error, isPending, refetch } = useTasks({});

  if (isPending) return <PageSkeleton />;
  if (error) return <div className="page"><ErrorState message={error.message} onRetry={refetch} /></div>;

  const queue = data
    .filter((t) => t.reviewerId === user?.id && t.status === 'IN_REVIEW')
    .sort((a, b) => a.due.localeCompare(b.due));
  const open = (id) => setParams(id ? { task: id } : {}, { replace: !id });
  const current = queue.find((t) => t.id === selected) ? selected : null;

  const done = (msg, taskId) => {
    setFlash(msg);
    const rest = queue.filter((t) => t.id !== taskId);
    // Move straight to the next item on wide screens; on phones go back to the list.
    open(window.matchMedia('(min-width: 901px)').matches ? rest[0]?.id : undefined);
  };

  return (
    <div className="page">
      <PageHeader eyebrow={`${queue.length} waiting`} title="Review queue" />
      <p className="muted small" style={{ marginTop: -12 }}>
        Work is checked here before the client sees it. Passing a client-facing task sends it to the client for approval.
      </p>

      {flash && (
        <div className="alert alert--ok" role="status">
          <LuCircleCheck aria-hidden style={{ marginTop: 2, flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{flash}</span>
          <Button variant="ghost" size="sm" onClick={() => setFlash(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {queue.length === 0 ? (
        <Card>
          <EmptyState title="Nothing to review">When a teammate moves work to “In review” with you as reviewer, it appears here.</EmptyState>
        </Card>
      ) : (
        <div className={cx('review-layout', current && 'has-selection')}>
          <Card flush className="review-queue">
            <ul className="task-list">
              {queue.map((t) => {
                const late = daysFromToday(t.due) < 0;
                return (
                  <li key={t.id} className="task-row">
                    <button type="button" className={cx('task-row__btn review-queue__btn', t.id === current && 'is-on')} onClick={() => open(t.id)} aria-current={t.id === current || undefined}>
                      <Avatar name={t.assigneeName} size={32} />
                      <div className="list__main">
                        <div className="list__title">{t.title}</div>
                        <div className="list__meta">
                          {t.assigneeName} · {t.clientName}
                        </div>
                        <div className={cx('list__meta', late && 'text-danger')}>{dueLabel(t.due)}</div>
                      </div>
                      {t.priority === 'HIGH' && <PriorityBadge priority="HIGH" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <div className="review-panel">
            {current ? (
              <ReviewPanel key={current} taskId={current} onBack={() => open(undefined)} onDone={done} />
            ) : (
              <Card>
                <EmptyState title="Choose an item to review">Pick a task from the list.</EmptyState>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewPanel({ taskId, onBack, onDone }) {
  const { data: t, error, isPending, refetch } = useTask(taskId);
  const review = useReviewTask();
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => review.reset(), [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isPending) return <div className="skeleton" style={{ height: 420 }} />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  const failNoteMissing = note.trim().length < 5;
  const submit = (result) => {
    if (result === 'FAIL') {
      setTouched(true);
      if (failNoteMissing) return;
    }
    review.mutate(
      { id: t.id, body: { result, note: note.trim() || undefined } },
      {
        onSuccess: (updated) =>
          onDone(
            result === 'PASS'
              ? updated.status === 'CLIENT_APPROVAL'
                ? `Passed. "${t.title}" is now with ${t.clientName} for approval.`
                : `Passed. "${t.title}" is marked done.`
              : `Sent back to ${t.assigneeName} with your notes.`,
            t.id,
          ),
      },
    );
  };
  const open = t.checklist.filter((c) => !c.done);

  return (
    <Card>
      <div className="grid" style={{ gap: 16 }}>
        <button type="button" className="back-link review-panel__back" onClick={onBack}>
          <LuArrowLeft aria-hidden /> Queue
        </button>
        <div>
          <div className="list__meta">
            {t.projectName} · {t.clientName}
          </div>
          <h2 style={{ fontSize: 'var(--fs-lg)', marginTop: 2 }}>{t.title}</h2>
          <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
            <Badge>By {t.assigneeName}</Badge>
            <PriorityBadge priority={t.priority} />
            {t.clientFacing ? <Badge tone="info">Client-facing</Badge> : <Badge>Internal only</Badge>}
            <span className={cx('list__meta', daysFromToday(t.due) < 0 && 'text-danger')}>{dueLabel(t.due)}</span>
          </div>
        </div>

        {t.description && (
          <section>
            <h3 className="section-title">Brief</h3>
            <p className="small pre">{t.description}</p>
          </section>
        )}

        <section>
          <h3 className="section-title">Checklist</h3>
          {t.checklist.length === 0 ? (
            <p className="small muted">No checklist.</p>
          ) : open.length === 0 ? (
            <p className="small" style={{ color: 'var(--ok)' }}>
              All {t.checklist.length} items ticked.
            </p>
          ) : (
            <div className="alert alert--warn">
              <LuCircleAlert aria-hidden style={{ marginTop: 2, flexShrink: 0 }} />
              <span>
                {open.length} of {t.checklist.length} items not ticked: {open.map((c) => c.text).join('; ')}.
              </span>
            </div>
          )}
        </section>

        <section>
          <h3 className="section-title">Files to check</h3>
          {t.files.length === 0 ? (
            <p className="small muted">No files attached.</p>
          ) : (
            <ul className="list">
              {t.files.map((f) => (
                <li key={f.id} className="list__item">
                  <LuFile aria-hidden />
                  <div className="list__main">
                    <div className="list__title">{f.name}</div>
                    <div className="list__meta">
                      {f.uploadedBy} · {timeAgo(f.uploadedAt)}
                    </div>
                  </div>
                  <VisibilityBadge visibility={f.visibility} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {t.comments.length > 0 && (
          <section>
            <h3 className="section-title">Latest comments</h3>
            <ul className="comments" style={{ marginBottom: 0 }}>
              {t.comments.slice(-3).map((c) => (
                <li key={c.id} className={cx('comment', c.visibility === 'CLIENT' && 'comment--client')}>
                  <Avatar name={c.author} size={24} />
                  <div className="list__main">
                    <strong className="small">{c.author}</strong> <span className="list__meta">{timeAgo(c.at)}</span>
                    <p className="small pre">{c.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="review-decision">
          <h3 className="section-title">
            <LuShieldCheck aria-hidden /> Your review
          </h3>
          {review.error && (
            <div className="alert alert--error" role="alert" style={{ marginBottom: 8 }}>
              <LuCircleAlert aria-hidden style={{ marginTop: 2, flexShrink: 0 }} /> <span>{review.error.message}</span>
            </div>
          )}
          <label htmlFor="review-note" className="field__label">
            Notes for {t.assigneeName.split(' ')[0]}
          </label>
          <textarea
            id="review-note"
            className="composer__input"
            rows={3}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional when passing. Required when sending back: say exactly what to fix."
            aria-invalid={touched && failNoteMissing ? true : undefined}
            aria-describedby={touched && failNoteMissing ? 'review-err' : undefined}
            style={{ marginTop: 6 }}
          />
          {touched && failNoteMissing && (
            <span id="review-err" className="field__error">
              <LuCircleAlert aria-hidden /> Say what needs fixing before sending it back.
            </span>
          )}
          <p className="list__meta" style={{ margin: '6px 0 10px' }}>
            Notes are internal. The client never sees them.
          </p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <Button onClick={() => submit('PASS')} loading={review.isPending && review.variables?.body.result === 'PASS'} disabled={review.isPending}>
              <LuCircleCheck aria-hidden /> {t.clientFacing ? 'Pass and send to client' : 'Pass and mark done'}
            </Button>
            <Button variant="secondary" onClick={() => submit('FAIL')} loading={review.isPending && review.variables?.body.result === 'FAIL'} disabled={review.isPending}>
              <LuRotateCcw aria-hidden /> Send back
            </Button>
          </div>
        </section>
      </div>
    </Card>
  );
}
