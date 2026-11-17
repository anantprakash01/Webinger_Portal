import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LuArrowLeft, LuCircleAlert, LuCircleCheck, LuHistory, LuMapPin, LuPencilLine, LuX } from 'react-icons/lu';
import { useAddPin, useApproval, useDecideApproval } from '@/api/queries';
import { useAuth } from '@/auth/AuthContext';
import { Avatar, Badge, Button, Card, PageHeader, PageSkeleton, cx, formatDateLong } from '@/components/ui';
import { ApprovalStatusBadge, AssetViewer, RevisionMeter } from '@/components/approvals';
import { LoadError, NotVisible, isNotFound } from '@/components/projects';
import { timeAgo } from '@/components/status';

export function ClientApprovalDetail() {
  const { id } = useParams();
  const { data: a, error, isPending, refetch } = useApproval(id);

  if (isPending) return <PageSkeleton />;
  if (isNotFound(error)) return <NotVisible what="Approval" backTo="/client/approvals" backLabel="Back to approvals" />;
  if (error) return <LoadError error={error} onRetry={refetch} />;
  // Remount when a new version arrives so selection resets to the latest.
  return <ApprovalView key={`${a.id}-${a.versions.length}`} approval={a} />;
}

function ApprovalView({ approval: a }) {
  const { user } = useAuth();
  const latest = a.versions[a.versions.length - 1];
  const [versionId, setVersionId] = useState(latest.id);
  const [page, setPage] = useState(0);
  const [activePin, setActivePin] = useState(null);
  const [draft, setDraft] = useState(null); // { page, x, y }
  const version = a.versions.find((v) => v.id === versionId) ?? latest;
  const isLatest = version.id === latest.id;
  const canDecide = isLatest && a.status === 'PENDING';

  useEffect(() => {
    setPage(0);
    setActivePin(null);
    setDraft(null);
  }, [versionId]);

  // Number pins per version in the order they were made, so "3" means the same pin everywhere.
  const versionPins = useMemo(
    () => a.comments.filter((c) => c.versionId === version.id).map((c, i) => ({ ...c, n: i + 1 })),
    [a.comments, version.id],
  );
  const pagePins = versionPins.filter((p) => p.page === page);

  const selectPin = (pinId) => {
    const p = versionPins.find((x) => x.id === pinId);
    if (p && p.page !== page) setPage(p.page);
    setActivePin(pinId);
  };

  return (
    <div className="page">
      <Link to="/client/approvals" className="back-link">
        <LuArrowLeft aria-hidden /> All approvals
      </Link>
      <PageHeader
        eyebrow={`${a.projectName} · version ${latest.number} sent ${timeAgo(latest.submittedAt)}`}
        title={a.title}
        actions={<ApprovalStatusBadge status={a.status} />}
      />

      <div className="approval-layout">
        <div className="grid" style={{ alignContent: 'start' }}>
          <div className="toolbar">
            <label className="select" htmlFor="version">
              <span className="sr-only">Version</span>
              <select id="version" value={version.id} onChange={(e) => setVersionId(e.target.value)}>
                {[...a.versions].reverse().map((v) => (
                  <option key={v.id} value={v.id}>
                    Version {v.number}
                    {v.id === latest.id ? ' (latest)' : v.decision ? ` · ${v.decision.status === 'APPROVED' ? 'approved' : 'changes requested'}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <span className="list__meta">{version.fileName}</span>
            <span className="spacer" />
            {isLatest && !draft && (
              <Button variant="secondary" size="sm" onClick={() => setDraft({ page, x: 50, y: 50 })}>
                <LuMapPin aria-hidden /> Add comment
              </Button>
            )}
          </div>

          {!isLatest && (
            <div className="alert alert--info" role="status">
              <LuHistory aria-hidden style={{ marginTop: 2, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>
                You are looking at an older version. {version.decision && <DecisionText d={version.decision} />}
              </span>
              <Button size="sm" variant="secondary" onClick={() => setVersionId(latest.id)}>
                See latest
              </Button>
            </div>
          )}
          {draft && (
            <div className="alert alert--info" role="status">
              <LuMapPin aria-hidden style={{ marginTop: 2, flexShrink: 0 }} />
              <span>Click the image to put the pin where your comment applies, then write it on the right.</span>
            </div>
          )}

          <AssetViewer
            version={version}
            page={page}
            onPage={(n) => {
              setPage(n);
              if (draft) setDraft({ ...draft, page: n });
            }}
            pins={pagePins}
            activePin={activePin}
            onPinClick={selectPin}
            placing={!!draft}
            draft={draft}
            onPlace={(pos) => setDraft({ page, ...pos })}
          />
          {version.note && (
            <p className="small">
              <strong>Note from {version.submittedBy}:</strong> {version.note}
            </p>
          )}
        </div>

        <aside className="grid" style={{ alignContent: 'start' }}>
          {canDecide && <DecisionPanel approval={a} versionId={latest.id} user={user} />}
          {!canDecide && isLatest && latest.decision && (
            <Card>
              <div className="row" style={{ gap: 10 }}>
                <LuCircleCheck aria-hidden color={latest.decision.status === 'APPROVED' ? 'var(--ok)' : 'var(--info)'} size={22} />
                <div className="small">
                  <DecisionText d={latest.decision} />
                </div>
              </div>
            </Card>
          )}
          <Card title="Revisions">
            <RevisionMeter used={a.revisionsUsed} allowed={a.revisionsAllowed} />
            <p className="list__meta" style={{ marginTop: 8 }}>
              Your contract includes {a.revisionsAllowed} rounds of changes per deliverable.
            </p>
          </Card>

          {draft && <PinComposer approvalId={a.id} versionId={latest.id} draft={draft} onDone={(pinId) => { setDraft(null); if (pinId) setActivePin(pinId); }} />}

          <Card title={`Comments on version ${version.number} · ${versionPins.length}`}>
            {versionPins.length === 0 ? (
              <p className="small muted">{isLatest ? 'No comments yet. Use “Add comment” to pin one to the design.' : 'No comments on this version.'}</p>
            ) : (
              <ol className="pin-list">
                {versionPins.map((p) => (
                  <li key={p.id}>
                    <button type="button" className={cx('pin-list__item', activePin === p.id && 'is-active')} onClick={() => selectPin(p.id)}>
                      <span className={cx('pin', 'pin--static', p.fromAgency && 'pin--agency')} aria-hidden>
                        {p.n}
                      </span>
                      <span className="list__main">
                        <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                          <strong className="small">{p.author}</strong>
                          {p.fromAgency && <Badge>Webinger</Badge>}
                          <span className="list__meta">
                            {timeAgo(p.at)}
                            {version.pages.length > 1 ? ` · page ${p.page + 1}` : ''}
                          </span>
                        </span>
                        <span className="small pre" style={{ display: 'block' }}>
                          {p.text}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card title="Version history">
            <ol className="versions">
              {[...a.versions].reverse().map((v) => (
                <li key={v.id}>
                  <button type="button" className={cx('versions__item', v.id === version.id && 'is-on')} onClick={() => setVersionId(v.id)}>
                    <Avatar name={v.submittedBy} size={28} />
                    <span className="list__main">
                      <span className="small" style={{ fontWeight: 600, display: 'block' }}>
                        Version {v.number}
                        {v.id === latest.id ? ' · latest' : ''}
                      </span>
                      <span className="list__meta" style={{ display: 'block' }}>
                        Sent by {v.submittedBy}, {formatDateLong(v.submittedAt.slice(0, 10))}
                      </span>
                      {v.decision && (
                        <span className="list__meta" style={{ display: 'block' }}>
                          <DecisionText d={v.decision} short />
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function DecisionText({ d, short }) {
  const verb = d.status === 'APPROVED' ? 'Approved' : 'Changes requested';
  return (
    <>
      {verb} by {d.byName} {timeAgo(d.at)}
      {!short && d.note ? `: “${d.note}”` : ''}
    </>
  );
}

function DecisionPanel({ approval: a, versionId, user }) {
  const decide = useDecideApproval();
  const [mode, setMode] = useState(null); // 'approve' | 'changes'
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const next = a.revisionsUsed + 1;
  const overLimit = next > a.revisionsAllowed;
  const noteTooShort = note.trim().length < 5;

  const send = (decision) => {
    if (decision === 'REQUEST_CHANGES') {
      setTouched(true);
      if (noteTooShort) return;
    }
    decide.mutate({ id: a.id, body: { versionId, decision, note: note.trim() || undefined } });
  };

  return (
    <Card title="Your decision" className="decision">
      {decide.error && (
        <div className="alert alert--error" role="alert" style={{ marginBottom: 12 }}>
          <LuCircleAlert aria-hidden style={{ marginTop: 2, flexShrink: 0 }} /> <span>{decide.error.message}</span>
        </div>
      )}

      {mode === null && (
        <div className="grid" style={{ gap: 8 }}>
          <p className="small muted">Check every page, then approve or tell us what to change. Pinned comments are sent with your request.</p>
          <Button block onClick={() => setMode('approve')}>
            <LuCircleCheck aria-hidden /> Approve version
          </Button>
          <Button block variant="secondary" onClick={() => setMode('changes')}>
            <LuPencilLine aria-hidden /> Request changes
          </Button>
        </div>
      )}

      {mode === 'approve' && (
        <div className="grid" style={{ gap: 10 }}>
          <p className="small">
            <strong>Approve this version?</strong> The team will treat it as final and move on. Approved by {user?.name}.
          </p>
          <label className="field">
            <span className="field__label">Note (optional)</span>
            <textarea className="composer__input" rows={2} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="row">
            <Button onClick={() => send('APPROVE')} loading={decide.isPending}>
              Yes, approve
            </Button>
            <Button variant="ghost" onClick={() => setMode(null)} disabled={decide.isPending}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === 'changes' && (
        <div className="grid" style={{ gap: 10 }}>
          {overLimit ? (
            <div className="alert alert--warn" role="status">
              <LuCircleAlert aria-hidden style={{ marginTop: 2, flexShrink: 0 }} />
              <span>
                This will be revision {next}, beyond the {a.revisionsAllowed} included in your contract. Extra rounds may be charged; your account manager will confirm before work starts.
              </span>
            </div>
          ) : (
            <p className="small muted">
              This will use revision {next} of {a.revisionsAllowed}.
            </p>
          )}
          <label className="field" htmlFor="changes-note">
            <span className="field__label">What should change?</span>
          </label>
          <textarea
            id="changes-note"
            className="composer__input"
            rows={4}
            value={note}
            maxLength={2000}
            onChange={(e) => setNote(e.target.value)}
            aria-invalid={touched && noteTooShort ? true : undefined}
            aria-describedby={touched && noteTooShort ? 'changes-err' : undefined}
            placeholder="Be specific: which page, what to change, and why."
          />
          {touched && noteTooShort && (
            <span id="changes-err" className="field__error">
              <LuCircleAlert aria-hidden /> Tell the team what to change (a few words at least).
            </span>
          )}
          <div className="row">
            <Button onClick={() => send('REQUEST_CHANGES')} loading={decide.isPending}>
              Send request
            </Button>
            <Button variant="ghost" onClick={() => setMode(null)} disabled={decide.isPending}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function PinComposer({ approvalId, versionId, draft, onDone }) {
  const add = useAddPin();
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const empty = text.trim() === '';

  const save = (e) => {
    e.preventDefault();
    setTouched(true);
    if (empty) return;
    add.mutate(
      { id: approvalId, body: { versionId, page: draft.page, x: draft.x, y: draft.y, text: text.trim() } },
      { onSuccess: (pin) => onDone(pin.id) },
    );
  };

  return (
    <Card
      title="New pinned comment"
      action={
        <Button variant="ghost" size="sm" icon aria-label="Cancel comment" onClick={() => onDone(null)}>
          <LuX />
        </Button>
      }
    >
      <form onSubmit={save} className="grid" style={{ gap: 8 }} noValidate>
        <label htmlFor="pin-text" className="sr-only">
          Comment
        </label>
        <textarea
          id="pin-text"
          className="composer__input"
          rows={3}
          autoFocus
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What should we look at here?"
          aria-invalid={touched && empty ? true : undefined}
        />
        {touched && empty && (
          <span className="field__error">
            <LuCircleAlert aria-hidden /> Write a comment first.
          </span>
        )}
        {add.error && (
          <span className="field__error" role="alert">
            <LuCircleAlert aria-hidden /> {add.error.message}
          </span>
        )}
        <div className="row">
          <span className="list__meta">Pin on page {draft.page + 1}</span>
          <span className="spacer" />
          <Button type="submit" size="sm" loading={add.isPending}>
            Save comment
          </Button>
        </div>
      </form>
    </Card>
  );
}
