/**
 * Mock people API (Week 6): team list, attendance, leave (with task handover), workload and scorecards.
 *
 * Admin area (Super Admin, Manager) sees the team; everyone on staff sees and changes only their own
 * attendance and leave through /me/*. Cost rates and salaries never appear here.
 * Comments starting with "BACKEND:" are rules the Spring Boot service must enforce.
 */
import type {
  AffectedTask,
  AttendanceDay,
  AttendanceWeek,
  LeaveBalance,
  LeaveDecisionInput,
  LeaveRequest,
  LeaveType,
  MyAttendance,
  MyLeave,
  NewLeave,
  PersonItem,
  Scorecard,
  User,
  Workload,
  WorkloadRow,
} from '@/types';
import { clientRows } from './clients';
import { day, nameOf, projects, tasks, userById, users } from './data';
import type { TaskRow } from './data';
import {
  addDays,
  attendance,
  DELIVERY,
  DEPARTMENT,
  HOLIDAYS,
  holidayOn,
  HOURS_PER_DAY,
  isWorkingDay,
  LEAVE_ALLOWANCE,
  leaves,
  responseMinutes,
  scoreSnapshots,
  submittedWeeks,
  timeEntries,
  weekStartOf,
} from './data6';
import type { LeaveRow } from './data6';
import { badRequest, conflict, forbidden, isAdminArea, isStaff, log, notFound } from './handlers';

const today = () => day(0);
const nowIso = () => new Date().toISOString();
const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const nowTime = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

function requireAdminArea(user: User) {
  // BACKEND: Phase 1 managers see only people in their teams; in the demo Kavya manages everyone.
  if (!isAdminArea(user)) throw forbidden('Only Super Admins and Managers can open People.');
}
function requireStaff(user: User) {
  if (!isStaff(user)) throw forbidden('Attendance, leave and timesheets are for the Webinger team.');
}

const datesBetween = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};
export const workingDaysBetween = (from: string, to: string) => datesBetween(from, to).filter(isWorkingDay);
export const weekDays = (weekStart: string) => datesBetween(weekStart, addDays(weekStart, 6));

/* ----------------------------------------------------------- attendance */

const approvedLeaveOn = (userId: string, iso: string) =>
  leaves.find((l) => l.userId === userId && l.status === 'APPROVED' && l.from <= iso && l.to >= iso);

/** BACKEND: the day's status is derived: approved leave beats a missing check-in; past working days with nothing are ABSENT. */
export function dayStatus(userId: string, iso: string): AttendanceDay {
  const h = holidayOn(iso);
  if (h) return { date: iso, status: 'HOLIDAY', holiday: h.name };
  if (!isWorkingDay(iso)) return { date: iso, status: 'OFF' };
  if (approvedLeaveOn(userId, iso)) return { date: iso, status: 'LEAVE' };
  const rec = attendance.find((a) => a.userId === userId && a.date === iso);
  if (rec) return { date: iso, status: rec.mode === 'WFH' ? 'WFH' : 'PRESENT', checkIn: rec.checkIn, checkOut: rec.checkOut };
  return { date: iso, status: iso < today() ? 'ABSENT' : 'UPCOMING' };
}

/** GET /me/attendance: today plus this calendar month. */
export function myAttendance(user: User): MyAttendance {
  requireStaff(user);
  const start = `${today().slice(0, 7)}-01`;
  const month = datesBetween(start, today()).map((d) => dayStatus(user.id, d));
  const count = (s: AttendanceDay['status']) => month.filter((d) => d.status === s).length;
  return { today: dayStatus(user.id, today()), month, summary: { present: count('PRESENT'), wfh: count('WFH'), leave: count('LEAVE'), absent: count('ABSENT') } };
}

