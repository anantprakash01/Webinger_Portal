/**
 * Mock time tracking API (Week 6): a running timer, manual entries and the weekly timesheet.
 * Staff only, always the caller's own time. Logged hours feed project budgets (automation rule 14),
 * utilisation on scorecards, and team cost in Finance → Profit.
 * Comments starting with "BACKEND:" are rules the Spring Boot service must enforce.
 */
import type { NewTimeEntry, TimeEntry, Timesheet, TimerStart, User } from '@/types';
import { CLIENT_NAME, day, projects, tasks } from './data';
import { addDays, HOURS_PER_DAY, isWorkingDay, projectsOf, submittedWeeks, timeEntries, weekStartOf } from './data6';
import type { TimeRow } from './data6';
import { badRequest, conflict, forbidden, isStaff, log, notFound } from './handlers';
import { weekDays } from './people';

const today = () => day(0);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const uid = () => `te${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const MAX_TIMER_MIN = 10 * 60;

function requireStaff(user: User) {
  if (!isStaff(user)) throw forbidden('Timesheets are for the Webinger team.');
}

/** BACKEND: you log time only on active projects you work on (member, owner or assignee). */
function requireProject(user: User, projectId: string, taskId?: string) {
  const p = projectsOf(user.id).find((x) => x.id === projectId);
  if (!p) throw badRequest('Choose one of your active projects.');
  if (taskId && !tasks.some((t) => t.id === taskId && t.projectId === projectId)) throw badRequest('That task is not in this project.');
  return p;
}

const isLocked = (userId: string, date: string) => submittedWeeks.has(`${userId}:${weekStartOf(date)}`);

function toEntry(e: TimeRow): TimeEntry {
  const p = projects.find((x) => x.id === e.projectId);
  return {
    id: e.id,
    date: e.date,
    projectId: e.projectId,
    projectName: p?.name ?? '',
    clientName: p ? CLIENT_NAME[p.organisationId] ?? '' : '',
    taskId: e.taskId,
    taskTitle: e.taskId ? tasks.find((t) => t.id === e.taskId)?.title : undefined,
    minutes: e.startedAt ? Math.round((Date.now() - Date.parse(e.startedAt)) / 60_000) : e.minutes,
    note: e.note,
    billable: e.billable,
    running: !!e.startedAt || undefined,
    startedAt: e.startedAt,
  };
}

/** Adds hours to the project and alerts the owner at 80% and 100% of budget (automation rule 14). */
function addToBudget(user: User, projectId: string, minutes: number) {
  const p = projects.find((x) => x.id === projectId);
  if (!p) return;
  const before = p.hoursUsed / p.budgetHours;
  p.hoursUsed = Math.round((p.hoursUsed + minutes / 60) * 10) / 10;
  const after = p.hoursUsed / p.budgetHours;
  if (before < 1 && after >= 1) log(p.id, user, `Budget used up: ${p.hoursUsed} of ${p.budgetHours} hours. A manager decides on extra billing.`);
  else if (before < 0.8 && after >= 0.8) log(p.id, user, `80% of the budget is used (${p.hoursUsed} of ${p.budgetHours} hours).`);
}

/** GET /me/timesheet?week=yyyy-mm-dd */
export function myTimesheet(user: User, week = today()): Timesheet {
  requireStaff(user);
  if (!DATE_RE.test(week)) throw badRequest('Week looks like 2026-11-16.');
  const start = weekStartOf(week);
  const days = weekDays(start);
  const end = days[6];
  const mine = timeEntries.filter((e) => e.userId === user.id);
  const entries = mine.filter((e) => e.date >= start && e.date <= end && !e.startedAt).map(toEntry).sort((a, b) => a.date.localeCompare(b.date));
  const running = mine.find((e) => e.startedAt);
  const minutes = entries.reduce((n, e) => n + e.minutes, 0);
  return {
    weekStart: start,
    days,
    status: submittedWeeks.has(`${user.id}:${start}`) ? 'SUBMITTED' : 'OPEN',
    entries,
    running: running ? toEntry(running) : undefined,
    totals: {
      minutes,
      billableMinutes: entries.filter((e) => e.billable).reduce((n, e) => n + e.minutes, 0),
      capacityMinutes: days.filter(isWorkingDay).length * HOURS_PER_DAY * 60,
    },
    projects: projectsOf(user.id).map((p) => ({
      id: p.id,
      name: p.name,
      clientName: CLIENT_NAME[p.organisationId] ?? '',
      tasks: tasks.filter((t) => t.projectId === p.id && t.assigneeId === user.id && t.status !== 'DONE').map((t) => ({ id: t.id, title: t.title })),
    })),
  };
}

/** POST /me/time-entries: a manual entry. */
export function addTimeEntry(user: User, input: NewTimeEntry): TimeEntry {
  requireStaff(user);
  if (!DATE_RE.test(input.date ?? '')) throw badRequest('Choose a date.');
  if (input.date > today()) throw badRequest('You cannot log time in the future.');
  if (input.date < addDays(today(), -30)) throw badRequest('Entries older than 30 days need a manager.');
  if (isLocked(user.id, input.date)) throw conflict('That week is submitted. Ask your manager to reopen it.');
  requireProject(user, input.projectId, input.taskId);
  const minutes = Math.round(Number(input.minutes));
  if (!(minutes >= 5 && minutes <= 12 * 60)) throw badRequest('An entry is between 5 minutes and 12 hours.');
  const dayTotal = timeEntries.filter((e) => e.userId === user.id && e.date === input.date && !e.startedAt).reduce((n, e) => n + e.minutes, 0);
  if (dayTotal + minutes > 16 * 60) throw badRequest('That would be more than 16 hours in one day.');
  const row: TimeRow = { id: uid(), userId: user.id, date: input.date, projectId: input.projectId, taskId: input.taskId || undefined, minutes, note: input.note?.trim() || undefined, billable: true };
  timeEntries.push(row);
  addToBudget(user, row.projectId, minutes);
  return toEntry(row);
}

/** DELETE /me/time-entries/{id} */
export function deleteTimeEntry(user: User, id: string): void {
  requireStaff(user);
  const i = timeEntries.findIndex((e) => e.id === id && e.userId === user.id);
  // BACKEND: someone else's entry is "not found".
  if (i < 0) throw notFound('Time entry');
  const e = timeEntries[i];
  if (e.startedAt) throw conflict('Stop the timer instead.');
  if (isLocked(user.id, e.date)) throw conflict('That week is submitted.');
  timeEntries.splice(i, 1);
  addToBudget(user, e.projectId, -e.minutes);
}

/** POST /me/timer/start. BACKEND: one running timer per person; the server keeps the start time. */
export function startTimer(user: User, input: TimerStart): TimeEntry {
  requireStaff(user);
  if (timeEntries.some((e) => e.userId === user.id && e.startedAt)) throw conflict('A timer is already running. Stop it first.');
  if (isLocked(user.id, today())) throw conflict('This week is submitted.');
  requireProject(user, input.projectId, input.taskId);
  const row: TimeRow = {
    id: uid(),
    userId: user.id,
    date: today(),
    projectId: input.projectId,
    taskId: input.taskId || undefined,
    minutes: 0,
    note: input.note?.trim() || undefined,
    billable: true,
    startedAt: new Date().toISOString(),
  };
  timeEntries.push(row);
  return toEntry(row);
}

/** POST /me/timer/stop. Under a minute is discarded; over 10 hours is capped (forgotten timer). */
export function stopTimer(user: User): TimeEntry | null {
  requireStaff(user);
  const row = timeEntries.find((e) => e.userId === user.id && e.startedAt);
  if (!row) throw conflict('No timer is running.');
  const minutes = Math.round((Date.now() - Date.parse(row.startedAt!)) / 60_000);
  if (minutes < 1) {
    timeEntries.splice(timeEntries.indexOf(row), 1);
    return null;
  }
  row.minutes = Math.min(minutes, MAX_TIMER_MIN);
  if (minutes > MAX_TIMER_MIN) row.note = `${row.note ? `${row.note}. ` : ''}Timer ran over 10 hours; capped, please check.`;
  row.startedAt = undefined;
  addToBudget(user, row.projectId, row.minutes);
  return toEntry(row);
}

/** POST /me/timesheet/submit { weekStart }. Locks the week; Phase 2 adds manager approval. */
export function submitWeek(user: User, weekStart: string): Timesheet {
  requireStaff(user);
  if (!DATE_RE.test(weekStart ?? '')) throw badRequest('Which week?');
  const start = weekStartOf(weekStart);
  if (start > today()) throw badRequest('That week has not started.');
  if (submittedWeeks.has(`${user.id}:${start}`)) throw conflict('Already submitted.');
  const end = addDays(start, 6);
  const mine = timeEntries.filter((e) => e.userId === user.id && e.date >= start && e.date <= end);
  if (mine.some((e) => e.startedAt)) throw conflict('Stop the running timer first.');
  if (!mine.length) throw badRequest('Nothing logged this week.');
  submittedWeeks.add(`${user.id}:${start}`);
  return myTimesheet(user, start);
}

/** For the profit report: hours and minutes per person on a project. */
export function minutesByPerson(projectId: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of timeEntries) if (e.projectId === projectId && !e.startedAt) out[e.userId] = (out[e.userId] ?? 0) + e.minutes;
  return out;
}
