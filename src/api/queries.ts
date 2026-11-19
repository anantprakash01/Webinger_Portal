/**
 * TanStack Query hooks. Screens use these instead of calling `api.*` in effects.
 * Every hook still goes through `api` in ./client, so mock vs http stays one setting.
 */
import { useEffect } from 'react';
import { keepPreviousData, QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import { ApiError } from '@/types';
import type {
  AdminDashboard,
  ClientDashboard,
  EmployeeDashboard,
  InfluencerDashboard,
  PartnerDashboard,
} from '@/types';
import type {
  AdminUserQuery,
  ApprovalDecisionInput,
  ApprovalDetail,
  ApprovalStatus,
  ChatMessage,
  ClientTeam,
  ClientPatch,
  ClientQuery,
  NewClient,
  Conversation,
  NewMessage,
  NewTicket,
  Ticket,
  TicketPatch,
  NewPinComment,
  PortalSettings,
  RepInvite,
  RepPatch,
  ReviewInput,
  UserInvite,
} from '@/types';
import type {
  CollabRequestInput,
  DiscoveryQuery,
  NewBrief,
  NewCampaign,
  NewMediaContact,
  NewPartnerInvoice,
  OfferInput,
  PitchStatus,
  ProfileInput,
  VerificationStatus,
  ConvertLead,
  LeadActivityInput,
  LeadPatch,
  LeadSource,
  LeaveDecisionInput,
  LeaveStatus,
  NewLead,
  NewLeave,
  NewTimeEntry,
  PipelineBoard,
  TimerStart,
  ExportKind,
  InvoiceStatus,
  NewExpense,
  NewInvoice,
  NewQuote,
  PaymentInput,
  QuoteStatus,
  ReportInput,
} from '@/types';
import type { Area, NewComment, ProjectQuery, TaskDetail, TaskItem, TaskPatch, TaskQuery } from '@/types';
import { api } from './client';
import { INBOX_POLL_MS, subscribeInbox, subscribeThread } from './realtime';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // 4xx answers will not change on retry; only retry network and 5xx failures.
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

/** One place for cache keys, so invalidation can target a whole family. */
export const keys = {
  dashboard: (area: Area) => ['dashboard', area] as const,
  projects: (q: ProjectQuery) => ['projects', 'list', q] as const,
  project: (id: string) => ['projects', 'detail', id] as const,
  tasks: (q: TaskQuery) => ['tasks', 'list', q] as const,
  task: (id: string) => ['tasks', 'detail', id] as const,
};

/* ---------- reads ---------- */

interface DashboardByArea {
  admin: AdminDashboard;
  client: ClientDashboard;
  employee: EmployeeDashboard;
  influencer: InfluencerDashboard;
  partner: PartnerDashboard;
}
const DASHBOARD: { [A in Area]: () => Promise<DashboardByArea[A]> } = api.dashboard;

export function useDashboard<A extends Area>(area: A) {
  return useQuery<DashboardByArea[A]>({ queryKey: keys.dashboard(area), queryFn: DASHBOARD[area] });
}

export const useProjects = (q: ProjectQuery) =>
  useQuery({ queryKey: keys.projects(q), queryFn: () => api.projects.list(q), placeholderData: keepPreviousData });

export const useProject = (id: string) => useQuery({ queryKey: keys.project(id), queryFn: () => api.projects.get(id) });

export const useTasks = (q: TaskQuery) => useQuery({ queryKey: keys.tasks(q), queryFn: () => api.tasks.list(q) });

export const useTask = (id: string | null) =>
  useQuery({ queryKey: keys.task(id ?? ''), queryFn: () => api.tasks.get(id!), enabled: !!id });

/* ---------- writes ---------- */

type Snapshot = Array<[QueryKey, unknown]>;

/** After any task write, refresh everything that shows tasks or derived counts. */
function refreshAfterTaskWrite(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ['tasks'] });
  void qc.invalidateQueries({ queryKey: ['projects'] });
  void qc.invalidateQueries({ queryKey: ['dashboard'] });
}

/**
 * PATCH /tasks/{id} with an optimistic update: lists and the open drawer change
 * immediately, and roll back if the server refuses (e.g. the internal review rule).
 */
