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
  Permission,
  ProjectSummary,
  ReviewInput,
  TaskComment,
  TaskDetail,
  TaskItem,
  TaskPatch,
  TaskQuery,
  TaskStatus,
  TeamMember,
  User,
} from '@/types';
import { post } from './art';
// Circular with chat.ts on purpose: both only call each other inside functions.
import { previewsFor } from './chat';
import { accountManagerOf } from './clients';
import { balanceOf, daysLateOf, invoiceSummary, recurringRevenue, unpaidInvoices, invoicedThisMonth } from './finance';
import { latestResults } from './reports';
import { dashboardPipeline } from './pipeline';
import { dashboardScorecard, teamLoad } from './people';
import { influencerHome, payoutsNeedingOwner } from './influencers';
import { partnerHome } from './partners';
import { offerFor } from './offers';
import {
  approvals,
  CLIENT_NAME,
  day,
  nameOf,
  ORG,
  projects,
  settings,
  tasks,
  userById,
} from './data';
import type { MilestoneRow, ProjectRow, TaskRow, UserRow } from './data';

/* ---------------------------------------------------------------- errors */

export const forbidden = (detail = 'Your role cannot open this page.') => new ApiError({ status: 403, title: 'Forbidden', detail });
// BACKEND: answer 404, not 403, for records in another organisation, so ids cannot be probed.
export const notFound = (what: string) => new ApiError({ status: 404, title: 'Not Found', detail: `${what} not found.` });
export const badRequest = (detail: string) => new ApiError({ status: 400, title: 'Bad Request', detail });
export const conflict = (detail: string) => new ApiError({ status: 409, title: 'Conflict', detail });

function requireArea(user: User, area: Area) {
  if (AREA_BY_ROLE[user.role] !== area) throw forbidden();
}

export const isAdminArea = (u: User) => u.role === 'SUPER_ADMIN' || u.role === 'MANAGER';
export const isStaff = (u: User) => u.organisationId === ORG.WEBINGER;
export const isClient = (u: User) => u.role === 'CLIENT_OWNER' || u.role === 'CLIENT_REP';

/* ----------------------------------------------------------- permissions */

/** BACKEND: grants on top of the role. Client owners always have both; reps get billing only if the owner allows it. */
export function permissionsOf(row: UserRow): Permission[] {
  if (row.role === 'CLIENT_OWNER') return ['BILLING_VIEW', 'TEAM_MANAGE'];
  if (row.role === 'CLIENT_REP' && row.canSeeBilling) return ['BILLING_VIEW'];
  return [];
}

/** The only shape of a user that leaves the API. Never status internals, never passwords. */
export const toPublicUser = (row: UserRow): User => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  organisationId: row.organisationId,
  organisationName: row.organisationName,
  title: row.title,
  permissions: permissionsOf(row),
});

export const hasPermission = (u: User, p: Permission) => !!u.permissions?.includes(p);

/* ------------------------------------------------------- project access */

/**
 * BACKEND: the single rule for "may this caller see this project". Use it in
 * the repository query (WHERE clause), never by filtering after loading.
 */
