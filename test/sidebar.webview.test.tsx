// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import type { HostToSidebar, RunSummary } from '../src/shared/types';
import { button, hostSends, setupWebview, text, typeInto, waitFor } from './webview-helpers';

const posted = setupWebview();

const run = (over: Partial<RunSummary>): RunSummary => ({
  id: 'r',
  workflowId: 'generate-docs',
  workflowName: 'Generate documentation',
  icon: '📚',
  status: 'completed',
  currentStage: 0,
  stageCount: 6,
  stagesDone: 0,
  costUsd: 0.1234,
  updatedAt: new Date().toISOString(),
  label: '.',
  ...over,
});

const state: HostToSidebar = {
  type: 'state',
  hasAuth: false,
  workflows: [
    {
      id: 'implement-feature',
      name: 'Implement a feature',
      description: 'Clarify → build',
      icon: '✨',
      phases: ['Clarify', 'Design', 'Implement'],
      stageCount: 6,
      gateCount: 4,
      inputs: [
        { id: 'feature', label: 'Describe the feature', type: 'multiline', required: true },
        { id: 'constraints', label: 'Constraints', type: 'multiline', required: false },
      ],
    },
    {
      id: 'generate-docs',
      name: 'Generate documentation',
      description: 'Docs',
      phases: ['analyse', 'write'],
      stageCount: 6,
      gateCount: 2,
      inputs: [{ id: 'audience', label: 'Audience', type: 'choice', options: ['Devs', 'API'], required: true }],
    },
  ],
  runs: [
    run({ id: 'r1', status: 'awaiting_approval', stagesDone: 2, items: { total: 12, done: 3 } }),
    run({ id: 'r2', status: 'running', workflowName: 'Legacy code migration' }),
    run({ id: 'r3', status: 'completed', stagesDone: 6 }),
  ],
};

beforeAll(async () => {
  await import('../src/webview/sidebar');
  await waitFor(() => expect(posted).toContainEqual({ type: 'ready' }));
  hostSends(state);
  await waitFor(() => expect(text()).toContain('Start a workflow'));
});

describe('sidebar webview', () => {
  it('groups runs into Needs you / In progress / History with progress details', () => {
    const headings = [...document.querySelectorAll('h3')].map((h) => h.textContent);
    expect(headings).toEqual(['🔔 Needs you', 'In progress', 'Start a workflow', 'History']);
    expect(text()).toContain('Needs review');
    expect(text()).toContain('3/12 items');
    expect(text()).toContain('$0.123');
    expect(document.querySelector('.run-card.attention')).not.toBeNull();
  });

  it('shows each workflow as a phase flow', () => {
    const flow = document.querySelector('.wf-card .flow')!.textContent;
    expect(flow).toBe('Clarify→Design→Implement');
  });

  it('offers the auth callout', () => {
    button('Set API key').click();
    expect(posted).toContainEqual({ type: 'setApiKey' });
  });

  it('requires inputs, then posts start with the values', async () => {
    (document.querySelector('.wf-head') as HTMLElement).click();
    await waitFor(() => expect(document.querySelector('textarea')).not.toBeNull());
    expect(text()).toContain('you review 4 of them');
    expect(button(/Start$/).disabled).toBe(true); // required feature is empty; optional constraints is not

    typeInto(document.querySelectorAll('textarea')[0], 'Add subtract()');
    await waitFor(() => expect(button(/Start$/).disabled).toBe(false));
    button(/Start$/).click();
    expect(posted).toContainEqual({ type: 'start', workflowId: 'implement-feature', inputs: { feature: 'Add subtract()', constraints: '' } });
    await waitFor(() => expect(document.querySelector('.wf-form')).toBeNull()); // card collapses after Start
  });

  it('opens a run when clicked', () => {
    (document.querySelector('.run-card') as HTMLElement).click();
    expect(posted).toContainEqual({ type: 'openRun', runId: 'r1' });
  });
});
