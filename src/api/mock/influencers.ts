/**
 * Mock influencer API (Week 7): self sign-up, profile, verification, client discovery,
 * campaigns (brief → invite → accept/counter → draft → approval → live → proof → payout) and payouts.
 *
 * The agency stays in the middle (CLAUDE.md 4.3): clients never get an influencer's contact details or
 * full handles, influencers never see the client's budget or other creators' fees.
 * Comments starting with "BACKEND:" are rules the Spring Boot service must enforce.
 */
import type {
  CampaignCollab,
  CampaignDetail,
  CampaignItem,
  CollabRequest,
  CollabRequestInput,
  DiscoveryCard,
  DiscoveryQuery,
  InfluencerAdminItem,
  InfluencerDashboard,
  InfluencerProfile,
  InfluencerSignup,
  InfluencerTier,
  MyCampaign,
  MyPayouts,
  NewCampaign,
  Payout,
  Platform,
  ProfileInput,
  Session,
  User,
} from '@/types';
import { registerSelfSignup, sendEmail, verifyEmail } from './accounts';
import { clientRows } from './clients';
import { CLIENT_NAME, day, organisations, settings, userById, users } from './data';
import type { UserRow } from './data';
import { expenses } from './data5';
import { AGENCY_MARGIN, campaigns, collabRequests, influencers, PAYOUT_TDS_RATE, payouts, shortlists } from './data7';
import type { CampaignRow, InfluencerRow, PayoutRow } from './data7';
import { badRequest, conflict, forbidden, isAdminArea, isClient, notFound } from './handlers';

const today = () => day(0);
const nowIso = () => new Date().toISOString();
const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PLATFORMS: Platform[] = ['INSTAGRAM', 'YOUTUBE', 'LINKEDIN', 'X'];
export const NICHES = ['Food', 'Lifestyle', 'Fitness', 'Health', 'Beauty', 'Skin care', 'Tech', 'Travel', 'Home', 'Fashion', 'Parenting', 'Finance', 'Education'];
/** ASCI: paid posts carry a clear label at the start or in the first lines of the caption. Lawyer to confirm wording. */
const DISCLOSURE_RE = /#ad\b|#paidpartnership|#sponsored|#collab\b|paid partnership/i;

/* ----------------------------------------------------------------- access */

function requireInfluencer(user: User) {
  if (user.role !== 'INFLUENCER') throw forbidden('This is for creators.');
  const row = influencers.find((i) => i.userId === user.id);
  if (!row) throw notFound('Creator profile');
  return row;
}
// BACKEND: influencer directory is "Full" for Super Admin and Manager (permission matrix).
function requireAdminArea(user: User) {
  if (!isAdminArea(user)) throw forbidden('Only Super Admins and Managers manage influencers.');
}
function requireClient(user: User) {
  if (!isClient(user)) throw forbidden('Discovery is for client accounts.');
}

/* ------------------------------------------------------------------ shape */

export const tierOf = (followers: number): InfluencerTier =>
  followers >= 1_000_000 ? 'MEGA' : followers >= 500_000 ? 'MACRO' : followers >= 100_000 ? 'MID' : followers >= 10_000 ? 'MICRO' : 'NANO';
const maxFollowers = (r: InfluencerRow) => Math.max(0, ...r.platforms.map((p) => p.followers));
const avg = (a: number[]) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : undefined);
const doneCount = (id: string) => campaigns.flatMap((c) => c.collabs).filter((c) => c.influencerId === id && (c.status === 'PAID' || c.status === 'LIVE')).length;

function missingOf(r: InfluencerRow): string[] {
  const m: string[] = [];
  if (r.bio.trim().length < 20) m.push('A short bio (20+ characters)');
  if (!r.city) m.push('City');
  if (!r.languages.length) m.push('Languages');
  if (!r.niches.length) m.push('At least one niche');
  if (!r.platforms.length) m.push('At least one platform');
  if (!(r.rates.reel > 0 && r.rates.story > 0 && r.rates.post > 0)) m.push('Rates for reel, story and post');
  if (!r.insightsFile) m.push('Audience insights screenshot (last 30 days)');
  if (!r.payout) m.push('Payout details (UPI or bank)');
  if (!r.panMasked) m.push('PAN (needed for TDS)');
  if (!r.consentToShare) m.push('Consent to show your profile to brands');
  return m;
}

function toProfile(r: InfluencerRow): InfluencerProfile {
  const missing = missingOf(r);
  return {
    id: r.id,
    name: r.name,
    bio: r.bio,
    city: r.city,
    languages: r.languages,
    niches: r.niches,
    platforms: r.platforms,
    rates: r.rates,
    availability: r.availability,
    verification: r.verification,
    rejectReason: r.rejectReason,
    insightsFile: r.insightsFile,
    consentToShare: r.consentToShare,
    payoutMethod: r.payout,
    panMasked: r.panMasked,
    completeness: Math.round(((10 - missing.length) / 10) * 100),
    missing,
    tier: tierOf(maxFollowers(r)),
    rating: avg(r.ratings),
    campaignsDone: doneCount(r.id),
  };
}

/** Automatic checks for the verification queue (CLAUDE.md: engagement vs followers, audience screenshots). */
const PLATFORM_NAME: Record<Platform, string> = { INSTAGRAM: 'Instagram', YOUTUBE: 'YouTube', LINKEDIN: 'LinkedIn', X: 'X' };

