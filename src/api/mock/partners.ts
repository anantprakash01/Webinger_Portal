/**
 * Mock partner portal and PR hub (Week 7).
 *
 * Partners (vendors, freelancers) see only briefs shared with their organisation and their own invoices.
 * The PR hub (media contacts, pitches, coverage, vendors) is internal: staff read, admin area writes,
 * bulk export Super Admin only and logged (CLAUDE.md 4.4 and section 14).
 * Comments starting with "BACKEND:" are rules the Spring Boot service must enforce.
 */
import type {
  BriefStatus,
  Coverage,
  ExportFile,
  MediaContact,
  NewBrief,
  NewMediaContact,
  NewPartnerInvoice,
  PartnerBrief,
  PartnerDashboard,
  PartnerInvoice,
  Pitch,
  PitchStatus,
  PrHub,
  User,
  Vendor,
} from '@/types';
import { sendEmail } from './accounts';
import { CLIENT_NAME, day, nameOf, organisations, projects } from './data';
import { expenseFromPartner, exportLog } from './data5';
import { briefs, coverage, mediaContacts, partnerInvoices, pitches, vendors } from './data7';
import type { BriefRow, MediaContactRow, PartnerInvoiceRow } from './data7';
import { badRequest, conflict, forbidden, isAdminArea, isStaff, notFound } from './handlers';

const today = () => day(0);
const nowIso = () => new Date().toISOString();
const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function requirePartner(user: User) {
  if (user.role !== 'PARTNER') throw forbidden('This is for partners.');
}
function requireAdminArea(user: User) {
  if (!isAdminArea(user)) throw forbidden('Only Super Admins and Managers can do this.');
}
// BACKEND: PR and data hub: Full for admin area, Read (no export) for employees, None for everyone else.
function requireStaffRead(user: User) {
  if (!isStaff(user)) throw forbidden('The PR hub is internal.');
}

const partnerName = (orgId: string) => organisations.find((o) => o.id === orgId)?.name ?? orgId;

/* ---------------------------------------------------------------- briefs */

function toBrief(b: BriefRow): PartnerBrief {
  const p = projects.find((x) => x.id === b.projectId);
  const inv = partnerInvoices.find((i) => i.briefId === b.id && i.status !== 'REJECTED');
  return {
    id: b.id,
    partnerId: b.partnerOrgId,
    partnerName: partnerName(b.partnerOrgId),
    title: b.title,
    description: b.description,
    projectName: p?.name ?? '',
    clientName: p ? CLIENT_NAME[p.organisationId] ?? '' : '',
    due: b.due,
    fee: b.fee,
    status: b.status,
    submissions: [...b.submissions].reverse(),
    feedback: b.feedback,
    invoiceId: inv?.id,
  };
}

/** GET /partner/briefs: only briefs shared with the caller's organisation. */
export function myBriefs(user: User): PartnerBrief[] {
  requirePartner(user);
  const ORDER: Record<BriefStatus, number> = { CHANGES_REQUESTED: 0, NEW: 1, IN_PROGRESS: 2, SUBMITTED: 3, APPROVED: 4 };
  return briefs
    .filter((b) => b.partnerOrgId === user.organisationId)
    .map(toBrief)
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.due.localeCompare(b.due));
}

function ownBrief(user: User, id: string) {
  const b = briefs.find((x) => x.id === id);
  // BACKEND: another partner's brief is "not found".
  if (!b || b.partnerOrgId !== user.organisationId) throw notFound('Brief');
  return b;
}

/** POST /partner/briefs/{id}/start */
export function startBrief(user: User, id: string): PartnerBrief {
  requirePartner(user);
  const b = ownBrief(user, id);
  if (b.status !== 'NEW') throw conflict('Already started.');
  b.status = 'IN_PROGRESS';
  return toBrief(b);
}

/** POST /partner/briefs/{id}/submit { files, note } */
export function submitBrief(user: User, id: string, input: { files: string[]; note: string }): PartnerBrief {
  requirePartner(user);
  const b = ownBrief(user, id);
  if (b.status !== 'IN_PROGRESS' && b.status !== 'CHANGES_REQUESTED' && b.status !== 'NEW') throw conflict(b.status === 'SUBMITTED' ? 'Waiting for review.' : 'This brief is closed.');
  const files = (input.files ?? []).map((f) => f.trim()).filter(Boolean);
  if (!files.length || files.length > 10) throw badRequest('Attach one to ten files.');
  if (files.some((f) => !/\.(jpe?g|png|pdf|zip|mp4|mov)$/i.test(f))) throw badRequest('Files: JPG, PNG, PDF, ZIP, MP4 or MOV.');
  b.submissions.push({ id: uid('sb'), at: nowIso(), files, note: input.note?.trim() ?? '' });
  b.status = 'SUBMITTED';
  sendEmail('manager@webinger.in', `${user.organisationName} submitted "${b.title}"`, input.note ?? '', '/admin/pr?tab=vendors');
  return toBrief(b);
}

