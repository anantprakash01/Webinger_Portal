import { LuArrowDownRight, LuArrowUpRight, LuMinus } from 'react-icons/lu';

const compact = (n) => (n >= 100_000 ? `${(n / 100_000).toFixed(2).replace(/\.?0+$/, '')} L` : Math.round(n).toLocaleString('en-IN'));

/** Same display rules as the API's dashboard numbers. */
export function formatMetric(unit, v) {
  if (v === undefined || v === null) return '—';
  if (unit === 'PERCENT') return `${v}%`;
  if (unit === 'INR') return `₹${compact(v)}`;
  if (unit === 'SECONDS') return `${v} s`;
  return compact(v);
}

/** Change vs last month. Good/bad follows the metric's direction (lower cost per lead is good). */
export function metricChange(m) {
  if (m.value === undefined || m.previous === undefined || m.previous === 0) return null;
  const diff = m.value - m.previous;
  const text =
    m.unit === 'PERCENT'
      ? `${diff >= 0 ? '+' : '−'}${Math.abs(Math.round(diff * 10) / 10)} pts`
      : `${diff >= 0 ? '+' : '−'}${Math.abs(Math.round((diff / m.previous) * 100))}%`;
  const flat = Math.abs(diff) / Math.max(Math.abs(m.previous), 1e-9) < 0.005;
  return { text, up: diff > 0, flat, good: flat ? null : m.lowerIsBetter ? diff < 0 : diff > 0 };
}

export function MetricTile({ metric }) {
  const c = metricChange(metric);
  return (
    <div className="metric">
      <div className="metric__label">{metric.label}</div>
      <div className="metric__value">{formatMetric(metric.unit, metric.value)}</div>
      {c ? (
        <div className={`metric__change${c.good === true ? ' is-good' : c.good === false ? ' is-bad' : ''}`}>
          {c.flat ? <LuMinus aria-hidden /> : c.up ? <LuArrowUpRight aria-hidden /> : <LuArrowDownRight aria-hidden />}
          <span>
            {c.text} <span className="sr-only">{c.good === true ? '(better)' : c.good === false ? '(worse)' : ''}</span>
          </span>
          <span className="metric__prev">vs {formatMetric(metric.unit, metric.previous)}</span>
        </div>
      ) : (
        <div className="metric__change metric__prev">No earlier month</div>
      )}
    </div>
  );
}
