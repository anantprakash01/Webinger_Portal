import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCreatorAction, useMyCampaigns } from '@/api/queries';
import { Button, Card, Drawer, EmptyState, ErrorState, Input, PageHeader, PageSkeleton, dueLabel, formatINR } from '@/components/ui';
import { CollabBadge, FilePick } from '@/components/creators';
import { FormError } from '@/pages/admin/finance/forms';

export function InfluencerCampaigns() {
  const [params, setParams] = useSearchParams();
  const { data, error, isPending, refetch } = useMyCampaigns();
  const openId = params.get('c');
  if (isPending) return <PageSkeleton />;
  if (error) return <div className="page"><ErrorState message={error.message} onRetry={refetch} /></div>;
  const open = data.find((c) => c.id === openId);
  const groups = [
    ['Invites', data.filter((c) => c.collab.status === 'INVITED' || c.collab.status === 'COUNTERED')],
    ['In progress', data.filter((c) => ['ACCEPTED', 'CHANGES_REQUESTED', 'DRAFT_SUBMITTED', 'DRAFT_APPROVED'].includes(c.collab.status))],
    ['Live and paid', data.filter((c) => c.collab.status === 'LIVE' || c.collab.status === 'PAID')],
    ['Declined', data.filter((c) => c.collab.status === 'DECLINED')],
  ];
  return (
    <div className="page">
      <PageHeader eyebrow="Brief → accept → draft → approval → post → payout" title="Campaigns" />
      {data.length === 0 && (
        <Card>
          <EmptyState title="No campaigns yet">When Webinger picks you for a brand, the invite shows up here and by email.</EmptyState>
        </Card>
      )}
      {groups
        .filter(([, list]) => list.length)
        .map(([title, list]) => (
          <Card key={title} title={title}>
            <ul className="list">
              {list.map((c) => (
                <li key={c.id} className="list__item list__item--wrap">
                  <div className="list__main">
                    <button type="button" className="list__title link-btn" onClick={() => setParams({ c: c.id })}>
                      {c.brand}: {c.title}
                    </button>
                    <div className="list__meta">
                      {c.deliverable} · {formatINR(c.collab.fee)}
                      {c.collab.status === 'INVITED' ? ` · reply ${dueLabel(c.collab.respondBy).toLowerCase()}` : ''}
                      {['ACCEPTED', 'CHANGES_REQUESTED'].includes(c.collab.status) ? ` · draft ${dueLabel(c.collab.draftDue).toLowerCase()}` : ''}
                    </div>
                  </div>
                  <CollabBadge status={c.collab.status} />
                </li>
              ))}
            </ul>
          </Card>
        ))}
      <Drawer open={!!open} onClose={() => setParams({})} title={open ? `${open.brand}: ${open.title}` : ''}>
        {open && <CampaignPanel key={open.id + open.collab.status} c={open} />}
      </Drawer>
    </div>
  );
}

