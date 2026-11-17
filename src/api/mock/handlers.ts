/**
 * Mock implementation of the API. Each function behaves like the matching
 * Spring Boot endpoint will: it receives the signed-in user and returns
 * only what that user's role and organisation may see.
 *
 * Keep this filtering honest. It is the reference for the backend's rules.
 * Comments starting with "BACKEND:" describe the rule the service layer must enforce.
 */
import { AREA_BY_ROLE, ApiError } from '@/types';
import type {
  AdminDashboard,
  Area,
  ClientDashboard,
  EmployeeDashboard,
  Health,
  InfluencerDashboard,
  MilestoneItem,
  NewComment,
  PartnerDashboard,
  ProjectDetail,
  ProjectListItem,
  ProjectPage,
  ProjectQuery,
  ProjectSummary,
  Session,
  TaskComment,
  TaskDetail,
  TaskItem,
  TaskPatch,
  TaskQuery,
  TaskStatus,
  TeamMember,
  User,
} from '@/types';
import {
  approvals,
  CLIENT_NAME,
  day,
  DEMO_PASSWORD,
  invoices,
  messages,
  nameOf,
  ORG,
  projects,
  tasks,
  userById,
  users,
} from './data';
import type { MilestoneRow, ProjectRow, TaskRow } from './data';

const strip = <T extends object, K extends keyof T>(row: T, ...keys: K[]): Omit<T, K> => {
  const copy = { ...row };
  for (const k of keys) delete copy[k];
  return copy;
};

/* ---------------------------------------------------------------- errors */

const forbidden = (detail = 'Your role cannot open this page.') => new ApiError({ status: 403, title: 'Forbidden', detail });
// BACKEND: answer 404, not 403, for records in another organisation, so ids cannot be probed.
const notFound = (what: string) => new ApiError({ status: 404, title: 'Not Found', detail: `${what} not found.` });
const badRequest = (detail: string) => new ApiError({ status: 400, title: 'Bad Request', detail });
const conflict = (detail: string) => new ApiError({ status: 409, title: 'Conflict', detail });

function requireArea(user: User, area: Area) {
  if (AREA_BY_ROLE[user.role] !== area) throw forbidden();
}

const isAdminArea = (u: User) => u.role === 'SUPER_ADMIN' || u.role === 'MANAGER';
const isStaff = (u: User) => u.organisationId === ORG.WEBINGER;
const isClient = (u: User) => u.role === 'CLIENT_OWNER' || u.role === 'CLIENT_REP';

/* ------------------------------------------------------------------ auth */