function flagsOf(r: InfluencerRow): string[] {
  const f: string[] = [];
  for (const p of r.platforms) {
    if (p.followers >= 10_000 && p.engagementRate < 1) {
      f.push(`${PLATFORM_NAME[p.platform]} engagement ${p.engagementRate}% is low for ${p.followers.toLocaleString('en-IN')} followers: check for bought followers.`);
    }
    if (p.engagementRate > 15) f.push(`${PLATFORM_NAME[p.platform]} engagement ${p.engagementRate}% is unusually high: ask for insights.`);
  }
  if (!r.insightsFile) f.push('No audience insights uploaded.');
  if (influencers.some((o) => o.id !== r.id && o.platforms.some((p) => r.platforms.some((q) => q.platform === p.platform && q.handle.toLowerCase() === p.handle.toLowerCase())))) {
    f.push('The same handle is on another profile.');
  }
  return f;
}

const toAdmin = (r: InfluencerRow): InfluencerAdminItem => ({
  ...toProfile(r),
  email: r.email,
  phone: r.phone,
  submittedAt: r.submittedAt,
  flags: flagsOf(r),
  hasLogin: !!r.userId,
});

/* ---------------------------------------------------------- sign-up */

/**
 * POST /public/influencers/signup (no session).
 * BACKEND: bot check + rate limit; terms and consent recorded with time and IP (DPDP Act).
 */
export function signUp(input: InfluencerSignup): { email: string } {
  const name = input.name?.trim() ?? '';
  if (name.length < 2) throw badRequest('Enter your name.');
  const email = input.email?.trim().toLowerCase() ?? '';
  if (!EMAIL_RE.test(email)) throw badRequest('Enter a valid email address.');
  if (!/^\+?[0-9 ]{10,15}$/.test(input.phone?.trim() ?? '')) throw badRequest('Enter a mobile number, like +91 98765 43210.');
  if (!input.city?.trim()) throw badRequest('Enter your city.');
  if (!Array.isArray(input.niches) || !input.niches.length || input.niches.some((x) => !NICHES.includes(x))) throw badRequest('Choose at least one niche.');
  if (!PLATFORMS.includes(input.platform)) throw badRequest('Choose your main platform.');
  const handle = input.handle?.trim().replace(/^@/, '') ?? '';
  if (!/^[A-Za-z0-9._-]{2,40}$/.test(handle)) throw badRequest('Enter your handle without spaces.');
  const followers = Math.round(Number(input.followers));
  if (!(followers >= 1000)) throw badRequest('We work with creators who have at least 1,000 followers.');
  if (!input.acceptTerms) throw badRequest('Accept the terms to continue.');
  if (influencers.some((i) => i.platforms.some((p) => p.platform === input.platform && p.handle.toLowerCase() === handle.toLowerCase()))) {
    throw conflict('This handle is already registered. Sign in, or contact us if it is yours.');
  }
  const userId = uid('u-');
  const orgId = uid('org-inf-');
  const row: UserRow = {
    id: userId,
    name,
    email,
    role: 'INFLUENCER',
    organisationId: orgId,
    organisationName: name,
    title: `${input.niches[0]} creator`,
    status: 'INVITED',
    mfaEnabled: false,
    createdAt: nowIso(),
  };
  registerSelfSignup(row, input.password); // throws 409 on an existing email, 400 on a weak password
  organisations.push({ id: orgId, name, kind: 'INFLUENCER' });
  influencers.push({
    id: uid('inf-'),
    userId,
    organisationId: orgId,
    name,
    email,
    phone: input.phone.trim(),
    bio: '',
    city: input.city.trim(),
    languages: [],
    niches: input.niches,
    platforms: [{ platform: input.platform, handle, followers, engagementRate: 0 }],
    rates: { reel: 0, story: 0, post: 0 },
    availability: 'AVAILABLE',
    verification: 'DRAFT',
    consentToShare: !!input.consentToShare,
    ratings: [],
    createdAt: nowIso(),
  });
  return { email };
}

/** POST /public/influencers/verify */
export const verifySignup = (token: string): Session => verifyEmail(token);

/* ---------------------------------------------------------- my profile */

/** GET /me/influencer */
export function myProfile(user: User): InfluencerProfile {
  return toProfile(requireInfluencer(user));
}

function cleanPlatforms(list: unknown): InfluencerRow['platforms'] {
  if (!Array.isArray(list) || !list.length || list.length > 4) throw badRequest('Add one to four platforms.');
  const seen = new Set<string>();
  return list.map((raw) => {
    const p = raw as Partial<InfluencerRow['platforms'][number]>;
    if (!PLATFORMS.includes(p.platform as Platform)) throw badRequest('Unknown platform.');
    if (seen.has(p.platform!)) throw badRequest('Each platform once.');
    seen.add(p.platform!);
    const handle = String(p.handle ?? '').trim().replace(/^@/, '');
    if (!/^[A-Za-z0-9._-]{2,40}$/.test(handle)) throw badRequest(`${p.platform}: enter the handle without spaces.`);
    const followers = Math.round(Number(p.followers));
    const er = Math.round(Number(p.engagementRate) * 10) / 10;
    if (!(followers >= 0) || followers > 500_000_000) throw badRequest(`${p.platform}: followers look wrong.`);
    if (!(er >= 0 && er <= 100)) throw badRequest(`${p.platform}: engagement rate is a percentage.`);
    return { platform: p.platform as Platform, handle, followers, engagementRate: er };
  });
}

