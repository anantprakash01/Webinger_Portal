/**
 * Week 6 seed: sales leads, departments, holidays, attendance, leave, time entries and
 * monthly scorecard snapshots. Every name and company here is invented.
 * Dates are relative to today, so "this week" and "overdue follow-up" stay meaningful.
 */
import type { LeadActivity, LeadActivityKind, LeadSource, LeadStage, LeaveStatus, LeaveType, ScorePoint } from '@/types';
import { ago, day, ORG, projects, settings, tasks } from './data';

/* --------------------------------------------------------------- helpers */

export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** 0 = Sunday … 6 = Saturday. */
export const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
/** Monday of the week that contains `iso`. */
export const weekStartOf = (iso: string) => addDays(iso, -((weekday(iso) + 6) % 7));

/** Public holidays the office observes (fixed dates; Phase 1 keeps them in settings). */
export const HOLIDAYS: Array<{ date: string; name: string }> = [
  { date: '2026-10-02', name: 'Gandhi Jayanti' },
  { date: '2026-10-20', name: 'Dussehra' },
  { date: '2026-11-09', name: 'Diwali' },
  { date: '2026-12-25', name: 'Christmas' },
  { date: '2027-01-26', name: 'Republic Day' },
  { date: '2027-03-22', name: 'Holi' },
];
export const holidayOn = (iso: string) => HOLIDAYS.find((h) => h.date === iso);
/** Working day: an office day in Settings → business hours (Mon–Sat by default) and not a holiday. */
export const isWorkingDay = (iso: string) => settings.businessHours.days.includes(weekday(iso)) && !holidayOn(iso);
export const HOURS_PER_DAY = 8;

/* ----------------------------------------------------------- departments */

export const DEPARTMENT: Record<string, string> = {
  'u-admin': 'Leadership',
  'u-admin2': 'Leadership',
  'u-mgr': 'Operations',
  'u-emp': 'Social media',
  'u-rahul': 'SEO',
  'u-meera': 'Design',
  'u-vikram': 'Performance ads',
  'u-aarav': 'Content',
  'u-new': 'Design',
  'u-old': 'Design',
};
/** People whose work is planned and tracked (delivery staff). Founders are not on the workload view. */
export const DELIVERY = ['u-mgr', 'u-emp', 'u-rahul', 'u-meera', 'u-vikram', 'u-aarav'];

/* ------------------------------------------------------------------ leads */

export interface LeadRow {
  id: string;
  company: string;
  contactName: string;
  email: string;
  phone?: string;
  city?: string;
  source: LeadSource;
  services: string[];
  value: number;
  valueKind: 'MONTHLY' | 'ONE_OFF';
  stage: LeadStage;
  stageSince: string;
  ownerId?: string;
  nextFollowUp?: string;
  createdAt: string;
  notes?: string;
  lostReason?: string;
  clientId?: string;
  projectId?: string;
  activities: LeadActivity[];
}

let la = 0;
const act = (hoursAgo: number, actor: string, kind: LeadActivityKind, text: string): LeadActivity => ({ id: `la${++la}`, at: ago(hoursAgo), actor, kind, text });