export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) => api.tasks.update(id, patch),
    onMutate: async ({ id, patch }) => {
      // Write the optimistic change first so the UI never flickers back, then stop
      // in-flight fetches without letting them restore the old data.
      const snapshot: Snapshot = [
        ...qc.getQueriesData({ queryKey: ['tasks'] }),
        ...qc.getQueriesData({ queryKey: ['projects', 'detail'] }),
      ];
      const apply = <T extends TaskItem>(t: T): T => (t.id === id ? { ...t, ...patch } : t);
      qc.setQueriesData<TaskItem[]>({ queryKey: ['tasks', 'list'] }, (old) => old?.map(apply));
      qc.setQueryData<TaskDetail>(keys.task(id), (old) => (old ? apply(old) : old));
      qc.setQueriesData<{ tasks?: TaskItem[] }>({ queryKey: ['projects', 'detail'] }, (old) =>
        old?.tasks ? { ...old, tasks: old.tasks.map(apply) } : old,
      );
      await qc.cancelQueries({ queryKey: ['tasks'] }, { revert: false });
      await qc.cancelQueries({ queryKey: ['projects', 'detail'] }, { revert: false });
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSuccess: (task) => qc.setQueryData(keys.task(task.id), task),
    onSettled: () => refreshAfterTaskWrite(qc),
  });
}

export function useSetChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, itemId, done }: { id: string; itemId: string; done: boolean }) =>
      api.tasks.setChecklistItem(id, itemId, done),
    onMutate: async ({ id, itemId, done }) => {
      const prev = qc.getQueryData<TaskDetail>(keys.task(id));
      if (prev) {
        const checklist = prev.checklist.map((c) => (c.id === itemId ? { ...c, done } : c));
        qc.setQueryData<TaskDetail>(keys.task(id), { ...prev, checklist, checklistDone: checklist.filter((c) => c.done).length });
      }
      await qc.cancelQueries({ queryKey: keys.task(id) }, { revert: false });
      return { prev };
    },
    onError: (_e, { id }, ctx) => ctx?.prev && qc.setQueryData(keys.task(id), ctx.prev),
    onSuccess: (task) => qc.setQueryData(keys.task(task.id), task),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['tasks', 'list'] }),
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: NewComment }) => api.tasks.addComment(id, body),
    onSuccess: (comment, { id }) => {
      qc.setQueryData<TaskDetail>(keys.task(id), (old) =>
        old ? { ...old, comments: [...old.comments, comment], commentCount: (old.commentCount ?? 0) + 1 } : old,
      );
      void qc.invalidateQueries({ queryKey: ['tasks', 'list'] });
    },
  });
}

/* ---------- Week 3: review, approvals, team, admin ---------- */

export function useReviewTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ReviewInput }) => api.tasks.review(id, body),
    onSuccess: (task) => qc.setQueryData(keys.task(task.id), task),
    onSettled: () => {
      refreshAfterTaskWrite(qc);
      void qc.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

export const useApprovals = (q: { status?: ApprovalStatus; projectId?: string } = {}) =>
  useQuery({ queryKey: ['approvals', 'list', q], queryFn: () => api.approvals.list(q) });

export const useApproval = (id: string) => useQuery({ queryKey: ['approvals', 'detail', id], queryFn: () => api.approvals.get(id) });

export function useDecideApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ApprovalDecisionInput }) => api.approvals.decide(id, body),
    onSuccess: (detail) => qc.setQueryData(['approvals', 'detail', detail.id], detail),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['approvals'] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useAddPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: NewPinComment }) => api.approvals.comment(id, body),
    onSuccess: (pin, { id }) => {
      qc.setQueryData<ApprovalDetail>(['approvals', 'detail', id], (old) =>
        old ? { ...old, comments: [...old.comments, pin], commentCount: old.commentCount + 1 } : old,
      );
      void qc.invalidateQueries({ queryKey: ['approvals', 'list'] });
    },
  });
}

export const useClientTeam = () => useQuery({ queryKey: ['clientTeam'], queryFn: api.clientTeam.get });

export function useInviteRep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RepInvite) => api.clientTeam.invite(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['clientTeam'] }),
  });
}

export function useUpdateRep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: RepPatch }) => api.clientTeam.update(id, patch),
    onSuccess: (member) =>
      qc.setQueryData<ClientTeam>(['clientTeam'], (old) =>
        old ? { ...old, members: old.members.map((m) => (m.id === member.id ? member : m)) } : old,
      ),
  });
}

