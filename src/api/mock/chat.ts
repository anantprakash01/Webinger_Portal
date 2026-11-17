/**
 * Mock messages API: project channels with the client, the staff team channel,
 * internal notes, read receipts, uploads, tickets with business-hours clocks.
 * Comments starting with "BACKEND:" are rules the Spring Boot service must enforce.
 */
import type {
  Attachment,
  Availability,
  ChatMessage,
  Conversation,
  MessagePreview,
  NewMessage,
  NewTicket,
  Ticket,
  TicketPatch,
  TicketStatus,
  User,
} from '@/types';
import { CLIENT_NAME, nameOf, ORG, projects, settings, userById, users } from './data';
import { chatMessages, conversations, tickets, uploads } from './data4';
import type { ConversationRow, MessageRow, TicketRow } from './data4';
import { badRequest, canSeeProject, conflict, forbidden, isAdminArea, isClient, isStaff, notFound } from './handlers';
import { addBusinessHours, hoursText, isOpenAt, nextOpen } from './hours';

const project = (c: ConversationRow) => projects.find((p) => p.id === c.projectId);
const agency = (userId: string) => userById(userId)?.organisationId === ORG.WEBINGER;
const now = () => new Date().toISOString();

/**
 * BACKEND: who may read a channel.
 * Team channel: staff. Project channel: admin area always; employees only when
 * assigned to the project (not merely reviewing a task); clients per project visibility.
 */
function canSee(user: User, c: ConversationRow): boolean {
  if (c.kind === 'TEAM') return isStaff(user);
  const p = project(c);
  if (!p) return false;
  if (isAdminArea(user)) return true;
  if (user.role === 'EMPLOYEE') return p.memberIds.includes(user.id);
  if (isClient(user)) return canSeeProject(user, p);
  return false;
}

function find(user: User, id: string): ConversationRow {
  if (!isStaff(user) && !isClient(user)) throw forbidden();
  const c = conversations.find((x) => x.id === id);
  if (!c || !canSee(user, c)) throw notFound('Conversation');
  return c;
}

// BACKEND: internal notes are filtered out in the query for client roles, never in the browser.
const visibleMessages = (user: User, c: ConversationRow) =>
  chatMessages.filter((m) => m.conversationId === c.id && (!m.internal || isStaff(user)));

const toMessage = (m: MessageRow): ChatMessage => ({
  ...m,
  authorName: nameOf(m.authorId),
  fromAgency: agency(m.authorId),
  ticketNumber: m.ticketId ? tickets.find((t) => t.id === m.ticketId)?.number : undefined,
});

/** The last client message with no public agency reply after it. */
function awaitingReply(c: ConversationRow) {
  const pub = chatMessages.filter((m) => m.conversationId === c.id && !m.internal);
  const last = pub[pub.length - 1];
  if (!last || agency(last.authorId)) return undefined;
  const since = Date.parse(last.at);
  return { since: last.at, dueAt: new Date(addBusinessHours(since, settings.responseTimes.firstReplyHours, settings.businessHours)).toISOString() };
}

function members(c: ConversationRow) {
  const ids =
    c.kind === 'TEAM'
      ? users.filter((u) => u.organisationId === ORG.WEBINGER).map((u) => u.id)
      : (() => {
          const p = project(c)!;
          const owners = users.filter((u) => u.organisationId === p.organisationId && u.role === 'CLIENT_OWNER').map((u) => u.id);
          return [...new Set([p.ownerId, ...p.memberIds, ...owners])];
        })();
  return ids
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is NonNullable<typeof u> => !!u && u.status === 'ACTIVE')
    .map((u) => ({ id: u.id, name: u.name, fromAgency: u.organisationId === ORG.WEBINGER }));
}

