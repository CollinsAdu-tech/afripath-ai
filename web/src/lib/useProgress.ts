import { useCallback, useState } from 'react';
import { readJson, writeJson } from './storage';

/** Which resources a student has ticked off on one roadmap. Saved in this browser only (localStorage). */
export function useProgress(careerId: string): { done: Set<string>; toggle: (resourceId: string, checked: boolean) => void } {
  const key = `afripath.progress.${careerId}`;
  const [state, setState] = useState<{ key: string; done: Set<string> }>(() => ({ key, done: new Set(readJson<string[]>('local', key, [])) }));
  // Switching to another career loads that career's ticks.
  const current = state.key === key ? state.done : new Set(readJson<string[]>('local', key, []));
  if (state.key !== key) setState({ key, done: current });

  const toggle = useCallback((resourceId: string, checked: boolean) => {
    setState((prev) => {
      const next = new Set(prev.done);
      if (checked) next.add(resourceId); else next.delete(resourceId);
      writeJson('local', prev.key, [...next]);
      return { key: prev.key, done: next };
    });
  }, []);
  return { done: current, toggle };
}
