/**
 * Week 5 seed: invoices, payments, quotes, expenses, cost rates and monthly client results.
 * Every company, person, number and bank detail here is invented.
 * Dates are relative to today, so "overdue" and "this month" stay meaningful.
 */
import type { ExpenseCategory, ExportLogItem, FinanceEvent, LineItemInput, MetricUnit, PaymentMethod, QuoteStatus } from '@/types';
import { ago, day, ORG } from './data';

/* --------------------------------------------------------------- helpers */

/** First day of the month `offset` months from now, as yyyy-mm-dd. */
export function monthStart(offset: number): string {
  const d = new Date();
  const m = new Date(Date.UTC(d.getFullYear(), d.getMonth() + offset, 1));
  return m.toISOString().slice(0, 10);
}
export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** "2026-10" → "October 2026". */
export const monthName = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Clamps a seeded date to today, so relative seeds never land in the future. */
const notAfterToday = (iso: string) => (iso > day(0) ? day(0) : iso);

/* ---------------------------------------------------------- the agency */

export const AGENCY = {
  name: 'Webinger',
  legalName: 'Webinger Digital Private Limited',
  gstin: '27AACCW4512M1Z9',
  address: 'Office 702, Satellite Tower, Andheri East, Mumbai 400069',
  stateCode: '27',
  stateName: 'Maharashtra',
};
/** Printed on invoices. Masked; Phase 1 keeps the full number in a restricted settings table. */
export const PAY_TO = { bank: 'HDFC Bank, Andheri East', account: 'XXXXXXXX4821', ifsc: 'HDFC0000123', upi: 'webinger@hdfcbank' };
export const DEFAULT_SAC = '998361';
export const GST_RATE = 18;

export const STATE_NAME: Record<string, string> = {
  '07': 'Delhi',
  '09': 'Uttar Pradesh',
  '19': 'West Bengal',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '36': 'Telangana',
};
/** Place of supply for clients without a GSTIN, from their city. */
export const CITY_STATE: Record<string, string> = {
  mumbai: '27', pune: '27', nagpur: '27', nashik: '27', thane: '27',
  bengaluru: '29', bangalore: '29', mysuru: '29',
  hyderabad: '36', kolkata: '19', delhi: '07', 'new delhi': '07', chennai: '33',
  ahmedabad: '24', surat: '24', vadodara: '24', kochi: '32', indore: '23', bhopal: '23', raipur: '22', lucknow: '09',
};

/* -------------------------------------------------------------- invoices */

export interface PaymentRow {
  id: string;
  receiptNumber: string;
  date: string;
  amount: number;
  tds: number;
  method: PaymentMethod;
  reference?: string;
  recordedBy: string;
}

export interface InvoiceRow {
  id: string;
  organisationId: string;
  /** Given on send, in sequence per financial year. */
  number?: string;
  title: string;
  issueDate?: string;
  due: string;
  /** OVERDUE is never stored: it is SENT past its due date. */
  status: 'DRAFT' | 'SENT' | 'PAID' | 'CANCELLED';
  placeOfSupply: string;
  items: LineItemInput[];
  notes?: string;
  payments: PaymentRow[];
  cancelReason?: string;
  quoteId?: string;
  lastReminderAt?: string;
  createdBy: string;
  events: FinanceEvent[];
}

let seq = 0;
const ev = (hoursAgo: number, actor: string, text: string): FinanceEvent => ({ id: `fe${++seq}`, at: ago(hoursAgo), actor, text });
const hoursSince = (iso: string) => Math.max(1, Math.round((Date.now() - Date.parse(`${iso}T05:00:00Z`)) / 3_600_000));

const withGst = (n: number) => n + Math.round((n * GST_RATE) / 100);

let rc = 0;
const pay = (date: string, amount: number, tds = 0, method: PaymentMethod = 'BANK_TRANSFER', reference?: string): PaymentRow => ({
  id: `pay${++rc}`,
  receiptNumber: '', // numbered below, in date order
  date: notAfterToday(date),
  amount,
  tds,
  method,
  reference,
  recordedBy: 'Rohan Mehta',
});

interface SeedInvoice {
  id: string;
  org: string;
  pos: string;
  title: string;
  issue: string;
  dueDays?: number;
  due?: string;
  items: LineItemInput[];
  paid?: { after: number; tdsRate?: number; method?: PaymentMethod; ref?: string };
  status?: InvoiceRow['status'];
  cancelReason?: string;
  createdBy?: string;
}

