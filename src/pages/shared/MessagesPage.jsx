import { useSearchParams } from 'react-router-dom';
import { LuCircleAlert, LuMessageSquare } from 'react-icons/lu';
import { useConversations, useTickets, useUpdateTicket } from '@/api/queries';
import { useAuth } from '@/auth/AuthContext';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, PageSkeleton, Segmented, cx } from '@/components/ui';
import { ConversationList, ResponseClock, Thread } from '@/components/chat';
import { PriorityBadge, timeAgo } from '@/components/status';

/** Messages for the admin, employee and client areas. What each person sees is decided by the API. */
export function MessagesPage() {
  const { user } = useAuth();
  const staff = user?.organisationId === 'org-webinger';
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'tickets' ? 'tickets' : 'chats';
  const active = params.get('c');
  const convs = useConversations();
  const tickets = useTickets();

  const open = (id) => setParams(id ? { c: id } : {}, { replace: false });
  const openTickets = (tickets.data ?? []).filter((t) => t.status !== 'RESOLVED').length;
  const unread = (convs.data ?? []).reduce((s, c) => s + c.unreadCount, 0);

  return (
    <div className="page page--messages">
      <PageHeader
        eyebrow={unread ? `${unread} unread` : staff ? 'All caught up' : user?.organisationName}
        title="Messages"
        actions={
          <Segmented
            label="Show"
            value={tab}
            onChange={(v) => setParams(v === 'tickets' ? { tab: 'tickets' } : {}, { replace: true })}
            options={[
              { value: 'chats', label: 'Chats' },
              { value: 'tickets', label: `${staff ? 'Tickets' : 'Requests'}${openTickets ? ` (${openTickets})` : ''}` },
            ]}
          />
        }
      />

      {tab === 'tickets' ? (
        <TicketsView staff={staff} onOpenChat={open} q={tickets} />
      ) : convs.isPending ? (
        <PageSkeleton />
      ) : convs.error ? (
        <ErrorState message={convs.error.message} onRetry={convs.refetch} />
      ) : convs.data.length === 0 ? (
        <Card>
          <EmptyState title="No conversations yet">Each project gets a channel with the Webinger team once it starts.</EmptyState>
        </Card>
      ) : (
        <div className={cx('chat-layout', active && 'has-selection')}>
          <Card flush className="chat-layout__list">
            <ConversationList conversations={convs.data} activeId={active} onOpen={open} staff={staff} />
          </Card>
          <Card flush className="chat-layout__thread">
            {active && convs.data.some((c) => c.id === active) ? (
              <Thread key={active} conversation={convs.data.find((c) => c.id === active)} onBack={() => open(undefined)} />
            ) : (
              <div className="chat-layout__empty">
                <LuMessageSquare size={32} aria-hidden />
                <div className="state__title">{active ? 'This conversation isn’t available' : 'Choose a conversation'}</div>
                <div className="small muted">
                  {staff ? 'Client channels show a reply clock when a client message is waiting.' : 'Each project has its own channel with your Webinger team.'}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

const CLIENT_STATUS = { OPEN: ['warn', 'We’re on it'], WAITING_ON_CLIENT: ['info', 'Waiting for you'], RESOLVED: ['ok', 'Resolved'] };
const STAFF_STATUS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'WAITING_ON_CLIENT', label: 'Waiting on client' },
  { value: 'RESOLVED', label: 'Resolved' },
];

function TicketsView({ staff, onOpenChat, q }) {
  const { user } = useAuth();
  const update = useUpdateTicket();
  if (q.isPending) return <PageSkeleton />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={q.refetch} />;
  if (q.data.length === 0)
    return (
      <Card>
        <EmptyState title={staff ? 'No tickets' : 'No requests yet'}>
          {staff ? 'Use “Make ticket” on a client message to track it with a response clock.' : 'When the team tracks something you asked for, it shows here.'}
        </EmptyState>
      </Card>
    );

  return (
    <>
      {update.error && (
        <div className="alert alert--error" role="alert">
          <LuCircleAlert aria-hidden style={{ marginTop: 2, flexShrink: 0 }} /> <span>{update.error.message}</span>
        </div>
      )}
      <Card flush>
        <div className="card__body">
          <table className="table table--rows">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Status</th>
                <th>{staff ? 'Owner' : 'Handled by'}</th>
                <th>Clock</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((t) => (
                <tr key={t.id}>
                  <td data-label="Ticket" className="td--title">
                    <div style={{ fontWeight: 600 }}>
                      <span className="muted">{t.number}</span> {t.title}
                    </div>
                    <div className="list__meta row" style={{ gap: 6, flexWrap: 'wrap' }}>
                      {staff ? `${t.clientName} · ` : ''}
                      {t.projectName} · opened {timeAgo(t.createdAt)}
                      {staff && t.priority === 'HIGH' && <PriorityBadge priority="HIGH" />}
                    </div>
                  </td>
                  <td data-label="Status">
                    {staff ? (
                      <select
                        className="inline-select"
                        aria-label={`Status of ${t.number}`}
                        value={t.status}
                        onChange={(e) => update.mutate({ id: t.id, patch: { status: e.target.value } })}
                      >
                        {STAFF_STATUS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Badge tone={CLIENT_STATUS[t.status][0]}>{CLIENT_STATUS[t.status][1]}</Badge>
                    )}
                  </td>
                  <td data-label={staff ? 'Owner' : 'Handled by'} className="small">
                    {t.assigneeName}
                    {staff && t.assigneeId !== user?.id && t.status !== 'RESOLVED' && (
                      <button type="button" className="link-btn" onClick={() => update.mutate({ id: t.id, patch: { assigneeId: user.id } })}>
                        Take it
                      </button>
                    )}
                  </td>
                  <td data-label="Clock">
                    {t.status === 'RESOLVED' ? (
                      <span className="small muted">Resolved {timeAgo(t.resolvedAt)}</span>
                    ) : staff ? (
                      <div className="grid" style={{ gap: 4 }}>
                        <ResponseClock label="First reply" dueAt={t.firstResponseDueAt} doneAt={t.firstRespondedAt} startedAt={t.createdAt} />
                        <ResponseClock label="Resolve" dueAt={t.resolveDueAt} />
                      </div>
                    ) : (
                      <span className="small">Expected by {new Date(t.resolveDueAt).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                    )}
                  </td>
                  <td data-label="Actions" style={{ textAlign: 'right' }}>
                    <Button size="sm" variant="secondary" onClick={() => onOpenChat(t.conversationId)}>
                      Open chat
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {staff && <p className="list__meta">Clocks count business hours only, from the moment the client wrote. A public reply stops the first-reply clock.</p>}
    </>
  );
}
