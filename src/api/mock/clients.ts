/**
 * Admin: clients (GET/POST /clients, GET/PATCH /clients/{id}, POST /clients/{id}/notes).
 *
 * A client is an organisation of kind CLIENT plus a profile row (industry, GSTIN,
 * account manager, contracts, history). Contacts are that organisation's user accounts.
 * Comments starting with "BACKEND:" are rules the Spring Boot service must enforce.
 */
import type {
  ClientContact,
  ClientContract,
  ClientDetail,
  ClientHistoryItem,
  ClientListItem,
  ClientPatch,
  ClientQuery,
  ClientStatus,
  Health,
  HealthFactor,
  NewClient,
  User,
} from '@/types';
import { sendInvite, validateNew } from './accounts';
import { ago, approvals, CLIENT_NAME, day, invoices, nameOf, ORG, organisations, projects, tasks, userById, users } from './data';
import type { UserRow } from './data';
import { badRequest, conflict, forbidden, isAdminArea, isStaff, notFound, permissionsOf, toListItem } from './handlers';

/* -------------------------------------------------------------- seed data */

export interface ClientRow {
  organisationId: string;
  legalName: string;
  industry: string;
  city: string;
  address: string;
  gstin?: string;
  website?: string;
  status: ClientStatus;
  clientSince: string;
  accountManagerId: string;
  backupManagerId?: string;
  /** Average milestone rating, 1–5 (Phase 2: from the one-tap rating). */
  satisfaction?: number;
  /** Everything paid so far (Phase 1: sum of payments). */
  lifetimeValue: number;
  contracts: ClientContract[];
  history: ClientHistoryItem[];
}

const contract = (id: string, title: string, kind: ClientContract['kind'], start: number, end: number, value: number, revisions = 3): ClientContract => ({
  id,
  title,
  kind,
  startDate: day(start),
  endDate: day(end),
  value,
  revisionsPerDeliverable: revisions,
  status: 'ACTIVE', // recomputed from the dates on read
});
const ev = (id: string, hoursAgo: number, actor: string, kind: ClientHistoryItem['kind'], text: string): ClientHistoryItem => ({
  id,
  at: ago(hoursAgo),
  actor,
  kind,
  text,
});

