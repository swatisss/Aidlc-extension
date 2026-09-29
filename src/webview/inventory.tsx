import DOMPurify from 'dompurify';
import { useEffect, useMemo, useState } from 'react';
import type { InventoryItem, ItemStatus } from '../shared/types';
import { ProgressBar, StatusBadge } from './components';
import { renderMermaid } from './markdown';

type SortKey = 'priority' | 'name' | 'kind' | 'loc' | 'complexity' | 'status';
const COMPLEXITY = { low: 1, medium: 2, high: 3 } as const;
const STATUS_ORDER: ItemStatus[] = ['in_progress', 'blocked', 'pending', 'done', 'verified', 'skipped'];
const MAX_GRAPH_NODES = 120;

const nodeId = (id: string) => `n_${id.replace(/[^A-Za-z0-9_]/g, '_')}`;
const nodeLabel = (s: string) => s.replace(/["[\](){}<>]/g, ' ');

/** Mermaid flowchart of the inventory, coloured by status. */
export function inventoryGraph(items: InventoryItem[]): string {
  const shown = items.slice(0, MAX_GRAPH_NODES);
  const ids = new Set(shown.map((i) => i.id));
  const lines = ['flowchart LR'];
  for (const i of shown) lines.push(`  ${nodeId(i.id)}["${nodeLabel(i.name)} · ${nodeLabel(i.kind)}"]:::${i.status}`);
  for (const i of shown) for (const d of i.dependsOn ?? []) if (ids.has(d)) lines.push(`  ${nodeId(i.id)} --> ${nodeId(d)}`);
  lines.push(
    '  classDef pending fill:#8884,stroke:#888',
    '  classDef in_progress fill:#1f6feb55,stroke:#1f6feb',
    '  classDef done fill:#2ea04355,stroke:#2ea043',
    '  classDef verified fill:#2ea043aa,stroke:#2ea043',
    '  classDef blocked fill:#f8514955,stroke:#f85149',
    '  classDef skipped fill:#8882,stroke:#888,stroke-dasharray:3',
  );
  return lines.join('\n');
}

function Graph({ items }: { items: InventoryItem[] }) {
  const [svg, setSvg] = useState<string | null>();
  const source = useMemo(() => inventoryGraph(items), [items]);
  useEffect(() => {
    let live = true;
    void renderMermaid(source).then((s) => live && setSvg(s ?? null));
    return () => {
      live = false;
    };
  }, [source]);
  if (svg === undefined) return <p className="muted">Rendering graph…</p>;
  if (svg === null) return <pre>{source}</pre>;
  return (
    <>
      {items.length > MAX_GRAPH_NODES && <p className="muted">Showing the first {MAX_GRAPH_NODES} of {items.length} items.</p>}
      <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ['foreignObject'] }) }} />
    </>
  );
}

export function InventoryView({ items, onOpen }: { items: InventoryItem[]; onOpen: (path: string) => void }) {
  const [mode, setMode] = useState<'table' | 'graph'>('table');
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState<ItemStatus | 'all'>('all');
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'priority', asc: true });

  const counts = useMemo(() => {
    const c = new Map<ItemStatus, number>();
    for (const i of items) c.set(i.status, (c.get(i.status) ?? 0) + 1);
    return c;
  }, [items]);
  const done = (counts.get('done') ?? 0) + (counts.get('verified') ?? 0);

  const rows = useMemo(() => {
    const q = filter.toLowerCase();
    const val = (i: InventoryItem): string | number => {
      switch (sort.key) {
        case 'priority':
          return i.priority ?? 999;
        case 'loc':
          return i.loc ?? -1;
        case 'complexity':
          return i.complexity ? COMPLEXITY[i.complexity] : 0;
        case 'status':
          return STATUS_ORDER.indexOf(i.status);
        default:
          return (i[sort.key] ?? '').toLowerCase();
      }
    };
    return items
      .filter((i) => status === 'all' || i.status === status)
      .filter((i) => !q || `${i.id} ${i.name} ${i.kind} ${i.path ?? ''} ${i.notes ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const x = val(a);
        const y = val(b);
        const c = x < y ? -1 : x > y ? 1 : 0;
        return sort.asc ? c : -c;
      });
  }, [items, filter, status, sort]);

  if (!items.length) {
    return <p className="empty">No inventory yet. The discovery stage fills this in with the programs/modules it finds.</p>;
  }

  const th = (key: SortKey, label: string) => (
    <th onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }))} className="sortable">
      {label}
      {sort.key === key ? (sort.asc ? ' ▲' : ' ▼') : ''}
    </th>
  );

  return (
    <div className="inventory">
      <div className="stat-row">
        <div className="stat">
          <b>{items.length}</b>
          <span>items</span>
        </div>
        <div className="stat">
          <b>{done}</b>
          <span>done</span>
        </div>
        <div className="stat">
          <b>{counts.get('in_progress') ?? 0}</b>
          <span>in progress</span>
        </div>
        <div className="stat">
          <b>{items.reduce((s, i) => s + (i.loc ?? 0), 0).toLocaleString()}</b>
          <span>lines of code</span>
        </div>
        <div className="stat grow">
          <ProgressBar value={done} total={items.length} />
          <span>{items.length ? Math.round((done / items.length) * 100) : 0}% complete</span>
        </div>
      </div>

      <div className="toolbar">
        <div className="segmented">
          <button className={mode === 'table' ? 'on' : ''} onClick={() => setMode('table')}>
            Table
          </button>
          <button className={mode === 'graph' ? 'on' : ''} onClick={() => setMode('graph')}>
            Dependency graph
          </button>
        </div>
        <input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value as ItemStatus | 'all')}>
          <option value="all">All statuses</option>
          {STATUS_ORDER.filter((s) => counts.has(s)).map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')} ({counts.get(s)})
            </option>
          ))}
        </select>
      </div>

      {mode === 'graph' ? (
        <Graph items={rows} />
      ) : (
        <table className="grid">
          <thead>
            <tr>
              {th('priority', '#')}
              {th('name', 'Name')}
              {th('kind', 'Type')}
              {th('loc', 'LOC')}
              {th('complexity', 'Complexity')}
              {th('status', 'Status')}
              <th>Depends on</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id} title={i.notes}>
                <td className="muted">{i.priority ?? ''}</td>
                <td>
                  {i.path ? (
                    <a href="#" onClick={(e) => (e.preventDefault(), onOpen(i.path!))}>
                      {i.name}
                    </a>
                  ) : (
                    i.name
                  )}
                  {i.notes && <div className="muted small ellipsis">{i.notes}</div>}
                </td>
                <td>
                  <span className="chip">{i.kind}</span>
                </td>
                <td className="num">{i.loc ? i.loc.toLocaleString() : ''}</td>
                <td>{i.complexity && <span className={`chip cx-${i.complexity}`}>{i.complexity}</span>}</td>
                <td>
                  <StatusBadge status={i.status} />
                </td>
                <td className="muted small">{(i.dependsOn ?? []).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
