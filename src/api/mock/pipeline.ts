/**
 * Mock sales pipeline API (Week 6): leads, stages, activities, and "won deal → client + project".
 * Admin area (Super Admin and Manager). Converting a deal is SUPER_ADMIN only because it issues a login.
 * Comments starting with "BACKEND:" are rules the Spring Boot service must enforce.
 */
import type {
  ConvertLead,
  LeadActivityInput,
  LeadDetail,
  LeadItem,
  LeadPatch,
  LeadSource,
  LeadStage,
  NewLead,
  PipelineBoard,
  PipelineSummary,
  User,
} from '@/types';
import { createClient } from './clients';
import { day, nameOf, projects, userById, users } from './data';
import type { ProjectRow } from './data';
import { leads } from './data6';
import type { LeadRow } from './data6';
import { badRequest, conflict, forbidden, isAdminArea, isStaff, notFound } from './handlers';

const DAY_MS = 86_400_000;
const today = () => day(0);
const nowIso = () => new Date().toISOString();
const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const STAGES: LeadStage[] = ['NEW', 'CONTACTED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'];
const OPEN: LeadStage[] = ['NEW', 'CONTACTED', 'PROPOSAL', 'NEGOTIATION'];
/** Chance of winning by stage, for the weighted pipeline value. */
const PROBABILITY: Partial<Record<LeadStage, number>> = { NEW: 0.1, CONTACTED: 0.2, PROPOSAL: 0.4, NEGOTIATION: 0.7 };
const STAGE_LABEL: Record<LeadStage, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  PROPOSAL: 'Proposal sent',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
};
const SOURCES: LeadSource[] = ['WEBSITE', 'REFERRAL', 'OFFER', 'EVENT', 'OUTBOUND'];
export const SERVICES = ['Social media', 'SEO', 'Paid ads', 'Website', 'Branding', 'Content', 'Influencer marketing', 'Digital PR'];

// BACKEND: the pipeline is admin area only (permission matrix). Phase 1: managers see their team's leads.
function requireAdminArea(user: User) {
  if (!isAdminArea(user)) throw forbidden('Only Super Admins and Managers can open the sales pipeline.');
}

function find(id: string) {
  const l = leads.find((x) => x.id === id);
  if (!l) throw notFound('Lead');
  return l;
}

/** Salespeople: active Super Admins and Managers. */
function requireSeller(id: string) {
  const u = userById(id);
  if (!u || !isStaff(u) || u.status !== 'ACTIVE' || (u.role !== 'SUPER_ADMIN' && u.role !== 'MANAGER')) {
    throw badRequest('Leads are owned by a Super Admin or Manager.');
  }
}

const value = (l: LeadRow) => l.value;

function toItem(l: LeadRow): LeadItem {
  return {
    id: l.id,
    company: l.company,
    contactName: l.contactName,
    city: l.city,
    source: l.source,
    services: l.services,
    value: l.value,
    valueKind: l.valueKind,
    stage: l.stage,
    owner: l.ownerId ? { id: l.ownerId, name: nameOf(l.ownerId) } : undefined,
    nextFollowUp: l.nextFollowUp,
    followUpDue: OPEN.includes(l.stage) && !!l.nextFollowUp && l.nextFollowUp <= today(),
    createdAt: l.createdAt,
    daysInStage: Math.max(0, Math.floor((Date.now() - Date.parse(l.stageSince)) / DAY_MS)),
    lostReason: l.lostReason,
    clientId: l.clientId,
  };
}

function toDetail(l: LeadRow): LeadDetail {
  return {
    ...toItem(l),
    email: l.email,
    phone: l.phone,
    notes: l.notes,
    projectId: l.projectId,
    activities: [...l.activities].reverse(),
  };
}