export const leads: LeadRow[] = [
  {
    id: 'ld1', company: 'Saffron Table Restaurants', contactName: 'Kunal Bhatia', email: 'kunal@saffrontable.in', phone: '+91 98200 11223', city: 'Mumbai',
    source: 'WEBSITE', services: ['Social media'], value: 45_000, valueKind: 'MONTHLY', stage: 'NEW', stageSince: ago(20), createdAt: ago(20),
    notes: 'Website form: "3 outlets, want reels and Zomato listing help."',
    activities: [act(20, 'System', 'SYSTEM', 'Enquiry from the website contact form; acknowledgement sent')],
  },
  {
    id: 'ld2', company: 'Greenleaf Organics', contactName: 'Pooja Nair', email: 'pooja@greenleaf.in', city: 'Kochi',
    source: 'OFFER', services: ['Influencer marketing', 'Social media'], value: 60_000, valueKind: 'MONTHLY', stage: 'NEW', stageSince: ago(50), createdAt: ago(50),
    ownerId: 'u-admin', nextFollowUp: day(-1),
    activities: [act(50, 'System', 'SYSTEM', 'Clicked the "Add influencer marketing" offer'), act(48, 'System', 'SYSTEM', 'Assigned to Rohan Mehta (rotation)')],
  },
  {
    id: 'ld3', company: 'UrbanNest Interiors', contactName: 'Aditi Rao', email: 'aditi@urbannest.in', phone: '+91 99000 45612', city: 'Bengaluru',
    source: 'REFERRAL', services: ['Website', 'SEO'], value: 280_000, valueKind: 'ONE_OFF', stage: 'CONTACTED', stageSince: ago(24 * 4), createdAt: ago(24 * 6),
    ownerId: 'u-admin', nextFollowUp: day(1), notes: 'Referred by Sameer (Nova Clinics).',
    activities: [act(24 * 6, 'Rohan Mehta', 'NOTE', 'Referral from Nova Clinics'), act(24 * 4, 'Rohan Mehta', 'CALL', 'Discovery call: new site with project gallery, 40 pages, wants leads from Google.')],
  },
  {
    id: 'ld4', company: 'Peak Performance Gyms', contactName: 'Imran Shaikh', email: 'imran@peakgyms.in', city: 'Pune',
    source: 'EVENT', services: ['Paid ads'], value: 55_000, valueKind: 'MONTHLY', stage: 'CONTACTED', stageSince: ago(24 * 9), createdAt: ago(24 * 12),
    ownerId: 'u-mgr', nextFollowUp: day(-3),
    activities: [act(24 * 12, 'Kavya Iyer', 'MEETING', 'Met at the Pune franchise expo'), act(24 * 9, 'Kavya Iyer', 'EMAIL', 'Sent case study: Nova Clinics lead generation')],
  },
  {
    id: 'ld5', company: 'Coastal Kitchens', contactName: 'Maria Fernandes', email: 'maria@coastalkitchens.in', city: 'Mumbai',
    source: 'REFERRAL', services: ['Branding', 'Social media'], value: 210_000, valueKind: 'ONE_OFF', stage: 'PROPOSAL', stageSince: ago(24 * 5), createdAt: ago(24 * 15),
    ownerId: 'u-admin', nextFollowUp: day(2),
    activities: [act(24 * 15, 'Rohan Mehta', 'CALL', 'Intro call: rebrand before second outlet opens'), act(24 * 5, 'Rohan Mehta', 'STAGE', 'Moved to Proposal sent'), act(24 * 5, 'Rohan Mehta', 'EMAIL', 'Proposal sent: brand refresh + 3 months launch content')],
  },
  {
    id: 'ld6', company: 'Lumen Eye Care', contactName: 'Dr. Neel Kapoor', email: 'neel@lumeneye.in', phone: '+91 98450 77881', city: 'Bengaluru',
    source: 'WEBSITE', services: ['SEO', 'Paid ads'], value: 85_000, valueKind: 'MONTHLY', stage: 'PROPOSAL', stageSince: ago(24 * 11), createdAt: ago(24 * 20),
    ownerId: 'u-mgr', nextFollowUp: day(0),
    activities: [act(24 * 20, 'System', 'SYSTEM', 'Website enquiry'), act(24 * 18, 'Kavya Iyer', 'MEETING', 'Clinic visit, 4 locations'), act(24 * 11, 'Kavya Iyer', 'STAGE', 'Moved to Proposal sent')],
  },
  {
    id: 'ld7', company: 'Brewhouse Coffee Co.', contactName: 'Tara Singh', email: 'tara@brewhouse.in', city: 'Delhi',
    source: 'OUTBOUND', services: ['Social media', 'Influencer marketing'], value: 70_000, valueKind: 'MONTHLY', stage: 'NEGOTIATION', stageSince: ago(24 * 3), createdAt: ago(24 * 30),
    ownerId: 'u-admin', nextFollowUp: day(1), notes: 'Wants 10% off for a 12-month term.',
    activities: [act(24 * 30, 'Rohan Mehta', 'EMAIL', 'Cold email after their Diwali campaign'), act(24 * 21, 'Rohan Mehta', 'MEETING', 'Pitch meeting'), act(24 * 3, 'Rohan Mehta', 'STAGE', 'Moved to Negotiation'), act(24 * 3, 'Rohan Mehta', 'CALL', 'Asked for 10% off on a 12-month term. Discounts need the owner.')],
  },
  {
    id: 'ld8', company: 'Horizon Realty', contactName: 'Vivek Menon', email: 'vivek@horizonrealty.in', city: 'Hyderabad',
    source: 'EVENT', services: ['Paid ads', 'Website'], value: 120_000, valueKind: 'MONTHLY', stage: 'NEGOTIATION', stageSince: ago(24 * 6), createdAt: ago(24 * 25),
    ownerId: 'u-mgr', nextFollowUp: day(3),
    activities: [act(24 * 25, 'Kavya Iyer', 'MEETING', 'Met at property expo'), act(24 * 6, 'Kavya Iyer', 'STAGE', 'Moved to Negotiation')],
  },
  {
    id: 'ld9', company: 'Sunrise Retail Group', contactName: 'Farah Siddiqui', email: 'farah@sunriseretail.in', city: 'Pune',
    source: 'REFERRAL', services: ['Social media', 'SEO', 'Paid ads', 'Branding'], value: 240_000, valueKind: 'MONTHLY', stage: 'WON', stageSince: ago(24 * 112), createdAt: ago(24 * 140),
    ownerId: 'u-admin2', clientId: ORG.SUNRISE,
    activities: [act(24 * 140, 'Isha Mehta', 'NOTE', 'Referral from Terra Foods'), act(24 * 112, 'Isha Mehta', 'STAGE', 'Won: client and 40 store projects created')],
  },
  {
    id: 'ld10', company: 'FitFuel Snacks', contactName: 'Rhea Jain', email: 'rhea@fitfuel.in', city: 'Ahmedabad',
    source: 'WEBSITE', services: ['Social media'], value: 35_000, valueKind: 'MONTHLY', stage: 'LOST', stageSince: ago(24 * 18), createdAt: ago(24 * 40),
    ownerId: 'u-admin', lostReason: 'Price: chose a freelancer',
    activities: [act(24 * 40, 'System', 'SYSTEM', 'Website enquiry'), act(24 * 18, 'Rohan Mehta', 'STAGE', 'Lost: chose a freelancer on price')],
  },
  {
    id: 'ld11', company: 'Velvet Salon', contactName: 'Sana Qureshi', email: 'sana@velvetsalon.in', city: 'Mumbai',
    source: 'OFFER', services: ['Social media'], value: 30_000, valueKind: 'MONTHLY', stage: 'LOST', stageSince: ago(24 * 70), createdAt: ago(24 * 90),
    ownerId: 'u-mgr', lostReason: 'No reply after three follow-ups',
    activities: [act(24 * 70, 'Kavya Iyer', 'STAGE', 'Lost: no reply after day 1, 3 and 7 follow-ups')],
  },
  {
    id: 'ld12', company: 'Terra Foods', contactName: 'Arjun Kapoor', email: 'arjun@terrafoods.in', city: 'Mumbai',
    source: 'OUTBOUND', services: ['Branding'], value: 180_000, valueKind: 'ONE_OFF', stage: 'WON', stageSince: ago(24 * 420), createdAt: ago(24 * 450),
    ownerId: 'u-admin', clientId: ORG.TERRA,
    activities: [act(24 * 420, 'Rohan Mehta', 'STAGE', 'Won: Terra brand refresh')],
  },
];

