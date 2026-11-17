/**
 * Seeded fake data for Phase 0. Every name and company here is invented.
 * Dates are relative to today so "due tomorrow" and "overdue" stay meaningful.
 *
 * Rows here carry the private columns the backend will have (organisationId,
 * memberIds, assigneeId …). Handlers strip them before answering, exactly as
 * the Spring Boot DTOs will.
 *
 * Arrays are mutable on purpose: PATCH and POST handlers change them in memory,
 * so the prototype behaves like a real backend until the page is reloaded.
 */
import { docPage, post, webPage } from './art';
import type {
  AccountStatus,
  ActivityItem,
  ApprovalStatus,
  AssetKind,
  AssetVersion,
  LoginEvent,
  PinComment,
  PortalSettings,
  ChecklistItem,
  Deliverable,
  Health,
  InvoiceSummary,
  Priority,
  ProjectStatus,
  Role,
  TaskComment,
  TaskFile,
  TaskStatus,
  User,
} from '@/types';

export const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};
export const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

export const DEMO_PASSWORD = 'demo1234';

/** Organisation ids. Webinger itself is one organisation; each client company is another. */
export const ORG = {
  WEBINGER: 'org-webinger',
  TERRA: 'org-terra',
  NOVA: 'org-nova',
  SUNRISE: 'org-sunrise',
  CREATOR: 'org-creator-ananya',
  VENDOR: 'org-vendor-lensworks',
} as const;

export const CLIENT_NAME: Record<string, string> = {
  [ORG.TERRA]: 'Terra Foods',
  [ORG.NOVA]: 'Nova Clinics',
  [ORG.SUNRISE]: 'Sunrise Retail Group',
};

/**
 * Account row as the backend stores it. Only the User fields ever leave the API;
 * status, MFA and session data are for the admin screens and the auth checks.
 * Passwords are never stored here (see `passwords` below; Phase 1: BCrypt hashes).
 */
export interface UserRow extends User {
  status: AccountStatus;
  mfaEnabled: boolean;
  createdAt: string;
  lastLoginAt?: string;
  /** Sessions issued before this moment are rejected (force logout). */
  sessionsRevokedAt?: string;
  /** Client reps only: owner granted billing access. */
  canSeeBilling?: boolean;
  invitedBy?: string;
}

const acct = (u: User, extra: Partial<UserRow> = {}): UserRow => ({
  status: 'ACTIVE',
  mfaEnabled: u.role === 'SUPER_ADMIN' || u.role === 'MANAGER',
  createdAt: ago(24 * 200),
  lastLoginAt: ago(5 + u.id.length),
  ...u,
  ...extra,
});

const staff = (id: string, name: string, title: string, email: string): User => ({
  id,
  name,
  email,
  role: 'EMPLOYEE',
  organisationId: ORG.WEBINGER,
  organisationName: 'Webinger',
  title,
});

export const users: UserRow[] = [
  acct({ id: 'u-admin', name: 'Rohan Mehta', email: 'admin@webinger.in', role: 'SUPER_ADMIN', organisationId: ORG.WEBINGER, organisationName: 'Webinger', title: 'Founder' }),
  acct({ id: 'u-admin2', name: 'Isha Mehta', email: 'isha@webinger.in', role: 'SUPER_ADMIN', organisationId: ORG.WEBINGER, organisationName: 'Webinger', title: 'Co-founder (backup owner)' }, { lastLoginAt: ago(50) }),
  acct({ id: 'u-mgr', name: 'Kavya Iyer', email: 'manager@webinger.in', role: 'MANAGER', organisationId: ORG.WEBINGER, organisationName: 'Webinger', title: 'Operations Head' }),
  acct({ id: 'u-emp', name: 'Priya Sharma', email: 'priya@webinger.in', role: 'EMPLOYEE', organisationId: ORG.WEBINGER, organisationName: 'Webinger', title: 'Social Media Executive' }),
  acct(staff('u-rahul', 'Rahul Nair', 'SEO Specialist', 'rahul@webinger.in')),
  acct(staff('u-meera', 'Meera Pillai', 'Graphic Designer', 'meera@webinger.in')),
  acct(staff('u-vikram', 'Vikram Singh', 'Performance Marketer', 'vikram@webinger.in')),
  acct(staff('u-aarav', 'Aarav Desai', 'Content Writer', 'aarav@webinger.in')),
  acct({ id: 'u-client', name: 'Arjun Kapoor', email: 'arjun@terrafoods.in', role: 'CLIENT_OWNER', organisationId: ORG.TERRA, organisationName: 'Terra Foods', title: 'Marketing Head' }),
  acct({ id: 'u-rep', name: 'Neha Verma', email: 'neha@terrafoods.in', role: 'CLIENT_REP', organisationId: ORG.TERRA, organisationName: 'Terra Foods', title: 'Brand Executive' }),
  acct({ id: 'u-client2', name: 'Sameer Joshi', email: 'sameer@novaclinics.in', role: 'CLIENT_OWNER', organisationId: ORG.NOVA, organisationName: 'Nova Clinics', title: 'Director' }),
  acct({ id: 'u-client3', name: 'Farah Siddiqui', email: 'farah@sunriseretail.in', role: 'CLIENT_OWNER', organisationId: ORG.SUNRISE, organisationName: 'Sunrise Retail Group', title: 'Head of Marketing' }),
  acct({ id: 'u-inf', name: 'Ananya Rao', email: 'ananya@creator.in', role: 'INFLUENCER', organisationId: ORG.CREATOR, organisationName: 'Ananya Rao', title: 'Food & lifestyle creator' }),
  acct({ id: 'u-partner', name: 'Lensworks Studio', email: 'hello@lensworks.in', role: 'PARTNER', organisationId: ORG.VENDOR, organisationName: 'Lensworks Studio', title: 'Photography vendor' }),
  // Week 3 demo cases: an invited employee, a rep waiting for admin approval, a suspended ex-employee.
  acct(staff('u-new', 'Divya Menon', 'Video Editor', 'divya@webinger.in'), { status: 'INVITED', lastLoginAt: undefined, createdAt: ago(30) }),
  acct({ id: 'u-rep2', name: 'Karan Malhotra', email: 'karan@terrafoods.in', role: 'CLIENT_REP', organisationId: ORG.TERRA, organisationName: 'Terra Foods', title: 'Social Media Coordinator' }, { status: 'PENDING_APPROVAL', lastLoginAt: undefined, createdAt: ago(20), invitedBy: 'Arjun Kapoor' }),
  acct(staff('u-old', 'Nikhil Rao', 'Former Designer', 'nikhil@webinger.in'), { status: 'SUSPENDED', lastLoginAt: ago(24 * 40) }),
];
export const userById = (id: string) => users.find((u) => u.id === id);
export const nameOf = (id: string) => userById(id)?.name ?? 'Unassigned';