export const clientRows: ClientRow[] = [
  {
    organisationId: ORG.TERRA,
    legalName: 'Terra Foods Private Limited',
    industry: 'Food and beverage',
    city: 'Mumbai',
    address: '4th floor, Kamala Mills, Lower Parel, Mumbai 400013',
    gstin: '27AAECT4821K1Z3',
    website: 'terrafoods.in',
    status: 'ACTIVE',
    clientSince: day(-420),
    accountManagerId: 'u-mgr',
    backupManagerId: 'u-emp',
    satisfaction: 4.6,
    lifetimeValue: 1_062_000,
    contracts: [
      contract('ct-terra-1', 'Social media retainer', 'RETAINER', -75, 290, 50_000),
      contract('ct-terra-2', 'Website redesign', 'PROJECT', -40, 25, 240_000, 3),
      contract('ct-terra-0', 'Brand refresh', 'PROJECT', -420, -300, 180_000, 2),
    ],
    history: [
      ev('h-t1', 24 * 420, 'Rohan Mehta', 'CREATED', 'Client created from won deal "Terra brand refresh"'),
      ev('h-t2', 24 * 300, 'Kavya Iyer', 'PROJECT', 'Brand refresh delivered and closed'),
      ev('h-t3', 24 * 75, 'Rohan Mehta', 'CONTRACT', 'Signed social media retainer, ₹50,000 a month for 12 months'),
      ev('h-t4', 24 * 40, 'Rohan Mehta', 'CONTRACT', 'Signed website redesign, ₹2,40,000'),
      ev('h-t5', 24 * 9, 'Kavya Iyer', 'NOTE', 'Quarterly call: Arjun wants more reels in December. Upsell paid ads in January.'),
    ],
  },
  {
    organisationId: ORG.NOVA,
    legalName: 'Nova Skin & Hair Clinics LLP',
    industry: 'Healthcare',
    city: 'Bengaluru',
    address: '12, 80 Feet Road, Indiranagar, Bengaluru 560038',
    gstin: '29AAKFN7310P1Z8',
    website: 'novaclinics.in',
    status: 'ACTIVE',
    clientSince: day(-210),
    accountManagerId: 'u-mgr',
    backupManagerId: 'u-meera',
    satisfaction: 3.2,
    lifetimeValue: 412_000,
    contracts: [
      contract('ct-nova-1', 'Lead generation retainer', 'RETAINER', -150, 20, 70_000),
      contract('ct-nova-2', 'Logo and identity', 'PROJECT', -210, -120, 95_000),
    ],
    history: [
      ev('h-n1', 24 * 210, 'Rohan Mehta', 'CREATED', 'Client created from a referral by Terra Foods'),
      ev('h-n2', 24 * 150, 'Rohan Mehta', 'CONTRACT', 'Signed lead generation retainer, ₹70,000 a month'),
      ev('h-n3', 24 * 17, 'System', 'INVOICE', 'Invoice WEB/2026-27/0098 is overdue'),
      ev('h-n4', 24 * 3, 'Kavya Iyer', 'NOTE', 'Sameer unhappy with hero banner rounds. Offered a call with the designer.'),
    ],
  },
  {
    organisationId: ORG.SUNRISE,
    legalName: 'Sunrise Retail Group Private Limited',
    industry: 'Retail',
    city: 'Pune',
    address: 'Sunrise House, Baner Road, Pune 411045',
    gstin: '27AAHCS5512Q1Z1',
    website: 'sunriseretail.in',
    status: 'ACTIVE',
    clientSince: day(-110),
    accountManagerId: 'u-rahul',
    backupManagerId: 'u-mgr',
    satisfaction: 4.1,
    lifetimeValue: 1_840_000,
    contracts: [contract('ct-sun-1', 'Store launch programme (10 cities)', 'RETAINER', -110, 255, 240_000, 2)],
    history: [
      ev('h-s1', 24 * 110, 'Isha Mehta', 'CREATED', 'Client created; 40 store projects set up from templates'),
      ev('h-s2', 24 * 110, 'Isha Mehta', 'CONTRACT', 'Signed store launch programme, ₹2,40,000 a month'),
    ],
  },
  {
    organisationId: ORG.BLUEPEAK,
    legalName: 'Bluepeak Fitness Studios',
    industry: 'Fitness',
    city: 'Hyderabad',
    address: 'Road No. 36, Jubilee Hills, Hyderabad 500033',
    website: 'bluepeakfit.in',
    status: 'ENDED',
    clientSince: day(-600),
    accountManagerId: 'u-meera',
    satisfaction: 3.8,
    lifetimeValue: 640_000,
    contracts: [contract('ct-blue-1', 'Social media retainer', 'RETAINER', -600, -60, 40_000)],
    history: [
      ev('h-b1', 24 * 600, 'Rohan Mehta', 'CREATED', 'Client created'),
      ev('h-b2', 24 * 60, 'Rohan Mehta', 'STATUS', 'Contract ended; client chose not to renew (moved in-house)'),
    ],
  },
];

/* ------------------------------------------------------------------ rules */

// BACKEND: the clients module is admin area only (Super Admin and Manager).
// Phase 1: a manager sees only clients of their teams; in the demo Kavya manages every team.
function requireAdminArea(user: User) {
  if (!isAdminArea(user)) throw forbidden('Only Super Admins and Managers can open client records.');
}

function findRow(id: string): ClientRow {
  const row = clientRows.find((c) => c.organisationId === id);
  if (!row) throw notFound('Client');
  return row;
}

const DAY_MS = 86_400_000;
const daysSince = (iso: string) => Math.floor((Date.now() - Date.parse(iso)) / DAY_MS);
const today = () => day(0);