export function pipelineSummary(): PipelineSummary {
  const open = leads.filter((l) => OPEN.includes(l.stage));
  const recent = leads.filter((l) => (l.stage === 'WON' || l.stage === 'LOST') && Date.now() - Date.parse(l.stageSince) < 180 * DAY_MS);
  const month = today().slice(0, 7);
  const wonThisMonth = leads.filter((l) => l.stage === 'WON' && l.stageSince.slice(0, 7) === month);
  return {
    stages: STAGES.map((stage) => {
      const rows = leads.filter((l) => l.stage === stage);
      return { stage, count: rows.length, value: rows.reduce((n, l) => n + value(l), 0) };
    }),
    openValue: open.reduce((n, l) => n + value(l), 0),
    weightedValue: Math.round(open.reduce((n, l) => n + value(l) * (PROBABILITY[l.stage] ?? 0), 0)),
    winRate: recent.length ? recent.filter((l) => l.stage === 'WON').length / recent.length : undefined,
    wonThisMonth: { count: wonThisMonth.length, value: wonThisMonth.reduce((n, l) => n + value(l), 0) },
    followUpsDue: open.filter((l) => l.nextFollowUp && l.nextFollowUp <= today()).length,
    unassigned: open.filter((l) => !l.ownerId).length,
  };
}

/** Admin dashboard tile (Week 1 shape): open stages with labels. */
export function dashboardPipeline() {
  return OPEN.map((stage) => {
    const rows = leads.filter((l) => l.stage === stage);
    return { stage: STAGE_LABEL[stage], count: rows.length, value: rows.reduce((n, l) => n + value(l), 0) };
  });
}

/* -------------------------------------------------------------- endpoints */

/** GET /pipeline?q&ownerId&source. Won and lost older than 90 days drop off the board. */
export function pipeline(user: User, q: { q?: string; ownerId?: string; source?: LeadSource } = {}): PipelineBoard {
  requireAdminArea(user);
  const needle = q.q?.trim().toLowerCase();
  const fresh = (l: LeadRow) => OPEN.includes(l.stage) || Date.now() - Date.parse(l.stageSince) < 90 * DAY_MS;
  return {
    leads: leads
      .filter(
        (l) =>
          fresh(l) &&
          (!q.ownerId || (q.ownerId === 'none' ? !l.ownerId : l.ownerId === q.ownerId)) &&
          (!q.source || l.source === q.source) &&
          (!needle || `${l.company} ${l.contactName} ${l.city ?? ''} ${l.services.join(' ')}`.toLowerCase().includes(needle)),
      )
      .map(toItem)
      // Follow-ups due first, then the biggest deals.
      .sort((a, b) => Number(b.followUpDue) - Number(a.followUpDue) || b.value - a.value),
    summary: pipelineSummary(),
    sellers: users
      .filter((u) => isStaff(u) && u.status === 'ACTIVE' && (u.role === 'SUPER_ADMIN' || u.role === 'MANAGER'))
      .map((u) => ({ id: u.id, name: u.name })),
  };
}

/** GET /pipeline/leads/{id} */
export function getLead(user: User, id: string): LeadDetail {
  requireAdminArea(user);
  return toDetail(find(id));
}

