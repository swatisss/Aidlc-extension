import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { AgentEventKind } from '../shared/types';
import { CODEGRAPH_SERVER, CODEGRAPH_TOOL_NAMES, type CodeGraph } from './codegraph';
import { makeCanUseTool } from './permissions';
import type { AgentBackend, StageRequest, StageResult } from './runner';
import { AIDLC_SERVER, AIDLC_TOOL_NAMES, createAidlcServer } from './tools/aidlcTools';

type Sdk = typeof import('@anthropic-ai/claude-agent-sdk');

export type SdkBackendConfig = {
  model: string;
  maxTurns: number;
  maxBudgetUsd: number;
  /** Environment for the spawned Claude Code process (auth, provider flags, PATH). */
  env: () => Promise<Record<string, string>>;
  /** Code index exposed to every stage as an extra MCP server (tests may omit it). */
  codegraph?: () => CodeGraph | undefined;
  log?: (line: string) => void;
};

// Built-in Claude Code tools that make no sense when the human is behind the extension UI.
const ALWAYS_DENIED = ['AskUserQuestion', 'ExitPlanMode', 'EnterPlanMode'];

const MAX_TEXT = 4000;
const clip = (s: string) => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}…` : s);

/** AgentBackend backed by the Claude Agent SDK's query(). */
export class SdkBackend implements AgentBackend {
  private sdk?: Promise<Sdk>;

  constructor(private readonly cfg: SdkBackendConfig) {}

  // The SDK is ESM-only; a dynamic import keeps the CommonJS extension bundle loadable.
  private loadSdk(): Promise<Sdk> {
    this.sdk ??= import('@anthropic-ai/claude-agent-sdk');
    return this.sdk;
  }

  async runStage(req: StageRequest, onEvent: (e: AgentEventKind) => void): Promise<StageResult> {
    const sdk = await this.loadSdk();
    const abortController = new AbortController();
    req.signal.addEventListener('abort', () => abortController.abort(), { once: true });

    // Resolved once per stage rather than separately by codegraph prepare/mcpConfig and the SDK options
    // below — each call reads secret storage (an OS keychain round trip), which isn't free.
    const env = await this.cfg.env();

    // Sync the index before every stage so it reflects edits made by earlier stages.
    const mcpServers: NonNullable<Options['mcpServers']> = { [AIDLC_SERVER]: createAidlcServer(sdk, req.host) };
    const allowedTools = [...req.stage.tools, ...AIDLC_TOOL_NAMES];
    const cg = this.cfg.codegraph?.();
    if (cg && (await cg.prepare(onEvent, env))) {
      mcpServers[CODEGRAPH_SERVER] = cg.mcpConfig(env);
      allowedTools.push(...CODEGRAPH_TOOL_NAMES);
    }
    if (req.signal.aborted) return { costUsd: 0, isError: false, text: 'aborted' };

    const q = sdk.query({
      prompt: req.prompt,
      options: {
        cwd: req.cwd,
        env,
        model: req.stage.model ?? this.cfg.model,
        maxTurns: this.cfg.maxTurns,
        maxBudgetUsd: this.cfg.maxBudgetUsd,
        systemPrompt: { type: 'preset', preset: 'claude_code', append: req.systemAppend },
        settingSources: ['project'],
        allowedTools,
        disallowedTools: [...(req.stage.deny ?? []), ...ALWAYS_DENIED],
        mcpServers,
        permissionMode: 'default',
        canUseTool: makeCanUseTool(req.stage, req.host),
        resume: req.resumeSessionId,
        abortController,
        stderr: (d) => this.cfg.log?.(d),
      },
    });

    let sessionId: string | undefined;
    let last: StageResult = { costUsd: 0, isError: true, text: 'The agent ended without a result.' };
    try {
      for await (const msg of q) {
        sessionId ??= (msg as { session_id?: string }).session_id;
        switch (msg.type) {
          case 'assistant':
            for (const block of msg.message.content) {
              if (block.type === 'text' && block.text.trim()) onEvent({ kind: 'text', text: block.text });
              else if (block.type === 'tool_use')
                onEvent({ kind: 'tool_use', id: block.id, name: block.name, input: clip(JSON.stringify(block.input)) });
            }
            break;
          case 'user': {
            const content = msg.message.content;
            if (!Array.isArray(content)) break;
            for (const block of content) {
              if (block.type !== 'tool_result') continue;
              const body =
                typeof block.content === 'string'
                  ? block.content
                  : (block.content ?? []).map((c) => (c.type === 'text' ? c.text : `[${c.type}]`)).join('\n');
              onEvent({ kind: 'tool_result', id: block.tool_use_id, isError: block.is_error === true, text: clip(body) });
            }
            break;
          }
          case 'result': {
            const isError = msg.subtype !== 'success' || msg.is_error;
            const text =
              msg.subtype === 'success'
                ? msg.result
                : `${msg.subtype}${'errors' in msg && Array.isArray(msg.errors) ? `: ${msg.errors.join('; ')}` : ''}`;
            // total_cost_usd is cumulative for this query() call, so the last result wins.
            last = { sessionId, costUsd: msg.total_cost_usd, isError, text };
            onEvent({ kind: 'result', costUsd: msg.total_cost_usd, turns: msg.num_turns, isError, text: clip(text) });
            break;
          }
          default:
            break;
        }
      }
    } catch (err) {
      if (req.signal.aborted) return { sessionId, costUsd: last.costUsd, isError: false, text: 'aborted' };
      throw err;
    }
    return { ...last, sessionId };
  }
}
