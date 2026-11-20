import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LuPlus } from 'react-icons/lu';
import { useMyBriefs, useMyPartnerInvoices, usePartnerAction } from '@/api/queries';
import { Button, Card, Drawer, EmptyState, ErrorState, Input, PageHeader, PageSkeleton, dueLabel, formatDate, formatINR } from '@/components/ui';
import { timeAgo } from '@/components/status';
import { BriefBadge, FilePick, PartnerInvoiceBadge } from '@/components/creators';
import { FormError } from '@/pages/admin/finance/forms';

/** Partners see only briefs Webinger shared with them: client and project name, the brief, due date and fee. */
export function PartnerBriefs() {
  const [params, setParams] = useSearchParams();
  const { data, error, isPending, refetch } = useMyBriefs();
  if (isPending) return <PageSkeleton />;
  if (error) return <div className="page"><ErrorState message={error.message} onRetry={refetch} /></div>;
  const open = data.find((b) => b.id === params.get('b'));
  return (
    <div className="page">
      <PageHeader eyebrow="Work shared with you by Webinger" title="Briefs" />
      <Card flush>
        <div className="card__body">
          {data.length === 0 ? (
            <EmptyState title="No briefs yet" />
          ) : (
            <table className="table table--rows">
              <thead>
                <tr>
                  <th>Brief</th>
                  <th>Due</th>
                  <th className="num">Fee</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((b) => (
                  <tr key={b.id}>
                    <td data-label="Brief" className="td--title">
                      <button type="button" className="row-link link-btn" onClick={() => setParams({ b: b.id })}>
                        {b.title}
                      </button>
                      <div className="list__meta">
                        {b.clientName} · {b.projectName}
                      </div>
                    </td>
                    <td data-label="Due">{b.status === 'APPROVED' ? formatDate(b.due) : dueLabel(b.due)}</td>
                    <td data-label="Fee" className="num">{formatINR(b.fee)}</td>
                    <td data-label="Status">
                      <BriefBadge status={b.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
      <Drawer open={!!open} onClose={() => setParams({})} title={open?.title ?? ''}>
        {open && <BriefPanel key={open.id + open.status} b={open} />}
      </Drawer>
    </div>
  );
}

function BriefPanel({ b }) {
  const action = usePartnerAction();
  const [files, setFiles] = useState([]);
  const [note, setNote] = useState('');
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <BriefBadge status={b.status} />
        <strong>{formatINR(b.fee)}</strong>
      </div>
      <p className="small muted">
        {b.clientName} · {b.projectName} · {dueLabel(b.due)}
      </p>
      <p className="small">{b.description}</p>
      <FormError error={action.error} />
      {b.feedback && <div className={b.status === 'CHANGES_REQUESTED' ? 'alert alert--warn' : 'alert alert--ok'}>Webinger: {b.feedback}</div>}
      {b.status === 'NEW' && (
        <Button variant="secondary" loading={action.isPending} onClick={() => action.mutate({ kind: 'start', id: b.id })}>
          Start work
        </Button>
      )}
      {['NEW', 'IN_PROGRESS', 'CHANGES_REQUESTED'].includes(b.status) && (
        <form
          className="grid card-form"
          style={{ gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            action.mutate({ kind: 'submit', id: b.id, body: { files, note } });
          }}
        >
          <h3 className="section-title">Submit work</h3>
          <FilePick label="Files" multiple accept=".jpg,.jpeg,.png,.pdf,.zip,.mp4,.mov" value={files} onChange={setFiles} />
          <Input label="Note for Webinger" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button type="submit" loading={action.isPending} disabled={!files.length}>
            Submit for review
          </Button>
        </form>
      )}
      {b.status === 'APPROVED' && !b.invoiceId && <p className="note small">Approved. You can now send your invoice from Invoices.</p>}
      {b.submissions.length > 0 && (
        <section>
          <h3 className="section-title">Submitted</h3>
          <ul className="list">
            {b.submissions.map((s) => (
              <li key={s.id} className="list__item">
                <div className="list__main">
                  <div className="list__title small">{s.files.join(', ')}</div>
                  <div className="list__meta">
                    {timeAgo(s.at)}
                    {s.note ? ` · ${s.note}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function PartnerInvoices() {
  const [params, setParams] = useSearchParams();
  const invoices = useMyPartnerInvoices();
  const briefs = useMyBriefs();
  if (invoices.isPending || briefs.isPending) return <PageSkeleton />;
  if (invoices.error || briefs.error) return <div className="page"><ErrorState message={(invoices.error ?? briefs.error).message} onRetry={() => (invoices.refetch(), briefs.refetch())} /></div>;
  const billable = briefs.data.filter((b) => b.status === 'APPROVED' && !b.invoiceId);
  return (
    <div className="page">
      <PageHeader
        eyebrow="Bill approved work"
        title="Invoices"
        actions={
          billable.length > 0 && (
            <Button onClick={() => setParams({ new: '1' })}>
              <LuPlus aria-hidden /> Submit invoice
            </Button>
          )
        }
      />
      {billable.length > 0 && <p className="note small">{billable.length} approved brief{billable.length === 1 ? '' : 's'} ready to invoice.</p>}
      <Card flush>
        <div className="card__body">
          {invoices.data.length === 0 ? (
            <EmptyState title="No invoices yet" />
          ) : (
            <table className="table table--rows">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th className="num">Amount</th>
                  <th className="num">GST</th>
                  <th className="num">Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.data.map((i) => (
                  <tr key={i.id}>
                    <td data-label="Invoice" className="td--title">
                      {i.number}
                      <div className="list__meta">
                        {i.briefTitle} · sent {formatDate(i.submittedAt.slice(0, 10))}
                        {i.rejectReason ? ` · ${i.rejectReason}` : ''}
                      </div>
                    </td>
                    <td data-label="Amount" className="num">{formatINR(i.amount)}</td>
                    <td data-label="GST" className="num">{formatINR(i.gst)}</td>
                    <td data-label="Total" className="num">
                      <strong>{formatINR(i.total)}</strong>
                    </td>
                    <td data-label="Status">
                      <PartnerInvoiceBadge status={i.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
      <p className="list__meta">Webinger pays approved invoices within 15 days. TDS is deducted where the law requires it.</p>
      <Drawer open={params.get('new') === '1'} onClose={() => setParams({})} title="Submit invoice">
        {params.get('new') === '1' && <InvoiceForm briefs={billable} onDone={() => setParams({})} />}
      </Drawer>
    </div>
  );
}

function InvoiceForm({ briefs, onDone }) {
  const action = usePartnerAction();
  const [f, setF] = useState({ briefId: briefs[0]?.id ?? '', number: '', amount: String(briefs[0]?.fee ?? ''), gst: String(Math.round((briefs[0]?.fee ?? 0) * 0.18)) });
  return (
    <form
      className="grid"
      style={{ gap: 14 }}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        action.mutate({ kind: 'invoice', body: { briefId: f.briefId, number: f.number, amount: Number(f.amount), gst: Number(f.gst) } }, { onSuccess: onDone });
      }}
    >
      <FormError error={action.error} />
      <label className="field">
        <span className="field__label">For brief</span>
        <select
          className="field__input"
          value={f.briefId}
          onChange={(e) => {
            const b = briefs.find((x) => x.id === e.target.value);
            setF({ ...f, briefId: e.target.value, amount: String(b?.fee ?? ''), gst: String(Math.round((b?.fee ?? 0) * 0.18)) });
          }}
        >
          {briefs.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title} · {formatINR(b.fee)}
            </option>
          ))}
        </select>
      </label>
      <Input label="Your invoice number" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} />
      <div className="grid grid--pair">
        <Input label="Amount before GST (₹)" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        <Input label="GST (₹)" inputMode="decimal" value={f.gst} onChange={(e) => setF({ ...f, gst: e.target.value })} />
      </div>
      <Button type="submit" loading={action.isPending}>
        Submit invoice
      </Button>
    </form>
  );
}
