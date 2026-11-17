/**
 * Mock accounts API: sign-in, two-step, sessions, invite and reset links,
 * admin user management, the client team, settings and login history.
 * Comments starting with "BACKEND:" are rules the Spring Boot service must enforce.
 */
import { ApiError } from '@/types';
import type {
  AdminUser,
  AdminUserQuery,
  ClientTeam,
  ClientTeamMember,
  InviteInfo,
  LoginEvent,
  LoginResult,
  Organisation,
  PortalSettings,
  RepInvite,
  RepPatch,
  Role,
  Session,
  User,
  UserInvite,
} from '@/types';
import {
  DEMO_MFA_CODE,
  DEMO_PASSWORD,
  loginEvents,
  ORG,
  organisations,
  outbox,
  passwords,
  projects,
  settings,
  tokens,
  users,
} from './data';
import type { UserRow } from './data';
import { badRequest, conflict, forbidden, notFound, toPublicUser } from './handlers';

const unauthorized = (detail: string) => new ApiError({ status: 401, title: 'Unauthorized', detail });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MINUTE = 60_000;
const LOCK_AFTER = 5;
const LOCK_WINDOW = 15 * MINUTE;

const rowById = (id: string) => users.find((u) => u.id === id);
const rowByEmail = (email: string) => users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
const now = () => new Date().toISOString();
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, '0')).join('');

function issueToken(userId: string, purpose: 'INVITE' | 'RESET' | 'MFA', minutes: number) {
  const t = randomToken();
  tokens.set(t, { userId, purpose, expiresAt: Date.now() + minutes * MINUTE, used: false });
  return t;
}

function useToken(token: string, purpose: 'INVITE' | 'RESET' | 'MFA') {
  const t = tokens.get(token);
  if (!t || t.purpose !== purpose || t.used || t.expiresAt < Date.now()) return null;
  return t;
}

export function sendEmail(to: string, subject: string, body: string, link?: string) {
  outbox.unshift({ id: `em${outbox.length + 1}`, to, subject, body, link, at: now() });
}

function record(e: Omit<LoginEvent, 'id' | 'at' | 'ip' | 'device'>) {
  loginEvents.unshift({ ...e, id: `le${Date.now()}${loginEvents.length}`, at: now(), ip: '127.0.0.1', device: navigatorLabel() });
}
function navigatorLabel() {
  if (typeof navigator === 'undefined') return 'Unknown device';
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'Browser';
  const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : 'Linux';
  return `${browser} on ${os}`;
}

/** Seeded active accounts use the demo password until they set their own. */
const passwordOf = (row: UserRow) => passwords.get(row.id) ?? (row.status !== 'INVITED' && row.status !== 'PENDING_APPROVAL' ? DEMO_PASSWORD : undefined);

/** BACKEND: same policy on accept-invite and reset. Phase 1 also checks a breached-password list. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Use at least one letter and one number.';
  if (pw.length > 128) return 'Use at most 128 characters.';
  return null;
}

function newSession(row: UserRow): Session {
  row.lastLoginAt = now();
  record({ userId: row.id, userName: row.name, email: row.email, result: 'SUCCESS' });
  return {
    user: toPublicUser(row),
    accessToken: `mock.${row.id}.${Date.now()}`,
    expiresAt: new Date(Date.now() + 15 * MINUTE).toISOString(),
  };
}

/* ------------------------------------------------------------------ sign-in */

/** POST /auth/login */
export function login(email: string, password: string): LoginResult {
  const row = rowByEmail(email);
  const recentFails = loginEvents.filter(
    (e) => e.email.toLowerCase() === email.trim().toLowerCase() && (e.result === 'FAILED' || e.result === 'MFA_FAILED') && Date.now() - Date.parse(e.at) < LOCK_WINDOW,
  ).length;
  // BACKEND: rate-limit per email and per IP. Answer 429 without saying whether the email exists.
  if (recentFails >= LOCK_AFTER) {
    record({ userId: row?.id, userName: row?.name ?? 'Unknown', email, result: 'LOCKED' });
    throw new ApiError({ status: 429, title: 'Too Many Requests', detail: 'Too many attempts. Wait 15 minutes or reset your password.' });
  }
  if (!row || passwordOf(row) !== password) {
    record({ userId: row?.id, userName: row?.name ?? 'Unknown', email, result: 'FAILED' });
    // Same message for both cases, so the form does not reveal which emails exist.
    throw unauthorized('Email or password is incorrect.');
  }
  // Only someone with the right password learns the account is suspended.
  if (row.status === 'SUSPENDED') throw new ApiError({ status: 403, title: 'Forbidden', detail: 'This account is suspended. Contact your Webinger account manager.' });
  if (row.mfaEnabled) {
    return { mfaRequired: true, mfaToken: issueToken(row.id, 'MFA', 5), method: 'Authenticator app' };
  }
  return newSession(row);
}

