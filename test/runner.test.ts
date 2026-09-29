import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { newRun, upsertById, WorkflowRunner, type AgentBackend, type StageRequest, type StageResult } from '../src/engine/runner';
import { RunStore } from '../src/engine/state';
import { parseWorkflow } from '../src/engine/workflowLoader';
import type { AgentEvent } from '../src/shared/types';

const WF = parseWorkflow(`
id: t
name: Test
description: d
inputs:
  - id: requirement
    label: R
stages:
  - id: one
    name: One
    prompt: one.md
    gate: true
  - id: loop
    name: Loop
    prompt: loop.md
    gate: true
    repeat: true
  - id: last
    name: Last
    prompt: last.md
    gate: false
`);

type Script = (req: StageRequest, emit: (e: AgentEvent) => void) => Promise<StageResult>;

/** Fake SDK backend: each call runs the next scripted behaviour (or a default that approves). */
class FakeBackend implements AgentBackend {
  calls: StageRequest[] = [];
  scripts: Script[] = [];
  async runStage(req: StageRequest, emit: (e: AgentEvent) => void): Promise<StageResult> {
    this.calls.push(req);
    const script = this.scripts.shift();
    if (script) return script(req, emit);
    req.host.requestApproval(`did ${req.stage.id}`, [], false);
    emit({ kind: 'result', costUsd: 0.1, turns: 1, isError: false, text: 'ok' });
    return { sessionId: `s-${this.calls.length}`, costUsd: 0.1, isError: false, text: 'ok' };
  }
}

let dir: string;
let backend: FakeBackend;

function makeRunner(autoApprove = false) {
  const run = newRun(WF, { requirement: 'build a thing' });
  const runner = new WorkflowRunner({
    workflow: WF,
    run,
    backend,
    store: new RunStore(path.join(dir, '.aidlc', 'runs')),
    cwd: dir,
    docsFolder: 'aidlc-docs',
    artifactRoot: 'aidlc-docs/out',
    promptsDir: path.join(dir, 'prompts'),
    autoApprove,
    onChange: () => {},
    onEvent: () => {},
  });
  return { run, runner };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-run-'));
  fs.mkdirSync(path.join(dir, 'prompts'));
  fs.writeFileSync(path.join(dir, 'prompts', 'one.md'), 'Req: {{requirement}} iter {{iteration}}');
  fs.writeFileSync(path.join(dir, 'prompts', 'loop.md'), 'Loop {{iteration}} after:\n{{previousArtifacts}}');
  fs.writeFileSync(path.join(dir, 'prompts', 'last.md'), 'Last');
  fs.writeFileSync(path.join(dir, 'prompts', '_common.md'), 'COMMON');
  backend = new FakeBackend();
});

