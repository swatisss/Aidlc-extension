import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadWorkflows, parseWorkflow, WorkflowError } from '../src/engine/workflowLoader';

const root = path.resolve(__dirname, '..');

describe('built-in workflows', () => {
  const workflows = loadWorkflows([path.join(root, 'workflows')]);

  it('loads all four MVP workflows', () => {
    expect(workflows.map((w) => w.id).sort()).toEqual(['aidlc-full', 'generate-docs', 'implement-feature', 'legacy-migration']);
  });

  it('references prompt files that exist', () => {
    for (const wf of workflows) {
      for (const s of wf.stages) {
        expect(fs.existsSync(path.join(root, 'prompts', s.prompt)), `${wf.id}/${s.id} → ${s.prompt}`).toBe(true);
      }
    }
  });

  it('keeps generate-docs read-only', () => {
    const docs = workflows.find((w) => w.id === 'generate-docs')!;
    for (const s of docs.stages) {
      expect(s.tools).not.toContain('Edit');
      expect(s.tools).not.toContain('Write');
      expect(s.deny).toEqual(expect.arrayContaining(['Edit', 'Write', 'Bash']));
    }
    expect(docs.trackGitSha).toBe(true);
  });
});

describe('parseWorkflow', () => {
  const minimal = `
id: x
name: X
description: d
stages:
  - id: a
    name: A
    prompt: a.md
`;

  it('applies defaults', () => {
    const wf = parseWorkflow(minimal);
    expect(wf.inputs).toEqual([]);
    expect(wf.stages[0]).toMatchObject({ gate: true, repeat: false, tools: [], deny: [] });
  });

  it('rejects duplicate stage ids', () => {
    expect(() => parseWorkflow(`${minimal}  - id: a\n    name: B\n    prompt: b.md\n`)).toThrow(/duplicate stage id/);
  });

  it('rejects a choice input without options', () => {
    const text = minimal.replace('stages:', 'inputs:\n  - id: c\n    label: C\n    type: choice\nstages:');
    expect(() => parseWorkflow(text)).toThrow(WorkflowError);
  });

  it('lets a repo override a built-in workflow by id', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-wf-'));
    fs.writeFileSync(path.join(dir, 'custom.yaml'), minimal.replace('id: x', 'id: generate-docs').replace('name: X', 'name: Custom docs'));
    const wfs = loadWorkflows([path.join(root, 'workflows'), dir]);
    expect(wfs.find((w) => w.id === 'generate-docs')?.name).toBe('Custom docs');
    expect(wfs).toHaveLength(4);
  });
});
