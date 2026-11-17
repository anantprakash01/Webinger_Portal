/**
 * The only module that talks to the backend. Components never call fetch directly.
 *
 * VITE_API_MODE=mock  → answers from src/api/mock (Phase 0)
 * VITE_API_MODE=http  → calls the Spring Boot API (Phase 1+)
 *
 * Switching a module from mock to real is a change here, not in any screen.
 */
import { ApiError } from '@/types';
import type {
  AdminDashboard,
  AdminUser,
  AdminUserQuery,
  ApiProblem,
  ApprovalDecisionInput,
  ApprovalDetail,
  ApprovalItem,
  ApprovalStatus,
  Attachment,
  Availability,
  ChatMessage,
  ClientDashboard,
  Conversation,
  DownloadLink,
  FileDetail,
  FileFolder,
  FileItem,
  NewMessage,
  NewTicket,
  Ticket,
  TicketPatch,
  TicketStatus,
  ClientTeam,
  ClientTeamMember,
  EmployeeDashboard,
  InfluencerDashboard,
  InviteInfo,
  LoginEvent,
  LoginResult,
  NewComment,
  NewPinComment,
  Organisation,
  PartnerDashboard,
  PinComment,
  PortalSettings,
  ProjectDetail,
  ProjectPage,
  ProjectQuery,
  RepInvite,
  RepPatch,
  ReviewInput,
  Session,
  TaskComment,
  TaskDetail,
  TaskItem,
  TaskPatch,
  TaskQuery,
  User,
  UserInvite,
} from '@/types';
import * as accounts from './mock/accounts';
import * as approvalsMock from './mock/approvals';
import * as chat from './mock/chat';
import * as files from './mock/files';
import * as mock from './mock/handlers';

const MODE = (import.meta.env.VITE_API_MODE ?? 'mock') as 'mock' | 'http';
const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
const DELAY = Number(import.meta.env.VITE_MOCK_DELAY_MS ?? 350);

export const isMock = MODE === 'mock';

/* ---------- session held in memory, mirrored for page reloads ---------- */
// Phase 0 keeps the mock session in sessionStorage so a refresh keeps you signed in.
// Phase 1: keep the access token in memory only and restore it from the
// httpOnly refresh cookie via POST /auth/refresh. Never put tokens in localStorage.
const KEY = 'webinger.mock.session';
let current: Session | null = null;
try {
  const raw = sessionStorage.getItem(KEY);
  if (raw && isMock) current = JSON.parse(raw) as Session;
} catch {
  current = null;
}
const remember = (s: Session | null) => {
  current = s;
  try {
    if (s && isMock) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage can be unavailable in private modes; memory still works */
  }
};
export const getSession = () => current;

/* ---------- session events: the auth context listens to these ---------- */
type SessionEvent = { type: 'signedOut'; reason: string } | { type: 'userChanged'; user: User };
const listeners = new Set<(e: SessionEvent) => void>();
export const onSessionEvent = (fn: (e: SessionEvent) => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
const emit = (e: SessionEvent) => listeners.forEach((fn) => fn(e));

let signOutReason: string | null = null;
/** The login page shows why the user was signed out (e.g. forced logout), once. */
export const takeSignOutReason = () => {
  const r = signOutReason;
  signOutReason = null;
  return r;
};

function expire(reason: string) {
  if (!current) return;
  remember(null);
  signOutReason = reason;
  emit({ type: 'signedOut', reason });
}

/* ---------- transport ---------- */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Authenticated mock call. Re-checks the session first, like the real API does on every request. */
async function fromMock<T>(fn: (user: User) => T): Promise<T> {
  await wait(DELAY);
  if (!current) throw new ApiError({ status: 401, title: 'Unauthorized', detail: 'Please sign in again.' });
  let user: User;
  try {
    user = accounts.checkSession(current);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) expire(e.message);
    throw e;
  }
  // Role or permissions changed on the server (e.g. billing granted): keep the UI in step.
  if (JSON.stringify(user) !== JSON.stringify(current.user)) {
    remember({ ...current, user });
    emit({ type: 'userChanged', user });
  }
  return structuredClone(fn(user));
}

