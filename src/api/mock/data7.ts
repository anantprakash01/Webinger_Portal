/**
 * Week 7 seed: influencers, campaigns, payouts, client collaboration requests, partner briefs and
 * invoices, media contacts, pitches, coverage, vendors and offers. Every person and company is invented.
 */
import type {
  BriefStatus,
  CampaignCollab,
  CollabRequest,
  InfluencerRates,
  PartnerInvoiceStatus,
  PayoutStatus,
  PitchStatus,
  PlatformStat,
  VerificationStatus,
} from '@/types';
import { ago, day, ORG } from './data';

/* ----------------------------------------------------------- influencers */

export interface InfluencerRow {
  id: string;
  /** Login, if the influencer signed up (seeded creators without one were added by staff). */
  userId?: string;
  organisationId: string;
  name: string;
  email: string;
  phone?: string;
  bio: string;
  city: string;
  languages: string[];
  niches: string[];
  platforms: PlatformStat[];
  rates: InfluencerRates;
  availability: 'AVAILABLE' | 'BUSY' | 'PAUSED';
  verification: VerificationStatus;
  rejectReason?: string;
  insightsFile?: string;
  consentToShare: boolean;
  /** Stored encrypted in Phase 3 (separate restricted table); only the masked form leaves the API. */
  payout?: { kind: 'UPI' | 'BANK'; masked: string };
  panMasked?: string;
  ratings: number[];
  createdAt: string;
  submittedAt?: string;
}

const ig = (handle: string, followers: number, er: number): PlatformStat => ({ platform: 'INSTAGRAM', handle, followers, engagementRate: er });
const yt = (handle: string, followers: number, er: number): PlatformStat => ({ platform: 'YOUTUBE', handle, followers, engagementRate: er });
const li = (handle: string, followers: number, er: number): PlatformStat => ({ platform: 'LINKEDIN', handle, followers, engagementRate: er });

let n = 0;
const inf = (r: Omit<InfluencerRow, 'id' | 'organisationId' | 'createdAt' | 'ratings' | 'availability' | 'consentToShare'> & Partial<InfluencerRow>): InfluencerRow => ({
  id: `inf${++n}`,
  organisationId: `org-inf-${n}`,
  createdAt: ago(24 * (200 - n * 9)),
  ratings: [],
  availability: 'AVAILABLE',
  consentToShare: true,
  ...r,
});