/* ------------------------------------------------------------- leave */

export interface LeaveRow {
  id: string;
  userId: string;
  type: LeaveType;
  from: string;
  to: string;
  reason: string;
  status: LeaveStatus;
  createdAt: string;
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
}

/** Next Monday from today (Rahul's request matches the Week 1 dashboard line). */
const nextMonday = addDays(weekStartOf(day(0)), 7);

export const leaves: LeaveRow[] = [
  { id: 'lv1', userId: 'u-rahul', type: 'CASUAL', from: nextMonday, to: addDays(nextMonday, 1), reason: 'Family function in Kochi', status: 'PENDING', createdAt: ago(26) },
  { id: 'lv2', userId: 'u-meera', type: 'SICK', from: day(-12), to: day(-11), reason: 'Viral fever', status: 'APPROVED', createdAt: ago(24 * 12), decidedBy: 'Kavya Iyer', decidedAt: ago(24 * 12 - 3) },
  { id: 'lv3', userId: 'u-vikram', type: 'EARNED', from: addDays(nextMonday, 7), to: addDays(nextMonday, 9), reason: 'Trip home', status: 'APPROVED', createdAt: ago(24 * 9), decidedBy: 'Kavya Iyer', decidedAt: ago(24 * 8) },
  { id: 'lv4', userId: 'u-aarav', type: 'CASUAL', from: day(-20), to: day(-20), reason: 'Personal work', status: 'DECLINED', createdAt: ago(24 * 23), decidedBy: 'Kavya Iyer', decidedAt: ago(24 * 22), note: 'Blog deadline that day; please pick another date.' },
  { id: 'lv5', userId: 'u-emp', type: 'EARNED', from: day(-40), to: day(-38), reason: 'Wedding in the family', status: 'APPROVED', createdAt: ago(24 * 55), decidedBy: 'Kavya Iyer', decidedAt: ago(24 * 54) },
  { id: 'lv6', userId: 'u-aarav', type: 'SICK', from: addDays(day(0), 2), to: addDays(day(0), 2), reason: 'Dental surgery', status: 'PENDING', createdAt: ago(5) },
];