export function login(email: string, password: string): Session {
  const user = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (!user || password !== DEMO_PASSWORD) {
    // Same message for both cases, so the form does not reveal which emails exist.
    throw new ApiError({ status: 401, title: 'Unauthorized', detail: 'Email or password is incorrect.' });
  }
  return {
    user,
    accessToken: `mock.${user.id}.${Date.now()}`,
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
}

/* ------------------------------------------------------- project access */

/**
 * BACKEND: the single rule for "may this caller see this project". Use it in
 * the repository query (WHERE clause), never by filtering after loading.
 */
function canSeeProject(user: User, p: ProjectRow): boolean {
  switch (user.role) {
    case 'SUPER_ADMIN':
      return true;
    case 'MANAGER':
      // Phase 1: only projects of the manager's teams. In the demo Kavya manages every team.
      return true;
    case 'EMPLOYEE':
      return p.memberIds.includes(user.id) || tasks.some((t) => t.projectId === p.id && (t.assigneeId === user.id || t.reviewerId === user.id));
    case 'CLIENT_OWNER':
      return p.organisationId === user.organisationId;
    case 'CLIENT_REP':
      return p.organisationId === user.organisationId && p.memberIds.includes(user.id);
    default:
      return false;
  }
}

function findProject(user: User, id: string): ProjectRow {
  const p = projects.find((x) => x.id === id);
  if (!p || !canSeeProject(user, p)) throw notFound('Project');
  return p;
}

const milestoneStatus = (m: MilestoneRow): MilestoneItem['status'] =>
  m.completedAt ? 'DONE' : m.due < day(0) ? 'MISSED' : 'UPCOMING';

const nextMilestone = (p: ProjectRow) => {
  const open = p.milestones.filter((m) => !m.completedAt).sort((a, b) => a.due.localeCompare(b.due));
  return open[0] ? { title: open[0].title, due: open[0].due } : undefined;
};

const toSummary = (p: ProjectRow): ProjectSummary => ({
  id: p.id,
  name: p.name,
  clientName: CLIENT_NAME[p.organisationId] ?? 'Internal',
  service: p.service,
  progress: p.progress,
  health: p.health,
  nextMilestone: nextMilestone(p),
  owner: nameOf(p.ownerId),
});

function toListItem(user: User, p: ProjectRow): ProjectListItem {
  const item: ProjectListItem = {
    ...toSummary(p),
    status: p.status,
    clientId: p.organisationId,
    ownerId: p.ownerId,
    startDate: p.startDate,
    endDate: p.endDate,
  };
  // BACKEND: internal task counts are never sent to client roles.
  if (isStaff(user)) {
    const open = tasks.filter((t) => t.projectId === p.id && t.status !== 'DONE');
    item.openTasks = open.length;
    item.overdueTasks = open.filter((t) => t.due < day(0)).length;
  }
  return item;
}

const HEALTH_ORDER: Record<Health, number> = { RED: 0, AMBER: 1, GREEN: 2 };
const STATUS_ORDER = { ACTIVE: 0, ON_HOLD: 1, COMPLETED: 2 } as const;

/* ------------------------------------------------------------ dashboards */

export function adminDashboard(user: User): AdminDashboard {
  requireArea(user, 'admin');
  const overdue = invoices.filter((i) => i.status === 'OVERDUE');
  const live = projects.filter((p) => p.status === 'ACTIVE');
  return {
    revenueThisMonth: 486000,
    recurringRevenue: 312000,
    outstanding: invoices.filter((i) => i.status !== 'PAID').reduce((s, i) => s + i.amount, 0),
    overdueTasks: tasks.filter((t) => t.status !== 'DONE' && t.due < day(0)).length,
    activeClients: new Set(live.map((p) => p.organisationId)).size,
    satisfaction: 4.4,
    healthMix: {
      GREEN: live.filter((p) => p.health === 'GREEN').length,
      AMBER: live.filter((p) => p.health === 'AMBER').length,
      RED: live.filter((p) => p.health === 'RED').length,
    },
    projectsAtRisk: live
      .filter((p) => p.health !== 'GREEN')
      .sort((a, b) => HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health])
      .slice(0, 6)
      .map(toSummary),
    overdueInvoices: overdue.map((i) => strip(i, 'organisationId')),
    teamLoad: [
      { name: 'Priya Sharma', department: 'Social', assignedHours: 44, capacityHours: 40 },
      { name: 'Rahul Nair', department: 'SEO', assignedHours: 31, capacityHours: 40 },
      { name: 'Meera Pillai', department: 'Design', assignedHours: 38, capacityHours: 40 },
      { name: 'Vikram Singh', department: 'Ads', assignedHours: 22, capacityHours: 40 },
    ],
    pipeline: [
      { stage: 'New', count: 9, value: 410000 },
      { stage: 'Proposal sent', count: 4, value: 265000 },
      { stage: 'Negotiation', count: 2, value: 180000 },
    ],
    waitingOnYou:
      user.role === 'SUPER_ADMIN'
        ? [
            { id: 'w1', kind: 'PAYOUT', text: 'Influencer payout of ₹45,000 is above the deputy limit' },
            { id: 'w2', kind: 'PAUSE', text: 'Nova Clinics invoice 17 days overdue: pause work?' },
            { id: 'w3', kind: 'DISCOUNT', text: '10% renewal discount requested for Terra Foods' },
          ]
        : [{ id: 'w4', kind: 'LEAVE', text: 'Rahul Nair requests leave next Monday and Tuesday' }],
  };
}

export function clientDashboard(user: User): ClientDashboard {
  requireArea(user, 'client');
  const org = user.organisationId;
  const visible = projects.filter((p) => p.status === 'ACTIVE' && canSeeProject(user, p));
  const visibleNames = new Set(visible.map((p) => p.name));
  const canSeeBilling = user.role === 'CLIENT_OWNER';
  return {
    accountManager: { name: 'Kavya Iyer', email: 'kavya@webinger.in', phone: '+91 98XXX XX210', hours: 'Mon–Sat, 10:00–19:00' },
    projects: visible.slice(0, 6).map(toSummary),
    approvals: approvals.filter((a) => a.organisationId === org && visibleNames.has(a.projectName)).map((a) => strip(a, 'organisationId')),
    unpaidInvoices: canSeeBilling
      ? invoices.filter((i) => i.organisationId === org && i.status !== 'PAID').map((i) => strip(i, 'organisationId'))
      : [],
    resultsPeriod: 'October 2026',
    results: [
      { label: 'Instagram reach', value: '1.84 L', change: '+22%', good: true },
      { label: 'Engagement rate', value: '4.1%', change: '+0.6 pts', good: true },
      { label: 'Website visits', value: '12,460', change: '+9%', good: true },
      { label: 'Leads', value: '86', change: '−4%', good: false },
    ],
    messages: messages
      .filter((m) => m.organisationId === org && m.toUserId === user.id && visibleNames.has(m.projectName))
      .map((m) => strip(m, 'organisationId', 'toUserId')),
    offer: {
      id: 'o1',
      title: 'Add influencer marketing',
      text: 'Reach food lovers in your city through verified local creators.',
      cta: 'Learn more',
    },
  };
}