function contractStatus(c: ClientContract): ClientContract['status'] {
  if (c.endDate < today()) return 'ENDED';
  if (c.endDate <= day(30)) return 'ENDING_SOON'; // automation rule 15: renewal 30 days before the end
  return 'ACTIVE';
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * BACKEND: the client health rule (CLAUDE.md, section 4.5), the same rule as project health:
 *   amber = any task overdue, or an approval waiting more than 5 days;
 *   red   = a milestone missed, an invoice 15+ days late, or satisfaction 2 or lower.
 * The score (100 minus penalties) only ranks clients; the level always follows the rule.
 * Only live work counts: active projects, pending approvals, unpaid invoices.
 */
export function healthOf(row: ClientRow): { health: Health; score: number; factors: HealthFactor[] } {
  const orgId = row.organisationId;
  const live = projects.filter((p) => p.organisationId === orgId && p.status === 'ACTIVE');
  const liveIds = new Set(live.map((p) => p.id));
  const now = today();

  const overdueTasks = tasks.filter((t) => liveIds.has(t.projectId) && t.status !== 'DONE' && t.due < now).length;
  const slowApprovals = approvals.filter(
    (a) => a.organisationId === orgId && a.status === 'PENDING' && daysSince(a.versions[a.versions.length - 1].submittedAt) > 5,
  ).length;
  const missed = live.flatMap((p) => p.milestones.filter((m) => !m.completedAt && m.due < now)).length;
  const unpaid = invoices.filter((i) => i.organisationId === orgId && (i.status === 'OVERDUE' || (i.status === 'SENT' && i.due < now)));
  const worstLate = unpaid.reduce((n, i) => Math.max(n, -Math.round((Date.parse(i.due) - Date.parse(now)) / DAY_MS)), 0);
  const sat = row.satisfaction;

  const factors: HealthFactor[] = [
    overdueTasks
      ? { key: 'OVERDUE_TASKS', label: 'Overdue tasks', level: 'AMBER', detail: `${plural(overdueTasks, 'task')} past due on live projects`, penalty: Math.min(20, overdueTasks * 5) }
      : { key: 'OVERDUE_TASKS', label: 'Overdue tasks', level: 'OK', detail: 'Nothing overdue', penalty: 0 },
    slowApprovals
      ? { key: 'SLOW_APPROVALS', label: 'Approvals waiting', level: 'AMBER', detail: `${plural(slowApprovals, 'approval')} waiting more than 5 days`, penalty: Math.min(20, slowApprovals * 10) }
      : { key: 'SLOW_APPROVALS', label: 'Approvals waiting', level: 'OK', detail: 'None waiting more than 5 days', penalty: 0 },
    missed
      ? { key: 'MISSED_MILESTONES', label: 'Milestones', level: 'RED', detail: `${plural(missed, 'milestone')} missed`, penalty: Math.min(30, missed * 15) }
      : { key: 'MISSED_MILESTONES', label: 'Milestones', level: 'OK', detail: 'All on time', penalty: 0 },
    worstLate >= 15
      ? { key: 'LATE_INVOICE', label: 'Payments', level: 'RED', detail: `Invoice ${worstLate} days late`, penalty: 25 }
      : worstLate > 0
        ? { key: 'LATE_INVOICE', label: 'Payments', level: 'OK', detail: `Invoice ${worstLate} days late (red at 15)`, penalty: 5 }
        : { key: 'LATE_INVOICE', label: 'Payments', level: 'OK', detail: 'Nothing overdue', penalty: 0 },
    sat === undefined
      ? { key: 'SATISFACTION', label: 'Satisfaction', level: 'OK', detail: 'No ratings yet', penalty: 0 }
      : sat <= 2
        ? { key: 'SATISFACTION', label: 'Satisfaction', level: 'RED', detail: `${sat.toFixed(1)} / 5`, penalty: 25 }
        : { key: 'SATISFACTION', label: 'Satisfaction', level: 'OK', detail: `${sat.toFixed(1)} / 5`, penalty: sat < 3.5 ? 10 : 0 },
  ];
  const health: Health = factors.some((f) => f.level === 'RED') ? 'RED' : factors.some((f) => f.level === 'AMBER') ? 'AMBER' : 'GREEN';
  const score = Math.max(0, 100 - factors.reduce((s, f) => s + f.penalty, 0));
  return { health, score, factors };
}

function toItem(row: ClientRow): ClientListItem {
  const orgId = row.organisationId;
  const own = projects.filter((p) => p.organisationId === orgId);
  const contracts = row.contracts.map((c) => ({ ...c, status: contractStatus(c) }));
  const running = contracts.filter((c) => c.status !== 'ENDED');
  const { health, score } = healthOf(row);
  return {
    id: orgId,
    name: CLIENT_NAME[orgId] ?? orgId,
    industry: row.industry,
    city: row.city,
    status: row.status,
    clientSince: row.clientSince,
    accountManager: { id: row.accountManagerId, name: nameOf(row.accountManagerId) },
    activeProjects: own.filter((p) => p.status === 'ACTIVE').length,
    totalProjects: own.length,
    services: [...new Set(own.filter((p) => p.status !== 'COMPLETED').map((p) => p.service))].sort(),
    health,
    healthScore: score,
    monthlyRetainer: running.filter((c) => c.kind === 'RETAINER').reduce((s, c) => s + c.value, 0),
    outstanding: invoices.filter((i) => i.organisationId === orgId && i.status !== 'PAID' && i.status !== 'CANCELLED').reduce((s, i) => s + i.amount, 0),
    renewalDue: running.map((c) => c.endDate).sort()[0],
  };
}

const HEALTH_ORDER: Record<Health, number> = { RED: 0, AMBER: 1, GREEN: 2 };
const STATUS_ORDER: Record<ClientStatus, number> = { ONBOARDING: 0, ACTIVE: 0, PAUSED: 1, ENDED: 2 };

/* -------------------------------------------------------------- endpoints */

/** GET /clients */
export function listClients(user: User, q: ClientQuery = {}): ClientListItem[] {
  requireAdminArea(user);
  const needle = q.q?.trim().toLowerCase();
  return clientRows
    .map(toItem)
    .filter(
      (c) =>
        (!q.status || c.status === q.status) &&
        (!q.health || c.health === q.health) &&
        (!q.accountManagerId || c.accountManager.id === q.accountManagerId) &&
        (!needle || `${c.name} ${c.industry} ${c.city} ${c.accountManager.name}`.toLowerCase().includes(needle)),
    )
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health] ||
        a.healthScore - b.healthScore ||
        a.name.localeCompare(b.name),
    );
}