export const organisations = [
  { id: ORG.WEBINGER, name: 'Webinger', kind: 'AGENCY' as const },
  { id: ORG.TERRA, name: 'Terra Foods', kind: 'CLIENT' as const },
  { id: ORG.NOVA, name: 'Nova Clinics', kind: 'CLIENT' as const },
  { id: ORG.SUNRISE, name: 'Sunrise Retail Group', kind: 'CLIENT' as const },
  { id: ORG.CREATOR, name: 'Ananya Rao', kind: 'INFLUENCER' as const },
  { id: ORG.VENDOR, name: 'Lensworks Studio', kind: 'PARTNER' as const },
];

/** Demo two-step code. Phase 1: TOTP from an authenticator app. */
export const DEMO_MFA_CODE = '123456';

/** Passwords set through invite or reset links. Everyone else uses DEMO_PASSWORD. Phase 1: BCrypt hashes in MySQL. */
export const passwords = new Map<string, string>();

/** One-time tokens for invite, password-reset and two-step links. */
export const tokens = new Map<string, { userId: string; purpose: 'INVITE' | 'RESET' | 'MFA'; expiresAt: number; used: boolean }>();

/** Emails the system would have sent. Demo only, so links can be opened without an inbox. */
export const outbox: Array<{ id: string; to: string; subject: string; body: string; link?: string; at: string }> = [];

export const loginEvents: LoginEvent[] = [
  { id: 'le1', userId: 'u-admin', userName: 'Rohan Mehta', email: 'admin@webinger.in', at: ago(2), result: 'SUCCESS', ip: '103.21.58.14', device: 'Chrome on Windows' },
  { id: 'le2', userId: 'u-client', userName: 'Arjun Kapoor', email: 'arjun@terrafoods.in', at: ago(4), result: 'SUCCESS', ip: '49.36.112.7', device: 'Safari on iPhone' },
  { id: 'le3', userId: 'u-emp', userName: 'Priya Sharma', email: 'priya@webinger.in', at: ago(6), result: 'SUCCESS', ip: '103.21.58.20', device: 'Edge on Windows' },
  { id: 'le4', userName: 'Unknown', email: 'admin@webinger.co', at: ago(9), result: 'FAILED', ip: '185.220.101.4', device: 'curl' },
  { id: 'le5', userId: 'u-mgr', userName: 'Kavya Iyer', email: 'manager@webinger.in', at: ago(11.2), result: 'MFA_FAILED', ip: '103.21.58.22', device: 'Chrome on macOS' },
  { id: 'le6', userId: 'u-mgr', userName: 'Kavya Iyer', email: 'manager@webinger.in', at: ago(11), result: 'SUCCESS', ip: '103.21.58.22', device: 'Chrome on macOS' },
  { id: 'le7', userId: 'u-old', userName: 'Nikhil Rao', email: 'nikhil@webinger.in', at: ago(30), result: 'LOCKED', ip: '157.48.3.90', device: 'Chrome on Android' },
  { id: 'le8', userId: 'u-client2', userName: 'Sameer Joshi', email: 'sameer@novaclinics.in', at: ago(28), result: 'SUCCESS', ip: '106.51.77.2', device: 'Chrome on Android' },
];

export const settings: PortalSettings = {
  businessHours: { days: [1, 2, 3, 4, 5, 6], open: '10:00', close: '19:00', timezone: 'Asia/Kolkata' },
  responseTimes: { firstReplyHours: 4, ticketResolutionHours: 48 },
  approvalLimits: { managerDiscountPercent: 5, managerSpendLimit: 25000, deputyPayoutLimit: 30000 },
  defaultRevisions: 3,
  reminderAfterDays: 2,
};

/** Which demo account to offer per role on the login screen. */
export const demoAccounts: Array<{ role: Role; email: string; note?: string }> = [
  { role: 'SUPER_ADMIN', email: 'admin@webinger.in' },
  { role: 'MANAGER', email: 'manager@webinger.in' },
  { role: 'EMPLOYEE', email: 'priya@webinger.in' },
  { role: 'CLIENT_OWNER', email: 'arjun@terrafoods.in', note: 'Terra Foods' },
  { role: 'CLIENT_REP', email: 'neha@terrafoods.in', note: 'Terra Foods' },
  { role: 'CLIENT_OWNER', email: 'sameer@novaclinics.in', note: 'Nova Clinics' },
  { role: 'CLIENT_OWNER', email: 'farah@sunriseretail.in', note: 'Sunrise, 40 projects' },
  { role: 'INFLUENCER', email: 'ananya@creator.in' },
  { role: 'PARTNER', email: 'hello@lensworks.in' },
];