export const influencers: InfluencerRow[] = [
  inf({
    id: 'inf-ananya', userId: 'u-inf', organisationId: ORG.CREATOR, name: 'Ananya Rao', email: 'ananya@creator.in', phone: '+91 98111 22334',
    bio: 'Food and lifestyle creator. Honest reviews of Mumbai cafés and home recipes.', city: 'Mumbai', languages: ['English', 'Hindi', 'Marathi'],
    niches: ['Food', 'Lifestyle'], platforms: [ig('ananya.eats', 84_000, 4.6), yt('AnanyaEats', 21_000, 3.1)], rates: { reel: 15_000, story: 4_000, post: 9_000 },
    verification: 'VERIFIED', insightsFile: 'ananya-insights-oct.pdf', payout: { kind: 'UPI', masked: 'UPI ••••@okhdfc' }, panMasked: 'ABCPR••••K', ratings: [5, 4, 5, 4.5],
  }),
  inf({ name: 'Kabir Malhotra', email: 'kabir@fitwithkabir.in', bio: 'Strength coach. Simple home workouts.', city: 'Delhi', languages: ['English', 'Hindi'], niches: ['Fitness', 'Health'],
    platforms: [ig('fitwithkabir', 312_000, 3.2), yt('FitWithKabir', 140_000, 2.4)], rates: { reel: 45_000, story: 12_000, post: 28_000 }, verification: 'VERIFIED', ratings: [4.5, 4] }),
  inf({ name: 'Meher Gill', email: 'meher@glowdiaries.in', bio: 'Skin care routines for Indian skin.', city: 'Bengaluru', languages: ['English', 'Punjabi'], niches: ['Beauty', 'Skin care'],
    platforms: [ig('glowdiaries.meher', 56_000, 5.8)], rates: { reel: 12_000, story: 3_500, post: 7_000 }, verification: 'VERIFIED', ratings: [5, 5] }),
  inf({ name: 'Rohit Iyer', email: 'rohit@techwithrohit.in', bio: 'Gadget reviews in Tamil and English.', city: 'Chennai', languages: ['Tamil', 'English'], niches: ['Tech'],
    platforms: [yt('TechWithRohit', 620_000, 4.1), ig('techwithrohit', 98_000, 2.2)], rates: { reel: 60_000, story: 15_000, post: 35_000 }, verification: 'VERIFIED', ratings: [4] }),
  inf({ name: 'Sneha Kulkarni', email: 'sneha@punefoodtrail.in', bio: 'Pune street food and new openings.', city: 'Pune', languages: ['Marathi', 'English', 'Hindi'], niches: ['Food', 'Travel'],
    platforms: [ig('punefoodtrail', 38_000, 6.4)], rates: { reel: 8_000, story: 2_500, post: 5_000 }, verification: 'VERIFIED', ratings: [4.5, 5, 4.5] }),
  inf({ name: 'Arnav Shah', email: 'arnav@homesbyarnav.in', bio: 'Small-flat interiors on a budget.', city: 'Ahmedabad', languages: ['Gujarati', 'English', 'Hindi'], niches: ['Home', 'Lifestyle'],
    platforms: [ig('homesbyarnav', 145_000, 2.9)], rates: { reel: 22_000, story: 6_000, post: 14_000 }, verification: 'VERIFIED', availability: 'BUSY' }),
  inf({ name: 'Dr. Priyanka Sen', email: 'priyanka@dermtalks.in', bio: 'Dermatologist explaining skin myths.', city: 'Kolkata', languages: ['English', 'Bengali'], niches: ['Health', 'Skin care'],
    platforms: [ig('dermtalks.priyanka', 210_000, 3.6), li('priyanka-sen-derm', 18_000, 1.9)], rates: { reel: 35_000, story: 9_000, post: 20_000 }, verification: 'VERIFIED', ratings: [5] }),
  inf({ name: 'Vikas Rawat', email: 'vikas@mountainmiles.in', bio: 'Treks and slow travel in the Himalaya.', city: 'Dehradun', languages: ['Hindi', 'English'], niches: ['Travel'],
    platforms: [yt('MountainMiles', 88_000, 5.2), ig('mountainmiles', 41_000, 4.4)], rates: { reel: 14_000, story: 3_000, post: 8_000 }, verification: 'VERIFIED' }),
  // Verification queue
  inf({ name: 'Tanya Bose', email: 'tanya@tanyacooks.in', bio: 'Bengali home cooking, quick weeknight meals.', city: 'Kolkata', languages: ['Bengali', 'English'], niches: ['Food'],
    platforms: [ig('tanyacooks', 27_000, 5.1)], rates: { reel: 6_000, story: 1_500, post: 4_000 }, verification: 'PENDING', insightsFile: 'tanya-insights.png',
    payout: { kind: 'UPI', masked: 'UPI ••••@ybl' }, panMasked: 'BQTPB••••L', submittedAt: ago(30) }),
  inf({ name: 'Zayn Qadri', email: 'zayn@zaynstyle.in', bio: 'Menswear and grooming.', city: 'Hyderabad', languages: ['English', 'Urdu', 'Hindi'], niches: ['Fashion', 'Lifestyle'],
    platforms: [ig('zaynstyle', 186_000, 0.6)], rates: { reel: 30_000, story: 8_000, post: 18_000 }, verification: 'PENDING', insightsFile: 'zayn-reach.jpg',
    payout: { kind: 'BANK', masked: 'Bank ••••7781' }, panMasked: 'CZQPQ••••M', submittedAt: ago(26 * 4) }),
  inf({ name: 'Ritika Jain', email: 'ritika@minimalmom.in', bio: 'Parenting and minimal living.', city: 'Jaipur', languages: ['Hindi', 'English'], niches: ['Parenting', 'Lifestyle'],
    platforms: [ig('minimalmom.ritika', 64_000, 1.2)], rates: { reel: 10_000, story: 3_000, post: 6_000 }, verification: 'REJECTED',
    rejectReason: 'Audience screenshot missing; engagement too low for follower count. Re-submit with last 30 days insights.' }),
];

/** Fee shown to clients: influencer rate plus the agency's margin (never shown separately to the client). */
export const AGENCY_MARGIN = 0.25;
/** Default TDS on influencer payouts, percent. CA to confirm (194J professional fee vs 194R benefits). */
export const PAYOUT_TDS_RATE = 10;

/* ---------------------------------------------------------- campaigns */

