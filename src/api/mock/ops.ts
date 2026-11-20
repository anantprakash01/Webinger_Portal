/**
 * Mock knowledge base, service catalogue and client onboarding (Week 8).
 * Comments starting with "BACKEND:" are rules the Spring Boot service must enforce.
 */
import type {
  AccessPlatform,
  AccessStatus,
  ArticleCategory,
  ArticleDetail,
  ArticleInput,
  ArticleItem,
  Onboarding,
  OnboardingPatch,
  ProjectFromTemplate,
  ServiceInput,
  ServiceItem,
  TemplatePreview,
  User,
} from '@/types';
import { clientRows } from './clients';
import { CLIENT_NAME, day, nameOf, projects, tasks, userById, users } from './data';
import type { ProjectRow, TaskRow } from './data';
import { vaultFiles } from './data4';
import { addDays, DEPARTMENT, isWorkingDay, leaves } from './data6';
import { articles, emptyQuestionnaire, freshAccess, onboarding, runs, services } from './data8';
import type { OnboardingRow, ServiceRow } from './data8';
import { badRequest, conflict, forbidden, isAdminArea, isClient, isStaff, log, notFound } from './handlers';

const today = () => day(0);
const nowIso = () => new Date().toISOString();
const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORIES: ArticleCategory[] = ['PROCESS', 'BRAND', 'TOOLS', 'CLIENTS', 'HR'];

function requireStaff(user: User) {
  if (!isStaff(user)) throw forbidden('The knowledge base is for the Webinger team.');
}
function requireAdminArea(user: User) {
  if (!isAdminArea(user)) throw forbidden('Only Super Admins and Managers can do this.');
}

/* ========================================================= knowledge base */

const isStale = (iso: string) => Date.now() - Date.parse(iso) > 180 * 86_400_000;
const toArticle = (a: (typeof articles)[number]): ArticleItem => ({
  id: a.id,
  title: a.title,
  category: a.category,
  summary: a.summary,
  tags: a.tags,
  updatedAt: a.updatedAt,
  updatedBy: a.updatedBy,
  helpful: a.helpful.size,
  stale: isStale(a.updatedAt),
});

/** GET /knowledge?q&category: staff only (clients never see internal process notes). */
export function listArticles(user: User, q: { q?: string; category?: ArticleCategory } = {}): ArticleItem[] {
  requireStaff(user);
  const needle = q.q?.trim().toLowerCase();
  return articles
    .filter((a) => (!q.category || a.category === q.category) && (!needle || `${a.title} ${a.summary} ${a.body} ${a.tags.join(' ')}`.toLowerCase().includes(needle)))
    .sort((a, b) => b.helpful.size - a.helpful.size || b.updatedAt.localeCompare(a.updatedAt))
    .map(toArticle);
}

/** GET /knowledge/{id} */
export function getArticle(user: User, id: string): ArticleDetail {
  requireStaff(user);
  const a = articles.find((x) => x.id === id);
  if (!a) throw notFound('Article');
  return { ...toArticle(a), body: a.body, voted: a.helpful.has(user.id) };
}

