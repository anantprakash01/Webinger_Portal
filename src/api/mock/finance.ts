/**
 * Mock finance and billing API (Week 5).
 *
 * Admin  /finance/*  : SUPER_ADMIN only (permission matrix: finance is the owner's).
 * Client /billing/*  : client roles with BILLING_VIEW (owners always, reps when granted), own organisation only.
 *
 * Comments starting with "BACKEND:" are rules the Spring Boot service must enforce.
 * Money is INR. Amounts on lines are before GST; GST is 18%, split CGST + SGST inside
 * Maharashtra (the agency's state) and IGST for other states. CA review pending (CLAUDE.md section 17).
 */
import type {
  BillingOverview,
  ExpenseItem,
  ExportFile,
  ExportKind,
  ExportLogItem,
  FinanceEvent,
  FinanceSummary,
  InvoiceDetail,
  InvoiceListItem,
  InvoiceStatus,
  InvoiceSummary,
  LineItem,
  LineItemInput,
  NewExpense,
  NewInvoice,
  NewQuote,
  Party,
  PaymentInput,
  PaymentItem,
  PaymentMethod,
  ProfitReport,
  ProfitRow,
  QuoteDetail,
  QuoteListItem,
  QuoteStatus,
  TaxLine,
  User,
} from '@/types';
import { sendEmail } from './accounts';
import { clientRows, contractStatus } from './clients';
import { CLIENT_NAME, day, nameOf, projects, users } from './data';
import {
  addDays,
  AGENCY,
  CITY_STATE,
  costRates,
  DEFAULT_SAC,
  expenses,
  exportLog,
  financialYear,
  GST_RATE,
  invoices,
  monthName,
  monthStart,
  PAY_TO,
  quotes,
  STATE_NAME,
} from './data5';
import type { ExpenseRow, InvoiceRow, PaymentRow, QuoteRow } from './data5';
import { badRequest, conflict, forbidden, hasPermission, isClient, notFound, permissionsOf } from './handlers';

const DAY_MS = 86_400_000;
const today = () => day(0);
const nowIso = () => new Date().toISOString();
const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: unknown): s is string => typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(s));

/* ----------------------------------------------------------------- access */

// BACKEND: the whole finance module is SUPER_ADMIN only. Managers see outstanding and retainer on client records.
function requireOwner(user: User) {
  if (user.role !== 'SUPER_ADMIN') throw forbidden('Only a Super Admin can open finance.');
}
// BACKEND: billing needs a client role plus BILLING_VIEW; always scoped to the caller's organisation.
function requireBilling(user: User) {
  if (!isClient(user) || !hasPermission(user, 'BILLING_VIEW')) throw forbidden('Billing is not shared with you. Ask your company owner for access.');
}

/* ------------------------------------------------------------------ maths */

const lineAmount = (i: LineItemInput) => Math.round(i.quantity * i.rate);
const subtotalOf = (items: LineItemInput[]) => items.reduce((n, i) => n + lineAmount(i), 0);

/** BACKEND: intra-state supply → CGST + SGST (half each); inter-state → IGST. */
export function taxesFor(subtotal: number, placeOfSupply: string): TaxLine[] {
  if (placeOfSupply === AGENCY.stateCode) {
    const half = Math.round((subtotal * GST_RATE) / 200);
    return [
      { label: 'CGST', rate: GST_RATE / 2, amount: half },
      { label: 'SGST', rate: GST_RATE / 2, amount: half },
    ];
  }
  return [{ label: 'IGST', rate: GST_RATE, amount: Math.round((subtotal * GST_RATE) / 100) }];
}

function moneyOf(row: { items: LineItemInput[]; placeOfSupply: string }) {
  const subtotal = subtotalOf(row.items);
  const taxes = taxesFor(subtotal, row.placeOfSupply);
  const tax = taxes.reduce((n, t) => n + t.amount, 0);
  return { subtotal, taxes, tax, total: subtotal + tax };
}

const paidOf = (row: InvoiceRow) => row.payments.reduce((n, p) => n + p.amount + p.tds, 0);
export const balanceOf = (row: InvoiceRow) =>
  row.status === 'DRAFT' || row.status === 'CANCELLED' ? 0 : Math.max(0, moneyOf(row).total - paidOf(row));

/** OVERDUE is derived: sent, unpaid and past its due date. */
export function statusOf(row: InvoiceRow): InvoiceStatus {
  if (row.status === 'SENT' && row.due < today() && balanceOf(row) > 0) return 'OVERDUE';
  return row.status;
}
export const daysLateOf = (row: InvoiceRow) =>
  statusOf(row) === 'OVERDUE' ? Math.round((Date.parse(today()) - Date.parse(row.due)) / DAY_MS) : 0;

/** Unpaid invoices of one client (sent, with a balance). Used by client health and dashboards. */
export const unpaidInvoices = (orgId?: string) =>
  invoices.filter((i) => (!orgId || i.organisationId === orgId) && i.status === 'SENT' && balanceOf(i) > 0);

const quoteStatusOf = (q: QuoteRow): QuoteStatus => (q.status === 'SENT' && q.validUntil < today() ? 'EXPIRED' : q.status);

/* ------------------------------------------------------------ amount words */

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const two = (n: number) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ''));
const three = (n: number) => [Math.floor(n / 100) ? `${ONES[Math.floor(n / 100)]} hundred` : '', n % 100 ? two(n % 100) : ''].filter(Boolean).join(' and ');
function words(n: number): string {
  if (n === 0) return 'zero';
  const crore = Math.floor(n / 1e7);
  const parts = [
    crore ? `${words(crore)} crore` : '',
    Math.floor(n / 1e5) % 100 ? `${two(Math.floor(n / 1e5) % 100)} lakh` : '',
    Math.floor(n / 1e3) % 100 ? `${two(Math.floor(n / 1e3) % 100)} thousand` : '',
    n % 1000 ? three(n % 1000) : '',
  ];
  return parts.filter(Boolean).join(' ');
}
/** 59000 → "Indian rupees fifty-nine thousand only" (Indian numbering: lakh, crore). */
export const rupeesInWords = (n: number) => `Indian rupees ${words(Math.round(n))} only`;