const MONTH = (offset: number) => monthName(monthStart(offset).slice(0, 7));
const retainer = (offset: number, label: string, rate: number, projectId?: string): LineItemInput => ({
  description: `${label}: ${MONTH(offset)}`,
  sac: DEFAULT_SAC,
  quantity: 1,
  rate,
  projectId,
});

const seeds: SeedInvoice[] = [
  // Terra Foods (Maharashtra → CGST + SGST)
  ...[-2, -1].map((m) => ({
    id: `inv-terra-r${-m}`, org: ORG.TERRA, pos: '27', title: `Social media retainer, ${MONTH(m)}`, issue: monthStart(m), dueDays: 15,
    items: [retainer(m, 'Social media management', 50_000, 'p1')], paid: { after: 9, tdsRate: 2 },
  })),
  {
    id: 'inv-terra-web', org: ORG.TERRA, pos: '27', title: 'Website redesign: 50% advance', issue: day(-40), dueDays: 7,
    items: [{ description: 'Website redesign: 50% advance on signing', sac: '998314', quantity: 1, rate: 120_000, projectId: 'p2' }],
    paid: { after: 6, tdsRate: 2, method: 'UPI', ref: 'UPI 6612 0981' },
  },
  {
    id: 'i1', org: ORG.TERRA, pos: '27', title: `Social media retainer, ${MONTH(0)}`, issue: day(-10), due: day(5),
    items: [retainer(0, 'Social media management', 50_000, 'p1')],
  },
  {
    id: 'inv-terra-reels', org: ORG.TERRA, pos: '27', title: 'Extra reels for December', issue: day(-1), due: day(14), status: 'DRAFT',
    items: [{ description: 'Additional reels (30 s, edited, captioned)', sac: DEFAULT_SAC, quantity: 4, rate: 6_000, projectId: 'p1' }],
  },
  // Nova Clinics (Karnataka → IGST)
  {
    id: 'inv-nova-logo', org: ORG.NOVA, pos: '29', title: 'Logo and identity', issue: day(-200), dueDays: 10,
    items: [{ description: 'Logo and identity design (3 concepts, final files, brand sheet)', sac: '998391', quantity: 1, rate: 95_000, projectId: 'p5' }],
    paid: { after: 12, method: 'CHEQUE', ref: 'Cheque 004512' },
  },
  ...[-4, -3, -2].map((m) => ({
    id: `inv-nova-r${-m}`, org: ORG.NOVA, pos: '29', title: `Lead generation retainer, ${MONTH(m)}`, issue: monthStart(m), dueDays: 15,
    items: [retainer(m, 'Lead generation management', 70_000, 'p4')], paid: { after: 21, tdsRate: 2 },
  })),
  {
    id: 'i2', org: ORG.NOVA, pos: '29', title: `Lead generation retainer, ${MONTH(-1)}`, issue: day(-32), due: day(-17),
    items: [retainer(-1, 'Lead generation management', 70_000, 'p4')],
  },
  {
    id: 'i3', org: ORG.NOVA, pos: '29', title: 'Clinic landing page build', issue: day(-19), due: day(-4),
    items: [{ description: 'Landing page design and build (3 clinic variants)', sac: '998314', quantity: 1, rate: 30_000, projectId: 'p4' }],
  },
  // Sunrise Retail Group (Maharashtra)
  ...[-3, -2, -1].map((m) => ({
    id: `inv-sun-r${-m}`, org: ORG.SUNRISE, pos: '27', title: `Store launch programme, ${MONTH(m)}`, issue: monthStart(m), dueDays: 15,
    items: [retainer(m, 'Store launch programme (10 cities)', 240_000)], paid: { after: m === -1 ? 33 : 14, tdsRate: 2 },
  })),
  {
    id: 'inv-sun-dup', org: ORG.SUNRISE, pos: '27', title: `Store launch programme, ${MONTH(-1)} (duplicate)`, issue: addDays(monthStart(-1), 1), dueDays: 15,
    items: [retainer(-1, 'Store launch programme (10 cities)', 240_000)], status: 'CANCELLED', cancelReason: 'Raised twice by mistake; the first invoice stands.',
  },
  {
    id: 'inv-sun-now', org: ORG.SUNRISE, pos: '27', title: `Store launch programme, ${MONTH(0)}`, issue: day(-5), due: day(10),
    items: [retainer(0, 'Store launch programme (10 cities)', 240_000)],
  },
  // Bluepeak Fitness (former client, no GSTIN, Telangana)
  ...[-5, -4, -3].map((m) => ({
    id: `inv-blue-r${-m}`, org: ORG.BLUEPEAK, pos: '36', title: `Social media retainer, ${MONTH(m)}`, issue: monthStart(m), dueDays: 15,
    items: [retainer(m, 'Social media management', 40_000)], paid: { after: 5, method: 'UPI' as PaymentMethod },
  })),
];

