import { LuPlus, LuTrash2 } from 'react-icons/lu';
import { Badge, Button, formatDateLong, formatINR } from './ui';

/* ---------- labels and badges ---------- */

const QUOTE = {
  DRAFT: ['neutral', 'Draft'],
  SENT: ['info', 'Waiting for client'],
  ACCEPTED: ['ok', 'Accepted'],
  DECLINED: ['danger', 'Declined'],
  EXPIRED: ['neutral', 'Expired'],
};
/** `clientView` uses the client's wording ("Needs your decision"). */
export const QuoteBadge = ({ status, clientView }) => (
  <Badge tone={clientView && status === 'SENT' ? 'warn' : QUOTE[status][0]}>{clientView && status === 'SENT' ? 'Needs your decision' : QUOTE[status][1]}</Badge>
);
export const QUOTE_STATUS_OPTIONS = Object.entries(QUOTE).map(([value, [, label]]) => ({ value, label }));

export const INVOICE_STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Due' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'PAID', label: 'Paid' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export const METHOD_LABEL = { BANK_TRANSFER: 'Bank transfer', UPI: 'UPI', CHEQUE: 'Cheque', CARD: 'Card', ONLINE: 'Paid online' };
export const METHOD_OPTIONS = ['BANK_TRANSFER', 'UPI', 'CHEQUE', 'CARD'].map((value) => ({ value, label: METHOD_LABEL[value] }));

export const CATEGORY_LABEL = {
  FREELANCER: 'Freelancer',
  PRODUCTION: 'Production',
  SOFTWARE: 'Software',
  MEDIA: 'Media and creators',
  TRAVEL: 'Travel',
  OFFICE: 'Office',
};
export const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }));

/** "2026-10" → "October 2026". */
export const monthLabel = (ym) =>
  ym ? new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : '';
export const monthShort = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short' });

/** Short INR for chart labels: ₹3.6 L, ₹48k. */
export const compactINR = (n) => (n >= 100_000 ? `₹${(n / 100_000).toFixed(1).replace(/\.0$/, '')} L` : n >= 1000 ? `₹${Math.round(n / 1000)}k` : `₹${n}`);

export const percent = (r) => (r === undefined || r === null ? '—' : `${Math.round(r * 100)}%`);

