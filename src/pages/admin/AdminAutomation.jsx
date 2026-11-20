import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LuCircleAlert, LuEye, LuPause, LuPlay, LuShieldCheck } from 'react-icons/lu';
import { useAutomation, useAutomationAction, useRulePreview, useRuns } from '@/api/queries';
import { useAuth } from '@/auth/AuthContext';
import { Badge, Button, Card, Drawer, EmptyState, ErrorState, Input, PageHeader, PageSkeleton, Segmented, Select, Stat, cx, formatDate, formatINR } from '@/components/ui';
import { timeAgo } from '@/components/status';
import { FormError } from './finance/forms';

const TABS = [
  { value: 'rules', label: 'Rules' },
  { value: 'review', label: 'Waiting for review' },
  { value: 'log', label: 'Run log' },
  { value: 'deputy', label: 'Deputy mode' },
];
const MODE = { ON: ['ok', 'On'], DRAFT: ['warn', 'Draft for review'], OFF: ['neutral', 'Off'] };
const RUN = { DONE: ['ok', 'Done'], WAITING: ['warn', 'Waiting'], APPROVED: ['ok', 'Approved'], DISCARDED: ['neutral', 'Discarded'], SKIPPED: ['neutral', 'Skipped'], FAILED: ['danger', 'Failed'] };
const isoDay = (n = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The 18 rules (CLAUDE.md section 5). Super Admin changes them; managers can read and review drafts. */
export function AdminAutomation() {
  const { user } = useAuth();
  const isSuper = user?.role === 'SUPER_ADMIN';
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'rules';
  const ruleId = params.get('rule') ? Number(params.get('rule')) : null;
  const { data, error, isPending, refetch } = useAutomation();
  const action = useAutomationAction();
  if (isPending) return <PageSkeleton />;
  if (error) return <div className="page"><ErrorState message={error.message} onRetry={refetch} /></div>;
  const count = (m) => data.rules.filter((r) => r.mode === m).length;
  const rule = data.rules.find((r) => r.id === ruleId);

  return (
    <div className="page">
      <PageHeader
        eyebrow={isSuper ? 'Trigger → condition → action, with a person in the loop for money' : 'Read only: a Super Admin changes rules'}
        title="Automation"
        actions={
          isSuper &&
          (data.paused ? (
            <Button loading={action.isPending} onClick={() => action.mutate({ kind: 'pause', paused: false })}>
              <LuPlay aria-hidden /> Resume all
            </Button>
          ) : (
            <Button variant="secondary" loading={action.isPending} onClick={() => action.mutate({ kind: 'pause', paused: true })}>
              <LuPause aria-hidden /> Pause all
            </Button>
          ))
        }
      />
      {data.paused && (
        <div className="alert alert--warn" role="status">
          <LuCircleAlert aria-hidden style={{ flexShrink: 0, marginTop: 2 }} /> <span>All automation is paused{data.pausedBy ? ` by ${data.pausedBy}` : ''}. Nothing runs until it is resumed.</span>
        </div>
      )}
      <FormError error={action.error} />
      <div className="grid grid--stats">
        <Stat label="On" value={count('ON')} hint="Run by themselves" />
        <Stat label="Draft for review" value={count('DRAFT')} hint="A person approves each action" />
        <Stat label="Off" value={count('OFF')} hint="Kill switch per rule" />
        <Stat label="Waiting for a person" value={data.waiting} hint="Approve or discard" accent={data.waiting > 0} />
      </div>
      <Segmented label="Automation sections" value={tab} onChange={(v) => setParams(v === 'rules' ? {} : { tab: v })} options={TABS.map((t) => (t.value === 'review' && data.waiting ? { ...t, label: `${t.label} (${data.waiting})` } : t))} />

      {tab === 'rules' && (
        <>
          <Card flush>
            <div className="card__body">
              <table className="table table--rows">
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th>When</th>
                    <th>Last 30 days</th>
                    <th>Mode</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rules.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Rule" className="td--title">
                        <button type="button" className="row-link link-btn" onClick={() => setParams({ rule: String(r.id) })}>
                          {r.id}. {r.name}
                        </button>
                        <div className="list__meta">{r.actions.filter((a) => a.enabled).map((a) => a.label).join(' · ')}</div>
                      </td>
                      <td data-label="When">
                        {r.trigger}
                        {r.clientFacing && <div className="list__meta">Reaches clients or creators</div>}
                      </td>
                      <td data-label="Last 30 days">
                        {r.runsLast30} run{r.runsLast30 === 1 ? '' : 's'}
                        {r.waiting > 0 && <div className="list__meta text-warn">{r.waiting} waiting</div>}
                        {r.lastRunAt && <div className="list__meta">last {timeAgo(r.lastRunAt)}</div>}
                      </td>
                      <td data-label="Mode">
                        <Badge tone={MODE[r.mode][0]}>{MODE[r.mode][1]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Never automated">
            <p className="small">These always wait for a person, whatever a rule says:</p>
            <div className="badge-row">
              {data.neverAutomated.map((n) => (
                <Badge key={n} tone="danger">
                  {n}
                </Badge>
              ))}
            </div>
          </Card>
        </>
      )}
      {tab === 'review' && <RunsTab status="WAITING" isSuper={isSuper} />}
      {tab === 'log' && <RunsTab isSuper={isSuper} rules={data.rules} />}
      {tab === 'deputy' && <DeputyTab deputy={data.deputy} isSuper={isSuper} />}

      <Drawer open={!!rule} onClose={() => setParams(tab === 'rules' ? {} : { tab })} title={rule ? `Rule ${rule.id}: ${rule.name}` : ''}>
        {rule && <RuleEditor key={rule.id + rule.updatedAt} rule={rule} isSuper={isSuper} />}
      </Drawer>
    </div>
  );
}

function RuleEditor({ rule, isSuper }) {
  const action = useAutomationAction();
  const [values, setValues] = useState(Object.fromEntries(rule.params.map((p) => [p.key, Array.isArray(p.value) ? p.value.join(', ') : String(p.value)])));
  const [acts, setActs] = useState(Object.fromEntries(rule.actions.map((a) => [a.key, a.enabled])));
  const [previewing, setPreviewing] = useState(false);
  const preview = useRulePreview(previewing ? rule.id : null);
  const draftDays = rule.mode === 'DRAFT' && rule.draftSince ? Math.floor((Date.now() - Date.parse(rule.draftSince)) / 86_400_000) : 0;

  const save = () =>
    action.mutate({
      kind: 'rule',
      id: rule.id,
      patch: {
        params: Object.fromEntries(rule.params.map((p) => [p.key, p.unit === 'list' ? values[p.key].split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x)) : Number(values[p.key])])),
        actions: acts,
      },
    });

  return (
    <div className="grid" style={{ gap: 16 }}>
      <dl className="kv rule-kv">
        <dt>When</dt>
        <dd>{rule.trigger}</dd>
        <dt>Only if</dt>
        <dd>{rule.condition}</dd>
        <dt>Escalation</dt>
        <dd>{rule.escalation}</dd>
      </dl>
      {rule.humanStep && (
        <p className="note small">
          <LuShieldCheck aria-hidden />
          <span>{rule.humanStep}</span>
        </p>
      )}
      <FormError error={action.error} />

      <section className="grid" style={{ gap: 8 }}>
        <h3 className="section-title">Mode</h3>
        <Segmented
          label="Rule mode"
          value={rule.mode}
          onChange={(m) => isSuper && action.mutate({ kind: 'rule', id: rule.id, patch: { mode: m } })}
          options={[
            { value: 'ON', label: 'On' },
            { value: 'DRAFT', label: 'Draft for review' },
            { value: 'OFF', label: 'Off' },
          ]}
        />
        {rule.clientFacing && (
          <p className="small muted">
            Reaches clients or creators, so it runs 30 days in draft-for-review before it can be switched on
            {rule.mode === 'DRAFT' ? ` (${Math.min(draftDays, 30)} of 30 days done)` : ''}.
          </p>
        )}
      </section>

      {rule.params.length > 0 && (
        <section className="grid" style={{ gap: 8 }}>
          <h3 className="section-title">Settings</h3>
          {rule.params.map((p) => (
            <Input
              key={p.key}
              label={`${p.label} (${p.unit === 'list' ? 'comma separated days' : p.unit}, ${p.min}–${p.max})`}
              value={values[p.key]}
              disabled={!isSuper}
              inputMode={p.unit === 'list' ? 'text' : 'numeric'}
              onChange={(e) => setValues({ ...values, [p.key]: e.target.value })}
            />
          ))}
        </section>
      )}
      <section className="grid" style={{ gap: 6 }}>
        <h3 className="section-title">Actions</h3>
        {rule.actions.map((a) => (
          <label key={a.key} className="check">
            <input type="checkbox" checked={acts[a.key]} disabled={!isSuper} onChange={(e) => setActs({ ...acts, [a.key]: e.target.checked })} />
            <span className="small">
              {a.label}
              {a.external && <span className="muted"> · reaches outside Webinger</span>}
            </span>
          </label>
        ))}
      </section>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {isSuper && (
          <Button loading={action.isPending} onClick={save}>
            Save settings
          </Button>
        )}
        <Button variant="secondary" onClick={() => (setPreviewing(true), preview.refetch?.())}>
          <LuEye aria-hidden /> What would it do now?
        </Button>
      </div>
      {previewing && (
        <Card title="Preview (nothing is sent)">
          {preview.isPending ? (
            <div className="skeleton" style={{ height: 80 }} />
          ) : preview.error ? (
            <ErrorState message={preview.error.message} onRetry={preview.refetch} />
          ) : (
            <ul className="preview-list">
              {preview.data.items.map((x, i) => (
                <li key={i} className="small">
                  {x}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <p className="list__meta">
        Last changed by {rule.updatedBy}, {timeAgo(rule.updatedAt)}.
      </p>
    </div>
  );
}

function RunsTab({ status, isSuper, rules = [] }) {
  const [ruleId, setRuleId] = useState(undefined);
  const { data, error, isPending, refetch } = useRuns({ status, ruleId: ruleId ? Number(ruleId) : undefined });
  const action = useAutomationAction();
  if (isPending) return <div className="skeleton" style={{ height: 240 }} />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  return (
    <>
      {!status && (
        <div className="toolbar">
          <Select label="Rule" hideLabel value={ruleId} onChange={setRuleId} allLabel="All rules" options={rules.map((r) => ({ value: String(r.id), label: `${r.id}. ${r.name}` }))} />
        </div>
      )}
      <FormError error={action.error} />
      <Card>
        {data.length === 0 ? (
          <EmptyState title={status ? 'Nothing waiting' : 'No runs'}>{status ? 'Rules in draft-for-review put their actions here for a person to approve.' : null}</EmptyState>
        ) : (
          <ul className="list">
            {data.map((r) => (
              <li key={r.id} className={cx('list__item list__item--wrap', r.status === 'WAITING' && 'run--waiting')}>
                <div className="list__main">
                  <div className="list__title small">{r.summary}</div>
                  <div className="list__meta">
                    Rule {r.ruleId}: {r.ruleName} · {r.target} · {timeAgo(r.at)}
                    {r.decidedBy ? ` · ${r.status === 'APPROVED' ? 'approved' : 'decided'} by ${r.decidedBy}` : ''}
                    {r.link && (
                      <>
                        {' · '}
                        <Link to={r.link}>Open</Link>
                      </>
                    )}
                  </div>
                </div>
                <Badge tone={RUN[r.status][0]}>{RUN[r.status][1]}</Badge>
                {r.status === 'WAITING' && (
                  <div className="row">
                    <Button size="sm" disabled={r.ruleId === 9 && !isSuper} loading={action.isPending} onClick={() => action.mutate({ kind: 'decide', id: r.id, decision: 'APPROVE' })}>
                      Approve and send
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => action.mutate({ kind: 'decide', id: r.id, decision: 'DISCARD' })}>
                      Discard
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {status && <p className="list__meta">Invoice actions (rule 9) need a Super Admin. Approving runs the action straight away.</p>}
    </>
  );
}

function DeputyTab({ deputy, isSuper }) {
  const action = useAutomationAction();
  const [f, setF] = useState({
    deputyId: deputy.deputyId ?? '',
    from: deputy.from ?? isoDay(0),
    to: deputy.to ?? isoDay(14),
    payoutLimit: String(deputy.payoutLimit),
    discountPercent: String(deputy.discountPercent),
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="grid grid--2">
      <Card title="Deputy">
        {deputy.active ? (
          <p className="small">
            <Badge tone="ok">Active</Badge> {deputy.deputyName} approves for the owner from {formatDate(deputy.from)} to {formatDate(deputy.to)}.
          </p>
        ) : (
          <p className="small muted">No deputy is standing in right now.</p>
        )}
        <form
          className="grid"
          style={{ gap: 12, marginTop: 12 }}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            action.mutate({ kind: 'deputy', body: { deputyId: f.deputyId || undefined, from: f.from, to: f.to, payoutLimit: Number(f.payoutLimit), discountPercent: Number(f.discountPercent) } });
          }}
        >
          <FormError error={action.error} />
          <label className="field">
            <span className="field__label">Deputy (a Manager)</span>
            <select className="field__input" value={f.deputyId} disabled={!isSuper} onChange={set('deputyId')}>
              <option value="">Nobody</option>
              {deputy.candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid--pair">
            <Input label="From" type="date" value={f.from} disabled={!isSuper || !f.deputyId} onChange={set('from')} />
            <Input label="Until" type="date" value={f.to} disabled={!isSuper || !f.deputyId} onChange={set('to')} />
          </div>
          <div className="grid grid--pair">
            <Input label="Payout limit (₹)" inputMode="numeric" value={f.payoutLimit} disabled={!isSuper} onChange={set('payoutLimit')} />
            <Input label="Discount limit (%)" inputMode="numeric" value={f.discountPercent} disabled={!isSuper} onChange={set('discountPercent')} />
          </div>
          {isSuper && (
            <Button type="submit" loading={action.isPending}>
              Save deputy mode
            </Button>
          )}
        </form>
      </Card>
      <Card title="What a deputy can do">
        <ul className="preview-list small">
          <li>Approve creator payouts up to {formatINR(deputy.payoutLimit)} (above that: a Super Admin).</li>
          <li>Give discounts up to {deputy.discountPercent}%.</li>
          <li>Decide "pause work?" for late invoices (rule 10) and approve leave.</li>
          <li>Review drafts waiting in automation (not invoice actions).</li>
          <li>Never: refunds, contract changes, removing users or payouts above the limit.</li>
        </ul>
      </Card>
    </div>
  );
}