/** GET /partner-briefs (admin) */
export function listBriefs(user: User): PartnerBrief[] {
  requireAdminArea(user);
  return briefs.map(toBrief).sort((a, b) => Number(b.status === 'SUBMITTED') - Number(a.status === 'SUBMITTED') || a.due.localeCompare(b.due));
}

/** POST /partner-briefs: share a brief with a partner. Only project and client names leave the agency. */
export function createBrief(user: User, input: NewBrief): PartnerBrief {
  requireAdminArea(user);
  if (!organisations.some((o) => o.id === input.partnerId && o.kind === 'PARTNER')) throw badRequest('Choose a partner with a portal login.');
  if (!projects.some((p) => p.id === input.projectId)) throw badRequest('Choose the project.');
  if ((input.title?.trim() ?? '').length < 3) throw badRequest('Give the brief a title.');
  if ((input.description?.trim() ?? '').length < 20) throw badRequest('Describe the work (a few sentences).');
  if (!DATE_RE.test(input.due ?? '') || input.due < today()) throw badRequest('Due date from today.');
  if (!(Number(input.fee) > 0)) throw badRequest('Agree a fee first.');
  const b: BriefRow = {
    id: uid('b'),
    partnerOrgId: input.partnerId,
    projectId: input.projectId,
    title: input.title.trim(),
    description: input.description.trim(),
    due: input.due,
    fee: Math.round(Number(input.fee)),
    status: 'NEW',
    submissions: [],
    createdBy: user.name,
  };
  briefs.push(b);
  return toBrief(b);
}

/** POST /partner-briefs/{id}/review { decision, feedback } */
export function reviewBrief(user: User, id: string, decision: 'APPROVE' | 'CHANGES', feedback?: string): PartnerBrief {
  requireAdminArea(user);
  const b = briefs.find((x) => x.id === id);
  if (!b) throw notFound('Brief');
  if (b.status !== 'SUBMITTED') throw conflict('Nothing submitted to review.');
  if (decision === 'CHANGES' && (feedback?.trim() ?? '').length < 5) throw badRequest('Say what to change.');
  b.status = decision === 'APPROVE' ? 'APPROVED' : 'CHANGES_REQUESTED';
  b.feedback = feedback?.trim() || undefined;
  return toBrief(b);
}

/* -------------------------------------------------------------- invoices */

function toInvoice(i: PartnerInvoiceRow): PartnerInvoice {
  return {
    id: i.id,
    partnerId: i.partnerOrgId,
    partnerName: partnerName(i.partnerOrgId),
    number: i.number,
    briefId: i.briefId,
    briefTitle: briefs.find((b) => b.id === i.briefId)?.title ?? '',
    amount: i.amount,
    gst: i.gst,
    total: i.amount + i.gst,
    status: i.status,
    submittedAt: i.submittedAt,
    decidedBy: i.decidedBy,
    rejectReason: i.rejectReason,
    paidAt: i.paidAt,
  };
}

