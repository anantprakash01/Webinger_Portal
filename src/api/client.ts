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
  BillingOverview,
  CampaignDetail,
  CampaignItem,
  CollabRequest,
  CollabRequestInput,
  Coverage,
  DiscoveryCard,
  DiscoveryQuery,
  InfluencerAdminItem,
  InfluencerProfile,
  InfluencerSignup,
  MediaContact,
  MyCampaign,
  MyPayouts,
  NewBrief,
  NewCampaign,
  NewMediaContact,
  NewPartnerInvoice,
  OfferInput,
  OfferItem,
  PartnerBrief,
  PartnerInvoice,
  Payout,
  Pitch,
  PitchStatus,
  PrHub,
  ProfileInput,
  VerificationStatus,
  AttendanceWeek,
  ConvertLead,
  LeadActivityInput,
  LeadDetail,
  LeadPatch,
  LeadSource,
  LeaveDecisionInput,
  LeaveRequest,
  LeaveStatus,
  MyAttendance,
  MyLeave,
  NewLead,
  NewLeave,
  NewTimeEntry,
  PersonItem,
  PipelineBoard,
  Scorecard,
  TimeEntry,
  Timesheet,
  TimerStart,
  Workload,
  ClientReport,
  ExpenseItem,
  ExportFile,
  ExportKind,
  ExportLogItem,
  FinanceSummary,
  InvoiceDetail,
  InvoiceListItem,
  InvoiceStatus,
  NewExpense,
  NewInvoice,
  NewQuote,
  PaymentInput,
  PaymentItem,
  ProfitReport,
  QuoteDetail,
  QuoteListItem,
  QuoteStatus,
  ReportInput,
  ReportStatusItem,
  ClientDashboard,
  ClientDetail,
  ClientListItem,
  ClientPatch,
  ClientQuery,
  NewClient,
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
import * as clientsMock from './mock/clients';
import * as files from './mock/files';
import * as finance from './mock/finance';
import * as reportsMock from './mock/reports';
import * as peopleMock from './mock/people';
import * as pipelineMock from './mock/pipeline';
import * as timesheetMock from './mock/timesheet';
import * as influencersMock from './mock/influencers';
import * as partnersMock from './mock/partners';
import * as offersMock from './mock/offers';
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
  clients: {
    list: (q: ClientQuery = {}) => (isMock ? fromMock((u) => clientsMock.listClients(u, q)) : http<ClientListItem[]>(`/clients${qs(q)}`)),
    get: (id: string) => (isMock ? fromMock((u) => clientsMock.getClient(u, id)) : http<ClientDetail>(`/clients/${enc(id)}`)),
    create: (body: NewClient) =>
      isMock ? fromMock((u) => clientsMock.createClient(u, body)) : http<ClientDetail>('/clients', json('POST', body)),
    update: (id: string, patch: ClientPatch) =>
      isMock ? fromMock((u) => clientsMock.updateClient(u, id, patch)) : http<ClientDetail>(`/clients/${enc(id)}`, json('PATCH', patch)),
    addNote: (id: string, text: string) =>
      isMock ? fromMock((u) => clientsMock.addClientNote(u, id, text)) : http<ClientDetail>(`/clients/${enc(id)}/notes`, json('POST', { text })),
    /** Active Webinger staff who can be an account manager or backup. */
    managers: () =>
      isMock
        ? fromMock(clientsMock.staffChoices)
        : http<Array<{ id: string; name: string; title?: string }>>('/clients/account-managers'),
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
  /** Week 5. Admin finance: SUPER_ADMIN only. */
  finance: {
    summary: () => (isMock ? fromMock(finance.financeSummary) : http<FinanceSummary>('/finance/summary')),
    invoices: (q: { status?: InvoiceStatus; clientId?: string; q?: string } = {}) =>
      isMock ? fromMock((u) => finance.listInvoices(u, q)) : http<InvoiceListItem[]>(`/finance/invoices${qs(q)}`),
    invoice: (id: string) => (isMock ? fromMock((u) => finance.getInvoice(u, id)) : http<InvoiceDetail>(`/finance/invoices/${enc(id)}`)),
    createInvoice: (body: NewInvoice) =>
      isMock ? fromMock((u) => finance.createInvoice(u, body)) : http<InvoiceDetail>('/finance/invoices', json('POST', body)),
    updateInvoice: (id: string, body: Partial<NewInvoice>) =>
      isMock ? fromMock((u) => finance.updateInvoice(u, id, body)) : http<InvoiceDetail>(`/finance/invoices/${enc(id)}`, json('PATCH', body)),
    sendInvoice: (id: string) =>
      isMock ? fromMock((u) => finance.sendInvoice(u, id)) : http<InvoiceDetail>(`/finance/invoices/${enc(id)}/send`, json('POST', {})),
    remind: (id: string) =>
      isMock ? fromMock((u) => finance.remindInvoice(u, id)) : http<InvoiceDetail>(`/finance/invoices/${enc(id)}/remind`, json('POST', {})),
    cancel: (id: string, reason: string) =>
      isMock ? fromMock((u) => finance.cancelInvoice(u, id, reason)) : http<InvoiceDetail>(`/finance/invoices/${enc(id)}/cancel`, json('POST', { reason })),
    recordPayment: (id: string, body: PaymentInput) =>
      isMock ? fromMock((u) => finance.recordPayment(u, id, body)) : http<InvoiceDetail>(`/finance/invoices/${enc(id)}/payments`, json('POST', body)),
    quotes: (q: { status?: QuoteStatus; clientId?: string } = {}) =>
      isMock ? fromMock((u) => finance.listQuotes(u, q)) : http<QuoteListItem[]>(`/finance/quotes${qs(q)}`),
    quote: (id: string) => (isMock ? fromMock((u) => finance.getQuote(u, id)) : http<QuoteDetail>(`/finance/quotes/${enc(id)}`)),
    createQuote: (body: NewQuote) => (isMock ? fromMock((u) => finance.createQuote(u, body)) : http<QuoteDetail>('/finance/quotes', json('POST', body))),
    sendQuote: (id: string) =>
      isMock ? fromMock((u) => finance.sendQuote(u, id)) : http<QuoteDetail>(`/finance/quotes/${enc(id)}/send`, json('POST', {})),
    payments: (q: { clientId?: string } = {}) =>
      isMock ? fromMock((u) => finance.listPayments(u, q)) : http<PaymentItem[]>(`/finance/payments${qs(q)}`),
    expenses: (q: { month?: string; category?: string } = {}) =>
      isMock ? fromMock((u) => finance.listExpenses(u, q)) : http<ExpenseItem[]>(`/finance/expenses${qs(q)}`),
    createExpense: (body: NewExpense) =>
      isMock ? fromMock((u) => finance.createExpense(u, body)) : http<ExpenseItem>('/finance/expenses', json('POST', body)),
    profit: () => (isMock ? fromMock(finance.profitReport) : http<ProfitReport>('/finance/profit')),
    /** CSV for the accountant. Every export is logged on the server. */
    exportFile: (kind: ExportKind, from: string, to: string) =>
      isMock ? fromMock((u) => finance.exportCsv(u, kind, from, to)) : http<ExportFile>(`/finance/export${qs({ kind, from, to })}`),
    exports: () => (isMock ? fromMock(finance.exportHistory) : http<ExportLogItem[]>('/finance/exports')),
    projects: (clientId: string) =>
      isMock
        ? fromMock((u) => finance.billableProjects(u, clientId))
        : http<Array<{ id: string; name: string; service: string }>>(`/finance/projects${qs({ clientId })}`),
  },
  /** Week 5. Client billing: client roles with BILLING_VIEW, own company only. */
  billing: {
    overview: () => (isMock ? fromMock(finance.billingOverview) : http<BillingOverview>('/billing')),
    invoice: (id: string) => (isMock ? fromMock((u) => finance.getBillingInvoice(u, id)) : http<InvoiceDetail>(`/billing/invoices/${enc(id)}`)),
    /** Demo "Pay now". Phase 2 returns a payment-gateway order instead. */
    pay: (id: string) => (isMock ? fromMock((u) => finance.payInvoice(u, id)) : http<InvoiceDetail>(`/billing/invoices/${enc(id)}/pay`, json('POST', {}))),
    quote: (id: string) => (isMock ? fromMock((u) => finance.getBillingQuote(u, id)) : http<QuoteDetail>(`/billing/quotes/${enc(id)}`)),
    accept: (id: string) =>
      isMock ? fromMock((u) => finance.acceptQuote(u, id)) : http<QuoteDetail>(`/billing/quotes/${enc(id)}/accept`, json('POST', {})),
    decline: (id: string, reason: string) =>
      isMock ? fromMock((u) => finance.declineQuote(u, id, reason)) : http<QuoteDetail>(`/billing/quotes/${enc(id)}/decline`, json('POST', { reason })),
  },
  /** Week 5. Monthly client results. */
  reports: {
    mine: (month?: string) => (isMock ? fromMock((u) => reportsMock.clientReport(u, month)) : http<ClientReport>(`/reports${qs({ month })}`)),
    statuses: (month?: string) =>
      isMock ? fromMock((u) => reportsMock.reportStatuses(u, month)) : http<ReportStatusItem[]>(`/admin/reports${qs({ month })}`),
    get: (clientId: string, month: string) =>
      isMock ? fromMock((u) => reportsMock.adminReport(u, clientId, month)) : http<ClientReport>(`/admin/reports/${enc(clientId)}/${enc(month)}`),
    save: (clientId: string, month: string, body: ReportInput) =>
      isMock
        ? fromMock((u) => reportsMock.saveReport(u, clientId, month, body))
        : http<ClientReport>(`/admin/reports/${enc(clientId)}/${enc(month)}`, json('PUT', body)),
    publish: (clientId: string, month: string) =>
      isMock
        ? fromMock((u) => reportsMock.publishReport(u, clientId, month))
        : http<ClientReport>(`/admin/reports/${enc(clientId)}/${enc(month)}/publish`, json('POST', {})),
  },
  /** Week 6. Sales pipeline: admin area; converting a deal is SUPER_ADMIN only. */
  pipeline: {
    board: (q: { q?: string; ownerId?: string; source?: LeadSource } = {}) =>
      isMock ? fromMock((u) => pipelineMock.pipeline(u, q)) : http<PipelineBoard>(`/pipeline${qs(q)}`),
    lead: (id: string) => (isMock ? fromMock((u) => pipelineMock.getLead(u, id)) : http<LeadDetail>(`/pipeline/leads/${enc(id)}`)),
    create: (body: NewLead) => (isMock ? fromMock((u) => pipelineMock.createLead(u, body)) : http<LeadDetail>('/pipeline/leads', json('POST', body))),
    update: (id: string, patch: LeadPatch) =>
      isMock ? fromMock((u) => pipelineMock.updateLead(u, id, patch)) : http<LeadDetail>(`/pipeline/leads/${enc(id)}`, json('PATCH', patch)),
    addActivity: (id: string, body: LeadActivityInput) =>
      isMock ? fromMock((u) => pipelineMock.addLeadActivity(u, id, body)) : http<LeadDetail>(`/pipeline/leads/${enc(id)}/activities`, json('POST', body)),
    convert: (id: string, body: ConvertLead) =>
      isMock ? fromMock((u) => pipelineMock.convertLead(u, id, body)) : http<LeadDetail>(`/pipeline/leads/${enc(id)}/convert`, json('POST', body)),
  },
  /** Week 6. People: admin area. */
  people: {
    list: () => (isMock ? fromMock(peopleMock.listPeople) : http<PersonItem[]>('/people')),
    attendance: (week?: string) => (isMock ? fromMock((u) => peopleMock.attendanceWeek(u, week)) : http<AttendanceWeek>(`/people/attendance${qs({ week })}`)),
    leave: (q: { status?: LeaveStatus } = {}) => (isMock ? fromMock((u) => peopleMock.listLeave(u, q)) : http<LeaveRequest[]>(`/people/leave${qs(q)}`)),
    decideLeave: (id: string, body: LeaveDecisionInput) =>
      isMock ? fromMock((u) => peopleMock.decideLeave(u, id, body)) : http<LeaveRequest>(`/people/leave/${enc(id)}/decision`, json('POST', body)),
    workload: (week?: string) => (isMock ? fromMock((u) => peopleMock.workload(u, week)) : http<Workload>(`/people/workload${qs({ week })}`)),
    scorecards: () => (isMock ? fromMock(peopleMock.scorecards) : http<Scorecard[]>('/people/scorecards')),
    scorecard: (id: string) => (isMock ? fromMock((u) => peopleMock.personScorecard(u, id)) : http<Scorecard>(`/people/${enc(id)}/scorecard`)),
  },
  /** Week 6. The signed-in staff member's own attendance, leave, performance and time. */
  me: {
    attendance: () => (isMock ? fromMock(peopleMock.myAttendance) : http<MyAttendance>('/me/attendance')),
    checkIn: (mode: 'OFFICE' | 'WFH') =>
      isMock ? fromMock((u) => peopleMock.checkIn(u, mode)) : http<MyAttendance>('/me/attendance/check-in', json('POST', { mode })),
    checkOut: () => (isMock ? fromMock(peopleMock.checkOut) : http<MyAttendance>('/me/attendance/check-out', json('POST', {}))),
    leave: () => (isMock ? fromMock(peopleMock.myLeave) : http<MyLeave>('/me/leave')),
    requestLeave: (body: NewLeave) => (isMock ? fromMock((u) => peopleMock.requestLeave(u, body)) : http<LeaveRequest>('/me/leave', json('POST', body))),
    cancelLeave: (id: string) =>
      isMock ? fromMock((u) => peopleMock.cancelLeave(u, id)) : http<LeaveRequest>(`/me/leave/${enc(id)}/cancel`, json('POST', {})),
    performance: () => (isMock ? fromMock(peopleMock.myPerformance) : http<Scorecard>('/me/performance')),
    timesheet: (week?: string) => (isMock ? fromMock((u) => timesheetMock.myTimesheet(u, week)) : http<Timesheet>(`/me/timesheet${qs({ week })}`)),
    addTime: (body: NewTimeEntry) => (isMock ? fromMock((u) => timesheetMock.addTimeEntry(u, body)) : http<TimeEntry>('/me/time-entries', json('POST', body))),
    deleteTime: (id: string) =>
      isMock ? fromMock((u) => timesheetMock.deleteTimeEntry(u, id)) : http<void>(`/me/time-entries/${enc(id)}`, { method: 'DELETE' }),
    startTimer: (body: TimerStart) => (isMock ? fromMock((u) => timesheetMock.startTimer(u, body)) : http<TimeEntry>('/me/timer/start', json('POST', body))),
    stopTimer: () => (isMock ? fromMock(timesheetMock.stopTimer) : http<TimeEntry | null>('/me/timer/stop', json('POST', {}))),
    submitWeek: (weekStart: string) =>
      isMock ? fromMock((u) => timesheetMock.submitWeek(u, weekStart)) : http<Timesheet>('/me/timesheet/submit', json('POST', { weekStart })),
  },
  /** Week 7. Influencers: public sign-up, the creator's own pages, client discovery and admin. */
  influencers: {
    signUp: (body: InfluencerSignup) =>
      isMock ? fromMockPublic(() => influencersMock.signUp(body)) : http<{ email: string }>('/public/influencers/signup', json('POST', body)),
    async verifyEmail(token: string): Promise<Session> {
      const s = isMock ? await fromMockPublic(() => influencersMock.verifySignup(token)) : await http<Session>('/public/influencers/verify', json('POST', { token }));
      remember(s);
      return s;
    },
    myProfile: () => (isMock ? fromMock(influencersMock.myProfile) : http<InfluencerProfile>('/me/influencer')),
    updateProfile: (body: ProfileInput) =>
      isMock ? fromMock((u) => influencersMock.updateMyProfile(u, body)) : http<InfluencerProfile>('/me/influencer', json('PATCH', body)),
    submitProfile: () => (isMock ? fromMock(influencersMock.submitForVerification) : http<InfluencerProfile>('/me/influencer/submit', json('POST', {}))),
    myCampaigns: () => (isMock ? fromMock(influencersMock.myCampaigns) : http<MyCampaign[]>('/me/campaigns')),
    respond: (id: string, action: 'ACCEPT' | 'COUNTER' | 'DECLINE', counterFee?: number) =>
      isMock
        ? fromMock((u) => influencersMock.respondToInvite(u, id, action, counterFee))
        : http<MyCampaign>(`/me/campaigns/${enc(id)}/respond`, json('POST', { action, counterFee })),
    submitDraft: (id: string, body: { caption: string; fileName: string; disclosure: boolean }) =>
      isMock ? fromMock((u) => influencersMock.submitDraft(u, id, body)) : http<MyCampaign>(`/me/campaigns/${enc(id)}/draft`, json('POST', body)),
    submitLive: (id: string, body: { liveUrl: string; proofFile: string }) =>
      isMock ? fromMock((u) => influencersMock.submitLive(u, id, body)) : http<MyCampaign>(`/me/campaigns/${enc(id)}/live`, json('POST', body)),
    myPayouts: () => (isMock ? fromMock(influencersMock.myPayouts) : http<MyPayouts>('/me/payouts')),
    // client
    discover: (q: DiscoveryQuery = {}) => (isMock ? fromMock((u) => influencersMock.discover(u, q)) : http<DiscoveryCard[]>(`/discovery/influencers${qs(q)}`)),
    toggleShortlist: (id: string) =>
      isMock ? fromMock((u) => influencersMock.toggleShortlist(u, id)) : http<DiscoveryCard>(`/discovery/shortlist/${enc(id)}`, json('POST', {})),
    requestCollab: (body: CollabRequestInput) =>
      isMock ? fromMock((u) => influencersMock.requestCollab(u, body)) : http<CollabRequest>('/discovery/requests', json('POST', body)),
    myRequests: () => (isMock ? fromMock(influencersMock.myCollabRequests) : http<CollabRequest[]>('/discovery/requests')),
    // admin
    list: (q: { verification?: VerificationStatus; q?: string } = {}) =>
      isMock ? fromMock((u) => influencersMock.listInfluencers(u, q)) : http<InfluencerAdminItem[]>(`/influencers${qs(q)}`),
    decide: (id: string, decision: 'VERIFY' | 'REJECT', reason?: string) =>
      isMock
        ? fromMock((u) => influencersMock.decideVerification(u, id, decision, reason))
        : http<InfluencerAdminItem>(`/influencers/${enc(id)}/verification`, json('POST', { decision, reason })),
    requests: () => (isMock ? fromMock(influencersMock.listCollabRequests) : http<CollabRequest[]>('/influencers/requests')),
    campaigns: () => (isMock ? fromMock(influencersMock.listCampaigns) : http<CampaignItem[]>('/campaigns')),
    campaign: (id: string) => (isMock ? fromMock((u) => influencersMock.getCampaign(u, id)) : http<CampaignDetail>(`/campaigns/${enc(id)}`)),
    createCampaign: (body: NewCampaign) =>
      isMock ? fromMock((u) => influencersMock.createCampaign(u, body)) : http<CampaignDetail>('/campaigns', json('POST', body)),
    invite: (id: string, body: { influencerId: string; fee: number; respondBy: string; draftDue: string }) =>
      isMock ? fromMock((u) => influencersMock.inviteToCampaign(u, id, body)) : http<CampaignDetail>(`/campaigns/${enc(id)}/invites`, json('POST', body)),
    decideCounter: (id: string, influencerId: string, accept: boolean) =>
      isMock
        ? fromMock((u) => influencersMock.decideCounter(u, id, influencerId, accept))
        : http<CampaignDetail>(`/campaigns/${enc(id)}/collabs/${enc(influencerId)}/counter`, json('POST', { accept })),
    reviewDraft: (id: string, influencerId: string, decision: 'APPROVE' | 'CHANGES', feedback?: string) =>
      isMock
        ? fromMock((u) => influencersMock.reviewDraft(u, id, influencerId, decision, feedback))
        : http<CampaignDetail>(`/campaigns/${enc(id)}/collabs/${enc(influencerId)}/review`, json('POST', { decision, feedback })),
    rate: (id: string, influencerId: string, rating: number) =>
      isMock
        ? fromMock((u) => influencersMock.rateCollab(u, id, influencerId, rating))
        : http<CampaignDetail>(`/campaigns/${enc(id)}/collabs/${enc(influencerId)}/rating`, json('POST', { rating })),
    payouts: () => (isMock ? fromMock(influencersMock.listPayouts) : http<Payout[]>('/payouts')),
    approvePayout: (id: string) => (isMock ? fromMock((u) => influencersMock.approvePayout(u, id)) : http<Payout>(`/payouts/${enc(id)}/approve`, json('POST', {}))),
    rejectPayout: (id: string, reason: string) =>
      isMock ? fromMock((u) => influencersMock.rejectPayout(u, id, reason)) : http<Payout>(`/payouts/${enc(id)}/reject`, json('POST', { reason })),
    markPaid: (id: string, reference: string) =>
      isMock ? fromMock((u) => influencersMock.markPayoutPaid(u, id, reference)) : http<Payout>(`/payouts/${enc(id)}/paid`, json('POST', { reference })),
  },
  /** Week 7. Partner portal and the internal PR hub. */
  partners: {
    myBriefs: () => (isMock ? fromMock(partnersMock.myBriefs) : http<PartnerBrief[]>('/partner/briefs')),
    start: (id: string) => (isMock ? fromMock((u) => partnersMock.startBrief(u, id)) : http<PartnerBrief>(`/partner/briefs/${enc(id)}/start`, json('POST', {}))),
    submit: (id: string, body: { files: string[]; note: string }) =>
      isMock ? fromMock((u) => partnersMock.submitBrief(u, id, body)) : http<PartnerBrief>(`/partner/briefs/${enc(id)}/submit`, json('POST', body)),
    myInvoices: () => (isMock ? fromMock(partnersMock.myInvoices) : http<PartnerInvoice[]>('/partner/invoices')),
    submitInvoice: (body: NewPartnerInvoice) =>
      isMock ? fromMock((u) => partnersMock.submitInvoice(u, body)) : http<PartnerInvoice>('/partner/invoices', json('POST', body)),
    briefs: () => (isMock ? fromMock(partnersMock.listBriefs) : http<PartnerBrief[]>('/partner-briefs')),
    createBrief: (body: NewBrief) => (isMock ? fromMock((u) => partnersMock.createBrief(u, body)) : http<PartnerBrief>('/partner-briefs', json('POST', body))),
    reviewBrief: (id: string, decision: 'APPROVE' | 'CHANGES', feedback?: string) =>
      isMock
        ? fromMock((u) => partnersMock.reviewBrief(u, id, decision, feedback))
        : http<PartnerBrief>(`/partner-briefs/${enc(id)}/review`, json('POST', { decision, feedback })),
    invoices: () => (isMock ? fromMock(partnersMock.listPartnerInvoices) : http<PartnerInvoice[]>('/partner-invoices')),
    decideInvoice: (id: string, decision: 'APPROVE' | 'REJECT' | 'PAID', note?: string) =>
      isMock
        ? fromMock((u) => partnersMock.decidePartnerInvoice(u, id, decision, note))
        : http<PartnerInvoice>(`/partner-invoices/${enc(id)}/decision`, json('POST', { decision, note })),
    hub: () => (isMock ? fromMock(partnersMock.prHub) : http<PrHub>('/pr')),
    addContact: (body: NewMediaContact) => (isMock ? fromMock((u) => partnersMock.addContact(u, body)) : http<MediaContact>('/pr/contacts', json('POST', body))),
    updateContact: (id: string, patch: { verified?: boolean; doNotContact?: boolean; consent?: boolean }) =>
      isMock ? fromMock((u) => partnersMock.updateContact(u, id, patch)) : http<MediaContact>(`/pr/contacts/${enc(id)}`, json('PATCH', patch)),
    createPitch: (body: { title: string; clientId: string; recipientIds: string[] }) =>
      isMock ? fromMock((u) => partnersMock.createPitch(u, body)) : http<Pitch>('/pr/pitches', json('POST', body)),
    updatePitch: (id: string, status: PitchStatus) =>
      isMock ? fromMock((u) => partnersMock.updatePitch(u, id, status)) : http<Pitch>(`/pr/pitches/${enc(id)}`, json('PATCH', { status })),
    addCoverage: (body: { clientId: string; outlet: string; headline: string; url: string; date: string; reach: number; pitchId?: string }) =>
      isMock ? fromMock((u) => partnersMock.addCoverage(u, body)) : http<Coverage>('/pr/coverage', json('POST', body)),
    exportContacts: () => (isMock ? fromMock(partnersMock.exportContacts) : http<ExportFile>('/pr/contacts/export')),
  },
  /** Week 7. Dashboard offer slot. */
  offers: {
    click: (id: string) => (isMock ? fromMock((u) => offersMock.clickOffer(u, id)) : http<{ message: string }>(`/offers/${enc(id)}/click`, json('POST', {}))),
    dismiss: (id: string) => (isMock ? fromMock((u) => offersMock.dismissOffer(u, id)) : http<void>(`/offers/${enc(id)}/dismiss`, json('POST', {}))),
    list: () => (isMock ? fromMock(offersMock.listOffers) : http<OfferItem[]>('/offers')),
    create: (body: OfferInput) => (isMock ? fromMock((u) => offersMock.createOffer(u, body)) : http<OfferItem>('/offers', json('POST', body))),
    update: (id: string, body: OfferInput) =>
      isMock ? fromMock((u) => offersMock.updateOffer(u, id, body)) : http<OfferItem>(`/offers/${enc(id)}`, json('PUT', body)),
  },
  /** Prototype only: emails the mock would have sent, so invite and reset links can be opened. */
  demo: {
    outbox: (to?: string) => (isMock ? fromMockPublic(() => accounts.demoOutbox(to)) : Promise.resolve([])),
  },
};
