import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LuArrowRight, LuFilePen, LuPlus } from 'react-icons/lu';
import { useFinanceSummary, useInvoices } from '@/api/queries';
import { Button, Card, Drawer, EmptyState, ErrorState, PageHeader, PageSkeleton, Segmented, Stat, formatINR } from '@/components/ui';
import { InvoiceBadge } from '@/components/status';
import { compactINR, monthLabel, monthShort, percent } from '@/components/finance';
import { ExpenseForm, InvoiceForm, QuoteForm } from './finance/forms';
import { ExpensesTab, ExportTab, InvoicesTab, PaymentsTab, ProfitTab, QuotePanel, QuotesTab } from './finance/tabs';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'invoices', label: 'Invoices' },
  { value: 'quotes', label: 'Quotes' },
  { value: 'payments', label: 'Payments' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'profit', label: 'Profit' },
  { value: 'export', label: 'CA export' },
];
const NEW_TITLE = { invoice: 'New invoice', quote: 'New quote', expense: 'Add expense' };

/** Super Admin only (nav + route guard); the API refuses everyone else as well. */
export function AdminFinance() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'overview';
  const adding = params.get('new');
  const quoteId = params.get('quote');

  const set = (key, value, replace = true) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, String(value));
        else next.delete(key);
        return next;
      },
      { replace },
    );

  return (
    <div className="page">
      <PageHeader
        eyebrow="Super Admin only"
        title="Finance"
        actions={
          <>
            <Button variant="secondary" onClick={() => set('new', 'quote', false)}>
              <LuFilePen aria-hidden /> New quote
            </Button>
            <Button onClick={() => set('new', 'invoice', false)}>
              <LuPlus aria-hidden /> New invoice
            </Button>
          </>
        }
      />
      <Segmented label="Finance sections" value={tab} onChange={(v) => setParams(v === 'overview' ? {} : { tab: v })} options={TABS} />

      {tab === 'overview' && <Overview />}
      {tab === 'invoices' && <InvoicesTab params={params} set={set} />}
      {tab === 'quotes' && <QuotesTab params={params} set={set} />}
      {tab === 'payments' && <PaymentsTab />}
      {tab === 'expenses' && (
        <>
          <div>
            <Button variant="secondary" size="sm" onClick={() => set('new', 'expense', false)}>
              <LuPlus aria-hidden /> Add expense
            </Button>
          </div>
          <ExpensesTab params={params} set={set} />
        </>
      )}
      {tab === 'profit' && <ProfitTab params={params} set={set} />}
      {tab === 'export' && <ExportTab />}

      <Drawer open={!!NEW_TITLE[adding]} onClose={() => set('new', undefined)} title={NEW_TITLE[adding] ?? ''}>
        {adding === 'invoice' && <InvoiceForm defaultClientId={params.get('clientId') ?? ''} onSaved={(inv) => navigate(`/admin/finance/invoices/${inv.id}`)} />}
        {adding === 'quote' && <QuoteForm onSaved={(q) => setParams({ tab: 'quotes', quote: q.id })} />}
        {adding === 'expense' && <ExpenseForm onSaved={() => set('new', undefined)} />}
      </Drawer>
      <Drawer open={!!quoteId} onClose={() => set('quote', undefined)} title="Quote">
        {quoteId && <QuotePanel id={quoteId} />}
      </Drawer>
    </div>
  );
}

