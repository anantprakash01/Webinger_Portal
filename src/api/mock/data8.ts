/**
 * Week 8 seed: the 18 automation rules (CLAUDE.md section 5) with their settings and a run log,
 * knowledge-base articles, the service catalogue with task templates, and client onboarding checklists.
 * Everything is invented demo content.
 */
import type { AccessItem, ArticleCategory, AutomationRun, Questionnaire, RuleAction, RuleMode, RuleParam, TemplateTask } from '@/types';
import { ago, day, ORG } from './data';

/* ------------------------------------------------------------ automation */

export interface RuleRow {
  id: number;
  name: string;
  trigger: string;
  condition: string;
  escalation: string;
  humanStep?: string;
  mode: RuleMode;
  clientFacing: boolean;
  params: RuleParam[];
  actions: RuleAction[];
  updatedAt: string;
  updatedBy: string;
  draftSince?: string;
}

const p = (key: string, label: string, unit: RuleParam['unit'], value: number | number[], min: number, max: number): RuleParam => ({ key, label, unit, value, min, max });
const a = (key: string, label: string, external = false, enabled = true): RuleAction => ({ key, label, enabled, external });

const rule = (r: Omit<RuleRow, 'updatedAt' | 'updatedBy'> & Partial<RuleRow>): RuleRow => ({ updatedAt: ago(24 * 30), updatedBy: 'Rohan Mehta', ...r });