function cleanArticle(input: ArticleInput) {
  const title = input.title?.trim() ?? '';
  const summary = input.summary?.trim() ?? '';
  const body = input.body?.trim() ?? '';
  if (title.length < 5 || title.length > 120) throw badRequest('Title: 5 to 120 characters.');
  if (!CATEGORIES.includes(input.category)) throw badRequest('Choose a category.');
  if (summary.length < 10 || summary.length > 200) throw badRequest('Summary: one sentence, 10 to 200 characters.');
  if (body.length < 20 || body.length > 10_000) throw badRequest('Write the article (20 to 10,000 characters).');
  const tags = [...new Set((input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 6);
  return { title, category: input.category, summary, body, tags };
}

/** POST /knowledge. BACKEND: admin area writes; every save stamps who and when (stale after 6 months). */
export function createArticle(user: User, input: ArticleInput): ArticleDetail {
  requireAdminArea(user);
  const row = { id: uid('kb'), ...cleanArticle(input), updatedAt: nowIso(), updatedBy: user.name, helpful: new Set<string>() };
  articles.push(row);
  return getArticle(user, row.id);
}

/** PUT /knowledge/{id} */
export function updateArticle(user: User, id: string, input: ArticleInput): ArticleDetail {
  requireAdminArea(user);
  const a = articles.find((x) => x.id === id);
  if (!a) throw notFound('Article');
  Object.assign(a, cleanArticle(input), { updatedAt: nowIso(), updatedBy: user.name });
  return getArticle(user, id);
}

/** POST /knowledge/{id}/helpful: toggles this person's vote. */
export function toggleHelpful(user: User, id: string): ArticleDetail {
  requireStaff(user);
  const a = articles.find((x) => x.id === id);
  if (!a) throw notFound('Article');
  if (a.helpful.has(user.id)) a.helpful.delete(user.id);
  else a.helpful.add(user.id);
  return getArticle(user, id);
}

/* ===================================================== service catalogue */

const DEPARTMENTS = [...new Set(Object.values(DEPARTMENT))].filter((d) => d !== 'Leadership');
const toService = (s: ServiceRow): ServiceItem => ({ ...s, tasks: s.tasks.map((t) => ({ ...t })) });

/** GET /services: admin area. */
export function listServices(user: User): ServiceItem[] {
  requireAdminArea(user);
  return services.map(toService).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}

function cleanService(input: ServiceInput) {
  if ((input.name?.trim() ?? '').length < 3) throw badRequest('Name the service.');
  if (!(Number(input.price) > 0)) throw badRequest('Set a price.');
  if (input.billing !== 'MONTHLY' && input.billing !== 'ONE_OFF') throw badRequest('Monthly or one-off?');
  const weeks = Number(input.timelineWeeks);
  if (!(weeks >= 1 && weeks <= 52)) throw badRequest('Timeline: 1 to 52 weeks.');
  const revisions = Number(input.revisions);
  if (!(revisions >= 0 && revisions <= 10)) throw badRequest('Revisions: 0 to 10.');
  if (!Array.isArray(input.tasks) || !input.tasks.length || input.tasks.length > 30) throw badRequest('Add one to thirty template tasks.');
  const list = input.tasks.map((t, i) => {
    if ((t.title?.trim() ?? '').length < 3) throw badRequest(`Task ${i + 1}: add a title.`);
    if (!DEPARTMENTS.includes(t.department)) throw badRequest(`Task ${i + 1}: choose a department.`);
    const start = Number(t.startDay);
    const dur = Number(t.durationDays);
    if (!(start >= 0 && start <= weeks * 7)) throw badRequest(`Task ${i + 1}: starts within the timeline.`);
    if (!(dur >= 1 && dur <= 90)) throw badRequest(`Task ${i + 1}: 1 to 90 days.`);
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(t.priority)) throw badRequest(`Task ${i + 1}: priority.`);
    return { id: uid('tt'), title: t.title.trim(), department: t.department, startDay: Math.round(start), durationDays: Math.round(dur), priority: t.priority, clientFacing: !!t.clientFacing };
  });
  return {
    name: input.name.trim(),
    service: input.service?.trim() || input.name.trim(),
    description: input.description?.trim() ?? '',
    price: Math.round(Number(input.price)),
    billing: input.billing,
    timelineWeeks: Math.round(weeks),
    revisions: Math.round(revisions),
    active: !!input.active,
    tasks: list,
  };
}

/** POST /services. BACKEND: Super Admin only (prices). */
export function createService(user: User, input: ServiceInput): ServiceItem {
  if (user.role !== 'SUPER_ADMIN') throw forbidden('Only a Super Admin sets services and prices.');
  const row: ServiceRow = { id: uid('sv'), ...cleanService(input), projectsCreated: 0 };
  services.push(row);
  return toService(row);
}

/** PUT /services/{id} */
export function updateService(user: User, id: string, input: ServiceInput): ServiceItem {
  if (user.role !== 'SUPER_ADMIN') throw forbidden('Only a Super Admin sets services and prices.');
  const s = services.find((x) => x.id === id);
  if (!s) throw notFound('Service');
  Object.assign(s, cleanService(input));
  return toService(s);
}

/** The date `n` working days after `start` (Settings business days, holidays skipped). */
function workingDaysAfter(start: string, n: number) {
  let d = start;
  let left = n;
  while (!isWorkingDay(d)) d = addDays(d, 1);
  while (left > 0) {
    d = addDays(d, 1);
    if (isWorkingDay(d)) left -= 1;
  }
  return d;
}
const onLeave = (userId: string, iso: string) => leaves.some((l) => l.userId === userId && l.status === 'APPROVED' && l.from <= iso && l.to >= iso);

/** Rule 3: assign by role (department) and load; the least busy available person in the department. */
function plan(s: ServiceRow, startDate: string): TemplatePreview {
  const extra = new Map<string, number>();
  const load = (id: string) => tasks.filter((t) => t.assigneeId === id && t.status !== 'DONE').length + (extra.get(id) ?? 0);
  const gaps = new Set<string>();
  const out = s.tasks.map((t) => {
    const due = workingDaysAfter(startDate, t.startDay + t.durationDays);
    const people = users
      .filter((u) => isStaff(u) && u.status === 'ACTIVE' && DEPARTMENT[u.id] === t.department && !onLeave(u.id, due))
      .sort((a, b) => load(a.id) - load(b.id) || a.name.localeCompare(b.name));
    let pick = people[0];
    if (!pick) {
      gaps.add(t.department);
      pick = userById('u-mgr')!;
    }
    extra.set(pick.id, (extra.get(pick.id) ?? 0) + 1);
    return { title: t.title, due, assignee: { id: pick.id, name: pick.name }, department: t.department, clientFacing: t.clientFacing };
  });
  return { tasks: out, gaps: [...gaps] };
}

function checkTemplateInput(s: ServiceRow, input: ProjectFromTemplate) {
  if (!s.active) throw conflict('This service is not active.');
  const client = clientRows.find((c) => c.organisationId === input.clientId);
  if (!client) throw badRequest('Choose a client.');
  if (client.status === 'ENDED') throw conflict('This client has ended. Reactivate them first.');
  if (!DATE_RE.test(input.startDate ?? '') || input.startDate < addDays(today(), -7)) throw badRequest('Start date from this week.');
  const owner = userById(input.ownerId);
  if (!owner || !isStaff(owner) || owner.status !== 'ACTIVE') throw badRequest('The project owner is an active team member.');
}

/** POST /services/{id}/preview { clientId, startDate, ownerId } */
export function previewFromTemplate(user: User, id: string, input: ProjectFromTemplate): TemplatePreview {
  requireAdminArea(user);
  const s = services.find((x) => x.id === id);
  if (!s) throw notFound('Service');
  checkTemplateInput(s, input);
  return plan(s, input.startDate);
}

/**
 * POST /services/{id}/projects: one click → project (automation rule 3).
 * BACKEND: admin area; one transaction for the project, its milestones and its tasks; a department with nobody
 * available gets the manager as a placeholder and is reported back (rule 3: manager alerted).
 */
export function createFromTemplate(user: User, id: string, input: ProjectFromTemplate): { projectId: string; gaps: string[] } {
  requireAdminArea(user);
  const s = services.find((x) => x.id === id);
  if (!s) throw notFound('Service');
  checkTemplateInput(s, input);
  const name = input.name?.trim() || `${s.name}: ${CLIENT_NAME[input.clientId]}`;
  const p = plan(s, input.startDate);
  const projectId = uid('p-');
  const end = workingDaysAfter(input.startDate, s.timelineWeeks * 5);
  const clientUsers = users.filter((u) => u.organisationId === input.clientId && u.role === 'CLIENT_OWNER').map((u) => u.id);
  const row: ProjectRow = {
    id: projectId,
    organisationId: input.clientId,
    name,
    service: s.service,
    status: 'ACTIVE',
    health: 'GREEN',
    progress: 0,
    ownerId: input.ownerId,
    memberIds: [...new Set([input.ownerId, ...p.tasks.map((t) => t.assignee.id), ...clientUsers])],
    startDate: input.startDate,
    endDate: end,
    scope: s.description,
    budgetHours: s.tasks.reduce((n, t) => n + t.durationDays * 4, 0),
    hoursUsed: 0,
    milestones: [
      { id: `${projectId}m1`, title: 'Kick-off and onboarding checklist', due: input.startDate },
      { id: `${projectId}m2`, title: `${s.name}: first delivery`, due: p.tasks.find((t) => t.clientFacing)?.due ?? end },
    ],
    deliverables: [],
    activity: [{ id: uid('pa'), at: nowIso(), actor: user.name, text: `Created from the "${s.name}" template (${s.tasks.length} tasks)`, visibility: 'INTERNAL' }],
  };
  projects.push(row);
  p.tasks.forEach((t, i) => {
    const tpl = s.tasks[i];
    const task: TaskRow = {
      id: uid('t-'),
      projectId,
      title: t.title,
      description: '',
      status: 'TODO',
      priority: tpl.priority,
      due: t.due,
      assigneeId: t.assignee.id,
      reviewerId: tpl.clientFacing ? (input.ownerId !== t.assignee.id ? input.ownerId : 'u-mgr') : undefined,
      clientFacing: tpl.clientFacing,
      reviewFailures: 0,
      checklist: [],
      files: [],
      comments: [],
      createdAt: nowIso(),
    };
    tasks.push(task);
  });
  s.projectsCreated += 1;
  runs.unshift({ id: uid('run'), ruleId: 3, at: nowIso(), status: 'DONE', summary: `Project "${name}" created from template; ${p.tasks.length} tasks assigned by workload${p.gaps.length ? `; no one free in ${p.gaps.join(', ')}` : ''}`, target: CLIENT_NAME[input.clientId] ?? '', link: `/admin/projects/${projectId}` });
  if (p.gaps.length) log(projectId, user, `No one available in ${p.gaps.join(', ')}: those tasks sit with ${nameOf('u-mgr')} for now`);
  return { projectId, gaps: p.gaps };
}

/* =========================================================== onboarding */

function rowFor(orgId: string): OnboardingRow {
  let r = onboarding.find((o) => o.organisationId === orgId);
  if (!r) {
    r = { organisationId: orgId, questionnaire: emptyQuestionnaire(), access: freshAccess(), brandAssetsUploaded: false };
    onboarding.push(r);
  }
  return r;
}

function toOnboarding(r: OnboardingRow): Onboarding {
  const q = r.questionnaire;
  const qDone = Object.values(q).every((v) => v.trim().length >= 3);
  const accessDone = r.access.filter((a) => a.status !== 'NOT_STARTED').length / r.access.length;
  const assets = r.brandAssetsUploaded || vaultFiles.some((f) => f.organisationId === r.organisationId && f.folder === 'LOGOS');
  const progress = Math.round((Number(qDone) + accessDone + Number(assets) + Number(!!r.kickoff)) * 25);
  if (progress === 100 && !r.completedAt) r.completedAt = nowIso();
  return {
    clientId: r.organisationId,
    clientName: CLIENT_NAME[r.organisationId] ?? r.organisationId,
    progress,
    questionnaire: { ...q },
    questionnaireDone: qDone,
    access: r.access.map((a) => ({ ...a })),
    brandAssetsUploaded: assets,
    kickoff: r.kickoff,
    completedAt: r.completedAt,
  };
}

/** GET /onboarding (client: own company) or /clients/{id}/onboarding (admin area). */
export function getOnboarding(user: User, clientId?: string): Onboarding {
  if (isClient(user)) return toOnboarding(rowFor(user.organisationId));
  requireAdminArea(user);
  if (!clientId || !clientRows.some((c) => c.organisationId === clientId)) throw notFound('Client');
  return toOnboarding(rowFor(clientId));
}

// BACKEND: never store a password. An "account reference" is a public ID (Business ID, property ID, domain).
const SECRET_RE = /pass(word)?|pwd|secret|otp|pin\b/i;

/**
 * PATCH /onboarding: the client fills the questionnaire, marks access granted and books the kick-off.
 * BACKEND: client roles, own organisation only; VERIFIED is set only by staff.
 */
export function updateOnboarding(user: User, patch: OnboardingPatch): Onboarding {
  if (!isClient(user)) throw forbidden('The onboarding checklist is filled in by the client.');
  const r = rowFor(user.organisationId);
  if (patch.questionnaire) {
    for (const [k, v] of Object.entries(patch.questionnaire)) {
      if (!(k in r.questionnaire)) throw badRequest(`Unknown question ${k}.`);
      if (typeof v !== 'string' || v.length > 1000) throw badRequest('Keep each answer under 1,000 characters.');
      r.questionnaire[k as keyof typeof r.questionnaire] = v.trim();
    }
  }
  if (patch.access) {
    const a = r.access.find((x) => x.platform === patch.access!.platform);
    if (!a) throw badRequest('Unknown platform.');
    const allowed: AccessStatus[] = ['NOT_STARTED', 'GRANTED', 'NOT_NEEDED'];
    if (!allowed.includes(patch.access.status)) throw forbidden('Webinger confirms the access after checking it.');
    const ref = patch.access.accountRef?.trim();
    if (ref && (SECRET_RE.test(ref) || ref.length > 60 || !/^[\w\s.:/@-]{2,60}$/.test(ref))) {
      throw badRequest('Share an account ID only, never a password. Give Webinger partner or user access instead.');
    }
    if (patch.access.status === 'GRANTED' && !ref) throw badRequest('Add the account ID so we can find it (for example the Business ID).');
    a.status = patch.access.status;
    a.accountRef = patch.access.status === 'GRANTED' ? ref : undefined;
    a.verifiedBy = undefined;
  }
  if (patch.kickoff) {
    const { date, time } = patch.kickoff;
    if (!DATE_RE.test(date ?? '') || date <= today() || !isWorkingDay(date)) throw badRequest('Choose a working day from tomorrow.');
    if (!/^(1[0-8]):(00|30)$/.test(time ?? '')) throw badRequest('Choose a time between 10:00 and 18:30.');
    r.kickoff = { date, time, bookedBy: user.name };
  }
  return toOnboarding(r);
}

/** POST /clients/{id}/onboarding/verify { platform }: staff checked the access works. */
export function verifyAccess(user: User, clientId: string, platform: AccessPlatform): Onboarding {
  requireAdminArea(user);
  const r = onboarding.find((o) => o.organisationId === clientId);
  const a = r?.access.find((x) => x.platform === platform);
  if (!r || !a) throw notFound('Access item');
  if (a.status !== 'GRANTED') throw conflict('The client has not granted this access yet.');
  a.status = 'VERIFIED';
  a.verifiedBy = user.name;
  return toOnboarding(r);
}
