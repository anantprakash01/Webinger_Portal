import { useState } from 'react';
import { LuCircleAlert } from 'react-icons/lu';
import { useBillableProjects, useClients, useFinanceAction } from '@/api/queries';
import { Button, ErrorState, Input, Segmented, formatINR } from '@/components/ui';
import { CATEGORY_OPTIONS, LineItemsEditor, METHOD_OPTIONS, emptyLine, linesProblem, toLineInput } from '@/components/finance';

const isoDay = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

export function FormError({ error }) {
  if (!error) return null;
  return (
    <div className="alert alert--error" role="alert">
      <LuCircleAlert aria-hidden style={{ marginTop: 2, flexShrink: 0 }} /> <span>{error.message ?? error}</span>
    </div>
  );
}

function ClientSelect({ value, onChange, error, disabled }) {
  const clients = useClients({});
  if (clients.isPending) return <div className="skeleton" style={{ height: 64 }} />;
  if (clients.error) return <ErrorState message={clients.error.message} onRetry={clients.refetch} />;
  return (
    <label className="field">
      <span className="field__label">Client</span>
      <select className="field__input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined}>
        <option value="">Choose a client</option>
        {clients.data.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.status === 'ENDED' ? ' (ended)' : ''}
          </option>
        ))}
      </select>
      {error && <span className="field__error">{error}</span>}
    </label>
  );
}

const fromDetail = (d) =>
  d.items.map((i) => ({ description: i.description, quantity: String(i.quantity), rate: String(i.rate), projectId: i.projectId ?? '' }));

/** New invoice (draft) or edit an existing draft. */
export function InvoiceForm({ draft, defaultClientId = '', onSaved }) {
  const action = useFinanceAction();
  const [clientId, setClientId] = useState(draft?.clientId ?? defaultClientId);
  const [title, setTitle] = useState(draft?.title ?? '');
  const [due, setDue] = useState(draft?.due ?? isoDay(15));
  const [notes, setNotes] = useState(draft?.notes ?? '');
  const [lines, setLines] = useState(draft ? fromDetail(draft) : [emptyLine()]);
  const [errors, setErrors] = useState({});
  const projects = useBillableProjects(clientId || undefined);

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    if (!clientId) next.clientId = 'Choose a client.';
    if (title.trim().length < 3) next.title = 'Give it a short title, like "Social media retainer, December".';
    if (!due || due < isoDay(0)) next.due = 'Choose a due date from today onwards.';
    const lp = linesProblem(lines);
    if (lp) next.lines = lp;
    setErrors(next);
    if (Object.keys(next).length) return;
    const body = { clientId, title: title.trim(), due, items: toLineInput(lines), notes: notes.trim() || undefined };
    action.mutate(draft ? { kind: 'updateInvoice', id: draft.id, body } : { kind: 'createInvoice', body }, { onSuccess: (inv) => onSaved?.(inv) });
  };

  return (
    <form onSubmit={submit} noValidate className="grid" style={{ gap: 16 }}>
      <FormError error={action.error} />
      <ClientSelect value={clientId} onChange={(v) => { setClientId(v); setLines(lines.map((l) => ({ ...l, projectId: '' }))); }} error={errors.clientId} disabled={!!draft} />
      <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} />
      <Input label="Due date" type="date" value={due} min={isoDay(0)} onChange={(e) => setDue(e.target.value)} error={errors.due} />
      <h3 className="section-title">Lines (before GST)</h3>
      <LineItemsEditor lines={lines} onChange={setLines} projects={projects.data ?? []} errors={errors.lines} />
      <label className="field">
        <span className="field__label">Notes on the invoice (optional)</span>
        <textarea className="field__input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <p className="note small">
        <LuCircleAlert aria-hidden />
        <span>Saved as a draft. It gets its invoice number only when you send it, so numbers never have gaps.</span>
      </p>
      <Button type="submit" loading={action.isPending}>
        {draft ? 'Save draft' : 'Save draft invoice'}
      </Button>
    </form>
  );
}