/** POST /auth/mfa/verify */
export function verifyMfa(mfaToken: string, code: string): Session {
  const t = useToken(mfaToken, 'MFA');
  if (!t) throw unauthorized('This sign-in attempt expired. Start again.');
  const row = rowById(t.userId)!;
  if (code.trim() !== DEMO_MFA_CODE) {
    record({ userId: row.id, userName: row.name, email: row.email, result: 'MFA_FAILED' });
    throw unauthorized('That code is not right. Check your authenticator app and try again.');
  }
  t.used = true;
  return newSession(row);
}

/**
 * Called before every authenticated mock request. Returns the current user,
 * fresh from the store, or throws 401 if the session is no longer valid.
 */
export function checkSession(session: Session): User {
  const row = rowById(session.user.id);
  if (!row) throw unauthorized('Please sign in again.');
  if (row.status === 'SUSPENDED') throw unauthorized('This account was suspended.');
  const issuedAt = Number(session.accessToken.split('.')[2] ?? 0);
  if (row.sessionsRevokedAt && issuedAt <= Date.parse(row.sessionsRevokedAt)) throw unauthorized('Your session ended, either after a password change or because an administrator signed you out. Sign in again.');
  return toPublicUser(row);
}

/* ---------------------------------------------------- invites and resets */

/** GET /auth/invites/{token} */
export function getInvite(token: string): InviteInfo {
  const t = useToken(token, 'INVITE');
  if (!t) throw new ApiError({ status: 410, title: 'Gone', detail: 'This invite link has expired or was already used. Ask for a new one.' });
  const row = rowById(t.userId)!;
  return { name: row.name, email: row.email, role: row.role, organisationName: row.organisationName, expiresAt: new Date(t.expiresAt).toISOString() };
}

/** POST /auth/invites/{token}/accept */
export function acceptInvite(token: string, password: string): Session {
  const t = useToken(token, 'INVITE');
  if (!t) throw new ApiError({ status: 410, title: 'Gone', detail: 'This invite link has expired or was already used. Ask for a new one.' });
  const problem = passwordProblem(password);
  if (problem) throw badRequest(problem);
  const row = rowById(t.userId)!;
  t.used = true;
  passwords.set(row.id, password);
  row.status = 'ACTIVE';
  // Phase 1: admins and managers set up two-step here before the first session is issued.
  return newSession(row);
}

/** POST /auth/password/forgot. Always 202, so the form never reveals which emails exist. */
export function forgotPassword(email: string): void {
  if (!EMAIL_RE.test(email.trim())) throw badRequest('Enter a valid email address.');
  const row = rowByEmail(email);
  if (!row || row.status !== 'ACTIVE') return;
  const t = issueToken(row.id, 'RESET', 30);
  sendEmail(row.email, 'Reset your Webinger password', 'Use this link within 30 minutes to choose a new password.', `/reset-password?token=${t}`);
}

/** POST /auth/password/reset */
export function resetPassword(token: string, password: string): void {
  const t = useToken(token, 'RESET');
  if (!t) throw new ApiError({ status: 410, title: 'Gone', detail: 'This reset link has expired or was already used. Request a new one.' });
  const problem = passwordProblem(password);
  if (problem) throw badRequest(problem);
  const row = rowById(t.userId)!;
  t.used = true;
  passwords.set(row.id, password);
  // BACKEND: a password change signs out every other session.
  row.sessionsRevokedAt = now();
}

/* --------------------------------------------------------- admin: users */

