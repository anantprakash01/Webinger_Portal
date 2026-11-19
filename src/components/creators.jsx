import { Badge } from './ui';

export const NICHES = ['Food', 'Lifestyle', 'Fitness', 'Health', 'Beauty', 'Skin care', 'Tech', 'Travel', 'Home', 'Fashion', 'Parenting', 'Finance', 'Education'];
export const PLATFORM_LABEL = { INSTAGRAM: 'Instagram', YOUTUBE: 'YouTube', LINKEDIN: 'LinkedIn', X: 'X' };
export const PLATFORM_OPTIONS = Object.entries(PLATFORM_LABEL).map(([value, label]) => ({ value, label }));
export const TIER_LABEL = { NANO: 'Nano (<10k)', MICRO: 'Micro (10k–100k)', MID: 'Mid (100k–500k)', MACRO: 'Macro (500k–1M)', MEGA: 'Mega (1M+)' };
export const TIER_OPTIONS = Object.entries(TIER_LABEL).map(([value, label]) => ({ value, label }));

/** 84000 → "84k", 1250000 → "12.5 L" (Indian lakh). */
export const followersShort = (n) => (n >= 100_000 ? `${(n / 100_000).toFixed(1).replace(/\.0$/, '')} L` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

const VER = { DRAFT: ['neutral', 'Draft'], PENDING: ['warn', 'Under review'], VERIFIED: ['ok', 'Verified'], REJECTED: ['danger', 'Needs changes'] };
export const VerificationBadge = ({ status }) => <Badge tone={VER[status][0]}>{VER[status][1]}</Badge>;

const COLLAB = {
  INVITED: ['info', 'Invited'],
  COUNTERED: ['warn', 'Counter offer'],
  ACCEPTED: ['info', 'Accepted: draft due'],
  DECLINED: ['neutral', 'Declined'],
  DRAFT_SUBMITTED: ['warn', 'Draft in review'],
  CHANGES_REQUESTED: ['danger', 'Changes requested'],
  DRAFT_APPROVED: ['ok', 'Approved to post'],
  LIVE: ['ok', 'Live'],
  PAID: ['ok', 'Paid'],
};
export const CollabBadge = ({ status }) => <Badge tone={COLLAB[status][0]}>{COLLAB[status][1]}</Badge>;

const PAYOUT = { REQUESTED: ['warn', 'Requested'], APPROVED: ['info', 'Approved'], PAID: ['ok', 'Paid'], REJECTED: ['danger', 'On hold'] };
export const PayoutBadge = ({ status }) => <Badge tone={PAYOUT[status][0]}>{PAYOUT[status][1]}</Badge>;

const BRIEF = { NEW: ['info', 'New'], IN_PROGRESS: ['neutral', 'In progress'], SUBMITTED: ['warn', 'Submitted'], CHANGES_REQUESTED: ['danger', 'Changes requested'], APPROVED: ['ok', 'Approved'] };
export const BriefBadge = ({ status }) => <Badge tone={BRIEF[status][0]}>{BRIEF[status][1]}</Badge>;

const PINV = { SUBMITTED: ['warn', 'Submitted'], APPROVED: ['info', 'Approved'], PAID: ['ok', 'Paid'], REJECTED: ['danger', 'Rejected'] };
export const PartnerInvoiceBadge = ({ status }) => <Badge tone={PINV[status][0]}>{PINV[status][1]}</Badge>;

const PITCH = { DRAFT: ['neutral', 'Draft'], SENT: ['info', 'Sent'], FOLLOW_UP: ['warn', 'Follow up'], COVERED: ['ok', 'Covered'], DECLINED: ['neutral', 'Declined'] };
export const PitchBadge = ({ status }) => <Badge tone={PITCH[status][0]}>{PITCH[status][1]}</Badge>;
export const PITCH_STATUS_OPTIONS = Object.entries(PITCH).map(([value, [, label]]) => ({ value, label }));

/** File picker that only records the name (prototype: nothing is uploaded). */
export function FilePick({ label, accept, value, onChange, multiple }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input
        type="file"
        className="field__input"
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          const names = [...(e.target.files ?? [])].map((f) => f.name);
          onChange(multiple ? names : names[0] ?? '');
        }}
      />
      {value && (Array.isArray(value) ? value.length > 0 : true) && <span className="small muted">{Array.isArray(value) ? value.join(', ') : value}</span>}
    </label>
  );
}
