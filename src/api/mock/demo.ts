/**
 * Demo sign-in helpers for the prototype's login page and "View as" switcher.
 * Kept apart from the seed data so a real-API build (VITE_API_MODE=http) doesn't ship the mock data.
 */
import type { Role } from '@/types';

export const DEMO_PASSWORD = 'demo1234';
export const DEMO_MFA_CODE = '123456';

export const demoAccounts: Array<{ role: Role; email: string; note?: string }> = [
  { role: 'SUPER_ADMIN', email: 'admin@webinger.in' },
  { role: 'MANAGER', email: 'manager@webinger.in' },
  { role: 'EMPLOYEE', email: 'priya@webinger.in' },
  { role: 'CLIENT_OWNER', email: 'arjun@terrafoods.in', note: 'Terra Foods' },
  { role: 'CLIENT_REP', email: 'neha@terrafoods.in', note: 'Terra Foods' },
  { role: 'CLIENT_OWNER', email: 'sameer@novaclinics.in', note: 'Nova Clinics' },
  { role: 'CLIENT_OWNER', email: 'farah@sunriseretail.in', note: 'Sunrise, 40 projects' },
  { role: 'INFLUENCER', email: 'ananya@creator.in' },
  { role: 'PARTNER', email: 'hello@lensworks.in' },
];
