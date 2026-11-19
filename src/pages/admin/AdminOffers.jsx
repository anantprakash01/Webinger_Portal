import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LuPlus } from 'react-icons/lu';
import { useOfferAction, useOffers } from '@/api/queries';
import { Badge, Button, Card, Drawer, EmptyState, ErrorState, Input, PageHeader, PageSkeleton, formatDate } from '@/components/ui';
import { LEAD_SERVICES } from '@/components/people';
import { percent } from '@/components/finance';
import { FormError } from './finance/forms';

const isoDay = (n = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const todayIso = () => isoDay(0);

/** The client dashboard's single, dismissible offer slot. */
export function AdminOffers() {
  const [params, setParams] = useSearchParams();
  const { data, error, isPending, refetch } = useOffers();
  if (isPending) return <PageSkeleton />;
  if (error) return <div className="page"><ErrorState message={error.message} onRetry={refetch} /></div>;
  const editing = params.get('edit');
  const offer = data.find((o) => o.id === editing);
  const live = (o) => o.active && o.startDate <= todayIso() && o.endDate >= todayIso();
  return (
    <div className="page">
      <PageHeader
        eyebrow="One modest banner on client dashboards"
        title="Offers"
        actions={
          <Button onClick={() => setParams({ edit: 'new' })}>
            <LuPlus aria-hidden /> New offer
          </Button>
        }
      />
      <Card flush>
        <div className="card__body">
          {data.length === 0 ? (
            <EmptyState title="No offers yet" />
          ) : (
            <table className="table table--rows">
              <thead>
                <tr>
                  <th>Offer</th>
                  <th>Shown to</th>
                  <th>Dates</th>
                  <th className="num">Views</th>
                  <th className="num">Clicks</th>
                  <th className="num">Leads</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((o) => (
                  <tr key={o.id}>
                    <td data-label="Offer" className="td--title">
                      <button type="button" className="row-link link-btn" onClick={() => setParams({ edit: o.id })}>
                        {o.title}
                      </button>
                      <div className="list__meta">{o.text}</div>
                    </td>
                    <td data-label="Shown to">Clients without {o.service}</td>
                    <td data-label="Dates">
                      {formatDate(o.startDate)}–{formatDate(o.endDate)}
                    </td>
                    <td data-label="Views" className="num">{o.views}</td>
                    <td data-label="Clicks" className="num">
                      {o.clicks}
                      <div className="list__meta">{o.views ? percent(o.clicks / o.views) : '—'}</div>
                    </td>
                    <td data-label="Leads" className="num">{o.leads}</td>
                    <td data-label="Status">{live(o) ? <Badge tone="ok">Live</Badge> : o.active ? <Badge tone="info">Scheduled or ended</Badge> : <Badge>Paused</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
      <p className="list__meta">
        Each client sees at most one offer, only for a service they don't buy yet, and can hide it. A click creates a lead in the Sales pipeline for their account manager.
      </p>
      <Drawer open={!!editing} onClose={() => setParams({})} title={offer ? 'Edit offer' : 'New offer'}>
        {editing && <OfferForm key={editing} offer={offer} onDone={() => setParams({})} />}
      </Drawer>
    </div>
  );
}

function OfferForm({ offer, onDone }) {
  const action = useOfferAction();
  const [f, setF] = useState(
    offer
      ? { title: offer.title, text: offer.text, cta: offer.cta, service: offer.service, startDate: offer.startDate, endDate: offer.endDate, active: offer.active }
      : { title: '', text: '', cta: 'Learn more', service: 'SEO', startDate: isoDay(0), endDate: isoDay(30), active: true },
  );
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="grid"
      style={{ gap: 14 }}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        action.mutate(offer ? { kind: 'update', id: offer.id, body: f } : { kind: 'create', body: f }, { onSuccess: onDone });
      }}
    >
      <FormError error={action.error} />
      <Input label="Title (up to 60 characters)" value={f.title} maxLength={60} onChange={set('title')} />
      <Input label="One line of text (up to 140)" value={f.text} maxLength={140} onChange={set('text')} />
      <div className="grid grid--pair">
        <Input label="Button text" value={f.cta} maxLength={20} onChange={set('cta')} />
        <label className="field">
          <span className="field__label">Promotes</span>
          <select className="field__input" value={f.service} onChange={set('service')}>
            {LEAD_SERVICES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid--pair">
        <Input label="From" type="date" value={f.startDate} onChange={set('startDate')} />
        <Input label="Until" type="date" value={f.endDate} onChange={set('endDate')} />
      </div>
      <label className="check">
        <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
        <span className="small">Active</span>
      </label>
      <div className="offer-preview">
        <strong>{f.title || 'Title'}.</strong> <span className="small">{f.text || 'Your one line of text.'}</span> <span className="btn btn--secondary btn--sm">{f.cta}</span>
      </div>
      <Button type="submit" loading={action.isPending}>
        Save offer
      </Button>
    </form>
  );
}
