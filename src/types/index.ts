/**
 * Shared types. These mirror docs/api/openapi.yaml.
 * When the Spring Boot API exists, regenerate them from that file
 * (for example with openapi-typescript) instead of editing by hand.
 */

export type Role = 'SUPER_ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'CLIENT_OWNER' | 'CLIENT_REP' | 'INFLUENCER' | 'PARTNER';

/** The five portal areas. Several roles can share one area. */
export type Area = 'admin' | 'employee' | 'client' | 'influencer' | 'partner';

export const AREA_BY_ROLE: Record<Role, Area> = {
  SUPER_ADMIN: 'admin',
  MANAGER: 'admin',
  EMPLOYEE: 'employee',
  CLIENT_OWNER: 'client',
  CLIENT_REP: 'client',
  INFLUENCER: 'influencer',
  PARTNER: 'partner',
};

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
  CLIENT_OWNER: 'Client Owner',
  CLIENT_REP: 'Client Representative',
  INFLUENCER: 'Influencer',
  PARTNER: 'Partner',
};

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  organisationId: string;
  organisationName: string;
  title?: string;
  /** Extra grants on top of the role, e.g. a client rep allowed to see billing. */
  permissions?: Permission[];
}

export type Permission = 'BILLING_VIEW' | 'TEAM_MANAGE';

export interface Session {
  user: User;
  /** Short-lived access token. In Phase 1 the refresh token lives in an httpOnly cookie. */
  accessToken: string;
  expiresAt: string;
}

export type Health = 'GREEN' | 'AMBER' | 'RED';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'CLIENT_APPROVAL' | 'DONE';
export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface ProjectSummary {
  id: string;
  name: string;
  clientName: string;
  service: string;
  progress: number;
  health: Health;
  nextMilestone?: { title: string; due: string };
  owner: string;
}

export interface TaskItem {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  clientName: string;
  status: TaskStatus;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  due: string;
  assigneeId: string;
  assigneeName: string;
  checklistDone?: number;
  checklistTotal?: number;
  commentCount?: number;
  reviewerId?: string;
}

export interface Approval {
  id: string;
  title: string;
  projectName: string;
  submittedAt: string;
  revisionsUsed: number;
  revisionsAllowed: number;
}

export interface InvoiceSummary {
  id: string;
  number: string;
  clientName: string;
  amount: number;
  due: string;
  status: InvoiceStatus;
}

export interface MessagePreview {
  id: string;
  from: string;
  projectName: string;
  text: string;
  at: string;
  unread: boolean;
}

export interface Offer {
  id: string;
  title: string;
  text: string;
  cta: string;
}

export interface KpiPoint {
  label: string;
  value: string;
  change?: string;
  good?: boolean;
}

/* ---------- Dashboards, one per area ---------- */

export interface AdminDashboard {
  revenueThisMonth: number;
  recurringRevenue: number;
  outstanding: number;
  overdueTasks: number;
  activeClients: number;
  satisfaction: number;
  healthMix: Record<Health, number>;
  projectsAtRisk: ProjectSummary[];
  overdueInvoices: InvoiceSummary[];
  teamLoad: Array<{ name: string; department: string; assignedHours: number; capacityHours: number }>;
  pipeline: Array<{ stage: string; count: number; value: number }>;
  waitingOnYou: Array<{ id: string; text: string; kind: 'PAYOUT' | 'DISCOUNT' | 'PAUSE' | 'LEAVE' }>;
}

export interface ClientDashboard {
  accountManager: { name: string; email: string; phone: string; hours: string };
  projects: ProjectSummary[];
  approvals: Approval[];
  unpaidInvoices: InvoiceSummary[];
  results: KpiPoint[];
  resultsPeriod: string;
  messages: MessagePreview[];
  offer?: Offer;
}