export const rules: RuleRow[] = [
  rule({ id: 1, name: 'New enquiry → lead', trigger: 'Website form or dashboard offer click', condition: 'No open lead with the same email', escalation: 'Follow-ups on day 1, 3 and 7; an unassigned lead alerts the manager', mode: 'ON', clientFacing: true, draftSince: day(-75),
    params: [p('followUps', 'Follow-up days', 'list', [1, 3, 7], 1, 30), p('unassignedHours', 'Alert manager if unassigned after', 'hours', 4, 1, 48)],
    actions: [a('createLead', 'Create the lead'), a('assignRotation', 'Assign a salesperson in rotation'), a('acknowledge', 'Send an acknowledgement email', true)] }),
  rule({ id: 2, name: 'Quote accepted → contract', trigger: 'Client owner accepts a quote', condition: 'Quote is sent and not expired', escalation: 'Advance invoice reminders on day 2 and 5', mode: 'ON', clientFacing: true, draftSince: day(-60),
    humanStep: 'The advance invoice is only drafted; a Super Admin sends it.',
    params: [p('reminders', 'Invoice reminder days', 'list', [2, 5], 1, 30)],
    actions: [a('contract', 'Add the contract to the client record'), a('advanceInvoice', 'Draft the advance invoice'), a('notifyOwner', 'Email the owner')] }),
  rule({ id: 3, name: 'Advance paid → project', trigger: 'Advance payment recorded', condition: 'The client has a service template for the contract', escalation: 'Manager alerted if a department has no capacity', mode: 'DRAFT', clientFacing: true, draftSince: day(-12),
    params: [p('capacity', 'Treat people above this load as full', 'percent', 100, 50, 150)],
    actions: [a('project', 'Create the project from the service template'), a('assign', 'Assign tasks by role and workload'), a('onboarding', 'Send the onboarding checklist', true)] }),
  rule({ id: 4, name: 'Task due soon', trigger: 'Task due within the reminder window', condition: 'Task is not done and not waiting on the client', escalation: 'Overdue → manager; 48 h overdue → project amber', mode: 'ON', clientFacing: false,
    params: [p('hoursBefore', 'Remind before due', 'hours', 24, 1, 72), p('amberAfter', 'Project amber after overdue', 'hours', 48, 12, 168)],
    actions: [a('remind', 'Remind the assignee'), a('escalate', 'Tell the manager when overdue')] }),
  rule({ id: 5, name: 'Work ready for review', trigger: 'Deliverable task moved to In review', condition: 'Task has a reviewer', escalation: 'Pending 24 h → reviewer reminded, then manager', mode: 'ON', clientFacing: false,
    params: [p('reviewHours', 'Remind reviewer after', 'hours', 24, 4, 72)],
    actions: [a('notifyReviewer', 'Notify the reviewer'), a('escalate', 'Tell the manager if still waiting')] }),
  rule({ id: 6, name: 'Approval reminders', trigger: 'Reviewer passes client-facing work', condition: 'Approval still pending', escalation: 'Reminder after 48 h; after 5 days a "call the client" task', mode: 'DRAFT', clientFacing: true, draftSince: day(-20),
    params: [p('remindHours', 'Remind client after', 'hours', 48, 12, 120), p('callDays', 'Create a "call the client" task after', 'days', 5, 2, 14)],
    actions: [a('notifyClient', 'Notify the client', true), a('remindClient', 'Send the reminder', true), a('callTask', 'Create the call task for the account manager')] }),
  rule({ id: 7, name: 'Changes requested', trigger: 'Client requests changes on an approval', condition: 'Always', escalation: 'At the revision limit, the account manager discusses extra charges', mode: 'ON', clientFacing: false,
    humanStep: 'Extra charges are a conversation, never an automatic invoice.',
    params: [],
    actions: [a('reopen', 'Reopen the task with the client\'s comments'), a('count', 'Add one to the revision counter'), a('limitNote', 'Tell the account manager at the limit')] }),
  rule({ id: 8, name: 'Client message waiting', trigger: 'Client sends a message', condition: 'Inside business hours', escalation: 'Past the response time → backup → manager', mode: 'ON', clientFacing: false,
    params: [p('firstReplyHours', 'First reply within (business hours)', 'hours', 4, 1, 24)],
    actions: [a('notifyOwner', 'Notify the channel owner'), a('escalate', 'Escalate to backup, then manager')] }),
  rule({ id: 9, name: 'Recurring invoices', trigger: 'First of the month', condition: 'Client has a running retainer', escalation: 'Reminders 3 days before, on the due date, 3 and 7 days after', mode: 'DRAFT', clientFacing: true, draftSince: day(-15),
    humanStep: 'Invoices are drafted; a Super Admin checks and sends them.',
    params: [p('reminderDays', 'Reminder days (from due date)', 'list', [-3, 0, 3, 7], -15, 30)],
    actions: [a('draftInvoices', 'Draft the month\'s invoices'), a('reminders', 'Send payment reminders', true)] }),
  rule({ id: 10, name: 'Invoice 15 days late', trigger: 'Invoice overdue by the threshold', condition: 'No payment recorded', escalation: 'A person decides', mode: 'ON', clientFacing: false,
    humanStep: 'Pausing work is never automatic: the rule only prepares the decision.',
    params: [p('days', 'Days overdue', 'days', 15, 7, 60)],
    actions: [a('prepare', 'Prepare the "pause work?" decision for the owner or deputy')] }),
  rule({ id: 11, name: 'Monthly client reports', trigger: 'Month end', condition: 'Client buys a service with a report template', escalation: 'Missing numbers → tasks for the responsible employee', mode: 'ON', clientFacing: false,
    humanStep: 'A manager reviews and publishes; reports never go out on their own.',
    params: [p('dueDay', 'Publish by day of month', 'days', 5, 1, 15)],
    actions: [a('draft', 'Create the report draft'), a('missingTasks', 'Create tasks for missing numbers')] }),
  rule({ id: 12, name: 'Milestone rating', trigger: 'Milestone completed', condition: 'Client has not rated this milestone', escalation: 'Score 3 or lower → manager alert and recovery task', mode: 'DRAFT', clientFacing: true, draftSince: day(-8),
    params: [p('alertAt', 'Alert at or below', 'count', 3, 1, 4)],
    actions: [a('askRating', 'Send the one-tap rating', true), a('recovery', 'Create a recovery task on low scores')] }),
  rule({ id: 13, name: 'Leave approved → handover', trigger: 'Leave approved', condition: 'Open tasks fall due during the leave', escalation: 'Manager confirms each handover', mode: 'ON', clientFacing: false,
    humanStep: 'Suggestions only; the approver confirms each handover.',
    params: [],
    actions: [a('list', 'List affected tasks'), a('suggest', 'Suggest a colleague by department and workload')] }),
  rule({ id: 14, name: 'Project budget alerts', trigger: 'Logged hours reach a threshold', condition: 'Project is active', escalation: 'At 100% a manager decides on extra billing', mode: 'ON', clientFacing: false,
    params: [p('warnAt', 'Warn the owner at', 'percent', 80, 50, 95), p('stopAt', 'Ask the manager at', 'percent', 100, 90, 150)],
    actions: [a('warn', 'Log an alert on the project'), a('manager', 'Tell the manager')] }),
  rule({ id: 15, name: 'Contract renewal', trigger: 'Contract ends within the window', condition: 'No renewal quote sent yet', escalation: 'Weekly reminder', mode: 'DRAFT', clientFacing: true, draftSince: day(-30),
    params: [p('days', 'Days before the end', 'days', 30, 7, 90)],
    actions: [a('task', 'Create a renewal task for the account manager'), a('offer', 'Send a renewal offer to the client', true)] }),
  rule({ id: 16, name: 'Creator submissions', trigger: 'Creator submits a profile or content', condition: 'Always', escalation: 'Queue older than 3 days → moderator alert', mode: 'ON', clientFacing: false,
    params: [p('queueDays', 'Alert when waiting longer than', 'days', 3, 1, 14)],
    actions: [a('validate', 'Run the automatic checks (engagement, insights, duplicates)'), a('queue', 'Add to the verification queue')] }),
  rule({ id: 17, name: 'Creator payout request', trigger: 'Creator posts with proof', condition: 'Draft was approved', escalation: 'Within the limit → deputy; above → owner', mode: 'ON', clientFacing: false,
    humanStep: 'Payouts are requested, never paid, automatically.',
    params: [],
    actions: [a('request', 'Create the payout request with TDS')] }),
  rule({ id: 18, name: 'Daily digest and backups', trigger: 'Every day', condition: 'Always', escalation: 'A failure alerts two people', mode: 'ON', clientFacing: false,
    params: [p('digestHour', 'Owner digest at (hour, IST)', 'hours', 8, 5, 11)],
    actions: [a('digest', 'Morning digest for the owner'), a('taskLists', 'Task lists for employees'), a('backup', 'Nightly backup and health check')] }),
];