function Overview() {
  const { data: s, error, isPending, refetch } = useFinanceSummary();
  const overdue = useInvoices({ status: 'OVERDUE' });
  const drafts = useInvoices({ status: 'DRAFT' });
  if (isPending) return <PageSkeleton />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  return (
    <>
      <div className="grid grid--stats">
        <Stat label="Collected this month" value={formatINR(s.collectedThisMonth)} hint={`Invoiced ${formatINR(s.invoicedThisMonth)} before GST`} />
        <Stat label="Monthly recurring" value={formatINR(s.recurringRevenue)} hint="Running retainers, before GST" />
        <Stat label="Outstanding" value={formatINR(s.outstanding)} hint={`${formatINR(s.overdue)} overdue on ${s.overdueCount} invoice${s.overdueCount === 1 ? '' : 's'}`} accent={s.overdue > 0} />
        <Stat label="Days to collect" value={s.daysToCollect ?? '—'} hint="Invoice date to payment, last 6 months" />
        <Stat label="Open quotes" value={formatINR(s.openQuotes.value)} hint={`${s.openQuotes.count} waiting · win rate ${percent(s.winRate)}`} />
        <Stat label="Expenses this month" value={formatINR(s.expensesThisMonth)} hint="Before GST" />
      </div>

      <div className="grid grid--2">
        <Card title="Needs your action">
          <ul className="list">
            {(drafts.data ?? []).map((i) => (
              <li key={i.id} className="list__item">
                <div className="list__main">
                  <Link to={`/admin/finance/invoices/${i.id}`} className="list__title">
                    {i.title}
                  </Link>
                  <div className="list__meta">
                    {i.clientName} · {formatINR(i.total)} · draft ready to check and send
                  </div>
                </div>
                <InvoiceBadge status="DRAFT" />
              </li>
            ))}
            {(overdue.data ?? []).map((i) => (
              <li key={i.id} className="list__item">
                <div className="list__main">
                  <Link to={`/admin/finance/invoices/${i.id}`} className="list__title">
                    {i.number} · {i.clientName}
                  </Link>
                  <div className="list__meta">
                    {formatINR(i.balance)} · {i.daysLate} days late{i.daysLate >= 15 ? ' · decide whether to pause work' : ''}
                  </div>
                </div>
                <InvoiceBadge status="OVERDUE" />
              </li>
            ))}
          </ul>
          {!drafts.data?.length && !overdue.data?.length && <EmptyState title="Nothing waiting" />}
        </Card>

        <Card title="Invoiced by service" action={<span className="small muted">This financial year, before GST</span>}>
          <ServiceBars rows={s.byService} />
        </Card>
      </div>

      <Card
        title="Invoiced and collected, last 6 months"
        action={
          <Link to="/admin/finance?tab=invoices" className="small row">
            All invoices <LuArrowRight aria-hidden />
          </Link>
        }
      >
        <MonthChart months={s.months} />
      </Card>
    </>
  );
}

/* Two-series grouped bars. Colours: validated reference slots 1 and 2 (blue, orange); legend + hover titles + table for screen readers. */
function MonthChart({ months }) {
  const max = Math.max(1, ...months.flatMap((m) => [m.invoiced, m.collected]));
  return (
    <figure className="chart">
      <div className="chart__legend" aria-hidden>
        <span className="chart__key">
          <i className="chart__swatch chart__swatch--1" /> Invoiced (incl. GST)
        </span>
        <span className="chart__key">
          <i className="chart__swatch chart__swatch--2" /> Collected (incl. TDS credit)
        </span>
      </div>
      <div className="chart__plot" aria-hidden>
        {months.map((m) => (
          <div key={m.month} className="chart__group">
            <div className="chart__bars">
              <div className="chart__bar chart__bar--1" style={{ height: `${(m.invoiced / max) * 100}%` }} title={`${monthLabel(m.month)} · invoiced ${formatINR(m.invoiced)}`} />
              <div className="chart__bar chart__bar--2" style={{ height: `${(m.collected / max) * 100}%` }} title={`${monthLabel(m.month)} · collected ${formatINR(m.collected)}`} />
            </div>
            <div className="chart__label">
              {monthShort(m.month)}
              <span className="chart__value">{compactINR(m.collected)}</span>
            </div>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>Invoiced and collected per month</caption>
        <thead>
          <tr>
            <th>Month</th>
            <th>Invoiced</th>
            <th>Collected</th>
            <th>Expenses</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <td>{monthLabel(m.month)}</td>
              <td>{formatINR(m.invoiced)}</td>
              <td>{formatINR(m.collected)}</td>
              <td>{formatINR(m.expenses)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function ServiceBars({ rows }) {
  if (!rows.length) return <EmptyState title="Nothing invoiced yet this year" />;
  const max = Math.max(...rows.map((r) => r.amount));
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.service} className="hbars__row" title={`${r.service}: ${formatINR(r.amount)}`}>
          <span className="hbars__label">{r.service}</span>
          <span className="hbars__track">
            <span className="hbars__bar" style={{ width: `${(r.amount / max) * 100}%` }} />
          </span>
          <span className="hbars__value">{compactINR(r.amount)}</span>
        </li>
      ))}
    </ul>
  );
}
