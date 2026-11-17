import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuDownload, LuSend, LuX } from 'react-icons/lu';
import {
  useClients,
  useExpenses,
  useExportLog,
  useFinanceAction,
  useInvoices,
  usePayments,
  useProfit,
  useQuote,
  useQuotes,
} from '@/api/queries';
import { Badge, Button, Card, EmptyState, ErrorState, Input, SearchInput, Select, dueLabel, formatDate, formatINR } from '@/components/ui';
import { InvoiceBadge, timeAgo } from '@/components/status';
import {
  CATEGORY_LABEL,
  CATEGORY_OPTIONS,
  INVOICE_STATUS_OPTIONS,
  METHOD_LABEL,
  MoneyDocument,
  QUOTE_STATUS_OPTIONS,
  QuoteBadge,
  downloadText,
  monthLabel,
  percent,
} from '@/components/finance';
import { FormError } from './forms';

const Loading = () => <div className="skeleton" style={{ height: 320 }} />;
const isoDay = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};
const lastMonths = (n) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

function useClientOptions() {
  const clients = useClients({});
  return (clients.data ?? []).map((c) => ({ value: c.id, label: c.name }));
}

/* ---------------------------------------------------------------- invoices */

export function InvoicesTab({ params, set }) {
  const [text, setText] = useState(params.get('q') ?? '');
  useEffect(() => {
    const id = setTimeout(() => (params.get('q') ?? '') !== text.trim() && set('q', text.trim() || undefined), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  const q = { status: params.get('status') ?? undefined, clientId: params.get('clientId') ?? undefined, q: params.get('q') ?? undefined };
  const { data, error, isPending, isFetching, refetch } = useInvoices(q);
  const clientOptions = useClientOptions();
  const filtered = q.status || q.clientId || q.q;

  return (
    <>
      <div className="toolbar">
        <SearchInput label="Search invoices" value={text} onChange={setText} placeholder="Number, client or title" />
        <Select label="Status" hideLabel value={q.status} onChange={(v) => set('status', v)} allLabel="Any status" options={INVOICE_STATUS_OPTIONS} />
        <Select label="Client" hideLabel value={q.clientId} onChange={(v) => set('clientId', v)} allLabel="All clients" options={clientOptions} />
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => (setText(''), set('status', undefined), set('clientId', undefined), set('q', undefined))}>
            <LuX aria-hidden /> Clear
          </Button>
        )}
      </div>
      <Card flush>
        <div className="card__body" style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity .15s' }}>
          {isPending ? (
            <Loading />
          ) : error ? (
            <ErrorState message={error.message} onRetry={refetch} />
          ) : data.length === 0 ? (
            <EmptyState title={filtered ? 'No invoices match' : 'No invoices yet'}>{filtered ? 'Try clearing the filters.' : 'Create the first one with "New invoice".'}</EmptyState>
          ) : (
            <table className="table table--rows">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Client</th>
                  <th>Date</th>
                  <th>Due</th>
                  <th className="num">Total</th>
                  <th className="num">Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((i) => (
                  <tr key={i.id}>
                    <td data-label="Invoice" className="td--title">
                      <Link to={`/admin/finance/invoices/${i.id}`} className="row-link">
                        {i.number ?? 'Draft'}
                      </Link>
                      <div className="list__meta">{i.title}</div>
                    </td>
                    <td data-label="Client">{i.clientName}</td>
                    <td data-label="Date">{i.issueDate ? formatDate(i.issueDate) : '—'}</td>
                    <td data-label="Due" className={i.status === 'OVERDUE' ? 'text-danger' : undefined}>
                      {i.status === 'OVERDUE' ? `${i.daysLate} days late` : i.status === 'SENT' ? dueLabel(i.due) : formatDate(i.due)}
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
    </>
  );
}

/* ------------------------------------------------------------------ quotes */

export function QuotesTab({ params, set }) {
  const q = { status: params.get('status') ?? undefined };
  const { data, error, isPending, refetch } = useQuotes(q);
  return (
    <>
      <div className="toolbar">
        <Select label="Status" hideLabel value={q.status} onChange={(v) => set('status', v)} allLabel="Any status" options={QUOTE_STATUS_OPTIONS} />
      </div>
      <Card flush>
        <div className="card__body">
          {isPending ? (
            <Loading />
          ) : error ? (
            <ErrorState message={error.message} onRetry={refetch} />
          ) : data.length === 0 ? (
            <EmptyState title="No quotes" />
          ) : (
            <table className="table table--rows">
              <thead>
                <tr>
                  <th>Quote</th>
                  <th>Client</th>
                  <th>Type</th>
                  <th className="num">Fee (before GST)</th>
                  <th>Valid until</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((x) => (
                  <tr key={x.id}>
                    <td data-label="Quote" className="td--title">
                      <button type="button" className="row-link link-btn" onClick={() => set('quote', x.id, false)}>
                        {x.number}
                      </button>
                      <div className="list__meta">{x.title}</div>
                    </td>
                    <td data-label="Client">{x.clientName}</td>
                    <td data-label="Type">{x.kind === 'RETAINER' ? 'Retainer (monthly)' : 'Project'}</td>
                    <td data-label="Fee" className="num">{formatINR(x.subtotal)}</td>
                    <td data-label="Valid until">{x.status === 'SENT' || x.status === 'DRAFT' ? dueLabel(x.validUntil).replace('Due', 'Until') : formatDate(x.validUntil)}</td>
                    <td data-label="Status">
                      <QuoteBadge status={x.status} />
                      {x.decidedBy && <div className="list__meta">by {x.decidedBy}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </>
  );
}

export function QuotePanel({ id }) {
  const { data: q, error, isPending, refetch } = useQuote(id);
  const action = useFinanceAction();
  if (isPending) return <Loading />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <QuoteBadge status={q.status} />
        {q.status === 'DRAFT' && (
          <Button size="sm" loading={action.isPending} onClick={() => action.mutate({ kind: 'sendQuote', id: q.id })}>
            <LuSend aria-hidden /> Send to client
          </Button>
        )}
        {q.advanceInvoiceId && (
          <Link className="small" to={`/admin/finance/invoices/${q.advanceInvoiceId}`}>
            Open the advance invoice
          </Link>
        )}
      </div>
      <FormError error={action.error} />
      {q.declineReason && (
        <div className="alert alert--warn">
          <span>
            Declined by {q.decidedBy}: “{q.declineReason}”
          </span>
        </div>
      )}
      <MoneyDocument doc={q} kind="quote" />
      {q.events?.length > 0 && (
        <Card title="History">
          <ul className="list">
            {q.events.map((e) => (
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
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- payments */

export function PaymentsTab() {
  const { data, error, isPending, refetch } = usePayments();
  if (isPending) return <Loading />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  const total = data.reduce((n, p) => n + p.amount, 0);
  const tds = data.reduce((n, p) => n + p.tds, 0);
  return (
    <Card title={`${data.length} payments`} action={<span className="small muted">Received {formatINR(total)} · TDS credit {formatINR(tds)}</span>} flush>
      <div className="card__body">
        {data.length === 0 ? (
          <EmptyState title="No payments yet" />
        ) : (
          <table className="table table--rows">
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Date</th>
                <th>Client</th>
                <th>Invoice</th>
                <th className="num">Received</th>
                <th className="num">TDS</th>
                <th>Method</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  <td data-label="Receipt" className="td--title">
                    {p.receiptNumber}
                    {p.reference && <div className="list__meta">{p.reference}</div>}
                  </td>
                  <td data-label="Date">{formatDate(p.date)}</td>
                  <td data-label="Client">{p.clientName}</td>
                  <td data-label="Invoice">
                    <Link to={`/admin/finance/invoices/${p.invoiceId}`}>{p.invoiceNumber}</Link>
                  </td>
                  <td data-label="Received" className="num">{formatINR(p.amount)}</td>
                  <td data-label="TDS" className="num">{p.tds ? formatINR(p.tds) : '—'}</td>
                  <td data-label="Method">{METHOD_LABEL[p.method]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- expenses */

export function ExpensesTab({ params, set }) {
  const q = { month: params.get('month') ?? undefined, category: params.get('category') ?? undefined };
  const { data, error, isPending, isFetching, refetch } = useExpenses(q);
  const months = lastMonths(6).map((m) => ({ value: m, label: monthLabel(m) }));
  return (
    <>
      <div className="toolbar">
        <Select label="Month" hideLabel value={q.month} onChange={(v) => set('month', v)} allLabel="All months" options={months} />
        <Select label="Category" hideLabel value={q.category} onChange={(v) => set('category', v)} allLabel="All categories" options={CATEGORY_OPTIONS} />
      </div>
      <Card
        flush
        title={data ? `${formatINR(data.reduce((n, e) => n + e.amount, 0))} before GST` : 'Expenses'}
        action={data && <span className="small muted">Input GST {formatINR(data.reduce((n, e) => n + e.gst, 0))}</span>}
      >
        <div className="card__body" style={{ opacity: isFetching ? 0.6 : 1 }}>
          {isPending ? (
            <Loading />
          ) : error ? (
            <ErrorState message={error.message} onRetry={refetch} />
          ) : data.length === 0 ? (
            <EmptyState title="No expenses for this filter" />
          ) : (
            <table className="table table--rows">
              <thead>
                <tr>
                  <th>Expense</th>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Charged to</th>
                  <th className="num">Amount</th>
                  <th className="num">GST</th>
                </tr>
              </thead>
              <tbody>
                {data.map((e) => (
                  <tr key={e.id}>
                    <td data-label="Expense" className="td--title">
                      {e.description}
                      <div className="list__meta">{e.vendor}</div>
                    </td>
                    <td data-label="Date">{formatDate(e.date)}</td>
                    <td data-label="Category">{CATEGORY_LABEL[e.category]}</td>
                    <td data-label="Charged to">{e.projectName ? `${e.clientName}: ${e.projectName}` : <span className="muted">Overhead</span>}</td>
                    <td data-label="Amount" className="num">{formatINR(e.amount)}</td>
                    <td data-label="GST" className="num">{e.gst ? formatINR(e.gst) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ profit */

function Margin({ row }) {
  if (row.margin === undefined) return <span className="muted">{row.revenue === 0 && row.labourCost > 0 ? 'Not billed' : '—'}</span>;
  return <span className={row.margin < 0 ? 'text-danger' : row.margin < 0.2 ? 'text-warn' : undefined}>{percent(row.margin)}</span>;
}

function ProfitTable({ rows, project }) {
  return (
    <table className="table table--rows">
      <thead>
        <tr>
          <th>{project ? 'Project' : 'Client'}</th>
          <th className="num">Invoiced</th>
          <th className="num">Hours</th>
          <th className="num">Team cost</th>
          <th className="num">Direct costs</th>
          <th className="num">Profit</th>
          <th className="num">Margin</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td data-label={project ? 'Project' : 'Client'} className="td--title">
              {project ? (
                <Link to={`/admin/projects/${r.id}`} className="row-link">
                  {r.name}
                </Link>
              ) : (
                <Link to={`/admin/clients/${r.id}`} className="row-link">
                  {r.name}
                </Link>
              )}
              {project && <div className="list__meta">{r.clientName} · {r.service}</div>}
            </td>
            <td data-label="Invoiced" className="num">{formatINR(r.revenue)}</td>
            <td data-label="Hours" className="num">{r.hours}</td>
            <td data-label="Team cost" className="num">{formatINR(r.labourCost)}</td>
            <td data-label="Direct costs" className="num">{r.directCost ? formatINR(r.directCost) : '—'}</td>
            <td data-label="Profit" className={`num${r.profit < 0 ? ' text-danger' : ''}`}>{formatINR(r.profit)}</td>
            <td data-label="Margin" className="num">
              <Margin row={r} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ProfitTab({ params, set }) {
  const { data, error, isPending, refetch } = useProfit();
  const clientId = params.get('clientId') ?? undefined;
  const clientOptions = useClientOptions();
  const billedOnly = params.get('billed') !== 'all';
  const projects = useMemo(() => {
    if (!data) return [];
    const name = clientOptions.find((c) => c.value === clientId)?.label;
    return data.projects.filter((p) => (!clientId || p.clientName === name) && (!billedOnly || p.revenue > 0));
  }, [data, clientId, billedOnly, clientOptions]);
  if (isPending) return <Loading />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  return (
    <>
      <Card title="By client" flush>
        <div className="card__body">
          <ProfitTable rows={data.clients} />
        </div>
      </Card>
      <div className="toolbar">
        <Select label="Client" hideLabel value={clientId} onChange={(v) => set('clientId', v)} allLabel="All clients" options={clientOptions} />
        <Select
          label="Projects"
          hideLabel
          value={billedOnly ? 'billed' : 'all'}
          onChange={(v) => set('billed', v === 'all' ? 'all' : undefined)}
          options={[
            { value: 'billed', label: 'Billed per project' },
            { value: 'all', label: 'All projects (incl. under retainers)' },
          ]}
        />
      </div>
      <Card title={`By project · lowest margin first (${projects.length})`} flush>
        <div className="card__body">
          {projects.length ? <ProfitTable rows={projects} project /> : <EmptyState title="No projects for this filter" />}
        </div>
      </Card>
      <p className="list__meta">
        Margin = invoiced (before GST) − hours × cost rate − direct costs. Cost rates are visible to Super Admins only. Until time tracking (Week 6), a project&apos;s
        hours are costed at the average rate of its team. Projects billed under a client-wide retainer (Sunrise&apos;s programme) show their costs only; see the client row for the
        margin.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ export */

export function ExportTab() {
  const prev = lastMonths(2)[1];
  const [kind, setKind] = useState('invoices');
  const [from, setFrom] = useState(`${prev}-01`);
  const [to, setTo] = useState(isoDay(0));
  const action = useFinanceAction();
  const log = useExportLog();
  const [done, setDone] = useState(null);

  const run = (e) => {
    e.preventDefault();
    action.mutate(
      { kind: 'export', type: kind, from, to },
      {
        onSuccess: (file) => {
          downloadText(file.fileName, file.content);
          setDone(file);
        },
      },
    );
  };

  return (
    <div className="grid grid--2">
      <Card title="Export for the accountant">
        <form onSubmit={run} className="grid" style={{ gap: 16 }}>
          <FormError error={action.error} />
          <label className="field">
            <span className="field__label">What</span>
            <select className="field__input" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="invoices">Invoices (GST sales register)</option>
              <option value="payments">Payments received (with TDS)</option>
              <option value="expenses">Expenses (with input GST)</option>
            </select>
          </label>
          <div className="grid grid--pair">
            <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input label="To" type="date" value={to} max={isoDay(0)} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button type="submit" loading={action.isPending}>
            <LuDownload aria-hidden /> Download CSV
          </Button>
          {done && (
            <p className="small" role="status">
              Downloaded {done.fileName} ({done.rows} rows).
            </p>
          )}
          <p className="small muted">Opens in Excel or Google Sheets. Every export is logged with who ran it.</p>
        </form>
      </Card>
      <Card title="Export log">
        {log.isPending ? (
          <Loading />
        ) : log.error ? (
          <ErrorState message={log.error.message} onRetry={log.refetch} />
        ) : (
          <ul className="list">
            {log.data.map((x) => (
              <li key={x.id} className="list__item">
                <div className="list__main">
                  <div className="list__title">
                    {x.kind[0].toUpperCase() + x.kind.slice(1)}, {formatDate(x.from)} to {formatDate(x.to)}
                  </div>
                  <div className="list__meta">
                    {x.by} · {x.rows} rows · {timeAgo(x.at)}
                  </div>
                </div>
                <Badge>CSV</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
