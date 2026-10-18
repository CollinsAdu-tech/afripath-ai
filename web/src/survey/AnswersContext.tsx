import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { readJson, removeKey, writeJson } from '../lib/storage';
import type { AnswerKey, AnswerValue, Answers } from './model';

// Answers live in sessionStorage: this browser tab only, gone when the tab closes.
const KEY = 'afripath.answers.v1';

interface Ctx { answers: Answers; setAnswer: (key: AnswerKey, value: AnswerValue) => void; reset: () => void }
const AnswersCtx = createContext<Ctx | null>(null);

export function AnswersProvider({ children, initial }: { children: ReactNode; initial?: Answers }) {
  const [answers, setAnswers] = useState<Answers>(() => initial ?? readJson<Answers>('session', KEY, {}));
  const setAnswer = useCallback((key: AnswerKey, value: AnswerValue) => {
    setAnswers((prev) => {
      const next: Answers = { ...prev };
      if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) delete next[key];
      else next[key] = value;
      writeJson('session', KEY, next);
      return next;
    });
  }, []);
  const reset = useCallback(() => { removeKey('session', KEY); setAnswers({}); }, []);
  const value = useMemo(() => ({ answers, setAnswer, reset }), [answers, setAnswer, reset]);
  return <AnswersCtx.Provider value={value}>{children}</AnswersCtx.Provider>;
}

export function useAnswers(): Ctx {
  const c = useContext(AnswersCtx);
  if (!c) throw new Error('useAnswers must be used inside <AnswersProvider>');
  return c;
}