/** Saves text as a file (CSV exports). */
export function downloadText(fileName, content, mime = 'text/csv;charset=utf-8') {
  // BOM so Excel opens the rupee sign and Indian names correctly.
  const url = URL.createObjectURL(new Blob(['﻿', content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- printable invoice / quote ---------- */

function PartyBlock({ label, party }) {
  return (
    <div className="doc__party">
      <div className="doc__label">{label}</div>
      <div className="doc__party-name">{party.legalName}</div>
      {party.address && <div>{party.address}</div>}
      <div>
        {party.stateName} ({party.stateCode})
      </div>
      <div>GSTIN: {party.gstin ?? <span className="muted">Unregistered</span>}</div>
    </div>
  );
}

/**
 * The GST invoice (or quote) as the client receives it. Prints cleanly on A4:
 * the app shell is hidden by the print styles in finance.css.
 */
export function MoneyDocument({ doc, kind = 'invoice' }) {
  const isInvoice = kind === 'invoice';
  return (
    <article className="doc" aria-label={isInvoice ? 'Tax invoice' : 'Quote'}>
      <header className="doc__head">
        <div>
          <div className="doc__brand">WEBINGER</div>
          <div className="small muted">{doc.seller.legalName}</div>
        </div>
        <div className="doc__title">
          <div className="doc__kind">{isInvoice ? 'Tax invoice' : 'Quote'}</div>
          <div className="doc__number">{doc.number ?? 'Draft (number given when sent)'}</div>
        </div>
      </header>

      <div className="doc__meta">
        {isInvoice ? (
          <>
            <div>
              <div className="doc__label">Invoice date</div>
              {doc.issueDate ? formatDateLong(doc.issueDate) : '—'}
            </div>
            <div>
              <div className="doc__label">Due date</div>
              {formatDateLong(doc.due)}
            </div>
            <div>
              <div className="doc__label">Place of supply</div>
              {doc.placeOfSupply}
            </div>
          </>
        ) : (
          <>
            <div>
              <div className="doc__label">Valid until</div>
              {formatDateLong(doc.validUntil)}
            </div>
            <div>
              <div className="doc__label">Type</div>
              {doc.kind === 'RETAINER' ? `Monthly retainer, ${doc.termMonths} month${doc.termMonths === 1 ? '' : 's'}` : 'One-off project'}
            </div>
            <div>
              <div className="doc__label">Revisions</div>
              {doc.revisionsPerDeliverable} per deliverable
            </div>
          </>
        )}
      </div>

      <div className="doc__parties">
        <PartyBlock label="From" party={doc.seller} />
        <PartyBlock label={isInvoice ? 'Bill to' : 'Prepared for'} party={doc.buyer} />
      </div>

      <div className="doc__table-wrap">
        <table className="doc__table">
          <thead>
            <tr>
              <th>Description</th>
              <th>SAC</th>
              <th className="num">Qty</th>
              <th className="num">Rate</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((i, n) => (
              <tr key={n}>
                <td>
                  {i.description}
                  {i.projectName && <div className="small muted">{i.projectName}</div>}
                </td>
                <td>{i.sac}</td>
                <td className="num">{i.quantity}</td>
                <td className="num">{formatINR(i.rate)}</td>
                <td className="num">{formatINR(i.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="doc__bottom">
        <div className="doc__words">
          {isInvoice && (
            <>
              <div className="doc__label">Amount in words</div>
              <div>{doc.amountInWords}</div>
              <div className="doc__label" style={{ marginTop: 12 }}>
                Pay to
              </div>
              <div>
                {doc.payTo.bank} · A/c {doc.payTo.account} · IFSC {doc.payTo.ifsc}
              </div>
              <div>UPI: {doc.payTo.upi}</div>
            </>
          )}
          {doc.notes && (
            <>
              <div className="doc__label" style={{ marginTop: 12 }}>
                Notes
              </div>
              <div>{doc.notes}</div>
            </>
          )}
        </div>
        <dl className="doc__totals">
          <dt>Taxable value</dt>
          <dd>{formatINR(doc.subtotal)}</dd>
          {doc.taxes.map((t) => (
            <FragmentRow key={t.label} label={`${t.label} ${t.rate}%`} value={formatINR(t.amount)} />
          ))}
          <dt className="doc__grand">Total</dt>
          <dd className="doc__grand">{formatINR(doc.total)}</dd>
          {isInvoice && doc.paid > 0 && <FragmentRow label="Received (incl. TDS)" value={`− ${formatINR(doc.paid)}`} />}
          {isInvoice && doc.status !== 'CANCELLED' && doc.status !== 'DRAFT' && (
            <FragmentRow label="Balance due" value={formatINR(doc.balance)} strong />
          )}
        </dl>
      </div>
      <footer className="doc__foot small muted">
        {isInvoice
          ? 'This is a computer-generated invoice. Reverse charge: No. Subject to Mumbai jurisdiction.'
          : 'Prices are before GST unless shown otherwise. Accepting this quote in the portal confirms the scope, fee and term above.'}
      </footer>
    </article>
  );
}

function FragmentRow({ label, value, strong }) {
  return (
    <>
      <dt className={strong ? 'doc__grand' : undefined}>{label}</dt>
      <dd className={strong ? 'doc__grand' : undefined}>{value}</dd>
    </>
  );
}

/* ---------- line items editor ---------- */

export const emptyLine = () => ({ description: '', quantity: '1', rate: '', projectId: '' });

/** Editable lines with live totals. GST is previewed at 18%; the server splits it by state. */
export function LineItemsEditor({ lines, onChange, projects = [], errors }) {
  const set = (n, k, v) => onChange(lines.map((l, i) => (i === n ? { ...l, [k]: v } : l)));
  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.rate) || 0), 0);
  return (
    <div className="lines">
      {lines.map((l, n) => (
        <div key={n} className="lines__row">
          <label className="field lines__desc">
            <span className="field__label">Line {n + 1}</span>
            <input className="field__input" value={l.description} placeholder="What is being billed" onChange={(e) => set(n, 'description', e.target.value)} />
          </label>
          {projects.length > 0 && (
            <label className="field lines__project">
              <span className="field__label">Project</span>
              <select className="field__input" value={l.projectId} onChange={(e) => set(n, 'projectId', e.target.value)}>
                <option value="">Not linked</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field lines__qty">
            <span className="field__label">Qty</span>
            <input className="field__input" inputMode="decimal" value={l.quantity} onChange={(e) => set(n, 'quantity', e.target.value)} />
          </label>
          <label className="field lines__rate">
            <span className="field__label">Rate (₹)</span>
            <input className="field__input" inputMode="decimal" value={l.rate} onChange={(e) => set(n, 'rate', e.target.value)} />
          </label>
          <Button
            type="button"
            variant="ghost"
            icon
            className="lines__remove"
            aria-label={`Remove line ${n + 1}`}
            disabled={lines.length === 1}
            onClick={() => onChange(lines.filter((_, i) => i !== n))}
          >
            <LuTrash2 />
          </Button>
        </div>
      ))}
      {errors && <span className="field__error">{errors}</span>}
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Button type="button" variant="secondary" size="sm" disabled={lines.length >= 20} onClick={() => onChange([...lines, emptyLine()])}>
          <LuPlus aria-hidden /> Add line
        </Button>
        <div className="small lines__total">
          {formatINR(subtotal)} + GST 18% = <strong>{formatINR(Math.round(subtotal * 1.18))}</strong>
        </div>
      </div>
    </div>
  );
}

/** Client-side check before sending lines to the API (the server checks again). */
export function linesProblem(lines) {
  for (const [n, l] of lines.entries()) {
    if (l.description.trim().length < 2) return `Line ${n + 1}: describe the work.`;
    if (!(Number(l.quantity) > 0)) return `Line ${n + 1}: enter a quantity.`;
    if (!(Number(l.rate) > 0)) return `Line ${n + 1}: enter a rate above zero.`;
  }
  return null;
}
export const toLineInput = (lines) =>
  lines.map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity), rate: Number(l.rate), projectId: l.projectId || undefined }));