export const useAdminUsers = (q: AdminUserQuery) =>
  useQuery({ queryKey: ['admin', 'users', q], queryFn: () => api.admin.users(q), placeholderData: keepPreviousData });
export const useOrganisations = () => useQuery({ queryKey: ['admin', 'orgs'], queryFn: api.admin.organisations, staleTime: Infinity });
export const useLoginHistory = (userId?: string) =>
  useQuery({ queryKey: ['admin', 'logins', userId ?? 'all'], queryFn: () => api.admin.loginHistory(userId) });

/** One hook for the per-user admin actions; each refreshes the users list and login history. */
export function useAdminAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, id }: { action: 'approve' | 'suspend' | 'reactivate' | 'resetPassword' | 'forceLogout'; id: string }) =>
      api.admin[action](id) as Promise<unknown>,
    onSettled: () => void qc.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UserInvite) => api.admin.invite(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: api.settings.get });

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PortalSettings) => api.settings.save(body),
    onSuccess: (s) => qc.setQueryData(['settings'], s),
  });
}

/** Prototype only: the latest email sent to an address, so its link can be opened. */
export const useDemoOutbox = (to?: string, enabled = true) =>
  useQuery({ queryKey: ['demo', 'outbox', to ?? 'all'], queryFn: () => api.demo.outbox(to), enabled, staleTime: 0 });

/* ---------- Admin: clients ---------- */

export const useClients = (q: ClientQuery) =>
  useQuery({ queryKey: ['clients', 'list', q], queryFn: () => api.clients.list(q), placeholderData: keepPreviousData });
export const useClient = (id: string) => useQuery({ queryKey: ['clients', 'detail', id], queryFn: () => api.clients.get(id) });
export const useAccountManagers = () => useQuery({ queryKey: ['clients', 'managers'], queryFn: api.clients.managers, staleTime: 5 * 60_000 });

/** Create, edit and note mutations all return the fresh client; the list (health, manager) is refetched. */
export function useClientMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      m: { kind: 'create'; body: NewClient } | { kind: 'update'; id: string; patch: ClientPatch } | { kind: 'note'; id: string; text: string },
    ) => (m.kind === 'create' ? api.clients.create(m.body) : m.kind === 'update' ? api.clients.update(m.id, m.patch) : api.clients.addNote(m.id, m.text)),
    onSuccess: (c) => {
      qc.setQueryData(['clients', 'detail', c.id], c);
      void qc.invalidateQueries({ queryKey: ['clients', 'list'] });
      // A new client also adds an organisation and a user account; a new manager changes the client's dashboard.
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void qc.invalidateQueries({ queryKey: ['demo'] });
    },
  });
}

/* ---------- Week 4: messages, tickets, files ---------- */

export function useConversations() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['conversations'], queryFn: api.messages.conversations });
  useEffect(() => subscribeInbox(() => void qc.invalidateQueries({ queryKey: ['conversations'] })), [qc]);
  return q;
}

type PendingMessage = ChatMessage & { pending?: boolean };

/** Messages of one conversation, kept live by the realtime layer. */
export function useThread(conversationId: string | null) {
  const qc = useQueryClient();
  const key = ['thread', conversationId];
  const q = useQuery({ queryKey: key, queryFn: () => api.messages.list(conversationId!), enabled: !!conversationId });
  useEffect(() => {
    if (!conversationId) return undefined;
    return subscribeThread(conversationId, (e) =>
      qc.setQueryData<PendingMessage[]>(['thread', conversationId], (old = []) => {
        const i = old.findIndex((m) => m.id === e.message.id);
        if (i >= 0) return old.map((m, j) => (j === i ? e.message : m));
        return [...old.filter((m) => !m.pending), e.message, ...old.filter((m) => m.pending)];
      }),
    );
  }, [conversationId, qc]);
  return q;
}