export interface EmployeeDashboard {
  today: TaskItem[];
  thisWeek: TaskItem[];
  reviewQueue: TaskItem[];
  messages: MessagePreview[];
  scorecard: { onTimeRate: number; firstPassQuality: number; clientRating: number; hoursLogged: number; hoursCapacity: number };
  announcements: Array<{ id: string; title: string; at: string }>;
}

export interface InfluencerDashboard {
  verification: 'PENDING' | 'VERIFIED' | 'REJECTED';
  profileCompleteness: number;
  invites: Array<{ id: string; brand: string; campaign: string; deliverable: string; fee: number; respondBy: string }>;
  active: Array<{ id: string; brand: string; campaign: string; step: string; due: string }>;
  payouts: { pending: number; paidThisYear: number };
}

export interface PartnerDashboard {
  briefs: Array<{ id: string; title: string; projectName: string; due: string; status: 'NEW' | 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED' }>;
  invoices: Array<{ id: string; number: string; amount: number; status: InvoiceStatus }>;
}

/* ---------- Week 2: projects and tasks ---------- */

export type ProjectStatus = 'ACTIVE' | 'ON_HOLD' | 'COMPLETED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';
/** Default is INTERNAL. Only CLIENT items are ever returned to client roles. */
export type Visibility = 'INTERNAL' | 'CLIENT';
export type MilestoneStatus = 'DONE' | 'UPCOMING' | 'MISSED';
export type DeliverableStatus = 'PLANNED' | 'IN_PROGRESS' | 'IN_REVIEW' | 'CLIENT_APPROVAL' | 'APPROVED';

/** Spring Data style page. `page` is zero-based. */
export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}

export interface ProjectListItem extends ProjectSummary {
  status: ProjectStatus;
  clientId: string;
  ownerId: string;
  startDate: string;
  endDate?: string;
  /** Internal task counts. Staff only; absent for client roles. */
  openTasks?: number;
  overdueTasks?: number;
}

export interface ProjectQuery {
  q?: string;
  status?: ProjectStatus;
  health?: Health;
  clientId?: string;
  service?: string;
  ownerId?: string;
  page?: number;
  size?: number;
}

/** Filter choices that match what the caller is allowed to see. */
export interface ProjectFacets {
  services: string[];
  owners: Array<{ id: string; name: string }>;
  clients: Array<{ id: string; name: string }>;
}

export interface ProjectPage extends Page<ProjectListItem> {
  facets: ProjectFacets;
}

export interface MilestoneItem {
  id: string;
  title: string;
  due: string;
  status: MilestoneStatus;
  completedAt?: string;
}

export interface Deliverable {
  id: string;
  title: string;
  milestoneId?: string;
  status: DeliverableStatus;
  due: string;
  revisionsUsed: number;
  revisionsAllowed: number;
}

export interface TeamMember {
  id: string;
  name: string;
  title: string;
  /** OWNER and BACKUP are the agency contacts; CLIENT marks the client's own people. */
  projectRole: 'OWNER' | 'BACKUP' | 'MEMBER' | 'CLIENT';
}

export interface ActivityItem {
  id: string;
  at: string;
  actor: string;
  text: string;
  visibility: Visibility;
}

