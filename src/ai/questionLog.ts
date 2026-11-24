import * as React from 'react';
import { readJson, writeJson } from '@/services/storage';

export interface QuestionEntry {
  question: string;
  /** The SQL the AI wrote that passed the compiler. Empty when it did not pass. */
  sql: string;
  at: string;
}

const KEY = 'ssc.ai.questions';
const MAX = 8;

/** The student's own recent English questions, saved in this browser only. Nothing here is pre-filled. */
export function useQuestionLog() {
  const [log, setLog] = React.useState<QuestionEntry[]>(() => {
    const v = readJson<QuestionEntry[]>(KEY, []);
    return Array.isArray(v) ? v.filter((e) => e && typeof e.question === 'string').slice(0, MAX) : [];
  });

  const mounted = React.useRef(false);
  React.useEffect(() => {
    if (mounted.current) writeJson(KEY, log);
    else mounted.current = true;
  }, [log]);

  const add = React.useCallback((question: string, sql: string) => {
    setLog((prev) => [{ question, sql, at: new Date().toISOString() }, ...prev.filter((e) => e.question !== question)].slice(0, MAX));
  }, []);
  const remove = React.useCallback((question: string) => {
    setLog((prev) => prev.filter((e) => e.question !== question));
  }, []);
  const clear = React.useCallback(() => {
    setLog([]);
  }, []);
  return { log, add, remove, clear };
}