// BACKEND: users, roles and settings are SUPER_ADMIN only (permission matrix).
function requireSuperAdmin(user: User) {
  if (user.role !== 'SUPER_ADMIN') throw forbidden('Only a Super Admin can manage users and settings.');
}

const toAdminUser = (r: UserRow): AdminUser => ({
  id: r.id,
  name: r.name,
  email: r.email,
  role: r.role,
  organisationId: r.organisationId,
  organisationName: r.organisationName,
  title: r.title,
  status: r.status,
  mfaEnabled: r.mfaEnabled,
  createdAt: r.createdAt,
  lastLoginAt: r.lastLoginAt,
  invitedBy: r.invitedBy,
});

const KIND_FOR_ROLE: Record<Role, Organisation['kind']> = {
  SUPER_ADMIN: 'AGENCY',
  MANAGER: 'AGENCY',
  EMPLOYEE: 'AGENCY',
  CLIENT_OWNER: 'CLIENT',
  CLIENT_REP: 'CLIENT',
  INFLUENCER: 'INFLUENCER',
  PARTNER: 'PARTNER',
};

/** GET /admin/users */
export function listUsers(user: User, q: AdminUserQuery = {}): AdminUser[] {
  requireSuperAdmin(user);
  const needle = q.q?.trim().toLowerCase();
  const order = { PENDING_APPROVAL: 0, INVITED: 1, ACTIVE: 2, SUSPENDED: 3 };
  return users
    .filter(
      (r) =>
        (!q.role || r.role === q.role) &&
        (!q.status || r.status === q.status) &&
        (!needle || `${r.name} ${r.email} ${r.organisationName}`.toLowerCase().includes(needle)),
    )
    .sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name))
    .map(toAdminUser);
}

/** GET /admin/organisations */
export function listOrganisations(user: User): Organisation[] {
  requireSuperAdmin(user);
  return organisations;
}

export function sendInvite(row: UserRow, by: string) {
  const t = issueToken(row.id, 'INVITE', 7 * 24 * 60);
  sendEmail(row.email, `${by} invited you to the Webinger portal`, 'Open the link to set your password. It expires in 7 days.', `/accept-invite?token=${t}`);
}

export function validateNew(name: string, email: string) {
  if (name.trim().length < 2) throw badRequest('Enter the person’s full name.');
  if (!EMAIL_RE.test(email.trim())) throw badRequest('Enter a valid email address.');
  if (rowByEmail(email)) throw conflict('Someone with this email already has an account.');
}

/** POST /admin/users/invites */
export function inviteUser(user: User, input: UserInvite): AdminUser {
  requireSuperAdmin(user);
  validateNew(input.name, input.email);
  const org = organisations.find((o) => o.id === input.organisationId);
  if (!org) throw badRequest('Choose an organisation.');
  if (!KIND_FOR_ROLE[input.role]) throw badRequest('Choose a role.');
  if (KIND_FOR_ROLE[input.role] !== org.kind) throw badRequest(`A ${input.role.replace('_', ' ').toLowerCase()} must belong to a ${KIND_FOR_ROLE[input.role].toLowerCase()} organisation.`);
  const row: UserRow = {
    id: `u-${Date.now().toString(36)}`,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    role: input.role,
    organisationId: org.id,
    organisationName: org.name,
    title: input.title?.trim() || undefined,
    status: 'INVITED',
    mfaEnabled: input.role === 'SUPER_ADMIN' || input.role === 'MANAGER',
    createdAt: now(),
    invitedBy: user.name,
  };
  users.push(row);
  sendInvite(row, user.name);
  return toAdminUser(row);
}

function target(user: User, id: string) {
  requireSuperAdmin(user);
  const row = rowById(id);
  if (!row) throw notFound('User');
  return row;
}

/** POST /admin/users/{id}/approve: a client rep the client owner invited. */
export function approveUser(user: User, id: string): AdminUser {
  const row = target(user, id);
  if (row.status !== 'PENDING_APPROVAL') throw conflict('This account is not waiting for approval.');
  row.status = 'INVITED';
  sendInvite(row, row.invitedBy ?? user.name);
  return toAdminUser(row);
}