export interface ProjectDetail extends ProjectListItem {
  scope: string;
  milestones: MilestoneItem[];
  deliverables: Deliverable[];
  team: TeamMember[];
  activity: ActivityItem[];
  /** Staff only. Never present for client roles. */
  tasks?: TaskItem[];
  /** Admin area only. */
  budgetHours?: number;
  hoursUsed?: number;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TaskFile {
  id: string;
  name: string;
  sizeKb: number;
  uploadedBy: string;
  uploadedAt: string;
  visibility: Visibility;
}

export interface TaskComment {
  id: string;
  authorId: string;
  author: string;
  at: string;
  text: string;
  visibility: Visibility;
}

export interface TaskDetail extends TaskItem {
  description: string;
  reviewerId?: string;
  reviewerName?: string;
  /** Client-facing work must pass internal review before it reaches the client. */
  clientFacing: boolean;
  checklist: ChecklistItem[];
  files: TaskFile[];
  comments: TaskComment[];
  createdAt: string;
}

export interface TaskQuery {
  /** Only tasks assigned to the caller. */
  mine?: boolean;
  projectId?: string;
  status?: TaskStatus;
}

export interface TaskPatch {
  status?: TaskStatus;
  assigneeId?: string;
  due?: string;
}

export interface NewComment {
  text: string;
  visibility: Visibility;
}

/* ---------- Week 3: approvals ---------- */

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED';
export type AssetKind = 'IMAGE' | 'PDF';

export interface ApprovalItem {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  kind: AssetKind;
  status: ApprovalStatus;
  versionNumber: number;
  submittedAt: string;
  thumbnailUrl: string;
  revisionsUsed: number;
  revisionsAllowed: number;
  commentCount: number;
}

export interface ApprovalDecision {
  status: Exclude<ApprovalStatus, 'PENDING'>;
  byName: string;
  at: string;
  note?: string;
}

export interface AssetVersion {
  id: string;
  number: number;
  fileName: string;
  /** Preview images, one per page. PDFs are rendered to images by the server. */
  pages: string[];
  submittedAt: string;
  submittedBy: string;
  note?: string;
  decision?: ApprovalDecision;
}

/** A comment pinned to a spot on one page of one version. x and y are percentages. */
export interface PinComment {
  id: string;
  versionId: string;
  page: number;
  x: number;
  y: number;
  authorId: string;
  author: string;
  /** True for Webinger staff, so the client can tell replies apart. */
  fromAgency: boolean;
  at: string;
  text: string;
}

export interface ApprovalDetail extends ApprovalItem {
  deliverableId: string;
  clientName: string;
  versions: AssetVersion[];
  comments: PinComment[];
}

export interface ApprovalDecisionInput {
  versionId: string;
  decision: 'APPROVE' | 'REQUEST_CHANGES';
  note?: string;
}

export interface NewPinComment {
  versionId: string;
  page: number;
  x: number;
  y: number;
  text: string;
}

/* ---------- Week 3: internal review ---------- */

export interface ReviewInput {
  result: 'PASS' | 'FAIL';
  note?: string;
}

/* ---------- Week 3: users, team, settings ---------- */

export type AccountStatus = 'ACTIVE' | 'INVITED' | 'PENDING_APPROVAL' | 'SUSPENDED';

export interface ClientTeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  title?: string;
  status: AccountStatus;
  projectIds: string[];
  canSeeBilling: boolean;
  invitedAt?: string;
  lastLoginAt?: string;
}

export interface ClientTeam {
  members: ClientTeamMember[];
  projects: Array<{ id: string; name: string }>;
}

export interface RepInvite {
  name: string;
  email: string;
  title?: string;
  projectIds: string[];
  canSeeBilling: boolean;
}

export interface RepPatch {
  projectIds?: string[];
  canSeeBilling?: boolean;
  suspended?: boolean;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  organisationId: string;
  organisationName: string;
  title?: string;
  status: AccountStatus;
  mfaEnabled: boolean;
  createdAt: string;
  lastLoginAt?: string;
  /** Who asked for the account, e.g. the client owner who invited a rep. */
  invitedBy?: string;
}

export interface AdminUserQuery {
  q?: string;
  role?: Role;
  status?: AccountStatus;
}

export interface UserInvite {
  name: string;
  email: string;
  role: Role;
  organisationId: string;
  title?: string;
}

export interface Organisation {
  id: string;
  name: string;
  kind: 'AGENCY' | 'CLIENT' | 'INFLUENCER' | 'PARTNER';
}

export interface LoginEvent {
  id: string;
  userId?: string;
  userName: string;
  email: string;
  at: string;
  result: 'SUCCESS' | 'FAILED' | 'MFA_FAILED' | 'LOCKED';
  ip: string;
  device: string;
}