/* ---------------------------------------------------------------- parties */

const seller = (): Party => ({ ...AGENCY });

function stateOfClient(orgId: string): string {
  const row = clientRows.find((c) => c.organisationId === orgId);
  if (row?.gstin) return row.gstin.slice(0, 2);
  return CITY_STATE[row?.city.trim().toLowerCase() ?? ''] ?? AGENCY.stateCode;
}

function buyerOf(orgId: string, placeOfSupply: string): Party {
  const row = clientRows.find((c) => c.organisationId === orgId);
  return {
    name: CLIENT_NAME[orgId] ?? orgId,
    legalName: row?.legalName ?? CLIENT_NAME[orgId] ?? orgId,
    gstin: row?.gstin,
    address: row?.address || row?.city || '',
    stateCode: placeOfSupply,
    stateName: STATE_NAME[placeOfSupply] ?? placeOfSupply,
  };
}

/* ---------------------------------------------------------------- shapes */

function toLines(items: LineItemInput[]): LineItem[] {
  return items.map((i) => ({
    description: i.description,
    sac: i.sac ?? DEFAULT_SAC,
    quantity: i.quantity,
    rate: i.rate,
    projectId: i.projectId,
    projectName: i.projectId ? projects.find((p) => p.id === i.projectId)?.name : undefined,
    amount: lineAmount(i),
  }));
}

function toInvoiceItem(row: InvoiceRow): InvoiceListItem {
  const m = moneyOf(row);
  const status = statusOf(row);
  return {
    id: row.id,
    number: row.number,
    clientId: row.organisationId,
    clientName: CLIENT_NAME[row.organisationId] ?? row.organisationId,
    title: row.title,
    issueDate: row.issueDate,
    due: row.due,
    status,
    subtotal: m.subtotal,
    tax: m.tax,
    total: m.total,
    paid: paidOf(row),
    balance: balanceOf(row),
    daysLate: status === 'OVERDUE' ? daysLateOf(row) : undefined,
  };
}

function toInvoiceDetail(row: InvoiceRow, staff: boolean): InvoiceDetail {
  const m = moneyOf(row);
  const detail: InvoiceDetail = {
    ...toInvoiceItem(row),
    seller: seller(),
    buyer: buyerOf(row.organisationId, row.placeOfSupply),
    placeOfSupply: `${STATE_NAME[row.placeOfSupply] ?? row.placeOfSupply} (${row.placeOfSupply})`,
    items: toLines(row.items),
    taxes: m.taxes,
    amountInWords: rupeesInWords(m.total),
    notes: row.notes,
    payments: [...row.payments].sort((a, b) => a.date.localeCompare(b.date)),
    cancelReason: row.cancelReason,
    payTo: PAY_TO,
  };
  // BACKEND: the event trail is internal (who drafted, reminders sent); clients get the invoice only.
  if (staff) detail.events = [...row.events].sort((a, b) => b.at.localeCompare(a.at));
  return detail;
}

function toQuoteItem(q: QuoteRow): QuoteListItem {
  const m = moneyOf(q);
  return {
    id: q.id,
    number: q.number,
    clientId: q.organisationId,
    clientName: CLIENT_NAME[q.organisationId] ?? q.organisationId,
    title: q.title,
    kind: q.kind,
    subtotal: m.subtotal,
    total: m.total,
    validUntil: q.validUntil,
    status: quoteStatusOf(q),
    sentAt: q.sentAt,
    decidedAt: q.decidedAt,
    decidedBy: q.decidedBy,
  };
}

function toQuoteDetail(q: QuoteRow, staff: boolean): QuoteDetail {
  const m = moneyOf(q);
  const d: QuoteDetail = {
    ...toQuoteItem(q),
    seller: seller(),
    buyer: buyerOf(q.organisationId, q.placeOfSupply),
    items: toLines(q.items),
    taxes: m.taxes,
    termMonths: q.termMonths,
    revisionsPerDeliverable: q.revisionsPerDeliverable,
    notes: q.notes,
    declineReason: q.declineReason,
    contractId: q.contractId,
    advanceInvoiceId: q.advanceInvoiceId,
  };
  if (staff) d.events = [...q.events].sort((a, b) => b.at.localeCompare(a.at));
  return d;
}

const toPaymentItem = (row: InvoiceRow, p: PaymentRow): PaymentItem => ({
  ...p,
  invoiceId: row.id,
  invoiceNumber: row.number ?? '',
  clientId: row.organisationId,
  clientName: CLIENT_NAME[row.organisationId] ?? row.organisationId,
});

const toExpenseItem = (e: ExpenseRow): ExpenseItem => {
  const p = e.projectId ? projects.find((x) => x.id === e.projectId) : undefined;
  return {
    id: e.id,
    date: e.date,
    category: e.category,
    vendor: e.vendor,
    description: e.description,
    amount: e.amount,
    gst: e.gst,
    projectId: e.projectId,
    projectName: p?.name,
    clientName: p ? CLIENT_NAME[p.organisationId] : undefined,
    recordedBy: e.recordedBy,
  };
};

const event = (actor: string, text: string): FinanceEvent => ({ id: uid('fe'), at: nowIso(), actor, text });

function clientHistory(orgId: string, actor: string, kind: 'INVOICE' | 'CONTRACT', text: string) {
  clientRows.find((c) => c.organisationId === orgId)?.history.push({ id: uid('h-f'), at: nowIso(), actor, kind, text });
}

/** Owner and reps with billing access who can sign in. They receive invoices, quotes and receipts. */
function billingContacts(orgId: string) {
  return users.filter((u) => u.organisationId === orgId && u.status === 'ACTIVE' && permissionsOf(u).includes('BILLING_VIEW'));
}

/* ------------------------------------------------------------- validation */