export const automationState = { paused: false, pausedBy: undefined as string | undefined };

export const NEVER_AUTOMATED = ['Refunds', 'Discounts', 'Contract changes', 'Pausing work', 'Removing users', 'Payouts above the deputy limit'];

let rn = 0;
const run = (ruleId: number, hoursAgo: number, status: AutomationRun['status'], summary: string, target: string, link?: string, decidedBy?: string): Omit<AutomationRun, 'ruleName'> => ({
  id: `run${++rn}`,
  ruleId,
  at: ago(hoursAgo),
  status,
  summary,
  target,
  link,
  decidedBy,
  decidedAt: decidedBy ? ago(hoursAgo - 1) : undefined,
});

export const runs: Array<Omit<AutomationRun, 'ruleName'>> = [
  run(18, 3, 'DONE', 'Morning digest sent to Rohan Mehta and Isha Mehta', 'Owners'),
  run(18, 9, 'DONE', 'Nightly backup finished (41 MB) and health check passed', 'System'),
  run(1, 20, 'DONE', 'Lead created from the website form; acknowledgement sent', 'Saffron Table Restaurants', '/admin/pipeline?lead=ld1'),
  run(1, 50, 'DONE', 'Lead created from an offer click and assigned to Rohan Mehta', 'Greenleaf Organics', '/admin/pipeline?lead=ld2'),
  run(4, 6, 'DONE', 'Reminded 3 people about tasks due tomorrow', 'Priya Sharma, Rahul Nair, Meera Pillai'),
  run(14, 30, 'DONE', 'Local SEO reached 80% of its budget (70 of 90 hours); owner alerted', 'Terra Foods · Local SEO', '/admin/projects/p3'),
  run(10, 26, 'DONE', 'Prepared "pause work?" decision: invoice 17 days late', 'Nova Clinics', '/admin'),
  run(16, 30, 'DONE', 'Checks run; Tanya Bose added to the verification queue', 'Creators', '/admin/influencers'),
  run(17, 72, 'DONE', 'Payout request created: ₹12,000 less 10% TDS', 'Meher Gill · Skin care awareness', '/admin/influencers?tab=payouts'),
  run(13, 24 * 12, 'DONE', 'Listed 1 task due during Meera Pillai\'s leave; handover confirmed by Kavya Iyer', 'Meera Pillai'),
  run(9, 24 * 18, 'APPROVED', 'Drafted 3 retainer invoices for this month', 'Terra Foods, Nova Clinics, Sunrise Retail', '/admin/finance?tab=invoices', 'Rohan Mehta'),
  // Waiting for a person (DRAFT mode)
  run(9, 5, 'WAITING', 'Send reminder: invoice is 17 days overdue (₹82,600)', 'Nova Clinics · lead generation retainer', '/admin/finance/invoices/i2'),
  run(6, 8, 'WAITING', 'Remind Arjun Kapoor: "Homepage design" has waited 4 days for approval', 'Terra Foods · Website redesign', '/admin/projects/p2'),
  run(15, 30, 'WAITING', 'Send renewal offer: lead generation retainer ends in 20 days', 'Nova Clinics', '/admin/clients/org-nova'),
  run(12, 40, 'WAITING', 'Ask for a rating: "Kick-off and brief" completed', 'Sunrise Retail · Store launch: Pune', '/admin/projects/s1'),
  run(6, 24 * 4, 'DISCARDED', 'Remind Sameer Joshi about "Landing page hero banner"', 'Nova Clinics', '/admin/projects/p4', 'Kavya Iyer'),
  run(3, 24 * 6, 'SKIPPED', 'No service template matched "Lead generation renewal"', 'Nova Clinics'),
];

