import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LuCircleCheck, LuHeart, LuScale, LuStar, LuX } from 'react-icons/lu';
import { useDiscovery, useDiscoveryAction, useMyCollabRequests } from '@/api/queries';
import { Badge, Button, Card, Drawer, EmptyState, ErrorState, Input, PageHeader, PageSkeleton, SearchInput, Select, cx, formatINR } from '@/components/ui';
import { NICHES, PLATFORM_LABEL, PLATFORM_OPTIONS, TIER_LABEL, TIER_OPTIONS, followersShort } from '@/components/creators';
import { FormError } from '@/pages/admin/finance/forms';

const FILTERS = ['q', 'niche', 'city', 'platform', 'tier', 'maxPrice', 'minEngagement', 'shortlisted'];
const isoDay = (n = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Verified creators only; contacts and full handles stay with Webinger (the agency runs every collaboration). */
export function ClientInfluencers() {
  const [params, setParams] = useSearchParams();
  const q = Object.fromEntries(FILTERS.map((k) => [k, params.get(k) ?? undefined]));
  if (q.shortlisted) q.shortlisted = true;
  const [text, setText] = useState(q.q ?? '');
  const [compare, setCompare] = useState([]);
  const [requesting, setRequesting] = useState(false);
  const [done, setDone] = useState(false);
  const { data, error, isPending, isFetching, refetch } = useDiscovery(q);
  const requests = useMyCollabRequests();
  const action = useDiscoveryAction();
  const set = (k, v) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (v) next.set(k, String(v));
        else next.delete(k);
        return next;
      },
      { replace: true },
    );
  useEffect(() => {
    const id = setTimeout(() => (q.q ?? '') !== text.trim() && set('q', text.trim() || undefined), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  if (isPending) return <PageSkeleton />;
  if (error) return <div className="page"><ErrorState message={error.message} onRetry={refetch} /></div>;
  const comparing = data.filter((c) => compare.includes(c.id));
  const toggleCompare = (id) => setCompare(compare.includes(id) ? compare.filter((x) => x !== id) : [...compare, id].slice(-3));
  const filtered = FILTERS.some((k) => params.get(k));

  return (
    <div className="page">
      <PageHeader
        eyebrow="Verified creators · Webinger runs the collaboration for you"
        title="Influencers"
        actions={
          compare.length > 0 && (
            <Button onClick={() => (setRequesting(true), setDone(false))}>
              Request collaboration ({compare.length})
            </Button>
          )
        }
      />
      {done && (
        <div className="alert alert--ok" role="status">
          <LuCircleCheck aria-hidden style={{ flexShrink: 0, marginTop: 2 }} /> <span>Request sent. Your account manager will come back with a plan and final prices.</span>
        </div>
      )}
      <div className="toolbar">
        <SearchInput label="Search creators" value={text} onChange={setText} placeholder="Name, city or niche" />
        <Select label="Niche" hideLabel value={q.niche} onChange={(v) => set('niche', v)} allLabel="Any niche" options={NICHES.map((n) => ({ value: n, label: n }))} />
        <Select label="Platform" hideLabel value={q.platform} onChange={(v) => set('platform', v)} allLabel="Any platform" options={PLATFORM_OPTIONS} />
        <Select label="Size" hideLabel value={q.tier} onChange={(v) => set('tier', v)} allLabel="Any size" options={TIER_OPTIONS} />
        <Select
          label="Price"
          hideLabel
          value={q.maxPrice}
          onChange={(v) => set('maxPrice', v)}
          allLabel="Any price"
          options={[10000, 20000, 50000].map((v) => ({ value: String(v), label: `Up to ${formatINR(v)}` }))}
        />
        <Select
          label="Engagement"
          hideLabel
          value={q.minEngagement}
          onChange={(v) => set('minEngagement', v)}
          allLabel="Any engagement"
          options={[2, 3, 5].map((v) => ({ value: String(v), label: `${v}%+ engagement` }))}
        />
        <Button variant={q.shortlisted ? 'primary' : 'secondary'} size="sm" aria-pressed={!!q.shortlisted} onClick={() => set('shortlisted', q.shortlisted ? undefined : '1')}>
          <LuHeart aria-hidden /> Shortlist
        </Button>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => (setText(''), setParams({}, { replace: true }))}>
            <LuX aria-hidden /> Clear
          </Button>
        )}
      </div>

      {comparing.length > 1 && (
        <Card title="Compare" action={<Button variant="ghost" size="sm" onClick={() => setCompare([])}>Clear</Button>} flush>
          <div className="card__body table-scroll">
            <table className="grid-table compare-table">
              <thead>
                <tr>
                  <th />
                  {comparing.map((c) => (
                    <th key={c.id}>{c.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['City', (c) => c.city],
                  ['Niches', (c) => c.niches.join(', ')],
                  ['Size', (c) => TIER_LABEL[c.tier]],
                  ['Followers', (c) => followersShort(c.totalFollowers)],
                  ['Best engagement', (c) => `${c.bestEngagement}%`],
                  ['Rating', (c) => (c.rating ? `${c.rating} / 5 (${c.campaignsDone})` : 'New')],
                  ['From', (c) => formatINR(c.priceFrom)],
                ].map(([label, fn]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    {comparing.map((c) => (
                      <td key={c.id}>{fn(c)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {data.length === 0 ? (
        <Card>
          <EmptyState title={q.shortlisted ? 'Your shortlist is empty' : 'No creators match'}>{q.shortlisted ? 'Tap the heart on a creator to save them.' : 'Try fewer filters.'}</EmptyState>
        </Card>
      ) : (
        <div className="creator-grid" style={{ opacity: isFetching ? 0.6 : 1 }}>
          {data.map((c) => (
            <article key={c.id} className={cx('card creator-card', compare.includes(c.id) && 'is-picked')}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <h2 className="creator-card__name">{c.name}</h2>
                  <div className="small muted">
                    {c.city} · {c.languages.slice(0, 2).join(', ')}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  icon
                  aria-pressed={c.shortlisted}
                  aria-label={c.shortlisted ? `Remove ${c.name} from shortlist` : `Add ${c.name} to shortlist`}
                  onClick={() => action.mutate({ kind: 'shortlist', id: c.id })}
                  className={c.shortlisted ? 'is-loved' : undefined}
                >
                  <LuHeart />
                </Button>
              </div>
              <div className="badge-row">
                {c.niches.map((n) => (
                  <Badge key={n}>{n}</Badge>
                ))}
                <Badge tone="info">{TIER_LABEL[c.tier].split(' ')[0]}</Badge>
                {c.availability === 'BUSY' && <Badge tone="warn">Busy</Badge>}
              </div>
              <ul className="creator-card__stats">
                {c.platforms.map((p) => (
                  <li key={p.platform}>
                    <span>
                      {PLATFORM_LABEL[p.platform]} <span className="muted">{p.handleMasked}</span>
                    </span>
                    <span>
                      {followersShort(p.followers)} · {p.engagementRate}%
                    </span>
                  </li>
                ))}
              </ul>
              <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span className="small">
                  {c.rating ? (
                    <>
                      <LuStar aria-hidden /> {c.rating} · {c.campaignsDone} campaigns
                    </>
                  ) : (
                    'New to Webinger'
                  )}
                </span>
                <strong className="small">from {formatINR(c.priceFrom)}</strong>
              </div>
              <Button variant={compare.includes(c.id) ? 'primary' : 'secondary'} size="sm" aria-pressed={compare.includes(c.id)} onClick={() => toggleCompare(c.id)}>
                <LuScale aria-hidden /> {compare.includes(c.id) ? 'Selected' : 'Select to compare'}
              </Button>
            </article>
          ))}
        </div>
      )}
      <p className="list__meta">
        Prices are indicative and include Webinger's management. Contact details and full handles stay private: your account manager briefs the creators, checks drafts and
        pays them.
      </p>

      {requests.data?.length > 0 && (
        <Card title="Your requests">
          <ul className="list">
            {requests.data.map((r) => (
              <li key={r.id} className="list__item">
                <div className="list__main">
                  <div className="list__title small">{r.influencers.map((i) => i.name).join(', ')}</div>
                  <div className="list__meta">
                    {r.brief} · {formatINR(r.budget)}
                  </div>
                </div>
                <Badge tone={r.status === 'NEW' ? 'warn' : 'info'}>{r.status === 'NEW' ? 'With your account manager' : 'Campaign planned'}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Drawer open={requesting} onClose={() => setRequesting(false)} title="Request a collaboration">
        {requesting && <RequestForm picked={comparing.length ? comparing : data.filter((c) => compare.includes(c.id))} onDone={() => (setRequesting(false), setCompare([]), setDone(true))} />}
      </Drawer>
    </div>
  );
}

function RequestForm({ picked, onDone }) {
  const action = useDiscoveryAction();
  const [f, setF] = useState({ brief: '', budget: String(picked.reduce((n, c) => n + c.priceFrom, 0)), startBy: isoDay(14) });
  return (
    <form
      className="grid"
      style={{ gap: 14 }}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        action.mutate({ kind: 'request', body: { influencerIds: picked.map((c) => c.id), brief: f.brief, budget: Number(f.budget), startBy: f.startBy } }, { onSuccess: onDone });
      }}
    >
      <FormError error={action.error} />
      <p className="small">
        Creators: <strong>{picked.map((c) => c.name).join(', ')}</strong>
      </p>
      <label className="field">
        <span className="field__label">What do you want to promote?</span>
        <textarea className="field__input" rows={3} value={f.brief} onChange={(e) => setF({ ...f, brief: e.target.value })} placeholder="Product, goal, dates, anything to avoid" />
      </label>
      <div className="grid grid--pair">
        <Input label="Budget (₹)" inputMode="numeric" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} />
        <Input label="Start by" type="date" value={f.startBy} onChange={(e) => setF({ ...f, startBy: e.target.value })} />
      </div>
      <Button type="submit" loading={action.isPending}>
        Send to my account manager
      </Button>
    </form>
  );
}