export interface CampaignRow {
  id: string;
  organisationId: string;
  title: string;
  brief: string;
  deliverable: string;
  hashtags: string;
  dos: string;
  budget: number;
  status: 'DRAFT' | 'RUNNING' | 'DONE';
  createdAt: string;
  createdBy: string;
  collabs: CampaignCollab[];
}

const collab = (c: Partial<CampaignCollab> & Pick<CampaignCollab, 'influencerId' | 'influencerName' | 'fee' | 'status'>): CampaignCollab => ({
  respondBy: day(3),
  draftDue: day(8),
  ...c,
});

export const campaigns: CampaignRow[] = [
  {
    id: 'cm1', organisationId: ORG.TERRA, title: 'Winter menu launch', createdAt: ago(24 * 6), createdBy: 'Kavya Iyer', status: 'RUNNING', budget: 120_000,
    brief: 'Launch the new winter menu (millet bowls, soups) at the Lower Parel and Bandra outlets. Visit, try three dishes, show the cosy seating.',
    deliverable: '1 reel (30–45 s) + 3 stories', hashtags: '#TerraWinter #RealFoodNearYou', dos: 'Tag @terrafoods and the outlet. Mention the ₹299 combo. No competitor names.',
    collabs: [
      collab({ influencerId: 'inf-ananya', influencerName: 'Ananya Rao', fee: 18_000, status: 'INVITED', respondBy: day(2), draftDue: day(9) }),
      collab({ influencerId: 'inf5', influencerName: 'Sneha Kulkarni', fee: 10_000, status: 'DRAFT_SUBMITTED', respondBy: day(-3), draftDue: day(1),
        draft: { caption: 'Winter just got tastier at @terrafoods 🍲 Millet bowls under ₹299! #ad #TerraWinter', fileName: 'sneha-terra-reel-v1.mp4', disclosure: true, at: ago(20) } }),
      collab({ influencerId: 'inf3', influencerName: 'Meher Gill', fee: 12_000, status: 'DECLINED', respondBy: day(-2) }),
    ],
  },
  {
    id: 'cm2', organisationId: ORG.NOVA, title: 'Skin care awareness', createdAt: ago(24 * 20), createdBy: 'Kavya Iyer', status: 'RUNNING', budget: 150_000,
    brief: 'Myth-busting series on acne and pigmentation; drive bookings for a free first consultation at Nova Clinics.',
    deliverable: '1 reel + 1 post', hashtags: '#NovaSkinFacts', dos: 'No before/after claims. Medical claims must match the script Nova approved. Use the paid-partnership label.',
    collabs: [
      collab({ influencerId: 'inf-ananya', influencerName: 'Ananya Rao', fee: 12_000, status: 'DRAFT_APPROVED', respondBy: day(-14), draftDue: day(1),
        draft: { caption: 'Three skin myths I believed for years… @novaclinics #NovaSkinFacts #PaidPartnership', fileName: 'ananya-nova-reel-v2.mp4', disclosure: true, at: ago(30) } }),
      collab({ influencerId: 'inf7', influencerName: 'Dr. Priyanka Sen', fee: 32_000, counterFee: 38_000, status: 'COUNTERED', respondBy: day(1), draftDue: day(10) }),
      collab({ influencerId: 'inf3', influencerName: 'Meher Gill', fee: 12_000, status: 'LIVE', respondBy: day(-15), draftDue: day(-6), liveUrl: 'https://instagram.com/p/demo-meher-nova',
        proofFile: 'meher-nova-insights.png', postedAt: ago(24 * 3), payoutId: 'po1',
        draft: { caption: 'My honest Nova Clinics consult 💬 #ad #NovaSkinFacts', fileName: 'meher-nova-reel.mp4', disclosure: true, at: ago(24 * 8) } }),
    ],
  },
  {
    id: 'cm3', organisationId: ORG.SUNRISE, title: 'Diwali store openings', createdAt: ago(24 * 70), createdBy: 'Isha Mehta', status: 'DONE', budget: 90_000,
    brief: 'Walk-through reels of the new stores in Pune and Nagpur during Diwali week.', deliverable: '1 reel', hashtags: '#SunriseDiwali', dos: 'Show the store front and the festive offers wall.',
    collabs: [
      collab({ influencerId: 'inf5', influencerName: 'Sneha Kulkarni', fee: 9_000, status: 'PAID', respondBy: day(-68), draftDue: day(-60), liveUrl: 'https://instagram.com/p/demo-sneha-sunrise',
        proofFile: 'sneha-sunrise-proof.png', postedAt: ago(24 * 52), payoutId: 'po2', rating: 5,
        draft: { caption: 'Diwali shopping sorted at the new @sunriseretail Pune store ✨ #ad #SunriseDiwali', fileName: 'sneha-sunrise.mp4', disclosure: true, at: ago(24 * 58) } }),
      collab({ influencerId: 'inf-ananya', influencerName: 'Ananya Rao', fee: 15_000, status: 'PAID', respondBy: day(-68), draftDue: day(-60), liveUrl: 'https://instagram.com/p/demo-ananya-sunrise',
        proofFile: 'ananya-sunrise-proof.png', postedAt: ago(24 * 50), payoutId: 'po3', rating: 4.5,
        draft: { caption: 'Festive haul from the new @sunriseretail store 🪔 #ad #SunriseDiwali', fileName: 'ananya-sunrise.mp4', disclosure: true, at: ago(24 * 57) } }),
    ],
  },
];