/** GET /partner/invoices */
export function myInvoices(user: User): PartnerInvoice[] {
  requirePartner(user);
  return partnerInvoices.filter((i) => i.partnerOrgId === user.organisationId).map(toInvoice).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

/**
 * POST /partner/invoices: bill an approved brief.
 * BACKEND: one open invoice per brief; amount up to the agreed fee; GST up to 18%; invoice number unique per partner.
 */
export function submitInvoice(user: User, input: NewPartnerInvoice): PartnerInvoice {
  requirePartner(user);
  const b = ownBrief(user, input.briefId);
  if (b.status !== 'APPROVED') throw conflict('Invoice once the work is approved.');
  if (partnerInvoices.some((i) => i.briefId === b.id && i.status !== 'REJECTED')) throw conflict('This brief is already invoiced.');
  const number = input.number?.trim() ?? '';
  if (number.length < 2 || number.length > 30) throw badRequest('Enter your invoice number.');
  if (partnerInvoices.some((i) => i.partnerOrgId === user.organisationId && i.number.toLowerCase() === number.toLowerCase())) throw conflict('You have already used this invoice number.');
  const amount = Math.round(Number(input.amount) * 100) / 100;
  const gst = Math.round(Number(input.gst ?? 0) * 100) / 100;
  if (!(amount > 0)) throw badRequest('Enter the amount before GST.');
  if (amount > b.fee) throw badRequest(`The agreed fee is ₹${b.fee.toLocaleString('en-IN')}.`);
  if (!(gst >= 0) || gst > Math.ceil(amount * 0.18)) throw badRequest('GST is at most 18% of the amount.');
  const row: PartnerInvoiceRow = { id: uid('pi'), partnerOrgId: user.organisationId, number, briefId: b.id, amount, gst, status: 'SUBMITTED', submittedAt: nowIso() };
  partnerInvoices.push(row);
  sendEmail('admin@webinger.in', `Partner invoice ${number} from ${user.organisationName}`, `₹${(amount + gst).toLocaleString('en-IN')} for "${b.title}"`, '/admin/pr?tab=vendors');
  return toInvoice(row);
}

/** GET /partner-invoices (admin) */
export function listPartnerInvoices(user: User): PartnerInvoice[] {
  requireAdminArea(user);
  const ORDER = { SUBMITTED: 0, APPROVED: 1, PAID: 2, REJECTED: 3 };
  return partnerInvoices.map(toInvoice).sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.submittedAt.localeCompare(a.submittedAt));
}

/**
 * POST /partner-invoices/{id}/decision { decision: APPROVE | REJECT | PAID, reason, reference }
 * BACKEND: money decisions are SUPER_ADMIN only (finance). Paid invoices become an expense on the project.
 */
export function decidePartnerInvoice(user: User, id: string, decision: 'APPROVE' | 'REJECT' | 'PAID', note?: string): PartnerInvoice {
  if (user.role !== 'SUPER_ADMIN') throw forbidden('Only a Super Admin approves and pays partner invoices.');
  const i = partnerInvoices.find((x) => x.id === id);
  if (!i) throw notFound('Partner invoice');
  if (decision === 'APPROVE') {
    if (i.status !== 'SUBMITTED') throw conflict('Already decided.');
    i.status = 'APPROVED';
  } else if (decision === 'REJECT') {
    if (i.status !== 'SUBMITTED') throw conflict('Already decided.');
    if ((note?.trim() ?? '').length < 5) throw badRequest('Say why, so they can re-issue it.');
    i.status = 'REJECTED';
    i.rejectReason = note!.trim();
  } else if (decision === 'PAID') {
    if (i.status !== 'APPROVED') throw conflict('Approve it first.');
    if ((note?.trim() ?? '').length < 4) throw badRequest('Enter the UTR or transaction reference.');
    i.status = 'PAID';
    i.paidAt = nowIso();
    const b = briefs.find((x) => x.id === i.briefId)!;
    i.expenseId = expenseFromPartner({ vendor: partnerName(i.partnerOrgId), description: `${b.title} (invoice ${i.number}, ref ${note!.trim()})`, amount: i.amount, gst: i.gst, projectId: b.projectId, recordedBy: user.name });
  } else throw badRequest('Approve, reject or mark paid.');
  i.decidedBy = user.name;
  return toInvoice(i);
}

/** Partner home (Week 1 shape) from real briefs and invoices. */
export function partnerHome(user: User): PartnerDashboard {
  requirePartner(user);
  const STATUS: Record<BriefStatus, PartnerDashboard['briefs'][number]['status']> = {
    NEW: 'NEW',
    IN_PROGRESS: 'IN_PROGRESS',
    CHANGES_REQUESTED: 'IN_PROGRESS',
    SUBMITTED: 'SUBMITTED',
    APPROVED: 'APPROVED',
  };
  const INV = { SUBMITTED: 'SENT', APPROVED: 'SENT', PAID: 'PAID', REJECTED: 'CANCELLED' } as const;
  return {
    briefs: myBriefs(user).map((b) => ({ id: b.id, title: b.title, projectName: b.projectName, due: b.due, status: STATUS[b.status] })),
    invoices: myInvoices(user).map((i) => ({ id: i.id, number: i.number, amount: i.total, status: INV[i.status] })),
  };
}

/* ---------------------------------------------------------------- PR hub */

const STALE_DAYS = 180;
const toContact = (c: MediaContactRow): MediaContact => ({
  id: c.id,
  name: c.name,
  outlet: c.outlet,
  beat: c.beat,
  city: c.city,
  language: c.language,
  email: c.email,
  phone: c.phone,
  ownerName: nameOf(c.ownerId),
  lastContacted: c.lastContacted,
  lastVerified: c.lastVerified,
  stale: c.lastVerified < addDays(today(), -STALE_DAYS),
  consent: c.consent,
  doNotContact: c.doNotContact,
});

