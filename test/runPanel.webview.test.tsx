// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RunView } from '../src/shared/types';
import { button, hostSends, setupWebview, text, typeInto, waitFor } from './webview-helpers';

const posted = setupWebview();

function view(over: Partial<RunView> & { status?: RunView['run']['status'] } = {}): RunView {
  const { status = 'awaiting_approval', ...rest } = over;
  return {
    workflow: {
      id: 'legacy-migration',
      name: 'Legacy code migration',
      icon: '🏗️',
      stages: [
        { id: 'discovery', name: 'Discovery', phase: 'understand', prompt: '', tools: [], gate: true },
        { id: 'migrate-slice', name: 'Migrate slice', phase: 'migrate', prompt: '', tools: [], gate: true, repeat: true },
        { id: 'verify', name: 'Verify', phase: 'verify', prompt: '', tools: [], gate: true },
      ],
    },
    run: {
      id: 'run-1',
      workflowId: 'legacy-migration',
      workflowName: 'Legacy code migration',
      inputs: { sourceStack: 'COBOL', targetStack: 'Java 21' },
      status,
      currentStage: 1,
      createdAt: '',
      updatedAt: '',
      stages: [
        { id: 'discovery', status: 'approved', iteration: 1, costUsd: 0.12, artifacts: ['aidlc-docs/migration/01-discovery.md'] },
        {
          id: 'migrate-slice',
          status: status === 'awaiting_approval' ? 'awaiting_approval' : 'running',
          iteration: 2,
          costUsd: 0.3,
          summary: 'Migrated **slice S2**',
          hasMore: true,
          artifacts: ['aidlc-docs/migration/06-migration-log.md', 'src/Payroll.java'],
        },
        { id: 'verify', status: 'pending', iteration: 1, costUsd: 0, artifacts: [] },
      ],
      inventory: [
        { id: 'PAY01', name: 'PAYROLL01', kind: 'program', path: 'cobol/PAYROLL01.cbl', loc: 1200, complexity: 'high', priority: 1, status: 'done', dependsOn: ['EMPREC'] },
        { id: 'EMPREC', name: 'EMPREC', kind: 'copybook', path: 'cobol/EMPREC.cpy', loc: 80, complexity: 'low', priority: 2, status: 'verified' },
        { id: 'TAX02', name: 'TAXCALC', kind: 'program', loc: 900, complexity: 'medium', priority: 3, status: 'pending' },
      ],
      traces: [
        { id: 'BR-1', description: 'Overtime is paid at 1.5x', source: 'cobol/PAYROLL01.cbl:120', target: 'src/Payroll.java:42', test: 'src/PayrollTest.java:10', status: 'verified' },
        { id: 'BR-2', description: 'Negative hours rejected', source: 'cobol/PAYROLL01.cbl:88', status: 'extracted' },
      ],
    },
    events: [
      { kind: 'info', text: '▶ Migrate slice (iteration 2)' },
      { kind: 'text', text: 'Looking at the **module**…' },
      { kind: 'tool_use', id: 't1', name: 'mcp__aidlc__write_artifact', input: '{"path":"migration/06-migration-log.md"}' },
      { kind: 'tool_result', id: 't1', isError: false, text: 'Wrote it' },
      { kind: 'tool_use', id: 't2', name: 'Read', input: '{"file_path":"/repo/cobol/PAYROLL01.cbl"}' },
    ],
    ...rest,
  };
}

const tab = (label: string) => [...document.querySelectorAll('.tabs button')].find((b) => b.textContent?.startsWith(label)) as HTMLButtonElement;

beforeAll(async () => {
  await import('../src/webview/runPanel');
  await waitFor(() => expect(posted).toContainEqual({ type: 'ready' }));
});

beforeEach(() => {
  posted.length = 0;
});

