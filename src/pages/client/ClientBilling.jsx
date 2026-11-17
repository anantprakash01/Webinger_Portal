import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LuCircleCheck } from 'react-icons/lu';
import { useBilling, useBillingAction, useBillingQuote } from '@/api/queries';
import { Button, Card, Drawer, EmptyState, ErrorState, PageHeader, PageSkeleton, Stat, dueLabel, formatDate, formatDateLong, formatINR } from '@/components/ui';
import { ContractStatusBadge, InvoiceBadge } from '@/components/status';
import { METHOD_LABEL, MoneyDocument, QuoteBadge } from '@/components/finance';
import { FormError } from '@/pages/admin/finance/forms';

/** Owners always; reps only when the owner granted billing (nav + route guard, and the API checks again). */
export function ClientBilling() {
  const [params, setParams] = useSearchParams();
  const { data, error, isPending, refetch } = useBilling();
  const quoteId = params.get('quote');

  if (isPending) return <PageSkeleton />;
  if (error) return <div className="page"><ErrorState message={error.message} onRetry={refetch} /></div>;

  const waiting = data.quotes.filter((q) => q.status === 'SENT');
  const decided = data.quotes.filter((q) => q.status !== 'SENT');

  return (
    <div className="page">
      <PageHeader eyebrow="Invoices, quotes and contracts" title="Billing" />

      <div className="grid grid--stats">
        <Stat label="Outstanding" value={formatINR(data.outstanding)} hint={data.overdue ? `${formatINR(data.overdue)} overdue` : 'Nothing overdue'} accent={data.overdue > 0} />
        <Stat
          label="Next payment"
          value={data.nextDue ? formatINR(data.nextDue.balance) : '—'}
          hint={data.nextDue ? `${data.nextDue.number} · ${dueLabel(data.nextDue.due).toLowerCase()}` : 'All paid'}
        />
        <Stat label="Quotes to decide" value={waiting.length} hint={waiting.length ? 'Open them below' : 'None waiting'} />
      </div>

      {waiting.length > 0 && (
        <Card title="Waiting for your decision" className="card--warn">
          <ul className="list">
            {waiting.map((q) => (
              <li key={q.id} className="list__item list__item--wrap">
                <div className="list__main">
                  <div className="list__title">{q.title}</div>
                  <div className="list__meta">
                    {q.number} · {formatINR(q.subtotal)}
                    {q.kind === 'RETAINER' ? ' a month' : ''} + GST · valid until {formatDate(q.validUntil)}
                  </div>
                </div>
                <Button size="sm" onClick={() => setParams({ quote: q.id })}>
                  Review quote
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Invoices" flush>
        <div className="card__body">
          {data.invoices.length === 0 ? (
            <EmptyState title="No invoices yet" />
          ) : (
            <table className="table table--rows">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Due</th>
                  <th className="num">Total</th>
                  <th className="num">Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((i) => (
                  <tr key={i.id}>
                    <td data-label="Invoice" className="td--title">
                      <Link to={`/client/billing/invoices/${i.id}`} className="row-link">
                        {i.number}
                      </Link>
                      <div className="list__meta">{i.title}</div>
                    </td>
                    <td data-label="Date">{formatDate(i.issueDate)}</td>
                    <td data-label="Due" className={i.status === 'OVERDUE' ? 'text-danger' : undefined}>
                      {i.status === 'OVERDUE' ? `${i.daysLate} days overdue` : i.balance ? dueLabel(i.due) : formatDate(i.due)}
                    </td>
                    <td data-label="Total" className="num">{formatINR(i.total)}</td>
                    <td data-label="Balance" className="num">{i.balance ? formatINR(i.balance) : '—'}</td>
                    <td data-label="Status">
                      <InvoiceBadge status={i.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <div className="grid grid--2">
        <Card title="Contracts">
          {data.contracts.length === 0 ? (
            <EmptyState title="No contracts yet" />
          ) : (
            <ul className="list">
              {data.contracts.map((c) => (
                <li key={c.id} className="list__item">
                  <div className="list__main">
                    <div className="list__title">{c.title}</div>
                    <div className="list__meta">
                      {formatINR(c.value)}
                      {c.kind === 'RETAINER' ? ' a month' : ''} · {formatDateLong(c.startDate)} to {formatDateLong(c.endDate)} · {c.revisionsPerDeliverable} revisions per deliverable
                    </div>
                  </div>
                  <ContractStatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Receipts">
          {data.payments.length === 0 ? (
            <EmptyState title="No payments yet" />
          ) : (
            <ul className="list">
              {data.payments.slice(0, 8).map((p) => (
                <li key={p.id} className="list__item">
                  <div className="list__main">
                    <div className="list__title">
                      {formatINR(p.amount)}
                      {p.tds ? ` + ${formatINR(p.tds)} TDS` : ''}
                    </div>
                    <div className="list__meta">
                      {p.receiptNumber} · {formatDate(p.date)} · {METHOD_LABEL[p.method]} · for{' '}
                      <Link to={`/client/billing/invoices/${p.invoiceId}`}>{p.invoiceNumber}</Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {decided.length > 0 && (
        <Card title="Earlier quotes">
          <ul className="list">
            {decided.map((q) => (
              <li key={q.id} className="list__item">
                <div className="list__main">
                  <button type="button" className="list__title link-btn" onClick={() => setParams({ quote: q.id })}>
                    {q.title}
                  </button>
                  <div className="list__meta">
                    {q.number} · {formatINR(q.subtotal)}
                    {q.decidedBy ? ` · ${q.decidedBy}, ${formatDate(q.decidedAt.slice(0, 10))}` : ''}
                  </div>
                </div>
                <QuoteBadge status={q.status} clientView />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Drawer open={!!quoteId} onClose={() => setParams({})} title="Quote">
        {quoteId && <QuoteReview id={quoteId} canAccept={data.canAccept} />}
      </Drawer>
    </div>
  );
}

function QuoteReview({ id, canAccept }) {
  const { data: q, error, isPending, refetch } = useBillingQuote(id);
  const action = useBillingAction();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [done, setDone] = useState(null);

  if (isPending) return <div className="skeleton" style={{ height: 420 }} />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  const decide = (a) => action.mutate(a, { onSuccess: () => (setDone(a.kind), refetch()) });

  return (
    <div className="grid" style={{ gap: 16 }}>
      {done === 'accept' && (
        <div className="alert alert--ok" role="status">
          <LuCircleCheck aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
          <span>Accepted. Your contract is added under Billing and your account manager will send the first invoice shortly.</span>
        </div>
      )}
      {done === 'decline' && (
        <div className="alert alert--info" role="status">
          <span>Thanks for letting us know. Your account manager has your note.</span>
        </div>
      )}
      <FormError error={action.error} />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <QuoteBadge status={q.status} clientView />
        <span className="small muted">Valid until {formatDateLong(q.validUntil)}</span>
      </div>
      {q.status === 'SENT' &&
        (canAccept ? (
          !declining ? (
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <Button loading={action.isPending} onClick={() => decide({ kind: 'accept', id: q.id })}>
                Accept quote
              </Button>
              <Button variant="secondary" onClick={() => setDeclining(true)}>
                Decline
              </Button>
            </div>
          ) : (
            <form
              className="grid"
              style={{ gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                decide({ kind: 'decline', id: q.id, reason });
              }}
            >
              <label className="field">
                <span className="field__label">What should we change? (shared with your account manager)</span>
                <textarea className="field__input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
              </label>
              <div className="row">
                <Button type="submit" variant="secondary" size="sm" loading={action.isPending} disabled={reason.trim().length < 3}>
                  Decline quote
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setDeclining(false)}>
                  Back
                </Button>
              </div>
            </form>
          )
        ) : (
          <p className="note small">Only your company owner can accept or decline quotes.</p>
        ))}
      {q.declineReason && <p className="small muted">Your note: “{q.declineReason}”</p>}
      <MoneyDocument doc={q} kind="quote" />
    </div>
  );
}