/**
 * PATCH /me/influencer
 * BACKEND: payout details and PAN go to a restricted, encrypted table; only masked forms are returned.
 * Changing platforms or follower numbers on a verified profile sends it back for review (hidden from brands meanwhile).
 */
export function updateMyProfile(user: User, input: ProfileInput): InfluencerProfile {
  const r = requireInfluencer(user);
  if (input.name !== undefined) {
    if (input.name.trim().length < 2) throw badRequest('Enter your name.');
    r.name = input.name.trim();
  }
  if (input.bio !== undefined) {
    if (input.bio.length > 500) throw badRequest('Keep the bio under 500 characters.');
    r.bio = input.bio.trim();
  }
  if (input.city !== undefined) r.city = input.city.trim();
  if (input.languages !== undefined) r.languages = input.languages.map((l) => l.trim()).filter(Boolean).slice(0, 6);
  if (input.niches !== undefined) {
    if (input.niches.some((x) => !NICHES.includes(x)) || input.niches.length > 4) throw badRequest('Choose up to four niches from the list.');
    r.niches = input.niches;
  }
  if (input.platforms !== undefined) {
    const next = cleanPlatforms(input.platforms);
    const changed = JSON.stringify(next) !== JSON.stringify(r.platforms);
    r.platforms = next;
    if (changed && r.verification === 'VERIFIED') {
      r.verification = 'PENDING';
      r.submittedAt = nowIso();
    }
  }
  if (input.rates !== undefined) {
    const { reel, story, post } = input.rates;
    for (const [k, v] of Object.entries({ reel, story, post })) if (!(Number(v) >= 0) || Number(v) > 5_000_000) throw badRequest(`Rate for ${k} looks wrong.`);
    r.rates = { reel: Math.round(Number(reel)), story: Math.round(Number(story)), post: Math.round(Number(post)) };
  }
  if (input.availability !== undefined) {
    if (!['AVAILABLE', 'BUSY', 'PAUSED'].includes(input.availability)) throw badRequest('Unknown availability.');
    r.availability = input.availability;
  }
  if (input.consentToShare !== undefined) r.consentToShare = !!input.consentToShare;
  if (input.insightsFile !== undefined) {
    if (!/\.(png|jpe?g|pdf)$/i.test(input.insightsFile)) throw badRequest('Upload a PNG, JPG or PDF screenshot.');
    r.insightsFile = input.insightsFile;
  }
  if (input.payout !== undefined) {
    const p = input.payout;
    if (p.kind === 'UPI') {
      if (!/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(p.upi ?? '')) throw badRequest('UPI ID looks like name@bank.');
      r.payout = { kind: 'UPI', masked: `UPI ••••@${p.upi!.split('@')[1]}` };
    } else if (p.kind === 'BANK') {
      if (!/^\d{9,18}$/.test(p.account ?? '')) throw badRequest('Account number is 9 to 18 digits.');
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test((p.ifsc ?? '').toUpperCase())) throw badRequest('IFSC looks like HDFC0001234.');
      r.payout = { kind: 'BANK', masked: `Bank ••••${p.account!.slice(-4)}` };
    } else throw badRequest('UPI or bank?');
  }
  if (input.pan !== undefined) {
    const pan = input.pan.trim().toUpperCase();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) throw badRequest('PAN looks like ABCDE1234F.');
    r.panMasked = `${pan.slice(0, 5)}••••${pan.slice(-1)}`;
  }
  return toProfile(r);
}

/** POST /me/influencer/submit: send for verification once complete. */
export function submitForVerification(user: User): InfluencerProfile {
  const r = requireInfluencer(user);
  if (r.verification === 'PENDING') throw conflict('Already waiting for review.');
  if (r.verification === 'VERIFIED') throw conflict('Your profile is verified.');
  const missing = missingOf(r);
  if (missing.length) throw badRequest(`Complete your profile first: ${missing.join('; ')}.`);
  r.verification = 'PENDING';
  r.rejectReason = undefined;
  r.submittedAt = nowIso();
  return toProfile(r);
}

/* ------------------------------------------------------ admin: directory */

/** GET /influencers?verification */
export function listInfluencers(user: User, q: { verification?: InfluencerRow['verification']; q?: string } = {}): InfluencerAdminItem[] {
  requireAdminArea(user);
  const needle = q.q?.trim().toLowerCase();
  const ORDER = { PENDING: 0, VERIFIED: 1, DRAFT: 2, REJECTED: 3 };
  return influencers
    .filter((r) => (!q.verification || r.verification === q.verification) && (!needle || `${r.name} ${r.city} ${r.niches.join(' ')}`.toLowerCase().includes(needle)))
    .sort((a, b) => ORDER[a.verification] - ORDER[b.verification] || (a.submittedAt ?? '').localeCompare(b.submittedAt ?? '') || a.name.localeCompare(b.name))
    .map(toAdmin);
}

/** POST /influencers/{id}/verification { decision, reason } */
export function decideVerification(user: User, id: string, decision: 'VERIFY' | 'REJECT', reason?: string): InfluencerAdminItem {
  requireAdminArea(user);
  const r = influencers.find((i) => i.id === id);
  if (!r) throw notFound('Influencer');
  if (r.verification !== 'PENDING') throw conflict('Only profiles waiting for review can be decided.');
  if (decision === 'REJECT') {
    if ((reason?.trim() ?? '').length < 10) throw badRequest('Tell them what to fix (at least a sentence).');
    r.verification = 'REJECTED';
    r.rejectReason = reason!.trim();
  } else if (decision === 'VERIFY') {
    if (!r.insightsFile) throw conflict('Ask for audience insights before verifying.');
    r.verification = 'VERIFIED';
    r.rejectReason = undefined;
  } else throw badRequest('Verify or reject.');
  const u = r.userId ? userById(r.userId) : undefined;
  if (u) {
    sendEmail(
      u.email,
      decision === 'VERIFY' ? 'Your Webinger creator profile is verified' : 'Your Webinger creator profile needs changes',
      decision === 'VERIFY' ? 'Brands working with Webinger can now find you.' : r.rejectReason!,
      '/influencer/profile',
    );
  }
  return toAdmin(r);
}