export function canSeeProject(user: User, p: ProjectRow): boolean {
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

export function findProject(user: User, id: string): ProjectRow {
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

export function toListItem(user: User, p: ProjectRow): ProjectListItem {
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
  const unpaid = unpaidInvoices();
  const overdue = unpaid.filter((i) => daysLateOf(i) > 0).sort((a, b) => daysLateOf(b) - daysLateOf(a));
  const live = projects.filter((p) => p.status === 'ACTIVE');
  return {
    revenueThisMonth: invoicedThisMonth(),
    recurringRevenue: recurringRevenue(),
    outstanding: unpaid.reduce((s, i) => s + balanceOf(i), 0),
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
    overdueInvoices: overdue.map(invoiceSummary),
    // Week 6: planned hours this week from open tasks, and the live sales pipeline.
    teamLoad: teamLoad(),
    pipeline: dashboardPipeline(),
    waitingOnYou:
      user.role === 'SUPER_ADMIN'
        ? [
            // Week 7: live list of influencer payouts above the deputy limit.
            ...payoutsNeedingOwner(),
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
  // BACKEND: billing needs the BILLING_VIEW permission (owners always; reps only if granted).
  const canSeeBilling = hasPermission(user, 'BILLING_VIEW');
  return {
    // The card follows the client record (Admin → Clients → account manager).
    accountManager: (() => {
      const am = accountManagerOf(org) ?? userById('u-mgr')!;
      return { name: am.name, email: am.email, phone: '+91 98XXX XX210', hours: 'Mon–Sat, 10:00–19:00' };
    })(),
    projects: visible.slice(0, 6).map(toSummary),
    approvals: approvals
      .filter((a) => a.status === 'PENDING' && a.organisationId === org && projects.some((p) => p.id === a.projectId && canSeeProject(user, p)))
      .map((a) => {
        const latest = a.versions[a.versions.length - 1];
        return {
          id: a.id,
          title: a.title,
          projectName: projects.find((p) => p.id === a.projectId)!.name,
          submittedAt: latest.submittedAt,
          revisionsUsed: a.revisionsUsed,
          revisionsAllowed: a.revisionsAllowed,
        };
      }),
    unpaidInvoices: canSeeBilling
      ? unpaidInvoices(org).sort((a, b) => a.due.localeCompare(b.due)).map(invoiceSummary)
      : [],
    // Headline numbers from the latest published monthly report (Week 5).
    ...latestResults(user),
    messages: previewsFor(user),
    // Week 7: one offer for a service this client doesn't buy yet (Admin → Offers).
    offer: offerFor(user),
  };
}

export function employeeDashboard(user: User): EmployeeDashboard {
  requireArea(user, 'employee');
  const mine = tasks.filter((t) => t.assigneeId === user.id && t.status !== 'DONE');
  return {
    today: mine.filter((t) => t.due <= day(0)).map(toTaskItem),
    thisWeek: mine.filter((t) => t.due > day(0) && t.due <= day(7)).map(toTaskItem),
    reviewQueue: tasks.filter((t) => t.reviewerId === user.id && t.status === 'IN_REVIEW').map(toTaskItem),
    messages: previewsFor(user),
    // Week 6: the same measures as My performance; hours from the timesheet.
    scorecard: dashboardScorecard(user),
    announcements: [
      { id: 'n1', title: 'Office closed on 25 December', at: day(-1) },
      { id: 'n2', title: 'New brand vault rules: always use the latest logo file', at: day(-4) },
    ],
  };
}

export function influencerDashboard(user: User): InfluencerDashboard {
  requireArea(user, 'influencer');
  return influencerHome(user);
}

export function partnerDashboard(user: User): PartnerDashboard {
  requireArea(user, 'partner');
  return partnerHome(user);
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
    // BACKEND: only active accounts appear in a project's team; pending or suspended people stay hidden.
    .filter((u): u is UserRow => !!u && u.status === 'ACTIVE')
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

export function toTaskItem(t: TaskRow): TaskItem {
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
    reviewerId: t.reviewerId,
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

export function log(projectId: string, actor: User, text: string, visibility: 'INTERNAL' | 'CLIENT' = 'INTERNAL') {
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
    log(t.projectId, user, `Moved "${t.title}" from ${STATUS_LABEL[from]} to ${STATUS_LABEL[patch.status]}`);
    // BACKEND: "With client" always goes through sendToClient, so an approval version exists for the client to act on.
    if (patch.status === 'CLIENT_APPROVAL' && t.clientFacing) sendToClient(t, user);
    else t.status = patch.status;
    t.completedAt = t.status === 'DONE' ? day(0) : undefined;
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

/**
 * Puts a task's deliverable in front of the client as a new approval version.
 * Creates the deliverable and the approval on first use. Phase 1: the version's
 * files are the task's files marked client-visible; the demo draws placeholder art.
 */
export function sendToClient(t: TaskRow, actor: User, note?: string) {
  const p = projects.find((x) => x.id === t.projectId)!;
  let d = p.deliverables.find((x) => x.id === t.deliverableId);
  if (!d) {
    d = {
      id: `${p.id}d${Date.now().toString(36)}`,
      title: t.title,
      status: 'PLANNED',
      due: t.due,
      revisionsUsed: 0,
      revisionsAllowed: settings.defaultRevisions,
    };
    p.deliverables.push(d);
    t.deliverableId = d.id;
  }
  let a = approvals.find((x) => x.deliverableId === d.id);
  if (a?.status === 'PENDING') throw conflict(`"${d.title}" is already waiting for the client.`);
  if (!a) {
    a = {
      id: `a${Date.now().toString(36)}`,
      organisationId: p.organisationId,
      projectId: p.id,
      deliverableId: d.id,
      title: d.title,
      kind: 'IMAGE',
      status: 'PENDING',
      revisionsUsed: d.revisionsUsed,
      revisionsAllowed: d.revisionsAllowed,
      versions: [],
      comments: [],
    };
    approvals.push(a);
  }
  const n = a.versions.length + 1;
  const headline = d.title.split(' ').slice(0, 3).join(' ');
  a.versions.push({
    id: `${a.id}v${n}`,
    number: n,
    fileName: `${d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-v${n}.png`,
    pages: [post(headline, (CLIENT_NAME[p.organisationId] ?? '').split(' ')[0].toUpperCase(), 1, n - 1)],
    submittedAt: new Date().toISOString(),
    submittedBy: nameOf(t.assigneeId),
    note,
  });
  a.status = 'PENDING';
  d.status = 'CLIENT_APPROVAL';
  t.status = 'CLIENT_APPROVAL';
  log(p.id, actor, `Sent "${d.title}" (version ${n}) for your approval`, 'CLIENT');
}

/** POST /tasks/{id}/review */
export function reviewTask(user: User, id: string, input: ReviewInput): TaskDetail {
  const t = findTask(user, id);
  // BACKEND: only the named reviewer or the admin area can pass or fail a review.
  if (!isAdminArea(user) && t.reviewerId !== user.id) throw forbidden('Only the reviewer or a manager can review this task.');
  if (t.status !== 'IN_REVIEW') throw conflict(`"${t.title}" is not waiting for review any more.`);
  const note = input.note?.trim() ?? '';
  if (input.result !== 'PASS' && input.result !== 'FAIL') throw badRequest('Result must be PASS or FAIL.');
  if (input.result === 'FAIL' && note.length < 5) throw badRequest('Tell the assignee what to fix (at least a few words).');
  if (note.length > 2000) throw badRequest('Review notes can be at most 2,000 characters.');

  const comment = (text: string) =>
    t.comments.push({ id: `cm${Date.now()}`, authorId: user.id, author: user.name, at: new Date().toISOString(), text, visibility: 'INTERNAL' });

  if (input.result === 'PASS') {
    if (note) comment(`Review passed: ${note}`);
    log(t.projectId, user, `Passed internal review on "${t.title}"`);
    if (t.clientFacing) sendToClient(t, user);
    else {
      t.status = 'DONE';
      t.completedAt = day(0);
    }
  } else {
    comment(`Sent back: ${note}`);
    t.status = 'IN_PROGRESS';
    t.reviewFailures += 1;
    log(t.projectId, user, `Sent "${t.title}" back to ${nameOf(t.assigneeId)} after review`);
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
