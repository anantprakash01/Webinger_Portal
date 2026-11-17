/**
 * Live updates for messages. Screens subscribe here and never know how updates arrive.
 *
 * Phase 0 (now): polling every few seconds, paused while the tab is hidden.
 * Phase 1: replace the bodies below with a Spring WebSocket (STOMP) client:
 *   subscribeThread → /topic/conversations/{id}  (message.created, message.updated)
 *   subscribeInbox  → /user/queue/inbox          (conversation.updated)
 * The event shapes stay the same, so hooks and screens do not change.
 */
import type { ChatMessage } from '@/types';
import { api } from './client';

export const THREAD_POLL_MS = 4000;
export const INBOX_POLL_MS = 10_000;

export type ThreadEvent = { type: 'created'; message: ChatMessage } | { type: 'updated'; message: ChatMessage };

/** Runs `tick` every `ms` while the page is visible, and once right away when it becomes visible again. */
function poll(tick: () => Promise<void> | void, ms: number): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    if (stopped) return;
    if (typeof document === 'undefined' || !document.hidden) {
      try {
        await tick();
      } catch {
        /* a failed poll is retried on the next tick; screens show their own errors */
      }
    }
    if (!stopped) timer = setTimeout(run, ms);
  };
  const onVisible = () => {
    if (!document.hidden) {
      clearTimeout(timer);
      void run();
    }
  };
  timer = setTimeout(run, ms);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** New messages and changes to existing ones (read receipts, ticket links) in one conversation. */
export function subscribeThread(conversationId: string, onEvent: (e: ThreadEvent) => void): () => void {
  let seen: Map<string, string> | null = null;
  return poll(async () => {
    const msgs = await api.messages.list(conversationId);
    const next = new Map(msgs.map((m) => [m.id, JSON.stringify(m)]));
    if (seen) {
      for (const m of msgs) {
        const before = seen.get(m.id);
        if (before === undefined) onEvent({ type: 'created', message: m });
        else if (before !== next.get(m.id)) onEvent({ type: 'updated', message: m });
      }
    } else {
      // First poll: treat everything as an update so the cache catches up with anything missed.
      for (const m of msgs) onEvent({ type: 'updated', message: m });
    }
    seen = next;
  }, THREAD_POLL_MS);
}

/** Something changed in the caller's conversations (unread counts, last message). */
export function subscribeInbox(onChange: () => void): () => void {
  return poll(onChange, INBOX_POLL_MS);
}
