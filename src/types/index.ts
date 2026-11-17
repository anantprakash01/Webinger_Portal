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
}

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