function approvalDays(orgId: string): number | undefined {
  const spans = approvals
    .filter((a) => a.organisationId === orgId)
    .flatMap((a) => a.versions.filter((v) => v.decision).map((v) => (Date.parse(v.decision!.at) - Date.parse(v.submittedAt)) / DAY_MS));
  return spans.length ? Math.round((spans.reduce((s, n) => s + n, 0) / spans.length) * 10) / 10 : undefined;
}

const toContact = (u: UserRow): ClientContact => ({
  id: u.id,
  name: u.name,
  title: u.title,
  email: u.email,
  role: u.role as ClientContact['role'],
  status: u.status,
  lastLoginAt: u.lastLoginAt,
  canSeeBilling: permissionsOf(u).includes('BILLING_VIEW'),
});

/** GET /clients/{id} */
export function getClient(user: User, id: string): ClientDetail {
  requireAdminArea(user);
  const row = findRow(id);
  const { factors } = healthOf(row);
  const own = projects.filter((p) => p.organisationId === id);
  const ROLE_ORDER = { CLIENT_OWNER: 0, CLIENT_REP: 1 } as Record<string, number>;
  const contracts = row.contracts.map((c) => ({ ...c, status: contractStatus(c) }));
  const STATUS_ORDER_C = { ENDING_SOON: 0, ACTIVE: 1, ENDED: 2 };

  // History: the stored events plus what other modules already know (projects started, unpaid invoices).
  const derived: ClientHistoryItem[] = [
    ...own
      .filter((p) => p.startDate >= day(-120))
      .slice(0, 6)
      .map((p) => ({ id: `h-p-${p.id}`, at: `${p.startDate}T04:30:00.000Z`, actor: nameOf(p.ownerId), kind: 'PROJECT' as const, text: `Project started: ${p.name}` })),
    ...approvals
      .filter((a) => a.organisationId === id && a.status === 'APPROVED')
      .map((a) => {
        const v = a.versions[a.versions.length - 1];
        return { id: `h-a-${a.id}`, at: v.decision!.at, actor: v.decision!.byName, kind: 'APPROVAL' as const, text: `Approved "${a.title}" (v${v.number})` };
      }),
  ];

  const detail: ClientDetail = {
    ...toItem(row),
    legalName: row.legalName,
    gstin: row.gstin,
    website: row.website,
    address: row.address,
    backupManager: row.backupManagerId ? { id: row.backupManagerId, name: nameOf(row.backupManagerId) } : undefined,
    satisfaction: row.satisfaction,
    approvalDays: approvalDays(id),
    healthFactors: factors,
    contacts: users
      .filter((u) => u.organisationId === id)
      .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name))
      .map(toContact),
    contracts: contracts.sort((a, b) => STATUS_ORDER_C[a.status] - STATUS_ORDER_C[b.status] || b.startDate.localeCompare(a.startDate)),
    projects: own.map((p) => toListItem(user, p)).sort((a, b) => HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health] || a.name.localeCompare(b.name)),
    // Newest first; events in the same millisecond keep the order they happened in (latest first).
    history: [...row.history, ...derived]
      .map((h, i) => ({ h, i }))
      .sort((a, b) => b.h.at.localeCompare(a.h.at) || b.i - a.i)
      .map(({ h }) => h),
  };
  // BACKEND: money totals beyond outstanding/retainer are finance data, SUPER_ADMIN only (managers: "view team" invoices).
  if (user.role === 'SUPER_ADMIN') detail.lifetimeValue = row.lifetimeValue;
  return detail;
}

