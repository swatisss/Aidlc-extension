// Runs inside the VS Code extension host against the fixture repo created by runTest.mjs.
// Drives real workflows through the real Agent SDK, auto-answering questions and permissions.
import { execFile } from 'node:child_process';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { AidlcApi } from '../src/extension';
import type { WorkflowRunner } from '../src/engine/runner';
import type { RunStatus } from '../src/shared/types';

const repo = process.env.AIDLC_TEST_REPO!;
const shotsDir = process.env.AIDLC_TEST_SCREENSHOTS;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Console output from the extension host is forwarded asynchronously and can be lost when
// VS Code shuts down, so also append synchronously to a file next to the fixture.
const logFile = path.join(path.dirname(repo), 'integration.log');
const log = (...a: unknown[]) => {
  const line = a.map((x) => (x instanceof Error ? (x.stack ?? x.message) : typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  fs.appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`);
  console.log('[aidlc-it]', ...a);
};
process.on('exit', (code) => log(`extension host exiting (code ${code})`));
const exists = (rel: string) => fs.existsSync(path.join(repo, rel));

async function screenshot(name: string): Promise<void> {
  if (!shotsDir) return;
  fs.mkdirSync(shotsDir, { recursive: true });
  await sleep(1500);
  await new Promise((r) => execFile('screencapture', ['-x', path.join(shotsDir, `${name}.png`)], r));
}

/** Poll a run, auto-answering questions (first option) and allowing tool permissions, until `done`. */
async function drive(runner: WorkflowRunner, done: (s: RunStatus) => boolean, timeoutMs = 8 * 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = runner.view();
    if (v.pendingQuestion) {
      const answers = Object.fromEntries(
        v.pendingQuestion.questions.map((q) => [q.id, q.options?.[0] ?? 'Keep it minimal; use your best judgment.']),
      );
      log('answering', v.pendingQuestion.questions.map((q) => q.question));
      runner.answer(v.pendingQuestion.requestId, answers);
    }
    if (v.pendingPermission) {
      log('allowing', v.pendingPermission.toolName, v.pendingPermission.input.slice(0, 120));
      runner.answerPermission(v.pendingPermission.requestId, true);
    }
    if (done(v.run.status)) return;
    if (v.run.status === 'failed') {
      throw new Error(`run failed at stage ${v.run.stages[v.run.currentStage].id}: ${v.run.stages[v.run.currentStage].error}`);
    }
    await sleep(500);
  }
  throw new Error(`timed out; status=${runner.run.status} stage=${runner.run.stages[runner.run.currentStage].id}`);
}

/** Approve every gate until the run completes. */
async function approveThrough(runner: WorkflowRunner, maxGates = 20): Promise<void> {
  for (let i = 0; i < maxGates; i++) {
    await drive(runner, (s) => s === 'awaiting_approval' || s === 'completed');
    if (runner.run.status === 'completed') return;
    const st = runner.run.stages[runner.run.currentStage];
    log(`gate: ${st.id} (iteration ${st.iteration}) $${st.costUsd.toFixed(3)} — ${st.summary?.slice(0, 160).replace(/\n/g, ' ')}`);
    void runner.approve(undefined, st.hasMore === true);
    await sleep(300);
  }
  throw new Error('too many gates');
}

function totalCost(runner: WorkflowRunner): number {
  return runner.run.stages.reduce((s, x) => s + x.costUsd, 0);
}

const tests: [string, (api: AidlcApi) => Promise<void>][] = [
  [
    'activates, registers commands and loads workflows',
    async (api) => {
      const cmds = await vscode.commands.getCommands(true);
      for (const c of ['aidlc.startWorkflow', 'aidlc.resumeRun', 'aidlc.stopRun', 'aidlc.setApiKey', 'aidlc.openArtifacts']) {
        assert.ok(cmds.includes(c), `missing command ${c}`);
      }
      assert.deepEqual(
        api.manager.listWorkflows().map((w) => w.id).sort(),
        ['aidlc-full', 'generate-docs', 'implement-feature', 'legacy-migration'],
      );
      await vscode.commands.executeCommand('workbench.view.extension.aidlc');
      await screenshot('01-sidebar');
    },
  ],
  [
    'generate-docs: plan gate → docs written → index gate → completed, SHA recorded',
    async (api) => {
      const id = await api.manager.start('generate-docs', { scope: '.', audience: 'All of the above', outputFolder: 'docs' });
      api.openRun(id);
      const runner = api.manager.runner(id)!;
      await drive(runner, (s) => s === 'awaiting_approval');
      assert.equal(runner.run.stages[0].id, 'discovery');
      assert.ok(exists('docs/_doc-plan.md'), 'doc plan written');
      await screenshot('02-docs-plan-gate');
      await approveThrough(runner);
      for (const f of ['docs/architecture.md', 'docs/README.md']) assert.ok(exists(f), `${f} written`);
      assert.ok(exists('.aidlc/state/generate-docs.json'), 'git SHA recorded for incremental runs');
      assert.ok(exists('aidlc-docs/audit.md'), 'audit log written');
      assert.equal(fs.readFileSync(path.join(repo, 'calc.py'), 'utf8').includes('def add'), true, 'source untouched');
      const cgUsed = runner.events.filter((e) => e.kind === 'tool_use' && e.name.includes('codegraph')).length;
      log(`generate-docs done: $${totalCost(runner).toFixed(3)}, codegraph calls: ${cgUsed}`);
      assert.ok(runner.events.some((e) => e.kind === 'info' && e.text.includes('CodeGraph: index ready')), 'codegraph index built');
      assert.ok(cgUsed > 0, 'agent used codegraph_explore');
    },
  ],
  [
    'implement-feature: edits real code through all gates',
    async (api) => {
      const id = await api.manager.start('implement-feature', {
        feature: 'Add a subtract(a, b) function to calc.py and a unit test for it in test_calc.py. Nothing else.',
        constraints: 'Keep the change minimal. Use python3 -m unittest to run tests.',
      });
      api.openRun(id);
      const runner = api.manager.runner(id)!;
      await drive(runner, (s) => s === 'awaiting_approval');
      await screenshot('03-feature-spec-gate');
      await approveThrough(runner);
      const calc = fs.readFileSync(path.join(repo, 'calc.py'), 'utf8');
      assert.match(calc, /def subtract\(/, 'subtract implemented');
      assert.match(fs.readFileSync(path.join(repo, 'test_calc.py'), 'utf8'), /subtract/, 'test added');
      const root = `aidlc-docs/features/${id}`;
      for (const f of ['spec.md', 'design.md']) assert.ok(exists(`${root}/${f}`), `${root}/${f} written`);
      log(`implement-feature done: $${totalCost(runner).toFixed(3)}`);
      await screenshot('04-feature-completed');
    },
  ],
  [
    'stop and resume mid-stage',
    async (api) => {
      const id = await api.manager.start('aidlc-full', { requirement: 'Add a CLI entry point for calc.py', projectType: 'Brownfield (existing codebase)' });
      const runner = api.manager.runner(id)!;
      const deadline = Date.now() + 60_000;
      while (!runner.events.some((e) => e.kind === 'tool_use') && Date.now() < deadline) await sleep(250);
      runner.stop();
      await drive(runner, (s) => s === 'stopped', 30_000);
      assert.equal(runner.run.stages[0].status, 'pending');
      const sessionId = runner.run.stages[0].sessionId;
      log('stopped; session', sessionId);
      void runner.resume();
      await drive(runner, (s) => s === 'awaiting_approval' || s === 'awaiting_input' || runner.run.currentStage > 0, 5 * 60_000);
      log('resumed ok; now at', runner.run.stages[runner.run.currentStage].id, runner.run.status);
      runner.stop();
      await drive(runner, (s) => s !== 'running' && s !== 'awaiting_input', 30_000);
      if (runner.run.status === 'awaiting_approval') runner.reject('integration test done');
    },
  ],
  [
    'runs are persisted and listed',
    async (api) => {
      const runs = api.manager.listRuns();
      assert.ok(runs.length >= 3, `expected ≥3 runs, got ${runs.length}`);
      assert.ok(fs.readdirSync(path.join(repo, '.aidlc', 'runs')).length >= 3);
    },
  ],
];

export async function run(): Promise<void> {
  const ext = vscode.extensions.all.find((e) => e.packageJSON.name === 'aidlc-ext');
  assert.ok(ext, 'extension found');
  const api = (await ext.activate()) as AidlcApi;
  assert.ok(api?.manager, 'extension returned its API');

  const only = process.env.AIDLC_TEST_ONLY;
  const failures: string[] = [];
  for (const [name, fn] of tests) {
    if (only && !name.includes(only)) continue;
    const started = Date.now();
    try {
      await fn(api);
      log(`✔ ${name} (${Math.round((Date.now() - started) / 1000)}s)`);
    } catch (err) {
      failures.push(name);
      log(`✘ ${name}\n`, err);
    }
  }
  if (failures.length) throw new Error(`${failures.length} integration test(s) failed: ${failures.join('; ')}`);
}