/** POST /pipeline/leads (automation rule 1 creates these from the website form and offer clicks). */
export function createLead(user: User, input: NewLead): LeadDetail {
  requireAdminArea(user);
  const company = input.company?.trim() ?? '';
  if (company.length < 2) throw badRequest('Enter the company name.');
  if ((input.contactName?.trim() ?? '').length < 2) throw badRequest('Enter the contact person.');
  const email = input.email?.trim().toLowerCase() ?? '';
  if (!EMAIL_RE.test(email)) throw badRequest('Enter a valid email address.');
  if (!SOURCES.includes(input.source)) throw badRequest('Choose where the lead came from.');
  if (!Array.isArray(input.services) || !input.services.length || input.services.some((s) => !SERVICES.includes(s))) throw badRequest('Choose at least one service.');
  const v = Number(input.value);
  if (!(v >= 0) || v > 100_000_000) throw badRequest('Estimated value looks wrong.');
  if (input.valueKind !== 'MONTHLY' && input.valueKind !== 'ONE_OFF') throw badRequest('Monthly or one-off?');
  if (input.ownerId) requireSeller(input.ownerId);
  // BACKEND: one open lead per email, so two people don't chase the same contact.
  if (leads.some((l) => l.email === email && OPEN.includes(l.stage))) throw conflict('There is already an open lead with this email.');
  const now = nowIso();
  const row: LeadRow = {
    id: uid('ld'),
    company,
    contactName: input.contactName.trim(),
    email,
    phone: input.phone?.trim() || undefined,
    city: input.city?.trim() || undefined,
    source: input.source,
    services: input.services,
    value: Math.round(v),
    valueKind: input.valueKind,
    stage: 'NEW',
    stageSince: now,
    ownerId: input.ownerId || undefined,
    nextFollowUp: day(1),
    createdAt: now,
    notes: input.notes?.trim() || undefined,
    activities: [{ id: uid('la'), at: now, actor: user.name, kind: 'SYSTEM', text: `Lead added${input.ownerId ? `, owner ${nameOf(input.ownerId)}` : ''}; first follow-up tomorrow` }],
  };
  leads.push(row);
  return toDetail(row);
}

/** PATCH /pipeline/leads/{id}: stage, owner, follow-up date, value, services. */
export function updateLead(user: User, id: string, patch: LeadPatch): LeadDetail {
  requireAdminArea(user);
  const l = find(id);
  if (l.stage === 'WON') throw conflict('Won deals are closed. Changes now happen on the client record.');
  const log = (kind: LeadDetail['activities'][number]['kind'], text: string) => l.activities.push({ id: uid('la'), at: nowIso(), actor: user.name, kind, text });

  if (patch.stage !== undefined && patch.stage !== l.stage) {
    if ((patch.stage as LeadStage) === 'WON') throw badRequest('Use "Mark as won" to create the client and project.');
    if (!STAGES.includes(patch.stage)) throw badRequest('Unknown stage.');
    if (patch.stage === 'LOST') {
      const why = patch.lostReason?.trim() ?? '';
      if (why.length < 3) throw badRequest('Say why the deal was lost. It helps pricing and follow-ups.');
      l.lostReason = why;
      l.nextFollowUp = undefined;
    } else {
      l.lostReason = undefined;
      // BACKEND: moving forward sets the next follow-up (rule 1: day 1, 3, 7 cadence) unless one is set.
      if (!l.nextFollowUp || l.nextFollowUp < today()) l.nextFollowUp = day(patch.stage === 'NEW' ? 1 : 3);
    }
    log('STAGE', `Moved from ${STAGE_LABEL[l.stage]} to ${STAGE_LABEL[patch.stage]}${patch.stage === 'LOST' ? `: ${l.lostReason}` : ''}`);
    l.stage = patch.stage;
    l.stageSince = nowIso();
  }
  if (patch.ownerId !== undefined && patch.ownerId !== (l.ownerId ?? '')) {
    if (patch.ownerId) requireSeller(patch.ownerId);
    log('NOTE', `Owner ${l.ownerId ? nameOf(l.ownerId) : 'none'} → ${patch.ownerId ? nameOf(patch.ownerId) : 'none'}`);
    l.ownerId = patch.ownerId || undefined;
  }
  if (patch.nextFollowUp !== undefined) {
    if (patch.nextFollowUp && (!DATE_RE.test(patch.nextFollowUp) || patch.nextFollowUp < today())) throw badRequest('Follow-up date must be today or later.');
    l.nextFollowUp = patch.nextFollowUp || undefined;
  }
  if (patch.value !== undefined) {
    const v = Number(patch.value);
    if (!(v >= 0)) throw badRequest('Estimated value looks wrong.');
    l.value = Math.round(v);
  }
  if (patch.services !== undefined) {
    if (!patch.services.length || patch.services.some((s) => !SERVICES.includes(s))) throw badRequest('Choose at least one service.');
    l.services = patch.services;
  }
  return toDetail(l);
}