/* ------------------------------------------------------ client discovery */

const visibleToClients = (r: InfluencerRow) => r.verification === 'VERIFIED' && r.consentToShare && r.availability !== 'PAUSED';
const mask = (h: string) => `@${h.slice(0, 2)}•••`;
const priceFrom = (r: InfluencerRow) => Math.ceil((Math.min(...[r.rates.reel, r.rates.story, r.rates.post].filter((x) => x > 0)) * (1 + AGENCY_MARGIN)) / 500) * 500;

function toCard(r: InfluencerRow, orgId: string): DiscoveryCard {
  return {
    id: r.id,
    name: r.name,
    city: r.city,
    languages: r.languages,
    niches: r.niches,
    tier: tierOf(maxFollowers(r)),
    // BACKEND: never the full handle, email or phone (agency stays in the middle; non-bypass clause).
    platforms: r.platforms.map((p) => ({ platform: p.platform, handleMasked: mask(p.handle), followers: p.followers, engagementRate: p.engagementRate })),
    totalFollowers: r.platforms.reduce((n, p) => n + p.followers, 0),
    bestEngagement: Math.max(0, ...r.platforms.map((p) => p.engagementRate)),
    priceFrom: priceFrom(r),
    rating: avg(r.ratings),
    campaignsDone: doneCount(r.id),
    availability: r.availability,
    shortlisted: shortlists.get(orgId)?.has(r.id) ?? false,
  };
}

/** GET /discovery/influencers. Ranked by rating, then engagement (CLAUDE.md 4.3: ratings feed ranking). */
export function discover(user: User, q: DiscoveryQuery = {}): DiscoveryCard[] {
  requireClient(user);
  const needle = q.q?.trim().toLowerCase();
  return influencers
    .filter(visibleToClients)
    .map((r) => toCard(r, user.organisationId))
    .filter(
      (c) =>
        (!q.niche || c.niches.includes(q.niche)) &&
        (!q.city || c.city.toLowerCase() === q.city.toLowerCase()) &&
        (!q.platform || c.platforms.some((p) => p.platform === q.platform)) &&
        (!q.tier || c.tier === q.tier) &&
        (!q.maxPrice || c.priceFrom <= Number(q.maxPrice)) &&
        (!q.minEngagement || c.bestEngagement >= Number(q.minEngagement)) &&
        (!q.shortlisted || c.shortlisted) &&
        (!needle || `${c.name} ${c.city} ${c.niches.join(' ')}`.toLowerCase().includes(needle)),
    )
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.bestEngagement - a.bestEngagement);
}

/** POST /discovery/shortlist/{id}: toggles; the shortlist is shared by the client's team. */
export function toggleShortlist(user: User, id: string): DiscoveryCard {
  requireClient(user);
  const r = influencers.find((i) => i.id === id);
  if (!r || !visibleToClients(r)) throw notFound('Influencer');
  const set = shortlists.get(user.organisationId) ?? new Set<string>();
  if (set.has(id)) set.delete(id);
  else {
    if (set.size >= 30) throw conflict('Your shortlist is full (30). Remove someone first.');
    set.add(id);
  }
  shortlists.set(user.organisationId, set);
  return toCard(r, user.organisationId);
}

/** POST /discovery/requests: ask the agency to run a collaboration. Never contacts the creator directly. */
export function requestCollab(user: User, input: CollabRequestInput): CollabRequest {
  requireClient(user);
  const ids = [...new Set(input.influencerIds ?? [])];
  if (!ids.length || ids.length > 5) throw badRequest('Choose one to five creators.');
  const picked = ids.map((id) => influencers.find((i) => i.id === id && visibleToClients(i)));
  if (picked.some((p) => !p)) throw badRequest('One of these creators is no longer available.');
  if ((input.brief?.trim() ?? '').length < 20) throw badRequest('Describe what you want in a sentence or two.');
  const budget = Number(input.budget);
  if (!(budget >= 5000)) throw badRequest('Budget starts at ₹5,000.');
  if (!DATE_RE.test(input.startBy ?? '') || input.startBy < today()) throw badRequest('Choose a start date from today.');
  const req: CollabRequest = {
    id: uid('cr'),
    clientId: user.organisationId,
    clientName: CLIENT_NAME[user.organisationId] ?? user.organisationName,
    requestedBy: user.name,
    influencers: picked.map((p) => ({ id: p!.id, name: p!.name })),
    brief: input.brief.trim(),
    budget: Math.round(budget),
    startBy: input.startBy,
    status: 'NEW',
    createdAt: nowIso(),
  };
  collabRequests.unshift(req);
  const am = clientRows.find((c) => c.organisationId === user.organisationId)?.accountManagerId;
  const amUser = am ? userById(am) : undefined;
  sendEmail(amUser?.email ?? 'manager@webinger.in', `Influencer request from ${req.clientName}`, `${req.influencers.map((i) => i.name).join(', ')}: ${req.brief}`, '/admin/influencers?tab=requests');
  return req;
}