/** POST /me/attendance/check-in { mode }. Once a day, on working days, not on approved leave. */
export function checkIn(user: User, mode: 'OFFICE' | 'WFH'): MyAttendance {
  requireStaff(user);
  if (mode !== 'OFFICE' && mode !== 'WFH') throw badRequest('Office or work from home?');
  const d = today();
  if (!isWorkingDay(d)) throw conflict('Today is not a working day.');
  if (approvedLeaveOn(user.id, d)) throw conflict('You are on approved leave today. Cancel the leave first if you are working.');
  if (attendance.some((a) => a.userId === user.id && a.date === d)) throw conflict('You have already checked in today.');
  attendance.push({ userId: user.id, date: d, mode, checkIn: nowTime() });
  return myAttendance(user);
}

/** POST /me/attendance/check-out */
export function checkOut(user: User): MyAttendance {
  requireStaff(user);
  const rec = attendance.find((a) => a.userId === user.id && a.date === today());
  if (!rec) throw conflict('Check in first.');
  if (rec.checkOut) throw conflict('You have already checked out today.');
  rec.checkOut = nowTime();
  return myAttendance(user);
}

/** GET /people/attendance?week=yyyy-mm-dd (any day of the week). */
export function attendanceWeek(user: User, week = today()): AttendanceWeek {
  requireAdminArea(user);
  if (!DATE_RE.test(week)) throw badRequest('Week looks like 2026-11-16.');
  const start = weekStartOf(week);
  const days = weekDays(start);
  return {
    weekStart: start,
    days,
    people: staffRows().map((u) => ({ id: u.id, name: u.name, department: DEPARTMENT[u.id] ?? 'Team', days: days.map((d) => dayStatus(u.id, d)) })),
  };
}

const staffRows = () => users.filter((u) => isStaff(u) && u.status === 'ACTIVE' && DELIVERY.includes(u.id));

/* ---------------------------------------------------------------- leave */

const leaveDays = (l: Pick<LeaveRow, 'from' | 'to'>) => workingDaysBetween(l.from, l.to).length;

function balancesOf(userId: string): LeaveBalance[] {
  const year = today().slice(0, 4);
  const mine = leaves.filter((l) => l.userId === userId && l.from.startsWith(year));
  return (['CASUAL', 'SICK', 'EARNED', 'UNPAID'] as LeaveType[]).map((type) => {
    const used = mine.filter((l) => l.type === type && l.status === 'APPROVED').reduce((n, l) => n + leaveDays(l), 0);
    const pending = mine.filter((l) => l.type === type && l.status === 'PENDING').reduce((n, l) => n + leaveDays(l), 0);
    const allowance = type === 'UNPAID' ? 0 : LEAVE_ALLOWANCE[type];
    return { type, allowance, used, pending, left: type === 'UNPAID' ? 0 : Math.max(0, allowance - used - pending) };
  });
}

const PRIORITY_HOURS: Record<TaskRow['priority'], number> = { HIGH: 6, MEDIUM: 4, LOW: 2 };
/** Estimated hours left on an open task (Phase 2: a real estimate field on the task). */
export const taskHours = (t: TaskRow) => PRIORITY_HOURS[t.priority];
/** Waiting on the client: not the employee's work right now (clock stopped). */
const isOpenWork = (t: TaskRow) => t.status !== 'DONE' && t.status !== 'CLIENT_APPROVAL';

/** Planned hours for one person between two dates (overdue work counts in the current week). */
function plannedBetween(userId: string, from: string, to: string) {
  return tasks.filter((t) => t.assigneeId === userId && isOpenWork(t) && t.due <= to && (t.due >= from || from <= today())).reduce((n, t) => n + taskHours(t), 0);
}

function suggestFor(t: TaskRow, awayId: string): AffectedTask['suggested'] {
  const dept = DEPARTMENT[awayId];
  const ws = weekStartOf(t.due);
  const candidates = staffRows()
    .filter((u) => u.id !== awayId && !approvedLeaveOn(u.id, t.due))
    .map((u) => ({ u, sameDept: DEPARTMENT[u.id] === dept, load: plannedBetween(u.id, ws, addDays(ws, 6)) }))
    .sort((a, b) => Number(b.sameDept) - Number(a.sameDept) || a.load - b.load);
  const pick = candidates[0]?.u;
  return pick ? { id: pick.id, name: pick.name } : undefined;
}