/* ---------------------------------------------------------------- projects */

export interface MilestoneRow {
  id: string;
  title: string;
  due: string;
  completedAt?: string;
}

export interface ProjectRow {
  id: string;
  organisationId: string;
  name: string;
  service: string;
  status: ProjectStatus;
  health: Health;
  progress: number;
  ownerId: string;
  backupId?: string;
  /** Staff and client people added to the project. Client reps only see projects they are in. */
  memberIds: string[];
  startDate: string;
  endDate?: string;
  scope: string;
  budgetHours: number;
  hoursUsed: number;
  milestones: MilestoneRow[];
  deliverables: Deliverable[];
  activity: ActivityItem[];
}

const ms = (id: string, title: string, due: number, doneOffset?: number): MilestoneRow => ({
  id,
  title,
  due: day(due),
  completedAt: doneOffset === undefined ? undefined : day(doneOffset),
});
const dl = (
  id: string,
  title: string,
  status: Deliverable['status'],
  due: number,
  milestoneId?: string,
  revisionsUsed = 0,
  revisionsAllowed = 3,
): Deliverable => ({ id, title, status, due: day(due), milestoneId, revisionsUsed, revisionsAllowed });
const act = (id: string, hoursAgo: number, actor: string, text: string, visibility: ActivityItem['visibility'] = 'CLIENT'): ActivityItem => ({
  id,
  at: ago(hoursAgo),
  actor,
  text,
  visibility,
});