export function employeeDashboard(user: User): EmployeeDashboard {
  requireArea(user, 'employee');
  const mine = tasks.filter((t) => t.assigneeId === user.id && t.status !== 'DONE');
  return {
    today: mine.filter((t) => t.due <= day(0)).map(toTaskItem),
    thisWeek: mine.filter((t) => t.due > day(0) && t.due <= day(7)).map(toTaskItem),
    reviewQueue: tasks.filter((t) => t.reviewerId === user.id && t.status === 'IN_REVIEW').map(toTaskItem),
    messages: messages.filter((m) => m.toUserId === user.id).map((m) => strip(m, 'organisationId', 'toUserId')),
    scorecard: { onTimeRate: 92, firstPassQuality: 78, clientRating: 4.6, hoursLogged: 31, hoursCapacity: 40 },
    announcements: [
      { id: 'n1', title: 'Office closed on 25 December', at: day(-1) },
      { id: 'n2', title: 'New brand vault rules: always use the latest logo file', at: day(-4) },
    ],
  };
}

export function influencerDashboard(user: User): InfluencerDashboard {
  requireArea(user, 'influencer');
  return {
    verification: 'VERIFIED',
    profileCompleteness: 85,
    invites: [{ id: 'c1', brand: 'Terra Foods', campaign: 'Winter menu launch', deliverable: '1 reel + 3 stories', fee: 18000, respondBy: day(2) }],
    active: [{ id: 'c2', brand: 'Nova Clinics', campaign: 'Skin care awareness', step: 'Draft due for approval', due: day(1) }],
    payouts: { pending: 12000, paidThisYear: 146000 },
  };
}

export function partnerDashboard(user: User): PartnerDashboard {
  requireArea(user, 'partner');
  return {
    briefs: [
      { id: 'b1', title: 'Product shoot: 12 dishes', projectName: 'Social media retainer', due: day(4), status: 'IN_PROGRESS' },
      { id: 'b2', title: 'Clinic interior photos', projectName: 'Brand identity', due: day(10), status: 'NEW' },
    ],
    invoices: [{ id: 'pi1', number: 'LW-0441', amount: 24000, status: 'SENT' }],
  };
}

/* -------------------------------------------------------------- projects */

