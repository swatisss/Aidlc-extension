import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentEvent } from '../shared/types';

export const CODEGRAPH_SERVER = 'codegraph';
/** CodeGraph's MCP surface is a single read-only tool, so it's safe to pre-approve in every stage. */
export const CODEGRAPH_TOOL_NAMES = [`mcp__${CODEGRAPH_SERVER}__codegraph_explore`];

/** How to start the CodeGraph CLI: a command, leading args, and extra env. */
export type Launcher = { command: string; args: string[]; env?: Record<string, string> };

type McpStdioConfig = { type: 'stdio'; command: string; args: string[]; env?: Record<string, string>; alwaysLoad: boolean };

/**
 * Locate the CodeGraph CLI shipped with the extension (@colbymchenry/codegraph).
 * Its per-platform package carries its own Node runtime, so the user's Node version
 * doesn't matter. If that package is missing (a .vsix built for another platform),
 * fall back to the package's shim run on VS Code's own Node, which downloads the
 * matching bundle from CodeGraph's GitHub releases on first use.
 */
export function resolveBundledCodeGraph(requireResolve: (id: string) => string = require.resolve): Launcher | undefined {
  const pkg = `@colbymchenry/codegraph-${process.platform}-${process.arch}`;
  try {
    if (process.platform === 'win32') {
      // Node refuses to spawn .cmd launchers directly, so call the bundled node.exe (same flags as the shim).
      return {
        command: requireResolve(`${pkg}/node.exe`),
        args: ['--liftoff-only', '--disable-warning=ExperimentalWarning', requireResolve(`${pkg}/lib/dist/bin/codegraph.js`)],
      };
    }
    return { command: requireResolve(`${pkg}/bin/codegraph`), args: [] };
  } catch {
    // Fall through to the self-healing shim.
  }
  try {
    return {
      command: process.execPath,
      args: [requireResolve('@colbymchenry/codegraph/npm-shim.js')],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    };
  } catch {
    return undefined;
  }
}

/**
 * Structural code index (https://github.com/colbymchenry/codegraph), always on.
 * Runs as a stdio MCP server; the index lives in <workspace>/.codegraph/ (self-gitignored).
 */
export class CodeGraph {
  private availability?: Promise<boolean>;
  private warned = false;

  constructor(
    private readonly cwd: string,
    private readonly launcher: Launcher | undefined,
    private readonly env: () => Promise<Record<string, string>>,
    /** Called once per session when CodeGraph can't be used, so the host can tell the user. */
    private readonly onUnavailable?: (message: string) => void,
  ) {}

  /** Whether the CLI can be executed. Cached for the session. */
  available(): Promise<boolean> {
    this.availability ??= this.launcher ? this.exec(['--version'], 5 * 60_000).then((r) => r.ok) : Promise.resolve(false);
    return this.availability;
  }

  /** Build the index on first use, otherwise sync it incrementally. Never throws. */
  async prepare(onEvent: (e: AgentEvent) => void): Promise<boolean> {
    if (!(await this.available())) {
      this.warn(onEvent, 'CodeGraph could not be started, so this stage runs without the code graph (slower, more tokens).');
      return false;
    }
    const fresh = !fs.existsSync(path.join(this.cwd, '.codegraph', 'codegraph.db'));
    if (fresh) onEvent({ kind: 'info', text: 'CodeGraph: building the code index (first run in this workspace)…' });
    const r = await this.exec(fresh ? ['init', '-y'] : ['sync', '-q'], 15 * 60_000);
    if (!r.ok) {
      this.warn(onEvent, `CodeGraph ${fresh ? 'indexing' : 'sync'} failed, so this stage runs without the code graph.\n${r.output.slice(-1500)}`);
      return false;
    }
    if (fresh) onEvent({ kind: 'info', text: 'CodeGraph: index ready.' });
    return true;
  }

  async mcpConfig(): Promise<McpStdioConfig> {
    const l = this.launcher!;
    return {
      type: 'stdio',
      command: l.command,
      args: [...l.args, 'serve', '--mcp', '--path', this.cwd],
      env: await this.fullEnv(),
      // Keep the tool in the prompt rather than deferred behind ToolSearch; it's the one we want used first.
      alwaysLoad: true,
    };
  }

  private warn(onEvent: (e: AgentEvent) => void, text: string): void {
    onEvent({ kind: 'error', text });
    if (!this.warned) this.onUnavailable?.(text.split('\n')[0]);
    this.warned = true;
  }

  private async fullEnv(): Promise<Record<string, string>> {
    const env = { ...(await this.env()), ...this.launcher?.env };
    // The extension runs CodeGraph on the user's behalf, so don't opt them into its
    // anonymous usage telemetry; an explicit CODEGRAPH_TELEMETRY in their env still wins.
    env.CODEGRAPH_TELEMETRY ??= '0';
    return env;
  }

  private async exec(args: string[], timeout: number): Promise<{ ok: boolean; output: string }> {
    const l = this.launcher;
    if (!l) return { ok: false, output: 'CodeGraph is not installed with the extension.' };
    const env = await this.fullEnv();
    return new Promise((resolve) => {
      execFile(l.command, [...l.args, ...args], { cwd: this.cwd, env, timeout, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) =>
        resolve({ ok: !err, output: `${stdout}${stderr}` }),
      );
    });
  }
}