/* -------------------------------------------------------------- payouts */

export interface PayoutRow {
  id: string;
  influencerId: string;
  campaignId: string;
  gross: number;
  tdsRate: number;
  status: PayoutStatus;
  requestedAt: string;
  approvedBy?: string;
  paidAt?: string;
  reference?: string;
  rejectReason?: string;
}

export const payouts: PayoutRow[] = [
  { id: 'po1', influencerId: 'inf3', campaignId: 'cm2', gross: 12_000, tdsRate: PAYOUT_TDS_RATE, status: 'REQUESTED', requestedAt: ago(24 * 3) },
  { id: 'po2', influencerId: 'inf5', campaignId: 'cm3', gross: 9_000, tdsRate: PAYOUT_TDS_RATE, status: 'PAID', requestedAt: ago(24 * 52), approvedBy: 'Kavya Iyer', paidAt: ago(24 * 45), reference: 'UTR 6612 4401' },
  { id: 'po3', influencerId: 'inf-ananya', campaignId: 'cm3', gross: 15_000, tdsRate: PAYOUT_TDS_RATE, status: 'PAID', requestedAt: ago(24 * 50), approvedBy: 'Rohan Mehta', paidAt: ago(24 * 44), reference: 'UTR 6612 4419' },
  { id: 'po4', influencerId: 'inf-ananya', campaignId: 'cm-old', gross: 45_000, tdsRate: PAYOUT_TDS_RATE, status: 'REQUESTED', requestedAt: ago(24 * 2) },
];
/** A finished campaign from before the portal, so Ananya's statement has history and one payout above the deputy limit. */
campaigns.push({
  id: 'cm-old', organisationId: ORG.TERRA, title: 'Monsoon recipes series', createdAt: ago(24 * 40), createdBy: 'Kavya Iyer', status: 'RUNNING', budget: 60_000,
  brief: 'Three-part recipe series using Terra Foods millets.', deliverable: '3 reels', hashtags: '#TerraMonsoon', dos: 'Use the paid-partnership label.',
  collabs: [
    collab({ influencerId: 'inf-ananya', influencerName: 'Ananya Rao', fee: 45_000, status: 'LIVE', respondBy: day(-38), draftDue: day(-25), liveUrl: 'https://instagram.com/p/demo-ananya-terra',
      proofFile: 'ananya-terra-insights.png', postedAt: ago(24 * 2), payoutId: 'po4',
      draft: { caption: 'Millet khichdi, three ways 🌧️ @terrafoods #ad #TerraMonsoon', fileName: 'ananya-terra-series.mp4', disclosure: true, at: ago(24 * 20) } }),
  ],
});

export const collabRequests: CollabRequest[] = [
  {
    id: 'cr1', clientId: ORG.TERRA, clientName: 'Terra Foods', requestedBy: 'Arjun Kapoor', influencers: [{ id: 'inf2', name: 'Kabir Malhotra' }, { id: 'inf8', name: 'Vikas Rawat' }],
    brief: 'Healthy snacks for trekkers and gym-goers: new protein bars in January.', budget: 150_000, startBy: day(40), status: 'NEW', createdAt: ago(20),
  },
];

/** Client shortlists, per organisation. */
export const shortlists = new Map<string, Set<string>>([[ORG.TERRA, new Set(['inf2', 'inf5'])]]);