const fy = (iso: string) => {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
};
export const financialYear = fy;

export const invoices: InvoiceRow[] = seeds.map((s) => {
  const issue = notAfterToday(s.issue);
  const subtotal = s.items.reduce((n, i) => n + i.quantity * i.rate, 0);
  const total = withGst(subtotal);
  const status: InvoiceRow['status'] = s.status ?? (s.paid ? 'PAID' : 'SENT');
  const payments: PaymentRow[] = [];
  const events: FinanceEvent[] = [ev(hoursSince(issue) + 2, s.createdBy ?? 'Rohan Mehta', 'Invoice drafted')];
  if (status !== 'DRAFT') events.push(ev(hoursSince(issue), 'Rohan Mehta', 'Sent to the client'));
  if (s.paid) {
    const tds = Math.round((subtotal * (s.paid.tdsRate ?? 0)) / 100);
    const p = pay(addDays(issue, s.paid.after), total - tds, tds, s.paid.method, s.paid.ref);
    payments.push(p);
    events.push(ev(hoursSince(p.date), 'Rohan Mehta', `Payment recorded${tds ? ' (TDS deducted by client)' : ''}`));
  }
  if (status === 'CANCELLED') events.push(ev(hoursSince(issue) - 20, 'Rohan Mehta', `Cancelled: ${s.cancelReason}`));
  return {
    id: s.id,
    organisationId: s.org,
    title: s.title,
    issueDate: status === 'DRAFT' ? undefined : issue,
    due: s.due ?? addDays(issue, s.dueDays ?? 15),
    status,
    placeOfSupply: s.pos,
    items: s.items,
    payments,
    cancelReason: s.cancelReason,
    createdBy: s.createdBy ?? 'Rohan Mehta',
    events,
  };
});

// Numbers in issue order, per financial year (WEB/2026-27/0081 …). The seed starts after earlier, unshown invoices.
{
  const counters: Record<string, number> = {};
  invoices
    .filter((i) => i.issueDate)
    .sort((a, b) => a.issueDate!.localeCompare(b.issueDate!) || a.id.localeCompare(b.id))
    .forEach((i) => {
      const y = fy(i.issueDate!);
      counters[y] = (counters[y] ?? 80) + 1;
      i.number = `WEB/${y}/${String(counters[y]).padStart(4, '0')}`;
    });
  let r = 40;
  invoices
    .flatMap((i) => i.payments)
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((p) => (p.receiptNumber = `RCPT/${fy(p.date)}/${String(++r).padStart(4, '0')}`));
}

/* ---------------------------------------------------------------- quotes */

export interface QuoteRow {
  id: string;
  number: string;
  organisationId: string;
  title: string;
  kind: 'RETAINER' | 'PROJECT';
  termMonths?: number;
  revisionsPerDeliverable: number;
  items: LineItemInput[];
  placeOfSupply: string;
  validUntil: string;
  status: Exclude<QuoteStatus, 'EXPIRED'>;
  sentAt?: string;
  decidedAt?: string;
  decidedBy?: string;
  declineReason?: string;
  notes?: string;
  contractId?: string;
  advanceInvoiceId?: string;
  createdBy: string;
  events: FinanceEvent[];
}