const handWritten: ProjectRow[] = [
  {
    id: 'p1',
    organisationId: ORG.TERRA,
    name: 'Social media retainer',
    service: 'Social media',
    status: 'ACTIVE',
    health: 'GREEN',
    progress: 64,
    ownerId: 'u-emp',
    backupId: 'u-meera',
    memberIds: ['u-emp', 'u-meera', 'u-aarav', 'u-rep', 'u-rep2'],
    startDate: day(-75),
    endDate: day(290),
    scope: 'Instagram and Facebook management: 16 posts, 8 reels and 20 stories a month, community replies within business hours, monthly performance report.',
    budgetHours: 120,
    hoursUsed: 77,
    milestones: [
      ms('p1m1', 'Brand voice and content pillars', -60, -62),
      ms('p1m2', 'October content calendar', -30, -31),
      ms('p1m3', 'November content calendar', -5, -6),
      ms('p1m4', 'December content calendar', 3),
      ms('p1m5', 'Quarterly review', 40),
    ],
    deliverables: [
      dl('p1d1', 'Content pillars document', 'APPROVED', -60, 'p1m1', 1),
      dl('p1d2', 'November calendar (16 posts)', 'APPROVED', -6, 'p1m3', 2),
      dl('p1d3', 'Week 1 post designs (6)', 'CLIENT_APPROVAL', 1, 'p1m4', 1),
      dl('p1d4', 'Festive reel script', 'IN_PROGRESS', 4, 'p1m4'),
      dl('p1d5', 'December calendar (16 posts)', 'IN_PROGRESS', 3, 'p1m4'),
      dl('p1d6', 'Q4 performance report', 'PLANNED', 40, 'p1m5'),
    ],
    activity: [
      act('p1a1', 3, 'Priya Sharma', 'Sent "Week 1 post designs (6)" for your approval'),
      act('p1a2', 5, 'Meera Pillai', 'Passed internal review on week 1 designs', 'INTERNAL'),
      act('p1a3', 20, 'Arjun Kapoor', 'Requested changes on post 4: use the new logo'),
      act('p1a4', 30, 'Priya Sharma', 'Moved "Write captions and hashtags" to In progress', 'INTERNAL'),
      act('p1a5', 140, 'Kavya Iyer', 'Completed milestone "November content calendar"'),
      act('p1a6', 200, 'Aarav Desai', 'Logged 6 h on caption drafts', 'INTERNAL'),
    ],
  },
  {
    id: 'p2',
    organisationId: ORG.TERRA,
    name: 'Website redesign',
    service: 'Website',
    status: 'ACTIVE',
    health: 'AMBER',
    progress: 38,
    ownerId: 'u-mgr',
    backupId: 'u-meera',
    memberIds: ['u-mgr', 'u-meera', 'u-aarav'],
    startDate: day(-40),
    endDate: day(50),
    scope: 'Redesign of terrafoods.in: 8 page templates, menu and store locator, mobile-first, handover to their in-house developer.',
    budgetHours: 160,
    hoursUsed: 71,
    milestones: [
      ms('p2m1', 'Sitemap and wireframes', -20, -21),
      ms('p2m2', 'Homepage design sign-off', -2),
      ms('p2m3', 'Inner page designs', 18),
      ms('p2m4', 'Developer handover', 50),
    ],
    deliverables: [
      dl('p2d1', 'Sitemap', 'APPROVED', -25, 'p2m1'),
      dl('p2d2', 'Wireframes (8 templates)', 'APPROVED', -21, 'p2m1', 1),
      dl('p2d3', 'Homepage design v2', 'CLIENT_APPROVAL', -2, 'p2m2', 2),
      dl('p2d4', 'Menu page design', 'IN_PROGRESS', 10, 'p2m3'),
      dl('p2d5', 'Homepage copy', 'IN_REVIEW', 2, 'p2m2'),
    ],
    activity: [
      act('p2a1', 26, 'Kavya Iyer', 'Asked for a 15-minute call on the homepage'),
      act('p2a2', 98, 'Meera Pillai', 'Sent "Homepage design v2" for your approval'),
      act('p2a3', 100, 'Kavya Iyer', 'Health changed to Needs attention: approval pending over 4 days', 'INTERNAL'),
      act('p2a4', 500, 'Kavya Iyer', 'Completed milestone "Sitemap and wireframes"'),
    ],
  },
  {
    id: 'p3',
    organisationId: ORG.TERRA,
    name: 'Local SEO',
    service: 'SEO',
    status: 'ACTIVE',
    health: 'GREEN',
    progress: 81,
    ownerId: 'u-rahul',
    backupId: 'u-emp',
    memberIds: ['u-rahul', 'u-emp', 'u-aarav'],
    startDate: day(-150),
    endDate: day(30),
    scope: 'Google Business profiles for 6 outlets, local citations, 4 blog posts a month, monthly ranking report.',
    budgetHours: 90,
    hoursUsed: 70,
    milestones: [
      ms('p3m1', 'Profile clean-up for 6 outlets', -120, -125),
      ms('p3m2', 'Citation building', -60, -58),
      ms('p3m3', 'Monthly ranking report', 9),
    ],
    deliverables: [
      dl('p3d1', 'Optimised Google Business profiles', 'APPROVED', -125, 'p3m1'),
      dl('p3d2', 'Blog post: winter recipes', 'IN_REVIEW', 1, 'p3m3'),
      dl('p3d3', 'November ranking report', 'PLANNED', 9, 'p3m3'),
    ],
    activity: [
      act('p3a1', 8, 'Aarav Desai', 'Submitted "Blog post: winter recipes" for internal review', 'INTERNAL'),
      act('p3a2', 72, 'Rahul Nair', 'Three outlets now rank in the top 3 for "organic store near me"'),
    ],
  },
  {
    id: 'p4',
    organisationId: ORG.NOVA,
    name: 'Lead generation ads',
    service: 'Paid ads',
    status: 'ACTIVE',
    health: 'RED',
    progress: 22,
    ownerId: 'u-mgr',
    backupId: 'u-vikram',
    memberIds: ['u-mgr', 'u-vikram', 'u-emp', 'u-meera'],
    startDate: day(-35),
    endDate: day(55),
    scope: 'Meta and Google lead campaigns for 3 clinics, landing page, weekly lead report, ₹1.5 L monthly ad budget managed.',
    budgetHours: 100,
    hoursUsed: 64,
    milestones: [
      ms('p4m1', 'Tracking and pixel setup', -25, -24),
      ms('p4m2', 'Campaign relaunch', -5),
      ms('p4m3', 'First monthly review', 20),
    ],
    deliverables: [
      dl('p4d1', 'Conversion tracking', 'APPROVED', -24, 'p4m1'),
      dl('p4d2', 'Ad creatives set B', 'IN_PROGRESS', -1, 'p4m2', 3, 3),
      dl('p4d3', 'Landing page refresh', 'IN_REVIEW', 2, 'p4m2'),
      dl('p4d4', 'Landing page hero banner', 'CLIENT_APPROVAL', 2, 'p4m2', 3, 3),
    ],
    activity: [
      act('p4a1', 5, 'Sameer Joshi', 'Reported that leads dropped this week'),
      act('p4a2', 30, 'Vikram Singh', 'Paused 2 under-performing ad sets', 'INTERNAL'),
      act('p4a3', 120, 'Kavya Iyer', 'Health changed to At risk: milestone "Campaign relaunch" missed', 'INTERNAL'),
      act('p4a4', 160, 'Vikram Singh', 'Shared week 4 lead report'),
    ],
  },
  {
    id: 'p5',
    organisationId: ORG.NOVA,
    name: 'Brand identity',
    service: 'Branding',
    status: 'ACTIVE',
    health: 'GREEN',
    progress: 90,
    ownerId: 'u-mgr',
    backupId: 'u-meera',
    memberIds: ['u-mgr', 'u-meera'],
    startDate: day(-70),
    endDate: day(6),
    scope: 'Logo refresh, colour and type system, stationery, signage guidelines and a 30-page brand book.',
    budgetHours: 80,
    hoursUsed: 74,
    milestones: [
      ms('p5m1', 'Discovery workshop', -60, -60),
      ms('p5m2', 'Logo concepts', -35, -36),
      ms('p5m3', 'Brand book handover', 6),
    ],
    deliverables: [
      dl('p5d1', 'Logo final files', 'APPROVED', -20, 'p5m2', 2),
      dl('p5d2', 'Brand book (30 pages)', 'IN_PROGRESS', 6, 'p5m3'),
    ],
    activity: [
      act('p5a1', 48, 'Meera Pillai', 'Shared brand book draft, pages 1–18'),
      act('p5a2', 400, 'Sameer Joshi', 'Approved "Logo final files"'),
    ],
  },
];