/* ----------------------------------------------------- partners and PR */

export interface BriefRow {
  id: string;
  partnerOrgId: string;
  projectId: string;
  title: string;
  description: string;
  due: string;
  fee: number;
  status: BriefStatus;
  submissions: Array<{ id: string; at: string; files: string[]; note: string }>;
  feedback?: string;
  createdBy: string;
}

export const briefs: BriefRow[] = [
  {
    id: 'b1', partnerOrgId: ORG.VENDOR, projectId: 'p1', title: 'Product shoot: 12 dishes', due: day(4), fee: 24_000, status: 'IN_PROGRESS', createdBy: 'Kavya Iyer',
    description: 'Top-down and 45° shots of the 12 winter menu dishes on the brand props. Natural light, Terra palette. 3 edited images per dish, web and print sizes.',
    submissions: [],
  },
  {
    id: 'b2', partnerOrgId: ORG.VENDOR, projectId: 'p5', title: 'Clinic interior photos', due: day(10), fee: 18_000, status: 'NEW', createdBy: 'Kavya Iyer',
    description: 'Interiors of the Indiranagar clinic: reception, two consult rooms, treatment room. Wide and detail shots. No patients in frame.',
    submissions: [],
  },
  {
    id: 'b3', partnerOrgId: ORG.VENDOR, projectId: 's2', title: 'Nagpur store launch photos', due: day(-20), fee: 15_000, status: 'APPROVED', createdBy: 'Meera Pillai',
    description: 'Store front, festive offers wall, opening crowd.', feedback: 'Great set, thank you.',
    submissions: [{ id: 'sb1', at: ago(24 * 22), files: ['nagpur-store-01-40.zip'], note: '40 edited images, web size.' }],
  },
];

export interface PartnerInvoiceRow {
  id: string;
  partnerOrgId: string;
  number: string;
  briefId: string;
  amount: number;
  gst: number;
  status: PartnerInvoiceStatus;
  submittedAt: string;
  decidedBy?: string;
  rejectReason?: string;
  paidAt?: string;
  expenseId?: string;
}

export const partnerInvoices: PartnerInvoiceRow[] = [
  { id: 'pi1', partnerOrgId: ORG.VENDOR, number: 'LW-0441', briefId: 'b3', amount: 15_000, gst: 2_700, status: 'SUBMITTED', submittedAt: ago(24 * 18) },
];

export interface MediaContactRow {
  id: string;
  name: string;
  outlet: string;
  beat: string;
  city: string;
  language: string;
  email: string;
  phone?: string;
  ownerId: string;
  lastContacted?: string;
  lastVerified: string;
  consent: boolean;
  doNotContact: boolean;
}

export const mediaContacts: MediaContactRow[] = [
  { id: 'mc1', name: 'Nandini Rao', outlet: 'Mumbai Food Daily', beat: 'Restaurants', city: 'Mumbai', language: 'English', email: 'nandini@mumbaifooddaily.in', ownerId: 'u-mgr', lastContacted: day(-12), lastVerified: day(-40), consent: true, doNotContact: false },
  { id: 'mc2', name: 'Arvind Pillai', outlet: 'Business Line Weekly', beat: 'Retail', city: 'Bengaluru', language: 'English', email: 'arvind@blweekly.in', phone: '+91 98450 22110', ownerId: 'u-admin', lastContacted: day(-60), lastVerified: day(-220), consent: true, doNotContact: false },
  { id: 'mc3', name: 'Shalini Deshpande', outlet: 'Pune Times Today', beat: 'City and lifestyle', city: 'Pune', language: 'Marathi', email: 'shalini@punetimestoday.in', ownerId: 'u-mgr', lastContacted: day(-35), lastVerified: day(-35), consent: true, doNotContact: false },
  { id: 'mc4', name: 'Imtiaz Khan', outlet: 'HealthWire India', beat: 'Health', city: 'Delhi', language: 'Hindi', email: 'imtiaz@healthwire.in', ownerId: 'u-mgr', lastVerified: day(-90), consent: true, doNotContact: false },
  { id: 'mc5', name: 'Leena Fernandes', outlet: 'Goa Gourmet', beat: 'Food', city: 'Panaji', language: 'English', email: 'leena@goagourmet.in', ownerId: 'u-admin', lastContacted: day(-300), lastVerified: day(-300), consent: false, doNotContact: true },
];