export const deputy = {
  deputyId: 'u-mgr' as string | undefined,
  from: day(-2) as string | undefined,
  to: day(12) as string | undefined,
};

/* ------------------------------------------------------- knowledge base */

export interface ArticleRow {
  id: string;
  title: string;
  category: ArticleCategory;
  summary: string;
  body: string;
  tags: string[];
  updatedAt: string;
  updatedBy: string;
  helpful: Set<string>;
}

export const articles: ArticleRow[] = [
  {
    id: 'kb1', title: 'How internal review works', category: 'PROCESS', updatedAt: ago(24 * 20), updatedBy: 'Kavya Iyer', helpful: new Set(['u-emp', 'u-meera']),
    summary: 'Client-facing work always passes a reviewer before the client sees it.',
    tags: ['review', 'approvals', 'quality'],
    body: `Every task marked "client-facing" goes to its reviewer before the client sees it.

1. Move the task to "In review" when you are done. Attach the final file.
2. The reviewer passes it (it goes to the client's approval queue) or sends it back with a note.
3. A send-back counts against first-pass quality, so check spelling, logo version and sizes first.

Tip: use the checklist on the task. Reviewers look at it first.`,
  },
  {
    id: 'kb2', title: 'Brand vault: always use the latest logo', category: 'BRAND', updatedAt: ago(24 * 4), updatedBy: 'Meera Pillai', helpful: new Set(['u-emp']),
    summary: 'Download logos and fonts from the client\'s brand vault, never from old chats.',
    tags: ['brand', 'files', 'logos'],
    body: `Clients update logos. Old files in chats or email cause rework.

- Open the client's Files & brand vault and download the current version.
- If the vault looks out of date, ask the account manager before designing.
- Never send internal working files to the client; only approved deliverables are client-visible.`,
  },
  {
    id: 'kb3', title: 'Logging time and submitting your week', category: 'TOOLS', updatedAt: ago(24 * 2), updatedBy: 'Kavya Iyer', helpful: new Set(),
    summary: 'Start the timer when you start a task; submit your timesheet every Saturday.',
    tags: ['timesheet', 'timer', 'utilisation'],
    body: `Your timesheet feeds project budgets and your utilisation.

1. Start the timer from Timesheet when you begin client work. Stop it when you switch.
2. Forgot? Add time manually (up to 30 days back).
3. Submit the week on Saturday. Submitted weeks are locked.

Time waiting for a client's approval does not count against you.`,
  },
  {
    id: 'kb4', title: 'Replying to clients: tone and response times', category: 'CLIENTS', updatedAt: ago(24 * 60), updatedBy: 'Rohan Mehta', helpful: new Set(['u-emp', 'u-rahul', 'u-vikram']),
    summary: 'Reply within 4 business hours; internal notes stay internal.',
    tags: ['messages', 'clients', 'response time'],
    body: `- First reply within 4 business hours (Settings → response times).
- Use "Internal note" for anything the client should not see. It is the default.
- Turn a request into a ticket so the clock and owner are clear.
- Never share passwords. Ask for partner or role access instead.`,
  },
  {
    id: 'kb5', title: 'Leave policy and how to apply', category: 'HR', updatedAt: ago(24 * 220), updatedBy: 'Isha Mehta', helpful: new Set(['u-aarav']),
    summary: '12 casual, 8 sick and 15 earned days a year. Apply in the portal.',
    tags: ['leave', 'attendance'],
    body: `- Casual 12, sick 8, earned 15 working days a year. Unpaid leave has no cap.
- Apply from Attendance & leave. Sick leave can be recorded up to 7 days late.
- Your manager sees tasks due while you are away and can hand them over.`,
  },
  {
    id: 'kb6', title: 'Paid posts: disclosure rules for creators', category: 'PROCESS', updatedAt: ago(24 * 9), updatedBy: 'Kavya Iyer', helpful: new Set(),
    summary: 'Every paid creator post needs #ad or the paid-partnership label (ASCI).',
    tags: ['influencers', 'ASCI', 'compliance'],
    body: `India's ASCI guidelines require a clear label on paid content.

- The portal refuses creator drafts without #ad, #paidpartnership or "paid partnership" in the caption.
- Check the label is in the first lines, not hidden after hashtags.
- Medical and financial claims need the client's approved script.`,
  },
];