function toConversation(user: User, c: ConversationRow): Conversation {
  const msgs = visibleMessages(user, c);
  const last = msgs[msgs.length - 1];
  return {
    id: c.id,
    kind: c.kind,
    title: c.title,
    projectId: c.projectId,
    clientName: c.kind === 'PROJECT' ? CLIENT_NAME[c.organisationId] : undefined,
    unreadCount: msgs.filter((m) => m.authorId !== user.id && !m.readBy.some((r) => r.userId === user.id)).length,
    lastMessage: last ? { text: last.text || `${last.attachments.length} attachment(s)`, at: last.at, authorName: nameOf(last.authorId), internal: last.internal } : undefined,
    // Staff see the reply clock; clients see the business-hours banner instead.
    awaitingReply: isStaff(user) && c.kind === 'PROJECT' ? awaitingReply(c) : undefined,
    openTickets: tickets.filter((t) => t.conversationId === c.id && t.status !== 'RESOLVED').length,
    members: members(c),
  };
}

/* ------------------------------------------------------------ conversations */

/** GET /conversations */
export function listConversations(user: User): Conversation[] {
  if (!isStaff(user) && !isClient(user)) throw forbidden();
  return conversations
    .filter((c) => canSee(user, c))
    .map((c) => toConversation(user, c))
    .sort((a, b) => (b.lastMessage?.at ?? '').localeCompare(a.lastMessage?.at ?? '') || a.title.localeCompare(b.title));
}

/** GET /conversations/{id}/messages?after={messageId}. Polling asks only for what is new. */
export function listMessages(user: User, conversationId: string, after?: string): ChatMessage[] {
  const c = find(user, conversationId);
  const msgs = visibleMessages(user, c);
  const from = after ? msgs.findIndex((m) => m.id === after) + 1 : 0;
  return msgs.slice(from).map(toMessage);
}

/** POST /conversations/{id}/messages */
export function postMessage(user: User, conversationId: string, body: NewMessage): ChatMessage {
  const c = find(user, conversationId);
  const text = body.text?.trim() ?? '';
  const ids = body.attachmentIds ?? [];
  if (!text && ids.length === 0) throw badRequest('Write a message or attach a file.');
  if (text.length > 4000) throw badRequest('Messages can be at most 4,000 characters.');
  if (ids.length > 5) throw badRequest('Attach at most 5 files per message.');
  // BACKEND: only staff can write internal notes.
  if (body.internal && !isStaff(user)) throw forbidden('Only the Webinger team can write internal notes.');
  const attachments: Attachment[] = ids.map((id) => {
    const u = uploads.get(id);
    if (!u || u.uploadedBy !== user.id || u.used) throw badRequest('One of the attachments is missing. Upload it again.');
    u.used = true;
    return { id: u.id, name: u.name, sizeKb: u.sizeKb, kind: u.kind, url: u.url };
  });
  const m: MessageRow = {
    id: `msg-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    conversationId: c.id,
    authorId: user.id,
    at: now(),
    text,
    internal: c.kind === 'PROJECT' && !!body.internal,
    attachments,
    readBy: [],
  };
  chatMessages.push(m);

  // A public agency reply counts as the first response on open tickets in this channel.
  if (isStaff(user) && !m.internal) {
    for (const t of tickets) if (t.conversationId === c.id && t.status !== 'RESOLVED' && !t.firstRespondedAt) t.firstRespondedAt = m.at;
  }
  simulateOtherSide(user, c, m);
  return toMessage(m);
}

/** POST /conversations/{id}/read: read receipts up to and including a message. */
export function markRead(user: User, conversationId: string, upToId: string): void {
  const c = find(user, conversationId);
  const msgs = visibleMessages(user, c);
  const end = msgs.findIndex((m) => m.id === upToId);
  if (end < 0) throw notFound('Message');
  for (const m of msgs.slice(0, end + 1)) {
    if (m.authorId !== user.id && !m.readBy.some((r) => r.userId === user.id)) m.readBy.push({ userId: user.id, name: user.name, at: now() });
  }
}

/**
 * Demo only: there is no second person in the prototype, so the other side
 * "reads" a new message after a few seconds. That shows read receipts and
 * polling working. Remove when the real API is connected.
 */
function simulateOtherSide(author: User, c: ConversationRow, m: MessageRow) {
  if (c.kind !== 'PROJECT' || m.internal) return;
  const p = project(c)!;
  const readerId = isStaff(author) ? users.find((u) => u.organisationId === p.organisationId && u.role === 'CLIENT_OWNER')?.id : p.ownerId;
  if (!readerId || readerId === author.id) return;
  const timer = setTimeout(() => {
    if (!m.readBy.some((r) => r.userId === readerId)) m.readBy.push({ userId: readerId, name: nameOf(readerId), at: now() });
  }, 5000) as unknown as { unref?: () => void };
  timer.unref?.();
}

/* ------------------------------------------------------------------ uploads */

const ALLOWED = /\.(png|jpe?g|gif|webp|svg|pdf|docx?|xlsx?|pptx?|csv|txt|zip)$/i;
const MAX_KB = 10 * 1024;

/** POST /uploads (multipart). Returns an id to attach to a message. */
export function registerUpload(user: User, meta: { name: string; sizeKb: number; url?: string }): Attachment {
  if (!isStaff(user) && !isClient(user)) throw forbidden();
  if (!meta.name || !ALLOWED.test(meta.name)) throw badRequest('That file type is not allowed. Use images, PDF, Office files, CSV, TXT or ZIP.');
  if (meta.sizeKb > MAX_KB) throw badRequest('Files can be up to 10 MB. Share bigger videos as a link.');
  const kind: Attachment['kind'] = /\.(png|jpe?g|gif|webp|svg)$/i.test(meta.name) ? 'IMAGE' : /\.pdf$/i.test(meta.name) ? 'PDF' : /\.(docx?|xlsx?|pptx?|csv|txt)$/i.test(meta.name) ? 'DOC' : 'OTHER';
  const a = { id: `up-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: meta.name, sizeKb: Math.max(1, Math.round(meta.sizeKb)), kind, url: meta.url };
  uploads.set(a.id, { ...a, uploadedBy: user.id, used: false });
  return a;
}

