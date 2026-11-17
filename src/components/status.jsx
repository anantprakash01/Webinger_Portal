import { Badge } from './ui';

const HEALTH = {
  GREEN: ['ok', 'On track'],
  AMBER: ['warn', 'Needs attention'],
  RED: ['danger', 'At risk'],
};
export const HealthBadge = ({ health }) => <Badge tone={HEALTH[health][0]}>{HEALTH[health][1]}</Badge>;

const TASK = {
  TODO: ['neutral', 'To do'],
  IN_PROGRESS: ['info', 'In progress'],
  IN_REVIEW: ['warn', 'In review'],
  CLIENT_APPROVAL: ['warn', 'With client'],
  DONE: ['ok', 'Done'],
};
export const TaskBadge = ({ status }) => <Badge tone={TASK[status][0]}>{TASK[status][1]}</Badge>;

const INVOICE = {
  DRAFT: ['neutral', 'Draft'],
  SENT: ['info', 'Due'],
  PAID: ['ok', 'Paid'],
  OVERDUE: ['danger', 'Overdue'],
  CANCELLED: ['neutral', 'Cancelled'],
};
export const InvoiceBadge = ({ status }) => (
  <Badge tone={INVOICE[status][0]}>{INVOICE[status][1]}</Badge>
);

export const timeAgo = (iso) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
};

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'CLIENT_APPROVAL', 'DONE'];
export const taskStatusLabel = (s) => TASK[s][1];

const PROJECT = {
  ACTIVE: ['info', 'Active'],
  ON_HOLD: ['neutral', 'On hold'],
  COMPLETED: ['ok', 'Completed'],
};
export const ProjectStatusBadge = ({ status }) => <Badge tone={PROJECT[status][0]}>{PROJECT[status][1]}</Badge>;
export const projectStatusLabel = (s) => PROJECT[s][1];

const DELIVERABLE = {
  PLANNED: ['neutral', 'Planned'],
  IN_PROGRESS: ['info', 'In progress'],
  IN_REVIEW: ['info', 'Quality check'],
  CLIENT_APPROVAL: ['warn', 'Awaiting your approval'],
  APPROVED: ['ok', 'Approved'],
};
/** For staff the CLIENT_APPROVAL label reads "With client" instead of "Awaiting your approval". */
export const DeliverableBadge = ({ status, staff }) => (
  <Badge tone={DELIVERABLE[status][0]}>{staff && status === 'CLIENT_APPROVAL' ? 'With client' : DELIVERABLE[status][1]}</Badge>
);

const PRIORITY = { HIGH: ['danger', 'High'], MEDIUM: ['neutral', 'Medium'], LOW: ['neutral', 'Low'] };
export const PriorityBadge = ({ priority }) => <Badge tone={PRIORITY[priority][0]}>{PRIORITY[priority][1]}</Badge>;

export const VisibilityBadge = ({ visibility }) =>
  visibility === 'CLIENT' ? <Badge tone="info">Client can see</Badge> : <Badge tone="neutral">Internal</Badge>;

export const HEALTH_OPTIONS = Object.entries(HEALTH).map(([value, [, label]]) => ({ value, label }));
export const PROJECT_STATUS_OPTIONS = Object.entries(PROJECT).map(([value, [, label]]) => ({ value, label }));