/** GET /discovery/requests: the client's own requests. */
export function myCollabRequests(user: User): CollabRequest[] {
  requireClient(user);
  return collabRequests.filter((r) => r.clientId === user.organisationId);
}

/** GET /influencers/requests (admin) */
export function listCollabRequests(user: User): CollabRequest[] {
  requireAdminArea(user);
  return [...collabRequests].sort((a, b) => Number(a.status !== 'NEW') - Number(b.status !== 'NEW') || b.createdAt.localeCompare(a.createdAt));
}

/* --------------------------------------------------------------- campaigns */

const committed = (c: CampaignRow) => c.collabs.filter((x) => x.status !== 'DECLINED').reduce((n, x) => n + x.fee, 0);

function toCampaignItem(c: CampaignRow): CampaignItem {
  return {
    id: c.id,
    title: c.title,
    clientId: c.organisationId,
    clientName: CLIENT_NAME[c.organisationId] ?? c.organisationId,
    status: c.status,
    budget: c.budget,
    committed: committed(c),
    deliverable: c.deliverable,
    createdAt: c.createdAt,
    collabs: c.collabs,
  };
}
const toCampaignDetail = (c: CampaignRow): CampaignDetail => ({ ...toCampaignItem(c), brief: c.brief, hashtags: c.hashtags, dos: c.dos });

function findCampaign(id: string) {
  const c = campaigns.find((x) => x.id === id);
  if (!c) throw notFound('Campaign');
  return c;
}
function findCollab(c: CampaignRow, influencerId: string) {
  const x = c.collabs.find((k) => k.influencerId === influencerId);
  if (!x) throw notFound('Creator in this campaign');
  return x;
}
function notifyInfluencer(influencerId: string, subject: string, body: string) {
  const r = influencers.find((i) => i.id === influencerId);
  const u = r?.userId ? userById(r.userId) : undefined;
  if (u) sendEmail(u.email, subject, body, '/influencer/campaigns');
}

/** GET /campaigns */
export function listCampaigns(user: User): CampaignItem[] {
  requireAdminArea(user);
  const ORDER = { RUNNING: 0, DRAFT: 1, DONE: 2 };
  return campaigns.map(toCampaignItem).sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.createdAt.localeCompare(a.createdAt));
}

/** GET /campaigns/{id} */
export function getCampaign(user: User, id: string): CampaignDetail {
  requireAdminArea(user);
  return toCampaignDetail(findCampaign(id));
}

/** POST /campaigns */
export function createCampaign(user: User, input: NewCampaign): CampaignDetail {
  requireAdminArea(user);
  if (!clientRows.some((c) => c.organisationId === input.clientId)) throw badRequest('Choose a client.');
  if ((input.title?.trim() ?? '').length < 3) throw badRequest('Give the campaign a title.');
  if ((input.brief?.trim() ?? '').length < 20) throw badRequest('Write the brief creators will see.');
  if ((input.deliverable?.trim() ?? '').length < 3) throw badRequest('What should each creator deliver?');
  if (!(Number(input.budget) >= 5000)) throw badRequest('Budget starts at ₹5,000.');
  const c: CampaignRow = {
    id: uid('cm'),
    organisationId: input.clientId,
    title: input.title.trim(),
    brief: input.brief.trim(),
    deliverable: input.deliverable.trim(),
    hashtags: input.hashtags?.trim() ?? '',
    dos: input.dos?.trim() ?? '',
    budget: Math.round(Number(input.budget)),
    status: 'DRAFT',
    createdAt: nowIso(),
    createdBy: user.name,
    collabs: [],
  };
  campaigns.push(c);
  if (input.fromRequestId) {
    const req = collabRequests.find((r) => r.id === input.fromRequestId && r.clientId === input.clientId);
    if (req) {
      req.status = 'IN_PROGRESS';
      req.campaignId = c.id;
    }
  }
  return toCampaignDetail(c);
}

/** POST /campaigns/{id}/invites { influencerId, fee, respondBy, draftDue } */
export function inviteToCampaign(user: User, id: string, input: { influencerId: string; fee: number; respondBy: string; draftDue: string }): CampaignDetail {
  requireAdminArea(user);
  const c = findCampaign(id);
  if (c.status === 'DONE') throw conflict('This campaign is finished.');
  const r = influencers.find((i) => i.id === input.influencerId);
  if (!r) throw badRequest('Unknown creator.');
  // BACKEND: only verified creators can be invited; paused creators are not taking work.
  if (r.verification !== 'VERIFIED') throw conflict(`${r.name} is not verified yet.`);
  if (r.availability === 'PAUSED') throw conflict(`${r.name} has paused new work.`);
  if (c.collabs.some((x) => x.influencerId === r.id && x.status !== 'DECLINED')) throw conflict(`${r.name} is already in this campaign.`);
  const fee = Math.round(Number(input.fee));
  if (!(fee >= 500)) throw badRequest('Enter the fee you are offering.');
  if (committed(c) + fee > c.budget) throw conflict(`That goes over the campaign budget (₹${c.budget.toLocaleString('en-IN')}).`);
  if (!DATE_RE.test(input.respondBy ?? '') || input.respondBy < today()) throw badRequest('Reply-by date must be today or later.');
  if (!DATE_RE.test(input.draftDue ?? '') || input.draftDue < input.respondBy) throw badRequest('The draft is due after the reply-by date.');
  c.collabs = c.collabs.filter((x) => x.influencerId !== r.id);
  c.collabs.push({ influencerId: r.id, influencerName: r.name, fee, status: 'INVITED', respondBy: input.respondBy, draftDue: input.draftDue });
  c.status = 'RUNNING';
  notifyInfluencer(r.id, `New campaign invite: ${c.title}`, `${CLIENT_NAME[c.organisationId]} · ${c.deliverable} · ₹${fee.toLocaleString('en-IN')}. Reply by ${input.respondBy}.`);
  return toCampaignDetail(c);
}