// Demo: Rahul's ranking report falls due during his requested leave, so the approver sees a handover (rule 13).
{
  const t16 = tasks.find((t) => t.id === 't16');
  if (t16) t16.due = addDays(nextMonday, 1);
}

/** Yearly allowance by type (calendar year). UNPAID has no cap. */
export const LEAVE_ALLOWANCE: Record<Exclude<LeaveType, 'UNPAID'>, number> = { CASUAL: 12, SICK: 8, EARNED: 15 };

/* ------------------------------------------------------------- attendance */

export interface AttendanceRow {
  userId: string;
  date: string;
  mode: 'OFFICE' | 'WFH';
  checkIn: string;
  checkOut?: string;
}

const time = (h: number, m: number) => {
  const t = h * 60 + m;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const onApprovedLeave = (userId: string, iso: string) =>
  leaves.some((l) => l.userId === userId && l.status === 'APPROVED' && l.from <= iso && l.to >= iso);

export const attendance: AttendanceRow[] = [];
DELIVERY.forEach((userId, u) => {
  for (let back = 45; back >= 1; back--) {
    const date = day(-back);
    if (!isWorkingDay(date) || onApprovedLeave(userId, date)) continue;
    // Aarav missed one day without leave; shows as Absent.
    if (userId === 'u-aarav' && back === 6) continue;
    const mode = weekday(date) === 5 && u % 2 === 0 ? 'WFH' : 'OFFICE';
    attendance.push({ userId, date, mode, checkIn: time(9, 45 + ((back * 7 + u * 11) % 40)), checkOut: time(18, 20 + ((back * 3 + u) % 35)) });
  }
});
// Today: some people are in, Priya has not checked in yet (the demo login), Vikram works from home.
if (isWorkingDay(day(0))) {
  attendance.push({ userId: 'u-mgr', date: day(0), mode: 'OFFICE', checkIn: '09:52' });
  attendance.push({ userId: 'u-rahul', date: day(0), mode: 'OFFICE', checkIn: '10:04' });
  attendance.push({ userId: 'u-meera', date: day(0), mode: 'OFFICE', checkIn: '10:11' });
  attendance.push({ userId: 'u-vikram', date: day(0), mode: 'WFH', checkIn: '09:40' });
}

/* ------------------------------------------------------------ time entries */

export interface TimeRow {
  id: string;
  userId: string;
  date: string;
  projectId: string;
  taskId?: string;
  minutes: number;
  note?: string;
  billable: boolean;
  startedAt?: string;
}

/** Projects a person works on: member, owner, or has tasks there. Active ones only. */
export function projectsOf(userId: string) {
  return projects.filter(
    (p) => p.status === 'ACTIVE' && (p.memberIds.includes(userId) || p.ownerId === userId || tasks.some((t) => t.projectId === p.id && t.assigneeId === userId)),
  );
}

export const timeEntries: TimeRow[] = [];
{
  let n = 0;
  DELIVERY.forEach((userId, u) => {
    const mine = projectsOf(userId).slice(0, 4);
    if (!mine.length) return;
    for (let back = 27; back >= 1; back--) {
      const date = day(-back);
      if (!isWorkingDay(date) || onApprovedLeave(userId, date)) continue;
      if (userId === 'u-aarav' && back === 6) continue;
      const a = mine[(back + u) % mine.length];
      const b = mine[(back + u + 1) % mine.length];
      const tA = tasks.find((t) => t.projectId === a.id && t.assigneeId === userId);
      // Billable 5–7 h a day; the rest (meetings, admin) is not logged against client work.
      const first = 180 + ((back * 13 + u * 7) % 7) * 15;
      const second = 120 + ((back * 5 + u * 3) % 5) * 15;
      timeEntries.push({ id: `te${++n}`, userId, date, projectId: a.id, taskId: tA?.id, minutes: first, billable: true, note: tA ? undefined : 'Project work' });
      if (b.id !== a.id) timeEntries.push({ id: `te${++n}`, userId, date, projectId: b.id, minutes: second, billable: true, note: 'Project work' });
    }
  });
}

/** `${userId}:${weekStart}`: weeks a person has submitted. Last week is in for everyone but Aarav. */
export const submittedWeeks = new Set<string>(
  DELIVERY.filter((u) => u !== 'u-aarav').map((u) => `${u}:${addDays(weekStartOf(day(0)), -7)}`),
);

/* ---------------------------------------------------------- scorecard history */

const monthsBack = (n: number) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 7);
};
const snap = (base: [number, number, number, number], drift: [number, number, number, number]): ScorePoint[] =>
  [5, 4, 3, 2, 1].map((back) => ({
    month: monthsBack(back),
    onTimeRate: Math.min(1, Math.round((base[0] - drift[0] * back) * 100) / 100),
    utilisation: Math.min(1, Math.round((base[1] - drift[1] * back) * 100) / 100),
    firstPassQuality: Math.min(1, Math.round((base[2] - drift[2] * back) * 100) / 100),
    clientRating: Math.round((base[3] - drift[3] * back) * 10) / 10,
  }));

/** Saved at each month end (CLAUDE.md section 6: "save monthly snapshots"). */
export const scoreSnapshots: Record<string, ScorePoint[]> = {
  'u-emp': snap([0.93, 0.78, 0.8, 4.6], [0.01, 0.01, 0.02, 0.02]),
  'u-rahul': snap([0.88, 0.74, 0.9, 4.2], [-0.01, 0.0, 0.01, 0.0]),
  'u-meera': snap([0.82, 0.86, 0.7, 3.9], [0.0, -0.02, 0.0, 0.05]),
  'u-vikram': snap([0.9, 0.62, 0.85, 3.6], [0.01, 0.01, 0.0, 0.0]),
  'u-aarav': snap([0.76, 0.58, 0.78, 4.4], [-0.02, -0.01, 0.01, 0.0]),
  'u-mgr': snap([0.91, 0.55, 0.95, 4.3], [0.0, 0.0, 0.0, 0.0]),
};

/** Median minutes to first reply in client channels, last 30 days (Phase 1: computed from chat). */
export const responseMinutes: Record<string, number> = {
  'u-emp': 38,
  'u-rahul': 95,
  'u-meera': 64,
  'u-vikram': 140,
  'u-aarav': 52,
  'u-mgr': 22,
};