export function useSendMessage(conversationId: string) {
  const qc = useQueryClient();
  const key = ['thread', conversationId];
  return useMutation({
    mutationFn: (vars: { body: NewMessage; optimistic: PendingMessage }) => api.messages.send(conversationId, vars.body),
    // Show the message straight away; swap in the stored one when the server answers.
    onMutate: ({ optimistic }) => qc.setQueryData<PendingMessage[]>(key, (old = []) => [...old, optimistic]),
    onSuccess: (saved, { optimistic }) =>
      qc.setQueryData<PendingMessage[]>(key, (old = []) => {
        const rest = old.filter((m) => m.id !== optimistic.id && m.id !== saved.id);
        return [...rest, saved];
      }),
    onError: (_e, { optimistic }) => qc.setQueryData<PendingMessage[]>(key, (old = []) => old.filter((m) => m.id !== optimistic.id)),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['conversations'] }),
  });
}

export function useMarkRead(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (upToId: string) => api.messages.markRead(conversationId, upToId),
    onSuccess: () => {
      qc.setQueryData<Conversation[]>(['conversations'], (old) => old?.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)));
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useCreateTicket(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, body }: { messageId: string; body: NewTicket }) => api.messages.toTicket(messageId, body),
    onSuccess: (t) => {
      qc.setQueryData<ChatMessage[]>(['thread', conversationId], (old) =>
        old?.map((m) => (m.id === t.messageId ? { ...m, ticketId: t.id, ticketNumber: t.number } : m)),
      );
      void qc.invalidateQueries({ queryKey: ['tickets'] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export const useTickets = () => useQuery({ queryKey: ['tickets'], queryFn: () => api.tickets.list(), refetchInterval: INBOX_POLL_MS });

export function useUpdateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TicketPatch }) => api.tickets.update(id, patch),
    onSuccess: (t) => qc.setQueryData<Ticket[]>(['tickets'], (old) => old?.map((x) => (x.id === t.id ? t : x))),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['conversations'] }),
  });
}

export const useAvailability = () => useQuery({ queryKey: ['availability'], queryFn: api.messages.availability, staleTime: 60_000 });

export const useFiles = () => useQuery({ queryKey: ['files'], queryFn: () => api.files.list() });
export const useFile = (id: string | null) => useQuery({ queryKey: ['files', id], queryFn: () => api.files.get(id!), enabled: !!id });

/* ---------- Week 5: finance, billing, reports ---------- */

export const useFinanceSummary = () => useQuery({ queryKey: ['finance', 'summary'], queryFn: api.finance.summary });
export const useInvoices = (q: { status?: InvoiceStatus; clientId?: string; q?: string }) =>
  useQuery({ queryKey: ['finance', 'invoices', q], queryFn: () => api.finance.invoices(q), placeholderData: keepPreviousData });
export const useInvoice = (id: string | null) =>
  useQuery({ queryKey: ['finance', 'invoice', id], queryFn: () => api.finance.invoice(id!), enabled: !!id });
export const useQuotes = (q: { status?: QuoteStatus; clientId?: string } = {}) =>
  useQuery({ queryKey: ['finance', 'quotes', q], queryFn: () => api.finance.quotes(q) });
export const useQuote = (id: string | null) => useQuery({ queryKey: ['finance', 'quote', id], queryFn: () => api.finance.quote(id!), enabled: !!id });
export const usePayments = () => useQuery({ queryKey: ['finance', 'payments'], queryFn: () => api.finance.payments() });
export const useExpenses = (q: { month?: string; category?: string } = {}) =>
  useQuery({ queryKey: ['finance', 'expenses', q], queryFn: () => api.finance.expenses(q), placeholderData: keepPreviousData });
export const useProfit = () => useQuery({ queryKey: ['finance', 'profit'], queryFn: api.finance.profit });
export const useExportLog = () => useQuery({ queryKey: ['finance', 'exports'], queryFn: api.finance.exports });
export const useBillableProjects = (clientId: string | undefined) =>
  useQuery({ queryKey: ['finance', 'projects', clientId], queryFn: () => api.finance.projects(clientId!), enabled: !!clientId, staleTime: 60_000 });

type FinanceAction =
  | { kind: 'createInvoice'; body: NewInvoice }
  | { kind: 'updateInvoice'; id: string; body: Partial<NewInvoice> }
  | { kind: 'send'; id: string }
  | { kind: 'remind'; id: string }
  | { kind: 'cancel'; id: string; reason: string }
  | { kind: 'payment'; id: string; body: PaymentInput }
  | { kind: 'createQuote'; body: NewQuote }
  | { kind: 'sendQuote'; id: string }
  | { kind: 'expense'; body: NewExpense }
  | { kind: 'export'; type: ExportKind; from: string; to: string };