function CampaignPanel({ c }) {
  const action = useCreatorAction();
  const x = c.collab;
  const [counter, setCounter] = useState('');
  const [countering, setCountering] = useState(false);
  const [draft, setDraft] = useState({ caption: x.draft?.caption ?? '', fileName: '', disclosure: x.draft?.disclosure ?? false });
  const [live, setLive] = useState({ liveUrl: '', proofFile: '' });

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <CollabBadge status={x.status} />
        <strong>{formatINR(x.fee)}</strong>
      </div>
      <FormError error={action.error} />
      <section className="grid" style={{ gap: 6 }}>
        <h3 className="section-title">Brief</h3>
        <p className="small">{c.brief}</p>
        <p className="small">
          <strong>Deliver:</strong> {c.deliverable}
        </p>
        {c.hashtags && (
          <p className="small">
            <strong>Hashtags:</strong> {c.hashtags}
          </p>
        )}
        {c.dos && (
          <p className="small">
            <strong>Do's and don'ts:</strong> {c.dos}
          </p>
        )}
        <p className="small muted">Draft due {dueLabel(x.draftDue).toLowerCase()}. Talk to the brand only through Webinger.</p>
      </section>

      {x.status === 'INVITED' &&
        (!countering ? (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <Button loading={action.isPending} onClick={() => action.mutate({ kind: 'respond', id: c.id, action: 'ACCEPT' })}>
              Accept {formatINR(x.fee)}
            </Button>
            <Button variant="secondary" onClick={() => setCountering(true)}>
              Counter offer
            </Button>
            <Button variant="ghost" loading={action.isPending} onClick={() => action.mutate({ kind: 'respond', id: c.id, action: 'DECLINE' })}>
              Decline
            </Button>
          </div>
        ) : (
          <form
            className="grid card-form"
            style={{ gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              action.mutate({ kind: 'respond', id: c.id, action: 'COUNTER', counterFee: Number(counter) });
            }}
          >
            <Input label="Your fee (₹)" inputMode="numeric" value={counter} onChange={(e) => setCounter(e.target.value)} />
            <div className="row">
              <Button type="submit" size="sm" loading={action.isPending}>
                Send counter offer
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setCountering(false)}>
                Back
              </Button>
            </div>
          </form>
        ))}
      {x.status === 'COUNTERED' && <p className="note small">You asked for {formatINR(x.counterFee)}. Webinger will reply soon.</p>}

      {(x.status === 'ACCEPTED' || x.status === 'CHANGES_REQUESTED') && (
        <form
          className="grid card-form"
          style={{ gap: 10 }}
          onSubmit={(e) => {
            e.preventDefault();
            action.mutate({ kind: 'draft', id: c.id, body: draft });
          }}
        >
          <h3 className="section-title">Submit your draft</h3>
          {x.feedback && <div className="alert alert--warn">Changes: {x.feedback}</div>}
          <FilePick label="Video or image" accept=".mp4,.mov,.jpg,.jpeg,.png,.pdf" value={draft.fileName} onChange={(v) => setDraft({ ...draft, fileName: v })} />
          <label className="field">
            <span className="field__label">Caption</span>
            <textarea className="field__input" rows={3} value={draft.caption} onChange={(e) => setDraft({ ...draft, caption: e.target.value })} placeholder="#ad …" />
          </label>
          <label className="check">
            <input type="checkbox" checked={draft.disclosure} onChange={(e) => setDraft({ ...draft, disclosure: e.target.checked })} />
            <span className="small">
              I will use Instagram's paid-partnership label and start the caption with <strong>#ad</strong> (ASCI guidelines).
            </span>
          </label>
          <Button type="submit" loading={action.isPending}>
            Send draft for approval
          </Button>
        </form>
      )}
      {x.status === 'DRAFT_SUBMITTED' && <p className="note small">Your draft is with Webinger for review.</p>}

      {x.status === 'DRAFT_APPROVED' && (
        <form
          className="grid card-form"
          style={{ gap: 10 }}
          onSubmit={(e) => {
            e.preventDefault();
            action.mutate({ kind: 'live', id: c.id, body: live });
          }}
        >
          <h3 className="section-title">Approved: post it, then share the link</h3>
          {x.feedback && <p className="small">Note: {x.feedback}</p>}
          <Input label="Link to the live post" inputMode="url" value={live.liveUrl} onChange={(e) => setLive({ ...live, liveUrl: e.target.value })} placeholder="https://" />
          <FilePick label="Insights screenshot (proof)" accept=".png,.jpg,.jpeg,.pdf" value={live.proofFile} onChange={(v) => setLive({ ...live, proofFile: v })} />
          <Button type="submit" loading={action.isPending}>
            Submit and request payout
          </Button>
        </form>
      )}
      {(x.status === 'LIVE' || x.status === 'PAID') && (
        <p className="small">
          Live: <a href={x.liveUrl} target="_blank" rel="noreferrer">{x.liveUrl}</a>. {x.status === 'PAID' ? 'Paid. See Payouts.' : 'Payout requested. See Payouts.'}
        </p>
      )}
      {x.draft && (
        <section>
          <h3 className="section-title">Your draft</h3>
          <p className="small">{x.draft.caption}</p>
          <p className="small muted">{x.draft.fileName}</p>
        </section>
      )}
    </div>
  );
}
