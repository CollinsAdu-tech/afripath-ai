import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiProblem } from '../api/client';

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: ApiProblem };

/** Runs an abortable request when `key` changes; `reload()` runs it again. Stale responses are ignored. */
export function useAsync<T>(run: (signal: AbortSignal) => Promise<T>, key: string): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    const ctl = new AbortController();
    setState({ status: 'loading' });
    runRef.current(ctl.signal).then(
      (data) => { if (!ctl.signal.aborted) setState({ status: 'ready', data }); },
      (e: unknown) => {
        if (ctl.signal.aborted) return;
        setState({ status: 'error', error: e instanceof ApiProblem ? e : new ApiProblem('server', 'Something went wrong. Please try again.') });
      },
    );
    return () => ctl.abort();
  }, [key, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