export interface PortalSettings {
  businessHours: { days: number[]; open: string; close: string; timezone: string };
  responseTimes: { firstReplyHours: number; ticketResolutionHours: number };
  approvalLimits: { managerDiscountPercent: number; managerSpendLimit: number; deputyPayoutLimit: number };
  defaultRevisions: number;
  reminderAfterDays: number;
}

/* ---------- Week 3: auth flows ---------- */

export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
  /** Masked destination, e.g. "Authenticator app". */
  method: string;
}

export type LoginResult = Session | MfaChallenge;

export interface InviteInfo {
  name: string;
  email: string;
  role: Role;
  organisationName: string;
  expiresAt: string;
}

/* ---------- Week 4: messages and tickets ---------- */

export interface Attachment {
  id: string;
  name: string;
  sizeKb: number;
  kind: 'IMAGE' | 'PDF' | 'DOC' | 'OTHER';
  /** Short-lived link to view or download. Absent for files only the server can open. */
  url?: string;
}

export interface ReadReceipt {
  userId: string;
  name: string;
  at: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  authorId: string;
  authorName: string;
  /** True for Webinger staff. */
  fromAgency: boolean;
  at: string;
  text: string;
  /** Staff-only note. Never returned to client roles. */
  internal: boolean;
  attachments: Attachment[];
  readBy: ReadReceipt[];
  ticketId?: string;
  ticketNumber?: string;
}

export interface Conversation {
  id: string;
  kind: 'PROJECT' | 'TEAM';
  title: string;
  projectId?: string;
  clientName?: string;
  unreadCount: number;
  lastMessage?: { text: string; at: string; authorName: string; internal: boolean };
  /** A client message nobody at Webinger has answered yet (staff only). */
  awaitingReply?: { since: string; dueAt: string };
  openTickets: number;
  members: Array<{ id: string; name: string; fromAgency: boolean }>;
}

export interface NewMessage {
  text: string;
  internal: boolean;
  attachmentIds: string[];
}

export type TicketStatus = 'OPEN' | 'WAITING_ON_CLIENT' | 'RESOLVED';

export interface Ticket {
  id: string;
  number: string;
  title: string;
  conversationId: string;
  messageId: string;
  projectName: string;
  clientName: string;
  status: TicketStatus;
  priority: Priority;
  assigneeId: string;
  assigneeName: string;
  createdAt: string;
  createdBy: string;
  /** Business-hours deadlines from the response-time settings. */
  firstResponseDueAt: string;
  firstRespondedAt?: string;
  resolveDueAt: string;
  resolvedAt?: string;
}

export interface NewTicket {
  title: string;
  priority: Priority;
}

export interface TicketPatch {
  status?: TicketStatus;
  assigneeId?: string;
}

export interface Availability {
  openNow: boolean;
  /** When the team is next available, if closed now. */
  opensAt?: string;
  hoursText: string;
  firstReplyHours: number;
}

/* ---------- Week 4: files and brand vault ---------- */

export type FileFolder = 'LOGOS' | 'FONTS' | 'GUIDELINES' | 'PHOTOS' | 'DELIVERABLES';

export interface FileVersion {
  number: number;
  sizeKb: number;
  uploadedAt: string;
  uploadedBy: string;
  note?: string;
  previewUrl?: string;
}

export interface FileItem {
  id: string;
  name: string;
  folder: FileFolder;
  kind: Attachment['kind'] | 'FONT';
  projectId?: string;
  projectName?: string;
  currentVersion: number;
  versionCount: number;
  sizeKb: number;
  updatedAt: string;
  updatedBy: string;
  previewUrl?: string;
}

export interface FileDetail extends FileItem {
  versions: FileVersion[];
}

export interface DownloadLink {
  url: string;
  fileName: string;
  expiresAt: string;
}

/* ---------- API errors ---------- */