/** Automation rule 13: the open tasks due while someone is away (plus the working day after). */
function affectedTasks(l: LeaveRow): AffectedTask[] {
  const until = workingDaysBetween(addDays(l.to, 1), addDays(l.to, 7))[0] ?? l.to;
  return tasks
    .filter((t) => t.assigneeId === l.userId && isOpenWork(t) && t.due >= l.from && t.due <= until)
    .sort((a, b) => a.due.localeCompare(b.due))
    .map((t) => ({ id: t.id, title: t.title, due: t.due, projectName: projects.find((p) => p.id === t.projectId)?.name ?? '', suggested: suggestFor(t, l.userId) }));
}

function toRequest(l: LeaveRow, withTasks: boolean): LeaveRequest {
  return {
    id: l.id,
    userId: l.userId,
    userName: nameOf(l.userId),
    department: DEPARTMENT[l.userId] ?? 'Team',
    type: l.type,
    from: l.from,
    to: l.to,
    days: leaveDays(l),
    reason: l.reason,
    status: l.status,
    createdAt: l.createdAt,
    decidedBy: l.decidedBy,
    decidedAt: l.decidedAt,
    note: l.note,
    affectedTasks: withTasks && l.status === 'PENDING' ? affectedTasks(l) : undefined,
  };
}

/** GET /me/leave */
export function myLeave(user: User): MyLeave {
  requireStaff(user);
  return {
    balances: balancesOf(user.id),
    requests: leaves.filter((l) => l.userId === user.id).sort((a, b) => b.from.localeCompare(a.from)).map((l) => toRequest(l, false)),
    holidays: HOLIDAYS.filter((h) => h.date >= today()).slice(0, 5),
  };
}

/** POST /me/leave */
export function requestLeave(user: User, input: NewLeave): LeaveRequest {
  requireStaff(user);
  if (!['CASUAL', 'SICK', 'EARNED', 'UNPAID'].includes(input.type)) throw badRequest('Choose a leave type.');
  if (!DATE_RE.test(input.from ?? '') || !DATE_RE.test(input.to ?? '')) throw badRequest('Choose the dates.');
  if (input.to < input.from) throw badRequest('The last day is before the first day.');
  // BACKEND: sick leave can be recorded up to 7 days late; everything else is applied for in advance.
  const earliest = input.type === 'SICK' ? addDays(today(), -7) : today();
  if (input.from < earliest) throw badRequest(input.type === 'SICK' ? 'Sick leave can be recorded up to 7 days back.' : 'Leave starts today or later.');
  if (input.to > addDays(today(), 180)) throw badRequest('Apply at most six months ahead.');
  const days = workingDaysBetween(input.from, input.to).length;
  if (!days) throw badRequest('Those dates are all holidays or weekly offs.');
  if (days > 20) throw badRequest('More than 20 working days needs a conversation with your manager first.');
  if ((input.reason?.trim() ?? '').length < 3) throw badRequest('Add a short reason.');
  if (leaves.some((l) => l.userId === user.id && (l.status === 'PENDING' || l.status === 'APPROVED') && l.from <= input.to && l.to >= input.from)) {
    throw conflict('You already have leave on some of these days.');
  }
  if (input.type !== 'UNPAID') {
    const b = balancesOf(user.id).find((x) => x.type === input.type)!;
    if (days > b.left) throw conflict(`Only ${b.left} ${input.type.toLowerCase()} leave day${b.left === 1 ? '' : 's'} left. Choose unpaid leave or fewer days.`);
  }
  const row: LeaveRow = { id: uid('lv'), userId: user.id, type: input.type, from: input.from, to: input.to, reason: input.reason.trim(), status: 'PENDING', createdAt: nowIso() };
  leaves.push(row);
  return toRequest(row, false);
}