/** POST /campaigns/{id}/collabs/{influencerId}/counter { accept } */
export function decideCounter(user: User, id: string, influencerId: string, accept: boolean): CampaignDetail {
  requireAdminArea(user);
  const c = findCampaign(id);
  const x = findCollab(c, influencerId);
  if (x.status !== 'COUNTERED' || !x.counterFee) throw conflict('No counter offer to decide.');
  if (accept) {
    if (committed(c) - x.fee + x.counterFee > c.budget) throw conflict('Accepting this would go over the campaign budget. Raise the budget or decline.');
    x.fee = x.counterFee;
    x.status = 'ACCEPTED';
  } else {
    x.status = 'DECLINED';
  }
  x.counterFee = undefined;
  notifyInfluencer(x.influencerId, `Counter offer ${accept ? 'accepted' : 'declined'}: ${c.title}`, accept ? `Agreed fee ₹${x.fee.toLocaleString('en-IN')}. Draft due ${x.draftDue}.` : 'Thanks for considering it.');
  return toCampaignDetail(c);
}

/**
 * POST /campaigns/{id}/collabs/{influencerId}/review { decision, feedback }
 * BACKEND: a draft is approved only with the paid-partnership disclosure (ASCI). Phase 3: the client approves too.
 */
export function reviewDraft(user: User, id: string, influencerId: string, decision: 'APPROVE' | 'CHANGES', feedback?: string): CampaignDetail {
  requireAdminArea(user);
  const c = findCampaign(id);
  const x = findCollab(c, influencerId);
  if (x.status !== 'DRAFT_SUBMITTED' || !x.draft) throw conflict('No draft waiting for review.');
  if (decision === 'APPROVE') {
    if (!x.draft.disclosure || !DISCLOSURE_RE.test(x.draft.caption)) throw conflict('The caption needs a clear #ad or paid-partnership label (ASCI) before approval.');
    x.status = 'DRAFT_APPROVED';
    x.feedback = feedback?.trim() || undefined;
  } else if (decision === 'CHANGES') {
    if ((feedback?.trim() ?? '').length < 5) throw badRequest('Say what to change.');
    x.status = 'CHANGES_REQUESTED';
    x.feedback = feedback!.trim();
  } else throw badRequest('Approve or request changes.');
  notifyInfluencer(x.influencerId, `Draft ${decision === 'APPROVE' ? 'approved' : 'needs changes'}: ${c.title}`, decision === 'APPROVE' ? 'You can post it. Share the live link and insights after.' : x.feedback!);
  return toCampaignDetail(c);
}

/** POST /campaigns/{id}/collabs/{influencerId}/rating { rating 1–5 }: after payment; feeds discovery ranking. */
export function rateCollab(user: User, id: string, influencerId: string, rating: number): CampaignDetail {
  requireAdminArea(user);
  const c = findCampaign(id);
  const x = findCollab(c, influencerId);
  if (x.status !== 'PAID' && x.status !== 'LIVE') throw conflict('Rate after the post is live.');
  if (x.rating !== undefined) throw conflict('Already rated.');
  const v = Math.round(Number(rating) * 2) / 2;
  if (!(v >= 1 && v <= 5)) throw badRequest('Rating is 1 to 5.');
  x.rating = v;
  influencers.find((i) => i.id === x.influencerId)?.ratings.push(v);
  return toCampaignDetail(c);
}

/* ---------------------------------------------------- influencer: campaigns */

function toMine(c: CampaignRow, x: CampaignCollab): MyCampaign {
  return {
    id: c.id,
    title: c.title,
    brand: CLIENT_NAME[c.organisationId] ?? '',
    brief: c.brief,
    deliverable: c.deliverable,
    hashtags: c.hashtags,
    dos: c.dos,
    // BACKEND: only this creator's own row; never the budget or other creators' fees.
    collab: x,
  };
}

/** GET /me/campaigns */
export function myCampaigns(user: User): MyCampaign[] {
  const r = requireInfluencer(user);
  return campaigns
    .flatMap((c) => c.collabs.filter((x) => x.influencerId === r.id).map((x) => toMine(c, x)))
    .sort((a, b) => a.collab.draftDue.localeCompare(b.collab.draftDue));
}

function myCollab(user: User, id: string) {
  const r = requireInfluencer(user);
  const c = campaigns.find((x) => x.id === id);
  const x = c?.collabs.find((k) => k.influencerId === r.id);
  if (!c || !x) throw notFound('Campaign');
  return { r, c, x };
}

