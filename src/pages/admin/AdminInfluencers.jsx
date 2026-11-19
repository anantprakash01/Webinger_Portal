import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LuCircleAlert, LuPlus } from 'react-icons/lu';
import { useCampaign, useCampaigns, useClients, useCollabRequests, useInfluencerAdmin, useInfluencerAdminAction, useInfluencerPayouts } from '@/api/queries';
import { useAuth } from '@/auth/AuthContext';
import { Badge, Button, Card, Drawer, EmptyState, ErrorState, Input, PageHeader, PageSkeleton, SearchInput, Segmented, Select, Stat, dueLabel, formatDate, formatINR } from '@/components/ui';
import { timeAgo } from '@/components/status';
import { CollabBadge, PLATFORM_LABEL, PayoutBadge, TIER_LABEL, VerificationBadge, followersShort } from '@/components/creators';
import { FormError } from './finance/forms';

const TABS = [
  { value: 'verification', label: 'Verification' },
  { value: 'directory', label: 'Directory' },
  { value: 'campaigns', label: 'Campaigns' },
  { value: 'payouts', label: 'Payouts' },
  { value: 'requests', label: 'Client requests' },
];
const Loading = () => <div className="skeleton" style={{ height: 320 }} />;
const isoDay = (n = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export function AdminInfluencers() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'verification';
  const set = (k, v) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v) next.set(k, v);
      else next.delete(k);
      return next;
    });
  const queue = useInfluencerAdmin({ verification: 'PENDING' });
  const payouts = useInfluencerPayouts();
  const requests = useCollabRequests();
  const count = (n) => (n ? ` (${n})` : '');
  const labels = {
    verification: count(queue.data?.length),
    payouts: count(payouts.data?.filter((p) => p.status === 'REQUESTED').length),
    requests: count(requests.data?.filter((r) => r.status === 'NEW').length),
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Creators, campaigns and payouts"
        title="Influencers"
        actions={
          <Button onClick={() => setParams({ tab: 'campaigns', new: '1' })}>
            <LuPlus aria-hidden /> New campaign
          </Button>
        }
      />
      <Segmented label="Influencer sections" value={tab} onChange={(v) => setParams(v === 'verification' ? {} : { tab: v })} options={TABS.map((t) => ({ ...t, label: t.label + (labels[t.value] ?? '') }))} />
      {tab === 'verification' && <VerificationTab />}
      {tab === 'directory' && <DirectoryTab />}
      {tab === 'campaigns' && <CampaignsTab open={params.get('campaign')} setOpen={(id) => set('campaign', id)} />}
      {tab === 'payouts' && <PayoutsTab />}
      {tab === 'requests' && <RequestsTab onCreate={(r) => setParams({ tab: 'campaigns', new: '1', from: r.id })} />}
      <Drawer open={params.get('new') === '1'} onClose={() => setParams({ tab: 'campaigns' })} title="New campaign">
        {params.get('new') === '1' && <CampaignForm fromId={params.get('from')} onSaved={(c) => setParams({ tab: 'campaigns', campaign: c.id })} />}
      </Drawer>
    </div>
  );
}

/* ---------------------------------------------------------- verification */

