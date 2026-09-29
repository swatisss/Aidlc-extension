import { useMemo, useState } from 'react';
import type { TraceEntry, TraceStatus } from '../shared/types';
import { ProgressBar, StatusBadge } from './components';

const ORDER: TraceStatus[] = ['extracted', 'implemented', 'verified', 'changed', 'unverified'];

function Ref({ value, onOpen }: { value?: string; onOpen: (ref: string) => void }) {
  if (!value) return <span className="muted">—</span>;
  return (
    <a href="#" className="ref" title={value} onClick={(e) => (e.preventDefault(), onOpen(value))}>
      {value.split('/').slice(-2).join('/')}
    </a>
  );
}

export function TraceabilityView({
  entries,
  onOpen,
  onSideBySide,
}: {
  entries: TraceEntry[];
  onOpen: (ref: string) => void;
  onSideBySide: (left: string, right: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const counts = useMemo(() => {
    const c = new Map<TraceStatus, number>();
    for (const e of entries) c.set(e.status, (c.get(e.status) ?? 0) + 1);
    return c;
  }, [entries]);

  if (!entries.length) {
    return (
      <p className="empty">
        No traceability links yet. Business rules and requirements appear here as the agent extracts them, linked to the legacy source, the new code
        and the tests that cover them.
      </p>
    );
  }

  const q = filter.toLowerCase();
  const rows = entries.filter((e) => !q || `${e.id} ${e.description} ${e.source ?? ''} ${e.target ?? ''}`.toLowerCase().includes(q));
  const covered = (counts.get('implemented') ?? 0) + (counts.get('verified') ?? 0) + (counts.get('changed') ?? 0);

  return (
    <div className="trace">
      <div className="stat-row">
        {ORDER.filter((s) => counts.has(s)).map((s) => (
          <div className="stat" key={s}>
            <b>{counts.get(s)}</b>
            <span>{s}</span>
          </div>
        ))}
        <div className="stat grow">
          <ProgressBar value={covered} total={entries.length} />
          <span>
            {covered}/{entries.length} carried into the new code
          </span>
        </div>
      </div>
      <div className="toolbar">
        <input placeholder="Filter rules…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <table className="grid">
        <thead>
          <tr>
            <th>Id</th>
            <th>Rule / requirement</th>
            <th>Legacy source</th>
            <th>New code</th>
            <th>Test</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}>
              <td className="mono">{e.id}</td>
              <td>{e.description}</td>
              <td>
                <Ref value={e.source} onOpen={onOpen} />
              </td>
              <td>
                <Ref value={e.target} onOpen={onOpen} />
              </td>
              <td>
                <Ref value={e.test} onOpen={onOpen} />
              </td>
              <td>
                <StatusBadge status={e.status} />
              </td>
              <td>
                {e.source && e.target && (
                  <button className="link" title="Open legacy and new code side by side" onClick={() => onSideBySide(e.source!, e.target!)}>
                    ⇆ Compare
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