function cleanItems(orgId: string, items: unknown): LineItemInput[] {
  if (!Array.isArray(items) || items.length === 0) throw badRequest('Add at least one line.');
  if (items.length > 20) throw badRequest('Keep it to 20 lines or fewer.');
  return items.map((raw, n) => {
    const i = raw as Partial<LineItemInput>;
    const line = `Line ${n + 1}`;
    const description = String(i.description ?? '').trim();
    if (description.length < 2) throw badRequest(`${line}: describe the work.`);
    const quantity = Number(i.quantity);
    const rate = Number(i.rate);
    if (!(quantity > 0) || quantity > 1000) throw badRequest(`${line}: quantity must be between 0 and 1,000.`);
    if (!(rate > 0) || rate > 10_000_000) throw badRequest(`${line}: enter a rate above zero.`);
    const sac = String(i.sac ?? DEFAULT_SAC).trim() || DEFAULT_SAC;
    if (!/^\d{6}$/.test(sac)) throw badRequest(`${line}: SAC code is 6 digits, like ${DEFAULT_SAC}.`);
    // BACKEND: a line can only point at a project of the same client.
    if (i.projectId && !projects.some((p) => p.id === i.projectId && p.organisationId === orgId)) throw badRequest(`${line}: that project belongs to another client.`);
    return { description, sac, quantity, rate: Math.round(rate * 100) / 100, projectId: i.projectId || undefined };
  });
}

function requireClientRecord(orgId: string) {
  if (!clientRows.some((c) => c.organisationId === orgId)) throw badRequest('Choose a client.');
}

function nextNumber(prefix: 'WEB' | 'RCPT' | 'QT', taken: Array<string | undefined>, date = today()) {
  const y = financialYear(date);
  const head = `${prefix}/${y}/`;
  const max = taken.filter((n): n is string => !!n && n.startsWith(head)).reduce((m, n) => Math.max(m, Number(n.slice(head.length))), 0);
  return `${head}${String(max + 1).padStart(4, '0')}`;
}

function findInvoice(id: string) {
  const row = invoices.find((i) => i.id === id);
  if (!row) throw notFound('Invoice');
  return row;
}
function findQuote(id: string) {
  const row = quotes.find((q) => q.id === id);
  if (!row) throw notFound('Quote');
  return row;
}

/* ============================================================ admin: invoices */

export interface InvoiceQuery {
  status?: InvoiceStatus;
  clientId?: string;
  q?: string;
}

const INVOICE_ORDER: Record<InvoiceStatus, number> = { DRAFT: 0, OVERDUE: 1, SENT: 2, PAID: 3, CANCELLED: 4 };

/** GET /finance/invoices */
export function listInvoices(user: User, q: InvoiceQuery = {}): InvoiceListItem[] {
  requireOwner(user);
  const needle = q.q?.trim().toLowerCase();
  return invoices
    .map(toInvoiceItem)
    .filter(
      (i) =>
        (!q.status || i.status === q.status) &&
        (!q.clientId || i.clientId === q.clientId) &&
        (!needle || `${i.number ?? ''} ${i.clientName} ${i.title}`.toLowerCase().includes(needle)),
    )
    .sort((a, b) => INVOICE_ORDER[a.status] - INVOICE_ORDER[b.status] || (b.issueDate ?? b.due).localeCompare(a.issueDate ?? a.due));
}

/** GET /finance/invoices/{id} */
export function getInvoice(user: User, id: string): InvoiceDetail {
  requireOwner(user);
  return toInvoiceDetail(findInvoice(id), true);
}

/** POST /finance/invoices. Always starts as a draft without a number. */
export function createInvoice(user: User, input: NewInvoice): InvoiceDetail {
  requireOwner(user);
  requireClientRecord(input.clientId);
  const title = input.title?.trim() ?? '';
  if (title.length < 3) throw badRequest('Give the invoice a short title, like "Social media retainer, December".');
  if (!validDate(input.due)) throw badRequest('Choose a due date.');
  if (input.due < today()) throw badRequest('The due date cannot be in the past.');
  const items = cleanItems(input.clientId, input.items);
  const row: InvoiceRow = {
    id: uid('inv-'),
    organisationId: input.clientId,
    title,
    due: input.due,
    status: 'DRAFT',
    placeOfSupply: stateOfClient(input.clientId),
    items,
    notes: input.notes?.trim() || undefined,
    payments: [],
    createdBy: user.name,
    events: [event(user.name, 'Invoice drafted')],
  };
  invoices.push(row);
  return toInvoiceDetail(row, true);
}

/** PATCH /finance/invoices/{id}. BACKEND: only drafts change; a sent invoice is a legal document (cancel and re-issue instead). */
export function updateInvoice(user: User, id: string, input: Partial<NewInvoice>): InvoiceDetail {
  requireOwner(user);
  const row = findInvoice(id);
  if (row.status !== 'DRAFT') throw conflict('Only drafts can be edited. Cancel this invoice and raise a new one.');
  if (input.title !== undefined) {
    if (input.title.trim().length < 3) throw badRequest('Give the invoice a short title.');
    row.title = input.title.trim();
  }
  if (input.due !== undefined) {
    if (!validDate(input.due) || input.due < today()) throw badRequest('Choose a due date from today onwards.');
    row.due = input.due;
  }
  if (input.items !== undefined) row.items = cleanItems(row.organisationId, input.items);
  if (input.notes !== undefined) row.notes = input.notes.trim() || undefined;
  row.events.push(event(user.name, 'Draft edited'));
  return toInvoiceDetail(row, true);
}

/**
 * POST /finance/invoices/{id}/send
 * BACKEND: the number is given here, next in sequence for the financial year, in the same
 * transaction (a row lock on the counter), so numbers have no gaps and drafts never use one.
 */
export function sendInvoice(user: User, id: string): InvoiceDetail {
  requireOwner(user);
  const row = findInvoice(id);
  if (row.status !== 'DRAFT') throw conflict('This invoice has already been sent.');
  if (row.due < today()) throw badRequest('The due date has passed. Edit the draft first.');
  const to = billingContacts(row.organisationId);
  if (!to.length) throw conflict('Nobody at this client can receive invoices yet. Invite the company owner first.');
  row.number = nextNumber('WEB', invoices.map((i) => i.number));
  row.issueDate = today();
  row.status = 'SENT';
  row.events.push(event(user.name, `Numbered ${row.number} and sent to ${to.map((u) => u.name).join(', ')}`));
  const { total } = moneyOf(row);
  for (const u of to) {
    sendEmail(u.email, `Invoice ${row.number} from Webinger`, `${row.title}: ${inr(total)} due by ${row.due}.`, `/client/billing/invoices/${row.id}`);
  }
  clientHistory(row.organisationId, user.name, 'INVOICE', `Invoice ${row.number} sent: ${row.title}, ${inr(total)}`);
  return toInvoiceDetail(row, true);
}

