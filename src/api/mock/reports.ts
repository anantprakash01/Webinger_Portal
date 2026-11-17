/**
 * Mock client reports API (Week 5): monthly results per service.
 *
 * Staff (admin area) enter numbers per client and month, then publish; clients only ever see
 * published months. Phase 4 fills the same numbers from Google and Meta automatically.
 * Comments starting with "BACKEND:" are rules the Spring Boot service must enforce.
 */
import type { ClientReport, KpiPoint, MetricValue, ReportInput, ReportSection, ReportStatusItem, User } from '@/types';
import { sendEmail } from './accounts';
import { clientRows } from './clients';
import { CLIENT_NAME, day, projects, users } from './data';
import { METRICS, monthName, monthStart, reports } from './data5';
import type { ReportRow } from './data5';
import { badRequest, canSeeProject, forbidden, isAdminArea, isClient, notFound } from './handlers';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const thisMonth = () => day(0).slice(0, 7);
const prevMonth = (m: string) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};

function requireAdmin(user: User) {
  if (!isAdminArea(user)) throw forbidden('Only Super Admins and Managers enter client results.');
}
function requireClientUser(user: User) {
  if (!isClient(user)) throw forbidden('Reports are for client accounts.');
}
function checkMonth(month: string) {
  if (!MONTH_RE.test(month ?? '')) throw badRequest('Month looks like 2026-10.');
  if (month > thisMonth()) throw badRequest('That month has not started yet.');
}
function requireClientRecord(id: string) {
  const row = clientRows.find((c) => c.organisationId === id);
  if (!row) throw notFound('Client');
  return row;
}

/** Services of a client's live projects that have a monthly template, in template order. */
function servicesOf(orgId: string, visible?: (p: (typeof projects)[number]) => boolean): string[] {
  const live = new Set(
    projects.filter((p) => p.organisationId === orgId && p.status !== 'COMPLETED' && (!visible || visible(p))).map((p) => p.service),
  );
  return Object.keys(METRICS).filter((s) => live.has(s));
}

const find = (orgId: string, month: string) => reports.find((r) => r.organisationId === orgId && r.month === month);

function sectionsOf(row: ReportRow | undefined, prev: ReportRow | undefined, services: string[]): ReportSection[] {
  return services.map((service) => {
    const own = row?.sections.find((s) => s.service === service);
    const before = prev?.sections.find((s) => s.service === service);
    return {
      service,
      highlight: own?.highlight,
      metrics: METRICS[service].map(
        (d): MetricValue => ({
          ...d,
          value: own?.values[d.key] ?? undefined,
          previous: before?.values[d.key] ?? undefined,
        }),
      ),
    };
  });
}

function toReport(orgId: string, month: string, services: string[], clientView: boolean): ClientReport {
  const row = find(orgId, month);
  const prev = find(orgId, prevMonth(month));
  // BACKEND: clients compare against the previous *published* month only.
  const prevShown = clientView && prev?.status !== 'PUBLISHED' ? undefined : prev;
  return {
    clientId: orgId,
    clientName: CLIENT_NAME[orgId] ?? orgId,
    month,
    status: row?.status ?? 'NOT_STARTED',
    summary: row?.summary ?? '',
    sections: sectionsOf(row, prevShown, services),
    publishedAt: row?.publishedAt,
    publishedBy: row?.publishedBy,
    updatedAt: clientView ? undefined : row?.updatedAt,
    updatedBy: clientView ? undefined : row?.updatedBy,
    months: publishedMonths(orgId),
  };
}

const publishedMonths = (orgId: string) =>
  reports
    .filter((r) => r.organisationId === orgId && r.status === 'PUBLISHED')
    .map((r) => r.month)
    .sort()
    .reverse();

/* ------------------------------------------------------------- client */

/**
 * GET /reports?month=yyyy-mm. Without a month: the latest published one.
 * BACKEND: only PUBLISHED reports of the caller's organisation. Reps see the sections of
 * services they work on (projects they were added to); owners see everything.
 */