/** Mock call that needs no session (sign-in, invite and reset links). */
async function fromMockPublic<T>(fn: () => T): Promise<T> {
  await wait(DELAY);
  return structuredClone(fn());
}

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(current ? { Authorization: `Bearer ${current.accessToken}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    let problem: ApiProblem = { status: res.status, title: res.statusText };
    try {
      problem = { ...problem, ...(await res.json()) };
    } catch {
      /* body was not JSON */
    }
    const err = new ApiError(problem);
    // Phase 1: try POST /auth/refresh once before giving up.
    if (res.status === 401 && current) expire(err.message);
    throw err;
  }
  return res.status === 204 || res.status === 202 ? (undefined as T) : ((await res.json()) as T);
}

/** Multipart upload; the browser sets the boundary, so no JSON content type here. */
async function httpUpload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    body: form,
    credentials: 'include',
    headers: current ? { Authorization: `Bearer ${current.accessToken}` } : {},
  });
  if (!res.ok) {
    let problem: ApiProblem = { status: res.status, title: res.statusText };
    try {
      problem = { ...problem, ...(await res.json()) };
    } catch {
      /* body was not JSON */
    }
    throw new ApiError(problem);
  }
  return (await res.json()) as T;
}

/** Builds ?a=1&b=2 from an object, skipping empty values. */
function qs(params: object): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
const enc = encodeURIComponent;

const isSession = (r: LoginResult): r is Session => 'accessToken' in r;

/* ---------- endpoints (one per path in docs/api/openapi.yaml) ---------- */
export const api = {
  auth: {
    /** Returns a session, or a two-step challenge for admins and managers. */
    async login(email: string, password: string): Promise<LoginResult> {
      const r = isMock
        ? await fromMockPublic(() => accounts.login(email, password))
        : await http<LoginResult>('/auth/login', json('POST', { email, password }));
      if (isSession(r)) remember(r);
      return r;
    },
    async verifyMfa(mfaToken: string, code: string): Promise<Session> {
      const s = isMock
        ? await fromMockPublic(() => accounts.verifyMfa(mfaToken, code))
        : await http<Session>('/auth/mfa/verify', json('POST', { mfaToken, code }));
      remember(s);
      return s;
    },
    async logout(): Promise<void> {
      if (!isMock) await http<void>('/auth/logout', { method: 'POST' }).catch(() => undefined);
      remember(null);
    },
    me: () => (isMock ? fromMock((u) => u) : http<User>('/me')),
    getInvite: (token: string) =>
      isMock ? fromMockPublic(() => accounts.getInvite(token)) : http<InviteInfo>(`/auth/invites/${enc(token)}`),
    async acceptInvite(token: string, password: string): Promise<Session> {
      const s = isMock
        ? await fromMockPublic(() => accounts.acceptInvite(token, password))
        : await http<Session>(`/auth/invites/${enc(token)}/accept`, json('POST', { password }));
      remember(s);
      return s;
    },
    forgotPassword: (email: string) =>
      isMock ? fromMockPublic(() => accounts.forgotPassword(email)) : http<void>('/auth/password/forgot', json('POST', { email })),
    resetPassword: (token: string, password: string) =>
      isMock
        ? fromMockPublic(() => accounts.resetPassword(token, password))
        : http<void>('/auth/password/reset', json('POST', { token, password })),
  },
  dashboard: {
    admin: () => (isMock ? fromMock(mock.adminDashboard) : http<AdminDashboard>('/dashboard/admin')),
    client: () => (isMock ? fromMock(mock.clientDashboard) : http<ClientDashboard>('/dashboard/client')),
    employee: () => (isMock ? fromMock(mock.employeeDashboard) : http<EmployeeDashboard>('/dashboard/employee')),
    influencer: () => (isMock ? fromMock(mock.influencerDashboard) : http<InfluencerDashboard>('/dashboard/influencer')),
    partner: () => (isMock ? fromMock(mock.partnerDashboard) : http<PartnerDashboard>('/dashboard/partner')),
  },
  projects: {
    list: (q: ProjectQuery = {}) =>
      isMock ? fromMock((u) => mock.listProjects(u, q)) : http<ProjectPage>(`/projects${qs(q)}`),
    get: (id: string) => (isMock ? fromMock((u) => mock.getProject(u, id)) : http<ProjectDetail>(`/projects/${enc(id)}`)),
  },
  tasks: {
    list: (q: TaskQuery = {}) => (isMock ? fromMock((u) => mock.listTasks(u, q)) : http<TaskItem[]>(`/tasks${qs(q)}`)),
    get: (id: string) => (isMock ? fromMock((u) => mock.getTask(u, id)) : http<TaskDetail>(`/tasks/${enc(id)}`)),
    update: (id: string, patch: TaskPatch) =>
      isMock
        ? fromMock((u) => mock.patchTask(u, id, patch))
        : http<TaskDetail>(`/tasks/${enc(id)}`, json('PATCH', patch)),
    setChecklistItem: (id: string, itemId: string, done: boolean) =>
      isMock
        ? fromMock((u) => mock.setChecklistItem(u, id, itemId, done))
        : http<TaskDetail>(`/tasks/${enc(id)}/checklist/${enc(itemId)}`, json('PATCH', { done })),
    addComment: (id: string, body: NewComment) =>
      isMock
        ? fromMock((u) => mock.addComment(u, id, body))
        : http<TaskComment>(`/tasks/${enc(id)}/comments`, json('POST', body)),
    review: (id: string, body: ReviewInput) =>
      isMock ? fromMock((u) => mock.reviewTask(u, id, body)) : http<TaskDetail>(`/tasks/${enc(id)}/review`, json('POST', body)),
  },
  approvals: {
    list: (q: { status?: ApprovalStatus; projectId?: string } = {}) =>
      isMock ? fromMock((u) => approvalsMock.listApprovals(u, q)) : http<ApprovalItem[]>(`/approvals${qs(q)}`),
    get: (id: string) => (isMock ? fromMock((u) => approvalsMock.getApproval(u, id)) : http<ApprovalDetail>(`/approvals/${enc(id)}`)),
    decide: (id: string, body: ApprovalDecisionInput) =>
      isMock
        ? fromMock((u) => approvalsMock.decideApproval(u, id, body))
        : http<ApprovalDetail>(`/approvals/${enc(id)}/decision`, json('POST', body)),
    comment: (id: string, body: NewPinComment) =>
      isMock
        ? fromMock((u) => approvalsMock.addPinComment(u, id, body))
        : http<PinComment>(`/approvals/${enc(id)}/comments`, json('POST', body)),
  },
  clientTeam: {
    get: () => (isMock ? fromMock(accounts.getTeam) : http<ClientTeam>('/client/team')),
    invite: (body: RepInvite) =>
      isMock ? fromMock((u) => accounts.inviteRep(u, body)) : http<ClientTeamMember>('/client/team/invites', json('POST', body)),
    update: (id: string, patch: RepPatch) =>
      isMock ? fromMock((u) => accounts.updateRep(u, id, patch)) : http<ClientTeamMember>(`/client/team/${enc(id)}`, json('PATCH', patch)),
  },
  admin: {
    users: (q: AdminUserQuery = {}) => (isMock ? fromMock((u) => accounts.listUsers(u, q)) : http<AdminUser[]>(`/admin/users${qs(q)}`)),
    organisations: () => (isMock ? fromMock(accounts.listOrganisations) : http<Organisation[]>('/admin/organisations')),
    invite: (body: UserInvite) =>
      isMock ? fromMock((u) => accounts.inviteUser(u, body)) : http<AdminUser>('/admin/users/invites', json('POST', body)),
    approve: (id: string) =>
      isMock ? fromMock((u) => accounts.approveUser(u, id)) : http<AdminUser>(`/admin/users/${enc(id)}/approve`, json('POST')),
    suspend: (id: string) =>
      isMock ? fromMock((u) => accounts.suspendUser(u, id)) : http<AdminUser>(`/admin/users/${enc(id)}/suspend`, json('POST')),
    reactivate: (id: string) =>
      isMock ? fromMock((u) => accounts.reactivateUser(u, id)) : http<AdminUser>(`/admin/users/${enc(id)}/reactivate`, json('POST')),
    resetPassword: (id: string) =>
      isMock ? fromMock((u) => accounts.adminResetPassword(u, id)) : http<void>(`/admin/users/${enc(id)}/reset`, json('POST')),
    forceLogout: (id: string) =>
      isMock ? fromMock((u) => accounts.forceLogout(u, id)) : http<void>(`/admin/users/${enc(id)}/logout`, json('POST')),
    loginHistory: (userId?: string) =>
      isMock ? fromMock((u) => accounts.loginHistory(u, userId)) : http<LoginEvent[]>(`/admin/login-history${qs({ userId })}`),
  },
  settings: {
    get: () => (isMock ? fromMock(accounts.getSettings) : http<PortalSettings>('/settings')),
    save: (body: PortalSettings) =>
      isMock ? fromMock((u) => accounts.saveSettings(u, body)) : http<PortalSettings>('/settings', json('PUT', body)),
  },
  messages: {
    conversations: () => (isMock ? fromMock(chat.listConversations) : http<Conversation[]>('/conversations')),
    /** Only messages after `after` (a message id), so polling stays cheap. */
    list: (conversationId: string, after?: string) =>
      isMock
        ? fromMock((u) => chat.listMessages(u, conversationId, after))
        : http<ChatMessage[]>(`/conversations/${enc(conversationId)}/messages${qs({ after })}`),
    send: (conversationId: string, body: NewMessage) =>
      isMock
        ? fromMock((u) => chat.postMessage(u, conversationId, body))
        : http<ChatMessage>(`/conversations/${enc(conversationId)}/messages`, json('POST', body)),
    markRead: (conversationId: string, upToId: string) =>
      isMock
        ? fromMock((u) => chat.markRead(u, conversationId, upToId))
        : http<void>(`/conversations/${enc(conversationId)}/read`, json('POST', { upToId })),
    toTicket: (messageId: string, body: NewTicket) =>
      isMock ? fromMock((u) => chat.createTicket(u, messageId, body)) : http<Ticket>(`/messages/${enc(messageId)}/ticket`, json('POST', body)),
    availability: () => (isMock ? fromMock(() => chat.availability()) : http<Availability>('/availability')),
  },
  tickets: {
    list: (q: { status?: TicketStatus } = {}) => (isMock ? fromMock((u) => chat.listTickets(u, q)) : http<Ticket[]>(`/tickets${qs(q)}`)),
    update: (id: string, patch: TicketPatch) =>
      isMock ? fromMock((u) => chat.updateTicket(u, id, patch)) : http<Ticket>(`/tickets/${enc(id)}`, json('PATCH', patch)),
  },
  uploads: {
    /** Uploads one file and returns an id to attach to a message. */
    create(file: File): Promise<Attachment> {
      if (isMock) {
        // The prototype keeps images in memory for this tab so they can be previewed.
        const url = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
        return fromMock((u) => chat.registerUpload(u, { name: file.name, sizeKb: file.size / 1024, url }));
      }
      const form = new FormData();
      form.append('file', file);
      return httpUpload<Attachment>('/uploads', form);
    },
  },
  files: {
    list: (q: { folder?: FileFolder } = {}) => (isMock ? fromMock((u) => files.listFiles(u, q)) : http<FileItem[]>(`/files${qs(q)}`)),
    get: (id: string) => (isMock ? fromMock((u) => files.getFile(u, id)) : http<FileDetail>(`/files/${enc(id)}`)),
    /** A download link that expires after a few minutes. */
    async link(id: string, version?: number): Promise<DownloadLink> {
      if (!isMock) return http<DownloadLink>(`/files/${enc(id)}/link`, json('POST', { version }));
      const link = await fromMock((u) => files.createDownloadLink(u, id, version));
      // Demo: turn the signed path into a real browser download of the preview file.
      const f = files.resolveDownload(link.url);
      return { ...link, fileName: f.fileName, url: URL.createObjectURL(new Blob([f.content], { type: f.mime })) };
    },
  },
  /** Prototype only: emails the mock would have sent, so invite and reset links can be opened. */
  demo: {
    outbox: (to?: string) => (isMock ? fromMockPublic(() => accounts.demoOutbox(to)) : Promise.resolve([])),
  },
};