/* A client with 40 projects, so pagination, filters and search have real work to do. */
const SUNRISE_CITIES = ['Pune', 'Nagpur', 'Indore', 'Surat', 'Nashik', 'Bhopal', 'Vadodara', 'Raipur', 'Kochi', 'Mysuru'];
const SUNRISE_KINDS: Array<[string, string, string]> = [
  ['Store launch', 'Social media', 'u-meera'],
  ['Local SEO', 'SEO', 'u-rahul'],
  ['Footfall ads', 'Paid ads', 'u-vikram'],
  ['Signage design', 'Branding', 'u-meera'],
];
const HEALTH_CYCLE: Health[] = ['GREEN', 'GREEN', 'AMBER', 'GREEN', 'RED', 'GREEN', 'AMBER'];
const STATUS_CYCLE: ProjectStatus[] = ['ACTIVE', 'ACTIVE', 'ACTIVE', 'ON_HOLD', 'ACTIVE', 'COMPLETED', 'ACTIVE', 'ACTIVE'];

const generated: ProjectRow[] = Array.from({ length: 40 }, (_, i) => {
  const city = SUNRISE_CITIES[i % SUNRISE_CITIES.length];
  const [kind, service, lead] = SUNRISE_KINDS[Math.floor(i / SUNRISE_CITIES.length)];
  const id = `s${i + 1}`;
  const status = STATUS_CYCLE[i % STATUS_CYCLE.length];
  const done = status === 'COMPLETED';
  const health: Health = done ? 'GREEN' : HEALTH_CYCLE[i % HEALTH_CYCLE.length];
  const start = -20 - ((i * 7) % 90);
  const progress = done ? 100 : 10 + ((i * 17) % 80);
  const nextDue = health === 'RED' ? -3 : 2 + ((i * 5) % 25);
  return {
    id,
    organisationId: ORG.SUNRISE,
    name: `${kind}: ${city}`,
    service,
    status,
    health,
    progress,
    ownerId: i % 3 === 0 ? 'u-mgr' : lead,
    backupId: 'u-mgr',
    memberIds: [lead, 'u-mgr'],
    startDate: day(start),
    endDate: day(start + 90),
    scope: `${kind} for the ${city} store of Sunrise Retail Group.`,
    budgetHours: 40,
    hoursUsed: Math.round((40 * progress) / 100),
    milestones: [
      ms(`${id}m1`, 'Kick-off and brief', start + 5, start + 5),
      ms(`${id}m2`, done ? 'Final delivery' : `${kind} first delivery`, done ? start + 60 : nextDue, done ? start + 58 : undefined),
    ],
    deliverables: [dl(`${id}d1`, `${kind} plan for ${city}`, done ? 'APPROVED' : 'IN_PROGRESS', done ? start + 58 : nextDue, `${id}m2`)],
    activity: [act(`${id}a1`, 24 + i * 3, nameOf(lead), `Updated the ${kind.toLowerCase()} plan for ${city}`)],
  };
});

export const projects: ProjectRow[] = [...handWritten, ...generated];

/* ------------------------------------------------------------------- tasks */

export interface TaskRow {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  due: string;
  assigneeId: string;
  reviewerId?: string;
  clientFacing: boolean;
  /** The deliverable this task produces. Passing review sends it to the client for approval. */
  deliverableId?: string;
  /** Times sent back by the reviewer. Feeds the first-pass quality measure. */
  reviewFailures: number;
  checklist: ChecklistItem[];
  files: TaskFile[];
  comments: TaskComment[];
  createdAt: string;
}

let seq = 0;
const cl = (...items: Array<string | [string, boolean]>): ChecklistItem[] =>
  items.map((it) => {
    const [text, done] = typeof it === 'string' ? [it, false] : it;
    return { id: `c${++seq}`, text, done };
  });
const file = (name: string, sizeKb: number, by: string, hoursAgo: number, visibility: TaskFile['visibility'] = 'INTERNAL'): TaskFile => ({
  id: `f${++seq}`,
  name,
  sizeKb,
  uploadedBy: by,
  uploadedAt: ago(hoursAgo),
  visibility,
});
const cm = (authorId: string, hoursAgo: number, text: string, visibility: TaskComment['visibility'] = 'INTERNAL'): TaskComment => ({
  id: `cm${++seq}`,
  authorId,
  author: nameOf(authorId),
  at: ago(hoursAgo),
  text,
  visibility,
});

type TaskSeed = Omit<TaskRow, 'description' | 'checklist' | 'files' | 'comments' | 'createdAt' | 'clientFacing' | 'reviewFailures'> &
  Partial<Pick<TaskRow, 'description' | 'checklist' | 'files' | 'comments' | 'clientFacing' | 'reviewFailures'>> & { created?: number };
const task = (t: TaskSeed): TaskRow => ({
  description: '',
  checklist: [],
  files: [],
  comments: [],
  clientFacing: false,
  reviewFailures: 0,
  ...t,
  createdAt: ago((t.created ?? 5) * 24),
});