/** POST /me/leave/{id}/cancel: pending, or approved leave that has not started. */
export function cancelLeave(user: User, id: string): LeaveRequest {
  requireStaff(user);
  const l = leaves.find((x) => x.id === id && x.userId === user.id);
  if (!l) throw notFound('Leave request');
  if (l.status === 'PENDING' || (l.status === 'APPROVED' && l.from > today())) {
    l.status = 'CANCELLED';
    return toRequest(l, false);
  }
  throw conflict(l.status === 'APPROVED' ? 'Leave that has started cannot be cancelled here. Ask your manager.' : 'This request is already closed.');
}

/** GET /people/leave?status */
export function listLeave(user: User, q: { status?: LeaveRequest['status'] } = {}): LeaveRequest[] {
  requireAdminArea(user);
  return leaves
    .filter((l) => !q.status || l.status === q.status)
    .sort((a, b) => Number(b.status === 'PENDING') - Number(a.status === 'PENDING') || b.from.localeCompare(a.from))
    .map((l) => toRequest(l, true));
}

/**
 * POST /people/leave/{id}/decision
 * BACKEND: admin area; nobody approves their own leave (a manager's leave goes to a Super Admin).
 * Approving can hand over the affected tasks in the same transaction; each is logged on its project.
 */
export function decideLeave(user: User, id: string, input: LeaveDecisionInput): LeaveRequest {
  requireAdminArea(user);
  const l = leaves.find((x) => x.id === id);
  if (!l) throw notFound('Leave request');
  if (l.userId === user.id) throw forbidden('You cannot approve your own leave.');
  if (userById(l.userId)?.role === 'MANAGER' && user.role !== 'SUPER_ADMIN') throw forbidden("A manager's leave is approved by a Super Admin.");
  if (l.status !== 'PENDING') throw conflict('This request has already been decided.');
  if (input.decision === 'DECLINE') {
    if ((input.note?.trim() ?? '').length < 3) throw badRequest('Tell them why, and suggest other dates if you can.');
    l.status = 'DECLINED';
  } else if (input.decision === 'APPROVE') {
    const affected = new Set(affectedTasks(l).map((t) => t.id));
    for (const [taskId, to] of Object.entries(input.reassign ?? {})) {
      if (!affected.has(taskId)) throw badRequest('Only tasks due during the leave can be handed over here.');
      const target = userById(to);
      if (!target || !isStaff(target) || target.status !== 'ACTIVE' || to === l.userId) throw badRequest('Hand tasks to an active colleague.');
      const t = tasks.find((x) => x.id === taskId)!;
      if (approvedLeaveOn(to, t.due)) throw badRequest(`${target.name} is also away on ${t.due}.`);
    }
    for (const [taskId, to] of Object.entries(input.reassign ?? {})) {
      const t = tasks.find((x) => x.id === taskId)!;
      t.assigneeId = to;
      log(t.projectId, user, `Handed "${t.title}" to ${nameOf(to)} while ${nameOf(l.userId)} is on leave`);
    }
    l.status = 'APPROVED';
  } else {
    throw badRequest('Approve or decline.');
  }
  l.decidedBy = user.name;
  l.decidedAt = nowIso();
  l.note = input.note?.trim() || undefined;
  return toRequest(l, true);
}

/* ------------------------------------------------------------- workload */

const hoursLogged = (userId: string, from: string, to: string) =>
  timeEntries.filter((e) => e.userId === userId && e.date >= from && e.date <= to && !e.startedAt).reduce((n, e) => n + e.minutes, 0) / 60;

function capacity(userId: string, from: string, to: string) {
  const working = workingDaysBetween(from, to);
  const leaveDaysN = working.filter((d) => approvedLeaveOn(userId, d)).length;
  return { capacityHours: working.length * HOURS_PER_DAY, leaveHours: leaveDaysN * HOURS_PER_DAY };
}