const toPitch = (p: (typeof pitches)[number]): Pitch => ({
  id: p.id,
  title: p.title,
  clientId: p.organisationId,
  clientName: CLIENT_NAME[p.organisationId] ?? '',
  recipients: p.recipientIds.map((id) => {
    const c = mediaContacts.find((x) => x.id === id);
    return { id, name: c?.name ?? 'Removed contact', outlet: c?.outlet ?? '' };
  }),
  status: p.status,
  sentAt: p.sentAt,
  followUp: p.followUp,
  ownerName: nameOf(p.ownerId),
});

const toCoverage = (c: (typeof coverage)[number]): Coverage => ({ ...c, clientId: c.organisationId, clientName: CLIENT_NAME[c.organisationId] ?? '' });

const toVendor = (v: (typeof vendors)[number]): Vendor => ({
  id: v.id,
  name: v.name,
  service: v.service,
  city: v.city,
  rateNote: v.rateNote,
  rating: v.ratings.length ? Math.round((v.ratings.reduce((a, b) => a + b, 0) / v.ratings.length) * 10) / 10 : undefined,
  jobsDone: v.organisationId ? briefs.filter((b) => b.partnerOrgId === v.organisationId && b.status === 'APPROVED').length : v.ratings.length,
  hasLogin: !!v.organisationId,
  documents: v.documents,
});

/** GET /pr: media contacts, pitches, coverage and vendors. Staff read (employees too). */
export function prHub(user: User): PrHub {
  requireStaffRead(user);
  return {
    contacts: mediaContacts.map(toContact).sort((a, b) => Number(a.doNotContact) - Number(b.doNotContact) || a.name.localeCompare(b.name)),
    pitches: pitches.map(toPitch).sort((a, b) => (b.sentAt ?? '9').localeCompare(a.sentAt ?? '9')),
    coverage: coverage.map(toCoverage).sort((a, b) => b.date.localeCompare(a.date)),
    vendors: vendors.map(toVendor),
  };
}

/** POST /pr/contacts. BACKEND: duplicate check on email and phone; consent recorded (DPDP Act). */
export function addContact(user: User, input: NewMediaContact): MediaContact {
  requireAdminArea(user);
  for (const k of ['name', 'outlet', 'beat', 'city', 'language'] as const) if ((input[k]?.trim() ?? '').length < 2) throw badRequest(`Enter the ${k}.`);
  const email = input.email?.trim().toLowerCase() ?? '';
  if (!EMAIL_RE.test(email)) throw badRequest('Enter a valid email address.');
  const phone = input.phone?.replace(/\s/g, '') || undefined;
  const dupe = mediaContacts.find((c) => c.email === email || (phone && c.phone?.replace(/\s/g, '') === phone));
  if (dupe) throw conflict(`${dupe.name} (${dupe.outlet}) already has this ${dupe.email === email ? 'email' : 'phone'}.`);
  const row: MediaContactRow = {
    id: uid('mc'),
    name: input.name.trim(),
    outlet: input.outlet.trim(),
    beat: input.beat.trim(),
    city: input.city.trim(),
    language: input.language.trim(),
    email,
    phone: input.phone?.trim() || undefined,
    ownerId: user.id,
    lastVerified: today(),
    consent: !!input.consent,
    doNotContact: false,
  };
  mediaContacts.push(row);
  return toContact(row);
}

/** PATCH /pr/contacts/{id} { verified, doNotContact } */
export function updateContact(user: User, id: string, patch: { verified?: boolean; doNotContact?: boolean; consent?: boolean }): MediaContact {
  requireAdminArea(user);
  const c = mediaContacts.find((x) => x.id === id);
  if (!c) throw notFound('Contact');
  if (patch.verified) c.lastVerified = today();
  if (patch.doNotContact !== undefined) c.doNotContact = patch.doNotContact;
  if (patch.consent !== undefined) c.consent = patch.consent;
  return toContact(c);
}

