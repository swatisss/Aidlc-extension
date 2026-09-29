import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AgentEvent, HostToPanel, PanelToHost, PendingPermission, PendingQuestion, RunView, StageState } from '../shared/types';
import { describeRequest, describeTool, formatUsd, ProgressBar, StatusBadge } from './components';
import { InventoryView } from './inventory';
import { Markdown } from './markdown';
import { TraceabilityView } from './traceability';
import { onMessage, post } from './vscodeApi';

const send = (m: PanelToHost) => post(m);

type Tab = 'activity' | 'review' | 'inventory' | 'trace' | 'artifacts';
type Artifacts = Record<string, { content?: string; error?: string }>;

const dirname = (p: string) => p.split('/').slice(0, -1).join('/');
/** Resolve a relative Markdown link against the document it appears in. */
function resolveLink(from: string, href: string): string {
  const parts = (href.startsWith('/') ? href.slice(1) : `${dirname(from)}/${href}`).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p && p !== '.') out.push(p);
  }
  return out.join('/').split('#')[0];
}

// ---------- header ----------

function PhaseStepper({ view }: { view: RunView }) {
  const phases = useMemo(() => {
    const out: { name: string; stages: number[] }[] = [];
    view.workflow.stages.forEach((s, i) => {
      const name = s.phase ?? s.name;
      const last = out.at(-1);
      if (last?.name === name) last.stages.push(i);
      else out.push({ name, stages: [i] });
    });
    return out;
  }, [view.workflow.stages]);
  const { run } = view;
  return (
    <ol className="stepper">
      {phases.map((p) => {
        const allDone = p.stages.every((i) => run.stages[i].status === 'approved');
        const current = p.stages.includes(run.currentStage) && run.status !== 'completed';
        return (
          <li key={p.name} className={allDone ? 'done' : current ? 'current' : ''}>
            <span className="dot">{allDone ? '✓' : ''}</span>
            <span className="label">{p.name}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Header({ view }: { view: RunView }) {
  const { run, workflow } = view;
  const done = run.stages.filter((s) => s.status === 'approved').length;
  const total = run.stages.reduce((s, x) => s + x.costUsd, 0);
  const working = run.status === 'running' || run.status === 'awaiting_input';
  const stageName = workflow.stages[run.currentStage]?.name;
  return (
    <header className="run-header">
      <div className="row between">
        <div className="title">
          <span className="wf-icon">{workflow.icon ?? '⚙️'}</span>
          <div>
            <h2>{workflow.name}</h2>
            <div className="muted small">
              {run.status === 'completed' ? 'All stages complete' : `Stage ${run.currentStage + 1} of ${run.stages.length}: ${stageName}`} ·{' '}
              {formatUsd(total)}
            </div>
          </div>
        </div>
        <div className="row">
          <StatusBadge status={run.status} />
          {working && (
            <button className="danger" onClick={() => send({ type: 'stop' })}>
              ■ Stop
            </button>
          )}
          {['paused', 'stopped', 'failed'].includes(run.status) && <button onClick={() => send({ type: 'resume' })}>▶ Resume</button>}
        </div>
      </div>
      <ProgressBar value={done} total={run.stages.length} />
      <PhaseStepper view={view} />
    </header>
  );
}

// ---------- activity ----------

type ToolResultEvent = Extract<AgentEvent, { kind: 'tool_result' }>;

/** One feed row. Memoized so a new event appended to the feed doesn't reconcile every earlier row. */
const EventRow = memo(function EventRow({ event: e, result: r, working }: { event: AgentEvent; result?: ToolResultEvent; working: boolean }) {
  switch (e.kind) {
    case 'text':
      return (
        <div className="feed-text">
          <span className="avatar">✦</span>
          <Markdown text={e.text} />
        </div>
      );
    case 'tool_use': {
      const d = describeTool(e.name, e.input);
      return (
        <details className={`feed-tool ${r?.isError ? 'error' : ''}`}>
          <summary>
            <span className="icon">{d.icon}</span>
            <span className="ellipsis">{d.label}</span>
            {r?.isError && <span className="chip error">error</span>}
            {!r && working && <span className="spinner" />}
          </summary>
          <div className="tool-detail">
            <div className="muted small">{e.name}</div>
            <pre>{e.input}</pre>
            {r && <pre className={r.isError ? 'error' : ''}>{r.text}</pre>}
          </div>
        </details>
      );
    }
    case 'tool_result':
      return null;
    case 'result':
      return (
        <div className={`feed-divider ${e.isError ? 'error' : ''}`}>
          {e.isError ? 'Stage ended with an error' : 'Agent finished'} · {e.turns} turns · {formatUsd(e.costUsd)}
        </div>
      );
    case 'info':
      return e.text.startsWith('▶') ? <div className="feed-stage">{e.text.slice(1).trim()}</div> : <div className="feed-info">{e.text}</div>;
    case 'error':
      return <div className="feed-info error">{e.text}</div>;
  }
});

function Activity({ events, working, waiting }: { events: AgentEvent[]; working: boolean; waiting: boolean }) {
  const results = useMemo(() => {
    const m = new Map<string, ToolResultEvent>();
    for (const e of events) if (e.kind === 'tool_result') m.set(e.id, e);
    return m;
  }, [events]);

  if (!events.length) return <p className="empty">No live activity in this window. Resume the run to continue.</p>;

  return (
    <div className="feed">
      {events.map((e) =>
        e.kind === 'tool_result' ? null : (
          <EventRow key={e.seq} event={e} result={e.kind === 'tool_use' ? results.get(e.id) : undefined} working={working} />
        ),
      )}
      {working && !waiting && (
        <div className="feed-info pulse">
          <span className="spinner" /> Agent is working…
        </div>
      )}
    </div>
  );
}

// ---------- review ----------

function QuestionForm({ q }: { q: PendingQuestion }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const toggle = (id: string, opt: string, multi?: boolean) =>
    setAnswers((a) => {
      if (!multi) return { ...a, [id]: opt };
      const cur = new Set((a[id] ?? '').split(', ').filter(Boolean));
      if (cur.has(opt)) cur.delete(opt);
      else cur.add(opt);
      return { ...a, [id]: [...cur].join(', ') };
    });
  return (
    <form
      className="card action"
      onSubmit={(e) => {
        e.preventDefault();
        send({ type: 'answer', requestId: q.requestId, answers });
      }}
    >
      <h3>❓ The agent has {q.questions.length === 1 ? 'a question' : `${q.questions.length} questions`}</h3>
      <p className="muted small">Pick an option or type your own answer. Anything left blank is treated as “use your best judgment”.</p>
      {q.questions.map((item, n) => (
        <fieldset key={item.id}>
          <legend>
            {n + 1}. {item.question}
          </legend>
          <div className="options">
            {item.options?.map((opt) => {
              const checked = (answers[item.id] ?? '').split(', ').includes(opt);
              return (
                <label key={opt} className={`option ${checked ? 'on' : ''}`}>
                  <input type={item.multiSelect ? 'checkbox' : 'radio'} name={item.id} checked={checked} onChange={() => toggle(item.id, opt, item.multiSelect)} />
                  {opt}
                </label>
              );
            })}
          </div>
          <input
            placeholder={item.options?.length ? 'Or type your own answer' : 'Your answer'}
            onChange={(e) => setAnswers((a) => ({ ...a, [item.id]: e.target.value }))}
          />
        </fieldset>
      ))}
      <button type="submit">Send answers</button>
    </form>
  );
}

function PermissionCard({ p }: { p: PendingPermission }) {
  return (
    <div className="card action warn">
      <h3>
        {describeTool(p.toolName, p.input).icon} Allow the agent to {describeRequest(p.toolName, p.input)}?
      </h3>
      <p className="muted small">This tool ({p.toolName}) isn’t pre-approved for this stage, so it needs your OK.</p>
      <pre>{p.input}</pre>
      <div className="row">
        <button onClick={() => send({ type: 'permission', requestId: p.requestId, allow: true })}>Allow</button>
        <button className="secondary" onClick={() => send({ type: 'permission', requestId: p.requestId, allow: false })}>
          Deny
        </button>
      </div>
    </div>
  );
}

function ArtifactPreview({ path, artifacts, onSelect }: { path: string; artifacts: Artifacts; onSelect: (p: string) => void }) {
  const a = artifacts[path];
  return (
    <div className="preview">
      <div className="preview-bar">
        <span className="mono ellipsis">{path}</span>
        <span className="row">
          <button className="link" onClick={() => send({ type: 'readArtifact', path })}>
            ↻ Refresh
          </button>
          <button className="link" onClick={() => send({ type: 'openArtifact', path })}>
            ↗ Open in editor
          </button>
        </span>
      </div>
      {!a ? (
        <p className="muted">Loading…</p>
      ) : a.error ? (
        <p className="error">Can’t preview: {a.error}</p>
      ) : path.endsWith('.md') ? (
        <Markdown text={a.content ?? ''} onLink={(href) => onSelect(resolveLink(path, href))} />
      ) : (
        <pre className="code">{a.content}</pre>
      )}
    </div>
  );
}

function ArtifactChips({ paths, selected, onSelect }: { paths: string[]; selected?: string; onSelect: (p: string) => void }) {
  if (!paths.length) return null;
  return (
    <div className="chips">
      {paths.map((p) => (
        <button key={p} className={`chip-btn ${selected === p ? 'on' : ''}`} onClick={() => onSelect(p)} title={p}>
          📄 {p.split('/').pop()}
        </button>
      ))}
    </div>
  );
}

function Gate({ view, st, artifacts, selected, onSelect }: { view: RunView; st: StageState; artifacts: Artifacts; selected?: string; onSelect: (p: string) => void }) {
  const [feedback, setFeedback] = useState('');
  const def = view.workflow.stages[view.run.currentStage];
  const next = view.workflow.stages[view.run.currentStage + 1];
  const repeatable = def.repeat && st.hasMore;
  return (
    <div className="card action gate">
      <div className="row between">
        <h3>👀 Review: {def.name}</h3>
        {st.iteration > 1 && <span className="chip">iteration {st.iteration}</span>}
      </div>
      <Markdown text={st.summary || '_No summary._'} />
      {st.artifacts.length > 0 && (
        <>
          <div className="muted small">Produced in this stage — click to preview:</div>
          <ArtifactChips paths={st.artifacts} selected={selected} onSelect={onSelect} />
          {selected && <ArtifactPreview path={selected} artifacts={artifacts} onSelect={onSelect} />}
        </>
      )}
      <textarea
        rows={3}
        placeholder="Feedback for the agent — required for “Request changes”, optional when approving"
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
      />
      <div className="row wrap">
        {repeatable && (
          <button onClick={() => send({ type: 'approve', feedback: feedback || undefined, repeat: true })}>✓ Approve & do next {def.name.toLowerCase()}</button>
        )}
        <button className={repeatable ? 'secondary' : ''} onClick={() => send({ type: 'approve', feedback: feedback || undefined })}>
          ✓ {next ? 'Approve & continue' : 'Approve & finish'}
        </button>
        <button className="secondary" disabled={!feedback.trim()} onClick={() => send({ type: 'revise', feedback })}>
          ✎ Request changes
        </button>
        <button className="danger" onClick={() => send({ type: 'reject', feedback: feedback || undefined })}>
          ✕ Reject
        </button>
      </div>
      <p className="muted small">
        {next ? (
          <>
            Next: <b>{next.name}</b>
            {repeatable ? ' (or another iteration of this stage)' : ''}
          </>
        ) : (
          'This is the last stage.'
        )}
      </p>
    </div>
  );
}

// ---------- artifacts tab ----------

function ArtifactsTab({ view, artifacts, selected, onSelect }: { view: RunView; artifacts: Artifacts; selected?: string; onSelect: (p: string) => void }) {
  const groups = view.workflow.stages
    .map((def, i) => ({ name: def.name, paths: view.run.stages[i].artifacts }))
    .filter((g) => g.paths.length);
  if (!groups.length) return <p className="empty">No artifacts yet. Documents the agent writes will appear here.</p>;
  return (
    <div className="split">
      <nav className="file-list">
        {groups.map((g) => (
          <div key={g.name}>
            <div className="group">{g.name}</div>
            {g.paths.map((p) => (
              <a key={p} href="#" className={selected === p ? 'on' : ''} onClick={(e) => (e.preventDefault(), onSelect(p))} title={p}>
                {p.split('/').pop()}
              </a>
            ))}
          </div>
        ))}
      </nav>
      <div className="split-main">{selected ? <ArtifactPreview path={selected} artifacts={artifacts} onSelect={onSelect} /> : <p className="empty">Select a document to preview it.</p>}</div>
    </div>
  );
}

// ---------- stage list ----------

function StageList({ view }: { view: RunView }) {
  return (
    <ol className="stage-list">
      {view.workflow.stages.map((def, i) => {
        const st = view.run.stages[i];
        const icon =
          st.status === 'approved' ? '✓' : st.status === 'running' ? '●' : st.status === 'awaiting_approval' ? '!' : st.status === 'failed' ? '✕' : '';
        return (
          <li key={def.id} className={`${i === view.run.currentStage ? 'current' : ''} st-${st.status}`}>
            <span className="st-icon">{icon}</span>
            <div className="grow">
              <div>
                {def.name}
                {st.iteration > 1 && <span className="muted"> ×{st.iteration}</span>}
              </div>
              <div className="muted small">
                {def.gate ? 'review gate' : 'automatic'}
                {st.costUsd > 0 ? ` · ${formatUsd(st.costUsd)}` : ''}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ---------- app ----------

function App() {
  const [view, setView] = useState<RunView>();
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [tab, setTab] = useState<Tab>('activity');
  const [artifacts, setArtifacts] = useState<Artifacts>({});
  const [selected, setSelected] = useState<string>();
  const bottom = useRef<HTMLDivElement>(null);
  const lastAttention = useRef<string | undefined>(undefined);

  const select = (p: string) => {
    setSelected(p);
    send({ type: 'readArtifact', path: p });
  };

  useEffect(() => {
    const off = onMessage<HostToPanel>((m) => {
      if (m.type === 'view') {
        setView(m.view);
        setEvents(m.view.events);
      } else if (m.type === 'event') {
        setEvents((ev) => [...ev, m.event]);
      } else if (m.type === 'artifact') {
        setArtifacts((a) => ({ ...a, [m.path]: { content: m.content, error: m.error } }));
      }
    });
    send({ type: 'ready' });
    return off;
  }, []);

  // Jump to the Review tab whenever the run starts waiting on the user.
  let attention: string | undefined;
  if (view) {
    const cur = view.run.stages[view.run.currentStage];
    attention =
      view.pendingPermission?.requestId ??
      view.pendingQuestion?.requestId ??
      (view.run.status === 'awaiting_approval' ? `gate:${cur.id}:${cur.iteration}:${cur.summary?.length}` : undefined);
  }
  useEffect(() => {
    if (attention && attention !== lastAttention.current) {
      setTab('review');
      setSelected(undefined); // start each review without a stale preview
    }
    lastAttention.current = attention;
  }, [attention]);

  useEffect(() => {
    if (tab === 'activity') bottom.current?.scrollIntoView({ block: 'end' });
  }, [events.length, tab]);

  if (!view) return <p className="muted pad">Loading…</p>;
  const { run } = view;
  const st = run.stages[run.currentStage];
  const working = run.status === 'running' || run.status === 'awaiting_input';
  const needsYou = attention !== undefined;
  const allArtifacts = [...new Set(run.stages.flatMap((s) => s.artifacts))];

  const tabs: [Tab, string, number | string | undefined][] = [
    ['activity', 'Activity', undefined],
    ['review', 'Review', needsYou ? '●' : undefined],
    ['inventory', 'Portfolio', run.inventory?.length || undefined],
    ['trace', 'Traceability', run.traces?.length || undefined],
    ['artifacts', 'Documents', allArtifacts.length || undefined],
  ];

  return (
    <div className="panel">
      <aside>
        <StageList view={view} />
        <div className="inputs">
          {Object.entries(run.inputs)
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <div className="muted small">{k}</div>
                <div className="small clamp">{v}</div>
              </div>
            ))}
        </div>
      </aside>
      <main>
        <Header view={view} />
        {needsYou && tab !== 'review' && (
          <button className="banner" onClick={() => setTab('review')}>
            🔔 The agent is waiting for you — open Review
          </button>
        )}
        <nav className="tabs">
          {tabs.map(([id, label, badge]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              {label}
              {badge !== undefined && <span className={`tab-badge ${badge === '●' ? 'alert' : ''}`}>{badge}</span>}
            </button>
          ))}
        </nav>
        <section className="tab-body">
          {tab === 'activity' && (
            <>
              <Activity events={events} working={working} waiting={needsYou} />
              <div ref={bottom} />
            </>
          )}
          {tab === 'review' && (
            <>
              {view.pendingPermission && <PermissionCard p={view.pendingPermission} />}
              {view.pendingQuestion && <QuestionForm key={view.pendingQuestion.requestId} q={view.pendingQuestion} />}
              {run.status === 'awaiting_approval' && (
                <Gate key={`${st.id}-${st.iteration}-${st.summary?.length}`} view={view} st={st} artifacts={artifacts} selected={selected} onSelect={select} />
              )}
              {run.status === 'failed' && st.error && (
                <div className="card error">
                  <h3>Stage failed</h3>
                  <pre>{st.error}</pre>
                  <button onClick={() => send({ type: 'resume' })}>▶ Retry stage</button>
                </div>
              )}
              {run.status === 'completed' && (
                <div className="card success">
                  <h3>🎉 Workflow completed</h3>
                  <p>Everything was approved. The documents it produced:</p>
                  <ArtifactChips paths={allArtifacts} selected={selected} onSelect={(p) => (select(p), setTab('artifacts'))} />
                </div>
              )}
              {!needsYou && run.status !== 'failed' && run.status !== 'completed' && (
                <p className="empty">Nothing needs your attention right now. You’ll be brought here when the agent has a question or a stage is ready for review.</p>
              )}
            </>
          )}
          {tab === 'inventory' && <InventoryView items={run.inventory ?? []} onOpen={(p) => send({ type: 'openLocation', ref: p })} />}
          {tab === 'trace' && (
            <TraceabilityView
              entries={run.traces ?? []}
              onOpen={(ref) => send({ type: 'openLocation', ref })}
              onSideBySide={(left, right) => send({ type: 'sideBySide', left, right })}
            />
          )}
          {tab === 'artifacts' && <ArtifactsTab view={view} artifacts={artifacts} selected={selected} onSelect={select} />}
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
