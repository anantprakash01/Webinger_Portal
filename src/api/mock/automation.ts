/**
 * Mock automation API (Week 8): the 18 rules (CLAUDE.md section 5), their run log, draft-for-review
 * approvals, the global pause switch and deputy mode.
 *
 * Phase 4 runs these rules on a scheduler (Spring events + Quartz). The prototype shows the settings,
 * previews what each rule would do with today's data, and executes approved drafts.
 * Comments starting with "BACKEND:" are rules the Spring Boot service must enforce.
 */
import type { AutomationOverview, AutomationRule, AutomationRun, DeputyInput, DeputySettings, RulePatch, RunStatus, User } from '@/types';
import { sendEmail } from './accounts';
import { clientRows, contractStatus } from './clients';
import { approvals, CLIENT_NAME, day, nameOf, projects, settings, tasks, userById, users } from './data';
import { automationState, deputy, NEVER_AUTOMATED, rules, runs } from './data8';
import type { RuleRow } from './data8';
import { influencers } from './data7';
import { balanceOf, daysLateOf, remindInvoice, statusOf } from './finance';
import { invoices } from './data5';
import { badRequest, conflict, forbidden, isAdminArea, isStaff, notFound } from './handlers';

const today = () => day(0);
const DAY_MS = 86_400_000;
const nowIso = () => new Date().toISOString();
const uid = () => `run${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const DRAFT_DAYS = 30;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// BACKEND: automation rules and the audit trail: Super Admin full, Manager read (permission matrix).
function requireAdminArea(user: User) {
  if (!isAdminArea(user)) throw forbidden('Only Super Admins and Managers can see automation.');
}
function requireOwner(user: User) {
  if (user.role !== 'SUPER_ADMIN') throw forbidden('Only a Super Admin can change automation.');
}

function findRule(id: number) {
  const r = rules.find((x) => x.id === Number(id));
  if (!r) throw notFound('Rule');
  return r;
}

const ruleName = (id: number) => rules.find((r) => r.id === id)?.name ?? `Rule ${id}`;
const toRun = (r: (typeof runs)[number]): AutomationRun => ({ ...r, ruleName: ruleName(r.ruleId) });
const daysInDraft = (r: RuleRow) => (r.mode === 'DRAFT' && r.draftSince ? Math.floor((Date.parse(today()) - Date.parse(r.draftSince)) / DAY_MS) : 0);

function toRule(r: RuleRow): AutomationRule {
  const mine = runs.filter((x) => x.ruleId === r.id);
  const recent = mine.filter((x) => Date.now() - Date.parse(x.at) < 30 * DAY_MS);
  return {
    id: r.id,
    name: r.name,
    trigger: r.trigger,
    condition: r.condition,
    escalation: r.escalation,
    humanStep: r.humanStep,
    mode: r.mode,
    clientFacing: r.clientFacing,
    params: r.params,
    actions: r.actions,
    runsLast30: recent.length,
    waiting: mine.filter((x) => x.status === 'WAITING').length,
    lastRunAt: mine.map((x) => x.at).sort().reverse()[0],
    updatedAt: r.updatedAt,
    updatedBy: r.updatedBy,
    draftSince: r.draftSince,
  };
}

/* --------------------------------------------------------------- deputy */

function deputySettings(): DeputySettings {
  const active = !!deputy.deputyId && !!deputy.from && !!deputy.to && deputy.from <= today() && deputy.to >= today();
  return {
    deputyId: deputy.deputyId,
    deputyName: deputy.deputyId ? nameOf(deputy.deputyId) : undefined,
    from: deputy.from,
    to: deputy.to,
    payoutLimit: settings.approvalLimits.deputyPayoutLimit,
    discountPercent: settings.approvalLimits.managerDiscountPercent,
    active,
    candidates: users.filter((u) => isStaff(u) && u.status === 'ACTIVE' && u.role === 'MANAGER').map((u) => ({ id: u.id, name: u.name })),
  };
}

/** Deputy currently standing in for the owner (used by approvals that need the owner). */
export const activeDeputyId = () => (deputySettings().active ? deputy.deputyId : undefined);

/**
 * PUT /automation/deputy
 * BACKEND: Super Admin only. The deputy is an active Manager, for at most 90 days; the money limits are the
 * same Settings values every approval checks (payouts above the limit always go to a Super Admin).
 */
export function setDeputy(user: User, input: DeputyInput): DeputySettings {
  requireOwner(user);
  const payout = Math.round(Number(input.payoutLimit));
  const discount = Number(input.discountPercent);
  if (!(payout >= 0 && payout <= 500_000)) throw badRequest('Payout limit: ₹0 to ₹5,00,000.');
  if (!(discount >= 0 && discount <= 20)) throw badRequest('Discount limit: 0 to 20%.');
  if (input.deputyId) {
    const d = userById(input.deputyId);
    if (!d || d.role !== 'MANAGER' || d.status !== 'ACTIVE') throw badRequest('The deputy is an active Manager.');
    if (!DATE_RE.test(input.from ?? '') || !DATE_RE.test(input.to ?? '') || input.to! < input.from!) throw badRequest('Choose the dates the deputy stands in.');
    if (input.to! < today()) throw badRequest('Those dates are in the past.');
    if ((Date.parse(input.to!) - Date.parse(input.from!)) / DAY_MS > 90) throw badRequest('A deputy period is at most 90 days.');
    deputy.deputyId = input.deputyId;
    deputy.from = input.from;
    deputy.to = input.to;
  } else {
    deputy.deputyId = undefined;
    deputy.from = undefined;
    deputy.to = undefined;
  }
  settings.approvalLimits.deputyPayoutLimit = payout;
  settings.approvalLimits.managerDiscountPercent = discount;
  return deputySettings();
}

/* ------------------------------------------------------------ endpoints */

/** GET /automation */
export function automationOverview(user: User): AutomationOverview {
  requireAdminArea(user);
  return {
    paused: automationState.paused,
    pausedBy: automationState.pausedBy,
    rules: rules.map(toRule),
    waiting: runs.filter((r) => r.status === 'WAITING').length,
    deputy: deputySettings(),
    neverAutomated: NEVER_AUTOMATED,
  };
}

/**
 * PATCH /automation/rules/{id}
 * BACKEND: Super Admin only. A client-facing rule must spend 30 days in DRAFT before it can be ON.
 * Settings stay inside each parameter's range; a rule keeps at least one action (turn it OFF instead).
 */
export function updateRule(user: User, id: number, patch: RulePatch): AutomationRule {
  requireOwner(user);
  const r = findRule(id);
  if (patch.mode !== undefined) {
    if (!['ON', 'DRAFT', 'OFF'].includes(patch.mode)) throw badRequest('On, draft or off.');
    if (patch.mode === 'ON' && r.clientFacing && r.mode !== 'ON') {
      const inDraft = daysInDraft(r);
      if (r.mode !== 'DRAFT' || inDraft < DRAFT_DAYS) {
        throw conflict(`Client-facing rules run ${DRAFT_DAYS} days in draft-for-review first${r.mode === 'DRAFT' ? ` (${DRAFT_DAYS - inDraft} days to go)` : ''}.`);
      }
    }
    if (patch.mode === 'DRAFT' && r.mode !== 'DRAFT') r.draftSince = today();
    r.mode = patch.mode;
  }
  if (patch.params) {
    for (const [key, raw] of Object.entries(patch.params)) {
      const prm = r.params.find((x) => x.key === key);
      if (!prm) throw badRequest(`Unknown setting ${key}.`);
      if (prm.unit === 'list') {
        const list = (Array.isArray(raw) ? raw : []).map(Number);
        if (!list.length || list.length > 6 || list.some((v) => !Number.isInteger(v) || v < prm.min || v > prm.max)) {
          throw badRequest(`${prm.label}: one to six whole numbers between ${prm.min} and ${prm.max}.`);
        }
        prm.value = [...new Set(list)].sort((x, y) => x - y);
      } else {
        const v = Number(raw);
        if (!Number.isFinite(v) || v < prm.min || v > prm.max) throw badRequest(`${prm.label}: between ${prm.min} and ${prm.max}.`);
        prm.value = Math.round(v);
      }
    }
  }
  if (patch.actions) {
    for (const [key, on] of Object.entries(patch.actions)) {
      const act = r.actions.find((x) => x.key === key);
      if (!act) throw badRequest(`Unknown action ${key}.`);
      act.enabled = !!on;
    }
    if (!r.actions.some((x) => x.enabled)) throw badRequest('Keep at least one action, or turn the rule off.');
  }
  r.updatedAt = nowIso();
  r.updatedBy = user.name;
  return toRule(r);
}

/** POST /automation/pause { paused }: the kill switch for every rule at once. Super Admin only. */
export function pauseAll(user: User, paused: boolean): AutomationOverview {
  requireOwner(user);
  automationState.paused = !!paused;
  automationState.pausedBy = paused ? user.name : undefined;
  runs.unshift({ id: uid(), ruleId: 18, at: nowIso(), status: 'DONE', summary: paused ? `All automation paused by ${user.name}` : `Automation resumed by ${user.name}`, target: 'All rules' });
  return automationOverview(user);
}

/** GET /automation/runs?ruleId&status */
export function listRuns(user: User, q: { ruleId?: number; status?: RunStatus } = {}): AutomationRun[] {
  requireAdminArea(user);
  return runs
    .filter((r) => (!q.ruleId || r.ruleId === Number(q.ruleId)) && (!q.status || r.status === q.status))
    .sort((a, b) => Number(b.status === 'WAITING') - Number(a.status === 'WAITING') || b.at.localeCompare(a.at))
    .map(toRun);
}

/**
 * POST /automation/runs/{id}/decision { decision }
 * Draft-for-review: a person approves (the action runs now) or discards. BACKEND: anything about money
 * (rule 9 invoices and reminders) is Super Admin only; nothing runs while automation is paused.
 */
export function decideRun(user: User, id: string, decision: 'APPROVE' | 'DISCARD'): AutomationRun {
  requireAdminArea(user);
  const run = runs.find((r) => r.id === id);
  if (!run) throw notFound('Run');
  if (run.status !== 'WAITING') throw conflict('Already decided.');
  if (run.ruleId === 9 && user.role !== 'SUPER_ADMIN') throw forbidden('Invoice actions need a Super Admin.');
  if (decision === 'APPROVE') {
    if (automationState.paused) throw conflict('Automation is paused. Resume it first.');
    execute(user, run);
    run.status = 'APPROVED';
  } else if (decision === 'DISCARD') {
    run.status = 'DISCARDED';
  } else throw badRequest('Approve or discard.');
  run.decidedBy = user.name;
  run.decidedAt = nowIso();
  return toRun(run);
}

/** Runs an approved draft's action against the real data. */
function execute(user: User, run: (typeof runs)[number]) {
  const invoiceId = run.link?.match(/\/finance\/invoices\/([\w-]+)/)?.[1];
  if (run.ruleId === 9 && invoiceId) {
    try {
      remindInvoice(user, invoiceId);
    } catch (e) {
      // Already reminded today, or paid since: the draft is out of date.
      throw conflict(`Could not send: ${(e as Error).message}`);
    }
    return;
  }
  const clientId = run.link?.match(/\/clients\/([\w-]+)/)?.[1] ?? projects.find((p) => run.link?.endsWith(`/projects/${p.id}`))?.organisationId;
  const owner = users.find((u) => u.organisationId === clientId && u.role === 'CLIENT_OWNER' && u.status === 'ACTIVE');
  if (owner) sendEmail(owner.email, `Webinger: ${run.summary.split(':')[0]}`, run.summary, '/client');
}

/**
 * POST /automation/rules/{id}/preview: what the rule would do right now (nothing is sent).
 * Uses the rule's current settings against today's data.
 */
export function previewRule(user: User, id: number): { ruleId: number; items: string[] } {
  requireAdminArea(user);
  const r = findRule(id);
  const val = (k: string) => r.params.find((x) => x.key === k)?.value as number;
  const items: string[] = [];
  const now = Date.now();
  switch (r.id) {
    case 4: {
      const limit = new Date(now + val('hoursBefore') * 3_600_000).toISOString().slice(0, 10);
      for (const t of tasks.filter((x) => x.status !== 'DONE' && x.status !== 'CLIENT_APPROVAL' && x.due >= today() && x.due <= limit)) items.push(`Remind ${nameOf(t.assigneeId)}: "${t.title}" due ${t.due}`);
      break;
    }
    case 6:
      for (const a of approvals.filter((x) => x.status === 'PENDING')) {
        const hours = (now - Date.parse(a.versions[a.versions.length - 1].submittedAt)) / 3_600_000;
        if (hours >= val('callDays') * 24) items.push(`Task for the account manager: call ${CLIENT_NAME[a.organisationId]} about "${a.title}"`);
        else if (hours >= val('remindHours')) items.push(`Remind ${CLIENT_NAME[a.organisationId]}: "${a.title}" waiting ${Math.floor(hours / 24)} days`);
      }
      break;
    case 9: {
      const days = r.params[0].value as number[];
      for (const i of invoices.filter((x) => x.status === 'SENT' && balanceOf(x) > 0)) {
        const rel = Math.round((Date.parse(today()) - Date.parse(i.due)) / DAY_MS);
        if (days.includes(rel)) items.push(`Reminder to ${CLIENT_NAME[i.organisationId]} for ${i.number} (${rel < 0 ? `due in ${-rel} days` : rel === 0 ? 'due today' : `${rel} days late`})`);
      }
      if (today().endsWith('-01')) items.push('Draft this month\'s retainer invoices');
      break;
    }
    case 10:
      for (const i of invoices.filter((x) => statusOf(x) === 'OVERDUE' && daysLateOf(x) >= val('days'))) items.push(`Decision for the owner: pause work for ${CLIENT_NAME[i.organisationId]}? (${i.number}, ${daysLateOf(i)} days late)`);
      break;
    case 14:
      for (const p of projects.filter((x) => x.status === 'ACTIVE' && x.hoursUsed / x.budgetHours >= val('warnAt') / 100)) {
        const pct = Math.round((p.hoursUsed / p.budgetHours) * 100);
        items.push(`${pct >= val('stopAt') ? 'Manager decision' : 'Owner alert'}: ${p.name} (${CLIENT_NAME[p.organisationId]}) at ${pct}% of budget`);
      }
      break;
    case 15:
      for (const c of clientRows) {
        for (const k of c.contracts.filter((x) => contractStatus(x) !== 'ENDED' && x.endDate <= day(val('days')))) {
          items.push(`Renewal task + offer: ${CLIENT_NAME[c.organisationId]} · ${k.title} ends ${k.endDate}`);
        }
      }
      break;
    case 16:
      for (const i of influencers.filter((x) => x.verification === 'PENDING' && x.submittedAt && now - Date.parse(x.submittedAt) > val('queueDays') * DAY_MS)) {
        items.push(`Moderator alert: ${i.name} waiting ${Math.floor((now - Date.parse(i.submittedAt!)) / DAY_MS)} days`);
      }
      break;
    default:
      items.push('This rule runs when its event happens; there is nothing waiting to preview.');
  }
  if (!items.length) items.push('Nothing matches right now.');
  if (r.mode === 'OFF') items.unshift('The rule is off: none of this would happen.');
  else if (r.mode === 'DRAFT') items.unshift('Draft-for-review: each item would wait for a person to approve.');
  if (automationState.paused) items.unshift('All automation is paused.');
  return { ruleId: r.id, items };
}

/** Admin dashboard: drafts waiting for a person. */
export const automationWaiting = () => runs.filter((r) => r.status === 'WAITING').length;
