import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RunState } from '../shared/types';

/** Persists run state as .aidlc/runs/<runId>.json so runs survive a window reload. */
export class RunStore {
  constructor(private readonly dir: string) {}

  save(run: RunState): void {
    fs.mkdirSync(this.dir, { recursive: true });
    const file = path.join(this.dir, `${run.id}.json`);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(run, null, 2));
    fs.renameSync(tmp, file);
  }

  load(id: string): RunState | undefined {
    const file = path.join(this.dir, `${id}.json`);
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as RunState;
  }

  /**
   * All runs, newest first. A run left "running" by a previous window can't
   * still be running, so it comes back as "paused" and can be resumed.
   */
  list(): RunState[] {
    if (!fs.existsSync(this.dir)) return [];
    const runs: RunState[] = [];
    for (const f of fs.readdirSync(this.dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        runs.push(normalize(JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8')) as RunState));
      } catch {
        // Ignore corrupt files rather than failing activation.
      }
    }
    return runs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}

/** A run left "running"/"awaiting_input" by a previous window can't still be that, so it comes back as "paused". */
function normalize(run: RunState): RunState {
  if (run.status === 'running' || run.status === 'awaiting_input') {
    run.status = 'paused';
    const st = run.stages[run.currentStage];
    if (st?.status === 'running') st.status = 'pending';
  }
  return run;
}
