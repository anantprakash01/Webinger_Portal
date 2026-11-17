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
import type {
  ActivityItem,
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

const staff = (id: string, name: string, title: string, email: string): User => ({
  id,
  name,
  email,
  role: 'EMPLOYEE',
  organisationId: ORG.WEBINGER,
  organisationName: 'Webinger',
  title,
});

export const users: User[] = [
  { id: 'u-admin', name: 'Rohan Mehta', email: 'admin@webinger.in', role: 'SUPER_ADMIN', organisationId: ORG.WEBINGER, organisationName: 'Webinger', title: 'Founder' },
  { id: 'u-mgr', name: 'Kavya Iyer', email: 'manager@webinger.in', role: 'MANAGER', organisationId: ORG.WEBINGER, organisationName: 'Webinger', title: 'Operations Head' },
  { id: 'u-emp', name: 'Priya Sharma', email: 'priya@webinger.in', role: 'EMPLOYEE', organisationId: ORG.WEBINGER, organisationName: 'Webinger', title: 'Social Media Executive' },
  staff('u-rahul', 'Rahul Nair', 'SEO Specialist', 'rahul@webinger.in'),
  staff('u-meera', 'Meera Pillai', 'Graphic Designer', 'meera@webinger.in'),
  staff('u-vikram', 'Vikram Singh', 'Performance Marketer', 'vikram@webinger.in'),
  staff('u-aarav', 'Aarav Desai', 'Content Writer', 'aarav@webinger.in'),
  { id: 'u-client', name: 'Arjun Kapoor', email: 'arjun@terrafoods.in', role: 'CLIENT_OWNER', organisationId: ORG.TERRA, organisationName: 'Terra Foods', title: 'Marketing Head' },
  { id: 'u-rep', name: 'Neha Verma', email: 'neha@terrafoods.in', role: 'CLIENT_REP', organisationId: ORG.TERRA, organisationName: 'Terra Foods', title: 'Brand Executive' },
  { id: 'u-client2', name: 'Sameer Joshi', email: 'sameer@novaclinics.in', role: 'CLIENT_OWNER', organisationId: ORG.NOVA, organisationName: 'Nova Clinics', title: 'Director' },
  { id: 'u-client3', name: 'Farah Siddiqui', email: 'farah@sunriseretail.in', role: 'CLIENT_OWNER', organisationId: ORG.SUNRISE, organisationName: 'Sunrise Retail Group', title: 'Head of Marketing' },
  { id: 'u-inf', name: 'Ananya Rao', email: 'ananya@creator.in', role: 'INFLUENCER', organisationId: ORG.CREATOR, organisationName: 'Ananya Rao', title: 'Food & lifestyle creator' },
  { id: 'u-partner', name: 'Lensworks Studio', email: 'hello@lensworks.in', role: 'PARTNER', organisationId: ORG.VENDOR, organisationName: 'Lensworks Studio', title: 'Photography vendor' },
];
export const userById = (id: string) => users.find((u) => u.id === id);
export const nameOf = (id: string) => userById(id)?.name ?? 'Unassigned';

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
    memberIds: ['u-emp', 'u-meera', 'u-aarav', 'u-rep'],
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

type TaskSeed = Omit<TaskRow, 'description' | 'checklist' | 'files' | 'comments' | 'createdAt' | 'clientFacing'> &
  Partial<Pick<TaskRow, 'description' | 'checklist' | 'files' | 'comments' | 'clientFacing'>> & { created?: number };
const task = (t: TaskSeed): TaskRow => ({
  description: '',
  checklist: [],
  files: [],
  comments: [],
  clientFacing: false,
  ...t,
  createdAt: ago((t.created ?? 5) * 24),
});

const handTasks: TaskRow[] = [
  task({
    id: 't1', projectId: 'p1', assigneeId: 'u-emp', reviewerId: 'u-meera', clientFacing: true,
    title: 'Design 6 Instagram posts for week 1', status: 'IN_PROGRESS', priority: 'HIGH', due: day(0),
    description: 'Six feed posts for the first week of December. Use the winter palette from the brand vault and the new logo lock-up. Post 4 needs the revised offer price.',
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
    id: 't6', projectId: 'p3', assigneeId: 'u-aarav', reviewerId: 'u-emp', clientFacing: true,
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
    id: 't8', projectId: 'p1', assigneeId: 'u-emp', reviewerId: 'u-meera', clientFacing: true,
    title: 'December content calendar', status: 'IN_REVIEW', priority: 'HIGH', due: day(1),
    description: '16 posts and 8 reels across December. Mark festive dates.',
    files: [file('dec-calendar.xlsx', 48, 'Priya Sharma', 10)],
  }),
  task({
    id: 't9', projectId: 'p4', assigneeId: 'u-emp', reviewerId: 'u-vikram', clientFacing: true,
    title: 'Landing page hero banner', status: 'CLIENT_APPROVAL', priority: 'MEDIUM', due: day(2),
    files: [file('nova-hero-v3.png', 640, 'Priya Sharma', 30, 'CLIENT')],
  }),
  task({
    id: 't10', projectId: 'p1', assigneeId: 'u-emp', title: 'Monthly hashtag research', status: 'IN_PROGRESS', priority: 'LOW', due: day(6),
    checklist: cl(['Competitor scan', true], 'Trending local tags', 'Update hashtag sheet'),
  }),
  task({ id: 't11', projectId: 'p1', assigneeId: 'u-emp', title: 'Story templates for December', status: 'DONE', priority: 'MEDIUM', due: day(-4), clientFacing: true, reviewerId: 'u-meera' }),
  task({ id: 't12', projectId: 'p2', assigneeId: 'u-meera', reviewerId: 'u-mgr', clientFacing: true, title: 'Menu page design', status: 'IN_PROGRESS', priority: 'HIGH', due: day(8) }),
  task({ id: 't13', projectId: 'p2', assigneeId: 'u-aarav', reviewerId: 'u-mgr', clientFacing: true, title: 'Homepage copy', status: 'IN_REVIEW', priority: 'MEDIUM', due: day(2) }),
  task({ id: 't14', projectId: 'p2', assigneeId: 'u-meera', title: 'Prepare design tokens for developer', status: 'TODO', priority: 'LOW', due: day(30) }),
  task({ id: 't15', projectId: 'p2', assigneeId: 'u-mgr', title: 'Chase homepage approval', status: 'TODO', priority: 'HIGH', due: day(-1) }),
  task({ id: 't16', projectId: 'p3', assigneeId: 'u-rahul', title: 'November ranking report', status: 'TODO', priority: 'MEDIUM', due: day(8), clientFacing: true, reviewerId: 'u-mgr' }),
  task({ id: 't17', projectId: 'p3', assigneeId: 'u-rahul', title: 'Build 20 local citations', status: 'DONE', priority: 'LOW', due: day(-10) }),
  task({ id: 't18', projectId: 'p4', assigneeId: 'u-vikram', title: 'Rebuild audience segments', status: 'IN_PROGRESS', priority: 'HIGH', due: day(-2) }),
  task({ id: 't19', projectId: 'p4', assigneeId: 'u-vikram', reviewerId: 'u-mgr', clientFacing: true, title: 'Weekly lead report', status: 'TODO', priority: 'MEDIUM', due: day(3) }),
  task({ id: 't20', projectId: 'p5', assigneeId: 'u-meera', reviewerId: 'u-mgr', clientFacing: true, title: 'Brand book pages 19–30', status: 'IN_PROGRESS', priority: 'HIGH', due: day(4) }),
  task({ id: 't21', projectId: 'p5', assigneeId: 'u-meera', title: 'Package source files', status: 'TODO', priority: 'LOW', due: day(6) }),
];

const generatedTasks: TaskRow[] = generated.flatMap((p, i) => {
  if (p.status === 'COMPLETED') return [];
  const lead = p.memberIds[0];
  return [
    task({
      id: `${p.id}t1`, projectId: p.id, assigneeId: lead, reviewerId: 'u-mgr', clientFacing: true,
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

export const approvals = [
  { id: 'a1', organisationId: ORG.TERRA, title: 'Week 1 post designs (6)', projectName: 'Social media retainer', submittedAt: ago(20), revisionsUsed: 1, revisionsAllowed: 3 },
  { id: 'a2', organisationId: ORG.TERRA, title: 'Homepage design v2', projectName: 'Website redesign', submittedAt: ago(98), revisionsUsed: 2, revisionsAllowed: 3 },
];

export const messages = [
  { id: 'm1', organisationId: ORG.TERRA, toUserId: 'u-client', from: 'Priya Sharma', projectName: 'Social media retainer', text: 'Week 1 designs are ready for your review.', at: ago(3), unread: true },
  { id: 'm2', organisationId: ORG.TERRA, toUserId: 'u-client', from: 'Kavya Iyer', projectName: 'Website redesign', text: 'Can we get 15 minutes tomorrow on the homepage?', at: ago(26), unread: false },
  { id: 'm3', organisationId: ORG.TERRA, toUserId: 'u-emp', from: 'Arjun Kapoor (Terra Foods)', projectName: 'Social media retainer', text: 'Please use the new logo from the brand vault.', at: ago(1), unread: true },
  { id: 'm4', organisationId: ORG.NOVA, toUserId: 'u-emp', from: 'Sameer Joshi (Nova Clinics)', projectName: 'Lead generation ads', text: 'Leads dropped this week, can you check?', at: ago(5), unread: true },
];