export function clientReport(user: User, month?: string): ClientReport {
  requireClientUser(user);
  const org = user.organisationId;
  const months = publishedMonths(org);
  const services = servicesOf(org, (p) => canSeeProject(user, p));
  if (!month) {
    if (!months.length) return { clientId: org, clientName: CLIENT_NAME[org] ?? org, month: '', status: 'NOT_STARTED', summary: '', sections: [], months };
    month = months[0];
  }
  checkMonth(month);
  if (find(org, month)?.status !== 'PUBLISHED') throw notFound('Report');
  return toReport(org, month, services, true);
}

const fmtNumber = (n: number) =>
  n >= 100_000 ? `${(n / 100_000).toFixed(2).replace(/\.?0+$/, '')} L` : Math.round(n).toLocaleString('en-IN');

/** Display a metric value the same way everywhere (dashboard, report page). */
export function formatMetric(unit: MetricValue['unit'], v: number): string {
  if (unit === 'PERCENT') return `${v}%`;
  if (unit === 'INR') return `₹${fmtNumber(v)}`;
  if (unit === 'SECONDS') return `${v} s`;
  return fmtNumber(v);
}

/** The client dashboard's "Results" card: four headline numbers from the latest published month. */
export function latestResults(user: User): { results: KpiPoint[]; resultsPeriod: string } {
  const r = clientReport(user);
  if (!r.month) return { results: [], resultsPeriod: '' };
  const picks: MetricValue[] = [];
  for (let i = 0; picks.length < 4 && i < 4; i++) {
    for (const s of r.sections) if (s.metrics[i] && picks.length < 4) picks.push(s.metrics[i]);
  }
  return {
    resultsPeriod: monthName(r.month),
    results: picks
      .filter((m) => m.value !== undefined)
      .map((m) => {
        const point: KpiPoint = { label: m.label, value: formatMetric(m.unit, m.value!) };
        if (m.previous !== undefined && m.previous !== 0) {
          const up = m.value! >= m.previous;
          point.change =
            m.unit === 'PERCENT'
              ? `${up ? '+' : '−'}${Math.abs(Math.round((m.value! - m.previous) * 10) / 10)} pts`
              : `${up ? '+' : '−'}${Math.abs(Math.round(((m.value! - m.previous) / m.previous) * 100))}%`;
          point.good = m.lowerIsBetter ? !up || m.value === m.previous : up;
        }
        return point;
      }),
  };
}

/* -------------------------------------------------------------- admin */

/** GET /admin/reports?month=yyyy-mm: where each live client's report stands. Defaults to last month. */
export function reportStatuses(user: User, month = monthStart(-1).slice(0, 7)): ReportStatusItem[] {
  requireAdmin(user);
  checkMonth(month);
  const ORDER = { NOT_STARTED: 0, DRAFT: 1, PUBLISHED: 2 } as const;
  return clientRows
    .filter((c) => c.status !== 'ENDED')
    .map((c) => {
      const services = servicesOf(c.organisationId);
      const row = find(c.organisationId, month);
      const total = services.reduce((n, s) => n + METRICS[s].length, 0);
      const filled = services.reduce((n, s) => {
        const vals = row?.sections.find((x) => x.service === s)?.values ?? {};
        return n + METRICS[s].filter((d) => vals[d.key] !== null && vals[d.key] !== undefined).length;
      }, 0);
      return {
        clientId: c.organisationId,
        clientName: CLIENT_NAME[c.organisationId] ?? c.organisationId,
        month,
        status: row?.status ?? 'NOT_STARTED',
        services,
        filled,
        total,
        updatedAt: row?.updatedAt,
      } satisfies ReportStatusItem;
    })
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.clientName.localeCompare(b.clientName));
}