/** GET /projects */
export function listProjects(user: User, query: ProjectQuery = {}): ProjectPage {
  // BACKEND: influencers and partners have no project list (partners get shared briefs in Week 7).
  if (!isStaff(user) && !isClient(user)) throw forbidden();

  const visible = projects.filter((p) => canSeeProject(user, p));
  const q = query.q?.trim().toLowerCase();
  const filtered = visible.filter((p) => {
    if (query.status && p.status !== query.status) return false;
    if (query.health && p.health !== query.health) return false;
    if (query.clientId && p.organisationId !== query.clientId) return false;
    if (query.service && p.service !== query.service) return false;
    if (query.ownerId && p.ownerId !== query.ownerId) return false;
    if (q) {
      const hay = `${p.name} ${CLIENT_NAME[p.organisationId] ?? ''} ${p.service} ${nameOf(p.ownerId)}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  // Default order: active first, then most at-risk, then name.
  filtered.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health] ||
      a.name.localeCompare(b.name),
  );

  const size = Math.min(Math.max(query.size ?? 20, 1), 100);
  const totalPages = Math.max(1, Math.ceil(filtered.length / size));
  const page = Math.min(Math.max(query.page ?? 0, 0), totalPages - 1);

  // Facets come from everything the caller may see, not just the current page.
  const owners = new Map(visible.map((p) => [p.ownerId, nameOf(p.ownerId)]));
  const clients = new Map(visible.map((p) => [p.organisationId, CLIENT_NAME[p.organisationId] ?? 'Internal']));
  return {
    items: filtered.slice(page * size, page * size + size).map((p) => toListItem(user, p)),
    page,
    size,
    totalItems: filtered.length,
    totalPages,
    facets: {
      services: [...new Set(visible.map((p) => p.service))].sort(),
      owners: [...owners].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
      clients: [...clients].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    },
  };
}

/** GET /projects/{id} */
export function getProject(user: User, id: string): ProjectDetail {
  if (!isStaff(user) && !isClient(user)) throw forbidden();
  const p = findProject(user, id);
  const client = isClient(user);

  const team: TeamMember[] = p.memberIds
    .map((mid) => userById(mid))
    .filter((u): u is User => !!u)
    .map((u) => ({
      id: u.id,
      name: u.name,
      title: u.title ?? '',
      projectRole: u.id === p.ownerId ? 'OWNER' : u.id === p.backupId ? 'BACKUP' : isStaff(u) ? 'MEMBER' : 'CLIENT',
    }));
  if (!team.some((m) => m.id === p.ownerId)) {
    const o = userById(p.ownerId);
    if (o) team.unshift({ id: o.id, name: o.name, title: o.title ?? '', projectRole: 'OWNER' });
  }
  const roleOrder = { OWNER: 0, BACKUP: 1, MEMBER: 2, CLIENT: 3 };
  team.sort((a, b) => roleOrder[a.projectRole] - roleOrder[b.projectRole]);

  const detail: ProjectDetail = {
    ...toListItem(user, p),
    scope: p.scope,
    milestones: [...p.milestones]
      .sort((a, b) => a.due.localeCompare(b.due))
      .map((m) => ({ ...m, status: milestoneStatus(m) })),
    deliverables: [...p.deliverables].sort((a, b) => a.due.localeCompare(b.due)),
    // BACKEND: clients see their own people and the agency contacts, never other client companies.
    team: client ? team.filter((m) => m.projectRole !== 'CLIENT' || userById(m.id)?.organisationId === user.organisationId) : team,
    // BACKEND: client roles only ever receive CLIENT-visible activity.
    activity: [...p.activity]
      .filter((a) => !client || a.visibility === 'CLIENT')
      .sort((a, b) => b.at.localeCompare(a.at)),
  };
  if (!client) {
    // BACKEND: internal tasks are never serialised for client roles.
    detail.tasks = tasks.filter((t) => t.projectId === p.id).map(toTaskItem);
  }
  if (isAdminArea(user)) {
    detail.budgetHours = p.budgetHours;
    detail.hoursUsed = p.hoursUsed;
  }
  return detail;
}

/* ----------------------------------------------------------------- tasks */

function toTaskItem(t: TaskRow): TaskItem {
  const p = projects.find((x) => x.id === t.projectId)!;
  return {
    id: t.id,
    title: t.title,
    projectId: t.projectId,
    projectName: p.name,
    clientName: CLIENT_NAME[p.organisationId] ?? 'Internal',
    status: t.status,
    priority: t.priority,
    due: t.due,
    assigneeId: t.assigneeId,
    assigneeName: nameOf(t.assigneeId),
    checklistDone: t.checklist.filter((c) => c.done).length,
    checklistTotal: t.checklist.length,
    commentCount: t.comments.length,
  };
}

const toTaskDetail = (t: TaskRow): TaskDetail => ({
  ...toTaskItem(t),
  description: t.description,
  reviewerId: t.reviewerId,
  reviewerName: t.reviewerId ? nameOf(t.reviewerId) : undefined,
  clientFacing: t.clientFacing,
  checklist: t.checklist,
  files: t.files,
  comments: [...t.comments].sort((a, b) => a.at.localeCompare(b.at)),
  createdAt: t.createdAt,
});

/**
 * BACKEND: tasks are internal. Only staff may read them.
 * Admin area sees all; employees see tasks they are assigned to or review,
 * and tasks of projects they are a member of.
 */
function canSeeTask(user: User, t: TaskRow): boolean {
  if (isAdminArea(user)) return true;
  if (user.role !== 'EMPLOYEE') return false;
  if (t.assigneeId === user.id || t.reviewerId === user.id) return true;
  const p = projects.find((x) => x.id === t.projectId);
  return !!p && p.memberIds.includes(user.id);
}

function findTask(user: User, id: string): TaskRow {
  if (!isStaff(user)) throw forbidden('Tasks are internal to the agency team.');
  const t = tasks.find((x) => x.id === id);
  if (!t || !canSeeTask(user, t)) throw notFound('Task');
  return t;
}

/** GET /tasks */
export function listTasks(user: User, query: TaskQuery = {}): TaskItem[] {
  // BACKEND: clients see milestones and deliverables, never internal tasks.
  if (!isStaff(user)) throw forbidden('Tasks are internal to the agency team.');
  if (query.projectId) findProject(user, query.projectId); // 404 if not visible
  return tasks
    .filter((t) => {
      if (query.mine && t.assigneeId !== user.id) return false;
      if (query.projectId && t.projectId !== query.projectId) return false;
      if (query.status && t.status !== query.status) return false;
      // Employees without a filter get their own work plus what they review.
      if (!query.mine && !query.projectId && user.role === 'EMPLOYEE') return t.assigneeId === user.id || t.reviewerId === user.id;
      return canSeeTask(user, t);
    })
    .sort((a, b) => a.due.localeCompare(b.due))
    .map(toTaskItem);
}

/** GET /tasks/{id} */
export function getTask(user: User, id: string): TaskDetail {
  return toTaskDetail(findTask(user, id));
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  IN_REVIEW: 'In review',
  CLIENT_APPROVAL: 'With client',
  DONE: 'Done',
};

function log(projectId: string, actor: User, text: string, visibility: 'INTERNAL' | 'CLIENT' = 'INTERNAL') {
  const p = projects.find((x) => x.id === projectId);
  p?.activity.push({ id: `act${Date.now()}${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), actor: actor.name, text, visibility });
}

/** PATCH /tasks/{id} */
export function patchTask(user: User, id: string, patch: TaskPatch): TaskDetail {
  const t = findTask(user, id);
  const admin = isAdminArea(user);

  // BACKEND: only the admin area reassigns work or moves due dates.
  if ((patch.assigneeId !== undefined || patch.due !== undefined) && !admin) {
    throw forbidden('Only a manager can change the assignee or due date.');
  }
  if (patch.assigneeId !== undefined) {
    const to = userById(patch.assigneeId);
    if (!to || !isStaff(to)) throw badRequest('Assignee must be a member of the agency team.');
  }
  if (patch.due !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(patch.due)) throw badRequest('Due date must be YYYY-MM-DD.');

  if (patch.status !== undefined && patch.status !== t.status) {
    const isAssignee = t.assigneeId === user.id;
    const isReviewer = t.reviewerId === user.id;
    if (!admin && !isAssignee && !isReviewer) throw forbidden('Only the assignee, reviewer or a manager can move this task.');
    // BACKEND: internal review rule. Client-facing work cannot skip the reviewer.
    const pastReview = patch.status === 'CLIENT_APPROVAL' || patch.status === 'DONE';
    if (t.clientFacing && pastReview && !admin && !isReviewer) {
      throw conflict(`"${t.title}" is client-facing, so it must pass internal review first. Move it to In review and ${t.reviewerId ? nameOf(t.reviewerId) : 'a reviewer'} will pass it on.`);
    }
    const from = t.status;
    t.status = patch.status;
    log(t.projectId, user, `Moved "${t.title}" from ${STATUS_LABEL[from]} to ${STATUS_LABEL[patch.status]}`);
    if (patch.status === 'CLIENT_APPROVAL') log(t.projectId, user, `Sent "${t.title}" for your approval`, 'CLIENT');
  }
  if (patch.assigneeId !== undefined && patch.assigneeId !== t.assigneeId) {
    t.assigneeId = patch.assigneeId;
    log(t.projectId, user, `Assigned "${t.title}" to ${nameOf(patch.assigneeId)}`);
  }
  if (patch.due !== undefined && patch.due !== t.due) {
    t.due = patch.due;
    log(t.projectId, user, `Moved the due date of "${t.title}" to ${patch.due}`);
  }
  return toTaskDetail(t);
}

/** PATCH /tasks/{id}/checklist/{itemId} */
export function setChecklistItem(user: User, taskId: string, itemId: string, done: boolean): TaskDetail {
  const t = findTask(user, taskId);
  if (!isAdminArea(user) && t.assigneeId !== user.id && t.reviewerId !== user.id) {
    throw forbidden('Only the assignee, reviewer or a manager can tick the checklist.');
  }
  const item = t.checklist.find((c) => c.id === itemId);
  if (!item) throw notFound('Checklist item');
  item.done = done;
  return toTaskDetail(t);
}

/** POST /tasks/{id}/comments */
export function addComment(user: User, taskId: string, body: NewComment): TaskComment {
  const t = findTask(user, taskId);
  const text = body.text?.trim() ?? '';
  if (!text) throw badRequest('Write a comment first.');
  if (text.length > 2000) throw badRequest('Comments can be at most 2,000 characters.');
  if (body.visibility !== 'INTERNAL' && body.visibility !== 'CLIENT') throw badRequest('Visibility must be INTERNAL or CLIENT.');
  const c: TaskComment = {
    id: `cm${Date.now()}`,
    authorId: user.id,
    author: user.name,
    at: new Date().toISOString(),
    text,
    visibility: body.visibility,
  };
  t.comments.push(c);
  return c;
}