const handTasks: TaskRow[] = [
  task({
    id: 't1', projectId: 'p1', assigneeId: 'u-emp', reviewerId: 'u-meera', clientFacing: true,
    title: 'Design 6 Instagram posts for week 2', status: 'IN_PROGRESS', priority: 'HIGH', due: day(0),
    description: 'Six feed posts for the second week of December. Use the winter palette from the brand vault and the new logo lock-up. Post 4 needs the revised offer price.',
    checklist: cl(['Pull product photos from the brand vault', true], ['Draft layouts in Figma', true], 'Apply new logo to all six', 'Export 1080 × 1350 PNGs', 'Send to Meera for review'),
    files: [file('week1-posts-v1.fig', 4200, 'Priya Sharma', 26), file('client-feedback-post4.png', 310, 'Arjun Kapoor', 20, 'CLIENT')],
    comments: [
      cm('u-client', 20, 'Please use the new logo from the brand vault on post 4.', 'CLIENT'),
      cm('u-emp', 18, 'Noted, updating all six to the new lock-up.', 'CLIENT'),
      cm('u-meera', 6, 'Post 2 headline is too long for mobile, try 6 words max.'),
    ],
  }),
  task({
    id: 't2', projectId: 'p1', assigneeId: 'u-emp', reviewerId: 'u-mgr', clientFacing: true,
    title: 'Write captions and hashtags', status: 'TODO', priority: 'MEDIUM', due: day(0),
    description: 'Captions for the six week 1 posts. Keep each under 120 words, end with a question, max 8 hashtags.',
    checklist: cl('Captions for posts 1–3', 'Captions for posts 4–6', 'Hashtag set checked against banned list'),
    comments: [cm('u-aarav', 30, 'I left a tone guide in the brand vault folder, use the "warm, local" voice.')],
  }),
  task({
    id: 't3', projectId: 'p4', assigneeId: 'u-emp', reviewerId: 'u-vikram', clientFacing: true,
    title: 'Fix ad creative feedback', status: 'TODO', priority: 'HIGH', due: day(-1),
    description: 'Client asked for a softer tone and clinic photos instead of stock images on set B.',
    checklist: cl('Swap stock photos for clinic shoot', 'Rewrite headline variants', 'Resize for Stories'),
    files: [file('nova-setB-feedback.pdf', 820, 'Vikram Singh', 50)],
    comments: [cm('u-vikram', 49, 'This is the last revision included in the contract, get it right first time.')],
  }),
  task({
    id: 't4', projectId: 'p3', assigneeId: 'u-emp',
    title: 'Google Business profile update', status: 'TODO', priority: 'LOW', due: day(2),
    description: 'Add winter opening hours and 10 new photos to all six outlet profiles.',
    checklist: cl('Opening hours', 'Photos', 'Respond to new reviews'),
  }),
  task({
    id: 't5', projectId: 'p1', assigneeId: 'u-emp', reviewerId: 'u-mgr', clientFacing: true,
    title: 'Reel script: festive offer', status: 'TODO', priority: 'MEDIUM', due: day(4),
    description: '30-second reel script for the festive combo offer. Hook in the first 2 seconds.',
  }),
  task({
    id: 't6', projectId: 'p3', assigneeId: 'u-aarav', reviewerId: 'u-emp', clientFacing: true, deliverableId: 'p3d2',
    title: 'Blog post: winter recipes', status: 'IN_REVIEW', priority: 'MEDIUM', due: day(1),
    description: '1,200-word post targeting "winter recipes with millets". Include 3 Terra Foods products.',
    files: [file('winter-recipes-draft.docx', 64, 'Aarav Desai', 8)],
    comments: [cm('u-aarav', 8, 'Ready for review. Keyword density is 1.2%.')],
  }),
  task({
    id: 't7', projectId: 'p1', assigneeId: 'u-emp', title: 'Reply to weekend comments', status: 'DONE', priority: 'LOW', due: day(-2),
    checklist: cl(['Instagram', true], ['Facebook', true]),
  }),
  task({
    id: 't8', projectId: 'p1', assigneeId: 'u-emp', reviewerId: 'u-meera', clientFacing: true, deliverableId: 'p1d5',
    title: 'December content calendar', status: 'IN_REVIEW', priority: 'HIGH', due: day(1),
    description: '16 posts and 8 reels across December. Mark festive dates.',
    files: [file('dec-calendar.xlsx', 48, 'Priya Sharma', 10)],
  }),
  task({
    id: 't9', projectId: 'p4', assigneeId: 'u-emp', reviewerId: 'u-vikram', clientFacing: true, deliverableId: 'p4d4', reviewFailures: 1,
    title: 'Landing page hero banner', status: 'CLIENT_APPROVAL', priority: 'MEDIUM', due: day(2),
    files: [file('nova-hero-v3.png', 640, 'Priya Sharma', 30, 'CLIENT')],
  }),
  task({
    id: 't10', projectId: 'p1', assigneeId: 'u-emp', title: 'Monthly hashtag research', status: 'IN_PROGRESS', priority: 'LOW', due: day(6),
    checklist: cl(['Competitor scan', true], 'Trending local tags', 'Update hashtag sheet'),
  }),
  task({ id: 't11', projectId: 'p1', assigneeId: 'u-emp', title: 'Story templates for December', status: 'DONE', priority: 'MEDIUM', due: day(-4), clientFacing: true, reviewerId: 'u-meera' }),
  task({ id: 't12', projectId: 'p2', assigneeId: 'u-meera', reviewerId: 'u-mgr', clientFacing: true, title: 'Menu page design', status: 'IN_PROGRESS', priority: 'HIGH', due: day(8) }),
  task({ id: 't13', projectId: 'p2', assigneeId: 'u-aarav', reviewerId: 'u-mgr', clientFacing: true, deliverableId: 'p2d5', title: 'Homepage copy', status: 'IN_REVIEW', priority: 'MEDIUM', due: day(2) }),
  task({ id: 't14', projectId: 'p2', assigneeId: 'u-meera', title: 'Prepare design tokens for developer', status: 'TODO', priority: 'LOW', due: day(30) }),
  task({ id: 't15', projectId: 'p2', assigneeId: 'u-mgr', title: 'Chase homepage approval', status: 'TODO', priority: 'HIGH', due: day(-1) }),
  task({ id: 't16', projectId: 'p3', assigneeId: 'u-rahul', title: 'November ranking report', status: 'TODO', priority: 'MEDIUM', due: day(8), clientFacing: true, reviewerId: 'u-mgr' }),
  task({ id: 't17', projectId: 'p3', assigneeId: 'u-rahul', title: 'Build 20 local citations', status: 'DONE', priority: 'LOW', due: day(-10) }),
  task({ id: 't18', projectId: 'p4', assigneeId: 'u-vikram', title: 'Rebuild audience segments', status: 'IN_PROGRESS', priority: 'HIGH', due: day(-2) }),
  task({ id: 't19', projectId: 'p4', assigneeId: 'u-vikram', reviewerId: 'u-mgr', clientFacing: true, title: 'Weekly lead report', status: 'TODO', priority: 'MEDIUM', due: day(3) }),
  task({ id: 't20', projectId: 'p5', assigneeId: 'u-meera', reviewerId: 'u-mgr', clientFacing: true, deliverableId: 'p5d2', title: 'Brand book pages 19–30', status: 'IN_PROGRESS', priority: 'HIGH', due: day(4) }),
  task({
    id: 't22', projectId: 'p1', assigneeId: 'u-emp', reviewerId: 'u-meera', clientFacing: true, deliverableId: 'p1d3',
    title: 'Week 1 post designs (6)', status: 'CLIENT_APPROVAL', priority: 'HIGH', due: day(1), reviewFailures: 1,
    description: 'Six posts for the first week of December. Version 2 uses the new logo lock-up the client asked for.',
  }),
  task({
    id: 't23', projectId: 'p2', assigneeId: 'u-meera', reviewerId: 'u-mgr', clientFacing: true, deliverableId: 'p2d3',
    title: 'Homepage design', status: 'CLIENT_APPROVAL', priority: 'HIGH', due: day(-2),
  }),
  task({ id: 't21', projectId: 'p5', assigneeId: 'u-meera', title: 'Package source files', status: 'TODO', priority: 'LOW', due: day(6) }),
];