export const quotes: QuoteRow[] = [
  {
    id: 'q1', number: 'QT/2026-27/0024', organisationId: ORG.TERRA, title: 'Paid ads add-on (3 months)', kind: 'RETAINER', termMonths: 3,
    revisionsPerDeliverable: 3, placeOfSupply: '27', validUntil: day(11), status: 'SENT', sentAt: ago(72), createdBy: 'Rohan Mehta',
    items: [
      { description: 'Meta and Google ads management (monthly)', sac: DEFAULT_SAC, quantity: 1, rate: 30_000 },
      { description: 'Ad creatives: 8 statics and 2 short videos (monthly)', sac: DEFAULT_SAC, quantity: 1, rate: 5_000 },
    ],
    notes: 'Ad budget is paid by Terra Foods directly to Meta and Google and is not part of this fee.',
    events: [ev(74, 'Rohan Mehta', 'Quote drafted'), ev(72, 'Rohan Mehta', 'Sent to Arjun Kapoor')],
  },
  {
    id: 'q2', number: 'QT/2026-27/0025', organisationId: ORG.NOVA, title: 'Lead generation renewal (12 months)', kind: 'RETAINER', termMonths: 12,
    revisionsPerDeliverable: 3, placeOfSupply: '29', validUntil: day(12), status: 'SENT', sentAt: ago(48), createdBy: 'Rohan Mehta',
    items: [{ description: 'Lead generation management: 3 clinics (monthly)', sac: DEFAULT_SAC, quantity: 1, rate: 72_000 }],
    notes: 'Renewal of the current retainer that ends this month. Fee revised by 3% for the new term.',
    events: [ev(50, 'Rohan Mehta', 'Quote drafted (renewal: contract ends in 30 days)'), ev(48, 'Rohan Mehta', 'Sent to Sameer Joshi')],
  },
  {
    id: 'q3', number: 'QT/2026-27/0019', organisationId: ORG.SUNRISE, title: 'Diwali festive campaign', kind: 'PROJECT', termMonths: 1,
    revisionsPerDeliverable: 2, placeOfSupply: '27', validUntil: day(-50), status: 'ACCEPTED', sentAt: ago(24 * 66), decidedAt: ago(24 * 62),
    decidedBy: 'Farah Siddiqui', createdBy: 'Isha Mehta',
    items: [{ description: 'Festive campaign across 10 stores: creatives, reels, local influencers', sac: DEFAULT_SAC, quantity: 1, rate: 180_000 }],
    events: [ev(24 * 66, 'Isha Mehta', 'Sent to Farah Siddiqui'), ev(24 * 62, 'Farah Siddiqui', 'Accepted online')],
  },
  {
    id: 'q4', number: 'QT/2026-27/0021', organisationId: ORG.TERRA, title: 'Influencer launch campaign', kind: 'PROJECT', termMonths: 1,
    revisionsPerDeliverable: 2, placeOfSupply: '27', validUntil: day(-6), status: 'DECLINED', sentAt: ago(24 * 26), decidedAt: ago(24 * 20),
    decidedBy: 'Arjun Kapoor', declineReason: 'Budget moved to the first quarter. Please send again in January.', createdBy: 'Rohan Mehta',
    items: [{ description: '6 food creators in Mumbai: 6 reels and 18 stories', sac: DEFAULT_SAC, quantity: 1, rate: 145_000 }],
    events: [ev(24 * 26, 'Rohan Mehta', 'Sent to Arjun Kapoor'), ev(24 * 20, 'Arjun Kapoor', 'Declined')],
  },
  {
    id: 'q5', number: 'QT/2026-27/0022', organisationId: ORG.NOVA, title: 'SEO for 3 clinic pages', kind: 'RETAINER', termMonths: 6,
    revisionsPerDeliverable: 3, placeOfSupply: '29', validUntil: day(-3), status: 'SENT', sentAt: ago(24 * 18), createdBy: 'Rohan Mehta',
    items: [{ description: 'Local SEO for 3 clinic locations (monthly)', sac: DEFAULT_SAC, quantity: 1, rate: 25_000 }],
    events: [ev(24 * 18, 'Rohan Mehta', 'Sent to Sameer Joshi')],
  },
  {
    id: 'q6', number: 'QT/2026-27/0026', organisationId: ORG.BLUEPEAK, title: 'Win-back: social media retainer', kind: 'RETAINER', termMonths: 6,
    revisionsPerDeliverable: 3, placeOfSupply: '36', validUntil: day(30), status: 'DRAFT', createdBy: 'Rohan Mehta',
    items: [{ description: 'Social media management: 12 posts and 6 reels (monthly)', sac: DEFAULT_SAC, quantity: 1, rate: 38_000 }],
    events: [ev(6, 'Rohan Mehta', 'Quote drafted')],
  },
];

/* -------------------------------------------------------------- expenses */

export interface ExpenseRow {
  id: string;
  date: string;
  category: ExpenseCategory;
  vendor: string;
  description: string;
  amount: number;
  gst: number;
  projectId?: string;
  recordedBy: string;
}

let ex = 0;
const exp = (date: string, category: ExpenseCategory, vendor: string, description: string, amount: number, projectId?: string, gst = Math.round(amount * 0.18)): ExpenseRow => ({
  id: `ex${++ex}`,
  date: notAfterToday(date),
  category,
  vendor,
  description,
  amount,
  gst,
  projectId,
  recordedBy: 'Rohan Mehta',
});

