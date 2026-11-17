import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LuArrowLeft,
  LuCircleAlert,
  LuClock,
  LuEye,
  LuFile,
  LuFileText,
  LuLock,
  LuMoon,
  LuPaperclip,
  LuSend,
  LuTicket,
  LuUsers,
  LuX,
} from 'react-icons/lu';
import { api } from '@/api/client';
import { useAvailability, useCreateTicket, useMarkRead, useSendMessage, useThread } from '@/api/queries';
import { useAuth } from '@/auth/AuthContext';
import { Avatar, Badge, Button, EmptyState, ErrorState, SearchInput, Segmented, cx } from './ui';

/* ---------- time helpers ---------- */
export function formatDuration(ms) {
  const m = Math.max(1, Math.round(Math.abs(ms) / 60_000));
  if (m < 60) return `${m} m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h${m % 60 ? ` ${m % 60} m` : ''}`;
  return `${Math.round(h / 24)} days`;
}
const clockTime = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const dayLabel = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};
const shortWhen = (iso) => (new Date(iso).toDateString() === new Date().toDateString() ? clockTime(iso) : new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));

/** Re-renders every 30 s so clocks stay current. */
function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/**
 * Response-time clock. Deadlines already count business hours only (set by the server).
 * done → how long it took; otherwise time left, turning amber in the last hour and red when late.
 */
export function ResponseClock({ dueAt, doneAt, startedAt, label = 'Reply', compact }) {
  const now = useNow();
  if (doneAt) {
    return (
      <span className="clock clock--ok">
        <LuClock aria-hidden /> {label} in {formatDuration(Date.parse(doneAt) - Date.parse(startedAt))}
      </span>
    );
  }
  const left = Date.parse(dueAt) - now;
  const tone = left < 0 ? 'danger' : left < 3_600_000 ? 'warn' : 'neutral';
  return (
    <span className={`clock clock--${tone}`} title={`Due ${new Date(dueAt).toLocaleString('en-IN')}`}>
      <LuClock aria-hidden />
      {left < 0 ? `${compact ? '' : `${label} `}overdue ${formatDuration(left)}` : `${compact ? '' : `${label} due in `}${formatDuration(left)}`}
    </span>
  );
}

/** Tells clients when to expect a reply, and that it is out of hours if so. */
export function BusinessHoursBanner() {
  const { data } = useAvailability();
  if (!data) return null;
  if (data.openNow) {
    return (
      <div className="hours-banner">
        <LuClock aria-hidden /> We usually reply within {data.firstReplyHours} business hours. Hours: {data.hoursText}.
      </div>
    );
  }
  const opens = data.opensAt ? new Date(data.opensAt).toLocaleString('en-IN', { weekday: 'long', hour: 'numeric', minute: '2-digit' }) : 'soon';
  return (
    <div className="hours-banner hours-banner--closed" role="status">
      <LuMoon aria-hidden /> The team is offline now and back {opens}. Your message will be waiting for them. Hours: {data.hoursText}.
    </div>
  );
}