/* ------------------------------------------------------------------ tickets */

const toTicket = (t: TicketRow): Ticket => {
  const c = conversations.find((x) => x.id === t.conversationId)!;
  return {
    id: t.id,
    number: t.number,
    title: t.title,
    conversationId: t.conversationId,
    messageId: t.messageId,
    projectName: c.title,
    clientName: CLIENT_NAME[c.organisationId] ?? '',
    status: t.status,
    priority: t.priority,
    assigneeId: t.assigneeId,
    assigneeName: nameOf(t.assigneeId),
    createdAt: t.createdAt,
    createdBy: nameOf(t.createdById),
    firstResponseDueAt: t.firstResponseDueAt,
    firstRespondedAt: t.firstRespondedAt,
    resolveDueAt: t.resolveDueAt,
    resolvedAt: t.resolvedAt,
  };
};

/** POST /messages/{id}/ticket: staff turn a client message into a tracked ticket. */
export function createTicket(user: User, messageId: string, body: NewTicket): Ticket {
  if (!isStaff(user)) throw forbidden('Only the Webinger team can open tickets.');
  const m = chatMessages.find((x) => x.id === messageId);
  if (!m) throw notFound('Message');
  const c = find(user, m.conversationId);
  if (c.kind !== 'PROJECT' || m.internal || agency(m.authorId)) throw badRequest('Only client messages can become tickets.');
  if (m.ticketId) throw conflict('This message is already a ticket.');
  const title = body.title?.trim() ?? '';
  if (title.length < 3 || title.length > 120) throw badRequest('Give the ticket a short title (3–120 characters).');
  if (!['LOW', 'MEDIUM', 'HIGH'].includes(body.priority)) throw badRequest('Choose a priority.');

  const created = Date.now();
  const h = settings.businessHours;
  const next = Math.max(0, ...tickets.map((t) => Number(t.number.slice(4)))) + 1;
  // If someone already replied publicly after the message, that was the first response.
  const later = chatMessages.find((x) => x.conversationId === c.id && !x.internal && agency(x.authorId) && x.at > m.at);
  const t: TicketRow = {
    id: `t-${next}`,
    number: `TCK-${String(next).padStart(4, '0')}`,
    title,
    conversationId: c.id,
    messageId: m.id,
    status: 'OPEN',
    priority: body.priority,
    assigneeId: project(c)!.ownerId,
    createdAt: new Date(created).toISOString(),
    createdById: user.id,
    // BACKEND: clocks start when the client wrote, and only count business hours.
    firstResponseDueAt: new Date(addBusinessHours(Date.parse(m.at), settings.responseTimes.firstReplyHours, h)).toISOString(),
    firstRespondedAt: later?.at,
    resolveDueAt: new Date(addBusinessHours(Date.parse(m.at), settings.responseTimes.ticketResolutionHours, h)).toISOString(),
  };
  tickets.push(t);
  m.ticketId = t.id;
  return toTicket(t);
}