export interface PitchRow {
  id: string;
  title: string;
  organisationId: string;
  recipientIds: string[];
  status: PitchStatus;
  sentAt?: string;
  followUp?: string;
  ownerId: string;
}

export const pitches: PitchRow[] = [
  { id: 'pt1', title: 'Terra Foods launches millet winter menu', organisationId: ORG.TERRA, recipientIds: ['mc1', 'mc3'], status: 'FOLLOW_UP', sentAt: ago(24 * 5), followUp: day(1), ownerId: 'u-mgr' },
  { id: 'pt2', title: 'Sunrise opens 10 stores in 10 cities', organisationId: ORG.SUNRISE, recipientIds: ['mc2', 'mc3'], status: 'COVERED', sentAt: ago(24 * 40), ownerId: 'u-admin' },
  { id: 'pt3', title: 'Nova Clinics: free skin check week', organisationId: ORG.NOVA, recipientIds: ['mc4'], status: 'DRAFT', ownerId: 'u-mgr' },
];

export interface CoverageRow {
  id: string;
  organisationId: string;
  outlet: string;
  headline: string;
  url: string;
  date: string;
  reach: number;
  pitchId?: string;
}

export const coverage: CoverageRow[] = [
  { id: 'cv1', organisationId: ORG.SUNRISE, outlet: 'Pune Times Today', headline: 'Sunrise Retail lights up Baner with festive store', url: 'https://example.com/sunrise-baner', date: day(-36), reach: 85_000, pitchId: 'pt2' },
  { id: 'cv2', organisationId: ORG.SUNRISE, outlet: 'Business Line Weekly', headline: 'How a Pune retailer is opening 10 stores in a quarter', url: 'https://example.com/sunrise-10-stores', date: day(-30), reach: 140_000, pitchId: 'pt2' },
  { id: 'cv3', organisationId: ORG.TERRA, outlet: 'Mumbai Food Daily', headline: 'Five healthy lunch spots in Lower Parel', url: 'https://example.com/lower-parel-lunch', date: day(-70), reach: 52_000 },
];

export interface VendorRow {
  id: string;
  name: string;
  service: string;
  city: string;
  rateNote: string;
  ratings: number[];
  /** Partner organisation, when the vendor has a portal login. */
  organisationId?: string;
  documents: string[];
}

export const vendors: VendorRow[] = [
  { id: 'v1', name: 'Lensworks Studio', service: 'Photography', city: 'Mumbai', rateNote: '₹2,000 per edited image; ₹18,000 a day', ratings: [5, 4.5, 5], organisationId: ORG.VENDOR, documents: ['GST certificate', 'NDA (signed)', 'Rate card 2026'] },
  { id: 'v2', name: 'Frame & Pixel', service: 'Video editing', city: 'Pune', rateNote: '₹3,500 per 30 s reel', ratings: [4], documents: ['NDA (signed)'] },
  { id: 'v3', name: 'PrintRight Pune', service: 'Printing and signage', city: 'Pune', rateNote: 'Quote per job', ratings: [4.5, 4], documents: ['GST certificate'] },
];

/* --------------------------------------------------------------- offers */

export interface OfferRow {
  id: string;
  title: string;
  text: string;
  cta: string;
  service: string;
  startDate: string;
  endDate: string;
  active: boolean;
  views: number;
  clicks: number;
  leads: number;
  createdBy: string;
}

export const offers: OfferRow[] = [
  { id: 'o1', title: 'Add influencer marketing', text: 'Reach food lovers in your city through verified local creators.', cta: 'Learn more', service: 'Influencer marketing', startDate: day(-20), endDate: day(40), active: true, views: 64, clicks: 7, leads: 1, createdBy: 'Rohan Mehta' },
  { id: 'o2', title: 'Get found on Google', text: 'Local SEO for every outlet: more calls and walk-ins.', cta: 'See how', service: 'SEO', startDate: day(-10), endDate: day(50), active: true, views: 31, clicks: 3, leads: 0, createdBy: 'Rohan Mehta' },
  { id: 'o3', title: 'Festive ad boost', text: 'Ads that bring footfall in festive weeks.', cta: 'Plan it', service: 'Paid ads', startDate: day(-60), endDate: day(-5), active: false, views: 112, clicks: 9, leads: 2, createdBy: 'Isha Mehta' },
];
/** Who dismissed which offer (per user, so one person's "hide" doesn't hide it for the team). */
export const offerDismissals = new Set<string>();