/* ---------- conversation list ---------- */
export function ConversationList({ conversations, activeId, onOpen, staff }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? conversations.filter((c) => `${c.title} ${c.clientName ?? ''}`.toLowerCase().includes(needle)) : conversations;
  }, [conversations, q]);
  return (
    <div className="convs">
      {conversations.length > 6 && (
        <div className="convs__search">
          <SearchInput label="Search conversations" value={q} onChange={setQ} placeholder="Search projects or clients" />
        </div>
      )}
      {shown.length === 0 ? (
        <EmptyState title={q ? 'No conversations match' : 'No conversations yet'} />
      ) : (
        <ul className="convs__list">
          {shown.map((c) => (
            <li key={c.id}>
              <button type="button" className={cx('conv', c.id === activeId && 'is-on')} onClick={() => onOpen(c.id)} aria-current={c.id === activeId || undefined}>
                <span className="conv__icon" aria-hidden>
                  {c.kind === 'TEAM' ? <LuUsers /> : (c.clientName ?? c.title).slice(0, 2).toUpperCase()}
                </span>
                <span className="conv__main">
                  <span className="conv__top">
                    <span className={cx('conv__title', c.unreadCount > 0 && 'is-unread')}>{c.title}</span>
                    {c.lastMessage && <span className="conv__time">{shortWhen(c.lastMessage.at)}</span>}
                  </span>
                  {staff && c.clientName && <span className="conv__client">{c.clientName}</span>}
                  <span className="conv__preview">
                    {c.lastMessage ? (
                      <>
                        {c.lastMessage.internal && <LuLock aria-label="Internal note" />} {c.lastMessage.authorName.split(' ')[0]}: {c.lastMessage.text}
                      </>
                    ) : (
                      <span className="muted">No messages yet</span>
                    )}
                  </span>
                  {(c.awaitingReply || c.openTickets > 0) && (
                    <span className="conv__flags">
                      {c.awaitingReply && <ResponseClock dueAt={c.awaitingReply.dueAt} label="Reply" />}
                      {c.openTickets > 0 && (
                        <span className="clock clock--neutral">
                          <LuTicket aria-hidden /> {c.openTickets} open
                        </span>
                      )}
                    </span>
                  )}
                </span>
                {c.unreadCount > 0 && (
                  <span className="conv__unread" aria-label={`${c.unreadCount} unread`}>
                    {c.unreadCount}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- thread ---------- */
export function Thread({ conversation, onBack }) {
  const { user } = useAuth();
  const staff = user?.organisationId === 'org-webinger';
  const { data, error, isPending, refetch } = useThread(conversation.id);
  const markRead = useMarkRead(conversation.id);
  const scroller = useRef(null);
  const atBottom = useRef(true);
  const [ticketFor, setTicketFor] = useState(null);

  const msgs = data ?? [];
  const lastId = msgs[msgs.length - 1]?.id;

  // Keep the newest message in view unless the reader has scrolled up.
  useEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [lastId, msgs.length]);

  // Read receipts: mark everything up to the newest message from someone else.
  const lastFromOthers = [...msgs].reverse().find((m) => m.authorId !== user?.id && !m.pending);
  const unreadForMe = lastFromOthers && !lastFromOthers.readBy.some((r) => r.userId === user?.id);
  useEffect(() => {
    if (unreadForMe && !markRead.isPending) markRead.mutate(lastFromOthers.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastFromOthers?.id, unreadForMe]);

  const myLast = [...msgs].reverse().find((m) => m.authorId === user?.id && !m.pending && !m.internal);

  return (
    <section className="thread" aria-label={`Conversation: ${conversation.title}`}>
      <header className="thread__head">
        <button type="button" className="thread__back" onClick={onBack} aria-label="Back to conversations">
          <LuArrowLeft />
        </button>
        <div className="list__main">
          <h2 className="thread__title">{conversation.title}</h2>
          <div className="list__meta" title={conversation.members.map((m) => m.name).join(', ')}>
            {conversation.clientName ? `${conversation.clientName} · ` : ''}
            {conversation.members.length} people
            {staff && conversation.kind === 'PROJECT' && ' · client can read replies, not internal notes'}
          </div>
        </div>
        {conversation.awaitingReply && <ResponseClock dueAt={conversation.awaitingReply.dueAt} label="Reply" />}
      </header>

      {!staff && <BusinessHoursBanner />}

      <div
        className="thread__body"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        aria-live="polite"
        aria-relevant="additions"
      >
        {isPending ? (
          <div className="grid">
            <div className="skeleton" style={{ height: 60, width: '60%' }} />
            <div className="skeleton" style={{ height: 60, width: '50%', marginLeft: 'auto' }} />
          </div>
        ) : error ? (
          <ErrorState message={error.message} onRetry={refetch} />
        ) : msgs.length === 0 ? (
          <EmptyState title="No messages yet">Say hello to get the conversation going.</EmptyState>
        ) : (
          msgs.map((m, i) => {
            const newDay = i === 0 || dayLabel(msgs[i - 1].at) !== dayLabel(m.at);
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="thread__day">
                    <span>{dayLabel(m.at)}</span>
                  </div>
                )}
                <MessageBubble
                  m={m}
                  mine={m.authorId === user?.id}
                  showReceipt={m.id === myLast?.id}
                  canTicket={staff && conversation.kind === 'PROJECT' && !m.fromAgency && !m.internal && !m.ticketId && !m.pending}
                  onTicket={() => setTicketFor(m)}
                />
                {ticketFor?.id === m.id && <TicketForm conversationId={conversation.id} message={m} onDone={() => setTicketFor(null)} />}
              </div>
            );
          })
        )}
      </div>

      <Composer conversation={conversation} staff={staff} user={user} onSent={() => (atBottom.current = true)} />
    </section>
  );
}

function AttachmentView({ a }) {
  if (a.kind === 'IMAGE' && a.url) {
    return (
      <a href={a.url} target="_blank" rel="noreferrer" className="att att--image">
        <img src={a.url} alt={a.name} loading="lazy" />
      </a>
    );
  }
  const Icon = a.kind === 'PDF' || a.kind === 'DOC' ? LuFileText : LuFile;
  const body = (
    <>
      <Icon aria-hidden />
      <span className="att__name">{a.name}</span>
      <span className="att__size">{a.sizeKb >= 1024 ? `${(a.sizeKb / 1024).toFixed(1)} MB` : `${a.sizeKb} KB`}</span>
    </>
  );
  return a.url ? (
    <a href={a.url} target="_blank" rel="noreferrer" className="att">
      {body}
    </a>
  ) : (
    <span className="att" title="Available in the real portal">
      {body}
    </span>
  );
}

function MessageBubble({ m, mine, showReceipt, canTicket, onTicket }) {
  return (
    <div className={cx('msg', mine && 'msg--mine', m.internal && 'msg--internal', m.pending && 'msg--pending')}>
      {!mine && <Avatar name={m.authorName} size={30} />}
      <div className="msg__col">
        <div className="msg__meta">
          {!mine && <strong>{m.authorName}</strong>}
          {!mine && m.fromAgency && <span className="msg__org">Webinger</span>}
          <time dateTime={m.at}>{m.pending ? 'Sending…' : clockTime(m.at)}</time>
        </div>
        <div className="msg__bubble">
          {m.internal && (
            <div className="msg__internal">
              <LuLock aria-hidden /> Internal note · the client cannot see this
            </div>
          )}
          {m.text && <p className="pre">{m.text}</p>}
          {m.attachments.length > 0 && (
            <div className="msg__atts">
              {m.attachments.map((a) => (
                <AttachmentView key={a.id} a={a} />
              ))}
            </div>
          )}
        </div>
        <div className="msg__foot">
          {m.ticketNumber && (
            <Badge tone="info">
              <LuTicket aria-hidden /> {m.ticketNumber}
            </Badge>
          )}
          {canTicket && (
            <button type="button" className="link-btn" onClick={onTicket}>
              Make ticket
            </button>
          )}
          {showReceipt && (
            <span className="msg__seen">
              {m.readBy.length ? (
                <>
                  <LuEye aria-hidden /> Seen by {m.readBy.length > 2 ? `${m.readBy.length} people` : m.readBy.map((r) => r.name.split(' ')[0]).join(' and ')}
                </>
              ) : (
                'Delivered'
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function TicketForm({ conversationId, message, onDone }) {
  const create = useCreateTicket(conversationId);
  const [title, setTitle] = useState(message.text.split(/[.?!\n]/)[0].slice(0, 80));
  const [priority, setPriority] = useState('MEDIUM');
  const [err, setErr] = useState(null);
  const submit = (e) => {
    e.preventDefault();
    if (title.trim().length < 3) {
      setErr('Give the ticket a short title.');
      return;
    }
    setErr(null);
    create.mutate({ messageId: message.id, body: { title: title.trim(), priority } }, { onSuccess: onDone });
  };
  return (
    <form className="ticket-form" onSubmit={submit} noValidate>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong className="small">
          <LuTicket aria-hidden /> Turn this message into a ticket
        </strong>
        <Button type="button" variant="ghost" size="sm" icon aria-label="Cancel" onClick={onDone}>
          <LuX />
        </Button>
      </div>
      <label className="field">
        <span className="field__label">Title</span>
        <input className="field__input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} aria-invalid={err ? true : undefined} />
      </label>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <Segmented
          label="Priority"
          value={priority}
          onChange={setPriority}
          options={[
            { value: 'LOW', label: 'Low' },
            { value: 'MEDIUM', label: 'Medium' },
            { value: 'HIGH', label: 'High' },
          ]}
        />
        <span className="spacer" />
        <Button type="submit" size="sm" loading={create.isPending}>
          Create ticket
        </Button>
      </div>
      {(err || create.error) && (
        <span className="field__error" role="alert">
          <LuCircleAlert aria-hidden /> {err ?? create.error.message}
        </span>
      )}
      <p className="list__meta">The response clock starts from when the client wrote, counting business hours only. The project owner is assigned.</p>
    </form>
  );
}

function Composer({ conversation, staff, user, onSent }) {
  const send = useSendMessage(conversation.id);
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]); // { key, name, status: 'uploading'|'ready'|'error', attachment?, error? }
  // Every comment and note defaults to internal (portal rule). Staff switch to "Reply" to write to the client.
  const [mode, setMode] = useState('INTERNAL');
  const fileInput = useRef(null);
  const canInternal = staff && conversation.kind === 'PROJECT';
  const internal = canInternal && mode === 'INTERNAL';
  const uploading = files.some((f) => f.status === 'uploading');
  const ready = files.filter((f) => f.status === 'ready');

  const pick = (list) => {
    for (const file of Array.from(list).slice(0, 5 - files.length)) {
      const key = `${file.name}-${Date.now()}-${Math.random()}`;
      setFiles((fs) => [...fs, { key, name: file.name, status: 'uploading' }]);
      api.uploads
        .create(file)
        .then((attachment) => setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, status: 'ready', attachment } : f))))
        .catch((e) => setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, status: 'error', error: e.message } : f))));
    }
  };

  const submit = (e) => {
    e?.preventDefault();
    if (uploading || (!text.trim() && ready.length === 0)) return;
    const body = { text: text.trim(), internal, attachmentIds: ready.map((f) => f.attachment.id) };
    const optimistic = {
      id: `tmp-${Date.now()}`,
      conversationId: conversation.id,
      authorId: user.id,
      authorName: user.name,
      fromAgency: staff,
      at: new Date().toISOString(),
      text: body.text,
      internal,
      attachments: ready.map((f) => f.attachment),
      readBy: [],
      pending: true,
    };
    send.mutate(
      { body, optimistic },
      {
        onSuccess: () => {
          setText('');
          setFiles([]);
          onSent();
        },
      },
    );
  };

  return (
    <form className={cx('composer2', internal && 'is-internal')} onSubmit={submit} noValidate>
      {canInternal && (
        <Segmented
          label="Who will see this message"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'INTERNAL', label: 'Internal note', icon: <LuLock aria-hidden /> },
            { value: 'REPLY', label: `Reply to ${conversation.clientName ?? 'client'}`, icon: <LuEye aria-hidden /> },
          ]}
        />
      )}
      {send.error && (
        <span className="field__error" role="alert">
          <LuCircleAlert aria-hidden /> Not sent: {send.error.message}
        </span>
      )}
      {files.length > 0 && (
        <ul className="composer2__files">
          {files.map((f) => (
            <li key={f.key} className={cx('chip', f.status === 'error' && 'chip--error')}>
              <LuPaperclip aria-hidden />
              <span>{f.status === 'error' ? `${f.name}: ${f.error}` : f.name}</span>
              {f.status === 'uploading' && <span className="muted">uploading…</span>}
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((fs) => fs.filter((x) => x.key !== f.key))}>
                <LuX />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="composer2__row">
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => { pick(e.target.files ?? []); e.target.value = ''; }} />
        <Button type="button" variant="ghost" icon aria-label="Attach files" onClick={() => fileInput.current?.click()} disabled={files.length >= 5}>
          <LuPaperclip size={18} />
        </Button>
        <label htmlFor={`composer-${conversation.id}`} className="sr-only">
          {internal ? 'Internal note' : 'Message'}
        </label>
        <textarea
          id={`composer-${conversation.id}`}
          rows={1}
          maxLength={4000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={internal ? 'Internal note: only Webinger can see this' : conversation.kind === 'TEAM' ? 'Message the team' : `Message ${staff ? conversation.clientName : 'the Webinger team'}`}
        />
        <Button type="submit" icon aria-label="Send" disabled={uploading || (!text.trim() && ready.length === 0)}>
          <LuSend size={18} />
        </Button>
      </div>
      <p className="composer2__hint">Enter to send, Shift + Enter for a new line. Up to 5 files, 10 MB each.</p>
    </form>
  );
}