/* ----------------------------------------------------- service catalogue */

export interface ServiceRow {
  id: string;
  name: string;
  service: string;
  description: string;
  price: number;
  billing: 'MONTHLY' | 'ONE_OFF';
  timelineWeeks: number;
  revisions: number;
  active: boolean;
  tasks: TemplateTask[];
  projectsCreated: number;
}

let tt = 0;
const t = (title: string, department: string, startDay: number, durationDays: number, priority: TemplateTask['priority'] = 'MEDIUM', clientFacing = false): TemplateTask => ({
  id: `tt${++tt}`,
  title,
  department,
  startDay,
  durationDays,
  priority,
  clientFacing,
});

export const services: ServiceRow[] = [
  {
    id: 'sv1', name: 'Social media management', service: 'Social media', price: 50_000, billing: 'MONTHLY', timelineWeeks: 4, revisions: 3, active: true, projectsCreated: 11,
    description: '16 posts, 8 reels and 20 stories a month, community replies in business hours, monthly report.',
    tasks: [
      t('Content calendar for the month', 'Social media', 0, 3, 'HIGH', true),
      t('Design week 1 posts', 'Design', 3, 3, 'MEDIUM', true),
      t('Edit reels (batch 1)', 'Design', 4, 4),
      t('Captions and hashtags', 'Content', 3, 2),
      t('Schedule and publish', 'Social media', 7, 20, 'LOW'),
      t('Monthly performance report', 'Social media', 25, 3, 'MEDIUM', true),
    ],
  },
  {
    id: 'sv2', name: 'Local SEO', service: 'SEO', price: 25_000, billing: 'MONTHLY', timelineWeeks: 4, revisions: 2, active: true, projectsCreated: 14,
    description: 'Google Business profiles, local citations, 4 blog posts a month, ranking report.',
    tasks: [
      t('Audit Google Business profiles', 'SEO', 0, 3, 'HIGH'),
      t('Keyword plan for the month', 'SEO', 2, 2, 'MEDIUM', true),
      t('Write 4 blog posts', 'Content', 5, 15),
      t('Build local citations', 'SEO', 5, 10, 'LOW'),
      t('Monthly ranking report', 'SEO', 25, 3, 'MEDIUM', true),
    ],
  },
  {
    id: 'sv3', name: 'Lead generation ads', service: 'Paid ads', price: 70_000, billing: 'MONTHLY', timelineWeeks: 4, revisions: 3, active: true, projectsCreated: 12,
    description: 'Meta and Google lead campaigns, landing page, weekly lead report. Ad budget paid separately.',
    tasks: [
      t('Campaign plan and audiences', 'Performance ads', 0, 3, 'HIGH', true),
      t('Ad creatives (8 statics, 2 videos)', 'Design', 2, 5, 'MEDIUM', true),
      t('Landing page copy', 'Content', 2, 3),
      t('Launch and tracking checks', 'Performance ads', 6, 2, 'HIGH'),
      t('Weekly lead report', 'Performance ads', 12, 2, 'MEDIUM', true),
    ],
  },
  {
    id: 'sv4', name: 'Brand identity', service: 'Branding', price: 95_000, billing: 'ONE_OFF', timelineWeeks: 6, revisions: 3, active: true, projectsCreated: 3,
    description: 'Discovery workshop, 3 logo concepts, final files, brand sheet.',
    tasks: [
      t('Discovery workshop and brief', 'Design', 0, 3, 'HIGH', true),
      t('Three logo concepts', 'Design', 4, 8, 'HIGH', true),
      t('Refine the chosen concept', 'Design', 13, 5, 'MEDIUM', true),
      t('Final files and brand sheet', 'Design', 19, 5, 'MEDIUM', true),
    ],
  },
  {
    id: 'sv5', name: 'Website redesign', service: 'Website', price: 240_000, billing: 'ONE_OFF', timelineWeeks: 10, revisions: 3, active: false, projectsCreated: 1,
    description: 'Up to 20 pages, mobile first, CMS handover. Being re-priced.',
    tasks: [t('Sitemap and wireframes', 'Design', 0, 7, 'HIGH', true), t('Homepage design', 'Design', 8, 7, 'HIGH', true), t('Page copy', 'Content', 8, 10)],
  },
];

