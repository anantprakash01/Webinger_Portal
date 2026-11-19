/**
 * Mock offers API (Week 7): one modest banner slot on the client dashboard (CLAUDE.md 4.1).
 * Targeted at services the client doesn't buy yet; a click creates a lead in the pipeline (automation rule 1).
 * Comments starting with "BACKEND:" are rules the Spring Boot service must enforce.
 */
import type { Offer, OfferInput, OfferItem, User } from '@/types';
import { clientRows } from './clients';
import { CLIENT_NAME, day, projects } from './data';
import { leads } from './data6';
import { offerDismissals, offers } from './data7';
import type { OfferRow } from './data7';
import { badRequest, forbidden, isAdminArea, isClient, notFound } from './handlers';
import { SERVICES } from './pipeline';

const today = () => day(0);
const nowIso = () => new Date().toISOString();
const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const seen = new Set<string>();

function requireAdminArea(user: User) {
  if (!isAdminArea(user)) throw forbidden('Only Super Admins and Managers manage offers.');
}
const toItem = (o: OfferRow): OfferItem => ({ ...o });

/** Services a client already buys: live projects plus running contracts. */
function servicesOf(orgId: string) {
  const s = new Set(projects.filter((p) => p.organisationId === orgId && p.status !== 'COMPLETED').map((p) => p.service));
  for (const c of clientRows.find((r) => r.organisationId === orgId)?.contracts ?? []) if (c.endDate >= today()) s.add(c.title);
  return s;
}

const isLive = (o: OfferRow) => o.active && o.startDate <= today() && o.endDate >= today();

/** The one offer for this client user (or none). BACKEND: never an offer for a service they already buy. */
export function offerFor(user: User): Offer | undefined {
  if (!isClient(user)) return undefined;
  const bought = servicesOf(user.organisationId);
  const o = offers.filter((x) => isLive(x) && !bought.has(x.service) && !offerDismissals.has(`${x.id}:${user.id}`)).sort((a, b) => a.clicks / Math.max(1, a.views) - b.clicks / Math.max(1, b.views))[0];
  if (!o) return undefined;
  const key = `${o.id}:${user.id}`;
  if (!seen.has(key)) {
    seen.add(key);
    o.views += 1;
  }
  return { id: o.id, title: o.title, text: o.text, cta: o.cta };
}

/** POST /offers/{id}/click: count it and create (or add to) a lead for the account manager. */
export function clickOffer(user: User, id: string): { message: string } {
  if (!isClient(user)) throw forbidden('Offers are for clients.');
  const o = offers.find((x) => x.id === id);
  if (!o || !isLive(o)) throw notFound('Offer');
  o.clicks += 1;
  const company = CLIENT_NAME[user.organisationId] ?? user.organisationName;
  const am = clientRows.find((c) => c.organisationId === user.organisationId)?.accountManagerId;
  const open = leads.find((l) => l.email === user.email && ['NEW', 'CONTACTED', 'PROPOSAL', 'NEGOTIATION'].includes(l.stage));
  const activity = { id: uid('la'), at: nowIso(), actor: 'System', kind: 'SYSTEM' as const, text: `${user.name} clicked the offer "${o.title}"` };
  if (open) {
    open.activities.push(activity);
    if (!open.services.includes(o.service)) open.services.push(o.service);
  } else {
    o.leads += 1;
    leads.push({
      id: uid('ld'),
      company,
      contactName: user.name,
      email: user.email,
      source: 'OFFER',
      services: [o.service],
      value: 0,
      valueKind: 'MONTHLY',
      stage: 'NEW',
      stageSince: nowIso(),
      ownerId: am === 'u-mgr' || am === 'u-admin' || am === 'u-admin2' ? am : undefined,
      nextFollowUp: day(1),
      createdAt: nowIso(),
      notes: `Existing client. Interested in ${o.service} after the dashboard offer.`,
      clientId: user.organisationId,
      activities: [activity],
    });
  }
  return { message: 'Thanks! Your account manager will get in touch within one working day.' };
}

/** POST /offers/{id}/dismiss: hides it for this person only. */
export function dismissOffer(user: User, id: string): void {
  if (!isClient(user)) throw forbidden('Offers are for clients.');
  if (!offers.some((x) => x.id === id)) throw notFound('Offer');
  offerDismissals.add(`${id}:${user.id}`);
}

/** GET /offers (admin) */
export function listOffers(user: User): OfferItem[] {
  requireAdminArea(user);
  return offers.map(toItem).sort((a, b) => Number(isLive(b as OfferRow)) - Number(isLive(a as OfferRow)) || b.startDate.localeCompare(a.startDate));
}

function clean(input: OfferInput) {
  const title = input.title?.trim() ?? '';
  const text = input.text?.trim() ?? '';
  const cta = input.cta?.trim() ?? '';
  if (title.length < 3 || title.length > 60) throw badRequest('Title: 3 to 60 characters.');
  // A modest slot: short copy only.
  if (text.length < 10 || text.length > 140) throw badRequest('Text: one line, 10 to 140 characters.');
  if (cta.length < 2 || cta.length > 20) throw badRequest('Button text: up to 20 characters.');
  if (!SERVICES.includes(input.service)) throw badRequest('Choose the service it promotes.');
  if (!DATE_RE.test(input.startDate ?? '') || !DATE_RE.test(input.endDate ?? '') || input.endDate < input.startDate) throw badRequest('Choose a start and an end date.');
  return { title, text, cta, service: input.service, startDate: input.startDate, endDate: input.endDate, active: !!input.active };
}

/** POST /offers */
export function createOffer(user: User, input: OfferInput): OfferItem {
  requireAdminArea(user);
  const row: OfferRow = { id: uid('o'), ...clean(input), views: 0, clicks: 0, leads: 0, createdBy: user.name };
  offers.push(row);
  return toItem(row);
}

/** PUT /offers/{id} */
export function updateOffer(user: User, id: string, input: OfferInput): OfferItem {
  requireAdminArea(user);
  const o = offers.find((x) => x.id === id);
  if (!o) throw notFound('Offer');
  Object.assign(o, clean(input));
  return toItem(o);
}