/** POST /me/campaigns/{id}/respond { action, counterFee } */
export function respondToInvite(user: User, id: string, action: 'ACCEPT' | 'COUNTER' | 'DECLINE', counterFee?: number): MyCampaign {
  const { r, c, x } = myCollab(user, id);
  if (x.status !== 'INVITED') throw conflict('You have already replied.');
  if (x.respondBy < today()) throw conflict('The reply-by date has passed. Contact your Webinger manager if you still want to take part.');
  if (r.verification !== 'VERIFIED') throw conflict('Your profile is under review. You can reply once it is verified again.');
  if (action === 'ACCEPT') x.status = 'ACCEPTED';
  else if (action === 'DECLINE') x.status = 'DECLINED';
  else if (action === 'COUNTER') {
    const fee = Math.round(Number(counterFee));
    if (!(fee > x.fee)) throw badRequest('A counter offer is higher than the fee offered.');
    if (fee > x.fee * 3) throw badRequest('That is more than three times the offer. Talk to your manager instead.');
    x.counterFee = fee;
    x.status = 'COUNTERED';
  } else throw badRequest('Accept, counter or decline.');
  sendEmail('manager@webinger.in', `${r.name} ${x.status.toLowerCase()} "${c.title}"`, x.counterFee ? `Counter: ₹${x.counterFee.toLocaleString('en-IN')}` : '', `/admin/influencers?tab=campaigns&campaign=${c.id}`);
  return toMine(c, x);
}

/** POST /me/campaigns/{id}/draft { caption, fileName, disclosure } */
export function submitDraft(user: User, id: string, input: { caption: string; fileName: string; disclosure: boolean }): MyCampaign {
  const { c, x } = myCollab(user, id);
  if (x.status !== 'ACCEPTED' && x.status !== 'CHANGES_REQUESTED') throw conflict(x.status === 'DRAFT_SUBMITTED' ? 'Your draft is being reviewed.' : 'Accept the invite first.');
  const caption = input.caption?.trim() ?? '';
  if (caption.length < 10) throw badRequest('Add the caption you will post.');
  if (!/\.(mp4|mov|jpe?g|png|pdf)$/i.test(input.fileName ?? '')) throw badRequest('Upload the video or image (MP4, MOV, JPG, PNG or PDF).');
  // ASCI: the disclosure label is required on paid content.
  if (!input.disclosure || !DISCLOSURE_RE.test(caption)) throw badRequest('Paid posts need a clear label: add #ad or "Paid partnership" to the caption and tick the box.');
  x.draft = { caption, fileName: input.fileName, disclosure: true, at: nowIso() };
  x.status = 'DRAFT_SUBMITTED';
  return toMine(c, x);
}

/**
 * POST /me/campaigns/{id}/live { liveUrl, proofFile }
 * Automation rule 17: posting with proof creates the payout request.
 */
export function submitLive(user: User, id: string, input: { liveUrl: string; proofFile: string }): MyCampaign {
  const { r, c, x } = myCollab(user, id);
  if (x.status !== 'DRAFT_APPROVED') throw conflict('Post only after your draft is approved.');
  if (!/^https:\/\/\S+\.\S+/.test(input.liveUrl ?? '')) throw badRequest('Paste the link to the live post (https://…).');
  if (!/\.(png|jpe?g|pdf)$/i.test(input.proofFile ?? '')) throw badRequest('Add an insights screenshot as proof (PNG, JPG or PDF).');
  x.liveUrl = input.liveUrl.trim();
  x.proofFile = input.proofFile;
  x.postedAt = nowIso();
  x.status = 'LIVE';
  const p: PayoutRow = { id: uid('po'), influencerId: r.id, campaignId: c.id, gross: x.fee, tdsRate: PAYOUT_TDS_RATE, status: 'REQUESTED', requestedAt: nowIso() };
  payouts.push(p);
  x.payoutId = p.id;
  return toMine(c, x);
}

/* ------------------------------------------------------------- payouts */

const deputyLimit = () => settings.approvalLimits.deputyPayoutLimit;

function toPayout(p: PayoutRow): Payout {
  const c = campaigns.find((x) => x.id === p.campaignId);
  const tds = Math.round((p.gross * p.tdsRate) / 100);
  return {
    id: p.id,
    influencerId: p.influencerId,
    influencerName: influencers.find((i) => i.id === p.influencerId)?.name ?? '',
    campaignId: p.campaignId,
    campaignTitle: c?.title ?? '',
    brand: c ? CLIENT_NAME[c.organisationId] ?? '' : '',
    gross: p.gross,
    tdsRate: p.tdsRate,
    tds,
    net: p.gross - tds,
    status: p.status,
    requestedAt: p.requestedAt,
    approvedBy: p.approvedBy,
    paidAt: p.paidAt,
    reference: p.reference,
    needsOwner: p.gross > deputyLimit(),
  };
}

/** GET /me/payouts */
export function myPayouts(user: User): MyPayouts {
  const r = requireInfluencer(user);
  const mine = payouts.filter((p) => p.influencerId === r.id).map(toPayout).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const year = today().slice(0, 4);
  return {
    payouts: mine,
    pending: mine.filter((p) => p.status === 'REQUESTED' || p.status === 'APPROVED').reduce((n, p) => n + p.net, 0),
    paidThisYear: mine.filter((p) => p.status === 'PAID' && p.paidAt?.startsWith(year)).reduce((n, p) => n + p.net, 0),
    tdsThisYear: mine.filter((p) => p.status === 'PAID' && p.paidAt?.startsWith(year)).reduce((n, p) => n + p.tds, 0),
    payoutMethod: r.payout,
  };
}

/** GET /payouts */
export function listPayouts(user: User): Payout[] {
  requireAdminArea(user);
  const ORDER = { REQUESTED: 0, APPROVED: 1, PAID: 2, REJECTED: 3 };
  return payouts.map(toPayout).sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.requestedAt.localeCompare(a.requestedAt));
}

