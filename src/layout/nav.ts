import type { IconType } from 'react-icons';
import {
  LuBadgeCheck,
  LuBriefcase,
  LuCalendarDays,
  LuChartColumn,
  LuCircleCheck,
  LuClipboardList,
  LuFileText,
  LuFolderOpen,
  LuLayoutDashboard,
  LuListChecks,
  LuMegaphone,
  LuMessageSquare,
  LuReceipt,
  LuSettings,
  LuSparkles,
  LuTrophy,
  LuUserRound,
  LuUsers,
  LuWallet,
  LuWorkflow,
} from 'react-icons/lu';
import type { Area, Permission, Role, User } from '@/types';

export interface NavItem {
  to: string;
  label: string;
  icon: IconType;
  /** Shown in the phone bottom bar. Keep four per area; the rest go in the "More" menu. */
  primary?: boolean;
  /** Restrict to some roles inside an area, e.g. finance for Super Admin only. */
  roles?: Role[];
  /** Or require a grant, e.g. billing for a client rep the owner allowed. */
  permission?: Permission;
  /** Week the real screen is planned, shown on placeholder pages. */
  week?: number;
}

export const NAV: Record<Area, NavItem[]> = {
  admin: [
    { to: '/admin', label: 'Overview', icon: LuLayoutDashboard, primary: true },
    { to: '/admin/projects', label: 'Projects', icon: LuBriefcase, primary: true, week: 2 },
    { to: '/admin/clients', label: 'Clients', icon: LuUsers, week: 2 },
    { to: '/admin/messages', label: 'Messages', icon: LuMessageSquare, primary: true, week: 4 },
    { to: '/admin/finance', label: 'Finance', icon: LuReceipt, roles: ['SUPER_ADMIN'], week: 5 },
    { to: '/admin/pipeline', label: 'Sales pipeline', icon: LuChartColumn, week: 6 },
    { to: '/admin/people', label: 'People', icon: LuUserRound, week: 6 },
    { to: '/admin/influencers', label: 'Influencers', icon: LuSparkles, week: 7 },
    { to: '/admin/automation', label: 'Automation', icon: LuWorkflow, roles: ['SUPER_ADMIN'], week: 8 },
    { to: '/admin/settings', label: 'Users & settings', icon: LuSettings, primary: true, roles: ['SUPER_ADMIN'], week: 3 },
  ],
  client: [
    { to: '/client', label: 'Dashboard', icon: LuLayoutDashboard, primary: true },
    { to: '/client/projects', label: 'Projects', icon: LuBriefcase, primary: true, week: 2 },
    { to: '/client/approvals', label: 'Approvals', icon: LuCircleCheck, primary: true, week: 3 },
    { to: '/client/messages', label: 'Messages', icon: LuMessageSquare, primary: true, week: 4 },
    { to: '/client/files', label: 'Files & brand vault', icon: LuFolderOpen, week: 4 },
    { to: '/client/reports', label: 'Reports', icon: LuChartColumn, week: 5 },
    { to: '/client/billing', label: 'Billing', icon: LuReceipt, permission: 'BILLING_VIEW', week: 5 },
    { to: '/client/influencers', label: 'Influencers', icon: LuSparkles, week: 7 },
    { to: '/client/team', label: 'My team', icon: LuUsers, roles: ['CLIENT_OWNER'], week: 3 },
  ],
  employee: [
    { to: '/employee', label: 'My day', icon: LuLayoutDashboard, primary: true },
    { to: '/employee/tasks', label: 'Tasks', icon: LuListChecks, primary: true, week: 2 },
    { to: '/employee/messages', label: 'Messages', icon: LuMessageSquare, primary: true, week: 4 },
    { to: '/employee/review', label: 'Review queue', icon: LuClipboardList, week: 3 },
    { to: '/employee/performance', label: 'My performance', icon: LuTrophy, primary: true, week: 6 },
    { to: '/employee/leave', label: 'Attendance & leave', icon: LuCalendarDays, week: 6 },
    { to: '/employee/knowledge', label: 'Knowledge base', icon: LuFileText, week: 8 },
  ],
  influencer: [
    { to: '/influencer', label: 'Home', icon: LuLayoutDashboard, primary: true },
    { to: '/influencer/campaigns', label: 'Campaigns', icon: LuMegaphone, primary: true, week: 7 },
    { to: '/influencer/profile', label: 'Profile', icon: LuBadgeCheck, primary: true, week: 7 },
    { to: '/influencer/payouts', label: 'Payouts', icon: LuWallet, primary: true, week: 7 },
  ],
  partner: [
    { to: '/partner', label: 'Home', icon: LuLayoutDashboard, primary: true },
    { to: '/partner/briefs', label: 'Briefs', icon: LuClipboardList, primary: true, week: 7 },
    { to: '/partner/invoices', label: 'Invoices', icon: LuReceipt, primary: true, week: 7 },
  ],
};

export const canSee = (user: User, i: NavItem) =>
  (!i.roles || i.roles.includes(user.role)) && (!i.permission || !!user.permissions?.includes(i.permission));
export const navFor = (area: Area, user: User) => NAV[area].filter((i) => canSee(user, i));

export const AREA_TITLE: Record<Area, string> = {
  admin: 'Admin',
  client: 'Client portal',
  employee: 'Team portal',
  influencer: 'Creator portal',
  partner: 'Partner portal',
};