/* ------------------------------------------------------- onboarding */

export interface OnboardingRow {
  organisationId: string;
  questionnaire: Questionnaire;
  access: AccessItem[];
  brandAssetsUploaded: boolean;
  kickoff?: { date: string; time: string; bookedBy: string };
  completedAt?: string;
}

export const ACCESS_TEMPLATE: Array<Pick<AccessItem, 'platform' | 'label' | 'how'>> = [
  { platform: 'META', label: 'Meta Business (Facebook and Instagram)', how: 'Business settings → Partners → add Webinger\'s Business ID with "Manage pages" and "Ads" access.' },
  { platform: 'GOOGLE_ADS', label: 'Google Ads', how: 'Admin → Access and security → Managers → link Webinger\'s manager account.' },
  { platform: 'ANALYTICS', label: 'Google Analytics', how: 'Admin → Property access management → add analytics@webinger.in as Editor.' },
  { platform: 'SEARCH_CONSOLE', label: 'Google Search Console', how: 'Settings → Users and permissions → add seo@webinger.in as Full user.' },
  { platform: 'WEBSITE', label: 'Website CMS', how: 'Create a separate editor login for Webinger in your CMS. Don\'t share your own.' },
];

const emptyQ: Questionnaire = { about: '', audience: '', competitors: '', goals: '', voice: '', avoid: '' };
const access = (statuses: Array<AccessItem['status']>, refs: Array<string | undefined> = []): AccessItem[] =>
  ACCESS_TEMPLATE.map((x, i) => ({ ...x, status: statuses[i] ?? 'NOT_STARTED', accountRef: refs[i], verifiedBy: statuses[i] === 'VERIFIED' ? 'Kavya Iyer' : undefined }));

export const onboarding: OnboardingRow[] = [
  {
    organisationId: ORG.TERRA,
    questionnaire: {
      about: 'Healthy, affordable meals made with millets and local produce. 6 outlets in Mumbai.',
      audience: 'Office workers 24–40 in Lower Parel and Bandra; health-conscious families on weekends.',
      competitors: 'Salad chains in BKC; cloud kitchens on delivery apps.',
      goals: 'More weekday lunch orders; 2 new outlets by March.',
      voice: 'Warm, simple, a little playful. Hindi words welcome.',
      avoid: 'Diet-culture language. Competitor names.',
    },
    access: access(['VERIFIED', 'NOT_NEEDED', 'VERIFIED', 'VERIFIED', 'VERIFIED'], ['BM 1029384756', undefined, 'GA4 381920', 'terrafoods.in', 'WordPress editor']),
    brandAssetsUploaded: true,
    kickoff: { date: day(-410), time: '11:00', bookedBy: 'Arjun Kapoor' },
    completedAt: ago(24 * 400),
  },
  {
    organisationId: ORG.NOVA,
    questionnaire: { ...emptyQ, about: 'Skin and hair clinics in Bengaluru (3 locations).', goals: 'Consultation bookings at a lower cost per lead.' },
    access: access(['VERIFIED', 'GRANTED', 'NOT_STARTED', 'NOT_STARTED', 'NOT_NEEDED'], ['BM 5566778899', 'Ads 123-456-7890']),
    brandAssetsUploaded: true,
  },
  {
    organisationId: ORG.SUNRISE,
    questionnaire: emptyQ,
    access: access(['GRANTED', 'NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED'], ['BM 9988776655']),
    brandAssetsUploaded: false,
    kickoff: { date: day(-108), time: '15:00', bookedBy: 'Farah Siddiqui' },
  },
];
export const emptyQuestionnaire = () => ({ ...emptyQ });
export const freshAccess = () => access([]);