function VerificationTab() {
  const { data, error, isPending, refetch } = useInfluencerAdmin({ verification: 'PENDING' });
  const action = useInfluencerAdminAction();
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  if (isPending) return <Loading />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!data.length) return <Card><EmptyState title="No profiles waiting">New sign-ups appear here once they send their profile for review.</EmptyState></Card>;
  return (
    <>
      <FormError error={action.error} />
      {data.map((r) => (
        <Card key={r.id} title={r.name} action={<span className="small muted">Sent {r.submittedAt ? timeAgo(r.submittedAt) : ''}</span>}>
          <div className="grid grid--2" style={{ gap: 16 }}>
            <div className="grid" style={{ gap: 6 }}>
              <div className="small">
                {r.city} · {r.niches.join(', ')} · {TIER_LABEL[r.tier]}
              </div>
              <div className="small muted">
                {r.email}
                {r.phone ? ` · ${r.phone}` : ''} · {r.hasLogin ? 'signed up' : 'added by staff'}
              </div>
              <p className="small">{r.bio}</p>
              <ul className="list">
                {r.platforms.map((p) => (
                  <li key={p.platform} className="list__item">
                    <div className="list__main">
                      <div className="list__title small">
                        {PLATFORM_LABEL[p.platform]} @{p.handle}
                      </div>
                      <div className="list__meta">
                        {followersShort(p.followers)} followers · {p.engagementRate}% engagement
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="small">
                Rates: reel {formatINR(r.rates.reel)} · story {formatINR(r.rates.story)} · post {formatINR(r.rates.post)}
              </div>
              <div className="small">Insights: {r.insightsFile ?? <span className="text-danger">not uploaded</span>}</div>
            </div>
            <div className="grid" style={{ gap: 8, alignContent: 'start' }}>
              {r.flags.length ? (
                r.flags.map((f) => (
                  <p key={f} className="note small note--warn">
                    <LuCircleAlert aria-hidden />
                    <span>{f}</span>
                  </p>
                ))
              ) : (
                <p className="small muted">No automatic flags.</p>
              )}
              {rejecting === r.id ? (
                <form
                  className="grid card-form"
                  style={{ gap: 8 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    action.mutate({ kind: 'decide', id: r.id, decision: 'REJECT', reason }, { onSuccess: () => (setRejecting(null), setReason('')) });
                  }}
                >
                  <label className="field">
                    <span className="field__label">What should they fix?</span>
                    <textarea className="field__input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
                  </label>
                  <div className="row">
                    <Button type="submit" size="sm" variant="secondary" loading={action.isPending} disabled={reason.trim().length < 10}>
                      Send back
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRejecting(null)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="row">
                  <Button size="sm" loading={action.isPending} onClick={() => action.mutate({ kind: 'decide', id: r.id, decision: 'VERIFY' })}>
                    Verify
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setRejecting(r.id)}>
                    Ask for changes
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </>
  );
}

/* ------------------------------------------------------------- directory */

function DirectoryTab() {
  const [q, setQ] = useState('');
  const [ver, setVer] = useState(undefined);
  const { data, error, isPending, refetch } = useInfluencerAdmin({ verification: ver, q: q || undefined });
  if (isPending) return <Loading />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  return (
    <>
      <div className="toolbar">
        <SearchInput label="Search creators" value={q} onChange={setQ} placeholder="Name, city or niche" />
        <Select
          label="Status"
          hideLabel
          value={ver}
          onChange={setVer}
          allLabel="Any status"
          options={[
            { value: 'VERIFIED', label: 'Verified' },
            { value: 'PENDING', label: 'Under review' },
            { value: 'DRAFT', label: 'Draft' },
            { value: 'REJECTED', label: 'Needs changes' },
          ]}
        />
      </div>
      <Card flush>
        <div className="card__body">
          <table className="table table--rows">
            <thead>
              <tr>
                <th>Creator</th>
                <th>Reach</th>
                <th className="num">Reel rate</th>
                <th className="num">Rating</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td data-label="Creator" className="td--title">
                    {r.name}
                    <div className="list__meta">
                      {r.city} · {r.niches.join(', ')}
                    </div>
                  </td>
                  <td data-label="Reach">
                    {r.platforms.map((p) => `${PLATFORM_LABEL[p.platform]} ${followersShort(p.followers)} (${p.engagementRate}%)`).join(' · ')}
                  </td>
                  <td data-label="Reel rate" className="num">{r.rates.reel ? formatINR(r.rates.reel) : '—'}</td>
                  <td data-label="Rating" className="num">
                    {r.rating?.toFixed(1) ?? '—'}
                    <div className="list__meta">{r.campaignsDone} done</div>
                  </td>
                  <td data-label="Status">
                    <VerificationBadge status={r.verification} />
                    {r.flags.length > 0 && <div className="list__meta text-danger">{r.flags.length} flag{r.flags.length === 1 ? '' : 's'}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------- campaigns */

function CampaignsTab({ open, setOpen }) {
  const { data, error, isPending, refetch } = useCampaigns();
  if (isPending) return <Loading />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  return (
    <>
      <Card flush>
        <div className="card__body">
          <table className="table table--rows">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Creators</th>
                <th className="num">Budget</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <td data-label="Campaign" className="td--title">
                    <button type="button" className="row-link link-btn" onClick={() => setOpen(c.id)}>
                      {c.title}
                    </button>
                    <div className="list__meta">
                      {c.clientName} · {c.deliverable}
                    </div>
                  </td>
                  <td data-label="Creators">
                    <div className="badge-row">
                      {c.collabs.map((x) => (
                        <span key={x.influencerId} className="small">
                          {x.influencerName.split(' ')[0]} <CollabBadge status={x.status} />
                        </span>
                      ))}
                      {!c.collabs.length && <span className="muted small">No one invited yet</span>}
                    </div>
                  </td>
                  <td data-label="Budget" className="num">
                    {formatINR(c.committed)} of {formatINR(c.budget)}
                  </td>
                  <td data-label="Status">
                    <Badge tone={c.status === 'RUNNING' ? 'info' : c.status === 'DONE' ? 'ok' : 'neutral'}>{c.status === 'RUNNING' ? 'Running' : c.status === 'DONE' ? 'Done' : 'Draft'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Drawer open={!!open} onClose={() => setOpen(undefined)} title="Campaign">
        {open && <CampaignPanel id={open} />}
      </Drawer>
    </>
  );
}

function CampaignPanel({ id }) {
  const { data: c, error, isPending, refetch } = useCampaign(id);
  const verified = useInfluencerAdmin({ verification: 'VERIFIED' });
  const action = useInfluencerAdminAction();
  const [inv, setInv] = useState({ influencerId: '', fee: '', respondBy: isoDay(3), draftDue: isoDay(10) });
  const [feedback, setFeedback] = useState({});
  if (isPending) return <Loading />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  const available = (verified.data ?? []).filter((r) => r.availability !== 'PAUSED' && !c.collabs.some((x) => x.influencerId === r.id && x.status !== 'DECLINED'));
  const pick = available.find((r) => r.id === inv.influencerId);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div>
        <h3 className="lead-title">{c.title}</h3>
        <div className="small muted">
          {c.clientName} · {c.deliverable} · {formatINR(c.committed)} committed of {formatINR(c.budget)}
        </div>
      </div>
      <p className="small">{c.brief}</p>
      <FormError error={action.error} />

      <section className="grid" style={{ gap: 8 }}>
        <h3 className="section-title">Creators</h3>
        {!c.collabs.length && <p className="small muted">Invite verified creators below.</p>}
        {c.collabs.map((x) => (
          <div key={x.influencerId} className="card-form grid" style={{ gap: 6 }}>
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <strong>{x.influencerName}</strong>
              <CollabBadge status={x.status} />
            </div>
            <div className="small muted">
              {formatINR(x.fee)} · reply {formatDate(x.respondBy)} · draft {formatDate(x.draftDue)}
            </div>
            {x.status === 'COUNTERED' && (
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <span className="small">Asks {formatINR(x.counterFee)}</span>
                <Button size="sm" loading={action.isPending} onClick={() => action.mutate({ kind: 'counter', id: c.id, influencerId: x.influencerId, accept: true })}>
                  Accept counter
                </Button>
                <Button size="sm" variant="ghost" onClick={() => action.mutate({ kind: 'counter', id: c.id, influencerId: x.influencerId, accept: false })}>
                  Decline
                </Button>
              </div>
            )}
            {x.draft && (
              <div className="small">
                <div>
                  <strong>Draft:</strong> {x.draft.fileName}
                </div>
                <div>“{x.draft.caption}”</div>
                <div className={x.draft.disclosure ? 'muted' : 'text-danger'}>{x.draft.disclosure ? 'Disclosure confirmed (ASCI)' : 'No disclosure'}</div>
              </div>
            )}
            {x.status === 'DRAFT_SUBMITTED' && (
              <div className="grid" style={{ gap: 6 }}>
                <input
                  className="field__input"
                  aria-label={`Feedback for ${x.influencerName}`}
                  placeholder="Feedback (needed to request changes)"
                  value={feedback[x.influencerId] ?? ''}
                  onChange={(e) => setFeedback({ ...feedback, [x.influencerId]: e.target.value })}
                />
                <div className="row">
                  <Button size="sm" loading={action.isPending} onClick={() => action.mutate({ kind: 'review', id: c.id, influencerId: x.influencerId, decision: 'APPROVE', feedback: feedback[x.influencerId] })}>
                    Approve draft
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => action.mutate({ kind: 'review', id: c.id, influencerId: x.influencerId, decision: 'CHANGES', feedback: feedback[x.influencerId] })}>
                    Request changes
                  </Button>
                </div>
              </div>
            )}
            {x.liveUrl && (
              <div className="small">
                Live: <a href={x.liveUrl} target="_blank" rel="noreferrer">{x.liveUrl}</a> · proof {x.proofFile}
              </div>
            )}
            {(x.status === 'LIVE' || x.status === 'PAID') && x.rating === undefined && (
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <span className="small">Rate:</span>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Button key={n} size="sm" variant="ghost" aria-label={`Rate ${n} of 5`} onClick={() => action.mutate({ kind: 'rate', id: c.id, influencerId: x.influencerId, rating: n })}>
                    {n}★
                  </Button>
                ))}
              </div>
            )}
            {x.rating !== undefined && <div className="small muted">Rated {x.rating} / 5</div>}
          </div>
        ))}
      </section>

      {c.status !== 'DONE' && (
        <form
          className="grid card-form"
          style={{ gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            action.mutate(
              { kind: 'invite', id: c.id, body: { ...inv, fee: Number(inv.fee) } },
              { onSuccess: () => setInv({ ...inv, influencerId: '', fee: '' }) },
            );
          }}
        >
          <h3 className="section-title">Invite a creator</h3>
          <label className="field">
            <span className="field__label">Verified creator</span>
            <select
              className="field__input"
              value={inv.influencerId}
              onChange={(e) => {
                const r = available.find((x) => x.id === e.target.value);
                setInv({ ...inv, influencerId: e.target.value, fee: r ? String(r.rates.reel) : '' });
              }}
            >
              <option value="">Choose…</option>
              {available.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.niches[0]} · reel {formatINR(r.rates.reel)}
                </option>
              ))}
            </select>
          </label>
          {pick && <p className="small muted">Their rate card: reel {formatINR(pick.rates.reel)}, story {formatINR(pick.rates.story)}, post {formatINR(pick.rates.post)}.</p>}
          <div className="grid grid--3">
            <Input label="Fee (₹)" inputMode="numeric" value={inv.fee} onChange={(e) => setInv({ ...inv, fee: e.target.value })} />
            <Input label="Reply by" type="date" value={inv.respondBy} onChange={(e) => setInv({ ...inv, respondBy: e.target.value })} />
            <Input label="Draft due" type="date" value={inv.draftDue} onChange={(e) => setInv({ ...inv, draftDue: e.target.value })} />
          </div>
          <Button type="submit" size="sm" loading={action.isPending} disabled={!inv.influencerId}>
            Send invite
          </Button>
        </form>
      )}
    </div>
  );
}

function CampaignForm({ fromId, onSaved }) {
  const clients = useClients({});
  const requests = useCollabRequests();
  const action = useInfluencerAdminAction();
  const from = requests.data?.find((r) => r.id === fromId);
  const [f, setF] = useState({ clientId: '', title: '', brief: '', deliverable: '1 reel + 3 stories', hashtags: '', dos: 'Use the paid-partnership label and start the caption with #ad.', budget: '' });
  useEffect(() => {
    if (from) setF((x) => ({ ...x, clientId: from.clientId, brief: from.brief, budget: String(from.budget), title: x.title || 'Creator campaign' }));
  }, [from]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="grid"
      style={{ gap: 14 }}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        action.mutate({ kind: 'createCampaign', body: { ...f, budget: Number(f.budget), fromRequestId: fromId || undefined } }, { onSuccess: onSaved });
      }}
    >
      <FormError error={action.error} />
      {from && (
        <p className="note small">
          From {from.clientName}'s request for {from.influencers.map((i) => i.name).join(', ')}.
        </p>
      )}
      <label className="field">
        <span className="field__label">Client</span>
        <select className="field__input" value={f.clientId} onChange={set('clientId')}>
          <option value="">Choose a client</option>
          {(clients.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <Input label="Title" value={f.title} onChange={set('title')} />
      <label className="field">
        <span className="field__label">Brief (creators see this)</span>
        <textarea className="field__input" rows={3} value={f.brief} onChange={set('brief')} />
      </label>
      <div className="grid grid--pair">
        <Input label="Deliverable per creator" value={f.deliverable} onChange={set('deliverable')} />
        <Input label="Budget for creator fees (₹)" inputMode="numeric" value={f.budget} onChange={set('budget')} />
      </div>
      <Input label="Hashtags" value={f.hashtags} onChange={set('hashtags')} />
      <Input label="Do's and don'ts" value={f.dos} onChange={set('dos')} />
      <Button type="submit" loading={action.isPending}>
        Create campaign
      </Button>
    </form>
  );
}

/* ---------------------------------------------------------------- payouts */

function PayoutsTab() {
  const { user } = useAuth();
  const { data, error, isPending, refetch } = useInfluencerPayouts();
  const action = useInfluencerAdminAction();
  const [ref, setRef] = useState({});
  if (isPending) return <Loading />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  const isSuper = user?.role === 'SUPER_ADMIN';
  const waiting = data.filter((p) => p.status === 'REQUESTED');
  return (
    <>
      <div className="grid grid--stats">
        <Stat label="To approve" value={waiting.length} hint={formatINR(waiting.reduce((n, p) => n + p.gross, 0))} accent={waiting.length > 0} />
        <Stat label="Approved, to pay" value={data.filter((p) => p.status === 'APPROVED').length} hint="Super Admin records the transfer" />
        <Stat label="TDS deducted" value={formatINR(data.filter((p) => p.status === 'PAID').reduce((n, p) => n + p.tds, 0))} hint="Deposit and file Form 26Q" />
      </div>
      <FormError error={action.error} />
      <Card flush>
        <div className="card__body">
          {data.length === 0 ? (
            <EmptyState title="No payouts" />
          ) : (
            <table className="table table--rows">
              <thead>
                <tr>
                  <th>Creator</th>
                  <th className="num">Fee</th>
                  <th className="num">Net after TDS</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Creator" className="td--title">
                      {p.influencerName}
                      <div className="list__meta">
                        {p.brand}: {p.campaignTitle} · {timeAgo(p.requestedAt)}
                      </div>
                    </td>
                    <td data-label="Fee" className="num">
                      {formatINR(p.gross)}
                      {p.needsOwner && p.status === 'REQUESTED' && <div className="list__meta text-danger">Above deputy limit</div>}
                    </td>
                    <td data-label="Net" className="num">
                      {formatINR(p.net)}
                      <div className="list__meta">TDS {formatINR(p.tds)}</div>
                    </td>
                    <td data-label="Status">
                      <PayoutBadge status={p.status} />
                      {p.approvedBy && <div className="list__meta">by {p.approvedBy}</div>}
                    </td>
                    <td data-label="">
                      {p.status === 'REQUESTED' && (
                        <div className="row" style={{ flexWrap: 'wrap' }}>
                          <Button size="sm" disabled={p.needsOwner && !isSuper} loading={action.isPending} onClick={() => action.mutate({ kind: 'approvePayout', id: p.id })}>
                            Approve
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => action.mutate({ kind: 'rejectPayout', id: p.id, reason: 'Post not live or proof unclear; please re-share.' })}>
                            Hold
                          </Button>
                        </div>
                      )}
                      {p.status === 'APPROVED' && isSuper && (
                        <div className="row" style={{ flexWrap: 'wrap' }}>
                          <input
                            className="field__input"
                            style={{ width: 130 }}
                            aria-label={`Transfer reference for ${p.influencerName}`}
                            placeholder="UTR"
                            value={ref[p.id] ?? ''}
                            onChange={(e) => setRef({ ...ref, [p.id]: e.target.value })}
                          />
                          <Button size="sm" loading={action.isPending} onClick={() => action.mutate({ kind: 'paid', id: p.id, reference: ref[p.id] ?? '' })}>
                            Mark paid
                          </Button>
                        </div>
                      )}
                      {p.status === 'PAID' && <span className="small muted">{p.reference}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
      <p className="list__meta">Payouts are requested automatically when a creator shares the live link and proof. Above the deputy limit (Settings) only a Super Admin approves. TDS at 10% until the CA confirms the section.</p>
    </>
  );
}

/* ---------------------------------------------------------------- requests */

function RequestsTab({ onCreate }) {
  const { data, error, isPending, refetch } = useCollabRequests();
  if (isPending) return <Loading />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!data.length) return <Card><EmptyState title="No requests from clients" /></Card>;
  return (
    <Card>
      <ul className="list">
        {data.map((r) => (
          <li key={r.id} className="list__item list__item--wrap">
            <div className="list__main">
              <div className="list__title">
                {r.clientName}: {r.influencers.map((i) => i.name).join(', ')}
              </div>
              <div className="list__meta">
                {r.brief} · budget {formatINR(r.budget)} · start {dueLabel(r.startBy).replace('Due ', '').toLowerCase()} · by {r.requestedBy}, {timeAgo(r.createdAt)}
              </div>
            </div>
            {r.status === 'NEW' ? (
              <Button size="sm" onClick={() => onCreate(r)}>
                Create campaign
              </Button>
            ) : (
              <Badge tone="info">{r.status === 'IN_PROGRESS' ? 'Campaign started' : 'Closed'}</Badge>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