/** Every finance write. Money changes ripple into clients (outstanding, health), dashboards and the demo inbox. */
export function useFinanceAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: FinanceAction): Promise<any> => {
      switch (a.kind) {
        case 'createInvoice': return api.finance.createInvoice(a.body);
        case 'updateInvoice': return api.finance.updateInvoice(a.id, a.body);
        case 'send': return api.finance.sendInvoice(a.id);
        case 'remind': return api.finance.remind(a.id);
        case 'cancel': return api.finance.cancel(a.id, a.reason);
        case 'payment': return api.finance.recordPayment(a.id, a.body);
        case 'createQuote': return api.finance.createQuote(a.body);
        case 'sendQuote': return api.finance.sendQuote(a.id);
        case 'expense': return api.finance.createExpense(a.body);
        case 'export': return api.finance.exportFile(a.type, a.from, a.to);
      }
    },
    onSuccess: (_d, a) => {
      void qc.invalidateQueries({ queryKey: ['finance'] });
      if (a.kind !== 'export') {
        void qc.invalidateQueries({ queryKey: ['clients'] });
        void qc.invalidateQueries({ queryKey: ['dashboard'] });
        void qc.invalidateQueries({ queryKey: ['demo'] });
      }
    },
  });
}

export const useBilling = () => useQuery({ queryKey: ['billing'], queryFn: api.billing.overview });
export const useBillingInvoice = (id: string) => useQuery({ queryKey: ['billing', 'invoice', id], queryFn: () => api.billing.invoice(id) });
export const useBillingQuote = (id: string | null) =>
  useQuery({ queryKey: ['billing', 'quote', id], queryFn: () => api.billing.quote(id!), enabled: !!id });

export function useBillingAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { kind: 'pay'; id: string } | { kind: 'accept'; id: string } | { kind: 'decline'; id: string; reason: string }): Promise<any> =>
      a.kind === 'pay' ? api.billing.pay(a.id) : a.kind === 'accept' ? api.billing.accept(a.id) : api.billing.decline(a.id, a.reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['billing'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['demo'] });
    },
  });
}

export const useMyReport = (month?: string) =>
  useQuery({ queryKey: ['reports', 'mine', month ?? 'latest'], queryFn: () => api.reports.mine(month), placeholderData: keepPreviousData });
export const useReportStatuses = (month?: string) =>
  useQuery({ queryKey: ['reports', 'statuses', month], queryFn: () => api.reports.statuses(month), placeholderData: keepPreviousData });
export const useAdminReport = (clientId: string | null, month: string) =>
  useQuery({ queryKey: ['reports', 'admin', clientId, month], queryFn: () => api.reports.get(clientId!, month), enabled: !!clientId });

export function useReportAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { kind: 'save'; clientId: string; month: string; body: ReportInput } | { kind: 'publish'; clientId: string; month: string }) =>
      a.kind === 'save' ? api.reports.save(a.clientId, a.month, a.body) : api.reports.publish(a.clientId, a.month),
    onSuccess: (r) => {
      qc.setQueryData(['reports', 'admin', r.clientId, r.month], r);
      void qc.invalidateQueries({ queryKey: ['reports', 'statuses'] });
      void qc.invalidateQueries({ queryKey: ['demo'] });
    },
  });
}

/* ---------- Week 6: pipeline, people, time ---------- */

export const usePipeline = (q: { q?: string; ownerId?: string; source?: LeadSource }) =>
  useQuery({ queryKey: ['pipeline', 'board', q], queryFn: () => api.pipeline.board(q), placeholderData: keepPreviousData });
export const useLead = (id: string | null) => useQuery({ queryKey: ['pipeline', 'lead', id], queryFn: () => api.pipeline.lead(id!), enabled: !!id });

type LeadAction =
  | { kind: 'create'; body: NewLead }
  | { kind: 'update'; id: string; patch: LeadPatch }
  | { kind: 'activity'; id: string; body: LeadActivityInput }
  | { kind: 'convert'; id: string; body: ConvertLead };

