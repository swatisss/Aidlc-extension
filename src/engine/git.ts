import { execFile } from 'node:child_process';

function git(cwd: string, args: string[]): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) =>
      resolve(err ? undefined : stdout.trim()),
    );
  });
}

export const headSha = (cwd: string) => git(cwd, ['rev-parse', 'HEAD']);

/** Files changed since `sha` (committed or not). Undefined when not a git repo or sha is unknown. */
export async function changedSince(cwd: string, sha: string): Promise<string[] | undefined> {
  const out = await git(cwd, ['diff', '--name-only', sha]);
  if (out === undefined) return undefined;
  const untracked = (await git(cwd, ['ls-files', '--others', '--exclude-standard'])) ?? '';
  return [...new Set([...out.split('\n'), ...untracked.split('\n')].filter(Boolean))];
}