/** POST /finance/invoices/{id}/remind. Automation rule 9 sends these on a schedule in Phase 4. */
export function remindInvoice(user: User, id: string): InvoiceDetail {
  requireOwner(user);
  const row = findInvoice(id);
  if (row.status !== 'SENT' || balanceOf(row) === 0) throw conflict('Only unpaid invoices get reminders.');
  if (row.lastReminderAt && row.lastReminderAt.slice(0, 10) === today()) throw conflict('A reminder already went out today.');
  const to = billingContacts(row.organisationId);
  if (!to.length) throw conflict('Nobody at this client can receive the reminder.');
  row.lastReminderAt = nowIso();
  const late = daysLateOf(row);
  for (const u of to) {
    sendEmail(
      u.email,
      `Reminder: invoice ${row.number}${late ? ` is ${late} days overdue` : ` is due ${row.due}`}`,
      `Balance ${inr(balanceOf(row))}. Pay online from the portal or by bank transfer.`,
      `/client/billing/invoices/${row.id}`,
    );
  }
  row.events.push(event(user.name, `Reminder sent${late ? ` (${late} days late)` : ''}`));
  return toInvoiceDetail(row, true);
}

/** POST /finance/invoices/{id}/cancel. BACKEND: never deleted; paid or part-paid invoices need a credit note (Phase 1). */
export function cancelInvoice(user: User, id: string, reason: string): InvoiceDetail {
  requireOwner(user);
  const row = findInvoice(id);
  if (row.status === 'CANCELLED') throw conflict('Already cancelled.');
  if (row.payments.length) throw conflict('Money has been received on this invoice. Issue a credit note instead.');
  const why = reason?.trim() ?? '';
  if (why.length < 5) throw badRequest('Say why it is cancelled. The reason stays on the record.');
  row.status = 'CANCELLED';
  row.cancelReason = why;
  row.events.push(event(user.name, `Cancelled: ${why}`));
  if (row.number) clientHistory(row.organisationId, user.name, 'INVOICE', `Invoice ${row.number} cancelled: ${why}`);
  return toInvoiceDetail(row, true);
}

const METHODS: PaymentMethod[] = ['BANK_TRANSFER', 'UPI', 'CHEQUE', 'CARD', 'ONLINE'];

function addPayment(row: InvoiceRow, by: string, p: Omit<PaymentRow, 'id' | 'receiptNumber' | 'recordedBy'>) {
  const payment: PaymentRow = {
    ...p,
    id: uid('pay'),
    receiptNumber: nextNumber('RCPT', invoices.flatMap((i) => i.payments.map((x) => x.receiptNumber)), p.date),
    recordedBy: by,
  };
  row.payments.push(payment);
  if (balanceOf(row) === 0) row.status = 'PAID';
  return payment;
}

/** POST /finance/invoices/{id}/payments: money received by bank transfer, UPI or cheque. */
export function recordPayment(user: User, id: string, input: PaymentInput): InvoiceDetail {
  requireOwner(user);
  const row = findInvoice(id);
  if (row.status !== 'SENT') throw conflict(row.status === 'DRAFT' ? 'Send the invoice before recording money against it.' : 'This invoice takes no more payments.');
  const amount = Math.round(Number(input.amount) * 100) / 100;
  const tds = Math.round(Number(input.tds ?? 0) * 100) / 100;
  if (!(amount > 0)) throw badRequest('Enter the amount received.');
  if (!(tds >= 0)) throw badRequest('TDS cannot be negative.');
  // BACKEND: TDS is at most 10% of the taxable value (sections 194C / 194J); the CA confirms the rate.
  if (tds > moneyOf(row).subtotal * 0.1) throw badRequest('TDS looks too high: it is usually 2% or 10% of the amount before GST.');
  if (amount + tds > balanceOf(row) + 0.5) throw badRequest(`That is more than the balance of ${inr(balanceOf(row))}.`);
  if (!validDate(input.date) || input.date > today()) throw badRequest('Choose the date the money arrived (not in the future).');
  if (row.issueDate && input.date < row.issueDate) throw badRequest('The payment date is before the invoice date.');
  if (!METHODS.includes(input.method) || input.method === 'ONLINE') throw badRequest('Choose bank transfer, UPI, cheque or card.');
  const p = addPayment(row, user.name, { date: input.date, amount, tds, method: input.method, reference: input.reference?.trim() || undefined });
  row.events.push(event(user.name, `Payment of ${inr(amount)} recorded${tds ? ` with ${inr(tds)} TDS` : ''} (${p.receiptNumber})`));
  clientHistory(row.organisationId, user.name, 'INVOICE', `Payment received on ${row.number}: ${inr(amount)}${balanceOf(row) === 0 ? ' (paid in full)' : ''}`);
  for (const u of billingContacts(row.organisationId)) {
    sendEmail(u.email, `Receipt ${p.receiptNumber}`, `We received ${inr(amount)} against invoice ${row.number}. Thank you.`, `/client/billing/invoices/${row.id}`);
  }
  return toInvoiceDetail(row, true);
}

/* ============================================================== admin: quotes */

/** GET /finance/quotes */
export function listQuotes(user: User, q: { status?: QuoteStatus; clientId?: string } = {}): QuoteListItem[] {
  requireOwner(user);
  const ORDER: Record<QuoteStatus, number> = { DRAFT: 0, SENT: 1, ACCEPTED: 2, DECLINED: 3, EXPIRED: 4 };
  return quotes
    .map(toQuoteItem)
    .filter((x) => (!q.status || x.status === q.status) && (!q.clientId || x.clientId === q.clientId))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.number.localeCompare(a.number));
}

/** GET /finance/quotes/{id} */
export function getQuote(user: User, id: string): QuoteDetail {
  requireOwner(user);
  return toQuoteDetail(findQuote(id), true);
}