const STATUS_ORDER: Record<TicketStatus, number> = { OPEN: 0, WAITING_ON_CLIENT: 1, RESOLVED: 2 };

/** GET /tickets */
export function listTickets(user: User, q: { status?: TicketStatus } = {}): Ticket[] {
  if (!isStaff(user) && !isClient(user)) throw forbidden();
  return tickets
    .filter((t) => {
      const c = conversations.find((x) => x.id === t.conversationId);
      return !!c && canSee(user, c) && (!q.status || t.status === q.status);
    })
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.firstResponseDueAt.localeCompare(b.firstResponseDueAt))
    .map(toTicket);
}

/** PATCH /tickets/{id} */
export function updateTicket(user: User, id: string, patch: TicketPatch): Ticket {
  if (!isStaff(user)) throw forbidden('Only the Webinger team can change tickets.');
  const t = tickets.find((x) => x.id === id);
  const c = t && conversations.find((x) => x.id === t.conversationId);
  if (!t || !c || !canSee(user, c)) throw notFound('Ticket');
  if (patch.status !== undefined) {
    if (!['OPEN', 'WAITING_ON_CLIENT', 'RESOLVED'].includes(patch.status)) throw badRequest('Unknown status.');
    t.status = patch.status;
    t.resolvedAt = patch.status === 'RESOLVED' ? now() : undefined;
  }
  if (patch.assigneeId !== undefined) {
    const to = userById(patch.assigneeId);
    if (!to || to.organisationId !== ORG.WEBINGER || to.status !== 'ACTIVE') throw badRequest('Assign the ticket to an active team member.');
    t.assigneeId = to.id;
  }
  return toTicket(t);
}

/* ------------------------------------------------------------- availability */

/** GET /availability: any signed-in user. Drives the business-hours banner. */
export function availability(): Availability {
  const h = settings.businessHours;
  const t = Date.now();
  const open = isOpenAt(t, h);
  return {
    openNow: open,
    opensAt: open ? undefined : new Date(nextOpen(t, h)).toISOString(),
    hoursText: hoursText(h),
    firstReplyHours: settings.responseTimes.firstReplyHours,
  };
}

/* --------------------------------------------------- dashboard previews */

/** Latest messages for the home dashboards: clients see agency replies, staff see client messages. */
export function previewsFor(user: User, limit = 4): MessagePreview[] {
  const mine = conversations.filter((c) => c.kind === 'PROJECT' && canSee(user, c));
  return chatMessages
    .filter((m) => mine.some((c) => c.id === m.conversationId) && !m.internal && m.authorId !== user.id && agency(m.authorId) === isClient(user))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit)
    .map((m) => {
      const c = conversations.find((x) => x.id === m.conversationId)!;
      return {
        id: m.id,
        from: isClient(user) ? nameOf(m.authorId) : `${nameOf(m.authorId)} (${CLIENT_NAME[c.organisationId]})`,
        projectName: c.title,
        text: m.text,
        at: m.at,
        unread: !m.readBy.some((r) => r.userId === user.id),
      };
    });
}