const generatedTasks: TaskRow[] = generated.flatMap((p, i) => {
  if (p.status === 'COMPLETED') return [];
  const lead = p.memberIds[0];
  return [
    task({
      id: `${p.id}t1`, projectId: p.id, assigneeId: lead, reviewerId: 'u-mgr', clientFacing: true, deliverableId: p.deliverables[0].id,
      title: `${p.deliverables[0].title}`, status: (['TODO', 'IN_PROGRESS', 'IN_REVIEW'] as const)[i % 3], priority: 'MEDIUM',
      due: p.deliverables[0].due,
    }),
    task({
      id: `${p.id}t2`, projectId: p.id, assigneeId: lead, title: 'Collect store photos and details', status: 'DONE', priority: 'LOW',
      due: day(-10),
    }),
  ];
});

export const tasks: TaskRow[] = [...handTasks, ...generatedTasks];

/* ------------------------------------------------------- other week 1 data */

export const invoices: Array<InvoiceSummary & { organisationId: string }> = [
  { id: 'i1', organisationId: ORG.TERRA, number: 'WEB/2026-27/0112', clientName: 'Terra Foods', amount: 59000, due: day(5), status: 'SENT' },
  { id: 'i2', organisationId: ORG.NOVA, number: 'WEB/2026-27/0098', clientName: 'Nova Clinics', amount: 82600, due: day(-17), status: 'OVERDUE' },
  { id: 'i3', organisationId: ORG.NOVA, number: 'WEB/2026-27/0105', clientName: 'Nova Clinics', amount: 35400, due: day(-4), status: 'OVERDUE' },
];

/* --------------------------------------------------------------- approvals */

export interface ApprovalRow {
  id: string;
  organisationId: string;
  projectId: string;
  deliverableId: string;
  title: string;
  kind: AssetKind;
  status: ApprovalStatus;
  revisionsUsed: number;
  revisionsAllowed: number;
  versions: AssetVersion[];
  comments: PinComment[];
}

const ver = (
  id: string,
  number: number,
  fileName: string,
  pages: string[],
  hoursAgo: number,
  by: string,
  decision?: AssetVersion['decision'],
  note?: string,
): AssetVersion => ({ id, number, fileName, pages, submittedAt: ago(hoursAgo), submittedBy: by, decision, note });
const decided = (status: 'APPROVED' | 'CHANGES_REQUESTED', byName: string, hoursAgo: number, note?: string) => ({ status, byName, at: ago(hoursAgo), note });
const pin = (id: string, versionId: string, page: number, x: number, y: number, authorId: string, hoursAgo: number, text: string): PinComment => {
  const u = userById(authorId)!;
  return { id, versionId, page, x, y, authorId, author: u.name, fromAgency: u.organisationId === ORG.WEBINGER, at: ago(hoursAgo), text };
};
const posts = (headlines: string[], brand: string, variant: number) => headlines.map((h, i) => post(h, brand, i + 1, variant));
const WEEK1 = ['Winter is here', 'Millet magic', 'Fresh from farms', 'Combo at ₹299', 'Meet our growers', 'Weekend brunch'];
const HERO_NOTES = ['Too clinical.', 'Use our clinic photos.', 'Headline font too thin.'];