export const expenses: ExpenseRow[] = [
  ...[-5, -4, -3, -2, -1, 0].flatMap((m) => [
    exp(addDays(monthStart(m), 2), 'OFFICE', 'Satellite Tower LLP', `Office rent: ${MONTH(m)}`, 65_000),
    exp(addDays(monthStart(m), 4), 'SOFTWARE', 'Design suite (annual seats, monthly share)', `Design software: ${MONTH(m)}`, 8_200),
    exp(addDays(monthStart(m), 4), 'SOFTWARE', 'SEO tools subscription', `SEO tools: ${MONTH(m)}`, 9_900),
  ]),
  exp(day(-21), 'PRODUCTION', 'Lensworks Studio', 'Product shoot: 12 dishes for December posts', 24_000, 'p1'),
  exp(day(-35), 'FREELANCER', 'Freelance frontend developer', 'Website build: menu and store locator pages', 45_000, 'p2', 0),
  exp(day(-12), 'SOFTWARE', 'Stock photo licences', 'Clinic stock photos for ads (10 images)', 3_500, 'p4'),
  exp(day(-26), 'TRAVEL', 'Rail and hotel', 'Store launch shoot trip: Nagpur', 12_600, 's2', 600),
  exp(day(-9), 'PRODUCTION', 'Print partner, Pune', 'Signage proofs for 4 stores', 18_400, 's31'),
  exp(day(-48), 'MEDIA', 'Local creators (3)', 'Diwali reels for Sunrise stores', 60_000),
];

/** Cost per hour by person (salary + overheads ÷ hours). BACKEND: SUPER_ADMIN only, never in any other response. */
export const costRates: Record<string, number> = {
  'u-mgr': 900,
  'u-emp': 450,
  'u-rahul': 500,
  'u-meera': 480,
  'u-vikram': 550,
  'u-aarav': 400,
  'u-new': 380,
};

/** Bulk exports are admin-only and logged (CLAUDE.md section 14). */
export const exportLog: ExportLogItem[] = [
  { id: 'xl1', at: ago(24 * 16), by: 'Rohan Mehta', kind: 'invoices', from: monthStart(-1), to: addDays(monthStart(0), -1), rows: 7 },
];

/* --------------------------------------------------------- client results */

export interface MetricDef {
  key: string;
  label: string;
  unit: MetricUnit;
  lowerIsBetter?: boolean;
}

/** One template per service. Branding and other one-off services have no monthly numbers. */
export const METRICS: Record<string, MetricDef[]> = {
  'Social media': [
    { key: 'reach', label: 'Reach', unit: 'NUMBER' },
    { key: 'engagement', label: 'Engagement rate', unit: 'PERCENT' },
    { key: 'followers', label: 'New followers', unit: 'NUMBER' },
    { key: 'posts', label: 'Posts published', unit: 'NUMBER' },
  ],
  SEO: [
    { key: 'organic', label: 'Organic visits', unit: 'NUMBER' },
    { key: 'top10', label: 'Keywords in top 10', unit: 'NUMBER' },
    { key: 'calls', label: 'Calls from Google profile', unit: 'NUMBER' },
    { key: 'seoLeads', label: 'Leads from search', unit: 'NUMBER' },
  ],
  'Paid ads': [
    { key: 'spend', label: 'Ad spend', unit: 'INR' },
    { key: 'leads', label: 'Leads', unit: 'NUMBER' },
    { key: 'cpl', label: 'Cost per lead', unit: 'INR', lowerIsBetter: true },
    { key: 'ctr', label: 'Click-through rate', unit: 'PERCENT' },
  ],
  Website: [
    { key: 'visits', label: 'Website visits', unit: 'NUMBER' },
    { key: 'conversion', label: 'Conversion rate', unit: 'PERCENT' },
    { key: 'enquiries', label: 'Enquiries', unit: 'NUMBER' },
    { key: 'load', label: 'Page load time', unit: 'SECONDS', lowerIsBetter: true },
  ],
};

export interface ReportRow {
  organisationId: string;
  month: string;
  status: 'DRAFT' | 'PUBLISHED';
  summary: string;
  sections: Array<{ service: string; highlight?: string; values: Record<string, number | null> }>;
  updatedAt: string;
  updatedBy: string;
  publishedAt?: string;
  publishedBy?: string;
}

const ym = (offset: number) => monthStart(offset).slice(0, 7);
/** Scales a base number per month so trends look real: grows by `g` per month back from -1. */
const series = (base: number, g: number, back: number, round = 0) => {
  const v = base / Math.pow(1 + g, back);
  const f = Math.pow(10, round);
  return Math.round(v * f) / f;
};

