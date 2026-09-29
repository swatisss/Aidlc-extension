import { z } from 'zod';
import type { StageHost } from '../runner';

type Sdk = typeof import('@anthropic-ai/claude-agent-sdk');

export const AIDLC_SERVER = 'aidlc';
export const AIDLC_TOOL_NAMES = [
  'ask_user_question',
  'write_artifact',
  'request_approval',
  'update_plan_checklist',
  'update_inventory',
  'record_traceability',
].map(
  (t) => `mcp__${AIDLC_SERVER}__${t}`,
);

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });

/** In-process MCP server exposing the AIDLC workflow tools to the agent for one stage. */
export function createAidlcServer(sdk: Sdk, host: StageHost) {
  return sdk.createSdkMcpServer({
    name: AIDLC_SERVER,
    version: '0.1.0',
    instructions:
      'AIDLC workflow tools. Use ask_user_question instead of guessing, write_artifact for every deliverable document, and finish each stage by calling request_approval.',
    alwaysLoad: true,
    tools: [
      sdk.tool(
        'ask_user_question',
        'Ask the human one or more clarifying questions and wait for their answers. Provide options where the answer is a choice. Prefer batching related questions into one call.',
        {
          questions: z
            .array(
              z.object({
                id: z.string().describe('Short stable id, e.g. "auth_method"'),
                question: z.string(),
                options: z.array(z.string()).optional().describe('Choices; the user can still answer free-form'),
                multiSelect: z.boolean().optional(),
              }),
            )
            .min(1),
        },
        async ({ questions }) => {
          const answers = await host.askUser(questions);
          const lines = questions.map((q) => `${q.question}\n→ ${answers[q.id]?.trim() || '(no answer — use your best judgment and record the assumption)'}`);
          return text(lines.join('\n\n'));
        },
      ),
      sdk.tool(
        'write_artifact',
        `Create or overwrite a Markdown/text artifact (requirements, designs, plans, docs). Paths are relative to the artifact folder "${host.artifactRoot}/": pass "01-discovery.md", not "${host.artifactRoot}/01-discovery.md". Rewriting an existing path replaces it; never delete files with shell commands.`,
        {
          path: z.string().describe(`Path relative to "${host.artifactRoot}/", e.g. "notes/plan.md"`),
          content: z.string(),
        },
        async ({ path, content }) => {
          try {
            return text(`Wrote ${host.writeArtifact(path, content)}`);
          } catch (err) {
            return { ...text(err instanceof Error ? err.message : String(err)), isError: true };
          }
        },
      ),
      sdk.tool(
        'request_approval',
        'Finish the current stage and hand it to the human reviewer. Call exactly once, as the last action of the stage.',
        {
          summary: z.string().describe('What was done, key decisions, open risks — concise Markdown'),
          artifacts: z.array(z.string()).describe('Workspace-relative paths of files created or changed'),
          hasMore: z
            .boolean()
            .optional()
            .describe('For repeatable stages: true if further iterations (e.g. more migration slices) remain'),
        },
        async ({ summary, artifacts, hasMore }) => {
          host.requestApproval(summary, artifacts, hasMore ?? false);
          return text('Submitted for review. End your turn now without further tool calls.');
        },
      ),
      sdk.tool(
        'update_inventory',
        'Create or update the tracked inventory shown to the reviewer as a portfolio table and dependency graph: legacy programs, modules, units of work, services, docs… Items are upserted by id; omitted fields keep their previous values, so status-only updates are fine.',
        {
          items: z
            .array(
              z.object({
                id: z.string().describe('Stable id, e.g. "PAYROLL01" or "U2"'),
                name: z.string(),
                kind: z.string().describe('program | copybook | job | module | service | unit | doc | table | screen …'),
                path: z.string().optional().describe('Workspace-relative path'),
                loc: z.number().optional().describe('Lines of code'),
                complexity: z.enum(['low', 'medium', 'high']).optional(),
                priority: z.number().optional().describe('1 = do first'),
                status: z.enum(['pending', 'in_progress', 'done', 'verified', 'blocked', 'skipped']),
                dependsOn: z.array(z.string()).optional().describe('Ids of items this one depends on'),
                notes: z.string().optional(),
              }),
            )
            .min(1),
          replace: z.boolean().optional().describe('true = the list is the complete inventory; drop items not included'),
        },
        async ({ items, replace }) => text(`Inventory now has ${host.updateInventory(items, replace ?? false)} items.`),
      ),
      sdk.tool(
        'record_traceability',
        'Record traceability links from business rules / requirements to legacy source, new code and tests. Shown to the reviewer as a table with side-by-side navigation. Upserted by id.',
        {
          entries: z
            .array(
              z.object({
                id: z.string().describe('Rule/requirement id, e.g. "BR-3" or "AC-2"'),
                description: z.string(),
                source: z.string().optional().describe('Legacy location "path:line"'),
                target: z.string().optional().describe('New implementation "path:line"'),
                test: z.string().optional().describe('Test that covers it "path:line"'),
                status: z.enum(['extracted', 'implemented', 'verified', 'changed', 'unverified']),
              }),
            )
            .min(1),
        },
        async ({ entries }) => text(`Traceability now has ${host.recordTraces(entries)} entries.`),
      ),
      sdk.tool(
        'update_plan_checklist',
        'Replace the AIDLC progress checklist (aidlc-state.md) with the given Markdown checklist.',
        { markdown: z.string().describe('Markdown checklist using - [ ] / - [x]') },
        async ({ markdown }) => {
          host.updateChecklist(markdown);
          return text('Checklist updated.');
        },
      ),
    ],
  });
}