export function QuoteForm({ onSaved }) {
  const action = useFinanceAction();
  const [form, setForm] = useState({ clientId: '', title: '', kind: 'RETAINER', termMonths: '6', revisionsPerDeliverable: '3', validDays: '14', notes: '' });
  const [lines, setLines] = useState([emptyLine()]);
  const [errors, setErrors] = useState({});
  const projects = useBillableProjects(form.clientId || undefined);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    if (!form.clientId) next.clientId = 'Choose a client.';
    if (form.title.trim().length < 3) next.title = 'Give the quote a title.';
    if (form.kind === 'RETAINER' && !(Number(form.termMonths) >= 1 && Number(form.termMonths) <= 36)) next.termMonths = '1 to 36 months.';
    if (!(Number(form.validDays) >= 1 && Number(form.validDays) <= 90)) next.validDays = '1 to 90 days.';
    const lp = linesProblem(lines);
    if (lp) next.lines = lp;
    setErrors(next);
    if (Object.keys(next).length) return;
    action.mutate(
      {
        kind: 'createQuote',
        body: {
          clientId: form.clientId,
          title: form.title.trim(),
          kind: form.kind,
          termMonths: Number(form.termMonths) || undefined,
          revisionsPerDeliverable: Number(form.revisionsPerDeliverable),
          validDays: Number(form.validDays),
          items: toLineInput(lines),
          notes: form.notes.trim() || undefined,
        },
      },
      { onSuccess: (q) => onSaved?.(q) },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="grid" style={{ gap: 16 }}>
      <FormError error={action.error} />
      <ClientSelect value={form.clientId} onChange={(v) => setForm({ ...form, clientId: v })} error={errors.clientId} />
      <Input label="Title" value={form.title} onChange={set('title')} error={errors.title} />
      <Segmented
        label="Type"
        value={form.kind}
        onChange={(v) => setForm({ ...form, kind: v })}
        options={[
          { value: 'RETAINER', label: 'Monthly retainer' },
          { value: 'PROJECT', label: 'One-off project' },
        ]}
      />
      <div className="grid grid--pair">
        <Input
          label={form.kind === 'RETAINER' ? 'Term (months)' : 'Delivery (months)'}
          inputMode="numeric"
          value={form.termMonths}
          onChange={set('termMonths')}
          error={errors.termMonths}
        />
        <Input label="Revisions per deliverable" inputMode="numeric" value={form.revisionsPerDeliverable} onChange={set('revisionsPerDeliverable')} />
      </div>
      <Input label="Valid for (days)" inputMode="numeric" value={form.validDays} onChange={set('validDays')} error={errors.validDays} />
      <h3 className="section-title">{form.kind === 'RETAINER' ? 'Monthly fee lines (before GST)' : 'Fee lines (before GST)'}</h3>
      <LineItemsEditor lines={lines} onChange={setLines} projects={projects.data ?? []} errors={errors.lines} />
      <label className="field">
        <span className="field__label">Notes for the client (optional)</span>
        <textarea className="field__input" rows={2} value={form.notes} onChange={set('notes')} />
      </label>
      <Button type="submit" loading={action.isPending}>
        Save draft quote
      </Button>
    </form>
  );
}

