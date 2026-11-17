/**
 * Week 4 seed data: conversations, messages, tickets, uploads and the brand vault.
 * All names invented; times relative to now. Rows keep their private columns
 * (organisationId, projectId, visibility) the way the backend tables will.
 */
import type { Attachment, ChatMessage, FileFolder, FileVersion, Priority, TicketStatus, Visibility } from '@/types';
import { docPage, post } from './art';
import { ago, ORG, projects, userById } from './data';

export interface ConversationRow {
  id: string;
  kind: 'PROJECT' | 'TEAM';
  /** Agency org for the team channel; client org for project channels. */
  organisationId: string;
  projectId?: string;
  title: string;
}

export type MessageRow = Omit<ChatMessage, 'authorName' | 'fromAgency' | 'ticketNumber'>;

export interface TicketRow {
  id: string;
  number: string;
  title: string;
  conversationId: string;
  messageId: string;
  status: TicketStatus;
  priority: Priority;
  assigneeId: string;
  createdAt: string;
  createdById: string;
  firstResponseDueAt: string;
  firstRespondedAt?: string;
  resolveDueAt: string;
  resolvedAt?: string;
}

/** Uploaded files waiting to be attached, keyed by id. Phase 1: S3 objects + an uploads table. */
export const uploads = new Map<string, Attachment & { uploadedBy: string; used: boolean }>();

/* ----------------------------------------------------------- conversations */

export const conversations: ConversationRow[] = [
  { id: 'c-team', kind: 'TEAM', organisationId: ORG.WEBINGER, title: 'Webinger team' },
  // Every project gets its own channel with the client.
  ...projects.map((p) => ({ id: `c-${p.id}`, kind: 'PROJECT' as const, organisationId: p.organisationId, projectId: p.id, title: p.name })),
];

const rr = (userId: string, hoursAgo: number) => ({ userId, name: userById(userId)!.name, at: ago(hoursAgo) });
let n = 0;
const msg = (
  conversationId: string,
  authorId: string,
  hoursAgo: number,
  text: string,
  opts: { internal?: boolean; readBy?: Array<ReturnType<typeof rr>>; attachments?: Attachment[]; ticketId?: string } = {},
): MessageRow => ({
  id: `msg${++n}`,
  conversationId,
  authorId,
  at: ago(hoursAgo),
  text,
  internal: !!opts.internal,
  attachments: opts.attachments ?? [],
  readBy: opts.readBy ?? [],
  ticketId: opts.ticketId,
});
const att = (id: string, name: string, sizeKb: number, kind: Attachment['kind'], url?: string): Attachment => ({ id, name, sizeKb, kind, url });

export const chatMessages: MessageRow[] = [
  // Terra Foods: social media retainer
  msg('c-p1', 'u-mgr', 72, 'Hi Arjun, Neha. This is your channel for the social media retainer. Priya leads day to day; I am the backup.', { readBy: [rr('u-client', 70), rr('u-rep', 60)] }),
  msg('c-p1', 'u-client', 46, 'Thanks Kavya. Please use the new logo from now on, we updated it last week.', { readBy: [rr('u-emp', 45), rr('u-mgr', 44)] }),
  msg('c-p1', 'u-emp', 45, 'Noted. Swapping it on all week 1 posts now.', { readBy: [rr('u-client', 40)] }),
  msg('c-p1', 'u-meera', 30, 'Heads up: their new logo has a thin wordmark, it breaks below 80 px. Use the stacked version on stories.', { internal: true, readBy: [rr('u-emp', 29)] }),
  msg('c-p1', 'u-emp', 3, 'Week 1 designs are ready for your review. Preview of post 1 attached.', {
    attachments: [att('att1', 'week1-post1-preview.png', 640, 'IMAGE', post('Winter is here', 'TERRA', 1, 1))],
    readBy: [],
  }),
  msg('c-p1', 'u-client', 1, 'Please use the new logo from the brand vault on post 4 too.', { readBy: [] }),

  // Terra Foods: website (owner only; Neha is not on this project)
  msg('c-p2', 'u-mgr', 26, 'Arjun, can we get 15 minutes tomorrow on the homepage? A few decisions are blocking the inner pages.', { readBy: [rr('u-client', 20)] }),
  msg('c-p2', 'u-client', 20, 'Sure, 4 pm works.', { readBy: [rr('u-mgr', 19)] }),
  msg('c-p2', 'u-mgr', 19, 'Booked. Meera, bring the two hero options.', { internal: true, readBy: [rr('u-meera', 18)] }),

  // Nova Clinics: lead ads, an unanswered client message that became a ticket
  msg('c-p4', 'u-vikram', 30, 'Weekly lead report attached. Cost per lead is up 18% since the creative refresh.', {
    attachments: [att('att2', 'nova-week4-leads.pdf', 220, 'PDF', docPage('Week 4 lead report', 1, 1, 3))],
    readBy: [rr('u-client2', 28)],
  }),
  msg('c-p4', 'u-client2', 5, 'Leads dropped a lot this week, can you check? Our front desk says the phone is quiet.', { readBy: [], ticketId: 't-41' }),
  msg('c-p4', 'u-vikram', 4, 'Looks like the Google campaign hit its daily cap at 11 am. Raising it needs Sameer’s OK on budget.', { internal: true, readBy: [rr('u-mgr', 3)] }),

  // Nova Clinics: brand identity, resolved ticket
  msg('c-p5', 'u-client2', 60, 'The PDF of the logo is not opening on my laptop.', { readBy: [rr('u-meera', 59)], ticketId: 't-38' }),
  msg('c-p5', 'u-meera', 58, 'Sorry about that, re-exported it. Should open everywhere now.', {
    attachments: [att('att3', 'nova-logo-final.pdf', 410, 'PDF')],
    readBy: [rr('u-client2', 50)],
  }),

  // Team channel
  msg('c-team', 'u-admin', 50, 'Reminder: every client file goes in the portal, not WhatsApp. Approvals only count in the portal.', { readBy: [rr('u-emp', 49), rr('u-mgr', 48)] }),
  msg('c-team', 'u-mgr', 6, 'Nova leads are down. Vikram is on it; I may need someone to cover his Sunrise work on Thursday.', { readBy: [rr('u-admin', 5)] }),
];

