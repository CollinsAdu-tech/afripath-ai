// Tracks whether the engine looks like it is waking up (a free host may sleep after a quiet spell and
// take up to a minute to start). Any request that is still waiting after a few seconds counts as "waking".
import { useSyncExternalStore } from 'react';

const slow = new Set<object>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Marks one request as slow. Returns a function that clears it (safe to call more than once). */
export function markSlow(): () => void {
  const token = {};
  slow.add(token);
  emit();
  return () => { if (slow.delete(token)) emit(); };
}

/** Any successful answer proves the engine is awake, so every "waiting" request stops counting as slow. */
export function markAwake(): void {
  if (slow.size === 0) return;
  slow.clear();
  emit();
}

export const isWaking = (): boolean => slow.size > 0;
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function useWaking(): boolean {
  return useSyncExternalStore(subscribe, isWaking, () => false);
}