/** Matches Spring's RFC 9457 ProblemDetail response body. */
export interface ApiProblem {
  status: number;
  title: string;
  detail?: string;
}

export class ApiError extends Error {
  readonly status: number;
  constructor(problem: ApiProblem) {
    super(problem.detail ?? problem.title);
    this.status = problem.status;
  }
}

/* ---------- Admin: clients ---------- */

export type ClientStatus = 'ONBOARDING' | 'ACTIVE' | 'PAUSED' | 'ENDED';
export type ContractStatus = 'ACTIVE' | 'ENDING_SOON' | 'ENDED';

export interface ClientQuery {
  q?: string;
  status?: ClientStatus;
  health?: Health;
  accountManagerId?: string;
}

export interface ClientListItem {
  id: string;
  name: string;
  industry: string;
  city: string;
  status: ClientStatus;
  clientSince: string;
  accountManager: { id: string; name: string };
  activeProjects: number;
  totalProjects: number;
  services: string[];
  health: Health;
  /** 0–100. The level (health) follows the rule; the score only ranks clients inside a level. */
  healthScore: number;
  monthlyRetainer: number;
  outstanding: number;
  /** Earliest end date of a running contract, for renewal follow-up. */
  renewalDue?: string;
}

export interface HealthFactor {
  key: 'OVERDUE_TASKS' | 'SLOW_APPROVALS' | 'MISSED_MILESTONES' | 'LATE_INVOICE' | 'SATISFACTION';
  label: string;
  /** OK, AMBER or RED: which part of the health rule this factor trips. */
  level: 'OK' | 'AMBER' | 'RED';
  detail: string;
  /** Points taken off the score (0 when OK). */
  penalty: number;
}

export interface ClientContact {
  id: string;
  name: string;
  title?: string;
  email: string;
  role: 'CLIENT_OWNER' | 'CLIENT_REP';
  status: AccountStatus;
  lastLoginAt?: string;
  canSeeBilling: boolean;
}

export interface ClientContract {
  id: string;
  title: string;
  kind: 'RETAINER' | 'PROJECT';
  startDate: string;
  endDate: string;
  /** Monthly fee for retainers, total fee for one-off projects (INR, before GST). */
  value: number;
  revisionsPerDeliverable: number;
  status: ContractStatus;
}

export interface ClientHistoryItem {
  id: string;
  at: string;
  actor: string;
  kind: 'CREATED' | 'CONTRACT' | 'PROJECT' | 'INVOICE' | 'APPROVAL' | 'NOTE' | 'STATUS' | 'CHANGE';
  text: string;
}

export interface ClientDetail extends ClientListItem {
  legalName: string;
  gstin?: string;
  website?: string;
  address: string;
  backupManager?: { id: string; name: string };
  satisfaction?: number;
  /** Average days from "sent for approval" to the client's decision. */
  approvalDays?: number;
  healthFactors: HealthFactor[];
  contacts: ClientContact[];
  contracts: ClientContract[];
  projects: ProjectListItem[];
  history: ClientHistoryItem[];
  /** SUPER_ADMIN only: everything the client has paid. Never sent to managers. */
  lifetimeValue?: number;
}

export interface NewClient {
  name: string;
  legalName: string;
  industry: string;
  city: string;
  gstin?: string;
  website?: string;
  accountManagerId: string;
  owner: { name: string; email: string; title?: string };
}

export interface ClientPatch {
  industry?: string;
  city?: string;
  gstin?: string;
  website?: string;
  address?: string;
  accountManagerId?: string;
  backupManagerId?: string;
  /** SUPER_ADMIN only. Pausing or ending a client is a human decision. */
  status?: ClientStatus;
}

/* ---------- Week 5: finance, billing, client reports ---------- */

export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
export type PaymentMethod = 'BANK_TRANSFER' | 'UPI' | 'CHEQUE' | 'CARD' | 'ONLINE';
export type ExpenseCategory = 'FREELANCER' | 'PRODUCTION' | 'SOFTWARE' | 'MEDIA' | 'TRAVEL' | 'OFFICE';

