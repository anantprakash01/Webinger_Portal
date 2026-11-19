import { LuCircleAlert } from 'react-icons/lu';
import { Badge, Card, cx } from './ui';
import { monthShort, percent } from './finance';

/* ---------- pipeline ---------- */

export const STAGE_LABEL = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  PROPOSAL: 'Proposal sent',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
};
export const STAGES = Object.keys(STAGE_LABEL);
export const OPEN_STAGES = ['NEW', 'CONTACTED', 'PROPOSAL', 'NEGOTIATION'];
export const SOURCE_LABEL = { WEBSITE: 'Website form', REFERRAL: 'Referral', OFFER: 'Offer click', EVENT: 'Event', OUTBOUND: 'Outbound' };
export const SOURCE_OPTIONS = Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label }));
export const LEAD_SERVICES = ['Social media', 'SEO', 'Paid ads', 'Website', 'Branding', 'Content', 'Influencer marketing', 'Digital PR'];
const STAGE_TONE = { NEW: 'neutral', CONTACTED: 'info', PROPOSAL: 'info', NEGOTIATION: 'warn', WON: 'ok', LOST: 'danger' };
export const StageBadge = ({ stage }) => <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>;
export const ACTIVITY_LABEL = { CALL: 'Call', EMAIL: 'Email', MEETING: 'Meeting', NOTE: 'Note', STAGE: 'Stage', SYSTEM: 'System' };

/* ---------- attendance and leave ---------- */

const ATT = {
  PRESENT: ['ok', 'In office'],
  WFH: ['info', 'Working from home'],
  LEAVE: ['warn', 'On leave'],
  ABSENT: ['danger', 'Absent'],
  HOLIDAY: ['neutral', 'Holiday'],
  OFF: ['neutral', 'Weekly off'],
  UPCOMING: ['neutral', 'Not in yet'],
};
export const AttendanceBadge = ({ day }) => <Badge tone={ATT[day.status][0]}>{day.status === 'HOLIDAY' && day.holiday ? day.holiday : ATT[day.status][1]}</Badge>;
/** One-letter cell for the week grid; full text in the title and for screen readers. */
const ATT_SHORT = { PRESENT: 'P', WFH: 'H', LEAVE: 'L', ABSENT: 'A', HOLIDAY: 'Hol', OFF: '–', UPCOMING: '' };
export function AttendanceCell({ day }) {
  const label = `${ATT[day.status][1]}${day.checkIn ? `, in ${day.checkIn}` : ''}${day.checkOut ? `, out ${day.checkOut}` : ''}`;
  return (
    <span className={`att-cell att-cell--${day.status.toLowerCase()}`} title={label}>
      <span aria-hidden>{ATT_SHORT[day.status]}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export const LEAVE_TYPE = { CASUAL: 'Casual', SICK: 'Sick', EARNED: 'Earned', UNPAID: 'Unpaid' };
export const LEAVE_TYPE_OPTIONS = Object.entries(LEAVE_TYPE).map(([value, label]) => ({ value, label }));
const LEAVE = { PENDING: ['warn', 'Waiting'], APPROVED: ['ok', 'Approved'], DECLINED: ['danger', 'Declined'], CANCELLED: ['neutral', 'Cancelled'] };
export const LeaveBadge = ({ status }) => <Badge tone={LEAVE[status][0]}>{LEAVE[status][1]}</Badge>;

/* ---------- workload ---------- */

/** "6 h 30 m" */
export const hm = (minutes) => {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  return h ? `${h} h${m % 60 ? ` ${m % 60} m` : ''}` : `${m % 60} m`;
};

/** Planned vs available hours: amber above 90%, red above 110%, muted under 50%. */
export function LoadBar({ load, label }) {
  const pct = Math.round(load * 100);
  const tone = load > 1.1 ? 'over' : load > 0.9 ? 'full' : load < 0.5 ? 'light' : 'ok';
  return (
    <div className="load" title={label}>
      <div className="load__track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cx('load__bar', `load__bar--${tone}`)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={cx('load__pct', tone === 'over' && 'text-danger')}>{pct}%</span>
    </div>
  );
}

/* ---------- scorecard ---------- */

function Measure({ label, value, detail, good }) {
  return (
    <div className="metric">
      <div className="metric__label">{label}</div>
      <div className="metric__value">{value}</div>
      <div className={cx('metric__change', good === true && 'is-good', good === false && 'is-bad')}>{detail}</div>
    </div>
  );
}

/** The four paired measures, their six-month trend and plain-language notes. */
export function ScorecardView({ card }) {
  const trend = card.trend;
  const cols = [
    ['onTimeRate', 'On time', (v) => percent(v)],
    ['firstPassQuality', 'First-pass quality', (v) => percent(v)],
    ['utilisation', 'Utilisation', (v) => percent(v)],
    ['clientRating', 'Client rating', (v) => (v === undefined || v === null ? '—' : v.toFixed(1))],
  ];
  return (
    <div className="grid scorecard" style={{ gap: 16 }}>
      <div className="metrics">
        <Measure
          label="On time"
          value={percent(card.onTimeRate)}
          detail={`${card.onTimeDone} of ${card.onTimeDue} tasks due in 30 days`}
          good={card.onTimeRate === undefined ? undefined : card.onTimeRate >= 0.85}
        />
        <Measure
          label="First-pass quality"
          value={percent(card.firstPassQuality)}
          detail={`${card.reviewed} reviewed; passed without send-back`}
          good={card.firstPassQuality === undefined ? undefined : card.firstPassQuality >= 0.8}
        />
        <Measure
          label="Utilisation"
          value={percent(card.utilisation)}
          detail={`${card.billableHours} billable of ${card.availableHours} available hours`}
          good={card.utilisation === undefined ? undefined : card.utilisation >= 0.6 && card.utilisation <= 0.9}
        />
        <Measure
          label="Client rating"
          value={card.clientRating !== undefined ? `${card.clientRating.toFixed(1)} / 5` : '—'}
          detail={card.responseMinutes !== undefined ? `First reply in ${card.responseMinutes} min (median)` : 'Clients they work with'}
          good={card.clientRating === undefined ? undefined : card.clientRating >= 4}
        />
      </div>

      {card.notes.length > 0 && (
        <ul className="grid score-notes" style={{ gap: 8 }}>
          {card.notes.map((n) => (
            <li key={n} className="note small">
              <LuCircleAlert aria-hidden />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}

      <Card title="Last six months" flush>
        <div className="card__body table-scroll">
          <table className="grid-table trend-table">
            <thead>
              <tr>
                <th>Measure</th>
                {trend.map((t) => (
                  <th key={t.month} className="num">
                    {monthShort(t.month)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cols.map(([key, label, fmt]) => (
                <tr key={key}>
                  <td data-label="Measure">{label}</td>
                  {trend.map((t, i) => (
                    <td key={t.month} data-label={monthShort(t.month)} className={cx('num', i === trend.length - 1 && 'trend-table__now')}>
                      {fmt(t[key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="list__meta">
        Read these together: being on time by skipping checks shows up in first-pass quality, and very high utilisation leaves no slack. Time a task waits for the client
        never counts against on-time. Earlier months are saved snapshots; this month is live.
      </p>
    </div>
  );
}