function workloadRow(userId: string, weekStart: string): WorkloadRow {
  const end = addDays(weekStart, 6);
  const { capacityHours, leaveHours } = capacity(userId, weekStart, end);
  const mine = tasks
    .filter((t) => t.assigneeId === userId && isOpenWork(t) && t.due <= end && (t.due >= weekStart || weekStart <= today()))
    .sort((a, b) => a.due.localeCompare(b.due));
  const planned = mine.reduce((n, t) => n + taskHours(t), 0);
  const available = Math.max(0, capacityHours - leaveHours);
  return {
    id: userId,
    name: nameOf(userId),
    department: DEPARTMENT[userId] ?? 'Team',
    capacityHours,
    leaveHours,
    plannedHours: planned,
    loggedHours: Math.round(hoursLogged(userId, weekStart, end) * 10) / 10,
    load: available ? Math.round((planned / available) * 100) / 100 : planned ? 9.99 : 0,
    timesheet: submittedWeeks.has(`${userId}:${weekStart}`) ? 'SUBMITTED' : 'OPEN',
    tasks: mine.map((t) => ({ id: t.id, title: t.title, due: t.due, hours: taskHours(t), projectName: projects.find((p) => p.id === t.projectId)?.name ?? '' })),
  };
}

/** GET /people/workload?week */
export function workload(user: User, week = today()): Workload {
  requireAdminArea(user);
  if (!DATE_RE.test(week)) throw badRequest('Week looks like 2026-11-16.');
  const start = weekStartOf(week);
  return { weekStart: start, rows: staffRows().map((u) => workloadRow(u.id, start)).sort((a, b) => b.load - a.load) };
}

/** Admin dashboard "Team load" (Week 1 shape). */
export function teamLoad() {
  const start = weekStartOf(today());
  return staffRows()
    .filter((u) => u.role === 'EMPLOYEE')
    .map((u) => {
      const r = workloadRow(u.id, start);
      return { name: r.name, department: r.department, assignedHours: r.plannedHours, capacityHours: r.capacityHours - r.leaveHours };
    });
}

/* --------------------------------------------------------------- people */