export const approvals: ApprovalRow[] = [
  {
    id: 'a1', organisationId: ORG.TERRA, projectId: 'p1', deliverableId: 'p1d3', title: 'Week 1 post designs (6)', kind: 'IMAGE',
    status: 'PENDING', revisionsUsed: 1, revisionsAllowed: 3,
    versions: [
      ver('a1v1', 1, 'week1-posts-v1.zip', posts(WEEK1, 'TERRA', 0), 60, 'Priya Sharma', decided('CHANGES_REQUESTED', 'Arjun Kapoor', 44, 'Please use the new logo from the brand vault, and post 4 price should be ₹299.')),
      ver('a1v2', 2, 'week1-posts-v2.zip', posts(WEEK1, 'TERRA', 1), 20, 'Priya Sharma', undefined, 'New logo on all six, price fixed on post 4.'),
    ],
    comments: [
      pin('pc1', 'a1v1', 3, 50, 72, 'u-client', 44, 'Price should be ₹299, not ₹349.'),
      pin('pc2', 'a1v1', 0, 86, 8, 'u-client', 44, 'Old logo here. Use the new one.'),
      pin('pc3', 'a1v1', 0, 80, 14, 'u-emp', 40, 'Updated in v2 across all six posts.'),
    ],
  },
  {
    id: 'a2', organisationId: ORG.TERRA, projectId: 'p2', deliverableId: 'p2d3', title: 'Homepage design', kind: 'IMAGE',
    status: 'PENDING', revisionsUsed: 2, revisionsAllowed: 3,
    versions: [
      ver('a2v1', 1, 'homepage-v1.png', [webPage('Real food, near you', 'TERRA FOODS', 0)], 300, 'Meera Pillai', decided('CHANGES_REQUESTED', 'Arjun Kapoor', 280, 'Hero feels too dark. Show store locator higher up.')),
      ver('a2v2', 2, 'homepage-v2.png', [webPage('Real food, near you', 'TERRA FOODS', 1)], 200, 'Meera Pillai', decided('CHANGES_REQUESTED', 'Neha Verma', 150, 'Better. Make the menu cards bigger on mobile.')),
      ver('a2v3', 3, 'homepage-v3.png', [webPage('Real food, near you', 'TERRA FOODS', 2)], 98, 'Meera Pillai'),
    ],
    comments: [
      pin('pc4', 'a2v1', 0, 40, 20, 'u-client', 280, 'Too dark for a food brand.'),
      pin('pc5', 'a2v2', 0, 30, 52, 'u-rep', 150, 'These cards are small on my phone.'),
    ],
  },
  {
    id: 'a3', organisationId: ORG.TERRA, projectId: 'p1', deliverableId: 'p1d2', title: 'November calendar (16 posts)', kind: 'PDF',
    status: 'APPROVED', revisionsUsed: 2, revisionsAllowed: 3,
    versions: [
      ver('a3v1', 1, 'nov-calendar-v1.pdf', [docPage('November calendar', 1, 2, 0), docPage('November calendar', 2, 2, 0)], 400, 'Priya Sharma', decided('CHANGES_REQUESTED', 'Arjun Kapoor', 380, 'Add Diwali posts.')),
      ver('a3v2', 2, 'nov-calendar-v2.pdf', [docPage('November calendar', 1, 2, 1), docPage('November calendar', 2, 2, 1)], 300, 'Priya Sharma', decided('CHANGES_REQUESTED', 'Arjun Kapoor', 260, 'Swap week 3 and 4.')),
      ver('a3v3', 3, 'nov-calendar-v3.pdf', [docPage('November calendar', 1, 2, 2), docPage('November calendar', 2, 2, 2)], 200, 'Priya Sharma', decided('APPROVED', 'Arjun Kapoor', 150)),
    ],
    comments: [pin('pc6', 'a3v1', 1, 60, 40, 'u-client', 380, 'Diwali is missing.')],
  },
  {
    id: 'a4', organisationId: ORG.NOVA, projectId: 'p4', deliverableId: 'p4d4', title: 'Landing page hero banner', kind: 'IMAGE',
    status: 'PENDING', revisionsUsed: 3, revisionsAllowed: 3,
    versions: [1, 2, 3, 4].map((n) =>
      ver(`a4v${n}`, n, `nova-hero-v${n}.png`, [webPage('Healthy skin, simply', 'NOVA CLINICS', n + 1)], 200 - n * 40, 'Priya Sharma',
        n < 4 ? decided('CHANGES_REQUESTED', 'Sameer Joshi', 190 - n * 40, HERO_NOTES[n - 1]) : undefined),
    ),
    comments: [pin('pc7', 'a4v3', 0, 30, 18, 'u-client2', 70, 'Headline font too thin.')],
  },
  {
    id: 'a5', organisationId: ORG.NOVA, projectId: 'p5', deliverableId: 'p5d1', title: 'Logo final files', kind: 'IMAGE',
    status: 'APPROVED', revisionsUsed: 2, revisionsAllowed: 3,
    versions: [
      ver('a5v1', 1, 'nova-logo-v1.png', [post('NOVA', 'Nova Clinics', 1, 0)], 900, 'Meera Pillai', decided('CHANGES_REQUESTED', 'Sameer Joshi', 880, 'Try a softer colour.')),
      ver('a5v2', 2, 'nova-logo-v2.png', [post('NOVA', 'Nova Clinics', 2, 1)], 700, 'Meera Pillai', decided('CHANGES_REQUESTED', 'Sameer Joshi', 680, 'Closer. Thicker letters.')),
      ver('a5v3', 3, 'nova-logo-v3.png', [post('NOVA', 'Nova Clinics', 3, 2)], 500, 'Meera Pillai', decided('APPROVED', 'Sameer Joshi', 400)),
    ],
    comments: [],
  },
];
