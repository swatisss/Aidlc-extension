import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { HostToSidebar, RunSummary, SidebarToHost, WorkflowSummary } from '../shared/types';
import { formatUsd, ProgressBar, StatusBadge, timeAgo } from './components';
import { onMessage, post } from './vscodeApi';

const send = (m: SidebarToHost) => post(m);
const ACTIVE = ['running', 'awaiting_approval', 'awaiting_input', 'paused', 'stopped', 'failed'];
const NEEDS_YOU = ['awaiting_approval', 'awaiting_input', 'failed'];

function WorkflowForm({ wf, onCancel, onStarted }: { wf: WorkflowSummary; onCancel: () => void; onStarted: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(wf.inputs.map((i) => [i.id, i.default ?? (i.type === 'choice' ? (i.options?.[0] ?? '') : '')])),
  );
  const missing = wf.inputs.some((i) => i.required !== false && !values[i.id]?.trim());
  const set = (id: string, v: string) => setValues((s) => ({ ...s, [id]: v }));

  return (
    <form
      className="wf-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (missing) return;
        send({ type: 'start', workflowId: wf.id, inputs: values });
        onStarted(); // collapse the card; the new run shows up under In progress
      }}
    >
      {wf.inputs.map((i) => (
        <label key={i.id}>
          <span>
            {i.label}
            {i.required === false && <em className="muted"> (optional)</em>}
          </span>
          {i.type === 'choice' ? (
            <select value={values[i.id]} onChange={(e) => set(i.id, e.target.value)}>
              {i.options?.map((o) => <option key={o}>{o}</option>)}
            </select>
          ) : i.type === 'multiline' ? (
            <textarea rows={4} value={values[i.id]} onChange={(e) => set(i.id, e.target.value)} />
          ) : (
            <input value={values[i.id]} onChange={(e) => set(i.id, e.target.value)} />
          )}
        </label>
      ))}
      <div className="row">
        <button type="submit" disabled={missing}>
          ▶ Start
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="muted small">
        {wf.stageCount} stages · you review {wf.gateCount} of them before the agent moves on.
      </p>
    </form>
  );
}

function WorkflowCard({ wf, open, onToggle }: { wf: WorkflowSummary; open: boolean; onToggle: () => void }) {
  return (
    <li className={`wf-card ${open ? 'selected' : ''}`}>
      <div className="wf-head" onClick={onToggle} role="button" aria-expanded={open}>
        <span className="wf-icon">{wf.icon ?? '⚙️'}</span>
        <div className="grow">
          <strong>{wf.name}</strong>
          <div className="muted small">{wf.description}</div>
          <div className="flow">
            {wf.phases.map((p, i) => (
              <span key={p}>
                {i > 0 && <span className="arrow">→</span>}
                <span className="phase-chip">{p}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      {open && <WorkflowForm wf={wf} onCancel={onToggle} onStarted={onToggle} />}
    </li>
  );
}

function RunCard({ r }: { r: RunSummary }) {
  return (
    <li className={`run-card ${NEEDS_YOU.includes(r.status) ? 'attention' : ''}`} onClick={() => send({ type: 'openRun', runId: r.id })} title={r.id}>
      <div className="row between">
        <strong className="ellipsis">
          {r.icon ?? '⚙️'} {r.workflowName}
        </strong>
        <StatusBadge status={r.status} />
      </div>
      {r.label && <div className="muted small ellipsis">{r.label}</div>}
      <ProgressBar value={r.status === 'completed' ? r.stageCount : r.stagesDone} total={r.stageCount} />
      <div className="row between muted small">
        <span>
          {r.status === 'completed' ? 'Done' : `Stage ${r.currentStage + 1}/${r.stageCount}`}
          {r.items ? ` · ${r.items.done}/${r.items.total} items` : ''}
        </span>
        <span>
          {formatUsd(r.costUsd)} · {timeAgo(r.updatedAt)}
        </span>
      </div>
    </li>
  );
}

function HowItWorks() {
  return (
    <ol className="how">
      <li>
        <b>Pick a workflow</b> and describe what you want.
      </li>
      <li>
        <b>Answer questions</b> — the agent asks instead of guessing.
      </li>
      <li>
        <b>Review each stage</b> — approve, request changes, or reject. Nothing moves on without you.
      </li>
      <li>
        <b>Get the artifacts</b> — specs, designs, docs and code land in your repo.
      </li>
    </ol>
  );
}

function App() {
  const [state, setState] = useState<HostToSidebar>();
  const [selected, setSelected] = useState<string>();
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const off = onMessage<HostToSidebar>((m) => m.type === 'state' && setState(m));
    send({ type: 'ready' });
    return off;
  }, []);

  if (!state) return <p className="muted">Loading…</p>;

  const needsYou = state.runs.filter((r) => NEEDS_YOU.includes(r.status));
  const active = state.runs.filter((r) => ACTIVE.includes(r.status) && !NEEDS_YOU.includes(r.status));
  const finished = state.runs.filter((r) => !ACTIVE.includes(r.status));

  return (
    <div className="sidebar">
      {!state.hasAuth && (
        <div className="callout">
          <p>
            Uses your Claude Code login, an Anthropic API key, or Bedrock/Vertex (see settings). If runs fail to authenticate, set a key.
          </p>
          <button className="secondary" onClick={() => send({ type: 'setApiKey' })}>
            Set API key
          </button>
        </div>
      )}

      {needsYou.length > 0 && (
        <section>
          <h3>🔔 Needs you</h3>
          <ul className="run-list">
            {needsYou.map((r) => (
              <RunCard key={r.id} r={r} />
            ))}
          </ul>
        </section>
      )}

      {active.length > 0 && (
        <section>
          <h3>In progress</h3>
          <ul className="run-list">
            {active.map((r) => (
              <RunCard key={r.id} r={r} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>Start a workflow</h3>
        <ul className="wf-list">
          {state.workflows.map((wf) => (
            <WorkflowCard key={wf.id} wf={wf} open={selected === wf.id} onToggle={() => setSelected(selected === wf.id ? undefined : wf.id)} />
          ))}
        </ul>
      </section>

      {state.runs.length === 0 ? (
        <section>
          <h3>How it works</h3>
          <HowItWorks />
        </section>
      ) : (
        finished.length > 0 && (
          <section>
            <h3>History</h3>
            <ul className="run-list">
              {(showAll ? finished : finished.slice(0, 5)).map((r) => (
                <RunCard key={r.id} r={r} />
              ))}
            </ul>
            {finished.length > 5 && (
              <button className="link" onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Show less' : `Show all ${finished.length}`}
              </button>
            )}
          </section>
        )
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
