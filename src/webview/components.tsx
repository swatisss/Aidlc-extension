import type { ItemStatus, RunStatus, StageStatus, TraceStatus } from '../shared/types';

const LABELS: Record<string, string> = {
  running: 'Running',
  awaiting_approval: 'Needs review',
  awaiting_input: 'Needs input',
  paused: 'Paused',
  stopped: 'Stopped',
  completed: 'Completed',
  rejected: 'Rejected',
  failed: 'Failed',
  pending: 'Pending',
  approved: 'Approved',
  skipped: 'Skipped',
  in_progress: 'In progress',
  done: 'Done',
  verified: 'Verified',
  blocked: 'Blocked',
  extracted: 'Extracted',
  implemented: 'Implemented',
  changed: 'Changed',
  unverified: 'Unverified',
};

export function StatusBadge({ status }: { status: RunStatus | StageStatus | ItemStatus | TraceStatus }) {
  return <span className={`badge badge-${status}`}>{LABELS[status] ?? status}</span>;
}

export const formatUsd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;

export function ProgressBar({ value, total, label }: { value: number; total: number; label?: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="progress" title={label ?? `${value}/${total}`}>
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const short = (p: unknown) => (typeof p === 'string' ? p.split('/').slice(-2).join('/') : '');
const clip = (s: unknown, n = 80) => {
  const str = typeof s === 'string' ? s : '';
  return str.length > n ? `${str.slice(0, n)}…` : str;
};

const count = (list: unknown, noun: string) => {
  if (!Array.isArray(list)) return `some ${noun}s`;
  return `${list.length} ${noun}${list.length === 1 ? '' : 's'}`;
};

/** Present-tense phrase for a permission request: "Allow the agent to <phrase>?" */
export function describeRequest(name: string, inputJson: string): string {
  let input: Record<string, unknown> = {};
  try {
    input = JSON.parse(inputJson) as Record<string, unknown>;
  } catch {
    // Fall through to the generic phrase.
  }
  switch (name.replace(/^mcp__[^_]+__/, '')) {
    case 'Bash':
      return `run ${clip(input.command, 70)}`;
    case 'Edit':
    case 'MultiEdit':
      return `edit ${short(input.file_path)}`;
    case 'Write':
      return `create ${short(input.file_path)}`;
    case 'Read':
      return `read ${short(input.file_path)}`;
    case 'WebFetch':
    case 'WebSearch':
      return `look up ${clip(input.url ?? input.query)}`;
    default:
      return `use ${name}`;
  }
}

/** Turn a raw tool call into a friendly one-line description of what was done. */
export function describeTool(name: string, inputJson: string): { icon: string; label: string } {
  let input: Record<string, unknown> = {};
  try {
    input = JSON.parse(inputJson) as Record<string, unknown>;
  } catch {
    // Clipped or non-JSON input: fall back to the tool name.
  }
  const tool = name.replace(/^mcp__[^_]+__/, '');
  switch (tool) {
    case 'Read':
      return { icon: '📖', label: `Read ${short(input.file_path)}` };
    case 'Glob':
      return { icon: '🗂️', label: `Listed files matching ${clip(input.pattern)}` };
    case 'Grep':
      return { icon: '🔎', label: `Searched for “${clip(input.pattern, 50)}”` };
    case 'Edit':
    case 'MultiEdit':
      return { icon: '✏️', label: `Edited ${short(input.file_path)}` };
    case 'Write':
      return { icon: '📝', label: `Created ${short(input.file_path)}` };
    case 'Bash':
      return { icon: '▶️', label: `Ran ${clip(input.command, 70)}` };
    case 'codegraph_explore':
      return { icon: '🕸️', label: `Explored the code graph: ${clip(input.query ?? input.question, 70)}` };
    case 'write_artifact':
      return { icon: '📄', label: `Wrote ${short(input.path)}` };
    case 'ask_user_question':
      return { icon: '❓', label: `Asked you ${count(input.questions, 'question')}` };
    case 'request_approval':
      return { icon: '✅', label: 'Submitted the stage for your review' };
    case 'update_plan_checklist':
      return { icon: '☑️', label: 'Updated the progress checklist' };
    case 'update_inventory':
      return { icon: '📋', label: `Updated the inventory (${count(input.items, 'item')})` };
    case 'record_traceability':
      return { icon: '🔗', label: `Recorded ${count(input.entries, 'traceability link')}` };
    case 'TodoWrite':
      return { icon: '🗒️', label: 'Updated its to-do list' };
    case 'Task':
    case 'Agent':
      return { icon: '🤖', label: `Delegated: ${clip(input.description)}` };
    case 'WebFetch':
    case 'WebSearch':
      return { icon: '🌐', label: `Looked up ${clip(input.url ?? input.query)}` };
    default:
      return { icon: '🔧', label: tool };
  }
}