/** POST /pipeline/leads/{id}/activities: a call, email, meeting or note, optionally setting the next follow-up. */
export function addLeadActivity(user: User, id: string, input: LeadActivityInput): LeadDetail {
  requireAdminArea(user);
  const l = find(id);
  if (!['CALL', 'EMAIL', 'MEETING', 'NOTE'].includes(input.kind)) throw badRequest('Choose call, email, meeting or note.');
  const text = input.text?.trim() ?? '';
  if (text.length < 2) throw badRequest('Write what happened.');
  if (text.length > 2000) throw badRequest('Keep it under 2,000 characters.');
  if (input.nextFollowUp) {
    if (!DATE_RE.test(input.nextFollowUp) || input.nextFollowUp < today()) throw badRequest('Follow-up date must be today or later.');
    l.nextFollowUp = input.nextFollowUp;
  }
  l.activities.push({ id: uid('la'), at: nowIso(), actor: user.name, kind: input.kind, text });
  return toDetail(l);
}

/**
 * POST /pipeline/leads/{id}/convert: "won deal → client + project" (automation rules 2 and 3).
 * BACKEND: SUPER_ADMIN only (it issues the client's login). One transaction: client (via the same
 * service as POST /clients, so the same checks and the invite), first project, lead WON.
 */
export function convertLead(user: User, id: string, input: ConvertLead): LeadDetail {
  if (user.role !== 'SUPER_ADMIN') throw forbidden('Only a Super Admin can mark a deal as won, because it creates a client login.');
  const l = find(id);
  if (!OPEN.includes(l.stage)) throw conflict('Only open deals can be won.');
  const p = input.project;
  if (!p || (p.name?.trim() ?? '').length < 3) throw badRequest('Name the first project.');
  if (!SERVICES.includes(p.service)) throw badRequest('Choose the project service.');
  const owner = userById(p.ownerId);
  if (!owner || !isStaff(owner) || owner.status !== 'ACTIVE') throw badRequest('The project owner must be an active team member.');
  const hours = Number(p.budgetHours);
  if (!(hours >= 1 && hours <= 2000)) throw badRequest('Budget hours: 1 to 2,000.');
  if (!DATE_RE.test(p.startDate ?? '')) throw badRequest('Choose a start date.');

  // Same rules as Add client (duplicate name or email → 409, GSTIN format, account manager).
  const client = createClient(user, {
    name: l.company,
    legalName: input.legalName?.trim() || l.company,
    industry: input.industry,
    city: input.city || l.city || '',
    gstin: input.gstin,
    accountManagerId: input.accountManagerId,
    owner: { name: l.contactName, email: l.email, title: input.ownerTitle },
  });

  const projectId = uid('p-');
  const row: ProjectRow = {
    id: projectId,
    organisationId: client.id,
    name: p.name.trim(),
    service: p.service,
    status: 'ACTIVE',
    health: 'GREEN',
    progress: 0,
    ownerId: p.ownerId,
    backupId: input.accountManagerId !== p.ownerId ? input.accountManagerId : undefined,
    memberIds: [p.ownerId, ...users.filter((u) => u.organisationId === client.id).map((u) => u.id)],
    startDate: p.startDate,
    scope: `From the won deal with ${l.company}: ${l.services.join(', ')}.`,
    budgetHours: Math.round(hours),
    hoursUsed: 0,
    milestones: [{ id: `${projectId}m1`, title: 'Kick-off and onboarding checklist', due: p.startDate }],
    deliverables: [],
    activity: [{ id: uid('pa'), at: nowIso(), actor: user.name, text: `Project created from the won deal with ${l.company}`, visibility: 'INTERNAL' }],
  };
  projects.push(row);

  l.stage = 'WON';
  l.stageSince = nowIso();
  l.clientId = client.id;
  l.projectId = projectId;
  l.nextFollowUp = undefined;
  l.activities.push({ id: uid('la'), at: nowIso(), actor: user.name, kind: 'STAGE', text: `Won: client ${l.company} created, invite sent to ${l.contactName}, project "${row.name}" started` });
  return toDetail(l);
}
