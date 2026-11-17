import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { LuArrowLeft, LuBan, LuBell, LuIndianRupee, LuPencil, LuPrinter, LuSend } from 'react-icons/lu';
import { useFinanceAction, useInvoice } from '@/api/queries';
import { Button, Card, Drawer, PageHeader, PageSkeleton, formatDate, formatINR } from '@/components/ui';
import { InvoiceBadge, timeAgo } from '@/components/status';
import { METHOD_LABEL, MoneyDocument } from '@/components/finance';
import { LoadError, NotVisible, isNotFound } from '@/components/projects';
import { FormError, InvoiceForm, PaymentForm } from './finance/forms';

export function AdminInvoice() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { data: inv, error, isPending, refetch } = useInvoice(id);
  const action = useFinanceAction();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const panel = params.get('panel');
  const open = (p) => setParams(p ? { panel: p } : {});

  if (isPending) return <PageSkeleton />;
  if (isNotFound(error)) return <NotVisible what="Invoice" backTo="/admin/finance?tab=invoices" backLabel="Back to invoices" />;
  if (error) return <LoadError error={error} onRetry={refetch} />;

  const unpaid = inv.status === 'SENT' || inv.status === 'OVERDUE';
  const canCancel = inv.status !== 'CANCELLED' && inv.payments.length === 0;

  return (
    <div className="page">
      <Link to="/admin/finance?tab=invoices" className="back-link no-print">
        <LuArrowLeft aria-hidden /> All invoices
      </Link>
      <PageHeader
        eyebrow={inv.clientName}
        title={inv.number ?? 'Draft invoice'}
        actions={
          <span className="row no-print" style={{ flexWrap: 'wrap' }}>
            <InvoiceBadge status={inv.status} />
            {inv.status === 'DRAFT' && (
              <>
                <Button variant="secondary" size="sm" onClick={() => open('edit')}>
                  <LuPencil aria-hidden /> Edit
                </Button>
                <Button size="sm" loading={action.isPending} onClick={() => action.mutate({ kind: 'send', id: inv.id })}>
                  <LuSend aria-hidden /> Number and send
                </Button>
              </>
            )}
            {unpaid && (
              <>
                <Button variant="secondary" size="sm" loading={action.isPending} onClick={() => action.mutate({ kind: 'remind', id: inv.id })}>
                  <LuBell aria-hidden /> Send reminder
                </Button>
                <Button size="sm" onClick={() => open('payment')}>
                  <LuIndianRupee aria-hidden /> Record payment
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={() => window.print()}>
              <LuPrinter aria-hidden /> Print / PDF
            </Button>
          </span>
        }
      />
      <div className="no-print">
        <FormError error={action.error} />
      </div>

      {inv.status === 'OVERDUE' && inv.daysLate >= 15 && (
        <div className="alert alert--warn no-print">
          <span>
            {inv.daysLate} days late. Under the payment terms you may pause work; that is your decision, never automatic. Change the client&apos;s status from{' '}
            <Link to={`/admin/clients/${inv.clientId}`}>their client record</Link>.
          </span>
        </div>
      )}
      {inv.status === 'CANCELLED' && (
        <div className="alert alert--info">
          <span>Cancelled: {inv.cancelReason}. Kept on record; numbers are never reused.</span>
        </div>
      )}

      <div className="invoice-layout">
        <MoneyDocument doc={inv} />
        <aside className="grid no-print" style={{ gap: 16, alignContent: 'start' }}>
          <Card title="Payments">
            {inv.payments.length === 0 ? (
              <p className="small muted">None yet.</p>
            ) : (
              <ul className="list">
                {inv.payments.map((p) => (
                  <li key={p.id} className="list__item">
                    <div className="list__main">
                      <div className="list__title">{formatINR(p.amount)}{p.tds ? ` + ${formatINR(p.tds)} TDS` : ''}</div>
                      <div className="list__meta">
                        {formatDate(p.date)} · {METHOD_LABEL[p.method]} · {p.receiptNumber}
                        {p.reference ? ` · ${p.reference}` : ''}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="History">
            <ul className="list">
              {inv.events.map((e) => (
                <li key={e.id} className="list__item">
                  <div className="list__main">
                    <div className="list__title small">{e.text}</div>
                    <div className="list__meta">
                      {e.actor} · {timeAgo(e.at)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          {canCancel && (
            <Card title="Cancel invoice">
              {!cancelling ? (
                <Button variant="secondary" size="sm" onClick={() => setCancelling(true)}>
                  <LuBan aria-hidden /> Cancel this invoice
                </Button>
              ) : (
                <form
                  className="grid"
                  style={{ gap: 8 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    action.mutate({ kind: 'cancel', id: inv.id, reason }, { onSuccess: () => setCancelling(false) });
                  }}
                >
                  <label className="field">
                    <span className="field__label">Why? (stays on the record)</span>
                    <input className="field__input" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
                  </label>
                  <div className="row">
                    <Button type="submit" size="sm" variant="secondary" loading={action.isPending} disabled={reason.trim().length < 5}>
                      Confirm cancel
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setCancelling(false)}>
                      Keep it
                    </Button>
                  </div>
                </form>
              )}
              <p className="small muted" style={{ marginTop: 8 }}>
                Invoices are never deleted. Once money is received, issue a credit note instead (Phase 1).
              </p>
            </Card>
          )}
        </aside>
      </div>

      <Drawer open={panel === 'edit' && inv.status === 'DRAFT'} onClose={() => open()} title="Edit draft">
        {panel === 'edit' && <InvoiceForm draft={inv} onSaved={() => open()} />}
      </Drawer>
      <Drawer open={panel === 'payment' && unpaid} onClose={() => open()} title="Record payment">
        {panel === 'payment' && <PaymentForm invoice={inv} onSaved={() => open()} />}
      </Drawer>
    </div>
  );
}
