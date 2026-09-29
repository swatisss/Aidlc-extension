import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { CodeGraph, resolveBundledCodeGraph } from '../src/engine/codegraph';
import type { AgentEvent } from '../src/shared/types';

let dir: string;
let fake: string;
const env = async () => ({ PATH: process.env.PATH ?? '' });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-cg-'));
  // Fake CLI: records its args and telemetry env; `init` creates the index db; `fail` in args exits non-zero.
  fake = path.join(dir, 'fake-codegraph.sh');
  fs.writeFileSync(
    fake,
    `#!/bin/sh
echo "$@ telemetry=$CODEGRAPH_TELEMETRY" >> "${dir}/calls.log"
case "$*" in *fail*) echo boom >&2; exit 1;; esac
case "$*" in *init*) mkdir -p .codegraph && touch .codegraph/codegraph.db;; esac
exit 0
`,
  );
  fs.chmodSync(fake, 0o755);
});

const calls = () => fs.readFileSync(path.join(dir, 'calls.log'), 'utf8').trim().split('\n');

describe('CodeGraph', () => {
  it('inits on first use, then syncs, with telemetry off', async () => {
    const cg = new CodeGraph(dir, { command: fake, args: [] }, env);
    const events: AgentEvent[] = [];
    expect(await cg.prepare((e) => events.push(e))).toBe(true);
    expect(await cg.prepare((e) => events.push(e))).toBe(true);
    expect(calls()).toEqual(['--version telemetry=0', 'init -y telemetry=0', 'sync -q telemetry=0']);
    expect(events.map((e) => e.kind === 'info' && e.text)).toContain('CodeGraph: index ready.');
  });

  it("respects the user's own telemetry choice", async () => {
    const cg = new CodeGraph(dir, { command: fake, args: [] }, async () => ({ ...(await env()), CODEGRAPH_TELEMETRY: '1' }));
    await cg.prepare(() => {});
    expect(calls()[0]).toBe('--version telemetry=1');
  });

  it('passes launcher args and env through to the MCP config', async () => {
    const cg = new CodeGraph(dir, { command: fake, args: ['--extra'], env: { ELECTRON_RUN_AS_NODE: '1' } }, env);
    await cg.prepare(() => {});
    expect(calls()[1]).toBe('--extra init -y telemetry=0');
    expect(await cg.mcpConfig()).toMatchObject({
      type: 'stdio',
      command: fake,
      args: ['--extra', 'serve', '--mcp', '--path', dir],
      env: { ELECTRON_RUN_AS_NODE: '1', CODEGRAPH_TELEMETRY: '0' },
      alwaysLoad: true,
    });
  });

  it('warns once and continues when CodeGraph cannot start', async () => {
    const warnings: string[] = [];
    const cg = new CodeGraph(dir, { command: path.join(dir, 'missing'), args: [] }, env, (m) => warnings.push(m));
    const events: AgentEvent[] = [];
    expect(await cg.prepare((e) => events.push(e))).toBe(false);
    expect(await cg.prepare((e) => events.push(e))).toBe(false);
    expect(events[0]).toMatchObject({ kind: 'error', text: expect.stringContaining('could not be started') });
    expect(warnings).toHaveLength(1);
  });

  it('warns when indexing fails', async () => {
    const warnings: string[] = [];
    // First call (--version) succeeds, init fails.
    const script = path.join(dir, 'init-fails.sh');
    fs.writeFileSync(script, '#!/bin/sh\ncase "$*" in *init*) echo parse error >&2; exit 1;; esac\nexit 0\n');
    fs.chmodSync(script, 0o755);
    const cg = new CodeGraph(dir, { command: script, args: [] }, env, (m) => warnings.push(m));
    expect(await cg.prepare(() => {})).toBe(false);
    expect(warnings[0]).toContain('indexing failed');
  });
});

describe('resolveBundledCodeGraph', () => {
  it('finds the CodeGraph shipped as a dependency', () => {
    const l = resolveBundledCodeGraph()!;
    expect(l).toBeDefined();
    expect(fs.existsSync(l.command)).toBe(true);
  });

  it('falls back to the self-healing shim when the platform package is missing', () => {
    const l = resolveBundledCodeGraph((id) => {
      if (id.includes(`codegraph-${process.platform}`)) throw new Error('not installed');
      return `/ext/node_modules/${id}`;
    })!;
    expect(l).toEqual({ command: process.execPath, args: ['/ext/node_modules/@colbymchenry/codegraph/npm-shim.js'], env: { ELECTRON_RUN_AS_NODE: '1' } });
  });
});