function terra(back: number): ReportRow['sections'] {
  return [
    {
      service: 'Social media',
      highlight: back === 0 ? 'Diwali reels drove the best month for reach so far.' : undefined,
      values: { reach: series(184_000, 0.22, back), engagement: series(4.1, 0.08, back, 1), followers: series(2_350, 0.15, back), posts: 16 },
    },
    { service: 'SEO', values: { organic: series(5_820, 0.07, back), top10: series(34, 0.1, back), calls: series(212, 0.05, back), seoLeads: series(41, 0.06, back) } },
    { service: 'Website', values: { visits: series(12_460, 0.09, back), conversion: series(2.4, 0.05, back, 1), enquiries: series(86, -0.04, back), load: series(2.1, -0.06, back, 1) } },
  ];
}
function nova(back: number): ReportRow['sections'] {
  return [
    {
      service: 'Paid ads',
      highlight: back === 0 ? 'Cost per lead fell after moving budget to the Indiranagar clinic.' : undefined,
      values: { spend: 150_000, leads: series(412, 0.12, back), cpl: series(364, -0.1, back), ctr: series(1.9, 0.06, back, 1) },
    },
  ];
}
function sunrise(back: number): ReportRow['sections'] {
  return [
    { service: 'Social media', values: { reach: series(642_000, 0.3, back), engagement: series(3.2, 0.05, back, 1), followers: series(8_900, 0.25, back), posts: series(120, 0.2, back) } },
    { service: 'SEO', values: { organic: series(21_400, 0.18, back), top10: series(118, 0.2, back), calls: series(1_960, 0.22, back), seoLeads: series(310, 0.15, back) } },
    { service: 'Paid ads', values: { spend: 420_000, leads: series(2_140, 0.14, back), cpl: series(196, -0.08, back), ctr: series(2.3, 0.04, back, 1) } },
  ];
}

const SUMMARY: Record<string, string[]> = {
  [ORG.TERRA]: [
    'Strong month: reach up sharply on the Diwali reels and search visits keep climbing. Enquiries dipped slightly while the new menu page was being built; it goes live this month.',
    'Steady growth across social and search. The store locator update helped calls from Google.',
    'First full month with the new content plan. Engagement is improving week on week.',
  ],
  [ORG.NOVA]: [
    'More leads at a lower cost. We moved budget to the best clinic and paused the weakest ad set.',
    'Lead volume up; cost per lead still above target while new creatives were tested.',
    'Campaigns restructured by clinic; first results are encouraging.',
  ],
  [ORG.SUNRISE]: [
    'Six new stores launched with local campaigns. Footfall ads in Pune and Nagpur gave the lowest cost per lead.',
    'Store launches on track; social reach growing with each city.',
    'Programme kick-off: first four cities live.',
  ],
};

export const reports: ReportRow[] = [
  ...[1, 2, 3].flatMap((back) => {
    const month = ym(-back);
    const at = ago(24 * (30 * (back - 1) + 12));
    const row = (organisationId: string, sections: ReportRow['sections'], status: ReportRow['status'] = 'PUBLISHED'): ReportRow => ({
      organisationId,
      month,
      status,
      summary: SUMMARY[organisationId][back - 1],
      sections,
      updatedAt: at,
      updatedBy: 'Kavya Iyer',
      publishedAt: status === 'PUBLISHED' ? at : undefined,
      publishedBy: status === 'PUBLISHED' ? 'Kavya Iyer' : undefined,
    });
    // Nova's latest month is still a draft: the client sees the month before.
    return [row(ORG.TERRA, terra(back - 1)), row(ORG.NOVA, nova(back - 1), back === 1 ? 'DRAFT' : 'PUBLISHED'), row(ORG.SUNRISE, sunrise(back - 1))];
  }),
];
// Nova's draft is missing one number, so it cannot be published until someone fills it in (automation rule 11).
reports.find((r) => r.organisationId === ORG.NOVA && r.status === 'DRAFT')!.sections[0].values.ctr = null;

/** Week 7: a paid partner invoice becomes an expense charged to the brief's project. Returns the expense id. */
export function expenseFromPartner(e: { vendor: string; description: string; amount: number; gst: number; projectId: string; recordedBy: string }): string {
  const row: ExpenseRow = { id: `ex${Date.now().toString(36)}`, date: day(0), category: 'FREELANCER', ...e };
  expenses.push(row);
  return row.id;
}
