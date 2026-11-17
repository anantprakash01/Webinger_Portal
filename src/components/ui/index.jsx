import { forwardRef, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LuChevronLeft, LuChevronRight, LuCircleAlert, LuInbox, LuSearch, LuX } from 'react-icons/lu';

const cx = (...c) => c.filter(Boolean).join(' ');

/* ---------- Button ---------- */
export function Button({
  variant = 'primary',
  size = 'md',
  block,
  icon,
  loading,
  className,
  children,
  disabled,
  ...rest
}) {
  return (
    <button
      className={cx('btn', `btn--${variant}`, size === 'sm' && 'btn--sm', block && 'btn--block', icon && 'btn--icon', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? 'Please wait…' : children}
    </button>
  );
}

/* ---------- Card ---------- */
export function Card({
  title,
  action,
  children,
  className,
  flush,
}) {
  return (
    <section className={cx('card', className)}>
      {(title || action) && (
        <header className="card__head">
          {title && <h2 className="card__title">{title}</h2>}
          {action}
        </header>
      )}
      {flush ? children : <div className="card__body">{children}</div>}
    </section>
  );
}

/* ---------- Badge ---------- */
export function Badge({ tone = 'neutral', children }) {
  return <span className={cx('badge', `badge--${tone}`)}>{children}</span>;
}

/* ---------- Input ---------- */
export const Input = forwardRef(function Input({ label, error, id, ...rest }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errId = `${inputId}-err`;
  return (
    <div className="field">
      <label className="field__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        className="field__input"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        {...rest}
      />
      {error && (
        <span id={errId} className="field__error">
          <LuCircleAlert aria-hidden /> {error}
        </span>
      )}
    </div>
  );
});

/* ---------- Progress ---------- */
export function Progress({ value, label }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="progress" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="progress__bar" style={{ width: `${v}%` }} />
    </div>
  );
}

/* ---------- Avatar ---------- */
export function Avatar({ name, size = 36 }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>
      {initials}
    </span>
  );
}

/* ---------- Stat ---------- */
export function Stat({ label, value, hint, accent }) {
  return (
    <div className="card stat">
      <div className="stat__label">{label}</div>
      <div className={cx('stat__value', accent && 'stat__value--accent')}>{value}</div>
      {hint && <div className="stat__hint">{hint}</div>}
    </div>
  );
}

/* ---------- Page header ---------- */
export function PageHeader({ eyebrow, title, actions }) {
  return (
    <div className="page__head">
      <div>
        {eyebrow && <div className="page__eyebrow">{eyebrow}</div>}
        <h1 className="page__title">{title}</h1>
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

/* ---------- States ---------- */
export function EmptyState({ title, children }) {
  return (
    <div className="state">
      <LuInbox size={28} aria-hidden />
      <div className="state__title">{title}</div>
      {children && <div className="small">{children}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state" role="alert">
      <LuCircleAlert size={28} aria-hidden />
      <div className="state__title">Something went wrong</div>
      <div className="small">{message}</div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading">
      <div className="skeleton" style={{ height: 40, width: 280 }} />
      <div className="grid grid--stats">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 96 }} />
        ))}
      </div>
      <div className="grid grid--2">
        <div className="skeleton" style={{ height: 260 }} />
        <div className="skeleton" style={{ height: 260 }} />
      </div>
    </div>
  );
}

/* ---------- Select (compact filter) ---------- */
export function Select({ label, value, onChange, options, allLabel, hideLabel, className, ...rest }) {
  const id = useId();
  return (
    <div className={cx('select', className)}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'select__label'}>
        {label}
      </label>
      <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} {...rest}>
        {allLabel && <option value="">{allLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ---------- Search box ---------- */
export function SearchInput({ label = 'Search', value, onChange, placeholder }) {
  const id = useId();
  return (
    <div className="search">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <LuSearch aria-hidden className="search__icon" />
      <input id={id} type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/* ---------- Segmented control (view switch, toggle) ---------- */
export function Segmented({ label, value, onChange, options }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={cx('segmented__btn', value === o.value && 'is-on')}
          onClick={() => onChange(o.value)}
        >
          {o.icon} {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Pagination ---------- */
export function Pagination({ page, totalPages, totalItems, size, onPage }) {
  if (totalItems === 0) return null;
  const from = page * size + 1;
  const to = Math.min(totalItems, from + size - 1);
  return (
    <nav className="pager" aria-label="Pages">
      <span className="small muted">
        {from}–{to} of {totalItems}
      </span>
      <span className="spacer" />
      <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page">
        <LuChevronLeft aria-hidden /> Prev
      </Button>
      <span className="small">
        Page {page + 1} of {totalPages}
      </span>
      <Button variant="secondary" size="sm" disabled={page >= totalPages - 1} onClick={() => onPage(page + 1)} aria-label="Next page">
        Next <LuChevronRight aria-hidden />
      </Button>
    </nav>
  );
}

/* ---------- Drawer (side panel on desktop, full sheet on phones) ---------- */
export function Drawer({ open, onClose, title, children }) {
  const panel = useRef(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    panel.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (prev instanceof HTMLElement) prev.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={panel}>
        <header className="drawer__head">
          <h2 id={titleId} className="drawer__title">
            {title}
          </h2>
          <Button variant="ghost" icon onClick={onClose} aria-label="Close">
            <LuX size={20} />
          </Button>
        </header>
        <div className="drawer__body">{children}</div>
      </aside>
    </>,
    document.body,
  );
}

/* ---------- Formatting helpers ---------- */
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const formatINR = (n) => inr.format(n);
export const formatDate = (iso) =>
  new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export const daysFromToday = (iso) => {
  const d = new Date(iso + 'T00:00:00').getTime();
  const t = new Date(new Date().toDateString()).getTime();
  return Math.round((d - t) / 86_400_000);
};
export const dueLabel = (iso) => {
  const n = daysFromToday(iso);
  if (n < 0) return `${-n} day${n === -1 ? '' : 's'} overdue`;
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  return `Due ${formatDate(iso)}`;
};
export const formatDateLong = (iso) =>
  new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
export { cx };
