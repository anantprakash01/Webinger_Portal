/**
 * The only module that talks to the backend. Components never call fetch directly.
 *
 * VITE_API_MODE=mock  → answers from src/api/mock (Phase 0)
 * VITE_API_MODE=http  → calls the Spring Boot API (Phase 1+)
 *
 * Switching a module from mock to real is a change here, not in any screen.
 */
import { ApiError } from '@/types';
import type {
  AdminDashboard,
  ApiProblem,
  ClientDashboard,
  EmployeeDashboard,
  InfluencerDashboard,
  NewComment,
  PartnerDashboard,
  ProjectDetail,
  ProjectPage,
  ProjectQuery,
  Session,
  TaskComment,
  TaskDetail,
  TaskItem,
  TaskPatch,
  TaskQuery,
  User,
} from '@/types';
import * as mock from './mock/handlers';

const MODE = (import.meta.env.VITE_API_MODE ?? 'mock') as 'mock' | 'http';
const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
const DELAY = Number(import.meta.env.VITE_MOCK_DELAY_MS ?? 350);

export const isMock = MODE === 'mock';

/* ---------- session held in memory, mirrored for page reloads ---------- */
// Phase 0 keeps the mock session in sessionStorage so a refresh keeps you signed in.
// Phase 1: keep the access token in memory only and restore it from the
// httpOnly refresh cookie via POST /auth/refresh. Never put tokens in localStorage.
const KEY = 'webinger.mock.session';
let current: Session | null = null;
try {
  const raw = sessionStorage.getItem(KEY);
  if (raw && isMock) current = JSON.parse(raw) as Session;
} catch {
  current = null;
}
const remember = (s: Session | null) => {
  current = s;
  try {
    if (s && isMock) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage can be unavailable in private modes; memory still works */
  }
};
export const getSession = () => current;

/* ---------- transport ---------- */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fromMock<T>(fn: (user: User) => T): Promise<T> {
  await wait(DELAY);
  if (!current) throw new ApiError({ status: 401, title: 'Unauthorized', detail: 'Please sign in again.' });
  return structuredClone(fn(current.user));
}

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(current ? { Authorization: `Bearer ${current.accessToken}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    let problem: ApiProblem = { status: res.status, title: res.statusText };
    try {
      problem = { ...problem, ...(await res.json()) };
    } catch {
      /* body was not JSON */
    }
    throw new ApiError(problem);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** Builds ?a=1&b=2 from an object, skipping empty values. */
function qs(params: object): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
const enc = encodeURIComponent;

/* ---------- endpoints (one per path in docs/api/openapi.yaml) ---------- */
export const api = {
  auth: {
    async login(email: string, password: string): Promise<Session> {
      const s = isMock
        ? (await wait(DELAY), mock.login(email, password))
        : await http<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      remember(s);
      return s;
    },
    async logout(): Promise<void> {
      if (!isMock) await http<void>('/auth/logout', { method: 'POST' }).catch(() => undefined);
      remember(null);
    },
  },
  dashboard: {
    admin: () => (isMock ? fromMock(mock.adminDashboard) : http<AdminDashboard>('/dashboard/admin')),
    client: () => (isMock ? fromMock(mock.clientDashboard) : http<ClientDashboard>('/dashboard/client')),
    employee: () => (isMock ? fromMock(mock.employeeDashboard) : http<EmployeeDashboard>('/dashboard/employee')),
    influencer: () => (isMock ? fromMock(mock.influencerDashboard) : http<InfluencerDashboard>('/dashboard/influencer')),
    partner: () => (isMock ? fromMock(mock.partnerDashboard) : http<PartnerDashboard>('/dashboard/partner')),
  },
  projects: {
    list: (q: ProjectQuery = {}) =>
      isMock ? fromMock((u) => mock.listProjects(u, q)) : http<ProjectPage>(`/projects${qs(q)}`),
    get: (id: string) => (isMock ? fromMock((u) => mock.getProject(u, id)) : http<ProjectDetail>(`/projects/${enc(id)}`)),
  },
  tasks: {
    list: (q: TaskQuery = {}) => (isMock ? fromMock((u) => mock.listTasks(u, q)) : http<TaskItem[]>(`/tasks${qs(q)}`)),
    get: (id: string) => (isMock ? fromMock((u) => mock.getTask(u, id)) : http<TaskDetail>(`/tasks/${enc(id)}`)),
    update: (id: string, patch: TaskPatch) =>
      isMock
        ? fromMock((u) => mock.patchTask(u, id, patch))
        : http<TaskDetail>(`/tasks/${enc(id)}`, json('PATCH', patch)),
    setChecklistItem: (id: string, itemId: string, done: boolean) =>
      isMock
        ? fromMock((u) => mock.setChecklistItem(u, id, itemId, done))
        : http<TaskDetail>(`/tasks/${enc(id)}/checklist/${enc(itemId)}`, json('PATCH', { done })),
    addComment: (id: string, body: NewComment) =>
      isMock
        ? fromMock((u) => mock.addComment(u, id, body))
        : http<TaskComment>(`/tasks/${enc(id)}/comments`, json('POST', body)),
  },
};