/** Lead writes. Stage moves are optimistic on the board and roll back if the server refuses. */
export function useLeadAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: LeadAction) =>
      a.kind === 'create'
        ? api.pipeline.create(a.body)
        : a.kind === 'update'
          ? api.pipeline.update(a.id, a.patch)
          : a.kind === 'activity'
            ? api.pipeline.addActivity(a.id, a.body)
            : api.pipeline.convert(a.id, a.body),
    onMutate: async (a) => {
      if (a.kind !== 'update' || !a.patch.stage) return undefined;
      await qc.cancelQueries({ queryKey: ['pipeline', 'board'] });
      const snapshot = qc.getQueriesData<PipelineBoard>({ queryKey: ['pipeline', 'board'] });
      qc.setQueriesData<PipelineBoard>({ queryKey: ['pipeline', 'board'] }, (old) =>
        old ? { ...old, leads: old.leads.map((l) => (l.id === a.id ? { ...l, stage: a.patch.stage! } : l)) } : old,
      );
      return { snapshot };
    },
    onError: (_e, _a, ctx) => ctx?.snapshot?.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSuccess: (lead, a) => {
      qc.setQueryData(['pipeline', 'lead', lead.id], lead);
      if (a.kind === 'convert') {
        void qc.invalidateQueries({ queryKey: ['clients'] });
        void qc.invalidateQueries({ queryKey: ['projects'] });
        void qc.invalidateQueries({ queryKey: ['admin'] });
        void qc.invalidateQueries({ queryKey: ['demo'] });
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['pipeline', 'board'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export const usePeople = () => useQuery({ queryKey: ['people', 'list'], queryFn: api.people.list });
export const useAttendanceWeek = (week?: string) =>
  useQuery({ queryKey: ['people', 'attendance', week], queryFn: () => api.people.attendance(week), placeholderData: keepPreviousData });
export const useLeaveRequests = (status?: LeaveStatus) =>
  useQuery({ queryKey: ['people', 'leave', status], queryFn: () => api.people.leave({ status }) });
export const useWorkload = (week?: string) =>
  useQuery({ queryKey: ['people', 'workload', week], queryFn: () => api.people.workload(week), placeholderData: keepPreviousData });
export const useScorecards = () => useQuery({ queryKey: ['people', 'scorecards'], queryFn: api.people.scorecards });
export const useScorecard = (id: string | null) =>
  useQuery({ queryKey: ['people', 'scorecard', id], queryFn: () => api.people.scorecard(id!), enabled: !!id });

export function useDecideLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: LeaveDecisionInput }) => api.people.decideLeave(id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['people'] });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export const useMyAttendance = () => useQuery({ queryKey: ['me', 'attendance'], queryFn: api.me.attendance });
export const useMyLeave = () => useQuery({ queryKey: ['me', 'leave'], queryFn: api.me.leave });
export const useMyPerformance = () => useQuery({ queryKey: ['me', 'performance'], queryFn: api.me.performance });
export const useMyTimesheet = (week?: string) =>
  useQuery({ queryKey: ['me', 'timesheet', week ?? 'current'], queryFn: () => api.me.timesheet(week), placeholderData: keepPreviousData });

type MeAction =
  | { kind: 'checkIn'; mode: 'OFFICE' | 'WFH' }
  | { kind: 'checkOut' }
  | { kind: 'requestLeave'; body: NewLeave }
  | { kind: 'cancelLeave'; id: string }
  | { kind: 'addTime'; body: NewTimeEntry }
  | { kind: 'deleteTime'; id: string }
  | { kind: 'startTimer'; body: TimerStart }
  | { kind: 'stopTimer' }
  | { kind: 'submitWeek'; weekStart: string };