/**
 * POST /payouts/{id}/approve
 * BACKEND (rule 17 + deputy mode): within the deputy payout limit a Manager may approve; above it only a
 * Super Admin. Payouts are never automatic.
 */
export function approvePayout(user: User, id: string): Payout {
  requireAdminArea(user);
  const p = payouts.find((x) => x.id === id);
  if (!p) throw notFound('Payout');
  if (p.status !== 'REQUESTED') throw conflict('Only requested payouts can be approved.');
  if (p.gross > deputyLimit() && user.role !== 'SUPER_ADMIN') {
    throw forbidden(`Payouts above ₹${deputyLimit().toLocaleString('en-IN')} need a Super Admin.`);
  }
  p.status = 'APPROVED';
  p.approvedBy = user.name;
  return toPayout(p);
}

/** POST /payouts/{id}/reject { reason } */
export function rejectPayout(user: User, id: string, reason: string): Payout {
  requireAdminArea(user);
  const p = payouts.find((x) => x.id === id);
  if (!p) throw notFound('Payout');
  if (p.status !== 'REQUESTED' && p.status !== 'APPROVED') throw conflict('This payout is closed.');
  if ((reason?.trim() ?? '').length < 5) throw badRequest('Say why, e.g. "Post was taken down".');
  p.status = 'REJECTED';
  p.rejectReason = reason.trim();
  notifyInfluencer(p.influencerId, 'Payout on hold', reason.trim());
  return toPayout(p);
}

/**
 * POST /payouts/{id}/paid { reference }: record the bank/UPI transfer. SUPER_ADMIN only (finance).
 * The gross fee becomes a MEDIA expense; TDS deducted is due to the government (Form 26Q).
 */
export function markPayoutPaid(user: User, id: string, reference: string): Payout {
  if (user.role !== 'SUPER_ADMIN') throw forbidden('Only a Super Admin records money paid out.');
  const p = payouts.find((x) => x.id === id);
  if (!p) throw notFound('Payout');
  if (p.status !== 'APPROVED') throw conflict('Approve the payout first.');
  const r = influencers.find((i) => i.id === p.influencerId)!;
  if (!r.payout) throw conflict(`${r.name} has no payout details on file.`);
  if ((reference?.trim() ?? '').length < 4) throw badRequest('Enter the UTR or transaction reference.');
  p.status = 'PAID';
  p.paidAt = nowIso();
  p.reference = reference.trim();
  const c = campaigns.find((x) => x.id === p.campaignId);
  const x = c?.collabs.find((k) => k.influencerId === p.influencerId);
  if (x) x.status = 'PAID';
  if (c && c.collabs.every((k) => k.status === 'PAID' || k.status === 'DECLINED')) c.status = 'DONE';
  expenses.push({
    id: uid('ex'),
    date: today(),
    category: 'MEDIA',
    vendor: r.name,
    description: `Creator fee: ${c?.title ?? 'campaign'} (${CLIENT_NAME[c?.organisationId ?? ''] ?? ''})`,
    amount: p.gross,
    gst: 0,
    recordedBy: user.name,
  });
  const t = toPayout(p);
  notifyInfluencer(p.influencerId, 'Payout sent', `₹${t.net.toLocaleString('en-IN')} (after ₹${t.tds.toLocaleString('en-IN')} TDS) for ${t.campaignTitle}. Ref ${p.reference}.`);
  return t;
}

/* --------------------------------------------------------- dashboards */

/** Influencer home (Week 1 shape), now from real campaign and payout data. */
export function influencerHome(user: User): InfluencerDashboard {
  const r = requireInfluencer(user);
  const mine = myCampaigns(user);
  const pay = myPayouts(user);
  const STEP: Partial<Record<CampaignCollab['status'], string>> = {
    ACCEPTED: 'Draft due',
    CHANGES_REQUESTED: 'Changes requested',
    DRAFT_SUBMITTED: 'Draft with Webinger for review',
    DRAFT_APPROVED: 'Approved: post and share the link',
    COUNTERED: 'Counter offer sent',
    LIVE: 'Live: payout requested',
  };
  return {
    verification: r.verification === 'VERIFIED' ? 'VERIFIED' : r.verification === 'REJECTED' ? 'REJECTED' : 'PENDING',
    profileCompleteness: toProfile(r).completeness,
    invites: mine
      .filter((m) => m.collab.status === 'INVITED')
      .map((m) => ({ id: m.id, brand: m.brand, campaign: m.title, deliverable: m.deliverable, fee: m.collab.fee, respondBy: m.collab.respondBy })),
    active: mine
      .filter((m) => STEP[m.collab.status])
      .map((m) => ({ id: m.id, brand: m.brand, campaign: m.title, step: STEP[m.collab.status]!, due: m.collab.draftDue })),
    payouts: { pending: pay.pending, paidThisYear: pay.paidThisYear },
  };
}

/** Admin "waiting on you": payouts above the deputy limit need the owner. */
export function payoutsNeedingOwner() {
  return payouts
    .filter((p) => p.status === 'REQUESTED' && p.gross > deputyLimit())
    .map((p) => ({ id: `w-${p.id}`, kind: 'PAYOUT' as const, text: `${toPayout(p).influencerName}: payout of ₹${p.gross.toLocaleString('en-IN')} is above the deputy limit` }));
}

export const creatorUsers = () => users.filter((u) => u.role === 'INFLUENCER');