// BACKEND: account managers are active agency staff (Super Admin, Manager or Employee).
function requireManagerCandidate(id: string, what: string) {
  const u = userById(id);
  if (!u || !isStaff(u) || u.status !== 'ACTIVE') throw badRequest(`Choose an active Webinger team member as ${what}.`);
}

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
function checkGstin(g?: string) {
  if (g && !GSTIN_RE.test(g)) throw badRequest('GSTIN should be 15 characters, like 27AAECT4821K1Z3.');
}

/**
 * POST /clients
 * BACKEND: SUPER_ADMIN only, because it issues a login (admin issues every login).
 * Creates the organisation, the profile and the owner's account in one transaction,
 * then emails the owner an invite (7 days). Duplicate company names are refused.
 * Phase 2: a won deal in the pipeline calls the same service.
 */
export function createClient(user: User, input: NewClient): ClientDetail {
  if (user.role !== 'SUPER_ADMIN') throw forbidden('Only a Super Admin can add a client, because it sends a login invite.');
  const name = input.name?.trim() ?? '';
  if (name.length < 2) throw badRequest('Enter the company name.');
  if (!input.industry?.trim()) throw badRequest('Enter the industry.');
  if (!input.city?.trim()) throw badRequest('Enter the city.');
  const gstin = input.gstin?.trim().toUpperCase() || undefined;
  checkGstin(gstin);
  if (organisations.some((o) => o.name.toLowerCase() === name.toLowerCase())) throw conflict('A client with this name already exists.');
  requireManagerCandidate(input.accountManagerId, 'account manager');
  validateNew(input.owner?.name ?? '', input.owner?.email ?? '');

  const id = `org-${Date.now().toString(36)}`;
  organisations.push({ id, name, kind: 'CLIENT' });
  CLIENT_NAME[id] = name;
  const owner: UserRow = {
    id: `u-${Date.now().toString(36)}`,
    name: input.owner.name.trim(),
    email: input.owner.email.trim().toLowerCase(),
    role: 'CLIENT_OWNER',
    organisationId: id,
    organisationName: name,
    title: input.owner.title?.trim() || undefined,
    status: 'INVITED',
    mfaEnabled: false,
    createdAt: new Date().toISOString(),
    invitedBy: user.name,
  };
  users.push(owner);
  clientRows.push({
    organisationId: id,
    legalName: input.legalName?.trim() || name,
    industry: input.industry.trim(),
    city: input.city.trim(),
    address: '',
    gstin,
    website: input.website?.trim() || undefined,
    status: 'ONBOARDING',
    clientSince: day(0),
    accountManagerId: input.accountManagerId,
    lifetimeValue: 0,
    contracts: [],
    history: [
      { id: `h-${Date.now().toString(36)}`, at: new Date().toISOString(), actor: user.name, kind: 'CREATED', text: `Client created; invite sent to ${owner.name} (${owner.email})` },
    ],
  });
  sendInvite(owner, user.name);
  return getClient(user, id);
}

const STATUS_LABEL: Record<ClientStatus, string> = { ONBOARDING: 'Onboarding', ACTIVE: 'Active', PAUSED: 'Paused', ENDED: 'Ended' };

