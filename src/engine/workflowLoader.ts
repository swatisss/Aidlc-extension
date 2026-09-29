import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from 'yaml';
import type { StageDef, WorkflowDef, WorkflowInput } from '../shared/types';

export class WorkflowError extends Error {}

/**
 * Load workflows from the built-in folder, then from each override folder.
 * A workflow in a later folder with the same id replaces the earlier one,
 * so a repo can customise a built-in workflow via .aidlc/workflows/.
 */
export function loadWorkflows(dirs: string[]): WorkflowDef[] {
  const byId = new Map<string, WorkflowDef>();
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).sort()) {
      if (!/\.ya?ml$/.test(file)) continue;
      const full = path.join(dir, file);
      const wf = parseWorkflow(fs.readFileSync(full, 'utf8'), full);
      byId.set(wf.id, wf);
    }
  }
  return [...byId.values()];
}

export function parseWorkflow(text: string, source = '<inline>'): WorkflowDef {
  const raw = parse(text) as Record<string, unknown> | null;
  const fail = (msg: string): never => {
    throw new WorkflowError(`${source}: ${msg}`);
  };
  if (!raw || typeof raw !== 'object') fail('not a YAML mapping');
  const r = raw as Record<string, unknown>;

  const str = (v: unknown, field: string): string =>
    typeof v === 'string' && v.trim() ? v : fail(`"${field}" must be a non-empty string`);
  const strList = (v: unknown, field: string): string[] => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) fail(`"${field}" must be a list of strings`);
    return v as string[];
  };

  const inputs: WorkflowInput[] = ((r.inputs as unknown[]) ?? []).map((i, idx) => {
    const o = i as Record<string, unknown>;
    const type = (o.type ?? 'text') as WorkflowInput['type'];
    if (!['text', 'multiline', 'choice'].includes(type)) fail(`inputs[${idx}].type is invalid`);
    const input: WorkflowInput = {
      id: str(o.id, `inputs[${idx}].id`),
      label: str(o.label, `inputs[${idx}].label`),
      type,
      options: o.options === undefined ? undefined : strList(o.options, `inputs[${idx}].options`),
      default: typeof o.default === 'string' ? o.default : undefined,
      required: o.required !== false,
    };
    if (type === 'choice' && !input.options?.length) fail(`inputs[${idx}] is a choice with no options`);
    return input;
  });

  if (!Array.isArray(r.stages) || r.stages.length === 0) fail('"stages" must be a non-empty list');
  const seen = new Set<string>();
  const stages: StageDef[] = (r.stages as unknown[]).map((s, idx) => {
    const o = s as Record<string, unknown>;
    const id = str(o.id, `stages[${idx}].id`);
    if (seen.has(id)) fail(`duplicate stage id "${id}"`);
    seen.add(id);
    return {
      id,
      name: str(o.name, `stages[${idx}].name`),
      phase: typeof o.phase === 'string' ? o.phase : undefined,
      prompt: str(o.prompt, `stages[${idx}].prompt`),
      tools: strList(o.tools, `stages[${idx}].tools`),
      deny: strList(o.deny, `stages[${idx}].deny`),
      artifacts: strList(o.artifacts, `stages[${idx}].artifacts`),
      gate: o.gate !== false,
      repeat: o.repeat === true,
    };
  });

  return {
    id: str(r.id, 'id'),
    name: str(r.name, 'name'),
    description: str(r.description, 'description'),
    icon: typeof r.icon === 'string' ? r.icon : undefined,
    inputs,
    stages,
    trackGitSha: r.trackGitSha === true,
    artifactRoot: typeof r.artifactRoot === 'string' ? r.artifactRoot : undefined,
  };
}