/** POST /pr/pitches { title, clientId, recipientIds } (draft) */
export function createPitch(user: User, input: { title: string; clientId: string; recipientIds: string[] }): Pitch {
  requireAdminArea(user);
  if ((input.title?.trim() ?? '').length < 5) throw badRequest('Give the story a headline.');
  if (!CLIENT_NAME[input.clientId]) throw badRequest('Choose the client.');
  const ids = [...new Set(input.recipientIds ?? [])];
  if (!ids.length) throw badRequest('Choose at least one journalist.');
  if (ids.some((id) => !mediaContacts.some((c) => c.id === id))) throw badRequest('Unknown contact.');
  const row = { id: uid('pt'), title: input.title.trim(), organisationId: input.clientId, recipientIds: ids, status: 'DRAFT' as PitchStatus, ownerId: user.id };
  pitches.push(row);
  return toPitch(row);
}

/**
 * PATCH /pr/pitches/{id} { status }
 * BACKEND: sending skips nobody silently: it refuses while any recipient has no consent, is do-not-contact,
 * or has not been verified in six months. Sending sets a follow-up in 3 days.
 */
export function updatePitch(user: User, id: string, status: PitchStatus): Pitch {
  requireAdminArea(user);
  const p = pitches.find((x) => x.id === id);
  if (!p) throw notFound('Pitch');
  if (!['DRAFT', 'SENT', 'FOLLOW_UP', 'COVERED', 'DECLINED'].includes(status)) throw badRequest('Unknown status.');
  if (status === 'SENT' && p.status === 'DRAFT') {
    const blocked = p.recipientIds.map((rid) => mediaContacts.find((c) => c.id === rid)!).filter((c) => !c.consent || c.doNotContact || c.lastVerified < addDays(today(), -STALE_DAYS));
    if (blocked.length) throw conflict(`Remove or re-verify before sending: ${blocked.map((c) => `${c.name} (${c.doNotContact ? 'do not contact' : !c.consent ? 'no consent' : 'not verified in 6 months'})`).join(', ')}.`);
    p.sentAt = nowIso();
    p.followUp = addDays(today(), 3);
    for (const rid of p.recipientIds) mediaContacts.find((c) => c.id === rid)!.lastContacted = today();
  } else if (status === 'SENT') throw conflict('Already sent.');
  if (status === 'FOLLOW_UP') p.followUp = addDays(today(), 3);
  p.status = status;
  return toPitch(p);
}

/** POST /pr/coverage: log published coverage (feeds client results). */
export function addCoverage(user: User, input: { clientId: string; outlet: string; headline: string; url: string; date: string; reach: number; pitchId?: string }): Coverage {
  requireAdminArea(user);
  if (!CLIENT_NAME[input.clientId]) throw badRequest('Choose the client.');
  if ((input.outlet?.trim() ?? '').length < 2 || (input.headline?.trim() ?? '').length < 5) throw badRequest('Outlet and headline are needed.');
  if (!/^https?:\/\/\S+\.\S+/.test(input.url ?? '')) throw badRequest('Paste the link to the article.');
  if (!DATE_RE.test(input.date ?? '') || input.date > today()) throw badRequest('Publication date, not in the future.');
  if (coverage.some((c) => c.url === input.url.trim())) throw conflict('This link is already logged.');
  const row = { id: uid('cv'), organisationId: input.clientId, outlet: input.outlet.trim(), headline: input.headline.trim(), url: input.url.trim(), date: input.date, reach: Math.max(0, Math.round(Number(input.reach) || 0)), pitchId: input.pitchId };
  coverage.push(row);
  const pitch = input.pitchId ? pitches.find((p) => p.id === input.pitchId) : undefined;
  if (pitch) pitch.status = 'COVERED';
  return toCoverage(row);
}

/** GET /pr/contacts/export: SUPER_ADMIN only and logged; do-not-contact rows are left out. */
export function exportContacts(user: User): ExportFile {
  if (user.role !== 'SUPER_ADMIN') throw forbidden('Only a Super Admin can export contacts.');
  const rows = [['Name', 'Outlet', 'Beat', 'City', 'Language', 'Email', 'Phone', 'Consent', 'Last verified']];
  for (const c of mediaContacts.filter((x) => !x.doNotContact)) rows.push([c.name, c.outlet, c.beat, c.city, c.language, c.email, c.phone ?? '', c.consent ? 'Yes' : 'No', c.lastVerified]);
  const cell = (v: string) => (/^[=+\-@]/.test(v) ? `'${v}` : v).replace(/"/g, '""');
  const content = rows.map((r) => r.map((v) => `"${cell(String(v))}"`).join(',')).join('\r\n') + '\r\n';
  exportLog.unshift({ id: uid('xl'), at: nowIso(), by: user.name, kind: 'media-contacts', from: today(), to: today(), rows: rows.length - 1 });
  return { fileName: `webinger-media-contacts-${today()}.csv`, content, rows: rows.length - 1 };
}
