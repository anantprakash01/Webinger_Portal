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

const ACCOUNT = {
  ACTIVE: ['ok', 'Active', 'Active'],
  INVITED: ['info', 'Invited', 'Invite sent'],
  PENDING_APPROVAL: ['warn', 'Needs approval', 'Waiting for Webinger'],
  SUSPENDED: ['neutral', 'Suspended', 'Access removed'],
};
/** `clientView` uses the client's wording, e.g. "Waiting for Webinger" instead of "Needs approval". */
export const AccountStatusBadge = ({ status, clientView }) => (
  <Badge tone={ACCOUNT[status][0]}>{ACCOUNT[status][clientView ? 2 : 1]}</Badge>
);
export const ACCOUNT_STATUS_OPTIONS = Object.entries(ACCOUNT).map(([value, [, label]]) => ({ value, label }));

const CLIENT_STATUS = {
  ONBOARDING: ['info', 'Onboarding'],
  ACTIVE: ['ok', 'Active'],
  PAUSED: ['warn', 'Paused'],
  ENDED: ['neutral', 'Ended'],
};
export const ClientStatusBadge = ({ status }) => <Badge tone={CLIENT_STATUS[status][0]}>{CLIENT_STATUS[status][1]}</Badge>;
export const CLIENT_STATUS_OPTIONS = Object.entries(CLIENT_STATUS).map(([value, [, label]]) => ({ value, label }));

const CONTRACT = {
  ACTIVE: ['ok', 'Running'],
  ENDING_SOON: ['warn', 'Renew soon'],
  ENDED: ['neutral', 'Ended'],
};
export const ContractStatusBadge = ({ status }) => <Badge tone={CONTRACT[status][0]}>{CONTRACT[status][1]}</Badge>;

/** Health level plus the 0–100 score, e.g. "At risk · 45". */
export const HealthScore = ({ health, score }) => (
  <span className="health-score">
    <HealthBadge health={health} />
    <span className={`health-score__num health-score__num--${health.toLowerCase()}`} title="Health score out of 100">
      {score}
    </span>
  </span>
);