/** POST /admin/users/{id}/suspend */
export function suspendUser(user: User, id: string): AdminUser {
  const row = target(user, id);
  if (row.id === user.id) throw conflict('You cannot suspend your own account.');
  // BACKEND: there must always be at least one active Super Admin (two from day one).
  if (row.role === 'SUPER_ADMIN' && users.filter((u) => u.role === 'SUPER_ADMIN' && u.status === 'ACTIVE').length <= 1) {
    throw conflict('This is the last active Super Admin. Add another before suspending.');
  }
  row.status = 'SUSPENDED';
  row.sessionsRevokedAt = now();
  return toAdminUser(row);
}

/** POST /admin/users/{id}/reactivate */
export function reactivateUser(user: User, id: string): AdminUser {
  const row = target(user, id);
  if (row.status !== 'SUSPENDED') throw conflict('This account is not suspended.');
  row.status = 'ACTIVE';
  return toAdminUser(row);
}

/** POST /admin/users/{id}/reset: emails a reset link, or re-sends the invite if never accepted. Admin never sees or sets passwords. */
export function adminResetPassword(user: User, id: string): void {
  const row = target(user, id);
  if (row.status === 'SUSPENDED') throw conflict('Reactivate the account first.');
  if (row.status === 'PENDING_APPROVAL') throw conflict('Approve the account first.');
  if (row.status === 'INVITED') return void sendInvite(row, user.name);
  const t = issueToken(row.id, 'RESET', 30);
  sendEmail(row.email, 'Reset your Webinger password', `${user.name} sent you a password reset link. It expires in 30 minutes.`, `/reset-password?token=${t}`);
}

/** POST /admin/users/{id}/logout: revokes every session of the user. */
export function forceLogout(user: User, id: string): void {
  const row = target(user, id);
  if (row.id === user.id) throw conflict('Use Sign out to end your own session.');
  row.sessionsRevokedAt = now();
}

/** GET /admin/login-history */
export function loginHistory(user: User, userId?: string): LoginEvent[] {
  requireSuperAdmin(user);
  return loginEvents.filter((e) => !userId || e.userId === userId).slice(0, 100);
}

/* ---------------------------------------------------------- settings */

/** GET /settings. Staff can read business hours and response times; only Super Admin edits. */
export function getSettings(user: User): PortalSettings {
  if (user.organisationId !== ORG.WEBINGER) throw forbidden();
  return settings;
}

/** PUT /settings */
export function saveSettings(user: User, next: PortalSettings): PortalSettings {
  requireSuperAdmin(user);
  const { businessHours: h, responseTimes: r, approvalLimits: l } = next;
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!h || !Array.isArray(h.days) || h.days.length === 0 || h.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw badRequest('Choose at least one working day.');
  if (!time.test(h.open) || !time.test(h.close)) throw badRequest('Opening and closing times must be HH:MM.');
  if (h.close <= h.open) throw badRequest('Closing time must be after opening time.');
  const posInt = (n: number, max: number) => Number.isFinite(n) && n > 0 && n <= max;
  if (!posInt(r.firstReplyHours, 72)) throw badRequest('First reply time must be between 1 and 72 hours.');
  if (!posInt(r.ticketResolutionHours, 720)) throw badRequest('Ticket resolution time must be between 1 and 720 hours.');
  if (r.ticketResolutionHours < r.firstReplyHours) throw badRequest('Resolution time cannot be shorter than first reply time.');
  if (!(l.managerDiscountPercent >= 0 && l.managerDiscountPercent <= 50)) throw badRequest('Manager discount limit must be 0–50%.');
  if (!(l.managerSpendLimit >= 0) || !(l.deputyPayoutLimit >= 0)) throw badRequest('Money limits cannot be negative.');
  if (!posInt(next.defaultRevisions, 10)) throw badRequest('Revisions per deliverable must be 1–10.');
  if (!posInt(next.reminderAfterDays, 14)) throw badRequest('Reminder delay must be 1–14 days.');
  Object.assign(settings, structuredClone(next), { businessHours: { ...next.businessHours, days: [...new Set(next.businessHours.days)].sort() } });
  return settings;
}

/* ------------------------------------------------------- client team */

// BACKEND: only the client owner manages their own company's people.
function requireOwner(user: User) {
  if (user.role !== 'CLIENT_OWNER') throw forbidden('Only your company’s account owner can manage the team.');
}