/** Seller or buyer block printed on a GST invoice or quote. */
export interface Party {
  name: string;
  legalName: string;
  gstin?: string;
  address: string;
  /** GST state code, e.g. "27" for Maharashtra. */
  stateCode: string;
  stateName: string;
}

export interface LineItemInput {
  description: string;
  /** Services accounting code; defaults to 998361 (advertising services). */
  sac?: string;
  quantity: number;
  /** INR before GST. */
  rate: number;
  projectId?: string;
}

export interface LineItem extends Required<Omit<LineItemInput, 'projectId'>> {
  projectId?: string;
  projectName?: string;
  /** quantity × rate, before GST. */
  amount: number;
}

/** CGST 9% + SGST 9% inside the agency's state, IGST 18% for other states. */
export interface TaxLine {
  label: 'CGST' | 'SGST' | 'IGST';
  rate: number;
  amount: number;
}

export interface InvoiceListItem {
  id: string;
  /** Given when the invoice is sent (WEB/2026-27/0113). Drafts have none. */
  number?: string;
  clientId: string;
  clientName: string;
  title: string;
  issueDate?: string;
  due: string;
  /** DRAFT, SENT, PAID, OVERDUE (sent and past due) or CANCELLED. */
  status: InvoiceStatus;
  subtotal: number;
  tax: number;
  /** Subtotal + GST. */
  total: number;
  /** Payments plus TDS the client deducted. */
  paid: number;
  balance: number;
  /** Whole days past the due date while unpaid. */
  daysLate?: number;
}

export interface InvoicePayment {
  id: string;
  receiptNumber: string;
  date: string;
  /** Money received. */
  amount: number;
  /** Tax the client deducted at source; counts towards the balance. */
  tds: number;
  method: PaymentMethod;
  reference?: string;
  recordedBy: string;
}

export interface FinanceEvent {
  id: string;
  at: string;
  actor: string;
  text: string;
}

export interface InvoiceDetail extends InvoiceListItem {
  seller: Party;
  buyer: Party;
  placeOfSupply: string;
  items: LineItem[];
  taxes: TaxLine[];
  amountInWords: string;
  notes?: string;
  payments: InvoicePayment[];
  cancelReason?: string;
  /** Staff only: what happened to the invoice (created, sent, reminders, payments). */
  events?: FinanceEvent[];
  /** Bank and UPI details printed on the invoice. */
  payTo: { bank: string; account: string; ifsc: string; upi: string };
}

export interface NewInvoice {
  clientId: string;
  title: string;
  /** Date the client must pay by (yyyy-mm-dd). */
  due: string;
  items: LineItemInput[];
  notes?: string;
}

export interface PaymentInput {
  date: string;
  amount: number;
  tds?: number;
  method: PaymentMethod;
  reference?: string;
}

export interface QuoteListItem {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  title: string;
  kind: 'RETAINER' | 'PROJECT';
  subtotal: number;
  total: number;
  validUntil: string;
  status: QuoteStatus;
  sentAt?: string;
  decidedAt?: string;
  decidedBy?: string;
}

export interface QuoteDetail extends QuoteListItem {
  seller: Party;
  buyer: Party;
  items: LineItem[];
  taxes: TaxLine[];
  /** Retainers: number of months. Projects: weeks to deliver. */
  termMonths?: number;
  revisionsPerDeliverable: number;
  notes?: string;
  declineReason?: string;
  /** Set when accepted: the contract it became and the advance invoice drafted for it. */
  contractId?: string;
  advanceInvoiceId?: string;
  events?: FinanceEvent[];
}

export interface NewQuote {
  clientId: string;
  title: string;
  kind: 'RETAINER' | 'PROJECT';
  termMonths?: number;
  revisionsPerDeliverable: number;
  validDays: number;
  items: LineItemInput[];
  notes?: string;
}

