// Launches a downloaded VS Code (isolated profile) with the extension under development,
// opens a throwaway fixture repo, and runs test-integration/suite.ts inside the extension host.
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aidlc-it-'));
const repo = path.join(tmp, 'calc-repo');

fs.mkdirSync(path.join(repo, '.vscode'), { recursive: true });
fs.writeFileSync(
  path.join(repo, 'calc.py'),
  `"""Tiny calculator used as an AIDLC test fixture."""


def add(a, b):
    return a + b


def multiply(a, b):
    return a * b


def average(values):
    # Legacy quirk: an empty list returns 0 instead of raising.
    if not values:
        return 0
    return sum(values) / len(values)
`,
);
fs.writeFileSync(
  path.join(repo, 'test_calc.py'),
  `import unittest

from calc import add, average, multiply


class CalcTest(unittest.TestCase):
    def test_add(self):
        self.assertEqual(add(2, 3), 5)

    def test_multiply(self):
        self.assertEqual(multiply(2, 3), 6)

    def test_average_empty(self):
        self.assertEqual(average([]), 0)


if __name__ == "__main__":
    unittest.main()
`,
);
fs.writeFileSync(path.join(repo, 'README.md'), '# calc\n\nRun tests: `python3 -m unittest`\n');

const settings = {
  'aidlc.model': process.env.AIDLC_TEST_MODEL ?? 'claude-haiku-4-5-20251001',
  'aidlc.maxBudgetUsdPerStage': 0.75,
  'aidlc.maxTurnsPerStage': 30,
};
fs.writeFileSync(path.join(repo, '.vscode', 'settings.json'), JSON.stringify(settings, null, 2));

const git = (...args) => execFileSync('git', ['-c', 'user.name=aidlc-test', '-c', 'user.email=test@example.com', ...args], { cwd: repo });
git('init', '-q');
git('add', '.');
git('commit', '-qm', 'fixture');

console.log(`Fixture repo: ${repo}`);
try {
  await runTests({
    extensionDevelopmentPath: root,
    extensionTestsPath: path.join(root, 'dist-test', 'suite.js'),
    launchArgs: [repo, '--disable-extensions', '--user-data-dir', path.join(tmp, 'user-data'), '--skip-welcome', '--skip-release-notes'],
    extensionTestsEnv: {
      AIDLC_TEST_REPO: repo,
      AIDLC_TEST_SCREENSHOTS: process.env.AIDLC_TEST_SCREENSHOTS ?? '',
      AIDLC_TEST_ONLY: process.env.AIDLC_TEST_ONLY ?? '',
    },
  });
  console.log(`\nIntegration tests passed. Fixture kept at ${repo}`);
  console.log(fs.readFileSync(path.join(tmp, 'integration.log'), 'utf8'));
} catch (err) {
  console.error(`\nIntegration tests failed (${err}). Fixture kept at ${repo}`);
  if (fs.existsSync(path.join(tmp, 'integration.log'))) console.error(fs.readFileSync(path.join(tmp, 'integration.log'), 'utf8'));
  process.exit(1);
}