describe('run panel webview', () => {
  it('shows header progress, phase stepper and stage list', async () => {
    hostSends({ type: 'view', view: view() });
    await waitFor(() => expect(text()).toContain('Stage 2 of 3: Migrate slice'));
    expect(text()).toContain('$0.420');
    expect([...document.querySelectorAll('.stepper li')].map((l) => l.className)).toEqual(['done', 'current', '']);
    expect(text()).toContain('×2');
  });

  it('jumps to Review for a gate and renders the summary as markdown', async () => {
    await waitFor(() => expect(tab('Review').className).toBe('on'));
    expect(document.querySelector('.gate strong')?.textContent).toBe('slice S2');
    expect(text()).toContain('Next: Verify');

    button(/Approve & do next migrate slice/).click();
    expect(posted).toContainEqual({ type: 'approve', feedback: undefined, repeat: true });
    button(/Approve & continue/).click();
    expect(posted).toContainEqual({ type: 'approve', feedback: undefined });
  });

  it('previews an artifact inline before approving', async () => {
    const chip = [...document.querySelectorAll('.gate .chip-btn')].find((b) => b.textContent?.includes('06-migration-log.md')) as HTMLElement;
    chip.click();
    expect(posted).toContainEqual({ type: 'readArtifact', path: 'aidlc-docs/migration/06-migration-log.md' });
    hostSends({ type: 'artifact', path: 'aidlc-docs/migration/06-migration-log.md', content: '# Migration log\n\n- S1 done\n- see [plan](05-migration-plan.md)' });
    await waitFor(() => expect(document.querySelector('.preview h1')?.textContent).toBe('Migration log'));

    (document.querySelector('.preview a') as HTMLElement).click();
    expect(posted).toContainEqual({ type: 'readArtifact', path: 'aidlc-docs/migration/05-migration-plan.md' });
    await waitFor(() => expect(document.querySelector('.preview-bar')?.textContent).toContain('05-migration-plan.md'));
    button(/Open in editor/).click();
    expect(posted).toContainEqual({ type: 'openArtifact', path: 'aidlc-docs/migration/05-migration-plan.md' });
  });

  it('requires feedback for Request changes', async () => {
    hostSends({ type: 'view', view: view() });
    await waitFor(() => expect(button(/Request changes/)).toBeTruthy());
    expect(button(/Request changes/).disabled).toBe(true);
    typeInto(document.querySelector('.gate textarea')!, 'split the slice');
    await waitFor(() => expect(button(/Request changes/).disabled).toBe(false));
    button(/Request changes/).click();
    expect(posted).toContainEqual({ type: 'revise', feedback: 'split the slice' });
  });

  it('shows friendly activity and appends live events', async () => {
    tab('Activity').click();
    await waitFor(() => expect(text()).toContain('Wrote migration/06-migration-log.md'));
    expect(text()).toContain('Read cobol/PAYROLL01.cbl');
    expect(document.querySelector('.feed-text strong')?.textContent).toBe('module');
    expect(text()).toContain('The agent is waiting for you');
    hostSends({ type: 'event', event: { kind: 'text', text: 'Live update 42' } });
    await waitFor(() => expect(text()).toContain('Live update 42'));
  });

  it('shows the portfolio table with stats, sorting and filtering', async () => {
    tab('Portfolio').click();
    await waitFor(() => expect(document.querySelector('.inventory')).not.toBeNull());
    expect(text()).toContain('67% complete'); // 2 of 3 done/verified
    expect(text()).toContain('2,180');
    const names = () => [...document.querySelectorAll('.inventory tbody tr td:nth-child(2)')].map((td) => td.textContent);
    expect(names()[0]).toContain('PAYROLL01');

    typeInto(document.querySelector('.inventory .toolbar input')!, 'tax');
    await waitFor(() => expect(names()).toHaveLength(1));
    typeInto(document.querySelector('.inventory .toolbar input')!, '');
    await waitFor(() => expect(names()).toHaveLength(3));

    (document.querySelector('.inventory tbody a') as HTMLElement).click();
    expect(posted).toContainEqual({ type: 'openLocation', ref: 'cobol/PAYROLL01.cbl' });
  });

  it('shows traceability with side-by-side compare', async () => {
    tab('Traceability').click();
    await waitFor(() => expect(text()).toContain('Overtime is paid at 1.5x'));
    expect(text()).toContain('1/2 carried into the new code');
    button(/Compare/).click();
    expect(posted).toContainEqual({ type: 'sideBySide', left: 'cobol/PAYROLL01.cbl:120', right: 'src/Payroll.java:42' });
    (document.querySelector('.trace a.ref') as HTMLElement).click();
    expect(posted).toContainEqual({ type: 'openLocation', ref: 'cobol/PAYROLL01.cbl:120' });
  });

  it('lists documents grouped by stage', async () => {
    tab('Documents').click();
    await waitFor(() => expect(document.querySelector('.file-list')).not.toBeNull());
    expect([...document.querySelectorAll('.file-list .group')].map((g) => g.textContent)).toEqual(['Discovery', 'Migrate slice']);
  });

  it('answers questions with options and free text', async () => {
    hostSends({
      type: 'view',
      view: view({
        status: 'awaiting_input',
        pendingQuestion: {
          requestId: 'q1',
          questions: [
            { id: 'mode', question: 'Keep bugs?', options: ['Bug-for-bug', 'Fix them'] },
            { id: 'note', question: 'Anything else?' },
          ],
        },
      }),
    });
    await waitFor(() => expect(text()).toContain('The agent has 2 questions'));
    expect(button(/Stop/)).toBeTruthy();
    (document.querySelectorAll('input[type=radio]')[1] as HTMLInputElement).click();
    const inputs = [...document.querySelectorAll('fieldset input:not([type])')] as HTMLInputElement[];
    typeInto(inputs[1], 'no');
    await waitFor(() => expect((document.querySelectorAll('input[type=radio]')[1] as HTMLInputElement).checked).toBe(true));
    button('Send answers').click();
    expect(posted).toContainEqual({ type: 'answer', requestId: 'q1', answers: { mode: 'Fix them', note: 'no' } });
  });

  it('asks for tool permission in plain language', async () => {
    hostSends({
      type: 'view',
      view: view({ status: 'running', pendingPermission: { requestId: 'p1', toolName: 'Bash', input: '{"command":"mvn test"}' } }),
    });
    await waitFor(() => expect(text()).toContain('Allow the agent to run mvn test?'));
    button('Deny').click();
    expect(posted).toContainEqual({ type: 'permission', requestId: 'p1', allow: false });
    button(/Stop/).click();
    expect(posted).toContainEqual({ type: 'stop' });
  });

  it('offers Resume when failed', async () => {
    hostSends({ type: 'view', view: view({ status: 'failed' }) });
    await waitFor(() => expect(button(/Resume/)).toBeTruthy());
    button(/Resume/).click();
    expect(posted).toContainEqual({ type: 'resume' });
  });
});