/** POST /finance/quotes. Numbered at once (quotes are not tax documents), sent separately. */
export function createQuote(user: User, input: NewQuote): QuoteDetail {
  requireOwner(user);
  requireClientRecord(input.clientId);
  const title = input.title?.trim() ?? '';
  if (title.length < 3) throw badRequest('Give the quote a title.');
  if (input.kind !== 'RETAINER' && input.kind !== 'PROJECT') throw badRequest('Choose retainer or project.');
  const term = Number(input.termMonths);
  if (input.kind === 'RETAINER' && !(term >= 1 && term <= 36)) throw badRequest('A retainer runs 1 to 36 months.');
  const revisions = Number(input.revisionsPerDeliverable);
  if (!(revisions >= 0 && revisions <= 10)) throw badRequest('Revisions per deliverable: 0 to 10.');
  const valid = Number(input.validDays);
  if (!(valid >= 1 && valid <= 90)) throw badRequest('A quote is valid for 1 to 90 days.');
  const row: QuoteRow = {
    id: uid('q'),
    number: nextNumber('QT', quotes.map((q) => q.number)),
    organisationId: input.clientId,
    title,
    kind: input.kind,
    termMonths: input.kind === 'RETAINER' ? term : term > 0 ? term : undefined,
    revisionsPerDeliverable: revisions,
    items: cleanItems(input.clientId, input.items),
    placeOfSupply: stateOfClient(input.clientId),
    validUntil: addDays(today(), valid),
    status: 'DRAFT',
    notes: input.notes?.trim() || undefined,
    createdBy: user.name,
    events: [event(user.name, 'Quote drafted')],
  };
  quotes.push(row);
  return toQuoteDetail(row, true);
}

/** POST /finance/quotes/{id}/send */
export function sendQuote(user: User, id: string): QuoteDetail {
  requireOwner(user);
  const q = findQuote(id);
  if (q.status !== 'DRAFT') throw conflict('This quote has already been sent.');
  if (q.validUntil < today()) throw conflict('The validity date has passed. Raise a new quote.');
  // BACKEND: only the owner can accept, so the owner must be able to sign in.
  const owner = users.find((u) => u.organisationId === q.organisationId && u.role === 'CLIENT_OWNER' && u.status === 'ACTIVE');
  if (!owner) throw conflict('This client has no active owner login to accept the quote. Invite one from Clients first.');
  q.status = 'SENT';
  q.sentAt = nowIso();
  q.events.push(event(user.name, `Sent to ${owner.name}`));
  sendEmail(owner.email, `Quote ${q.number}: ${q.title}`, `Review and accept online. Valid until ${q.validUntil}.`, `/client/billing?quote=${q.id}`);
  return toQuoteDetail(q, true);
}

/* =================================================== admin: payments, expenses */