describe('WorkflowRunner', () => {
  it('stops at a gate and renders the stage prompt', async () => {
    const { run, runner } = makeRunner();
    await runner.start();
    expect(run.status).toBe('awaiting_approval');
    expect(run.stages[0]).toMatchObject({ status: 'awaiting_approval', summary: 'did one', sessionId: 's-1' });
    expect(backend.calls[0].prompt).toBe('Req: build a thing iter 1');
    expect(backend.calls[0].systemAppend).toBe('COMMON');
  });

  it('runs to completion through approvals, repeats and non-gated stages', async () => {
    const { run, runner } = makeRunner();
    await runner.start();
    backend.scripts.push(async (req) => {
      req.host.requestApproval('slice 1', [], true);
      return { sessionId: 'loop-1', costUsd: 0.2, isError: false, text: '' };
    });
    await runner.approve();
    expect(run.currentStage).toBe(1);
    expect(run.stages[1]).toMatchObject({ status: 'awaiting_approval', hasMore: true, iteration: 1 });

    await runner.approve(undefined, true);
    expect(run.stages[1].iteration).toBe(2);
    expect(backend.calls.at(-1)!.prompt).toContain('Loop 2');
    expect(backend.calls.at(-1)!.resumeSessionId).toBeUndefined();

    await runner.approve();
    expect(run.status).toBe('completed');
    expect(run.stages.map((s) => s.status)).toEqual(['approved', 'approved', 'approved']);
  });

  it('revise resumes the same session with the feedback', async () => {
    const { run, runner } = makeRunner();
    await runner.start();
    await runner.revise('add NFRs');
    const call = backend.calls.at(-1)!;
    expect(call.resumeSessionId).toBe('s-1');
    expect(call.prompt).toContain('add NFRs');
    expect(run.status).toBe('awaiting_approval');
  });

  it('does not double-count cumulative cost from a resumed session', async () => {
    const { run, runner } = makeRunner();
    await runner.start(); // session s-1 reports 0.1
    backend.scripts.push(async (req, emit) => {
      req.host.requestApproval('revised', [], false);
      emit({ kind: 'result', costUsd: 0.25, turns: 2, isError: false, text: '' }); // cumulative for s-1
      return { sessionId: 's-1', costUsd: 0.25, isError: false, text: '' };
    });
    await runner.revise('more');
    expect(run.stages[0].costUsd).toBeCloseTo(0.25);
  });

  it('reject ends the run', async () => {
    const { run, runner } = makeRunner();
    await runner.start();
    runner.reject('wrong direction');
    expect(run.status).toBe('rejected');
    expect(fs.readFileSync(path.join(dir, 'aidlc-docs', 'audit.md'), 'utf8')).toContain('wrong direction');
  });

  it('auto-approve skips gates', async () => {
    const { run, runner } = makeRunner(true);
    await runner.start();
    expect(run.status).toBe('completed');
  });

  it('marks the run failed on an agent error and can resume', async () => {
    const { run, runner } = makeRunner();
    backend.scripts.push(async () => ({ sessionId: 'x', costUsd: 0, isError: true, text: 'error_max_turns' }));
    await runner.start();
    expect(run.status).toBe('failed');
    expect(run.stages[0].error).toBe('error_max_turns');
    await runner.resume();
    expect(backend.calls.at(-1)!.resumeSessionId).toBe('x');
    expect(run.status).toBe('awaiting_approval');
  });

  it('routes ask_user_question through the UI and back', async () => {
    const { run, runner } = makeRunner();
    let answers: Record<string, string> = {};
    backend.scripts.push(async (req) => {
      answers = await req.host.askUser([{ id: 'db', question: 'Which DB?', options: ['Postgres', 'SQLite'] }]);
      req.host.requestApproval('done', [], false);
      return { sessionId: 'q', costUsd: 0, isError: false, text: '' };
    });
    const started = runner.start();
    await new Promise((r) => setTimeout(r, 0));
    expect(run.status).toBe('awaiting_input');
    const pending = runner.view().pendingQuestion!;
    expect(pending.questions[0].question).toBe('Which DB?');
    runner.answer(pending.requestId, { db: 'Postgres' });
    await started;
    expect(answers).toEqual({ db: 'Postgres' });
    expect(run.status).toBe('awaiting_approval');
  });

  it('stop aborts the stage and leaves it resumable', async () => {
    const { run, runner } = makeRunner();
    backend.scripts.push(
      (req) =>
        new Promise((resolve) =>
          req.signal.addEventListener('abort', () => resolve({ sessionId: 'z', costUsd: 0, isError: false, text: 'aborted' })),
        ),
    );
    const started = runner.start();
    await new Promise((r) => setTimeout(r, 0));
    runner.stop();
    await started;
    expect(run.status).toBe('stopped');
    expect(run.stages[0].status).toBe('pending');
  });

  it('confines write_artifact to the artifact root', async () => {
    const { run, runner } = makeRunner();
    let escaped: unknown;
    backend.scripts.push(async (req) => {
      req.host.writeArtifact('inception/req.md', '# hi');
      req.host.writeArtifact('aidlc-docs/out/already-prefixed.md', 'x');
      req.host.writeArtifact('out/leaf-repeated.md', 'x'); // repeats the root's last folder
      try {
        req.host.writeArtifact('../../etc/passwd', 'x');
      } catch (e) {
        escaped = e;
      }
      req.host.requestApproval('done', [], false);
      return { sessionId: 'w', costUsd: 0, isError: false, text: '' };
    });
    await runner.start();
    expect(fs.readFileSync(path.join(dir, 'aidlc-docs/out/inception/req.md'), 'utf8')).toBe('# hi');
    expect(fs.existsSync(path.join(dir, 'aidlc-docs/out/already-prefixed.md'))).toBe(true);
    expect(escaped).toBeInstanceOf(Error);
    expect(fs.existsSync(path.join(dir, 'aidlc-docs/out/leaf-repeated.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'aidlc-docs/out/out'))).toBe(false);
    expect(run.stages[0].artifacts).toEqual(['aidlc-docs/out/inception/req.md', 'aidlc-docs/out/already-prefixed.md', 'aidlc-docs/out/leaf-repeated.md']);
  });

  it('upserts inventory and traceability, keeping fields not given in an update', async () => {
    const { run, runner } = makeRunner();
    backend.scripts.push(async (req) => {
      req.host.updateInventory(
        [
          { id: 'A', name: 'PAYROLL', kind: 'program', loc: 100, status: 'pending', dependsOn: ['B'] },
          { id: 'B', name: 'EMPREC', kind: 'copybook', status: 'pending' },
        ],
        false,
      );
      req.host.updateInventory([{ id: 'A', name: 'PAYROLL', kind: 'program', status: 'done' }], false);
      req.host.recordTraces([{ id: 'BR-1', description: 'OT 1.5x', source: 'a.cbl:10', status: 'extracted' }]);
      req.host.recordTraces([{ id: 'BR-1', description: 'OT 1.5x', target: 'A.java:5', status: 'implemented' }]);
      req.host.requestApproval('done', [], false);
      return { sessionId: 'i', costUsd: 0, isError: false, text: '' };
    });
    await runner.start();
    expect(run.inventory).toEqual([
      { id: 'A', name: 'PAYROLL', kind: 'program', loc: 100, status: 'done', dependsOn: ['B'] },
      { id: 'B', name: 'EMPREC', kind: 'copybook', status: 'pending' },
    ]);
    expect(run.traces).toEqual([{ id: 'BR-1', description: 'OT 1.5x', source: 'a.cbl:10', target: 'A.java:5', status: 'implemented' }]);
    // Persisted with the run.
    expect(new RunStore(path.join(dir, '.aidlc', 'runs')).load(run.id)?.inventory).toHaveLength(2);
  });

  it('replace=true drops inventory items not in the new list', () => {
    const list = upsertById([{ id: 'A', v: 1 }, { id: 'B', v: 2 }] as { id: string; v?: number }[], [{ id: 'B' }], true);
    expect(list).toEqual([{ id: 'B', v: 2 }]);
  });

  it('passes earlier artifacts to later stages', async () => {
    const { runner } = makeRunner();
    backend.scripts.push(async (req) => {
      req.host.writeArtifact('a.md', 'x');
      req.host.requestApproval('done', [], false);
      return { sessionId: 'a', costUsd: 0, isError: false, text: '' };
    });
    await runner.start();
    await runner.approve();
    expect(backend.calls.at(-1)!.prompt).toContain('- aidlc-docs/out/a.md');
  });
});

describe('RunStore', () => {
  it('round-trips runs and turns interrupted runs into paused ones', () => {
    const store = new RunStore(path.join(dir, 'runs'));
    const run = newRun(WF, { requirement: 'r' });
    run.status = 'running';
    run.stages[0].status = 'running';
    store.save(run);
    const [loaded] = store.list();
    expect(loaded.id).toBe(run.id);
    expect(loaded.status).toBe('paused');
    expect(loaded.stages[0].status).toBe('pending');
  });
});