/** GET /people */
export function listPeople(user: User): PersonItem[] {
  requireAdminArea(user);
  const ws = weekStartOf(today());
  return users
    .filter((u) => isStaff(u) && u.status !== 'SUSPENDED')
    .map((u) => {
      const w = workloadRow(u.id, ws);
      const next = leaves
        .filter((l) => l.userId === u.id && l.status === 'APPROVED' && l.to >= today() && l.from <= addDays(today(), 14))
        .sort((a, b) => a.from.localeCompare(b.from))[0];
      const open = tasks.filter((t) => t.assigneeId === u.id && t.status !== 'DONE');
      return {
        id: u.id,
        name: u.name,
        title: u.title,
        role: u.role,
        department: DEPARTMENT[u.id] ?? 'Team',
        status: u.status,
        today: dayStatus(u.id, today()),
        loggedHours: w.loggedHours,
        plannedHours: w.plannedHours,
        capacityHours: w.capacityHours - w.leaveHours,
        openTasks: open.length,
        overdueTasks: open.filter((t) => t.due < today()).length,
        nextLeave: next ? { from: next.from, to: next.to } : undefined,
      };
    })
    .sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------ scorecards */

/**
 * The measures (CLAUDE.md section 6), last 30 days:
 *   on-time = tasks done by their due date ÷ tasks that fell due. Tasks waiting on client approval are
 *             left out: the employee's clock stops while the client decides.
 *   utilisation = billable hours ÷ available hours (working days × 8, minus leave).
 *   first-pass quality = reviewed tasks with no send-back ÷ reviewed tasks.
 *   client rating = average satisfaction of clients whose projects they work on.
 * BACKEND: an employee sees only their own; the admin area sees everyone (Phase 1: managers their team).
 */
function scorecardOf(userId: string): Scorecard {
  const u = userById(userId);
  if (!u || !isStaff(u)) throw notFound('Person');
  const from = addDays(today(), -30);
  const mine = tasks.filter((t) => t.assigneeId === userId);
  const fellDue = mine.filter((t) => t.due >= from && t.due < today() && t.status !== 'CLIENT_APPROVAL');
  const onTime = fellDue.filter((t) => t.status === 'DONE' && (t.completedAt ?? t.due) <= t.due);
  const waiting = mine.filter((t) => t.status === 'CLIENT_APPROVAL').length;
  const reviewed = mine.filter((t) => t.reviewerId && (t.status === 'DONE' || t.status === 'CLIENT_APPROVAL' || t.reviewFailures > 0));
  const firstPass = reviewed.filter((t) => t.reviewFailures === 0);

  const working = workingDaysBetween(from, addDays(today(), -1));
  const available = working.filter((d) => !approvedLeaveOn(userId, d)).length * HOURS_PER_DAY;
  const billable = timeEntries.filter((e) => e.userId === userId && e.date >= from && e.date < today() && e.billable && !e.startedAt).reduce((n, e) => n + e.minutes, 0) / 60;

  const orgs = new Set(projects.filter((p) => p.status !== 'COMPLETED' && (p.memberIds.includes(userId) || p.ownerId === userId)).map((p) => p.organisationId));
  const ratings = clientRows.filter((c) => orgs.has(c.organisationId) && c.satisfaction !== undefined).map((c) => c.satisfaction!);

  const card: Scorecard = {
    userId,
    name: u.name,
    title: u.title,
    department: DEPARTMENT[userId] ?? 'Team',
    onTimeRate: fellDue.length ? onTime.length / fellDue.length : undefined,
    onTimeDone: onTime.length,
    onTimeDue: fellDue.length,
    waitingOnClient: waiting,
    utilisation: available ? Math.min(1, billable / available) : undefined,
    billableHours: Math.round(billable),
    availableHours: available,
    firstPassQuality: reviewed.length ? firstPass.length / reviewed.length : undefined,
    reviewed: reviewed.length,
    clientRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : undefined,
    responseMinutes: responseMinutes[userId],
    trend: [],
    notes: [],
  };
  card.trend = [
    ...(scoreSnapshots[userId] ?? []),
    { month: today().slice(0, 7), onTimeRate: card.onTimeRate, utilisation: card.utilisation, firstPassQuality: card.firstPassQuality, clientRating: card.clientRating },
  ];

  // Paired measures: point out when one looks good at the cost of another (CLAUDE.md: read them together).
  const n = card.notes;
  if (card.onTimeRate !== undefined && card.firstPassQuality !== undefined && card.onTimeRate >= 0.85 && card.firstPassQuality < 0.75) {
    n.push('On time, but reviewers send work back often. A final self-check before review would help.');
  }
  if (card.utilisation !== undefined && card.utilisation > 0.9) n.push('Utilisation above 90% leaves no slack for urgent client requests.');
  if (card.utilisation !== undefined && card.utilisation < 0.5) n.push('Under half of available time is billable. Check for unlogged hours or room for more work.');
  if (waiting) n.push(`${waiting} task${waiting === 1 ? ' is' : 's are'} waiting on client approval; that time does not count against on-time.`);
  if (card.responseMinutes !== undefined && card.responseMinutes > 120) n.push('Client replies take over 2 hours on average.');
  return card;
}

/** GET /people/scorecards */
export function scorecards(user: User): Scorecard[] {
  requireAdminArea(user);
  return staffRows().map((u) => scorecardOf(u.id));
}

/** GET /people/{id}/scorecard */
export function personScorecard(user: User, id: string): Scorecard {
  requireAdminArea(user);
  return scorecardOf(id);
}

/** GET /me/performance */
export function myPerformance(user: User): Scorecard {
  requireStaff(user);
  return scorecardOf(user.id);
}

/** Employee dashboard tiles (Week 1 shape). */
export function dashboardScorecard(user: User) {
  const c = scorecardOf(user.id);
  const ws = weekStartOf(today());
  const cap = capacity(user.id, ws, addDays(ws, 6));
  return {
    onTimeRate: Math.round((c.onTimeRate ?? 1) * 100),
    firstPassQuality: Math.round((c.firstPassQuality ?? 1) * 100),
    clientRating: c.clientRating ?? 0,
    hoursLogged: Math.round(hoursLogged(user.id, ws, addDays(ws, 6))),
    hoursCapacity: cap.capacityHours - cap.leaveHours,
  };
}