/** Every self-service write; refreshes the person's own pages, dashboards and the team views. */
export function useMeAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: MeAction): Promise<any> => {
      switch (a.kind) {
        case 'checkIn': return api.me.checkIn(a.mode);
        case 'checkOut': return api.me.checkOut();
        case 'requestLeave': return api.me.requestLeave(a.body);
        case 'cancelLeave': return api.me.cancelLeave(a.id);
        case 'addTime': return api.me.addTime(a.body);
        case 'deleteTime': return api.me.deleteTime(a.id);
        case 'startTimer': return api.me.startTimer(a.body);
        case 'stopTimer': return api.me.stopTimer();
        case 'submitWeek': return api.me.submitWeek(a.weekStart);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me'] });
      void qc.invalidateQueries({ queryKey: ['people'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/* ---------- Week 7: influencers, partners, PR, offers ---------- */

/** One generic mutation hook per module keeps the screens small; each refreshes its whole query family. */
function useModuleAction<A>(fn: (a: A) => Promise<any>, families: string[][]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => families.forEach((queryKey) => void qc.invalidateQueries({ queryKey })),
  });
}

export const useMyInfluencerProfile = () => useQuery({ queryKey: ['creator', 'profile'], queryFn: api.influencers.myProfile });
export const useMyCampaigns = () => useQuery({ queryKey: ['creator', 'campaigns'], queryFn: api.influencers.myCampaigns });
export const useMyPayouts = () => useQuery({ queryKey: ['creator', 'payouts'], queryFn: api.influencers.myPayouts });

type CreatorAction =
  | { kind: 'profile'; body: ProfileInput }
  | { kind: 'submit' }
  | { kind: 'respond'; id: string; action: 'ACCEPT' | 'COUNTER' | 'DECLINE'; counterFee?: number }
  | { kind: 'draft'; id: string; body: { caption: string; fileName: string; disclosure: boolean } }
  | { kind: 'live'; id: string; body: { liveUrl: string; proofFile: string } };

export const useCreatorAction = () =>
  useModuleAction(
    (a: CreatorAction) =>
      a.kind === 'profile'
        ? api.influencers.updateProfile(a.body)
        : a.kind === 'submit'
          ? api.influencers.submitProfile()
          : a.kind === 'respond'
            ? api.influencers.respond(a.id, a.action, a.counterFee)
            : a.kind === 'draft'
              ? api.influencers.submitDraft(a.id, a.body)
              : api.influencers.submitLive(a.id, a.body),
    [['creator'], ['dashboard']],
  );

export const useDiscovery = (q: DiscoveryQuery) =>
  useQuery({ queryKey: ['discovery', q], queryFn: () => api.influencers.discover(q), placeholderData: keepPreviousData });
export const useMyCollabRequests = () => useQuery({ queryKey: ['discovery', 'requests'], queryFn: api.influencers.myRequests });
export const useDiscoveryAction = () =>
  useModuleAction(
    (a: { kind: 'shortlist'; id: string } | { kind: 'request'; body: CollabRequestInput }) =>
      a.kind === 'shortlist' ? api.influencers.toggleShortlist(a.id) : api.influencers.requestCollab(a.body),
    [['discovery']],
  );

export const useInfluencerAdmin = (q: { verification?: VerificationStatus; q?: string }) =>
  useQuery({ queryKey: ['influencers', 'list', q], queryFn: () => api.influencers.list(q), placeholderData: keepPreviousData });
export const useCollabRequests = () => useQuery({ queryKey: ['influencers', 'requests'], queryFn: api.influencers.requests });
export const useCampaigns = () => useQuery({ queryKey: ['influencers', 'campaigns'], queryFn: api.influencers.campaigns });
export const useCampaign = (id: string | null) =>
  useQuery({ queryKey: ['influencers', 'campaign', id], queryFn: () => api.influencers.campaign(id!), enabled: !!id });
export const useInfluencerPayouts = () => useQuery({ queryKey: ['influencers', 'payouts'], queryFn: api.influencers.payouts });

type InfluencerAdminAction =
  | { kind: 'decide'; id: string; decision: 'VERIFY' | 'REJECT'; reason?: string }
  | { kind: 'createCampaign'; body: NewCampaign }
  | { kind: 'invite'; id: string; body: { influencerId: string; fee: number; respondBy: string; draftDue: string } }
  | { kind: 'counter'; id: string; influencerId: string; accept: boolean }
  | { kind: 'review'; id: string; influencerId: string; decision: 'APPROVE' | 'CHANGES'; feedback?: string }
  | { kind: 'rate'; id: string; influencerId: string; rating: number }
  | { kind: 'approvePayout'; id: string }
  | { kind: 'rejectPayout'; id: string; reason: string }
  | { kind: 'paid'; id: string; reference: string };

export const useInfluencerAdminAction = () =>
  useModuleAction((a: InfluencerAdminAction) => {
    switch (a.kind) {
      case 'decide': return api.influencers.decide(a.id, a.decision, a.reason);
      case 'createCampaign': return api.influencers.createCampaign(a.body);
      case 'invite': return api.influencers.invite(a.id, a.body);
      case 'counter': return api.influencers.decideCounter(a.id, a.influencerId, a.accept);
      case 'review': return api.influencers.reviewDraft(a.id, a.influencerId, a.decision, a.feedback);
      case 'rate': return api.influencers.rate(a.id, a.influencerId, a.rating);
      case 'approvePayout': return api.influencers.approvePayout(a.id);
      case 'rejectPayout': return api.influencers.rejectPayout(a.id, a.reason);
      case 'paid': return api.influencers.markPaid(a.id, a.reference);
    }
  }, [['influencers'], ['dashboard'], ['finance'], ['demo']]);

export const useMyBriefs = () => useQuery({ queryKey: ['partner', 'briefs'], queryFn: api.partners.myBriefs });
export const useMyPartnerInvoices = () => useQuery({ queryKey: ['partner', 'invoices'], queryFn: api.partners.myInvoices });
export const usePartnerAction = () =>
  useModuleAction(
    (a: { kind: 'start'; id: string } | { kind: 'submit'; id: string; body: { files: string[]; note: string } } | { kind: 'invoice'; body: NewPartnerInvoice }) =>
      a.kind === 'start' ? api.partners.start(a.id) : a.kind === 'submit' ? api.partners.submit(a.id, a.body) : api.partners.submitInvoice(a.body),
    [['partner'], ['dashboard']],
  );

export const usePrHub = () => useQuery({ queryKey: ['pr', 'hub'], queryFn: api.partners.hub });
export const useAdminBriefs = () => useQuery({ queryKey: ['pr', 'briefs'], queryFn: api.partners.briefs });
export const useAdminPartnerInvoices = () => useQuery({ queryKey: ['pr', 'invoices'], queryFn: api.partners.invoices });

type PrAction =
  | { kind: 'contact'; body: NewMediaContact }
  | { kind: 'updateContact'; id: string; patch: { verified?: boolean; doNotContact?: boolean; consent?: boolean } }
  | { kind: 'pitch'; body: { title: string; clientId: string; recipientIds: string[] } }
  | { kind: 'pitchStatus'; id: string; status: PitchStatus }
  | { kind: 'coverage'; body: { clientId: string; outlet: string; headline: string; url: string; date: string; reach: number; pitchId?: string } }
  | { kind: 'brief'; body: NewBrief }
  | { kind: 'reviewBrief'; id: string; decision: 'APPROVE' | 'CHANGES'; feedback?: string }
  | { kind: 'invoice'; id: string; decision: 'APPROVE' | 'REJECT' | 'PAID'; note?: string }
  | { kind: 'export' };

export const usePrAction = () =>
  useModuleAction((a: PrAction) => {
    switch (a.kind) {
      case 'contact': return api.partners.addContact(a.body);
      case 'updateContact': return api.partners.updateContact(a.id, a.patch);
      case 'pitch': return api.partners.createPitch(a.body);
      case 'pitchStatus': return api.partners.updatePitch(a.id, a.status);
      case 'coverage': return api.partners.addCoverage(a.body);
      case 'brief': return api.partners.createBrief(a.body);
      case 'reviewBrief': return api.partners.reviewBrief(a.id, a.decision, a.feedback);
      case 'invoice': return api.partners.decideInvoice(a.id, a.decision, a.note);
      case 'export': return api.partners.exportContacts();
    }
  }, [['pr'], ['finance']]);

export const useOffers = () => useQuery({ queryKey: ['offers'], queryFn: api.offers.list });
export const useOfferAction = () =>
  useModuleAction(
    (a: { kind: 'create'; body: OfferInput } | { kind: 'update'; id: string; body: OfferInput } | { kind: 'click'; id: string } | { kind: 'dismiss'; id: string }) =>
      a.kind === 'create'
        ? api.offers.create(a.body)
        : a.kind === 'update'
          ? api.offers.update(a.id, a.body)
          : a.kind === 'click'
            ? api.offers.click(a.id)
            : api.offers.dismiss(a.id),
    [['offers']],
  );
