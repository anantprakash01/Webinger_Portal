import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LuCircleCheck, LuSend } from 'react-icons/lu';
import { useAdminReport, useReportAction, useReportStatuses } from '@/api/queries';
import { Badge, Button, Card, Drawer, EmptyState, ErrorState, PageHeader, PageSkeleton, Progress, Select } from '@/components/ui';
import { timeAgo } from '@/components/status';
import { monthLabel } from '@/components/finance';
import { formatMetric } from '@/components/reports';
import { FormError } from './finance/forms';

const STATUS = { NOT_STARTED: ['neutral', 'Not started'], DRAFT: ['warn', 'Draft'], PUBLISHED: ['ok', 'Published'] };
const lastMonths = (n) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
const UNIT_HINT = { PERCENT: '%', INR: '₹', SECONDS: 'seconds', NUMBER: '' };

/** Monthly client results: staff enter numbers, a manager publishes (automation rule 11). */
export function AdminReports() {
  const [params, setParams] = useSearchParams();
  const months = lastMonths(6);
  const month = params.get('month') ?? months[0];
  const clientId = params.get('client');
  const { data, error, isPending, isFetching, refetch } = useReportStatuses(month);
  const set = (k, v) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v) next.set(k, v);
      else next.delete(k);
      return next;
    });

  if (isPending) return <PageSkeleton />;
  if (error) return <div className="page"><ErrorState message={error.message} onRetry={refetch} /></div>;
  const published = data.filter((r) => r.status === 'PUBLISHED').length;
  const editing = data.find((r) => r.clientId === clientId);

  return (
    <div className="page">
      <PageHeader eyebrow={`${published} of ${data.length} published`} title="Client reports" />
      <div className="toolbar">
        <Select label="Month" hideLabel value={month} onChange={(v) => set('month', v === months[0] ? undefined : v)} options={months.map((m) => ({ value: m, label: monthLabel(m) }))} />
      </div>
      <Card flush>
        <div className="card__body" style={{ opacity: isFetching ? 0.6 : 1 }}>
          {data.length === 0 ? (
            <EmptyState title="No live clients" />
          ) : (
            <table className="table table--rows">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Services</th>
                  <th>Numbers entered</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.clientId}>
                    <td data-label="Client" className="td--title">
                      {r.clientName}
                      {r.updatedAt && <div className="list__meta">Updated {timeAgo(r.updatedAt)}</div>}
                    </td>
                    <td data-label="Services">
                      <div className="badge-row">{r.services.length ? r.services.map((s) => <Badge key={s}>{s}</Badge>) : <span className="muted">No monthly services</span>}</div>
                    </td>
                    <td data-label="Numbers entered">
                      <div className="row bar-row">
                        <Progress value={r.total ? (r.filled / r.total) * 100 : 0} label="Numbers entered" />
                        <span className="small">
                          {r.filled}/{r.total}
                        </span>
                      </div>
                    </td>
                    <td data-label="Status">
                      <Badge tone={STATUS[r.status][0]}>{STATUS[r.status][1]}</Badge>
                    </td>
                    <td data-label="">
                      <Button size="sm" variant={r.status === 'PUBLISHED' ? 'ghost' : 'secondary'} disabled={!r.services.length} onClick={() => set('client', r.clientId)}>
                        {r.status === 'PUBLISHED' ? 'View or correct' : r.status === 'DRAFT' ? 'Continue' : 'Start'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
      <p className="list__meta">
        Clients see a month only after it is published, and reps only the services they work on. Every number is needed before publishing; Phase 4 pulls them from Google and
        Meta.
      </p>

      <Drawer open={!!editing} onClose={() => set('client', undefined)} title={editing ? `${editing.clientName} · ${monthLabel(month)}` : ''}>
        {editing && <ReportEditor key={`${clientId}-${month}`} clientId={clientId} month={month} />}
      </Drawer>
    </div>
  );
}

function ReportEditor({ clientId, month }) {
  const { data: r, error, isPending, refetch } = useAdminReport(clientId, month);
  const action = useReportAction();
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    if (r && !form)
      setForm({
        summary: r.summary,
        sections: r.sections.map((s) => ({
          service: s.service,
          highlight: s.highlight ?? '',
          values: Object.fromEntries(s.metrics.map((m) => [m.key, m.value ?? ''])),
        })),
      });
  }, [r, form]);

  if (isPending || (r && !form)) return <div className="skeleton" style={{ height: 420 }} />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  const body = () => ({
    summary: form.summary,
    sections: form.sections.map((s) => ({
      service: s.service,
      highlight: s.highlight,
      values: Object.fromEntries(Object.entries(s.values).map(([k, v]) => [k, v === '' ? null : Number(v)])),
    })),
  });
  const setValue = (si, key, v) =>
    setForm({ ...form, sections: form.sections.map((s, i) => (i === si ? { ...s, values: { ...s.values, [key]: v } } : s)) });
  const setHighlight = (si, v) => setForm({ ...form, sections: form.sections.map((s, i) => (i === si ? { ...s, highlight: v } : s)) });

  const save = (then) =>
    action.mutate({ kind: 'save', clientId, month, body: body() }, { onSuccess: () => (then ? then() : setSaved('Saved')) });
  const publish = () => save(() => action.mutate({ kind: 'publish', clientId, month }, { onSuccess: () => setSaved('Published. The client has been emailed.') }));

  return (
    <form
      className="grid"
      style={{ gap: 16 }}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Badge tone={STATUS[r.status][0]}>{STATUS[r.status][1]}</Badge>
        {r.updatedBy && <span className="small muted">Last saved by {r.updatedBy}</span>}
      </div>
      <FormError error={action.error} />
      {saved && !action.error && (
        <div className="alert alert--ok" role="status">
          <LuCircleCheck aria-hidden style={{ flexShrink: 0, marginTop: 2 }} /> <span>{saved}</span>
        </div>
      )}
      <label className="field">
        <span className="field__label">Summary for the client</span>
        <textarea className="field__input" rows={3} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="Two sentences: what went well, what changes next month." />
      </label>
      {form.sections.map((s, si) => (
        <fieldset key={s.service} className="report-fields">
          <legend className="section-title">{s.service}</legend>
          <div className="grid grid--pair">
            {r.sections[si].metrics.map((m) => (
              <label key={m.key} className="field">
                <span className="field__label">
                  {m.label}
                  {UNIT_HINT[m.unit] ? ` (${UNIT_HINT[m.unit]})` : ''}
                </span>
                <input
                  className="field__input"
                  inputMode="decimal"
                  value={s.values[m.key]}
                  aria-invalid={s.values[m.key] === '' ? true : undefined}
                  onChange={(e) => setValue(si, m.key, e.target.value.replace(/[^\d.]/g, ''))}
                />
                <span className="small muted">Last month: {formatMetric(m.unit, m.previous)}</span>
              </label>
            ))}
          </div>
          <label className="field">
            <span className="field__label">Highlight (optional, one sentence)</span>
            <input className="field__input" value={s.highlight} onChange={(e) => setHighlight(si, e.target.value)} />
          </label>
        </fieldset>
      ))}
      <div className="row save-bar" style={{ flexWrap: 'wrap' }}>
        <Button type="submit" variant="secondary" loading={action.isPending}>
          {r.status === 'PUBLISHED' ? 'Save correction' : 'Save draft'}
        </Button>
        {r.status !== 'PUBLISHED' && (
          <Button type="button" loading={action.isPending} onClick={publish}>
            <LuSend aria-hidden /> Publish to client
          </Button>
        )}
      </div>
    </form>
  );
}