/** PATCH /clients/{id}. Every change is written to the client's history. */
export function updateClient(user: User, id: string, patch: ClientPatch): ClientDetail {
  requireAdminArea(user);
  const row = findRow(id);
  const changes: string[] = [];

  if (patch.status !== undefined && patch.status !== row.status) {
    // BACKEND: pausing or ending a client is a money decision, so only a Super Admin makes it.
    if (user.role !== 'SUPER_ADMIN') throw forbidden('Only a Super Admin can pause, end or reactivate a client.');
    if (!STATUS_LABEL[patch.status]) throw badRequest('Unknown status.');
  }
  if (patch.accountManagerId !== undefined) requireManagerCandidate(patch.accountManagerId, 'account manager');
  if (patch.backupManagerId) requireManagerCandidate(patch.backupManagerId, 'backup');
  const nextAm = patch.accountManagerId ?? row.accountManagerId;
  const nextBackup = patch.backupManagerId === undefined ? row.backupManagerId : patch.backupManagerId || undefined;
  if (nextBackup && nextBackup === nextAm) throw badRequest('The backup must be a different person from the account manager.');
  const gstin = patch.gstin === undefined ? undefined : patch.gstin.trim().toUpperCase();
  if (gstin) checkGstin(gstin);
  for (const k of ['industry', 'city'] as const) {
    if (patch[k] !== undefined && !patch[k]!.trim()) throw badRequest(`${k === 'city' ? 'City' : 'Industry'} cannot be empty.`);
  }

  if (patch.status !== undefined && patch.status !== row.status) {
    row.history.push({ id: `h-${Date.now().toString(36)}s`, at: new Date().toISOString(), actor: user.name, kind: 'STATUS', text: `Status changed from ${STATUS_LABEL[row.status]} to ${STATUS_LABEL[patch.status]}` });
    row.status = patch.status;
  }
  if (nextAm !== row.accountManagerId) {
    changes.push(`account manager ${nameOf(row.accountManagerId)} → ${nameOf(nextAm)}`);
    row.accountManagerId = nextAm;
  }
  if (nextBackup !== row.backupManagerId) {
    changes.push(`backup ${row.backupManagerId ? nameOf(row.backupManagerId) : 'none'} → ${nextBackup ? nameOf(nextBackup) : 'none'}`);
    row.backupManagerId = nextBackup;
  }
  if (gstin !== undefined && gstin !== (row.gstin ?? '')) {
    changes.push('GSTIN');
    row.gstin = gstin || undefined;
  }
  for (const k of ['industry', 'city', 'address', 'website'] as const) {
    const v = patch[k]?.trim();
    if (v !== undefined && v !== (row[k] ?? '')) {
      changes.push(k);
      if (k === 'website') row.website = v || undefined;
      else row[k] = v;
    }
  }
  if (changes.length) {
    row.history.push({ id: `h-${Date.now().toString(36)}c`, at: new Date().toISOString(), actor: user.name, kind: 'CHANGE', text: `Updated ${changes.join(', ')}` });
  }
  return getClient(user, id);
}

/** POST /clients/{id}/notes. Internal: clients never see their own record. */
export function addClientNote(user: User, id: string, text: string): ClientDetail {
  requireAdminArea(user);
  const row = findRow(id);
  const t = text?.trim() ?? '';
  if (t.length < 2) throw badRequest('Write a note first.');
  if (t.length > 2000) throw badRequest('Keep notes under 2,000 characters.');
  row.history.push({ id: `h-${Date.now().toString(36)}n`, at: new Date().toISOString(), actor: user.name, kind: 'NOTE', text: t });
  return getClient(user, id);
}

/** Used by the client dashboard: the account manager card follows the client record. */
export function accountManagerOf(orgId: string) {
  const row = clientRows.find((c) => c.organisationId === orgId);
  return row ? userById(row.accountManagerId) : undefined;
}

/** For the account-manager pickers: active agency staff. */
export function staffChoices(user: User) {
  requireAdminArea(user);
  return users
    .filter((u) => isStaff(u) && u.status === 'ACTIVE')
    .map((u) => ({ id: u.id, name: u.name, title: u.title }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
