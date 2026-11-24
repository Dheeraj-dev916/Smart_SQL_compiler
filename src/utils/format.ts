import { format as formatSqlText } from 'sql-formatter';
import type { TreeNode } from '@/types/compiler';

export function formatSql(sql: string): string {
  return formatSqlText(sql, { language: 'postgresql', keywordCase: 'upper', tabWidth: 2 });
}

export function treeToText(node: TreeNode, depth = 0): string {
  const line = `${'  '.repeat(depth)}${node.label}${node.detail ? ` — ${node.detail}` : ''}`;
  return [line, ...node.children.map((c) => treeToText(c, depth + 1))].join('\n');
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '—';
  if (ms < 1) return '<1 ms';
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 1 : 0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
