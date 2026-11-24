import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import type { TreeNode } from '@/types/compiler';
import { cn } from '@/lib/utils';

export function countNodes(n: TreeNode): number {
  return 1 + n.children.reduce((s, c) => s + countNodes(c), 0);
}

/** Does this node or any descendant match the (lower-cased) query? */
function matches(n: TreeNode, q: string): boolean {
  return n.label.toLowerCase().includes(q) || (n.detail?.toLowerCase().includes(q) ?? false) || n.children.some((c) => matches(c, q));
}

interface NodeProps {
  node: TreeNode;
  depth: number;
  path: string;
  expanded: Set<string>;
  toggle: (path: string) => void;
  query: string;
}

function Node({ node, depth, path, expanded, toggle, query }: NodeProps) {
  if (query && !matches(node, query)) return null;
  const hasChildren = node.children.length > 0;
  const open = hasChildren && (query ? true : expanded.has(path));
  const selfMatch = query !== '' && (node.label.toLowerCase().includes(query) || (node.detail?.toLowerCase().includes(query) ?? false));
  return (
    <li role="treeitem" aria-expanded={hasChildren ? open : undefined} aria-level={depth + 1}>
      <div className="flex items-start gap-1 py-0.5">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => toggle(path)}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${node.label}`}
            className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
          </button>
        ) : (
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-muted-foreground/60" aria-hidden="true">•</span>
        )}
        <span className={cn('min-w-0 break-words rounded px-1 font-mono text-[13px]', selfMatch && 'bg-warning/20')}>
          <span className="font-semibold text-[hsl(var(--indigo))]">{node.label}</span>
          {node.detail && <span className="text-muted-foreground"> {node.detail}</span>}
        </span>
      </div>
      {open && hasChildren && (
        <ul role="group" className="tree-line ml-2.5 pl-2">
          {node.children.map((c, i) => (
            <Node key={`${path}.${i}`} node={c} depth={depth + 1} path={`${path}.${i}`} expanded={expanded} toggle={toggle} query={query} />
          ))}
        </ul>
      )}
    </li>
  );
}

function allPaths(n: TreeNode, path: string, out: string[] = []): string[] {
  if (n.children.length) out.push(path);
  n.children.forEach((c, i) => allPaths(c, `${path}.${i}`, out));
  return out;
}

export interface TreeViewHandle {
  expandAll: () => void;
  collapseAll: () => void;
}

/** Accessible expandable tree. `expandSignal` lets a parent toolbar expand/collapse everything. */
export function TreeView({ root, query = '', expandSignal, defaultDepth = 3 }: { root: TreeNode; query?: string; expandSignal?: { mode: 'expand' | 'collapse'; nonce: number }; defaultDepth?: number }) {
  const initial = React.useMemo(() => {
    const out = new Set<string>();
    const visit = (n: TreeNode, path: string, depth: number) => {
      if (depth < defaultDepth && n.children.length) out.add(path);
      n.children.forEach((c, i) => visit(c, `${path}.${i}`, depth + 1));
    };
    visit(root, '0', 0);
    return out;
  }, [root, defaultDepth]);
  const [expanded, setExpanded] = React.useState<Set<string>>(initial);
  React.useEffect(() => setExpanded(initial), [initial]);
  React.useEffect(() => {
    if (!expandSignal) return;
    setExpanded(expandSignal.mode === 'expand' ? new Set(allPaths(root, '0')) : new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandSignal?.nonce]);
  const toggle = React.useCallback((p: string) => {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  }, []);
  const q = query.trim().toLowerCase();
  const visible = !q || matches(root, q);
  if (!visible) return <p className="p-3 text-sm text-muted-foreground">No nodes match “{query}”.</p>;
  return (
    <ul role="tree" aria-label="Tree" className="p-1">
      <Node node={root} depth={0} path="0" expanded={expanded} toggle={toggle} query={q} />
    </ul>
  );
}
