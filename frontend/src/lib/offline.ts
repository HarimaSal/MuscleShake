import { api } from '../api';

export type PendingOp =
  | { id: string; kind: 'set'; itemId: string; payload: any; label: string }
  | { id: string; kind: 'finish'; payload: any; label: string }
  | { id: string; kind: 'item'; exerciseId: string; label: string }
  | { id: string; kind: 'itemNote'; itemId: string; note: string; label: string };

const key = (sessionId: string) => `fitlog.pending.${sessionId}`;

export function loadPending(sessionId: string): PendingOp[] {
  try {
    const raw = localStorage.getItem(key(sessionId));
    return raw ? (JSON.parse(raw) as PendingOp[]) : [];
  } catch {
    return [];
  }
}

export function savePending(sessionId: string, ops: PendingOp[]) {
  localStorage.setItem(key(sessionId), JSON.stringify(ops));
  window.dispatchEvent(new CustomEvent('fitlog:pending', { detail: { sessionId, count: ops.length } }));
}

export function enqueue(sessionId: string, op: PendingOp) {
  const ops = loadPending(sessionId);
  ops.push(op);
  savePending(sessionId, ops);
}

export function removePending(sessionId: string, id: string) {
  savePending(
    sessionId,
    loadPending(sessionId).filter((op) => op.id !== id),
  );
}

export function pendingCount(sessionId: string): number {
  return loadPending(sessionId).length;
}

export async function flushPending(sessionId: string): Promise<{ synced: number; remaining: number }> {
  const ops = loadPending(sessionId);
  let synced = 0;
  for (const op of ops) {
    try {
      if (op.kind === 'set') {
        await api.post(`/api/sessions/${sessionId}/items/${op.itemId}/sets`, op.payload);
      } else if (op.kind === 'finish') {
        await api.patch(`/api/sessions/${sessionId}`, op.payload);
      } else if (op.kind === 'item') {
        await api.post(`/api/sessions/${sessionId}/items`, { exerciseId: op.exerciseId });
      } else if (op.kind === 'itemNote') {
        await api.patch(`/api/sessions/${sessionId}/items/${op.itemId}`, { note: op.note });
      }
      removePending(sessionId, op.id);
      synced += 1;
    } catch {
      break;
    }
  }
  return { synced, remaining: loadPending(sessionId).length };
}