/** GET /finance/payments */
export function listPayments(user: User, q: { clientId?: string } = {}): PaymentItem[] {
  requireOwner(user);
  return invoices
    .filter((i) => !q.clientId || i.organisationId === q.clientId)
    .flatMap((i) => i.payments.map((p) => toPaymentItem(i, p)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.receiptNumber.localeCompare(a.receiptNumber));
}

const CATEGORIES = ['FREELANCER', 'PRODUCTION', 'SOFTWARE', 'MEDIA', 'TRAVEL', 'OFFICE'];

/** GET /finance/expenses */
export function listExpenses(user: User, q: { month?: string; category?: string } = {}): ExpenseItem[] {
  requireOwner(user);
  return expenses
    .filter((e) => (!q.month || e.date.startsWith(q.month)) && (!q.category || e.category === q.category))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(toExpenseItem);
}

/** POST /finance/expenses */
export function createExpense(user: User, input: NewExpense): ExpenseItem {
  requireOwner(user);
  if (!validDate(input.date) || input.date > today()) throw badRequest('Choose the bill date (not in the future).');
  if (!CATEGORIES.includes(input.category)) throw badRequest('Choose a category.');
  const vendor = input.vendor?.trim() ?? '';
  const description = input.description?.trim() ?? '';
  if (vendor.length < 2) throw badRequest('Who was paid?');
  if (description.length < 3) throw badRequest('What was it for?');
  const amount = Number(input.amount);
  const gst = Number(input.gst ?? 0);
  if (!(amount > 0)) throw badRequest('Enter the amount before GST.');
  if (!(gst >= 0) || gst > amount * 0.28) throw badRequest('Input GST looks wrong (at most 28% of the amount).');
  if (input.projectId && !projects.some((p) => p.id === input.projectId)) throw badRequest('Unknown project.');
  const row: ExpenseRow = {
    id: uid('ex'),
    date: input.date,
    category: input.category,
    vendor,
    description,
    amount: Math.round(amount * 100) / 100,
    gst: Math.round(gst * 100) / 100,
    projectId: input.projectId || undefined,
    recordedBy: user.name,
  };
  expenses.push(row);
  return toExpenseItem(row);
}

/* ============================================================ admin: summary */

const ym = (iso: string) => iso.slice(0, 7);

/** Running retainers of live clients, per month, before GST (= monthly recurring revenue). */
export function recurringRevenue(): number {
  return clientRows
    .filter((c) => c.status === 'ACTIVE' || c.status === 'ONBOARDING')
    .flatMap((c) => c.contracts)
    .filter((c) => c.kind === 'RETAINER' && contractStatus(c) !== 'ENDED')
    .reduce((n, c) => n + c.value, 0);
}

const billed = () => invoices.filter((i) => i.status !== 'DRAFT' && i.status !== 'CANCELLED');

/** GET /finance/summary */
export function financeSummary(user: User): FinanceSummary {
  requireOwner(user);
  const thisMonth = ym(today());
  const payments = invoices.flatMap((i) => i.payments.map((p) => ({ p, i })));
  const months = [-5, -4, -3, -2, -1, 0].map((o) => ym(monthStart(o)));
  const sixMonthsAgo = monthStart(-5);

  const collectSpans = billed()
    .filter((i) => i.status === 'PAID' && i.issueDate! >= sixMonthsAgo && i.payments.length)
    .map((i) => (Date.parse(i.payments[i.payments.length - 1].date) - Date.parse(i.issueDate!)) / DAY_MS);

  const decided = quotes.map(quoteStatusOf).filter((s) => s === 'ACCEPTED' || s === 'DECLINED' || s === 'EXPIRED');
  const open = quotes.filter((q) => quoteStatusOf(q) === 'SENT');

  const fyStart = `${financialYear(today()).slice(0, 4)}-04-01`;
  const byService = new Map<string, number>();
  for (const i of billed().filter((x) => x.issueDate! >= fyStart)) {
    for (const line of i.items) {
      const service = line.projectId ? projects.find((p) => p.id === line.projectId)?.service ?? 'Other' : 'Programmes and retainers';
      byService.set(service, (byService.get(service) ?? 0) + lineAmount(line));
    }
  }

  const unpaid = unpaidInvoices();
  const overdue = unpaid.filter((i) => statusOf(i) === 'OVERDUE');
  return {
    collectedThisMonth: payments.filter(({ p }) => ym(p.date) === thisMonth).reduce((n, { p }) => n + p.amount, 0),
    invoicedThisMonth: billed().filter((i) => ym(i.issueDate!) === thisMonth).reduce((n, i) => n + subtotalOf(i.items), 0),
    recurringRevenue: recurringRevenue(),
    outstanding: unpaid.reduce((n, i) => n + balanceOf(i), 0),
    overdue: overdue.reduce((n, i) => n + balanceOf(i), 0),
    overdueCount: overdue.length,
    daysToCollect: collectSpans.length ? Math.round(collectSpans.reduce((a, b) => a + b, 0) / collectSpans.length) : undefined,
    expensesThisMonth: expenses.filter((e) => ym(e.date) === thisMonth).reduce((n, e) => n + e.amount, 0),
    draftInvoices: invoices.filter((i) => i.status === 'DRAFT').length,
    openQuotes: { count: open.length, value: open.reduce((n, q) => n + subtotalOf(q.items), 0) },
    winRate: decided.length ? decided.filter((s) => s === 'ACCEPTED').length / decided.length : undefined,
    months: months.map((m) => ({
      month: m,
      invoiced: billed().filter((i) => ym(i.issueDate!) === m).reduce((n, i) => n + moneyOf(i).total, 0),
      collected: payments.filter(({ p }) => ym(p.date) === m).reduce((n, { p }) => n + p.amount + p.tds, 0),
      expenses: expenses.filter((e) => ym(e.date) === m).reduce((n, e) => n + e.amount, 0),
    })),
    byService: [...byService].map(([service, amount]) => ({ service, amount })).sort((a, b) => b.amount - a.amount),
  };
}

/* ============================================================= admin: profit */

/**
 * GET /finance/profit
 * Project margin = invoiced (before GST) − hours × cost rate − direct costs (CLAUDE.md section 6).
 * BACKEND: cost rates are SUPER_ADMIN only. Phase 2 takes hours per person from time entries;
 * until then the project's logged hours are costed at the average rate of its staff.
 */
export function profitReport(user: User): ProfitReport {
  requireOwner(user);
  const revenueByProject = new Map<string, number>();
  const revenueByClient = new Map<string, number>();
  for (const i of billed()) {
    for (const line of i.items) {
      if (line.projectId) revenueByProject.set(line.projectId, (revenueByProject.get(line.projectId) ?? 0) + lineAmount(line));
      revenueByClient.set(i.organisationId, (revenueByClient.get(i.organisationId) ?? 0) + lineAmount(line));
    }
  }
  const direct = new Map<string, number>();
  for (const e of expenses) if (e.projectId) direct.set(e.projectId, (direct.get(e.projectId) ?? 0) + e.amount);

  const margin = (revenue: number, profit: number) => (revenue > 0 ? Math.round((profit / revenue) * 1000) / 1000 : undefined);
  const clientIds = new Set(clientRows.map((c) => c.organisationId));
  const projectRows: ProfitRow[] = projects
    .filter((p) => clientIds.has(p.organisationId))
    .map((p) => {
      const staff = [...new Set([p.ownerId, ...p.memberIds])].filter((id) => costRates[id] !== undefined);
      const rate = staff.length ? staff.reduce((n, id) => n + costRates[id], 0) / staff.length : 500;
      const revenue = revenueByProject.get(p.id) ?? 0;
      const labourCost = Math.round(p.hoursUsed * rate);
      const directCost = direct.get(p.id) ?? 0;
      const profit = revenue - labourCost - directCost;
      return {
        id: p.id,
        name: p.name,
        clientName: CLIENT_NAME[p.organisationId],
        service: p.service,
        revenue,
        hours: p.hoursUsed,
        labourCost,
        directCost,
        profit,
        margin: margin(revenue, profit),
      };
    });

  const clientRowsOut: ProfitRow[] = clientRows.map((c) => {
    const own = projectRows.filter((p) => projects.find((x) => x.id === p.id)?.organisationId === c.organisationId);
    const revenue = revenueByClient.get(c.organisationId) ?? 0;
    const labourCost = own.reduce((n, p) => n + p.labourCost, 0);
    const directCost = own.reduce((n, p) => n + p.directCost, 0);
    const profit = revenue - labourCost - directCost;
    return {
      id: c.organisationId,
      name: CLIENT_NAME[c.organisationId] ?? c.organisationId,
      revenue,
      hours: own.reduce((n, p) => n + p.hours, 0),
      labourCost,
      directCost,
      profit,
      margin: margin(revenue, profit),
    };
  });

  const byMargin = (a: ProfitRow, b: ProfitRow) => (a.margin ?? -Infinity) - (b.margin ?? -Infinity) || a.name.localeCompare(b.name);
  return { clients: clientRowsOut.sort((a, b) => b.revenue - a.revenue), projects: projectRows.sort(byMargin) };
}

/* ============================================================= admin: export */

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  // Quote anything with a comma, quote or newline; neutralise spreadsheet formulas.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

/**
 * GET /finance/export?kind&from&to → CSV for the accountant (CA).
 * BACKEND: bulk export is SUPER_ADMIN only and every export is logged (CLAUDE.md section 14).
 */
export function exportCsv(user: User, kind: ExportKind, from: string, to: string): ExportFile {
  requireOwner(user);
  if (!validDate(from) || !validDate(to)) throw badRequest('Choose a start and end date.');
  if (from > to) throw badRequest('The start date is after the end date.');
  if ((Date.parse(to) - Date.parse(from)) / DAY_MS > 366) throw badRequest('Export at most one year at a time.');
  const inRange = (d?: string) => !!d && d >= from && d <= to;
  let rows: unknown[][];

  if (kind === 'invoices') {
    rows = [['Invoice number', 'Invoice date', 'Due date', 'Client', 'GSTIN', 'Place of supply', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Total', 'Status', 'Received incl. TDS', 'Balance']];
    for (const i of invoices.filter((x) => x.status !== 'DRAFT' && inRange(x.issueDate)).sort((a, b) => a.number!.localeCompare(b.number!))) {
      const m = moneyOf(i);
      const t = (l: TaxLine['label']) => m.taxes.find((x) => x.label === l)?.amount ?? 0;
      const b = buyerOf(i.organisationId, i.placeOfSupply);
      rows.push([i.number, i.issueDate, i.due, b.legalName, b.gstin ?? 'Unregistered', `${i.placeOfSupply}-${b.stateName}`, m.subtotal, t('CGST'), t('SGST'), t('IGST'),
        i.status === 'CANCELLED' ? 0 : m.total, statusOf(i), paidOf(i), balanceOf(i)]);
    }
  } else if (kind === 'payments') {
    rows = [['Receipt', 'Date', 'Invoice', 'Client', 'Amount received', 'TDS deducted', 'Method', 'Reference']];
    for (const p of invoices.flatMap((i) => i.payments.map((x) => toPaymentItem(i, x))).filter((x) => inRange(x.date)).sort((a, b) => a.date.localeCompare(b.date))) {
      rows.push([p.receiptNumber, p.date, p.invoiceNumber, CLIENT_NAME[p.clientId], p.amount, p.tds, p.method, p.reference ?? '']);
    }
  } else if (kind === 'expenses') {
    rows = [['Date', 'Vendor', 'Category', 'Description', 'Project', 'Client', 'Amount', 'Input GST', 'Total']];
    for (const e of expenses.filter((x) => inRange(x.date)).sort((a, b) => a.date.localeCompare(b.date)).map(toExpenseItem)) {
      rows.push([e.date, e.vendor, e.category, e.description, e.projectName ?? '', e.clientName ?? '', e.amount, e.gst, e.amount + e.gst]);
    }
  } else {
    throw badRequest('Choose invoices, payments or expenses.');
  }

  exportLog.unshift({ id: uid('xl'), at: nowIso(), by: user.name, kind, from, to, rows: rows.length - 1 });
  return { fileName: `webinger-${kind}-${from}-to-${to}.csv`, content: csv(rows), rows: rows.length - 1 };
}

/** GET /finance/exports: who exported what, newest first. */
export function exportHistory(user: User): ExportLogItem[] {
  requireOwner(user);
  return exportLog.slice(0, 20);
}

/* ============================================================== client: billing */

/** GET /billing */
export function billingOverview(user: User): BillingOverview {
  requireBilling(user);
  const org = user.organisationId;
  // BACKEND: clients never see drafts (not yet issued) or anything of another organisation.
  const own = invoices.filter((i) => i.organisationId === org && i.status !== 'DRAFT');
  const items = own.map(toInvoiceItem).sort((a, b) => Number(b.balance > 0) - Number(a.balance > 0) || (b.issueDate ?? '').localeCompare(a.issueDate ?? ''));
  const unpaid = items.filter((i) => i.balance > 0).sort((a, b) => a.due.localeCompare(b.due));
  const row = clientRows.find((c) => c.organisationId === org);
  const QUOTE_ORDER: Record<QuoteStatus, number> = { SENT: 0, ACCEPTED: 1, DECLINED: 2, EXPIRED: 3, DRAFT: 4 };
  return {
    outstanding: unpaid.reduce((n, i) => n + i.balance, 0),
    overdue: unpaid.filter((i) => i.status === 'OVERDUE').reduce((n, i) => n + i.balance, 0),
    nextDue: unpaid[0] ? { invoiceId: unpaid[0].id, number: unpaid[0].number!, due: unpaid[0].due, balance: unpaid[0].balance } : undefined,
    invoices: items,
    quotes: quotes
      .filter((q) => q.organisationId === org && q.status !== 'DRAFT')
      .map(toQuoteItem)
      .sort((a, b) => QUOTE_ORDER[a.status] - QUOTE_ORDER[b.status] || b.number.localeCompare(a.number)),
    contracts: (row?.contracts ?? [])
      .map((c) => ({ ...c, status: contractStatus(c) }))
      .sort((a, b) => Number(a.status === 'ENDED') - Number(b.status === 'ENDED') || b.startDate.localeCompare(a.startDate)),
    payments: own.flatMap((i) => i.payments.map((p) => toPaymentItem(i, p))).sort((a, b) => b.date.localeCompare(a.date)),
    canAccept: user.role === 'CLIENT_OWNER',
  };
}

function ownInvoice(user: User, id: string) {
  const row = invoices.find((i) => i.id === id);
  // BACKEND: another company's invoice, or a draft, is "not found" (404), never 403.
  if (!row || row.organisationId !== user.organisationId || row.status === 'DRAFT') throw notFound('Invoice');
  return row;
}
function ownQuote(user: User, id: string) {
  const q = quotes.find((x) => x.id === id);
  if (!q || q.organisationId !== user.organisationId || q.status === 'DRAFT') throw notFound('Quote');
  return q;
}

/** GET /billing/invoices/{id} */
export function getBillingInvoice(user: User, id: string): InvoiceDetail {
  requireBilling(user);
  return toInvoiceDetail(ownInvoice(user, id), false);
}

/**
 * POST /billing/invoices/{id}/pay: the demo "Pay now".
 * BACKEND (Phase 2): create a payment-gateway order here and mark the invoice paid only from the
 * gateway's signed webhook. The browser can never mark an invoice paid by itself.
 */
export function payInvoice(user: User, id: string): InvoiceDetail {
  requireBilling(user);
  const row = ownInvoice(user, id);
  if (row.status !== 'SENT' || balanceOf(row) === 0) throw conflict('Nothing is due on this invoice.');
  const amount = balanceOf(row);
  const p = addPayment(row, user.name, { date: today(), amount, tds: 0, method: 'ONLINE', reference: `pay_demo_${Date.now().toString(36)}` });
  row.events.push(event(user.name, `Paid online: ${inr(amount)} (${p.receiptNumber})`));
  clientHistory(row.organisationId, user.name, 'INVOICE', `Paid ${row.number} online: ${inr(amount)}`);
  sendEmail(user.email, `Receipt ${p.receiptNumber}`, `Payment of ${inr(amount)} received for invoice ${row.number}. Thank you.`, `/client/billing/invoices/${row.id}`);
  sendEmail('admin@webinger.in', `Payment received: ${row.number}`, `${CLIENT_NAME[row.organisationId]} paid ${inr(amount)} online.`);
  return toInvoiceDetail(row, false);
}

/** GET /billing/quotes/{id} */
export function getBillingQuote(user: User, id: string): QuoteDetail {
  requireBilling(user);
  return toQuoteDetail(ownQuote(user, id), false);
}

function requireDecider(user: User, q: QuoteRow) {
  // BACKEND: accepting a quote is a contract; only the client's owner signs it.
  if (user.role !== 'CLIENT_OWNER') throw forbidden('Only your company owner can accept or decline quotes.');
  const status = quoteStatusOf(q);
  if (status === 'EXPIRED') throw conflict('This quote has expired. Ask your account manager for a fresh one.');
  if (status !== 'SENT') throw conflict('This quote has already been decided.');
}

const addMonths = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * POST /billing/quotes/{id}/accept (automation rule 2).
 * One transaction: quote ACCEPTED, contract added to the client record, advance invoice drafted.
 * BACKEND: the advance invoice stays a draft until a Super Admin sends it (money actions need a person).
 */
export function acceptQuote(user: User, id: string): QuoteDetail {
  requireBilling(user);
  const q = ownQuote(user, id);
  requireDecider(user, q);
  const client = clientRows.find((c) => c.organisationId === q.organisationId)!;
  const { subtotal } = moneyOf(q);
  const start = today();
  const months = q.termMonths ?? 1;
  const contractId = uid('ct-');
  client.contracts.push({
    id: contractId,
    title: q.title,
    kind: q.kind,
    startDate: start,
    endDate: addDays(addMonths(start, months), -1),
    value: subtotal,
    revisionsPerDeliverable: q.revisionsPerDeliverable,
    status: 'ACTIVE',
  });

  const advance: InvoiceRow = {
    id: uid('inv-'),
    organisationId: q.organisationId,
    title: q.kind === 'RETAINER' ? `${q.title}: first month` : `${q.title}: 50% advance`,
    due: addDays(start, 7),
    status: 'DRAFT',
    placeOfSupply: q.placeOfSupply,
    items:
      q.kind === 'RETAINER'
        ? q.items.map((i) => ({ ...i, description: `${i.description.replace(/ \(monthly\)$/, '')}: ${monthName(start.slice(0, 7))}` }))
        : [{ description: `${q.title}: 50% advance on acceptance`, sac: q.items[0]?.sac ?? DEFAULT_SAC, quantity: 1, rate: Math.round(subtotal / 2) }],
    payments: [],
    quoteId: q.id,
    createdBy: 'System',
    events: [event('System', `Drafted from accepted quote ${q.number}`)],
  };
  invoices.push(advance);

  q.status = 'ACCEPTED';
  q.decidedAt = nowIso();
  q.decidedBy = user.name;
  q.contractId = contractId;
  q.advanceInvoiceId = advance.id;
  q.events.push(event(user.name, 'Accepted online'), event('System', 'Contract added and advance invoice drafted'));
  client.history.push(
    { id: uid('h-q'), at: nowIso(), actor: user.name, kind: 'CONTRACT', text: `Accepted quote ${q.number}: ${q.title}, ${inr(subtotal)}${q.kind === 'RETAINER' ? ' a month' : ''}` },
  );
  sendEmail('admin@webinger.in', `Quote accepted: ${q.number}`, `${user.name} accepted "${q.title}". The advance invoice is ready to send.`, `/admin/finance/invoices/${advance.id}`);
  return toQuoteDetail(q, false);
}

/** POST /billing/quotes/{id}/decline */
export function declineQuote(user: User, id: string, reason: string): QuoteDetail {
  requireBilling(user);
  const q = ownQuote(user, id);
  requireDecider(user, q);
  const why = reason?.trim() ?? '';
  if (why.length < 3) throw badRequest('Tell us briefly why, so we can improve the offer.');
  q.status = 'DECLINED';
  q.decidedAt = nowIso();
  q.decidedBy = user.name;
  q.declineReason = why;
  q.events.push(event(user.name, `Declined: ${why}`));
  clientHistory(q.organisationId, user.name, 'CONTRACT', `Declined quote ${q.number}: ${why}`);
  sendEmail('admin@webinger.in', `Quote declined: ${q.number}`, `${user.name}: ${why}`, `/admin/finance?tab=quotes`);
  return toQuoteDetail(q, false);
}

/* ---------------------------------------------------------------- helpers */

function inr(n: number) {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

/** For staff pickers in the invoice and quote forms. */
export function billableProjects(user: User, clientId: string) {
  requireOwner(user);
  return projects
    .filter((p) => p.organisationId === clientId && p.status !== 'COMPLETED')
    .map((p) => ({ id: p.id, name: p.name, service: p.service }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Dashboard shape (Week 1 contract): balance due, not the invoice total. */
export function invoiceSummary(row: InvoiceRow): InvoiceSummary {
  return { id: row.id, number: row.number ?? '', clientName: CLIENT_NAME[row.organisationId] ?? row.organisationId, amount: balanceOf(row), due: row.due, status: statusOf(row) };
}

/** Sent this month, before GST (admin dashboard "Revenue this month"). */
export const invoicedThisMonth = () => billed().filter((i) => ym(i.issueDate!) === ym(today())).reduce((n, i) => n + subtotalOf(i.items), 0);

/** Who appears as "billing contact" on admin screens. */
export const billingContactNames = (orgId: string) => billingContacts(orgId).map((u) => nameOf(u.id));