export interface PaymentItem extends InvoicePayment {
  invoiceId: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
}

export interface ExpenseItem {
  id: string;
  date: string;
  category: ExpenseCategory;
  vendor: string;
  description: string;
  /** Before GST. */
  amount: number;
  /** Input GST paid on the bill (claimable). */
  gst: number;
  projectId?: string;
  projectName?: string;
  clientName?: string;
  recordedBy: string;
}

export interface NewExpense {
  date: string;
  category: ExpenseCategory;
  vendor: string;
  description: string;
  amount: number;
  gst?: number;
  projectId?: string;
}

export interface FinanceSummary {
  /** Money received this calendar month. */
  collectedThisMonth: number;
  /** Invoices sent this month, before GST. */
  invoicedThisMonth: number;
  /** Running retainer contracts, per month, before GST. */
  recurringRevenue: number;
  outstanding: number;
  overdue: number;
  overdueCount: number;
  /** Average days from invoice date to full payment, last 6 months. */
  daysToCollect?: number;
  expensesThisMonth: number;
  draftInvoices: number;
  openQuotes: { count: number; value: number };
  /** Accepted ÷ decided quotes. */
  winRate?: number;
  /** invoiced = totals incl. GST, so it compares with money collected; expenses before GST. */
  months: Array<{ month: string; invoiced: number; collected: number; expenses: number }>;
  byService: Array<{ service: string; amount: number }>;
}

export interface ProfitRow {
  id: string;
  name: string;
  clientName?: string;
  service?: string;
  /** Invoiced, before GST, excluding drafts and cancelled invoices. */
  revenue: number;
  hours: number;
  labourCost: number;
  directCost: number;
  profit: number;
  /** profit ÷ revenue, 0–1. Undefined when nothing is invoiced yet. */
  margin?: number;
}

export interface ProfitReport {
  clients: ProfitRow[];
  projects: ProfitRow[];
}

export type ExportKind = 'invoices' | 'payments' | 'expenses';
export interface ExportFile {
  fileName: string;
  content: string;
  rows: number;
}
export interface ExportLogItem {
  id: string;
  at: string;
  by: string;
  kind: ExportKind;
  from: string;
  to: string;
  rows: number;
}

/** GET /billing: everything the client's billing page needs. */
export interface BillingOverview {
  outstanding: number;
  overdue: number;
  nextDue?: { invoiceId: string; number: string; due: string; balance: number };
  invoices: InvoiceListItem[];
  quotes: QuoteListItem[];
  contracts: ClientContract[];
  payments: PaymentItem[];
  /** Only the client owner may accept or decline quotes. */
  canAccept: boolean;
}

/* ---------- Week 5: client reports ---------- */

export type MetricUnit = 'NUMBER' | 'PERCENT' | 'INR' | 'SECONDS';

export interface MetricValue {
  key: string;
  label: string;
  unit: MetricUnit;
  /** Lower is better, e.g. cost per lead or page load time. */
  lowerIsBetter?: boolean;
  value?: number;
  previous?: number;
}

export interface ReportSection {
  service: string;
  highlight?: string;
  metrics: MetricValue[];
}

export interface ClientReport {
  clientId: string;
  clientName: string;
  /** yyyy-mm */
  month: string;
  status: 'DRAFT' | 'PUBLISHED' | 'NOT_STARTED';
  summary: string;
  sections: ReportSection[];
  publishedAt?: string;
  publishedBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  /** Months with a published report, newest first (the client's month picker). */
  months: string[];
}

export interface ReportStatusItem {
  clientId: string;
  clientName: string;
  month: string;
  status: ClientReport['status'];
  services: string[];
  filled: number;
  total: number;
  updatedAt?: string;
}

export interface ReportInput {
  summary: string;
  sections: Array<{ service: string; highlight?: string; values: Record<string, number | null> }>;
}
