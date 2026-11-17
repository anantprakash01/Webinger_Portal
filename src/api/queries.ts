/**
 * TanStack Query hooks. Screens use these instead of calling `api.*` in effects.
 * Every hook still goes through `api` in ./client, so mock vs http stays one setting.
 */
import { keepPreviousData, QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import { ApiError } from '@/types';
import type {
  AdminDashboard,
  ClientDashboard,
  EmployeeDashboard,
  InfluencerDashboard,
  PartnerDashboard,
} from '@/types';
import type { Area, NewComment, ProjectQuery, TaskDetail, TaskItem, TaskPatch, TaskQuery } from '@/types';
import { api } from './client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // 4xx answers will not change on retry; only retry network and 5xx failures.
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

/** One place for cache keys, so invalidation can target a whole family. */
export const keys = {
  dashboard: (area: Area) => ['dashboard', area] as const,
  projects: (q: ProjectQuery) => ['projects', 'list', q] as const,
  project: (id: string) => ['projects', 'detail', id] as const,
  tasks: (q: TaskQuery) => ['tasks', 'list', q] as const,
  task: (id: string) => ['tasks', 'detail', id] as const,
};

/* ---------- reads ---------- */

interface DashboardByArea {
  admin: AdminDashboard;
  client: ClientDashboard;
  employee: EmployeeDashboard;
  influencer: InfluencerDashboard;
  partner: PartnerDashboard;
}
const DASHBOARD: { [A in Area]: () => Promise<DashboardByArea[A]> } = api.dashboard;

export function useDashboard<A extends Area>(area: A) {
  return useQuery<DashboardByArea[A]>({ queryKey: keys.dashboard(area), queryFn: DASHBOARD[area] });
}

export const useProjects = (q: ProjectQuery) =>
  useQuery({ queryKey: keys.projects(q), queryFn: () => api.projects.list(q), placeholderData: keepPreviousData });

export const useProject = (id: string) => useQuery({ queryKey: keys.project(id), queryFn: () => api.projects.get(id) });

export const useTasks = (q: TaskQuery) => useQuery({ queryKey: keys.tasks(q), queryFn: () => api.tasks.list(q) });

export const useTask = (id: string | null) =>
  useQuery({ queryKey: keys.task(id ?? ''), queryFn: () => api.tasks.get(id!), enabled: !!id });

/* ---------- writes ---------- */

type Snapshot = Array<[QueryKey, unknown]>;

/** After any task write, refresh everything that shows tasks or derived counts. */
function refreshAfterTaskWrite(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ['tasks'] });
  void qc.invalidateQueries({ queryKey: ['projects'] });
  void qc.invalidateQueries({ queryKey: ['dashboard'] });
}

/**
 * PATCH /tasks/{id} with an optimistic update: lists and the open drawer change
 * immediately, and roll back if the server refuses (e.g. the internal review rule).
 */
export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) => api.tasks.update(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ['tasks'] });
      await qc.cancelQueries({ queryKey: ['projects', 'detail'] });
      const snapshot: Snapshot = [
        ...qc.getQueriesData({ queryKey: ['tasks'] }),
        ...qc.getQueriesData({ queryKey: ['projects', 'detail'] }),
      ];
      const apply = <T extends TaskItem>(t: T): T => (t.id === id ? { ...t, ...patch } : t);
      qc.setQueriesData<TaskItem[]>({ queryKey: ['tasks', 'list'] }, (old) => old?.map(apply));
      qc.setQueryData<TaskDetail>(keys.task(id), (old) => (old ? apply(old) : old));
      qc.setQueriesData<{ tasks?: TaskItem[] }>({ queryKey: ['projects', 'detail'] }, (old) =>
        old?.tasks ? { ...old, tasks: old.tasks.map(apply) } : old,
      );
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSuccess: (task) => qc.setQueryData(keys.task(task.id), task),
    onSettled: () => refreshAfterTaskWrite(qc),
  });
}

export function useSetChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, itemId, done }: { id: string; itemId: string; done: boolean }) =>
      api.tasks.setChecklistItem(id, itemId, done),
    onMutate: async ({ id, itemId, done }) => {
      await qc.cancelQueries({ queryKey: keys.task(id) });
      const prev = qc.getQueryData<TaskDetail>(keys.task(id));
      if (prev) {
        const checklist = prev.checklist.map((c) => (c.id === itemId ? { ...c, done } : c));
        qc.setQueryData<TaskDetail>(keys.task(id), { ...prev, checklist, checklistDone: checklist.filter((c) => c.done).length });
      }
      return { prev };
    },
    onError: (_e, { id }, ctx) => ctx?.prev && qc.setQueryData(keys.task(id), ctx.prev),
    onSuccess: (task) => qc.setQueryData(keys.task(task.id), task),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['tasks', 'list'] }),
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: NewComment }) => api.tasks.addComment(id, body),
    onSuccess: (comment, { id }) => {
      qc.setQueryData<TaskDetail>(keys.task(id), (old) =>
        old ? { ...old, comments: [...old.comments, comment], commentCount: (old.commentCount ?? 0) + 1 } : old,
      );
      void qc.invalidateQueries({ queryKey: ['tasks', 'list'] });
    },
  });
}