export const tickets: TicketRow[] = [
  {
    id: 't-41', number: 'TCK-0041', title: 'Leads dropped this week', conversationId: 'c-p4', messageId: chatMessages.find((m) => m.ticketId === 't-41')!.id,
    status: 'OPEN', priority: 'HIGH', assigneeId: 'u-vikram', createdAt: ago(4.5), createdById: 'u-mgr',
    firstResponseDueAt: ago(0.5), resolveDueAt: ago(-40),
  },
  {
    id: 't-38', number: 'TCK-0038', title: 'Logo PDF does not open', conversationId: 'c-p5', messageId: chatMessages.find((m) => m.ticketId === 't-38')!.id,
    status: 'RESOLVED', priority: 'MEDIUM', assigneeId: 'u-meera', createdAt: ago(59.5), createdById: 'u-meera',
    firstResponseDueAt: ago(55), firstRespondedAt: ago(58), resolveDueAt: ago(10), resolvedAt: ago(50),
  },
];

/* ------------------------------------------------------------- brand vault */

export interface VaultFileRow {
  id: string;
  organisationId: string;
  name: string;
  folder: Exclude<FileFolder, 'DELIVERABLES'>;
  kind: 'IMAGE' | 'PDF' | 'DOC' | 'OTHER' | 'FONT';
  visibility: Visibility;
  versions: FileVersion[];
}

const v = (number: number, sizeKb: number, hoursAgo: number, by: string, note?: string, previewUrl?: string): FileVersion => ({
  number,
  sizeKb,
  uploadedAt: ago(hoursAgo),
  uploadedBy: by,
  note,
  previewUrl,
});

export const vaultFiles: VaultFileRow[] = [
  {
    id: 'f-terra-logo', organisationId: ORG.TERRA, name: 'Terra Foods logo (primary).svg', folder: 'LOGOS', kind: 'IMAGE', visibility: 'CLIENT',
    versions: [
      v(1, 48, 24 * 300, 'Meera Pillai', 'Original from onboarding', post('TERRA', 'Terra Foods', 1, 0)),
      v(2, 52, 24 * 90, 'Meera Pillai', 'Tightened letter spacing', post('TERRA', 'Terra Foods', 2, 1)),
      v(3, 51, 24 * 9, 'Meera Pillai', 'New logo, approved by Arjun. Use this one.', post('TERRA', 'Terra Foods', 3, 2)),
    ],
  },
  {
    id: 'f-terra-logo-mono', organisationId: ORG.TERRA, name: 'Terra Foods logo (stacked, mono).svg', folder: 'LOGOS', kind: 'IMAGE', visibility: 'CLIENT',
    versions: [v(1, 31, 24 * 9, 'Meera Pillai', 'For small sizes and stories', post('TERRA', 'Terra Foods', 4, 3))],
  },
  {
    id: 'f-terra-font', organisationId: ORG.TERRA, name: 'Terra Sans font family.zip', folder: 'FONTS', kind: 'FONT', visibility: 'CLIENT',
    versions: [v(1, 860, 24 * 300, 'Meera Pillai', 'Regular, Medium, Bold. Licensed for web and print.')],
  },
  {
    id: 'f-terra-guide', organisationId: ORG.TERRA, name: 'Brand guidelines.pdf', folder: 'GUIDELINES', kind: 'PDF', visibility: 'CLIENT',
    versions: [
      v(1, 2400, 24 * 280, 'Meera Pillai', undefined, docPage('Brand guidelines', 1, 24, 0)),
      v(2, 2650, 24 * 9, 'Meera Pillai', 'Updated for the new logo', docPage('Brand guidelines', 1, 26, 1)),
    ],
  },
  {
    id: 'f-terra-photos', organisationId: ORG.TERRA, name: 'Store and product photos (Oct).zip', folder: 'PHOTOS', kind: 'OTHER', visibility: 'CLIENT',
    versions: [v(1, 182_000, 24 * 30, 'Lensworks Studio', '48 edited photos')],
  },
  {
    // Internal working file: clients must never see it.
    id: 'f-terra-working', organisationId: ORG.TERRA, name: 'Logo working files.ai', folder: 'LOGOS', kind: 'OTHER', visibility: 'INTERNAL',
    versions: [v(1, 9100, 24 * 9, 'Meera Pillai')],
  },
  {
    id: 'f-nova-guide', organisationId: ORG.NOVA, name: 'Nova Clinics brand book (draft).pdf', folder: 'GUIDELINES', kind: 'PDF', visibility: 'CLIENT',
    versions: [v(1, 3100, 48, 'Meera Pillai', 'Pages 1–18', docPage('Nova brand book', 1, 18, 2))],
  },
  {
    id: 'f-sunrise-logo', organisationId: ORG.SUNRISE, name: 'Sunrise Retail logo.svg', folder: 'LOGOS', kind: 'IMAGE', visibility: 'CLIENT',
    versions: [v(1, 40, 24 * 120, 'Meera Pillai', undefined, post('SUNRISE', 'Sunrise', 2, 4))],
  },
];

/** Signed download tokens. Phase 1: S3 pre-signed URLs with the same 5-minute life. */
export const downloadTokens = new Map<string, { fileId: string; version: number; userId: string; expiresAt: number }>();