/** GET /admin/reports/{clientId}/{month} */
export function adminReport(user: User, clientId: string, month: string): ClientReport {
  requireAdmin(user);
  requireClientRecord(clientId);
  checkMonth(month);
  return toReport(clientId, month, servicesOf(clientId), false);
}

/**
 * PUT /admin/reports/{clientId}/{month}: save numbers (draft, or a correction to a published month).
 * BACKEND: values are numbers ≥ 0, percentages ≤ 100; null means "not entered yet".
 */
export function saveReport(user: User, clientId: string, month: string, input: ReportInput): ClientReport {
  requireAdmin(user);
  requireClientRecord(clientId);
  checkMonth(month);
  const services = servicesOf(clientId);
  const summary = input.summary?.trim() ?? '';
  if (summary.length > 2000) throw badRequest('Keep the summary under 2,000 characters.');
  if (!Array.isArray(input.sections)) throw badRequest('Nothing to save.');

  const sections: ReportRow['sections'] = [];
  for (const s of input.sections) {
    if (!services.includes(s.service)) throw badRequest(`${s.service} is not a service this client buys.`);
    const values: Record<string, number | null> = {};
    for (const d of METRICS[s.service]) {
      const raw = s.values?.[d.key];
      if (raw === null || raw === undefined || (raw as unknown) === '') {
        values[d.key] = null;
        continue;
      }
      const v = Number(raw);
      if (!Number.isFinite(v) || v < 0) throw badRequest(`${s.service}, ${d.label}: enter a number of zero or more.`);
      if (d.unit === 'PERCENT' && v > 100) throw badRequest(`${s.service}, ${d.label}: a percentage is at most 100.`);
      values[d.key] = Math.round(v * 100) / 100;
    }
    const highlight = s.highlight?.trim();
    if (highlight && highlight.length > 280) throw badRequest(`${s.service}: keep the highlight to one sentence.`);
    sections.push({ service: s.service, highlight: highlight || undefined, values });
  }

  const now = new Date().toISOString();
  const existing = find(clientId, month);
  if (existing) {
    existing.summary = summary;
    existing.sections = sections;
    existing.updatedAt = now;
    existing.updatedBy = user.name;
  } else {
    reports.push({ organisationId: clientId, month, status: 'DRAFT', summary, sections, updatedAt: now, updatedBy: user.name });
  }
  return adminReport(user, clientId, month);
}

/**
 * POST /admin/reports/{clientId}/{month}/publish (automation rule 11: a manager reviews, then publishes).
 * BACKEND: every number and a summary are required; missing numbers are listed so they can be chased.
 */
export function publishReport(user: User, clientId: string, month: string): ClientReport {
  requireAdmin(user);
  requireClientRecord(clientId);
  checkMonth(month);
  const row = find(clientId, month);
  if (!row) throw badRequest('Save the numbers first.');
  if (row.status === 'PUBLISHED') throw badRequest('Already published. Save changes to correct it.');
  if (month === thisMonth()) throw badRequest('Publish after the month ends.');
  const missing: string[] = [];
  for (const s of servicesOf(clientId)) {
    const vals = row.sections.find((x) => x.service === s)?.values ?? {};
    for (const d of METRICS[s]) if (vals[d.key] === null || vals[d.key] === undefined) missing.push(`${s}: ${d.label}`);
  }
  if (missing.length) throw badRequest(`Fill in every number before publishing. Missing: ${missing.join('; ')}.`);
  if (row.summary.trim().length < 20) throw badRequest('Write a short summary for the client (a sentence or two).');
  const now = new Date().toISOString();
  row.status = 'PUBLISHED';
  row.publishedAt = now;
  row.publishedBy = user.name;
  row.updatedAt = now;
  row.updatedBy = user.name;
  for (const u of users.filter((x) => x.organisationId === clientId && x.status === 'ACTIVE')) {
    sendEmail(u.email, `Your ${monthName(month)} report is ready`, 'See this month\'s results in the portal.', `/client/reports?month=${month}`);
  }
  return adminReport(user, clientId, month);
}
