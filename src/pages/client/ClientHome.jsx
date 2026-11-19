import { Link } from 'react-router-dom';
import { LuArrowRight, LuClock, LuMail, LuPhone, LuSparkles, LuX } from 'react-icons/lu';
import { useState } from 'react';
import { useDashboard, useOfferAction } from '@/api/queries';
import { useAuth } from '@/auth/AuthContext';
import { HealthBadge, InvoiceBadge, timeAgo } from '@/components/status';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  PageSkeleton,
  Progress,
  dueLabel,
  formatINR,
} from '@/components/ui';

export function ClientHome() {
  const { user } = useAuth();
  const { data, error, isPending: loading, refetch: reload } = useDashboard('client');
  const [offerHidden, setOfferHidden] = useState(false);
  const offerAction = useOfferAction();
  const [offerReply, setOfferReply] = useState(null);

  if (loading && !data) return <PageSkeleton />;
  if (error || !data) return <div className="page"><ErrorState message={error?.message ?? 'No data'} onRetry={reload} /></div>;

  const waiting = data.approvals.length + data.unpaidInvoices.length;
  const isOwner = user?.role === 'CLIENT_OWNER';

  return (
    <div className="page">
      <PageHeader
        eyebrow={user?.organisationName}
        title={`Welcome back, ${user?.name.split(' ')[0]}`}
        actions={<Button size="sm">Request new work</Button>}
      />

      {data.offer && !offerHidden && (
        <div
          className="card row"
          style={{ position: 'relative', padding: '14px 52px 14px 20px', background: 'var(--brand-red-soft)', borderColor: 'transparent', flexWrap: 'wrap' }}
        >
          <LuSparkles color="var(--brand-red)" aria-hidden />
          <div style={{ flex: 1, minWidth: 200 }}>
            <strong>{data.offer.title}.</strong> <span className="small">{data.offer.text}</span>
          </div>
          {offerReply ? (
            <span className="small" role="status">{offerReply}</span>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              loading={offerAction.isPending}
              onClick={() => offerAction.mutate({ kind: 'click', id: data.offer.id }, { onSuccess: (r) => setOfferReply(r.message) })}
            >
              {data.offer.cta}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon
            aria-label="Dismiss offer"
            onClick={() => {
              setOfferHidden(true);
              // Remembered on the server for this person, so it stays hidden next time.
              offerAction.mutate({ kind: 'dismiss', id: data.offer.id });
            }}
            style={{ position: 'absolute', top: 6, right: 6 }}
          >
            <LuX />
          </Button>
        </div>
      )}

      <div className="grid grid--2">
        <Card
          title="Waiting on you"
          action={waiting > 0 ? <Badge tone="warn">{waiting} to do</Badge> : <Badge tone="ok">All clear</Badge>}
        >
          {waiting === 0 ? (
            <EmptyState title="Nothing needs your action">We'll let you know when something does.</EmptyState>
          ) : (
            <ul className="list">
              {data.approvals.map((a) => (
                <li key={a.id} className="list__item">
                  <div className="list__main">
                    <div className="list__title">Approve: {a.title}</div>
                    <div className="list__meta">
                      {a.projectName} · sent {timeAgo(a.submittedAt)} · revision {a.revisionsUsed} of {a.revisionsAllowed}
                    </div>
                  </div>
                  <Link to={`/client/approvals/${a.id}`} className="btn btn--primary btn--sm">
                    Review
                  </Link>
                </li>
              ))}
              {data.unpaidInvoices.map((i) => (
                <li key={i.id} className="list__item">
                  <div className="list__main">
                    <div className="list__title">Pay invoice {i.number}</div>
                    <div className="list__meta">{formatINR(i.amount)} · {dueLabel(i.due)}</div>
                  </div>
                  <InvoiceBadge status={i.status} />
                  <Button size="sm" variant="secondary">Pay</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Your account manager">
          <div className="row" style={{ gap: 12, marginBottom: 12 }}>
            <Avatar name={data.accountManager.name} size={48} />
            <div>
              <strong>{data.accountManager.name}</strong>
              <div className="muted small">Webinger</div>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 6 }} className="small">
            <span className="row"><LuMail aria-hidden /> {data.accountManager.email}</span>
            <span className="row"><LuPhone aria-hidden /> {data.accountManager.phone}</span>
            <span className="row"><LuClock aria-hidden /> {data.accountManager.hours}</span>
          </div>
          <Button variant="secondary" block style={{ marginTop: 16 }}>Send a message</Button>
        </Card>
      </div>

      <Card
        title="Your projects"
        action={<Link to="/client/projects" className="small row">View all <LuArrowRight aria-hidden /></Link>}
      >
        {data.projects.length === 0 ? (
          <EmptyState title="No projects shared with you yet">
            {isOwner ? 'Your projects will appear here once they start.' : 'Ask your company admin to add you to a project.'}
          </EmptyState>
        ) : (
          <div className="grid grid--3">
            {data.projects.map((p) => (
              <div key={p.id} className="card" style={{ padding: 16, boxShadow: 'none', display: 'grid', gap: 10 }}>
                <div className="row">
                  <Badge>{p.service}</Badge>
                  <span className="spacer" />
                  <HealthBadge health={p.health} />
                </div>
                <strong>{p.name}</strong>
                <div>
                  <div className="row small" style={{ marginBottom: 4 }}>
                    <span className="muted">Progress</span>
                    <span className="spacer" />
                    <strong>{p.progress}%</strong>
                  </div>
                  <Progress value={p.progress} label={`${p.name} progress`} />
                </div>
                {p.nextMilestone && (
                  <div className="small">
                    <span className="muted">Next: </span>
                    {p.nextMilestone.title} · {dueLabel(p.nextMilestone.due)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid--2">
        <Card title={`Results · ${data.resultsPeriod}`} action={<Link to="/client/reports" className="small row">Full report <LuArrowRight aria-hidden /></Link>}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            {data.results.map((k) => (
              <div key={k.label}>
                <div className="muted small">{k.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{k.value}</div>
                {k.change && (
                  <div className="small" style={{ color: k.good ? 'var(--ok)' : 'var(--danger)', fontWeight: 600 }}>
                    {k.change} vs last month
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card title="Latest messages" action={<Link to="/client/messages" className="small row">Open chat <LuArrowRight aria-hidden /></Link>}>
          {data.messages.length === 0 ? (
            <EmptyState title="No messages yet" />
          ) : (
            <ul className="list">
              {data.messages.map((m) => (
                <li key={m.id} className="list__item">
                  <Avatar name={m.from} size={32} />
                  <div className="list__main">
                    <div className="list__title">
                      {m.from} {m.unread && <Badge tone="info">New</Badge>}
                    </div>
                    <div className="list__meta" style={{ whiteSpace: 'normal' }}>{m.text}</div>
                    <div className="list__meta">{m.projectName} · {timeAgo(m.at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