export function PaymentForm({ invoice, onSaved }) {
  const action = useFinanceAction();
  const [form, setForm] = useState({ date: isoDay(0), amount: String(invoice.balance), tds: '', method: 'BANK_TRANSFER', reference: '' });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const amount = Number(form.amount) || 0;
  const tds = Number(form.tds) || 0;

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    if (!(amount > 0)) next.amount = 'Enter the amount received.';
    if (tds < 0) next.tds = 'Cannot be negative.';
    if (amount + tds > invoice.balance + 0.5) next.amount = `More than the balance of ${formatINR(invoice.balance)}.`;
    if (!form.date || form.date > isoDay(0)) next.date = 'The date the money arrived.';
    setErrors(next);
    if (Object.keys(next).length) return;
    action.mutate(
      { kind: 'payment', id: invoice.id, body: { date: form.date, amount, tds, method: form.method, reference: form.reference.trim() || undefined } },
      { onSuccess: onSaved },
    );
  };

  const left = Math.max(0, invoice.balance - amount - tds);
  return (
    <form onSubmit={submit} noValidate className="grid" style={{ gap: 16 }}>
      <FormError error={action.error} />
      <p className="small muted">
        Balance due on {invoice.number}: <strong>{formatINR(invoice.balance)}</strong>
      </p>
      <div className="grid grid--pair">
        <Input label="Amount received (₹)" inputMode="decimal" value={form.amount} onChange={set('amount')} error={errors.amount} />
        <Input label="TDS deducted (₹)" inputMode="decimal" value={form.tds} onChange={set('tds')} error={errors.tds} placeholder="0" />
      </div>
      <p className="small muted" style={{ marginTop: -8 }}>
        Companies often deduct 2% TDS on fees before GST ({formatINR(Math.round(invoice.subtotal * 0.02))} here). It counts as paid; claim it from Form 26AS.
      </p>
      <div className="grid grid--pair">
        <Input label="Date received" type="date" max={isoDay(0)} value={form.date} onChange={set('date')} error={errors.date} />
        <label className="field">
          <span className="field__label">Method</span>
          <select className="field__input" value={form.method} onChange={set('method')}>
            {METHOD_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Input label="Reference (UTR, cheque no.)" value={form.reference} onChange={set('reference')} />
      <p className="small">{left > 0 ? `${formatINR(left)} will still be due.` : 'This settles the invoice in full.'}</p>
      <Button type="submit" loading={action.isPending}>
        Record payment and send receipt
      </Button>
    </form>
  );
}

export function ExpenseForm({ onSaved }) {
  const action = useFinanceAction();
  const clients = useClients({});
  const [form, setForm] = useState({ date: isoDay(0), category: 'PRODUCTION', vendor: '', description: '', amount: '', gst: '', clientId: '', projectId: '' });
  const [errors, setErrors] = useState({});
  const projects = useBillableProjects(form.clientId || undefined);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    if (!form.date || form.date > isoDay(0)) next.date = 'The bill date (not in the future).';
    if (form.vendor.trim().length < 2) next.vendor = 'Who was paid?';
    if (form.description.trim().length < 3) next.description = 'What was it for?';
    if (!(Number(form.amount) > 0)) next.amount = 'Amount before GST.';
    setErrors(next);
    if (Object.keys(next).length) return;
    action.mutate(
      {
        kind: 'expense',
        body: {
          date: form.date,
          category: form.category,
          vendor: form.vendor.trim(),
          description: form.description.trim(),
          amount: Number(form.amount),
          gst: Number(form.gst) || 0,
          projectId: form.projectId || undefined,
        },
      },
      { onSuccess: onSaved },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="grid" style={{ gap: 16 }}>
      <FormError error={action.error} />
      <div className="grid grid--pair">
        <Input label="Bill date" type="date" max={isoDay(0)} value={form.date} onChange={set('date')} error={errors.date} />
        <label className="field">
          <span className="field__label">Category</span>
          <select className="field__input" value={form.category} onChange={set('category')}>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Input label="Paid to" value={form.vendor} onChange={set('vendor')} error={errors.vendor} />
      <Input label="What for" value={form.description} onChange={set('description')} error={errors.description} />
      <div className="grid grid--pair">
        <Input label="Amount before GST (₹)" inputMode="decimal" value={form.amount} onChange={set('amount')} error={errors.amount} />
        <Input label="Input GST (₹, optional)" inputMode="decimal" value={form.gst} onChange={set('gst')} />
      </div>
      <h3 className="section-title">Charge to a project (optional)</h3>
      <p className="small muted" style={{ marginTop: -8 }}>Direct costs lower that project's margin in Profit.</p>
      <div className="grid grid--pair">
        <label className="field">
          <span className="field__label">Client</span>
          <select className="field__input" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value, projectId: '' })}>
            <option value="">Overhead (no client)</option>
            {(clients.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Project</span>
          <select className="field__input" value={form.projectId} disabled={!form.clientId} onChange={set('projectId')}>
            <option value="">None</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Button type="submit" loading={action.isPending}>
        Save expense
      </Button>
    </form>
  );
}