const orgProjects = (orgId: string) => projects.filter((p) => p.organisationId === orgId);

function toMember(r: UserRow): ClientTeamMember {
  const own = orgProjects(r.organisationId);
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    title: r.title,
    status: r.status,
    projectIds: r.role === 'CLIENT_OWNER' ? own.map((p) => p.id) : own.filter((p) => p.memberIds.includes(r.id)).map((p) => p.id),
    canSeeBilling: r.role === 'CLIENT_OWNER' || !!r.canSeeBilling,
    invitedAt: r.status === 'ACTIVE' ? undefined : r.createdAt,
    lastLoginAt: r.lastLoginAt,
  };
}

/** GET /client/team */
export function getTeam(user: User): ClientTeam {
  requireOwner(user);
  return {
    members: users
      .filter((r) => r.organisationId === user.organisationId && (r.role === 'CLIENT_OWNER' || r.role === 'CLIENT_REP'))
      .sort((a, b) => (a.role === 'CLIENT_OWNER' ? -1 : b.role === 'CLIENT_OWNER' ? 1 : a.name.localeCompare(b.name)))
      .map(toMember),
    projects: orgProjects(user.organisationId)
      .filter((p) => p.status !== 'COMPLETED')
      .map((p) => ({ id: p.id, name: p.name })),
  };
}

function setProjects(r: UserRow, projectIds: string[]) {
  const own = orgProjects(r.organisationId);
  if (projectIds.some((id) => !own.some((p) => p.id === id))) throw badRequest('Choose projects from your own company.');
  for (const p of own) {
    const has = p.memberIds.includes(r.id);
    if (projectIds.includes(p.id) && !has) p.memberIds.push(r.id);
    if (!projectIds.includes(p.id) && has) p.memberIds = p.memberIds.filter((m) => m !== r.id);
  }
}

/** POST /client/team/invites. The rep waits for Webinger admin approval before the invite email goes out. */
export function inviteRep(user: User, input: RepInvite): ClientTeamMember {
  requireOwner(user);
  validateNew(input.name, input.email);
  if (!Array.isArray(input.projectIds) || input.projectIds.length === 0) throw badRequest('Choose at least one project.');
  const row: UserRow = {
    id: `u-${Date.now().toString(36)}`,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    role: 'CLIENT_REP',
    organisationId: user.organisationId,
    organisationName: user.organisationName,
    title: input.title?.trim() || undefined,
    status: 'PENDING_APPROVAL',
    mfaEnabled: false,
    createdAt: now(),
    canSeeBilling: !!input.canSeeBilling,
    invitedBy: user.name,
  };
  setProjects(row, input.projectIds);
  users.push(row);
  sendEmail('admin@webinger.in', `Approve ${row.name} for ${row.organisationName}`, `${user.name} invited ${row.name} (${row.email}). Approve in Users & settings.`, '/admin/settings');
  return toMember(row);
}

/** PATCH /client/team/{id} */
export function updateRep(user: User, id: string, patch: RepPatch): ClientTeamMember {
  requireOwner(user);
  const row = rowById(id);
  if (!row || row.organisationId !== user.organisationId || row.role !== 'CLIENT_REP') throw notFound('Team member');
  if (patch.projectIds !== undefined) {
    if (patch.projectIds.length === 0) throw badRequest('Keep at least one project, or remove access instead.');
    setProjects(row, patch.projectIds);
  }
  if (patch.canSeeBilling !== undefined) row.canSeeBilling = patch.canSeeBilling;
  if (patch.suspended === true && row.status !== 'SUSPENDED') {
    row.status = 'SUSPENDED';
    row.sessionsRevokedAt = now();
  }
  if (patch.suspended === false && row.status === 'SUSPENDED') row.status = passwords.has(row.id) || row.lastLoginAt ? 'ACTIVE' : 'INVITED';
  return toMember(row);
}

/* --------------------------------------------------------- demo outbox */

/** Demo only. The prototype has no inbox, so screens can show the email that would have been sent. */
export function demoOutbox(to?: string) {
  return outbox.filter((m) => !to || m.to.toLowerCase() === to.toLowerCase()).slice(0, 20);
}
